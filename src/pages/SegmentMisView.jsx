import React, { useMemo } from "react";
import ReactApexChart from "react-apexcharts";
import { useSegmentMis } from "../useSegmentMis.js";
import { SectionHead, Card } from "../components/ui.jsx";
import { LineChart } from "../components/InteractiveCharts.jsx";
import { FyToggle } from "../components/ceo/FyToggle.jsx";
import { KpiCard } from "../components/ceo/KpiCard.jsx";
import { AlertBar } from "../components/ceo/AlertBar.jsx";
import { PageState } from "./pageKit.jsx";
import { money } from "../components/chartTheme.js";

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
const SEG_COLORS = ["#2a78d6", "#1baf7a", "#eda100", "#4a3aa7", "#e34948", "#b4b2a9", "#7F77DD"];

function SegTrendChart({ segTrend }) {
  const { options, series } = useMemo(() => {
    if (!segTrend?.groups?.length) return { options: null, series: [] };
    const colors = ["#B5D4F4", "#85B7EB", "#2a78d6"];
    const opts = {
      chart: { type: "bar", toolbar: { show: false }, background: "transparent", fontFamily: "Inter, sans-serif" },
      plotOptions: { bar: { columnWidth: "70%", borderRadius: 2 } },
      colors: colors.slice(-segTrend.series.length),
      dataLabels: { enabled: false },
      legend: { position: "top", horizontalAlign: "left", fontSize: "12px" },
      grid: { borderColor: "#e3e8f0", strokeDashArray: 4 },
      xaxis: { categories: segTrend.groups, labels: { style: { colors: "#5d6678", fontSize: "10px" }, rotate: -25, trim: true }, axisBorder: { show: false } },
      yaxis: { labels: { formatter: (v) => bigMoney(v), style: { colors: "#5d6678", fontSize: "10px" } } },
      tooltip: { shared: true, intersect: false, y: { formatter: (v) => bigMoney(v) } },
    };
    return { options: opts, series: segTrend.series.map((s) => ({ name: shortFy(s.name), data: s.values })) };
  }, [segTrend]);
  if (!options) return <div className="empty">No data</div>;
  return <div className="chart-frame apex-frame"><ReactApexChart options={options} series={series} type="bar" height={220} /></div>;
}

function GenderDonut({ mix }) {
  const { options, series } = useMemo(() => {
    if (!mix?.length) return { options: null, series: [] };
    const opts = {
      chart: { type: "donut", background: "transparent", fontFamily: "Inter, sans-serif" },
      labels: mix.map((m) => m.segment),
      colors: SEG_COLORS,
      dataLabels: { enabled: true, formatter: (v) => `${Math.round(v)}%`, style: { fontSize: "10px" } },
      legend: { position: "bottom", fontSize: "11px" },
      plotOptions: { pie: { donut: { size: "62%" } } },
      stroke: { width: 2, colors: ["#fff"] },
      tooltip: { y: { formatter: (v, { seriesIndex }) => `${bigMoney(mix[seriesIndex].net)} · ${v}%` } },
    };
    return { options: opts, series: mix.map((m) => m.pct) };
  }, [mix]);
  if (!options) return <div className="empty">No data</div>;
  return <div className="chart-frame apex-frame"><ReactApexChart options={options} series={series} type="donut" height={220} /></div>;
}

