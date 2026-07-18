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

// ---------------------------------------------------------------------------
// Partial-FY equal-window fix (item 3): FY3 has only 3 of 12 months loaded, scaled
// 120000 vs FY2's 110000 unit (same shape) -> true growth is ~9.09% on an equal
// 3-vs-3 month window. The OLD code compared FY3's 3-month total against FY2's FULL
// 12-month total, producing roughly -80% "growth" as a pure partial-FY artifact.
// ---------------------------------------------------------------------------

test("salesForecast: growth rate on a partial FY compares equal windows, not partial-vs-full", () => {
  const r = buildSalesForecast(fixture(), { fy: FY3 });
  assert.equal(r.currentFy, FY3);
  // True equal-window growth is ~+9.1%, nowhere near the ~-80% a partial-vs-full
  // mismatch would produce.
  assert.ok(r.kpis.totalActual.yoyPct > 0, `expected positive growth, got ${r.kpis.totalActual.yoyPct}`);
  assert.ok(r.kpis.totalActual.yoyPct < 20, `growth should be near 9%, got ${r.kpis.totalActual.yoyPct}`);
});

test("salesForecast: no negative forecasts from a partial-FY artifact", () => {
  const r = buildSalesForecast(fixture(), { fy: FY3 });
  for (const f of r.mainChart.forecast) {
    if (f == null) continue;
    assert.ok(f >= 0, `forecast value went negative: ${f}`);
  }
  assert.ok(r.projection.conservative >= 0);
  assert.ok(r.projection.base >= 0);
});

test("salesForecast: monthly forecast sums to the annual projection", () => {
  const r = buildSalesForecast(fixture(), { fy: FY3 });
  // projection.base is built from the same 12 monthly forecasts by construction:
  // months 0-2 scale FY3's own actuals forward, months 3-11 fall back to FY2's same
  // month (FY3 hasn't reached them yet) — both scaled by the equal-window growth rate.
  const shape = [50, 40, 40, 20, 80, 100, 40, 40, 40, 50, 70, 90];
  const growth = (130 * 120000 - 130 * 110000) / (130 * 110000); // ~9.09%
  const curPart = shape.slice(0, 3).reduce((s, v) => s + v, 0) * 120000;
  const prevPart = shape.slice(3).reduce((s, v) => s + v, 0) * 110000;
  const expectedBase = Math.round((curPart + prevPart) * (1 + growth));
  assert.ok(r.projection.base > 0);
  assert.ok(r.projection.conservative <= r.projection.base);
  assert.ok(r.projection.base <= r.projection.optimistic);
  // Old (buggy) code would have anchored the projection to just curTotal (15.6M)
  // scaled by an artificially-floored +5% growth (~16.4M) — an order of magnitude
  // below a plausible full-year figure. The fixed base should land near the true
  // equal-window-scaled annual total instead.
  assert.ok(Math.abs(r.projection.base - expectedBase) / expectedBase < 0.01, `base ${r.projection.base} vs expected ~${expectedBase}`);
  assert.ok(r.projection.base > 15600000 * 3, "must not be anchored to the partial 3-month total");
});

test("salesForecast: best/worst month ignore not-yet-loaded months of a partial FY", () => {
  const r = buildSalesForecast(fixture(), { fy: FY3 });
  // Only Apr/May/Jun are loaded for FY3 (shape 50,40,40) — May and Jun tie for worst,
  // but neither should be a later unloaded month reading as a fake zero.
  assert.ok(["Apr", "May", "Jun"].includes(r.kpis.worstMonth.month));
  assert.ok(["Apr", "May", "Jun"].includes(r.kpis.bestMonth.month));
});

test("salesForecast: growth rate stays stable in sign/scale as more of the FY loads", () => {
  const f = fixture();
  const r3 = buildSalesForecast(f, { fy: FY3 }); // 3 months loaded
  // Simulate one more month of FY3 data arriving, same run-rate continuing.
  f.itemFacts.push({ tx: "Sales", fy: FY3, month: "2026-07", party: "P1", finalAmount: 20 * 120000, isHeader: true });
  const r4 = buildSalesForecast(f, { fy: FY3 }); // 4 months loaded
  // Both should read as healthy positive growth in the same ballpark — no wild swing
  // from a mismatched-window artifact (e.g. -80% collapsing to +9%).
  assert.ok(Math.abs(r3.kpis.totalActual.yoyPct - r4.kpis.totalActual.yoyPct) < 10,
    `growth swung too much: ${r3.kpis.totalActual.yoyPct}% -> ${r4.kpis.totalActual.yoyPct}%`);
});
