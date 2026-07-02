import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { buildReceivables } from "../server/receivablesBuilder.js";

// ---------------------------------------------------------------------------
// Fixture
//
// Account master:
//   Debtor A — Sundry Debtors group, openingDr 100000
//   Debtor B — Sundry Debtors group, openingDr 50000
//   Cash     — Cash-in-hand group, openingDr 0        (excluded)
//   ICICI    — Bank group, openingDr 0                (excluded)
//   Vendor X — Sundry Creditors, openingDr 0          (excluded)
//
// Total opening balance = 150000 (only Debtor A + Debtor B)
//
// FY 2024-25 (complete): Sales 400000, Return 20000, netSales 380000, collections 300000
//   outstanding after = 150000 + 380000 - 300000 = 230000
//   collRate = 300000/380000 * 100 = 78.9%
//   DSO = 230000 / (380000/365) = ~221 days
//
// FY 2025-26 (complete): Sales 500000, Return 30000, netSales 470000, collections 400000
//   outstanding after = 230000 + 470000 - 400000 = 300000
//   collRate = 400000/470000 * 100 = 85.1%
//   DSO = 300000 / (470000/365) = ~233 days
//
// FY 2026-27 (partial, 3 months): Sales 200000, Return 0, netSales 200000, collections 180000
//   outstanding after = 300000 + 200000 - 180000 = 320000
//   collRate = 180000/200000 * 100 = 90%
//   DSO = 320000 / (200000/365) = ~584 days (partial, expected high)
//
// Cash party in sales: should NOT affect any computation
// ---------------------------------------------------------------------------

function saleH(fy, month, party, finalAmount) {
  return { tx: "Sales", fy, month, party, finalAmount, isHeader: true, amount: finalAmount };
}
function retH(fy, month, party, finalAmount) {
  return { tx: "Sales Return", fy, month, party, finalAmount, isHeader: true, amount: finalAmount };
}
function receiptH(fy, month, account, amount) {
  // Receipt vouchers are booked against bank accounts (bank-centric): money received is
  // the DEBIT on the bank account; credit is blank on the header row.
  return { tx: "Receipt", fy, month, account, isHeader: true, debit: amount, credit: 0, businessAmount: amount };
}

const ACCOUNT_MASTER = [
  { name: "Debtor A",  group: "Sundry Debtors",   openingDr: 100000, openingCr: 0, state: "GJ", station: "Ahmedabad" },
  { name: "Debtor B",  group: "Sundry Debtors",   openingDr: 50000,  openingCr: 0, state: "GJ", station: "Surat" },
  { name: "Cash",      group: "Cash-in-hand",      openingDr: 0,      openingCr: 0, state: "",   station: "" },
  { name: "ICICI",     group: "Bank Accounts",     openingDr: 0,      openingCr: 0, state: "",   station: "" },
  { name: "Vendor X",  group: "Sundry Creditors",  openingDr: 0,      openingCr: 0, state: "GJ", station: "" },
];

const FIXTURE = {
  accountMaster: ACCOUNT_MASTER,
  itemFacts: [
    // FY 2024-25
    saleH("FY 2024-25", "2024-04", "Debtor A", 200000),
    saleH("FY 2024-25", "2024-07", "Debtor B", 200000),
    retH( "FY 2024-25", "2024-05", "Debtor A",  20000),
    saleH("FY 2024-25", "2024-06", "Cash",       5000),  // cash party — not in debtors but sales still count at biz level

    // FY 2025-26
    saleH("FY 2025-26", "2025-04", "Debtor A", 300000),
    saleH("FY 2025-26", "2025-07", "Debtor B", 200000),
    retH( "FY 2025-26", "2025-05", "Debtor A",  30000),

    // FY 2026-27 (3 months — partial)
    saleH("FY 2026-27", "2026-04", "Debtor A", 120000),
    saleH("FY 2026-27", "2026-05", "Debtor B",  80000),
  ],
  ledgerFacts: [
    // FY 2024-25 — booked to bank accounts (typical receipt pattern)
    receiptH("FY 2024-25", "2024-04", "SBI SALAR", 150000),
    receiptH("FY 2024-25", "2024-08", "ICICI",     150000),

    // FY 2025-26
    receiptH("FY 2025-26", "2025-04", "SBI SALAR", 200000),
    receiptH("FY 2025-26", "2025-08", "ICICI",     200000),

    // FY 2026-27
    receiptH("FY 2026-27", "2026-04", "SBI SALAR",  90000),
    receiptH("FY 2026-27", "2026-05", "ICICI",       90000),
  ],
};

