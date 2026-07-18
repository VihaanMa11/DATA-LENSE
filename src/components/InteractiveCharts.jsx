import React from "react";
import ReactApexChart from "react-apexcharts";
import { PALETTE, FONT, GRID, INK, money, moneyAxis, baseChart, baseTooltip } from "./chartTheme.js";

// Premium interactive charts powered by ApexCharts.
// Public API is unchanged so every page upgrades automatically:
//   <BarChart rows={[[label, value], ...]} />
//   <DonutChart rows={[[label, value], ...]} />
//   <LineChart series={[{ name, values:[] }]} months={[...]} labels={{key:display}} />

function Empty() {
  return <div className="empty">No data for current filters</div>;
}

/* ------------------------------------------------------------------ BarChart */
export function BarChart({ rows }) {
  if (!rows || rows.length === 0) return <Empty />;
  const categories = rows.map((r) => String(r[0]));
  const data = rows.map((r) => Number(r[1]) || 0);
  const height = Math.min(520, Math.max(240, categories.length * 42 + 20));

  const options = {
    chart: baseChart("bar"),
    colors: ["#2563eb"],
    plotOptions: {
      bar: { horizontal: true, borderRadius: 6, borderRadiusApplication: "end", barHeight: "62%", distributed: false },
    },
    fill: {
      type: "gradient",
      gradient: { type: "horizontal", shade: "light", gradientToColors: ["#60a5fa"], stops: [0, 100], opacityFrom: 1, opacityTo: 1 },
    },
    dataLabels: { enabled: false },
    grid: { borderColor: GRID, strokeDashArray: 4, xaxis: { lines: { show: true } }, yaxis: { lines: { show: false } } },
    states: { hover: { filter: { type: "darken", value: 0.9 } }, active: { filter: { type: "darken", value: 0.82 } } },
    xaxis: {
      categories,
      labels: { formatter: moneyAxis, style: { colors: INK, fontSize: "11px" } },
      axisBorder: { show: false }, axisTicks: { show: false },
    },
    yaxis: { labels: { style: { colors: INK, fontSize: "12px" }, maxWidth: 220 } },
    tooltip: { ...baseTooltip, y: { formatter: money, title: { formatter: () => "" } } },
  };

  return (
    <div className="chart-frame apex-frame">
      <ReactApexChart options={options} series={[{ name: "Value", data }]} type="bar" height={height} />
    </div>
  );
}

/* ----------------------------------------------------------------- DonutChart */
export function DonutChart({ rows }) {
  if (!rows || rows.length === 0) return <Empty />;
  const top = rows.slice(0, 8);
  const labels = top.map((r) => String(r[0]));
  const series = top.map((r) => Math.abs(Number(r[1]) || 0));

  const options = {
    chart: { ...baseChart("donut"), animations: { ...baseChart("donut").animations, speed: 750 } },
    labels,
    colors: PALETTE,
    stroke: { width: 2, colors: ["#ffffff"] },
    fill: { type: "gradient", gradient: { shade: "light", shadeIntensity: 0.25 } },
    // Legend below (not beside) the donut: a side legend squeezes the pie's radius in
    // any narrow grid column, which crams the in-slice % labels on top of each other
    // and the center total. ApexCharts' own `responsive` breakpoints key off the
    // browser window width, not the card's actual rendered width, so they never fire
    // inside a multi-column grid — this has to be the default, not a breakpoint.
    legend: {
      position: "bottom", fontSize: "12px", fontFamily: FONT, fontWeight: 500,
      labels: { colors: INK }, markers: { width: 10, height: 10, radius: 3 },
      itemMargin: { horizontal: 8, vertical: 4 }, formatter: (name) => (name.length > 22 ? `${name.slice(0, 22)}…` : name),
    },
    dataLabels: {
      enabled: true, formatter: (val) => `${Number(val).toFixed(1)}%`,
      style: { fontSize: "11px", fontWeight: 700, fontFamily: FONT },
      dropShadow: { enabled: true, blur: 1, opacity: 0.35 },
      // Skip labels on slivers too thin to hold text without overlapping a neighbor.
      minAngleToShowLabel: 12,
    },
    plotOptions: {
      pie: {
        expandOnClick: true,
        donut: {
          size: "66%",
          labels: {
            show: true,
            name: { fontSize: "13px", color: INK, offsetY: -2 },
            value: { fontSize: "20px", fontWeight: 800, color: "#161d2b", offsetY: 4, formatter: money },
            total: { show: true, label: "Total", color: INK, fontSize: "13px", formatter: (w) => money(w.globals.seriesTotals.reduce((a, b) => a + b, 0)) },
          },
        },
      },
    },
    states: { hover: { filter: { type: "lighten", value: 0.06 } }, active: { filter: { type: "darken", value: 0.12 } } },
    tooltip: {
      ...baseTooltip, fillSeriesColor: false,
      y: { formatter: (val, opts) => {
        const total = opts?.globals?.seriesTotals?.reduce((a, b) => a + b, 0) || 0;
        const share = total ? ((val / total) * 100).toFixed(1) : "0.0";
        return `${money(val)}  ·  ${share}%`;
      } },
    },
  };

  // Bottom legend needs vertical room proportional to how many rows it wraps into,
  // not the fixed height that was sized for a side legend.
  const height = 300 + Math.ceil(labels.length / 3) * 26;

  return (
    <div className="chart-frame donut-frame apex-frame">
      <ReactApexChart options={options} series={series} type="donut" height={height} />
    </div>
  );
}

/* ----------------------------------------------------------------- LineChart */
export function LineChart({ series, months, labels }) {
  if (!series || series.length === 0 || !months || months.length === 0) return <Empty />;
  const categories = months.map((m) => (labels && labels[m]) || m);
  const apexSeries = series.map((s) => ({ name: s.name, data: (s.values || []).map((v) => Number(v) || 0) }));

  const options = {
    chart: { ...baseChart("area"), animations: { ...baseChart("area").animations, speed: 750 } },
    colors: PALETTE,
    stroke: { curve: "smooth", width: 3, lineCap: "round" },
    fill: { type: "gradient", gradient: { shadeIntensity: 1, opacityFrom: 0.32, opacityTo: 0.02, stops: [0, 92] } },
    dataLabels: { enabled: false },
    markers: { size: 0, strokeWidth: 2, strokeColors: "#fff", hover: { size: 6 } },
    grid: { borderColor: GRID, strokeDashArray: 4, padding: { left: 6, right: 8 } },
    xaxis: {
      categories, tickPlacement: "on",
      labels: { style: { colors: INK, fontSize: "11px" }, rotate: 0, hideOverlappingLabels: true },
      axisBorder: { show: false }, axisTicks: { color: GRID },
    },
    yaxis: { labels: { formatter: moneyAxis, style: { colors: INK, fontSize: "11px" } } },
    legend: { position: "top", horizontalAlign: "left", fontSize: "12px", fontFamily: FONT, labels: { colors: INK }, markers: { width: 10, height: 10, radius: 3 } },
    tooltip: { ...baseTooltip, shared: true, intersect: false, x: { show: true }, y: { formatter: money } },
  };

  return (
    <div className="chart-frame line-frame apex-frame">
      <ReactApexChart options={options} series={apexSeries} type="area" height={320} />
    </div>
  );
}
