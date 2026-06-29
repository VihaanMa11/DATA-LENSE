import React from "react";

// FyToggle — row of FY buttons + "3-yr view" option.
// value="" means 3-yr view. partialFys is a Set of FY strings that are incomplete.
export function FyToggle({ fyList, value, onChange, partialFys = new Set() }) {
  if (!fyList || fyList.length === 0) return null;
  return (
    <div className="fy-toggle">
      <button
        type="button"
        className={`fy-btn${value === "" ? " on" : ""}`}
        onClick={() => onChange("")}
      >
        3-yr view
      </button>
      {fyList.map((fy) => (
        <button
          key={fy}
          type="button"
          className={`fy-btn${value === fy ? " on" : ""}`}
          onClick={() => onChange(fy)}
        >
          {fy}{partialFys.has(fy) ? " ·partial" : ""}
        </button>
      ))}
    </div>
  );
}
