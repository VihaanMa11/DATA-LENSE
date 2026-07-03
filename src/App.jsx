import React, { useCallback, useEffect, useMemo, useState } from "react";
import { BarChart, DonutChart, LineChart } from "./components/InteractiveCharts.jsx";
import { LoginScreen } from "./components/LoginScreen.jsx";
import { getSession, login, logout } from "./authClient.js";
import { SheetContext } from "./sheetContext.js";
import { CustomerReceivables } from "./pages/CustomerReceivables.jsx";
import { VendorPayables } from "./pages/VendorPayables.jsx";
import { CustomerPareto } from "./pages/CustomerPareto.jsx";
import { ProductPareto } from "./pages/ProductPareto.jsx";
import { ExpenseAnalysis } from "./pages/ExpenseAnalysis.jsx";
import { StockMovement } from "./pages/StockMovement.jsx";
import { CustomerAnalysis } from "./pages/CustomerAnalysis.jsx";
import { SalesForecast } from "./pages/SalesForecast.jsx";
import { ProductForecast } from "./pages/ProductForecast.jsx";
import { ErrorBoundary } from "./components/ErrorBoundary.jsx";
import { money, num, pct, Kpi, SectionHead, Card, Highlights, RatioList, Table } from "./components/ui.jsx";
import { PeriodContext } from "./periodContext.js";
import { DEFAULT_FY, DEFAULT_FYS, fiscalYearMonths, monthLabels, periodMonths } from "./fiscalYear.js";
import { CeoView } from "./pages/CeoView.jsx";
import { PartyAnalysis } from "./pages/PartyAnalysis.jsx";
import { CustomerParetoView } from "./pages/CustomerParetoView.jsx";
import { CustomerAnalysisView } from "./pages/CustomerAnalysisView.jsx";
import { ItemGroupsView } from "./pages/ItemGroupsView.jsx";
import { StateMisView } from "./pages/StateMisView.jsx";
import { SegmentMisView } from "./pages/SegmentMisView.jsx";
import { ReceivablesView } from "./pages/ReceivablesView.jsx";
const MONTH_ORDER = fiscalYearMonths(DEFAULT_FY);
const MONTH_LABELS = monthLabels(MONTH_ORDER);
const PERIOD_MONTHS = periodMonths(MONTH_ORDER);
const QUARTERS = [["Q1", PERIOD_MONTHS.Q1], ["Q2", PERIOD_MONTHS.Q2], ["Q3", PERIOD_MONTHS.Q3], ["Q4", PERIOD_MONTHS.Q4]];
// Sidebar organised into logical groups. Each item: [id, label].
const NAV_GROUPS = [
  ["Overview", [
    ["executive", "CEO View"],
  ]],
  ["Sales & Customers", [
    ["parties", "Party Analysis"],
    ["customerpareto", "Customer Pareto"],
    ["customeranalysis", "Customer Analysis"],
    ["receivables", "Receivables"],
    ["segments", "Segment MIS"],
    ["state", "State MIS"],
  ]],
  ["Products & Inventory", [
    ["items", "Item Groups"],
    ["productpareto", "Product Pareto"],
    ["stockmovement", "Stock Movement"],
    ["uom", "UOM & Stock"],
  ]],
  ["Purchase & Vendors", [
    ["payables", "Vendor & Payables"],
    ["transport", "Transport"],
  ]],
  ["Finance", [
    ["cash", "Cash & Bank"],
    ["expenses", "Expense Analysis"],
    ["adjustments", "Adjustments"],
  ]],
  ["Forecasting", [
    ["salesforecast", "Sales Forecast"],
    ["productforecast", "Product Forecast"],
  ]],
  ["Data", [
    ["sources", "Data Sources"],
  ]],
];

// Flat lookup [id, code, label] kept for the page-header title.
const NAV = NAV_GROUPS.flatMap(([, items]) => items.map(([id, label]) => [id, "circle", label]));

const ANALYTICS_PAGES = new Set(["payables","productpareto","expenses","stockmovement","salesforecast","productforecast"]);

function sum(rows, field) {
  return rows.reduce((acc, row) => acc + (Number(row[field]) || 0), 0);
}

function groupRows(rows, key, field, limit = 10) {
  const map = new Map();
  rows.forEach((row) => {
    const label = row[key] || "Unmapped";
    map.set(label, (map.get(label) || 0) + (Number(row[field]) || 0));
  });
  return [...map.entries()].filter(([, value]) => value !== 0).sort((a, b) => b[1] - a[1]).slice(0, limit);
}

function signedGroup(positiveRows, negativeRows, key, limit = 10) {
  const map = new Map();
  positiveRows.forEach((row) => map.set(row[key] || "Unmapped", (map.get(row[key] || "Unmapped") || 0) + row.amount));
  negativeRows.forEach((row) => map.set(row[key] || "Unmapped", (map.get(row[key] || "Unmapped") || 0) - row.amount));
  return [...map.entries()].filter(([, value]) => value !== 0).sort((a, b) => b[1] - a[1]).slice(0, limit);
}

