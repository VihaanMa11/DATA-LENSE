// Product Pareto — 3-year SKU concentration cockpit.
// SKU = itemFacts.item. Revenue = Sales line amount - Sales Return line amount.
// MRP parsed from the SKU name ("... MRP-229#"). Slow mover = no sale in last 90
// days versus the FY's last sale date. Pure ESM, no HTTP/React.

import { analyzeFys, resolveCurrentFy } from "./fyUtil.js";

const num = (v) => Number(v) || 0;
const round1 = (v) => Math.round(v * 10) / 10;
const roundInt = (v) => Math.round(v);

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
function deltaPct(cur, prev) {
  if (!prev) return 0;
  return roundInt(((cur - prev) / prev) * 100);
}

// Parse MRP from a SKU name, e.g. "KB1105 BLU/RED 11X13 MRP-229#" -> 229.
export function mrpFromName(name) {
  const m = String(name || "").match(/MRP[-\s]*(\d+)/i);
  return m ? Number(m[1]) : 0;
}

const H1_MONTHS = new Set([4, 5, 6, 7, 8, 9]);

// Per-FY per-SKU aggregation.
// Map<sku, { sales, returns, qty, group, mrp, h1, h2, lastSaleDate }>
function aggregateSkusFy(itemFacts, fy) {
  const map = new Map();
  const ensure = (sku) => {
    let e = map.get(sku);
    if (!e) { e = { sales: 0, returns: 0, qty: 0, group: "", mrp: 0, h1: 0, h2: 0, lastSaleDate: null }; map.set(sku, e); }
    return e;
  };
  for (const r of itemFacts) {
    if (r.fy !== fy) continue;
    if (r.tx !== "Sales" && r.tx !== "Sales Return") continue;
    if (String(r.party || "").toLowerCase() === "cash") continue;
    const sku = r.item || "Unmapped";
    const e = ensure(sku);
    if (!e.group && r.itemGroup) e.group = r.itemGroup;
    if (!e.mrp) e.mrp = mrpFromName(sku);
    const amount = num(r.amount);
    const monthNum = Number(String(r.month || "").split("-")[1]) || 0;
    if (r.tx === "Sales") {
      e.sales += amount;
      e.qty += num(r.qty);
      if (H1_MONTHS.has(monthNum)) e.h1 += amount; else e.h2 += amount;
      if (r.date && (!e.lastSaleDate || r.date > e.lastSaleDate)) e.lastSaleDate = r.date;
    } else {
      e.returns += amount;
      e.qty -= num(r.qty);
    }
  }
  return map;
}

/**
 * @param {object} dashData - { itemFacts, ledgerFacts }
 * @param {object} [options] - { fy?: string }
 */
