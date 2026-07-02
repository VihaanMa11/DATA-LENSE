// Customer Pareto — 3-year concentration analysis.
// Input: dashData = { itemFacts, ledgerFacts, itemMaster }
// Output: see buildCustomerPareto JSDoc below.
// No HTTP, no React, no new dependencies — pure ESM.

import { analyzeFys, resolveCurrentFy } from "./fyUtil.js";

const num = (v) => Number(v) || 0;
const round1 = (v) => Math.round(v * 10) / 10;
const roundInt = (v) => Math.round(v);

// ---------------------------------------------------------------------------
// FY helpers (same as ceoBuilder.js)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Per-FY customer net sales
// ---------------------------------------------------------------------------

/**
 * Returns Map<party, netSales> for a given FY, excluding "Cash" (case-insensitive).
 */
function custNetForFy(itemFacts, fy) {
  const gross = new Map();
  const returns = new Map();

  for (const r of itemFacts) {
    if (r.fy !== fy) continue;
    const party = r.party || "Unknown";
    if (party.toLowerCase() === "cash") continue;

    if (r.tx === "Sales" && r.isHeader) {
      gross.set(party, (gross.get(party) || 0) + num(r.finalAmount));
    } else if (r.tx === "Sales Return" && r.isHeader) {
      returns.set(party, (returns.get(party) || 0) + num(r.finalAmount));
    }
  }

  const net = new Map();
  for (const [party, g] of gross) {
    net.set(party, g - (returns.get(party) || 0));
  }
  // also handle parties that only appear in returns (edge case)
  for (const [party, r] of returns) {
    if (!net.has(party)) net.set(party, -(r));
  }
  return net;
}

// ---------------------------------------------------------------------------
// Concentration tiers
// ---------------------------------------------------------------------------

/**
 * For a sorted (desc) array of netSales values, return tier percentages.
 * Tiers: top1 (rank 1), t2_3 (ranks 2-3), t4_7 (ranks 4-7), t8_15 (ranks 8-15), rest.
 */
function concentrationTiers(sortedValues, total) {
  if (!total || total <= 0) return { top1: 0, t2_3: 0, t4_7: 0, t8_15: 0, rest: 0 };
  const sum = (from, to) => {
    let s = 0;
    for (let i = from; i <= to && i < sortedValues.length; i++) s += sortedValues[i];
    return s;
  };
  const pct = (v) => round1((v / total) * 100);
  return {
    top1:  pct(sum(0, 0)),
    t2_3:  pct(sum(1, 2)),
    t4_7:  pct(sum(3, 6)),
    t8_15: pct(sum(7, 14)),
    rest:  pct(sum(15, sortedValues.length - 1)),
  };
}

// ---------------------------------------------------------------------------
// buildCustomerPareto
// ---------------------------------------------------------------------------

/**
 * Build the 3-FY customer Pareto concentration analytics object.
 *
 * @param {object} dashData  - { itemFacts, ledgerFacts, itemMaster }
 * @param {object} [options] - { fy?: string }
 * @returns {object}
 */
