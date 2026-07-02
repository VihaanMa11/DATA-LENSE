// Customer Analysis — 3-year acquisition / retention / churn cockpit.
// Input: dashData = { itemFacts, ledgerFacts, itemMaster }
// Output: see buildCustomerAnalysis JSDoc below.
// No HTTP, no React, no new dependencies — pure ESM.

import { analyzeFys, resolveCurrentFy } from "./fyUtil.js";

const num = (v) => Number(v) || 0;
const round1 = (v) => Math.round(v * 10) / 10;
const roundInt = (v) => Math.round(v);

// ---------------------------------------------------------------------------
// FY helpers (same pattern as ceoBuilder.js)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Per-customer per-FY aggregation
// Returns Map<party, { netSales, bills, monthsActive(Set), monthly[12], returns, lastOrderDate, firstBillMonth }>
// ---------------------------------------------------------------------------
function aggregateCustomersFy(itemFacts, fy) {
  const months = fiscalYearMonths(fy);
  const monthIndex = new Map(months.map((m, i) => [m, i]));

  const gross = new Map();   // party -> grossSales
  const ret   = new Map();   // party -> salesReturn
  const bills = new Map();   // party -> bill count
  const active = new Map();  // party -> Set of months
  const monthly = new Map(); // party -> [12]
  const lastDate = new Map();// party -> latest date string
  const firstMonth = new Map(); // party -> earliest month string

  for (const r of itemFacts) {
    if (r.fy !== fy) continue;
    const party = r.party || "Unknown";
    if (party.toLowerCase() === "cash") continue;

    if (r.tx === "Sales" && r.isHeader) {
      const fa = num(r.finalAmount);
      gross.set(party, (gross.get(party) || 0) + fa);
      bills.set(party, (bills.get(party) || 0) + 1);
      if (!active.has(party)) active.set(party, new Set());
      if (r.month) {
        active.get(party).add(r.month);
        if (!firstMonth.has(party) || r.month < firstMonth.get(party)) firstMonth.set(party, r.month);
      }
      if (!monthly.has(party)) monthly.set(party, new Array(12).fill(0));
      const mi = monthIndex.get(r.month);
      if (mi !== undefined) monthly.get(party)[mi] += fa;
      if (r.date) {
        if (!lastDate.has(party) || r.date > lastDate.get(party)) lastDate.set(party, r.date);
      }
    } else if (r.tx === "Sales Return" && r.isHeader) {
      const fa = num(r.finalAmount);
      ret.set(party, (ret.get(party) || 0) + fa);
      if (!monthly.has(party)) monthly.set(party, new Array(12).fill(0));
      const mi = monthIndex.get(r.month);
      if (mi !== undefined) monthly.get(party)[mi] -= fa;
    }
  }

  const result = new Map();
  const allParties = new Set([...gross.keys(), ...ret.keys()]);
  for (const party of allParties) {
    const g = gross.get(party) || 0;
    const r = ret.get(party) || 0;
    result.set(party, {
      netSales: g - r,
      grossSales: g,
      returns: r,
      bills: bills.get(party) || 0,
      monthsActive: active.get(party) || new Set(),
      monthly: monthly.get(party) || new Array(12).fill(0),
      lastOrderDate: lastDate.get(party) || null,
      firstBillMonth: firstMonth.get(party) || null,
    });
  }
  return result;
}

