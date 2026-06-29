# DataLence — Technical Requirements Document (TRD)

**Version:** 1.0 · **Date:** 2026-06-29 · **Pairs with:** `docs/PRD.md`

---

## 1. Architecture Overview

DataLence is a single Node service: an **Express** backend that both serves the **React (Vite)** SPA and exposes a small JSON API. Data flows **direct-to-sheet and stateless** — every data request carries the Google Sheet URL; the server fetches the sheet's `.xlsx` export, parses it, computes analytics, and returns JSON. No database.

```
Browser (React SPA)  ──HTTP+cookie──►  Express API  ──HTTPS──►  Google Sheets (xlsx export)
        ▲                                   │
        └────────────── JSON ───────────────┘  (in-memory cache by sheetId+signature)
```

## 2. Tech Stack

| Layer | Choice |
|---|---|
| Frontend | React 19, Vite 7, ApexCharts (`react-apexcharts`), plain CSS (`src/styles.css`, Inter) |
| Backend | Node (ESM), Express 5, `xlsx` (SheetJS) |
| Auth | `node:crypto` HMAC cookie (shared password) |
| Tests | `node --test` |
| Hosting | Vercel (serverless); local dev runs the same `server/index.js` |
| Language | Plain JavaScript (ESM). No TypeScript, no database driver. |

## 3. Repository Structure (key files)

```
server/
  index.js              Express app: auth + data endpoints + static SPA serving
  auth.js               password gate: checkPassword, expectedToken, createRequireAuth, cookies
  googleSheetsSource.js fetch xlsx export, extractGoogleSheetId, workbookSignature, tab resolution, validate
  dashboardBuilder.js   buildDashboardDataFromWorkbook(workbook) -> itemFacts/ledgerFacts/itemMaster (+ fy)
  analyticsBuilder.js   buildAnalytics(dash, {fy?, months?}) -> per-page analytics
  ceoBuilder.js         buildCeoOverview(dash, {fy?}) -> 3-year CEO contract
src/
  App.jsx               shell, routing, auth gate, period filter (PeriodBar), data hooks
  useDashboardData / useAnalytics.js / useCeo.js   data hooks (send ?sheetUrl=&fy=&months=)
  sheetContext.js, periodContext.js, fiscalYear.js shared context + FY/month helpers
  pages/                CeoView.jsx + analytics pages
  components/           InteractiveCharts.jsx (Bar/Donut/Line), ParetoChart.jsx, ScatterPlot.jsx,
                        chartTheme.js (money/moneyAxis/palette), ui.jsx, ceo/* (KPI, alerts, toggle, yoy)
test/                   *.test.js (auth, analytics, ceoBuilder, googleSheetsSource, sourceConfig, chartWindow)
```

## 4. Data Pipeline

### 4.1 Fetch (`googleSheetsSource.js`)
- `extractGoogleSheetId(url)` → sheet id from any Google Sheets URL/ID.
- `fetchGoogleWorkbook(id)` → GET the `…/export?format=xlsx` endpoint, parse with `xlsx`.
- `workbookSignature(workbook)` → content hash for cache invalidation.
- Tab resolution is **format-tolerant** (case-insensitive; resolves both legacy `Sales25`/`Itemmaster` and new `Sales`/`ItemMaster`). `validateGoogleWorkbook` enforces required tabs and returns a clear error if missing.

### 4.2 Parse (`dashboardBuilder.js`)
`buildDashboardDataFromWorkbook(workbook)` → normalized fact tables:
- **itemFacts[]**: `{ tx, fy, month, party, item, itemGroup, state, station, salesman, qty, amount, finalAmount, isHeader, date }`
  - `tx` ∈ `Sales | Sales Return | Purchase | Purchase Return`
  - `finalAmount` = bill-level (`Amount Grand Total`), valid on `isHeader` rows; `amount` = line-level.
- **ledgerFacts[]**: `{ tx, fy, month, account, debit, credit }` — `tx` ∈ `Receipt | Payment | Credit Note | Debit Note | Journal`.
- **itemMaster[]**: `{ name, group, mainUnit, openingStock, salePrice, purcPrice, mrp }`.
- `fy` is taken from the `Financial Year` column (normalized to `FY YYYY-YY`); `month` (`YYYY-MM`) is derived from `Bill Date` with **IST offset handling** (the export stores IST dates as UTC; do not use naive `getUTCMonth`).

