import { createHash } from "node:crypto";
import XLSX from "xlsx";

export const REQUIRED_GOOGLE_TABS = [
  "CrNote",
  "DrNote",
  "JournalRegister",
  "Receipt",
  "Payment",
  "PurchaseReturn",
  "SalesReturn",
  "Purchase",
  "Sales",
  "ItemMaster",
  "AccountMaster",
];

export const GOOGLE_TAB_ALIASES = {
  CrNote: ["CrNote", "CrNote25"],
  DrNote: ["DrNote", "DrNote25"],
  JournalRegister: ["JournalRegister", "JournalRegister25"],
  Receipt: ["Receipt", "receipt25"],
  Payment: ["Payment", "payment25"],
  PurchaseReturn: ["PurchaseReturn", "PurchaseReturn25"],
  SalesReturn: ["SalesReturn", "SalesReturn25"],
  Purchase: ["Purchase", "Purchase25"],
  Sales: ["Sales", "Sales25"],
  ItemMaster: ["ItemMaster", "Itemmaster"],
  AccountMaster: ["AccountMaster", "accmasterxlsx"],
};

const SHEET_ID_PATTERN = /^[a-zA-Z0-9_-]{20,}$/;

export function extractGoogleSheetId(value) {
  const input = String(value || "").trim();
  if (SHEET_ID_PATTERN.test(input)) return input;
  const match = input.match(/docs\.google\.com\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/i);
  if (match?.[1] && SHEET_ID_PATTERN.test(match[1])) return match[1];
  throw new Error("Enter a valid Google Sheets URL or spreadsheet ID.");
}

export function googleSheetExportUrl(value) {
  return `https://docs.google.com/spreadsheets/d/${extractGoogleSheetId(value)}/export?format=xlsx`;
}

export function workbookSignature(workbook) {
  const hash = createHash("sha256");
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", blankrows: false, raw: false });
    hash.update(sheetName);
    hash.update(sheet["!ref"] || "");
    hash.update(JSON.stringify(rows));
  }
  return hash.digest("hex");
}

function sheetRows(sheet) {
  return XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: "",
    blankrows: false,
    raw: false,
  }).map((row) => row.map((cell) => String(cell ?? "").trim()));
}

function findHeader(rows) {
  const markers = ["bill date", "voucher no", "invoice date", "doc. no", "item name", "account name", "ledger name"];
  for (let index = 0; index < Math.min(40, rows.length); index += 1) {
    const line = rows[index].join(" ").toLowerCase();
    if (rows[index].length >= 3 && markers.some((marker) => line.includes(marker))) return index;
  }
  let bestIndex = 0;
  for (let index = 1; index < Math.min(30, rows.length); index += 1) {
    if (rows[index].length > rows[bestIndex].length) bestIndex = index;
  }
  return bestIndex;
}

function rowsToObjects(rows, headerIndex) {
  const columns = (rows[headerIndex] || []).map((header) => String(header || "").trim());
  const objects = rows.slice(headerIndex + 1)
    .filter((row) => row.some((value) => String(value || "").trim()))
    .map((row) => Object.fromEntries(columns.flatMap((column, index) => column ? [[column, String(row[index] ?? "").trim()]] : [])));
  return { rows: objects, columns };
}

export function resolveGoogleTabName(workbook, tabName) {
  const aliases = GOOGLE_TAB_ALIASES[tabName] || [tabName];
  const normalized = new Map((workbook?.SheetNames || []).map((name) => [name.toLowerCase(), name]));
  for (const alias of aliases) {
    const actual = normalized.get(alias.toLowerCase());
    if (actual) return actual;
  }
  return "";
}

function requiredSheet(workbook, tabName) {
  const actualName = resolveGoogleTabName(workbook, tabName);
  if (!actualName) throw new Error(`Required Google Sheets tab is missing: ${tabName}`);
  return workbook.Sheets[actualName];
}

export function validateGoogleWorkbook(workbook) {
  const missing = REQUIRED_GOOGLE_TABS.filter((name) => !resolveGoogleTabName(workbook, name));
  if (missing.length) throw new Error(`Required Google Sheets tabs are missing: ${missing.join(", ")}`);
  return workbook;
}

export function detectGoogleWorkbookFormat(workbook) {
  const hasNewTabs = REQUIRED_GOOGLE_TABS.every((name) => (workbook?.SheetNames || []).some((sheetName) => sheetName.toLowerCase() === name.toLowerCase()));
  if (hasNewTabs) return "fy-master";
  validateGoogleWorkbook(workbook);
  return "legacy-single-fy";
}

export function workbookTable(workbook, tabName) {
  const rows = sheetRows(requiredSheet(workbook, tabName));
  if (!rows.length) throw new Error(`Required Google Sheets tab is empty: ${tabName}`);
  return rowsToObjects(rows, findHeader(rows));
}

export function workbookMaster(workbook, tabName) {
  const rows = sheetRows(requiredSheet(workbook, tabName));
  if (!rows.length) throw new Error(`Required Google Sheets tab is empty: ${tabName}`);
  const headerIndex = rows[1]?.some((value) => value) ? 1 : 0;
  return rowsToObjects(rows, headerIndex).rows;
}

export async function fetchGoogleWorkbook(value, fetchImpl = fetch) {
  const response = await fetchImpl(googleSheetExportUrl(value), { redirect: "follow" });
  if (!response.ok) {
    throw new Error(`Google Sheets export failed (${response.status}). Confirm the workbook is shared for viewing.`);
  }
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("text/html")) {
    throw new Error("Google Sheets returned a sign-in page. Share the workbook for viewing and try again.");
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!bytes.length) throw new Error("Google Sheets returned an empty workbook export.");
  const workbook = XLSX.read(bytes, { type: "buffer", cellDates: true, raw: false });
  validateGoogleWorkbook(workbook);
  return { workbook, bytes };
}
