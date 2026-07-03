import React, { useMemo, useState } from "react";
import ReactApexChart from "react-apexcharts";
import { SectionHead, Card } from "../components/ui.jsx";
import { KpiCard } from "../components/ceo/KpiCard.jsx";

const GROUPS = [
  { group: "Kids PU-F", key: "Kids PU-F", salesL: 1238.5, qtyL: 96.3, skus: 101, buyers: 67, bills: 592, margin: 25.0, st: 89.0, h1Pct: 50.0, retPct: 0.6, slow: 15, color: "#2a78d6" },
  { group: "Ladies PU-A", key: "Ladies PU-A", salesL: 1149.7, qtyL: 81.2, skus: 52, buyers: 61, bills: 706, margin: 33.2, st: 99.6, h1Pct: 50.4, retPct: 0.9, slow: 14, color: "#1baf7a" },
  { group: "Ladies PU-F", key: "Ladies PU-F", salesL: 907.3, qtyL: 69.4, skus: 76, buyers: 63, bills: 584, margin: 21.8, st: 88.0, h1Pct: 21.9, retPct: 1.1, slow: 13, color: "#eda100" },
  { group: "Gents PU-F", key: "Gents PU-F", salesL: 887.8, qtyL: 54.4, skus: 67, buyers: 68, bills: 673, margin: 25.2, st: 89.4, h1Pct: 50.1, retPct: 0.7, slow: 16, color: "#4a3aa7" },
  { group: "Boys PU-F", key: "Boys PU-F", salesL: 768.3, qtyL: 49.7, skus: 56, buyers: 66, bills: 567, margin: 28.1, st: 93.2, h1Pct: 50.2, retPct: 0.4, slow: 14, color: "#e34948" },
  { group: "Kids PU-A", key: "Kids PU-A", salesL: 471.9, qtyL: 48.7, skus: 39, buyers: 61, bills: 369, margin: 35.4, st: 98.6, h1Pct: 67.5, retPct: 0.2, slow: 8, color: "#b4b2a9" },
  { group: "Gents-A", key: "Gents-A", salesL: 286.5, qtyL: 18.3, skus: 30, buyers: 52, bills: 280, margin: 30.8, st: 93.8, h1Pct: 50.4, retPct: 0.1, slow: 5, color: "#7F77DD" },
  { group: "Girls PU-F", key: "Girls PU-F", salesL: 160.4, qtyL: 11.9, skus: 21, buyers: 36, bills: 150, margin: 12.9, st: 77.6, h1Pct: 5.3, retPct: 0.7, slow: 1, color: "#F472B6" },
  { group: "Girls PU-A", key: "Girls PU-A", salesL: 148.2, qtyL: 11.0, skus: 13, buyers: 47, bills: 212, margin: 32.4, st: 94.4, h1Pct: 66.5, retPct: 0.4, slow: 0, color: "#EC4899" },
  { group: "Toptrack Shoe", key: "Toptrack Shoe", salesL: 143.3, qtyL: 4.9, skus: 26, buyers: 24, bills: 86, margin: -36.9, st: 53.5, h1Pct: 21.5, retPct: 0.2, slow: 3, color: "#8B5CF6" },
  { group: "Kids Belly-A", key: "Kids Belly-A", salesL: 138.4, qtyL: 15.4, skus: 24, buyers: 35, bills: 128, margin: 24.5, st: 94.8, h1Pct: 6.4, retPct: 0.3, slow: 2, color: "#06B6D4" },
  { group: "Ladies Belly-A", key: "Ladies Belly-A", salesL: 119.0, qtyL: 8.3, skus: 31, buyers: 37, bills: 130, margin: 31.0, st: 106.6, h1Pct: 8.8, retPct: 0.5, slow: 0, color: "#14B8A6" },
  { group: "Ladies-FB", key: "Ladies-FB", salesL: 106.2, qtyL: 7.4, skus: 17, buyers: 29, bills: 104, margin: null, st: null, h1Pct: 38.1, retPct: null, slow: 2, color: "#F97316" },
  { group: "Wow Girls PU-F", key: "Wow Girls PU-F", salesL: 103.0, qtyL: 7.1, skus: 30, buyers: 21, bills: 74, margin: null, st: null, h1Pct: 0.0, retPct: null, slow: 0, color: "#D946EF" },
  { group: "Gents Casual-A", key: "Gents Casual-A", salesL: 96.8, qtyL: 7.0, skus: 11, buyers: 38, bills: 147, margin: null, st: null, h1Pct: 15.7, retPct: 0.1, slow: 0, color: "#78716C" },
  { group: "Toptrack Belly", key: "Toptrack Belly", salesL: 68.7, qtyL: 5.0, skus: 11, buyers: 27, bills: 81, margin: null, st: null, h1Pct: 0.0, retPct: 0.8, slow: 0, color: "#6366F1" },
  { group: "Wow Ladies PU-F", key: "Wow Ladies PU-F", salesL: 58.5, qtyL: 3.6, skus: 12, buyers: 18, bills: 66, margin: null, st: null, h1Pct: 0.0, retPct: 0.2, slow: 0, color: "#A855F7" },
  { group: "Boys PU-A", key: "Boys PU-A", salesL: 25.4, qtyL: 1.5, skus: 4, buyers: 17, bills: 32, margin: null, st: null, h1Pct: 93.4, retPct: 0.2, slow: 1, color: "#F43F5E" },
  { group: "Gents-FB", key: "Gents-FB", salesL: 22.1, qtyL: 1.3, skus: 9, buyers: 8, bills: 19, margin: null, st: null, h1Pct: 61.8, retPct: 2.5, slow: 2, color: "#84CC16" },
  { group: "Jeetlo", key: "Jeetlo", salesL: 5.7, qtyL: 0.3, skus: 9, buyers: 1, bills: 3, margin: null, st: null, h1Pct: 92.5, retPct: null, slow: 8, color: "#22D3EE" },
].map((g) => ({ ...g, avgPair: Math.round((g.salesL / Math.max(g.qtyL, 0.01)) * 100) }));

