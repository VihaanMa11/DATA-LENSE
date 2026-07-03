// Stock Movement — 3-year inventory cockpit.
// Per SKU per FY:
//   inward  = Purchase qty + Sales Return qty
//   outward = Sales qty + Purchase Return qty
//   opening = itemMaster opening stock (matched by SKU name)
//   closing = opening + inward - outward
//   sell-through = outward / inward
// Closing value uses purchase price from item master. Negative closing = the data
// integrity gap the source has (opening balances missing). Pure ESM, no HTTP/React.

import { analyzeFys, resolveCurrentFy } from "./fyUtil.js";

const num = (v) => Number(v) || 0;
const round1 = (v) => Math.round(v * 10) / 10;

function sortFys(fyArray) {
  return [...fyArray].sort((a, b) => {
    const ay = Number((a.match(/FY\s*(\d{4})/) || [])[1] || 0);
    const by = Number((b.match(/FY\s*(\d{4})/) || [])[1] || 0);
    return ay - by;
  });
}
const APR_TO_MAR = ["Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar"];

// Build lookup maps from item master, keyed by name (and by a stripped name so
// small formatting differences still match).
function buildMasterMaps(itemMaster) {
  const cost = new Map();
  const opening = new Map();
  const strip = (n) => String(n || "").toUpperCase().replace(/\s+/g, " ").trim();
  for (const m of (itemMaster || [])) {
    const k = strip(m.name);
    if (!k) continue;
    if (!cost.has(k)) cost.set(k, num(m.purcPrice));
    if (!opening.has(k)) opening.set(k, num(m.openingStock));
  }
  return { cost, opening, strip };
}

function monthIdx(month) {
  const mn = Number(String(month || "").split("-")[1]) || 0;
  return [4, 5, 6, 7, 8, 9, 10, 11, 12, 1, 2, 3].indexOf(mn);
}

// Per-FY per-SKU aggregation of inward/outward + monthly movement.
function aggregateStockFy(itemFacts, fy) {
  const map = new Map();
  const ensure = (sku) => {
    let e = map.get(sku);
    if (!e) { e = { inward: 0, outward: 0, group: "", monthIn: new Array(12).fill(0), monthOut: new Array(12).fill(0) }; map.set(sku, e); }
    return e;
  };
  for (const r of itemFacts) {
    if (r.fy !== fy) continue;
    if (String(r.party || "").toLowerCase() === "cash") continue;
    const sku = r.item;
    if (!sku) continue;
    const q = num(r.qty);
    if (q === 0 && r.tx !== "Purchase" && r.tx !== "Sales") continue;
    const e = ensure(sku);
    if (!e.group && r.itemGroup) e.group = r.itemGroup;
    const mi = monthIdx(r.month);
    if (r.tx === "Purchase" || r.tx === "Sales Return") {
      e.inward += q;
      if (mi >= 0) e.monthIn[mi] += q;
    } else if (r.tx === "Sales" || r.tx === "Purchase Return") {
      e.outward += q;
      if (mi >= 0) e.monthOut[mi] += q;
    }
  }
  return map;
}

/**
 * @param {object} dashData - { itemFacts, ledgerFacts, itemMaster }
 * @param {object} [options] - { fy?: string }
 */
