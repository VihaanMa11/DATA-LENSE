// State MIS — 3-year geographic cockpit.
// Groups sales by `state`; drills to city/station via accountMaster (party -> station).
// Revenue uses LINE `amount`; bills count Sales headers; returns are Sales Return amounts.
// Input: dashData = { itemFacts, ledgerFacts, accountMaster }
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

// Per-FY aggregation grouped by state.
// Map<state, { net, returns, monthly[12], parties(Set), bills(Set voucher), groups:Map<itemGroup,net>, partyNet:Map }>
function aggregateStatesFy(itemFacts, fy) {
  const months = fiscalYearMonths(fy);
  const monthIndex = new Map(months.map((m, i) => [m, i]));
  const map = new Map();
  const ensure = (s) => {
    let e = map.get(s);
    if (!e) {
      e = { net: 0, returns: 0, monthly: new Array(12).fill(0), parties: new Set(), bills: new Set(), groups: new Map(), partyNet: new Map() };
      map.set(s, e);
    }
    return e;
  };
  for (const r of itemFacts) {
    if (r.fy !== fy) continue;
    if (r.tx !== "Sales" && r.tx !== "Sales Return") continue;
    const party = String(r.party || "");
    if (party.toLowerCase() === "cash") continue;
    const state = r.state || "Unmapped";
    const sign = r.tx === "Sales Return" ? -1 : 1;
    const amount = num(r.amount) * sign;
    const e = ensure(state);
    e.net += amount;
    if (r.tx === "Sales Return") e.returns += num(r.amount);
    const mi = monthIndex.get(r.month);
    if (mi !== undefined) e.monthly[mi] += amount;
    if (party) e.parties.add(party);
    if (r.tx === "Sales" && r.isHeader && r.voucher) e.bills.add(r.voucher);
    if (r.itemGroup) e.groups.set(r.itemGroup, (e.groups.get(r.itemGroup) || 0) + amount);
    if (party) e.partyNet.set(party, (e.partyNet.get(party) || 0) + amount);
  }
  return map;
}

/**
 * Build the 3-FY state MIS cockpit.
 * @param {object} dashData - { itemFacts, ledgerFacts, accountMaster }
 * @param {object} [options] - { fy?: string }
 */