function sameMonthSet(a, b) {
  if (a.length !== b.length) return false;
  const sb = new Set(b);
  return a.every((m) => sb.has(m));
}

// Human label for whatever months are currently selected.
function describePeriod(months, monthOrder, labels, periodMap) {
  const list = monthOrder.filter((m) => months.includes(m));
  if (list.length === 0) return "No period";
  if (list.length === monthOrder.length) return "Full Year";
  if (sameMonthSet(list, periodMap.H1)) return "H1 - Apr-Sep";
  if (sameMonthSet(list, periodMap.H2)) return "H2 - Oct-Mar";
  const set = new Set(list);
  const quarters = [["Q1", periodMap.Q1], ["Q2", periodMap.Q2], ["Q3", periodMap.Q3], ["Q4", periodMap.Q4]];
  const fullQ = quarters.filter(([, ms]) => ms.every((m) => set.has(m)));
  if (fullQ.length >= 1 && fullQ.flatMap(([, ms]) => ms).length === list.length) {
    return fullQ.map(([q]) => q).join(" + ");
  }
  const names = list.map((m) => labels[m]);
  return names.length <= 4 ? names.join(", ") : `${names.length} months`;
}

// Calendar-style period selector.
// Full Year / H1 / H2 are macro presets — single-select, they REPLACE the selection (granular=false).
// Quarters and months are granular multi-select: the FIRST click after a macro starts a
// FRESH selection (only what you clicked); further clicks toggle additively.
function PeriodBar({ months, granular, monthOrder = MONTH_ORDER, labels = MONTH_LABELS, periodMap = PERIOD_MONTHS, onChange }) {
  const quarters = [["Q1", periodMap.Q1], ["Q2", periodMap.Q2], ["Q3", periodMap.Q3], ["Q4", periodMap.Q4]];
  const set = new Set(months);
  const isAll = !granular && months.length === monthOrder.length;
  const h1Active = !granular && sameMonthSet(months, periodMap.H1);
  const h2Active = !granular && sameMonthSet(months, periodMap.H2);

  const macro = (group) => onChange([...group], false);
  const pick = (group) => {
    if (!granular) { onChange([...group], true); return; } // fresh start from a macro preset
    const next = new Set(months);
    const allIn = group.every((m) => next.has(m));
    group.forEach((m) => (allIn ? next.delete(m) : next.add(m)));
    const ordered = monthOrder.filter((m) => next.has(m));
    if (!ordered.length) { onChange([...monthOrder], false); return; } // empty -> Full Year
    onChange(ordered, true);
  };

  const monthActive = (m) => granular && set.has(m);
  const quarterActive = (ms) => granular && ms.every((m) => set.has(m));

  return (
    <div className="period-bar" role="group" aria-label="Select reporting period">
      <div className="period-row period-row-top">
        <button type="button" className={`period-chip lead ${isAll ? "active" : ""}`} aria-pressed={isAll} onClick={() => macro(monthOrder)}>Full Year</button>
        <span className="period-div" aria-hidden="true" />
        <button type="button" className={`period-chip ${h1Active ? "active" : ""}`} aria-pressed={h1Active} onClick={() => macro(periodMap.H1)}>H1</button>
        <button type="button" className={`period-chip ${h2Active ? "active" : ""}`} aria-pressed={h2Active} onClick={() => macro(periodMap.H2)}>H2</button>
        <span className="period-div" aria-hidden="true" />
        {quarters.map(([q, ms]) => (
          <button key={q} type="button" className={`period-chip quarter ${quarterActive(ms) ? "active" : ""}`} aria-pressed={quarterActive(ms)} onClick={() => pick(ms)}>{q}</button>
        ))}
      </div>
      <div className="period-row period-row-months">
        <span className="period-div" aria-hidden="true" />
        {monthOrder.map((m) => (
          <button key={m} type="button" className={`period-chip month ${monthActive(m) ? "active" : ""}`} aria-pressed={monthActive(m)} onClick={() => pick([m])}>{labels[m]}</button>
        ))}
      </div>
    </div>
  );
}

