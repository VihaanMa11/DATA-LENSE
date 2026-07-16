// CEO Overview — multi-year (3 FY) analytics for the executive dashboard.
// Input: dashData = { itemFacts, ledgerFacts, itemMaster }
// Output: see buildCeoOverview JSDoc below.
// No HTTP, no React, no new dependencies — pure ESM.

import { analyzeFys, resolveCurrentFy } from "./fyUtil.js";

const num = (v) => Number(v) || 0;
const round1 = (v) => Math.round(v * 10) / 10;
const roundInt = (v) => Math.round(v);

// ---------------------------------------------------------------------------
// FY helpers
// ---------------------------------------------------------------------------

/** Returns the 12 YYYY-MM month strings for a fiscal year string like "FY 2024-25". */
function fiscalYearMonths(fy) {
  const match = String(fy || "").match(/FY\s*(\d{4})\s*-\s*(\d{2})/i);
  if (!match) return [];
  const startYear = Number(match[1]);
  return [4, 5, 6, 7, 8, 9, 10, 11, 12, 1, 2, 3].map((month) => {
    const year = month >= 4 ? startYear : startYear + 1;
    return `${year}-${String(month).padStart(2, "0")}`;
  });
}

/** Sort FY strings chronologically by their start year. */
function sortFys(fyArray) {
  return [...fyArray].sort((a, b) => {
    const ay = Number((a.match(/FY\s*(\d{4})/) || [])[1] || 0);
    const by = Number((b.match(/FY\s*(\d{4})/) || [])[1] || 0);
    return ay - by;
  });
}

// ---------------------------------------------------------------------------
// Per-FY aggregation helpers
// ---------------------------------------------------------------------------

/**
 * Aggregate itemFacts for a single FY, returning all metrics needed for KPIs.
 * @param {object[]} facts - itemFacts rows (already pre-filtered or all)
 * @param {string} fy - target FY string
 */
function aggregateFy(facts, fy) {
  const months = fiscalYearMonths(fy);
  const monthIndex = new Map(months.map((m, i) => [m, i]));

  let grossSales = 0;
  let salesReturn = 0;
  let grossPurchase = 0;
  let purchaseReturn = 0;
  let billCount = 0;

  // Monthly net sales (index 0=Apr … 11=Mar)
  const monthly = new Array(12).fill(0);

  // Per-party (customer) net sales — use bill-level finalAmount
  const custGross = new Map();  // party → grossSales
  const custReturn = new Map(); // party → salesReturn
  const custState = new Map();  // party → state (last known)

  // Per-itemGroup net sales — use LINE-level amount
  const groupGross = new Map();
  const groupReturn = new Map();

  // Supplier (vendor) purchase — bill-level finalAmount
  const vendorPurchase = new Map();

  for (const r of facts) {
    if (r.fy !== fy) continue;
    const fa = num(r.finalAmount);
    const a  = num(r.amount);

    if (r.tx === "Sales") {
      if (r.isHeader) {
        grossSales += fa;
        billCount++;
        const mi = monthIndex.get(r.month);
        if (mi !== undefined) monthly[mi] += fa;
        custGross.set(r.party, (custGross.get(r.party) || 0) + fa);
        if (r.state && r.state !== "Unmapped") custState.set(r.party, r.state);
      }
      // line-level for itemGroup
      const ig = r.itemGroup || "Unknown";
      groupGross.set(ig, (groupGross.get(ig) || 0) + a);

    } else if (r.tx === "Sales Return") {
      if (r.isHeader) {
        salesReturn += fa;
        const mi = monthIndex.get(r.month);
        if (mi !== undefined) monthly[mi] -= fa;
        custReturn.set(r.party, (custReturn.get(r.party) || 0) + fa);
      }
      const ig = r.itemGroup || "Unknown";
      groupReturn.set(ig, (groupReturn.get(ig) || 0) + a);

    } else if (r.tx === "Purchase") {
      if (r.isHeader) {
        grossPurchase += fa;
        vendorPurchase.set(r.party, (vendorPurchase.get(r.party) || 0) + fa);
      }
    } else if (r.tx === "Purchase Return") {
      if (r.isHeader) purchaseReturn += fa;
    }
  }

  const netSales = grossSales - salesReturn;
  const netPurchase = grossPurchase - purchaseReturn;
  const avgBill = billCount > 0 ? netSales / billCount : 0;
  const returnRate = grossSales > 0 ? round1((salesReturn / grossSales) * 100) : 0;

  // Active customers (distinct party with Sales header)
  const activeCustomers = new Set(custGross.keys());

  // Customer net sales map
  const custNet = new Map();
  for (const [party, gs] of custGross) {
    custNet.set(party, gs - (custReturn.get(party) || 0));
  }

  // Product (itemGroup) net sales map using line-level amount
  const groupNet = new Map();
  const allGroups = new Set([...groupGross.keys(), ...groupReturn.keys()]);
  for (const ig of allGroups) {
    groupNet.set(ig, (groupGross.get(ig) || 0) - (groupReturn.get(ig) || 0));
  }

  return {
    grossSales, salesReturn, netSales, billCount, avgBill,
    grossPurchase, purchaseReturn, netPurchase,
    returnRate, activeCustomers, custNet, custState, groupNet,
    vendorPurchase, monthly,
  };
}

