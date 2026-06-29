import React from "react";

// AlertBar — a horizontal strip of alert chips.
// alerts: [{ tone:"red"|"amber"|"blue", title, detail }]
export function AlertBar({ alerts }) {
  if (!alerts || alerts.length === 0) return null;
  return (
    <div className="alert-bar">
      {alerts.map((a, i) => (
        <div key={i} className={`alert-chip ${a.tone}`}>
          <span className="ac-text">
            <b>{a.title}</b>
            {a.detail ? <span> — {a.detail}</span> : null}
          </span>
        </div>
      ))}
    </div>
  );
}