// ---------------------------------------------------------------------------
// Segment classification (3-FY context)
// ---------------------------------------------------------------------------
function classifySegment(party, fyDataMap, fys) {
  const [firstFy, midFy, lastFy] = fys.length >= 3
    ? [fys[0], fys[1], fys[2]]
    : fys.length === 2
      ? [fys[0], null, fys[1]]
      : [fys[0], null, null];

  const activeInFy = (fy) => fy ? (fyDataMap.get(fy)?.get(party)?.netSales || 0) > 0 || (fyDataMap.get(fy)?.get(party)?.bills || 0) > 0 : false;
  const netInFy = (fy) => fy ? (fyDataMap.get(fy)?.get(party)?.netSales || 0) : 0;

  const inFirst = activeInFy(firstFy);
  const inMid   = midFy ? activeInFy(midFy) : null;
  const inLast  = lastFy ? activeInFy(lastFy) : false;

  const nFirst = netInFy(firstFy);
  const nMid   = netInFy(midFy);
  const nLast  = netInFy(lastFy);

  // Recovered: active firstFy, zero/inactive midFy, active lastFy
  if (inFirst && midFy && !inMid && inLast) return "Recovered";

  // Lost: active firstFy, not active lastFy (and not recovered)
  if (inFirst && !inLast) return "Lost";

  // Champion: active all available FYs AND strictly growing
  const allFysActive = fys.every((fy) => activeInFy(fy));
  if (allFysActive && fys.length >= 3) {
    const growing = nFirst < nMid && nMid < nLast;
    if (growing) return "Champion";
  }

  // AtRisk: active in currentFy but declining YoY vs previous FY
  const curFy = fys[fys.length - 1];
  const prevFy = fys.length >= 2 ? fys[fys.length - 2] : null;
  if (activeInFy(curFy) && prevFy) {
    const cur = netInFy(curFy);
    const prev = netInFy(prevFy);
    if (cur < prev && prev > 0) return "AtRisk";
  }

  // Loyal: active in 2+ FYs, not Champion or AtRisk
  const activeFyCount = fys.filter((fy) => activeInFy(fy)).length;
  if (activeFyCount >= 2) return "Loyal";

  // New: only active in one FY (and it's not firstFy — those are Lost already)
  return "New";
}

// ---------------------------------------------------------------------------
// buildCustomerAnalysis
// ---------------------------------------------------------------------------

/**
 * Build the 3-FY customer acquisition/retention/churn cockpit.
 *
 * @param {object} dashData  - { itemFacts, ledgerFacts, itemMaster }
 * @param {object} [options] - { fy?: string }
 * @returns {object}
 */
