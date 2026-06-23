import React from "react";
import ReactApexChart from "react-apexcharts";
import { GRID, INK, baseChart, baseTooltip } from "./chartTheme.js";

// Bubble: x = net sales (₹L), y = collection rate %, z = active months (bubble size).
// data = [{ name, x, y, z }]
export function ScatterPlot({ data, xLabel = "Net Sales (₹L)", yLabel = "Collection %" }) {
  if (!data || data.length === 0) return <div className="empty">No data for current filters</div>;

  const series = [{ name: "Customers", data: data.map((d) => ({ x: d.x, y: d.y, z: d.z, name: d.name })) }];

  const options = {
    chart: { ...baseChart("bubble") },
    colors: ["#2563eb"],
    fill: { type: "gradient", gradient: { shade: "light", inverseColors: false, opacityFrom: 0.7, opacityTo: 0.35 } },
    dataLabels: { enabled: false },
    grid: { borderColor: GRID, strokeDashArray: 4 },
    xaxis: {
      type: "numeric", tickAmount: 6,
      title: { text: xLabel, style: { color: INK, fontSize: "11px", fontWeight: 600 } },
      labels: { formatter: (v) => `${Number(v).toFixed(0)}L`, style: { colors: INK, fontSize: "11px" } },
      axisBorder: { show: false }, axisTicks: { color: GRID },
    },
    yaxis: {
      min: 0, max: (max) => Math.max(100, Math.ceil(max)),
      title: { text: yLabel, style: { color: INK, fontSize: "11px", fontWeight: 600 } },
      labels: { formatter: (v) => `${Math.round(v)}%`, style: { colors: INK, fontSize: "11px" } },
    },
    annotations: {
      yaxis: [{ y: 85, borderColor: "#12b76a", strokeDashArray: 5, label: { text: "Target 85%", borderColor: "#12b76a", style: { color: "#fff", background: "#12b76a", fontSize: "10px", fontWeight: 700 } } }],
    },
    tooltip: {
      ...baseTooltip,
      custom: ({ seriesIndex, dataPointIndex, w }) => {
        const p = w.config.series[seriesIndex].data[dataPointIndex] || {};
        return `<div style="padding:8px 11px;font-family:Inter,'Segoe UI',sans-serif;font-size:12px;line-height:1.5;">
          <strong>${p.name || "Customer"}</strong><br/>
          Net Sales: ₹${p.x}L<br/>Collection: ${p.y}%<br/>Active Months: ${p.z}
        </div>`;
      },
    },
  };

  return (
    <div className="chart-frame apex-frame">
      <ReactApexChart options={options} series={series} type="bubble" height={300} />
    </div>
  );
}
