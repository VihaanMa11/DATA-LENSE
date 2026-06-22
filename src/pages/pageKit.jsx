import React from "react";

export const MONTH_LABELS = {
  "2025-04": "Apr", "2025-05": "May", "2025-06": "Jun", "2025-07": "Jul", "2025-08": "Aug", "2025-09": "Sep",
  "2025-10": "Oct", "2025-11": "Nov", "2025-12": "Dec", "2026-01": "Jan", "2026-02": "Feb", "2026-03": "Mar",
};
export const MONTH_ORDER = Object.keys(MONTH_LABELS);

// Standard loading / error wrapper so every analytics page behaves consistently.
export function PageState({ loading, error, children }) {
  if (loading) return <div className="loading">Loading analytics…</div>;
  if (error) return <div className="error-box">Could not load analytics: {error}</div>;
  return children;
}