const SKUS = [
  { name: "CX-2210 COPPER 5X8 MRP-259#", group: "Ladies PU-A", salesL: 183.5, qtyK: 12.3, avgPair: 149, buyers: 36, bills: 274, h1Pct: 37.4, mrp: 259 },
  { name: "WV 2101 GRAPE 4X8 MRP-184#", group: "Ladies PU-F", salesL: 119.1, qtyK: 11.0, avgPair: 108, buyers: 46, bills: 168, h1Pct: 7.3, mrp: 184 },
  { name: "GS7722 BLU/RED 6X9 MRP-309#", group: "Gents PU-F", salesL: 108.9, qtyK: 6.1, avgPair: 179, buyers: 35, bills: 160, h1Pct: 71.6, mrp: 309 },
  { name: "WV 2101 PEACH 4X8 MRP-184#", group: "Ladies PU-F", salesL: 100.5, qtyK: 9.3, avgPair: 108, buyers: 38, bills: 137, h1Pct: 18.0, mrp: 184 },
  { name: "GS7722 BLU/RED 1X3 MRP-269#", group: "Boys PU-F", salesL: 95.0, qtyK: 6.1, avgPair: 156, buyers: 37, bills: 143, h1Pct: 60.6, mrp: 269 },
  { name: "CX-2220 COPPER 4X8 MRP-259#", group: "Ladies PU-A", salesL: 93.9, qtyK: 6.3, avgPair: 149, buyers: 24, bills: 142, h1Pct: 57.7, mrp: 259 },
  { name: "GS7722 BLU/RED 11X13 MRP-249#", group: "Kids PU-F", salesL: 82.0, qtyK: 5.7, avgPair: 144, buyers: 31, bills: 130, h1Pct: 63.8, mrp: 249 },
  { name: "GS-7722 BLU/RED 4X5 MRP-289#", group: "Boys PU-F", salesL: 78.9, qtyK: 4.7, avgPair: 167, buyers: 31, bills: 111, h1Pct: 71.4, mrp: 289 },
  { name: "GS7722 BLU/RED 5X10 MRP-229#", group: "Kids PU-F", salesL: 74.1, qtyK: 5.6, avgPair: 133, buyers: 32, bills: 75, h1Pct: 82.8, mrp: 229 },
  { name: "FK-10 PINK BABY 2X5 MRP-139", group: "Kids PU-A", salesL: 67.2, qtyK: 8.2, avgPair: 82, buyers: 31, bills: 83, h1Pct: 62.3, mrp: 139 },
  { name: "LFC 101 BLUE 4X8 MRP-219#", group: "Ladies PU-A", salesL: 65.0, qtyK: 5.1, avgPair: 128, buyers: 32, bills: 106, h1Pct: 55.8, mrp: 219 },
  { name: "GS 7722 BLU/WHT 5X10 MRP-229#", group: "Kids PU-F", salesL: 64.3, qtyK: 4.8, avgPair: 134, buyers: 28, bills: 69, h1Pct: 68.4, mrp: 229 },
  { name: "CX2206 COPPER 4X8 MRP-259#", group: "Ladies PU-A", salesL: 62.8, qtyK: 4.2, avgPair: 150, buyers: 23, bills: 101, h1Pct: 68.7, mrp: 259 },
  { name: "GS7722 BLU/WHT 6X9 MRP-309#", group: "Gents PU-F", salesL: 61.0, qtyK: 3.4, avgPair: 180, buyers: 29, bills: 88, h1Pct: 87.5, mrp: 309 },
  { name: "GS 7731 BLUE [6/9] MRP 299#", group: "Gents PU-F", salesL: 60.6, qtyK: 3.5, avgPair: 173, buyers: 29, bills: 102, h1Pct: 73.3, mrp: 299 },
  { name: "GS7722 BLU/WHT 1X3 MRP-269#", group: "Boys PU-F", salesL: 58.9, qtyK: 3.7, avgPair: 157, buyers: 28, bills: 88, h1Pct: 62.1, mrp: 269 },
  { name: "CX 2213 COPPER [4/8] MRP 269#", group: "Ladies PU-A", salesL: 58.4, qtyK: 3.8, avgPair: 153, buyers: 15, bills: 95, h1Pct: 55.6, mrp: 269 },
  { name: "FK-10 RED BABY 2X5 MRP-139", group: "Kids PU-A", salesL: 58.3, qtyK: 7.1, avgPair: 82, buyers: 27, bills: 73, h1Pct: 61.1, mrp: 139 },
  { name: "CX 2207 CHERRY [4/8] MRP 259", group: "Ladies PU-A", salesL: 55.5, qtyK: 3.7, avgPair: 150, buyers: 27, bills: 93, h1Pct: 62.1, mrp: 259 },
  { name: "GS-7740 BLUE 6X9 MRP-269*", group: "Gents PU-F", salesL: 47.9, qtyK: 3.1, avgPair: 155, buyers: 24, bills: 78, h1Pct: 81.5, mrp: 269 },
];

