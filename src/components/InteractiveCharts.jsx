import React, { useEffect, useMemo, useRef, useState } from "react";
import { createChartWindow, panChartWindow, zoomChartWindow } from "../chartWindow.js";
import { ChartControls } from "./ChartControls.jsx";

const COLORS = ["#1976d2", "#2fd083", "#f14f64", "#f6a343", "#6d6ff2", "#20a6b8", "#7c5cff", "#ff9b54", "#98a2b3", "#0f766e"];

function money(value) {
  return `INR ${((Number(value) || 0) / 100000).toLocaleString("en-IN", { maximumFractionDigits: 2 })}L`;
}

function pct(part, total) {
  return total ? `${((part / total) * 100).toFixed(1)}%` : "0.0%";
}

export function BarChart({ rows }) {
  const [visibleCount, setVisibleCount] = useState(Math.min(8, rows.length));
  const [active, setActive] = useState(null);
  useEffect(() => setVisibleCount(Math.min(8, rows.length)), [rows.length]);
  if (!rows.length) return <div className="empty">No data for current filters</div>;
  const visibleRows = rows.slice(0, visibleCount);
  const max = Math.max(...rows.map((row) => Math.abs(row[1])), 1);
  const reset = () => setVisibleCount(Math.min(8, rows.length));
  return (
    <div className="chart-frame" role="img" aria-label={`Ranked bar chart with ${rows.length} values`}>
      {rows.length > 8 ? (
        <ChartControls
          canZoomIn={visibleCount > 4}
          canZoomOut={visibleCount < rows.length}
          onZoomIn={() => setVisibleCount((count) => Math.max(4, count - 2))}
          onZoomOut={() => setVisibleCount((count) => Math.min(rows.length, count + 2))}
          onReset={reset}
        />
      ) : null}
      <div className="bar-chart">
        {visibleRows.map(([label, value], index) => (
          <div
            className={`bar-row ${active === index ? "is-active" : ""}`}
            key={`${label}-${index}`}
            tabIndex="0"
            onMouseEnter={() => setActive(index)}
            onMouseLeave={() => setActive(null)}
            onFocus={() => setActive(index)}
            onBlur={() => setActive(null)}
            aria-label={`${label}: ${money(value)}`}
          >
            <div className="bar-label" title={label}>{label}</div>
            <div className="bar-track">
              <div className="bar-fill" style={{ width: `${Math.max(1, Math.abs(value) / max * 100)}%`, background: COLORS[index % COLORS.length] }} />
            </div>
            <div className="bar-value">{money(value)}</div>
            {active === index ? <div className="chart-tooltip bar-tooltip">{label}<strong>{money(value)}</strong></div> : null}
          </div>
        ))}
      </div>
    </div>
  );
}

function polarPoint(cx, cy, radius, angle) {
  const radians = Math.PI * angle / 180;
  return [cx + radius * Math.cos(radians), cy + radius * Math.sin(radians)];
}

export function DonutChart({ rows }) {
  const [active, setActive] = useState(null);
  if (!rows.length) return <div className="empty">No data for current filters</div>;
  const shown = rows.slice(0, 8);
  const total = shown.reduce((acc, row) => acc + Math.abs(row[1]), 0) || 1;
  let start = -90;
  const slices = shown.map(([label, value], index) => {
    const angle = Math.abs(value) / total * 360;
    const end = start + Math.min(angle, 359.999);
    const [sx, sy] = polarPoint(145, 124, 82, start);
    const [ex, ey] = polarPoint(145, 124, 82, end);
    const path = `M 145 124 L ${sx} ${sy} A 82 82 0 ${angle > 180 ? 1 : 0} 1 ${ex} ${ey} Z`;
    start += angle;
    return { label, value, index, path };
  });
  const activeRow = active === null ? null : shown[active];
  return (
    <div className="chart-frame donut-frame">
      <svg className="donut-svg" viewBox="0 0 620 250" role="img" aria-label={`Donut chart showing ${shown.length} categories with a total of ${money(total)}`}>
        {slices.map((slice) => (
          <path
            key={slice.label}
            d={slice.path}
            className={`donut-slice ${active === slice.index ? "is-active" : ""}`}
            fill={COLORS[slice.index % COLORS.length]}
            tabIndex="0"
            onMouseEnter={() => setActive(slice.index)}
            onMouseLeave={() => setActive(null)}
            onFocus={() => setActive(slice.index)}
            onBlur={() => setActive(null)}
            aria-label={`${slice.label}: ${money(slice.value)}, ${pct(Math.abs(slice.value), total)}`}
          />
        ))}
        <circle cx="145" cy="124" r="50" fill="var(--surface)" />
        <text x="145" y="122" textAnchor="middle" className="svg-label">{activeRow ? activeRow[0].slice(0, 16) : "Total"}</text>
        <text x="145" y="140" textAnchor="middle" className="tick">{money(activeRow ? activeRow[1] : total)}</text>
        {shown.map(([label, value], index) => (
          <g key={label} className={active === index ? "legend-active" : ""}>
            <rect x="305" y={34 + index * 22} width="9" height="9" rx="2" fill={COLORS[index % COLORS.length]} />
            <text x="322" y={42 + index * 22} className="svg-label">{label.slice(0, 30)}</text>
            <text x="590" y={42 + index * 22} className="tick" textAnchor="end">{pct(Math.abs(value), total)}</text>
          </g>
        ))}
      </svg>
    </div>
  );
}

