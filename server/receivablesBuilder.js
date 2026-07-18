// Receivables Analysis — 3-year party-level receivables cockpit.
// Input: dashData = { itemFacts, ledgerFacts, accountMaster }
// Output: see buildReceivables JSDoc below.
//
// DATA MODEL NOTES (confirmed against MLH_Master_Data_FY2024-27.xlsx):
//
// 1. Debtor accounts are NOT limited to the "Sundry Debtors" group. Busy reclassifies
//    parties into zone groups (SURI, ZONE-1..ZONE-6, JHARKHAND, plus the smaller BIHAR /
//    ODISHA / Burdwan regional groups) over time — the same physical customer can carry
//    "Sundry Debtors" in the FY2024-25 Account Master block and a zone group in later
//    blocks. DEBTOR_GROUP_PATTERNS below is deliberately a configurable list, not a
//    single hardcoded string, so new zones/regions can be added without code changes.
//
// 2. Receipt vouchers are booked bank-centric (header row = bank account debited), but
//    every voucher carries a second, non-header contra row crediting the actual party
//    account. Party-wise collection IS derivable from that contra row — the previous
//    implementation only read the header row and treated collections as a pure
//    business-level bank total, never touching the party.
//
// 3. The Account Master export repeats the full account roster once per financial year
//    ("block" per FY), so accountMaster can contain 2-3 rows per name. Only the earliest
//    block reliably carries a non-blank opening balance; later blocks reuse the name with
//    an updated Group Name (reclassification) and a blank opening. dashboardBuilder.js now
//    tags each row with `fy` so we can pick the earliest block for opening balance and the
//    latest block for the party's current group instead of guessing from row order.
//
// Ageing is a FIFO approximation: Busy's export does not link a specific receipt/return/
// note to a specific invoice, so outstanding invoices are aged by matching each party's
// credits (returns, credit notes, receipts) against their oldest open debits (sales,
// debit notes) in date order. This is the best available approximation without an
// invoice-level settlement report from Busy.
//
// No HTTP, no React, no new dependencies — pure ESM.

import { analyzeFys, resolveCurrentFy } from "./fyUtil.js";

const num = (v) => Number(v) || 0;
const round1 = (v) => Math.round(v * 10) / 10;
const roundInt = (v) => Math.round(v);

// ---------------------------------------------------------------------------
// Configurable debtor-group recognition
// ---------------------------------------------------------------------------

// Substring match (case-insensitive) against Account Master "Group Name". Add new
// zones/regions here as the business creates them — no other code changes needed.
export const DEBTOR_GROUP_PATTERNS = [
  "sundry debtors",
  "receivable",
  "suri",
  "jharkhand",
  "bihar",
  "odisha",
  "burdwan",
  "zone-",
];

export function isDebtorGroup(group) {
  const g = String(group || "").trim().toLowerCase();
  if (!g) return false;
  return DEBTOR_GROUP_PATTERNS.some((pattern) => g.includes(pattern));
}

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

function fyStartDate(fy) {
  const match = String(fy || "").match(/FY\s*(\d{4})\s*-\s*(\d{2})/i);
  if (!match) return "1900-01-01";
  return `${match[1]}-04-01`;
}

function sortFys(fyArray) {
  return [...fyArray].sort((a, b) => {
    const ay = Number((a.match(/FY\s*(\d{4})/) || [])[1] || 0);
    const by = Number((b.match(/FY\s*(\d{4})/) || [])[1] || 0);
    return ay - by;
  });
}

function daysBetween(fromIso, toIso) {
  const from = Date.parse(fromIso);
  const to = Date.parse(toIso);
  if (Number.isNaN(from) || Number.isNaN(to)) return 0;
  return Math.max(0, Math.round((to - from) / 86400000));
}

const APR_TO_MAR = ["Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar"];

// ---------------------------------------------------------------------------
// Debtor account index (dedupe accountMaster's per-FY blocks by name)
// ---------------------------------------------------------------------------

