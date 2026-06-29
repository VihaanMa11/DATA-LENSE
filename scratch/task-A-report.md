# Task A — buildCeoOverview — Execution Report

## Files Created
- `server/ceoBuilder.js` — pure ESM analytics function
- `test/ceoBuilder.test.js` — 30 node:test unit tests

## TDD Steps

### Step 1 — Tests written first
Designed 3-FY fixture with header rows (finalAmount) and line rows (amount) kept separate to
match real data shape. Hand-computed all expected values before writing assertions.

### Step 2 — Initial run (FAIL expected)
```
node --test test/ceoBuilder.test.js
→ ERR_MODULE_NOT_FOUND — expected failure confirmed
```

### Step 3 — Implementation written
`server/ceoBuilder.js` implements all required computation rules in ~250 lines of plain ESM.

### Step 4 — Tests after implementation
First run: 29/30 pass. One failure on topProducts because the fixture's `salesHeader` helper
was setting `amount=finalAmount` on header rows, causing double-counting of line-level product
amounts. Fixed by setting `amount=0` on header rows (mirrors real data where headers carry only
the bill total in finalAmount). After fix: 30/30 pass.

```
node --test test/ceoBuilder.test.js
→ ✔ 30/30 pass
```

### Step 5 — Real data sanity check
```
node --input-type=module -e '...'
```
Output:
```
currentFy: FY 2026-27
fyList: [ 'FY 2024-25', 'FY 2025-26', 'FY 2026-27' ]
netSales.cur: 7458196
netSales.prev: 68084002
netSales.deltaPct: -89
alerts: 3 [
  'red:152 customers lost vs FY 2025-26',
  'amber:Return rate rising',
  'blue:6 new customers added in FY 2026-27'
]
topCustomers: 8
topProducts: 8
suppliers: 2 [ 'AIRHAWK PLASTIC WORKS=90.3%', 'WINNER ENTERPRISE=9.7%' ]
pareto entries: 20
pareto last cumulativePct: 97.3
returnRate: 1.2 prev: 1
customers.churned: 152 added: 6
```

Note: FY 2026-27 net sales (₹74.6L) is far below FY 2025-26 (₹680.8L) because the workbook
only has ~3 months of FY 2026-27 data (partial year). This is expected — not a bug.

The 152 churned customers and -89% deltaPct reflect the same partial year vs full year
comparison. The frontend will need to surface this caveat (e.g. show "partial year" badge
when the latest FY's month count < 12).

### Step 6 — Full npm test
```
npm test
→ ✔ 64/64 tests pass (34 prior + 30 new)
```

### Step 7 — Commit
```
git add server/ceoBuilder.js test/ceoBuilder.test.js
git commit -m "feat: add buildCeoOverview 3-year CEO analytics"
→ [main 1e5f674]
```

## Concerns

1. **Partial-year FY bias**: FY 2026-27 has ~3 months of data in the workbook. KPIs comparing it
   to full FY 2025-26 will show extreme negative deltas (netSales -89%, 152 churned). The
   `buildCeoOverview` function computes correctly — the partial-year problem is a display/UX
   concern. The endpoint layer (task B) should expose the month count per FY so the frontend
   can show a "partial year" warning.

2. **Suppliers pct rounding**: When many vendors exist, floating-point round1 can produce a sum
   of 99.9% or 100.1% rather than exactly 100. This is cosmetic and within spec (tests check
   abs(sum-100) < 0.5).
