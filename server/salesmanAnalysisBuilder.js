// Salesman Analysis — 3-year sales-team cockpit.
// Input: dashData = { itemFacts } (same fact table as every other report — no
// separate ingestion path needed, see note below).
//
// DATA NOTES (confirmed against the workbook the user provided, DATA_Lens_Master_Data.xlsx):
//  - The Sales sheet's "Salesman Name" column is already parsed by dashboardBuilder.js
//    into itemFacts[].salesman for every item-fact row (Sales/Sales Return/Purchase/
//    Purchase Return alike), the same way Party Name and Item Name are. There is no
//    separate "Salesman" tab and no new loader/ingestion path was needed — this
//    builder just reads the field that was already being captured.
//  - Sales Return now also carries a Salesman Name (the user added it after the first
//    pass, confirmed 801/801 rows populated), so returns ARE attributable. The primary
//    figure per salesman is therefore NET sales (Sales less Sales Return), matching
//    every other report in this codebase — not a gross-only figure.
//  - Customers are not exclusive to one salesman — most parties are billed by several
//    different salesmen across the year (checked: 115 of 207 parties). "Customers
//    served" is therefore a reach count, not a territory assignment.
//  - There is no target/quota data anywhere in the workbook, so no target-vs-
//    achievement metric is computed — inventing one would not be faithful to the ledger.
//
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
function deltaPct(cur, prev) { if (!prev) return 0; return roundInt(((cur - prev) / prev) * 100); }
const APR_TO_MAR = ["Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar"];

// "LALIT (SALES MAN)" -> { name: "LALIT", role: "Sales Man" }. Falls back to the raw
// string with no role when there's no parenthetical suffix.
export function parseSalesman(raw) {
  const s = String(raw || "").trim();
  if (!s) return { name: "Unassigned", role: "" };
  const m = s.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
  if (!m) return { name: s, role: "" };
  const role = m[2].trim().toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
  return { name: m[1].trim(), role };
}

// Per-FY per-salesman aggregation. Sales and Sales Return header rows both count
// toward revenue (net = gross - returns); "bills" tracks Sales vouchers only (a
// return isn't a new order).
function aggregateSalesmenFy(itemFacts, fy) {
  const months = fiscalYearMonths(fy);
  const monthIndex = new Map(months.map((m, i) => [m, i]));
  const map = new Map();
  const ensure = (sm) => {
    let e = map.get(sm);
    if (!e) { e = { grossSales: 0, returns: 0, bills: new Set(), customers: new Set(), skus: new Set(), monthly: new Array(12).fill(0), lastSaleDate: null }; map.set(sm, e); }
    return e;
  };
  for (const r of itemFacts) {
    if (r.fy !== fy || (r.tx !== "Sales" && r.tx !== "Sales Return")) continue;
    const sm = parseSalesman(r.salesman).name || "Unassigned";
    const e = ensure(sm);
    if (r.item) e.skus.add(r.item);
    const party = String(r.party || "").trim();
    if (party && party.toLowerCase() !== "cash") e.customers.add(party);
    if (!r.isHeader) continue;
    const fa = num(r.finalAmount);
    const mi = monthIndex.get(r.month);
    if (r.tx === "Sales") {
      if (r.voucher) e.bills.add(r.voucher);
      e.grossSales += fa;
      if (mi !== undefined) e.monthly[mi] += fa;
      if (r.date && (!e.lastSaleDate || r.date > e.lastSaleDate)) e.lastSaleDate = r.date;
    } else {
      e.returns += fa;
      if (mi !== undefined) e.monthly[mi] -= fa;
    }
  }
  return map;
}

function companyNetSalesFy(itemFacts, fy) {
  let s = 0;
  for (const r of itemFacts) {
    if (r.fy !== fy || !r.isHeader) continue;
    if (String(r.party || "").toLowerCase() === "cash") continue;
    if (r.tx === "Sales") s += num(r.finalAmount);
    else if (r.tx === "Sales Return") s -= num(r.finalAmount);
  }
  return s;
}

/**
 * @param {object} dashData - { itemFacts }
 * @param {object} [options] - { fy?: string }
 */
