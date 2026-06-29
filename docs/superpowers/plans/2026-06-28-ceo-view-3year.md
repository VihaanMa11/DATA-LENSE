# CEO View — 3-Year Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: use superpowers:subagent-driven-development or superpowers:executing-plans to implement task-by-task. Steps use `- [ ]` checkboxes.

**Written:** 2026-06-28 · **Source spec:** `ceo_view_3year_mockup.html` (user-provided Claude artifact)

**Goal:** Replace the CEO View tab with a 3-financial-year executive cockpit — FY toggle, 5 YoY KPIs, an insight/alert bar, a 3-year monthly overlay, YoY-by-quarter, top customers/products with per-FY bars, supplier concentration, and a customer Pareto.

**Architecture:** Add a pure server-side `buildCeoOverview(dashData, options)` that computes **all three FYs at once** plus cross-FY derivations (YoY, churn, alerts). Expose it at `GET /api/ceo?sheetUrl=…`. A `useCeo()` hook feeds a rebuilt `CeoView` component using the existing ApexCharts wrappers. The classic single-period CEO section is replaced.

**Tech Stack:** Express, `xlsx`, React 19 + Vite, `react-apexcharts`, plain JS, `node --test`.

## Global Constraints (verbatim from project)
- Currency display via `money()` → `₹X.XX Lakh`; chart axes via `moneyAxis()` → `₹…L/Cr/k`. Crores shown as `₹X.X Cr` where the mockup uses Cr.
- No em-dashes in UI copy. No database. Stateless: every request carries `?sheetUrl=`.
- After ANY `server/*.js` edit, restart node (no hot reload). Frontend edits need `npm run build` + refresh.
- Keep existing chart component public APIs unchanged (`BarChart rows`, `DonutChart rows`, `LineChart series/months/labels`).
- `npm test` must stay green (currently 32 passing).

---

## PREREQUISITE (blocking) — 3-year parsing must emit `fy`

This plan assumes `buildDashboardDataFromWorkbook` (being updated for `MLH_Master_Data_FY2024-27.xlsx`, see `HANDOVER_2026-06-28.md`) emits on every fact:
- itemFacts: `fy` ("FY 2024-25"|"FY 2025-26"|"FY 2026-27"), `tx`, `month` ("YYYY-MM"), `party`, `item`, `itemGroup`, `state`, `salesman`, `qty`, `amount` (line), `finalAmount` (bill-level on header rows), `isHeader`.
- ledgerFacts: `fy`, `tx`, `month`, `account`, `debit`, `credit`.

**Task 0 verifies this** before building anything. If `fy` is absent, stop and finish the parsing work first.

---

## DECISIONS (resolved 2026-06-28)

1. ~~"Excl. group co." filter~~ → **REMOVED.** No group-company filter, no `ceoConfig.js`, no `exclGroup` param. CEO View uses all parties. The "Excl. group co." pill is dropped from the filter row.
2. **Brand = `itemGroup`** (ItemMaster `Group Name`). ✅ confirmed.
3. **Replace** the executive section content (KPIs, stat-strip, cash/bank, source register) with the mockup layout. → proceeding (default).
4. **`/api/ceo` server endpoint** (keeps 24k-row math off the browser). → proceeding (default).

---

## File Structure

- **Create** `server/ceoBuilder.js` — `buildCeoOverview(dashData, options)`; pure, unit-tested.
- **Modify** `server/index.js` — add `GET /api/ceo` (after the `requireAuth` middleware).
- **Create** `test/ceoBuilder.test.js` — unit tests with a small 3-FY fixture.
- **Create** `src/useCeo.js` — hook: reads `SheetContext`, fetches `/api/ceo?sheetUrl=&fy=&exclGroup=`.
- **Create** `src/pages/CeoView.jsx` — the full CEO cockpit (FY toggle, KPIs, alerts, charts).
- **Create** `src/components/ceo/` — small presentational pieces: `KpiCard.jsx`, `AlertBar.jsx`, `YoyBars.jsx` (per-FY mini bars + YoY), `FyToggle.jsx`.
- **Reuse** `src/components/InteractiveCharts.jsx` (LineChart, DonutChart), `src/components/ParetoChart.jsx`, `src/components/chartTheme.js`.
- **Modify** `src/App.jsx` — replace `active === "executive"` block with `<CeoView />` (wrapped in `SheetContext`); add FY/exclGroup state.
- **Modify** `src/styles.css` — append CEO-view styles (KPI grid, delta chips, alert chips, yoy mini-bars).

---

## Data Contract — `buildCeoOverview(dashData, options)` → returns:

