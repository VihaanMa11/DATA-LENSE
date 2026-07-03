// Cash & Bank — 3-year treasury cockpit.
// Receipts = Receipt-voucher DEBIT on bank/cash accounts (money in).
// Payments = Payment-voucher CREDIT on bank/cash accounts (money out).
// Collection rate = receipts / sales billed. Bank account numbers are renamed to
// readable labels. Pure ESM, no HTTP/React.

import { analyzeFys, resolveCurrentFy } from "./fyUtil.js";

const num = (v) => Number(v) || 0;
const round1 = (v) => Math.round(v * 10) / 10;

function fiscalYearMonths(fy) {
  const match = String(fy || "").match(/FY\s*(\d{4})\s*-\s*(\d{2})/i);
  if (!match) return [];
  const startYear = Number(match[1]);
  return [4, 5, 6, 7, 8, 9, 10, 11, 12, 1, 2, 3].map((month) => {
    const year = month >= 4 ? startYear : startYear + 1;
    return `${year}-${String(month).padStart(2, "0")}`;
  });
}
function sortFys(fyArray) {
  return [...fyArray].sort((a, b) => {
    const ay = Number((a.match(/FY\s*(\d{4})/) || [])[1] || 0);
    const by = Number((b.match(/FY\s*(\d{4})/) || [])[1] || 0);
    return ay - by;
  });
}
const APR_TO_MAR = ["Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar"];

// Map a raw bank/cash account string to a readable label.
export function bankLabel(account) {
  const a = String(account || "").toUpperCase();
  if (a.includes("SURI")) return "CASH-SURI";
  if (a.includes("ICICI")) return "ICICI";
  if (a.includes("SBI")) return "SBI Salar";
  if (a.includes("MDCCBL")) return "MDCCBL";
  if (a === "CASH" || a.includes("CASH-IN-HAND") || a.includes("CASH IN HAND")) return "Cash";
  // strip a leading account-number run, keep the rest
  const stripped = String(account || "").replace(/^\d[\d\s]*/, "").trim();
  return stripped || String(account || "");
}

const isBankish = (group) => /bank|cash/i.test(String(group || ""));

/**
 * @param {object} dashData - { itemFacts, ledgerFacts, accountMaster }
 * @param {object} [options] - { fy?: string }
 */