export function buildStateMis(dashData, options = {}) {
  const itemFacts = Array.isArray(dashData?.itemFacts) ? dashData.itemFacts : [];
  const ledgerFacts = Array.isArray(dashData?.ledgerFacts) ? dashData.ledgerFacts : [];
  const accountMaster = Array.isArray(dashData?.accountMaster) ? dashData.accountMaster : [];

  // party -> station lookup (for city drilldown)
  const partyStation = new Map();
  for (const a of accountMaster) {
    if (a?.name) partyStation.set(a.name, a.station && a.station !== "Unmapped" ? a.station : null);
  }

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

  const fyStates = new Map(); // fy -> Map<state, agg>
  for (const fy of fyList) fyStates.set(fy, aggregateStatesFy(itemFacts, fy));

  const allStates = new Set();
  for (const [, sm] of fyStates) for (const [s, e] of sm) if (e.net !== 0) allStates.add(s);

  const netIn      = (s, fy) => fyStates.get(fy)?.get(s)?.net || 0;
  const returnsIn  = (s, fy) => fyStates.get(fy)?.get(s)?.returns || 0;
  const partiesIn  = (s, fy) => fyStates.get(fy)?.get(s)?.parties?.size || 0;
  const billsIn    = (s, fy) => fyStates.get(fy)?.get(s)?.bills?.size || 0;
  const monthlyIn  = (s, fy) => fyStates.get(fy)?.get(s)?.monthly || new Array(12).fill(0);

  const totalNetFy = (fy) => [...allStates].reduce((sum, s) => sum + netIn(s, fy), 0);
  const curTotal = totalNetFy(currentFy);

  const rankedCurrent = [...allStates].sort((a, b) => netIn(b, currentFy) - netIn(a, currentFy));
  const topState = rankedCurrent[0] || null;
  const topShare = topState && curTotal > 0 ? round1((netIn(topState, currentFy) / curTotal) * 100) : 0;

  // ---- city drilldown for the top (dominant) state, current FY ----
  const topStateAgg = topState ? fyStates.get(currentFy)?.get(topState) : null;
  const cityMap = new Map();
  if (topStateAgg) {
    for (const [party, net] of topStateAgg.partyNet) {
      const station = partyStation.get(party) || "Unmapped";
      cityMap.set(station, (cityMap.get(station) || 0) + net);
    }
  }
  const topCities = [...cityMap.entries()]
    .filter(([station, v]) => station !== "Unmapped" && v > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([station, net]) => ({ station, net: Math.round(net) }));
  const topCity = topCities[0] || null;
  const citiesActive = [...cityMap.keys()].filter((k) => k !== "Unmapped" && cityMap.get(k) > 0).length;

  // ---- KPIs ----
  const kpis = {
    statesActive: { count: [...allStates].filter((s) => netIn(s, currentFy) > 0).length, names: rankedCurrent.filter((s) => netIn(s, currentFy) > 0).slice(0, 5) },
    topStateShare: { state: topState, pct: topShare, revenue: topState ? netIn(topState, currentFy) : 0, total: curTotal },
    secondState: rankedCurrent[1] ? { state: rankedCurrent[1], revenue: netIn(rankedCurrent[1], currentFy), parties: partiesIn(rankedCurrent[1], currentFy) } : null,
    topCity: topCity ? { station: topCity.station, net: topCity.net, sharePct: curTotal > 0 ? round1((topCity.net / curTotal) * 100) : 0 } : null,
    citiesActive,
  };

  // ---- Alerts ----
  const alerts = [];
  if (topShare >= 85) {
    alerts.push({
      tone: "red",
      title: `Extreme geographic concentration: ${topShare}% from ${topState}`,
      body: `If any disruption hits ${topState} — transport, weather, competition — most of the business is at risk. Diversify.`,
    });
  }
  const second = rankedCurrent[1];
  if (second && partiesIn(second, currentFy) === 1) {
    alerts.push({
      tone: "amber",
      title: `${second} = 1 party only`,
      body: `A single relationship accounts for all of ${second}'s ${bigMoney(netIn(second, currentFy))}. One customer = one state.`,
    });
  }
  // growth outside top state
  const growers = rankedCurrent.slice(1).filter((s) => prevFy && netIn(s, prevFy) > 0 && netIn(s, currentFy) > netIn(s, prevFy));
  if (growers.length > 0) {
    alerts.push({
      tone: "green",
      title: `${growers[0]} showing growth momentum`,
      body: `Best expansion candidate outside ${topState}. Growing YoY versus ${shortFy(prevFy)}.`,
    });
  }
  const onceStates = rankedCurrent.slice(1).filter((s) => billsIn(s, currentFy) === 1);
  if (onceStates.length > 0) {
    alerts.push({
      tone: "blue",
      title: `${onceStates.join(", ")} one-time only`,
      body: `Bought once in ${shortFy(currentFy)}. Follow up to convert to regular buyers.`,
    });
  }
  if (alerts.length === 0) alerts.push({ tone: "blue", title: "Geographic spread stable", body: "No concentration or expansion signals detected." });

  // ---- State 3-yr trend (grouped bars) ----
  const stateTrend = {
    states: rankedCurrent,
    series: fyList.map((fy) => ({ name: fy, values: rankedCurrent.map((s) => Math.round(netIn(s, fy))) })),
  };

  // ---- State MoM (current FY) ----
  const stateMoM = {
    months: APR_TO_MAR,
    series: rankedCurrent.slice(0, 4).map((s) => ({ name: s, values: monthlyIn(s, currentFy).map((v) => round1(v)) })),
  };

  // ---- Concentration shift across FYs (top-state share + breakdown) ----
  const concentration = fyList.map((fy) => {
    const tot = totalNetFy(fy);
    const rows = [...allStates]
      .map((s) => ({ state: s, pct: tot > 0 ? round1((netIn(s, fy) / tot) * 100) : 0 }))
      .filter((r) => r.pct > 0)
      .sort((a, b) => b.pct - a.pct);
    return { fy, topStatePct: rows[0]?.pct || 0, rows };
  });

  // ---- Segment mix by state (current FY, top item groups within each state) ----
  const segmentByState = rankedCurrent.map((s) => {
    const agg = fyStates.get(currentFy)?.get(s);
    const total = agg?.net || 0;
    const groups = agg
      ? [...agg.groups.entries()]
          .filter(([, v]) => v > 0)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(([group, v]) => ({ group, pct: total > 0 ? round1((v / total) * 100) : 0 }))
      : [];
    return { state: s, groups };
  });

  // ---- YoY by state (FY26 vs FY25, FY27 vs FY26) ----
  const yoyByState = rankedCurrent.map((s) => {
    const pairs = [];
    for (let i = 1; i < fyList.length; i++) {
      const a = fyList[i - 1], b = fyList[i];
      pairs.push({ pair: `${shortFy(b)} vs ${shortFy(a)}`, pct: netIn(s, a) > 0 ? deltaPct(netIn(s, b), netIn(s, a)) : 0 });
    }
    return { state: s, pairs };
  });

  // ---- Outside-top-state parties (expansion targets) ----
  const outsideParties = [];
  for (const s of rankedCurrent) {
    if (s === topState) continue;
    const agg = fyStates.get(currentFy)?.get(s);
    if (!agg) continue;
    for (const [party, net] of agg.partyNet) {
      if (net <= 0) continue;
      outsideParties.push({ party, state: s, net: Math.round(net), status: billsIn(s, currentFy) === 1 ? "Once" : "Active" });
    }
  }
  outsideParties.sort((a, b) => b.net - a.net);

  // ---- Detail table ----
  const table = rankedCurrent.map((s) => {
    const perFy = {};
    for (const fy of fyList) perFy[fy] = Math.round(netIn(s, fy));
    const cur = netIn(s, currentFy);
    const prev = prevFy ? netIn(s, prevFy) : 0;
    const yoyPct = prev > 0 ? deltaPct(cur, prev) : null;
    const bills = billsIn(s, currentFy);
    const parties = partiesIn(s, currentFy);
    const avgBill = bills > 0 ? Math.round(cur / bills) : 0;
    const trend = fyList.map((fy) => Math.round(netIn(s, fy)));
    let risk = "Stable";
    if (s === topState && topShare >= 85) risk = "Conc. risk";
    else if (parties === 1) risk = "1 party";
    else if (prevFy && cur > prev * 1.3) risk = "Expanding";
    return {
      state: s, perFy, yoyPct,
      sharePct: curTotal > 0 ? round1((cur / curTotal) * 100) : 0,
      parties, bills, avgBill,
      returns: Math.round(returnsIn(s, currentFy)),
      trend, risk,
    };
  });

  return {
    fy: currentFy, fyList, currentFy, prevFy, partialFys,
    kpis, alerts,
    stateTrend, stateMoM, concentration, segmentByState, yoyByState,
    topCities, outsideParties, table,
  };
}

function shortFy(fy) {
  const m = String(fy || "").match(/FY\s*\d{4}-(\d{2})/i);
  return m ? `FY${m[1]}` : fy;
}
function bigMoney(v) {
  const n = Math.round(num(v));
  if (Math.abs(n) >= 1e7) return `₹${(n / 1e7).toFixed(1)} Cr`;
  if (Math.abs(n) >= 1e5) return `₹${(n / 1e5).toFixed(1)} L`;
  return `₹${n.toLocaleString("en-IN")}`;
}

function emptyResult({ fy }) {
  return {
    fy, fyList: [], currentFy: fy, prevFy: null, partialFys: [],
    kpis: {
      statesActive: { count: 0, names: [] },
      topStateShare: { state: null, pct: 0, revenue: 0, total: 0 },
      secondState: null, topCity: null, citiesActive: 0,
    },
    alerts: [],
    stateTrend: { states: [], series: [] },
    stateMoM: { months: APR_TO_MAR, series: [] },
    concentration: [], segmentByState: [], yoyByState: [],
    topCities: [], outsideParties: [], table: [],
  };
}
