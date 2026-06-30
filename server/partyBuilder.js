// Party Analysis — per-customer cockpit analytics.
// Input: dashData = { itemFacts, ledgerFacts, itemMaster }
// Output: see buildPartyAnalysis JSDoc below.
// No HTTP, no React, no new dependencies — pure ESM.

const num = (v) => Number(v) || 0;
const round1 = (v) => Math.round(v * 10) / 10;

// ---------------------------------------------------------------------------
// FY helpers (same as ceoBuilder.js)
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
// buildPartyAnalysis
// ---------------------------------------------------------------------------

/**
 * Build the party/customer cockpit analytics object.
 *
 * @param {object} dashData  - { itemFacts, ledgerFacts, itemMaster }
 * @param {object} [options] - { fy?: string }
 * @returns {object}
 */
export function buildPartyAnalysis(dashData, options = {}) {
  const allItemFacts   = Array.isArray(dashData?.itemFacts)   ? dashData.itemFacts   : [];
  const allLedgerFacts = Array.isArray(dashData?.ledgerFacts) ? dashData.ledgerFacts : [];

  // ---- FY list ----
  const fySet = new Set();
  for (const r of allItemFacts)   if (r.fy) fySet.add(r.fy);
  for (const r of allLedgerFacts) if (r.fy) fySet.add(r.fy);
  const fyList = sortFys([...fySet]);

  if (fyList.length === 0) {
    return emptyResult({ fy: options.fy || null, fyList: [] });
  }

  const latestFy = fyList[fyList.length - 1];
  const fy = (options.fy && fyList.includes(options.fy)) ? options.fy : latestFy;

  // ---- Filter to selected FY ----
  const itemFacts   = allItemFacts.filter(r => r.fy === fy);
  const ledgerFacts = allLedgerFacts.filter(r => r.fy === fy);

  // ---- FY month index (Apr=0 … Mar=11) ----
  const fyMonths = fiscalYearMonths(fy);
  const monthIndex = new Map(fyMonths.map((m, i) => [m, i]));

  // ---- Reference "as-of" date: max bill date across all Sales in this FY ----
  let maxBillTs = 0;
  for (const r of itemFacts) {
    if (r.tx === "Sales" && r.isHeader && r.date) {
      const ts = new Date(r.date).getTime();
      if (!isNaN(ts) && ts > maxBillTs) maxBillTs = ts;
    }
  }
  const asOfDate = maxBillTs ? new Date(maxBillTs).toISOString().slice(0, 10) : null;

  // ---- Per-customer aggregation ----
  // Key: customer name (Cash excluded below)
  const custMap = new Map();

  function getCust(name) {
    if (!custMap.has(name)) {
      custMap.set(name, {
        name,
        grossSales: 0,
        returns: 0,
        bills: 0,
        months: new Set(),
        dates: [],       // date strings of Sales header rows
        receipts: 0,
        monthly: new Array(12).fill(0), // Apr..Mar net contribution
      });
    }
    return custMap.get(name);
  }

  for (const r of itemFacts) {
    const party = r.party || "Unknown";
    // Exclude "Cash" (case-insensitive) — walk-in noise
    if (party.toLowerCase() === "cash") continue;

    if (r.tx === "Sales") {
      if (r.isHeader) {
        const c = getCust(party);
        const fa = num(r.finalAmount);
        c.grossSales += fa;
        c.bills++;
        if (r.date) {
          c.months.add(r.month);
          c.dates.push(r.date);
        }
        const mi = monthIndex.get(r.month);
        if (mi !== undefined) c.monthly[mi] += fa;
      }
    } else if (r.tx === "Sales Return") {
      const c = getCust(party);
      // Use finalAmount on header rows if present, fall back to any row amount
      if (r.isHeader) {
        const fa = num(r.finalAmount);
        c.returns += fa;
        const mi = monthIndex.get(r.month);
        if (mi !== undefined) c.monthly[mi] -= fa;
      }
    }
  }

  // ---- Receipt aggregation (credit side of Receipt vouchers) ----
  for (const r of ledgerFacts) {
    if (r.tx === "Receipt" && r.account && custMap.has(r.account)) {
      custMap.get(r.account).receipts += num(r.credit);
    }
  }

  // ---- daysSilent helper ----
  function daysSilent(dates) {
    if (!dates.length || !maxBillTs) return 9999;
    const lastTs = Math.max(...dates.map(d => new Date(d).getTime()).filter(t => !isNaN(t)));
    if (!lastTs) return 9999;
    return Math.floor((maxBillTs - lastTs) / 86400000);
  }

  // ---- Segment assignment ----
  function segment(monthsActive) {
    if (monthsActive >= 10) return { key: "regular",    label: "Regular" };
    if (monthsActive >= 6)  return { key: "active",     label: "Active" };
    if (monthsActive >= 3)  return { key: "occasional", label: "Occasional" };
    return                         { key: "lost",        label: "One-time/Lost" };
  }

  // ---- Build customer records ----
  const customers = [...custMap.values()].map(c => {
    const netSales     = c.grossSales - c.returns;
    const returnPct    = c.grossSales > 0 ? round1((c.returns / c.grossSales) * 100) : 0;
    const bills        = c.bills;
    const avgBill      = bills > 0 ? netSales / bills : 0;
    const monthsActive = c.months.size;
    const lastDates    = c.dates;
    const lastOrderDate = lastDates.length
      ? new Date(Math.max(...lastDates.map(d => new Date(d).getTime()))).toISOString().slice(0, 10)
      : null;
    const ds           = daysSilent(lastDates);
    const silent       = ds > 90;
    const seg          = segment(monthsActive);
    const status       = silent ? `Silent ${ds}d` : seg.label;

    return {
      name: c.name,
      netSales,
      returns: c.returns,
      returnPct,
      bills,
      avgBill,
      monthsActive,
      lastOrder: lastOrderDate,
      daysSilent: ds,
      receipts: c.receipts,
      segment: seg.label,
      segmentKey: seg.key,
      silent,
      status,
      monthly: c.monthly,
    };
  }).filter(c => c.netSales > 0 || c.bills > 0);

  // ---- KPIs ----
  const tradeCustomers = customers.length;
  const netSalesTrade  = customers.reduce((s, c) => s + c.netSales, 0);
  const totalBills     = customers.reduce((s, c) => s + c.bills, 0);
  const avgBillValue   = totalBills > 0 ? netSalesTrade / totalBills : 0;
  const regularBuyers  = customers.filter(c => c.segmentKey === "regular").length;
  const silentParties  = customers.filter(c => c.silent).length;

  // ---- Segment distribution ----
  const segDefs = [
    { key: "regular",    label: "Regular",       color: "#12b76a" },
    { key: "active",     label: "Active",         color: "#2563eb" },
    { key: "occasional", label: "Occasional",     color: "#d97706" },
    { key: "lost",       label: "One-time/Lost",  color: "#ef4444" },
  ];
  const segments = segDefs.map(({ key, label, color }) => {
    const count = customers.filter(c => c.segmentKey === key).length;
    const pct   = tradeCustomers > 0 ? round1((count / tradeCustomers) * 100) : 0;
    return { key, label, color, count, pct };
  });

  // ---- Sorted customer arrays ----
  const byNetSales = [...customers].sort((a, b) => b.netSales - a.netSales);

  // ---- Silent high-value alert (top 6 by netSales among silent) ----
  const silentAlert = customers
    .filter(c => c.silent)
    .sort((a, b) => b.netSales - a.netSales)
    .slice(0, 6)
    .map(c => ({ name: c.name, netSales: c.netSales, lastOrder: c.lastOrder, daysSilent: c.daysSilent }));

  // ---- Top by frequency (bills) ----
  const topByFrequency = [...customers]
    .sort((a, b) => b.bills - a.bills)
    .slice(0, 6)
    .map(c => ({ name: c.name, bills: c.bills }));

  // ---- Top by avg bill (min 1 bill) ----
  const topByAvgBill = customers
    .filter(c => c.bills >= 1)
    .sort((a, b) => b.avgBill - a.avgBill)
    .slice(0, 6)
    .map(c => ({ name: c.name, avgBill: c.avgBill, monthsActive: c.monthsActive }));

  // ---- Net sales ranking (top 10) ----
  const netSalesRanking = byNetSales.slice(0, 10).map(c => ({
    name: c.name,
    netSales: c.netSales,
    returnPct: c.returnPct,
  }));

  // ---- MoM top-4 trend ----
  const top4 = byNetSales.slice(0, 4);
  const momTop4 = {
    months: APR_TO_MAR,
    series: top4.map(c => ({
      name: c.name,
      values: c.monthly.map(v => Math.round(v)),
    })),
  };

  // ---- Full table (all trade customers, sorted by netSales desc) ----
  const table = byNetSales.map(c => ({
    name: c.name,
    netSales: Math.round(c.netSales),
    returns: Math.round(c.returns),
    returnPct: c.returnPct,
    bills: c.bills,
    avgBill: Math.round(c.avgBill),
    monthsActive: c.monthsActive,
    lastOrder: c.lastOrder,
    daysSilent: c.daysSilent,
    segment: c.segment,
    status: c.status,
  }));

  return {
    fy,
    fyList,
    asOfDate,
    kpis: {
      tradeCustomers,
      netSalesTrade: Math.round(netSalesTrade),
      avgBillValue:  Math.round(avgBillValue),
      regularBuyers,
      silentParties,
    },
    segments,
    silentAlert,
    topByFrequency,
    topByAvgBill,
    netSalesRanking,
    momTop4,
    table,
  };
}

function emptyResult({ fy, fyList }) {
  return {
    fy,
    fyList,
    asOfDate: null,
    kpis: { tradeCustomers: 0, netSalesTrade: 0, avgBillValue: 0, regularBuyers: 0, silentParties: 0 },
    segments: [],
    silentAlert: [],
    topByFrequency: [],
    topByAvgBill: [],
    netSalesRanking: [],
    momTop4: { months: [], series: [] },
    table: [],
  };
}
