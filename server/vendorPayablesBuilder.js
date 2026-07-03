// Vendor & Payables — 3-year procurement cockpit.
// Net purchase per vendor = Purchase finalAmount - Purchase Return finalAmount (header rows).
// Vendors classified by name (Footwear / Material / Capex / Services / Other).
//
// DATA HONESTY NOTE: the Payment register is bank-centric (booked against bank
// accounts, not vendor names), so per-vendor payments and payable CANNOT be derived
// from this data. Total payable is taken from the account master (Sundry Creditors).
// Per-vendor payment attribution needs the ledger-wise payment report from Busy.
// Pure ESM, no HTTP/React.

import { analyzeFys, resolveCurrentFy } from "./fyUtil.js";

const num = (v) => Number(v) || 0;
const round1 = (v) => Math.round(v * 10) / 10;
const roundInt = (v) => Math.round(v);

function sortFys(fyArray) {
  return [...fyArray].sort((a, b) => {
    const ay = Number((a.match(/FY\s*(\d{4})/) || [])[1] || 0);
    const by = Number((b.match(/FY\s*(\d{4})/) || [])[1] || 0);
    return ay - by;
  });
}
function deltaPct(cur, prev) { if (!prev) return 0; return roundInt(((cur - prev) / prev) * 100); }
function monthIdx(month) {
  const mn = Number(String(month || "").split("-")[1]) || 0;
  return [4, 5, 6, 7, 8, 9, 10, 11, 12, 1, 2, 3].indexOf(mn);
}
const APR_TO_MAR = ["Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar"];

// Classify a vendor by name.
export function vendorType(name) {
  const n = String(name || "").toUpperCase();
  if (/MOTORS|TOYOTA|MACHINE|SELAI|VEHICLE|AUTOMOB/.test(n)) return "Capex";
  if (/AIR INDIA|FLIPKART|RELIANCE|AMAZON|CARRIAGE|COURIER|TRANSPORT|LOADING/.test(n)) return "Services";
  if (/POLYMER|PLASTIC|PVC|BOX|PACKAG|SOLE|SELAI|RUBBER|FOAM/.test(n)) return "Material";
  if (/FOOTWEAR|SHOE|CHAPPAL|SANDAL|AIRHAWK|SLIPPER/.test(n)) return "Footwear";
  return "Other";
}

// Per-FY per-vendor net purchase.
function aggregateVendorsFy(itemFacts, fy) {
  const map = new Map();
  const monthly = new Map();
  for (const r of itemFacts) {
    if (r.fy !== fy || !r.isHeader) continue;
    if (r.tx !== "Purchase" && r.tx !== "Purchase Return") continue;
    const v = r.party || "Unknown";
    const fa = num(r.finalAmount);
    let e = map.get(v);
    if (!e) { e = { gross: 0, returns: 0, monthly: new Array(12).fill(0) }; map.set(v, e); }
    const mi = monthIdx(r.month);
    if (r.tx === "Purchase") { e.gross += fa; if (mi >= 0) e.monthly[mi] += fa; }
    else { e.returns += fa; if (mi >= 0) e.monthly[mi] -= fa; }
  }
  return map;
}

/**
 * @param {object} dashData - { itemFacts, ledgerFacts, accountMaster }
 * @param {object} [options] - { fy?: string }
 */
