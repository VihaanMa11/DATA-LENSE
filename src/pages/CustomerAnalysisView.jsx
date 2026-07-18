import React, { useMemo } from "react";
import ReactApexChart from "react-apexcharts";
import { useCustomerAnalysis } from "../useCustomerAnalysis.js";
import { SectionHead, Card } from "../components/ui.jsx";
import { LineChart } from "../components/InteractiveCharts.jsx";
import { FyToggle } from "../components/ceo/FyToggle.jsx";
import { KpiCard } from "../components/ceo/KpiCard.jsx";
import { AlertBar } from "../components/ceo/AlertBar.jsx";
import { PageState } from "./pageKit.jsx";
import { money } from "../components/chartTheme.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function bigMoney(v) {
  const n = Number(v) || 0;
  if (Math.abs(n) >= 1e7) return `${(n / 1e7).toFixed(1)} Cr`;
  if (Math.abs(n) >= 1e5) return `${(n / 1e5).toFixed(1)} L`;
  return `${Math.round(n).toLocaleString("en-IN")}`;
}

function fmtPct(v) {
  if (v == null || isNaN(Number(v))) return "-";
  return `${Number(v).toFixed(1)}%`;
}

function fmtDelta(v, suffix = "%") {
  if (v == null || isNaN(Number(v))) return null;
  const n = Number(v);
  return `${n >= 0 ? "+" : ""}${n.toFixed(0)}${suffix}`;
}

// Shorten "FY 2024-25" -> "FY25"
function shortFy(fy) {
  const m = String(fy || "").match(/FY\s*\d{4}-(\d{2})/i);
  return m ? `FY${m[1]}` : fy;
}

// ---------------------------------------------------------------------------
// Waterfall (horizontal flex bars)
// ---------------------------------------------------------------------------
const WF_COLORS = {
  base:  "#2563eb",
  gain:  "#12b76a",
  loss:  "#ef4444",
  total: "#7c5cff",
};

