// Item Groups — 3-year product group cockpit.
// Groups by the PARENT item group (itemFacts.itemGroup, e.g. "GENTS-PU-F"),
// not supplier sub-brands. Sales use LINE `amount` (per-group), pairs use `qty`.
// Input: dashData = { itemFacts, ledgerFacts }
// No HTTP, no React, no new dependencies — pure ESM.

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

const APR_TO_MAR = ["Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar"];
const H1_IDX = [0, 1, 2, 3, 4, 5];   // Apr-Sep
const H2_IDX = [6, 7, 8, 9, 10, 11]; // Oct-Mar

// ---------------------------------------------------------------------------
// Per-group per-FY aggregation.
// Sales revenue = sum of LINE `amount` (each row carries itemGroup + amount).
// Pairs = sum of `qty` where mainUnit is PAIRS. Sales Return subtracts both.
// Returns Map<group, { net, pairs, monthly[12], skus(Set), custs(Set) }>
// ---------------------------------------------------------------------------
function aggregateGroupsFy(itemFacts, fy) {
  const months = fiscalYearMonths(fy);
  const monthIndex = new Map(months.map((m, i) => [m, i]));
  const map = new Map();

  const ensure = (g) => {
    let e = map.get(g);
    if (!e) {
      e = { net: 0, pairs: 0, monthly: new Array(12).fill(0), skus: new Set(), custs: new Set() };
      map.set(g, e);
    }
    return e;
  };

  for (const r of itemFacts) {
    if (r.fy !== fy) continue;
    if (r.tx !== "Sales" && r.tx !== "Sales Return") continue;
    const party = String(r.party || "");
    if (party.toLowerCase() === "cash") continue;
    const group = r.itemGroup || "Unmapped";
    const sign = r.tx === "Sales Return" ? -1 : 1;
    const amount = num(r.amount) * sign;
    const isPairs = String(r.mainUnit || "").toUpperCase().startsWith("PAIR");
    const qty = isPairs ? num(r.qty) * sign : 0;

    const e = ensure(group);
    e.net += amount;
    e.pairs += qty;
    const mi = monthIndex.get(r.month);
    if (mi !== undefined) e.monthly[mi] += amount;
    if (r.tx === "Sales") {
      if (r.item) e.skus.add(r.item);
      if (party) e.custs.add(party);
    }
  }
  return map;
}

// ---------------------------------------------------------------------------
// buildItemGroups
// ---------------------------------------------------------------------------

/**
 * Build the 3-FY item group cockpit.
 * @param {object} dashData  - { itemFacts, ledgerFacts }
 * @param {object} [options] - { fy?: string }
 */
