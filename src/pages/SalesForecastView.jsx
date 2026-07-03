import React, { useMemo } from "react";
import ReactApexChart from "react-apexcharts";
import { useSalesForecast } from "../useSalesForecast.js";
import { SectionHead, Card } from "../components/ui.jsx";
import { FyToggle } from "../components/ceo/FyToggle.jsx";
import { KpiCard } from "../components/ceo/KpiCard.jsx";
import { AlertBar } from "../components/ceo/AlertBar.jsx";
import { PageState } from "./pageKit.jsx";
import { money } from "../components/chartTheme.js";

function bigMoney(v) {
  const n = Number(v) || 0;
  if (Math.abs(n) >= 1e7) return `₹${(n / 1e7).toFixed(2)} Cr`;
  if (Math.abs(n) >= 1e5) return `₹${(n / 1e5).toFixed(1)} L`;
  return `₹${Math.round(n).toLocaleString("en-IN")}`;
}
function shortFy(fy) {
  const m = String(fy || "").match(/FY\s*\d{4}-(\d{2})/i);
  return m ? `FY${m[1]}` : fy;
}

function MainChart({ mc }) {
  const { options, series } = useMemo(() => {
    if (!mc?.labels?.length) return { options: null, series: [] };
    const L = (a) => a.map((v) => (v == null ? null : Math.round(v / 1e5)));
    const opts = {
      chart: { type: "line", toolbar: { show: false }, background: "transparent", fontFamily: "Inter, sans-serif" },
      colors: ["#b4b2a9", "#2a78d6", "#eda100"],
      stroke: { width: [1.5, 2.5, 2], dashArray: [4, 0, 6] },
      dataLabels: { enabled: false },
      legend: { position: "top", horizontalAlign: "left", fontSize: "10px" },
      grid: { borderColor: "#e3e8f0", strokeDashArray: 4 },
      markers: { size: [0, 3, 4] },
      xaxis: { categories: mc.labels, labels: { style: { colors: "#5d6678", fontSize: "8px" }, rotate: 0 } },
      yaxis: { labels: { formatter: (v) => `₹${v}L`, style: { colors: "#5d6678", fontSize: "9px" } } },
      annotations: { xaxis: [
        { x: "Jul", borderColor: "#e34948", strokeDashArray: 4, label: { text: "trough", style: { fontSize: "8px", color: "#e34948", background: "transparent" } } },
        { x: "Sep", borderColor: "#1baf7a", strokeDashArray: 4, label: { text: "peak", style: { fontSize: "8px", color: "#1baf7a", background: "transparent" } } },
      ] },
      tooltip: { shared: true, intersect: false, y: { formatter: (v) => (v == null ? "-" : `₹${v}L`) } },
    };
    const ser = [
      { name: `${shortFy(mc.prevFy)} same month`, data: L(mc.prevYear) },
      { name: `${shortFy(mc.curFy)} actual`, data: L(mc.actual) },
      { name: `${shortFy(mc.forecastFy)} forecast`, data: L(mc.forecast) },
    ];
    return { options: opts, series: ser };
  }, [mc]);
  if (!options) return <div className="empty">No data</div>;
  return <div className="chart-frame apex-frame"><ReactApexChart options={options} series={series} type="line" height={230} /></div>;
}

function SeasonalityChart({ data }) {
  const { options, series } = useMemo(() => {
    if (!data?.values?.length) return { options: null, series: [] };
    const colors = data.values.map((v) => (v >= 120 ? "#1baf7a" : v >= 80 ? "#eda100" : "#e34948"));
    const opts = {
      chart: { type: "bar", toolbar: { show: false }, background: "transparent", fontFamily: "Inter, sans-serif" },
      plotOptions: { bar: { columnWidth: "65%", borderRadius: 2, distributed: true } }, colors,
      dataLabels: { enabled: false }, legend: { show: false }, grid: { borderColor: "#e3e8f0", strokeDashArray: 4 },
      xaxis: { categories: data.months, labels: { style: { colors: "#5d6678", fontSize: "9px" } } },
      yaxis: { labels: { formatter: (v) => `${Math.round(v)}%`, style: { colors: "#5d6678", fontSize: "9px" } } },
      annotations: { yaxis: [{ y: 100, borderColor: "#b4b2a9", strokeDashArray: 4 }] },
      tooltip: { y: { formatter: (v) => `${v}% of average` } },
    };
    return { options: opts, series: [{ name: "Seasonality", data: data.values }] };
  }, [data]);
  if (!options) return <div className="empty">No data</div>;
  return <div className="chart-frame apex-frame"><ReactApexChart options={options} series={series} type="bar" height={160} /></div>;
}