function buildDebtorAccountIndex(accountMaster) {
  const byName = new Map();
  for (const acc of accountMaster || []) {
    const name = String(acc?.name || "").trim();
    if (!name || name.toLowerCase() === "cash") continue;
    const fy = String(acc?.fy || "").trim();
    const group = String(acc?.group || "").trim();
    const dr = num(acc?.openingDr);
    const cr = num(acc?.openingCr);

    let entry = byName.get(name);
    if (!entry) {
      entry = { name, everDebtor: false, earliestFy: fy, openingDr: dr, openingCr: cr, latestFy: fy, group };
      byName.set(name, entry);
    } else {
      // Earliest block (smallest FY string, e.g. "FY 2024-25" < "FY 2025-26") carries
      // the real opening balance; later blocks leave it blank. Fall back to first-seen
      // when fy is unavailable (older fixtures / no FY tag).
      if (fy && (!entry.earliestFy || fy < entry.earliestFy)) {
        entry.earliestFy = fy;
        entry.openingDr = dr;
        entry.openingCr = cr;
      }
      // Latest block reflects the party's current classification.
      if (!fy || !entry.latestFy || fy >= entry.latestFy) {
        entry.latestFy = fy || entry.latestFy;
        entry.group = group || entry.group;
      }
    }
    if (isDebtorGroup(group)) entry.everDebtor = true;
  }
  return byName;
}

// ---------------------------------------------------------------------------
// Per-party per-FY billing/collection deltas (debtor-scoped)
// ---------------------------------------------------------------------------

function buildPartyFyDeltas(itemFacts, ledgerFacts) {
  const map = new Map(); // party -> Map<fy, { netBilled, receipts }>
  const ensure = (party, fy) => {
    if (!map.has(party)) map.set(party, new Map());
    const m = map.get(party);
    if (!m.has(fy)) m.set(fy, { netBilled: 0, receipts: 0 });
    return m.get(fy);
  };

  for (const r of itemFacts || []) {
    if (!r.isHeader || !isDebtorGroup(r.accountGroup)) continue;
    const party = String(r.party || "").trim();
    if (!party || party.toLowerCase() === "cash") continue;
    const fa = num(r.finalAmount);
    if (r.tx === "Sales") ensure(party, r.fy).netBilled += fa;
    else if (r.tx === "Sales Return") ensure(party, r.fy).netBilled -= fa;
  }

  for (const r of ledgerFacts || []) {
    const party = String(r.account || "").trim();
    if (!party || party.toLowerCase() === "cash") continue;
    if (r.tx === "Debit Note" && r.isHeader && isDebtorGroup(r.accountGroup)) {
      ensure(party, r.fy).netBilled += num(r.businessAmount);
    } else if (r.tx === "Credit Note" && r.isHeader && isDebtorGroup(r.accountGroup)) {
      ensure(party, r.fy).netBilled -= num(r.businessAmount);
    } else if (r.tx === "Receipt" && !r.isHeader && isDebtorGroup(r.accountGroup)) {
      // Non-header Receipt row = the contra line crediting the party's account.
      ensure(party, r.fy).receipts += num(r.credit);
    }
  }

  return map;
}

// ---------------------------------------------------------------------------
// Debtor-scoped business-wide FY flows (for DSO / collection rate / MoM charts)
// ---------------------------------------------------------------------------

function aggregateDebtorFyFlows(itemFacts, ledgerFacts, fy) {
  const months = fiscalYearMonths(fy);
  const monthIndex = new Map(months.map((m, i) => [m, i]));

  let salesGross = 0, salesReturn = 0, drNote = 0, crNote = 0, receipts = 0;
  const monthlySales = new Array(12).fill(0);
  const monthlyReturn = new Array(12).fill(0);
  const monthlyDrNote = new Array(12).fill(0);
  const monthlyCrNote = new Array(12).fill(0);
  const monthlyReceipts = new Array(12).fill(0);

  for (const r of itemFacts || []) {
    if (r.fy !== fy || !r.isHeader || !isDebtorGroup(r.accountGroup)) continue;
    const fa = num(r.finalAmount);
    const mi = monthIndex.get(r.month);
    if (r.tx === "Sales") {
      salesGross += fa;
      if (mi !== undefined) monthlySales[mi] += fa;
    } else if (r.tx === "Sales Return") {
      salesReturn += fa;
      if (mi !== undefined) monthlyReturn[mi] += fa;
    }
  }

  for (const r of ledgerFacts || []) {
    if (r.fy !== fy) continue;
    const mi = monthIndex.get(r.month);
    if (r.tx === "Debit Note" && r.isHeader && isDebtorGroup(r.accountGroup)) {
      const amt = num(r.businessAmount);
      drNote += amt;
      if (mi !== undefined) monthlyDrNote[mi] += amt;
    } else if (r.tx === "Credit Note" && r.isHeader && isDebtorGroup(r.accountGroup)) {
      const amt = num(r.businessAmount);
      crNote += amt;
      if (mi !== undefined) monthlyCrNote[mi] += amt;
    } else if (r.tx === "Receipt" && !r.isHeader && isDebtorGroup(r.accountGroup)) {
      const amt = num(r.credit);
      receipts += amt;
      if (mi !== undefined) monthlyReceipts[mi] += amt;
    }
  }

  const netBilled = salesGross + drNote - salesReturn - crNote;
  const monthlyNetBilled = monthlySales.map((s, i) => s + monthlyDrNote[i] - monthlyReturn[i] - monthlyCrNote[i]);

  return { salesGross, salesReturn, drNote, crNote, receipts, netBilled, monthlyNetBilled, monthlyReceipts };
}

