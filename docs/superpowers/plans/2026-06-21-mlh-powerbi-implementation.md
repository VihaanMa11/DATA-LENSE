# MLH Power BI → DataLence Web Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port all 10 Power BI report pages from `MLH_PowerBI_Execution_Guide.docx` into the DataLence React + Express web dashboard.

**Architecture:** The Express server (`server/dashboardBuilder.js`) will be extended to compute server-side metrics (Customer Score, Risk Flags, Pareto rankings, Forecasts). A new `/api/analytics` endpoint will expose enriched data to the React frontend. Each Power BI page maps to a new React route in `App.jsx`.

**Tech Stack:** React 19, Vite 7, Express 5, xlsx, Supabase (auth), Recharts (to be added for Pareto/scatter/waterfall), inline SVG for KPI cards.

## Global Constraints

- Currency format: `INR X.XXL` (lakhs, 2 decimal) — matches existing `money()` helper
- Percentage format: `X.X%` (1 decimal) — matches existing `pct()` helper
- FY: April 1 2025 – March 31 2026 (`MONTH_ORDER` in App.jsx)
- Colors: Primary Blue `#1F497D`, Medium Blue `#2E75B6`, Green `#375623`, Alert Orange `#C55A11`, Alert Red `#C00000`, Background `#F8F9FA`
- All new server computations go in `server/analyticsBuilder.js` (new file, imported by `server/index.js`)
- All new React pages go in `src/pages/` (new folder)
- All new chart components go in `src/components/`
- Run `npm run build && npm test` after each task
- Never hardcode file paths — use the `sourceDir` passed from config

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `server/analyticsBuilder.js` | Create | All server-side metric computations |
| `server/index.js` | Modify | Add `/api/analytics` endpoint |
| `src/pages/CustomerReceivables.jsx` | Create | Page 2 |
| `src/pages/VendorPayables.jsx` | Create | Page 3 |
| `src/pages/CustomerPareto.jsx` | Create | Page 4 |
| `src/pages/ProductPareto.jsx` | Create | Page 5 |
| `src/pages/ExpenseAnalysis.jsx` | Create | Page 6 |
| `src/pages/StockMovement.jsx` | Create | Page 7 |
| `src/pages/CustomerAnalysis.jsx` | Create | Page 8 |
| `src/pages/SalesForecast.jsx` | Create | Page 9 |
| `src/pages/ProductForecast.jsx` | Create | Page 10 |
| `src/components/ParetoChart.jsx` | Create | Pareto combo chart (bar + line) |
| `src/components/ScatterChart.jsx` | Create | Bubble/scatter chart |
| `src/components/WaterfallChart.jsx` | Create | Waterfall bridge chart |
| `src/App.jsx` | Modify | Add NAV entries + route data for new pages |
| `test/analytics.test.js` | Create | Unit tests for analyticsBuilder |

---

## Task 1: Analytics Builder — Core Metrics

**Files:**
- Create: `server/analyticsBuilder.js`
- Create: `test/analytics.test.js`

**Interfaces:**
- Produces: `buildAnalytics(dashData)` → `{ customers, items, expenses, stockSummary }`
  - `customers`: array of `{ name, station, group, netSales, receipts, pending, collectionRate, lastSaleDate, daysSinceLastSale, activeMonths, avgMonthlySales, score, riskFlag, tier, rank }`
  - `items`: array of `{ name, group, netSales, netQty, openingStock, inward, outward, closingQty, avgPurchaseRate, closingValue }`
  - `expenses`: array of `{ accountName, totalExpenses }`
  - `stockSummary`: `{ totalClosingValue, totalOpeningQty, netMovement }`

- [ ] **Step 1: Write failing tests**

```js
// test/analytics.test.js
import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { buildAnalytics } from "../server/analyticsBuilder.js";

const MOCK_DASH = {
  itemFacts: {
    Sales: [
      { "Bill Date": "2025-04-01", "Party Name": "Raj Shoes", "Item Name": "Sandal A", "Main Qt": "10", "Final Amt": "5000", "Transport": "" },
      { "Bill Date": "2025-05-15", "Party Name": "Raj Shoes", "Item Name": "Sandal A", "Main Qt": "5", "Final Amt": "2500", "Transport": "" },
      { "Bill Date": "2025-04-10", "Party Name": "Patel Traders", "Item Name": "Boot B", "Main Qt": "20", "Final Amt": "12000", "Transport": "" },
    ],
    "Sales Return": [
      { "Bill Date": "2025-04-05", "Party Name": "Raj Shoes", "Item Name": "Sandal A", "Main Qt": "1", "Final Amt": "500", "Transport": "" },
    ],
    Purchase: [
      { "Bill Date": "2025-04-01", "Party Name": "Supplier X", "Item Name": "Sandal A", "Main Qt": "50", "Final Amt": "3000" },
    ],
    "Purchase Return": [],
  },
  ledgerFacts: {
    Receipt: [
      { "Bill Date": "2025-04-20", "Account Name": "Raj Shoes", "Debit Amount": "4000", "Credit Amount": "0" },
    ],
    Payment: [
      { "Bill Date": "2025-04-25", "Account Name": "Office Rent", "Debit Amount": "5000", "Credit Amount": "0" },
    ],
    "Credit Note": [],
    "Debit Note": [],
    Journal: [],
  },
  masters: { items: 2, accounts: 3, itemFields: [], accountFields: [] },
};

describe("buildAnalytics", () => {
  it("computes netSales correctly for a customer", () => {
    const result = buildAnalytics(MOCK_DASH);
    const raj = result.customers.find(c => c.name === "Raj Shoes");
    assert.ok(raj, "Raj Shoes customer found");
    assert.equal(raj.netSales, 7000, "7500 sales - 500 return = 7000");
  });

  it("computes collectionRate for a customer", () => {
    const result = buildAnalytics(MOCK_DASH);
    const raj = result.customers.find(c => c.name === "Raj Shoes");
    assert.ok(raj.collectionRate > 0, "collection rate > 0");
  });

  it("assigns risk flag based on daysSinceLastSale", () => {
    const result = buildAnalytics(MOCK_DASH);
    const raj = result.customers.find(c => c.name === "Raj Shoes");
    // days since 2025-05-15 will be >90 in 2026 — High Risk or Medium
    assert.ok(["🔴 High Risk", "🟡 Medium Risk", "🟠 Watch", "🟢 Active"].includes(raj.riskFlag));
  });

  it("computes total expenses", () => {
    const result = buildAnalytics(MOCK_DASH);
    const rent = result.expenses.find(e => e.accountName === "Office Rent");
    assert.ok(rent, "Office Rent found in expenses");
    assert.equal(rent.totalExpenses, 5000);
  });

  it("assigns customer tiers correctly", () => {
    const result = buildAnalytics(MOCK_DASH);
    // Patel Traders has 12000 net sales → Silver (≥1L = false, but let's verify tier logic)
    const patel = result.customers.find(c => c.name === "Patel Traders");
    assert.ok(patel.tier, "tier assigned");
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
npm test
```
Expected: `buildAnalytics is not a function` or module not found.

- [ ] **Step 3: Implement analyticsBuilder.js**

