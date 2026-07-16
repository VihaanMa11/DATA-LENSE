import React, { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { exportNodeToPdf } from "../exportPdf.js";

// Shared formatting helpers + presentational primitives used across the dashboard
// and the analytics pages. Kept in one module so App.jsx and pages render identically.

const ExpandIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M15 3h6v6" /><path d="M9 21H3v-6" /><path d="M21 3l-7 7" /><path d="M3 21l7-7" />
  </svg>
);
const DownloadIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="M7 10l5 5 5-5" /><path d="M12 15V3" />
  </svg>
);
const CloseIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M18 6 6 18" /><path d="M6 6l12 12" />
  </svg>
);

export function money(value) {
  return `₹${((Number(value) || 0) / 100000).toLocaleString("en-IN", { maximumFractionDigits: 2 })} Lakh`;
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

export function Card({ title, sub, badge, badgeClass = "", children, expandable = true, help }) {
  const [open, setOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const helpRef = useRef(null);

  useEffect(() => {
    if (!helpOpen) return;
    const handler = (e) => { if (helpRef.current && !helpRef.current.contains(e.target)) setHelpOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [helpOpen]);

  return (
    <div className="card">
      <div className="card-head">
        <div>
          <div className="card-title">{title}</div>
          <div className="card-sub">{sub}</div>
        </div>
        <div className="card-actions">
          {badge && <span className={`badge ${badgeClass}`}>{badge}</span>}
          {help && (
            <div className="help-bubble-wrap" ref={helpRef}>
              <button type="button" className="icon-btn help-btn" title="How to read this chart" aria-label="Chart explanation" onClick={() => setHelpOpen(v => !v)}>?</button>
              {helpOpen && (
                <div className="help-popover" role="tooltip">
                  <div className="help-popover-inner">{help}</div>
                </div>
              )}
            </div>
          )}
          {expandable && (
            <button type="button" className="icon-btn" title="Expand & export" aria-label={`Expand ${title || "panel"}`} onClick={() => setOpen(true)}>
              <ExpandIcon />
            </button>
          )}
        </div>
      </div>
      {children}
      {open && <ChartModal title={title} sub={sub} onClose={() => setOpen(false)}>{children}</ChartModal>}
    </div>
  );
}

function ChartModal({ title, sub, children, onClose }) {
  const bodyRef = useRef(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const onKey = (event) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  async function handleExport() {
    if (!bodyRef.current) return;
    setBusy(true);
    try {
      const safe = (title || "datalence-chart").replace(/[^\w-]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase();
      await exportNodeToPdf(bodyRef.current, { title: title || "DataLence Chart", filename: safe || "datalence-chart" });
    } catch (error) {
      console.error("PDF export failed", error);
      alert(`Could not export PDF: ${error.message}`);
    } finally {
      setBusy(false);
    }
  }

  return createPortal(
    <div className="chart-modal-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="chart-modal" role="dialog" aria-modal="true" aria-label={title || "Chart"}>
        <div className="chart-modal-head">
          <div>
            <h3>{title || "Chart"}</h3>
            {sub && <p>{sub}</p>}
          </div>
          <div className="chart-modal-actions">
            <button type="button" className="btn-export" onClick={handleExport} disabled={busy}>
              <DownloadIcon />{busy ? "Exporting…" : "Export PDF"}
            </button>
            <button type="button" className="btn-ghost" onClick={onClose}>
              <CloseIcon />Close
            </button>
          </div>
        </div>
        <div className="chart-modal-body" ref={bodyRef}>
          {children}
        </div>
      </div>
    </div>,
    document.body,
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