function YoYChart({ data }) {
  const { options, series } = useMemo(() => {
    if (!data?.values?.length) return { options: null, series: [] };
    const vals = data.values.map((v) => (v == null ? 0 : v));
    const colors = vals.map((v) => (v >= 0 ? "#1baf7a" : "#e34948"));
    const opts = {
      chart: { type: "bar", toolbar: { show: false }, background: "transparent", fontFamily: "Inter, sans-serif" },
      plotOptions: { bar: { columnWidth: "65%", borderRadius: 2, distributed: true } }, colors,
      dataLabels: { enabled: false }, legend: { show: false }, grid: { borderColor: "#e3e8f0", strokeDashArray: 4 },
      xaxis: { categories: data.months, labels: { style: { colors: "#5d6678", fontSize: "9px" } } },
      yaxis: { labels: { formatter: (v) => `${Math.round(v)}%`, style: { colors: "#5d6678", fontSize: "9px" } } },
      tooltip: { y: { formatter: (v) => `${v >= 0 ? "+" : ""}${v}% YoY` } },
    };
    return { options: opts, series: [{ name: "YoY", data: vals }] };
  }, [data]);
  if (!options) return <div className="empty">No data</div>;
  return <div className="chart-frame apex-frame"><ReactApexChart options={options} series={series} type="bar" height={160} /></div>;
}

function RangeChart({ projection }) {
  const { options, series } = useMemo(() => {
    if (!projection?.base) return { options: null, series: [] };
    const opts = {
      chart: { type: "bar", toolbar: { show: false }, background: "transparent", fontFamily: "Inter, sans-serif" },
      plotOptions: { bar: { horizontal: true, borderRadius: 3, barHeight: "55%", distributed: true } },
      colors: ["#85B7EB", "#2a78d6", "#1baf7a"], dataLabels: { enabled: true, formatter: (v) => bigMoney(v), style: { fontSize: "9px", colors: ["#fff"] } },
      legend: { show: false }, grid: { borderColor: "#e3e8f0", strokeDashArray: 4 },
      xaxis: { categories: ["Conservative", "Base case", "Optimistic"], labels: { formatter: (v) => `₹${Math.round(v / 1e5)}L`, style: { colors: "#5d6678", fontSize: "9px" } } },
      yaxis: { labels: { style: { colors: "#5d6678", fontSize: "9px" } } },
      tooltip: { y: { formatter: (v) => `${bigMoney(v)} ${shortFy(projection.fy)}` } },
    };
    return { options: opts, series: [{ name: projection.fy, data: [projection.conservative, projection.base, projection.optimistic] }] };
  }, [projection]);
  if (!options) return <div className="empty">No data</div>;
  return <div className="chart-frame apex-frame"><ReactApexChart options={options} series={series} type="bar" height={160} /></div>;
}