```
{
  fyList: ["FY 2024-25","FY 2025-26","FY 2026-27"],   // sorted, only those present
  currentFy, prevFy,                                   // resolved from options.fy (default latest)
  kpis: {
    netSales:   { cur, prev, prev2, deltaPct },
    customers:  { cur, prev, prev2, delta, churned, added },
    avgBill:    { cur, prev, prev2, deltaPct },
    purchase:   { cur, prev, prev2, deltaPct },
    returnRate: { cur, prev, prev2, deltaPts },        // % points
  },
  alerts: [ { tone:"red|amber|blue", title, detail } ],
  monthlyByFy: { "FY 2024-25":[12 net-sales L], ... },  // Apr..Mar, in ₹ Lakh
  yoyByQuarter: [ { q:"Q1", prevVsPrev2:%, curVsPrev:% }, ... Q1..Q4 ],
  topCustomers: [ { name, fy25, fy26, fy27, current, yoyPct } ],   // top N by current FY
  topProducts:  [ { brand, fy25, fy26, fy27, current, yoyPct } ],
  suppliers:    [ { name, value, pct } ],               // current FY purchase, top 4 + Others
  pareto:       [ { label, value, cumulativePct } ],    // current FY customers, top 20
}
```

All money in the contract is **rupees** (the UI formats to Cr/Lakh). `deltaPct` rounded to whole %.

---

## Tasks

### Task 0: Verify the 3-year data prerequisite
- [ ] Run the harness against the local master file; confirm `fy` present and 3 FYs parse.
```bash
node --input-type=module -e '
import xlsx from "xlsx";
import { buildDashboardDataFromWorkbook } from "./server/dashboardBuilder.js";
const wb = xlsx.readFile("MLH_Master_Data_FY2024-27.xlsx",{cellDates:true});
const d = buildDashboardDataFromWorkbook(wb);
const fys=[...new Set(d.itemFacts.map(r=>r.fy))];
console.log("FYs:",fys,"itemFacts:",d.itemFacts.length,"sample:",JSON.stringify(d.itemFacts.find(r=>r.tx==="Sales")));
'
```
Expected: 3 FYs, `fy`/`salesman`/`month`/`finalAmount` present. If not, finish parsing first.

### Task 1: `buildCeoOverview` core — per-FY aggregates + KPIs (TDD)
**Files:** Create `server/ceoBuilder.js`, `test/ceoBuilder.test.js`. Consumes dashData (Task 0 shape).
**Produces:** `buildCeoOverview(dashData, { fy? })` → contract above (kpis + fyList first).
- [ ] **Step 1 (test)** Fixture: 3 FYs, 2 customers, sales+returns+purchase+receipts. Assert `kpis.netSales.cur` and `deltaPct` for a known FY.
- [ ] **Step 2** Run → fails (no module).
- [ ] **Step 3** Implement per-FY reducers: group itemFacts/ledgerFacts by `fy`; net sales = Σ finalAmount(Sales,isHeader) − Σ finalAmount(Sales Return); purchase = Σ finalAmount(Purchase) − returns; bills = count distinct bill headers; avgBill = netSales/bills; activeCustomers = distinct Sales party; returnRate = salesReturn/grossSales.
- [ ] **Step 4** Run → pass. **Step 5** Commit.

### Task 3: `buildCeoOverview` — churn, alerts, chart series (TDD)
- [ ] **Step 1 (test)** Assert `kpis.customers.churned/added` between two FYs; `monthlyByFy` has 12 points/FY (Apr..Mar, ₹L); `yoyByQuarter` length 4; `suppliers` sums to 100% with "Others"; `pareto` cumulative reaches 100.
- [ ] **Step 2** fails. **Step 3** Implement: churn = parties in prevFy with zero current-FY sales; added = parties new in current FY; alerts derived (customers lost, purchase-vs-sales growth gap, return-rate 3-yr rising, new customers); monthly via `fiscalYearMonths(fy)` (reuse from analyticsBuilder) → Apr..Mar; quarterly = sum of 3 months; suppliers top-4 + Others from current-FY Purchase by party; pareto = current-FY customers sorted desc with running cumulative %.
- [ ] **Step 4** pass. **Step 5** Commit.

### Task 4: `/api/ceo` endpoint
**Modify** `server/index.js` (after `app.use("/api", requireAuth)`).
- [ ] **Step 1** Add:
```js
import { buildCeoOverview } from "./ceoBuilder.js";
app.get("/api/ceo", async (req, res, next) => {
  try {
    const sheetUrl = requireSheet(req, res); if (!sheetUrl) return;
    const dash = await fetchDashboard(sheetUrl);
    const fy = String(req.query.fy || "").trim();
    res.json(buildCeoOverview(dash, fy ? { fy } : {}));
  } catch (e) { next(e); }
});
```
- [ ] **Step 2** Restart server; smoke-test:
```bash
# login first to get cookie (see HANDOVER), then:
curl -s -b /tmp/dl_cookies.txt "http://localhost:3001/api/ceo?sheetUrl=$SHEET" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);console.log("fyList",j.fyList,"netSales.cur",j.kpis.netSales.cur,"alerts",j.alerts.length);})'
```
Expected: 3 FYs, sensible net sales, alerts array. - [ ] **Step 3** Commit.

