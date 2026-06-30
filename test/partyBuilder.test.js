import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { buildPartyAnalysis } from "../server/partyBuilder.js";

// ---------------------------------------------------------------------------
// Fixture design
//
// FY 2025-26 — all facts in this FY
// Customers:
//   Customer A — 4 bills across 10 months (Regular), last order 2025-04
//                grossSales=500000, returns=25000
//   Customer B — 2 bills across 2 months (One-time/Lost), last order 2025-05
//                grossSales=80000, returns=0
//                daysSilent relative to asOfDate (2025-05-10) ... but asOf is
//                max bill date = 2025-10-01, so daysSilent = days(2025-05-10 to 2025-10-01) = 144 → silent
//   Cash        — must be excluded entirely
//   Customer C  — 1 bill, 1 month (One-time/Lost), last order 2025-10-01 = asOf → daysSilent=0 → not silent
//
// asOfDate = max Sales header date = 2025-10-01
//
// Returns note: isHeader returns for Customer A exist.
//
// Ledger:
//   Receipt from Customer A: credit=200000
// ---------------------------------------------------------------------------

function sh(fy, month, date, party, finalAmount) {
  return { tx: "Sales", fy, month, date, party, item: "I1", itemGroup: "G1", qty: 0, amount: 0, finalAmount, isHeader: true, state: "GJ" };
}
function sl(fy, month, date, party, amount) {
  return { tx: "Sales", fy, month, date, party, item: "I1", itemGroup: "G1", qty: 10, amount, finalAmount: 0, isHeader: false, state: "GJ" };
}
function rh(fy, month, date, party, finalAmount) {
  return { tx: "Sales Return", fy, month, date, party, item: "I1", itemGroup: "G1", qty: 0, amount: 0, finalAmount, isHeader: true, state: "GJ" };
}
function receipt(fy, month, account, credit) {
  return { tx: "Receipt", fy, month, account, debit: 0, credit };
}

// Customer A: 4 bills spread over 10 months (Apr, May, Jun, Jul, Aug, Sep, Oct, Nov = 8... let's do 10)
// We spread bills across 10 different months to get monthsActive=10 → Regular segment
const FY = "FY 2025-26";

const FIXTURE = {
  itemFacts: [
    // Customer A — 4 bills across 10 distinct months
    sh(FY, "2025-04", "2025-04-05", "Customer A", 100000),
    sl(FY, "2025-04", "2025-04-05", "Customer A", 100000),
    sh(FY, "2025-05", "2025-05-02", "Customer A", 100000),
    sl(FY, "2025-05", "2025-05-02", "Customer A", 100000),
    sh(FY, "2025-06", "2025-06-03", "Customer A", 100000),
    sl(FY, "2025-06", "2025-06-03", "Customer A", 100000),
    sh(FY, "2025-07", "2025-07-01", "Customer A", 100000),
    sl(FY, "2025-07", "2025-07-01", "Customer A", 100000),
    // Spread to more months by adding single lines (non-header only) — no, need headers for bills/months
    // Let's add 6 more header bills with minimal amounts to 6 more months:
    sh(FY, "2025-08", "2025-08-01", "Customer A", 10000),
    sl(FY, "2025-08", "2025-08-01", "Customer A", 10000),
    sh(FY, "2025-09", "2025-09-01", "Customer A", 10000),
    sl(FY, "2025-09", "2025-09-01", "Customer A", 10000),
    sh(FY, "2025-10", "2025-10-01", "Customer A", 10000),
    sl(FY, "2025-10", "2025-10-01", "Customer A", 10000),
    sh(FY, "2025-11", "2025-11-01", "Customer A", 10000),
    sl(FY, "2025-11", "2025-11-01", "Customer A", 10000),
    sh(FY, "2025-12", "2025-12-01", "Customer A", 10000),
    sl(FY, "2025-12", "2025-12-01", "Customer A", 10000),
    sh(FY, "2026-01", "2026-01-01", "Customer A", 10000),
    sl(FY, "2026-01", "2026-01-01", "Customer A", 10000),
    // Sales Return for Customer A
    rh(FY, "2025-04", "2025-04-10", "Customer A", 25000),

    // Customer B — 2 bills in 2 months, last order 2025-05-10 (asOf=2026-01-01 → daysSilent=236)
    sh(FY, "2025-04", "2025-04-15", "Customer B", 40000),
    sl(FY, "2025-04", "2025-04-15", "Customer B", 40000),
    sh(FY, "2025-05", "2025-05-10", "Customer B", 40000),
    sl(FY, "2025-05", "2025-05-10", "Customer B", 40000),

    // Cash — must be excluded
    sh(FY, "2025-04", "2025-04-05", "Cash", 50000),
    sl(FY, "2025-04", "2025-04-05", "Cash", 50000),
    // Also test case-insensitive: CASH
    sh(FY, "2025-05", "2025-05-01", "CASH", 30000),
    sl(FY, "2025-05", "2025-05-01", "CASH", 30000),

    // Customer C — 1 bill, last order = asOfDate (2026-01-01) → daysSilent=0 → not silent
    sh(FY, "2026-01", "2026-01-01", "Customer C", 20000),
    sl(FY, "2026-01", "2026-01-01", "Customer C", 20000),
  ],
  ledgerFacts: [
    receipt(FY, "2025-04", "Customer A", 200000),
    // Cash receipt should not be applied (Customer A map will not have Cash)
    receipt(FY, "2025-04", "Cash", 10000),
  ],
  itemMaster: [],
};

