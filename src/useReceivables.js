import { useContext, useEffect, useState } from "react";
import { readJsonResponse } from "./apiClient.js";
import { SheetContext } from "./sheetContext.js";

export function useReceivables(fy) {
  const sheetUrl = useContext(SheetContext);
  const [receivables, setReceivables] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!sheetUrl) { setReceivables(null); setLoading(false); setError(""); return; }
    let cancelled = false;
    setLoading(true);
    setError("");
    const params = new URLSearchParams({ sheetUrl });
    if (fy) params.set("fy", fy);
    fetch(`/api/receivables?${params.toString()}`, { credentials: "include" })
      .then(readJsonResponse)
      .then((data) => { if (!cancelled) setReceivables(data); })
      .catch((e) => { if (!cancelled) setError(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [sheetUrl, fy]);

  return { receivables, loading, error };
}
