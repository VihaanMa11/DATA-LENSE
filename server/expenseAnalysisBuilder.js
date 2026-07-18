// Expense Analysis — 3-year opex + P&L bridge.
// Expense per account = net debit (debit - credit) for accounts in expense groups.
// Accounts are classified into categories by name. Suspense is surfaced separately
// as an unclassified placeholder that distorts the P&L. Gross profit = net sales -
// COGS (net purchases); net operating profit = gross profit - total expenses.
// Numbers are faithful to the source registers. Pure ESM, no HTTP/React.

import { analyzeFys, resolveCurrentFy } from "./fyUtil.js";

const num = (v) => Number(v) || 0;
const round1 = (v) => Math.round(v * 10) / 10;
const roundInt = (v) => Math.round(v);

function sortFys(fyArray) {
  return [...fyArray].sort((a, b) => {
    const ay = Number((a.match(/FY\s*(\d{4})/) || [])[1] || 0);
    const by = Number((b.match(/FY\s*(\d{4})/) || [])[1] || 0);
    return ay - by;
  });
}
function deltaPct(cur, prev) { if (!prev) return 0; return roundInt(((cur - prev) / prev) * 100); }

// Core operating-expense groups only. Sales-side deductions (schemes, cash
// discounts) reduce revenue and are excluded here so opex is not overstated.
const isExpenseGroup = (g) => /expenses\s*\(indirect|expenses\s*\(direct|against salary|creditor for exp|retail meet/i.test(String(g || ""));

// Classify an expense account by name.
//
// The account master uses free-text names typed by different people over 3 years
// (typos, abbreviations, "-FACTORY STAF" vs "-FACTORY EMPLOYEE"), so each rule below
// was checked against the real chart of accounts and widened to catch the specific
// variants found there (e.g. EPF/ESIC employer contributions and named factory staff
// accounts were previously falling into "Other" instead of "Salary").
export function expenseCategory(name) {
  const n = String(name || "").toUpperCase();
  if (/SUSPENSE/.test(n)) return "Suspense";
  if (/SALARY|WAGES|STAFF?\b|BONUS|\bEPF\b|\bESIC\b|PROVIDENT|EMPLOYEE/.test(n)) return "Salary";
  if (/RENT/.test(n)) return "Rent";
  if (/DELIVERY|TRANSPORT|CARRIAGE|FREIGHT|LOADING|UNLOADING|COURIER|POSTAGE/.test(n)) return "Logistics";
  if (/ELECTRIC|GENERATOR|POWER|WATER|FUEL/.test(n)) return "Utilities";
  if (/PROMOTION|SCHEME|FESTIVAL|ADVERTIS|PUBLICITY|DISCOUNT|MEET/.test(n)) return "Marketing";
  if (/INTEREST|BANK CHARGE|FINANCE/.test(n)) return "Finance";
  if (/PRINT|STATIONERY|PROFESSIONAL|INSURANCE|TRAVEL|CONVEYANCE|TEA|TIFFIN|OFFICE|LEGAL|AUDIT|STITCH|LABOUR|ADMIN|ACCOUNT|TELEPHONE|PHONE|REPAIR|MAINTAIN|LICEN|SUBSCRIPTION|PACKING|JOBWORK|CONSUMABLE|GENERAL/.test(n)) return "Admin";
  return "Other";
}
const FIXED_CATS = new Set(["Salary", "Rent", "Finance"]);

function aggregateExpensesFy(ledgerFacts, fy) {
  const map = new Map();
  for (const r of ledgerFacts) {
    if (r.fy !== fy) continue;
    if (!isExpenseGroup(r.accountGroup)) continue;
    const acct = r.account || "Unmapped";
    const net = num(r.debit) - num(r.credit);
    map.set(acct, (map.get(acct) || 0) + net);
  }
  // keep only positive net-expense accounts
  const out = new Map();
  for (const [k, v] of map) if (v > 0) out.set(k, v);
  return out;
}

function netSalesFy(itemFacts, fy) {
  let s = 0;
  for (const r of itemFacts) {
    if (r.fy !== fy || !r.isHeader) continue;
    if (String(r.party || "").toLowerCase() === "cash") continue;
    if (r.tx === "Sales") s += num(r.finalAmount);
    else if (r.tx === "Sales Return") s -= num(r.finalAmount);
  }
  return s;
}
function cogsFy(itemFacts, fy) {
  let s = 0;
  for (const r of itemFacts) {
    if (r.fy !== fy || !r.isHeader) continue;
    if (r.tx === "Purchase") s += num(r.finalAmount);
    else if (r.tx === "Purchase Return") s -= num(r.finalAmount);
  }
  return s;
}

/**
 * @param {object} dashData - { itemFacts, ledgerFacts }
 * @param {object} [options] - { fy?: string }
 */
export function buildExpenseAnalysis(dashData, options = {}) {
  const itemFacts = Array.isArray(dashData?.itemFacts) ? dashData.itemFacts : [];
  const ledgerFacts = Array.isArray(dashData?.ledgerFacts) ? dashData.ledgerFacts : [];

  const fySet = new Set();
  for (const r of ledgerFacts) if (isExpenseGroup(r.accountGroup) && r.fy) fySet.add(r.fy);
  for (const r of itemFacts) if ((r.tx === "Sales" || r.tx === "Purchase") && r.fy) fySet.add(r.fy);
  const fyList = sortFys([...fySet]);
  if (fyList.length === 0) return emptyResult({ fy: options.fy || null });

  const { partialFys, latestCompleteFy } = analyzeFys(itemFacts, ledgerFacts);
  const currentFy = resolveCurrentFy(options.fy, fyList, latestCompleteFy);
  const curIdx = fyList.indexOf(currentFy);
  const prevFy = curIdx >= 1 ? fyList[curIdx - 1] : null;

  const fyExp = new Map();
  for (const fy of fyList) fyExp.set(fy, aggregateExpensesFy(ledgerFacts, fy));

  const curExp = fyExp.get(currentFy) || new Map();
  const acctTotal = (fy) => { let s = 0; for (const [, v] of (fyExp.get(fy) || new Map())) s += v; return s; };
  const totalExpenses = acctTotal(currentFy);

  // category rollup
  const catOf = (fy) => {
    const m = new Map();
    for (const [acct, v] of (fyExp.get(fy) || new Map())) { const c = expenseCategory(acct); m.set(c, (m.get(c) || 0) + v); }
    return m;
  };
  const curCats = catOf(currentFy);
  const CAT_ORDER = ["Salary", "Suspense", "Marketing", "Admin", "Rent", "Logistics", "Utilities", "Finance", "Other"];

  // ---- Category mix (sorted by magnitude, tiny categories collapsed into Other) ----
  // Suspense is always shown on its own regardless of size — it's a P&L-distortion
  // flag, not a spending category, and hiding it inside "Other" would bury the exact
  // thing the Suspense alert is warning about. Everything else below the materiality
  // threshold folds into "Other" so the mix stays a handful of clean slices instead of
  // slivers for whichever category happens to be small that year.
  const MIX_MATERIALITY_PCT = 3;
  const categoryMixRaw = CAT_ORDER.filter((c) => (curCats.get(c) || 0) > 0)
    .map((c) => ({ category: c, value: Math.round(curCats.get(c)), pct: totalExpenses > 0 ? round1((curCats.get(c) / totalExpenses) * 100) : 0 }));
  const mixKeep = categoryMixRaw.filter((c) => c.category === "Suspense" || c.category === "Other" || c.pct >= MIX_MATERIALITY_PCT);
  const mixCollapse = categoryMixRaw.filter((c) => c.category !== "Suspense" && c.category !== "Other" && c.pct < MIX_MATERIALITY_PCT);
  const categoryMix = [...mixKeep];
  if (mixCollapse.length > 0) {
    const collapsedValue = mixCollapse.reduce((s, c) => s + c.value, 0);
    const existingOther = categoryMix.find((c) => c.category === "Other");
    if (existingOther) {
      existingOther.value += collapsedValue;
      existingOther.pct = totalExpenses > 0 ? round1((existingOther.value / totalExpenses) * 100) : 0;
      existingOther.collapsedFrom = mixCollapse.map((c) => c.category);
    } else {
      categoryMix.push({
        category: "Other", value: collapsedValue,
        pct: totalExpenses > 0 ? round1((collapsedValue / totalExpenses) * 100) : 0,
        collapsedFrom: mixCollapse.map((c) => c.category),
      });
    }
  }
  categoryMix.sort((a, b) => b.value - a.value);

  const salaryTotal = curCats.get("Salary") || 0;
  const suspenseTotal = curCats.get("Suspense") || 0;
  const rentTotal = curCats.get("Rent") || 0;
  const logisticsTotal = curCats.get("Logistics") || 0;
  const utilitiesTotal = curCats.get("Utilities") || 0;
  const otherOpex = totalExpenses - salaryTotal - suspenseTotal - rentTotal - logisticsTotal - utilitiesTotal;

  // P&L
  const netSales = netSalesFy(itemFacts, currentFy);
  const cogs = cogsFy(itemFacts, currentFy);
  const grossProfit = netSales - cogs;
  const nop = grossProfit - totalExpenses;
  const grossMarginPct = netSales > 0 ? round1((grossProfit / netSales) * 100) : 0;
  const expPctSales = netSales > 0 ? round1((totalExpenses / netSales) * 100) : 0;
  const salaryPctSales = netSales > 0 ? round1((salaryTotal / netSales) * 100) : 0;

  const kpis = {
    totalExpenses: { cur: Math.round(totalExpenses), pctSales: expPctSales, fy: currentFy },
    salary: { cur: Math.round(salaryTotal), pctExp: totalExpenses > 0 ? round1((salaryTotal / totalExpenses) * 100) : 0, pctSales: salaryPctSales },
    grossProfit: { cur: Math.round(grossProfit), marginPct: grossMarginPct },
    nop: { cur: Math.round(nop) },
    suspense: { cur: Math.round(suspenseTotal), pctExp: totalExpenses > 0 ? round1((suspenseTotal / totalExpenses) * 100) : 0 },
    salaryPctSales: { cur: salaryPctSales },
  };

  // ---- Alerts ----
  const alerts = [];
  if (suspenseTotal > 0) alerts.push({ tone: "red", title: `${bigMoney(suspenseTotal)} in Suspense — clear before trusting the P&L`, body: `${kpis.suspense.pctExp}% of expenses are unclassified. Suspense is an accounting placeholder, not a real cost. Reclassifying it may flip the operating result.` });
  if (nop < 0) alerts.push({ tone: "red", title: `Net operating loss of ${bigMoney(Math.abs(nop))}`, body: `Gross profit ${bigMoney(grossProfit)} is wiped out by expenses of ${bigMoney(totalExpenses)}. Keep opex below ${grossMarginPct}% of sales to stay profitable.` });
  else alerts.push({ tone: "green", title: `Net operating profit ${bigMoney(nop)}`, body: `Gross profit ${bigMoney(grossProfit)} covers expenses of ${bigMoney(totalExpenses)}.` });
  if (salaryTotal > 0) alerts.push({ tone: "amber", title: `Salary is ${kpis.salary.pctExp}% of all expenses`, body: `${bigMoney(salaryTotal)} payroll, ${salaryPctSales}% of net sales. The single biggest cost line.` });
  if (rentTotal > 0) alerts.push({ tone: "blue", title: `Rent burden ${bigMoney(rentTotal)}/year`, body: `Fixed cost across godown, factory and outlet. Plan for it as the business expands geographically.` });

  // ---- P&L bridge ----
  const bridge = [
    { label: "Net sales", value: Math.round(netSales), kind: "base" },
    { label: "Less: COGS (net purchases)", value: -Math.round(cogs), kind: "cogs" },
    { label: "= Gross profit", value: Math.round(grossProfit), kind: "subtotal" },
    { label: "Less: Salary", value: -Math.round(salaryTotal), kind: "exp" },
    { label: "Less: Rent", value: -Math.round(rentTotal), kind: "exp" },
    { label: "Less: Logistics", value: -Math.round(logisticsTotal), kind: "exp" },
    { label: "Less: Utilities", value: -Math.round(utilitiesTotal), kind: "exp" },
    { label: "Less: Other opex", value: -Math.round(Math.max(0, otherOpex)), kind: "exp" },
    { label: "Less: Suspense (unclassified)", value: -Math.round(suspenseTotal), kind: "suspense" },
    { label: "= Net operating profit / (loss)", value: Math.round(nop), kind: "total" },
  ];

  // ---- 3yr margin trend (complete FYs only; partial years distort ratios) ----
  const trendFys = fyList.filter((fy) => !partialFys.includes(fy));
  const marginTrend = trendFys.map((fy) => {
    const ns = netSalesFy(itemFacts, fy), cg = cogsFy(itemFacts, fy), ex = acctTotal(fy);
    const gp = ns - cg;
    return {
      fy,
      grossMarginPct: ns > 0 ? round1((gp / ns) * 100) : 0,
      expPctSales: ns > 0 ? round1((ex / ns) * 100) : 0,
      netMarginPct: ns > 0 ? round1(((gp - ex) / ns) * 100) : 0,
    };
  });

  // ---- Salary trend 3yr (complete FYs only) ----
  const salaryTrend = trendFys.map((fy) => {
    const ns = netSalesFy(itemFacts, fy);
    const sal = (catOf(fy).get("Salary") || 0);
    return { fy, salary: Math.round(sal), pctSales: ns > 0 ? round1((sal / ns) * 100) : 0 };
  });

  // ---- Salary breakdown (top salary accounts) ----
  const salaryAccts = [...curExp.entries()].filter(([a]) => expenseCategory(a) === "Salary")
    .sort((a, b) => b[1] - a[1]).slice(0, 12).map(([name, v]) => ({ name: shortAcct(name), value: Math.round(v) }));

  // ---- Category % of sales trend (grouped) ----
  const catTrendCats = ["Salary", "Rent", "Logistics", "Utilities", "Marketing", "Suspense"];
  const categoryPctTrend = {
    categories: catTrendCats,
    series: trendFys.map((fy) => {
      const ns = netSalesFy(itemFacts, fy); const cm = catOf(fy);
      return { name: fy, values: catTrendCats.map((c) => (ns > 0 ? round1(((cm.get(c) || 0) / ns) * 100) : 0)) };
    }),
  };

  // ---- Fixed vs variable ----
  let fixed = 0, variable = 0;
  for (const [acct, v] of curExp) { if (expenseCategory(acct) === "Suspense") continue; if (FIXED_CATS.has(expenseCategory(acct)) || /RENT|ELECTRIC|GENERATOR/i.test(acct)) fixed += v; else variable += v; }
  const fixedVsVariable = { fixed: Math.round(fixed), variable: Math.round(variable), suspense: Math.round(suspenseTotal) };

  // ---- Detail table: top 20 accounts (Salary collapsed to one line) ----
  const table = [...curExp.entries()]
    .map(([acct, v]) => ({ acct, v, cat: expenseCategory(acct) }))
    .sort((a, b) => b.v - a.v)
    .slice(0, 20)
    .map(({ acct, v, cat }) => {
      const prev = prevFy ? (fyExp.get(prevFy)?.get(acct) || 0) : 0;
      return {
        account: shortAcct(acct), category: cat, perFy: fyList.reduce((o, fy) => { o[fy] = Math.round(fyExp.get(fy)?.get(acct) || 0); return o; }, {}),
        cur: Math.round(v), yoyPct: prev > 0 ? deltaPct(v, prev) : null,
        pctSales: netSales > 0 ? round1((v / netSales) * 100) : 0,
        type: FIXED_CATS.has(cat) || /RENT/i.test(acct) ? "Fixed" : (cat === "Suspense" ? "Unknown" : "Variable"),
        flag: cat === "Suspense" ? "Clear now" : (prev > 0 && deltaPct(v, prev) >= 30 ? "Rising" : "Normal"),
      };
    });

  return {
    fy: currentFy, fyList, currentFy, prevFy, partialFys,
    kpis, alerts, bridge, categoryMix, marginTrend, salaryTrend, salaryAccts, categoryPctTrend, fixedVsVariable, table,
    dataNotes: [
      "Expense figures are net debits to accounts in expense groups, faithful to the ledger.",
      "Suspense is an unclassified placeholder, not a real cost. Clear it before relying on the operating result.",
    ],
  };
}

function shortAcct(name) { return String(name || "").replace(/\s*@?\s*\d+%?\s*$/, "").trim().slice(0, 28) || String(name || ""); }
function bigMoney(v) { const n = Math.round(num(v)); const s = n < 0 ? "-" : ""; const a = Math.abs(n); if (a >= 1e7) return `${s}₹${(a / 1e7).toFixed(2)} Cr`; if (a >= 1e5) return `${s}₹${(a / 1e5).toFixed(1)} L`; return `${s}₹${a.toLocaleString("en-IN")}`; }

function emptyResult({ fy }) {
  return {
    fy, fyList: [], currentFy: fy, prevFy: null, partialFys: [],
    kpis: {
      totalExpenses: { cur: 0, pctSales: 0, fy }, salary: { cur: 0, pctExp: 0, pctSales: 0 },
      grossProfit: { cur: 0, marginPct: 0 }, nop: { cur: 0 }, suspense: { cur: 0, pctExp: 0 }, salaryPctSales: { cur: 0 },
    },
    alerts: [], bridge: [], categoryMix: [], marginTrend: [], salaryTrend: [], salaryAccts: [],
    categoryPctTrend: { categories: [], series: [] }, fixedVsVariable: { fixed: 0, variable: 0, suspense: 0 }, table: [], dataNotes: [],
  };
}