export function buildCashBank(dashData, options = {}) {
  const itemFacts = Array.isArray(dashData?.itemFacts) ? dashData.itemFacts : [];
  const ledgerFacts = Array.isArray(dashData?.ledgerFacts) ? dashData.ledgerFacts : [];
  const accountMaster = Array.isArray(dashData?.accountMaster) ? dashData.accountMaster : [];

  const fySet = new Set();
  for (const r of ledgerFacts) if ((r.tx === "Receipt" || r.tx === "Payment") && r.fy) fySet.add(r.fy);
  for (const r of itemFacts) if ((r.tx === "Sales" || r.tx === "Sales Return") && r.fy) fySet.add(r.fy);
  const fyList = sortFys([...fySet]);
  if (fyList.length === 0) return emptyResult({ fy: options.fy || null });

  const { partialFys, latestCompleteFy } = analyzeFys([...itemFacts, ...ledgerFacts], []);
  const currentFy = resolveCurrentFy(options.fy, fyList, latestCompleteFy);
  const curIdx = fyList.indexOf(currentFy);
  const prevFy = curIdx >= 1 ? fyList[curIdx - 1] : null;

  // Per FY, per bank: receipts / payments.
  const perFyBank = new Map(); // fy -> Map<label, { in, out }>
  const perFyMonth = new Map(); // fy -> { recIn[12], payOut[12] }
  for (const fy of fyList) {
    perFyBank.set(fy, new Map());
    perFyMonth.set(fy, { recIn: new Array(12).fill(0), payOut: new Array(12).fill(0) });
  }
  const months = (fy) => fiscalYearMonths(fy);

  for (const r of ledgerFacts) {
    if (r.tx !== "Receipt" && r.tx !== "Payment") continue;
    if (!isBankish(r.accountGroup)) continue;
    const fy = r.fy;
    if (!perFyBank.has(fy)) continue;
    const label = bankLabel(r.account);
    const bm = perFyBank.get(fy);
    let e = bm.get(label);
    if (!e) { e = { in: 0, out: 0 }; bm.set(label, e); }
    const mi = months(fy).indexOf(r.month);
    const pm = perFyMonth.get(fy);
    if (r.tx === "Receipt") { const v = num(r.debit); e.in += v; if (mi >= 0) pm.recIn[mi] += v; }
    else { const v = num(r.credit); e.out += v; if (mi >= 0) pm.payOut[mi] += v; }
  }

  // Sales billed per month (for collection rate) per FY.
  const salesByFyMonth = new Map();
  for (const fy of fyList) salesByFyMonth.set(fy, new Array(12).fill(0));
  for (const r of itemFacts) {
    if (!r.isHeader) continue;
    if (String(r.party || "").toLowerCase() === "cash") continue;
    if (!salesByFyMonth.has(r.fy)) continue;
    const mi = months(r.fy).indexOf(r.month);
    if (mi < 0) continue;
    if (r.tx === "Sales") salesByFyMonth.get(r.fy)[mi] += num(r.finalAmount);
    else if (r.tx === "Sales Return") salesByFyMonth.get(r.fy)[mi] -= num(r.finalAmount);
  }

  const banksCur = perFyBank.get(currentFy) || new Map();
  const totalReceipts = [...banksCur.values()].reduce((s, e) => s + e.in, 0);
  const totalPayments = [...banksCur.values()].reduce((s, e) => s + e.out, 0);
  const netSurplus = totalReceipts - totalPayments;

  // primary receipt bank
  const rankedByIn = [...banksCur.entries()].sort((a, b) => b[1].in - a[1].in);
  const primary = rankedByIn[0] || null;

  // collection rate per month (current FY)
  const curMonth = perFyMonth.get(currentFy);
  const curSales = salesByFyMonth.get(currentFy);
  const collRateMoM = curMonth.recIn.map((v, i) => (curSales[i] > 0 ? Math.round((v / curSales[i]) * 100) : 0));
  const overallCollRate = curSales.reduce((s, v) => s + v, 0) > 0
    ? round1((curMonth.recIn.reduce((s, v) => s + v, 0) / curSales.reduce((s, v) => s + v, 0)) * 100) : 0;
  // worst collection month (with sales)
  let worst = { month: null, rate: 999 };
  collRateMoM.forEach((rate, i) => { if (curSales[i] > 0 && rate < worst.rate) worst = { month: APR_TO_MAR[i], rate, recv: curMonth.recIn[i], billed: curSales[i] }; });
  if (worst.month === null) worst = { month: "-", rate: 0 };

  // ---- KPIs ----
  const kpis = {
    totalReceipts: { cur: Math.round(totalReceipts), fy: currentFy },
    totalPayments: { cur: Math.round(totalPayments) },
    netSurplus: { cur: Math.round(netSurplus) },
    primaryBank: primary ? { name: primary[0], sharePct: totalReceipts > 0 ? round1((primary[1].in / totalReceipts) * 100) : 0 } : null,
    worstCollMonth: worst,
    collectionRate: { cur: overallCollRate },
  };

  // ---- Alerts ----
  const alerts = [];
  if (worst.month !== "-" && worst.rate < 60) alerts.push({ tone: "red", title: `${worst.month} is a cash crunch month`, body: `Collection rate ${worst.rate}% in ${worst.month}, the year's lowest. ${bigMoney(worst.recv)} collected vs ${bigMoney(worst.billed)} billed. Plan for this seasonally.` });
  // same account primary for both in and out?
  const rankedByOut = [...banksCur.entries()].sort((a, b) => b[1].out - a[1].out);
  if (primary && rankedByOut[0] && rankedByOut[0][0] === primary[0]) alerts.push({ tone: "red", title: `${primary[0]} handles most receipts AND payments`, body: `The same account is primary for inflows and outflows. If it is frozen or blocked, the business stops. Consider separating receipt and payment accounts.` });
  const suri = [...banksCur.keys()].find((k) => k === "CASH-SURI");
  if (suri) alerts.push({ tone: "amber", title: `CASH-SURI account needs classification`, body: `A separate cash account appears in the ledger. If it is a proprietor personal account, business flows through it create audit risk.` });
  if (overallCollRate > 0) alerts.push({ tone: "green", title: `Overall collection rate ${overallCollRate}% in ${shortFy(currentFy)}`, body: `${bigMoney(totalReceipts)} collected. Track whether this improves toward 95%.` });
  if (alerts.length === 0) alerts.push({ tone: "blue", title: "Cash flow stable", body: "No collection or concentration concerns detected." });

  // ---- MoM receipts vs payments + running net (current FY) ----
  let run = 0;
  const running = curMonth.recIn.map((v, i) => { run += v - curMonth.payOut[i]; return Math.round(run); });
  const cashFlowMoM = { months: APR_TO_MAR, receipts: curMonth.recIn.map(Math.round), payments: curMonth.payOut.map(Math.round), running };

  // ---- 3yr net flow MoM overlay ----
  const netFlow3yr = {
    months: APR_TO_MAR,
    series: fyList.map((fy) => { const m = perFyMonth.get(fy); return { name: fy, values: m.recIn.map((v, i) => Math.round(v - m.payOut[i])) }; }),
  };

  // ---- Receipt source by bank MoM (current FY, stacked) ----
  const bankNames = rankedByIn.map((b) => b[0]);
  const receiptByBank = { months: APR_TO_MAR, series: bankNames.slice(0, 5).map((name) => {
    const vals = new Array(12).fill(0);
    for (const r of ledgerFacts) {
      if (r.tx !== "Receipt" || r.fy !== currentFy || !isBankish(r.accountGroup)) continue;
      if (bankLabel(r.account) !== name) continue;
      const mi = months(currentFy).indexOf(r.month);
      if (mi >= 0) vals[mi] += num(r.debit);
    }
    return { name, values: vals.map(Math.round) };
  }) };

  // ---- Collection rate MoM ----
  const collectionRateMoM = { months: APR_TO_MAR, values: collRateMoM };

  // ---- Bank account net (current FY) with role/status ----
  const bankNet = rankedByIn.map(([name, e]) => ({
    name, in: Math.round(e.in), out: Math.round(e.out), net: Math.round(e.in - e.out),
    status: (e.in - e.out) >= 0 ? (e.in > totalReceipts * 0.3 ? "Primary" : "Surplus") : "Deficit",
  }));

  // ---- Account balances from account master (bank/cash groups) ----
  const balances = accountMaster
    .filter((a) => isBankish(a.group))
    .map((a) => ({ name: bankLabel(a.name), openingDr: Math.round(num(a.openingDr) - num(a.openingCr)) }))
    .filter((a) => a.openingDr !== 0)
    .sort((a, b) => b.openingDr - a.openingDr)
    .slice(0, 8);

  // ---- 3yr bank-wise table ----
  const allBanks = new Set();
  for (const [, bm] of perFyBank) for (const [label, e] of bm) if (e.in !== 0 || e.out !== 0) allBanks.add(label);
  const table = [...allBanks].map((label) => {
    const perFy = {};
    for (const fy of fyList) { const e = perFyBank.get(fy)?.get(label) || { in: 0, out: 0 }; perFy[fy] = { in: Math.round(e.in), out: Math.round(e.out), net: Math.round(e.in - e.out) }; }
    return { bank: label, perFy, curNet: perFy[currentFy]?.net || 0 };
  }).sort((a, b) => (b.perFy[currentFy]?.in || 0) - (a.perFy[currentFy]?.in || 0));

  return {
    fy: currentFy, fyList, currentFy, prevFy, partialFys,
    kpis, alerts, cashFlowMoM, netFlow3yr, bankNet, receiptByBank, collectionRateMoM, balances, table,
  };
}