function AccuracyTable({ rows }) {
  if (!rows?.length) return <div className="empty">No data</div>;
  return (
    <div className="table-wrap">
      <table>
        <thead><tr><th>Month</th><th>{"This yr same"}</th><th>Forecast</th><th>Implied YoY</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.month}>
              <td><span className="strong">{r.month}</span></td>
              <td><span className="money">{money(r.curYearSame)}</span></td>
              <td><span className="money">{money(r.forecast)}</span></td>
              <td style={{ color: r.impliedYoY >= 0 ? "#12b76a" : "#ef4444", fontWeight: 600 }}>{r.impliedYoY != null ? `${r.impliedYoY >= 0 ? "+" : ""}${r.impliedYoY}%` : "-"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const TYPE_TAG = { Peak: { bg: "#eaf3de", color: "#3b6d11" }, Low: { bg: "#fdecec", color: "#ef4444" }, Forecast: { bg: "#e6f1fb", color: "#185fa5" }, Actual: { bg: "#f4f7fb", color: "#5d6678" } };
function DetailTable({ rows }) {
  if (!rows?.length) return <div className="empty">No data</div>;
  return (
    <div className="table-wrap">
      <table>
        <thead><tr><th>Month</th><th>This year</th><th>Prior year</th><th>YoY %</th><th>Type</th></tr></thead>
        <tbody>
          {rows.map((r) => {
            const tt = TYPE_TAG[r.type] || TYPE_TAG.Actual;
            const yoyColor = r.yoyPct == null ? "#5d6678" : r.yoyPct >= 0 ? "#12b76a" : "#ef4444";
            return (
              <tr key={r.month} style={r.type === "Forecast" ? { background: "#f5f9fe" } : undefined}>
                <td><span className="strong">{r.month}</span></td>
                <td><span className="money">{money(r.cur)}</span></td>
                <td>{r.prev ? <span className="money">{money(r.prev)}</span> : "-"}</td>
                <td>{r.yoyPct != null ? <span style={{ color: yoyColor, fontWeight: 600 }}>{r.yoyPct >= 0 ? `+${r.yoyPct}` : r.yoyPct}%</span> : "-"}</td>
                <td><span className="ig-signal" style={{ background: tt.bg, color: tt.color }}>{r.type}</span></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function SalesForecastView({ fy, onFy }) {
  const { data, loading, error } = useSalesForecast(fy);

  if (!data && !loading && !error) {
    return (
      <div className="error-box info-box">
        No Google Sheet connected. Open <b>Data Source</b> (top right) and paste your sheet URL, then press <b>Sync Now</b>.
      </div>
    );
  }

  const fyList     = data?.fyList     || [];
  const currentFy  = data?.currentFy  || "";
  const forecastFy = data?.forecastFy || "";
  const kpis       = data?.kpis       || {};
  const alerts     = data?.alerts     || [];
  const partialFys = useMemo(() => new Set(data?.partialFys || []), [data]);
  const mainChart  = data?.mainChart  || { labels: [] };
  const seasonality = data?.seasonality || { months: [], values: [] };
  const yoyMonth   = data?.yoyMonth   || { months: [], values: [] };
  const projection = data?.projection || {};
  const accuracy   = data?.accuracy   || [];
  const table      = data?.table      || [];

  const ta = kpis.totalActual || {};
  const nm = kpis.nextMonthForecast || {};
  const bm = kpis.bestMonth || {};
  const wm = kpis.worstMonth || {};
  const hh = kpis.h1h2 || {};
  const f3 = kpis.forecast3 || {};

  return (
    <PageState loading={loading} error={error}>
      {data && (
        <div className="ig-wrap">
          <div className="ceo-header-row">
            <SectionHead code="SF" title="Sales Forecast" sub={`${shortFy(currentFy)} actuals · seasonality-aware 3-month forecast · YoY`} />
            <FyToggle fyList={fyList} value={fy} onChange={onFy} partialFys={partialFys} />
          </div>

          <div className="kpi-grid ca-kpi-grid">
            <KpiCard label={`Total actual (${shortFy(currentFy)})`} value={bigMoney(ta.cur)} delta={ta.yoyPct != null ? `${ta.yoyPct >= 0 ? "+" : ""}${ta.yoyPct}% YoY` : null} deltaTone={ta.yoyPct >= 0 ? "up" : "dn"} context={ta.prev ? `${shortFy(data.prevFy)}: ${bigMoney(ta.prev)}` : undefined} />
            <KpiCard label={`Next month forecast (${nm.month})`} value={bigMoney(nm.value)} delta={nm.impliedYoY != null ? `${nm.impliedYoY >= 0 ? "+" : ""}${nm.impliedYoY}% vs this yr` : null} deltaTone="neu" context={`${nm.month} ${shortFy(currentFy)}: ${bigMoney(nm.vsCur)}`} />
            <KpiCard label="Best month" value={bigMoney(bm.value)} delta={bm.month} deltaTone="up" context="stock and staff up before it" />
            <KpiCard label="Worst month" value={bigMoney(wm.value)} delta={wm.month} deltaTone="dn" context={`${wm.pctBelowBest}% below peak · seasonal low`} />
            <KpiCard label="H1 vs H2 split" value={`${hh.h1Pct}% / ${hh.h2Pct}%`} delta={hh.h2Pct >= hh.h1Pct ? "H2 stronger" : "H1 stronger"} deltaTone="neu" context={`H1 ${bigMoney(hh.h1)} · H2 ${bigMoney(hh.h2)}`} />
            <KpiCard label="3-month forecast total" value={bigMoney(f3.total)} delta={f3.months} deltaTone="up" context={`vs same 3 mo this yr: ${bigMoney(f3.vsCur)}`} />
          </div>

          <AlertBar alerts={alerts} />

          <Card title={`Actual vs forecast — ${shortFy(currentFy)} + 3-month forward`} sub={`Blue = ${shortFy(currentFy)} actual · orange dashed = ${shortFy(forecastFy)} forecast · grey = prior year same month. July trough and September peak marked.`}>
            <MainChart mc={mainChart} />
          </Card>

          <div className="ceo-grid2">
            <Card title={`Seasonality index · ${shortFy(currentFy)}`} sub="Each month as % of the monthly average. Green >= 120%, red < 80%.">
              <SeasonalityChart data={seasonality} />
            </Card>
            <Card title={`YoY same-month · ${shortFy(currentFy)} vs ${shortFy(data.prevFy)}`} sub="Was each month better or worse than prior year?">
              <YoYChart data={yoyMonth} />
            </Card>
          </div>

          <div className="ceo-grid3">
            <Card title={`${shortFy(forecastFy)} full-year projection`} sub="Conservative / base / optimistic scenarios">
              <RangeChart projection={projection} />
            </Card>
            <Card title="Forecast vs this-year same month" sub="Implied YoY for each forecast month">
              <AccuracyTable rows={accuracy} />
            </Card>
            <Card title="Monthly detail" sub={`${shortFy(currentFy)} + 3-month forecast`}>
              <div style={{ maxHeight: 200, overflowY: "auto" }}><DetailTable rows={table} /></div>
            </Card>
          </div>
        </div>
      )}
    </PageState>
  );
}