// ---------------------------------------------------------------------------
// Expected derived values
//
// asOfDate = max Sales header date = 2026-01-01 (Customer A Jan)
//
// Customer A:
//   grossSales = 100000+100000+100000+100000+10000+10000+10000+10000+10000+10000 = 460000
//   Wait: Apr+May+Jun+Jul bills (4×100k) + Aug..Jan bills (6×10k) = 400000+60000 = 460000
//   returns = 25000
//   netSales = 435000
//   bills = 10 (one per month × 10 months)
//   monthsActive = 10 (Apr May Jun Jul Aug Sep Oct Nov Dec Jan)
//   segment = Regular (≥10)
//   lastOrder = 2026-01-01 = asOfDate → daysSilent = 0 → not silent
//   avgBill = 435000/10 = 43500
//   returnPct = 25000/460000*100 = 5.43...% → round1 = 5.4
//
// Customer B:
//   grossSales = 80000
//   returns = 0
//   netSales = 80000
//   bills = 2
//   monthsActive = 2 (Apr, May)
//   segment = One-time/Lost (≤2)
//   lastOrder = 2025-05-10
//   daysSilent = days(2025-05-10 to 2026-01-01) = 236 → silent
//   avgBill = 40000
//
// Customer C:
//   grossSales = 20000
//   netSales = 20000
//   bills = 1
//   monthsActive = 1
//   segment = One-time/Lost
//   lastOrder = 2026-01-01 = asOf → daysSilent = 0 → not silent
//
// Cash: excluded
//
// KPIs:
//   tradeCustomers = 3 (A, B, C)
//   netSalesTrade = 435000+80000+20000 = 535000
//   totalBills = 10+2+1 = 13
//   avgBillValue = 535000/13 = 41153.84... → round = 41154
//   regularBuyers = 1 (Customer A only)
//   silentParties = 1 (Customer B)
// ---------------------------------------------------------------------------

const round1 = (v) => Math.round(v * 10) / 10;