function useDashboardData(sheetUrl, onUnauthorized) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(Boolean(sheetUrl));

  async function load(force = false) {
    if (!sheetUrl) { setData(null); setError(""); setLoading(false); return; }
    setError("");
    setLoading(true);
    try {
      const qs = `?sheetUrl=${encodeURIComponent(sheetUrl)}`;
      const response = await fetch(`${force ? "/api/refresh" : "/api/dashboard"}${qs}`, { method: force ? "POST" : "GET", credentials: "include" });
      const payload = await response.json().catch(() => ({}));
      if (response.status === 401) {
        onUnauthorized();
        return;
      }
      if (!response.ok) throw new Error(payload.error || "Unable to load dashboard data");
      setData(payload);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [sheetUrl]);

  // Lightweight auth heartbeat — surfaces an expired session without polling data.
  useEffect(() => {
    if (!sheetUrl) return undefined;
    const id = window.setInterval(() => {
      if (document.hidden) return;
      fetch("/api/status", { credentials: "include" })
        .then((response) => { if (response.status === 401) onUnauthorized(); })
        .catch(() => {});
    }, 30000);
    return () => window.clearInterval(id);
  }, [sheetUrl, onUnauthorized]);

  return { data, error, loading, load, setData, setError };
}

function SelectFilter({ label, value, values, onChange }) {
  return (
    <label>
      {label}
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="All">All</option>
        {values.map((item) => <option key={item} value={item}>{item}</option>)}
      </select>
    </label>
  );
}

function ToggleSwitch({ checked, onChange }) {
  return (
    <label className="switch-control">
      <span>Net</span>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <i aria-hidden="true" />
      <span>Gross</span>
    </label>
  );
}

