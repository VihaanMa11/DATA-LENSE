import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { buildReceivables, isDebtorGroup, DEBTOR_GROUP_PATTERNS } from "../server/receivablesBuilder.js";

// ---------------------------------------------------------------------------
// Fixture — models the real MLH Account Master shape:
//   - "Debtor A" / "Debtor B": plain Sundry Debtors, never reclassified.
//   - "Zone Party Z": Sundry Debtors in FY2024-25 (real opening 20000), reclassified
//     to a zone group ("ZONE-1(TEST)") in FY2025-26/26-27 (blank opening on re-export
//     — this mirrors the real Account Master, which repeats the roster once per FY
//     and only the earliest block carries a non-blank opening balance).
//   - "New Zone Party": brand-new customer acquired in FY2025-26, tagged directly
//     with a zone group from day one (no Sundry Debtors history, zero opening).
//   - "Cash" / "ICICI" / "SBI SALAR" / "Vendor X": must never appear as debtors.
//
// Receipt vouchers are modeled bank-centric (header row on the bank account, isHeader
// true) plus a non-header contra row crediting the party — exactly like the real
// Receipt sheet. One receipt (R3) is deliberately routed to a non-debtor contra
// (a "SALARY" account) to exercise the unallocated-receipt diagnostic.
// ---------------------------------------------------------------------------

function saleH(fy, month, date, party, finalAmount, accountGroup) {
  return { tx: "Sales", fy, month, date, party, finalAmount, isHeader: true, accountGroup };
}
function retH(fy, month, date, party, finalAmount, accountGroup) {
  return { tx: "Sales Return", fy, month, date, party, finalAmount, isHeader: true, accountGroup };
}
function noteH(tx, fy, month, date, account, businessAmount, accountGroup) {
  return { tx, fy, month, date, account, businessAmount, isHeader: true, accountGroup };
}
function receiptPair(fy, month, date, bank, party, amount, accountGroup) {
  return [
    { tx: "Receipt", fy, month, date, account: bank, isHeader: true, debit: amount, credit: 0 },
    { tx: "Receipt", fy, month, date, account: party, isHeader: false, debit: 0, credit: amount, accountGroup },
  ];
}

const ACCOUNT_MASTER = [
  { name: "Debtor A", group: "Sundry Debtors", openingDr: 100000, openingCr: 0, fy: "FY 2024-25" },
  { name: "Debtor B", group: "Sundry Debtors", openingDr: 50000,  openingCr: 0, fy: "FY 2024-25" },
  // Zone Party Z: reclassified across FY blocks — only the earliest carries opening.
  { name: "Zone Party Z", group: "Sundry Debtors",   openingDr: 20000, openingCr: 0, fy: "FY 2024-25" },
  { name: "Zone Party Z", group: "ZONE-1(TEST)",     openingDr: 0,     openingCr: 0, fy: "FY 2025-26" },
  { name: "Zone Party Z", group: "ZONE-1(TEST)",     openingDr: 0,     openingCr: 0, fy: "FY 2026-27" },
  // New Zone Party: acquired in FY2025-26 directly under a zone group.
  { name: "New Zone Party", group: "ZONE-2(TEST)", openingDr: 0, openingCr: 0, fy: "FY 2025-26" },
  { name: "New Zone Party", group: "ZONE-2(TEST)", openingDr: 0, openingCr: 0, fy: "FY 2026-27" },
  { name: "Cash",      group: "Cash-in-hand",  openingDr: 0, openingCr: 0, fy: "FY 2024-25" },
  { name: "ICICI",     group: "Bank Accounts", openingDr: 0, openingCr: 0, fy: "FY 2024-25" },
  { name: "SBI SALAR", group: "Bank Accounts", openingDr: 0, openingCr: 0, fy: "FY 2024-25" },
  { name: "Vendor X",  group: "Sundry Creditors", openingDr: 0, openingCr: 0, fy: "FY 2024-25" },
];

