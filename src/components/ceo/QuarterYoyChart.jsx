import React from "react";
import ReactApexChart from "react-apexcharts";
import { PALETTE, FONT, GRID, INK, baseChart, baseTooltip } from "../chartTheme.js";

// QuarterYoyChart — grouped column chart showing YoY% by quarter for two series.
// data: [{ q, prevVsPrev2, curVsPrev }]
// prevFy: string label for the prev-vs-prev2 series
// currentFy: string label for the cur-vs-prev series
export function QuarterYoyChart({ data, prevFy, currentFy }) {
  if (!data || data.length === 0) {
    return <div className="empty">No quarterly data</div>;
  }

  const categories = data.map((d) => d.q);
  const series1 = data.map((d) => (d.prevVsPrev2 == null ? null : Number(d.prevVsPrev2)));
  const series2 = data.map((d) => (d.curVsPrev == null ? null : Number(d.curVsPrev)));

  const options = {
    chart: {
      ...baseChart("bar"),
      stacked: false,
    },
    colors: [PALETTE[2], PALETTE[0]], // amber for prev-vs-prev2, blue for cur-vs-prev
    plotOptions: {
      bar: {
        horizontal: false,
        columnWidth: "55%",
        borderRadius: 4,
        borderRadiusApplication: "end",
      },
    },
    dataLabels: { enabled: false },
    grid: { borderColor: GRID, strokeDashArray: 4 },
    xaxis: {
      categories,
      labels: { style: { colors: INK, fontSize: "11px" } },
      axisBorder: { show: false },
      axisTicks: { color: GRID },
    },
    yaxis: {
      labels: {
        formatter: (v) => (v == null ? "—" : `${v >= 0 ? "+" : ""}${Number(v).toFixed(1)}%`),
        style: { colors: INK, fontSize: "11px" },
      },
    },
    tooltip: {
      ...baseTooltip,
      shared: true,
      intersect: false,
      y: {
        formatter: (v) => (v == null ? "—" : `${v >= 0 ? "+" : ""}${Number(v).toFixed(1)}% YoY`),
      },
    },
    legend: {
      position: "top",
      horizontalAlign: "left",
      fontSize: "12px",
      fontFamily: FONT,
      labels: { colors: INK },
      markers: { width: 10, height: 10, radius: 3 },
    },
  };

  const series = [
    { name: prevFy ? `${prevFy} YoY` : "Prev YoY", data: series1 },
    { name: currentFy ? `${currentFy} YoY` : "Cur YoY", data: series2 },
  ];

  return (
    <div className="chart-frame apex-frame">
      <ReactApexChart options={options} series={series} type="bar" height={200} />
    </div>
  );
}
