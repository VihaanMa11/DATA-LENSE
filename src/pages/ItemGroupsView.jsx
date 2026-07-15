import React, { useMemo } from "react";
import ReactApexChart from "react-apexcharts";
import { useItemGroups } from "../useItemGroups.js";
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
  if (Math.abs(n) >= 1e7) return `₹${(n / 1e7).toFixed(1)} Cr`;
  if (Math.abs(n) >= 1e5) return `₹${(n / 1e5).toFixed(1)} L`;
  return `₹${Math.round(n).toLocaleString("en-IN")}`;
}
function shortFy(fy) {
  const m = String(fy || "").match(/FY\s*\d{4}-(\d{2})/i);
  return m ? `FY${m[1]}` : fy;
}
function pairsFmt(n) {
  const v = Number(n) || 0;
  if (v >= 1e5) return `${(v / 1e5).toFixed(2)} L`;
  return Math.round(v).toLocaleString("en-IN");
}
const SERIES_COLORS = ["#2563eb", "#12b76a", "#eda100", "#7c5cff", "#e34948", "#0e9456"];

// ---------------------------------------------------------------------------
// Grouped 3-yr bar (top 8)
// ---------------------------------------------------------------------------
function GroupTrendChart({ groupTrend }) {
  const { options, series } = useMemo(() => {
    if (!groupTrend?.groups?.length) return { options: null, series: [] };
    const colors = ["#B5D4F4", "#85B7EB", "#2a78d6"];
    const opts = {
      chart: { type: "bar", toolbar: { show: false }, background: "transparent", fontFamily: "Inter, sans-serif" },
      plotOptions: { bar: { columnWidth: "70%", borderRadius: 2 } },
      colors: colors.slice(-groupTrend.series.length),
      dataLabels: { enabled: false },
      legend: { position: "top", horizontalAlign: "left", fontSize: "12px" },
      grid: { borderColor: "#e3e8f0", strokeDashArray: 4 },
      xaxis: {
        categories: groupTrend.groups,
        labels: { style: { colors: "#5d6678", fontSize: "10px" }, rotate: -45, rotateAlways: true, hideOverlappingLabels: false, trim: false },
        axisBorder: { show: false },
      },
      yaxis: { labels: { formatter: (v) => bigMoney(v), style: { colors: "#5d6678", fontSize: "11px" } } },
      tooltip: { shared: true, intersect: false, y: { formatter: (v) => bigMoney(v) } },
    };
    const ser = groupTrend.series.map((s) => ({ name: shortFy(s.name), data: s.values }));
    return { options: opts, series: ser };
  }, [groupTrend]);
  if (!options) return <div className="empty">No data</div>;
  return <div className="chart-frame apex-frame"><ReactApexChart options={options} series={series} type="bar" height={320} /></div>;
}

// ---------------------------------------------------------------------------
// Volume vs value bubble
// ---------------------------------------------------------------------------
function BubbleChart({ bubble }) {
  const { options, series } = useMemo(() => {
    if (!bubble?.length) return { options: null, series: [] };
    const opts = {
      chart: { type: "bubble", toolbar: { show: false }, background: "transparent", fontFamily: "Inter, sans-serif" },
      dataLabels: { enabled: false },
      fill: { opacity: 0.75 },
      colors: SERIES_COLORS.concat(["#b4b2a9", "#7F77DD", "#5DCAA5"]),
      legend: { show: false },
      grid: { borderColor: "#e3e8f0", strokeDashArray: 4 },
      xaxis: {
        tickAmount: 6, title: { text: "Volume share %", style: { color: "#5d6678", fontSize: "11px" } },
        labels: { formatter: (v) => `${Math.round(v)}%`, style: { colors: "#5d6678", fontSize: "11px" } },
      },
      yaxis: {
        title: { text: "Revenue share %", style: { color: "#5d6678", fontSize: "11px" } },
        labels: { formatter: (v) => `${Math.round(v)}%`, style: { colors: "#5d6678", fontSize: "11px" } },
      },
      tooltip: {
        custom: ({ seriesIndex, w }) => {
          const d = w.config.series[seriesIndex];
          const p = d.data[0];
          return `<div style="padding:6px 8px;font-size:12px"><b>${d.name}</b><br/>vol ${p.x}% · rev ${p.y}%<br/>₹${p.price}/pair</div>`;
        },
      },
    };
    // radius scaled by avgPrice
    const maxPrice = Math.max(...bubble.map((b) => b.avgPrice), 1);
    const ser = bubble.map((b) => ({
      name: b.group,
      data: [{ x: b.volPct, y: b.revPct, z: Math.max(6, Math.round((b.avgPrice / maxPrice) * 26)), price: b.avgPrice }],
    }));
    return { options: opts, series: ser };
  }, [bubble]);
  if (!options) return <div className="empty">No data</div>;
  return <div className="chart-frame apex-frame"><ReactApexChart options={options} series={series} type="bubble" height={230} /></div>;
}

