import { useContext, useEffect, useState } from "react";
import { readJsonResponse } from "./apiClient.js";
import { SheetContext } from "./sheetContext.js";

export function useCustomerAnalysis(fy) {
  const sheetUrl = useContext(SheetContext);
  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!sheetUrl) { setAnalysis(null); setLoading(false); setError(""); return; }
    let cancelled = false;
    setLoading(true);
    setError("");
    const params = new URLSearchParams({ sheetUrl });
    if (fy) params.set("fy", fy);
    fetch(`/api/customer-analysis?${params.toString()}`, { credentials: "include" })
      .then(readJsonResponse)
      .then((data) => { if (!cancelled) setAnalysis(data); })
      .catch((e) => { if (!cancelled) setError(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [sheetUrl, fy]);

  return { analysis, loading, error };
}
