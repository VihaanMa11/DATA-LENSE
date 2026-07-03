// Sales Forecast — FY actuals + seasonality-aware 3-month forward forecast.
// Monthly net sales = Sales finalAmount - Sales Return finalAmount (header rows).
// The forecast is seasonality-aware: each forward month = the same calendar month of
// the current year scaled by the year-over-year growth rate. This keeps the July
// trough and September peak instead of a flat linear projection. Pure ESM.

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
function nextFyLabel(fy) {
  const m = String(fy || "").match(/FY\s*(\d{4})-(\d{2})/i);
  if (!m) return fy;
  const a = Number(m[1]) + 1, b = Number(m[2]) + 1;
  return `FY ${a}-${String(b).padStart(2, "0")}`;
}

function monthlyNetSales(itemFacts, fy) {
  const months = fiscalYearMonths(fy);
  const idx = new Map(months.map((m, i) => [m, i]));
  const arr = new Array(12).fill(0);
  for (const r of itemFacts) {
    if (r.fy !== fy || !r.isHeader) continue;
    if (String(r.party || "").toLowerCase() === "cash") continue;
    const mi = idx.get(r.month);
    if (mi === undefined) continue;
    if (r.tx === "Sales") arr[mi] += num(r.finalAmount);
    else if (r.tx === "Sales Return") arr[mi] -= num(r.finalAmount);
  }
  return arr;
}

/**
 * @param {object} dashData - { itemFacts, ledgerFacts }
 * @param {object} [options] - { fy?: string }
 */
