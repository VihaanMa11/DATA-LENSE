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

## Supabase cloud data

Run `supabase/schema.sql` once in the Supabase SQL editor, then set these environment variables locally and in Vercel:

```powershell
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
SUPABASE_DASHBOARD_TABLE=dashboard_snapshots
```

Upload the current local CSV/XLSX dashboard snapshot:

```powershell
npm.cmd run supabase:upload -- --source "C:\Users\hp\Downloads\DataLense\csv"
```

The Vercel deployment reads the active Supabase snapshot. The local app still supports direct folder refresh.