const MONTHS = ["Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar"];
const MOM_SERIES = [
  { name: "Kids PU-F", data: [109.8, 102.9, 91.4, 55.1, 107.2, 152.5, 73.0, 19.7, 34.1, 49.0, 137.6, 315.6], color: "#2a78d6" },
  { name: "Ladies PU-A", data: [87.1, 68.6, 70.3, 96.9, 115.8, 141.2, 109.3, 66.5, 57.6, 60.9, 113.9, 182.7], color: "#1baf7a" },
  { name: "Ladies PU-F", data: [34.8, 14.5, 18.2, 19.1, 35.9, 76.6, 100.7, 114.7, 145.2, 101.9, 124.2, 121.5], color: "#eda100" },
  { name: "Gents PU-F", data: [92.6, 72.7, 64.5, 66.8, 73.9, 74.1, 41.9, 49.0, 61.2, 71.2, 99.6, 120.8], color: "#4a3aa7", dash: 4 },
  { name: "Boys PU-F", data: [101.5, 59.8, 53.2, 37.2, 50.8, 83.1, 59.4, 21.4, 23.2, 41.1, 71.8, 165.8], color: "#e34948", dash: 3 },
  { name: "Kids PU-A", data: [36.7, 32.4, 34.2, 39.3, 77.2, 98.9, 22.4, 14.1, 15.9, 9.7, 27.6, 63.5], color: "#b4b2a9" },
];

const ITEM_GROUP_OPTIONS = ["Kids PU-F", "Ladies PU-A", "Ladies PU-F", "Gents PU-F", "Boys PU-F", "Kids PU-A"];
const FY_OPTIONS = [
  { key: "fy25", label: "FY 24-25 (actual)", factor: 1, tone: "FY25 actual" },
  { key: "fy26", label: "FY 25-26 (dummy +10%)", factor: 1.1, tone: "FY26 +10%" },
  { key: "fy27", label: "FY 26-27 (dummy +23%)", factor: 1.23, tone: "FY27 +23%" },
];
const MRP_OPTIONS = [
  { key: "all", label: "All" },
  { key: "budget", label: "Budget ₹100-200", test: (m) => m >= 100 && m < 200 },
  { key: "core", label: "Core ₹200-250", test: (m) => m >= 200 && m < 250 },
  { key: "coreplus", label: "Core+ ₹250-300", test: (m) => m >= 250 && m < 300 },
  { key: "premium", label: "Premium ₹300+", test: (m) => m >= 300 },
];
const SEASON_OPTIONS = [
  { key: "all", label: "All" },
  { key: "h1heavy", label: "H1-Heavy (>60% sales Apr-Sep)" },
  { key: "h2heavy", label: "H2-Heavy (>60% sales Oct-Mar)" },
  { key: "balanced", label: "Balanced" },
];
const STATUS_OPTIONS = [
  { key: "all", label: "All" },
  { key: "stars", label: "Stars (top 20% share)" },
  { key: "slow", label: "Slow movers (101 SKUs with no Oct-Mar sale)" },
  { key: "declining", label: "Declining (high return rate)" },
];

const BAND_COLORS = ["#eda100", "#85B7EB", "#2a78d6", "#4a3aa7"];
const moneyL = (v) => {
  const n = Number(v) || 0;
  return n >= 100 ? `₹${(n / 100).toFixed(2)} Cr` : `₹${n.toFixed(1)} L`;
};
const pairL = (v) => `${(Number(v) || 0).toFixed(1)} L`;
const pct = (v) => `${Number(v || 0).toFixed(1)}%`;
const groupByName = new Map(GROUPS.map((g) => [g.group, g]));
const seasonMatch = (value, mode) => mode === "all" || (mode === "h1heavy" ? value > 60 : mode === "h2heavy" ? value < 40 : value >= 40 && value <= 60);
const halfFactor = (row, half) => half === "H1" ? row.h1Pct / 100 : half === "H2" ? (100 - row.h1Pct) / 100 : 1;
const statusMatch = (row, mode, starSet) => mode === "all" || (mode === "stars" ? starSet.has(row.group) : mode === "slow" ? row.slow > 0 : Number(row.retPct || 0) > 1);
const skuStatusMatch = (sku, mode, starSkuSet) => {
  const group = groupByName.get(sku.group);
  if (mode === "all") return true;
  if (mode === "stars") return starSkuSet.has(sku.name);
  if (mode === "slow") return Number(group?.slow || 0) > 0;
  return Number(group?.retPct || 0) > 1;
};
const mrpMatch = (mrp, mode) => {
  const option = MRP_OPTIONS.find((x) => x.key === mode);
  return !option?.test || option.test(mrp);
};

