// Computes enriched analytics from the dashboard data model.
// Input shape (from dashboardBuilder.js):
//   itemFacts:   flat array of { tx, date, month, party, accountGroup, state, station,
//                                item, itemGroup, qty, amount, finalAmount, price, isHeader }
//                tx ∈ { "Sales", "Sales Return", "Purchase", "Purchase Return" }
//                finalAmount is bill-level (only populated on header rows) → use for party/bill totals.
//                amount is line-level → use for item-level breakdowns.
//   ledgerFacts: flat array of { tx, date, month, account, accountGroup, debit, credit, businessAmount, isHeader }
//                tx ∈ { "Receipt", "Payment", "Credit Note", "Debit Note", "Journal" }
//                customer collections live on the credit side of Receipt vouchers (account = customer name).
//                vendor payments / expenses live on the debit side of Payment vouchers (account = payee).

const TODAY = new Date();
const FY_ORDER = ["2025-04","2025-05","2025-06","2025-07","2025-08","2025-09","2025-10","2025-11","2025-12","2026-01","2026-02","2026-03"];

const num = (v) => Number(v) || 0;

function daysBetween(d1, d2) {
  return Math.floor((d2 - d1) / 86400000);
}

export function buildAnalytics(dashData) {
  const itemFacts = Array.isArray(dashData?.itemFacts) ? dashData.itemFacts : [];
  const ledgerFacts = Array.isArray(dashData?.ledgerFacts) ? dashData.ledgerFacts : [];

  // ---------------------------------------------------------------- Customers
  const custMap = new Map();
  function cust(name) {
    if (!custMap.has(name)) {
      custMap.set(name, { name, station: "", group: "", grossSales: 0, salesReturn: 0, receipts: 0, months: new Set(), dates: [] });
    }
    return custMap.get(name);
  }

  for (const r of itemFacts) {
    if (r.tx === "Sales") {
      const c = cust(r.party || "Unknown");
      c.grossSales += num(r.finalAmount);
      if (!c.station && r.station) c.station = r.station;
      if (!c.group && r.accountGroup) c.group = r.accountGroup;
      if (r.date) { c.months.add(r.month); c.dates.push(new Date(r.date)); }
    } else if (r.tx === "Sales Return") {
      const c = cust(r.party || "Unknown");
      c.salesReturn += num(r.finalAmount);
    }
  }
  for (const r of ledgerFacts) {
    if (r.tx === "Receipt" && custMap.has(r.account)) {
      custMap.get(r.account).receipts += num(r.credit);
    }
  }

  const totalNetSales = [...custMap.values()].reduce((s, c) => s + c.grossSales - c.salesReturn, 0);

  let cumSales = 0;
  const customers = [...custMap.values()]
    .filter(c => c.grossSales > 0)
    .map(c => {
      const netSales = c.grossSales - c.salesReturn;
      const lastDate = c.dates.length ? new Date(Math.max(...c.dates)) : null;
      const daysSinceLastSale = lastDate ? daysBetween(lastDate, TODAY) : 9999;
      const activeMonths = c.months.size;
      const collectionRate = netSales > 0 ? Math.round((c.receipts / netSales) * 1000) / 10 : 0;
      const pending = netSales - c.receipts;

      const salesScore = totalNetSales > 0 ? (netSales / totalNetSales) * 40 : 0;
      const recencyScore = daysSinceLastSale <= 30 ? 30 : daysSinceLastSale <= 60 ? 20 : daysSinceLastSale <= 90 ? 10 : 0;
      const activeScore = (Math.min(activeMonths, 12) / 12) * 30;
      const score = Math.round(salesScore + recencyScore + activeScore);

      const riskFlag = daysSinceLastSale > 90 ? "🔴 High Risk"
        : daysSinceLastSale > 60 ? "🟡 Medium Risk"
        : daysSinceLastSale > 30 ? "🟠 Watch"
        : "🟢 Active";

      const tier = netSales >= 500000 ? "🏅 Platinum"
        : netSales >= 200000 ? "🥇 Gold"
        : netSales >= 100000 ? "🥈 Silver"
        : "Bronze";

      return { name: c.name, station: c.station, group: c.group, netSales, receipts: c.receipts, pending, collectionRate, lastSaleDate: lastDate ? lastDate.toISOString().slice(0, 10) : null, daysSinceLastSale, activeMonths, avgMonthlySales: activeMonths > 0 ? Math.round(netSales / activeMonths) : 0, score, riskFlag, tier, rank: 0, cumulativePct: 0 };
    })
    .sort((a, b) => b.netSales - a.netSales)
    .map((c, i) => {
      cumSales += c.netSales;
      c.rank = i + 1;
      c.cumulativePct = totalNetSales > 0 ? Math.round((cumSales / totalNetSales) * 1000) / 10 : 0;
      return c;
    });

  // ------------------------------------------------------------------ Vendors
  const vendorMap = new Map();
  function vendor(name) {
    if (!vendorMap.has(name)) vendorMap.set(name, { name, grossPurchase: 0, purchaseReturn: 0, payments: 0 });
    return vendorMap.get(name);
  }
  for (const r of itemFacts) {
    if (r.tx === "Purchase") vendor(r.party || "Unknown").grossPurchase += num(r.finalAmount);
    else if (r.tx === "Purchase Return") vendor(r.party || "Unknown").purchaseReturn += num(r.finalAmount);
  }
  for (const r of ledgerFacts) {
    if (r.tx === "Payment" && vendorMap.has(r.account)) {
      vendorMap.get(r.account).payments += num(r.debit);
    }
  }
  const vendors = [...vendorMap.values()]
    .filter(v => v.grossPurchase > 0)
    .map(v => ({
      name: v.name,
      grossPurchase: v.grossPurchase,
      purchaseReturn: v.purchaseReturn,
      netPurchase: v.grossPurchase - v.purchaseReturn,
      payments: v.payments,
      payable: (v.grossPurchase - v.purchaseReturn) - v.payments,
    }))
    .sort((a, b) => b.netPurchase - a.netPurchase);

  // -------------------------------------------------------------------- Items
  // Item-level uses line-level `amount` (finalAmount is bill-level and would misattribute multi-item bills).
  const itemMap = new Map();
  function item(name) {
    if (!itemMap.has(name)) itemMap.set(name, { name, group: "", grossSales: 0, salesReturn: 0, grossQty: 0, returnQty: 0, purchaseQty: 0, purchaseReturnQty: 0, purchaseAmt: 0 });
    return itemMap.get(name);
  }
  for (const r of itemFacts) {
    const it = item(r.item || "Unknown");
    if (!it.group && r.itemGroup) it.group = r.itemGroup;
    if (r.tx === "Sales") { it.grossSales += num(r.amount); it.grossQty += num(r.qty); }
    else if (r.tx === "Sales Return") { it.salesReturn += num(r.amount); it.returnQty += num(r.qty); }
    else if (r.tx === "Purchase") { it.purchaseQty += num(r.qty); it.purchaseAmt += num(r.amount); }
    else if (r.tx === "Purchase Return") { it.purchaseReturnQty += num(r.qty); it.purchaseAmt -= num(r.amount); }
  }

  const totalItemSales = [...itemMap.values()].reduce((s, it) => s + it.grossSales - it.salesReturn, 0);
  let cumItemSales = 0;
  const items = [...itemMap.values()]
    .filter(it => it.grossSales > 0)
    .map(it => {
      const netSales = it.grossSales - it.salesReturn;
      const netQty = it.grossQty - it.returnQty;
      const purchaseNetQty = it.purchaseQty - it.purchaseReturnQty;
      const avgPurchaseRate = purchaseNetQty > 0 ? it.purchaseAmt / purchaseNetQty : 0;
      return { name: it.name, group: it.group, netSales, netQty, inward: purchaseNetQty, outward: netQty, avgPurchaseRate, rank: 0, cumulativePct: 0 };
    })
    .sort((a, b) => b.netSales - a.netSales)
    .map((it, i) => {
      cumItemSales += it.netSales;
      it.rank = i + 1;
      it.cumulativePct = totalItemSales > 0 ? Math.round((cumItemSales / totalItemSales) * 1000) / 10 : 0;
      return it;
    });

  const stockItems = items.map(it => ({ ...it }));

  // ----------------------------------------------------------------- Expenses
  // Expense = debit side of Payment vouchers, grouped by payee account.
  const expMap = new Map();
  for (const r of ledgerFacts) {
    if (r.tx !== "Payment") continue;
    const debit = num(r.debit);
    if (debit <= 0) continue;
    expMap.set(r.account, (expMap.get(r.account) || 0) + debit);
  }
  const expenses = [...expMap.entries()]
    .map(([accountName, totalExpenses]) => ({ accountName, totalExpenses }))
    .sort((a, b) => b.totalExpenses - a.totalExpenses);

  // ------------------------------------------------------------ Monthly trend
  const monthSales = new Map();
  for (const r of itemFacts) {
    if (r.tx === "Sales") monthSales.set(r.month, (monthSales.get(r.month) || 0) + num(r.finalAmount));
    else if (r.tx === "Sales Return") monthSales.set(r.month, (monthSales.get(r.month) || 0) - num(r.finalAmount));
  }
  const monthlyTrend = FY_ORDER.map((m, i) => ({ month: m, x: i + 1, sales: Math.max(0, monthSales.get(m) || 0) }));

  // --------------------------------------------------------- Linear forecast
  const dataPoints = monthlyTrend.filter(p => p.sales > 0);
  let forecast = { m1: 0, m2: 0, m3: 0 };
  if (dataPoints.length >= 3) {
    const n = dataPoints.length;
    const sumX = dataPoints.reduce((s, p) => s + p.x, 0);
    const sumY = dataPoints.reduce((s, p) => s + p.sales, 0);
    const sumXY = dataPoints.reduce((s, p) => s + p.x * p.sales, 0);
    const sumX2 = dataPoints.reduce((s, p) => s + p.x * p.x, 0);
    const denom = n * sumX2 - sumX * sumX;
    const slope = denom !== 0 ? (n * sumXY - sumX * sumY) / denom : 0;
    const intercept = (sumY - slope * sumX) / n;
    const nextX = dataPoints[dataPoints.length - 1].x + 1;
    forecast = {
      m1: Math.max(0, Math.round(intercept + slope * nextX)),
      m2: Math.max(0, Math.round(intercept + slope * (nextX + 1))),
      m3: Math.max(0, Math.round(intercept + slope * (nextX + 2))),
    };
  }

  const stockSummary = {
    totalClosingValue: 0,
    totalOpeningQty: 0,
    netMovement: items.reduce((s, it) => s + it.netQty, 0),
  };

  return { customers, vendors, items, stockItems, expenses, stockSummary, forecast, monthlyTrend, totalNetSales };
}
