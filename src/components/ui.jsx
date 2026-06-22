import React from "react";

// Shared formatting helpers + presentational primitives used across the dashboard
// and the analytics pages. Kept in one module so App.jsx and pages render identically.

export function money(value) {
  return `INR ${((Number(value) || 0) / 100000).toLocaleString("en-IN", { maximumFractionDigits: 2 })}L`;
}

export function num(value) {
  return (Number(value) || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

export function pct(part, total) {
  return total ? `${((part / total) * 100).toFixed(1)}%` : "0.0%";
}

export function Kpi({ title, value, meta, variant = "", icon = "bars", tone = "#1976d2" }) {
  const wave = "M0,48 C18,18 34,18 52,48 C70,78 88,78 106,48 C124,18 142,18 160,48 C178,78 196,78 214,48 C232,18 250,18 268,48";
  return (
    <div className={`kpi ${variant}`} style={{ "--tone": tone }}>
      <div className="kpi-copy">
        <div className={`k-icon ${icon}`} aria-hidden="true" />
        <div className="k-label">{title}</div>
        <div className="k-value">{value}</div>
        <div className="k-meta">{meta}</div>
      </div>
      <svg className="k-wave" viewBox="0 0 268 92" aria-hidden="true">
        <path d={`${wave} L268,92 L0,92 Z`} />
        <path d={wave} />
      </svg>
    </div>
  );
}

export function SectionHead({ code, title, sub }) {
  return (
    <div className="section-head">
      <div className="section-icon">{code}</div>
      <div>
        <div className="section-title">{title}</div>
        <div className="section-sub">{sub}</div>
      </div>
    </div>
  );
}

export function Card({ title, sub, badge, badgeClass = "", children }) {
  return (
    <div className="card">
      <div className="card-head">
        <div>
          <div className="card-title">{title}</div>
          <div className="card-sub">{sub}</div>
        </div>
        {badge && <span className={`badge ${badgeClass}`}>{badge}</span>}
      </div>
      {children}
    </div>
  );
}

export function Highlights({ items }) {
  return (
    <div className="timeline">
      {items.map((item, index) => (
        <div className="timeline-row" key={item.label}>
          <span className={`dot d${index % 4}`} />
          <div>
            <p>{item.label}</p>
            <h6>{item.value}</h6>
          </div>
        </div>
      ))}
    </div>
  );
}

export function RatioList({ rows }) {
  return (
    <div className="ratio-list">
      {rows.map(([label, value], index) => (
        <div className="ratio-row" key={label}>
          <span className="ratio-icon">{index + 1}</span>
          <span>{label}</span>
          <b>{value}</b>
        </div>
      ))}
    </div>
  );
}

export function Table({ headers, rows }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>{headers.map((header) => <th key={header}>{header}</th>)}</tr>
        </thead>
        <tbody>
          {rows.length ? rows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              <td><span className={`rank ${rowIndex === 0 ? "r1" : rowIndex === 1 ? "r2" : rowIndex === 2 ? "r3" : ""}`}>{rowIndex + 1}</span></td>
              {row.map((cell, index) => <td key={index}>{cell}</td>)}
            </tr>
          )) : <tr><td colSpan={headers.length}>No data for current filters</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
