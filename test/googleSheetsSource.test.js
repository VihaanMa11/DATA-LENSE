import test from "node:test";
import assert from "node:assert/strict";
import XLSX from "xlsx";
import {
  extractGoogleSheetId,
  googleSheetExportUrl,
  validateGoogleWorkbook,
  workbookSignature,
  workbookTable,
} from "../server/googleSheetsSource.js";

const SHEET_ID = "1MXcOQP7fA6m7hjGcEHpdWkDw221ykqMyQ4atp98rMLQ";

test("extractGoogleSheetId accepts a shared URL or raw spreadsheet ID", () => {
  assert.equal(extractGoogleSheetId(`https://docs.google.com/spreadsheets/d/${SHEET_ID}/edit?usp=sharing`), SHEET_ID);
  assert.equal(extractGoogleSheetId(SHEET_ID), SHEET_ID);
  assert.throws(() => extractGoogleSheetId("https://example.com/not-a-sheet"), /valid Google Sheets URL or spreadsheet ID/i);
});

test("googleSheetExportUrl builds the XLSX export endpoint", () => {
  assert.equal(
    googleSheetExportUrl(SHEET_ID),
    `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=xlsx`,
  );
});

test("workbookSignature ignores export package metadata and changes with cell content", () => {
  const first = XLSX.utils.book_new();
  const equivalent = XLSX.utils.book_new();
  const changed = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(first, XLSX.utils.aoa_to_sheet([["Name", "Amount"], ["Sale", 10]]), "Sales25");
  XLSX.utils.book_append_sheet(equivalent, XLSX.utils.aoa_to_sheet([["Name", "Amount"], ["Sale", 10]]), "Sales25");
  XLSX.utils.book_append_sheet(changed, XLSX.utils.aoa_to_sheet([["Name", "Amount"], ["Sale", 11]]), "Sales25");
  assert.equal(workbookSignature(first), workbookSignature(equivalent));
  assert.notEqual(workbookSignature(first), workbookSignature(changed));
});

test("validateGoogleWorkbook reports every missing required tab", () => {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([["Name"], ["Example"]]), "Sales25");
  assert.throws(
    () => validateGoogleWorkbook(workbook),
    (error) => error.message.includes("CrNote25") && error.message.includes("accmasterxlsx"),
  );
});

test("workbookTable preserves headers and row field names from a named tab", () => {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([["Report"], ["Bill Date", "Bill No.", "Amount"], ["01/04/2025", "S-1", "1250"]]),
    "Sales25",
  );
  const table = workbookTable(workbook, "Sales25");
  assert.deepEqual(table.columns, ["Bill Date", "Bill No.", "Amount"]);
  assert.deepEqual(table.rows[0], { "Bill Date": "01/04/2025", "Bill No.": "S-1", Amount: "1250" });
});