export function LineChart({ series, months, labels }) {
  const [windowState, setWindowState] = useState(() => createChartWindow(months.length));
  const [tooltip, setTooltip] = useState(null);
  const drag = useRef(null);
  useEffect(() => setWindowState(createChartWindow(months.length)), [months.length]);
  const visibleMonths = months.slice(windowState.start, windowState.start + windowState.size);
  const visibleSeries = useMemo(() => series.map((item) => ({
    ...item,
    values: item.values.slice(windowState.start, windowState.start + windowState.size),
  })), [series, windowState]);
  const width = 760;
  const height = 245;
  const left = 44;
  const right = 18;
  const top = 24;
  const bottom = 34;
  const allValues = visibleSeries.flatMap((item) => item.values);
  const max = Math.max(...allValues, 1);
  const xStep = (width - left - right) / Math.max(visibleMonths.length - 1, 1);
  const y = (value) => top + (height - top - bottom) * (1 - value / max);
  const pan = (amount) => setWindowState((current) => panChartWindow(current, months.length, amount));
  const onPointerDown = (event) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { x: event.clientX, start: windowState.start };
  };
  const onPointerMove = (event) => {
    if (!drag.current || windowState.size >= months.length) return;
    const monthPixels = Math.max(28, event.currentTarget.getBoundingClientRect().width / windowState.size);
    const delta = Math.round((drag.current.x - event.clientX) / monthPixels);
    setWindowState((current) => panChartWindow({ ...current, start: drag.current.start }, months.length, delta));
  };
  return (
    <div className="chart-frame line-frame">
      <ChartControls
        canZoomIn={windowState.size > Math.min(4, months.length)}
        canZoomOut={windowState.size < months.length}
        canPanBack={windowState.start > 0}
        canPanForward={windowState.start + windowState.size < months.length}
        onZoomIn={() => setWindowState((current) => zoomChartWindow(current, months.length, "in"))}
        onZoomOut={() => setWindowState((current) => zoomChartWindow(current, months.length, "out"))}
        onReset={() => setWindowState(createChartWindow(months.length))}
        onPanBack={() => pan(-1)}
        onPanForward={() => pan(1)}
      />
      <svg
        className={`line-svg ${windowState.size < months.length ? "is-zoomed" : ""}`}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`Monthly trend chart from ${labels[visibleMonths[0]] || visibleMonths[0]} to ${labels[visibleMonths.at(-1)] || visibleMonths.at(-1)}. Use chart controls to zoom and pan.`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={() => { drag.current = null; }}
        onPointerCancel={() => { drag.current = null; }}
      >
        {[0, 0.25, 0.5, 0.75, 1].map((tick) => {
          const yy = top + (height - top - bottom) * tick;
          return <line key={tick} x1={left} y1={yy} x2={width - right} y2={yy} className="axis" />;
        })}
        {visibleSeries.map((item, seriesIndex) => (
          <g key={item.name}>
            <rect x={left + seriesIndex * 130} y="4" width="9" height="9" rx="2" fill={COLORS[seriesIndex % COLORS.length]} />
            <text x={left + 14 + seriesIndex * 130} y="12" className="tick">{item.name}</text>
            <polyline points={item.values.map((value, index) => `${left + index * xStep},${y(value)}`).join(" ")} fill="none" stroke={COLORS[seriesIndex % COLORS.length]} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
            {item.values.map((value, index) => (
              <circle
                key={`${item.name}-${visibleMonths[index]}`}
                cx={left + index * xStep}
                cy={y(value)}
                r="4"
                className="line-point"
                fill={COLORS[seriesIndex % COLORS.length]}
                tabIndex="0"
                onMouseEnter={() => setTooltip({ x: left + index * xStep, y: y(value), label: `${item.name} · ${labels[visibleMonths[index]]}: ${money(value)}` })}
                onMouseLeave={() => setTooltip(null)}
                onFocus={() => setTooltip({ x: left + index * xStep, y: y(value), label: `${item.name} · ${labels[visibleMonths[index]]}: ${money(value)}` })}
                onBlur={() => setTooltip(null)}
                aria-label={`${item.name}, ${labels[visibleMonths[index]]}: ${money(value)}`}
              />
            ))}
          </g>
        ))}
        {visibleMonths.map((month, index) => <text key={month} x={left + index * xStep} y={height - 10} textAnchor="middle" className="tick">{labels[month] || month}</text>)}
        {tooltip ? (
          <g className="svg-tooltip" transform={`translate(${Math.min(width - 215, Math.max(6, tooltip.x - 100))} ${Math.max(18, tooltip.y - 38)})`}>
            <rect width="210" height="28" rx="5" />
            <text x="105" y="18" textAnchor="middle">{tooltip.label}</text>
          </g>
        ) : null}
      </svg>
      <div className="chart-range" aria-live="polite">{labels[visibleMonths[0]]} - {labels[visibleMonths.at(-1)]}</div>
    </div>
  );
}
