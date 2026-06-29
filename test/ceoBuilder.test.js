import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { buildCeoOverview } from "../server/ceoBuilder.js";

// ---------------------------------------------------------------------------
// Minimal inline fixture — 3 FYs, 3 customers, sales + returns + purchases
// ---------------------------------------------------------------------------
// FY 2024-25:
//   Customer A: 1 Sales header (finalAmount 100000) + 1 Sales line (amount 100000)
//               1 Sales Return header (finalAmount 5000) + 1 return line (amount 5000)
//   Customer B: 1 Sales header (finalAmount 60000) + 1 Sales line (amount 60000)
//   Purchase from Vendor X: 1 Purchase header (finalAmount 40000)
//   Billing: 2 Sales headers  → billCount=2
//   grossSales=160000  salesReturn=5000  netSales=155000
//   avgBill = 155000/2 = 77500
//   purchase = 40000
//   returnRate = 5000/160000*100 = 3.125 → round1 = 3.1
//   customers: A, B  (activeCustomers=2)
//
// FY 2025-26:
//   Customer A: 1 Sales header (finalAmount 120000) + 1 Sales line (amount 120000)
//               1 Sales Return header (finalAmount 8000) + 1 return line (amount 8000)
//   Customer C (NEW): 1 Sales header (finalAmount 40000) + 1 Sales line (amount 40000)
//   Purchase from Vendor X: 1 Purchase header (finalAmount 50000)
//   Purchase from Vendor Y: 1 Purchase header (finalAmount 20000)
//   Billing: 2 Sales headers
//   grossSales=160000  salesReturn=8000  netSales=152000
//   avgBill = 152000/2 = 76000
//   purchase = 70000
//   returnRate = 8000/160000*100 = 5.0
//   customers: A, C  → churned=1 (B), added=1 (C)
//
// FY 2026-27 (currentFy, latest):
//   Customer A: 1 Sales header (finalAmount 130000) + 1 Sales line (amount 130000)
//               1 Sales Return header (finalAmount 10000) + 1 return line (amount 10000)
//   Customer C: 1 Sales header (finalAmount 50000) + 1 Sales line (amount 50000)
//   Purchase from Vendor X: 1 Purchase header (finalAmount 60000)
//   Billing: 2 Sales headers
//   grossSales=180000  salesReturn=10000  netSales=170000
//   avgBill = 170000/2 = 85000
//   purchase = 60000
//   returnRate = 10000/180000*100 = 5.555... → round1 = 5.6
//   customers: A, C  → churned=0 added=0 (same as prev)
//
// returnRate trail: 3.1 → 5.0 → 5.6  (rising all 3 FYs → amber alert)
// purchase.deltaPct FY2026-27 vs FY2025-26: (60000-70000)/70000*100 = -14.28 → -14
// netSales.deltaPct: (170000-152000)/152000*100 = 11.84 → 12
// purchase is NOT growing faster than sales in currentFy → no amber for that
// churned in 2025-26 vs 2024-25 = 1 (Customer B) → check that alert fires when fy=2025-26
// For default (currentFy=2026-27): churned=0 so no red alert
//
// Suppliers in FY 2026-27: Vendor X = 60000 (100%) + Others=0 → just Vendor X
// Pareto FY 2026-27: Customer A=120000, Customer C=50000, total=170000
//   A: 120000/170000*100 = 70.6%  C: 170000/170000*100 = 100%
// ---------------------------------------------------------------------------

function makeRow(base, overrides) {
  return { ...base, ...overrides };
}

function salesHeader(fy, month, party, finalAmount, item, itemGroup) {
  // amount=0 on header rows: finalAmount is the bill total; line-level amount is on salesLine rows.
  return { tx: "Sales", fy, month, party, item, itemGroup, qty: 0, amount: 0, finalAmount, isHeader: true, date: `${month}-01`, state: "GJ", salesman: "S1" };
}

function salesLine(fy, month, party, amount, item, itemGroup) {
  return { tx: "Sales", fy, month, party, item, itemGroup, qty: 10, amount, finalAmount: 0, isHeader: false, date: `${month}-01`, state: "GJ", salesman: "S1" };
}