describe("buildPartyAnalysis", () => {

  it("excludes Cash (exact) from all outputs", () => {
    const o = buildPartyAnalysis(FIXTURE, { fy: FY });
    const inTable = o.table.some(r => r.name.toLowerCase() === "cash");
    assert.equal(inTable, false, "Cash must not appear in table");
    const inSilent = o.silentAlert.some(r => r.name.toLowerCase() === "cash");
    assert.equal(inSilent, false);
  });

  it("excludes CASH (case-insensitive) from all outputs", () => {
    const o = buildPartyAnalysis(FIXTURE, { fy: FY });
    const names = o.table.map(r => r.name.toLowerCase());
    assert.ok(!names.includes("cash"), "CASH must not appear in table");
  });

  it("returns correct asOfDate as max Sales header date", () => {
    const o = buildPartyAnalysis(FIXTURE, { fy: FY });
    assert.equal(o.asOfDate, "2026-01-01");
  });

  it("computes tradeCustomers = 3 (A, B, C; Cash excluded)", () => {
    const o = buildPartyAnalysis(FIXTURE, { fy: FY });
    assert.equal(o.kpis.tradeCustomers, 3);
  });

  it("computes netSalesTrade = 535000", () => {
    const o = buildPartyAnalysis(FIXTURE, { fy: FY });
    assert.equal(o.kpis.netSalesTrade, 535000);
  });

  it("computes regularBuyers = 1 (only Customer A has >=10 active months)", () => {
    const o = buildPartyAnalysis(FIXTURE, { fy: FY });
    assert.equal(o.kpis.regularBuyers, 1);
  });

  it("computes silentParties = 1 (only Customer B is >90d silent)", () => {
    const o = buildPartyAnalysis(FIXTURE, { fy: FY });
    assert.equal(o.kpis.silentParties, 1);
  });

  it("computes Customer A returnPct correctly", () => {
    const o = buildPartyAnalysis(FIXTURE, { fy: FY });
    const a = o.table.find(r => r.name === "Customer A");
    assert.ok(a, "Customer A in table");
    const expected = round1((25000 / 460000) * 100);
    assert.equal(a.returnPct, expected);
  });

  it("assigns Customer A to Regular segment (10 active months)", () => {
    const o = buildPartyAnalysis(FIXTURE, { fy: FY });
    const a = o.table.find(r => r.name === "Customer A");
    assert.equal(a.segment, "Regular");
  });

  it("assigns Customer B to One-time/Lost segment (2 active months)", () => {
    const o = buildPartyAnalysis(FIXTURE, { fy: FY });
    const b = o.table.find(r => r.name === "Customer B");
    assert.equal(b.segment, "One-time/Lost");
  });

  it("detects Customer B as silent (>90d)", () => {
    const o = buildPartyAnalysis(FIXTURE, { fy: FY });
    const b = o.table.find(r => r.name === "Customer B");
    assert.ok(b.daysSilent > 90, `daysSilent=${b.daysSilent} should be >90`);
    assert.ok(b.status.startsWith("Silent"), `status='${b.status}' should start with Silent`);
  });

  it("does NOT mark Customer C as silent (last order = asOfDate)", () => {
    const o = buildPartyAnalysis(FIXTURE, { fy: FY });
    const c = o.table.find(r => r.name === "Customer C");
    assert.ok(c, "Customer C in table");
    assert.equal(c.daysSilent, 0);
    assert.ok(!c.status.startsWith("Silent"), `status='${c.status}' should not be Silent`);
  });

  it("silentAlert contains Customer B and not Cash or Customer C", () => {
    const o = buildPartyAnalysis(FIXTURE, { fy: FY });
    const names = o.silentAlert.map(r => r.name);
    assert.ok(names.includes("Customer B"), "Customer B in silentAlert");
    assert.ok(!names.includes("Cash"), "Cash not in silentAlert");
    assert.ok(!names.includes("Customer C"), "Customer C not in silentAlert (not silent)");
  });

  it("table is sorted by netSales descending", () => {
    const o = buildPartyAnalysis(FIXTURE, { fy: FY });
    for (let i = 0; i < o.table.length - 1; i++) {
      assert.ok(o.table[i].netSales >= o.table[i + 1].netSales,
        `Row ${i} netSales ${o.table[i].netSales} >= row ${i+1} netSales ${o.table[i+1].netSales}`);
    }
  });

  it("Customer A netSales = 435000", () => {
    const o = buildPartyAnalysis(FIXTURE, { fy: FY });
    const a = o.table.find(r => r.name === "Customer A");
    assert.equal(a.netSales, 435000);
  });

  it("Customer A bills = 10", () => {
    const o = buildPartyAnalysis(FIXTURE, { fy: FY });
    const a = o.table.find(r => r.name === "Customer A");
    assert.equal(a.bills, 10);
  });

  it("segments array has 4 entries covering all keys", () => {
    const o = buildPartyAnalysis(FIXTURE, { fy: FY });
    assert.equal(o.segments.length, 4);
    const keys = o.segments.map(s => s.key);
    assert.ok(keys.includes("regular"));
    assert.ok(keys.includes("active"));
    assert.ok(keys.includes("occasional"));
    assert.ok(keys.includes("lost"));
  });

  it("Regular segment count = 1, pct ≈ 33.3", () => {
    const o = buildPartyAnalysis(FIXTURE, { fy: FY });
    const reg = o.segments.find(s => s.key === "regular");
    assert.equal(reg.count, 1);
    assert.equal(reg.pct, round1((1 / 3) * 100));
  });

  it("momTop4 has <=4 series and 12 months", () => {
    const o = buildPartyAnalysis(FIXTURE, { fy: FY });
    assert.ok(o.momTop4.series.length <= 4);
    assert.equal(o.momTop4.months.length, 12);
    for (const s of o.momTop4.series) {
      assert.equal(s.values.length, 12, `Series ${s.name} should have 12 values`);
    }
  });

  it("fyList is returned and includes the fixture FY", () => {
    const o = buildPartyAnalysis(FIXTURE, { fy: FY });
    assert.ok(o.fyList.includes(FY));
  });

  it("returns empty result for empty dashData without crashing", () => {
    const o = buildPartyAnalysis({});
    assert.ok(Array.isArray(o.fyList));
    assert.equal(o.fyList.length, 0);
    assert.equal(o.kpis.tradeCustomers, 0);
  });

  it("avgBillValue = netSalesTrade / totalBills", () => {
    const o = buildPartyAnalysis(FIXTURE, { fy: FY });
    // netSalesTrade = 535000, totalBills = 13
    const expected = Math.round(535000 / 13);
    assert.equal(o.kpis.avgBillValue, expected);
  });

  it("topByFrequency top entry is Customer A (10 bills)", () => {
    const o = buildPartyAnalysis(FIXTURE, { fy: FY });
    assert.equal(o.topByFrequency[0].name, "Customer A");
    assert.equal(o.topByFrequency[0].bills, 10);
  });

  it("netSalesRanking has <= 10 entries sorted by netSales desc", () => {
    const o = buildPartyAnalysis(FIXTURE, { fy: FY });
    assert.ok(o.netSalesRanking.length <= 10);
    assert.equal(o.netSalesRanking[0].name, "Customer A");
  });
});
