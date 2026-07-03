import { useContext, useEffect, useState } from "react";
import { readJsonResponse } from "./apiClient.js";
import { SheetContext } from "./sheetContext.js";

export function useProductForecast(fy, targetIdx) {
  const sheetUrl = useContext(SheetContext);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!sheetUrl) { setData(null); setLoading(false); setError(""); return; }
    let cancelled = false;
    setLoading(true);
    setError("");
    const params = new URLSearchParams({ sheetUrl });
    if (fy) params.set("fy", fy);
    if (Number.isInteger(targetIdx)) params.set("targetIdx", String(targetIdx));
    fetch(`/api/product-forecast?${params.toString()}`, { credentials: "include" })
      .then(readJsonResponse)
      .then((d) => { if (!cancelled) setData(d); })
      .catch((e) => { if (!cancelled) setError(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [sheetUrl, fy, targetIdx]);

  return { data, loading, error };
}