function Chip({ active, onClick, children, color }) {
  return (
    <button type="button" className={`pa-chip ${active ? "is-active" : ""}`} style={color ? { "--pa-chip": color } : undefined} onClick={onClick}>
      {children}
    </button>
  );
}

function Select({ value, onChange, options, label }) {
  return (
    <label className="pa-select-label">
      <span>{label}</span>
      <select className="pa-select" value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}
      </select>
    </label>
  );
}

function FilterGroup({ label, children }) {
  return (
    <div className="pa-filter-group">
      <div className="pa-slicer-label">{label}</div>
      <div className="pa-filter-options">{children}</div>
    </div>
  );
}

function EmptyState({ title = "No products match these filters", body = "Try widening the MRP, season, or status selection.", onReset }) {
  return (
    <div className="pa-empty-state" role="status">
      <div>
        <strong>{title}</strong>
        <p>{body}</p>
      </div>
      <button type="button" className="pa-reset-btn" onClick={onReset}>Reset filters</button>
    </div>
  );
}

function Apex({ options, series, type, height }) {
  if (!series?.length) return <div className="empty">No data for current filters</div>;
  return <div className="chart-frame apex-frame"><ReactApexChart options={options} series={series} type={type} height={height} /></div>;
}

function baseOptions(extra = {}) {
  return {
    chart: { toolbar: { show: false }, background: "transparent", fontFamily: "Inter, system-ui, sans-serif", animations: { enabled: true, speed: 240 } },
    dataLabels: { enabled: false },
    legend: { show: false },
    grid: { borderColor: "#e1e0d9", strokeDashArray: 3 },
    tooltip: { theme: "light" },
    ...extra,
  };
}

function GroupTrendChart({ rows }) {
  const top = [...rows].sort((a, b) => b.displaySalesL - a.displaySalesL).slice(0, 8);
  const options = baseOptions({
    chart: { ...baseOptions().chart, type: "bar" },
    plotOptions: { bar: { columnWidth: "70%", borderRadius: 2 } },
    colors: ["#B5D4F4", "#85B7EB", "#2a78d6"],
    xaxis: { categories: top.map((g) => g.group), labels: { rotate: -30, style: { colors: "#898781", fontSize: "8px" } } },
    yaxis: { labels: { formatter: moneyL, style: { colors: "#898781", fontSize: "9px" } } },
    tooltip: { y: { formatter: moneyL } },
  });
  const base = top.map((g) => g.displaySalesL);
  return <Apex type="bar" height={190} options={options} series={[{ name: "FY25", data: base }, { name: "FY26", data: base.map((v) => +(v * 1.1).toFixed(1)) }, { name: "FY27", data: base.map((v) => +(v * 1.23).toFixed(1)) }]} />;
}

function MomChart({ group }) {
  const selected = group === "all" ? MOM_SERIES : MOM_SERIES.filter((s) => s.name === group);
  const options = baseOptions({
    chart: { ...baseOptions().chart, type: "line" },
    colors: selected.map((s) => s.color),
    stroke: { curve: "smooth", width: 2, dashArray: selected.map((s) => s.dash || 0) },
    markers: { size: 2 },
    xaxis: { categories: MONTHS, labels: { style: { colors: "#898781", fontSize: "9px" } } },
    yaxis: { labels: { formatter: moneyL, style: { colors: "#898781", fontSize: "9px" } } },
    tooltip: { y: { formatter: moneyL } },
  });
  return <Apex type="line" height={190} options={options} series={selected.map((s) => ({ name: s.name, data: s.data }))} />;
}

function SeasonChart({ rows }) {
  const top = [...rows].sort((a, b) => b.salesL - a.salesL).slice(0, 10);
  const options = baseOptions({
    chart: { ...baseOptions().chart, type: "bar", stacked: true },
    plotOptions: { bar: { columnWidth: "70%", borderRadius: 2 } },
    colors: ["#85B7EB", "#2a78d6"],
    xaxis: { categories: top.map((g) => g.group), labels: { rotate: -35, style: { colors: "#898781", fontSize: "8px" } } },
    yaxis: { min: 0, max: 105, labels: { formatter: (v) => `${v}%`, style: { colors: "#898781", fontSize: "9px" } } },
    tooltip: { y: { formatter: pct } },
  });
  return <Apex type="bar" height={200} options={options} series={[{ name: "H1 Apr-Sep", data: top.map((g) => g.h1Pct) }, { name: "H2 Oct-Mar", data: top.map((g) => +(100 - g.h1Pct).toFixed(1)) }]} />;
}

function MrpDonut({ skus }) {
  const rows = MRP_OPTIONS.filter((b) => b.key !== "all").map((band) => ({
    label: band.label,
    value: skus.filter((s) => band.test(s.mrp)).reduce((sum, s) => sum + s.displaySalesL, 0),
  }));
  const options = baseOptions({
    chart: { ...baseOptions().chart, type: "donut" },
    labels: rows.map((r) => r.label),
    colors: BAND_COLORS,
    plotOptions: { pie: { donut: { size: "60%" } } },
    stroke: { width: 2, colors: ["#fff"] },
    tooltip: { y: { formatter: moneyL } },
  });
  return <Apex type="donut" height={200} options={options} series={rows.map((r) => +r.value.toFixed(1))} />;
}

