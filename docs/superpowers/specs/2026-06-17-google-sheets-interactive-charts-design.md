# Google Sheets Interactive Charts Design

## Objective

Enhance the MLH MIS dashboard so it can load source data directly from the provided Google Sheets workbook and render the existing MIS visuals with dynamic chart interactions, including zooming, without changing source field meanings or metric definitions.

## Current Context

- The app is a React/Vite frontend served by a Node/Express backend.
- Existing data is normalized into `itemFacts`, `ledgerFacts`, and `sourceProfile`.
- Existing source semantics are based on the original accounting files:
  - `CrNote25`
  - `DrNote25`
  - `JournalRegister25`
  - `receipt25`
  - `payment25`
  - `PurchaseReturn25`
  - `SalesReturn25`
  - `Purchase25`
  - `Sales25`
  - `Itemmaster`
  - `accmasterxlsx`
- The provided Google Sheets workbook is readable through XLSX export at:
  `https://docs.google.com/spreadsheets/d/1MXcOQP7fA6m7hjGcEHpdWkDw221ykqMyQ4atp98rMLQ/export?format=xlsx`
- A fresh export confirmed the workbook contains all required tabs with populated data.

## Approved Approach

Use the Google Sheets XLSX export as a first-class backend data source. The backend will download the workbook, map each tab to the same file role currently used by the dashboard parser, normalize it through the same metric pipeline, and expose the same `/api/dashboard` response shape already consumed by the frontend.

This keeps Google Sheets as the only new external source and avoids changing dashboard metric semantics.

## Backend Design

### Source Configuration

Extend the existing data source concept from local folder paths to source types:

- `local-folder`: current CSV/XLSX folder behavior.
- `google-sheet`: Google Sheets workbook URL or sheet ID.

The saved config should preserve the existing local folder behavior and add Google Sheets fields only when selected:

```json
{
  "sourceType": "google-sheet",
  "sourceDir": "C:\\Users\\hp\\Downloads\\DataLense\\csv",
  "googleSheetUrl": "https://docs.google.com/spreadsheets/d/1MXcOQP7fA6m7hjGcEHpdWkDw221ykqMyQ4atp98rMLQ/edit?usp=sharing",
  "googleSheetId": "1MXcOQP7fA6m7hjGcEHpdWkDw221ykqMyQ4atp98rMLQ"
}
```

### Google Sheets Fetching

The backend will:

1. Extract the spreadsheet ID from the submitted URL or accept a raw ID.
2. Fetch `https://docs.google.com/spreadsheets/d/{id}/export?format=xlsx`.
3. Parse the returned workbook with the existing `xlsx` dependency.
4. Validate that all required tabs exist.
5. Normalize each tab through the same row-cleaning and fact-building logic used today.

### Parser Refactor

Refactor `server/dashboardBuilder.js` so it supports two input adapters:

- File adapter: reads local files from disk.
- Workbook adapter: reads named Google Sheets tabs from an in-memory workbook.

The parser should keep the same field names, output objects, and source profile structure. For source profile display, Google Sheets tabs should report tab names instead of local filenames.

### Refresh And Caching

For Google Sheets:

- `/api/dashboard` loads from the saved Google Sheet source.
- `/api/refresh` re-downloads the workbook.
- `sourceSignature` should be based on workbook export metadata where available and a stable content signature from sheet names, ranges, and export byte size.
- Supabase snapshot behavior remains unchanged; a parsed Google Sheet dashboard can still be saved as the active snapshot if existing upload/snapshot code paths are reused later.

### Error Handling

The backend should return clear errors for:

- Missing or invalid Google Sheets URL/ID.
- Private or inaccessible Sheet export.
- Missing required tab names.
- Empty required tabs.
- Invalid workbook response from Google.

No fallback should silently change metrics; if a tab is missing, the dashboard should show an actionable error.

## Frontend Design

### Data Source UI

Update `DataSourcePanel` to let the user choose:

- CSV / Excel Folder
- Google Sheets

For Google Sheets mode:

- Show one input for the Sheet URL or ID.
- Save through the same `/api/source` endpoint.
- Show connected status as `Google Sheets workbook`.
- Keep manual `Refresh` / `Sync Data` controls.

### Dynamic Charts

Replace the current static SVG chart rendering with interactive chart components while preserving existing labels, series names, colors, and measures.

Required chart behaviors:

- Line charts support horizontal zoom and pan across months.
- Bar charts support value tooltips and a zoomed/detail view for dense rankings.
- Donut charts support hover/focus slices and accessible legends.
- All charts remain responsive and do not overflow their card boundaries.

Recommended implementation is custom React/SVG interactions rather than introducing a heavy chart service:

- Keep SVG charts for visual consistency.
- Add pointer-driven selection, hover tooltips, keyboard focus, and zoom controls.
- For the monthly line chart, use a visible month-window state with controls:
  - `-` zoom out
  - `+` zoom in
  - reset
  - drag/pan on desktop
  - previous/next controls for touch/mobile

This keeps bundle size controlled and avoids external services beyond Google Sheets.

### Accessibility

Each chart should include:

- `role="img"` and descriptive `aria-label`.
- Keyboard-accessible controls for zoom and reset.
- Visible focus states.
- Tooltip values available through title text or hidden descriptive text.
- Empty states when filters produce no data.

### Visual Direction

Keep the current clean MIS/admin-style layout, but polish the chart cards:

- Stable card dimensions so interactions do not shift layout.
- Quiet controls placed inside chart headers or top-right chart toolbars.
- Restrained motion using transform and opacity only.
- High contrast labels and tooltips.

The dashboard should remain operational and data-dense, not become a marketing-style layout.

## Testing Plan

1. Verify Google Sheet export can be downloaded and parsed.
2. Verify all required tabs are detected.
3. Verify normalized counts for item and ledger facts are populated.
4. Verify `/api/source` can switch to Google Sheets mode and persists config.
5. Verify `/api/dashboard` returns the same response shape as the local source mode.
6. Verify line chart zoom in, zoom out, reset, and pan.
7. Verify bar and donut tooltips/focus states.
8. Verify desktop and mobile layouts do not clip chart labels or controls.
9. Run `npm run build`.

## Assumptions

- The Google Sheet remains shared so the XLSX export URL is accessible without authentication.
- Tab names stay aligned with the original file names listed above.
- The dashboard must preserve existing metric formulas and source field meanings.
- Google Sheets is the only new external data source for this change.

## Out Of Scope

- Google OAuth.
- Editing Google Sheets from the dashboard.
- Changing the source workbook structure.
- Adding non-Google data services.
- Replacing the MIS dashboard with a new analytical model.
