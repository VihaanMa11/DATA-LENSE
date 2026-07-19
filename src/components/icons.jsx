import React from "react";

// Minimal stroke-based icon set — one consistent visual language (1.6px stroke,
// round caps/joins, 20x20 box) used across the sidebar and KPI tiles. No emoji,
// no external icon package: plain inline SVG so the bundle stays lean.

const base = {
  viewBox: "0 0 20 20",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
};

const ICONS = {
  grid: (
    <svg {...base}>
      <rect x="2.5" y="2.5" width="6" height="6" rx="1.5" />
      <rect x="11.5" y="2.5" width="6" height="6" rx="1.5" />
      <rect x="2.5" y="11.5" width="6" height="6" rx="1.5" />
      <rect x="11.5" y="11.5" width="6" height="6" rx="1.5" />
    </svg>
  ),
  users: (
    <svg {...base}>
      <circle cx="10" cy="7" r="3" />
      <path d="M4 17c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5" />
    </svg>
  ),
  doc: (
    <svg {...base}>
      <rect x="4" y="2" width="12" height="16" rx="2" />
      <line x1="7" y1="7" x2="13" y2="7" />
      <line x1="7" y1="11" x2="13" y2="11" />
      <line x1="7" y1="15" x2="11" y2="15" />
    </svg>
  ),
  wallet: (
    <svg {...base}>
      <rect x="2" y="5" width="16" height="11" rx="2" />
      <path d="M2 8h16" />
      <rect x="11.5" y="10.5" width="4.5" height="3" rx="1" />
    </svg>
  ),
  pin: (
    <svg {...base}>
      <path d="M10 18s6.5-5.6 6.5-9.7C16.5 4.5 13.6 2 10 2S3.5 4.5 3.5 8.3C3.5 12.4 10 18 10 18z" />
      <circle cx="10" cy="8.3" r="2.1" />
    </svg>
  ),
  bars: (
    <svg {...base}>
      <rect x="3" y="11" width="3" height="6" rx="0.8" />
      <rect x="8.5" y="7" width="3" height="10" rx="0.8" />
      <rect x="14" y="3" width="3" height="14" rx="0.8" />
    </svg>
  ),
  trend: (
    <svg {...base}>
      <polyline points="3,15 8,9 12,12 17,4" />
      <polyline points="12,4 17,4 17,9" />
    </svg>
  ),
  layers: (
    <svg {...base}>
      <path d="M10 2 18 7 10 12 2 7z" />
      <path d="M2 12l8 5 8-5" />
    </svg>
  ),
  receipt: (
    <svg {...base}>
      <path d="M4 2h12v15l-2-1.4-2 1.4-2-1.4-2 1.4-2-1.4-2 1.4z" />
      <line x1="6.5" y1="6" x2="13.5" y2="6" />
      <line x1="6.5" y1="9.5" x2="13.5" y2="9.5" />
    </svg>
  ),
  sliders: (
    <svg {...base}>
      <line x1="3" y1="5" x2="17" y2="5" />
      <circle cx="8" cy="5" r="2" />
      <line x1="3" y1="10" x2="17" y2="10" />
      <circle cx="13" cy="10" r="2" />
      <line x1="3" y1="15" x2="17" y2="15" />
      <circle cx="6" cy="15" r="2" />
    </svg>
  ),
  truck: (
    <svg {...base}>
      <rect x="1.5" y="6" width="10.5" height="8" rx="1" />
      <path d="M12 9h3.5l3 3v2H12z" />
      <circle cx="5" cy="16" r="1.8" />
      <circle cx="15" cy="16" r="1.8" />
    </svg>
  ),
  database: (
    <svg {...base}>
      <ellipse cx="10" cy="4.5" rx="7" ry="2.5" />
      <path d="M3 4.5v11c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5v-11" />
      <path d="M3 10c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5" />
    </svg>
  ),
  target: (
    <svg {...base}>
      <circle cx="10" cy="10" r="7" />
      <circle cx="10" cy="10" r="3.6" />
      <circle cx="10" cy="10" r="0.6" fill="currentColor" />
    </svg>
  ),
  repeat: (
    <svg {...base}>
      <path d="M3 9a6 6 0 0 1 10.2-4.2L15 6.5" />
      <polyline points="15,3 15,6.5 11.5,6.5" />
      <path d="M17 11a6 6 0 0 1-10.2 4.2L5 13.5" />
      <polyline points="5,17 5,13.5 8.5,13.5" />
    </svg>
  ),
  package: (
    <svg {...base}>
      <path d="M10 2.5 17 6v8l-7 3.5L3 14V6z" />
      <path d="M3 6l7 3.5L17 6" />
      <line x1="10" y1="9.5" x2="10" y2="17.5" />
    </svg>
  ),
  bell: (
    <svg {...base}>
      <path d="M5 8a5 5 0 0 1 10 0c0 4 1.5 5 1.5 5h-13S5 12 5 8z" />
      <path d="M8 16a2 2 0 0 0 4 0" />
    </svg>
  ),
  search: (
    <svg {...base}>
      <circle cx="8.5" cy="8.5" r="5.5" />
      <line x1="16.5" y1="16.5" x2="12.6" y2="12.6" />
    </svg>
  ),
  chevron: (
    <svg {...base}>
      <polyline points="7,4 13,10 7,16" />
    </svg>
  ),
  user: (
    <svg {...base}>
      <circle cx="10" cy="7" r="3.2" />
      <path d="M3.5 17c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6" />
    </svg>
  ),
};

export function Icon({ name, className = "", size = 18 }) {
  const glyph = ICONS[name] || ICONS.bars;
  return (
    <span className={`icon-glyph ${className}`} style={{ width: size, height: size }}>
      {glyph}
    </span>
  );
}

export const ICON_NAMES = Object.keys(ICONS);
