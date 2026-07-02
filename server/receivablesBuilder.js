// Receivables Analysis — 3-year business-level receivables cockpit.
// Input: dashData = { itemFacts, ledgerFacts, accountMaster }
// Output: see buildReceivables JSDoc below.
//
// DATA HONESTY NOTE:
// Receipt vouchers are booked against bank account names (SBI SALAR, Cash, ICICI),
// NOT against party names. Therefore party-wise collection and party-wise DSO
// CANNOT be derived from this data. Only business-level totals are computed here.
// Party-wise aging buckets and settlement need the ledger-wise receipt report from Busy.
//
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

const APR_TO_MAR = ["Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar"];

// ---------------------------------------------------------------------------
// Opening balance extraction from accountMaster
// ---------------------------------------------------------------------------

function extractOpeningBalances(accountMaster) {
  // Debtors = accounts in a "Sundry Debtors" / receivable group only. We deliberately do
  // NOT fall back to "any account with a Dr opening balance", because that pulls in
  // Duties & Taxes, Stock-in-hand, and other asset ledgers and grossly overstates
  // receivables. "Cash" party is excluded.
  const debtors = [];
  let totalOpeningDr = 0;

  for (const acc of (accountMaster || [])) {
    const name = String(acc.name || "").trim();
    if (!name) continue;
    if (name.toLowerCase() === "cash") continue;

    const group = String(acc.group || "").toLowerCase();
    const openingDr = num(acc.openingDr);
    const openingCr = num(acc.openingCr);
    const netDr = openingDr - openingCr;

    const isDebtor = group.includes("debtor") || group.includes("receivable");
    if (!isDebtor) continue;

    debtors.push({ name, openingDr: Math.max(0, netDr) });
    totalOpeningDr += Math.max(0, netDr);
  }

  debtors.sort((a, b) => b.openingDr - a.openingDr);

  return {
    openingBalance: totalOpeningDr,
    openingDebtors: debtors.length,
    topOpeningDebtors: debtors.slice(0, 6),
  };
}

// ---------------------------------------------------------------------------
// Per-FY aggregation for sales (billed) and collections
// ---------------------------------------------------------------------------

function aggregateFySales(itemFacts, fy) {
  let grossSales = 0;
  let salesReturn = 0;
  const months = fiscalYearMonths(fy);
  const monthIndex = new Map(months.map((m, i) => [m, i]));
  const monthlySales = new Array(12).fill(0);
  const monthlyReturn = new Array(12).fill(0);

  for (const r of itemFacts) {
    if (r.fy !== fy || !r.isHeader) continue;
    const fa = num(r.finalAmount);
    if (r.tx === "Sales") {
      grossSales += fa;
      const mi = monthIndex.get(r.month);
      if (mi !== undefined) monthlySales[mi] += fa;
    } else if (r.tx === "Sales Return") {
      salesReturn += fa;
      const mi = monthIndex.get(r.month);
      if (mi !== undefined) monthlyReturn[mi] += fa;
    }
  }

  const netSales = grossSales - salesReturn;
  const monthlyNet = monthlySales.map((s, i) => s - monthlyReturn[i]);
  return { grossSales, salesReturn, netSales, monthlyNet };
}

function aggregateFyCollections(ledgerFacts, fy) {
  // Collections = Receipt voucher header-level debit amounts (business-level total)
  const months = fiscalYearMonths(fy);
  const monthIndex = new Map(months.map((m, i) => [m, i]));
  let total = 0;
  const monthly = new Array(12).fill(0);

  for (const r of ledgerFacts) {
    if (r.fy !== fy || r.tx !== "Receipt" || !r.isHeader) continue;
    // This receipt register is bank-centric: money received is the DEBIT on the bank
    // account (bank debited when cash comes in). Credit is blank on the header rows.
    const amount = num(r.debit);
    total += amount;
    const mi = monthIndex.get(r.month);
    if (mi !== undefined) monthly[mi] += amount;
  }

  return { total, monthly };
}

