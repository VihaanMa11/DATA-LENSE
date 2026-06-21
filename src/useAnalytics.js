import { useEffect, useState } from "react";

export function useAnalytics() {
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/analytics", { credentials: "include" })
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(setAnalytics)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  return { analytics, loading, error };
}
