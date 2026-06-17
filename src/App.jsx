import React, { useEffect, useMemo, useState } from "react";

const COLORS = ["#1976d2", "#2fd083", "#f14f64", "#f6a343", "#6d6ff2", "#20a6b8", "#7c5cff", "#ff9b54", "#98a2b3", "#0f766e"];
const MONTH_LABELS = {
  "2025-04": "Apr", "2025-05": "May", "2025-06": "Jun", "2025-07": "Jul", "2025-08": "Aug", "2025-09": "Sep",
  "2025-10": "Oct", "2025-11": "Nov", "2025-12": "Dec", "2026-01": "Jan", "2026-02": "Feb", "2026-03": "Mar",
};
const MONTH_ORDER = Object.keys(MONTH_LABELS);
const PERIODS = [
  ["FY", "Full Year"], ["2025-04", "Apr"], ["2025-05", "May"], ["2025-06", "Jun"], ["2025-07", "Jul"], ["2025-08", "Aug"], ["2025-09", "Sep"],
  ["2025-10", "Oct"], ["2025-11", "Nov"], ["2025-12", "Dec"], ["2026-01", "Jan"], ["2026-02", "Feb"], ["2026-03", "Mar"],
  ["Q1", "Q1"], ["Q2", "Q2"], ["Q3", "Q3"], ["Q4", "Q4"], ["H1", "H1"], ["H2", "H2"], ["ASOF", "As on Date"],
];
const PERIOD_MONTHS = {
  FY: MONTH_ORDER,
  Q1: ["2025-04", "2025-05", "2025-06"],
  Q2: ["2025-07", "2025-08", "2025-09"],
  Q3: ["2025-10", "2025-11", "2025-12"],
  Q4: ["2026-01", "2026-02", "2026-03"],
  H1: ["2025-04", "2025-05", "2025-06", "2025-07", "2025-08", "2025-09"],
  H2: ["2025-10", "2025-11", "2025-12", "2026-01", "2026-02", "2026-03"],
  ASOF: MONTH_ORDER,
};
const NAV = [
  ["executive", "bars", "CEO View"],
  ["parties", "circle", "Party Analysis"],
  ["segments", "circle", "Segment MIS"],
  ["state", "circle", "State MIS"],
  ["items", "circle", "Item Groups"],
  ["cash", "circle", "Cash & Bank"],
  ["transport", "circle", "Transport"],
  ["uom", "circle", "UOM & Stock"],
  ["adjustments", "node", "Adjustments"],
  ["sources", "stack", "Data Sources"],
];

function money(value) {
  return `INR ${((Number(value) || 0) / 100000).toLocaleString("en-IN", { maximumFractionDigits: 2 })}L`;
}

