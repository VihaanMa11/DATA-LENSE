import React from "react";
import ReactApexChart from "react-apexcharts";
import { FONT, GRID, INK, money, moneyAxis, baseChart, baseTooltip } from "./chartTheme.js";

// Combo chart: ranked columns (value) + cumulative % line on a second axis, with an 80% marker.
export function ParetoChart({ data, title, barLabel = "Net Sales" }) {
  if (!data || data.length === 0) return <div className="empty">No data for current filters</div>;
  const categories = data.map((d) => String(d.label));
  const bars = data.map((d) => Number(d.value) || 0);
  const cum = data.map((d) => Number(d.cumulativePct) || 0);

  const options = {
    chart: { ...baseChart("line"), stacked: false },
    colors: ["#2563eb", "#f59e0b"],
    stroke: { width: [0, 3], curve: "smooth" },
    plotOptions: { bar: { columnWidth: "55%", borderRadius: 4, borderRadiusApplication: "end" } },
    fill: {
      type: ["gradient", "solid"],
      gradient: { shade: "light", type: "vertical", opacityFrom: 0.95, opacityTo: 0.7, gradientToColors: ["#60a5fa"] },
    },
    dataLabels: { enabled: false },
    markers: { size: 0, strokeColors: "#fff", hover: { size: 5 } },
    legend: { position: "top", horizontalAlign: "left", fontFamily: FONT, labels: { colors: INK }, markers: { width: 10, height: 10, radius: 3 } },
    grid: { borderColor: GRID, strokeDashArray: 4 },
    xaxis: {
      categories, tickPlacement: "on",
      labels: { rotate: -45, rotateAlways: data.length > 8, hideOverlappingLabels: true, trim: true, style: { colors: INK, fontSize: "11px" } },
      axisBorder: { show: false }, axisTicks: { color: GRID },
    },
    yaxis: [
      { seriesName: barLabel, labels: { formatter: moneyAxis, style: { colors: INK, fontSize: "11px" } }, title: { text: barLabel, style: { color: INK, fontWeight: 600 } } },
      { opposite: true, min: 0, max: 100, seriesName: "Cumulative %", labels: { formatter: (v) => `${Math.round(v)}%`, style: { colors: INK, fontSize: "11px" } }, title: { text: "Cumulative %", style: { color: INK, fontWeight: 600 } } },
    ],
    annotations: {
      yaxis: [{ y: 80, yAxisIndex: 1, borderColor: "#ef4444", strokeDashArray: 6, label: { text: "80%", borderColor: "#ef4444", style: { color: "#fff", background: "#ef4444", fontSize: "10px" } } }],
    },
    tooltip: { ...baseTooltip, shared: true, intersect: false, y: [{ formatter: money }, { formatter: (v) => `${Number(v).toFixed(1)}%` }] },
  };

  const series = [
    { name: barLabel, type: "column", data: bars },
    { name: "Cumulative %", type: "line", data: cum },
  ];

  return (
    <div className="chart-frame apex-frame">
      {title && <h3 style={{ color: "var(--blue)", margin: "0 0 6px", fontSize: 15, fontWeight: 700 }}>{title}</h3>}
      <ReactApexChart options={options} series={series} type="line" height={380} />
    </div>
  );
}
