import React, { useMemo } from "react";
import ReactApexChart from "react-apexcharts";
import { useCustomerPareto } from "../useCustomerPareto.js";
import { SectionHead, Card } from "../components/ui.jsx";
import { ParetoChart } from "../components/ParetoChart.jsx";
import { FyToggle } from "../components/ceo/FyToggle.jsx";
import { KpiCard } from "../components/ceo/KpiCard.jsx";
import { PageState } from "./pageKit.jsx";
import { money, moneyAxis, PALETTE, FONT, GRID, INK, baseChart, baseTooltip } from "../components/chartTheme.js";

// ---------------------------------------------------------------------------
// Local helpers
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

function fmtDelta(v) {
  if (v == null || isNaN(Number(v))) return null;
  const n = Number(v);
  return `${n >= 0 ? "+" : ""}${n.toFixed(0)}%`;
}

// Tone: red = tightening (fewer customers to 80%), green = loosening
function c80Tone(cur, prev) {
  if (prev == null) return "neu";
  if (cur < prev) return "dn";  // fewer customers = tighter = bad
  if (cur > prev) return "up";
  return "neu";
}

// ---------------------------------------------------------------------------
// Insight cards
// ---------------------------------------------------------------------------
const TONE_STYLE = {
  red:   { bg: "#fdecec", border: "#f87171", icon: "#ef4444" },
  amber: { bg: "#fdf2e3", border: "#fbbf24", icon: "#d97706" },
  green: { bg: "#e7f8ef", border: "#34d399", icon: "#12b76a" },
  blue:  { bg: "#eef4ff", border: "#60a5fa", icon: "#2563eb" },
};