function DataSourceSettings({ currentUrl, onConnected, setError }) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState(currentUrl || "");
  const [status, setStatus] = useState("idle"); // idle | syncing | success | error
  const [statusMsg, setStatusMsg] = useState("");

  useEffect(() => { setUrl(currentUrl || ""); }, [currentUrl]);

  async function syncNow() {
    const trimmed = url.trim();
    if (!trimmed) { setStatus("error"); setStatusMsg("Paste a Google Sheets URL first."); return; }
    setStatus("syncing"); setStatusMsg("Fetching workbook from Google Sheets…"); setError("");
    try {
      const response = await fetch(`/api/sync?sheetUrl=${encodeURIComponent(trimmed)}`, { method: "POST", credentials: "include" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Sync failed");
      setStatus("success"); setStatusMsg("Synced — dashboard updated.");
      onConnected(trimmed, payload);
      window.setTimeout(() => setOpen(false), 800);
    } catch (err) {
      setStatus("error"); setStatusMsg(err.message);
    }
  }

  return (
    <div className="source-shell">
      <button className="top-button" onClick={() => setOpen((value) => !value)}>
        <span className={`sync-dot ${currentUrl ? "on" : "off"}`} aria-hidden="true" />
        Data Source
      </button>
      {open && (
        <div className="source-popover settings-popover" role="dialog" aria-label="Data Source settings">
          <div className="source-title">Data Source</div>
          <div className="source-copy">Paste a Google Sheets share URL. The dashboard reads it live on every sync — no database, nothing stored server-side.</div>
          <label className="source-field">
            <span>Google Sheets URL</span>
            <input value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://docs.google.com/spreadsheets/d/..." spellCheck={false} autoComplete="off" />
            <small>Use the master template tabs: Sales, Purchase, Receipt, Payment, ItemMaster and AccountMaster.</small>
          </label>
          <div className={`sync-status ${status}`} role="status" aria-live="polite">
            <span className="sync-indicator" aria-hidden="true" />
            <span>{statusMsg || (currentUrl ? "Connected to a sheet." : "No sheet connected yet.")}</span>
          </div>
          <div className="source-actions">
            <button className="top-button muted" onClick={() => setOpen(false)}>Close</button>
            <button className="top-button primary" onClick={syncNow} disabled={status === "syncing" || !url.trim()}>
              {status === "syncing" ? "Syncing…" : "Sync Now"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Dashboard({ data, filters, monthOrder, labels, periodMap }) {
  const itemFacts = data.itemFacts || [];
  const ledgerFacts = data.ledgerFacts || [];

  const filtered = useMemo(() => {
    const selectedMonths = filters.months && filters.months.length ? filters.months : monthOrder;
    const matchesSearch = (row) => {
      if (!filters.search) return true;
      const text = [row.party, row.account, row.item, row.voucher, row.itemGroup, row.accountGroup, row.transport].join(" ").toLowerCase();
      return text.includes(filters.search.toLowerCase());
    };
    const items = itemFacts.filter((row) => {
      if (filters.fy && row.fy && row.fy !== filters.fy) return false;
      if (!selectedMonths.includes(row.month) || !matchesSearch(row)) return false;
      if (filters.tx !== "All" && row.tx !== filters.tx) return false;
      if (filters.party !== "All" && row.party !== filters.party) return false;
      if (filters.state !== "All" && row.state !== filters.state) return false;
      if (filters.itemGroup !== "All" && row.itemGroup !== filters.itemGroup) return false;
      return true;
    });
    const ledgers = ledgerFacts.filter((row) => {
      if (filters.fy && row.fy && row.fy !== filters.fy) return false;
      if (!selectedMonths.includes(row.month) || !matchesSearch(row)) return false;
      if (filters.tx !== "All" && row.tx !== filters.tx) return false;
      if (filters.party !== "All" && row.account !== filters.party) return false;
      if (filters.state !== "All" && row.state !== filters.state) return false;
      return true;
    });
    return { items, ledgers };
  }, [itemFacts, ledgerFacts, filters]);

  const totals = useMemo(() => {
    const byTx = (tx) => filtered.items.filter((row) => row.tx === tx && row.isHeader);
    const lineTx = (tx) => filtered.items.filter((row) => row.tx === tx);
    const ledgerTx = (tx) => filtered.ledgers.filter((row) => row.tx === tx);
    const grossSales = sum(byTx("Sales"), "finalAmount");
    const salesReturns = sum(byTx("Sales Return"), "finalAmount");
    const grossPurchases = sum(byTx("Purchase"), "finalAmount");
    const purchaseReturns = sum(byTx("Purchase Return"), "finalAmount");
    const receipts = sum(ledgerTx("Receipt"), "businessAmount");
    const payments = sum(ledgerTx("Payment"), "businessAmount");
    return {
      grossSales,
      salesReturns,
      netSales: grossSales - salesReturns,
      grossPurchases,
      purchaseReturns,
      netPurchases: grossPurchases - purchaseReturns,
      receipts,
      payments,
      netCash: receipts - payments,
      salesLines: lineTx("Sales"),
      salesReturnLines: lineTx("Sales Return"),
      purchaseLines: lineTx("Purchase"),
      purchaseReturnLines: lineTx("Purchase Return"),
    };
  }, [filtered]);

  const monthlySeries = useMemo(() => {
    const itemTx = (tx) => monthOrder.map((month) => sum(filtered.items.filter((row) => row.tx === tx && row.isHeader && row.month === month), "finalAmount"));
    const ledgerTx = (tx) => monthOrder.map((month) => sum(filtered.ledgers.filter((row) => row.tx === tx && row.month === month), "businessAmount"));
    return [
      { name: "Sales", values: itemTx("Sales") },
      { name: "Purchases", values: itemTx("Purchase") },
      { name: "Receipts", values: ledgerTx("Receipt") },
      { name: "Payments", values: ledgerTx("Payment") },
    ];
  }, [filtered]);

  const topCustomers = signedGroup(totals.salesLines, totals.salesReturnLines, "party", 15);
  const topSuppliers = signedGroup(totals.purchaseLines, totals.purchaseReturnLines, "party", 15);
  const itemGroups = signedGroup(totals.salesLines, totals.salesReturnLines, "itemGroup", 15);
  const itemFamilies = signedGroup(totals.salesLines, totals.salesReturnLines, "itemFamily", 15);
  const states = signedGroup(totals.salesLines, totals.salesReturnLines, "state", 15);
  const vch = groupRows(filtered.items, "vchSeries", "amount", 10);
  const accountGroups = groupRows(filtered.items, "accountGroup", "amount", 12);
  const salesTransport = groupRows(totals.salesLines, "transport", "amount", 12);
  const purchaseTransport = groupRows(totals.purchaseLines, "transport", "amount", 12);
  const receiptAccounts = groupRows(filtered.ledgers.filter((row) => row.tx === "Receipt" && row.isHeader), "account", "businessAmount", 10);
  const paymentAccounts = groupRows(filtered.ledgers.filter((row) => row.tx === "Payment" && row.isHeader), "account", "businessAmount", 10);
  const creditNotes = groupRows(filtered.ledgers.filter((row) => row.tx === "Credit Note"), "account", "businessAmount", 10);
  const debitNotes = groupRows(filtered.ledgers.filter((row) => row.tx === "Debit Note"), "account", "businessAmount", 10);

  const active = filters.section;
  const periodLabel = describePeriod(filters.months || monthOrder, monthOrder, labels, periodMap);

  return (
    <>
      {active === "executive" && (
        <section className="section active">
          {/* CEO View is rendered by CeoView.jsx — wired in DashboardApp via SheetContext */}
        </section>
      )}

      {active === "parties" && (
        <section className="section active">
          <SectionHead code="TP" title="Top Parties" sub="Customer, supplier, collection and payment concentration" />
          <div className="grid2">
            <Card title="Top Customers - Net Sales" sub="Sales amount less return amount" badge="Customer"><BarChart rows={topCustomers} /></Card>
            <Card title="Top Suppliers - Net Purchase" sub="Purchase amount less purchase return amount" badge="Supplier" badgeClass="green"><BarChart rows={topSuppliers} /></Card>
          </div>
          <div className="grid2">
            <Card title="Receipt Accounts" sub="Voucher header debit side" badge="Receipts" badgeClass="cyan"><BarChart rows={receiptAccounts} /></Card>
            <Card title="Payment Accounts" sub="Voucher header credit side" badge="Payments" badgeClass="yellow"><BarChart rows={paymentAccounts} /></Card>
          </div>
        </section>
      )}

      {active === "segments" && (
        <section className="section active">
          <SectionHead code="SG" title="Segment Wise MIS" sub="Voucher series, account group and transaction split" />
          <div className="grid3">
            <Card title="Voucher Series Split" sub="Line amount by Vch. Series" badge="Series"><DonutChart rows={vch} /></Card>
            <Card title="Account Group Mix" sub="Joined from account master" badge="Group" badgeClass="green"><BarChart rows={accountGroups} /></Card>
            <Card title="Transaction Type Mix" sub="Header-level and ledger values" badge="Type" badgeClass="yellow"><DonutChart rows={[["Gross Sales", totals.grossSales], ["Sales Returns", totals.salesReturns], ["Gross Purchases", totals.grossPurchases], ["Purchase Returns", totals.purchaseReturns], ["Receipts", totals.receipts], ["Payments", totals.payments]]} /></Card>
          </div>
        </section>
      )}

      {active === "state" && (
        <section className="section active">
          <SectionHead code="ST" title="State Wise MIS" sub="State mapping from account master" />
          <div className="grid2">
            <Card title="State Sales - Top 15" sub="Net sales by party state" badge="Sales"><BarChart rows={states} /></Card>
            <Card title="State Sales Share" sub="Percent of filtered net sales" badge="Share" badgeClass="green"><DonutChart rows={states} /></Card>
          </div>
        </section>
      )}

      {active === "items" && (
        <section className="section active">
          <SectionHead code="IG" title="Item Group / Department Wise" sub="Item master-driven product analysis" />
          <div className="grid2">
            <Card title="Item Group Revenue" sub="Net sales by item master Group Name" badge="Group"><BarChart rows={itemGroups} /></Card>
            <Card title="Item Revenue Share" sub="Top item families by net sales" badge="Item" badgeClass="green"><DonutChart rows={itemFamilies} /></Card>
          </div>
          <Card title="Item Detail Table" sub="Normalized item family, group, unit, quantity and net sales" badge="Items" badgeClass="purple">
            <Table
              headers={["#", "Item Family", "Item Group", "Unit", "Net Qty", "Net Sales"]}
              rows={itemFamilies.map(([label, value]) => {
                const sample = itemFacts.find((row) => row.itemFamily === label);
                const qty = sum(totals.salesLines.filter((row) => row.itemFamily === label), "qty") - sum(totals.salesReturnLines.filter((row) => row.itemFamily === label), "qty");
                return [<span className="strong">{label}</span>, sample?.itemGroup || "Unmapped", sample?.mainUnit || "Unmapped", num(qty), <span className="money">{money(value)}</span>];
              })}
            />
          </Card>
        </section>
      )}

      {active === "cash" && (
        <section className="section active">
          <SectionHead code="CB" title="Cash & Bank Flow" sub="Receipt and payment movement by cash/bank account" />
          <div className="grid2">
            <Card title="Receipt Accounts" sub="Voucher header debit side" badge="Receipts" badgeClass="cyan"><BarChart rows={receiptAccounts} /></Card>
            <Card title="Payment Accounts" sub="Voucher header credit side" badge="Payments" badgeClass="yellow"><BarChart rows={paymentAccounts} /></Card>
          </div>
        </section>
      )}

      {active === "transport" && (
        <section className="section active">
          <SectionHead code="TR" title="Transport / Distance Analysis" sub="Transport fields from transaction registers" />
          <div className="grid2">
            <Card title="Sales by Transport" sub="Transport field from sales register" badge="Sales"><BarChart rows={salesTransport} /></Card>
            <Card title="Purchase by Transport" sub="Transport field from purchase register" badge="Purchase" badgeClass="green"><BarChart rows={purchaseTransport} /></Card>
          </div>
        </section>
      )}

      {active === "uom" && (
        <section className="section active">
          <SectionHead code="UO" title="UOM & Opening Stock Analysis" sub="Unit mapping from item master; stock is opening stock only" />
          <div className="grid3">
            <Card title="Main Unit Revenue Split" sub="Sales amount by Main Unit" badge="UOM"><DonutChart rows={groupRows(totals.salesLines, "mainUnit", "amount", 12)} /></Card>
            <Card title="Alt Unit Revenue Split" sub="Sales amount by Alt. Unit" badge="Alt UOM" badgeClass="green"><DonutChart rows={groupRows(totals.salesLines, "altUnit", "amount", 12)} /></Card>
            <Card title="Quantity by Unit" sub="Transaction quantity by Main Unit" badge="Qty" badgeClass="blue"><BarChart rows={groupRows(filtered.items, "mainUnit", "qty", 12)} /></Card>
          </div>
        </section>
      )}

      {active === "adjustments" && (
        <section className="section active">
          <SectionHead code="AD" title="Adjustments & Journals" sub="Credit notes, debit notes and journal register" />
          <div className="grid2">
            <Card title="Credit Note Accounts" sub="Business amount on voucher header rows" badge="Credit Notes" badgeClass="red"><BarChart rows={creditNotes} /></Card>
            <Card title="Debit Note Accounts" sub="Business amount on voucher header rows" badge="Debit Notes" badgeClass="yellow"><BarChart rows={debitNotes} /></Card>
          </div>
        </section>
      )}

      {active === "sources" && (
        <section className="section active">
          <SectionHead code="DS" title="Data Sources & Caveats" sub="Audit trail, schema mapping and limitations" />
          <div className="note-grid">
            <div className="note"><b>Live source.</b><br />The backend reads directly from: {data.sourceDir}</div>
            <div className="note"><b>Auto refresh.</b><br />The frontend polls every 15 seconds and the backend reparses when file size or modified time changes.</div>
            <div className="note"><b>Metric caveat.</b><br />Gross margin and closing stock are not calculated because COGS valuation and full inventory movement are not present.</div>
          </div>
          <Card title="Source File Register" sub="Fields are preserved from source exports" badge="Schema" badgeClass="blue">
            <Table headers={["#", "File", "Role", "Rows", "Vouchers", "Fields"]} rows={(data.sourceProfile || []).map((src) => [<span className="strong">{src.file}</span>, src.role, num(src.rows), num(src.vouchers), src.columns.join(", ")])} />
          </Card>
        </section>
      )}
    </>
  );
}

function DashboardApp({ onLogout, onUnauthorized }) {
  const [sheetUrl, setSheetUrl] = useState(() => {
    try { return localStorage.getItem("dl_sheet_url") || ""; } catch { return ""; }
  });
  const { data, error, loading, load, setData, setError } = useDashboardData(sheetUrl, onUnauthorized);
  const [ceoFy, setCeoFy] = useState("");
  const [partyFy, setPartyFy] = useState("");
  const [paretoFy, setParetoFy] = useState("");
  const [caFy, setCaFy] = useState("");
  const [recFy, setRecFy] = useState("");
  const [itemsFy, setItemsFy] = useState("");
  const [stateFy, setStateFy] = useState("");
  const [segFy, setSegFy] = useState("");

  const onConnected = (url, dashboard) => {
    try { localStorage.setItem("dl_sheet_url", url); } catch { /* storage unavailable */ }
    setSheetUrl(url);
    if (dashboard) setData(dashboard);
  };
  const [filters, setFilters] = useState({
    section: "executive",
    fy: DEFAULT_FY,
    months: [...MONTH_ORDER],
    periodGranular: false,
    tx: "All",
    party: "All",
    state: "All",
    itemGroup: "All",
    search: "",
  });
  const [grossMode, setGrossMode] = useState(true);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const availableFys = useMemo(() => {
    const fromData = data?.financialYears?.length ? data.financialYears : [];
    return fromData.length ? fromData : DEFAULT_FYS;
  }, [data]);
  const selectedFy = availableFys.includes(filters.fy) ? filters.fy : availableFys[0] || DEFAULT_FY;
  const currentMonthOrder = useMemo(() => fiscalYearMonths(selectedFy), [selectedFy]);
  const currentMonthLabels = useMemo(() => monthLabels(currentMonthOrder), [currentMonthOrder]);
  const currentPeriodMap = useMemo(() => periodMonths(currentMonthOrder), [currentMonthOrder]);

  useEffect(() => {
    if (filters.fy !== selectedFy) {
      setFilters((current) => ({ ...current, fy: selectedFy, months: [...currentMonthOrder], periodGranular: false }));
    }
  }, [filters.fy, selectedFy, currentMonthOrder]);

  const filterOptions = useMemo(() => {
    if (!data) return { txs: [], parties: [], states: [], groups: [] };
    const txs = [...new Set([...(data.itemFacts || []).map((row) => row.tx), ...(data.ledgerFacts || []).map((row) => row.tx)])].filter(Boolean).sort();
    const parties = [...new Set([...(data.itemFacts || []).map((row) => row.party), ...(data.ledgerFacts || []).map((row) => row.account)])].filter(Boolean).sort();
    const states = [...new Set([...(data.itemFacts || []).map((row) => row.state), ...(data.ledgerFacts || []).map((row) => row.state)])].filter(Boolean).sort();
    const groups = [...new Set((data.itemFacts || []).map((row) => row.itemGroup))].filter(Boolean).sort();
    return { txs, parties, states, groups };
  }, [data]);

  const updateFilter = (key, value) => setFilters((current) => ({ ...current, [key]: value }));
  const activeNav = NAV.find(([id]) => id === filters.section);
  const companyName = data?.company || "MLH GOBONGO PVT. LTD.";
  const refreshLabel = data?.generatedAt ? `Last refresh ${data.generatedAt}` : "Waiting for connected data";
  const periodRange = selectedFy;

  return (
    <div className={`app-shell ${mobileNavOpen ? "nav-open" : ""}`}>
      <aside className="sidebar">
        <div className="brand">
          <div className="logo">DL</div>
          <div className="brand-title">DATA LENSE MLH</div>
        </div>
        <div className="nav-block">
          {NAV_GROUPS.map(([group, items]) => (
            <div className="nav-section" key={group}>
              <div className="nav-title">{group}</div>
              {items.map(([id, label]) => (
                <button key={id} className={`nav-btn ${filters.section === id ? "active" : ""}`} onClick={() => { updateFilter("section", id); setMobileNavOpen(false); }}>
                  <span className="nav-dot circle" />
                  <span>{label}</span>
                </button>
              ))}
            </div>
          ))}
        </div>
      </aside>
      <button className="nav-scrim" aria-label="Close navigation" onClick={() => setMobileNavOpen(false)} />

      <div className="content-shell">
        <header className="topbar">
          <div className="company-line">
            <button className="hamburger" onClick={() => setMobileNavOpen(true)} aria-label="Open navigation">=</button>
            <div>
              <div className="company-title">{companyName} <button className="tiny-select">live</button></div>
              <div className="company-meta">{refreshLabel} <span /> {periodRange}</div>
            </div>
          </div>
          <div className="top-actions">
            <button className="digital-ceo" onClick={() => load(true)} disabled={loading}>Sync Data</button>
            <button className="icon-btn search-action" aria-label="Search" />
            <button className="icon-btn" aria-label="Notifications">!</button>
            <div className="user-chip">
              <span>Signed in</span>
              <i aria-hidden="true" />
              <button type="button" className="logout-button" onClick={onLogout}>Log out</button>
            </div>
          </div>
        </header>

        <main className="main">
          {error && <div className="error-box">{error}</div>}
          {data?.cloudMode && <div className="error-box info-box">{data.cloudMessage}</div>}
          <div className="page-head">
            <div>
              <h1>{activeNav?.[2] || "CEO View"}</h1>
              <div className="breadcrumbs">MIS / {activeNav?.[2] || "CEO View"}</div>
            </div>
            <div className="page-tools">
              <DataSourceSettings currentUrl={sheetUrl} onConnected={onConnected} setError={setError} />
              <button className="export-btn"><span className="desktop-label">Export as PDF</span><span className="mobile-label">Export</span></button>
            </div>
          </div>
          {!sheetUrl && (
            <div className="error-box info-box">No Google Sheet connected. Open <b>Data Source</b> (top right) and paste your sheet URL, then press <b>Sync Now</b> to load the dashboard.</div>
          )}
          <div className="control-row">
            <label className="searchbox">
              <span className="search-glyph" aria-hidden="true" />
              <input value={filters.search} onChange={(event) => updateFilter("search", event.target.value)} placeholder="Search reports, parties, items..." />
            </label>
            <ToggleSwitch checked={grossMode} onChange={setGrossMode} />
            <label className="fy-select">
              <span>FY</span>
              <select
                value={selectedFy}
                onChange={(event) => {
                  const fy = event.target.value;
                  const nextMonths = fiscalYearMonths(fy);
                  setFilters((f) => ({ ...f, fy, months: nextMonths, periodGranular: false }));
                }}
              >
                {availableFys.map((fy) => <option key={fy} value={fy}>{fy}</option>)}
              </select>
            </label>
            <PeriodBar
              months={filters.months || currentMonthOrder}
              granular={filters.periodGranular || false}
              monthOrder={currentMonthOrder}
              labels={currentMonthLabels}
              periodMap={currentPeriodMap}
              onChange={(next, gran) => setFilters((f) => ({ ...f, months: next, periodGranular: gran }))}
            />
          </div>

          <details className="downloadbar advanced-filters">
            <summary>Advanced filters</summary>
            <div className="filter-grid">
              <SelectFilter label="Transaction" value={filters.tx} values={filterOptions.txs} onChange={(value) => updateFilter("tx", value)} />
              <SelectFilter label="Party / Account" value={filters.party} values={filterOptions.parties} onChange={(value) => updateFilter("party", value)} />
              <SelectFilter label="State" value={filters.state} values={filterOptions.states} onChange={(value) => updateFilter("state", value)} />
              <SelectFilter label="Item Group" value={filters.itemGroup} values={filterOptions.groups} onChange={(value) => updateFilter("itemGroup", value)} />
            </div>
          </details>

          {loading && !data && !ANALYTICS_PAGES.has(filters.section) && filters.section !== "executive" && filters.section !== "parties" && filters.section !== "customerpareto" && filters.section !== "customeranalysis" && filters.section !== "receivables" && filters.section !== "items" && filters.section !== "state" && filters.section !== "segments" && <div className="loading">Loading dashboard data...</div>}
          {filters.section === "executive" ? (
            <SheetContext.Provider value={sheetUrl}>
              <ErrorBoundary resetKey="executive">
                <CeoView fy={ceoFy} onFy={setCeoFy} />
              </ErrorBoundary>
            </SheetContext.Provider>
          ) : filters.section === "parties" ? (
            <SheetContext.Provider value={sheetUrl}>
              <ErrorBoundary resetKey="parties">
                <PartyAnalysis fy={partyFy} onFy={setPartyFy} />
              </ErrorBoundary>
            </SheetContext.Provider>
          ) : filters.section === "customerpareto" ? (
            <SheetContext.Provider value={sheetUrl}>
              <ErrorBoundary resetKey="customerpareto">
                <CustomerParetoView fy={paretoFy} onFy={setParetoFy} />
              </ErrorBoundary>
            </SheetContext.Provider>
          ) : filters.section === "customeranalysis" ? (
            <SheetContext.Provider value={sheetUrl}>
              <ErrorBoundary resetKey="customeranalysis">
                <CustomerAnalysisView fy={caFy} onFy={setCaFy} />
              </ErrorBoundary>
            </SheetContext.Provider>
          ) : filters.section === "receivables" ? (
            <SheetContext.Provider value={sheetUrl}>
              <ErrorBoundary resetKey="receivables">
                <ReceivablesView fy={recFy} onFy={setRecFy} />
              </ErrorBoundary>
            </SheetContext.Provider>
          ) : filters.section === "items" ? (
            <SheetContext.Provider value={sheetUrl}>
              <ErrorBoundary resetKey="items">
                <ItemGroupsView fy={itemsFy} onFy={setItemsFy} />
              </ErrorBoundary>
            </SheetContext.Provider>
          ) : filters.section === "state" ? (
            <SheetContext.Provider value={sheetUrl}>
              <ErrorBoundary resetKey="state">
                <StateMisView fy={stateFy} onFy={setStateFy} />
              </ErrorBoundary>
            </SheetContext.Provider>
          ) : filters.section === "segments" ? (
            <SheetContext.Provider value={sheetUrl}>
              <ErrorBoundary resetKey="segments">
                <SegmentMisView fy={segFy} onFy={setSegFy} />
              </ErrorBoundary>
            </SheetContext.Provider>
          ) : ANALYTICS_PAGES.has(filters.section) ? (
            <SheetContext.Provider value={sheetUrl}>
            <PeriodContext.Provider value={{ fy: selectedFy, months: filters.months || currentMonthOrder }}>
              <ErrorBoundary resetKey={filters.section}>
                {filters.section === "payables" ? <VendorPayables /> :
                 filters.section === "customerpareto" ? <CustomerPareto /> :
                 filters.section === "productpareto" ? <ProductPareto /> :
                 filters.section === "expenses" ? <ExpenseAnalysis /> :
                 filters.section === "stockmovement" ? <StockMovement /> :
                 filters.section === "salesforecast" ? <SalesForecast /> :
                 filters.section === "productforecast" ? <ProductForecast /> : null}
              </ErrorBoundary>
            </PeriodContext.Provider>
            </SheetContext.Provider>
          ) : (
            data && <Dashboard data={data} filters={{ ...filters, fy: selectedFy }} monthOrder={currentMonthOrder} labels={currentMonthLabels} periodMap={currentPeriodMap} />
          )}
        </main>
      </div>
    </div>
  );
}

export default function App() {
  const [authState, setAuthState] = useState("checking"); // checking | authenticated | logged-out

  const becomeLoggedOut = useCallback(() => setAuthState("logged-out"), []);

  useEffect(() => {
    let active = true;
    getSession()
      .then(() => { if (active) setAuthState("authenticated"); })
      .catch(() => { if (active) becomeLoggedOut(); });
    return () => { active = false; };
  }, [becomeLoggedOut]);

  async function handleLogin(password) {
    await login(password);
    setAuthState("authenticated");
  }

  async function handleLogout() {
    await logout().catch(() => {});
    becomeLoggedOut();
  }

  if (authState === "checking") {
    return <main className="auth-checking"><div className="login-brand" aria-hidden="true">DL</div><span>Checking secure session...</span></main>;
  }
  if (authState === "logged-out") return <LoginScreen onLogin={handleLogin} />;
  return <DashboardApp onLogout={handleLogout} onUnauthorized={becomeLoggedOut} />;
}