function BubbleChart({ bubble }) {
  const { options, series } = useMemo(() => {
    if (!bubble?.length) return { options: null, series: [] };
    const opts = {
      chart: { type: "bubble", toolbar: { show: false }, background: "transparent", fontFamily: "Inter, sans-serif" },
      dataLabels: { enabled: false }, fill: { opacity: 0.75 },
      colors: SEG_COLORS.concat(["#5DCAA5"]),
      legend: { show: false }, grid: { borderColor: "#e3e8f0", strokeDashArray: 4 },
      xaxis: { tickAmount: 6, title: { text: "Volume share %", style: { color: "#5d6678", fontSize: "11px" } }, labels: { formatter: (v) => `${Math.round(v)}%`, style: { colors: "#5d6678", fontSize: "11px" } } },
      yaxis: { title: { text: "Revenue share %", style: { color: "#5d6678", fontSize: "11px" } }, labels: { formatter: (v) => `${Math.round(v)}%`, style: { colors: "#5d6678", fontSize: "11px" } } },
      tooltip: { custom: ({ seriesIndex, w }) => { const d = w.config.series[seriesIndex]; const p = d.data[0]; return `<div style="padding:6px 8px;font-size:12px"><b>${d.name}</b><br/>vol ${p.x}% · rev ${p.y}%<br/>₹${p.price}/pair</div>`; } },
    };
    const maxPrice = Math.max(...bubble.map((b) => b.avgPrice), 1);
    return { options: opts, series: bubble.map((b) => ({ name: b.group, data: [{ x: b.volPct, y: b.revPct, z: Math.max(6, Math.round((b.avgPrice / maxPrice) * 26)), price: b.avgPrice }] })) };
  }, [bubble]);
  if (!options) return <div className="empty">No data</div>;
  return <div className="chart-frame apex-frame"><ReactApexChart options={options} series={series} type="bubble" height={220} /></div>;
}

function YoYChart({ yoy }) {
  const { options, series } = useMemo(() => {
    if (!yoy?.length) return { options: null, series: [] };
    const opts = {
      chart: { type: "bar", toolbar: { show: false }, background: "transparent", fontFamily: "Inter, sans-serif" },
      plotOptions: { bar: { horizontal: true, borderRadius: 3, barHeight: "60%", distributed: true } },
      colors: yoy.map((r) => (r.pct >= 0 ? "#12b76a" : "#ef4444")),
      dataLabels: { enabled: true, formatter: (v) => `${v >= 0 ? "+" : ""}${v}%`, style: { fontSize: "10px", colors: ["#33384a"] }, offsetX: 18 },
      legend: { show: false }, grid: { borderColor: "#e3e8f0", strokeDashArray: 4 },
      xaxis: { categories: yoy.map((r) => r.group), labels: { formatter: (v) => `${Math.round(v)}%`, style: { colors: "#5d6678", fontSize: "10px" } } },
      yaxis: { labels: { style: { colors: "#5d6678", fontSize: "10px" } } },
      tooltip: { y: { formatter: (v) => `${v >= 0 ? "+" : ""}${v}% YoY` } },
    };
    return { options: opts, series: [{ name: "YoY", data: yoy.map((r) => r.pct) }] };
  }, [yoy]);
  if (!options) return <div className="empty">No data</div>;
  return <div className="chart-frame apex-frame"><ReactApexChart options={options} series={series} type="bar" height={200} /></div>;
}

function SeasonChart({ seasonSplit }) {
  const { options, series } = useMemo(() => {
    if (!seasonSplit?.groups?.length) return { options: null, series: [] };
    const opts = {
      chart: { type: "bar", toolbar: { show: false }, background: "transparent", fontFamily: "Inter, sans-serif" },
      plotOptions: { bar: { columnWidth: "65%", borderRadius: 2 } },
      colors: ["#85B7EB", "#2a78d6"],
      dataLabels: { enabled: false },
      legend: { position: "top", horizontalAlign: "left", fontSize: "10px" },
      grid: { borderColor: "#e3e8f0", strokeDashArray: 4 },
      xaxis: { categories: seasonSplit.groups, labels: { style: { colors: "#5d6678", fontSize: "10px" }, rotate: -20 } },
      yaxis: { max: 100, labels: { formatter: (v) => `${Math.round(v)}%`, style: { colors: "#5d6678", fontSize: "10px" } } },
      tooltip: { shared: true, intersect: false, y: { formatter: (v) => `${v}%` } },
    };
    return { options: opts, series: [{ name: "H1 Apr-Sep", data: seasonSplit.h1 }, { name: "H2 Oct-Mar", data: seasonSplit.h2 }] };
  }, [seasonSplit]);
  if (!options) return <div className="empty">No data</div>;
  return <div className="chart-frame apex-frame"><ReactApexChart options={options} series={series} type="bar" height={200} /></div>;
}