export function buildProductPareto(dashData, options = {}) {
  const itemFacts = Array.isArray(dashData?.itemFacts) ? dashData.itemFacts : [];
  const ledgerFacts = Array.isArray(dashData?.ledgerFacts) ? dashData.ledgerFacts : [];

  const fySet = new Set();
  for (const r of itemFacts) {
    if (String(r.party || "").toLowerCase() === "cash") continue;
    if (r.fy && (r.tx === "Sales" || r.tx === "Sales Return")) fySet.add(r.fy);
  }
  const fyList = sortFys([...fySet]);
  if (fyList.length === 0) return emptyResult({ fy: options.fy || null });

  const { partialFys, latestCompleteFy } = analyzeFys(itemFacts, ledgerFacts);
  const currentFy = resolveCurrentFy(options.fy, fyList, latestCompleteFy);
  const curIdx = fyList.indexOf(currentFy);
  const prevFy = curIdx >= 1 ? fyList[curIdx - 1] : null;

  const fySkus = new Map(); // fy -> Map<sku, agg>
  for (const fy of fyList) fySkus.set(fy, aggregateSkusFy(itemFacts, fy));

  const netIn = (sku, fy) => {
    const e = fySkus.get(fy)?.get(sku);
    return e ? e.sales - e.returns : 0;
  };
  const allSkus = new Set();
  for (const [, sm] of fySkus) for (const [sku, e] of sm) if (e.sales - e.returns !== 0 || e.qty !== 0) allSkus.add(sku);

  // ---- Ranked SKUs current FY ----
  const curMap = fySkus.get(currentFy) || new Map();
  const rankedCur = [...allSkus].sort((a, b) => netIn(b, currentFy) - netIn(a, currentFy));
  const curTotal = rankedCur.reduce((s, sku) => s + Math.max(0, netIn(sku, currentFy)), 0);
  const totalSkusCur = rankedCur.filter((sku) => netIn(sku, currentFy) > 0).length;

  // rank map per FY (1-based, only positive)
  const rankMapFor = (fy) => {
    const ranked = [...allSkus].filter((s) => netIn(s, fy) > 0).sort((a, b) => netIn(b, fy) - netIn(a, fy));
    const m = new Map();
    ranked.forEach((s, i) => m.set(s, i + 1));
    return m;
  };
  const curRankMap = rankMapFor(currentFy);
  const firstRankMap = rankMapFor(fyList[0]);

  // ---- SKUs to reach 80% / 50% (current FY) ----
  let cum = 0, to80 = 0, to50 = 0;
  for (const sku of rankedCur) {
    const v = Math.max(0, netIn(sku, currentFy));
    if (v <= 0) continue;
    cum += v;
    const pct = curTotal > 0 ? (cum / curTotal) * 100 : 0;
    if (to50 === 0 && pct >= 50) to50 = curRankMap.get(sku) || 0;
    if (to80 === 0 && pct >= 80) { to80 = curRankMap.get(sku) || 0; break; }
  }

  // ---- Slow movers: no sale in last 90 days vs FY's last sale date ----
  let asOf = null;
  for (const [, e] of curMap) if (e.lastSaleDate && (!asOf || e.lastSaleDate > asOf)) asOf = e.lastSaleDate;
  const daysSince = (d) => {
    if (!d || !asOf) return Infinity;
    return Math.round((new Date(asOf) - new Date(d)) / 86400000);
  };
  const slowMovers = rankedCur.filter((sku) => {
    const e = curMap.get(sku);
    return e && e.sales > 0 && daysSince(e.lastSaleDate) > 90;
  });
  // slow movers grouped by item group
  const slowByGroup = new Map();
  for (const sku of slowMovers) {
    const g = curMap.get(sku)?.group || "Other";
    slowByGroup.set(g, (slowByGroup.get(g) || 0) + 1);
  }
  const slowMoversByGroup = [...slowByGroup.entries()].sort((a, b) => b[1] - a[1]).map(([group, count]) => ({ group, count }));

  // ---- Return rate per SKU (current FY) ----
  const returnRate = (sku, fy) => {
    const e = fySkus.get(fy)?.get(sku);
    return e && e.sales > 0 ? round1((e.returns / e.sales) * 100) : 0;
  };
  const qualityIssues = rankedCur
    .filter((sku) => { const e = curMap.get(sku); return e && e.sales > 0 && returnRate(sku, currentFy) >= 10; })
    .sort((a, b) => returnRate(b, currentFy) - returnRate(a, currentFy))
    .slice(0, 8)
    .map((sku) => ({ sku, sales: Math.round(curMap.get(sku).sales), returnPct: returnRate(sku, currentFy), tag: returnRate(sku, currentFy) >= 40 ? "Stop" : "Review" }));

  // worst single return SKU (for KPI)
  const worstReturn = qualityIssues[0] || null;

  // ---- Top SKU ----
  const topSku = rankedCur[0] || null;
  const topShare = topSku && curTotal > 0 ? round1((netIn(topSku, currentFy) / curTotal) * 100) : 0;

  const kpis = {
    totalSkus: { count: totalSkusCur, fy: currentFy },
    skusTo80: { count: to80, pct: totalSkusCur > 0 ? round1((to80 / totalSkusCur) * 100) : 0 },
    skusTo50: { count: to50, pct: totalSkusCur > 0 ? round1((to50 / totalSkusCur) * 100) : 0 },
    topSku: topSku ? { name: topSku, revenue: netIn(topSku, currentFy), sharePct: topShare, group: curMap.get(topSku)?.group } : null,
    slowMovers: { count: slowMovers.length, pct: totalSkusCur > 0 ? round1((slowMovers.length / totalSkusCur) * 100) : 0 },
    worstReturn: worstReturn ? { name: worstReturn.sku, pct: worstReturn.returnPct } : null,
  };

  // ---- Alerts ----
  const alerts = [];
  if (slowMovers.length > 0) alerts.push({ tone: "red", title: `${slowMovers.length} slow movers, ${kpis.slowMovers.pct}% of catalogue`, body: `No sale in the last 90 days. Working capital tied up. Clearance or discontinue decision needed.` });
  if (worstReturn) alerts.push({ tone: "red", title: `${worstReturn.sku} returned ${worstReturn.pct}% of sales`, body: `High return rate signals a quality or sizing issue. Stop reordering.` });
  const h2skew = rankedCur.find((sku) => { const e = curMap.get(sku); return e && e.sales > 0 && (e.h1 / (e.h1 + e.h2)) < 0.2; });
  if (h2skew) { const e = curMap.get(h2skew); alerts.push({ tone: "amber", title: `${h2skew}: ${round1((e.h1 / (e.h1 + e.h2)) * 100)}% H1 sales only`, body: `Almost entirely H2 (Oct-Mar). Zero stock in September means a missed season.` }); }
  if (topSku) alerts.push({ tone: "green", title: `${topSku} leads at ${topShare}% of revenue`, body: `Top SKU by ${currentFy} net sales. Reliable core range.` });
  if (alerts.length === 0) alerts.push({ tone: "blue", title: "Catalogue healthy", body: "No slow-mover or return concerns detected." });

  // ---- Pareto chart: top 20 SKUs, bars per FY + cumulative % (current FY) ----
  const top20 = rankedCur.slice(0, 20);
  const paretoBars = fyList.map((fy) => ({ name: fy, values: top20.map((sku) => Math.round(netIn(sku, fy))) }));
  let pcum = 0; const paretoCum = top20.map((sku) => { pcum += Math.max(0, netIn(sku, currentFy)); return curTotal > 0 ? round1((pcum / curTotal) * 100) : 0; });
  const pareto = { skus: top20.map((s) => shortSku(s)), bars: paretoBars, cumulative: paretoCum };

  // ---- MRP bands (current FY) ----
  const bands = [
    { label: "Below ₹150", lo: 0, hi: 150 },
    { label: "₹150-₹200", lo: 150, hi: 200 },
    { label: "₹200-₹250", lo: 200, hi: 250 },
    { label: "₹250-₹300", lo: 250, hi: 300 },
    { label: "₹300-₹500", lo: 300, hi: 500 },
    { label: "₹500+", lo: 500, hi: Infinity },
  ];
  const mrpBands = bands.map((b) => {
    let rev = 0, skuCount = 0;
    for (const sku of rankedCur) {
      const e = curMap.get(sku);
      if (!e || netIn(sku, currentFy) <= 0) continue;
      const mrp = e.mrp;
      if (mrp >= b.lo && mrp < b.hi) { rev += netIn(sku, currentFy); skuCount++; }
    }
    return { label: b.label, revenue: Math.round(rev), skuCount, pct: curTotal > 0 ? round1((rev / curTotal) * 100) : 0 };
  });

  // ---- Zone split (core top50 / support 51-236 / tail) ----
  const zoneRev = (lo, hi) => rankedCur.slice(lo, hi).reduce((s, sku) => s + Math.max(0, netIn(sku, currentFy)), 0);
  const supportEnd = Math.max(50, to80 || 236);
  const zones = [
    { zone: `Core (top 50)`, pct: curTotal > 0 ? round1((zoneRev(0, 50) / curTotal) * 100) : 0, skus: Math.min(50, totalSkusCur) },
    { zone: `Support (51-${supportEnd})`, pct: curTotal > 0 ? round1((zoneRev(50, supportEnd) / curTotal) * 100) : 0, skus: Math.max(0, supportEnd - 50) },
    { zone: `Long tail (${supportEnd + 1}+)`, pct: curTotal > 0 ? round1((zoneRev(supportEnd, rankedCur.length) / curTotal) * 100) : 0, skus: Math.max(0, totalSkusCur - supportEnd) },
  ];

  // ---- H1/H2 for top 10 SKUs (current FY) ----
  const seasonTop10 = rankedCur.slice(0, 10).map((sku) => {
    const e = curMap.get(sku); const tot = (e?.h1 || 0) + (e?.h2 || 0);
    return { sku: shortSku(sku), h1Pct: tot > 0 ? round1((e.h1 / tot) * 100) : 0, h2Pct: tot > 0 ? round1((e.h2 / tot) * 100) : 0 };
  });

  // ---- Detail table: top 15 by current net ----
  const table = rankedCur.slice(0, 15).map((sku) => {
    const perFy = {}; for (const fy of fyList) perFy[fy] = Math.round(netIn(sku, fy));
    const e = curMap.get(sku) || {};
    const cur = netIn(sku, currentFy), prev = prevFy ? netIn(sku, prevFy) : 0;
    const tot = (e.h1 || 0) + (e.h2 || 0);
    const firstRank = firstRankMap.get(sku), curRank = curRankMap.get(sku);
    const rankDelta = (firstRank && curRank) ? firstRank - curRank : null; // positive = improved
    const rr = returnRate(sku, currentFy);
    let status = "Stable";
    if (rr >= 40) status = "Stop";
    else if (slowMovers.includes(sku)) status = "Slow";
    else if (prev > 0 && deltaPct(cur, prev) >= 15) status = "Rising";
    else if (prev > 0 && cur < prev) status = "Falling";
    return {
      rank: curRank || null, sku, group: e.group || "", perFy,
      yoyPct: prev > 0 ? deltaPct(cur, prev) : null,
      mrp: e.mrp || 0, qty: Math.round(e.qty || 0),
      h1Pct: tot > 0 ? round1((e.h1 / tot) * 100) : 0,
      rankDelta, returnPct: rr, status,
    };
  });

  return {
    fy: currentFy, fyList, currentFy, prevFy, partialFys,
    kpis, alerts, pareto, mrpBands, slowMoversByGroup, zones, seasonTop10, qualityIssues, table,
  };
}

function shortSku(name) {
  return String(name || "").replace(/\s*MRP[-\s]*\d+#?\s*$/i, "").trim().slice(0, 22);
}

function emptyResult({ fy }) {
  return {
    fy, fyList: [], currentFy: fy, prevFy: null, partialFys: [],
    kpis: {
      totalSkus: { count: 0, fy }, skusTo80: { count: 0, pct: 0 }, skusTo50: { count: 0, pct: 0 },
      topSku: null, slowMovers: { count: 0, pct: 0 }, worstReturn: null,
    },
    alerts: [], pareto: { skus: [], bars: [], cumulative: [] },
    mrpBands: [], slowMoversByGroup: [], zones: [], seasonTop10: [], qualityIssues: [], table: [],
  };
}