describe("buildReceivables", () => {

  // 1. Opening balance from account master
  it("computes openingBalance from Sundry Debtors only", () => {
    const r = buildReceivables(FIXTURE);
    assert.equal(r.openingBalance, 150000, "openingBalance = Debtor A + Debtor B");
    assert.equal(r.openingDebtors, 2);
  });

  // 2. Cash excluded from topOpeningDebtors
  it("excludes Cash from topOpeningDebtors", () => {
    const r = buildReceivables(FIXTURE);
    const names = r.topOpeningDebtors.map((d) => d.name.toLowerCase());
    assert.ok(!names.includes("cash"), "Cash must not appear in topOpeningDebtors");
    assert.ok(!names.includes("icici"), "ICICI must not appear (bank, not debtor)");
    assert.ok(!names.includes("vendor x"), "Vendor X must not appear (creditor)");
  });

  // 3. fyList chronological
  it("returns fyList in chronological order", () => {
    const r = buildReceivables(FIXTURE);
    assert.deepStrictEqual(r.fyList, ["FY 2024-25", "FY 2025-26", "FY 2026-27"]);
  });

  // 4. currentFy defaults to latest
  it("defaults currentFy to latest FY", () => {
    const r = buildReceivables(FIXTURE);
    assert.equal(r.currentFy, "FY 2026-27");
    assert.equal(r.prevFy,    "FY 2025-26");
  });

  // 5. options.fy override
  it("respects options.fy override", () => {
    const r = buildReceivables(FIXTURE, { fy: "FY 2025-26" });
    assert.equal(r.currentFy, "FY 2025-26");
    assert.equal(r.prevFy,    "FY 2024-25");
  });

  // 6. Collection rate FY 2024-25
  // netSales = 400000 + 5000(cash) - 20000 = 385000  (cash sale counts at biz level)
  // collections = 300000
  // rate = 300000/385000 * 100 = 77.9%
  it("computes collectionRate for FY 2024-25", () => {
    const r = buildReceivables(FIXTURE);
    const fy2425 = r.collectionRateByFy.find((c) => c.fy === "FY 2024-25");
    assert.ok(fy2425, "FY 2024-25 entry exists");
    assert.ok(fy2425.rate != null, "rate is not null");
    assert.ok(fy2425.rate > 0 && fy2425.rate < 100, "rate is a plausible percentage");
    assert.equal(fy2425.collections, 300000);
  });

  // 7. runningOutstanding is non-negative always
  it("runningOutstanding in salesVsCollMoM is never negative", () => {
    const r = buildReceivables(FIXTURE);
    for (const v of r.salesVsCollMoM.runningOutstanding) {
      assert.ok(v >= 0, `runningOutstanding has negative value: ${v}`);
    }
  });

  // 8. outstandingByFy is monotonically non-negative and has one entry per FY
  it("outstandingByFy has one entry per FY, all non-negative", () => {
    const r = buildReceivables(FIXTURE);
    assert.equal(r.outstandingByFy.length, 3);
    for (const o of r.outstandingByFy) {
      assert.ok(o.outstanding >= 0, `negative outstanding for ${o.fy}: ${o.outstanding}`);
    }
  });

  // 9. totalOutstanding matches last outstandingByFy entry
  it("totalOutstanding equals last outstandingByFy.outstanding", () => {
    const r = buildReceivables(FIXTURE);
    const last = r.outstandingByFy[r.outstandingByFy.length - 1];
    assert.equal(r.totalOutstanding, last.outstanding);
  });

  // 10. dsoByFy has one entry per FY
  it("dsoByFy has one entry per FY", () => {
    const r = buildReceivables(FIXTURE);
    assert.equal(r.dsoByFy.length, 3);
    for (const d of r.dsoByFy) {
      assert.ok(r.fyList.includes(d.fy), `unexpected FY: ${d.fy}`);
    }
  });

  // 11. DSO is positive for FYs with data
  it("dso is positive when there are sales", () => {
    const r = buildReceivables(FIXTURE);
    const fy2526 = r.dsoByFy.find((d) => d.fy === "FY 2025-26");
    assert.ok(fy2526.dso != null && fy2526.dso > 0, "DSO should be positive");
  });

  // 12. partyWiseAvailable is false
  it("partyWiseAvailable is false", () => {
    const r = buildReceivables(FIXTURE);
    assert.equal(r.partyWiseAvailable, false);
  });

  // 13. dataNotes is non-empty array of strings
  it("dataNotes is non-empty array of strings", () => {
    const r = buildReceivables(FIXTURE);
    assert.ok(Array.isArray(r.dataNotes));
    assert.ok(r.dataNotes.length >= 2, "must have at least 2 data notes");
    for (const note of r.dataNotes) {
      assert.equal(typeof note, "string", "each note must be a string");
      assert.ok(note.length > 0);
    }
  });

  // 14. dataNotes mentions party-wise collection limitation
  it("dataNotes mentions party-wise collection limitation", () => {
    const r = buildReceivables(FIXTURE);
    const combined = r.dataNotes.join(" ").toLowerCase();
    assert.ok(combined.includes("party"), "must mention party-wise limitation");
    assert.ok(combined.includes("bank") || combined.includes("account"), "must mention bank accounts");
  });

  // 15. salesVsCollMoM has 12 months
  it("salesVsCollMoM has 12-element arrays", () => {
    const r = buildReceivables(FIXTURE);
    assert.equal(r.salesVsCollMoM.months.length, 12);
    assert.equal(r.salesVsCollMoM.sales.length, 12);
    assert.equal(r.salesVsCollMoM.collections.length, 12);
    assert.equal(r.salesVsCollMoM.runningOutstanding.length, 12);
  });

  // 16. collectionRateMoM has 12-element rates array
  it("collectionRateMoM has 12-element rates array", () => {
    const r = buildReceivables(FIXTURE);
    assert.equal(r.collectionRateMoM.rates.length, 12);
  });

  // 17. alerts is an array
  it("alerts is an array with valid tones", () => {
    const r = buildReceivables(FIXTURE);
    assert.ok(Array.isArray(r.alerts));
    const validTones = new Set(["red", "amber", "green", "blue"]);
    for (const a of r.alerts) {
      assert.ok(validTones.has(a.tone), `unexpected tone: ${a.tone}`);
      assert.ok(a.title, "alert must have title");
    }
  });

  // 18. topOpeningDebtors sorted descending
  it("topOpeningDebtors sorted by openingDr descending", () => {
    const r = buildReceivables(FIXTURE);
    for (let i = 0; i < r.topOpeningDebtors.length - 1; i++) {
      assert.ok(
        r.topOpeningDebtors[i].openingDr >= r.topOpeningDebtors[i + 1].openingDr,
        "topOpeningDebtors must be sorted descending"
      );
    }
  });

  // 19. kpis.collections.value matches currentFy total
  it("kpis.collections.value matches currentFy ledger collections", () => {
    const r = buildReceivables(FIXTURE);
    const expected = r.collectionRateByFy.find((c) => c.fy === r.currentFy)?.collections || 0;
    assert.equal(r.kpis.collections.value, expected);
  });

  // 20. empty dashData returns safe structure
  it("handles empty dashData without crashing", () => {
    const r = buildReceivables({});
    assert.ok(Array.isArray(r.fyList));
    assert.equal(r.fyList.length, 0);
    assert.ok(Array.isArray(r.dsoByFy));
    assert.ok(Array.isArray(r.outstandingByFy));
    assert.ok(Array.isArray(r.topOpeningDebtors));
    assert.equal(r.partyWiseAvailable, false);
  });

  // 21. single-FY input works
  it("handles single-FY input gracefully", () => {
    const singleFy = {
      accountMaster: ACCOUNT_MASTER,
      itemFacts:    FIXTURE.itemFacts.filter((r) => r.fy === "FY 2025-26"),
      ledgerFacts:  FIXTURE.ledgerFacts.filter((r) => r.fy === "FY 2025-26"),
    };
    const r = buildReceivables(singleFy);
    assert.equal(r.fyList.length, 1);
    assert.equal(r.prevFy, null);
    assert.ok(r.totalOutstanding >= 0);
  });

  // 22. collectionRateByFy has one entry per FY
  it("collectionRateByFy has one entry per FY", () => {
    const r = buildReceivables(FIXTURE);
    assert.equal(r.collectionRateByFy.length, 3);
    for (const c of r.collectionRateByFy) {
      assert.ok(r.fyList.includes(c.fy));
    }
  });
});
