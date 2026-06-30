import { useContext, useEffect, useState } from "react";
import { readJsonResponse } from "./apiClient.js";
import { PeriodContext } from "./periodContext.js";
import { SheetContext } from "./sheetContext.js";

const FY_MONTH_COUNT = 12;

export function useAnalytics() {
  const period = useContext(PeriodContext);
  const sheetUrl = useContext(SheetContext);
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fy = Array.isArray(period) ? "" : (period?.fy || "");
  const months = Array.isArray(period) ? period : period?.months;
  // Only send a months filter when it's a strict subset of the full year.
  const monthsKey = Array.isArray(months) && months.length && months.length < FY_MONTH_COUNT ? months.join(",") : "";

  useEffect(() => {
    if (!sheetUrl) { setAnalytics(null); setLoading(false); setError(""); return; }
    let cancelled = false;
    setLoading(true);
    setError("");
    const params = new URLSearchParams({ sheetUrl });
    if (fy) params.set("fy", fy);
    if (monthsKey) params.set("months", monthsKey);
    fetch(`/api/analytics?${params.toString()}`, { credentials: "include" })
      .then(readJsonResponse)
      .then(data => { if (!cancelled) setAnalytics(data); })
      .catch(e => { if (!cancelled) setError(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [sheetUrl, fy, monthsKey]);

  return { analytics, loading, error };
}