// ---------------------------------------------------------------------------
// Partial FY detection
// ---------------------------------------------------------------------------

function isPartialFy(fy, itemFacts, ledgerFacts) {
  // Considered partial if the FY has data in fewer than 6 distinct months
  const months = new Set();
  for (const r of itemFacts) {
    if (r.fy === fy && r.month) months.add(r.month);
  }
  for (const r of ledgerFacts) {
    if (r.fy === fy && r.month) months.add(r.month);
  }
  return months.size < 6;
}

// ---------------------------------------------------------------------------
// buildReceivables
// ---------------------------------------------------------------------------

/**
 * Build the 3-FY business-level receivables analytics object.
 *
 * @param {object} dashData  - { itemFacts, ledgerFacts, accountMaster }
 * @param {object} [options] - { fy?: string }
 * @returns {object}
 */
export function buildReceivables(dashData, options = {}) {
  const itemFacts    = Array.isArray(dashData?.itemFacts)    ? dashData.itemFacts    : [];
  const ledgerFacts  = Array.isArray(dashData?.ledgerFacts)  ? dashData.ledgerFacts  : [];
  const accountMaster = Array.isArray(dashData?.accountMaster) ? dashData.accountMaster : [];

  // ---- Opening balances from account master ----
  const { openingBalance, openingDebtors, topOpeningDebtors } = extractOpeningBalances(accountMaster);

  // ---- FY list ----
  const fySet = new Set();
  for (const r of itemFacts)   if (r.fy && (r.tx === "Sales" || r.tx === "Sales Return")) fySet.add(r.fy);
  for (const r of ledgerFacts) if (r.fy && r.tx === "Receipt") fySet.add(r.fy);

  const fyList = sortFys([...fySet]);

  if (fyList.length === 0) {
    return emptyResult({ fy: options.fy || null, fyList: [], openingBalance, openingDebtors, topOpeningDebtors });
  }

  // ---- Partial FY analysis ----
  const { partialFys, latestCompleteFy } = analyzeFys(itemFacts, ledgerFacts);
  const currentFy = resolveCurrentFy(options.fy, fyList, latestCompleteFy);
  const curIdx    = fyList.indexOf(currentFy);
  const prevFy    = curIdx >= 1 ? fyList[curIdx - 1] : null;

  // ---- Per-FY aggregation ----
  const salesByFy = {};
  const collByFy  = {};

  for (const fy of fyList) {
    salesByFy[fy] = aggregateFySales(itemFacts, fy);
    collByFy[fy]  = aggregateFyCollections(ledgerFacts, fy);
  }

  // ---- Outstanding by FY (running, starting from opening balance) ----
  // outstanding_end(FY) = opening + sum(sales-collections) through that FY
  const outstandingByFy = [];
  let runningOutstanding = openingBalance;

  for (const fy of fyList) {
    const sales = salesByFy[fy].netSales;
    const coll  = collByFy[fy].total;
    runningOutstanding += (sales - coll);
    if (runningOutstanding < 0) runningOutstanding = 0;
    outstandingByFy.push({ fy, outstanding: Math.round(runningOutstanding) });
  }

  const totalOutstanding = outstandingByFy.length > 0
    ? outstandingByFy[outstandingByFy.length - 1].outstanding
    : openingBalance;

  // ---- DSO by FY ----
  // DSO = outstanding_end / (salesBilled / 365) — business-level approximation
  const dsoByFy = outstandingByFy.map(({ fy, outstanding }) => {
    const sales = salesByFy[fy]?.netSales || 0;
    const dso = sales > 0 ? roundInt((outstanding / (sales / 365))) : null;
    return { fy, dso };
  });

  // ---- Collection rate by FY ----
  const collectionRateByFy = fyList.map((fy) => {
    const sales = salesByFy[fy]?.netSales || 0;
    const coll  = collByFy[fy]?.total     || 0;
    const rate  = sales > 0 ? round1((coll / sales) * 100) : null;
    return { fy, rate, salesBilled: sales, collections: coll };
  });

  // ---- KPIs ----
  const curSales = salesByFy[currentFy]?.netSales || 0;
  const curColl  = collByFy[currentFy]?.total     || 0;
  const curRate  = curSales > 0 ? round1((curColl / curSales) * 100) : null;
  const curOutstanding = outstandingByFy.find((o) => o.fy === currentFy)?.outstanding || 0;
  const curDso = dsoByFy.find((d) => d.fy === currentFy)?.dso || null;

  // For "actual" collection rate, prefer the first complete FY (if any)
  const firstCompleteFy = fyList.find((fy) => !isPartialFy(fy, itemFacts, ledgerFacts)) || fyList[0];
  const completeFyRate = collectionRateByFy.find((c) => c.fy === firstCompleteFy);

  let prevOutstanding = null;
  let prevRate = null;
  let prevDso = null;
  if (prevFy) {
    prevOutstanding = outstandingByFy.find((o) => o.fy === prevFy)?.outstanding || null;
    prevRate  = collectionRateByFy.find((c) => c.fy === prevFy)?.rate || null;
    prevDso   = dsoByFy.find((d) => d.fy === prevFy)?.dso || null;
  }

  const kpis = {
    totalOutstanding:  { value: totalOutstanding,    prev: prevOutstanding },
    dso:               { value: curDso,              prev: prevDso },
    collectionRate:    { value: curRate,             prev: prevRate, completeFy: firstCompleteFy, completeFyRate: completeFyRate?.rate || null },
    openingBalance:    { value: openingBalance,      openingDebtors },
    collections:       { value: curColl,             prev: prevFy ? (collByFy[prevFy]?.total || 0) : null },
    salesBilled:       { value: curSales,            prev: prevFy ? (salesByFy[prevFy]?.netSales || 0) : null },
  };

  // ---- Sales vs Collections MoM (use currentFy or latestFy with data) ----
  const momFy = currentFy;
  const momSales = salesByFy[momFy]?.monthlyNet || new Array(12).fill(0);
  const momColl  = collByFy[momFy]?.monthly     || new Array(12).fill(0);

  // Running outstanding MoM within the FY, starting from previous-FY outstanding (or opening if first FY)
  const prevFyOutstanding = prevFy
    ? (outstandingByFy.find((o) => o.fy === prevFy)?.outstanding || 0)
    : openingBalance;

  const runningOutstandingMoM = [];
  let runMoM = prevFyOutstanding;
  for (let i = 0; i < 12; i++) {
    runMoM += (momSales[i] - momColl[i]);
    if (runMoM < 0) runMoM = 0;
    runningOutstandingMoM.push(Math.round(runMoM));
  }

  const salesVsCollMoM = {
    fy:      momFy,
    months:  APR_TO_MAR,
    sales:   momSales,
    collections: momColl,
    runningOutstanding: runningOutstandingMoM,
  };

  // ---- Collection rate MoM (same FY) ----
  const collectionRateMoM = {
    fy:     momFy,
    months: APR_TO_MAR,
    rates:  momSales.map((s, i) => s > 0 ? round1((momColl[i] / s) * 100) : null),
  };

  // ---- Alerts ----
  const alerts = [];

  // DSO trend alert
  if (dsoByFy.length >= 2) {
    const last2 = dsoByFy.slice(-2);
    if (last2[0].dso != null && last2[1].dso != null && last2[1].dso > last2[0].dso) {
      alerts.push({
        tone: "amber",
        title: "DSO rising",
        detail: `${last2[0].fy.replace("FY ", "")}: ${last2[0].dso} days → ${last2[1].fy.replace("FY ", "")}: ${last2[1].dso} days`,
      });
    }
  }

  // Weak collection month (any month in current FY where rate < 70%)
  const weakMonths = collectionRateMoM.rates
    .map((r, i) => (r != null && r < 70 ? APR_TO_MAR[i] : null))
    .filter(Boolean);
  if (weakMonths.length > 0) {
    alerts.push({
      tone: "amber",
      title: `Weak collection months in ${momFy.replace("FY ", "")}`,
      detail: weakMonths.join(", "),
    });
  }

  // Overall collection rate concern
  if (curRate != null && curRate < 80) {
    alerts.push({
      tone: "red",
      title: "Collection rate below 80%",
      detail: `Current ${currentFy.replace("FY ", "")}: ${curRate}%`,
    });
  } else if (curRate != null && curRate >= 95) {
    alerts.push({
      tone: "green",
      title: "Strong collection rate",
      detail: `${curRate}% in ${currentFy.replace("FY ", "")}`,
    });
  }

  // Partial FY notice (local detection uses 6-month threshold for data notes)
  const localPartialFys = fyList.filter((fy) => isPartialFy(fy, itemFacts, ledgerFacts));
  if (localPartialFys.length > 0) {
    alerts.push({
      tone: "blue",
      title: `Partial year data: ${localPartialFys.join(", ")}`,
      detail: "Figures for partial years reflect transactions loaded so far.",
    });
  }

  // ---- Data notes (honesty layer) ----
  const dataNotes = [
    "Party-wise collection cannot be computed: Receipt vouchers are booked against bank account names (SBI SALAR, Cash, ICICI), not party names. To get party-wise settlement, export the ledger-wise receipt report from Busy.",
    "Aging buckets (0-30, 31-60, 61-90, 90+ days) require invoice-level settlement data not available in the current export. Export the outstanding ledger report from Busy.",
    localPartialFys.length > 0
      ? `${localPartialFys.join(", ")} ${localPartialFys.length === 1 ? "is" : "are"} partial (fewer than 6 months of data loaded). All figures for these years are incomplete.`
      : null,
    "Opening balance is extracted from the Account Master (Opening Bal. Dr column). This reflects the balance at the start of the first loaded FY, not necessarily April 1 of the current year.",
    "DSO and collection rate are business-level approximations: total outstanding divided by annualised net sales. They cannot be computed per party without the ledger-wise report.",
  ].filter(Boolean);

  return {
    fy: currentFy,
    fyList,
    currentFy,
    partialFys,
    prevFy,
    kpis,
    openingBalance,
    openingDebtors,
    topOpeningDebtors,
    salesVsCollMoM,
    collectionRateMoM,
    dsoByFy,
    collectionRateByFy,
    outstandingByFy,
    totalOutstanding,
    alerts,
    dataNotes,
    partyWiseAvailable: false,
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function emptyResult({ fy, fyList, openingBalance, openingDebtors, topOpeningDebtors }) {
  return {
    fy,
    fyList,
    currentFy: fy,
    prevFy: null,
    kpis: {
      totalOutstanding:  { value: 0, prev: null },
      dso:               { value: null, prev: null },
      collectionRate:    { value: null, prev: null, completeFy: null, completeFyRate: null },
      openingBalance:    { value: openingBalance, openingDebtors },
      collections:       { value: 0, prev: null },
      salesBilled:       { value: 0, prev: null },
    },
    openingBalance,
    openingDebtors,
    topOpeningDebtors,
    salesVsCollMoM: { fy, months: APR_TO_MAR, sales: new Array(12).fill(0), collections: new Array(12).fill(0), runningOutstanding: new Array(12).fill(0) },
    collectionRateMoM: { fy, months: APR_TO_MAR, rates: new Array(12).fill(null) },
    dsoByFy: [],
    collectionRateByFy: [],
    outstandingByFy: [],
    totalOutstanding: openingBalance,
    alerts: [],
    dataNotes: [],
    partyWiseAvailable: false,
  };
}