const FIXTURE = {
  accountMaster: ACCOUNT_MASTER,
  itemFacts: [
    // FY 2024-25
    saleH("FY 2024-25", "2024-04", "2024-04-10", "Debtor A", 200000, "Sundry Debtors"),
    retH( "FY 2024-25", "2024-05", "2024-05-15", "Debtor A", 20000,  "Sundry Debtors"),
    saleH("FY 2024-25", "2024-07", "2024-07-10", "Debtor B", 200000, "Sundry Debtors"),
    saleH("FY 2024-25", "2024-06", "2024-06-05", "Zone Party Z", 100000, "Sundry Debtors"),
    saleH("FY 2024-25", "2024-06", "2024-06-01", "Cash", 5000, "Cash-in-hand"),

    // FY 2025-26
    saleH("FY 2025-26", "2025-04", "2025-04-12", "Debtor A", 300000, "Sundry Debtors"),
    retH( "FY 2025-26", "2025-05", "2025-05-20", "Debtor A", 30000,  "Sundry Debtors"),
    saleH("FY 2025-26", "2025-07", "2025-07-08", "Debtor B", 200000, "Sundry Debtors"),
    saleH("FY 2025-26", "2025-06", "2025-06-10", "Zone Party Z", 150000, "ZONE-1(TEST)"),
    saleH("FY 2025-26", "2025-08", "2025-08-01", "New Zone Party", 60000, "ZONE-2(TEST)"),

    // FY 2026-27 (partial)
    saleH("FY 2026-27", "2026-04", "2026-04-05", "Debtor A", 120000, "Sundry Debtors"),
    saleH("FY 2026-27", "2026-05", "2026-05-05", "Debtor B", 80000,  "Sundry Debtors"),
    saleH("FY 2026-27", "2026-04", "2026-04-15", "Zone Party Z", 50000, "ZONE-1(TEST)"),
    saleH("FY 2026-27", "2026-05", "2026-05-10", "New Zone Party", 40000, "ZONE-2(TEST)"),
  ],
  ledgerFacts: [
    noteH("Debit Note",  "FY 2024-25", "2024-04", "2024-04-20", "Debtor A", 5000, "Sundry Debtors"),
    noteH("Credit Note", "FY 2024-25", "2024-07", "2024-07-20", "Debtor B", 3000, "Sundry Debtors"),

    ...receiptPair("FY 2024-25", "2024-04", "2024-04-25", "SBI SALAR", "Debtor A", 150000, "Sundry Debtors"),
    ...receiptPair("FY 2024-25", "2024-08", "2024-08-05", "ICICI",     "Debtor B", 150000, "Sundry Debtors"),
    // Unallocated: contra lands on a non-debtor (SALARY) account, not a party.
    { tx: "Receipt", fy: "FY 2024-25", month: "2024-05", date: "2024-05-01", account: "Cash", isHeader: true, debit: 2000, credit: 0 },
    { tx: "Receipt", fy: "FY 2024-25", month: "2024-05", date: "2024-05-01", account: "Some Employee", isHeader: false, debit: 0, credit: 2000, accountGroup: "SALARY" },

    ...receiptPair("FY 2025-26", "2025-04", "2025-04-20", "SBI SALAR", "Debtor A", 200000, "Sundry Debtors"),
    ...receiptPair("FY 2025-26", "2025-08", "2025-08-10", "ICICI",     "Debtor B", 200000, "Sundry Debtors"),
    ...receiptPair("FY 2025-26", "2025-06", "2025-06-15", "ICICI",     "Zone Party Z", 90000, "ZONE-1(TEST)"),

    ...receiptPair("FY 2026-27", "2026-04", "2026-04-20", "SBI SALAR", "Debtor A", 90000, "Sundry Debtors"),
    ...receiptPair("FY 2026-27", "2026-05", "2026-05-20", "ICICI",     "Debtor B", 90000, "Sundry Debtors"),
  ],
};

