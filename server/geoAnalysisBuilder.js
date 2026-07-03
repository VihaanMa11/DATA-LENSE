// Geographic Customer Analysis — party + state + city cockpit with client-side slicers.
// Returns full arrays; the page filters by state / city / tier / half-year.
// Party sales = Sales header finalAmount - Sales Return finalAmount. City via accountMaster.
// Pure ESM, no HTTP/React.

import { analyzeFys, resolveCurrentFy } from "./fyUtil.js";
import { genderAgeOf } from "./segmentMisBuilder.js";

const num = (v) => Number(v) || 0;
const round1 = (v) => Math.round(v * 10) / 10;

function fiscalYearMonths(fy) {
  const match = String(fy || "").match(/FY\s*(\d{4})\s*-\s*(\d{2})/i);
  if (!match) return [];
  const startYear = Number(match[1]);
  return [4, 5, 6, 7, 8, 9, 10, 11, 12, 1, 2, 3].map((month) => {
    const year = month >= 4 ? startYear : startYear + 1;
    return `${year}-${String(month).padStart(2, "0")}`;
  });
}
function sortFys(a) { return [...a].sort((x, y) => Number((x.match(/(\d{4})/) || [])[1] || 0) - Number((y.match(/(\d{4})/) || [])[1] || 0)); }
const APR_TO_MAR = ["Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar"];