export function buildStockMovement(dashData, options = {}) {
  const itemFacts = Array.isArray(dashData?.itemFacts) ? dashData.itemFacts : [];
  const ledgerFacts = Array.isArray(dashData?.ledgerFacts) ? dashData.ledgerFacts : [];
  const itemMaster = Array.isArray(dashData?.itemMaster) ? dashData.itemMaster : [];
  const { cost, opening, strip } = buildMasterMaps(itemMaster);

  const fySet = new Set();
  for (const r of itemFacts) {
    if (["Sales", "Sales Return", "Purchase", "Purchase Return"].includes(r.tx) && r.fy) fySet.add(r.fy);
  }
  const fyList = sortFys([...fySet]);
  if (fyList.length === 0) return emptyResult({ fy: options.fy || null });

  const { partialFys, latestCompleteFy } = analyzeFys(itemFacts, ledgerFacts);
  const currentFy = resolveCurrentFy(options.fy, fyList, latestCompleteFy);
  const curIdx = fyList.indexOf(currentFy);
  const prevFy = curIdx >= 1 ? fyList[curIdx - 1] : null;

  const fyStock = new Map();
  for (const fy of fyList) fyStock.set(fy, aggregateStockFy(itemFacts, fy));

  const curMap = fyStock.get(currentFy) || new Map();
  const costOf = (sku) => cost.get(strip(sku)) || 0;
  const openOf = (sku) => opening.get(strip(sku)) || 0;
  // Closing is movement-only (inward - outward). Opening balances are largely
  // unrecorded in the source (the data-integrity gap the page flags), so folding
  // in the item-master opening would mask the negative-stock SKUs. Opening is still
  // surfaced as its own column so the gap is visible.
  const closingOf = (sku, fy) => {
    const e = fyStock.get(fy)?.get(sku);
    if (!e) return 0;
    return e.inward - e.outward;
  };
  const stOf = (inward, outward) => (inward > 0 ? round1((outward / inward) * 100) : (outward > 0 ? 100 : 0));

  const allSkus = new Set(curMap.keys());

  // ---- Totals (current FY) ----
  let totalInward = 0, totalOutward = 0, totalCloseValue = 0, negativeCount = 0;
  for (const [sku, e] of curMap) {
    totalInward += e.inward;
    totalOutward += e.outward;
    const closing = e.inward - e.outward;
    if (closing < 0) negativeCount++;
    if (closing > 0) totalCloseValue += closing * costOf(sku);
  }

  // ---- Lock-up: high value + low sell-through ----
  const skuStats = [...allSkus].map((sku) => {
    const e = curMap.get(sku);
    const closing = e.inward - e.outward;
    const st = stOf(e.inward, e.outward);
    const closeVal = closing > 0 ? closing * costOf(sku) : 0;
    return { sku, group: e.group, inward: e.inward, outward: e.outward, opening: openOf(sku), closing, st, avgCost: costOf(sku), closeVal };
  });

  const highLockup = skuStats.filter((s) => s.st < 50 && s.closeVal >= 10000).sort((a, b) => b.closeVal - a.closeVal);
  const highLockupSkus = highLockup.slice(0, 8).map((s) => ({ sku: shortSku(s.sku), closing: Math.round(s.closing), closeVal: Math.round(s.closeVal), st: s.st, tag: s.st < 35 ? "Risk" : "Watch" }));

  // ---- Lock-up value by group ----
  const groupLock = new Map();
  const groupIn = new Map(), groupOut = new Map();
  for (const s of skuStats) {
    if (s.closeVal > 0) groupLock.set(s.group, (groupLock.get(s.group) || 0) + s.closeVal);
    groupIn.set(s.group, (groupIn.get(s.group) || 0) + s.inward);
    groupOut.set(s.group, (groupOut.get(s.group) || 0) + s.outward);
  }
  const lockupByGroup = [...groupLock.entries()].sort((a, b) => b[1] - a[1]).slice(0, 11)
    .map(([group, val]) => ({ group, closeVal: Math.round(val) }));

  // ---- Group sell-through ----
  const groupSellThrough = [...new Set([...groupIn.keys(), ...groupOut.keys()])]
    .map((g) => ({ group: g, inward: groupIn.get(g) || 0, outward: groupOut.get(g) || 0, st: stOf(groupIn.get(g) || 0, groupOut.get(g) || 0) }))
    .filter((r) => r.inward >= 100)
    .sort((a, b) => b.st - a.st)
    .slice(0, 12);

  // ---- Highest single-group lock-up for KPI (e.g. a premium group) ----
  const topLock = lockupByGroup[0] || null;
  const premiumLock = lockupByGroup.find((g) => /TOPTRACK|PREMIUM|WOW/i.test(g.group)) || null;

  // ---- MoM inward vs outward (current FY) + running net ----
  const momIn = new Array(12).fill(0), momOut = new Array(12).fill(0);
  for (const [, e] of curMap) { for (let i = 0; i < 12; i++) { momIn[i] += e.monthIn[i]; momOut[i] += e.monthOut[i]; } }
  let run = 0; const running = momIn.map((v, i) => { run += v - momOut[i]; return Math.round(run); });
  const momStock = { months: APR_TO_MAR, inward: momIn.map(Math.round), outward: momOut.map(Math.round), running };

  // ---- Closing stock value 3-yr trend by group (top 6 by current lock-up) ----
  const top6Groups = lockupByGroup.slice(0, 6).map((g) => g.group);
  const closingTrend = {
    groups: top6Groups,
    series: fyList.map((fy) => ({
      name: fy,
      values: top6Groups.map((g) => {
        let v = 0;
        const m = fyStock.get(fy) || new Map();
        for (const [sku, e] of m) { if (e.group !== g) continue; const c = e.inward - e.outward; if (c > 0) v += c * costOf(sku); }
        return Math.round(v);
      }),
    })),
  };

  // ---- KPIs ----
  const kpis = {
    closingValue: { cur: Math.round(totalCloseValue), fy: currentFy },
    totalInward: { cur: Math.round(totalInward) },
    totalOutward: { cur: Math.round(totalOutward) },
    negativeStock: { count: negativeCount },
    highLockup: { count: highLockup.length },
    topGroupLock: topLock ? { group: topLock.group, val: topLock.closeVal, st: (groupSellThrough.find((x) => x.group === topLock.group)?.st) ?? null } : null,
    premiumLock: premiumLock ? { group: premiumLock.group, val: premiumLock.closeVal } : null,
  };

  // ---- Alerts ----
  const alerts = [];
  if (negativeCount > 0) alerts.push({ tone: "red", title: `${negativeCount} negative-stock SKUs, opening balance missing`, body: `These items sold from pre-year stock that was never recorded. Add opening stock per SKU to fix the movement math.` });
  if (topLock) { const st = groupSellThrough.find((x) => x.group === topLock.group)?.st; alerts.push({ tone: "red", title: `${bigMoney(topLock.closeVal)} locked in ${topLock.group}${st != null ? ` at ${st}% sell-through` : ""}`, body: `Largest closing-stock value. Review for a clearance plan if velocity is low.` }); }
  const netFlow = totalInward - totalOutward;
  if (netFlow < 0) alerts.push({ tone: "amber", title: `Outward exceeded inward in ${shortFy(currentFy)}`, body: `Sold ${Math.round(totalOutward).toLocaleString("en-IN")} vs bought ${Math.round(totalInward).toLocaleString("en-IN")} pairs. The business ran on opening stock. Increase inward to avoid stockouts.` });
  const best = groupSellThrough[0];
  if (best) alerts.push({ tone: "green", title: `${best.group} near-perfect ${best.st}% sell-through`, body: `Almost everything bought was sold. Tight demand-supply match, risk of missed sales if understocked.` });
  if (alerts.length === 0) alerts.push({ tone: "blue", title: "Inventory flow stable", body: "No negative stock or heavy lock-up detected." });

  // ---- Detail table: top 15 by outward volume ----
  const table = [...skuStats].sort((a, b) => b.outward - a.outward).slice(0, 15).map((s) => {
    const fyST = {};
    for (const fy of fyList) { const e = fyStock.get(fy)?.get(s.sku); fyST[fy] = e ? stOf(e.inward, e.outward) : null; }
    return {
      sku: s.sku, group: s.group,
      opening: Math.round(s.opening), inward: Math.round(s.inward), outward: Math.round(s.outward),
      closing: Math.round(s.closing), avgCost: Math.round(s.avgCost), closeVal: Math.round(s.closeVal),
      st: s.st, fyST,
      negative: s.closing < 0,
      status: s.closing < 0 ? "Neg. stk" : s.st >= 85 ? "Star" : s.st >= 60 ? "Watch" : "Slow",
    };
  });

  return {
    fy: currentFy, fyList, currentFy, prevFy, partialFys,
    kpis, alerts, momStock, groupSellThrough, lockupByGroup, closingTrend, highLockupSkus, table,
  };
}

function shortSku(name) {
  return String(name || "").replace(/\s*MRP[-\s]*\d+#?\s*$/i, "").trim().slice(0, 24);
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
      closingValue: { cur: 0, fy }, totalInward: { cur: 0 }, totalOutward: { cur: 0 },
      negativeStock: { count: 0 }, highLockup: { count: 0 }, topGroupLock: null, premiumLock: null,
    },
    alerts: [], momStock: { months: APR_TO_MAR, inward: [], outward: [], running: [] },
    groupSellThrough: [], lockupByGroup: [], closingTrend: { groups: [], series: [] }, highLockupSkus: [], table: [],
  };
}