describe("isDebtorGroup", () => {
  it("recognizes Sundry Debtors and configured zone/region patterns", () => {
    assert.ok(isDebtorGroup("Sundry Debtors"));
    assert.ok(isDebtorGroup("SURI"));
    assert.ok(isDebtorGroup("ZONE-1(HOW/HOG/KOL/24 PGS"));
    assert.ok(isDebtorGroup("ZONE-6(AJAY)"));
    assert.ok(isDebtorGroup("JHARKHAND"));
    assert.ok(isDebtorGroup("BIHAR"));
    assert.ok(isDebtorGroup("ODISHA"));
    assert.ok(isDebtorGroup("Burdwan"));
  });

  it("rejects bank / creditor / expense groups", () => {
    assert.ok(!isDebtorGroup("Bank Accounts"));
    assert.ok(!isDebtorGroup("Cash-in-hand"));
    assert.ok(!isDebtorGroup("Sundry Creditors"));
    assert.ok(!isDebtorGroup("Expenses (Indirect/Admn.)"));
    assert.ok(!isDebtorGroup(""));
    assert.ok(!isDebtorGroup(undefined));
  });

  it("exposes the pattern list as configurable (not a single hardcoded string)", () => {
    assert.ok(Array.isArray(DEBTOR_GROUP_PATTERNS));
    assert.ok(DEBTOR_GROUP_PATTERNS.length > 1);
  });
});

describe("buildReceivables — opening balances (zone-group aware)", () => {
  it("includes zone-group and region-group accounts in openingBalance, not just Sundry Debtors", () => {
    const r = buildReceivables(FIXTURE);
    // 100000 (A) + 50000 (B) + 20000 (Z, from its earliest/Sundry-Debtors block) + 0 (New)
    assert.equal(r.openingBalance, 170000);
    assert.equal(r.openingDebtors, 4);
  });

  it("picks the earliest FY block's opening balance for a reclassified party, not a later blank block", () => {
    const r = buildReceivables(FIXTURE);
    const zone = r.topOpeningDebtors.find((d) => d.name === "Zone Party Z");
    assert.ok(zone, "Zone Party Z must appear in topOpeningDebtors");
    assert.equal(zone.openingDr, 20000);
  });

  it("excludes Cash, banks, and creditors from topOpeningDebtors", () => {
    const r = buildReceivables(FIXTURE);
    const names = r.topOpeningDebtors.map((d) => d.name.toLowerCase());
    assert.ok(!names.includes("cash"));
    assert.ok(!names.includes("icici"));
    assert.ok(!names.includes("sbi salar"));
    assert.ok(!names.includes("vendor x"));
  });

  it("topOpeningDebtors sorted descending", () => {
    const r = buildReceivables(FIXTURE);
    for (let i = 0; i < r.topOpeningDebtors.length - 1; i++) {
      assert.ok(r.topOpeningDebtors[i].openingDr >= r.topOpeningDebtors[i + 1].openingDr);
    }
  });
});

describe("buildReceivables — FY resolution", () => {
  it("returns fyList in chronological order", () => {
    const r = buildReceivables(FIXTURE);
    assert.deepStrictEqual(r.fyList, ["FY 2024-25", "FY 2025-26", "FY 2026-27"]);
  });

  it("defaults currentFy to latest FY when none is complete", () => {
    const r = buildReceivables(FIXTURE);
    assert.equal(r.currentFy, "FY 2026-27");
    assert.equal(r.prevFy, "FY 2025-26");
  });

  it("respects options.fy override", () => {
    const r = buildReceivables(FIXTURE, { fy: "FY 2025-26" });
    assert.equal(r.currentFy, "FY 2025-26");
    assert.equal(r.prevFy, "FY 2024-25");
  });
});

