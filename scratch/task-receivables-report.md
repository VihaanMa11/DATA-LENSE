# Receivables Tab — Implementation Report

## Status: DONE

## Commits
1. `82837de` — feat: expose accountMaster opening balances in dashboardBuilder + add receivablesBuilder with 22 tests
2. `6377ede` — feat: add 3-year ReceivablesView page, hook, CSS, and App.jsx wiring

## Build / Test Summary
- `npm test`: 167/167 pass, 0 fail (22 new receivables tests + all existing tests green)
- `npm run build`: success in 8.34s (chunk size warning is pre-existing, not introduced here)

## Key findings

### dashboardBuilder.js — accountMaster opening balance
`accountMaster` was NOT previously exposed in the return value of `buildDashboardFromSources`. Only `itemMaster` was exported. Added a minimal `accountMaster` array mapping `Opening Bal. (Dr)` and `Opening Bal. (Cr)` from the raw account master rows. Column names used: `"Opening Bal. (Dr)"` and `"Opening Bal. (Cr)"` — these match the Busy export column headers expected in `accmasterxlsx.xlsx`.

If the actual sheet has different column names, `openingDr` and `openingCr` will both be 0 and `openingBalance` will be 0 — the page renders cleanly with a note about missing balances rather than crashing.

### Data honesty enforced
- `partyWiseAvailable: false` always — placeholder rendered in UI
- Aging buckets: placeholder rendered ("needs invoice-level settlement / ledger-wise receipt export")
- `dataNotes[]` array with 4-5 strings explaining each limitation — shown as amber banner at top of page
- Partial FY detection (< 6 months of data) flagged in notes and alerts

### What IS real in the UI
- Opening balance + top debtors from account master
- Business-level sales billed, collections, collection rate per FY
- Running outstanding (openingBalance + cumulative net sales - cumulative collections)
- DSO approximation (business-level)
- Sales vs collections MoM combo chart with running outstanding line
- Collection rate MoM bar chart (green/amber/red by threshold)
- DSO trend 3-yr + Collection rate 3-yr

### Server restart required
The server must be restarted after this deploy for the new `/api/receivables` endpoint to be available.
