const TODAY = new Date();

function parseAmt(v) {
  return Math.abs(parseFloat(String(v || "0").replace(/[^\d.-]/g, "")) || 0);
}

function parseDateStr(v) {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d) ? null : d;
}

function daysBetween(d1, d2) {
  return Math.floor((d2 - d1) / 86400000);
}

const FY_ORDER = ["2025-04","2025-05","2025-06","2025-07","2025-08","2025-09","2025-10","2025-11","2025-12","2026-01","2026-02","2026-03"];

export function buildAnalytics(dashData) {
  const { itemFacts, ledgerFacts } = dashData;

  const salesRows = itemFacts?.Sales || [];
  const salesReturnRows = itemFacts?.["Sales Return"] || [];
  const purchaseRows = itemFacts?.Purchase || [];
  const purchaseReturnRows = itemFacts?.["Purchase Return"] || [];
  const receiptRows = ledgerFacts?.Receipt || [];
  const paymentRows = ledgerFacts?.Payment || [];

  // --- Customer metrics ---
  const custMap = new Map();
  function ensureCust(name) {
    if (!custMap.has(name)) {
      custMap.set(name, { name, grossSales: 0, salesReturn: 0, receipts: 0, months: new Set(), dates: [] });
    }
    return custMap.get(name);
  }

  for (const row of salesRows) {
    const c = ensureCust(row["Party Name"] || "Unknown");
    c.grossSales += parseAmt(row["Final Amt"]);
    const d = parseDateStr(row["Bill Date"]);
    if (d) {
      c.months.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
      c.dates.push(d);
    }
  }
  for (const row of salesReturnRows) {
    const c = ensureCust(row["Party Name"] || "Unknown");
    c.salesReturn += parseAmt(row["Final Amt"]);
  }
  for (const row of receiptRows) {
    const c = ensureCust(row["Account Name"] || "Unknown");
    c.receipts += parseAmt(row["Debit Amount"]);
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

      return { name: c.name, station: "", group: "", netSales, receipts: c.receipts, pending, collectionRate, lastSaleDate: lastDate ? lastDate.toISOString().slice(0, 10) : null, daysSinceLastSale, activeMonths, avgMonthlySales: activeMonths > 0 ? Math.round(netSales / activeMonths) : 0, score, riskFlag, tier, rank: 0, cumulativePct: 0 };
    })
    .sort((a, b) => b.netSales - a.netSales)
    .map((c, i) => {
      cumSales += c.netSales;
      c.rank = i + 1;
      c.cumulativePct = totalNetSales > 0 ? Math.round((cumSales / totalNetSales) * 1000) / 10 : 0;
      return c;
    });

  // --- Vendor metrics ---
  const vendorMap = new Map();
  for (const row of purchaseRows) {
    const v = row["Party Name"] || "Unknown";
    if (!vendorMap.has(v)) vendorMap.set(v, { name: v, grossPurchase: 0, purchaseReturn: 0, payments: 0 });
    vendorMap.get(v).grossPurchase += parseAmt(row["Final Amt"]);
  }
  for (const row of purchaseReturnRows) {
    const v = row["Party Name"] || "Unknown";
    if (!vendorMap.has(v)) vendorMap.set(v, { name: v, grossPurchase: 0, purchaseReturn: 0, payments: 0 });
    vendorMap.get(v).purchaseReturn += parseAmt(row["Final Amt"]);
  }
  for (const row of paymentRows) {
    const acc = row["Account Name"] || "Unknown";
    if (vendorMap.has(acc)) vendorMap.get(acc).payments += parseAmt(row["Credit Amount"] || "0");
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

  // --- Item metrics ---
  const itemMap = new Map();
  function ensureItem(name) {
    if (!itemMap.has(name)) itemMap.set(name, { name, group: "", grossSales: 0, salesReturn: 0, grossQty: 0, returnQty: 0, purchaseQty: 0, purchaseAmt: 0 });
    return itemMap.get(name);
  }
  for (const row of salesRows) {
    const it = ensureItem(row["Item Name"] || "Unknown");
    it.grossSales += parseAmt(row["Final Amt"]);
    it.grossQty += parseAmt(row["Main Qt"]);
  }
  for (const row of salesReturnRows) {
    const it = ensureItem(row["Item Name"] || "Unknown");
    it.salesReturn += parseAmt(row["Final Amt"]);
    it.returnQty += parseAmt(row["Main Qt"]);
  }
  for (const row of purchaseRows) {
    const it = ensureItem(row["Item Name"] || "Unknown");
    it.purchaseQty += parseAmt(row["Main Qt"]);
    it.purchaseAmt += parseAmt(row["Final Amt"]);
  }
  for (const row of purchaseReturnRows) {
    const it = ensureItem(row["Item Name"] || "Unknown");
    it.purchaseQty -= parseAmt(row["Main Qt"]);
    it.purchaseAmt -= parseAmt(row["Final Amt"]);
  }

  const totalItemSales = [...itemMap.values()].reduce((s, it) => s + it.grossSales - it.salesReturn, 0);
  let cumItemSales = 0;
  const items = [...itemMap.values()]
    .filter(it => it.grossSales > 0)
    .map(it => {
      const netSales = it.grossSales - it.salesReturn;
      const netQty = it.grossQty - it.returnQty;
      const avgPurchaseRate = it.purchaseQty > 0 ? it.purchaseAmt / it.purchaseQty : 0;
      return { name: it.name, group: it.group, netSales, netQty, avgPurchaseRate, rank: 0, cumulativePct: 0 };
    })
    .sort((a, b) => b.netSales - a.netSales)
    .map((it, i) => {
      cumItemSales += it.netSales;
      it.rank = i + 1;
      it.cumulativePct = totalItemSales > 0 ? Math.round((cumItemSales / totalItemSales) * 1000) / 10 : 0;
      return it;
    });

  // Stock items (inward = purchase qty net, outward = sales qty net)
  const stockItems = items.map(it => {
    const inward = purchaseRows.filter(r => r["Item Name"] === it.name).reduce((s, r) => s + parseAmt(r["Main Qt"]), 0)
      - purchaseReturnRows.filter(r => r["Item Name"] === it.name).reduce((s, r) => s + parseAmt(r["Main Qt"]), 0);
    return { ...it, inward, outward: it.netQty };
  });

  // --- Expenses ---
  const expMap = new Map();
  for (const row of paymentRows) {
    const acc = row["Account Name"] || "Unknown";
    expMap.set(acc, (expMap.get(acc) || 0) + parseAmt(row["Debit Amount"]));
  }
  const expenses = [...expMap.entries()]
    .map(([accountName, totalExpenses]) => ({ accountName, totalExpenses }))
    .sort((a, b) => b.totalExpenses - a.totalExpenses);

  // --- Monthly sales trend ---
  const monthSales = new Map();
  for (const row of salesRows) {
    const d = parseDateStr(row["Bill Date"]);
    if (!d) continue;
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    monthSales.set(key, (monthSales.get(key) || 0) + parseAmt(row["Final Amt"]));
  }
  for (const row of salesReturnRows) {
    const d = parseDateStr(row["Bill Date"]);
    if (!d) continue;
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    monthSales.set(key, (monthSales.get(key) || 0) - parseAmt(row["Final Amt"]));
  }
  const monthlyTrend = FY_ORDER.map((m, i) => ({ month: m, x: i + 1, sales: Math.max(0, monthSales.get(m) || 0) }));

  // --- Linear regression forecast ---
  const dataPoints = monthlyTrend.filter(p => p.sales > 0);
  let forecast = { m1: 0, m2: 0, m3: 0 };
  if (dataPoints.length >= 3) {
    const n = dataPoints.length;
    const sumX = dataPoints.reduce((s, p) => s + p.x, 0);
    const sumY = dataPoints.reduce((s, p) => s + p.sales, 0);
    const sumXY = dataPoints.reduce((s, p) => s + p.x * p.sales, 0);
    const sumX2 = dataPoints.reduce((s, p) => s + p.x * p.x, 0);
    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
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
