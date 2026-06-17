# DATA LENSE MLH

React and Node.js MIS dashboard for MLH Gobongo accounting exports.

## Run locally

```powershell
npm.cmd install
npm.cmd run build
npm.cmd start
```

Open `http://localhost:5173`.

## Data source

Use **Connect Data Source** in the dashboard to select the folder containing the CSV/XLSX exports. The backend checks source file size and modified time, then refreshes dashboard data when files change.

Local data-source settings, cache files, build output, logs, and dependencies are intentionally not committed.
