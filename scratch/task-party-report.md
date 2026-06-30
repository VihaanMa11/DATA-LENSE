# Party Analysis Tab — Task Report

## Status: DONE

## Commit
- `1a49dd1` — feat: Party Analysis tab — cockpit builder, API, hook, and page

## Build / Test
- `npm run build`: PASS (8.55s, 312 modules — pre-existing chunk size warning for ApexCharts, not introduced by this change)
- `npm test`: 88/88 PASS (24 new partyBuilder tests added, all pre-existing tests intact)

## Files Delivered

| File | Role |
|------|------|
| `server/partyBuilder.js` | Pure ESM builder — `buildPartyAnalysis(dashData, { fy })` |
| `test/partyBuilder.test.js` | 24 TDD tests — Cash exclusion, segments, silent detection, KPIs, sorting |
| `server/index.js` | Added `GET /api/party` after `GET /api/ceo` |
| `src/usePartyAnalysis.js` | React hook mirroring `useCeo.js` pattern |
| `src/pages/PartyAnalysis.jsx` | Full page — KPI strip, silent alert, grid3, grid2, filter row, table |
| `src/styles.css` | Appended `pa-*` CSS namespace (KPI strip, alert, segments, list, filter, status tag) |
| `src/App.jsx` | Imported `PartyAnalysis`, added `partyFy` state, wired `parties` tab like `executive` |

## Key Design Decisions

- **Cash exclusion**: case-insensitive name check in builder; verified by two tests.
- **asOfDate**: max Sales header date in the FY, NOT `new Date()` — ensures deterministic, historical "days silent" calculation.
- **daysSilent**: measured from `lastOrderDate` to `asOfDate` (not today). Silent threshold = >90 days.
- **Segments**: Regular >=10 months active, Active 6-9, Occasional 3-5, One-time/Lost <=2.
- **Returns**: only `isHeader` rows with `finalAmount` used (same pattern as ceoBuilder).
- **monthly[12]**: net contribution per Apr..Mar index; Sales Return headers subtract.
- **Receipts**: only applied to customers already in the map (no phantom Cash receipts).
- **App wiring**: `parties` tab handled like `executive` (not routed through `ANALYTICS_PAGES` or the old `Dashboard` component). The old `Dashboard` component's `parties` section (four simple bar charts) is now bypassed — the `filters.section === "parties"` branch fires first.

## Concerns / Visual Assumptions

- **Server restart required**: `server/index.js` was modified to add the `/api/party` route. The Express server must be restarted for the new endpoint to be live. Vite dev mode will pick up the change on `npm run dev` restart; production requires re-deploy.
- **bigMoney formatting in KPI strip**: values are displayed as `X.X L` (Lakh shorthand). The `money()` helper from `ui.jsx` is used in table cells and monetary lists, producing the full `₹X.XX Lakh` form. Visual assumption: the strip uses a compact shorthand (`X.X L`) to fit 5 KPIs side by side.
- **FyToggle "3-yr view" button**: FyToggle shows a "3-yr view" (value="") option. For Party Analysis this maps to no FY filter — the builder selects `latestFy` when `fy` is empty. This is fine functionally but the label is a mild misnomer. Consider changing FyToggle's "3-yr view" label to "All years" for this page in a future pass.
- **Table rank column**: uses the existing `rank`/`r1`/`r2`/`r3` CSS classes from the shared `Table` component, but PartyAnalysis renders its own table (not the shared `<Table>` component) to get the `StatusTag` column. The styles are still compatible.
- **Segment filter dropdown**: client-side segment filter uses string labels ("Regular", "Active", etc.) to match `r.segment` in the table. The builder populates `segment` with the label string, so this is an exact match — no mismatch risk.
- **Pixels not verified**: build-clean + correct data wiring is the bar. No browser render was performed.