function HorizontalBar({ rows, valueKey, formatter, colorFn, min = undefined, height = 170 }) {
  const sorted = [...rows].filter((g) => g[valueKey] != null).sort((a, b) => Number(b[valueKey]) - Number(a[valueKey])).slice(0, 10);
  const options = baseOptions({
    chart: { ...baseOptions().chart, type: "bar" },
    plotOptions: { bar: { horizontal: true, barHeight: "66%", borderRadius: 3, distributed: true } },
    colors: sorted.map(colorFn),
    xaxis: { min, categories: sorted.map((g) => g.group), labels: { formatter, style: { colors: "#898781", fontSize: "9px" } } },
    yaxis: { labels: { style: { colors: "#898781", fontSize: "8px" } } },
    tooltip: { y: { formatter } },
  });
  return <Apex type="bar" height={height} options={options} series={[{ name: "Value", data: sorted.map((g) => g[valueKey]) }]} />;
}

function BubbleChart({ rows }) {
  const totalQty = rows.reduce((s, g) => s + g.displayQtyL, 0) || 1;
  const totalSales = rows.reduce((s, g) => s + g.displaySalesL, 0) || 1;
  const top = [...rows].sort((a, b) => b.displaySalesL - a.displaySalesL).slice(0, 10);
  const options = baseOptions({
    chart: { ...baseOptions().chart, type: "bubble" },
    colors: top.map((g) => g.color),
    fill: { opacity: 0.78 },
    xaxis: { title: { text: "Volume share %", style: { color: "#898781", fontSize: "9px" } }, labels: { formatter: (v) => `${Math.round(v)}%`, style: { colors: "#898781", fontSize: "9px" } } },
    yaxis: { title: { text: "Revenue share %", style: { color: "#898781", fontSize: "9px" } }, labels: { formatter: (v) => `${Math.round(v)}%`, style: { colors: "#898781", fontSize: "9px" } } },
    tooltip: { custom: ({ seriesIndex, w }) => { const d = w.config.series[seriesIndex]; const p = d.data[0]; return `<div style="padding:6px 8px;font-size:12px"><b>${d.name}</b><br/>vol ${p.x}% rev ${p.y}%<br/>₹${p.price}/pair</div>`; } },
  });
  const series = top.map((g) => ({ name: g.group, data: [{ x: +((g.displayQtyL / totalQty) * 100).toFixed(1), y: +((g.displaySalesL / totalSales) * 100).toFixed(1), z: Math.max(6, Math.min(28, g.avgPair / 8)), price: g.avgPair }] }));
  return <Apex type="bubble" height={200} options={options} series={series} />;
}

function Tag({ children, tone = "neutral" }) {
  return <span className={`pa-tag pa-tag-${tone}`}>{children}</span>;
}

