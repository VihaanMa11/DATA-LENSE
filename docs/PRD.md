# DataLence — Product Requirements Document (PRD)

**Version:** 1.0 · **Date:** 2026-06-29 · **Status:** Active (MVP shipped, evolving)
**Owner:** Vihaan Malani · **Pilot client:** MLH Gobongo Pvt. Ltd. (footwear distribution)

---

## 1. Overview

DataLence is a **white-label business-intelligence dashboard** that turns a company's accounting export (a Google Sheets workbook of Tally-style registers) into a live, Power-BI-grade MIS dashboard. There is no database and no manual data entry: the owner pastes a Google Sheet URL, presses **Sync Now**, and the dashboard renders sales, customer, product, vendor, stock, expense, and forecast analytics, including a 3-financial-year CEO cockpit.

"White-label" means the same codebase serves any company: clone the repo (or open the hosted app), connect a different sheet in the standardized format, and the dashboard reflects that company's data.

## 2. Problem

Small and mid-size Indian distributors run their books in Tally (or similar) and export registers to Excel/Sheets, but:
- They have **no visualization layer** — insight lives in raw rows nobody reads.
- Off-the-shelf BI (Power BI, Tableau) is **expensive, heavy, and needs a specialist** to model the data.
- Owners want **plain answers**: who are my top customers, what is slipping, how is this year vs last, where is the concentration risk — without learning a tool.

## 3. Goals & Non-Goals

**Goals**
- One-click connect: paste a Google Sheet URL → full dashboard, no setup.
- A standardized sheet format so the product is reusable across companies.
- Owner-grade clarity: KPIs, alerts, YoY, Pareto, concentration, forecasts.
- Multi-financial-year analysis (FY-wise segregation and comparison).
- Cheap to run and host (stateless, no database).

**Non-Goals**
- Not an accounting system or a Tally replacement (analysis only; "do not reconcile with accounting software").
- Not multi-tenant SaaS with per-user accounts (single shared-password gate per deployment).
- Not real-time streaming (data refreshes on demand via Sync).

## 4. Target Users & Personas

| Persona | Needs | Primary surface |
|---|---|---|
| **Owner / CEO** (e.g., MLH proprietor) | 30-second health read, YoY, what's at risk | CEO View |
| **Sales / ops manager** | Top customers/products, receivables, returns, salesman view | Customer/Product/Receivables pages |
| **Implementer (Vihaan)** | Onboard a new company by connecting a sheet | Data Source modal |

## 5. Key Use Cases

1. **Connect a company** — paste Google Sheet URL → Sync → dashboard populates; URL remembered (localStorage).
2. **Read the year** — open CEO View, toggle FY (24-25 / 25-26 / 26-27 / 3-year), see KPIs + alerts + charts.
3. **Find concentration risk** — Customer/Product Pareto, supplier concentration donut.
4. **Chase money** — Receivables/Payables with pending and collection rates.
5. **Slice a period** — calendar filter (Full Year / H1 / H2 / quarters / months, multi-select) re-slices analytics.

## 6. Functional Requirements

### 6.1 Data source & sync
- Connect any **Google Sheets URL** in the standardized format; fetch its `.xlsx` export live.
- **Sync Now** with a live status indicator (idle / syncing / success / error).
- Remember the last sheet URL per browser (localStorage).
- Validate that required tabs exist; clear error if the format is wrong.
- Support both the **legacy single-FY format** (year-suffixed tabs) and the **new 3-year format** (a `Financial Year` column).

### 6.2 Standardized workbook format (new, 3-year)
- Tabs: `Sales, Purchase, SalesReturn, PurchaseReturn, Receipt, Payment, CrNote, DrNote, JournalRegister, ItemMaster, AccountMaster` (+ `ReadMe`).
- Every tab carries a `Financial Year` column (`FY 2024-25`, `FY 2025-26`, `FY 2026-27`).
- New fields supported: `Salesman Name`, per-line `Station`, `Amount Grand Total` (bill total).

### 6.3 Pages
- **CEO View (3-year cockpit):** FY toggle; 5 KPIs (Net sales, Active customers, Avg bill, Purchase, Return rate) each with YoY delta + prior-year context; insight/alert bar (customers lost, purchase outgrowing sales, return rate rising, new customers); monthly 3-year overlay; YoY-by-quarter; top customers & products (per-FY bars); supplier concentration; customer Pareto.
- **Customer Analysis, Customer/Product Pareto, Receivables, Vendor & Payables, Expense Analysis, Stock Movement, Sales/Product Forecast** — period-filtered analytics.
- **Data Sources** — connection status and schema register.

### 6.4 Filters
- **Period filter:** calendar-style bar — Full Year / H1 / H2 (single-select) + Q1-Q4 + 12 months (multi-select, additive). Drives analytics pages.
- **FY filter:** select a financial year (CEO View and FY-aware analytics).

### 6.5 Currency & formatting
- All money shown in INR: `₹X.XX Lakh` (and `₹X.X Cr` for large CEO figures). Chart axes use compact `₹…L/Cr/k`.

### 6.6 Auth
- Single shared-password gate per deployment (set `DASHBOARD_PASSWORD`). Session via signed cookie. No user accounts, no database.

### 6.7 Export & interaction
- Interactive charts (hover callouts, slice-select on donuts, animated). Export-as-PDF affordance.

## 7. Non-Functional Requirements
- **Stateless:** no database; in-memory cache only (keyed by sheet id + content signature).
- **Cheap hosting:** runs on Vercel; cold starts re-fetch the sheet.
- **Responsive:** phones, tablets, laptops (sidebar collapses, tables scroll, charts reflow).
- **Performance:** sheet parse + analytics computed server-side; client receives compact JSON.
- **Accessibility:** WCAG-minded contrast, keyboard focus, no color-only meaning.

## 8. Success Metrics
- Time-to-first-dashboard for a new company: **< 2 minutes** (paste URL → render).
- Owner can answer "how is this year vs last and what's at risk" without help.
- Zero data-modeling work to onboard a standard-format sheet.

## 9. Constraints & Assumptions
- Source of truth is the owner's Google Sheet in the standardized format.
- Dates in the export are IST; FY is taken from the `Financial Year` column, not inferred.
- Analysis only — figures are not guaranteed to reconcile to the accounting software.

## 10. Out of Scope (now) / Future
- Per-user accounts & roles; salesman-level drilldowns as full pages; brand/region/salesman filter pills (partially stubbed); automated scheduled refresh; multi-company switching UI beyond URL paste; write-back to source.