function WaterfallChart({ waterfall }) {
  if (!waterfall || waterfall.length === 0) return <div className="empty">No waterfall data</div>;

  const maxAbs = Math.max(...waterfall.map((w) => Math.abs(w.value)), 1);

  return (
    <div className="ca-waterfall">
      {waterfall.map((w, i) => {
        const widthPct = Math.max(3, Math.round((Math.abs(w.value) / maxAbs) * 100));
        const color = WF_COLORS[w.kind] || "#5d6678";
        return (
          <div key={i} className="ca-wf-row">
            <div className="ca-wf-label">{w.label}</div>
            <div className="ca-wf-track">
              <div
                className="ca-wf-bar"
                style={{ width: `${widthPct}%`, background: color }}
              />
            </div>
            <div className="ca-wf-value" style={{ color }}>
              {w.value > 0 ? `+${w.value}` : w.value}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Segment boxes
// ---------------------------------------------------------------------------
const SEG_COLORS = {
  Champion:  { bg: "#eef4ff", border: "#2563eb", text: "#2563eb" },
  Loyal:     { bg: "#e7f8ef", border: "#12b76a", text: "#12b76a" },
  "At Risk": { bg: "#fdf2e3", border: "#d97706", text: "#d97706" },
  Lost:      { bg: "#fdecec", border: "#ef4444", text: "#ef4444" },
  New:       { bg: "#f1eeff", border: "#7c5cff", text: "#7c5cff" },
  Recovered: { bg: "#e7f8ef", border: "#0e9456", text: "#0e9456" },
};

function SegmentBoxes({ segments, total }) {
  if (!segments || segments.length === 0) return <div className="empty">No segments</div>;
  return (
    <div className="ca-seg-grid">
      {segments.map((seg) => {
        const style = SEG_COLORS[seg.label] || { bg: "#f4f7fb", border: "#d6deea", text: "#5d6678" };
        const pct = total > 0 ? Math.round((seg.count / total) * 100) : 0;
        return (
          <div
            key={seg.key}
            className="ca-seg-box"
            style={{ background: style.bg, borderColor: style.border }}
          >
            <div className="ca-seg-name" style={{ color: style.text }}>{seg.label}</div>
            <div className="ca-seg-count">{seg.count}</div>
            <div className="ca-seg-bar-track">
              <div
                className="ca-seg-bar"
                style={{ width: `${pct}%`, background: style.border }}
              />
            </div>
            <div className="ca-seg-pct" style={{ color: style.text }}>{pct}%</div>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Retention rate bars (horizontal pairs)
// ---------------------------------------------------------------------------
function RetentionBars({ retentionRate }) {
  if (!retentionRate || retentionRate.length === 0) return <div className="empty">No retention data</div>;
  return (
    <div className="ca-ret-list">
      {retentionRate.map((r, i) => (
        <div key={i} className="ca-ret-row">
          <div className="ca-ret-pair">{r.pair}</div>
          <div className="ca-ret-bars">
            <div className="ca-ret-segment" style={{ width: `${r.retainedPct}%`, background: "#12b76a" }}>
              {r.retainedPct >= 10 ? `${r.retainedPct}%` : ""}
            </div>
            <div className="ca-ret-segment" style={{ width: `${r.churnedPct}%`, background: "#ef4444" }}>
              {r.churnedPct >= 10 ? `${r.churnedPct}%` : ""}
            </div>
          </div>
          <div className="ca-ret-meta">
            <span style={{ color: "#12b76a", fontWeight: 700 }}>{r.retainedPct}% retained</span>
            <span style={{ color: "#ef4444", marginLeft: 8 }}>{r.churnedPct}% churned</span>
          </div>
        </div>
      ))}
      <div className="ca-ret-legend">
        <span className="ca-legend-dot" style={{ background: "#12b76a" }} />Retained
        <span className="ca-legend-dot" style={{ background: "#ef4444", marginLeft: 12 }} />Churned
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Frequency by FY bars (simple vertical)
// ---------------------------------------------------------------------------
function FrequencyBars({ frequencyByFy }) {
  if (!frequencyByFy || frequencyByFy.length === 0) return <div className="empty">No data</div>;
  const max = Math.max(...frequencyByFy.map((f) => f.avgBills), 1);
  return (
    <div className="ca-freq-bars">
      {frequencyByFy.map((f) => {
        const heightPct = Math.max(4, Math.round((f.avgBills / max) * 100));
        return (
          <div key={f.fy} className="ca-freq-col">
            <div className="ca-freq-val">{f.avgBills}</div>
            <div className="ca-freq-track">
              <div className="ca-freq-bar" style={{ height: `${heightPct}%`, background: "#2563eb" }} />
            </div>
            <div className="ca-freq-label">{shortFy(f.fy)}</div>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Cohort grid
// ---------------------------------------------------------------------------
function CohortGrid({ cohorts, fyList }) {
  if (!cohorts || cohorts.length === 0) return <div className="empty">No cohort data</div>;

  // Subsequent FY labels: for each cohort, the retention array covers fyList[cohort_idx..]
  return (
    <div className="ca-cohort-wrap">
      <div className="ca-cohort-note">
        Each row = customers whose first purchase was in that year. Columns show what % still bought in that and later years.
      </div>
      <div className="ca-cohort-table-wrap">
        <table className="ca-cohort-table">
          <thead>
            <tr>
              <th>Cohort</th>
              <th>Size</th>
              {fyList.map((fy) => <th key={fy}>{shortFy(fy)}</th>)}
            </tr>
          </thead>
          <tbody>
            {cohorts.map((c) => {
              const cohortFyIdx = fyList.indexOf(c.cohort);
              return (
                <tr key={c.cohort}>
                  <td><span className="strong">{shortFy(c.cohort)}</span></td>
                  <td>{c.size}</td>
                  {fyList.map((fy, fyIdx) => {
                    // retention[i] corresponds to fyList[cohortFyIdx + i]
                    const retIdx = fyIdx - cohortFyIdx;
                    const val = retIdx >= 0 && retIdx < c.retention.length ? c.retention[retIdx] : null;
                    if (val == null) return <td key={fy} className="ca-cohort-na">-</td>;
                    const intensity = Math.round((val / 100) * 255);
                    const bg = `rgba(37, 99, 235, ${(val / 100) * 0.55 + 0.08})`;
                    return (
                      <td key={fy} className="ca-cohort-cell" style={{ background: bg }}>
                        {val}%
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Acquisition grouped bar chart (ApexCharts)
// ---------------------------------------------------------------------------
function AcquisitionChart({ acquisitionMoM }) {
  const { options, series } = useMemo(() => {
    if (!acquisitionMoM || !acquisitionMoM.series || acquisitionMoM.series.length === 0) {
      return { options: null, series: [] };
    }
    const colors = ["#2563eb", "#12b76a", "#7c5cff"];
    const opts = {
      chart: { type: "bar", toolbar: { show: false }, background: "transparent", fontFamily: "Inter, sans-serif" },
      plotOptions: { bar: { columnWidth: "60%", borderRadius: 3, borderRadiusApplication: "end" } },
      colors: colors.slice(0, acquisitionMoM.series.length),
      dataLabels: { enabled: false },
      legend: { position: "top", horizontalAlign: "left", fontSize: "12px" },
      grid: { borderColor: "#e3e8f0", strokeDashArray: 4 },
      xaxis: {
        categories: acquisitionMoM.months,
        labels: { style: { colors: "#5d6678", fontSize: "11px" } },
        axisBorder: { show: false },
      },
      yaxis: {
        labels: { style: { colors: "#5d6678", fontSize: "11px" } },
        title: { text: "New customers", style: { color: "#5d6678", fontWeight: 600, fontSize: "11px" } },
      },
      tooltip: { shared: true, intersect: false },
    };
    const ser = acquisitionMoM.series.map((s) => ({ name: s.name, data: s.values }));
    return { options: opts, series: ser };
  }, [acquisitionMoM]);

  if (!options || series.length === 0) return <div className="empty">No acquisition data</div>;
  return (
    <div className="chart-frame apex-frame">
      <ReactApexChart options={options} series={series} type="bar" height={260} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Segment tag chip
// ---------------------------------------------------------------------------
const SEG_TAG_STYLE = {
  Champion:  { bg: "#eef4ff", color: "#2563eb" },
  Loyal:     { bg: "#e7f8ef", color: "#12b76a" },
  AtRisk:    { bg: "#fdf2e3", color: "#d97706" },
  Lost:      { bg: "#fdecec", color: "#ef4444" },
  New:       { bg: "#f1eeff", color: "#7c5cff" },
  Recovered: { bg: "#e7f8ef", color: "#0e9456" },
};

function SegTag({ segment, atRiskReasons }) {
  const s = SEG_TAG_STYLE[segment] || { bg: "#f4f7fb", color: "#5d6678" };
  const title = segment === "AtRisk" && atRiskReasons
    ? `No order in ${atRiskReasons.recencyDays} days, ${atRiskReasons.declinePct}% down vs its own trailing run rate`
    : undefined;
  return (
    <span className="ca-seg-tag" style={{ background: s.bg, color: s.color }} title={title}>
      {segment}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Detail table
// ---------------------------------------------------------------------------
function DetailTable({ rows, fyList, currentFy }) {
  if (!rows || rows.length === 0) return <div className="empty">No customer data</div>;
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Customer</th>
            {fyList.map((fy) => <th key={fy}>{shortFy(fy)}</th>)}
            <th>YoY %</th>
            <th>3yr Total</th>
            <th>Ret %</th>
            <th>Bills/yr</th>
            <th>Avg Bill</th>
            <th>Last Order</th>
            <th>Segment</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const yoyColor = r.yoyPct == null ? "#5d6678" : r.yoyPct >= 0 ? "#12b76a" : "#ef4444";
            return (
              <tr key={r.name}>
                <td>{i + 1}</td>
                <td><span className="strong">{r.name}</span></td>
                {fyList.map((fy) => (
                  <td key={fy}>
                    {(r.perFy[fy] || 0) > 0
                      ? <span className="money">{money(r.perFy[fy])}</span>
                      : <span style={{ color: "#97a0b2" }}>nil</span>}
                  </td>
                ))}
                <td>
                  {r.yoyPct != null
                    ? <span style={{ color: yoyColor, fontWeight: 600 }}>
                        {r.yoyPct >= 0 ? `+${r.yoyPct}` : r.yoyPct}%
                      </span>
                    : "-"}
                </td>
                <td><span className="money">{money(r.total3yr)}</span></td>
                <td>{r.returnPct > 0 ? `${r.returnPct}%` : "-"}</td>
                <td>{r.billsPerYr}</td>
                <td>{r.avgBill > 0 ? <span className="money">{money(r.avgBill)}</span> : "-"}</td>
                <td style={{ whiteSpace: "nowrap", fontSize: 12 }}>{r.lastOrder || "-"}</td>
                <td><SegTag segment={r.segment} atRiskReasons={r.atRiskReasons} /></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main: CustomerAnalysisView
// ---------------------------------------------------------------------------
export function CustomerAnalysisView({ fy, onFy }) {
  const { analysis, loading, error } = useCustomerAnalysis(fy);

  const partialFys  = useMemo(() => new Set(analysis?.partialFys || []), [analysis]);

  if (!analysis && !loading && !error) {
    return (
      <div className="error-box info-box">
        No Google Sheet connected. Open <b>Data Source</b> (top right) and paste your sheet URL, then press <b>Sync Now</b>.
      </div>
    );
  }

  const fyList      = analysis?.fyList      || [];
  const currentFy   = analysis?.currentFy   || "";
  const prevFy      = analysis?.prevFy      || null;
  const kpis        = analysis?.kpis        || {};
  const alerts      = analysis?.alerts      || [];
  const waterfall   = analysis?.waterfall   || [];
  const segments    = analysis?.segments    || [];
  const activeMoM   = analysis?.activeMoM   || { months: [], series: [] };
  const arpcMoM     = analysis?.arpcMoM     || { months: [], series: [] };
  const acquisitionMoM = analysis?.acquisitionMoM || { months: [], series: [] };
  const retentionRate  = analysis?.retentionRate  || [];
  const frequencyByFy  = analysis?.frequencyByFy  || [];
  const cohorts     = analysis?.cohorts     || [];
  const table       = analysis?.table       || [];

  const totalCustomers = kpis.totalCustomers3yr || 0;
  const perFyCounts    = kpis.perFyCounts || {};

  // Build context string for total customers KPI
  const fyCountLine = fyList
    .map((f) => `${shortFy(f)}: ${perFyCounts[f] || 0}`)
    .join(" · ");

  // Active customers MoM series for LineChart
  const activeSeries = activeMoM.series.map((s) => ({ name: s.name, values: s.values }));
  const arpcSeries   = arpcMoM.series.map((s) => ({ name: s.name, values: s.values }));

  return (
    <PageState loading={loading} error={error}>
      {analysis && (
        <div className="ca-wrap">
          {/* Header */}
          <div className="ceo-header-row">
            <SectionHead
              code="CA"
              title="Customer Analysis"
              sub="3-year · acquisition · retention · value"
            />
            <FyToggle fyList={fyList} value={fy} onChange={onFy} partialFys={partialFys} />
          </div>

          {/* 6 KPI cards */}
          <div className="kpi-grid ca-kpi-grid">
            <KpiCard
              label="Total Customers (3yr)"
              value={String(totalCustomers)}
              delta={null}
              context={fyCountLine}
            />
            <KpiCard
              label={`Retained (${fyList[0] ? shortFy(fyList[0]) : "first"} to ${currentFy ? shortFy(currentFy) : "current"})`}
              value={String(kpis.retained?.count ?? "-")}
              delta={kpis.retained?.pct != null ? `${kpis.retained.pct}% retention` : null}
              deltaTone={kpis.retained?.pct >= 70 ? "up" : kpis.retained?.pct >= 40 ? "neu" : "dn"}
              context={null}
            />
            <KpiCard
              label="Acquired (new customers)"
              value={String(kpis.acquired?.count ?? "-")}
              delta={null}
              context={
                Object.entries(kpis.acquired?.perFy || {})
                  .filter(([, v]) => v > 0)
                  .map(([f, v]) => `${shortFy(f)}: ${v}`)
                  .join(" · ") || undefined
              }
            />
            <KpiCard
              label={`Lost since ${fyList[0] ? shortFy(fyList[0]) : "first FY"}`}
              value={String(kpis.lost?.count ?? "-")}
              delta={kpis.lost?.pct != null ? `${kpis.lost.pct}% churn` : null}
              deltaTone={kpis.lost?.pct > 30 ? "dn" : kpis.lost?.pct > 10 ? "neu" : "up"}
              context={null}
            />
            <KpiCard
              label="Avg Order Frequency"
              value={String(kpis.avgOrderFreq?.cur ?? "-")}
              delta={kpis.avgOrderFreq?.prevDelta != null
                ? `${kpis.avgOrderFreq.prevDelta >= 0 ? "+" : ""}${kpis.avgOrderFreq.prevDelta} bills/customer`
                : null}
              deltaTone={kpis.avgOrderFreq?.prevDelta == null ? "neu"
                : kpis.avgOrderFreq.prevDelta >= 0 ? "up" : "dn"}
              context={prevFy ? `vs ${shortFy(prevFy)}` : undefined}
            />
            <KpiCard
              label="Avg Net Revenue / Customer"
              value={`${bigMoney(kpis.avgRevPerCustomer?.cur)}`}
              delta={kpis.avgRevPerCustomer?.deltaPct != null
                ? fmtDelta(kpis.avgRevPerCustomer.deltaPct)
                : null}
              deltaTone={kpis.avgRevPerCustomer?.deltaPct >= 0 ? "up" : "dn"}
              context={prevFy && kpis.avgRevPerCustomer?.prev
                ? `${shortFy(prevFy)}: ${bigMoney(kpis.avgRevPerCustomer.prev)}`
                : undefined}
            />
          </div>

          {/* Alert bar */}
          <AlertBar alerts={alerts} />

          {/* Grid 2: Waterfall + Segments */}
          <div className="ceo-grid2">
            <Card
              title="Customer Count Waterfall"
              sub="How the active customer base changed across financial years"
            >
              <WaterfallChart waterfall={waterfall} />
            </Card>
            <Card
              title="Customer Segments"
              sub="Champion / Loyal / At Risk / Lost / New / Recovered"
            >
              <SegmentBoxes segments={segments} total={totalCustomers} />
            </Card>
          </div>

          {/* Grid 2: Active MoM + ARPC MoM */}
          <div className="ceo-grid2">
            <Card
              title="Active Customers per Month — 3-yr overlay"
              sub="How many distinct customers placed an order each month"
            >
              <LineChart
                series={activeSeries}
                months={activeMoM.months}
                labels={{}}
              />
            </Card>
            <Card
              title="Avg Net Revenue / Customer per Month (Lakh)"
              sub="Monthly average net revenue per active customer"
            >
              <LineChart
                series={arpcSeries}
                months={arpcMoM.months}
                labels={{}}
              />
            </Card>
          </div>

          {/* Grid 3: Acquisition MoM + Retention rate + Frequency */}
          <div className="ceo-grid3">
            <Card
              title="New Customer Acquisition per Month"
              sub="Month the customer placed their first-ever order"
            >
              <AcquisitionChart acquisitionMoM={acquisitionMoM} />
            </Card>
            <Card
              title="Retention Rate by FY Pair"
              sub="% of customers from prior year who returned the following year"
            >
              <RetentionBars retentionRate={retentionRate} />
            </Card>
            <Card
              title="Avg Bills per Customer per Year"
              sub="Average order frequency for active customers in each FY"
            >
              <FrequencyBars frequencyByFy={frequencyByFy} />
            </Card>
          </div>

          {/* Cohort retention grid */}
          <Card
            title="Cohort Retention Grid"
            sub="Rows = acquisition year cohort. Columns = % of that cohort still buying in each year. Deeper blue = higher retention."
          >
            <CohortGrid cohorts={cohorts} fyList={fyList} />
          </Card>

          {/* Full-width detail table */}
          <Card
            title="Customer Detail"
            sub={`All customers sorted by ${currentFy} net sales — 3-year view with segment classification`}
          >
            <DetailTable rows={table} fyList={fyList} currentFy={currentFy} />
          </Card>
        </div>
      )}
    </PageState>
  );
}