export function buildSalesmanAnalysis(dashData, options = {}) {
  const itemFacts = Array.isArray(dashData?.itemFacts) ? dashData.itemFacts : [];

  const fySet = new Set();
  for (const r of itemFacts) if ((r.tx === "Sales" || r.tx === "Sales Return") && r.fy && r.salesman) fySet.add(r.fy);
  const fyList = sortFys([...fySet]);
  if (fyList.length === 0) return emptyResult({ fy: options.fy || null });

  const { partialFys, latestCompleteFy } = analyzeFys(itemFacts, []);
  const currentFy = resolveCurrentFy(options.fy, fyList, latestCompleteFy);
  const curIdx = fyList.indexOf(currentFy);
  const prevFy = curIdx >= 1 ? fyList[curIdx - 1] : null;

  const fySalesmen = new Map();
  for (const fy of fyList) fySalesmen.set(fy, aggregateSalesmenFy(itemFacts, fy));

  // Aggregation keys on the parsed clean name (parseSalesman(...).name), which loses
  // the role suffix — recover it once here so display can show "Sales Head" etc.
  const roleBySalesman = new Map();
  for (const r of itemFacts) {
    if ((r.tx !== "Sales" && r.tx !== "Sales Return") || !r.salesman) continue;
    const { name, role } = parseSalesman(r.salesman);
    if (role && !roleBySalesman.has(name)) roleBySalesman.set(name, role);
  }
  const roleOf = (sm) => roleBySalesman.get(sm) || "";

  const grossIn = (sm, fy) => fySalesmen.get(fy)?.get(sm)?.grossSales || 0;
  const returnsIn = (sm, fy) => fySalesmen.get(fy)?.get(sm)?.returns || 0;
  const netIn = (sm, fy) => grossIn(sm, fy) - returnsIn(sm, fy);
  const billsIn = (sm, fy) => fySalesmen.get(fy)?.get(sm)?.bills?.size || 0;
  const custIn  = (sm, fy) => fySalesmen.get(fy)?.get(sm)?.customers?.size || 0;
  const skusIn  = (sm, fy) => fySalesmen.get(fy)?.get(sm)?.skus?.size || 0;
  const monthlyIn = (sm, fy) => fySalesmen.get(fy)?.get(sm)?.monthly || new Array(12).fill(0);

  const allSalesmen = new Set();
  for (const [, m] of fySalesmen) for (const [sm, e] of m) if (e.grossSales > 0 || e.returns > 0) allSalesmen.add(sm);

  const ranked = [...allSalesmen].sort((a, b) => netIn(b, currentFy) - netIn(a, currentFy));
  const curTotal = ranked.reduce((s, sm) => s + netIn(sm, currentFy), 0);
  const prevTotal = prevFy ? ranked.reduce((s, sm) => s + netIn(sm, prevFy), 0) : 0;

  const companyNetSales = companyNetSalesFy(itemFacts, currentFy);

  // ---- Company-wide customer reach (union across all salesmen, Cash excluded) ----
  const allCustomersReached = new Set();
  for (const sm of ranked) for (const c of (fySalesmen.get(currentFy)?.get(sm)?.customers || [])) allCustomersReached.add(c);

  const topSalesman = ranked[0] || null;
  const topShare = topSalesman && curTotal > 0 ? round1((netIn(topSalesman, currentFy) / curTotal) * 100) : 0;
  const activeCount = ranked.filter((sm) => netIn(sm, currentFy) > 0).length;
  const avgPerSalesman = activeCount > 0 ? Math.round(curTotal / activeCount) : 0;

  const decliningList = prevFy
    ? ranked.filter((sm) => netIn(sm, currentFy) > 0 && netIn(sm, prevFy) > 0 && netIn(sm, currentFy) < netIn(sm, prevFy))
    : [];

  const kpis = {
    teamNetSales: { cur: Math.round(curTotal), prev: prevFy ? Math.round(prevTotal) : null, yoyPct: prevTotal > 0 ? deltaPct(curTotal, prevTotal) : null },
    activeSalesmen: { count: activeCount, total: allSalesmen.size },
    topSalesman: topSalesman ? { name: topSalesman, role: roleOf(topSalesman), value: Math.round(netIn(topSalesman, currentFy)), sharePct: topShare } : null,
    avgPerSalesman: { cur: avgPerSalesman },
    customersReached: { cur: allCustomersReached.size },
    declining: { count: decliningList.length, names: decliningList.slice(0, 3) },
  };

  // ---- Alerts ----
  const alerts = [];
  if (topSalesman) alerts.push({ tone: "green", title: `${topSalesman} leads at ${topShare}% of team sales`, body: `${bigMoney(netIn(topSalesman, currentFy))} net in ${currentFy}. Reliable top performer.` });
  if (topShare >= 40) alerts.push({ tone: "amber", title: `Sales concentrated in one person (${topShare}%)`, body: `If ${topSalesman} is unavailable, a large share of the pipeline has no backup coverage.` });
  if (decliningList.length > 0) alerts.push({ tone: "red", title: `${decliningList.length} salesmen declining YoY`, body: `${decliningList.slice(0, 3).join(", ")} sold less in ${currentFy} than ${prevFy}.` });
  const thin = ranked.filter((sm) => netIn(sm, currentFy) > 0 && custIn(sm, currentFy) <= 3);
  if (thin.length > 0) alerts.push({ tone: "amber", title: `${thin.length} salesmen cover 3 or fewer customers`, body: `${thin.slice(0, 3).join(", ")} have very narrow reach this year. Confirm this is intentional (a dedicated key account) rather than under-utilisation.` });
  const highReturn = ranked.filter((sm) => grossIn(sm, currentFy) > 0 && (returnsIn(sm, currentFy) / grossIn(sm, currentFy)) >= 0.15);
  if (highReturn.length > 0) alerts.push({ tone: "amber", title: `${highReturn.length} salesmen with return rate 15%+`, body: `${highReturn.slice(0, 3).join(", ")} have unusually high returns against their gross sales this year.` });
  if (alerts.length === 0) alerts.push({ tone: "blue", title: "Sales team stable", body: "No concentration or decline signals detected." });

  // ---- Leaderboard (all salesmen, sorted by magnitude — small team, no cap needed) ----
  const leaderboard = ranked.map((sm) => ({
    name: sm,
    role: roleOf(sm),
    value: Math.round(netIn(sm, currentFy)),
    sharePct: curTotal > 0 ? round1((netIn(sm, currentFy) / curTotal) * 100) : 0,
  }));

  // ---- MoM trend, top 5 salesmen (current FY) ----
  const top5 = ranked.slice(0, 5);
  const momTrend = {
    months: APR_TO_MAR,
    series: top5.map((sm) => ({ name: sm, values: monthlyIn(sm, currentFy).map((v) => Math.round(v)) })),
  };

  // ---- Customer coverage vs sales (current FY) ----
  const coverage = ranked
    .filter((sm) => netIn(sm, currentFy) > 0)
    .map((sm) => ({
      name: sm,
      customers: custIn(sm, currentFy),
      bills: billsIn(sm, currentFy),
      avgBill: billsIn(sm, currentFy) > 0 ? Math.round(grossIn(sm, currentFy) / billsIn(sm, currentFy)) : 0,
      skus: skusIn(sm, currentFy),
    }));

  // ---- 3yr trend (all FYs, all salesmen) ----
  const trend3yr = {
    fys: fyList,
    series: ranked.map((sm) => ({ name: sm, values: fyList.map((fy) => Math.round(netIn(sm, fy))) })),
  };

  // ---- Detail table ----
  const table = ranked.map((sm) => {
    const perFy = {}; for (const fy of fyList) perFy[fy] = Math.round(netIn(sm, fy));
    const cur = netIn(sm, currentFy), prev = prevFy ? netIn(sm, prevFy) : 0;
    const gross = grossIn(sm, currentFy);
    let trend = "Stable";
    if (prev > 0) { const dp = deltaPct(cur, prev); if (dp >= 10) trend = "Growing"; else if (dp <= -10) trend = "Declining"; }
    return {
      name: sm, role: roleOf(sm), perFy,
      sharePct: curTotal > 0 ? round1((cur / curTotal) * 100) : 0,
      yoyPct: prev > 0 ? deltaPct(cur, prev) : null,
      customers: custIn(sm, currentFy), bills: billsIn(sm, currentFy),
      avgBill: billsIn(sm, currentFy) > 0 ? Math.round(gross / billsIn(sm, currentFy)) : 0,
      returnPct: gross > 0 ? round1((returnsIn(sm, currentFy) / gross) * 100) : 0,
      skus: skusIn(sm, currentFy), trend,
    };
  });

  return {
    fy: currentFy, fyList, currentFy, prevFy, partialFys,
    kpis, alerts, leaderboard, momTrend, coverage, trend3yr, table,
    companyNetSales: Math.round(companyNetSales),
    dataNotes: [
      "Figures are NET sales per salesman (Sales less Sales Return), from the Sales and Sales Return registers' Salesman Name columns — both are fully populated in the source data.",
      "\"Avg Bill\" and \"return %\" in the detail table are based on gross Sales vouchers (a return is a separate voucher, not a discount on the original bill).",
      "Customers are not exclusive to one salesman — most parties are billed by several different salesmen across the year. \"Customers served\" is a reach count, not a territory assignment.",
      "No target/quota data exists in the source workbook, so there is no target-vs-achievement metric here.",
    ],
  };
}

function bigMoney(v) { const n = Math.round(num(v)); if (Math.abs(n) >= 1e7) return `₹${(n / 1e7).toFixed(1)} Cr`; if (Math.abs(n) >= 1e5) return `₹${(n / 1e5).toFixed(1)} L`; return `₹${n.toLocaleString("en-IN")}`; }

function emptyResult({ fy }) {
  return {
    fy, fyList: [], currentFy: fy, prevFy: null, partialFys: [],
    kpis: {
      teamNetSales: { cur: 0, prev: null, yoyPct: null }, activeSalesmen: { count: 0, total: 0 },
      topSalesman: null, avgPerSalesman: { cur: 0 }, customersReached: { cur: 0 }, declining: { count: 0, names: [] },
    },
    alerts: [], leaderboard: [], momTrend: { months: APR_TO_MAR, series: [] }, coverage: [],
    trend3yr: { fys: [], series: [] }, table: [], companyNetSales: 0, dataNotes: [],
  };
}