const SIGNAL_STYLE = {
  Rising: { bg: "#e7f8ef", color: "#0e9456" }, Growing: { bg: "#eef4ff", color: "#2563eb" },
  Stable: { bg: "#f4f7fb", color: "#5d6678" }, Declining: { bg: "#fdecec", color: "#ef4444" },
};
function SignalTag({ signal }) {
  const s = SIGNAL_STYLE[signal] || SIGNAL_STYLE.Stable;
  return <span className="ig-signal" style={{ background: s.bg, color: s.color }}>{signal}</span>;
}
function Spark({ trend }) {
  if (!trend?.length) return null;
  const max = Math.max(...trend.map((v) => Math.abs(v)), 1);
  const cols = ["#B5D4F4", "#85B7EB", "#2a78d6"];
  return <span className="ig-spark">{trend.map((v, i) => <span key={i} className="ig-spark-bar" style={{ height: `${Math.max(2, Math.round((Math.abs(v) / max) * 16))}px`, background: cols[i] || "#2a78d6" }} />)}</span>;
}

function DetailTable({ rows, fyList, currentFy }) {
  if (!rows?.length) return <div className="empty">No segment data</div>;
  const curTotal = rows.reduce((s, r) => s + (r.perFy[currentFy] || 0), 0);
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>#</th><th>Segment</th>
            {fyList.map((fy) => <th key={fy}>{shortFy(fy)}</th>)}
            <th>YoY %</th><th>Pairs</th><th>{"₹"}/pr</th><th>Share</th><th>H1 %</th><th>H2 %</th><th>Trend</th><th>Signal</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const yoyColor = r.yoyPct == null ? "#5d6678" : r.yoyPct >= 0 ? "#12b76a" : "#ef4444";
            const share = curTotal > 0 ? ((r.perFy[currentFy] || 0) / curTotal) * 100 : 0;
            return (
              <tr key={r.group}>
                <td>{i + 1}</td>
                <td><span className="strong">{r.group}</span></td>
                {fyList.map((fy) => (
                  <td key={fy}>{(r.perFy[fy] || 0) > 0 ? <span className="money">{money(r.perFy[fy])}</span> : <span style={{ color: "#97a0b2" }}>nil</span>}</td>
                ))}
                <td>{r.yoyPct != null ? <span style={{ color: yoyColor, fontWeight: 600 }}>{r.yoyPct >= 0 ? `+${r.yoyPct}` : r.yoyPct}%</span> : "-"}</td>
                <td>{pairsFmt(r.pairsCur)}</td>
                <td><span className="money">{money(r.avgPrice)}</span></td>
                <td>{share.toFixed(1)}%</td>
                <td>{Math.round(r.h1Pct)}%</td>
                <td>{Math.round(r.h2Pct)}%</td>
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

export function SegmentMisView({ fy, onFy }) {
  const { data, loading, error } = useSegmentMis(fy);

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
  const segTrend   = data?.segTrend   || { groups: [], series: [] };
  const genderAgeMix = data?.genderAgeMix || [];
  const momTop6    = data?.momTop6    || { months: [], series: [] };
  const bubble     = data?.bubble     || [];
  const yoy        = data?.yoy        || [];
  const seasonSplit = data?.seasonSplit || { groups: [], h1: [], h2: [] };
  const priceTrend = data?.priceTrend || { fys: [], series: [] };
  const table      = data?.table      || [];

  const momSeries   = momTop6.series.map((s) => ({ name: s.name, values: s.values }));
  const priceSeries = priceTrend.series.map((s) => ({ name: s.name, values: s.values }));
  const priceMonths = priceTrend.fys.map(shortFy);

  const top = kpis.topSegment || {};
  const fast = kpis.fastestGrowing;
  const decl = kpis.declining;
  const hap = kpis.highestAvgPrice || {};

  return (
    <PageState loading={loading} error={error}>
      {data && (
        <div className="ig-wrap">
          <div className="ceo-header-row">
            <SectionHead code="SG" title="Segment MIS" sub="3-year product segment view · gender-age · volume · price" />
            <FyToggle fyList={fyList} value={fy} onChange={onFy} partialFys={partialFys} />
          </div>

          <div className="sm-conc-note" style={{ background: "#faeeda", color: "#633806", marginBottom: 2 }}>
            Segments are rolled up to gender-age (Kids / Ladies / Gents / Boys / Girls / Premium). The source item-group labels change between years, so this stable rollup keeps the 3-year comparison valid.
          </div>

          <div className="kpi-grid ca-kpi-grid">
            <KpiCard label="Total Segments" value={String(kpis.totalSegments?.countCurrentFy ?? 0)}
              delta={`${shortFy(currentFy)}`} deltaTone="neu" context={`of ${kpis.totalSegments?.totalGroups ?? 0} tracked`} />
            <KpiCard label="Top Segment" value={top.name || "-"}
              delta={top.sharePct ? `${top.sharePct}% share` : null} deltaTone="up" context={top.name ? bigMoney(top.revenue) : undefined} />
            <KpiCard label="Fastest Growing" value={fast ? fast.name : "-"}
              delta={fast ? `${fast.yoyPct >= 0 ? "+" : ""}${fast.yoyPct}% YoY` : null} deltaTone="up" context={fast ? bigMoney(fast.cur) : undefined} />
            <KpiCard label="Declining" value={decl ? decl.name : "-"}
              delta={decl ? `${decl.yoyPct}% YoY` : null} deltaTone="dn" context={decl ? `${money(decl.avgPrice)}/pair` : undefined} />
            <KpiCard label="Highest Avg Price" value={hap.name || "-"}
              delta={hap.avgPrice ? `${money(hap.avgPrice)}/pair` : null} deltaTone="neu" context={`vs overall ${money(hap.overallAvg)}/pair`} />
            <KpiCard label={`Total Pairs (${shortFy(currentFy)})`} value={pairsFmt(kpis.totalPairs?.cur)}
              delta="pairs" deltaTone="neu" context="net of returns" />
          </div>

          <AlertBar alerts={alerts} />

          <div className="ceo-grid2">
            <Card title="Segment revenue — 3-yr trend" sub="Net sales by gender-age segment">
              <SegTrendChart segTrend={segTrend} />
            </Card>
            <Card title={`Segment share · ${shortFy(currentFy)}`} sub="Revenue mix by gender-age segment">
              <GenderDonut mix={genderAgeMix} />
            </Card>
          </div>

          <div className="ceo-grid2">
            <Card title={`MoM trend — top 6 · ${shortFy(currentFy)}`} sub="Monthly net sales by segment">
              <LineChart series={momSeries} months={momTop6.months} labels={{}} />
            </Card>
            <Card title="Volume vs value — price point" sub="Bubble size = avg price per pair. Above the diagonal earns more per pair than its volume share.">
              <BubbleChart bubble={bubble} />
            </Card>
          </div>

          <div className="ceo-grid3">
            <Card title={`YoY growth · ${shortFy(currentFy)} vs ${prevFy ? shortFy(prevFy) : "prev"}`} sub="Net sales % change">
              <YoYChart yoy={yoy} />
            </Card>
            <Card title={`Seasonal pattern · ${shortFy(currentFy)}`} sub="H1 Apr-Sep vs H2 Oct-Mar split">
              <SeasonChart seasonSplit={seasonSplit} />
            </Card>
            <Card title="Avg price trend — 3-yr" sub="Selling price per pair for the top segments">
              <LineChart series={priceSeries} months={priceMonths} labels={{}} />
            </Card>
          </div>

          <Card title="Segment detail" sub={`All segments sorted by ${currentFy} net sales — 3-year view`}>
            <DetailTable rows={table} fyList={fyList} currentFy={currentFy} />
          </Card>
        </div>
      )}
    </PageState>
  );
}