export function buildItemGroups(dashData, options = {}) {
  const itemFacts = Array.isArray(dashData?.itemFacts) ? dashData.itemFacts : [];
  const ledgerFacts = Array.isArray(dashData?.ledgerFacts) ? dashData.ledgerFacts : [];

  // ---- FY list ----
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

  // ---- Per-FY group data ----
  const fyGroups = new Map(); // fy -> Map<group, agg>
  for (const fy of fyList) fyGroups.set(fy, aggregateGroupsFy(itemFacts, fy));

  // ---- All groups (materialised in any FY) ----
  const allGroups = new Set();
  for (const [, gm] of fyGroups) for (const [g, e] of gm) if (e.net !== 0 || e.pairs !== 0) allGroups.add(g);

  const netIn   = (g, fy) => fyGroups.get(fy)?.get(g)?.net || 0;
  const pairsIn = (g, fy) => fyGroups.get(fy)?.get(g)?.pairs || 0;
  const monthlyIn = (g, fy) => fyGroups.get(fy)?.get(g)?.monthly || new Array(12).fill(0);
  const skusIn  = (g, fy) => fyGroups.get(fy)?.get(g)?.skus?.size || 0;
  const custsIn = (g, fy) => fyGroups.get(fy)?.get(g)?.custs?.size || 0;
  const avgPrice = (g, fy) => { const p = pairsIn(g, fy); return p > 0 ? Math.round(netIn(g, fy) / p) : 0; };
  const h1h2 = (g, fy) => {
    const m = monthlyIn(g, fy);
    const h1 = H1_IDX.reduce((s, i) => s + m[i], 0);
    const h2 = H2_IDX.reduce((s, i) => s + m[i], 0);
    return { h1, h2, total: h1 + h2 };
  };

  // ---- Active groups current FY ----
  const activeCurrent = [...allGroups].filter((g) => netIn(g, currentFy) > 0);
  const curTotalNet = activeCurrent.reduce((s, g) => s + netIn(g, currentFy), 0);

  // Groups ranked by current FY net
  const rankedCurrent = [...allGroups].sort((a, b) => netIn(b, currentFy) - netIn(a, currentFy));

  // ---- Overall avg price current FY ----
  const curTotalPairs = activeCurrent.reduce((s, g) => s + pairsIn(g, currentFy), 0);
  const overallAvgPrice = curTotalPairs > 0 ? Math.round(curTotalNet / curTotalPairs) : 0;

  // ---- KPI: top group ----
  const topName = rankedCurrent[0] || null;
  const topGroup = topName ? {
    name: topName,
    revenue: netIn(topName, currentFy),
    sharePct: curTotalNet > 0 ? round1((netIn(topName, currentFy) / curTotalNet) * 100) : 0,
    pairs: pairsIn(topName, currentFy),
  } : { name: null, revenue: 0, sharePct: 0, pairs: 0 };

  // ---- KPI: most H2-skewed (material groups only) ----
  const materialThreshold = curTotalNet * 0.02; // ignore tiny groups
  let mostH2Skewed = { name: null, h2Pct: 0 };
  for (const g of activeCurrent) {
    if (netIn(g, currentFy) < materialThreshold) continue;
    const { h2, total } = h1h2(g, currentFy);
    if (total <= 0) continue;
    const pct = round1((h2 / total) * 100);
    if (pct > mostH2Skewed.h2Pct) mostH2Skewed = { name: g, h2Pct: pct };
  }

  // ---- KPI: highest avg price (material groups) ----
  let highestAvgPrice = { name: null, avgPrice: 0, overallAvg: overallAvgPrice };
  for (const g of activeCurrent) {
    if (netIn(g, currentFy) < materialThreshold) continue;
    const ap = avgPrice(g, currentFy);
    if (ap > highestAvgPrice.avgPrice) highestAvgPrice = { name: g, avgPrice: ap, overallAvg: overallAvgPrice };
  }

  // ---- KPI: declining (current < prev) ----
  const decliningList = prevFy
    ? [...allGroups]
        .filter((g) => netIn(g, currentFy) > 0 && netIn(g, prevFy) > 0 && netIn(g, currentFy) < netIn(g, prevFy))
        .sort((a, b) => deltaPct(netIn(a, currentFy), netIn(a, prevFy)) - deltaPct(netIn(b, currentFy), netIn(b, prevFy)))
    : [];

  const kpis = {
    activeGroups: { countCurrentFy: activeCurrent.length, totalGroups: allGroups.size },
    topGroup,
    totalPairs: { cur: curTotalPairs },
    mostH2Skewed,
    highestAvgPrice,
    declining: { count: decliningList.length, names: decliningList.slice(0, 3) },
  };

  // ---- Alerts ----
  const alerts = [];
  if (mostH2Skewed.name && mostH2Skewed.h2Pct >= 65) {
    alerts.push({
      tone: "red",
      title: `${mostH2Skewed.name}: ${mostH2Skewed.h2Pct}% of revenue falls in H2`,
      body: `Season is Oct-Mar. If stock runs short in October, most of this group's year is lost. Stock early.`,
    });
  }
  const cheapest = activeCurrent
    .filter((g) => netIn(g, currentFy) >= materialThreshold && pairsIn(g, currentFy) > 0)
    .sort((a, b) => avgPrice(a, currentFy) - avgPrice(b, currentFy))[0];
  if (cheapest) {
    alerts.push({
      tone: "amber",
      title: `${cheapest} lowest avg price at ${money(avgPrice(cheapest, currentFy))}/pair`,
      body: `${roundInt(pairsIn(cheapest, currentFy)).toLocaleString("en-IN")} pairs but low value. Watch for customers upgrading to a higher grade.`,
    });
  }
  if (highestAvgPrice.name) {
    const mult = overallAvgPrice > 0 ? round1(highestAvgPrice.avgPrice / overallAvgPrice) : 0;
    alerts.push({
      tone: "green",
      title: `${highestAvgPrice.name} premium at ${money(highestAvgPrice.avgPrice)}/pair (${mult}x overall)`,
      body: `Highest price per pair in the portfolio. Each extra pair lifts the blended average.`,
    });
  }
  const broadest = [...activeCurrent].sort((a, b) => custsIn(b, currentFy) - custsIn(a, currentFy))[0];
  if (broadest) {
    alerts.push({
      tone: "blue",
      title: `${broadest} sold to ${custsIn(broadest, currentFy)} customers, broadest reach`,
      body: `Most widely distributed group. Loss of any one customer has limited impact here.`,
    });
  }
  if (alerts.length === 0) alerts.push({ tone: "blue", title: "Product mix stable", body: "No strong seasonality or price signals detected." });

  // ---- Group trend (top 8, grouped bars) ----
  const top8 = rankedCurrent.slice(0, 8);
  const groupTrend = {
    groups: top8,
    series: fyList.map((fy) => ({ name: fy, values: top8.map((g) => Math.round(netIn(g, fy))) })),
  };

  // ---- Bubble: vol% vs rev% + avgPrice (current FY) ----
  const bubble = [...allGroups]
    .filter((g) => netIn(g, currentFy) > 0)
    .map((g) => ({
      group: g,
      volPct: curTotalPairs > 0 ? round1((pairsIn(g, currentFy) / curTotalPairs) * 100) : 0,
      revPct: curTotalNet > 0 ? round1((netIn(g, currentFy) / curTotalNet) * 100) : 0,
      avgPrice: avgPrice(g, currentFy),
    }))
    .sort((a, b) => b.revPct - a.revPct)
    .slice(0, 12);

  // ---- MoM top 6 (current FY) ----
  const top6 = rankedCurrent.slice(0, 6);
  const momTop6 = {
    months: APR_TO_MAR,
    series: top6.map((g) => ({ name: g, values: monthlyIn(g, currentFy).map((v) => round1(v)) })),
  };

  // ---- H1/H2 split (material groups, sorted by h2Pct desc) ----
  const h1h2Rows = activeCurrent
    .filter((g) => netIn(g, currentFy) >= materialThreshold)
    .map((g) => {
      const { h1, h2, total } = h1h2(g, currentFy);
      return {
        group: g,
        h1Pct: total > 0 ? round1((h1 / total) * 100) : 0,
        h2Pct: total > 0 ? round1((h2 / total) * 100) : 0,
      };
    })
    .sort((a, b) => b.h2Pct - a.h2Pct);

  // ---- YoY (current vs prev) ----
  // Sorted by MAGNITUDE (the larger of the two years' revenue), not by pct — a tiny
  // group swinging +500% shouldn't outrank the business's actual biggest movers.
  // Groups with no prior-year revenue have no defined "% change" (they're new, not a
  // literal 0%) and are excluded from this chart rather than shown as a fake 0% bar.
  // The long tail beyond MAX_YOY_GROUPS is folded into a single "Others" bar computed
  // from the pooled revenue (a real weighted % change, not an average of percentages).
  const MAX_YOY_GROUPS = 10;
  const yoyCandidates = prevFy
    ? [...allGroups]
        .map((g) => ({ group: g, cur: netIn(g, currentFy), prev: netIn(g, prevFy) }))
        .filter((r) => r.prev > 0 && (r.cur >= materialThreshold || r.prev >= materialThreshold))
        .sort((a, b) => Math.max(b.cur, b.prev) - Math.max(a.cur, a.prev))
    : [];
  const yoyHead = yoyCandidates.slice(0, MAX_YOY_GROUPS);
  const yoyTail = yoyCandidates.slice(MAX_YOY_GROUPS);
  const yoy = yoyHead.map((r) => ({ group: r.group, pct: deltaPct(r.cur, r.prev) }));
  if (yoyTail.length > 0) {
    const tailCur = yoyTail.reduce((s, r) => s + r.cur, 0);
    const tailPrev = yoyTail.reduce((s, r) => s + r.prev, 0);
    yoy.push({ group: `Others (${yoyTail.length} groups)`, pct: tailPrev > 0 ? deltaPct(tailCur, tailPrev) : 0, isOthers: true });
  }

  // ---- Price trend (top 6 by current net) 3-yr ----
  const priceTrend = {
    fys: fyList,
    series: top6.map((g) => ({ name: g, values: fyList.map((fy) => avgPrice(g, fy)) })),
  };

  // ---- SKUs vs revenue (current FY, top by revenue) ----
  const skuVsRev = rankedCurrent
    .filter((g) => netIn(g, currentFy) > 0)
    .slice(0, 8)
    .map((g) => ({ group: g, skuCount: skusIn(g, currentFy), revenue: netIn(g, currentFy) }));

  // ---- Detail table (all groups, sorted by current net) ----
  const table = rankedCurrent.map((g) => {
    const perFy = {};
    for (const fy of fyList) perFy[fy] = Math.round(netIn(g, fy));
    const cur = netIn(g, currentFy);
    const prev = prevFy ? netIn(g, prevFy) : 0;
    const yoyPct = prev > 0 ? deltaPct(cur, prev) : null;
    const { h1, total } = h1h2(g, currentFy);
    const trend = fyList.map((fy) => Math.round(netIn(g, fy)));
    let signal = "Stable";
    if (yoyPct != null) {
      if (yoyPct >= 15) signal = "Rising";
      else if (yoyPct >= 3) signal = "Growing";
      else if (yoyPct < 0) signal = "Declining";
    }
    return {
      group: g,
      perFy,
      yoyPct,
      pairsCur: Math.round(pairsIn(g, currentFy)),
      avgPrice: avgPrice(g, currentFy),
      skuCount: skusIn(g, currentFy),
      custCount: custsIn(g, currentFy),
      h1Pct: total > 0 ? round1((h1 / total) * 100) : 0,
      trend,
      signal,
    };
  });

  return {
    fy: currentFy,
    fyList,
    currentFy,
    prevFy,
    partialFys,
    kpis,
    alerts,
    groupTrend,
    bubble,
    momTop6,
    h1h2: h1h2Rows,
    yoy,
    priceTrend,
    skuVsRev,
    table,
  };
}

// ₹ helper for alert copy (net values are large; use Lakh/Cr)
function money(v) {
  const n = Math.round(num(v));
  return "₹" + n.toLocaleString("en-IN");
}

function emptyResult({ fy }) {
  return {
    fy,
    fyList: [],
    currentFy: fy,
    prevFy: null,
    partialFys: [],
    kpis: {
      activeGroups: { countCurrentFy: 0, totalGroups: 0 },
      topGroup: { name: null, revenue: 0, sharePct: 0, pairs: 0 },
      totalPairs: { cur: 0 },
      mostH2Skewed: { name: null, h2Pct: 0 },
      highestAvgPrice: { name: null, avgPrice: 0, overallAvg: 0 },
      declining: { count: 0, names: [] },
    },
    alerts: [],
    groupTrend: { groups: [], series: [] },
    bubble: [],
    momTop6: { months: APR_TO_MAR, series: [] },
    h1h2: [],
    yoy: [],
    priceTrend: { fys: [], series: [] },
    skuVsRev: [],
    table: [],
  };
}
