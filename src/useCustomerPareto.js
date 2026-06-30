import { useContext, useEffect, useState } from "react";
import { SheetContext } from "./sheetContext.js";

export function useCustomerPareto(fy) {
  const sheetUrl = useContext(SheetContext);
  const [pareto, setPareto] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!sheetUrl) { setPareto(null); setLoading(false); setError(""); return; }
    let cancelled = false;
    setLoading(true);
    setError("");
    const params = new URLSearchParams({ sheetUrl });
    if (fy) params.set("fy", fy);
    fetch(`/api/customer-pareto?${params.toString()}`, { credentials: "include" })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data) => { if (!cancelled) setPareto(data); })
      .catch((e) => { if (!cancelled) setError(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [sheetUrl, fy]);

  return { pareto, loading, error };
}