export function buildGeoAnalysis(dashData, options = {}) {
  const itemFacts = Array.isArray(dashData?.itemFacts) ? dashData.itemFacts : [];
  const ledgerFacts = Array.isArray(dashData?.ledgerFacts) ? dashData.ledgerFacts : [];
  const accountMaster = Array.isArray(dashData?.accountMaster) ? dashData.accountMaster : [];
  const partyStation = new Map();
  for (const a of accountMaster) if (a?.name) partyStation.set(a.name, a.station && a.station !== "Unmapped" ? a.station : "Unmapped");

  const fySet = new Set();
  for (const r of itemFacts) if ((r.tx === "Sales" || r.tx === "Sales Return") && r.fy) fySet.add(r.fy);
  const fyList = sortFys([...fySet]);
  if (fyList.length === 0) return emptyResult({ fy: options.fy || null });

  const { partialFys, latestCompleteFy } = analyzeFys(itemFacts, ledgerFacts);
  const currentFy = resolveCurrentFy(options.fy, fyList, latestCompleteFy);

  // ---- Per-party aggregation (current FY) ----
  const pmap = new Map();
  const months = fiscalYearMonths(currentFy);
  const midx = new Map(months.map((m, i) => [m, i]));
  for (const r of itemFacts) {
    if (r.fy !== currentFy) continue;
    if (r.tx !== "Sales" && r.tx !== "Sales Return") continue;
    const party = r.party || "";
    if (!party || party.toLowerCase() === "cash") continue;
    let e = pmap.get(party);
    if (!e) { e = { name: party, state: r.state || "Unmapped", city: partyStation.get(party) || "Unmapped", gross: 0, returns: 0, qty: 0, bills: new Set(), months: new Set(), groups: new Map() }; pmap.set(party, e); }
    const fa = num(r.finalAmount), q = num(r.qty);
    if (r.tx === "Sales") {
      if (r.isHeader) { e.gross += fa; if (r.voucher) e.bills.add(r.voucher); if (r.month) e.months.add(r.month); }
      e.qty += q;
      if (r.itemGroup) e.groups.set(genderAgeOf(r.itemGroup), (e.groups.get(genderAgeOf(r.itemGroup)) || 0) + num(r.amount));
    } else if (r.isHeader) e.returns += fa;
  }
  const totalSales = [...pmap.values()].reduce((s, e) => s + (e.gross - e.returns), 0);
  const parties = [...pmap.values()].map((e) => {
    const net = e.gross - e.returns;
    const bills = e.bills.size;
    return {
      name: e.name, state: e.state, city: e.city,
      sales: Math.round(net), bills, avgBill: bills > 0 ? Math.round(net / bills) : 0,
      months: e.months.size, qty: Math.round(e.qty),
      share: totalSales > 0 ? round1((net / totalSales) * 100) : 0,
      retPct: e.gross > 0 ? round1((e.returns / e.gross) * 100) : 0,
    };
  }).filter((p) => p.sales > 0).sort((a, b) => b.sales - a.sales);

  // ---- State trend (3yr) ----
  const stateNet = (state, fy) => {
    let s = 0;
    for (const r of itemFacts) { if (r.fy !== fy || !r.isHeader || r.state !== state) continue; if (String(r.party || "").toLowerCase() === "cash") continue; if (r.tx === "Sales") s += num(r.finalAmount); else if (r.tx === "Sales Return") s -= num(r.finalAmount); }
    return s;
  };
  const states = [...new Set(parties.map((p) => p.state))];
  const rankedStates = states.map((s) => ({ s, v: stateNet(s, currentFy) })).sort((a, b) => b.v - a.v).map((x) => x.s);
  const stateTrend = { states: rankedStates, series: fyList.map((fy) => ({ name: fy, values: rankedStates.map((s) => Math.round(stateNet(s, fy))) })) };

  // ---- State MoM (current FY, stacked) ----
  const stateMoM = {
    months: APR_TO_MAR,
    series: rankedStates.map((s) => {
      const arr = new Array(12).fill(0);
      for (const r of itemFacts) { if (r.fy !== currentFy || !r.isHeader || r.state !== s) continue; if (String(r.party || "").toLowerCase() === "cash") continue; const mi = midx.get(r.month); if (mi === undefined) continue; if (r.tx === "Sales") arr[mi] += num(r.finalAmount); else if (r.tx === "Sales Return") arr[mi] -= num(r.finalAmount); }
      return { name: s, values: arr.map(Math.round) };
    }),
  };

  // ---- Segment mix by state ----
  const segByState = rankedStates.map((s) => {
    const gm = new Map(); let tot = 0;
    for (const p of parties) { if (p.state !== s) continue; const e = pmap.get(p.name); for (const [g, v] of e.groups) { gm.set(g, (gm.get(g) || 0) + v); tot += v; } }
    const groups = [...gm.entries()].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([group, v]) => ({ group, pct: tot > 0 ? round1((v / tot) * 100) : 0 }));
    return { state: s, groups };
  });

  // ---- Concentration ----
  const concentration = rankedStates.map((s) => ({ state: s, value: Math.round(stateNet(s, currentFy)), pct: totalSales > 0 ? round1((stateNet(s, currentFy) / totalSales) * 100) : 0 }));

  // ---- Quarterly (top state) ----
  const topState = rankedStates[0];
  const qmap = [0, 0, 0, 0];
  for (const r of itemFacts) { if (r.fy !== currentFy || !r.isHeader || r.state !== topState) continue; if (String(r.party || "").toLowerCase() === "cash") continue; const mi = midx.get(r.month); if (mi === undefined) continue; const q = Math.floor(mi / 3); const v = r.tx === "Sales" ? num(r.finalAmount) : r.tx === "Sales Return" ? -num(r.finalAmount) : 0; qmap[q] += v; }
  const quarterly = { state: topState, values: qmap.map(Math.round) };

  // ---- KPIs ----
  const wbNet = stateNet(topState, currentFy);
  const topParty = parties[0] || null;
  const totalBills = parties.reduce((s, p) => s + p.bills, 0);
  const totalRet = parties.reduce((s, p) => s + (p.sales * p.retPct / 100), 0);
  const kpis = {
    totalSales: { cur: Math.round(totalSales), fy: currentFy },
    activeParties: { cur: parties.length, states: states.length },
    topStateConc: { state: topState, pct: totalSales > 0 ? round1((wbNet / totalSales) * 100) : 0, value: Math.round(wbNet), total: Math.round(totalSales) },
    topParty: topParty ? { name: topParty.name, city: topParty.city, sales: topParty.sales, share: topParty.share } : null,
    avgBill: { cur: totalBills > 0 ? Math.round(totalSales / totalBills) : 0, bills: totalBills },
    returnRate: { cur: totalSales > 0 ? round1((totalRet / totalSales) * 100) : 0, worst: [...parties].sort((a, b) => b.retPct - a.retPct)[0]?.name || null },
  };

  return { fy: currentFy, fyList, currentFy, partialFys, kpis, parties, stateTrend, stateMoM, segByState, concentration, quarterly };
}

function emptyResult({ fy }) {
  return {
    fy, fyList: [], currentFy: fy, partialFys: [],
    kpis: { totalSales: { cur: 0, fy }, activeParties: { cur: 0, states: 0 }, topStateConc: { state: null, pct: 0, value: 0, total: 0 }, topParty: null, avgBill: { cur: 0, bills: 0 }, returnRate: { cur: 0, worst: null } },
    parties: [], stateTrend: { states: [], series: [] }, stateMoM: { months: APR_TO_MAR, series: [] }, segByState: [], concentration: [], quarterly: { state: null, values: [] },
  };
}