### 4.3 Analytics
- `buildAnalytics(dash, { fy?, months? })` → per-page model (customers, vendors, items, expenses, monthly, forecast, summary). Filters facts by `fy` and/or selected `months` first.
- `buildCeoOverview(dash, { fy? })` → 3-year contract: `fyList, currentFy, prevFy, kpis{netSales,customers,avgBill,purchase,returnRate}, alerts[], monthlyByFy{}, yoyByQuarter[], topCustomers[], topProducts[], suppliers[], pareto[]`. All money raw rupees; UI formats.

## 5. API (all under `/api`, JSON)

| Method · Path | Auth | Purpose |
|---|---|---|
| `POST /api/auth/login` `{password}` | public | set session cookie if password matches |
| `GET /api/auth/session` · `POST /api/auth/logout` | public | session check / clear |
| `POST /api/sync?sheetUrl=` | cookie | force fetch+parse, return dashboard JSON (warms cache) |
| `GET /api/dashboard?sheetUrl=` | cookie | dashboard data (classic pages) |
| `GET /api/analytics?sheetUrl=&fy=&months=` | cookie | per-page analytics |
| `GET /api/ceo?sheetUrl=&fy=` | cookie | 3-year CEO overview |
| `POST /api/refresh?sheetUrl=` | cookie | force re-fetch |
| `GET /api/status` | cookie | health + cached-sheet count |

`app.use("/api", createRequireAuth())` guards everything except the three auth routes.

## 6. Auth & Security
- **Shared-password gate.** `POST /api/auth/login` compares the password (constant-time) to `DASHBOARD_PASSWORD`; on success sets `dl_access_token` = HMAC-SHA256(`SESSION_SECRET`, fixed string) as an HttpOnly, SameSite=Lax (Secure in prod) cookie.
- Middleware validates the cookie equals the expected token on every `/api` call. Stateless — no session store.
- No PII at rest, no database, no third-party data egress beyond the user-supplied Google Sheet.
- **Env:** `DASHBOARD_PASSWORD`, `SESSION_SECRET` (both required in prod). `.env` is git-ignored.

## 7. Caching & State
- `sheetCache: Map<sheetId, { signature, data, loadedAt }>` in process memory.
- A request re-fetches the workbook, computes `signature`; on match it serves cached parsed facts (period changes do not re-download). On Vercel, cache is per-instance and resets on cold start (re-fetch) — acceptable and truly stateless.

## 8. Frontend Contracts
- The active **sheet URL** lives in `localStorage` (`dl_sheet_url`) and is provided via `SheetContext`; **period** via `PeriodContext`; both flow into `useAnalytics`/`useCeo`, which append `?sheetUrl=&fy=&months=`.
- Charts use shared `chartTheme.js` formatters (`money` → `₹… Lakh`, `moneyAxis` → compact). Chart component APIs are stable: `BarChart{rows}`, `DonutChart{rows}`, `LineChart{series,months,labels}`, `ParetoChart{data,title,barLabel}`.

## 9. Build, Test, Run
- Dev/serve: `PORT=3001 node server/index.js` (serves `dist/`; falls back to Vite middleware if no build). Restart required after any `server/*.js` edit (no hot reload).
- Build: `npm run build` (Vite). Test: `npm test` (`node --test`, 64 tests).
- Deploy: `vercel --prod`; set `DASHBOARD_PASSWORD` + `SESSION_SECRET` in Vercel env.

## 10. Performance & Limits
- Sheet `.xlsx` parse is O(rows); 3-year master ≈ 30k item rows + 12k ledger rows parses and computes in well under a request budget. Bundle includes ApexCharts (~360 KB gzip) — acceptable for an internal BI tool; can be split for first-load if needed.

## 11. Risks / Tech Debt
- Partial financial years (e.g., FY26-27 in progress) skew YoY deltas — UI badges "partial" by counting non-zero months.
- ApexCharts bundle weight; optional code-split.
- Single-process in-memory cache only (fine for serverless; not a shared cache across instances).
- Some CEO filter pills (brand/region/salesman) are stubbed pending data wiring.

## 12. Testing Strategy
- Pure builders (`analyticsBuilder`, `ceoBuilder`) unit-tested with fixtures (hand-computed expectations) + real-file sanity (`MLH_Master_Data_FY2024-27.xlsx`).
- Auth, cookie, and source-config parsing unit-tested. Frontend verified via build + manual browser check (no headless browser in CI).