export function buildCustomerAnalysis(dashData, options = {}) {
  const itemFacts = Array.isArray(dashData?.itemFacts) ? dashData.itemFacts : [];

  // ---- FY list ----
  const fySet = new Set();
  for (const r of itemFacts) {
    const party = r.party || "";
    if (party.toLowerCase() === "cash") continue;
    if (r.fy && (r.tx === "Sales" || r.tx === "Sales Return")) fySet.add(r.fy);
  }
  const fyList = sortFys([...fySet]);

  if (fyList.length === 0) {
    return emptyResult({ fy: options.fy || null, fyList: [] });
  }

  // ---- Partial FY analysis ----
  const { partialFys, latestCompleteFy } = analyzeFys(itemFacts, []);
  const currentFy = resolveCurrentFy(options.fy, fyList, latestCompleteFy);
  const lastFy   = fyList[fyList.length - 1];  // last in series (for waterfall labels)
  const curIdx   = fyList.indexOf(currentFy);
  const prevFy   = curIdx >= 1 ? fyList[curIdx - 1] : null;
  const firstFy  = fyList[0];

  // For waterfall / cohort we always use the full sorted list
  const fys = fyList; // [first, mid?, last]
  const midFy = fys.length >= 3 ? fys[1] : null;

  // ---- Per-FY customer data ----
  const fyDataMap = new Map(); // fy -> Map<party, data>
  for (const fy of fyList) {
    fyDataMap.set(fy, aggregateCustomersFy(itemFacts, fy));
  }

  // ---- All unique customers ever (Cash excluded in aggregator) ----
  const allParties = new Set();
  for (const [, custMap] of fyDataMap) {
    for (const [party, data] of custMap) {
      if (data.netSales > 0 || data.bills > 0) allParties.add(party);
    }
  }

  // Helper: is a customer active in a given FY?
  const activeIn = (party, fy) => {
    if (!fy) return false;
    const d = fyDataMap.get(fy)?.get(party);
    return d ? (d.netSales > 0 || d.bills > 0) : false;
  };

  const netIn = (party, fy) => {
    if (!fy) return 0;
    return fyDataMap.get(fy)?.get(party)?.netSales || 0;
  };

  const billsIn = (party, fy) => {
    if (!fy) return 0;
    return fyDataMap.get(fy)?.get(party)?.bills || 0;
  };

  // ---- Per-FY active counts ----
  const perFyCounts = {};
  for (const fy of fyList) {
    let count = 0;
    for (const party of allParties) {
      if (activeIn(party, fy)) count++;
    }
    perFyCounts[fy] = count;
  }

  // ---- 3yr total customers ----
  const totalCustomers3yr = allParties.size;

  // ---- Retained: active in firstFy AND in currentFy ----
  const firstFyActives = [...allParties].filter((p) => activeIn(p, firstFy));
  const retainedParties = firstFyActives.filter((p) => activeIn(p, currentFy));
  const retained = {
    count: retainedParties.length,
    pct: firstFyActives.length > 0 ? round1((retainedParties.length / firstFyActives.length) * 100) : 0,
  };

  // ---- Lost: active firstFy, NOT active currentFy ----
  const lostParties = firstFyActives.filter((p) => !activeIn(p, currentFy));
  const lost = {
    count: lostParties.length,
    pct: firstFyActives.length > 0 ? round1((lostParties.length / firstFyActives.length) * 100) : 0,
  };

  // ---- Acquired: first-active FY is NOT the firstFy ----
  // For each party, find the first FY they appear in
  const firstActiveFy = new Map();
  for (const party of allParties) {
    for (const fy of fyList) {
      if (activeIn(party, fy)) {
        firstActiveFy.set(party, fy);
        break;
      }
    }
  }

  const acquiredPerFy = {};
  for (const fy of fyList) acquiredPerFy[fy] = 0;
  for (const [party, fy] of firstActiveFy) {
    if (fy !== firstFy) acquiredPerFy[fy] = (acquiredPerFy[fy] || 0) + 1;
  }

  const acquiredCount = [...allParties].filter((p) => firstActiveFy.get(p) !== firstFy).length;
  const acquired = { count: acquiredCount, perFy: acquiredPerFy };

  // ---- Avg order frequency ----
  const avgFreqForFy = (fy) => {
    if (!fy) return 0;
    const activeCount = perFyCounts[fy] || 0;
    if (activeCount === 0) return 0;
    let totalBills = 0;
    for (const party of allParties) {
      if (activeIn(party, fy)) totalBills += billsIn(party, fy);
    }
    return round1(totalBills / activeCount);
  };

  const curFreq = avgFreqForFy(currentFy);
  const prevFreq = prevFy ? avgFreqForFy(prevFy) : null;
  const avgOrderFreq = {
    cur: curFreq,
    prevDelta: prevFreq != null ? round1(curFreq - prevFreq) : null,
  };

  // ---- Avg revenue per customer ----
  const totalNetForFy = (fy) => {
    if (!fy) return 0;
    let t = 0;
    for (const party of allParties) t += netIn(party, fy);
    return t;
  };

  const curTotal = totalNetForFy(currentFy);
  const prevTotal = prevFy ? totalNetForFy(prevFy) : 0;
  const curActiveCount = perFyCounts[currentFy] || 0;
  const prevActiveCount = prevFy ? (perFyCounts[prevFy] || 0) : 0;

  const avgRevPerCustomer = {
    cur:      curActiveCount > 0 ? Math.round(curTotal / curActiveCount) : 0,
    prev:     prevActiveCount > 0 ? Math.round(prevTotal / prevActiveCount) : 0,
    deltaPct: 0,
  };
  avgRevPerCustomer.deltaPct = avgRevPerCustomer.prev > 0
    ? deltaPct(avgRevPerCustomer.cur, avgRevPerCustomer.prev)
    : 0;

  // ---- KPIs ----
  const kpis = {
    totalCustomers3yr,
    perFyCounts,
    retained,
    acquired,
    lost,
    avgOrderFreq,
    avgRevPerCustomer,
  };

  // ---- Alerts ----
  const alerts = [];

  // Red: churn > 30%
  if (lost.pct >= 30) {
    alerts.push({
      tone: "red",
      title: `High churn: ${lost.pct}% of ${firstFy} customers lost`,
      body: `${lost.count} customers active in ${firstFy} did not buy in ${currentFy}.`,
    });
  } else if (lost.count > 0) {
    alerts.push({
      tone: "amber",
      title: `${lost.count} customer${lost.count > 1 ? "s" : ""} lost since ${firstFy}`,
      body: `${lost.pct}% churn from first financial year.`,
    });
  }

  // Amber: order frequency declining
  if (avgOrderFreq.prevDelta != null && avgOrderFreq.prevDelta < 0) {
    alerts.push({
      tone: "amber",
      title: `Order frequency declining`,
      body: `Avg bills per customer: ${curFreq} in ${currentFy} vs ${prevFreq} in ${prevFy} (${avgOrderFreq.prevDelta} change).`,
    });
  }

  // Green: rev per customer up
  if (avgRevPerCustomer.deltaPct > 0) {
    alerts.push({
      tone: "green",
      title: `Revenue per customer up ${avgRevPerCustomer.deltaPct}% vs ${prevFy}`,
      body: `Average net revenue per active customer improved year over year.`,
    });
  }

  // Blue: new customers acquired
  if (acquired.count > 0) {
    alerts.push({
      tone: "blue",
      title: `${acquired.count} new customer${acquired.count > 1 ? "s" : ""} acquired across 3 years`,
      body: Object.entries(acquiredPerFy)
        .filter(([, v]) => v > 0)
        .map(([fy, c]) => `${c} in ${fy}`)
        .join(", "),
    });
  }

  if (alerts.length === 0) {
    alerts.push({ tone: "blue", title: "Customer base stable", body: "No major acquisition or churn signals detected." });
  }

  // ---- Waterfall (customer count bridge across FYs) ----
  // firstFy base → [mid changes] → [last changes]
  const waterfall = [];

  if (fys.length >= 2) {
    const base = perFyCounts[firstFy] || 0;
    waterfall.push({ label: firstFy, value: base, kind: "base" });

    if (midFy) {
      // Lost between first and mid
      const lostToMid = firstFyActives.filter((p) => !activeIn(p, midFy)).length;
      // New in mid (first active = mid)
      const newInMid = [...allParties].filter((p) => firstActiveFy.get(p) === midFy).length;
      if (lostToMid > 0) waterfall.push({ label: `Lost to ${midFy}`, value: -lostToMid, kind: "loss" });
      if (newInMid > 0)  waterfall.push({ label: `New in ${midFy}`, value: newInMid, kind: "gain" });
      const midTotal = perFyCounts[midFy] || 0;
      waterfall.push({ label: midFy, value: midTotal, kind: "total" });

      // Lost between mid and last
      const midActives = [...allParties].filter((p) => activeIn(p, midFy));
      const lostToLast = midActives.filter((p) => !activeIn(p, lastFy)).length;
      // Recovered: active firstFy, zero midFy, back lastFy
      const recovered = firstFyActives.filter((p) => !activeIn(p, midFy) && activeIn(p, lastFy)).length;
      // New in last
      const newInLast = [...allParties].filter((p) => firstActiveFy.get(p) === lastFy).length;

      if (lostToLast > 0)   waterfall.push({ label: `Lost to ${lastFy}`, value: -lostToLast, kind: "loss" });
      if (recovered > 0)    waterfall.push({ label: `Recovered`, value: recovered, kind: "gain" });
      if (newInLast > 0)    waterfall.push({ label: `New in ${lastFy}`, value: newInLast, kind: "gain" });
      waterfall.push({ label: lastFy, value: perFyCounts[lastFy] || 0, kind: "total" });

    } else {
      // 2 FYs only
      const lostCount = lostParties.length;
      const newInLast = [...allParties].filter((p) => firstActiveFy.get(p) === lastFy).length;
      if (lostCount > 0)  waterfall.push({ label: `Lost`, value: -lostCount, kind: "loss" });
      if (newInLast > 0)  waterfall.push({ label: `New`, value: newInLast, kind: "gain" });
      waterfall.push({ label: lastFy, value: perFyCounts[lastFy] || 0, kind: "total" });
    }
  }

  // ---- Segments ----
  const segCounts = { Champion: 0, Loyal: 0, AtRisk: 0, Lost: 0, New: 0, Recovered: 0 };
  for (const party of allParties) {
    const seg = classifySegment(party, fyDataMap, fys);
    segCounts[seg] = (segCounts[seg] || 0) + 1;
  }

  const segments = [
    { key: "Champion",  label: "Champion",  count: segCounts.Champion  || 0 },
    { key: "Loyal",     label: "Loyal",     count: segCounts.Loyal     || 0 },
    { key: "AtRisk",    label: "At Risk",   count: segCounts.AtRisk    || 0 },
    { key: "Lost",      label: "Lost",      count: segCounts.Lost      || 0 },
    { key: "New",       label: "New",       count: segCounts.New       || 0 },
    { key: "Recovered", label: "Recovered", count: segCounts.Recovered || 0 },
  ];

  // ---- Active customers MoM (how many customers placed an order that month) ----
  const activeMoM = { months: APR_TO_MAR, series: [] };
  for (const fy of fyList) {
    const fyMonths = fiscalYearMonths(fy);
    const monthCounts = new Array(12).fill(0);
    const custMap = fyDataMap.get(fy) || new Map();
    for (const [, data] of custMap) {
      if (data.netSales <= 0 && data.bills <= 0) continue;
      for (const m of data.monthsActive) {
        const mi = fyMonths.indexOf(m);
        if (mi >= 0) monthCounts[mi]++;
      }
    }
    activeMoM.series.push({ name: fy, values: monthCounts });
  }

  // ---- ARPC MoM (avg net revenue per active customer per month, in Lakh) ----
  const arpcMoM = { months: APR_TO_MAR, series: [] };
  for (const fy of fyList) {
    const fyMonths = fiscalYearMonths(fy);
    const custMap = fyDataMap.get(fy) || new Map();
    const monthRevenue = new Array(12).fill(0);
    const monthActiveCount = new Array(12).fill(0);
    for (const [, data] of custMap) {
      if (data.netSales <= 0 && data.bills <= 0) continue;
      for (let mi = 0; mi < 12; mi++) {
        if (data.monthly[mi] !== 0) {
          monthRevenue[mi] += data.monthly[mi];
          if (data.monthly[mi] > 0) monthActiveCount[mi]++;
        }
      }
    }
    arpcMoM.series.push({
      name: fy,
      values: monthRevenue.map((rev, i) =>
        monthActiveCount[i] > 0 ? round1((rev / monthActiveCount[i]) / 100000) : 0
      ),
    });
  }

  // ---- Acquisition MoM (new customers per month — first-ever bill) ----
  // A customer's acquisition month = the earliest month across all FYs they appear
  const acquisitionByFyMonth = new Map(); // party -> { fy, monthIdx }
  for (const party of allParties) {
    let earliest = null;
    for (const fy of fyList) {
      const d = fyDataMap.get(fy)?.get(party);
      if (!d || (d.netSales <= 0 && d.bills <= 0)) continue;
      const fyMonths = fiscalYearMonths(fy);
      if (d.firstBillMonth) {
        const mi = fyMonths.indexOf(d.firstBillMonth);
        if (mi >= 0) {
          const candidate = { fy, monthIdx: mi };
          if (!earliest || fy < earliest.fy || (fy === earliest.fy && mi < earliest.monthIdx)) {
            earliest = candidate;
          }
        }
      }
    }
    if (earliest) acquisitionByFyMonth.set(party, earliest);
  }

  const acquisitionMoM = { months: APR_TO_MAR, series: [] };
  for (const fy of fyList) {
    const counts = new Array(12).fill(0);
    for (const [, acq] of acquisitionByFyMonth) {
      if (acq.fy === fy) counts[acq.monthIdx]++;
    }
    acquisitionMoM.series.push({ name: fy, values: counts });
  }

  // ---- Retention rate: consecutive FY pairs ----
  const retentionRate = [];
  for (let i = 0; i < fyList.length - 1; i++) {
    const a = fyList[i];
    const b = fyList[i + 1];
    const aActives = [...allParties].filter((p) => activeIn(p, a));
    const retained_ab = aActives.filter((p) => activeIn(p, b)).length;
    const retainedPct = aActives.length > 0 ? round1((retained_ab / aActives.length) * 100) : 0;
    retentionRate.push({
      pair: `${a.replace("FY ", "")} to ${b.replace("FY ", "")}`,
      retainedPct,
      churnedPct: round1(100 - retainedPct),
    });
  }

  // ---- Frequency by FY ----
  const frequencyByFy = fyList.map((fy) => ({
    fy,
    avgBills: avgFreqForFy(fy),
  }));

  // ---- Cohort retention grid ----
  const cohorts = [];
  for (const cohortFy of fyList) {
    const cohortParties = [...allParties].filter((p) => firstActiveFy.get(p) === cohortFy);
    const size = cohortParties.length;
    const retention = fyList
      .filter((fy) => fy >= cohortFy)  // only subsequent or same FYs
      .map((fy) => {
        if (size === 0) return 0;
        const active = cohortParties.filter((p) => activeIn(p, fy)).length;
        return round1((active / size) * 100);
      });
    cohorts.push({ cohort: cohortFy, size, retention });
  }

  // ---- Customer detail table ----
  const table = [];
  for (const party of allParties) {
    const perFy = {};
    for (const fy of fyList) perFy[fy] = netIn(party, fy);

    const curNet  = perFy[currentFy] || 0;
    const prevNet = prevFy ? (perFy[prevFy] || 0) : 0;
    const yoyPct  = prevNet > 0 ? deltaPct(curNet, prevNet) : null;
    const total3yr = fyList.reduce((s, fy) => s + (perFy[fy] || 0), 0);

    const curData = fyDataMap.get(currentFy)?.get(party);
    const returnPct = curData?.grossSales > 0
      ? round1((curData.returns / curData.grossSales) * 100)
      : 0;

    // Average bills per year over FYs where customer was active
    const activeFysCount = fyList.filter((fy) => activeIn(party, fy)).length;
    const totalBills = fyList.reduce((s, fy) => s + billsIn(party, fy), 0);
    const billsPerYr = activeFysCount > 0 ? round1(totalBills / activeFysCount) : 0;

    const curBills = billsIn(party, currentFy);
    const avgBill = curBills > 0 ? Math.round(curNet / curBills) : 0;

    // Last order date (across all FYs)
    let lastOrder = null;
    for (const fy of fyList) {
      const d = fyDataMap.get(fy)?.get(party);
      if (d?.lastOrderDate) {
        if (!lastOrder || d.lastOrderDate > lastOrder) lastOrder = d.lastOrderDate;
      }
    }

    const trend = fyList.map((fy) => perFy[fy] || 0);
    const segment = classifySegment(party, fyDataMap, fys);

    table.push({
      name: party,
      perFy,
      yoyPct,
      total3yr,
      returnPct,
      billsPerYr,
      avgBill,
      lastOrder,
      trend,
      segment,
    });
  }

  // Sort by currentFy net desc
  table.sort((a, b) => (b.perFy[currentFy] || 0) - (a.perFy[currentFy] || 0));

  return {
    fy: currentFy,
    fyList,
    currentFy,
    partialFys,
    prevFy,
    kpis,
    alerts,
    waterfall,
    segments,
    activeMoM,
    arpcMoM,
    acquisitionMoM,
    retentionRate,
    frequencyByFy,
    cohorts,
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
      totalCustomers3yr: 0,
      perFyCounts: {},
      retained: { count: 0, pct: 0 },
      acquired: { count: 0, perFy: {} },
      lost: { count: 0, pct: 0 },
      avgOrderFreq: { cur: 0, prevDelta: null },
      avgRevPerCustomer: { cur: 0, prev: 0, deltaPct: 0 },
    },
    alerts: [],
    waterfall: [],
    segments: [],
    activeMoM: { months: APR_TO_MAR, series: [] },
    arpcMoM: { months: APR_TO_MAR, series: [] },
    acquisitionMoM: { months: APR_TO_MAR, series: [] },
    retentionRate: [],
    frequencyByFy: [],
    cohorts: [],
    table: [],
  };
}