describe("buildReceivables — party-level outstanding reconstruction", () => {
  it("computes outstanding as opening + Sales + DrNote - SalesReturn - CrNote - allocated receipts", () => {
    const r = buildReceivables(FIXTURE, { fy: "FY 2024-25" });
    const a = r.topDebtors.find((d) => d.name === "Debtor A");
    // opening 100000 + sales 200000 + drNote 5000 - return 20000 - receipts 150000 = 135000
    assert.equal(a.outstanding, 135000);
  });

  it("allocates receipts to the specific party via the Receipt contra row, not the bank ledger", () => {
    const r = buildReceivables(FIXTURE, { fy: "FY 2024-25" });
    const b = r.topDebtors.find((d) => d.name === "Debtor B");
    // opening 50000 + sales 200000 - crNote 3000 - receipts 150000 = 97000
    assert.equal(b.outstanding, 97000);
  });

  it("recognizes a zone-group-only party (never tagged Sundry Debtors) with correct outstanding", () => {
    const r = buildReceivables(FIXTURE, { fy: "FY 2025-26" });
    const nz = r.topDebtors.find((d) => d.name === "New Zone Party");
    assert.ok(nz, "New Zone Party must appear even though it was never a 'Sundry Debtors' account");
    assert.equal(nz.outstanding, 60000);
  });

  it("carries a reclassified party's balance across its group change (Sundry Debtors -> ZONE-1)", () => {
    const r = buildReceivables(FIXTURE, { fy: "FY 2026-27" });
    const z = r.topDebtors.find((d) => d.name === "Zone Party Z");
    // 20000 opening + 100000 + 150000 + 50000 sales - 90000 receipts = 230000
    assert.equal(z.outstanding, 230000);
  });

  it("total outstanding reconciles exactly to the sum of party-level outstanding", () => {
    for (const fy of ["FY 2024-25", "FY 2025-26", "FY 2026-27"]) {
      const r = buildReceivables(FIXTURE, { fy });
      const sumParties = r.topDebtors.reduce((s, p) => s + p.outstanding, 0);
      assert.equal(r.totalOutstanding, sumParties, `mismatch for ${fy}`);
    }
  });

  it("changes the outstanding snapshot when the FY toggle changes", () => {
    const rCur = buildReceivables(FIXTURE);
    const rPrev = buildReceivables(FIXTURE, { fy: "FY 2025-26" });
    assert.notEqual(rCur.totalOutstanding, rPrev.totalOutstanding);
    assert.equal(rPrev.totalOutstanding, 542000);
    assert.equal(rCur.totalOutstanding, 652000);
  });

  it("partyWiseAvailable is true", () => {
    const r = buildReceivables(FIXTURE);
    assert.equal(r.partyWiseAvailable, true);
  });
});

describe("buildReceivables — ageing (FIFO approximation)", () => {
  it("agingBuckets sum reconciles to totalOutstanding", () => {
    const r = buildReceivables(FIXTURE);
    const sum = r.agingBuckets.current + r.agingBuckets.d31_60 + r.agingBuckets.d61_90 + r.agingBuckets.d90plus;
    assert.ok(Math.abs(sum - r.totalOutstanding) <= 2, `aging sum ${sum} vs total ${r.totalOutstanding}`);
  });

  it("attaches ageing detail onto topDebtors rows", () => {
    const r = buildReceivables(FIXTURE);
    for (const row of r.topDebtors) {
      assert.equal(typeof row.oldestAgeDays, "number");
      assert.equal(typeof row.openInvoiceCount, "number");
    }
  });

  it("exposes an asOfDate for the ageing snapshot", () => {
    const r = buildReceivables(FIXTURE);
    assert.ok(r.agingAsOfDate);
  });
});

