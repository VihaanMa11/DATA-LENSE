import React, { useRef, useState } from "react";
import { CustomerParetoView } from "./CustomerParetoView.jsx";
import { CustomerAnalysisView } from "./CustomerAnalysisView.jsx";

const TABS = [
  { id: "pareto",   label: "Customer Pareto" },
  { id: "analysis", label: "Customer Analysis" },
];

export function CustomerCombinedView() {
  const [tab, setTab] = useState("pareto");
  const [paretoFy, setParetoFy] = useState("");
  const [analysisFy, setAnalysisFy] = useState("");
  const tabRefs = useRef({});

  function handleKeyDown(e) {
    const ids = TABS.map(t => t.id);
    const cur = ids.indexOf(tab);
    let next = -1;
    if (e.key === "ArrowRight") next = (cur + 1) % ids.length;
    if (e.key === "ArrowLeft")  next = (cur - 1 + ids.length) % ids.length;
    if (next !== -1) {
      e.preventDefault();
      const nextId = ids[next];
      setTab(nextId);
      tabRefs.current[nextId]?.focus();
    }
  }

  return (
    <div className="combined-view">
      <div className="combined-tabs" role="tablist" aria-label="Customer reports" onKeyDown={handleKeyDown}>
        {TABS.map(t => (
          <button
            key={t.id}
            id={`tab-${t.id}`}
            role="tab"
            aria-selected={tab === t.id}
            aria-controls={`panel-${t.id}`}
            tabIndex={tab === t.id ? 0 : -1}
            className={`combined-tab${tab === t.id ? " active" : ""}`}
            ref={el => { tabRefs.current[t.id] = el; }}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div
        id="panel-pareto"
        role="tabpanel"
        aria-labelledby="tab-pareto"
        hidden={tab !== "pareto"}
      >
        {tab === "pareto" && <CustomerParetoView fy={paretoFy} onFy={setParetoFy} />}
      </div>
      <div
        id="panel-analysis"
        role="tabpanel"
        aria-labelledby="tab-analysis"
        hidden={tab !== "analysis"}
      >
        {tab === "analysis" && <CustomerAnalysisView fy={analysisFy} onFy={setAnalysisFy} />}
      </div>
    </div>
  );
}
