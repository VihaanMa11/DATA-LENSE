// Product Forecast — SKU-level seasonality-aware next-month forecast + purchase planning.
// Flat forecast = YTD / 12. Seasonality-adjusted forecast = the target month's own
// share of the year (its seasonal index) applied to the flat run-rate, so an H2-heavy
// SKU is not over-forecast for an H1 month. Adds current stock, days of cover and a
// traffic-light purchase action. Parent group via gender-age rollup (stable taxonomy).
// Pure ESM, no HTTP/React.

import { analyzeFys, resolveCurrentFy } from "./fyUtil.js";
import { genderAgeOf } from "./segmentMisBuilder.js";
import { mrpFromName } from "./productParetoBuilder.js";

const num = (v) => Number(v) || 0;
const round1 = (v) => Math.round(v * 10) / 10;
const round2 = (v) => Math.round(v * 100) / 100;

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
function nextFyLabel(fy) {
  const m = String(fy || "").match(/FY\s*(\d{4})-(\d{2})/i);
  if (!m) return fy;
  return `FY ${Number(m[1]) + 1}-${String(Number(m[2]) + 1).padStart(2, "0")}`;
}
const APR_TO_MAR = ["Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar"];
const H1_IDX = [0, 1, 2, 3, 4, 5];

// Per-SKU aggregation for a FY: monthly net, in/out qty, group, last sale, months active.
function aggregateSkusFy(itemFacts, fy) {
  const months = fiscalYearMonths(fy);
  const idx = new Map(months.map((m, i) => [m, i]));
  const map = new Map();
  const ensure = (sku) => {
    let e = map.get(sku);
    if (!e) { e = { monthly: new Array(12).fill(0), inQty: 0, outQty: 0, group: "", mrp: 0, activeMonths: new Set(), lastSale: null }; map.set(sku, e); }
    return e;
  };
  for (const r of itemFacts) {
    if (r.fy !== fy) continue;
    const sku = r.item;
    if (!sku) continue;
    if (String(r.party || "").toLowerCase() === "cash") continue;
    const e = ensure(sku);
    if (!e.group && r.itemGroup) e.group = r.itemGroup;
    if (!e.mrp) e.mrp = mrpFromName(sku);
    const mi = idx.get(r.month);
    const q = num(r.qty);
    if (r.tx === "Sales") { const a = num(r.amount); if (mi !== undefined) e.monthly[mi] += a; e.outQty += q; if (a > 0 && r.month) e.activeMonths.add(r.month); if (r.date && (!e.lastSale || r.date > e.lastSale)) e.lastSale = r.date; }
    else if (r.tx === "Sales Return") { const a = num(r.amount); if (mi !== undefined) e.monthly[mi] -= a; e.inQty += q; }
    else if (r.tx === "Purchase") e.inQty += q;
    else if (r.tx === "Purchase Return") e.outQty += q;
  }
  return map;
}

/**
 * @param {object} dashData - { itemFacts, ledgerFacts }
 * @param {object} [options] - { fy?: string, targetIdx?: number } targetIdx 0=Apr (M+1)
 */