function returnHeader(fy, month, party, finalAmount, item, itemGroup) {
  // amount=0 on header rows: finalAmount is the bill total; line-level amount is on returnLine rows.
  return { tx: "Sales Return", fy, month, party, item, itemGroup, qty: 0, amount: 0, finalAmount, isHeader: true, date: `${month}-05`, state: "GJ", salesman: "S1" };
}

function returnLine(fy, month, party, amount, item, itemGroup) {
  return { tx: "Sales Return", fy, month, party, item, itemGroup, qty: 2, amount, finalAmount: 0, isHeader: false, date: `${month}-05`, state: "GJ", salesman: "S1" };
}

function purchaseHeader(fy, month, party, finalAmount, item, itemGroup) {
  return { tx: "Purchase", fy, month, party, item, itemGroup, qty: 0, amount: 0, finalAmount, isHeader: true, date: `${month}-03`, state: "GJ", salesman: "" };
}

function receiptRow(fy, month, account, credit) {
  return { tx: "Receipt", fy, month, account, debit: 0, credit };
}

const FIXTURE = {
  itemFacts: [
    // FY 2024-25
    salesHeader("FY 2024-25", "2024-04", "Customer A", 100000, "Item X", "Brand X"),
    salesLine(  "FY 2024-25", "2024-04", "Customer A", 100000, "Item X", "Brand X"),
    returnHeader("FY 2024-25", "2024-04", "Customer A", 5000,  "Item X", "Brand X"),
    returnLine(  "FY 2024-25", "2024-04", "Customer A", 5000,  "Item X", "Brand X"),
    salesHeader("FY 2024-25", "2024-05", "Customer B", 60000,  "Item Y", "Brand Y"),
    salesLine(  "FY 2024-25", "2024-05", "Customer B", 60000,  "Item Y", "Brand Y"),
    purchaseHeader("FY 2024-25", "2024-06", "Vendor X", 40000, "Item X", "Brand X"),
    // FY 2025-26
    salesHeader("FY 2025-26", "2025-04", "Customer A", 120000, "Item X", "Brand X"),
    salesLine(  "FY 2025-26", "2025-04", "Customer A", 120000, "Item X", "Brand X"),
    returnHeader("FY 2025-26", "2025-04", "Customer A", 8000,  "Item X", "Brand X"),
    returnLine(  "FY 2025-26", "2025-04", "Customer A", 8000,  "Item X", "Brand X"),
    salesHeader("FY 2025-26", "2025-05", "Customer C", 40000,  "Item Z", "Brand Z"),
    salesLine(  "FY 2025-26", "2025-05", "Customer C", 40000,  "Item Z", "Brand Z"),
    purchaseHeader("FY 2025-26", "2025-06", "Vendor X", 50000, "Item X", "Brand X"),
    purchaseHeader("FY 2025-26", "2025-07", "Vendor Y", 20000, "Item Y", "Brand Y"),
    // FY 2026-27
    salesHeader("FY 2026-27", "2026-04", "Customer A", 130000, "Item X", "Brand X"),
    salesLine(  "FY 2026-27", "2026-04", "Customer A", 130000, "Item X", "Brand X"),
    returnHeader("FY 2026-27", "2026-04", "Customer A", 10000,  "Item X", "Brand X"),
    returnLine(  "FY 2026-27", "2026-04", "Customer A", 10000,  "Item X", "Brand X"),
    salesHeader("FY 2026-27", "2026-05", "Customer C", 50000,  "Item Z", "Brand Z"),
    salesLine(  "FY 2026-27", "2026-05", "Customer C", 50000,  "Item Z", "Brand Z"),
    purchaseHeader("FY 2026-27", "2026-06", "Vendor X", 60000, "Item X", "Brand X"),
  ],
  ledgerFacts: [
    receiptRow("FY 2024-25", "2024-04", "Customer A", 80000),
    receiptRow("FY 2025-26", "2025-04", "Customer A", 100000),
    receiptRow("FY 2026-27", "2026-04", "Customer A", 110000),
  ],
  itemMaster: [],
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const round1 = (v) => Math.round(v * 10) / 10;

describe("buildCeoOverview", () => {

  // 1. fyList is chronological
  it("returns fyList in chronological order", () => {
    const o = buildCeoOverview(FIXTURE);
    assert.deepStrictEqual(o.fyList, ["FY 2024-25", "FY 2025-26", "FY 2026-27"]);
  });

  // 2. currentFy defaults to latest
  it("defaults currentFy to the latest fiscal year", () => {
    const o = buildCeoOverview(FIXTURE);
    assert.equal(o.currentFy, "FY 2026-27");
  });

  // 3. options.fy override
  it("respects options.fy when valid", () => {
    const o = buildCeoOverview(FIXTURE, { fy: "FY 2025-26" });
    assert.equal(o.currentFy, "FY 2025-26");
    assert.equal(o.prevFy, "FY 2024-25");
  });

  // 4. prevFy is set correctly
  it("sets prevFy to the FY before currentFy", () => {
    const o = buildCeoOverview(FIXTURE);
    assert.equal(o.prevFy, "FY 2025-26");
  });

  // 5. netSales.cur for default (FY 2026-27)
  //    grossSales=180000, salesReturn=10000 → netSales=170000
  it("computes kpis.netSales.cur correctly for currentFy", () => {
    const o = buildCeoOverview(FIXTURE);
    assert.equal(o.kpis.netSales.cur, 170000);
  });

  // 6. netSales.prev for FY 2025-26: grossSales=160000, return=8000 → 152000
  it("computes kpis.netSales.prev correctly", () => {
    const o = buildCeoOverview(FIXTURE);
    assert.equal(o.kpis.netSales.prev, 152000);
  });

  // 7. netSales.prev2 for FY 2024-25: grossSales=160000, return=5000 → 155000
  it("computes kpis.netSales.prev2 correctly", () => {
    const o = buildCeoOverview(FIXTURE);
    assert.equal(o.kpis.netSales.prev2, 155000);
  });

  // 8. deltaPct = (170000-152000)/152000*100 → 11.84 → int 12
  it("computes kpis.netSales.deltaPct as rounded integer", () => {
    const o = buildCeoOverview(FIXTURE);
    const expected = Math.round((170000 - 152000) / 152000 * 100);
    assert.equal(o.kpis.netSales.deltaPct, expected); // 12
  });

  // 9. avgBill.cur = 170000/2 = 85000
  it("computes avgBill.cur as netSales/billCount", () => {
    const o = buildCeoOverview(FIXTURE);
    assert.equal(o.kpis.avgBill.cur, 85000);
  });

  // 10. purchase.cur in FY 2026-27 = 60000 (one vendor, no purchase returns)
  it("computes purchase.cur correctly", () => {
    const o = buildCeoOverview(FIXTURE);
    assert.equal(o.kpis.purchase.cur, 60000);
  });

  // 11. returnRate.cur = 10000/180000*100 ≈ 5.6
  it("computes returnRate.cur to 1 decimal", () => {
    const o = buildCeoOverview(FIXTURE);
    assert.equal(o.kpis.returnRate.cur, round1(10000 / 180000 * 100));
  });

  // 12. customers count
  //   FY 2026-27 active: A, C → cur=2; FY 2025-26 active: A, C → prev=2
  it("computes customers.cur and prev counts", () => {
    const o = buildCeoOverview(FIXTURE);
    assert.equal(o.kpis.customers.cur, 2);
    assert.equal(o.kpis.customers.prev, 2);
  });

  // 13. churned/added for default (FY 2026-27 vs FY 2025-26)
  //   FY2025-26 parties: A, C.  FY2026-27 parties: A, C → churned=0 added=0
  it("computes churned=0 and added=0 when same customers", () => {
    const o = buildCeoOverview(FIXTURE);
    assert.equal(o.kpis.customers.churned, 0);
    assert.equal(o.kpis.customers.added, 0);
  });

  // 14. churned/added when fy=FY 2025-26 (vs FY 2024-25)
  //   FY2024-25: A, B.  FY2025-26: A, C → churned=1 (B), added=1 (C)
  it("detects churned and added customers vs prev year", () => {
    const o = buildCeoOverview(FIXTURE, { fy: "FY 2025-26" });
    assert.equal(o.kpis.customers.churned, 1);
    assert.equal(o.kpis.customers.added, 1);
  });

  // 15. monthlyByFy has 12-element arrays for each FY
  it("monthlyByFy contains 12-element arrays per FY", () => {
    const o = buildCeoOverview(FIXTURE);
    for (const fy of o.fyList) {
      assert.equal(o.monthlyByFy[fy].length, 12, `${fy} should have 12 months`);
    }
  });

  // 16. monthlyByFy FY 2026-27 April (index 0) = 120000 net (130000-10000), May=50000
  it("monthlyByFy April (index 0) = netSales from Sales and Sales Return headers that month", () => {
    const o = buildCeoOverview(FIXTURE);
    // April 2026 in FY 2026-27: Sales header 130000, Return header 10000 → 120000
    assert.equal(o.monthlyByFy["FY 2026-27"][0], 120000);
    // May 2026 in FY 2026-27: Sales header 50000 → 50000
    assert.equal(o.monthlyByFy["FY 2026-27"][1], 50000);
    // All other months should be 0
    for (let i = 2; i < 12; i++) {
      assert.equal(o.monthlyByFy["FY 2026-27"][i], 0);
    }
  });

  // 17. suppliers pct sums to ~100 for currentFy
  it("suppliers pct sums to approximately 100", () => {
    const o = buildCeoOverview(FIXTURE);
    const total = o.suppliers.reduce((s, s2) => s + s2.pct, 0);
    assert.ok(Math.abs(total - 100) < 0.5, `suppliers pct total ${total} should be ~100`);
  });

  // 18. only Vendor X in FY 2026-27 with value=60000
  it("suppliers lists Vendor X with correct value in currentFy", () => {
    const o = buildCeoOverview(FIXTURE);
    const vx = o.suppliers.find(s => s.name === "Vendor X");
    assert.ok(vx, "Vendor X in suppliers");
    assert.equal(vx.value, 60000);
    // pct should be 100 since only one vendor
    assert.ok(Math.abs(vx.pct - 100) < 0.01);
  });

  // 19. pareto last cumulativePct ≈ 100
  it("pareto last entry cumulativePct ≈ 100", () => {
    const o = buildCeoOverview(FIXTURE);
    const last = o.pareto[o.pareto.length - 1];
    assert.ok(Math.abs(last.cumulativePct - 100) < 0.5, `last cumulativePct ${last.cumulativePct} should be ~100`);
  });

  // 20. pareto is ordered by descending net sales
  it("pareto entries are sorted by descending net sales", () => {
    const o = buildCeoOverview(FIXTURE);
    // Customer A = 120000, Customer C = 50000
    assert.equal(o.pareto[0].label, "Customer A");
    assert.equal(o.pareto[0].value, 120000);
    assert.equal(o.pareto[1].label, "Customer C");
    assert.equal(o.pareto[1].value, 50000);
  });

  // 21. topCustomers: top 8 by currentFy, both customers present
  it("topCustomers contains correct entries for currentFy", () => {
    const o = buildCeoOverview(FIXTURE);
    assert.ok(o.topCustomers.length <= 8);
    const a = o.topCustomers.find(c => c.name === "Customer A");
    assert.ok(a, "Customer A in topCustomers");
    assert.equal(a.current, 120000); // 130000 - 10000
    // perFy should have entries for all 3 FYs (Customer A appeared in all)
    assert.equal(a.perFy["FY 2024-25"], 95000);  // 100000-5000
    assert.equal(a.perFy["FY 2025-26"], 112000); // 120000-8000
    assert.equal(a.perFy["FY 2026-27"], 120000); // 130000-10000
  });

  // 22. topProducts: top 8 by itemGroup using line-level amount
  it("topProducts uses line-level amount aggregated by itemGroup", () => {
    const o = buildCeoOverview(FIXTURE);
    const bx = o.topProducts.find(p => p.brand === "Brand X");
    assert.ok(bx, "Brand X in topProducts");
    // FY 2026-27 Brand X: Sales line amount 130000 - Return line amount 10000 = 120000
    assert.equal(bx.current, 120000);
  });

  // 23. alerts: returnRate rising across all 3 FYs (3.1 → 5.0 → 5.6) → amber alert
  it("generates amber alert for rising return rate across all 3 FYs", () => {
    const o = buildCeoOverview(FIXTURE);
    const risingAlert = o.alerts.find(a => a.tone === "amber" && a.title.toLowerCase().includes("return rate"));
    assert.ok(risingAlert, "amber return rate rising alert present");
  });

  // 24. alerts: churned=1 in FY 2025-26 → red alert
  it("generates red alert when customers are churned", () => {
    const o = buildCeoOverview(FIXTURE, { fy: "FY 2025-26" });
    const churnAlert = o.alerts.find(a => a.tone === "red");
    assert.ok(churnAlert, "red churn alert present for FY 2025-26");
    assert.ok(churnAlert.title.includes("1"), "alert title mentions count");
  });

  // 25. alerts: new customers added → blue alert for FY 2025-26 (Customer C added)
  it("generates blue alert when new customers are added", () => {
    const o = buildCeoOverview(FIXTURE, { fy: "FY 2025-26" });
    const blueAlert = o.alerts.find(a => a.tone === "blue");
    assert.ok(blueAlert, "blue new-customer alert present for FY 2025-26");
  });

  // 26. yoyByQuarter has 4 entries Q1..Q4
  it("yoyByQuarter has 4 quarter entries", () => {
    const o = buildCeoOverview(FIXTURE);
    assert.equal(o.yoyByQuarter.length, 4);
    assert.deepStrictEqual(o.yoyByQuarter.map(q => q.q), ["Q1", "Q2", "Q3", "Q4"]);
  });

  // 27. Q1 curVsPrev: FY2026-27 Q1 vs FY2025-26 Q1
  //   FY2026-27 Q1 (Apr-Jun): 120000 + 50000 + 0 = 170000 (Apr=120k, May=50k)
  //   FY2025-26 Q1 (Apr-Jun): 112000 + 40000 + 0 = 152000
  //   curVsPrev = (170000-152000)/152000*100 ≈ 12 (int)
  it("yoyByQuarter Q1 curVsPrev matches computed value", () => {
    const o = buildCeoOverview(FIXTURE);
    const q1 = o.yoyByQuarter[0];
    const expected = Math.round((170000 - 152000) / 152000 * 100);
    assert.equal(q1.curVsPrev, expected);
  });

  // 28. null deltaPct when prev is 0/null (safe with only 1 FY)
  it("handles single-FY input without crashing", () => {
    const singleFy = {
      itemFacts: FIXTURE.itemFacts.filter(r => r.fy === "FY 2026-27"),
      ledgerFacts: FIXTURE.ledgerFacts.filter(r => r.fy === "FY 2026-27"),
      itemMaster: [],
    };
    const o = buildCeoOverview(singleFy);
    assert.equal(o.fyList.length, 1);
    assert.equal(o.prevFy, null);
    assert.equal(o.kpis.netSales.prev, 0);
    assert.equal(o.kpis.netSales.deltaPct, 0);
    assert.equal(o.kpis.netSales.prev2, 0);
  });

  // 29. empty input returns safe object
  it("handles empty dashData without crashing", () => {
    const o = buildCeoOverview({});
    assert.ok(Array.isArray(o.fyList));
    assert.ok(Array.isArray(o.alerts));
  });

  // 30. topCustomers yoyPct: Customer A FY2026-27 vs FY2025-26
  //   cur=120000, prev=112000 → yoyPct = (120000-112000)/112000*100 ≈ 7.14 → 7
  it("topCustomers yoyPct computed correctly", () => {
    const o = buildCeoOverview(FIXTURE);
    const a = o.topCustomers.find(c => c.name === "Customer A");
    const expected = Math.round((120000 - 112000) / 112000 * 100);
    assert.equal(a.yoyPct, expected);
  });
});
