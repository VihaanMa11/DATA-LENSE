import { test } from "node:test";
import assert from "node:assert/strict";
import { buildProductForecast } from "../server/productForecastBuilder.js";

const FY1 = "FY 2024-25";
const FY2 = "FY 2025-26";
const FY3 = "FY 2026-27";

function sale(fy, month, sku, group, qty, amount) {
  return { tx: "Sales", fy, month, item: sku, itemGroup: group, party: "P1", qty, amount, date: `${month}-15`, isHeader: false };
}
function pur(fy, month, sku, group, qty) {
  return { tx: "Purchase", fy, month, item: sku, itemGroup: group, party: "V1", qty, amount: 0, isHeader: false };
}
const M2 = ["2025-04","2025-05","2025-06","2025-07","2025-08","2025-09","2025-10","2025-11","2025-12","2026-01","2026-02","2026-03"];
function fixture() {
  const f = [];
  // BALANCED Kids SKU: sells every month, buys enough stock
  M2.forEach((m) => { f.push(sale(FY2, m, "KID BALANCED", "KIDS-PU-F", 100, 100000)); f.push(pur(FY2, m, "KID BALANCED", "KIDS-PU-F", 100)); });
  // H2-HEAVY Ladies SKU: sells only Oct-Mar
  ["2025-10","2025-11","2025-12","2026-01","2026-02","2026-03"].forEach((m) => { f.push(sale(FY2, m, "LADY H2", "LADIES V SAFE AIR", 50, 80000)); f.push(pur(FY2, m, "LADY H2", "LADIES V SAFE AIR", 50)); });
  // extra Apr stock for LADY H2 sitting unsold (should be H2-only action)
  f.push(pur(FY2, "2025-04", "LADY H2", "LADIES V SAFE AIR", 500));
  // FY1 for prev-year matching
  M2.forEach(() => {});
  f.push(sale(FY1, "2024-06", "KID BALANCED", "KIDS-PU-F", 100, 90000));
  // FY3 partial
  f.push(sale(FY3, "2026-04", "KID BALANCED", "KIDS-PU-F", 10, 12000));
  return { itemFacts: f, ledgerFacts: [] };
}

test("productForecast: default currentFy latest complete, forecast next FY", () => {
  const r = buildProductForecast(fixture(), {});
  assert.equal(r.currentFy, FY2);
  assert.equal(r.forecastFy, FY3);
  assert.equal(r.targetMonth, "Apr");
});

test("productForecast: parent group rolls up sub-groups (fewer parents than subs)", () => {
  const r = buildProductForecast(fixture(), { fy: FY2 });
  assert.ok(r.kpis.parentGroups.value <= r.kpis.parentGroups.subGroups);
  assert.ok(r.groupForecast.some((g) => g.group === "Kids"));
  assert.ok(r.groupForecast.some((g) => g.group === "Ladies"));
});

test("productForecast: seasonality-aware forecast zeroes an H2 SKU for an April target", () => {
  const r = buildProductForecast(fixture(), { fy: FY2, targetIdx: 0 }); // Apr
  const lady = r.table.find((t) => t.sku === "LADY H2");
  assert.ok(lady, "LADY H2 present");
  // LADY H2 has no April sales -> adjusted forecast ~0 while flat run-rate is positive
  assert.equal(lady.adjusted, 0);
  assert.ok(lady.h2Pct >= 90 && lady.h2Pct <= 100);
  assert.equal(lady.bias, "H2 heavy");
  assert.equal(lady.action, "H2 only");
});

test("productForecast: h2Pct is clamped to 0..100", () => {
  const r = buildProductForecast(fixture(), { fy: FY2 });
  for (const row of r.table) assert.ok(row.h2Pct >= 0 && row.h2Pct <= 100, `h2Pct ${row.h2Pct}`);
});

test("productForecast: flat total >= adjusted total (seasonality trims H2 items)", () => {
  const r = buildProductForecast(fixture(), { fy: FY2 });
  assert.ok(r.kpis.flatVsAdj.flat >= r.kpis.flatVsAdj.adjusted);
});

test("productForecast: purchase action + days cover present", () => {
  const r = buildProductForecast(fixture(), { fy: FY2 });
  assert.ok(r.purchase.length > 0);
  assert.ok(r.purchase.every((p) => typeof p.action === "string" && typeof p.daysCover === "number"));
});

test("productForecast: empty input safe", () => {
  const r = buildProductForecast({ itemFacts: [] }, {});
  assert.equal(r.table.length, 0);
  assert.equal(r.kpis.productsTracked.value, 0);
});

// ---------------------------------------------------------------------------
// Partial-FY equal-window fix (item 3): FY3 has only April loaded for KID BALANCED
// (qty 10, amount 12000). The OLD code divided YTD by a hardcoded 12 regardless of
// how much of the year had happened, understating the flat run-rate ~12x for a
// 1-month-old FY.
// ---------------------------------------------------------------------------
test("productForecast: flat run-rate divides by months actually loaded, not a hardcoded 12", () => {
  const r = buildProductForecast(fixture(), { fy: FY3 });
  assert.equal(r.currentFy, FY3);
  const kid = r.table.find((t) => t.sku === "KID BALANCED");
  assert.ok(kid, "KID BALANCED present in FY3");
  // Only April loaded: ytd=12000, loadedMonths=1 -> flat run-rate should be ~12000,
  // not 12000/12=1000 (the old hardcoded-12 bug).
  assert.equal(kid.flat, 12000);
});