### Task 5: `useCeo` hook
**Create** `src/useCeo.js` (mirror `useAnalytics.js`): reads `SheetContext`; param `fy`; returns `{ ceo, loading, error }`; refetch on `[sheetUrl, fy]`.
- [ ] Implement, build. Commit.

### Task 6: Presentational components
**Create** under `src/components/ceo/`:
- [ ] `FyToggle.jsx` — buttons FY24-25 / FY25-26 / FY26-27 / 3-yr view; `value`, `onChange`.
- [ ] `KpiCard.jsx` — `{ label, value, delta, deltaTone, prevLine }`; renders value + colored delta chip + 3-yr context line (matches mockup `.kpi`).
- [ ] `AlertBar.jsx` — maps `alerts[]` to colored chips (red/amber/blue) with `title`+`detail`.
- [ ] `YoyBars.jsx` — a labeled row with three per-FY mini bars (widths normalized to max) + current value + YoY delta chip (mockup `.yoy-row`).
- [ ] Build. Commit.

### Task 7: `CeoView.jsx` (assembly)
**Create** `src/pages/CeoView.jsx`: `useCeo(fy, exclGroup)` → render:
- FyToggle + month-range select + filter pills (brands/regions/salesmen/item-groups are client-side filters — wire the ones with data, mark others "coming soon" if not yet supported). No "Excl. group co." pill.
- 5 `KpiCard`s from `ceo.kpis`.
- `AlertBar` from `ceo.alerts`.
- **3-year overlay**: `LineChart series={[{name:"FY 24-25",values:monthlyByFy[fy25]},…]} months={MONTH_LABELS-Apr..Mar} labels=…` (3 series).
- **YoY by quarter**: BarChart/ApexChart grouped bars from `yoyByQuarter` (2 series).
- **Top customers / Top products**: `YoyBars` rows from `topCustomers`/`topProducts`.
- **Supplier concentration**: `DonutChart rows={suppliers.map(s=>[s.name,s.value])}`.
- **Customer Pareto**: `ParetoChart data={ceo.pareto} title="Customer Pareto — {currentFy}"`.
- Loading/empty states via existing `PageState`.
- [ ] Build. Commit.

### Task 8: Wire into App.jsx + styles
- [ ] **Modify** `src/App.jsx`: replace the `active === "executive"` `<section>` content with `<SheetContext.Provider value={sheetUrl}><CeoView fy={ceoFy} onFy={setCeoFy} /></SheetContext.Provider>`; add `ceoFy` (default latest FY) state in `DashboardApp`.
- [ ] **Append** to `src/styles.css`: `.kpi-grid` (5-col, responsive→2→1), `.delta.up/.dn/.neu`, `.alert-chip.red/.amber/.blue`, `.yoy-row/.yb`, `.fy-toggle/.fy-btn.on` — adapt the mockup CSS to the project tokens (`--blue`, `--green`, `--red`, Inter).
- [ ] Build. Commit.

### Task 9: Verify end-to-end
- [ ] `npm run build` clean; `npm test` green (incl. new ceoBuilder tests).
- [ ] Restart server; in browser: login, sync the 3-year sheet, open CEO View; toggle FY24-25/25-26/26-27/3-yr; confirm KPIs, deltas, alerts, all 5 charts render and change with FY.
- [ ] (No browser tooling locally — user verifies visually.) Commit.

---

## Self-Review (against the mockup)
- 5 KPIs (Net sales, Active customers, Avg bill, Purchase, Return rate) → Task 2 ✓
- YoY deltas + 3-yr context lines → Task 2/6 ✓
- 4 alert chips → Task 3/6 ✓
- Monthly 3-yr overlay → Task 3/7 ✓
- YoY by quarter → Task 3/7 ✓
- Top customers / products (per-FY mini bars) → Task 3/6/7 ✓
- Supplier concentration donut → Task 3/7 ✓
- Customer Pareto (current FY) → Task 3/7 ✓
- FY toggle + month range + filter pills → Task 7/8 ✓ (some pills gated on data availability)
- **Open items requiring user input:** group-company list, brand definition, replace-vs-augment, endpoint choice (see DECISIONS).
