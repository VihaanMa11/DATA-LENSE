import { test } from "node:test";
import assert from "node:assert/strict";
import { buildStockMovement } from "../server/stockMovementBuilder.js";

const FY1 = "FY 2024-25";
const FY2 = "FY 2025-26";
const FY3 = "FY 2026-27";

function mv(tx, fy, month, sku, group, qty) {
  return { tx, fy, month, item: sku, itemGroup: group, party: "P1", qty };
}
function fixture() {
  const f = [];
  const m1 = ["2024-04","2024-05","2024-06","2024-07","2024-08","2024-09","2024-10","2024-11","2024-12","2025-01","2025-02","2025-03"];
  const m2 = ["2025-04","2025-05","2025-06","2025-07","2025-08","2025-09","2025-10","2025-11","2025-12","2026-01","2026-02","2026-03"];
  // FAST: purchased 1200, sold 1150 -> closing +50, ST 96%
  m1.forEach((m) => { f.push(mv("Purchase", FY1, m, "FAST", "KIDS-PU-F", 100)); f.push(mv("Sales", FY1, m, "FAST", "KIDS-PU-F", 96)); });
  m2.forEach((m) => { f.push(mv("Purchase", FY2, m, "FAST", "KIDS-PU-F", 100)); f.push(mv("Sales", FY2, m, "FAST", "KIDS-PU-F", 96)); });
  // NEG: sold more than purchased -> negative closing
  f.push(mv("Purchase", FY2, "2025-05", "NEG", "LADIES-PU-A", 100));
  f.push(mv("Sales", FY2, "2025-06", "NEG", "LADIES-PU-A", 160));
  // SLOW: purchased 1000, sold 300 -> lock-up (ST 30%)
  f.push(mv("Purchase", FY2, "2025-04", "SLOW", "TOPTRACK SHOE", 1000));
  f.push(mv("Sales", FY2, "2025-11", "SLOW", "TOPTRACK SHOE", 300));
  // Sales Return adds to inward; Purchase Return adds to outward
  f.push(mv("Sales Return", FY2, "2025-07", "FAST", "KIDS-PU-F", 10));
  // Cash excluded
  f.push({ tx: "Sales", fy: FY2, month: "2025-05", item: "FAST", itemGroup: "KIDS-PU-F", party: "Cash", qty: 9999 });
  // FY3 partial
  ["2026-04","2026-05","2026-06"].forEach((m) => { f.push(mv("Purchase", FY3, m, "FAST", "KIDS-PU-F", 100)); f.push(mv("Sales", FY3, m, "FAST", "KIDS-PU-F", 90)); });
  const itemMaster = [
    { name: "SLOW", purcPrice: 250, openingStock: 0 },
    { name: "NEG", purcPrice: 100, openingStock: 0 },
    { name: "FAST", purcPrice: 120, openingStock: 0 },
  ];
  return { itemFacts: f, ledgerFacts: [], itemMaster };
}

test("stockMovement: default currentFy latest complete, FY3 partial", () => {
  const r = buildStockMovement(fixture(), {});
  assert.equal(r.currentFy, FY2);
  assert.deepEqual(r.partialFys, [FY3]);
});

test("stockMovement: inward = purchase + sales return, outward = sales + purchase return", () => {
  const r = buildStockMovement(fixture(), { fy: FY2 });
  const fast = r.table.find((t) => t.sku === "FAST");
  // FY2 FAST: purchase 12*100=1200 + sales return 10 = 1210 inward; sales 12*96=1152 outward (Cash excluded)
  assert.equal(fast.inward, 1210);
  assert.equal(fast.outward, 1152);
});

test("stockMovement: negative closing counted", () => {
  const r = buildStockMovement(fixture(), { fy: FY2 });
  assert.equal(r.kpis.negativeStock.count, 1);
  const neg = r.table.find((t) => t.sku === "NEG");
  assert.equal(neg.closing, -60);
  assert.ok(neg.negative);
  assert.equal(neg.status, "Neg. stk");
});

test("stockMovement: lock-up value from low sell-through high value", () => {
  const r = buildStockMovement(fixture(), { fy: FY2 });
  const lock = r.lockupByGroup.find((g) => g.group === "TOPTRACK SHOE");
  // SLOW: closing 700 * cost 250 = 175000
  assert.equal(lock.closeVal, 175000);
  assert.ok(r.kpis.highLockup.count >= 1);
});

test("stockMovement: Cash excluded from movement", () => {
  const r = buildStockMovement(fixture(), { fy: FY2 });
  const fast = r.table.find((t) => t.sku === "FAST");
  assert.ok(fast.outward < 9999); // cash sale not counted
});

test("stockMovement: MoM inward and outward arrays length 12", () => {
  const r = buildStockMovement(fixture(), { fy: FY2 });
  assert.equal(r.momStock.inward.length, 12);
  assert.equal(r.momStock.outward.length, 12);
  assert.equal(r.momStock.running.length, 12);
});

test("stockMovement: empty input safe", () => {
  const r = buildStockMovement({ itemFacts: [] }, {});
  assert.equal(r.table.length, 0);
  assert.equal(r.kpis.negativeStock.count, 0);
});
