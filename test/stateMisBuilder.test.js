import { test } from "node:test";
import assert from "node:assert/strict";
import { buildStateMis } from "../server/stateMisBuilder.js";

const FY1 = "FY 2024-25";
const FY2 = "FY 2025-26";
const FY3 = "FY 2026-27";

function sale(fy, month, state, party, group, voucher, amount) {
  return { tx: "Sales", fy, month, state, party, itemGroup: group, voucher, amount, qty: 1, mainUnit: "PAIRS", isHeader: true };
}
function line(fy, month, state, party, group, amount) {
  return { tx: "Sales", fy, month, state, party, itemGroup: group, amount, qty: 1, mainUnit: "PAIRS", isHeader: false };
}

function fixture() {
  const f = [];
  const m1 = ["2024-04","2024-05","2024-06","2024-07","2024-08","2024-09","2024-10","2024-11","2024-12","2025-01","2025-02","2025-03"];
  const m2 = ["2025-04","2025-05","2025-06","2025-07","2025-08","2025-09","2025-10","2025-11","2025-12","2026-01","2026-02","2026-03"];
  // West Bengal dominant: 12 bills/yr, big amounts
  for (const m of m1) f.push(sale(FY1, m, "West Bengal", "WB-Party" + m, "KIDS", "WB-" + m, 100000));
  for (const m of m2) f.push(sale(FY2, m, "West Bengal", "WB-Party" + m, "KIDS", "WBb-" + m, 110000));
  // Jharkhand: 1 party, few bills
  f.push(sale(FY1, "2024-08", "Jharkhand", "City Footwear", "KIDS", "JH-1", 50000));
  f.push(sale(FY2, "2025-08", "Jharkhand", "City Footwear", "KIDS", "JH-2", 80000));
  // Bihar: once
  f.push(sale(FY2, "2025-12", "Bihar", "SK Boot", "LADIES", "BR-1", 20000));
  // FY3 partial: only 3 months -> must be badged partial, not default currentFy
  for (const m of ["2026-04", "2026-05", "2026-06"]) f.push(sale(FY3, m, "West Bengal", "WB-Party" + m, "KIDS", "WBc-" + m, 120000));
  // Cash excluded
  f.push(sale(FY2, "2025-06", "West Bengal", "Cash", "KIDS", "CASH-1", 999999));
  return {
    itemFacts: f,
    ledgerFacts: [],
    accountMaster: [
      { name: "City Footwear", group: "Sundry Debtors", state: "Jharkhand", station: "Harinandanga" },
      { name: "SK Boot", group: "Sundry Debtors", state: "Bihar", station: "Patna" },
    ],
  };
}

test("stateMis: default currentFy latest complete, FY3 partial", () => {
  const r = buildStateMis(fixture(), {});
  assert.equal(r.currentFy, FY2);
  assert.deepEqual(r.partialFys, [FY3]);
});

test("stateMis: WB dominant share, Cash excluded", () => {
  const r = buildStateMis(fixture(), { fy: FY2 });
  assert.equal(r.kpis.topStateShare.state, "West Bengal");
  // WB FY2 = 12*110000 = 1,320,000 (Cash 999999 excluded)
  const wb = r.table.find((t) => t.state === "West Bengal");
  assert.equal(wb.perFy[FY2], 1320000);
  assert.ok(r.kpis.topStateShare.pct >= 85);
});

test("stateMis: single-party state flagged", () => {
  const r = buildStateMis(fixture(), { fy: FY2 });
  const jh = r.table.find((t) => t.state === "Jharkhand");
  assert.equal(jh.parties, 1);
  assert.equal(jh.risk, "1 party");
});

test("stateMis: concentration alert when top >= 85%", () => {
  const r = buildStateMis(fixture(), { fy: FY2 });
  assert.ok(r.alerts.some((a) => a.tone === "red" && /concentration/i.test(a.title)));
});

test("stateMis: outside-top-state parties listed", () => {
  const r = buildStateMis(fixture(), { fy: FY2 });
  const names = r.outsideParties.map((p) => p.party);
  assert.ok(names.includes("City Footwear"));
  assert.ok(names.includes("SK Boot"));
  assert.ok(!names.some((n) => n.startsWith("WB-Party")));
});

test("stateMis: bills count distinct vouchers", () => {
  const r = buildStateMis(fixture(), { fy: FY2 });
  const wb = r.table.find((t) => t.state === "West Bengal");
  assert.equal(wb.bills, 12);
});

test("stateMis: table sorted by current net desc", () => {
  const r = buildStateMis(fixture(), { fy: FY2 });
  const nets = r.table.map((t) => t.perFy[FY2]);
  for (let i = 1; i < nets.length; i++) assert.ok(nets[i - 1] >= nets[i]);
});

test("stateMis: empty input safe", () => {
  const r = buildStateMis({ itemFacts: [] }, {});
  assert.equal(r.table.length, 0);
  assert.equal(r.kpis.statesActive.count, 0);
});