export function buildProductForecast(dashData, options = {}) {
  const itemFacts = Array.isArray(dashData?.itemFacts) ? dashData.itemFacts : [];
  const ledgerFacts = Array.isArray(dashData?.ledgerFacts) ? dashData.ledgerFacts : [];

  const fySet = new Set();
  for (const r of itemFacts) if ((r.tx === "Sales" || r.tx === "Sales Return") && r.fy) fySet.add(r.fy);
  const fyList = sortFys([...fySet]);
  if (fyList.length === 0) return emptyResult({ fy: options.fy || null });

  const { partialFys, latestCompleteFy } = analyzeFys(itemFacts, ledgerFacts);
  const currentFy = resolveCurrentFy(options.fy, fyList, latestCompleteFy);
  const curIdx = fyList.indexOf(currentFy);
  const prevFy = curIdx >= 1 ? fyList[curIdx - 1] : null;
  const forecastFy = nextFyLabel(currentFy);

  const targetIdx = Number.isInteger(options.targetIdx) ? options.targetIdx : 0; // Apr = M+1
  const targetMonth = APR_TO_MAR[targetIdx];
  const targetIsH1 = H1_IDX.includes(targetIdx);

  const cur = aggregateSkusFy(itemFacts, currentFy);
  const prev = prevFy ? aggregateSkusFy(itemFacts, prevFy) : new Map();

  // ---- Per-SKU forecast rows ----
  const rows = [];
  for (const [sku, e] of cur) {
    const ytd = e.monthly.reduce((s, v) => s + v, 0);
    if (ytd <= 0 && e.outQty <= 0) continue;
    const avg = ytd / 12;
    const seasonalIdx = avg > 0 ? e.monthly[targetIdx] / avg : 1; // 1 = average month
    const flat = Math.max(0, avg);
    const adjusted = Math.max(0, e.monthly[targetIdx]); // the month's own actual last year = seasonality truth
    const h1 = H1_IDX.reduce((s, i) => s + Math.max(0, e.monthly[i]), 0);
    const h2 = H1_IDX.length < 12 ? [6, 7, 8, 9, 10, 11].reduce((s, i) => s + Math.max(0, e.monthly[i]), 0) : 0;
    const halfTotal = h1 + h2;
    const h2Pct = halfTotal > 0 ? Math.max(0, Math.min(100, round1((h2 / halfTotal) * 100))) : 0;
    const stock = Math.round(e.inQty - e.outQty);
    const avgPrice = e.outQty > 0 ? ytd / e.outQty : (e.mrp || 0);
    const monthPairs = avgPrice > 0 ? adjusted / avgPrice : 0;
    const daysCover = monthPairs > 0 ? Math.round((stock / monthPairs) * 30) : (stock > 0 ? 999 : 0);
    const monthsActive = e.activeMonths.size;
    const isNew = prevFy ? !prev.has(sku) : false;
    // Confidence is driven by months of sales history within the year. Name churn in
    // the source (sub-group renaming) makes prior-year matching unreliable, so isNew is
    // tracked for the KPI but not used to force Low confidence.
    const confidence = monthsActive >= 8 ? "High" : monthsActive >= 4 ? "Medium" : "Low";
    const bias = h2Pct >= 80 ? "H2 heavy" : h2Pct >= 60 ? "H2 lean" : h2Pct <= 20 ? "H1 heavy" : h2Pct <= 40 ? "H1 lean" : "Balanced";
    // purchase action
    let action;
    if ((bias === "H2 heavy") && targetIsH1) action = "H2 only";
    else if (stock <= 0) action = "Urgent";
    else if (daysCover < 7) action = "Order now";
    else if (daysCover < 30) action = "Monitor";
    else action = "OK";

    rows.push({
      sku, group: e.group, parentGroup: genderAgeOf(e.group), mrp: e.mrp,
      ytd: Math.round(ytd), flat: Math.round(flat), adjusted: Math.round(adjusted),
      seasonalIdx: round2(seasonalIdx), h2Pct, bias, stock, daysCover, action, confidence, monthsActive, isNew,
    });
  }
  rows.sort((a, b) => b.adjusted - a.adjusted);

  const totalAdjusted = rows.reduce((s, r) => s + r.adjusted, 0);
  const totalFlat = rows.reduce((s, r) => s + r.flat, 0);
  const productsTracked = rows.length;
  const parentGroups = new Set(rows.map((r) => r.parentGroup));
  const subGroups = new Set(rows.map((r) => r.group));
  const top = rows[0] || null;

  // H2-heavy in top 10
  const h2HeavyTop10 = rows.slice(0, 10).filter((r) => r.bias === "H2 heavy").length;
  // implied growth vs same month prev year (business level)
  let prevTargetTotal = 0, curTargetTotal = 0;
  for (const [, e] of cur) curTargetTotal += Math.max(0, e.monthly[targetIdx]);
  for (const [, e] of prev) prevTargetTotal += Math.max(0, e.monthly[targetIdx]);
  const impliedFlatYoY = prevTargetTotal > 0 ? Math.round(((totalFlat - prevTargetTotal) / prevTargetTotal) * 100) : null;

  const kpis = {
    projectedM1: { value: totalAdjusted, month: targetMonth, forecastFy },
    productsTracked: { value: productsTracked, newCount: rows.filter((r) => r.isNew).length },
    topProduct: { name: top ? top.sku : null, value: top ? top.adjusted : 0, group: top ? top.parentGroup : null },
    parentGroups: { value: parentGroups.size, subGroups: subGroups.size },
    h2HeavyTop10: { value: h2HeavyTop10 },
    flatVsAdj: { flat: Math.round(totalFlat), adjusted: totalAdjusted, savedPct: totalFlat > 0 ? round1(((totalFlat - totalAdjusted) / totalFlat) * 100) : 0 },
  };

  // ---- Alerts ----
  const alerts = [];
  const h2risk = rows.filter((r) => r.bias === "H2 heavy" && targetIsH1).slice(0, 3);
  if (h2risk.length && targetIsH1) alerts.push({ tone: "red", title: `${h2risk.map((r) => shortSku(r.sku)).join(", ")} would be over-forecast by a flat model`, body: `These are H2-heavy SKUs. A flat YTD run-rate over-states their ${targetMonth} demand. The seasonality-adjusted forecast drops them to near their real ${targetMonth} level.` });
  if (subGroups.size > parentGroups.size) alerts.push({ tone: "amber", title: `${subGroups.size} supplier sub-groups rolled up to ${parentGroups.size} parent segments`, body: `Buyers plan by parent segment (Kids, Ladies, Gents). The forecast aggregates the sub-groups so each segment shows one total.` });
  if (top) alerts.push({ tone: "green", title: `${shortSku(top.sku)} is the reliable #1`, body: `${bigMoney(top.ytd)} YTD, ${top.bias.toLowerCase()}. ${targetMonth} forecast ${bigMoney(top.adjusted)} is ${top.confidence.toLowerCase()} confidence.` });
  const urgent = rows.filter((r) => r.action === "Urgent" || r.action === "Order now").length;
  if (urgent) alerts.push({ tone: "blue", title: `${urgent} SKUs need a purchase order`, body: `Zero or low stock against the ${targetMonth} forecast. See the purchase-planning table for suggested actions.` });
  if (alerts.length === 0) alerts.push({ tone: "blue", title: "Forecast stable", body: "No seasonality or stock risks detected." });

  // ---- Top 10 flat vs adjusted (chart) ----
  const top10 = rows.slice(0, 10);
  const flatVsAdjChart = { skus: top10.map((r) => shortSku(r.sku, 22)), flat: top10.map((r) => r.flat), adjusted: top10.map((r) => r.adjusted) };

  // ---- Forecast by parent group (chart) ----
  const grpMap = new Map();
  for (const r of rows) {
    let g = grpMap.get(r.parentGroup);
    if (!g) { g = { flat: 0, adjusted: 0 }; grpMap.set(r.parentGroup, g); }
    g.flat += r.flat; g.adjusted += r.adjusted;
  }
  const groupForecast = [...grpMap.entries()].sort((a, b) => b[1].adjusted - a[1].adjusted)
    .map(([group, v]) => ({ group, flat: Math.round(v.flat), adjusted: Math.round(v.adjusted) }));

  // ---- Season bias risk list ----
  const biasRisk = [...rows].filter((r) => r.h2Pct >= 60).sort((a, b) => b.h2Pct - a.h2Pct).slice(0, 6)
    .map((r) => ({ sku: shortSku(r.sku, 20), h2Pct: r.h2Pct }));

  // ---- Purchase planning (top 10 by adjusted) ----
  const purchase = top10.map((r) => ({ sku: shortSku(r.sku, 22), forecast: r.adjusted, stock: r.stock, daysCover: r.daysCover, action: r.action }));

  // ---- Confidence donut ----
  const confCounts = { High: 0, Medium: 0, Low: 0 };
  for (const r of rows) confCounts[r.confidence] = (confCounts[r.confidence] || 0) + 1;
  const confidence = [
    { level: "High (8+ active months)", count: confCounts.High, pct: productsTracked ? round1((confCounts.High / productsTracked) * 100) : 0 },
    { level: "Medium (4-7 months)", count: confCounts.Medium, pct: productsTracked ? round1((confCounts.Medium / productsTracked) * 100) : 0 },
    { level: "Low (<4 months)", count: confCounts.Low, pct: productsTracked ? round1((confCounts.Low / productsTracked) * 100) : 0 },
  ];

  // ---- Detail table (top 25) ----
  const table = rows.slice(0, 25).map((r) => ({
    sku: r.sku, parentGroup: r.parentGroup, subGroup: r.group, ytd: r.ytd, flat: r.flat, adjusted: r.adjusted,
    h2Pct: r.h2Pct, bias: r.bias, stock: r.stock, daysCover: r.daysCover, action: r.action, confidence: r.confidence,
  }));

  return {
    fy: currentFy, fyList, currentFy, prevFy, partialFys, forecastFy, targetMonth,
    kpis, alerts, flatVsAdjChart, groupForecast, biasRisk, purchase, confidence, table,
    dataNotes: [
      "Forecast targets the first month of the next financial year and is faithful to the ledger.",
      "Parent group is a gender-age rollup of the supplier sub-groups, so each segment shows one total.",
    ],
  };
}

function shortSku(name, n = 18) { return String(name || "").replace(/\s*MRP[-\s]*\d+#?\s*$/i, "").trim().slice(0, n); }
function bigMoney(v) { const n = Math.round(num(v)); if (Math.abs(n) >= 1e7) return `₹${(n / 1e7).toFixed(1)} Cr`; if (Math.abs(n) >= 1e5) return `₹${(n / 1e5).toFixed(1)} L`; return `₹${n.toLocaleString("en-IN")}`; }

function emptyResult({ fy }) {
  return {
    fy, fyList: [], currentFy: fy, prevFy: null, partialFys: [], forecastFy: null, targetMonth: null,
    kpis: {
      projectedM1: { value: 0, month: null, forecastFy: null }, productsTracked: { value: 0, newCount: 0 },
      topProduct: { name: null, value: 0, group: null }, parentGroups: { value: 0, subGroups: 0 },
      h2HeavyTop10: { value: 0 }, flatVsAdj: { flat: 0, adjusted: 0, savedPct: 0 },
    },
    alerts: [], flatVsAdjChart: { skus: [], flat: [], adjusted: [] }, groupForecast: [], biasRisk: [],
    purchase: [], confidence: [], table: [], dataNotes: [],
  };
}