describe("buildReceivables — FY-level aggregates", () => {
  it("outstandingByFy has one entry per FY, all non-negative", () => {
    const r = buildReceivables(FIXTURE);
    assert.equal(r.outstandingByFy.length, 3);
    for (const o of r.outstandingByFy) assert.ok(o.outstanding >= 0);
    assert.equal(r.outstandingByFy.find((o) => o.fy === "FY 2024-25").outstanding, 352000);
    assert.equal(r.outstandingByFy.find((o) => o.fy === "FY 2025-26").outstanding, 542000);
    assert.equal(r.outstandingByFy.find((o) => o.fy === "FY 2026-27").outstanding, 652000);
  });

  it("totalOutstanding matches the currentFy entry in outstandingByFy", () => {
    const r = buildReceivables(FIXTURE, { fy: "FY 2025-26" });
    const match = r.outstandingByFy.find((o) => o.fy === "FY 2025-26");
    assert.equal(r.totalOutstanding, match.outstanding);
  });

  it("collectionRateByFy has one entry per FY with plausible rates", () => {
    const r = buildReceivables(FIXTURE);
    assert.equal(r.collectionRateByFy.length, 3);
    const fy2425 = r.collectionRateByFy.find((c) => c.fy === "FY 2024-25");
    assert.ok(fy2425.rate > 0 && fy2425.rate < 100);
    assert.equal(fy2425.collections, 300000);
  });

  it("dsoByFy has one positive entry per FY", () => {
    const r = buildReceivables(FIXTURE);
    assert.equal(r.dsoByFy.length, 3);
    for (const d of r.dsoByFy) assert.ok(d.dso == null || d.dso > 0);
  });

  it("runningOutstanding in salesVsCollMoM is never negative", () => {
    const r = buildReceivables(FIXTURE);
    for (const v of r.salesVsCollMoM.runningOutstanding) assert.ok(v >= 0);
  });

  it("salesVsCollMoM and collectionRateMoM have 12-element arrays", () => {
    const r = buildReceivables(FIXTURE);
    assert.equal(r.salesVsCollMoM.months.length, 12);
    assert.equal(r.salesVsCollMoM.sales.length, 12);
    assert.equal(r.salesVsCollMoM.collections.length, 12);
    assert.equal(r.salesVsCollMoM.runningOutstanding.length, 12);
    assert.equal(r.collectionRateMoM.rates.length, 12);
  });

  it("kpis.collections.value matches currentFy ledger collections", () => {
    const r = buildReceivables(FIXTURE);
    const expected = r.collectionRateByFy.find((c) => c.fy === r.currentFy)?.collections || 0;
    assert.equal(r.kpis.collections.value, expected);
  });
});

describe("buildReceivables — data notes and audit trail", () => {
  it("dataNotes is a non-empty array of strings mentioning party/bank allocation", () => {
    const r = buildReceivables(FIXTURE);
    assert.ok(Array.isArray(r.dataNotes));
    assert.ok(r.dataNotes.length >= 2);
    for (const note of r.dataNotes) {
      assert.equal(typeof note, "string");
      assert.ok(note.length > 0);
    }
    const combined = r.dataNotes.join(" ").toLowerCase();
    assert.ok(combined.includes("party"));
    assert.ok(combined.includes("bank"));
  });

  it("flags the unallocated receipt (contra to a non-debtor SALARY account)", () => {
    const r = buildReceivables(FIXTURE);
    const combined = r.dataNotes.join(" ").toLowerCase();
    assert.ok(combined.includes("2,000") || combined.includes("2000"), "must surface the unallocated amount");
  });

  it("alerts is an array with valid tones", () => {
    const r = buildReceivables(FIXTURE);
    assert.ok(Array.isArray(r.alerts));
    const validTones = new Set(["red", "amber", "green", "blue"]);
    for (const a of r.alerts) {
      assert.ok(validTones.has(a.tone));
      assert.ok(a.title);
    }
  });
});

describe("buildReceivables — edge cases", () => {
  it("handles empty dashData without crashing", () => {
    const r = buildReceivables({});
    assert.ok(Array.isArray(r.fyList));
    assert.equal(r.fyList.length, 0);
    assert.ok(Array.isArray(r.dsoByFy));
    assert.ok(Array.isArray(r.outstandingByFy));
    assert.ok(Array.isArray(r.topOpeningDebtors));
    assert.ok(Array.isArray(r.topDebtors));
    assert.equal(r.partyWiseAvailable, true);
  });

  it("handles single-FY input gracefully", () => {
    const singleFy = {
      accountMaster: ACCOUNT_MASTER,
      itemFacts:   FIXTURE.itemFacts.filter((r) => r.fy === "FY 2025-26"),
      ledgerFacts: FIXTURE.ledgerFacts.filter((r) => r.fy === "FY 2025-26"),
    };
    const r = buildReceivables(singleFy);
    assert.equal(r.fyList.length, 1);
    assert.equal(r.prevFy, null);
    assert.ok(r.totalOutstanding >= 0);
  });
});
