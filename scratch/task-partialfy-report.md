# task-partialfy-report

## Status
DONE

## Commit
`b69efa6` — fix: default 3-year tabs to latest complete FY + badge partial years

## Build / Test
- `npm test`: 170 pass, 0 fail (167 pre-existing + 3 new fyUtil tests)
- `npx vite build`: succeeded in 9.49s — no errors, pre-existing chunk-size warning only

## Real-data check (MLH_Master_Data_FY2024-27.xlsx)
All four builders confirmed:
- `currentFy` = "FY 2025-26" (latest complete)
- `partialFys` = ["FY 2026-27"]
- `fyList` = ["FY 2024-25", "FY 2025-26", "FY 2026-27"]

## What changed
| File | Change |
|------|--------|
| `server/fyUtil.js` | NEW — `analyzeFys` + `resolveCurrentFy` utilities |
| `test/fyUtil.test.js` | NEW — 3 unit tests (partial detection, default resolve, explicit override) |
| `server/ceoBuilder.js` | Import fyUtil; use `resolveCurrentFy`; expose `partialFys` in return |
| `server/paretoBuilder.js` | Same |
| `server/customerAnalysisBuilder.js` | Same; `lastFy` retained for waterfall labels |
| `server/receivablesBuilder.js` | Same; local `partialFys` renamed `localPartialFys` to avoid collision |
| `src/pages/CustomerParetoView.jsx` | `partialFys` Set from `pareto.partialFys`; passed to FyToggle |
| `src/pages/CustomerAnalysisView.jsx` | Same |

## Notes
- Server must be restarted (`node server/index.js`) for builder changes to take effect.
- `CeoView` was already wired; `ReceivablesView` already had its own partialFys logic (untouched).
- FyToggle already had the `·partial` badge logic — no change needed there.
- Explicit `fy` param still wins in all builders (existing tests verified this).
