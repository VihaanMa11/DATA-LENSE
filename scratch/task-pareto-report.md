# Customer Pareto 3-Year Tab — Task Report

**Status:** DONE  
**Date:** 2026-06-30

---

## Commits

| # | Hash | Message |
|---|------|---------|
| 1 | `c3e7dba` | feat: add paretoBuilder + TDD test suite (25/25) |
| 2 | `ef3c98e` | feat: Customer Pareto 3-yr tab — endpoint, hook, page, App wiring |

---

## Build & Test

- **`npm run build`:** CLEAN — `vite build` succeeded in 13.4s, 314 modules transformed, no errors. Pre-existing 500kB chunk warning (ApexCharts) is unchanged from before this task.
- **`npm test`:** ALL PASS — 113 tests / 4 suites / 0 failures. Includes 25 new `paretoBuilder` tests covering Cash exclusion, customersTo80, tier sums ≈100, churned/new status, zones, rankDelta, trend lengths.

---

## Files Created

| File | Role |
|------|------|
| `server/paretoBuilder.js` | Pure ESM builder — 3-FY concentration analytics |
| `test/paretoBuilder.test.js` | 25-test TDD suite with 3-FY fixture incl. Cash row + churned customer |
| `src/useCustomerPareto.js` | React hook — fetches `/api/customer-pareto?sheetUrl=&fy=` via SheetContext |
| `src/pages/CustomerParetoView.jsx` | Main page — 5 KPI cards, insight row, overlay chart, conc bars, rank table, 3 per-FY Pareto charts, detail table |

## Files Modified

| File | Change |
|------|--------|
| `server/index.js` | Added `import buildCustomerPareto`; added `GET /api/customer-pareto` endpoint after `/api/party` |
| `src/App.jsx` | Removed `"customerpareto"` from `ANALYTICS_PAGES`; added `CustomerParetoView` import; added `paretoFy` state; added dedicated `filters.section === "customerpareto"` branch with `SheetContext.Provider` wrapping `<CustomerParetoView fy={paretoFy} onFy={setParetoFy} />`; updated loading guard |
| `src/styles.css` | Appended ~120 lines of `.cp-*` classes: insight cards, concentration bar/segments, status/zone chips, responsive breakpoints |

---

## Architecture

```
GET /api/customer-pareto?sheetUrl=&fy=
  └── requireSheet → fetchDashboard (cached) → buildCustomerPareto(dash, {fy})
        └── custNetForFy() per FY (excl. Cash)
            concentrationTiers(), customersTo80ForFy()
            rankChanges, insights, paretoByFy (top 15), table (all)

App.jsx (DashboardApp)
  filters.section === "customerpareto"
    └── SheetContext.Provider value={sheetUrl}
          └── CustomerParetoView fy={paretoFy} onFy={setParetoFy}
                └── useCustomerPareto(fy) → /api/customer-pareto
```

---

## Visual Assumptions Flagged

1. **Main overlay combo chart** (`ParetoOverlayChart`): Uses `ReactApexChart` directly with 3 column series (FY net sales in Lakhs on left Y-axis) + 3 line series (cumulative % on right Y-axis, 0–105) + 80% horizontal annotation. Categories are the top-15 customers from `currentFy`. When a customer appears in `currentFy` labels but not in a prior FY, the bar renders as 0 (not null) — this is correct for a "did not sell to this customer" reading. The right-Y axis annotation `yAxisIndex` is set to `fyList.length` (the index of the first line-series yaxis object). This wiring assumes the yaxis array is ordered as: `[barYaxis, ...hiddenBarYaxes, lineYaxis, ...hiddenLineYaxes]`. If ApexCharts annotation yAxisIndex counts differently, the 80% line may appear on the wrong axis — visual verification required.

2. **3-yr overlay vs single-FY toggle**: When `fy === ""` (3-yr overlay), all 3 FY series are shown and the chart uses `currentFy` (latest FY) for the x-axis category ordering. When a specific FY is selected, the hook re-fetches with `?fy=FY+20XX-YY`, which changes `currentFy` and re-orders the categories by that FY. The chart still renders all 3 FYs of bars+lines (the builder always returns all FYs in `paretoByFy`). This means the "single FY" toggle emphasizes that FY's ranking on the x-axis — a reasonable interpretation of the spec.

3. **`fill.type` array**: The ApexChart fill.type is set as `[...fyList.flatMap(() => ["gradient","solid"]).slice(0, fyList.length*2)]` — this spreads gradient to column series and solid to line series. Verify visually that gradients apply to bars only.

4. **Server restart required**: `server/index.js` was modified. The dev server (`node server/index.js` or `bun run dev`) must be restarted to pick up the new `/api/customer-pareto` endpoint.
