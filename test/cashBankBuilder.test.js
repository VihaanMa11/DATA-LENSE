import { test } from "node:test";
import assert from "node:assert/strict";
import { buildCashBank, bankLabel } from "../server/cashBankBuilder.js";

const FY1 = "FY 2024-25";
const FY2 = "FY 2025-26";
const FY3 = "FY 2026-27";

test("bankLabel renames raw account strings", () => {
  assert.equal(bankLabel("39748586585 MLH SBI SALAR"), "SBI Salar");
  assert.equal(bankLabel("ICICI-627705058536"), "ICICI");
  assert.equal(bankLabel("122012647849 MDCCBL"), "MDCCBL");
  assert.equal(bankLabel("Cash"), "Cash");
  assert.equal(bankLabel("CASH-SURI"), "CASH-SURI");
});

function receipt(fy, month, account, debit) {
  return { tx: "Receipt", fy, month, account, accountGroup: "Bank Accounts", debit, credit: 0, isHeader: true };
}
function payment(fy, month, account, credit) {
  return { tx: "Payment", fy, month, account, accountGroup: "Bank Accounts", debit: 0, credit, isHeader: true };
}
function saleH(fy, month, finalAmount) {
  return { tx: "Sales", fy, month, party: "P1", finalAmount, isHeader: true };
}
function fixture() {
  const l = [], it = [];
  const m1 = ["2024-04","2024-05","2024-06","2024-07","2024-08","2024-09","2024-10","2024-11","2024-12","2025-01","2025-02","2025-03"];
  const m2 = ["2025-04","2025-05","2025-06","2025-07","2025-08","2025-09","2025-10","2025-11","2025-12","2026-01","2026-02","2026-03"];
  m1.forEach((m) => { l.push(receipt(FY1, m, "39748586585 MLH SBI SALAR", 100000)); l.push(payment(FY1, m, "39748586585 MLH SBI SALAR", 90000)); it.push(saleH(FY1, m, 110000)); });
  m2.forEach((m) => { l.push(receipt(FY2, m, "39748586585 MLH SBI SALAR", 110000)); l.push(payment(FY2, m, "ICICI-627", 80000)); it.push(saleH(FY2, m, 120000)); });
  // Jan FY2 collection crunch: low receipt, high sales
  l.push(receipt(FY2, "2026-01", "39748586585 MLH SBI SALAR", 20000));
  it.push(saleH(FY2, "2026-01", 100000));
  // FY3 partial
  ["2026-04","2026-05","2026-06"].forEach((m) => { l.push(receipt(FY3, m, "ICICI-627", 120000)); it.push(saleH(FY3, m, 130000)); });
  return { itemFacts: it, ledgerFacts: l, accountMaster: [{ name: "39748586585 MLH SBI SALAR", group: "Bank Accounts", openingDr: 290000, openingCr: 0 }] };
}

test("cashBank: default currentFy latest complete, FY3 partial", () => {
  const r = buildCashBank(fixture(), {});
  assert.equal(r.currentFy, FY2);
  assert.deepEqual(r.partialFys, [FY3]);
});

test("cashBank: receipts = Receipt debit, payments = Payment credit", () => {
  const r = buildCashBank(fixture(), { fy: FY1 });
  assert.equal(r.kpis.totalReceipts.cur, 12 * 100000);
  assert.equal(r.kpis.totalPayments.cur, 12 * 90000);
  assert.equal(r.kpis.netSurplus.cur, 12 * 10000);
});

test("cashBank: primary receipt bank identified with readable name", () => {
  const r = buildCashBank(fixture(), { fy: FY1 });
  assert.equal(r.kpis.primaryBank.name, "SBI Salar");
});

test("cashBank: worst collection month detected", () => {
  const r = buildCashBank(fixture(), { fy: FY2 });
  assert.equal(r.kpis.worstCollMonth.month, "Jan");
  assert.ok(r.kpis.worstCollMonth.rate < 70); // Jan is the lowest vs ~92% other months
});

test("cashBank: bank net per account", () => {
  const r = buildCashBank(fixture(), { fy: FY1 });
  const sbi = r.bankNet.find((b) => b.name === "SBI Salar");
  assert.equal(sbi.net, 12 * 10000);
});

test("cashBank: account balances from master, renamed", () => {
  const r = buildCashBank(fixture(), { fy: FY1 });
  const sbi = r.balances.find((b) => b.name === "SBI Salar");
  assert.equal(sbi.openingDr, 290000);
});

test("cashBank: empty input safe", () => {
  const r = buildCashBank({ ledgerFacts: [], itemFacts: [] }, {});
  assert.equal(r.table.length, 0);
  assert.equal(r.kpis.totalReceipts.cur, 0);
});