export function buildVendorPayables(dashData, options = {}) {
  const itemFacts = Array.isArray(dashData?.itemFacts) ? dashData.itemFacts : [];
  const ledgerFacts = Array.isArray(dashData?.ledgerFacts) ? dashData.ledgerFacts : [];
  const accountMaster = Array.isArray(dashData?.accountMaster) ? dashData.accountMaster : [];

  const fySet = new Set();
  for (const r of itemFacts) if ((r.tx === "Purchase" || r.tx === "Purchase Return") && r.fy) fySet.add(r.fy);
  const fyList = sortFys([...fySet]);
  if (fyList.length === 0) return emptyResult({ fy: options.fy || null });

  const { partialFys, latestCompleteFy } = analyzeFys(itemFacts, ledgerFacts);
  const currentFy = resolveCurrentFy(options.fy, fyList, latestCompleteFy);
  const curIdx = fyList.indexOf(currentFy);
  const prevFy = curIdx >= 1 ? fyList[curIdx - 1] : null;

  const fyVendors = new Map();
  for (const fy of fyList) fyVendors.set(fy, aggregateVendorsFy(itemFacts, fy));

  const netIn = (v, fy) => { const e = fyVendors.get(fy)?.get(v); return e ? e.gross - e.returns : 0; };
  const allVendors = new Set();
  for (const [, m] of fyVendors) for (const [v, e] of m) if (e.gross - e.returns !== 0) allVendors.add(v);

  // filter out zero-net "noise" vendors for the main ranking (kept out of concentration)
  const materialVendors = [...allVendors].filter((v) => netIn(v, currentFy) > 0 || (prevFy && netIn(v, prevFy) > 0));
  const ranked = materialVendors.sort((a, b) => netIn(b, currentFy) - netIn(a, currentFy));
  const curTotal = ranked.reduce((s, v) => s + Math.max(0, netIn(v, currentFy)), 0);

  // ---- Total payable from account master (Sundry Creditors) ----
  const creditors = accountMaster.filter((a) => /creditor|payable/i.test(String(a.group || "")));
  const totalPayable = creditors.reduce((s, a) => s + Math.max(0, num(a.openingCr) - num(a.openingDr)), 0);

  // ---- Concentration ----
  const top2 = ranked.slice(0, 2);
  const top2Share = curTotal > 0 ? round1((top2.reduce((s, v) => s + netIn(v, currentFy), 0) / curTotal) * 100) : 0;
  const topVendor = ranked[0] || null;
  const topShare = topVendor && curTotal > 0 ? round1((netIn(topVendor, currentFy) / curTotal) * 100) : 0;

  // ---- DPO (business-level) ----
  const dpo = curTotal > 0 ? Math.round((totalPayable / curTotal) * 365) : 0;

  const prevTotal = prevFy ? ranked.reduce((s, v) => s + Math.max(0, netIn(v, prevFy)), 0) : 0;
  const purchaseYoY = prevTotal > 0 ? deltaPct(curTotal, prevTotal) : null;

  const kpis = {
    totalPurchase: { cur: Math.round(curTotal), fy: currentFy },
    totalPayable: { cur: Math.round(totalPayable), fromMaster: true },
    vendorCount: { cur: ranked.filter((v) => netIn(v, currentFy) > 0).length, total: allVendors.size },
    top2Share: { pct: top2Share, names: top2 },
    topVendor: topVendor ? { name: topVendor, revenue: netIn(topVendor, currentFy), sharePct: topShare } : null,
    dpo: { cur: dpo },
    purchaseYoY: { cur: purchaseYoY, prevFy },
  };

  // ---- Alerts ----
  const alerts = [];
  if (top2Share >= 60 && top2.length === 2) alerts.push({ tone: "red", title: `${shortName(top2[0])} + ${shortName(top2[1])} = ${top2Share}% of purchases`, body: `Two suppliers control most inward supply. Any disruption to either hits the whole business. Diversify the supplier base.` });
  const capex = ranked.filter((v) => vendorType(v) === "Capex" && netIn(v, currentFy) > curTotal * 0.02);
  if (capex.length > 0) alerts.push({ tone: "amber", title: `${shortName(capex[0])} is a ${vendorType(capex[0])} vendor in the purchase list`, body: `${bigMoney(netIn(capex[0], currentFy))} of purchase. Likely a vehicle, machine or service. Classify as capex, not trade payable, so the payable figure is not distorted.` });
  const growingOthers = ranked.slice(2).filter((v) => prevFy && netIn(v, prevFy) > 0 && netIn(v, currentFy) > netIn(v, prevFy)).length;
  if (growingOthers >= 2) alerts.push({ tone: "green", title: `Supplier base diversifying`, body: `${growingOthers} smaller vendors grew year over year. Reduces dependence on the top two.` });
  alerts.push({ tone: "blue", title: `Per-vendor payment attribution needs the ledger export`, body: `Payments are booked against bank accounts, not vendors, so paid % and net payable per vendor cannot be derived here. Total payable shown is from the account master.` });

  // ---- Purchase MoM (current FY) ----
  const momPur = new Array(12).fill(0);
  const cur = fyVendors.get(currentFy) || new Map();
  for (const [, e] of cur) for (let i = 0; i < 12; i++) momPur[i] += e.monthly[i];
  const purchaseMoM = { months: APR_TO_MAR, values: momPur.map(Math.round) };

  // ---- Concentration 3yr shift ----
  const concentration = fyList.map((fy) => {
    const tot = ranked.reduce((s, v) => s + Math.max(0, netIn(v, fy)), 0);
    const rows = ranked.map((v) => ({ vendor: shortName(v), pct: tot > 0 ? round1((netIn(v, fy) / tot) * 100) : 0 }))
      .filter((r) => r.pct > 0).sort((a, b) => b.pct - a.pct).slice(0, 3);
    const othersPct = round1(100 - rows.reduce((s, r) => s + r.pct, 0));
    return { fy, rows, othersPct: Math.max(0, othersPct) };
  });

  // ---- Vendor type breakdown (current FY) ----
  const typeMap = new Map();
  for (const v of ranked) { const t = vendorType(v); typeMap.set(t, (typeMap.get(t) || 0) + Math.max(0, netIn(v, currentFy))); }
  const typeOrder = ["Footwear", "Material", "Services", "Capex", "Other"];
  const vendorTypes = typeOrder.filter((t) => (typeMap.get(t) || 0) > 0)
    .map((t) => ({ type: t, value: Math.round(typeMap.get(t)), pct: curTotal > 0 ? round1((typeMap.get(t) / curTotal) * 100) : 0 }));

  // ---- Purchase trend top vendors (grouped bars, 3yr) ----
  const top3 = ranked.slice(0, 3);
  const purchaseTrend = {
    vendors: [...top3.map(shortName), "Others"],
    series: fyList.map((fy) => {
      const total = ranked.reduce((s, v) => s + Math.max(0, netIn(v, fy)), 0);
      const topVals = top3.map((v) => Math.round(netIn(v, fy)));
      const others = Math.round(total - topVals.reduce((s, x) => s + x, 0));
      return { name: fy, values: [...topVals, Math.max(0, others)] };
    }),
  };

  // ---- Detail table ----
  const table = ranked.map((v) => {
    const perFy = {}; for (const fy of fyList) perFy[fy] = Math.round(netIn(v, fy));
    const c = netIn(v, currentFy), p = prevFy ? netIn(v, prevFy) : 0;
    const e = cur.get(v);
    const returnPct = e && e.gross > 0 ? round1((e.returns / e.gross) * 100) : 0;
    const type = vendorType(v);
    let trend = "Stable";
    if (p > 0) { const dp = deltaPct(c, p); if (dp >= 10) trend = "Growing"; else if (dp <= -10) trend = "Declining"; }
    return {
      vendor: v, type, perFy,
      sharePct: curTotal > 0 ? round1((c / curTotal) * 100) : 0,
      yoyPct: p > 0 ? deltaPct(c, p) : null,
      returnPct, trend,
      flag: type === "Capex" ? "Classify" : (returnPct >= 50 ? "Check returns" : "OK"),
    };
  });

  return {
    fy: currentFy, fyList, currentFy, prevFy, partialFys,
    kpis, alerts, purchaseMoM, concentration, vendorTypes, purchaseTrend, table,
    dataNotes: [
      "Purchase figures are actual, from the purchase and purchase-return registers.",
      "Per-vendor payments and net payable cannot be derived: the payment register is booked against bank accounts, not vendor names. Export the ledger-wise payment report from Busy for vendor-level settlement.",
      "Total payable is taken from the account master (Sundry Creditors opening balances).",
    ],
  };
}

function shortName(v) { return String(v || "").replace(/\s+(PVT\.?\s*LTD|LIMITED|PRIVATE|ENTERPRISE|WORKS|PLASTIC WORKS)\.?$/i, "").trim().slice(0, 22) || String(v || ""); }
function bigMoney(v) { const n = Math.round(num(v)); if (Math.abs(n) >= 1e7) return `₹${(n / 1e7).toFixed(1)} Cr`; if (Math.abs(n) >= 1e5) return `₹${(n / 1e5).toFixed(1)} L`; return `₹${n.toLocaleString("en-IN")}`; }

function emptyResult({ fy }) {
  return {
    fy, fyList: [], currentFy: fy, prevFy: null, partialFys: [],
    kpis: {
      totalPurchase: { cur: 0, fy }, totalPayable: { cur: 0, fromMaster: true },
      vendorCount: { cur: 0, total: 0 }, top2Share: { pct: 0, names: [] }, topVendor: null, dpo: { cur: 0 },
    },
    alerts: [], purchaseMoM: { months: APR_TO_MAR, values: [] }, concentration: [], vendorTypes: [],
    purchaseTrend: { vendors: [], series: [] }, table: [], dataNotes: [],
  };
}
