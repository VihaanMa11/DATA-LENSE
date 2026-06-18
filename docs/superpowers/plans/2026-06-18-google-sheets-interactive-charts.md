# Google Sheets Interactive Charts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a persistent Google Sheets workbook source and responsive, accessible zoom interactions to the existing MIS dashboard without changing its metrics or field semantics.

**Architecture:** The backend gains a source adapter that converts either local files or an in-memory Google workbook into the same named table interface consumed by the existing normalizer. The frontend keeps the current dashboard calculations and introduces focused SVG chart components with reusable windowing helpers, keyboard controls, pointer panning, and stable responsive containers.

**Tech Stack:** Node.js, Express, SheetJS `xlsx`, React 19, Vite, Node test runner, custom SVG/CSS.

---

### Task 1: Google Sheets source parsing

**Files:**
- Create: `test/googleSheetsSource.test.js`
- Create: `server/googleSheetsSource.js`
- Modify: `server/dashboardBuilder.js`
- Modify: `package.json`

- [ ] **Step 1: Write failing tests for Sheet ID parsing, export URL creation, required-tab validation, and workbook normalization.**
- [ ] **Step 2: Run `node --test test/googleSheetsSource.test.js` and verify failures are caused by missing exports.**
- [ ] **Step 3: Implement `extractGoogleSheetId`, `googleSheetExportUrl`, `fetchGoogleWorkbook`, and a workbook table adapter.**
- [ ] **Step 4: Refactor `dashboardBuilder.js` to normalize either local tables or named workbook tabs through one unchanged fact-building pipeline.**
- [ ] **Step 5: Run `node --test test/googleSheetsSource.test.js` and verify all source tests pass.**

### Task 2: Source configuration and API integration

**Files:**
- Create: `test/sourceConfig.test.js`
- Create: `server/sourceConfig.js`
- Modify: `server/index.js`
- Modify: `server/data-source.json`

- [ ] **Step 1: Write failing tests for legacy local config migration and Google Sheet config validation.**
- [ ] **Step 2: Run `node --test test/sourceConfig.test.js` and confirm the intended failures.**
- [ ] **Step 3: Implement normalized `local-folder` and `google-sheet` config helpers.**
- [ ] **Step 4: Update `/api/source`, `/api/dashboard`, and `/api/refresh` to fetch, parse, cache, and report Google Sheets data while preserving local-folder and Supabase behavior.**
- [ ] **Step 5: Run `node --test test/sourceConfig.test.js test/googleSheetsSource.test.js` and verify both suites pass.**

### Task 3: Zoom model and interactive charts

**Files:**
- Create: `test/chartWindow.test.js`
- Create: `src/chartWindow.js`
- Create: `src/components/ChartControls.jsx`
- Create: `src/components/InteractiveCharts.jsx`
- Modify: `src/App.jsx`
- Modify: `src/styles.css`

- [ ] **Step 1: Write failing tests for zoom-in, zoom-out, reset, and bounded panning behavior.**
- [ ] **Step 2: Run `node --test test/chartWindow.test.js` and verify the helper module is missing.**
- [ ] **Step 3: Implement pure chart-window helpers and make the tests pass.**
- [ ] **Step 4: Implement accessible line, bar, and donut chart components with tooltips, focus states, line zoom/pan/reset controls, and responsive dimensions.**
- [ ] **Step 5: Replace the old chart functions in `App.jsx` without changing labels, series, filters, or metric formulas.**
- [ ] **Step 6: Add restrained chart toolbar, tooltip, focus, mobile, and overflow styling in `styles.css`.**

### Task 4: Google Sheets source panel

**Files:**
- Modify: `src/App.jsx`
- Modify: `src/styles.css`

- [ ] **Step 1: Add a segmented CSV/Excel Folder versus Google Sheets selector to `DataSourcePanel`.**
- [ ] **Step 2: Submit `sourceType`, `sourceDir`, and `googleSheetUrl` through the existing source endpoint with actionable loading and error states.**
- [ ] **Step 3: Show the connected source type and preserve the existing refresh/upload workflows.**
- [ ] **Step 4: Verify keyboard focus, narrow viewport wrapping, and no content overflow.**

### Task 5: End-to-end verification

**Files:**
- Modify only if verification exposes a defect.

- [ ] **Step 1: Run `node --test test/*.test.js` and require zero failures.**
- [ ] **Step 2: Run `npm run build` and require a successful Vite production build.**
- [ ] **Step 3: Start the app and verify the flow: open dashboard -> connect Google Sheet -> dashboard refreshes -> zoom/pan/reset changes the monthly chart -> mobile layout remains unclipped.**
- [ ] **Step 4: Check page identity, meaningful DOM, framework overlays, browser console, desktop screenshot, mobile screenshot, and at least one interaction state.**
- [ ] **Step 5: Review the diff for accidental metric, label, or workbook-field changes before completion.**
