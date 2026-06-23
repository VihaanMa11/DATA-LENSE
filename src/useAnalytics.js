import { useContext, useEffect, useState } from "react";
import { PeriodContext } from "./periodContext.js";

const FY_MONTH_COUNT = 12;

export function useAnalytics() {
  const months = useContext(PeriodContext);
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Only send a months filter when it's a strict subset of the full year.
  const key = Array.isArray(months) && months.length && months.length < FY_MONTH_COUNT ? months.join(",") : "";

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    const qs = key ? `?months=${encodeURIComponent(key)}` : "";
    fetch(`/api/analytics${qs}`, { credentials: "include" })
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(data => { if (!cancelled) setAnalytics(data); })
      .catch(e => { if (!cancelled) setError(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [key]);

  return { analytics, loading, error };
}