export function buildCustomerPareto(dashData, options = {}) {
  const itemFacts = Array.isArray(dashData?.itemFacts) ? dashData.itemFacts : [];

  // ---- FY list ----
  const fySet = new Set();
  for (const r of itemFacts) if (r.fy) fySet.add(r.fy);
  const fyList = sortFys([...fySet]);

  if (fyList.length === 0) {
    return emptyResult({ fy: options.fy || null, fyList: [] });
  }

  // ---- Partial FY analysis ----
  const { partialFys, latestCompleteFy } = analyzeFys(itemFacts, []);
  const currentFy = resolveCurrentFy(options.fy, fyList, latestCompleteFy);
  const curIdx = fyList.indexOf(currentFy);
  const prevFy = curIdx >= 1 ? fyList[curIdx - 1] : null;

  // ---- Per-FY customer net sales ----
  const netByFy = {};
  for (const fy of fyList) {
    netByFy[fy] = custNetForFy(itemFacts, fy);
  }

  // ---- All unique customers (cash already excluded in custNetForFy) ----
  const allParties = new Set();
  for (const fy of fyList) {
    for (const p of netByFy[fy].keys()) allParties.add(p);
  }

  // ---- Per-customer table data (sorted by currentFy desc) ----
  const custRows = [...allParties].map((name) => {
    const perFy = {};
    for (const fy of fyList) {
      perFy[fy] = netByFy[fy].get(name) || 0;
    }
    return { name, perFy };
  });

  // Sort by currentFy desc
  custRows.sort((a, b) => (b.perFy[currentFy] || 0) - (a.perFy[currentFy] || 0));

  // ---- FY totals ----
  const fyTotals = {};
  for (const fy of fyList) {
    let t = 0;
    for (const v of netByFy[fy].values()) t += v > 0 ? v : 0;
    fyTotals[fy] = t;
  }

  const curTotal = fyTotals[currentFy] || 0;
  const prevTotal = prevFy ? (fyTotals[prevFy] || 0) : 0;

  // ---- Ranks per FY ----
  const ranksByFy = {};
  for (const fy of fyList) {
    const sorted = [...netByFy[fy].entries()]
      .filter(([, v]) => v > 0)
      .sort((a, b) => b[1] - a[1]);
    const ranks = new Map();
    sorted.forEach(([name], i) => ranks.set(name, i + 1));
    ranksByFy[fy] = ranks;
  }

  // ---- Cumulative % in currentFy ----
  const activeCur = custRows.filter((r) => (r.perFy[currentFy] || 0) > 0);
  let cum = 0;
  const cumPctByCust = new Map();
  for (const r of activeCur) {
    cum += curTotal > 0 ? (r.perFy[currentFy] / curTotal) * 100 : 0;
    cumPctByCust.set(r.name, round1(cum));
  }

  // ---- customersTo80 per FY ----
  function customersTo80ForFy(fy) {
    const total = fyTotals[fy] || 0;
    if (!total) return 0;
    const sorted = [...netByFy[fy].entries()]
      .filter(([, v]) => v > 0)
      .sort((a, b) => b[1] - a[1]);
    let running = 0;
    for (let i = 0; i < sorted.length; i++) {
      running += sorted[i][1];
      if ((running / total) * 100 >= 80) return i + 1;
    }
    return sorted.length;
  }

  const c80cur  = customersTo80ForFy(currentFy);
  const c80prev = prevFy ? customersTo80ForFy(prevFy) : null;

  // ---- top1Share, top3Share, bottom50Share ----
  function shareForTopN(fy, n) {
    const total = fyTotals[fy] || 0;
    if (!total) return 0;
    const sorted = [...netByFy[fy].entries()]
      .filter(([, v]) => v > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, n);
    const s = sorted.reduce((acc, [, v]) => acc + v, 0);
    return round1((s / total) * 100);
  }

  function bottom50Share(fy) {
    const total = fyTotals[fy] || 0;
    if (!total) return 0;
    const sorted = [...netByFy[fy].entries()]
      .filter(([, v]) => v > 0)
      .sort((a, b) => b[1] - a[1]);
    const half = Math.floor(sorted.length / 2);
    const bottomSlice = sorted.slice(sorted.length - half);
    const s = bottomSlice.reduce((acc, [, v]) => acc + v, 0);
    return round1((s / total) * 100);
  }

  const kpis = {
    customersTo80: { cur: c80cur, prev: c80prev },
    top1Share:     { cur: shareForTopN(currentFy, 1), prev: prevFy ? shareForTopN(prevFy, 1) : null },
    top3Share:     { cur: shareForTopN(currentFy, 3), prev: prevFy ? shareForTopN(prevFy, 3) : null },
    bottom50Share: { cur: bottom50Share(currentFy),   prev: prevFy ? bottom50Share(prevFy)   : null },
    totalRevenue:  {
      cur:      curTotal,
      prev:     prevTotal,
      deltaPct: deltaPct(curTotal, prevTotal),
    },
  };

  // ---- Concentration tiers per FY ----
  const concentrationByFy = {};
  for (const fy of fyList) {
    const total = fyTotals[fy] || 0;
    const sorted = [...netByFy[fy].entries()]
      .filter(([, v]) => v > 0)
      .sort((a, b) => b[1] - a[1])
      .map(([, v]) => v);
    concentrationByFy[fy] = concentrationTiers(sorted, total);
  }

  // ---- Rank changes (prevFy -> currentFy) ----
  const rankCur  = ranksByFy[currentFy]  || new Map();
  const rankPrev = prevFy ? (ranksByFy[prevFy] || new Map()) : new Map();

  // Consider top ~12 by current + any that slipped out
  const considerSet = new Set();
  [...rankCur.entries()].filter(([, r]) => r <= 12).forEach(([n]) => considerSet.add(n));
  // also include those in prevFy top 12 that are now gone
  [...rankPrev.entries()].filter(([, r]) => r <= 12).forEach(([n]) => considerSet.add(n));

  const rankChanges = [...considerSet].map((name) => {
    const rc = rankCur.get(name) || null;
    const rp = prevFy ? (rankPrev.get(name) || null) : null;
    const change = (rc != null && rp != null) ? rp - rc : 0; // positive = moved up
    let status;
    if (rc == null) status = "Churned";
    else if (rp == null) status = "New";
    else if (Math.abs(change) <= 1) status = "Held";
    else if (change >= 2 && change <= 5) status = "Rising";
    else if (change > 5) status = "Rising";
    else if (change <= -2 && change >= -5) status = "Slipping";
    else status = "Collapsing";
    return { name, rankPrev: rp, rankCur: rc, change, status };
  }).sort((a, b) => {
    // sort: active current customers first by rank, churned last
    if (a.rankCur != null && b.rankCur != null) return a.rankCur - b.rankCur;
    if (a.rankCur != null) return -1;
    if (b.rankCur != null) return 1;
    return (a.rankPrev || 99) - (b.rankPrev || 99);
  });

  // ---- Insights ----
  const insights = [];

  // 1. Concentration tightening / loosening
  if (c80prev != null) {
    if (c80cur < c80prev) {
      insights.push({
        tone: "red",
        title: "Concentration tightening",
        body: `Only ${c80cur} customer${c80cur === 1 ? "" : "s"} drive 80% of revenue (was ${c80prev} in ${prevFy}). Single-customer risk rising.`,
      });
    } else if (c80cur > c80prev) {
      insights.push({
        tone: "green",
        title: "Revenue spreading across more customers",
        body: `${c80cur} customers now drive 80% of revenue, up from ${c80prev} in ${prevFy}. Concentration is reducing.`,
      });
    }
  }

  // 2. Top-1 share growth
  const top1cur  = kpis.top1Share.cur;
  const top1prev = kpis.top1Share.prev;
  if (top1prev != null && top1cur > top1prev + 2) {
    insights.push({
      tone: "amber",
      title: "Top customer gaining outsized share",
      body: `Top customer now holds ${top1cur}% of revenue (was ${top1prev}% in ${prevFy}). Growing dependency risk.`,
    });
  } else if (top1prev != null && top1cur < top1prev - 2) {
    insights.push({
      tone: "green",
      title: "Top customer dependency reducing",
      body: `Top customer share fell from ${top1prev}% to ${top1cur}%. Revenue base is diversifying.`,
    });
  }

  // 3. Biggest rank riser (if prevFy exists)
  if (prevFy) {
    const biggestRiser = rankChanges
      .filter((r) => r.status === "Rising" && r.rankCur != null)
      .sort((a, b) => b.change - a.change)[0];
    if (biggestRiser) {
      insights.push({
        tone: "blue",
        title: `${biggestRiser.name} rising fast`,
        body: `Jumped from rank ${biggestRiser.rankPrev} to rank ${biggestRiser.rankCur} vs ${prevFy}. Growing relationship.`,
      });
    }
  }

  // 4. Long-tail note
  const bottom50cur  = kpis.bottom50Share.cur;
  const bottom50prev = kpis.bottom50Share.prev;
  if (bottom50cur != null && bottom50cur < 5) {
    insights.push({
      tone: "amber",
      title: "Long tail barely contributing",
      body: `Bottom 50% of customers account for only ${bottom50cur}% of revenue. Review whether the tail is worth serving.`,
    });
  } else if (bottom50prev != null && bottom50cur > bottom50prev + 1) {
    insights.push({
      tone: "green",
      title: "Long-tail growth",
      body: `Bottom 50% customer share grew from ${bottom50prev}% to ${bottom50cur}%. Newer / smaller customers gaining momentum.`,
    });
  }

  // Ensure at least one insight
  if (insights.length === 0) {
    insights.push({
      tone: "blue",
      title: "Concentration stable",
      body: `Customer concentration is broadly stable vs ${prevFy || "prior year"}. No material shifts detected.`,
    });
  }

  // ---- paretoByFy: top 15 per FY for chart overlays ----
  const paretoByFy = {};
  for (const fy of fyList) {
    const total = fyTotals[fy] || 0;
    const sorted = [...netByFy[fy].entries()]
      .filter(([, v]) => v > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15);
    let runCum = 0;
    const labels = [];
    const bars   = [];
    const cumArr = [];
    let crossAt80 = 0;
    for (const [name, val] of sorted) {
      runCum += total > 0 ? (val / total) * 100 : 0;
      labels.push(name);
      bars.push(val);
      cumArr.push(round1(runCum));
      if (runCum <= 80) crossAt80++;
    }
    // crossAt80 = number of customers at or before crossing 80%
    // recompute properly
    let cross = 0;
    let acc = 0;
    for (const [, val] of sorted) {
      acc += total > 0 ? (val / total) * 100 : 0;
      cross++;
      if (acc >= 80) break;
    }
    paretoByFy[fy] = { labels, bars, cum: cumArr, crossAt80: cross };
  }

  // ---- Full detail table ----
  // zone by cumPct in currentFy
  const table = custRows
    .filter((r) => fyList.some((fy) => (r.perFy[fy] || 0) > 0))
    .map((r, i) => {
      const curVal  = r.perFy[currentFy] || 0;
      const prevVal = prevFy ? (r.perFy[prevFy] || 0) : 0;
      const cumPctVal = cumPctByCust.get(r.name) || null;
      const curRank  = rankCur.get(r.name)  || null;
      const prevRank = prevFy ? (rankPrev.get(r.name) || null) : null;
      const rankDelta = (curRank != null && prevRank != null) ? prevRank - curRank : null;
      const yoyPct    = prevVal > 0 ? roundInt(((curVal - prevVal) / prevVal) * 100) : null;
      const curShare  = curTotal > 0 && curVal > 0 ? round1((curVal / curTotal) * 100) : 0;

      let zone;
      if (cumPctVal == null || curVal <= 0) zone = "Long tail";
      else if (cumPctVal <= 50) zone = "Top 50%";
      else if (cumPctVal <= 80) zone = "Core 80%";
      else if (cumPctVal <= 95) zone = "Mid tail";
      else zone = "Long tail";

      // trend: value per FY in chronological order
      const trend = fyList.map((fy) => r.perFy[fy] || 0);

      return {
        rank: curRank || (i + 1),
        name: r.name,
        perFy: r.perFy,
        yoyPct,
        curShare,
        cumPct: cumPctVal,
        rankDelta,
        zone,
        trend,
      };
    });

  return {
    fy: currentFy,
    fyList,
    currentFy,
    partialFys,
    prevFy,
    kpis,
    insights,
    concentrationByFy,
    rankChanges,
    paretoByFy,
    table,
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function emptyResult({ fy, fyList }) {
  return {
    fy,
    fyList,
    currentFy: fy,
    prevFy: null,
    kpis: {
      customersTo80: { cur: 0, prev: null },
      top1Share:     { cur: 0, prev: null },
      top3Share:     { cur: 0, prev: null },
      bottom50Share: { cur: 0, prev: null },
      totalRevenue:  { cur: 0, prev: 0, deltaPct: 0 },
    },
    insights: [],
    concentrationByFy: {},
    rankChanges: [],
    paretoByFy: {},
    table: [],
  };
}
