import React, { useEffect, useRef } from "react";
import { fadeInUp, gsap } from "../../motion.js";

// KpiCard — a CEO cockpit metric tile.
// deltaTone: "up"|"dn"|"neu"
export function KpiCard({ label, value, delta, deltaTone = "neu", context }) {
  const ref = useRef(null);

  useEffect(() => {
    fadeInUp(ref.current, { duration: 0.4, y: 10, delay: gsap.utils.random(0, 0.12) });
  }, []);

  return (
    <div className="ceo-kpi" ref={ref}>
      <div className="kpi-l">{label}</div>
      <div className="kpi-v">{value}</div>
      {delta != null && (
        <span className={`delta ${deltaTone}`}>{delta}</span>
      )}
      {context && <div className="kpi-prev">{context}</div>}
    </div>
  );
}
