export const DEFAULT_FY = "FY 2025-26";
export const DEFAULT_FYS = ["FY 2024-25", "FY 2025-26", "FY 2026-27"];

const MONTH_NAMES = {
  "01": "Jan",
  "02": "Feb",
  "03": "Mar",
  "04": "Apr",
  "05": "May",
  "06": "Jun",
  "07": "Jul",
  "08": "Aug",
  "09": "Sep",
  "10": "Oct",
  "11": "Nov",
  "12": "Dec",
};

export function fiscalYearMonths(fy = DEFAULT_FY) {
  const match = String(fy || "").match(/FY\s*(\d{4})\s*-\s*(\d{2})/i);
  const startYear = match ? Number(match[1]) : 2025;
  return [4, 5, 6, 7, 8, 9, 10, 11, 12, 1, 2, 3].map((month) => {
    const year = month >= 4 ? startYear : startYear + 1;
    return `${year}-${String(month).padStart(2, "0")}`;
  });
}

export function monthLabels(months) {
  return Object.fromEntries(months.map((month) => [month, MONTH_NAMES[month.slice(5, 7)] || month]));
}

export function periodMonths(monthOrder) {
  return {
    FY: monthOrder,
    Q1: monthOrder.slice(0, 3),
    Q2: monthOrder.slice(3, 6),
    Q3: monthOrder.slice(6, 9),
    Q4: monthOrder.slice(9, 12),
    H1: monthOrder.slice(0, 6),
    H2: monthOrder.slice(6, 12),
    ASOF: monthOrder,
  };
}
