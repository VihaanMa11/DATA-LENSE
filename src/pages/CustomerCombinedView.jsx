import React, { useState } from "react";
import { CustomerParetoView } from "./CustomerParetoView.jsx";
import { CustomerAnalysisView } from "./CustomerAnalysisView.jsx";

export function CustomerCombinedView() {
  const [tab, setTab] = useState("pareto");
  const [paretoFy, setParetoFy] = useState("");
  const [analysisFy, setAnalysisFy] = useState("");

  return (
    <div className="combined-view">
      <div className="combined-tabs" role="tablist" aria-label="Customer reports">
        <button
          role="tab"
          aria-selected={tab === "pareto"}
          className={`combined-tab${tab === "pareto" ? " active" : ""}`}
          onClick={() => setTab("pareto")}
        >
          Customer Pareto
        </button>
        <button
          role="tab"
          aria-selected={tab === "analysis"}
          className={`combined-tab${tab === "analysis" ? " active" : ""}`}
          onClick={() => setTab("analysis")}
        >
          Customer Analysis
        </button>
      </div>

      <div role="tabpanel">
        {tab === "pareto" && (
          <CustomerParetoView fy={paretoFy} onFy={setParetoFy} />
        )}
        {tab === "analysis" && (
          <CustomerAnalysisView fy={analysisFy} onFy={setAnalysisFy} />
        )}
      </div>
    </div>
  );
}