// ---------------------------------------------------------------------------
// deltaPct helper
// ---------------------------------------------------------------------------
function deltaPct(cur, prev) {
  if (!prev) return 0;
  return roundInt(((cur - prev) / prev) * 100);
}

function deltaPts(cur, prev) {
  if (prev == null) return 0;
  return round1(cur - prev);
}

// ---------------------------------------------------------------------------
// buildCeoOverview
// ---------------------------------------------------------------------------

/**
 * Build the 3-FY CEO overview analytics object.
 *
 * @param {object} dashData  - { itemFacts, ledgerFacts, itemMaster }
 * @param {object} [options] - { fy?: string }
 * @returns {object} CEO overview object
 */
export function buildCeoOverview(dashData, options = {}) {
  const itemFacts   = Array.isArray(dashData?.itemFacts)   ? dashData.itemFacts   : [];
  const ledgerFacts = Array.isArray(dashData?.ledgerFacts) ? dashData.ledgerFacts : [];

  // ---- FY list ----
  const fySet = new Set();
  for (const r of itemFacts)   if (r.fy) fySet.add(r.fy);
  for (const r of ledgerFacts) if (r.fy) fySet.add(r.fy);

  const fyList = sortFys([...fySet]);

  if (fyList.length === 0) {
    return {
      fyList: [], currentFy: null, prevFy: null, partialFys: [],
      kpis: emptyKpis(),
      alerts: [],
      monthlyByFy: {},
      yoyByQuarter: [{ q: "Q1", prevVsPrev2: null, curVsPrev: null }, { q: "Q2", prevVsPrev2: null, curVsPrev: null }, { q: "Q3", prevVsPrev2: null, curVsPrev: null }, { q: "Q4", prevVsPrev2: null, curVsPrev: null }],
      topCustomers: [],
      topProducts:  [],
      suppliers:    [],
      pareto:       [],
    };
  }

  // ---- Partial FY analysis ----
  const { partialFys, latestCompleteFy } = analyzeFys(itemFacts, ledgerFacts);

  // ---- Current / prev FYs ----
  const currentFy = resolveCurrentFy(options.fy, fyList, latestCompleteFy);
  const curIdx = fyList.indexOf(currentFy);
  const prevFy  = curIdx >= 1 ? fyList[curIdx - 1] : null;
  const prev2Fy = curIdx >= 2 ? fyList[curIdx - 2] : null;

  // ---- Aggregate each FY ----
  const aggCur   = aggregateFy(itemFacts, currentFy);
  const aggPrev  = prevFy  ? aggregateFy(itemFacts, prevFy)  : null;
  const aggPrev2 = prev2Fy ? aggregateFy(itemFacts, prev2Fy) : null;

  const val  = (agg, key) => agg ? agg[key] : 0;

  // ---- KPIs ----
  const kpis = {
    netSales: {
      cur:      aggCur.netSales,
      prev:     val(aggPrev,  "netSales"),
      prev2:    val(aggPrev2, "netSales"),
      deltaPct: deltaPct(aggCur.netSales, aggPrev?.netSales || 0),
    },
    customers: {
      cur:     aggCur.activeCustomers.size,
      prev:    aggPrev  ? aggPrev.activeCustomers.size  : 0,
      prev2:   aggPrev2 ? aggPrev2.activeCustomers.size : 0,
      delta:   aggCur.activeCustomers.size - (aggPrev ? aggPrev.activeCustomers.size : 0),
      churned: aggPrev
        ? [...aggPrev.activeCustomers].filter(p => !aggCur.activeCustomers.has(p)).length
        : 0,
      added:   aggPrev
        ? [...aggCur.activeCustomers].filter(p => !aggPrev.activeCustomers.has(p)).length
        : 0,
    },
    avgBill: {
      cur:      aggCur.avgBill,
      prev:     val(aggPrev,  "avgBill"),
      prev2:    val(aggPrev2, "avgBill"),
      deltaPct: deltaPct(aggCur.avgBill, aggPrev?.avgBill || 0),
    },
    purchase: {
      cur:      aggCur.netPurchase,
      prev:     val(aggPrev,  "netPurchase"),
      prev2:    val(aggPrev2, "netPurchase"),
      deltaPct: deltaPct(aggCur.netPurchase, aggPrev?.netPurchase || 0),
    },
    returnRate: {
      cur:      aggCur.returnRate,
      prev:     val(aggPrev,  "returnRate"),
      prev2:    val(aggPrev2, "returnRate"),
      deltaPts: deltaPts(aggCur.returnRate, aggPrev?.returnRate ?? null),
    },
  };

  // ---- Alerts ----
  const alerts = [];

  // Red: churned customers
  if (kpis.customers.churned > 0 && prevFy) {
    alerts.push({
      tone:   "red",
      title:  `${kpis.customers.churned} customer${kpis.customers.churned > 1 ? "s" : ""} lost vs ${prevFy}`,
      detail: "Bought last year, no order this year",
    });
  }

  // Amber: purchase growing faster than sales
  if (
    kpis.purchase.deltaPct > kpis.netSales.deltaPct &&
    kpis.purchase.cur > 0 &&
    (aggPrev?.netPurchase || 0) > 0
  ) {
    alerts.push({
      tone:   "amber",
      title:  "Purchase growing faster than sales",
      detail: "Margin squeeze risk",
    });
  }

  // Amber: return rate rising across all available FYs
  {
    const rr = {
      cur:   aggCur.returnRate,
      prev:  aggPrev  ? aggPrev.returnRate  : null,
      prev2: aggPrev2 ? aggPrev2.returnRate : null,
    };
    const rising3 = rr.prev2 != null && rr.prev != null && rr.prev2 < rr.prev && rr.prev < rr.cur;
    const rising2 = rr.prev2 == null && rr.prev != null && rr.prev < rr.cur;

    if (rising3) {
      alerts.push({
        tone:   "amber",
        title:  "Return rate rising",
        detail: `${rr.prev2}% → ${rr.prev}% → ${rr.cur}%`,
      });
    } else if (rising2) {
      alerts.push({
        tone:   "amber",
        title:  "Return rate rising",
        detail: `${rr.prev}% → ${rr.cur}%`,
      });
    }
  }

  // Blue: new customers added
  if (kpis.customers.added > 0) {
    alerts.push({
      tone:   "blue",
      title:  `${kpis.customers.added} new customer${kpis.customers.added > 1 ? "s" : ""} added in ${currentFy}`,
      detail: "New buyers acquired this year",
    });
  }

  // ---- Monthly by FY ----
  const monthlyByFy = {};
  for (const fy of fyList) {
    monthlyByFy[fy] = aggregateFy(itemFacts, fy).monthly;
  }

  // ---- YoY by Quarter ----
  function quarterSum(monthlyArr, qIdx) {
    // qIdx 0=Q1(Apr-Jun), 1=Q2(Jul-Sep), 2=Q3(Oct-Dec), 3=Q4(Jan-Mar)
    const start = qIdx * 3;
    return (monthlyArr[start] || 0) + (monthlyArr[start + 1] || 0) + (monthlyArr[start + 2] || 0);
  }

  const yoyByQuarter = ["Q1", "Q2", "Q3", "Q4"].map((q, qi) => {
    const curQ   = quarterSum(monthlyByFy[currentFy] || [], qi);
    const prevQ  = prevFy  ? quarterSum(monthlyByFy[prevFy]  || [], qi) : null;
    const prev2Q = prev2Fy ? quarterSum(monthlyByFy[prev2Fy] || [], qi) : null;

    const curVsPrev    = (prevQ  != null && prevQ  !== 0) ? roundInt(((curQ  - prevQ)  / prevQ)  * 100) : null;
    const prevVsPrev2  = (prev2Q != null && prev2Q !== 0) ? roundInt(((prevQ - prev2Q) / prev2Q) * 100) : null;

    return { q, prevVsPrev2, curVsPrev };
  });

  // ---- Top Customers ----
  // Collect all parties that appear in any FY across custNet maps
  const allFyAggs = {
    [currentFy]: aggCur,
    ...(prevFy  ? { [prevFy]:  aggPrev  } : {}),
    ...(prev2Fy ? { [prev2Fy]: aggPrev2 } : {}),
  };

  const allParties = new Set();
  for (const agg of Object.values(allFyAggs)) {
    for (const p of agg.custNet.keys()) allParties.add(p);
  }

  const custRows = [...allParties]
    .map(name => {
      const perFy = {};
      for (const fy of fyList) {
        const agg = allFyAggs[fy];
        perFy[fy] = agg ? (agg.custNet.get(name) || 0) : 0;
      }
      const current = perFy[currentFy] || 0;
      const prevVal = prevFy ? (perFy[prevFy] || 0) : 0;
      const yoyPct  = prevVal ? roundInt(((current - prevVal) / prevVal) * 100) : null;
      return { name, perFy, current, yoyPct };
    })
    .filter(c => c.current > 0)
    .sort((a, b) => b.current - a.current)
    .slice(0, 8);

  // ---- Top Products ----
  const allGroups = new Set();
  for (const agg of Object.values(allFyAggs)) {
    for (const g of agg.groupNet.keys()) allGroups.add(g);
  }

  const productRows = [...allGroups]
    .map(brand => {
      const perFy = {};
      for (const fy of fyList) {
        const agg = allFyAggs[fy];
        perFy[fy] = agg ? (agg.groupNet.get(brand) || 0) : 0;
      }
      const current = perFy[currentFy] || 0;
      const prevVal = prevFy ? (perFy[prevFy] || 0) : 0;
      const yoyPct  = prevVal ? roundInt(((current - prevVal) / prevVal) * 100) : null;
      return { brand, perFy, current, yoyPct };
    })
    .filter(p => p.current > 0)
    .sort((a, b) => b.current - a.current)
    .slice(0, 8);

  // ---- Suppliers (currentFy only) ----
  const vendorMap = aggCur.vendorPurchase;
  const vendorTotal = [...vendorMap.values()].reduce((s, v) => s + v, 0);
  const topVendors = [...vendorMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4);

  const othersValue = vendorTotal - topVendors.reduce((s, [, v]) => s + v, 0);

  const suppliers = topVendors.map(([name, value]) => ({
    name,
    value,
    pct: vendorTotal > 0 ? round1((value / vendorTotal) * 100) : 0,
  }));

  if (othersValue > 0) {
    suppliers.push({
      name:  "Others",
      value: othersValue,
      pct:   vendorTotal > 0 ? round1((othersValue / vendorTotal) * 100) : 0,
    });
  }

  // ---- Pareto (currentFy customers, top 20) ----
  const totalCurSales = aggCur.netSales;
  let cumPct = 0;
  const pareto = [...aggCur.custNet.entries()]
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([label, value]) => {
      cumPct += totalCurSales > 0 ? (value / totalCurSales) * 100 : 0;
      return { label, value, cumulativePct: round1(cumPct), state: aggCur.custState.get(label) || "" };
    });

  // Unique states for pareto filter
  const paretoStates = [...new Set(pareto.map((p) => p.state).filter(Boolean))].sort();

  return {
    fyList,
    currentFy,
    partialFys,
    prevFy,
    kpis,
    alerts,
    monthlyByFy,
    yoyByQuarter,
    topCustomers: custRows,
    topProducts:  productRows,
    suppliers,
    pareto,
    paretoStates,
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function emptyKpis() {
  return {
    netSales:   { cur: 0, prev: 0, prev2: 0, deltaPct: 0 },
    customers:  { cur: 0, prev: 0, prev2: 0, delta: 0, churned: 0, added: 0 },
    avgBill:    { cur: 0, prev: 0, prev2: 0, deltaPct: 0 },
    purchase:   { cur: 0, prev: 0, prev2: 0, deltaPct: 0 },
    returnRate: { cur: 0, prev: 0, prev2: 0, deltaPts: 0 },
  };
}