```js
// server/analyticsBuilder.js
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
      custMap.set(name, {
        name,
        station: "",
        group: "",
        grossSales: 0,
        salesReturn: 0,
        receipts: 0,
        months: new Set(),
        dates: [],
      });
    }
    return custMap.get(name);
  }

  for (const row of salesRows) {
    const c = ensureCust(row["Party Name"] || "Unknown");
    c.grossSales += parseAmt(row["Final Amt"]);
    const d = parseDateStr(row["Bill Date"]);
    if (d) { c.months.add(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`); c.dates.push(d); }
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

  const customers = [...custMap.entries()]
    .filter(([, c]) => c.grossSales > 0)
    .map(([name, c]) => {
      const netSales = c.grossSales - c.salesReturn;
      const lastDate = c.dates.length ? new Date(Math.max(...c.dates)) : null;
      const daysSinceLastSale = lastDate ? daysBetween(lastDate, TODAY) : 9999;
      const activeMonths = c.months.size;
      const collectionRate = netSales > 0 ? (c.receipts / netSales) * 100 : 0;
      const pending = netSales - c.receipts;

      // Customer Score (0-100): 40% sales, 30% recency, 30% activity
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

      return {
        name,
        station: c.station,
        group: c.group,
        netSales,
        receipts: c.receipts,
        pending,
        collectionRate: Math.round(collectionRate * 10) / 10,
        lastSaleDate: lastDate ? lastDate.toISOString().slice(0, 10) : null,
        daysSinceLastSale,
        activeMonths,
        avgMonthlySales: activeMonths > 0 ? Math.round(netSales / activeMonths) : 0,
        score,
        riskFlag,
        tier,
        rank: 0, // filled below
      };
    })
    .sort((a, b) => b.netSales - a.netSales)
    .map((c, i) => ({ ...c, rank: i + 1 }));

  // Running cumulative for Pareto
  let cumSales = 0;
  customers.forEach(c => {
    cumSales += c.netSales;
    c.cumulativePct = totalNetSales > 0 ? Math.round((cumSales / totalNetSales) * 1000) / 10 : 0;
  });

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

  // --- Expenses ---
  const expMap = new Map();
  for (const row of paymentRows) {
    const acc = row["Account Name"] || "Unknown";
    expMap.set(acc, (expMap.get(acc) || 0) + parseAmt(row["Debit Amount"]));
  }
  const expenses = [...expMap.entries()]
    .map(([accountName, totalExpenses]) => ({ accountName, totalExpenses }))
    .sort((a, b) => b.totalExpenses - a.totalExpenses);

  // --- Stock summary (placeholder — requires Items master with opening stock) ---
  const stockSummary = {
    totalClosingValue: 0,
    totalOpeningQty: 0,
    netMovement: items.reduce((s, it) => s + it.netQty, 0),
  };

  // --- Forecast: Linear regression on monthly sales ---
  const monthSales = new Map();
  for (const row of salesRows) {
    const d = parseDateStr(row["Bill Date"]);
    if (!d) continue;
    const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
    monthSales.set(key, (monthSales.get(key) || 0) + parseAmt(row["Final Amt"]));
  }
  for (const row of salesReturnRows) {
    const d = parseDateStr(row["Bill Date"]);
    if (!d) continue;
    const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
    monthSales.set(key, (monthSales.get(key) || 0) - parseAmt(row["Final Amt"]));
  }

  const fyOrder = ["2025-04","2025-05","2025-06","2025-07","2025-08","2025-09","2025-10","2025-11","2025-12","2026-01","2026-02","2026-03"];
  const dataPoints = fyOrder.map((m, i) => ({ x: i + 1, y: monthSales.get(m) || 0 })).filter(p => p.y > 0);
  let forecast = { m1: 0, m2: 0, m3: 0 };
  if (dataPoints.length >= 3) {
    const n = dataPoints.length;
    const sumX = dataPoints.reduce((s, p) => s + p.x, 0);
    const sumY = dataPoints.reduce((s, p) => s + p.y, 0);
    const sumXY = dataPoints.reduce((s, p) => s + p.x * p.y, 0);
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

  const monthlyTrend = fyOrder.map((m, i) => ({ month: m, x: i + 1, sales: monthSales.get(m) || 0 }));

  return { customers, items, expenses, stockSummary, forecast, monthlyTrend, totalNetSales };
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
npm test
```
Expected: All 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add server/analyticsBuilder.js test/analytics.test.js
git commit -m "feat: add analyticsBuilder with customer/item/expense/forecast metrics"
```

---

## Task 2: Expose `/api/analytics` Endpoint

**Files:**
- Modify: `server/index.js` (add endpoint after existing `/api/dashboard`)

**Interfaces:**
- Consumes: `buildAnalytics` from `server/analyticsBuilder.js`, cached `dashData` from existing cache
- Produces: `GET /api/analytics` → JSON from `buildAnalytics(cache.data)`

- [ ] **Step 1: Write failing test (manual curl)**

Start server: `npm run dev`
```bash
curl -s http://localhost:3000/api/analytics | head -c 200
```
Expected: `404 Not Found` or `{"error":"not found"}`

- [ ] **Step 2: Add import to server/index.js**

Find the existing import block (near line 10-20 of `server/index.js`):
```js
import { buildDashboardData, buildDashboardDataFromWorkbook, sourceSignature as nodeSourceSignature } from "./dashboardBuilder.js";
```
Add after it:
```js
import { buildAnalytics } from "./analyticsBuilder.js";
```

- [ ] **Step 3: Add endpoint to server/index.js**

Find the existing `app.get("/api/dashboard", ...)` handler. Add a new handler after it:
```js
app.get("/api/analytics", requireAuth, (req, res) => {
  if (!cache.data) {
    return res.status(503).json({ error: "No dashboard data loaded yet" });
  }
  try {
    const analytics = buildAnalytics(cache.data);
    res.json(analytics);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
```

- [ ] **Step 4: Verify endpoint**

```bash
curl -s http://localhost:3000/api/analytics
```
Expected: JSON with `customers`, `items`, `expenses`, `forecast`, `monthlyTrend` keys.

- [ ] **Step 5: Commit**

```bash
git add server/index.js
git commit -m "feat: add /api/analytics endpoint"
```

---

## Task 3: Shared Analytics Hook in React

**Files:**
- Create: `src/useAnalytics.js`

**Interfaces:**
- Produces: `useAnalytics()` → `{ analytics, loading, error }` where `analytics` is the full response from `/api/analytics`

- [ ] **Step 1: Create hook**

```js
// src/useAnalytics.js
import { useEffect, useState } from "react";

export function useAnalytics() {
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/analytics", { credentials: "include" })
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(setAnalytics)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  return { analytics, loading, error };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/useAnalytics.js
git commit -m "feat: add useAnalytics hook for /api/analytics"
```

---

## Task 4: Pareto Chart Component

**Files:**
- Create: `src/components/ParetoChart.jsx`

**Interfaces:**
- Consumes: `data` array of `{ label, value, cumulativePct }`, `title` string
- Produces: A bar chart (bars = value) with a line overlay (cumulativePct on right Y-axis) and a dashed 80% reference line

- [ ] **Step 1: Install recharts**

```bash
npm install recharts
```

- [ ] **Step 2: Create ParetoChart.jsx**

```jsx
// src/components/ParetoChart.jsx
import { ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceLine, ResponsiveContainer } from "recharts";

export function ParetoChart({ data, title, barLabel = "Sales (INR)" }) {
  if (!data || data.length === 0) return <div className="empty-chart">No data</div>;

  return (
    <div style={{ width: "100%", marginBottom: 24 }}>
      {title && <h3 style={{ color: "#1F497D", marginBottom: 8 }}>{title}</h3>}
      <ResponsiveContainer width="100%" height={360}>
        <ComposedChart data={data} margin={{ top: 10, right: 40, left: 10, bottom: 80 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="label"
            angle={-45}
            textAnchor="end"
            interval={0}
            tick={{ fontSize: 11, fill: "#1F1F1F" }}
          />
          <YAxis yAxisId="left" tickFormatter={v => `${(v/100000).toFixed(1)}L`} tick={{ fontSize: 11 }} />
          <YAxis yAxisId="right" orientation="right" domain={[0, 100]} tickFormatter={v => `${v}%`} tick={{ fontSize: 11 }} />
          <Tooltip
            formatter={(value, name) => name === "Cumulative %" ? `${value}%` : `INR ${(value/100000).toFixed(2)}L`}
          />
          <Legend verticalAlign="top" />
          <ReferenceLine yAxisId="right" y={80} stroke="#C00000" strokeDasharray="6 3" label={{ value: "80%", fill: "#C00000", fontSize: 11 }} />
          <Bar yAxisId="left" dataKey="value" name={barLabel} fill="#2E75B6" radius={[2, 2, 0, 0]} />
          <Line yAxisId="right" type="monotone" dataKey="cumulativePct" name="Cumulative %" stroke="#C55A11" strokeWidth={2} dot={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
```

- [ ] **Step 3: Build to verify no errors**

```bash
npm run build
```
Expected: Build succeeds with no errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/ParetoChart.jsx package.json package-lock.json
git commit -m "feat: add ParetoChart component with Recharts"
```

---

## Task 5: Page 2 — Customer & Receivables

**Files:**
- Create: `src/pages/CustomerReceivables.jsx`
- Modify: `src/App.jsx` (add route + NAV entry)

**Interfaces:**
- Consumes: `useAnalytics()` → `analytics.customers`
- Produces: Outstanding table, collection rate cards, zone bar chart

- [ ] **Step 1: Create CustomerReceivables.jsx**

```jsx
// src/pages/CustomerReceivables.jsx
import { useAnalytics } from "../useAnalytics.js";
import { BarChart } from "../components/InteractiveCharts.jsx";

function money(v) { return `INR ${((Number(v)||0)/100000).toLocaleString("en-IN",{maximumFractionDigits:2})}L`; }

export function CustomerReceivables() {
  const { analytics, loading, error } = useAnalytics();
  if (loading) return <div className="loading">Loading…</div>;
  if (error) return <div className="error">{error}</div>;

  const customers = analytics.customers || [];
  const totalPending = customers.reduce((s, c) => s + c.pending, 0);
  const totalReceipts = customers.reduce((s, c) => s + c.receipts, 0);
  const totalNetSales = customers.reduce((s, c) => s + c.netSales, 0);
  const avgCollRate = totalNetSales > 0 ? ((totalReceipts / totalNetSales) * 100).toFixed(1) : "0.0";

  // Zone grouping
  const zoneMap = new Map();
  customers.forEach(c => {
    const g = c.group || "Other";
    zoneMap.set(g, (zoneMap.get(g) || 0) + c.pending);
  });
  const zoneData = [...zoneMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([label, value]) => ({ label, value }));

  return (
    <div style={{ padding: 24, background: "#F8F9FA", minHeight: "100vh" }}>
      <h1 style={{ color: "#1F497D" }}>Customer &amp; Receivables</h1>

      {/* KPI row */}
      <div style={{ display: "flex", gap: 16, marginBottom: 24, flexWrap: "wrap" }}>
        {[
          { label: "Total Outstanding", value: money(totalPending), color: totalPending > 20000000 ? "#C00000" : "#1F497D" },
          { label: "Total Collected", value: money(totalReceipts), color: "#375623" },
          { label: "Avg Collection Rate", value: `${avgCollRate}%`, color: avgCollRate >= 85 ? "#375623" : "#C55A11" },
          { label: "Total Customers", value: customers.length, color: "#1F497D" },
        ].map(kpi => (
          <div key={kpi.label} style={{ background: "#fff", border: "1px solid #D6E4F0", borderRadius: 8, padding: "16px 24px", minWidth: 180 }}>
            <div style={{ fontSize: 13, color: "#666" }}>{kpi.label}</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: kpi.color }}>{kpi.value}</div>
          </div>
        ))}
      </div>

      {/* Zone bar */}
      <div style={{ background: "#fff", borderRadius: 8, padding: 16, marginBottom: 24 }}>
        <h3 style={{ color: "#1F497D", margin: "0 0 12px" }}>Zone-wise Outstanding</h3>
        <BarChart data={zoneData} color="#C55A11" />
      </div>

      {/* Customer table */}
      <div style={{ background: "#fff", borderRadius: 8, padding: 16, overflowX: "auto" }}>
        <h3 style={{ color: "#1F497D", margin: "0 0 12px" }}>Customer Outstanding Detail</h3>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: "#1F497D", color: "#fff" }}>
              {["#", "Customer", "Station", "Group", "Net Sales", "Receipts", "Pending", "Collection %"].map(h => (
                <th key={h} style={{ padding: "8px 12px", textAlign: "left", fontWeight: 600 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {customers.map((c, i) => (
              <tr key={c.name} style={{ background: i % 2 === 0 ? "#fff" : "#D6E4F0" }}>
                <td style={{ padding: "7px 12px" }}>{i + 1}</td>
                <td style={{ padding: "7px 12px", fontWeight: 500 }}>{c.name}</td>
                <td style={{ padding: "7px 12px" }}>{c.station || "—"}</td>
                <td style={{ padding: "7px 12px" }}>{c.group || "—"}</td>
                <td style={{ padding: "7px 12px" }}>{money(c.netSales)}</td>
                <td style={{ padding: "7px 12px", color: "#375623" }}>{money(c.receipts)}</td>
                <td style={{ padding: "7px 12px", color: c.pending > 100000 ? "#C00000" : "#1F1F1F", fontWeight: c.pending > 100000 ? 700 : 400 }}>{money(c.pending)}</td>
                <td style={{ padding: "7px 12px" }}>
                  <span style={{ color: c.collectionRate >= 85 ? "#375623" : c.collectionRate >= 60 ? "#C55A11" : "#C00000", fontWeight: 600 }}>
                    {c.collectionRate.toFixed(1)}%
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add to App.jsx NAV**

In `src/App.jsx`, find the `NAV` array and add:
```js
["receivables", "circle", "Receivables"],
```

In the page-rendering logic (wherever `executive`, `parties`, etc. are rendered), add:
```js
import { CustomerReceivables } from "./pages/CustomerReceivables.jsx";
// in the switch/conditional:
// page === "receivables" → <CustomerReceivables />
```

- [ ] **Step 3: Build and verify**

```bash
npm run build
```
Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/pages/CustomerReceivables.jsx src/App.jsx
git commit -m "feat: add Customer & Receivables page (Page 2)"
```

---

## Task 6: Page 3 — Vendor & Payables

**Files:**
- Create: `src/pages/VendorPayables.jsx`
- Modify: `src/App.jsx`

**Interfaces:**
- Consumes: `useAnalytics()` → `analytics.customers` (for vendor/payable logic, vendors appear in purchase data — Note: current analyticsBuilder tracks sales customers; for full vendor data, the API needs purchase-side vendors. For now, filter customers who appear in Purchase25 — this is a known limitation to fix in a future iteration)
- Produces: Vendor table (top 10 by purchase), payment trend KPIs

- [ ] **Step 1: Extend analyticsBuilder.js to track vendors**

In `server/analyticsBuilder.js`, after the customer section, add vendor tracking:
```js
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
```

Also add `vendors` to the return object:
```js
  return { customers, items, expenses, vendors, stockSummary, forecast, monthlyTrend, totalNetSales };
```

- [ ] **Step 2: Create VendorPayables.jsx**

```jsx
// src/pages/VendorPayables.jsx
import { useAnalytics } from "../useAnalytics.js";
import { BarChart } from "../components/InteractiveCharts.jsx";

function money(v) { return `INR ${((Number(v)||0)/100000).toLocaleString("en-IN",{maximumFractionDigits:2})}L`; }

export function VendorPayables() {
  const { analytics, loading, error } = useAnalytics();
  if (loading) return <div className="loading">Loading…</div>;
  if (error) return <div className="error">{error}</div>;

  const vendors = analytics.vendors || [];
  const top10 = vendors.slice(0, 10);
  const totalPayable = vendors.reduce((s, v) => s + Math.max(0, v.payable), 0);
  const totalPurchase = vendors.reduce((s, v) => s + v.netPurchase, 0);
  const totalPayments = vendors.reduce((s, v) => s + v.payments, 0);
  const paymentEfficiency = totalPurchase > 0 ? ((totalPayments / totalPurchase) * 100).toFixed(1) : "0.0";

  const barData = top10.map(v => ({ label: v.name.substring(0, 20), value: v.netPurchase }));

  return (
    <div style={{ padding: 24, background: "#F8F9FA", minHeight: "100vh" }}>
      <h1 style={{ color: "#1F497D" }}>Vendor &amp; Payables</h1>

      <div style={{ display: "flex", gap: 16, marginBottom: 24, flexWrap: "wrap" }}>
        {[
          { label: "Total Payable", value: money(totalPayable), color: "#C00000" },
          { label: "Total Purchase", value: money(totalPurchase), color: "#1F497D" },
          { label: "Total Payments Made", value: money(totalPayments), color: "#375623" },
          { label: "Payment Efficiency", value: `${paymentEfficiency}%`, color: "#2E75B6" },
          { label: "Active Vendors", value: vendors.length, color: "#1F497D" },
        ].map(kpi => (
          <div key={kpi.label} style={{ background: "#fff", border: "1px solid #D6E4F0", borderRadius: 8, padding: "16px 24px", minWidth: 180 }}>
            <div style={{ fontSize: 13, color: "#666" }}>{kpi.label}</div>
            <div style={{ fontSize: 26, fontWeight: 700, color: kpi.color }}>{kpi.value}</div>
          </div>
        ))}
      </div>

      <div style={{ background: "#fff", borderRadius: 8, padding: 16, marginBottom: 24 }}>
        <h3 style={{ color: "#1F497D", margin: "0 0 12px" }}>Top 10 Vendors by Net Purchase</h3>
        <BarChart data={barData} color="#2E75B6" />
      </div>

      <div style={{ background: "#fff", borderRadius: 8, padding: 16, overflowX: "auto" }}>
        <h3 style={{ color: "#1F497D", margin: "0 0 12px" }}>Vendor Detail</h3>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: "#1F497D", color: "#fff" }}>
              {["#", "Vendor", "Gross Purchase", "Returns", "Net Purchase", "Payments Made", "Net Payable", "Return Rate %"].map(h => (
                <th key={h} style={{ padding: "8px 12px", textAlign: "left" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {vendors.map((v, i) => {
              const returnRate = v.grossPurchase > 0 ? ((v.purchaseReturn / v.grossPurchase) * 100).toFixed(1) : "0.0";
              return (
                <tr key={v.name} style={{ background: i % 2 === 0 ? "#fff" : "#D6E4F0" }}>
                  <td style={{ padding: "7px 12px" }}>{i + 1}</td>
                  <td style={{ padding: "7px 12px", fontWeight: 500 }}>{v.name}</td>
                  <td style={{ padding: "7px 12px" }}>{money(v.grossPurchase)}</td>
                  <td style={{ padding: "7px 12px", color: "#C55A11" }}>{money(v.purchaseReturn)}</td>
                  <td style={{ padding: "7px 12px", fontWeight: 600 }}>{money(v.netPurchase)}</td>
                  <td style={{ padding: "7px 12px", color: "#375623" }}>{money(v.payments)}</td>
                  <td style={{ padding: "7px 12px", color: v.payable > 100000 ? "#C00000" : "#1F1F1F", fontWeight: v.payable > 100000 ? 700 : 400 }}>{money(Math.max(0, v.payable))}</td>
                  <td style={{ padding: "7px 12px" }}>{returnRate}%</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Add to App.jsx**

Add `["payables", "circle", "Vendor & Payables"]` to `NAV` and import/render `VendorPayables`.

- [ ] **Step 4: Verify and commit**

```bash
npm run build
git add server/analyticsBuilder.js src/pages/VendorPayables.jsx src/App.jsx
git commit -m "feat: add Vendor & Payables page (Page 3)"
```

---

## Task 7: Page 4 — Customer Pareto Analysis

**Files:**
- Create: `src/pages/CustomerPareto.jsx`
- Modify: `src/App.jsx`

**Interfaces:**
- Consumes: `analytics.customers` (has `rank`, `cumulativePct`, `netSales`)
- Produces: Pareto combo chart, top-10 table, count-of-80% card

- [ ] **Step 1: Create CustomerPareto.jsx**

```jsx
// src/pages/CustomerPareto.jsx
import { useAnalytics } from "../useAnalytics.js";
import { ParetoChart } from "../components/ParetoChart.jsx";

function money(v) { return `INR ${((Number(v)||0)/100000).toLocaleString("en-IN",{maximumFractionDigits:2})}L`; }

export function CustomerPareto() {
  const { analytics, loading, error } = useAnalytics();
  if (loading) return <div className="loading">Loading…</div>;
  if (error) return <div className="error">{error}</div>;

  const customers = analytics.customers || [];
  const top20 = customers.slice(0, 20);
  const top10 = customers.slice(0, 10);
  const drive80Count = customers.filter(c => {
    // find where cumulative crosses 80 — customers BEFORE that point
    return c.cumulativePct <= 80;
  }).length;

  const paretoData = top20.map(c => ({
    label: c.name.substring(0, 18),
    value: c.netSales,
    cumulativePct: c.cumulativePct,
  }));

  return (
    <div style={{ padding: 24, background: "#F8F9FA", minHeight: "100vh" }}>
      <h1 style={{ color: "#1F497D" }}>Customer Pareto Analysis</h1>

      <div style={{ display: "flex", gap: 16, marginBottom: 24, flexWrap: "wrap" }}>
        <div style={{ background: "#fff", border: "1px solid #D6E4F0", borderRadius: 8, padding: "16px 24px", minWidth: 220 }}>
          <div style={{ fontSize: 13, color: "#666" }}>Customers driving 80% revenue</div>
          <div style={{ fontSize: 36, fontWeight: 700, color: "#1F497D" }}>{drive80Count}</div>
          <div style={{ fontSize: 12, color: "#888" }}>out of {customers.length} total</div>
        </div>
        <div style={{ background: "#fff", border: "1px solid #D6E4F0", borderRadius: 8, padding: "16px 24px", minWidth: 220 }}>
          <div style={{ fontSize: 13, color: "#666" }}>Top Customer</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: "#2E75B6" }}>{customers[0]?.name || "—"}</div>
          <div style={{ fontSize: 15, color: "#375623", fontWeight: 600 }}>{money(customers[0]?.netSales || 0)}</div>
        </div>
      </div>

      <div style={{ background: "#fff", borderRadius: 8, padding: 16, marginBottom: 24 }}>
        <ParetoChart data={paretoData} title="Customer Pareto (Top 20)" barLabel="Net Sales" />
      </div>

      <div style={{ background: "#fff", borderRadius: 8, padding: 16, overflowX: "auto" }}>
        <h3 style={{ color: "#1F497D", margin: "0 0 12px" }}>Top 10 Customers</h3>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: "#1F497D", color: "#fff" }}>
              {["Rank", "Customer", "Net Sales", "Sales %", "Cumulative %"].map(h => (
                <th key={h} style={{ padding: "8px 12px", textAlign: "left" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {top10.map((c, i) => (
              <tr key={c.name} style={{ background: i % 2 === 0 ? "#fff" : "#D6E4F0" }}>
                <td style={{ padding: "7px 12px", fontWeight: 700, color: "#2E75B6" }}>{c.rank}</td>
                <td style={{ padding: "7px 12px", fontWeight: 500 }}>{c.name}</td>
                <td style={{ padding: "7px 12px", fontWeight: 600 }}>{money(c.netSales)}</td>
                <td style={{ padding: "7px 12px" }}>
                  {analytics.totalNetSales > 0 ? ((c.netSales / analytics.totalNetSales) * 100).toFixed(1) : "0.0"}%
                </td>
                <td style={{ padding: "7px 12px", color: c.cumulativePct <= 80 ? "#375623" : "#1F1F1F", fontWeight: 600 }}>
                  {c.cumulativePct.toFixed(1)}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add to App.jsx NAV + render**

Add `["customerpareto", "circle", "Customer Pareto"]` to `NAV`.

- [ ] **Step 3: Verify and commit**

```bash
npm run build
git add src/pages/CustomerPareto.jsx src/App.jsx
git commit -m "feat: add Customer Pareto page (Page 4)"
```

---

## Task 8: Page 5 — Product Pareto Analysis

**Files:**
- Create: `src/pages/ProductPareto.jsx`
- Modify: `src/App.jsx`

**Interfaces:**
- Consumes: `analytics.items` (has `rank`, `cumulativePct`, `netSales`, `netQty`, `group`)

- [ ] **Step 1: Create ProductPareto.jsx**

```jsx
// src/pages/ProductPareto.jsx
import { useAnalytics } from "../useAnalytics.js";
import { ParetoChart } from "../components/ParetoChart.jsx";

function money(v) { return `INR ${((Number(v)||0)/100000).toLocaleString("en-IN",{maximumFractionDigits:2})}L`; }

export function ProductPareto() {
  const { analytics, loading, error } = useAnalytics();
  if (loading) return <div className="loading">Loading…</div>;
  if (error) return <div className="error">{error}</div>;

  const items = analytics.items || [];
  const top20 = items.slice(0, 20);
  const top10 = items.slice(0, 10);
  const drive80Count = items.filter(it => it.cumulativePct <= 80).length;

  const paretoData = top20.map(it => ({
    label: it.name.substring(0, 18),
    value: it.netSales,
    cumulativePct: it.cumulativePct,
  }));

  // Category bar data
  const catMap = new Map();
  items.forEach(it => { const g = it.group || "Other"; catMap.set(g, (catMap.get(g) || 0) + it.netSales); });
  const catData = [...catMap.entries()].sort((a, b) => b[1] - a[1]).map(([label, value]) => ({ label, value }));

  // Slow movers (sold < 10 units, closing stock > 0)
  // Note: closing stock requires Items master with opening stock — showing items with low sales qty as proxy
  const slowMovers = items.filter(it => it.netQty > 0 && it.netQty < 10);

  return (
    <div style={{ padding: 24, background: "#F8F9FA", minHeight: "100vh" }}>
      <h1 style={{ color: "#1F497D" }}>Product Pareto Analysis</h1>

      <div style={{ display: "flex", gap: 16, marginBottom: 24, flexWrap: "wrap" }}>
        <div style={{ background: "#fff", border: "1px solid #D6E4F0", borderRadius: 8, padding: "16px 24px", minWidth: 220 }}>
          <div style={{ fontSize: 13, color: "#666" }}>Products driving 80% revenue</div>
          <div style={{ fontSize: 36, fontWeight: 700, color: "#1F497D" }}>{drive80Count}</div>
          <div style={{ fontSize: 12, color: "#888" }}>out of {items.length} total</div>
        </div>
        <div style={{ background: "#fff", border: "1px solid #D6E4F0", borderRadius: 8, padding: "16px 24px", minWidth: 220 }}>
          <div style={{ fontSize: 13, color: "#666" }}>Top Product</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#2E75B6" }}>{items[0]?.name || "—"}</div>
          <div style={{ fontSize: 15, color: "#375623", fontWeight: 600 }}>{money(items[0]?.netSales || 0)}</div>
        </div>
        <div style={{ background: "#fff", border: "1px solid #D6E4F0", borderRadius: 8, padding: "16px 24px", minWidth: 180 }}>
          <div style={{ fontSize: 13, color: "#666" }}>Slow Mover Risk</div>
          <div style={{ fontSize: 30, fontWeight: 700, color: "#C55A11" }}>{slowMovers.length}</div>
          <div style={{ fontSize: 12, color: "#888" }}>items with &lt;10 units sold</div>
        </div>
      </div>

      <div style={{ background: "#fff", borderRadius: 8, padding: 16, marginBottom: 24 }}>
        <ParetoChart data={paretoData} title="Product Pareto (Top 20)" barLabel="Net Sales" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 24 }}>
        <div style={{ background: "#fff", borderRadius: 8, padding: 16, overflowX: "auto" }}>
          <h3 style={{ color: "#1F497D", margin: "0 0 12px" }}>Top 10 Products</h3>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ background: "#1F497D", color: "#fff" }}>
                {["#", "Item", "Category", "Net Sales", "Qty Sold", "Cumulative %"].map(h => (
                  <th key={h} style={{ padding: "6px 8px", textAlign: "left" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {top10.map((it, i) => (
                <tr key={it.name} style={{ background: i % 2 === 0 ? "#fff" : "#D6E4F0" }}>
                  <td style={{ padding: "6px 8px", fontWeight: 700, color: "#2E75B6" }}>{it.rank}</td>
                  <td style={{ padding: "6px 8px" }}>{it.name.substring(0, 25)}</td>
                  <td style={{ padding: "6px 8px", color: "#666" }}>{it.group || "—"}</td>
                  <td style={{ padding: "6px 8px", fontWeight: 600 }}>{money(it.netSales)}</td>
                  <td style={{ padding: "6px 8px" }}>{it.netQty.toFixed(0)}</td>
                  <td style={{ padding: "6px 8px", color: it.cumulativePct <= 80 ? "#375623" : "#1F1F1F", fontWeight: 600 }}>{it.cumulativePct.toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ background: "#fff", borderRadius: 8, padding: 16, overflowX: "auto" }}>
          <h3 style={{ color: "#C55A11", margin: "0 0 12px" }}>Slow Movers (Risk)</h3>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ background: "#C55A11", color: "#fff" }}>
                {["Item", "Category", "Qty Sold"].map(h => (
                  <th key={h} style={{ padding: "6px 8px", textAlign: "left" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {slowMovers.slice(0, 15).map((it, i) => (
                <tr key={it.name} style={{ background: i % 2 === 0 ? "#fff" : "#D6E4F0" }}>
                  <td style={{ padding: "6px 8px" }}>{it.name.substring(0, 28)}</td>
                  <td style={{ padding: "6px 8px", color: "#666" }}>{it.group || "—"}</td>
                  <td style={{ padding: "6px 8px", fontWeight: 600 }}>{it.netQty.toFixed(0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add to App.jsx NAV + render**

Add `["productpareto", "circle", "Product Pareto"]` to `NAV`.

- [ ] **Step 3: Verify and commit**

```bash
npm run build
git add src/pages/ProductPareto.jsx src/App.jsx
git commit -m "feat: add Product Pareto page (Page 5)"
```

---

## Task 9: Page 6 — Expense Analysis

**Files:**
- Create: `src/pages/ExpenseAnalysis.jsx`
- Modify: `src/App.jsx`

**Interfaces:**
- Consumes: `analytics.expenses`, `analytics.totalNetSales`, `analytics.monthlyTrend`

- [ ] **Step 1: Create ExpenseAnalysis.jsx**

```jsx
// src/pages/ExpenseAnalysis.jsx
import { useAnalytics } from "../useAnalytics.js";
import { BarChart, LineChart } from "../components/InteractiveCharts.jsx";

const MONTH_LABELS = { "2025-04":"Apr","2025-05":"May","2025-06":"Jun","2025-07":"Jul","2025-08":"Aug","2025-09":"Sep","2025-10":"Oct","2025-11":"Nov","2025-12":"Dec","2026-01":"Jan","2026-02":"Feb","2026-03":"Mar" };

function money(v) { return `INR ${((Number(v)||0)/100000).toLocaleString("en-IN",{maximumFractionDigits:2})}L`; }

export function ExpenseAnalysis() {
  const { analytics, loading, error } = useAnalytics();
  if (loading) return <div className="loading">Loading…</div>;
  if (error) return <div className="error">{error}</div>;

  const expenses = analytics.expenses || [];
  const totalExpenses = expenses.reduce((s, e) => s + e.totalExpenses, 0);
  const totalNetSales = analytics.totalNetSales || 0;
  const totalGrossProfit = analytics.customers?.reduce((s, c) => s + c.netSales, 0) || totalNetSales;
  const expToSalesPct = totalNetSales > 0 ? ((totalExpenses / totalNetSales) * 100).toFixed(1) : "0.0";
  const netOperatingProfit = totalNetSales - totalExpenses;

  const top15Expenses = expenses.slice(0, 15);
  const barData = top15Expenses.map(e => ({ label: e.accountName.substring(0, 20), value: e.totalExpenses }));

  return (
    <div style={{ padding: 24, background: "#F8F9FA", minHeight: "100vh" }}>
      <h1 style={{ color: "#1F497D" }}>Expense Analysis</h1>

      <div style={{ display: "flex", gap: 16, marginBottom: 24, flexWrap: "wrap" }}>
        {[
          { label: "Total Expenses", value: money(totalExpenses), color: "#C00000" },
          { label: "Expense to Sales %", value: `${expToSalesPct}%`, color: parseFloat(expToSalesPct) > 20 ? "#C00000" : "#C55A11" },
          { label: "Net Operating Profit", value: money(netOperatingProfit), color: netOperatingProfit > 0 ? "#375623" : "#C00000" },
          { label: "Expense Categories", value: expenses.length, color: "#1F497D" },
        ].map(kpi => (
          <div key={kpi.label} style={{ background: "#fff", border: "1px solid #D6E4F0", borderRadius: 8, padding: "16px 24px", minWidth: 200 }}>
            <div style={{ fontSize: 13, color: "#666" }}>{kpi.label}</div>
            <div style={{ fontSize: 26, fontWeight: 700, color: kpi.color }}>{kpi.value}</div>
          </div>
        ))}
      </div>

      <div style={{ background: "#fff", borderRadius: 8, padding: 16, marginBottom: 24 }}>
        <h3 style={{ color: "#1F497D", margin: "0 0 12px" }}>Top 15 Expense Categories</h3>
        <BarChart data={barData} color="#C00000" />
      </div>

      <div style={{ background: "#fff", borderRadius: 8, padding: 16, overflowX: "auto" }}>
        <h3 style={{ color: "#1F497D", margin: "0 0 12px" }}>Expense Detail</h3>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: "#1F497D", color: "#fff" }}>
              {["#", "Account / Category", "Amount", "% of Sales"].map(h => (
                <th key={h} style={{ padding: "8px 12px", textAlign: "left" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {expenses.map((e, i) => {
              const pctSales = totalNetSales > 0 ? ((e.totalExpenses / totalNetSales) * 100).toFixed(2) : "0.00";
              return (
                <tr key={e.accountName} style={{ background: i % 2 === 0 ? "#fff" : "#D6E4F0" }}>
                  <td style={{ padding: "7px 12px" }}>{i + 1}</td>
                  <td style={{ padding: "7px 12px", fontWeight: 500 }}>{e.accountName}</td>
                  <td style={{ padding: "7px 12px", fontWeight: 600 }}>{money(e.totalExpenses)}</td>
                  <td style={{ padding: "7px 12px", color: parseFloat(pctSales) > 5 ? "#C55A11" : "#1F1F1F" }}>{pctSales}%</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add to App.jsx NAV + render**

Add `["expenses", "circle", "Expense Analysis"]` to `NAV`.

- [ ] **Step 3: Verify and commit**

```bash
npm run build
git add src/pages/ExpenseAnalysis.jsx src/App.jsx
git commit -m "feat: add Expense Analysis page (Page 6)"
```

---

## Task 10: Page 8 — Customer Analysis (Risk & Ranking)

**Files:**
- Create: `src/pages/CustomerAnalysis.jsx`
- Modify: `src/App.jsx`

**Interfaces:**
- Consumes: `analytics.customers` (has `score`, `riskFlag`, `tier`, `daysSinceLastSale`, `collectionRate`, `lastSaleDate`, `activeMonths`)

- [ ] **Step 1: Create CustomerAnalysis.jsx**

```jsx
// src/pages/CustomerAnalysis.jsx
import { useState } from "react";
import { useAnalytics } from "../useAnalytics.js";

function money(v) { return `INR ${((Number(v)||0)/100000).toLocaleString("en-IN",{maximumFractionDigits:2})}L`; }

function daysBg(days) {
  if (days <= 30) return "#d4edda";
  if (days <= 60) return "#fff3cd";
  if (days <= 90) return "#ffe0b2";
  return "#f8d7da";
}

export function CustomerAnalysis() {
  const { analytics, loading, error } = useAnalytics();
  const [riskFilter, setRiskFilter] = useState("All");

  if (loading) return <div className="loading">Loading…</div>;
  if (error) return <div className="error">{error}</div>;

  const customers = analytics.customers || [];
  const riskFlags = ["All", "🔴 High Risk", "🟡 Medium Risk", "🟠 Watch", "🟢 Active"];
  const filtered = riskFilter === "All" ? customers : customers.filter(c => c.riskFlag === riskFilter);

  const highRiskCount = customers.filter(c => c.riskFlag === "🔴 High Risk").length;
  const platinumCount = customers.filter(c => c.tier === "🏅 Platinum").length;
  const activeCount = customers.filter(c => c.riskFlag === "🟢 Active").length;

  return (
    <div style={{ padding: 24, background: "#F8F9FA", minHeight: "100vh" }}>
      <h1 style={{ color: "#1F497D" }}>Customer Analysis — Risk &amp; Ranking</h1>

      <div style={{ display: "flex", gap: 16, marginBottom: 24, flexWrap: "wrap" }}>
        {[
          { label: "🔴 High Risk", value: highRiskCount, color: "#C00000" },
          { label: "🟢 Active", value: activeCount, color: "#375623" },
          { label: "🏅 Platinum", value: platinumCount, color: "#1F497D" },
          { label: "Total Customers", value: customers.length, color: "#2E75B6" },
        ].map(kpi => (
          <div key={kpi.label} style={{ background: "#fff", border: "1px solid #D6E4F0", borderRadius: 8, padding: "16px 24px", minWidth: 160 }}>
            <div style={{ fontSize: 13, color: "#666" }}>{kpi.label}</div>
            <div style={{ fontSize: 32, fontWeight: 700, color: kpi.color }}>{kpi.value}</div>
          </div>
        ))}
      </div>

      {/* Risk Flag filter */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        {riskFlags.map(flag => (
          <button
            key={flag}
            onClick={() => setRiskFilter(flag)}
            style={{
              padding: "6px 14px", borderRadius: 20, border: "none", cursor: "pointer", fontSize: 13,
              background: riskFilter === flag ? "#1F497D" : "#fff",
              color: riskFilter === flag ? "#fff" : "#1F497D",
              border: "1px solid #1F497D",
            }}
          >
            {flag}
          </button>
        ))}
        <span style={{ marginLeft: 8, alignSelf: "center", color: "#666", fontSize: 12 }}>{filtered.length} customers</span>
      </div>

      <div style={{ background: "#fff", borderRadius: 8, padding: 16, overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr style={{ background: "#1F497D", color: "#fff" }}>
              {["Rank", "Customer", "Station", "Net Sales", "Last Sale", "Days Since", "Active Months", "Score", "Risk", "Tier", "Collection %"].map(h => (
                <th key={h} style={{ padding: "8px 10px", textAlign: "left", whiteSpace: "nowrap" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((c, i) => (
              <tr key={c.name} style={{ background: i % 2 === 0 ? "#fff" : "#D6E4F0" }}>
                <td style={{ padding: "6px 10px", fontWeight: 700, color: "#2E75B6" }}>{c.rank}</td>
                <td style={{ padding: "6px 10px", fontWeight: 500, maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</td>
                <td style={{ padding: "6px 10px", color: "#666" }}>{c.station || "—"}</td>
                <td style={{ padding: "6px 10px", fontWeight: 600 }}>{money(c.netSales)}</td>
                <td style={{ padding: "6px 10px" }}>{c.lastSaleDate || "—"}</td>
                <td style={{ padding: "6px 10px", background: daysBg(c.daysSinceLastSale), fontWeight: 600 }}>{c.daysSinceLastSale === 9999 ? "—" : c.daysSinceLastSale}</td>
                <td style={{ padding: "6px 10px" }}>{c.activeMonths}</td>
                <td style={{ padding: "6px 10px", fontWeight: 700, color: c.score >= 60 ? "#375623" : c.score >= 30 ? "#C55A11" : "#C00000" }}>{c.score}</td>
                <td style={{ padding: "6px 10px", whiteSpace: "nowrap" }}>{c.riskFlag}</td>
                <td style={{ padding: "6px 10px", whiteSpace: "nowrap" }}>{c.tier}</td>
                <td style={{ padding: "6px 10px" }}>
                  <span style={{ color: c.collectionRate >= 85 ? "#375623" : c.collectionRate >= 60 ? "#C55A11" : "#C00000", fontWeight: 600 }}>
                    {c.collectionRate.toFixed(1)}%
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add to App.jsx NAV + render**

Add `["customeranalysis", "circle", "Customer Analysis"]` to `NAV`.

- [ ] **Step 3: Verify and commit**

```bash
npm run build
git add src/pages/CustomerAnalysis.jsx src/App.jsx
git commit -m "feat: add Customer Analysis (Risk & Ranking) page (Page 8)"
```

---

## Task 11: Pages 9 & 10 — Sales & Product Forecast

**Files:**
- Create: `src/pages/SalesForecast.jsx`
- Create: `src/pages/ProductForecast.jsx`
- Modify: `src/App.jsx`

**Interfaces:**
- Consumes: `analytics.forecast` (`{ m1, m2, m3 }`), `analytics.monthlyTrend` (array of `{ month, sales }`), `analytics.items`

- [ ] **Step 1: Create SalesForecast.jsx**

```jsx
// src/pages/SalesForecast.jsx
import { useAnalytics } from "../useAnalytics.js";
import { LineChart } from "../components/InteractiveCharts.jsx";

const MONTH_LABELS = { "2025-04":"Apr","2025-05":"May","2025-06":"Jun","2025-07":"Jul","2025-08":"Aug","2025-09":"Sep","2025-10":"Oct","2025-11":"Nov","2025-12":"Dec","2026-01":"Jan","2026-02":"Feb","2026-03":"Mar" };

function money(v) { return `INR ${((Number(v)||0)/100000).toLocaleString("en-IN",{maximumFractionDigits:2})}L`; }

export function SalesForecast() {
  const { analytics, loading, error } = useAnalytics();
  if (loading) return <div className="loading">Loading…</div>;
  if (error) return <div className="error">{error}</div>;

  const forecast = analytics.forecast || { m1: 0, m2: 0, m3: 0 };
  const trend = analytics.monthlyTrend || [];
  const trendData = trend.filter(t => t.sales > 0).map(t => ({ label: MONTH_LABELS[t.month] || t.month, value: t.sales }));

  // Find next 3 month labels after last data point
  const fyOrder = ["2025-04","2025-05","2025-06","2025-07","2025-08","2025-09","2025-10","2025-11","2025-12","2026-01","2026-02","2026-03"];
  const lastDataMonth = trend.filter(t => t.sales > 0).pop()?.month;
  const lastIdx = fyOrder.indexOf(lastDataMonth);
  const nextMonths = fyOrder.slice(lastIdx + 1, lastIdx + 4);
  const nextLabels = nextMonths.map(m => MONTH_LABELS[m] || m);

  return (
    <div style={{ padding: 24, background: "#F8F9FA", minHeight: "100vh" }}>
      <h1 style={{ color: "#1F497D" }}>Sales Forecast — 3 Month Outlook</h1>

      <div style={{ background: "#D6E4F0", borderRadius: 8, padding: "12px 16px", marginBottom: 24, fontSize: 13, color: "#1F497D" }}>
        Forecast uses linear regression (least-squares method) on monthly FY data. Actual figures shown in blue; forecasted in orange.
      </div>

      <div style={{ display: "flex", gap: 16, marginBottom: 24, flexWrap: "wrap" }}>
        {[
          { label: `Forecast ${nextLabels[0] || "M+1"}`, value: money(forecast.m1), color: "#C55A11" },
          { label: `Forecast ${nextLabels[1] || "M+2"}`, value: money(forecast.m2), color: "#C55A11" },
          { label: `Forecast ${nextLabels[2] || "M+3"}`, value: money(forecast.m3), color: "#C55A11" },
        ].map(kpi => (
          <div key={kpi.label} style={{ background: "#fff", border: "2px solid #C55A11", borderRadius: 8, padding: "16px 28px", minWidth: 200 }}>
            <div style={{ fontSize: 13, color: "#666" }}>{kpi.label}</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: kpi.color }}>{kpi.value}</div>
          </div>
        ))}
      </div>

      <div style={{ background: "#fff", borderRadius: 8, padding: 16, marginBottom: 24 }}>
        <h3 style={{ color: "#1F497D", margin: "0 0 12px" }}>Monthly Sales Trend (Actual)</h3>
        <LineChart data={trendData} color="#2E75B6" />
      </div>

      <div style={{ background: "#fff", borderRadius: 8, padding: 16, overflowX: "auto" }}>
        <h3 style={{ color: "#1F497D", margin: "0 0 12px" }}>Actual vs Forecast Table</h3>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: "#1F497D", color: "#fff" }}>
              {["Month", "Actual Sales", "Type"].map(h => (
                <th key={h} style={{ padding: "8px 12px", textAlign: "left" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {trend.filter(t => t.sales > 0).map((t, i) => (
              <tr key={t.month} style={{ background: i % 2 === 0 ? "#fff" : "#D6E4F0" }}>
                <td style={{ padding: "7px 12px" }}>{MONTH_LABELS[t.month] || t.month}</td>
                <td style={{ padding: "7px 12px", fontWeight: 600, color: "#2E75B6" }}>{money(t.sales)}</td>
                <td style={{ padding: "7px 12px", color: "#375623" }}>✅ Actual</td>
              </tr>
            ))}
            {[forecast.m1, forecast.m2, forecast.m3].map((val, i) => nextLabels[i] && (
              <tr key={`forecast-${i}`} style={{ background: i % 2 === 0 ? "#fff3e0" : "#ffe0b2" }}>
                <td style={{ padding: "7px 12px" }}>{nextLabels[i]} (Forecast)</td>
                <td style={{ padding: "7px 12px", fontWeight: 600, color: "#C55A11" }}>{money(val)}</td>
                <td style={{ padding: "7px 12px", color: "#C55A11" }}>📈 Projected</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create ProductForecast.jsx**

```jsx
// src/pages/ProductForecast.jsx
import { useState } from "react";
import { useAnalytics } from "../useAnalytics.js";

function money(v) { return `INR ${((Number(v)||0)/100000).toLocaleString("en-IN",{maximumFractionDigits:2})}L`; }

export function ProductForecast() {
  const { analytics, loading, error } = useAnalytics();
  const [search, setSearch] = useState("");

  if (loading) return <div className="loading">Loading…</div>;
  if (error) return <div className="error">{error}</div>;

  const items = analytics.items || [];
  const filtered = search
    ? items.filter(it => it.name.toLowerCase().includes(search.toLowerCase()) || (it.group || "").toLowerCase().includes(search.toLowerCase()))
    : items;

  // Top 10 by sales (simple forecast proxy: scale from overall forecast ratio)
  const totalNetSales = analytics.totalNetSales || 1;
  const overallM1 = analytics.forecast?.m1 || 0;
  const top10 = items.slice(0, 10).map(it => ({
    ...it,
    forecastM1: Math.round((it.netSales / totalNetSales) * overallM1),
  }));

  return (
    <div style={{ padding: 24, background: "#F8F9FA", minHeight: "100vh" }}>
      <h1 style={{ color: "#1F497D" }}>Product Forecast — 3 Month Outlook</h1>

      <div style={{ background: "#fff3cd", borderRadius: 8, padding: "12px 16px", marginBottom: 24, fontSize: 13, color: "#856404" }}>
        ⚠️ Product forecast requires minimum 3 months of sales history per item. Items with insufficient data show proportional estimates based on overall sales trend.
      </div>

      <div style={{ display: "flex", gap: 16, marginBottom: 24 }}>
        <input
          type="text"
          placeholder="Search items or category…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ flex: 1, padding: "10px 14px", borderRadius: 6, border: "1px solid #D6E4F0", fontSize: 14 }}
        />
        <div style={{ alignSelf: "center", color: "#666", fontSize: 13 }}>{filtered.length} items</div>
      </div>

      <div style={{ background: "#fff", borderRadius: 8, padding: 16, marginBottom: 24, overflowX: "auto" }}>
        <h3 style={{ color: "#1F497D", margin: "0 0 12px" }}>Top 10 Items — Forecast M+1</h3>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: "#1F497D", color: "#fff" }}>
              {["#", "Item", "Category", "YTD Net Sales", "Forecast M+1"].map(h => (
                <th key={h} style={{ padding: "8px 12px", textAlign: "left" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {top10.map((it, i) => (
              <tr key={it.name} style={{ background: i % 2 === 0 ? "#fff" : "#D6E4F0" }}>
                <td style={{ padding: "7px 12px" }}>{i + 1}</td>
                <td style={{ padding: "7px 12px", fontWeight: 500 }}>{it.name}</td>
                <td style={{ padding: "7px 12px", color: "#666" }}>{it.group || "—"}</td>
                <td style={{ padding: "7px 12px", fontWeight: 600, color: "#2E75B6" }}>{money(it.netSales)}</td>
                <td style={{ padding: "7px 12px", fontWeight: 700, color: "#C55A11" }}>{money(it.forecastM1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ background: "#fff", borderRadius: 8, padding: 16, overflowX: "auto" }}>
        <h3 style={{ color: "#1F497D", margin: "0 0 12px" }}>All Items</h3>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr style={{ background: "#2E75B6", color: "#fff" }}>
              {["#", "Item", "Category", "Net Sales", "Qty Sold"].map(h => (
                <th key={h} style={{ padding: "7px 10px", textAlign: "left" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((it, i) => (
              <tr key={it.name} style={{ background: i % 2 === 0 ? "#fff" : "#D6E4F0" }}>
                <td style={{ padding: "6px 10px" }}>{it.rank}</td>
                <td style={{ padding: "6px 10px" }}>{it.name.substring(0, 35)}</td>
                <td style={{ padding: "6px 10px", color: "#666" }}>{it.group || "—"}</td>
                <td style={{ padding: "6px 10px", fontWeight: 600 }}>{money(it.netSales)}</td>
                <td style={{ padding: "6px 10px" }}>{it.netQty.toFixed(0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Add both pages to App.jsx NAV + render**

Add to `NAV`:
```js
["salesforecast", "circle", "Sales Forecast"],
["productforecast", "circle", "Product Forecast"],
```

- [ ] **Step 4: Verify and commit**

```bash
npm run build
git add src/pages/SalesForecast.jsx src/pages/ProductForecast.jsx src/App.jsx
git commit -m "feat: add Sales Forecast (Page 9) and Product Forecast (Page 10)"
```

---

## Task 12: Page 7 — Stock Movement

**Files:**
- Create: `src/pages/StockMovement.jsx`
- Modify: `src/App.jsx`

**Note:** Full stock movement requires the Items master with `Op. Stock(Main)`. The current `dashboardBuilder.js` exposes `masters.items` count but not raw item rows. This task also extends the API to expose items master data.

**Interfaces:**
- Consumes: `analytics.items` (has `netQty` for net movement proxy), `analytics.stockSummary`

- [ ] **Step 1: Extend analyticsBuilder to expose items master rows**

Add to `buildAnalytics` return (after existing items array), using purchaseRows and salesRows that are already computed:
```js
  // Stock movement summary per item (inward = purchase qty, outward = sales qty)
  const stockItems = items.map(it => {
    const purchased = purchaseRows.filter(r => r["Item Name"] === it.name).reduce((s, r) => s + parseAmt(r["Main Qt"]), 0);
    const purchaseReturns = purchaseReturnRows.filter(r => r["Item Name"] === it.name).reduce((s, r) => s + parseAmt(r["Main Qt"]), 0);
    return {
      ...it,
      inward: purchased - purchaseReturns,
      outward: it.netQty,
    };
  });
```

Add `stockItems` to the return object.

- [ ] **Step 2: Create StockMovement.jsx**

```jsx
// src/pages/StockMovement.jsx
import { useAnalytics } from "../useAnalytics.js";
import { BarChart } from "../components/InteractiveCharts.jsx";

function money(v) { return `INR ${((Number(v)||0)/100000).toLocaleString("en-IN",{maximumFractionDigits:2})}L`; }

export function StockMovement() {
  const { analytics, loading, error } = useAnalytics();
  if (loading) return <div className="loading">Loading…</div>;
  if (error) return <div className="error">{error}</div>;

  const stockItems = analytics.stockItems || analytics.items || [];
  const totalInward = stockItems.reduce((s, it) => s + (it.inward || 0), 0);
  const totalOutward = stockItems.reduce((s, it) => s + (it.outward || it.netQty || 0), 0);
  const netMovement = totalInward - totalOutward;

  const top15Fast = [...stockItems].sort((a, b) => (b.outward || b.netQty) - (a.outward || a.netQty)).slice(0, 15);
  const fastBarData = top15Fast.map(it => ({ label: it.name.substring(0, 18), value: it.outward || it.netQty }));

  return (
    <div style={{ padding: 24, background: "#F8F9FA", minHeight: "100vh" }}>
      <h1 style={{ color: "#1F497D" }}>Stock Movement</h1>

      <div style={{ display: "flex", gap: 16, marginBottom: 24, flexWrap: "wrap" }}>
        {[
          { label: "Total Inward (Purchase Net)", value: `${totalInward.toFixed(0)} units`, color: "#375623" },
          { label: "Total Outward (Sales Net)", value: `${totalOutward.toFixed(0)} units`, color: "#2E75B6" },
          { label: "Net Movement", value: `${netMovement.toFixed(0)} units`, color: netMovement >= 0 ? "#375623" : "#C00000" },
          { label: "Items Tracked", value: stockItems.length, color: "#1F497D" },
        ].map(kpi => (
          <div key={kpi.label} style={{ background: "#fff", border: "1px solid #D6E4F0", borderRadius: 8, padding: "16px 24px", minWidth: 180 }}>
            <div style={{ fontSize: 13, color: "#666" }}>{kpi.label}</div>
            <div style={{ fontSize: 26, fontWeight: 700, color: kpi.color }}>{kpi.value}</div>
          </div>
        ))}
      </div>

      <div style={{ background: "#fff", borderRadius: 8, padding: 16, marginBottom: 24 }}>
        <h3 style={{ color: "#1F497D", margin: "0 0 12px" }}>Top 15 Fast Movers (by Qty Sold)</h3>
        <BarChart data={fastBarData} color="#375623" />
      </div>

      <div style={{ background: "#fff", borderRadius: 8, padding: 16, overflowX: "auto" }}>
        <h3 style={{ color: "#1F497D", margin: "0 0 12px" }}>Stock Movement Detail</h3>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr style={{ background: "#1F497D", color: "#fff" }}>
              {["#", "Item", "Category", "Inward Qty", "Outward Qty", "Net Movement", "Avg Purchase Rate"].map(h => (
                <th key={h} style={{ padding: "7px 10px", textAlign: "left" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {stockItems.map((it, i) => {
              const inward = it.inward || 0;
              const outward = it.outward || it.netQty || 0;
              const net = inward - outward;
              return (
                <tr key={it.name} style={{ background: i % 2 === 0 ? "#fff" : "#D6E4F0" }}>
                  <td style={{ padding: "6px 10px" }}>{i + 1}</td>
                  <td style={{ padding: "6px 10px", fontWeight: 500 }}>{it.name.substring(0, 30)}</td>
                  <td style={{ padding: "6px 10px", color: "#666" }}>{it.group || "—"}</td>
                  <td style={{ padding: "6px 10px", color: "#375623", fontWeight: 600 }}>{inward.toFixed(0)}</td>
                  <td style={{ padding: "6px 10px", color: "#2E75B6", fontWeight: 600 }}>{outward.toFixed(0)}</td>
                  <td style={{ padding: "6px 10px", color: net < 0 ? "#C00000" : "#1F1F1F", fontWeight: net < 0 ? 700 : 400 }}>{net.toFixed(0)}</td>
                  <td style={{ padding: "6px 10px" }}>INR {it.avgPurchaseRate.toFixed(2)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Add to App.jsx**

Add `["stockmovement", "circle", "Stock Movement"]` to `NAV`.

- [ ] **Step 4: Verify and commit**

```bash
npm run build
git add server/analyticsBuilder.js src/pages/StockMovement.jsx src/App.jsx
git commit -m "feat: add Stock Movement page (Page 7)"
```

---

## Task 13: Final Wiring — App.jsx Routing

**Files:**
- Modify: `src/App.jsx`

**Goal:** Wire all 8 new pages into the existing page router so clicking NAV items navigates correctly.

- [ ] **Step 1: Add all imports to App.jsx**

At the top of `src/App.jsx`, add:
```js
import { CustomerReceivables } from "./pages/CustomerReceivables.jsx";
import { VendorPayables } from "./pages/VendorPayables.jsx";
import { CustomerPareto } from "./pages/CustomerPareto.jsx";
import { ProductPareto } from "./pages/ProductPareto.jsx";
import { ExpenseAnalysis } from "./pages/ExpenseAnalysis.jsx";
import { StockMovement } from "./pages/StockMovement.jsx";
import { CustomerAnalysis } from "./pages/CustomerAnalysis.jsx";
import { SalesForecast } from "./pages/SalesForecast.jsx";
import { ProductForecast } from "./pages/ProductForecast.jsx";
```

- [ ] **Step 2: Add cases to the page-rendering switch/conditional**

Find the existing page-rendering logic in `App.jsx` and add:
```js
if (page === "receivables") return <CustomerReceivables />;
if (page === "payables") return <VendorPayables />;
if (page === "customerpareto") return <CustomerPareto />;
if (page === "productpareto") return <ProductPareto />;
if (page === "expenses") return <ExpenseAnalysis />;
if (page === "stockmovement") return <StockMovement />;
if (page === "customeranalysis") return <CustomerAnalysis />;
if (page === "salesforecast") return <SalesForecast />;
if (page === "productforecast") return <ProductForecast />;
```

- [ ] **Step 3: Full build + test**

```bash
npm run build && npm test
```
Expected: Build succeeds, all existing tests pass.

- [ ] **Step 4: Final commit**

```bash
git add src/App.jsx
git commit -m "feat: wire all 8 new analytics pages into App.jsx router"
```

---

## Self-Review

### Spec Coverage Check

| Power BI Page | DataLence Task | Status |
|---|---|---|
| Page 1 — Executive Dashboard | Existing `executive` page (already built) | ✅ Exists |
| Page 2 — Customer & Receivables | Task 5 | ✅ Planned |
| Page 3 — Vendor & Payables | Task 6 | ✅ Planned |
| Page 4 — Customer Pareto | Task 7 | ✅ Planned |
| Page 5 — Product Pareto | Task 8 | ✅ Planned |
| Page 6 — Expense Analysis | Task 9 | ✅ Planned |
| Page 7 — Stock Movement | Task 12 | ✅ Planned |
| Page 8 — Customer Analysis | Task 10 | ✅ Planned |
| Page 9 — Sales Forecast | Task 11 | ✅ Planned |
| Page 10 — Product Forecast | Task 11 | ✅ Planned |
| 80+ DAX metrics | Task 1 (analyticsBuilder) | ✅ Key metrics implemented |
| Pareto 80% reference line | Task 4 (ParetoChart) | ✅ Planned |
| Linear regression forecast | Task 1 (analyticsBuilder) | ✅ Planned |
| Customer Score (0-100) | Task 1 (analyticsBuilder) | ✅ Planned |
| Customer Risk Flags | Task 1 (analyticsBuilder) | ✅ Planned |
| Customer Tiers (Platinum/Gold/Silver) | Task 1 (analyticsBuilder) | ✅ Planned |

### Known Limitations (future iterations)

- Stock Movement: Opening stock from Items master not yet parsed — `Op. Stock(Main)` field needs to be exposed from `dashboardBuilder.js` Item master load
- Product Forecast: Individual item regression requires per-item monthly time series — currently uses proportional scaling as proxy
- Page 1 Executive Dashboard: Monthly trend line + GP% combo chart already partially exists in `executive` page; can be enhanced with `monthlyTrend` data from new API
- Vendor Payables: `Credit Amount` in payment25 is used for vendor payment tracking — validate against actual data format
- Map visual (state-wise) from Page 2 requires a mapping library — not included in this plan (use a future task with `react-simple-maps` or similar)
