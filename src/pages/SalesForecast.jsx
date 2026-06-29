import React from "react";
import { useAnalytics } from "../useAnalytics.js";
import { SectionHead, Kpi, Card, Table, money } from "../components/ui.jsx";
import { LineChart } from "../components/InteractiveCharts.jsx";
import { PageState, MONTH_LABELS, MONTH_ORDER } from "./pageKit.jsx";
import { monthLabels } from "../fiscalYear.js";

export function SalesForecast() {
  const { analytics, loading, error } = useAnalytics();
  return (
    <PageState loading={loading} error={error}>
      {analytics && <Body a={analytics} />}
    </PageState>
  );
}

function Body({ a }) {
  const forecast = a.forecast || { m1: 0, m2: 0, m3: 0, slope: 0 };
  const monthly = a.monthly || [];
  const monthOrder = a.monthOrder?.length ? a.monthOrder : MONTH_ORDER;
  const baseLabels = monthLabels(monthOrder);
  const actuals = monthOrder.map(m => (monthly.find(x => x.month === m)?.sales) || 0);
  const lastIdx = actuals.reduce((acc, v, i) => (v > 0 ? i : acc), -1);

  // Extend the axis with 3 forecast months.
  const labels = { ...MONTH_LABELS, ...baseLabels, F1: "+1", F2: "+2", F3: "+3" };
  const months = [...monthOrder, "F1", "F2", "F3"];

  const forecastSeries = months.map(() => 0);
  if (lastIdx >= 0) {
    forecastSeries[lastIdx] = actuals[lastIdx]; // connect line to last actual
    forecastSeries[monthOrder.length] = forecast.m1;
    forecastSeries[monthOrder.length + 1] = forecast.m2;
    forecastSeries[monthOrder.length + 2] = forecast.m3;
  }
  const series = [
    { name: "Actual", values: [...actuals, 0, 0, 0] },
    { name: "Forecast", values: forecastSeries },
  ];

  const trendDir = forecast.slope > 0 ? "↗ Growing" : forecast.slope < 0 ? "↘ Declining" : "→ Flat";

  return (
    <section className="section active">
      <SectionHead code="SF" title="Sales Forecast — 3 Months" sub="Linear regression (least squares) on monthly net sales" />
      <div className="kpis">
        <Kpi title="Next Month" value={money(forecast.m1)} meta="M+1 projection" tone="#f6a343" icon="money" />
        <Kpi title="Month +2" value={money(forecast.m2)} meta="M+2 projection" tone="#f6a343" />
        <Kpi title="Month +3" value={money(forecast.m3)} meta="M+3 projection" tone="#f6a343" />
        <Kpi title="Trend" value={trendDir} meta={`Slope ${money(forecast.slope)}/mo`} tone={forecast.slope >= 0 ? "#2fd083" : "#f14f64"} />
      </div>
      <Card title="Actual vs Forecast" sub="Blue = actual net sales; second line projects the next 3 months" badge="Forecast">
        <LineChart series={series} months={months} labels={labels} />
      </Card>
      <Card title="Monthly Detail" sub="Actual net sales by month plus projected months" badge="Detail" badgeClass="cyan">
        <Table
          headers={["#", "Month", "Net Sales", "Type"]}
          rows={[
            ...monthOrder.filter((m, i) => actuals[i] > 0).map(m => {
              const idx = monthOrder.indexOf(m);
              return [labels[m], <span className="money">{money(actuals[idx])}</span>, "Actual"];
            }),
            [<b>Next Month</b>, <span className="money">{money(forecast.m1)}</span>, <span style={{ color: "#f6a343", fontWeight: 600 }}>Forecast</span>],
            [<b>Month +2</b>, <span className="money">{money(forecast.m2)}</span>, <span style={{ color: "#f6a343", fontWeight: 600 }}>Forecast</span>],
            [<b>Month +3</b>, <span className="money">{money(forecast.m3)}</span>, <span style={{ color: "#f6a343", fontWeight: 600 }}>Forecast</span>],
          ]}
        />
      </Card>
    </section>
  );
}