function num(value) {
  return (Number(value) || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

function pct(part, total) {
  return total ? `${((part / total) * 100).toFixed(1)}%` : "0.0%";
}

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

function monthsForPeriod(period) {
  return PERIOD_MONTHS[period] || [period];
}

function useDashboardData() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  async function load(force = false) {
    setError("");
    setLoading(true);
    try {
      const response = await fetch(force ? "/api/refresh" : "/api/dashboard", { method: force ? "POST" : "GET" });
      const payload = await response.json();
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
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => {
      if (document.hidden) return;
      fetch("/api/status")
        .then((response) => response.json())
        .then((payload) => {
          if (payload.sourceSignature && data?.sourceSignature && payload.sourceSignature !== data.sourceSignature) {
            load(false);
          }
        })
        .catch(() => {});
    }, 15000);
    return () => window.clearInterval(id);
  }, [data?.sourceSignature]);

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

function Kpi({ title, value, meta, variant = "", icon = "bars", tone = "#1976d2" }) {
  const wave = "M0,48 C18,18 34,18 52,48 C70,78 88,78 106,48 C124,18 142,18 160,48 C178,78 196,78 214,48 C232,18 250,18 268,48";
  return (
    <div className={`kpi ${variant}`} style={{ "--tone": tone }}>
      <div className="kpi-copy">
        <div className={`k-icon ${icon}`} aria-hidden="true" />
        <div className="k-label">{title}</div>
        <div className="k-value">{value}</div>
        <div className="k-meta">{meta}</div>
      </div>
      <svg className="k-wave" viewBox="0 0 268 92" aria-hidden="true">
        <path d={`${wave} L268,92 L0,92 Z`} />
        <path d={wave} />
      </svg>
    </div>
  );
}

function SectionHead({ code, title, sub }) {
  return (
    <div className="section-head">
      <div className="section-icon">{code}</div>
      <div>
        <div className="section-title">{title}</div>
        <div className="section-sub">{sub}</div>
      </div>
    </div>
  );
}

function Card({ title, sub, badge, badgeClass = "", children }) {
  return (
    <div className="card">
      <div className="card-head">
        <div>
          <div className="card-title">{title}</div>
          <div className="card-sub">{sub}</div>
        </div>
        {badge && <span className={`badge ${badgeClass}`}>{badge}</span>}
      </div>
      {children}
    </div>
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

function Highlights({ items }) {
  return (
    <div className="timeline">
      {items.map((item, index) => (
        <div className="timeline-row" key={item.label}>
          <span className={`dot d${index % 4}`} />
          <div>
            <p>{item.label}</p>
            <h6>{item.value}</h6>
          </div>
        </div>
      ))}
    </div>
  );
}

function RatioList({ rows }) {
  return (
    <div className="ratio-list">
      {rows.map(([label, value], index) => (
        <div className="ratio-row" key={label}>
          <span className="ratio-icon">{index + 1}</span>
          <span>{label}</span>
          <b>{value}</b>
        </div>
      ))}
    </div>
  );
}

function BarChart({ rows }) {
  if (!rows.length) return <div className="empty">No data for current filters</div>;
  const max = Math.max(...rows.map((row) => Math.abs(row[1])), 1);
  return (
    <div className="bar-chart">
      {rows.map(([label, value], index) => (
        <div className="bar-row" key={`${label}-${index}`}>
          <div className="bar-label" title={label}>{label}</div>
          <div className="bar-track">
            <div className="bar-fill" style={{ width: `${Math.max(1, Math.abs(value) / max * 100)}%`, background: COLORS[index % COLORS.length] }} />
          </div>
          <div className="bar-value">{money(value)}</div>
        </div>
      ))}
    </div>
  );
}

function DonutChart({ rows }) {
  if (!rows.length) return <div className="empty">No data for current filters</div>;
  const total = rows.reduce((acc, row) => acc + Math.abs(row[1]), 0) || 1;
  let start = -90;
  const cx = 145;
  const cy = 124;
  const radius = 82;
  const slices = rows.slice(0, 8).map((row, index) => {
    const angle = Math.abs(row[1]) / total * 360;
    const end = start + angle;
    const large = angle > 180 ? 1 : 0;
    const sx = cx + radius * Math.cos(Math.PI * start / 180);
    const sy = cy + radius * Math.sin(Math.PI * start / 180);
    const ex = cx + radius * Math.cos(Math.PI * end / 180);
    const ey = cy + radius * Math.sin(Math.PI * end / 180);
    start = end;
    return <path key={row[0]} d={`M ${cx} ${cy} L ${sx} ${sy} A ${radius} ${radius} 0 ${large} 1 ${ex} ${ey} Z`} fill={COLORS[index % COLORS.length]} opacity=".92" />;
  });

  return (
    <svg className="donut-svg" viewBox="0 0 620 250" role="img">
      {slices}
      <circle cx={cx} cy={cy} r="50" fill="var(--panel)" />
      <text x={cx} y={cy - 2} textAnchor="middle" className="svg-label">Total</text>
      <text x={cx} y={cy + 16} textAnchor="middle" className="tick">{money(total)}</text>
      {rows.slice(0, 8).map(([label, value], index) => (
        <g key={label}>
          <rect x="305" y={34 + index * 22} width="9" height="9" rx="2" fill={COLORS[index % COLORS.length]} />
          <text x="322" y={42 + index * 22} className="svg-label">{label.slice(0, 30)}</text>
          <text x="590" y={42 + index * 22} className="tick" textAnchor="end">{pct(Math.abs(value), total)}</text>
        </g>
      ))}
    </svg>
  );
}

function LineChart({ series }) {
  const width = 760;
  const height = 245;
  const left = 44;
  const right = 18;
  const top = 18;
  const bottom = 34;
  const allValues = series.flatMap((item) => item.values);
  const max = Math.max(...allValues, 1);
  const xStep = (width - left - right) / (MONTH_ORDER.length - 1);
  const y = (value) => top + (height - top - bottom) * (1 - value / max);
  return (
    <svg className="line-svg" viewBox={`0 0 ${width} ${height}`} role="img">
      {[0, 0.25, 0.5, 0.75, 1].map((tick) => {
        const yy = top + (height - top - bottom) * tick;
        return <line key={tick} x1={left} y1={yy} x2={width - right} y2={yy} className="axis" />;
      })}
      {series.map((item, index) => (
        <g key={item.name}>
          <rect x={left + index * 130} y="4" width="9" height="9" rx="2" fill={COLORS[index % COLORS.length]} />
          <text x={left + 14 + index * 130} y="12" className="tick">{item.name}</text>
          <polyline
            points={item.values.map((value, i) => `${left + i * xStep},${y(value)}`).join(" ")}
            fill="none"
            stroke={COLORS[index % COLORS.length]}
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {item.values.map((value, i) => <circle key={i} cx={left + i * xStep} cy={y(value)} r="2.5" fill={COLORS[index % COLORS.length]} />)}
        </g>
      ))}
      {MONTH_ORDER.map((month, i) => <text key={month} x={left + i * xStep} y={height - 10} textAnchor="middle" className="tick">{MONTH_LABELS[month]}</text>)}
    </svg>
  );
}

function DataSourcePanel({ data, reload, setData, setError }) {
  const [open, setOpen] = useState(false);
  const [sourceDir, setSourceDir] = useState(data?.sourceDir || "");
  const [saving, setSaving] = useState(false);

  useEffect(() => setSourceDir(data?.sourceDir || ""), [data?.sourceDir]);

  async function saveSource() {
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/source", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceDir }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Unable to connect data source");
      setData(payload.data);
      setOpen(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="source-shell">
      <button className="top-button" onClick={() => setOpen((value) => !value)}>Connect Data Source</button>
      <button className="top-button muted" onClick={() => reload(true)}>Refresh</button>
      {open && (
        <div className="source-popover">
          <div className="source-title">CSV / Excel Source Folder</div>
          <div className="source-copy">Set this once to the folder containing your accounting exports. When files are updated, the backend detects modified timestamps and refreshes the dashboard data.</div>
          <input value={sourceDir} onChange={(event) => setSourceDir(event.target.value)} />
          <div className="source-actions">
            <button className="top-button muted" onClick={() => setOpen(false)}>Cancel</button>
            <button className="top-button" onClick={saveSource} disabled={saving}>{saving ? "Connecting..." : "Connect"}</button>
          </div>
        </div>
      )}
    </div>
  );
}

function UploadFilesPanel({ reload, setData, setError }) {
  const [open, setOpen] = useState(false);
  const [files, setFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");

  async function uploadFiles() {
    setError("");
    setMessage("");
    if (!files.length) {
      setMessage("Choose CSV/XLSX files first.");
      return;
    }

    setUploading(true);
    try {
      const form = new FormData();
      files.forEach((file) => form.append("files", file));
      const response = await fetch("/api/upload-dashboard", {
        method: "POST",
        body: form,
      });
      const payload = await response.json();
      if (!response.ok && response.status !== 202) {
        throw new Error(payload.error || "Upload failed");
      }
      if (payload.processed === false) {
        setMessage(payload.message || "Files uploaded to Supabase. Processing is pending.");
        return;
      }
      setData(payload);
      setOpen(false);
      setFiles([]);
      reload(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="source-shell">
      <button className="top-button upload-button" onClick={() => setOpen((value) => !value)}>Upload Files</button>
      {open && (
        <div className="source-popover upload-popover">
          <div className="source-title">Upload CSV / Excel Files</div>
          <div className="source-copy">Upload the accounting export files. The backend stores the files in Supabase, then updates the active dashboard snapshot when processing succeeds.</div>
          <input
            className="file-input"
            type="file"
            multiple
            accept=".csv,.xlsx,.xls"
            onChange={(event) => setFiles([...event.target.files])}
          />
          <div className="upload-list">
            {files.length ? files.map((file) => (
              <div className="upload-file" key={`${file.name}-${file.size}`}>
                <span>{file.name}</span>
                <b>{(file.size / 1024 / 1024).toFixed(2)} MB</b>
              </div>
            )) : <div className="source-copy">No files selected.</div>}
          </div>
          {message && <div className="upload-message">{message}</div>}
          <div className="source-actions">
            <button className="top-button muted" onClick={() => setOpen(false)}>Cancel</button>
            <button className="top-button" onClick={uploadFiles} disabled={uploading}>{uploading ? "Uploading..." : "Upload"}</button>
          </div>
        </div>
      )}
    </div>
  );
}

function Table({ headers, rows }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>{headers.map((header) => <th key={header}>{header}</th>)}</tr>
        </thead>
        <tbody>
          {rows.length ? rows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              <td><span className={`rank ${rowIndex === 0 ? "r1" : rowIndex === 1 ? "r2" : rowIndex === 2 ? "r3" : ""}`}>{rowIndex + 1}</span></td>
              {row.map((cell, index) => <td key={index}>{cell}</td>)}
            </tr>
          )) : <tr><td colSpan={headers.length}>No data for current filters</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

function Dashboard({ data, filters }) {
  const itemFacts = data.itemFacts || [];
  const ledgerFacts = data.ledgerFacts || [];

  const filtered = useMemo(() => {
    const selectedMonths = monthsForPeriod(filters.period);
    const matchesSearch = (row) => {
      if (!filters.search) return true;
      const text = [row.party, row.account, row.item, row.voucher, row.itemGroup, row.accountGroup, row.transport].join(" ").toLowerCase();
      return text.includes(filters.search.toLowerCase());
    };
    const items = itemFacts.filter((row) => {
      if (!selectedMonths.includes(row.month) || !matchesSearch(row)) return false;
      if (filters.tx !== "All" && row.tx !== filters.tx) return false;
      if (filters.party !== "All" && row.party !== filters.party) return false;
      if (filters.state !== "All" && row.state !== filters.state) return false;
      if (filters.itemGroup !== "All" && row.itemGroup !== filters.itemGroup) return false;
      return true;
    });
    const ledgers = ledgerFacts.filter((row) => {
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
    const itemTx = (tx) => MONTH_ORDER.map((month) => sum(filtered.items.filter((row) => row.tx === tx && row.isHeader && row.month === month), "finalAmount"));
    const ledgerTx = (tx) => MONTH_ORDER.map((month) => sum(filtered.ledgers.filter((row) => row.tx === tx && row.month === month), "businessAmount"));
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
  const periodLabel = PERIODS.find(([key]) => key === filters.period)?.[1] || "Full Year";

  return (
    <>
      {active === "executive" && (
        <section className="section active">
          <SectionHead code="CEO" title="CEO View" sub={`${periodLabel} - all amounts shown in INR Lakhs`} />
          <div className="kpis reference-kpis">
            <Kpi title="Total Sales" value={money(totals.netSales)} meta={`${num(totals.salesLines.length)} sales lines`} tone="#1976d2" />
            <Kpi title="Total Receipt" value={money(totals.receipts)} meta="Voucher-row debit convention" icon="money" tone="#2fd083" />
            <Kpi title="Total Purchase" value={money(totals.netPurchases)} meta={`${num(totals.purchaseLines.length)} purchase lines`} icon="box" tone="#f14f64" />
            <Kpi title="Total Payment" value={money(totals.payments)} meta="Voucher-row credit convention" icon="card" tone="#f6a343" />
          </div>
          <Card title="Sales Register Statistics" sub="" badge="">
            <div className="stat-strip">
              <div>
                <span className="stat-icon trend" />
                <b>{money(totals.grossSales - totals.salesReturns)}</b>
                <p>Sales - Credit Note(Net)</p>
              </div>
              <div>
                <span className="stat-icon cube" />
                <b>{money(totals.grossPurchases - totals.purchaseReturns)}</b>
                <p>Purchase - Debit Note(Net)</p>
              </div>
              <div>
                <span className="stat-icon cost">$</span>
                <b>{money(Math.max(totals.netPurchases, 0))}</b>
                <p>Cost</p>
              </div>
            </div>
          </Card>
          <div className="grid31">
            <Card title="Sales vs Purchase" sub="" badge=""><LineChart series={monthlySeries.slice(0, 2)} /></Card>
            <Card title="Highlights" sub="" badge="">
              <Highlights items={[
                { label: "Last Sales on current period", value: `Sales Amount: ${money(totals.netSales / Math.max(totals.salesLines.length, 1))}` },
                { label: "Last Receipt on current period", value: `Receipt Amount: ${money(totals.receipts / Math.max(filtered.ledgers.length, 1))}` },
                { label: "Last Purchase on current period", value: `Purchase Amount: ${money(totals.netPurchases / Math.max(totals.purchaseLines.length, 1))}` },
                { label: "Last Payment on current period", value: `Payment Amount: ${money(totals.payments / Math.max(filtered.ledgers.length, 1))}` },
              ]} />
            </Card>
          </div>
          <div className="grid3 reference-lower">
            <Card title="Cash & Bank Summary" sub="" badge="">
              <div className="cash-summary">
                <p>Cash Balance</p>
                <h3>{money(Math.max(totals.netCash, 0))} Dr</h3>
                <p>Bank Balance</p>
                <h3>{money(Math.abs(totals.netCash))} {totals.netCash >= 0 ? "Dr" : "Cr"}</h3>
              </div>
            </Card>
            <Card title="Receivable vs Payable" sub="" badge="">
              <DonutChart rows={[["Receivable", totals.netSales], ["Payable", totals.netPurchases]]} />
            </Card>
            <Card title="Ratio Analysis - Principal Groups" sub="" badge="">
              <RatioList rows={[
                ["Working Capital", money(totals.netCash)],
                ["Sundry Debtors", money(totals.netSales)],
                ["Sundry Creditors", money(totals.netPurchases)],
                ["Sales Accounts", money(totals.grossSales)],
                ["Purchase Accounts", money(totals.grossPurchases)],
                ["Net Profit", money(totals.netSales - totals.netPurchases)],
              ]} />
            </Card>
          </div>
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

export default function App() {
  const { data, error, loading, load, setData, setError } = useDashboardData();
  const [filters, setFilters] = useState({
    section: "executive",
    period: "FY",
    tx: "All",
    party: "All",
    state: "All",
    itemGroup: "All",
    search: "",
  });
  const [grossMode, setGrossMode] = useState(true);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

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
  const periodRange = data?.periodLabel || "FY 2025-26";

  return (
    <div className={`app-shell ${mobileNavOpen ? "nav-open" : ""}`}>
      <aside className="sidebar">
        <div className="brand">
          <div className="logo">DL</div>
          <div className="brand-title">DATA LENSE MLH</div>
        </div>
        <div className="nav-block">
          <button className="nav-group">
            <span className="nav-ico home" />
            <span>MIS Reports</span>
            <span className="chev">v</span>
          </button>
          {NAV.slice(0, 8).map(([id, code, label]) => (
            <button key={id} className={`nav-btn ${filters.section === id ? "active" : ""}`} onClick={() => { updateFilter("section", id); setMobileNavOpen(false); }}>
              <span className={`nav-dot ${code}`} />
              <span>{label}</span>
            </button>
          ))}
          {NAV.slice(8).map(([id, code, label]) => (
            <button key={id} className={`nav-group ${filters.section === id ? "active" : ""}`} onClick={() => { updateFilter("section", id); setMobileNavOpen(false); }}>
              <span className={`nav-ico ${code}`} />
              <span>{label}</span>
              <span className="chev">&gt;</span>
            </button>
          ))}
        </div>
        <div className="nav-title">Core Reports</div>
        {["Sales", "Purchase", "Inventory", "Accounts", "Financial Statement", "Statutory Reports", "Exception Reports"].map((label) => (
          <button className="nav-group report" key={label}>
            <span className="nav-ico report" />
            <span>{label}</span>
            <span className="chev">&gt;</span>
          </button>
        ))}
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
            <div className="user-chip"><span>Demo<br />User</span><i /></div>
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
              <button className="export-btn"><span className="desktop-label">Export as PDF</span><span className="mobile-label">Export</span></button>
            </div>
          </div>
          <div className="control-row">
            <label className="searchbox">
              <span className="search-glyph" aria-hidden="true" />
              <input value={filters.search} onChange={(event) => updateFilter("search", event.target.value)} placeholder="Search reports, parties, items..." />
            </label>
            <ToggleSwitch checked={grossMode} onChange={setGrossMode} />
            <select className="period-select" value={filters.period} onChange={(event) => updateFilter("period", event.target.value)}>
              {PERIODS.map(([value, label]) => <option key={value} value={value}>{label === "Full Year" ? "All Years" : label}</option>)}
            </select>
          </div>

          <details className="downloadbar advanced-filters">
            <summary>Advanced filters</summary>
            <div className="filter-grid">
              <SelectFilter label="Transaction" value={filters.tx} values={filterOptions.txs} onChange={(value) => updateFilter("tx", value)} />
              <SelectFilter label="Party / Account" value={filters.party} values={filterOptions.parties} onChange={(value) => updateFilter("party", value)} />
              <SelectFilter label="State" value={filters.state} values={filterOptions.states} onChange={(value) => updateFilter("state", value)} />
              <SelectFilter label="Item Group" value={filters.itemGroup} values={filterOptions.groups} onChange={(value) => updateFilter("itemGroup", value)} />
              {data && <UploadFilesPanel reload={load} setData={setData} setError={setError} />}
              {data && <DataSourcePanel data={data} reload={load} setData={setData} setError={setError} />}
            </div>
          </details>

          {loading && !data && <div className="loading">Loading dashboard data...</div>}
          {data && <Dashboard data={data} filters={filters} />}
        </main>
      </div>
    </div>
  );
}
