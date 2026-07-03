import React, { useMemo } from "react";
import ReactApexChart from "react-apexcharts";
import { useProductPareto } from "../useProductPareto.js";
import { SectionHead, Card } from "../components/ui.jsx";
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
function shortSku(name) {
  return String(name || "").replace(/\s*MRP[-\s]*\d+#?\s*$/i, "").trim();
}
const BAND_COLORS = ["#e34948", "#eda100", "#2a78d6", "#2a78d6", "#4a3aa7", "#7F77DD"];

// Pareto combo: bars per FY + cumulative % line + 80% line
function ParetoChart({ pareto, fyList }) {
  const { options, series } = useMemo(() => {
    if (!pareto?.skus?.length) return { options: null, series: [] };
    const barColors = ["#B5D4F4", "#85B7EB", "#2a78d6"];
    const barSeries = pareto.bars.map((b, i) => ({ name: shortFy(b.name), type: "column", data: b.values }));
    const cumSeries = { name: "Cumulative %", type: "line", data: pareto.cumulative };
    const eighty = { name: "80%", type: "line", data: pareto.skus.map(() => 80) };
    const opts = {
      chart: { type: "line", stacked: false, toolbar: { show: false }, background: "transparent", fontFamily: "Inter, sans-serif" },
      colors: [...barColors.slice(-pareto.bars.length), "#eda100", "#e34948"],
      stroke: { width: [0, 0, 0, 2, 1].slice(-(pareto.bars.length + 2)), dashArray: [0, 0, 0, 0, 6] },
      plotOptions: { bar: { columnWidth: "75%", borderRadius: 2 } },
      dataLabels: { enabled: false },
      legend: { position: "top", horizontalAlign: "left", fontSize: "10px" },
      grid: { borderColor: "#e3e8f0", strokeDashArray: 4 },
      xaxis: { categories: pareto.skus, labels: { style: { colors: "#5d6678", fontSize: "8px" }, rotate: -50, trim: true } },
      yaxis: [
        { seriesName: shortFy(fyList[0]), labels: { formatter: (v) => bigMoney(v), style: { colors: "#5d6678", fontSize: "9px" } } },
        ...Array(Math.max(0, pareto.bars.length - 1)).fill({ show: false, seriesName: shortFy(fyList[0]) }),
        { opposite: true, min: 0, max: 100, seriesName: "Cumulative %", labels: { formatter: (v) => `${Math.round(v)}%`, style: { colors: "#eda100", fontSize: "9px" } } },
        { opposite: true, min: 0, max: 100, show: false, seriesName: "Cumulative %" },
      ],
      tooltip: { shared: true, intersect: false },
    };
    return { options: opts, series: [...barSeries, cumSeries, eighty] };
  }, [pareto, fyList]);
  if (!options) return <div className="empty">No data</div>;
  return <div className="chart-frame apex-frame"><ReactApexChart options={options} series={series} type="line" height={230} /></div>;
}

function MrpBands({ bands }) {
  if (!bands?.length) return <div className="empty">No data</div>;
  const max = Math.max(...bands.map((b) => b.pct), 1);
  return (
    <div className="pp-mrp">
      {bands.map((b, i) => (
        <div key={b.label} className="pp-mrp-row">
          <span className="pp-mrp-label">{b.label}</span>
          <div className="pp-mrp-track"><div className="pp-mrp-fill" style={{ width: `${Math.max(2, (b.pct / max) * 100)}%`, background: BAND_COLORS[i] }} /></div>
          <span className="pp-mrp-val">{bigMoney(b.revenue)}</span>
          <span className="pp-mrp-sku">{b.skuCount} SKU</span>
          <span className="pp-mrp-pct">{b.pct}%</span>
        </div>
      ))}
    </div>
  );
}

function SlowMoversChart({ rows }) {
  const { options, series } = useMemo(() => {
    if (!rows?.length) return { options: null, series: [] };
    const opts = {
      chart: { type: "bar", toolbar: { show: false }, background: "transparent", fontFamily: "Inter, sans-serif" },
      plotOptions: { bar: { horizontal: true, borderRadius: 3, barHeight: "62%" } },
      colors: ["#e34948"], dataLabels: { enabled: true, style: { fontSize: "10px", colors: ["#fff"] } },
      legend: { show: false }, grid: { borderColor: "#e3e8f0", strokeDashArray: 4 },
      xaxis: { categories: rows.map((r) => r.group), labels: { style: { colors: "#5d6678", fontSize: "9px" } } },
      yaxis: { labels: { style: { colors: "#5d6678", fontSize: "9px" } } },
      tooltip: { y: { formatter: (v) => `${v} slow movers` } },
    };
    return { options: opts, series: [{ name: "Slow movers", data: rows.map((r) => r.count) }] };
  }, [rows]);
  if (!options) return <div className="empty">No slow movers</div>;
  return <div className="chart-frame apex-frame"><ReactApexChart options={options} series={series} type="bar" height={190} /></div>;
}

function ZoneDonut({ zones }) {
  const { options, series } = useMemo(() => {
    if (!zones?.length) return { options: null, series: [] };
    const opts = {
      chart: { type: "donut", background: "transparent", fontFamily: "Inter, sans-serif" },
      labels: zones.map((z) => z.zone), colors: ["#2a78d6", "#85B7EB", "#e1e0d9"],
      dataLabels: { enabled: true, formatter: (v) => `${Math.round(v)}%` },
      legend: { position: "bottom", fontSize: "10px" },
      plotOptions: { pie: { donut: { size: "62%" } } }, stroke: { width: 2, colors: ["#fff"] },
      tooltip: { y: { formatter: (v, { seriesIndex }) => `${zones[seriesIndex].skus} SKUs · ${v}%` } },
    };
    return { options: opts, series: zones.map((z) => z.pct) };
  }, [zones]);
  if (!options) return <div className="empty">No data</div>;
  return <div className="chart-frame apex-frame"><ReactApexChart options={options} series={series} type="donut" height={190} /></div>;
}

function SeasonChart({ rows }) {
  const { options, series } = useMemo(() => {
    if (!rows?.length) return { options: null, series: [] };
    const opts = {
      chart: { type: "bar", stacked: true, toolbar: { show: false }, background: "transparent", fontFamily: "Inter, sans-serif" },
      plotOptions: { bar: { horizontal: true, borderRadius: 2, barHeight: "70%" } },
      colors: ["#85B7EB", "#2a78d6"], dataLabels: { enabled: false },
      legend: { position: "top", horizontalAlign: "left", fontSize: "10px" },
      grid: { borderColor: "#e3e8f0", strokeDashArray: 4 },
      xaxis: { max: 100, categories: rows.map((r) => r.sku), labels: { formatter: (v) => `${Math.round(v)}%`, style: { colors: "#5d6678", fontSize: "8px" } } },
      yaxis: { labels: { style: { colors: "#5d6678", fontSize: "8px" } } },
      tooltip: { y: { formatter: (v) => `${v}%` } },
    };
    return { options: opts, series: [{ name: "H1", data: rows.map((r) => r.h1Pct) }, { name: "H2", data: rows.map((r) => r.h2Pct) }] };
  }, [rows]);
  if (!options) return <div className="empty">No data</div>;
  return <div className="chart-frame apex-frame"><ReactApexChart options={options} series={series} type="bar" height={190} /></div>;
}

function QualityTable({ rows }) {
  if (!rows?.length) return <div className="empty">No quality issues</div>;
  return (
    <div className="table-wrap">
      <table>
        <thead><tr><th>SKU</th><th>Sales</th><th>Ret %</th><th></th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.sku}>
              <td><span className="strong">{shortSku(r.sku)}</span></td>
              <td><span className="money">{money(r.sales)}</span></td>
              <td style={{ color: "#ef4444", fontWeight: 600 }}>{r.returnPct}%</td>
              <td><span className="ig-signal" style={{ background: r.tag === "Stop" ? "#fdecec" : "#fdf2e3", color: r.tag === "Stop" ? "#ef4444" : "#d97706" }}>{r.tag}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const STATUS_STYLE = {
  Rising: { bg: "#e7f8ef", color: "#0e9456" }, Stable: { bg: "#f4f7fb", color: "#5d6678" },
  Falling: { bg: "#fdf2e3", color: "#d97706" }, Slow: { bg: "#fdecec", color: "#ef4444" }, Stop: { bg: "#fdecec", color: "#ef4444" },
};
function StatusTag({ status }) {
  const s = STATUS_STYLE[status] || STATUS_STYLE.Stable;
  return <span className="ig-signal" style={{ background: s.bg, color: s.color }}>{status}</span>;
}
function RankDelta({ d }) {
  if (d == null) return <span style={{ color: "#97a0b2" }}>-</span>;
  if (d > 0) return <span style={{ color: "#0e9456", fontWeight: 600 }}>+{d}</span>;
  if (d < 0) return <span style={{ color: "#ef4444", fontWeight: 600 }}>{d}</span>;
  return <span style={{ color: "#97a0b2" }}>0</span>;
}

function DetailTable({ rows, fyList }) {
  if (!rows?.length) return <div className="empty">No SKU data</div>;
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Rank</th><th>SKU name</th><th>Group</th>
            {fyList.map((fy) => <th key={fy}>{shortFy(fy)}</th>)}
            <th>YoY %</th><th>MRP</th><th>Qty</th><th>H1 %</th><th>Rank Δ</th><th>Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const yoyColor = r.yoyPct == null ? "#5d6678" : r.yoyPct >= 0 ? "#12b76a" : "#ef4444";
            return (
              <tr key={r.sku}>
                <td>{r.rank || "-"}</td>
                <td><span className="strong">{shortSku(r.sku)}</span></td>
                <td style={{ color: "#5d6678", fontSize: 11 }}>{r.group}</td>
                {fyList.map((fy) => (
                  <td key={fy}>{(r.perFy[fy] || 0) > 0 ? <span className="money">{money(r.perFy[fy])}</span> : <span style={{ color: "#97a0b2" }}>nil</span>}</td>
                ))}
                <td>{r.yoyPct != null ? <span style={{ color: yoyColor, fontWeight: 600 }}>{r.yoyPct >= 0 ? `+${r.yoyPct}` : r.yoyPct}%</span> : "-"}</td>
                <td>{r.mrp ? money(r.mrp) : "-"}</td>
                <td>{r.qty.toLocaleString("en-IN")}</td>
                <td>{Math.round(r.h1Pct)}%</td>
                <td><RankDelta d={r.rankDelta} /></td>
                <td><StatusTag status={r.status} /></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function ProductParetoView({ fy, onFy }) {
  const { data, loading, error } = useProductPareto(fy);

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
  const pareto     = data?.pareto     || { skus: [], bars: [], cumulative: [] };
  const mrpBands   = data?.mrpBands   || [];
  const slowMoversByGroup = data?.slowMoversByGroup || [];
  const zones      = data?.zones      || [];
  const seasonTop10 = data?.seasonTop10 || [];
  const qualityIssues = data?.qualityIssues || [];
  const table      = data?.table      || [];

  const top = kpis.topSku || {};

  return (
    <PageState loading={loading} error={error}>
      {data && (
        <div className="ig-wrap">
          <div className="ceo-header-row">
            <SectionHead code="PP" title="Product Pareto" sub="3-year SKU view · concentration · rank shifts · slow movers · MRP bands" />
            <FyToggle fyList={fyList} value={fy} onChange={onFy} partialFys={partialFys} />
          </div>

          <div className="kpi-grid ca-kpi-grid">
            <KpiCard label={`Total SKUs (${shortFy(currentFy)})`} value={String(kpis.totalSkus?.count ?? 0)} delta="active" deltaTone="neu" context="sold at least once" />
            <KpiCard label="SKUs to reach 80%" value={String(kpis.skusTo80?.count ?? 0)} delta={kpis.skusTo80?.pct ? `${kpis.skusTo80.pct}% of range` : null} deltaTone="dn" context={`${shortFy(currentFy)} concentration`} />
            <KpiCard label="SKUs to reach 50%" value={String(kpis.skusTo50?.count ?? 0)} delta={kpis.skusTo50?.pct ? `${kpis.skusTo50.pct}% of range` : null} deltaTone="neu" context="half the revenue" />
            <KpiCard label={`Top SKU (${shortFy(currentFy)})`} value={top.name ? shortSku(top.name) : "-"} delta={top.sharePct ? `${bigMoney(top.revenue)} · ${top.sharePct}%` : null} deltaTone="up" context={top.group || undefined} />
            <KpiCard label="Slow movers (90d+)" value={String(kpis.slowMovers?.count ?? 0)} delta={kpis.slowMovers?.pct ? `${kpis.slowMovers.pct}% of SKUs` : null} deltaTone="dn" context="no sale in last 90 days" />
            <KpiCard label="Worst return rate" value={kpis.worstReturn ? `${kpis.worstReturn.pct}%` : "-"} delta={kpis.worstReturn ? "more returned than sold" : null} deltaTone="dn" context={kpis.worstReturn ? shortSku(kpis.worstReturn.name) : undefined} />
          </div>

          <AlertBar alerts={alerts} />

          <Card title="Product Pareto — top 20 SKUs · 3-year overlay" sub="Bars = net sales per year. Line = cumulative % (current FY). Dashed red = 80% threshold.">
            <ParetoChart pareto={pareto} fyList={fyList} />
          </Card>

          <div className="ceo-grid2">
            <Card title={`MRP band analysis · ${shortFy(currentFy)}`} sub="Revenue by price point — where the money comes from">
              <MrpBands bands={mrpBands} />
            </Card>
            <Card title="Slow movers by group" sub="Count of SKUs with no sale in the last 90 days">
              <SlowMoversChart rows={slowMoversByGroup} />
            </Card>
          </div>

          <div className="ceo-grid3">
            <Card title="SKU zone split" sub="Revenue concentration by rank band">
              <ZoneDonut zones={zones} />
            </Card>
            <Card title={`H1 vs H2 — top 10 SKUs · ${shortFy(currentFy)}`} sub="Seasonality per SKU">
              <SeasonChart rows={seasonTop10} />
            </Card>
            <Card title="Quality issues" sub="Return rate above 10% — review or stop">
              <QualityTable rows={qualityIssues} />
            </Card>
          </div>

          <Card title="Product detail — top 15" sub={`3-year rank, revenue, H1/H2, rank shift · sorted by ${currentFy} net`}>
            <DetailTable rows={table} fyList={fyList} />
          </Card>
        </div>
      )}
    </PageState>
  );
}