// ---------------------------------------------------------------------------
// Unallocated-receipt diagnostic (audit trail for the receipt->party allocation)
// ---------------------------------------------------------------------------

function auditReceiptAllocation(ledgerFacts) {
  let totalVouchers = 0, allocatedAmount = 0, unallocatedAmount = 0, unallocatedVouchers = 0;
  for (const r of ledgerFacts || []) {
    if (r.tx !== "Receipt") continue;
    if (r.isHeader) totalVouchers += 1;
    else {
      const amt = num(r.credit);
      if (isDebtorGroup(r.accountGroup)) allocatedAmount += amt;
      else { unallocatedAmount += amt; unallocatedVouchers += 1; }
    }
  }
  return { totalVouchers, allocatedAmount: roundInt(allocatedAmount), unallocatedAmount: roundInt(unallocatedAmount), unallocatedVouchers };
}

// ---------------------------------------------------------------------------
// FIFO ageing
// ---------------------------------------------------------------------------

function fifoAge(sortedEvents, asOfDate) {
  const openInvoices = [];
  let creditPool = 0;

  for (const e of sortedEvents) {
    if (e.kind === "debit") {
      let amt = e.amount;
      if (creditPool > 0 && amt > 0) {
        const consume = Math.min(creditPool, amt);
        creditPool -= consume;
        amt -= consume;
      }
      if (amt > 1e-6) openInvoices.push({ date: e.date, remaining: amt });
    } else {
      let amt = e.amount;
      let idx = 0;
      while (amt > 1e-6 && idx < openInvoices.length) {
        const inv = openInvoices[idx];
        const consume = Math.min(inv.remaining, amt);
        inv.remaining -= consume;
        amt -= consume;
        idx += 1;
      }
      while (openInvoices.length && openInvoices[0].remaining <= 1e-6) openInvoices.shift();
      if (amt > 1e-6) creditPool += amt;
    }
  }

  const buckets = { current: 0, d31_60: 0, d61_90: 0, d90plus: 0 };
  let totalOpen = 0;
  let oldestAgeDays = 0;
  for (const inv of openInvoices) {
    if (inv.remaining <= 1e-6) continue;
    const days = daysBetween(inv.date, asOfDate);
    totalOpen += inv.remaining;
    oldestAgeDays = Math.max(oldestAgeDays, days);
    if (days <= 30) buckets.current += inv.remaining;
    else if (days <= 60) buckets.d31_60 += inv.remaining;
    else if (days <= 90) buckets.d61_90 += inv.remaining;
    else buckets.d90plus += inv.remaining;
  }

  return { buckets, totalOpen, creditPool, openInvoiceCount: openInvoices.length, oldestAgeDays };
}

