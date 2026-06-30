import React, { useMemo, useState } from "react";
import { usePartyAnalysis } from "../usePartyAnalysis.js";
import { SectionHead, Card, money } from "../components/ui.jsx";
import { BarChart, LineChart } from "../components/InteractiveCharts.jsx";
import { PageState } from "./pageKit.jsx";
import { FyToggle } from "../components/ceo/FyToggle.jsx";

// ---------------------------------------------------------------------------
// Local helpers
// ---------------------------------------------------------------------------

function bigMoney(v) {
  const n = Number(v) || 0;
  if (Math.abs(n) >= 1e7) return `${(n / 1e7).toFixed(1)} Cr`;
  if (Math.abs(n) >= 1e5) return `${(n / 1e5).toFixed(1)} L`;
  return `${Math.round(n).toLocaleString("en-IN")}`;
}

function fmtMoney(v) {
  return money(v);
}

function fmtPct(v) {
  return `${Number(v).toFixed(1)}%`;
}

function fmtDate(d) {
  if (!d) return "—";
  return d;
}

// Segment dot colors
const SEG_COLORS = {
  regular:    "#12b76a",
  active:     "#2563eb",
  occasional: "#d97706",
  lost:       "#ef4444",
};

// Tag for status column
function StatusTag({ status, segmentKey }) {
  const isSilent = status && status.startsWith("Silent");
  const color = isSilent ? "#ef4444" : (SEG_COLORS[segmentKey] || "#5d6678");
  return (
    <span
      className="pa-status-tag"
      style={{ background: color + "22", color, border: `1px solid ${color}44` }}
    >
      {status}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Section: KPI strip
// ---------------------------------------------------------------------------
function KpiStrip({ kpis }) {
  const items = [
    { label: "Trade Customers",   value: String(kpis.tradeCustomers),         tone: "#2563eb" },
    { label: "Net Sales (Trade)", value: `${bigMoney(kpis.netSalesTrade)} L`, tone: "#12b76a", note: fmtMoney(kpis.netSalesTrade) },
    { label: "Avg Bill Value",    value: `${bigMoney(kpis.avgBillValue)} L`,  tone: "#7c5cff", note: fmtMoney(kpis.avgBillValue) },
    { label: "Regular Buyers",    value: String(kpis.regularBuyers),           tone: "#12b76a" },
    { label: "Silent Parties",    value: String(kpis.silentParties),           tone: "#ef4444" },
  ];

  return (
    <div className="pa-kpi-strip">
      {items.map(({ label, value, tone, note }) => (
        <div className="pa-kpi" key={label} style={{ "--pa-tone": tone }}>
          <div className="pa-kpi-label">{label}</div>
          <div className="pa-kpi-value">{value}</div>
          {note && <div className="pa-kpi-note">{note}</div>}
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section: Silent alert
// ---------------------------------------------------------------------------
function SilentAlert({ rows }) {
  if (!rows || rows.length === 0) return null;
  return (
    <div className="pa-silent-alert">
      <div className="pa-alert-head">
        <span className="pa-alert-dot" />
        <b>Silent high-value parties — need follow-up</b>
      </div>
      <div className="pa-alert-rows">
        {rows.map(r => (
          <div className="pa-alert-row" key={r.name}>
            <span className="pa-alert-name">{r.name}</span>
            <span className="pa-alert-amt">{fmtMoney(r.netSales)}</span>
            <span className="pa-alert-meta">Last order {fmtDate(r.lastOrder)}</span>
            <span className="pa-alert-days">{r.daysSilent}d silent</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section: Customer segments
// ---------------------------------------------------------------------------
function SegmentCard({ segments }) {
  const total = segments.reduce((s, seg) => s + seg.count, 0);
  const occasionalPluslost = segments
    .filter(s => s.key === "occasional" || s.key === "lost")
    .reduce((s, seg) => s + seg.pct, 0);

  return (
    <div className="pa-seg-card">
      {segments.map(seg => (
        <div className="pa-seg-row" key={seg.key}>
          <span className="pa-seg-dot" style={{ background: seg.color }} />
          <span className="pa-seg-label">{seg.label}</span>
          <span className="pa-seg-count">{seg.count}</span>
          <span className="pa-seg-pct">{fmtPct(seg.pct)}</span>
          <div className="pa-seg-bar-wrap">
            <div className="pa-seg-bar" style={{ width: `${seg.pct}%`, background: seg.color }} />
          </div>
        </div>
      ))}
      <div className="pa-seg-note">
        {fmtPct(occasionalPluslost)} occasional or one-time/lost
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section: Frequency table
// ---------------------------------------------------------------------------
function FrequencyList({ rows }) {
  if (!rows || rows.length === 0) return <div className="empty">No data</div>;
  return (
    <div className="pa-list">
      {rows.map((r, i) => (
        <div className="pa-list-row" key={r.name}>
          <span className="pa-list-rank">{i + 1}</span>
          <span className="pa-list-name">{r.name}</span>
          <span className="pa-list-val">{r.bills} bills</span>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section: Avg bill list
// ---------------------------------------------------------------------------
function AvgBillList({ rows }) {
  if (!rows || rows.length === 0) return <div className="empty">No data</div>;
  return (
    <div className="pa-list">
      {rows.map((r, i) => (
        <div className="pa-list-row" key={r.name}>
          <span className="pa-list-rank">{i + 1}</span>
          <span className="pa-list-name">{r.name}</span>
          <span className="pa-list-val">{fmtMoney(r.avgBill)}</span>
          <span className="pa-list-tag">{r.monthsActive}mo</span>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section: Full party detail table
// ---------------------------------------------------------------------------
function PartyTable({ rows, segFilter, silenceFilter }) {
  const filtered = rows.filter(r => {
    if (segFilter !== "all" && r.segment !== segFilter) return false;
    if (silenceFilter === "silent" && !r.status.startsWith("Silent")) return false;
    if (silenceFilter === "active" && r.status.startsWith("Silent")) return false;
    return true;
  });

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Party</th>
            <th>Net Sales</th>
            <th>Returns</th>
            <th>Ret %</th>
            <th>Bills</th>
            <th>Avg Bill</th>
            <th>Months</th>
            <th>Last Order</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {filtered.length === 0 ? (
            <tr><td colSpan={10}>No data for current filters</td></tr>
          ) : filtered.map((r, i) => (
            <tr key={r.name}>
              <td><span className={`rank ${i === 0 ? "r1" : i === 1 ? "r2" : i === 2 ? "r3" : ""}`}>{i + 1}</span></td>
              <td><span className="strong">{r.name}</span></td>
              <td><span className="money">{fmtMoney(r.netSales)}</span></td>
              <td>{r.returns > 0 ? fmtMoney(r.returns) : "—"}</td>
              <td>{r.returns > 0 ? fmtPct(r.returnPct) : "—"}</td>
              <td>{r.bills}</td>
              <td><span className="money">{fmtMoney(r.avgBill)}</span></td>
              <td>{r.monthsActive}</td>
              <td>{fmtDate(r.lastOrder)}</td>
              <td><StatusTag status={r.status} segmentKey={r.segmentKey} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main: PartyAnalysis
// ---------------------------------------------------------------------------
export function PartyAnalysis({ fy, onFy }) {
  const { party, loading, error } = usePartyAnalysis(fy);

  const [segFilter, setSegFilter]         = useState("all");
  const [silenceFilter, setSilenceFilter] = useState("all");

  const APR_TO_MAR = ["Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec","Jan","Feb","Mar"];

  // BarChart rows for net sales ranking
  const barRows = useMemo(
    () => (party?.netSalesRanking || []).map(r => [r.name, r.netSales]),
    [party],
  );

  if (!party && !loading && !error) {
    return (
      <div className="error-box info-box">
        No Google Sheet connected. Open <b>Data Source</b> (top right) and paste your sheet URL, then press <b>Sync Now</b>.
      </div>
    );
  }

  const segOptions = [
    { value: "all",           label: "All segments" },
    { value: "Regular",       label: "Regular" },
    { value: "Active",        label: "Active" },
    { value: "Occasional",    label: "Occasional" },
    { value: "One-time/Lost", label: "One-time/Lost" },
  ];

  return (
    <PageState loading={loading} error={error}>
      {party && (
        <div className="pa-wrap">
          {/* Header row */}
          <div className="ceo-header-row">
            <SectionHead
              code="PA"
              title="Party Analysis"
              sub={`${party.fy || ""} · customer cockpit · all amounts in INR`}
            />
            <FyToggle
              fyList={party.fyList || []}
              value={fy}
              onChange={onFy}
            />
          </div>

          {/* KPI strip */}
          <KpiStrip kpis={party.kpis} />

          {/* Silent high-value alert */}
          <SilentAlert rows={party.silentAlert} />

          {/* Grid 3: segments / frequency / avg bill */}
          <div className="ceo-grid3">
            <Card title="Customer segments" sub="Buying frequency classification">
              <SegmentCard segments={party.segments} />
            </Card>
            <Card title="Buying frequency — top 6" sub="Bills placed in the year">
              <FrequencyList rows={party.topByFrequency} />
            </Card>
            <Card title="Avg bill value — top 6" sub="Average order size (min 1 bill)">
              <AvgBillList rows={party.topByAvgBill} />
            </Card>
          </div>

          {/* Grid 2: net sales ranking chart / MoM trend */}
          <div className="ceo-grid2">
            <Card title="Net sales ranking — top 10" sub="Bar chart sorted by net sales">
              <BarChart rows={barRows} />
              {party.netSalesRanking.some(r => r.returnPct > 0) && (
                <p className="pa-footnote">
                  Return rate shown in the party detail table below.
                </p>
              )}
            </Card>
            <Card title="Month-on-month sales trend — top 4" sub="Net sales per month, Apr through Mar">
              <LineChart
                series={party.momTop4?.series || []}
                months={APR_TO_MAR}
                labels={{}}
              />
            </Card>
          </div>

          {/* Party detail table — full width */}
          <Card title="Party detail" sub="All trade customers — sorted by net sales">
            {/* Client-side filters */}
            <div className="pa-filter-row">
              <label className="pa-filter-label">
                Segment
                <select
                  className="pa-filter-select"
                  value={segFilter}
                  onChange={e => setSegFilter(e.target.value)}
                >
                  {segOptions.map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </label>
              <label className="pa-filter-label">
                Activity
                <select
                  className="pa-filter-select"
                  value={silenceFilter}
                  onChange={e => setSilenceFilter(e.target.value)}
                >
                  <option value="all">All parties</option>
                  <option value="active">Active only</option>
                  <option value="silent">Silent only</option>
                </select>
              </label>
            </div>
            <PartyTable
              rows={party.table}
              segFilter={segFilter}
              silenceFilter={silenceFilter}
            />
          </Card>
        </div>
      )}
    </PageState>
  );
}
