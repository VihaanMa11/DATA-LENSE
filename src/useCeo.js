import { useContext, useEffect, useState } from "react";
import { readJsonResponse } from "./apiClient.js";
import { SheetContext } from "./sheetContext.js";

export function useCeo(fy) {
  const sheetUrl = useContext(SheetContext);
  const [ceo, setCeo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!sheetUrl) { setCeo(null); setLoading(false); setError(""); return; }
    let cancelled = false;
    setLoading(true);
    setError("");
    const params = new URLSearchParams({ sheetUrl });
    if (fy) params.set("fy", fy);
    fetch(`/api/ceo?${params.toString()}`, { credentials: "include" })
      .then(readJsonResponse)
      .then(data => { if (!cancelled) setCeo(data); })
      .catch(e => { if (!cancelled) setError(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [sheetUrl, fy]);

  return { ceo, loading, error };
}