function buildPartyEvents(itemFacts, ledgerFacts, allowedFys) {
  const events = new Map(); // party -> [{date, amount, kind, fy}]
  const push = (party, date, amount, kind, fy) => {
    const name = String(party || "").trim();
    if (!name || name.toLowerCase() === "cash" || !amount || !allowedFys.has(fy)) return;
    if (!events.has(name)) events.set(name, []);
    events.get(name).push({ date: date || "9999-99-99", amount, kind });
  };

  for (const r of itemFacts || []) {
    if (!r.isHeader || !isDebtorGroup(r.accountGroup)) continue;
    if (r.tx === "Sales") push(r.party, r.date, num(r.finalAmount), "debit", r.fy);
    else if (r.tx === "Sales Return") push(r.party, r.date, num(r.finalAmount), "credit", r.fy);
  }
  for (const r of ledgerFacts || []) {
    if (r.tx === "Debit Note" && r.isHeader && isDebtorGroup(r.accountGroup)) {
      push(r.account, r.date, num(r.businessAmount), "debit", r.fy);
    } else if (r.tx === "Credit Note" && r.isHeader && isDebtorGroup(r.accountGroup)) {
      push(r.account, r.date, num(r.businessAmount), "credit", r.fy);
    } else if (r.tx === "Receipt" && !r.isHeader && isDebtorGroup(r.accountGroup)) {
      push(r.account, r.date, num(r.credit), "credit", r.fy);
    }
  }

  for (const list of events.values()) list.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return events;
}

// ---------------------------------------------------------------------------
// Partial FY detection
// ---------------------------------------------------------------------------

function isPartialFy(fy, itemFacts, ledgerFacts) {
  const months = new Set();
  for (const r of itemFacts || []) if (r.fy === fy && r.month) months.add(r.month);
  for (const r of ledgerFacts || []) if (r.fy === fy && r.month) months.add(r.month);
  return months.size < 6;
}

// ---------------------------------------------------------------------------
// buildReceivables
// ---------------------------------------------------------------------------

/**
 * Build the 3-FY party-level receivables analytics object.
 *
 * @param {object} dashData  - { itemFacts, ledgerFacts, accountMaster }
 * @param {object} [options] - { fy?: string }
 * @returns {object}
 */
