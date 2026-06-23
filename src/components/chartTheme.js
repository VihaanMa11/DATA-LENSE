// Shared ApexCharts theme + formatters so every chart looks and reads identically.

export const PALETTE = ["#2563eb", "#12b76a", "#f59e0b", "#ef4444", "#7c5cff", "#06b6d4", "#ec4899", "#84cc16", "#0ea5e9", "#64748b"];
export const FONT = "Inter, 'Segoe UI', Roboto, Arial, sans-serif";
export const GRID = "#e3e8f0";
export const INK = "#5d6678";

export function money(value) {
  return `₹${((Number(value) || 0) / 100000).toLocaleString("en-IN", { maximumFractionDigits: 2 })}L`;
}

// Compact axis labels: ₹k / ₹L / ₹Cr
export function moneyAxis(value) {
  const n = Number(value) || 0;
  const abs = Math.abs(n);
  if (abs >= 1e7) return `₹${(n / 1e7).toFixed(1)}Cr`;
  if (abs >= 1e5) return `₹${(n / 1e5).toFixed(1)}L`;
  if (abs >= 1e3) return `₹${(n / 1e3).toFixed(0)}k`;
  return `₹${Math.round(n)}`;
}

export const baseChart = (type) => ({
  type,
  fontFamily: FONT,
  toolbar: { show: false },
  zoom: { enabled: false },
  animations: { enabled: true, easing: "easeinout", speed: 650, animateGradually: { enabled: true, delay: 60 } },
  parentHeightOffset: 0,
});

export const baseTooltip = {
  theme: "light",
  style: { fontSize: "12px", fontFamily: FONT },
};