function InsightCard({ tone, title, body }) {
  const s = TONE_STYLE[tone] || TONE_STYLE.blue;
  return (
    <div className="cp-insight" style={{ background: s.bg, borderLeft: `4px solid ${s.border}` }}>
      <div className="cp-insight-title" style={{ color: s.icon }}>{title}</div>
      <div className="cp-insight-body">{body}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Concentration bar (horizontal stacked flex)
// ---------------------------------------------------------------------------
const TIER_COLORS = ["#2563eb", "#7c5cff", "#12b76a", "#f59e0b", "#e3e8f0"];
const TIER_LABELS = ["Top 1", "Ranks 2-3", "Ranks 4-7", "Ranks 8-15", "Rest"];

function ConcBar({ fy, tiers }) {
  if (!tiers) return null;
  const vals = [tiers.top1, tiers.t2_3, tiers.t4_7, tiers.t8_15, tiers.rest];
  return (
    <div className="cp-conc-row">
      <div className="cp-conc-label">{fy}</div>
      <div className="cp-conc-bar">
        {vals.map((v, i) =>
          v > 0.1 ? (
            <div
              key={i}
              className="cp-conc-seg"
              style={{ width: `${v}%`, background: TIER_COLORS[i] }}
              title={`${TIER_LABELS[i]}: ${v}%`}
            >
              {v >= 6 ? `${v}%` : ""}
            </div>
          ) : null,
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Rank change table
// ---------------------------------------------------------------------------
const STATUS_STYLE = {
  Held:       { bg: "#eef4ff", color: "#2563eb" },
  Rising:     { bg: "#e7f8ef", color: "#12b76a" },
  Slipping:   { bg: "#fdf2e3", color: "#d97706" },
  Collapsing: { bg: "#fdecec", color: "#ef4444" },
  Churned:    { bg: "#fdecec", color: "#ef4444" },
  New:        { bg: "#f1eeff", color: "#7c5cff" },
};

function StatusChip({ status }) {
  const s = STATUS_STYLE[status] || { bg: "#f4f7fb", color: "#5d6678" };
  return (
    <span className="cp-status-chip" style={{ background: s.bg, color: s.color }}>
      {status}
    </span>
  );
}

function RankChangeTable({ rows, prevFy, currentFy }) {
  if (!rows || rows.length === 0) return <div className="empty">No rank data</div>;
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Customer</th>
            <th>{prevFy ? `Rank ${prevFy}` : "Prev Rank"}</th>
            <th>{currentFy ? `Rank ${currentFy}` : "Cur Rank"}</th>
            <th>Change</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.name}>
              <td>
                <span className={`rank ${i === 0 ? "r1" : i === 1 ? "r2" : i === 2 ? "r3" : ""}`}>
                  {i + 1}
                </span>
              </td>
              <td><span className="strong">{r.name}</span></td>
              <td>{r.rankPrev != null ? r.rankPrev : "-"}</td>
              <td>{r.rankCur  != null ? r.rankCur  : "-"}</td>
              <td>
                {r.rankPrev != null && r.rankCur != null && r.change !== 0 ? (
                  <span style={{ color: r.change > 0 ? "#12b76a" : "#ef4444", fontWeight: 600 }}>
                    {r.change > 0 ? `+${r.change}` : `${r.change}`}
                  </span>
                ) : (
                  <span style={{ color: "#5d6678" }}>0</span>
                )}
              </td>
              <td><StatusChip status={r.status} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main 3-year overlay combo chart
// 3 column series (FY net sales in Lakhs) on left axis
// 3 line series (cumulative %) on right axis
// 80% horizontal annotation line
// ---------------------------------------------------------------------------
function ParetoOverlayChart({ paretoByFy, fyList, currentFy }) {
  const options = useMemo(() => {
    if (!paretoByFy || !fyList || fyList.length === 0) return null;

    // Use currentFy's labels as categories (top 15 customers by currentFy)
    const curData = paretoByFy[currentFy] || {};
    const categories = curData.labels || [];

    const barColors  = [PALETTE[0], PALETTE[1], PALETTE[2]];
    const lineColors = ["#60a5fa", "#34d399", "#fcd34d"];

    const series = [
      ...fyList.map((fy, i) => ({
        name: `${fy} Sales`,
        type: "column",
        data: categories.map((lbl) => {
          const fyData = paretoByFy[fy] || {};
          const idx = fyData.labels ? fyData.labels.indexOf(lbl) : -1;
          return idx >= 0 ? Math.round((fyData.bars[idx] || 0) / 100000) : 0;
        }),
      })),
      ...fyList.map((fy, i) => ({
        name: `${fy} Cum%`,
        type: "line",
        data: categories.map((lbl) => {
          const fyData = paretoByFy[fy] || {};
          const idx = fyData.labels ? fyData.labels.indexOf(lbl) : -1;
          return idx >= 0 ? (fyData.cum[idx] || 0) : null;
        }),
      })),
    ];

    const yaxes = [
      // Left: 3 bar series (one per FY) — all use same y-axis
      {
        seriesName: `${fyList[0]} Sales`,
        labels: { formatter: (v) => `${v}L`, style: { colors: INK, fontSize: "11px" } },
        title: { text: "Net Sales (Lakhs)", style: { color: INK, fontWeight: 600 } },
      },
      ...fyList.slice(1).map((fy) => ({ seriesName: `${fyList[0]} Sales`, show: false })),
      // Right: 3 line series (one per FY)
      {
        seriesName: `${fyList[0]} Cum%`,
        opposite: true,
        min: 0,
        max: 105,
        labels: { formatter: (v) => `${Math.round(v)}%`, style: { colors: INK, fontSize: "11px" } },
        title: { text: "Cumulative %", style: { color: INK, fontWeight: 600 } },
      },
      ...fyList.slice(1).map((fy) => ({ seriesName: `${fyList[0]} Cum%`, opposite: true, show: false })),
    ];

    return {
      chart: { ...baseChart("line"), stacked: false },
      colors: [...barColors.slice(0, fyList.length), ...lineColors.slice(0, fyList.length)],
      stroke: {
        width: [...fyList.map(() => 0), ...fyList.map(() => 2.5)],
        curve: "smooth",
        dashArray: [...fyList.map(() => 0), 0, 4, 8],
      },
      fill: {
        type: fyList.flatMap(() => ["gradient", "solid"]).slice(0, fyList.length * 2),
        gradient: {
          shade: "light",
          type: "vertical",
          opacityFrom: 0.88,
          opacityTo: 0.55,
        },
      },
      plotOptions: {
        bar: { columnWidth: "65%", borderRadius: 3, borderRadiusApplication: "end" },
      },
      dataLabels: { enabled: false },
      markers: { size: [...fyList.map(() => 0), ...fyList.map(() => 0)], hover: { size: 4 } },
      legend: {
        position: "top",
        horizontalAlign: "left",
        fontFamily: FONT,
        labels: { colors: INK },
        markers: { width: 10, height: 10, radius: 3 },
      },
      grid: { borderColor: GRID, strokeDashArray: 4 },
      xaxis: {
        categories,
        labels: {
          rotate: -40,
          rotateAlways: categories.length > 6,
          hideOverlappingLabels: true,
          trim: true,
          style: { colors: INK, fontSize: "10px" },
        },
        axisBorder: { show: false },
        axisTicks: { color: GRID },
      },
      yaxis: yaxes,
      annotations: {
        yaxis: [{
          y: 80,
          yAxisIndex: fyList.length, // first right-axis index
          borderColor: "#ef4444",
          strokeDashArray: 6,
          label: {
            text: "80%",
            borderColor: "#ef4444",
            style: { color: "#fff", background: "#ef4444", fontSize: "10px" },
          },
        }],
      },
      tooltip: {
        ...baseTooltip,
        shared: true,
        intersect: false,
        y: {
          formatter: (val, { seriesIndex }) => {
            if (seriesIndex < fyList.length) return `${val}L`;
            return `${Number(val).toFixed(1)}%`;
          },
        },
      },
    };
  }, [paretoByFy, fyList, currentFy]);

  const series = useMemo(() => {
    if (!paretoByFy || !fyList || fyList.length === 0) return [];
    const curData = paretoByFy[currentFy] || {};
    const categories = curData.labels || [];
    return [
      ...fyList.map((fy) => ({
        name: `${fy} Sales`,
        type: "column",
        data: categories.map((lbl) => {
          const fyData = paretoByFy[fy] || {};
          const idx = fyData.labels ? fyData.labels.indexOf(lbl) : -1;
          return idx >= 0 ? Math.round((fyData.bars[idx] || 0) / 100000) : 0;
        }),
      })),
      ...fyList.map((fy) => ({
        name: `${fy} Cum%`,
        type: "line",
        data: categories.map((lbl) => {
          const fyData = paretoByFy[fy] || {};
          const idx = fyData.labels ? fyData.labels.indexOf(lbl) : -1;
          return idx >= 0 ? (fyData.cum[idx] || 0) : null;
        }),
      })),
    ];
  }, [paretoByFy, fyList, currentFy]);

  if (!options || series.length === 0 || !(paretoByFy[currentFy]?.labels?.length)) {
    return <div className="empty">No Pareto data available</div>;
  }

  return (
    <div className="chart-frame apex-frame">
      <ReactApexChart options={options} series={series} type="line" height={420} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Zone chip
// ---------------------------------------------------------------------------
const ZONE_STYLE = {
  "Top 50%":  { bg: "#eef4ff", color: "#2563eb" },
  "Core 80%": { bg: "#e7f8ef", color: "#12b76a" },
  "Mid tail": { bg: "#fdf2e3", color: "#d97706" },
  "Long tail":{ bg: "#f4f7fb", color: "#5d6678" },
};
function ZoneChip({ zone }) {
  const s = ZONE_STYLE[zone] || { bg: "#f4f7fb", color: "#5d6678" };
  return <span className="cp-zone-chip" style={{ background: s.bg, color: s.color }}>{zone}</span>;
}

// ---------------------------------------------------------------------------
// Detail table
// ---------------------------------------------------------------------------
function DetailTable({ rows, fyList, currentFy, prevFy }) {
  if (!rows || rows.length === 0) return <div className="empty">No customer data</div>;
  const fyHeaders = fyList.map((fy) => fy.replace("FY ", ""));
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Customer</th>
            {fyHeaders.map((h) => <th key={h}>{h}</th>)}
            <th>YoY %</th>
            <th>Share %</th>
            <th>Cum %</th>
            <th>Rank Chg</th>
            <th>Zone</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const yoyColor = r.yoyPct == null ? "#5d6678" : r.yoyPct >= 0 ? "#12b76a" : "#ef4444";
            const cumColor = r.cumPct == null ? "#5d6678" : r.cumPct <= 80 ? "#12b76a" : r.cumPct <= 95 ? "#d97706" : "#ef4444";
            const rdColor  = r.rankDelta == null ? "#5d6678" : r.rankDelta > 0 ? "#12b76a" : r.rankDelta < 0 ? "#ef4444" : "#5d6678";
            return (
              <tr key={r.name}>
                <td>
                  <span className={`rank ${i === 0 ? "r1" : i === 1 ? "r2" : i === 2 ? "r3" : ""}`}>
                    {r.rank || i + 1}
                  </span>
                </td>
                <td><span className="strong">{r.name}</span></td>
                {fyList.map((fy) => (
                  <td key={fy}>
                    <span className="money">{money(r.perFy[fy] || 0)}</span>
                  </td>
                ))}
                <td>
                  {r.yoyPct != null ? (
                    <span style={{ color: yoyColor, fontWeight: 600 }}>
                      {r.yoyPct >= 0 ? `+${r.yoyPct}` : r.yoyPct}%
                    </span>
                  ) : "-"}
                </td>
                <td>{r.curShare != null ? `${r.curShare}%` : "-"}</td>
                <td>
                  {r.cumPct != null ? (
                    <span style={{ color: cumColor, fontWeight: 600 }}>{r.cumPct}%</span>
                  ) : "-"}
                </td>
                <td>
                  {r.rankDelta != null ? (
                    <span style={{ color: rdColor, fontWeight: 600 }}>
                      {r.rankDelta > 0 ? `+${r.rankDelta}` : r.rankDelta === 0 ? "0" : `${r.rankDelta}`}
                    </span>
                  ) : "-"}
                </td>
                <td><ZoneChip zone={r.zone} /></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main: CustomerParetoView
// ---------------------------------------------------------------------------
export function CustomerParetoView({ fy, onFy }) {
  const { pareto, loading, error } = useCustomerPareto(fy);

  if (!pareto && !loading && !error) {
    return (
      <div className="error-box info-box">
        No Google Sheet connected. Open <b>Data Source</b> (top right) and paste your sheet URL, then press <b>Sync Now</b>.
      </div>
    );
  }

  const fyList     = pareto?.fyList     || [];
  const currentFy  = pareto?.currentFy  || "";
  const prevFy     = pareto?.prevFy     || null;
  const kpis       = pareto?.kpis       || {};
  const insights   = pareto?.insights   || [];
  const rankChanges = pareto?.rankChanges || [];
  const concentrationByFy = pareto?.concentrationByFy || {};
  const paretoByFy = pareto?.paretoByFy || {};
  const table      = pareto?.table      || [];

  // Per-FY Pareto chart data mapped to ParetoChart's {label,value,cumulativePct}
  const smallParetoData = (fyKey) => {
    const d = paretoByFy[fyKey];
    if (!d) return [];
    return d.labels.slice(0, 10).map((lbl, i) => ({
      label: lbl,
      value: d.bars[i] || 0,
      cumulativePct: d.cum[i] || 0,
    }));
  };

  return (
    <PageState loading={loading} error={error}>
      {pareto && (
        <div className="cp-wrap">
          {/* Header row */}
          <div className="ceo-header-row">
            <SectionHead
              code="CP"
              title="Customer Pareto"
              sub="3-year concentration analysis — all amounts in INR"
            />
            <FyToggle
              fyList={fyList}
              value={fy}
              onChange={onFy}
            />
          </div>

          {/* 5 KPI cards */}
          <div className="kpi-grid">
            <KpiCard
              label="Customers to 80% Revenue"
              value={String(kpis.customersTo80?.cur ?? "-")}
              delta={
                kpis.customersTo80?.prev != null
                  ? `${kpis.customersTo80.cur - kpis.customersTo80.prev >= 0 ? "+" : ""}${kpis.customersTo80.cur - kpis.customersTo80.prev}`
                  : null
              }
              deltaTone={c80Tone(kpis.customersTo80?.cur, kpis.customersTo80?.prev)}
              context={
                prevFy && kpis.customersTo80?.prev != null
                  ? `was ${kpis.customersTo80.prev} in ${prevFy}`
                  : undefined
              }
            />
            <KpiCard
              label="Top 1 Customer Share"
              value={fmtPct(kpis.top1Share?.cur)}
              delta={
                kpis.top1Share?.prev != null
                  ? `${(kpis.top1Share.cur - kpis.top1Share.prev) >= 0 ? "+" : ""}${(kpis.top1Share.cur - kpis.top1Share.prev).toFixed(1)} pts`
                  : null
              }
              deltaTone={
                kpis.top1Share?.prev == null ? "neu"
                  : kpis.top1Share.cur > kpis.top1Share.prev ? "dn"
                  : kpis.top1Share.cur < kpis.top1Share.prev ? "up"
                  : "neu"
              }
              context={prevFy && kpis.top1Share?.prev != null ? `${prevFy}: ${fmtPct(kpis.top1Share.prev)}` : undefined}
            />
            <KpiCard
              label="Top 3 Customers Share"
              value={fmtPct(kpis.top3Share?.cur)}
              delta={
                kpis.top3Share?.prev != null
                  ? `${(kpis.top3Share.cur - kpis.top3Share.prev) >= 0 ? "+" : ""}${(kpis.top3Share.cur - kpis.top3Share.prev).toFixed(1)} pts`
                  : null
              }
              deltaTone="neu"
              context={prevFy && kpis.top3Share?.prev != null ? `${prevFy}: ${fmtPct(kpis.top3Share.prev)}` : undefined}
            />
            <KpiCard
              label="Bottom 50% Customer Share"
              value={fmtPct(kpis.bottom50Share?.cur)}
              delta={
                kpis.bottom50Share?.prev != null
                  ? `${(kpis.bottom50Share.cur - kpis.bottom50Share.prev) >= 0 ? "+" : ""}${(kpis.bottom50Share.cur - kpis.bottom50Share.prev).toFixed(1)} pts`
                  : null
              }
              deltaTone="neu"
              context={prevFy && kpis.bottom50Share?.prev != null ? `${prevFy}: ${fmtPct(kpis.bottom50Share.prev)}` : undefined}
            />
            <KpiCard
              label="Total Trade Revenue"
              value={`${bigMoney(kpis.totalRevenue?.cur)} L`}
              delta={fmtDelta(kpis.totalRevenue?.deltaPct)}
              deltaTone={kpis.totalRevenue?.deltaPct >= 0 ? "up" : "dn"}
              context={prevFy && kpis.totalRevenue?.prev != null ? `${prevFy}: ${bigMoney(kpis.totalRevenue.prev)} L` : undefined}
            />
          </div>

          {/* Insight row */}
          {insights.length > 0 && (
            <div className="cp-insights-row">
              {insights.map((ins, i) => (
                <InsightCard key={i} tone={ins.tone} title={ins.title} body={ins.body} />
              ))}
            </div>
          )}

          {/* Main 3-year overlay Pareto chart */}
          <Card
            title="3-Year Customer Pareto Overlay"
            sub={`Top 15 customers by ${currentFy} — bars: net sales (Lakhs), lines: cumulative %, red dash: 80%`}
          >
            <ParetoOverlayChart
              paretoByFy={paretoByFy}
              fyList={fyList}
              currentFy={currentFy}
            />
          </Card>

          {/* Grid 2: Concentration shift + Rank changes */}
          <div className="ceo-grid2">
            <Card
              title="Revenue Concentration Shift"
              sub="Share of revenue by customer tier, each financial year"
            >
              <div className="cp-conc-legend">
                {["Top 1", "Ranks 2-3", "Ranks 4-7", "Ranks 8-15", "Rest"].map((lbl, i) => (
                  <span key={lbl} className="cp-conc-legend-item">
                    <span className="cp-conc-dot" style={{ background: TIER_COLORS[i] }} />
                    {lbl}
                  </span>
                ))}
              </div>
              <div className="cp-conc-bars">
                {fyList.map((fyKey) => (
                  <ConcBar key={fyKey} fy={fyKey} tiers={concentrationByFy[fyKey]} />
                ))}
              </div>
            </Card>

            <Card
              title={`Rank Changes${prevFy ? ` — ${prevFy} to ${currentFy}` : ""}`}
              sub="Movement in customer rank between financial years"
            >
              <RankChangeTable rows={rankChanges} prevFy={prevFy} currentFy={currentFy} />
            </Card>
          </div>

          {/* Grid 3: Per-FY small Pareto charts */}
          {fyList.length > 0 && (
            <div className="ceo-grid3">
              {fyList.map((fyKey) => {
                const d = paretoByFy[fyKey];
                const crossAt80 = d?.crossAt80 ?? "-";
                return (
                  <Card
                    key={fyKey}
                    title={`${fyKey} Pareto`}
                    sub={`${crossAt80} customers drive 80% of ${fyKey} revenue`}
                  >
                    <ParetoChart
                      data={smallParetoData(fyKey)}
                      title=""
                      barLabel="Net Sales"
                    />
                  </Card>
                );
              })}
            </div>
          )}

          {/* Full-width detail table */}
          <Card
            title="Customer Detail"
            sub={`All customers sorted by ${currentFy} net sales — concentration zones and 3-year trend`}
          >
            <DetailTable
              rows={table}
              fyList={fyList}
              currentFy={currentFy}
              prevFy={prevFy}
            />
          </Card>
        </div>
      )}
    </PageState>
  );
}