// ---------------------------------------------------------------------------
// H1 vs H2 split bars
// ---------------------------------------------------------------------------
function H1H2Split({ rows }) {
  if (!rows?.length) return <div className="empty">No data</div>;
  return (
    <div className="ig-h1h2">
      <div className="ig-legend">
        <span><span className="ig-dot" style={{ background: "#85B7EB" }} />H1 Apr-Sep</span>
        <span><span className="ig-dot" style={{ background: "#2a78d6" }} />H2 Oct-Mar</span>
      </div>
      {rows.map((r) => (
        <div key={r.group} className="ig-h1h2-row">
          <span className="ig-h1h2-label" title={r.group}>{r.group}</span>
          <div className="ig-h1h2-bar">
            <div className="ig-h1h2-h1" style={{ flex: r.h1Pct }} />
            <div className="ig-h1h2-h2" style={{ flex: r.h2Pct }} />
          </div>
          <span className="ig-h1h2-pct" style={{ color: r.h1Pct < 30 ? "#ef4444" : r.h1Pct > 65 ? "#0e9456" : "#5d6678" }}>
            H1 {Math.round(r.h1Pct)}%
          </span>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// YoY horizontal bars
// ---------------------------------------------------------------------------
function YoYChart({ yoy }) {
  const { options, series } = useMemo(() => {
    if (!yoy?.length) return { options: null, series: [] };
    const opts = {
      chart: { type: "bar", toolbar: { show: false }, background: "transparent", fontFamily: "Inter, sans-serif" },
      plotOptions: { bar: { horizontal: true, borderRadius: 3, barHeight: "60%", distributed: true } },
      colors: yoy.map((r) => (r.pct >= 0 ? "#12b76a" : "#ef4444")),
      dataLabels: { enabled: true, formatter: (v) => `${v >= 0 ? "+" : ""}${v}%`, style: { fontSize: "10px", colors: ["#33384a"] }, offsetX: 18 },
      legend: { show: false },
      grid: { borderColor: "#e3e8f0", strokeDashArray: 4 },
      xaxis: {
        categories: yoy.map((r) => r.group),
        labels: { formatter: (v) => `${Math.round(v)}%`, style: { colors: "#5d6678", fontSize: "10px" } },
      },
      yaxis: { labels: { style: { colors: "#5d6678", fontSize: "10px" } } },
      tooltip: { y: { formatter: (v) => `${v >= 0 ? "+" : ""}${v}% YoY` } },
    };
    return { options: opts, series: [{ name: "YoY", data: yoy.map((r) => r.pct) }] };
  }, [yoy]);
  if (!options) return <div className="empty">No data</div>;
  return <div className="chart-frame apex-frame"><ReactApexChart options={options} series={series} type="bar" height={200} /></div>;
}

// ---------------------------------------------------------------------------
// SKUs vs revenue dual bar
// ---------------------------------------------------------------------------
function SkuRevChart({ skuVsRev }) {
  const { options, series } = useMemo(() => {
    if (!skuVsRev?.length) return { options: null, series: [] };
    const opts = {
      chart: { type: "bar", toolbar: { show: false }, background: "transparent", fontFamily: "Inter, sans-serif" },
      plotOptions: { bar: { columnWidth: "60%", borderRadius: 2 } },
      colors: ["#85B7EB", "#2a78d6"],
      dataLabels: { enabled: false },
      legend: { position: "top", horizontalAlign: "left", fontSize: "11px" },
      grid: { borderColor: "#e3e8f0", strokeDashArray: 4 },
      xaxis: { categories: skuVsRev.map((r) => r.group), labels: { style: { colors: "#5d6678", fontSize: "9px" }, rotate: -35, trim: true } },
      yaxis: [
        { seriesName: "SKUs", title: { text: "SKUs", style: { color: "#85B7EB", fontSize: "10px" } }, labels: { style: { colors: "#5d6678", fontSize: "10px" } } },
        { seriesName: "Revenue", opposite: true, title: { text: "Revenue", style: { color: "#2a78d6", fontSize: "10px" } }, labels: { formatter: (v) => bigMoney(v), style: { colors: "#5d6678", fontSize: "10px" } } },
      ],
      tooltip: { shared: true, intersect: false, y: { formatter: (v, { seriesIndex }) => (seriesIndex === 0 ? `${v} SKUs` : bigMoney(v)) } },
    };
    const ser = [
      { name: "SKUs", data: skuVsRev.map((r) => r.skuCount) },
      { name: "Revenue", data: skuVsRev.map((r) => Math.round(r.revenue)) },
    ];
    return { options: opts, series: ser };
  }, [skuVsRev]);
  if (!options) return <div className="empty">No data</div>;
  return <div className="chart-frame apex-frame"><ReactApexChart options={options} series={series} type="bar" height={200} /></div>;
}

// ---------------------------------------------------------------------------
// Signal tag
// ---------------------------------------------------------------------------
const SIGNAL_STYLE = {
  Rising:    { bg: "#e7f8ef", color: "#0e9456" },
  Growing:   { bg: "#eef4ff", color: "#2563eb" },
  Stable:    { bg: "#f4f7fb", color: "#5d6678" },
  Declining: { bg: "#fdecec", color: "#ef4444" },
};
function SignalTag({ signal }) {
  const s = SIGNAL_STYLE[signal] || SIGNAL_STYLE.Stable;
  return <span className="ig-signal" style={{ background: s.bg, color: s.color }}>{signal}</span>;
}

function Spark({ trend }) {
  if (!trend?.length) return null;
  const max = Math.max(...trend.map((v) => Math.abs(v)), 1);
  const cols = ["#B5D4F4", "#85B7EB", "#2a78d6"];
  return (
    <span className="ig-spark">
      {trend.map((v, i) => (
        <span key={i} className="ig-spark-bar" style={{ height: `${Math.max(2, Math.round((Math.abs(v) / max) * 16))}px`, background: cols[i] || "#2a78d6" }} />
      ))}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Detail table
// ---------------------------------------------------------------------------
function DetailTable({ rows, fyList }) {
  if (!rows?.length) return <div className="empty">No group data</div>;
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Item group</th>
            {fyList.map((fy) => <th key={fy}>{shortFy(fy)}</th>)}
            <th>YoY %</th>
            <th>Pairs</th>
            <th>{"₹"}/pair</th>
            <th>SKUs</th>
            <th>Cust.</th>
            <th>H1 %</th>
            <th>Trend</th>
            <th>Signal</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const yoyColor = r.yoyPct == null ? "#5d6678" : r.yoyPct >= 0 ? "#12b76a" : "#ef4444";
            return (
              <tr key={r.group}>
                <td>{i + 1}</td>
                <td><span className="strong">{r.group}</span></td>
                {fyList.map((fy) => (
                  <td key={fy}>
                    {(r.perFy[fy] || 0) > 0
                      ? <span className="money">{money(r.perFy[fy])}</span>
                      : <span style={{ color: "#97a0b2" }}>nil</span>}
                  </td>
                ))}
                <td>{r.yoyPct != null ? <span style={{ color: yoyColor, fontWeight: 600 }}>{r.yoyPct >= 0 ? `+${r.yoyPct}` : r.yoyPct}%</span> : "-"}</td>
                <td>{pairsFmt(r.pairsCur)}</td>
                <td><span className="money">{money(r.avgPrice)}</span></td>
                <td>{r.skuCount}</td>
                <td>{r.custCount}</td>
                <td>{Math.round(r.h1Pct)}%</td>
                <td><Spark trend={r.trend} /></td>
                <td><SignalTag signal={r.signal} /></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
export function ItemGroupsView({ fy, onFy }) {
  const { data, loading, error } = useItemGroups(fy);

  if (!data && !loading && !error) {
    return (
      <div className="error-box info-box">
        No Google Sheet connected. Open <b>Data Source</b> (top right) and paste your sheet URL, then press <b>Sync Now</b>.
      </div>
    );
  }

  const fyList     = data?.fyList     || [];
  const currentFy  = data?.currentFy  || "";
  const prevFy     = data?.prevFy     || null;
  const kpis       = data?.kpis       || {};
  const alerts     = data?.alerts     || [];
  const partialFys = useMemo(() => new Set(data?.partialFys || []), [data]);
  const groupTrend = data?.groupTrend || { groups: [], series: [] };
  const bubble     = data?.bubble     || [];
  const momTop6    = data?.momTop6    || { months: [], series: [] };
  const h1h2       = data?.h1h2       || [];
  const yoy        = data?.yoy        || [];
  const priceTrend = data?.priceTrend || { fys: [], series: [] };
  const skuVsRev   = data?.skuVsRev   || [];
  const table      = data?.table      || [];

  const momSeries   = momTop6.series.map((s) => ({ name: s.name, values: s.values }));
  const priceSeries = priceTrend.series.map((s) => ({ name: s.name, values: s.values }));
  const priceMonths = priceTrend.fys.map(shortFy);

  const top = kpis.topGroup || {};
  const h2sk = kpis.mostH2Skewed || {};
  const hap = kpis.highestAvgPrice || {};

  return (
    <PageState loading={loading} error={error}>
      {data && (
        <div className="ig-wrap">
          <div className="ceo-header-row">
            <SectionHead code="IG" title="Item Groups" sub="3-year product group view · sales · volume · price · seasonality" />
            <FyToggle fyList={fyList} value={fy} onChange={onFy} partialFys={partialFys} />
          </div>

          <div className="kpi-grid ca-kpi-grid">
            <KpiCard label="Active Item Groups" value={String(kpis.activeGroups?.countCurrentFy ?? "-")}
              delta={`${shortFy(currentFy)}`} deltaTone="neu" context={`of ${kpis.activeGroups?.totalGroups ?? 0} in item master`} />
            <KpiCard label="Top Group Revenue" value={top.name ? bigMoney(top.revenue) : "-"}
              delta={top.sharePct ? `${top.sharePct}% share` : null} deltaTone="up"
              context={top.name ? `${top.name} · ${pairsFmt(top.pairs)} pairs` : undefined} />
            <KpiCard label={`Total Pairs Sold (${shortFy(currentFy)})`} value={pairsFmt(kpis.totalPairs?.cur)}
              delta="pairs" deltaTone="neu" context={`avg ${money(hap.overallAvg)} per pair`} />
            <KpiCard label="Most H2-skewed group" value={h2sk.name || "-"}
              delta={h2sk.h2Pct ? `${h2sk.h2Pct}% in H2` : null} deltaTone="dn" context="Oct-Mar season · stock early" />
            <KpiCard label="Highest Avg Price" value={hap.name || "-"}
              delta={hap.avgPrice ? `${money(hap.avgPrice)}/pair` : null} deltaTone="neu"
              context={`vs overall ${money(hap.overallAvg)}/pair`} />
            <KpiCard label={`Declining Groups (${shortFy(currentFy)})`} value={String(kpis.declining?.count ?? 0)}
              delta={prevFy ? `vs ${shortFy(prevFy)}` : null} deltaTone={kpis.declining?.count > 0 ? "dn" : "up"}
              context={(kpis.declining?.names || []).join(" · ") || undefined} />
          </div>

          <AlertBar alerts={alerts} />

          <div className="ceo-grid2">
            <Card title="Item group revenue — 3-yr trend (top 8)" sub="Net sales per financial year">
              <GroupTrendChart groupTrend={groupTrend} />
            </Card>
            <Card title="Volume vs value — price tier bubble" sub="Bubble size = avg price per pair. Above the diagonal earns more per pair than its volume share.">
              <BubbleChart bubble={bubble} />
            </Card>
          </div>

          <div className="ceo-grid2">
            <Card title={`MoM trend — top 6 groups · ${shortFy(currentFy)}`} sub="Monthly net sales">
              <LineChart series={momSeries} months={momTop6.months} labels={{}} />
            </Card>
            <Card title={`H1 vs H2 seasonality · ${shortFy(currentFy)}`} sub="% of annual sales falling in each half — plan stocking around it">
              <H1H2Split rows={h1h2} />
            </Card>
          </div>

          <div className="ceo-grid3">
            <Card title={`YoY growth by group · ${shortFy(currentFy)} vs ${prevFy ? shortFy(prevFy) : "prev"}`} sub="Net sales % change">
              <YoYChart yoy={yoy} />
            </Card>
            <Card title="Avg price per pair — 3-yr trend" sub="Selling price per pair for the top 6 groups">
              <LineChart series={priceSeries} months={priceMonths} labels={{}} />
            </Card>
            <Card title="SKUs per group vs revenue" sub="Breadth (SKU count) vs depth (revenue)">
              <SkuRevChart skuVsRev={skuVsRev} />
            </Card>
          </div>

          <Card title="Item group detail" sub={`All groups sorted by ${currentFy} net sales — 3-year view`}>
            <DetailTable rows={table} fyList={fyList} />
          </Card>
        </div>
      )}
    </PageState>
  );
}