export function buildSalesForecast(dashData, options = {}) {
  const itemFacts = Array.isArray(dashData?.itemFacts) ? dashData.itemFacts : [];
  const ledgerFacts = Array.isArray(dashData?.ledgerFacts) ? dashData.ledgerFacts : [];

  const fySet = new Set();
  for (const r of itemFacts) if ((r.tx === "Sales" || r.tx === "Sales Return") && r.fy) fySet.add(r.fy);
  const fyList = sortFys([...fySet]);
  if (fyList.length === 0) return emptyResult({ fy: options.fy || null });

  const { partialFys, latestCompleteFy } = analyzeFys(itemFacts, ledgerFacts);
  const currentFy = resolveCurrentFy(options.fy, fyList, latestCompleteFy);
  const curIdx = fyList.indexOf(currentFy);
  const prevFy = curIdx >= 1 ? fyList[curIdx - 1] : null;

  const curMonthly = monthlyNetSales(itemFacts, currentFy);
  const prevMonthly = prevFy ? monthlyNetSales(itemFacts, prevFy) : new Array(12).fill(0);

  const curTotal = curMonthly.reduce((s, v) => s + v, 0);
  const prevTotal = prevMonthly.reduce((s, v) => s + v, 0);
  const yoyGrowth = prevTotal > 0 ? (curTotal - prevTotal) / prevTotal : 0;

  // ---- Seasonality-aware forecast: next 3 months (Apr, May, Jun of next FY) ----
  const forecastFy = nextFyLabel(currentFy);
  const forecast = [0, 1, 2].map((mi) => {
    const base = curMonthly[mi];               // same calendar month, current year
    const val = base * (1 + yoyGrowth);
    return {
      month: APR_TO_MAR[mi],
      value: Math.round(val),
      curYearSame: Math.round(base),
      low: Math.round(val * 0.85),
      high: Math.round(val * 1.15),
      impliedYoY: base > 0 ? deltaPct(val, base) : null,
    };
  });
  const forecast3Total = forecast.reduce((s, f) => s + f.value, 0);
  const cur3Total = curMonthly.slice(0, 3).reduce((s, v) => s + v, 0);

  // ---- Best / worst month ----
  let best = { i: 0, v: -Infinity }, worst = { i: 0, v: Infinity };
  curMonthly.forEach((v, i) => { if (v > best.v) best = { i, v }; if (v < worst.v) worst = { i, v }; });

  // ---- H1 / H2 ----
  const h1 = curMonthly.slice(0, 6).reduce((s, v) => s + v, 0);
  const h2 = curMonthly.slice(6).reduce((s, v) => s + v, 0);

  const kpis = {
    totalActual: { cur: Math.round(curTotal), fy: currentFy, yoyPct: prevTotal > 0 ? deltaPct(curTotal, prevTotal) : null, prev: Math.round(prevTotal) },
    nextMonthForecast: { value: forecast[0]?.value || 0, month: forecast[0]?.month, vsCur: forecast[0]?.curYearSame || 0, impliedYoY: forecast[0]?.impliedYoY },
    bestMonth: { month: APR_TO_MAR[best.i], value: Math.round(best.v) },
    worstMonth: { month: APR_TO_MAR[worst.i], value: Math.round(worst.v), pctBelowBest: best.v > 0 ? Math.round((1 - worst.v / best.v) * 100) : 0 },
    h1h2: { h1: Math.round(h1), h2: Math.round(h2), h1Pct: curTotal > 0 ? Math.round((h1 / curTotal) * 100) : 0, h2Pct: curTotal > 0 ? Math.round((h2 / curTotal) * 100) : 0 },
    forecast3: { total: forecast3Total, vsCur: cur3Total, months: forecast.map((f) => f.month).join("-") },
  };

  // ---- Alerts ----
  const alerts = [];
  if (worst.v > 0) alerts.push({ tone: "red", title: `${APR_TO_MAR[worst.i]} ${bigMoney(worst.v)} is the seasonal low`, body: `${kpis.worstMonth.pctBelowBest}% below the peak. This trough repeats yearly. Do not plan major payments in ${APR_TO_MAR[worst.i]}, cash will be tight.` });
  alerts.push({ tone: "green", title: `${APR_TO_MAR[best.i]} is the peak month at ${bigMoney(best.v)}`, body: `Stock and staff up before ${APR_TO_MAR[best.i]}. ${prevFy ? `Prior year same month ${bigMoney(prevMonthly[best.i])}.` : ""}` });
  alerts.push({ tone: "blue", title: `Forecast is seasonality-aware`, body: `Each forward month scales the same calendar month of ${shortFy(currentFy)} by the ${Math.round(yoyGrowth * 100)}% YoY growth rate, so the ${APR_TO_MAR[worst.i]} trough is preserved instead of a flat trend.` });
  if (kpis.totalActual.yoyPct != null) alerts.push({ tone: kpis.totalActual.yoyPct >= 0 ? "green" : "amber", title: `Full year ${kpis.totalActual.yoyPct >= 0 ? "up" : "down"} ${Math.abs(kpis.totalActual.yoyPct)}% vs ${shortFy(prevFy)}`, body: `${bigMoney(curTotal)} vs ${bigMoney(prevTotal)}. At this rate ${forecastFy} projects near ${bigMoney(curTotal * (1 + yoyGrowth))}.` });

  // ---- Main chart series: current actual (12) + forecast (3 appended) ----
  const labels = [...APR_TO_MAR, ...forecast.map((f) => `+${f.month}`)];
  const actualLine = [...curMonthly.map(Math.round), null, null, null];
  const prevLine = [...prevMonthly.map(Math.round), null, null, null];
  const forecastLine = [...new Array(12).fill(null), ...forecast.map((f) => f.value)];
  const forecastHigh = [...new Array(12).fill(null), ...forecast.map((f) => f.high)];
  const forecastLow = [...new Array(12).fill(null), ...forecast.map((f) => f.low)];
  const mainChart = { labels, actual: actualLine, prevYear: prevLine, forecast: forecastLine, high: forecastHigh, low: forecastLow, curFy: currentFy, prevFy, forecastFy };

  // ---- Seasonality index ----
  const avg = curTotal / 12;
  const seasonality = { months: APR_TO_MAR, values: curMonthly.map((v) => (avg > 0 ? Math.round((v / avg) * 100) : 0)) };

  // ---- YoY same-month ----
  const yoyMonth = { months: APR_TO_MAR, values: curMonthly.map((v, i) => (prevMonthly[i] > 0 ? deltaPct(v, prevMonthly[i]) : null)) };

  // ---- FY-next projection range ----
  // For the forward range, floor the growth at a modest positive rate so the
  // scenarios stay ordered (a Milon-inflated prior year can make raw YoY negative).
  const projGrowth = Math.max(0.05, yoyGrowth);
  const projection = {
    fy: forecastFy,
    conservative: Math.round(curTotal * 1.03),
    base: Math.round(curTotal * (1 + projGrowth)),
    optimistic: Math.round(curTotal * (1 + projGrowth + 0.07)),
  };

  // ---- Accuracy check table (forecast months vs current-year same month) ----
  const accuracy = forecast.map((f) => ({ month: f.month, curYearSame: f.curYearSame, forecast: f.value, impliedYoY: f.impliedYoY }));

  // ---- Monthly detail table ----
  const table = APR_TO_MAR.map((m, i) => ({
    month: m, cur: Math.round(curMonthly[i]), prev: Math.round(prevMonthly[i]),
    yoyPct: prevMonthly[i] > 0 ? deltaPct(curMonthly[i], prevMonthly[i]) : null,
    type: i === best.i ? "Peak" : i === worst.i ? "Low" : "Actual",
  })).concat(forecast.map((f) => ({ month: `${f.month} ${shortFy(forecastFy)}`, cur: f.value, prev: f.curYearSame, yoyPct: f.impliedYoY, type: "Forecast" })));

  return {
    fy: currentFy, fyList, currentFy, prevFy, partialFys, forecastFy,
    kpis, alerts, mainChart, seasonality, yoyMonth, projection, accuracy, table,
  };
}

function shortFy(fy) { const m = String(fy || "").match(/FY\s*\d{4}-(\d{2})/i); return m ? `FY${m[1]}` : fy; }
function bigMoney(v) { const n = Math.round(num(v)); if (Math.abs(n) >= 1e7) return `₹${(n / 1e7).toFixed(1)} Cr`; if (Math.abs(n) >= 1e5) return `₹${(n / 1e5).toFixed(1)} L`; return `₹${n.toLocaleString("en-IN")}`; }

function emptyResult({ fy }) {
  return {
    fy, fyList: [], currentFy: fy, prevFy: null, partialFys: [], forecastFy: null,
    kpis: {
      totalActual: { cur: 0, fy, yoyPct: null, prev: 0 }, nextMonthForecast: { value: 0, month: null, vsCur: 0, impliedYoY: null },
      bestMonth: { month: null, value: 0 }, worstMonth: { month: null, value: 0, pctBelowBest: 0 },
      h1h2: { h1: 0, h2: 0, h1Pct: 0, h2Pct: 0 }, forecast3: { total: 0, vsCur: 0, months: "" },
    },
    alerts: [], mainChart: { labels: [], actual: [], prevYear: [], forecast: [], high: [], low: [] },
    seasonality: { months: APR_TO_MAR, values: [] }, yoyMonth: { months: APR_TO_MAR, values: [] },
    projection: { fy: null, conservative: 0, base: 0, optimistic: 0 }, accuracy: [], table: [],
  };
}