export function buildReceivables(dashData, options = {}) {
  const itemFacts     = Array.isArray(dashData?.itemFacts)     ? dashData.itemFacts     : [];
  const ledgerFacts   = Array.isArray(dashData?.ledgerFacts)   ? dashData.ledgerFacts   : [];
  const accountMaster = Array.isArray(dashData?.accountMaster) ? dashData.accountMaster : [];

  // ---- Debtor account index + opening balances ----
  const debtorIndex = buildDebtorAccountIndex(accountMaster);
  let openingBalance = 0;
  let openingDebtors = 0;
  const topOpeningDebtors = [];
  for (const [name, e] of debtorIndex) {
    if (!e.everDebtor) continue;
    openingDebtors += 1;
    const netDr = Math.max(0, e.openingDr - e.openingCr);
    openingBalance += netDr;
    if (netDr > 0) topOpeningDebtors.push({ name, openingDr: netDr, group: e.group });
  }
  topOpeningDebtors.sort((a, b) => b.openingDr - a.openingDr);
  const topOpeningDebtorsOut = topOpeningDebtors.slice(0, 6);

  // ---- FY list (Sales/Sales Return/Receipt/DrNote/CrNote) ----
  const fySet = new Set();
  for (const r of itemFacts) if (r.fy && (r.tx === "Sales" || r.tx === "Sales Return")) fySet.add(r.fy);
  for (const r of ledgerFacts) if (r.fy && (r.tx === "Receipt" || r.tx === "Debit Note" || r.tx === "Credit Note")) fySet.add(r.fy);
  const fyList = sortFys([...fySet]);

  if (fyList.length === 0) {
    return emptyResult({ fy: options.fy || null, fyList: [], openingBalance, openingDebtors, topOpeningDebtors: topOpeningDebtorsOut });
  }

  // ---- Partial FY analysis ----
  const { partialFys, latestCompleteFy } = analyzeFys(itemFacts, ledgerFacts);
  const currentFy = resolveCurrentFy(options.fy, fyList, latestCompleteFy);
  const curIdx    = fyList.indexOf(currentFy);
  const prevFy    = curIdx >= 1 ? fyList[curIdx - 1] : null;
  const allowedFysForCurrent = new Set(fyList.slice(0, curIdx + 1));

  // ---- Debtor-scoped FY flows (business-wide, for DSO / rate / MoM) ----
  const flowsByFy = {};
  for (const fy of fyList) flowsByFy[fy] = aggregateDebtorFyFlows(itemFacts, ledgerFacts, fy);

  // ---- Per-party per-FY deltas -> cumulative outstanding per FY ----
  const partyOpening = new Map();
  for (const [name, e] of debtorIndex) if (e.everDebtor) partyOpening.set(name, Math.max(0, e.openingDr - e.openingCr));

  const partyFyDeltas = buildPartyFyDeltas(itemFacts, ledgerFacts);
  const allPartyNames = new Set([...partyOpening.keys(), ...partyFyDeltas.keys()]);

  const partyCumulative = new Map(); // party -> Map<fy, rawCumulative>
  for (const party of allPartyNames) {
    let running = partyOpening.get(party) || 0;
    const perFy = new Map();
    const deltas = partyFyDeltas.get(party);
    for (const fy of fyList) {
      const d = deltas?.get(fy);
      if (d) running += (d.netBilled - d.receipts);
      perFy.set(fy, running);
    }
    partyCumulative.set(party, perFy);
  }

  // ---- outstandingByFy: sum of per-party floored balances (reconciles with topDebtors) ----
  const outstandingByFy = fyList.map((fy) => {
    let total = 0;
    for (const party of allPartyNames) total += Math.max(0, partyCumulative.get(party).get(fy) || 0);
    return { fy, outstanding: Math.round(total) };
  });

  const totalOutstanding = outstandingByFy.find((o) => o.fy === currentFy)?.outstanding
    ?? (outstandingByFy[outstandingByFy.length - 1]?.outstanding || 0);

  // ---- Top debtors as of currentFy (party-level, respects FY toggle) ----
  const topDebtorsAll = [];
  for (const party of allPartyNames) {
    const value = Math.max(0, partyCumulative.get(party).get(currentFy) || 0);
    if (value <= 0) continue;
    const group = debtorIndex.get(party)?.group || "";
    topDebtorsAll.push({ name: party, group, outstanding: Math.round(value) });
  }
  topDebtorsAll.sort((a, b) => b.outstanding - a.outstanding);
  const partyCount = topDebtorsAll.length;
  const topDebtors = topDebtorsAll.slice(0, 25);

  // Sanity check the reconciliation invariant (dev-time guard, cheap at this scale).
  const topDebtorsSum = topDebtorsAll.reduce((s, p) => s + p.outstanding, 0);
  if (Math.abs(topDebtorsSum - totalOutstanding) > 1) {
    // eslint-disable-next-line no-console
    console.warn(`[receivablesBuilder] reconciliation drift for ${currentFy}: total=${totalOutstanding} sumOfParties=${topDebtorsSum}`);
  }

  // ---- DSO by FY (debtor-scoped netBilled) ----
  const dsoByFy = fyList.map((fy) => {
    const outstanding = outstandingByFy.find((o) => o.fy === fy)?.outstanding || 0;
    const netBilled = flowsByFy[fy]?.netBilled || 0;
    const dso = netBilled > 0 ? roundInt(outstanding / (netBilled / 365)) : null;
    return { fy, dso };
  });

  // ---- Collection rate by FY ----
  const collectionRateByFy = fyList.map((fy) => {
    const netBilled = flowsByFy[fy]?.netBilled || 0;
    const collections = flowsByFy[fy]?.receipts || 0;
    const rate = netBilled > 0 ? round1((collections / netBilled) * 100) : null;
    return { fy, rate, salesBilled: netBilled, collections };
  });

  // ---- KPIs ----
  const curNetBilled = flowsByFy[currentFy]?.netBilled || 0;
  const curColl       = flowsByFy[currentFy]?.receipts   || 0;
  const curRate  = curNetBilled > 0 ? round1((curColl / curNetBilled) * 100) : null;
  const curDso   = dsoByFy.find((d) => d.fy === currentFy)?.dso || null;

  const firstCompleteFy = fyList.find((fy) => !isPartialFy(fy, itemFacts, ledgerFacts)) || fyList[0];
  const completeFyRate = collectionRateByFy.find((c) => c.fy === firstCompleteFy);

  let prevOutstanding = null, prevRate = null, prevDso = null;
  if (prevFy) {
    prevOutstanding = outstandingByFy.find((o) => o.fy === prevFy)?.outstanding ?? null;
    prevRate  = collectionRateByFy.find((c) => c.fy === prevFy)?.rate ?? null;
    prevDso   = dsoByFy.find((d) => d.fy === prevFy)?.dso ?? null;
  }

  const kpis = {
    totalOutstanding:  { value: totalOutstanding,  prev: prevOutstanding },
    dso:               { value: curDso,            prev: prevDso },
    collectionRate:    { value: curRate,           prev: prevRate, completeFy: firstCompleteFy, completeFyRate: completeFyRate?.rate ?? null },
    openingBalance:    { value: openingBalance,    openingDebtors },
    collections:       { value: curColl,           prev: prevFy ? (flowsByFy[prevFy]?.receipts || 0) : null },
    salesBilled:       { value: curNetBilled,      prev: prevFy ? (flowsByFy[prevFy]?.netBilled || 0) : null },
  };

  // ---- Sales vs Collections MoM (currentFy) ----
  const momFy = currentFy;
  const momSales = flowsByFy[momFy]?.monthlyNetBilled || new Array(12).fill(0);
  const momColl  = flowsByFy[momFy]?.monthlyReceipts   || new Array(12).fill(0);

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
    fy: momFy,
    months: APR_TO_MAR,
    sales: momSales,
    collections: momColl,
    runningOutstanding: runningOutstandingMoM,
  };

  const collectionRateMoM = {
    fy: momFy,
    months: APR_TO_MAR,
    rates: momSales.map((s, i) => s > 0 ? round1((momColl[i] / s) * 100) : null),
  };

  // ---- Ageing (FIFO approximation, as of currentFy) ----
  const partyEvents = buildPartyEvents(itemFacts, ledgerFacts, allowedFysForCurrent);
  let asOfDate = fyStartDate(fyList[0]);
  for (const list of partyEvents.values()) {
    for (const e of list) if (e.date > asOfDate && e.date !== "9999-99-99") asOfDate = e.date;
  }

  const agingBuckets = { current: 0, d31_60: 0, d61_90: 0, d90plus: 0 };
  const agingByParty = new Map();
  for (const party of allPartyNames) {
    const opening = partyOpening.get(party) || 0;
    const seedEvents = opening > 0 ? [{ date: fyStartDate(fyList[0]), amount: opening, kind: "debit" }] : [];
    const events = [...seedEvents, ...(partyEvents.get(party) || [])];
    if (events.length === 0) continue;
    const aged = fifoAge(events, asOfDate);
    agingByParty.set(party, aged);
    agingBuckets.current += aged.buckets.current;
    agingBuckets.d31_60  += aged.buckets.d31_60;
    agingBuckets.d61_90  += aged.buckets.d61_90;
    agingBuckets.d90plus += aged.buckets.d90plus;
  }
  for (const key of Object.keys(agingBuckets)) agingBuckets[key] = Math.round(agingBuckets[key]);

  // Attach ageing detail onto the top-debtors rows already computed.
  for (const row of topDebtors) {
    const aged = agingByParty.get(row.name);
    if (aged) {
      row.oldestAgeDays = aged.oldestAgeDays;
      row.openInvoiceCount = aged.openInvoiceCount;
    }
  }

  // ---- Alerts ----
  const alerts = [];

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

  if (curRate != null && curRate < 80) {
    alerts.push({ tone: "red", title: "Collection rate below 80%", detail: `Current ${currentFy.replace("FY ", "")}: ${curRate}%` });
  } else if (curRate != null && curRate >= 95) {
    alerts.push({ tone: "green", title: "Strong collection rate", detail: `${curRate}% in ${currentFy.replace("FY ", "")}` });
  }

  if (agingBuckets.d90plus > 0 && totalOutstanding > 0) {
    const pct = round1((agingBuckets.d90plus / totalOutstanding) * 100);
    if (pct >= 20) {
      alerts.push({ tone: "red", title: "Aged receivables concern", detail: `${pct}% of outstanding is 90+ days overdue` });
    }
  }

  const localPartialFys = fyList.filter((fy) => isPartialFy(fy, itemFacts, ledgerFacts));
  if (localPartialFys.length > 0) {
    alerts.push({
      tone: "blue",
      title: `Partial year data: ${localPartialFys.join(", ")}`,
      detail: "Figures for partial years reflect transactions loaded so far.",
    });
  }

  // ---- Audit trail (rule: don't silently widen a filter without logging counts) ----
  const receiptAudit = auditReceiptAllocation(ledgerFacts);
  const debtorAccountCount = [...debtorIndex.values()].filter((e) => e.everDebtor).length;
  const sundryDebtorOnlyCount = [...debtorIndex.values()].filter((e) => e.group.toLowerCase().includes("sundry debtors")).length;
  // eslint-disable-next-line no-console
  console.log(
    `[receivablesBuilder] debtor accounts recognized: ${debtorAccountCount} ` +
    `(${sundryDebtorOnlyCount} tagged "Sundry Debtors" in their latest block, ` +
    `${debtorAccountCount - sundryDebtorOnlyCount} via zone/region groups). ` +
    `Receipt vouchers: ${receiptAudit.totalVouchers}, allocated to debtor parties: ₹${receiptAudit.allocatedAmount} ` +
    `(${receiptAudit.unallocatedVouchers} contra rows / ₹${receiptAudit.unallocatedAmount} not attributable to a debtor party).`
  );

  // ---- Data notes ----
  const dataNotes = [
    `Debtor universe: ${debtorAccountCount} accounts across Sundry Debtors and zone/region groups (SURI, ZONE-1..6, JHARKHAND, BIHAR, ODISHA, Burdwan) — previously only accounts literally tagged "Sundry Debtors" were counted.`,
    "Receipts are booked against bank accounts in Busy; each receipt is now allocated to a party using the contra line on the same voucher (the row crediting the customer's account), not the bank ledger total.",
    "Ageing buckets are a FIFO approximation: Busy's export does not link a specific receipt/return/note to a specific invoice, so each party's oldest open invoices are matched against their total credits in date order.",
    receiptAudit.unallocatedAmount > 0
      ? `₹${receiptAudit.unallocatedAmount} across ${receiptAudit.unallocatedVouchers} receipt contra rows could not be attributed to a debtor-group party (contra account belongs to a non-customer group, e.g. salary/expense) and is excluded from collections.`
      : null,
    localPartialFys.length > 0
      ? `${localPartialFys.join(", ")} ${localPartialFys.length === 1 ? "is" : "are"} partial (fewer than 6 months of data loaded). All figures for these years are incomplete.`
      : null,
    "Opening balance is taken from the earliest Account Master block for each party (typically FY2024-25), since later blocks leave Opening Bal. blank on re-export.",
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
    topOpeningDebtors: topOpeningDebtorsOut,
    salesVsCollMoM,
    collectionRateMoM,
    dsoByFy,
    collectionRateByFy,
    outstandingByFy,
    totalOutstanding,
    alerts,
    dataNotes,
    partyWiseAvailable: true,
    topDebtors,
    partyCount,
    agingBuckets,
    agingAsOfDate: asOfDate,
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
      totalOutstanding:  { value: openingBalance || 0, prev: null },
      dso:               { value: null, prev: null },
      collectionRate:    { value: null, prev: null, completeFy: null, completeFyRate: null },
      openingBalance:    { value: openingBalance || 0, openingDebtors: openingDebtors || 0 },
      collections:       { value: 0, prev: null },
      salesBilled:       { value: 0, prev: null },
    },
    openingBalance: openingBalance || 0,
    openingDebtors: openingDebtors || 0,
    topOpeningDebtors: topOpeningDebtors || [],
    salesVsCollMoM: { fy, months: APR_TO_MAR, sales: new Array(12).fill(0), collections: new Array(12).fill(0), runningOutstanding: new Array(12).fill(0) },
    collectionRateMoM: { fy, months: APR_TO_MAR, rates: new Array(12).fill(null) },
    dsoByFy: [],
    collectionRateByFy: [],
    outstandingByFy: [],
    totalOutstanding: openingBalance || 0,
    alerts: [],
    dataNotes: [],
    partyWiseAvailable: true,
    topDebtors: [],
    partyCount: 0,
    agingBuckets: { current: 0, d31_60: 0, d61_90: 0, d90plus: 0 },
    agingAsOfDate: null,
  };
}