function shortFy(fy) {
  const m = String(fy || "").match(/FY\s*\d{4}-(\d{2})/i);
  return m ? `FY${m[1]}` : fy;
}
function bigMoney(v) {
  const n = Math.round(num(v));
  if (Math.abs(n) >= 1e7) return `₹${(n / 1e7).toFixed(1)} Cr`;
  if (Math.abs(n) >= 1e5) return `₹${(n / 1e5).toFixed(1)} L`;
  return `₹${n.toLocaleString("en-IN")}`;
}

function emptyResult({ fy }) {
  return {
    fy, fyList: [], currentFy: fy, prevFy: null, partialFys: [],
    kpis: {
      totalReceipts: { cur: 0, fy }, totalPayments: { cur: 0 }, netSurplus: { cur: 0 },
      primaryBank: null, worstCollMonth: { month: "-", rate: 0 }, collectionRate: { cur: 0 },
    },
    alerts: [], cashFlowMoM: { months: APR_TO_MAR, receipts: [], payments: [], running: [] },
    netFlow3yr: { months: APR_TO_MAR, series: [] }, bankNet: [],
    receiptByBank: { months: APR_TO_MAR, series: [] }, collectionRateMoM: { months: APR_TO_MAR, values: [] },
    balances: [], table: [],
  };
}
