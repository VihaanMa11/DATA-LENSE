import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSalesForecast } from "../server/salesForecastBuilder.js";

const FY1 = "FY 2024-25";
const FY2 = "FY 2025-26";
const FY3 = "FY 2026-27";

function saleH(fy, month, finalAmount) {
  return { tx: "Sales", fy, month, party: "P1", finalAmount, isHeader: true };
}
function fixture() {
  const f = [];
  const m1 = ["2024-04","2024-05","2024-06","2024-07","2024-08","2024-09","2024-10","2024-11","2024-12","2025-01","2025-02","2025-03"];
  const m2 = ["2025-04","2025-05","2025-06","2025-07","2025-08","2025-09","2025-10","2025-11","2025-12","2026-01","2026-02","2026-03"];
  // seasonal shape: low July, high Sep
  const shape = [50, 40, 40, 20, 80, 100, 40, 40, 40, 50, 70, 90];
  m1.forEach((m, i) => f.push(saleH(FY1, m, shape[i] * 100000)));
  m2.forEach((m, i) => f.push(saleH(FY2, m, shape[i] * 110000))); // 10% growth, same shape
  // FY3 partial
  ["2026-04","2026-05","2026-06"].forEach((m, i) => f.push(saleH(FY3, m, shape[i] * 120000)));
  return { itemFacts: f, ledgerFacts: [] };
}

test("salesForecast: default currentFy latest complete, forecast next FY", () => {
  const r = buildSalesForecast(fixture(), {});
  assert.equal(r.currentFy, FY2);
  assert.equal(r.forecastFy, FY3);
  assert.deepEqual(r.partialFys, [FY3]);
});

test("salesForecast: best = Sep, worst = Jul", () => {
  const r = buildSalesForecast(fixture(), { fy: FY2 });
  assert.equal(r.kpis.bestMonth.month, "Sep");
  assert.equal(r.kpis.worstMonth.month, "Jul");
  assert.ok(r.kpis.worstMonth.pctBelowBest >= 70);
});

test("salesForecast: forecast is seasonality-aware (preserves July trough)", () => {
  const r = buildSalesForecast(fixture(), { fy: FY2 });
  // forecast[0] = Apr scaled; the forecast for a low month must stay proportionally low
  const aprF = r.mainChart.forecast[12];
  const aprActual = r.mainChart.actual[0];
  // ~10% YoY growth -> forecast near actual, not a flat high number
  assert.ok(aprF >= aprActual * 0.9 && aprF <= aprActual * 1.3, `apr forecast ${aprF} near actual ${aprActual}`);
});

test("salesForecast: seasonality index sums around 1200 (12 x 100)", () => {
  const r = buildSalesForecast(fixture(), { fy: FY2 });
  const sum = r.seasonality.values.reduce((s, v) => s + v, 0);
  assert.ok(Math.abs(sum - 1200) < 15, `sum ${sum}`);
  const sep = r.seasonality.values[5];
  assert.ok(sep > 150); // peak well above average
});

test("salesForecast: projection scenarios ordered", () => {
  const r = buildSalesForecast(fixture(), { fy: FY2 });
  assert.ok(r.projection.conservative <= r.projection.base);
  assert.ok(r.projection.base <= r.projection.optimistic);
});

test("salesForecast: table has 12 actuals + 3 forecast rows", () => {
  const r = buildSalesForecast(fixture(), { fy: FY2 });
  assert.equal(r.table.length, 15);
  assert.equal(r.table.filter((t) => t.type === "Forecast").length, 3);
});

test("salesForecast: empty input safe", () => {
  const r = buildSalesForecast({ itemFacts: [] }, {});
  assert.equal(r.table.length, 0);
  assert.equal(r.kpis.totalActual.cur, 0);
});