function GroupTable({ rows, sort, setSort, onReset }) {
  const sorted = [...rows].sort((a, b) => Number(b[sort] || 0) - Number(a[sort] || 0));
  const max = Math.max(...sorted.map((g) => g.displaySalesL), 1);
  return (
    <Card title={`Item group detail - ${sorted.length} groups · FY25 actual`} sub="Filtered by Item Group, MRP Band, Season, Status, FY and half-year selectors">
      <div className="pa-table-head">
        <Select label="Sort" value={sort} onChange={setSort} options={[{ key: "displaySalesL", label: "Revenue" }, { key: "margin", label: "Gross margin %" }, { key: "st", label: "Sell-through %" }, { key: "h1Pct", label: "H1 %" }, { key: "retPct", label: "Return rate" }, { key: "slow", label: "Slow movers" }]} />
      </div>
      {!sorted.length && <EmptyState onReset={onReset} />}
      <div className="table-wrap pa-table-wrap">
        <table>
          <thead><tr><th>#</th><th>Item group</th><th>FY25 ₹</th><th>FY26 ₹</th><th>Share</th><th>Pairs</th><th>₹/pair</th><th>SKUs</th><th>Buyers</th><th>Margin%</th><th>ST%</th><th>H1/H2</th><th>Ret%</th><th>Slow</th><th>Signal</th></tr></thead>
          <tbody>
            {sorted.map((g, i) => {
              const signal = g.margin != null && g.margin < 0 ? ["Loss", "red"] : g.st > 95 ? ["Star", "green"] : g.slow > 10 ? ["Slow SKUs", "amber"] : Number(g.retPct || 0) > 1 ? ["Returns", "amber"] : ["Stable", "neutral"];
              return (
                <tr key={g.group}>
                  <td>{i + 1}</td>
                  <td><span className="strong" style={{ color: g.color }}>{g.group}</span></td>
                  <td><span className="pa-bar-cell"><span className="pa-mini-bar"><span style={{ width: `${Math.max(2, (g.displaySalesL / max) * 100)}%`, background: g.color }} /></span>{moneyL(g.displaySalesL)}</span></td>
                  <td>{moneyL(g.salesL * 1.1 * g.halfFactor * g.mrpCoverage)}</td>
                  <td>{pct(g.sharePct)}</td>
                  <td>{pairL(g.displayQtyL)}</td>
                  <td>₹{g.avgPair}</td>
                  <td>{Math.round(g.skus * g.mrpCoverage)}</td>
                  <td>{g.buyers}</td>
                  <td className={g.margin < 0 ? "pa-red" : g.margin > 30 ? "pa-green" : ""}>{g.margin != null ? pct(g.margin) : "-"}</td>
                  <td className={g.st > 95 ? "pa-green" : g.st < 80 ? "pa-red" : ""}>{g.st != null ? pct(g.st) : "-"}</td>
                  <td><span className="pa-h1h2"><span style={{ flex: g.h1Pct }} /><b style={{ flex: 100 - g.h1Pct }} /></span><small>H1:{Math.round(g.h1Pct)}%</small></td>
                  <td className={g.retPct > 1 ? "pa-red" : ""}>{g.retPct != null ? pct(g.retPct) : "-"}</td>
                  <td className={g.slow > 10 ? "pa-red" : g.slow > 5 ? "pa-amber" : ""}>{g.slow}</td>
                  <td><Tag tone={signal[1]}>{signal[0]}</Tag></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function SkuTable({ rows, onReset }) {
  const sorted = [...rows].sort((a, b) => b.displaySalesL - a.displaySalesL).slice(0, 20);
  const max = Math.max(...sorted.map((s) => s.displaySalesL), 1);
  return (
    <Card title={`Top ${sorted.length} SKUs · filtered view`} sub="Filtered by slicers above">
      {!sorted.length && <EmptyState title="No SKUs match these filters" body="The group may still have revenue, but no listed top SKU fits the current MRP, season, and status combination." onReset={onReset} />}
      <div className="table-wrap pa-table-wrap">
        <table>
          <thead><tr><th>#</th><th>SKU name</th><th>Group</th><th>Revenue</th><th>Pairs</th><th>₹/pair</th><th>Buyers</th><th>Bills</th><th>H1%</th><th>Share%</th><th>Zone</th></tr></thead>
          <tbody>
            {sorted.map((s, i) => {
              const group = groupByName.get(s.group);
              const zone = s.displaySalesL >= 100 ? ["Core", "green"] : s.displaySalesL >= 50 ? ["Support", "blue"] : ["Tail", "neutral"];
              return (
                <tr key={s.name}>
                  <td>{i + 1}</td>
                  <td><span className="strong">{s.name}</span></td>
                  <td style={{ color: group?.color }}>{s.group}</td>
                  <td><span className="pa-bar-cell"><span className="pa-mini-bar"><span style={{ width: `${Math.max(2, (s.displaySalesL / max) * 100)}%`, background: group?.color || "#2a78d6" }} /></span>{moneyL(s.displaySalesL)}</span></td>
                  <td>{`${s.displayQtyK.toFixed(1)}K`}</td>
                  <td>₹{s.avgPair}</td>
                  <td>{s.buyers}</td>
                  <td>{s.bills}</td>
                  <td className={s.h1Pct < 25 ? "pa-red" : s.h1Pct > 75 ? "pa-green" : ""}>{Math.round(s.h1Pct)}%</td>
                  <td>{pct(s.sharePct)}</td>
                  <td><Tag tone={zone[1]}>{zone[0]}</Tag></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

export function ProductAnalysisView() {
  const [fy, setFy] = useState("fy25");
  const [half, setHalf] = useState("all");
  const [group, setGroup] = useState("all");
  const [mrp, setMrp] = useState("all");
  const [season, setSeason] = useState("all");
  const [status, setStatus] = useState("all");
  const [sort, setSort] = useState("displaySalesL");
  const [filtersOpen, setFiltersOpen] = useState(false);

  const resetFilters = () => {
    setFy("fy25");
    setHalf("all");
    setGroup("all");
    setMrp("all");
    setSeason("all");
    setStatus("all");
    setFiltersOpen(false);
  };

  const fyOption = FY_OPTIONS.find((x) => x.key === fy) || FY_OPTIONS[0];
  const totalBaseSales = GROUPS.reduce((s, g) => s + g.salesL, 0);
  const groupStarSet = useMemo(() => new Set([...GROUPS].sort((a, b) => b.salesL - a.salesL).slice(0, Math.ceil(GROUPS.length * 0.2)).map((g) => g.group)), []);
  const skuStarSet = useMemo(() => new Set([...SKUS].sort((a, b) => b.salesL - a.salesL).slice(0, Math.ceil(SKUS.length * 0.2)).map((s) => s.name)), []);

  const filteredSkus = useMemo(() => {
    const rows = SKUS.filter((s) => (group === "all" || s.group === group) && mrpMatch(s.mrp, mrp) && seasonMatch(s.h1Pct, season) && skuStatusMatch(s, status, skuStarSet));
    const total = rows.reduce((sum, s) => sum + s.salesL * fyOption.factor * (half === "H1" ? s.h1Pct / 100 : half === "H2" ? (100 - s.h1Pct) / 100 : 1), 0) || 1;
    return rows.map((s) => {
      const hf = half === "H1" ? s.h1Pct / 100 : half === "H2" ? (100 - s.h1Pct) / 100 : 1;
      return { ...s, displaySalesL: s.salesL * fyOption.factor * hf, displayQtyK: s.qtyK * fyOption.factor * hf, sharePct: ((s.salesL * fyOption.factor * hf) / total) * 100 };
    });
  }, [group, mrp, season, status, skuStarSet, fyOption.factor, half]);

  const filteredGroups = useMemo(() => {
    const skuByGroup = new Map();
    for (const s of SKUS) {
      if (!mrpMatch(s.mrp, mrp)) continue;
      skuByGroup.set(s.group, (skuByGroup.get(s.group) || 0) + s.salesL);
    }
    const allSkuByGroup = new Map();
    for (const s of SKUS) allSkuByGroup.set(s.group, (allSkuByGroup.get(s.group) || 0) + s.salesL);
    const rows = GROUPS.filter((g) => (group === "all" || g.group === group) && seasonMatch(g.h1Pct, season) && statusMatch(g, status, groupStarSet)).map((g) => {
      const coverage = mrp === "all" ? 1 : Math.min(1, (skuByGroup.get(g.group) || 0) / Math.max(allSkuByGroup.get(g.group) || 0, 1));
      return { ...g, mrpCoverage: coverage };
    }).filter((g) => g.mrpCoverage > 0);
    const total = rows.reduce((sum, g) => sum + g.salesL * fyOption.factor * halfFactor(g, half) * g.mrpCoverage, 0) || 1;
    return rows.map((g) => {
      const hf = halfFactor(g, half);
      const displaySalesL = g.salesL * fyOption.factor * hf * g.mrpCoverage;
      return { ...g, halfFactor: hf, displaySalesL, displayQtyL: g.qtyL * fyOption.factor * hf * g.mrpCoverage, sharePct: (displaySalesL / total) * 100 };
    });
  }, [group, mrp, season, status, groupStarSet, fyOption.factor, half]);

  const kpi = useMemo(() => {
    const sales = filteredGroups.reduce((s, g) => s + g.displaySalesL, 0);
    const qty = filteredGroups.reduce((s, g) => s + g.displayQtyL, 0);
    const skus = filteredGroups.reduce((s, g) => s + Math.round(g.skus * g.mrpCoverage), 0);
    const slow = filteredGroups.reduce((s, g) => s + g.slow, 0);
    const topGroup = [...filteredGroups].sort((a, b) => b.displaySalesL - a.displaySalesL)[0];
    const bestMargin = [...filteredGroups].filter((g) => g.margin != null).sort((a, b) => b.margin - a.margin)[0];
    return { sales, qty, skus, slow, topGroup, bestMargin, avgPair: qty ? Math.round((sales / qty) * 100) : 0 };
  }, [filteredGroups]);
  const hasActiveFilters = fy !== "fy25" || half !== "all" || group !== "all" || mrp !== "all" || season !== "all" || status !== "all";

  return (
    <div className="ig-wrap pa-dashboard">
      <div className="ceo-header-row pa-topbar">
        <SectionHead code="PA" title="Product Analysis Dashboard" sub="MLH Gobongo Pvt. Ltd. · FY 2024-25 actual · 652 SKUs · 24 item groups · excl. Milon Shoe House" />
        <div className="pa-top-selects">
          <Select label="FY" value={fy} onChange={setFy} options={FY_OPTIONS} />
          <Select label="Half" value={half} onChange={setHalf} options={[{ key: "all", label: "Full Year" }, { key: "H1", label: "H1 Apr-Sep" }, { key: "H2", label: "H2 Oct-Mar" }]} />
        </div>
      </div>

      <div className="pa-filter-toolbar">
        <button type="button" className="pa-filter-toggle" aria-expanded={filtersOpen} aria-controls="pa-filter-panel" onClick={() => setFiltersOpen((open) => !open)}>
          Filters
          {hasActiveFilters && <span>{[fy !== "fy25", half !== "all", group !== "all", mrp !== "all", season !== "all", status !== "all"].filter(Boolean).length}</span>}
        </button>
        {hasActiveFilters && <button type="button" className="pa-reset-btn pa-reset-inline" onClick={resetFilters}>Reset filters</button>}
      </div>

      <div className={`pa-slicer-bar ${filtersOpen ? "is-open" : ""}`} id="pa-filter-panel">
        <div className="pa-filter-section">
          <div className="pa-filter-section-title">Scope</div>
          <FilterGroup label="Item Group">
            <Chip active={group === "all"} onClick={() => setGroup("all")}>All Groups</Chip>
            {ITEM_GROUP_OPTIONS.map((name) => <Chip key={name} color={groupByName.get(name)?.color} active={group === name} onClick={() => setGroup(name)}>{name}</Chip>)}
          </FilterGroup>
        </div>
        <div className="pa-filter-section">
          <div className="pa-filter-section-title">Analysis</div>
          <FilterGroup label="MRP Band">
            {MRP_OPTIONS.map((x) => <Chip key={x.key} active={mrp === x.key} onClick={() => setMrp(x.key)}>{x.label}</Chip>)}
          </FilterGroup>
          <FilterGroup label="Season">
            {SEASON_OPTIONS.map((x) => <Chip key={x.key} active={season === x.key} onClick={() => setSeason(x.key)}>{x.label}</Chip>)}
          </FilterGroup>
          <FilterGroup label="Status">
            {STATUS_OPTIONS.map((x) => <Chip key={x.key} active={status === x.key} onClick={() => setStatus(x.key)}>{x.label}</Chip>)}
          </FilterGroup>
        </div>
      </div>

      <div className="kpi-grid ca-kpi-grid">
        <KpiCard label="Total revenue (filtered)" value={moneyL(kpi.sales)} delta={fyOption.tone} deltaTone="neu" context={`${kpi.skus} SKUs · ${filteredGroups.length} groups`} />
        <KpiCard label="Total pairs sold" value={pairL(kpi.qty)} delta={`avg ₹${kpi.avgPair}/pair`} deltaTone="neu" context={half === "all" ? "Full Year" : half} />
        <KpiCard label="Active SKUs" value={String(kpi.skus)} delta={`${kpi.slow} slow movers`} deltaTone="dn" context={`${Math.round((kpi.slow / Math.max(kpi.skus, 1)) * 100)}% stagnant`} />
        <KpiCard label="Top group" value={kpi.topGroup?.group || "-"} delta={kpi.topGroup ? `${moneyL(kpi.topGroup.displaySalesL)} · ${pct(kpi.topGroup.sharePct)}` : null} deltaTone="up" context={kpi.topGroup?.st ? `${pct(kpi.topGroup.st)} sell-through` : undefined} />
        <KpiCard label="Best gross margin" value={kpi.bestMargin?.margin != null ? pct(kpi.bestMargin.margin) : "-"} delta={kpi.bestMargin?.group || null} deltaTone="up" context="highest margin group" />
        <KpiCard label="SKUs to reach 80%" value="237" delta="36% of catalogue" deltaTone="dn" context="of 652 total SKUs" />
      </div>

      <div className="pa-insights">
        <span>Ladies PU-F has 21.9% H1, the bar is nearly all blue/H2, needs September stocking.</span>
        <span>Toptrack Shoe is the negative gross-margin outlier at -36.9%.</span>
        <span>Ladies Belly-A sell-through is 106.6%, strongest in the group chart.</span>
      </div>

      <div className="ceo-grid2">
        <Card title="Revenue by item group - 3-year trend (top 8)" sub="₹L · FY25 actual · FY26-27 dummy"><GroupTrendChart rows={filteredGroups} /></Card>
        <Card title="MoM revenue - top 6 groups · FY25 actual" sub="₹L · line per group"><MomChart group={group} /></Card>
      </div>

      <div className="ceo-grid2">
        <Card title="H1 vs H2 seasonality - all groups · FY25 actual" sub="H1 = Apr-Sep · H2 = Oct-Mar"><SeasonChart rows={filteredGroups} /></Card>
        <Card title="MRP band revenue mix - FY25 actual" sub="Budget ₹100-200 · Core ₹200-250 · Core+ ₹250-300 · Premium ₹300+"><MrpDonut skus={filteredSkus.length ? filteredSkus : SKUS.map((s) => ({ ...s, displaySalesL: s.salesL }))} /></Card>
      </div>

      <div className="ceo-grid3">
        <Card title="Gross margin % by group" sub="FY25 actual · sale minus purchase cost"><HorizontalBar rows={filteredGroups} valueKey="margin" formatter={(v) => `${Math.round(v)}%`} colorFn={(g) => g.margin < 0 ? "#e34948" : g.margin > 30 ? "#1baf7a" : "#85B7EB"} /></Card>
        <Card title="Sell-through rate by group" sub="pairs sold divided by pairs purchased"><HorizontalBar rows={filteredGroups} valueKey="st" formatter={(v) => `${Math.round(v)}%`} colorFn={(g) => g.st > 95 ? "#1baf7a" : g.st > 80 ? "#eda100" : "#e34948"} min={40} /></Card>
        <Card title="Slow movers by group" sub="no sale after Oct 2024 · 101 total"><HorizontalBar rows={filteredGroups.filter((g) => g.slow > 0)} valueKey="slow" formatter={(v) => `${Math.round(v)}`} colorFn={(g) => g.slow > 12 ? "#e34948" : g.slow > 6 ? "#eda100" : "#85B7EB"} /></Card>
      </div>

      <div className="ceo-grid2">
        <Card title="Volume vs value bubble - FY25 actual" sub="X = pair volume share · Y = revenue share · bubble = avg ₹/pair"><BubbleChart rows={filteredGroups} /></Card>
        <Card title="Return rate by group · FY25 actual" sub="sales returns divided by gross sales %"><HorizontalBar rows={filteredGroups.filter((g) => Number(g.retPct || 0) > 0)} valueKey="retPct" formatter={(v) => `${Number(v).toFixed(1)}%`} colorFn={(g) => g.retPct > 1.5 ? "#e34948" : g.retPct > 0.7 ? "#eda100" : "#1baf7a"} height={200} /></Card>
      </div>

      <GroupTable rows={filteredGroups} sort={sort} setSort={setSort} onReset={resetFilters} />
      <SkuTable rows={filteredSkus} onReset={resetFilters} />

      <div className="pa-disclaimer">FY25 actual from Busy export · FY26-27 dummy · Milon Shoe House excluded · Gross margin = (sales minus purchase cost) divided by sales · Sell-through = qty sold divided by qty purchased · Base FY25 revenue {moneyL(totalBaseSales)}</div>
    </div>
  );
}
