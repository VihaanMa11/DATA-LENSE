import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import XLSX from "xlsx";

const ITEM_FACT_FILES = {
  Sales: "Sales25.csv",
  "Sales Return": "SalesReturn25.csv",
  Purchase: "Purchase25.csv",
  "Purchase Return": "PurchaseReturn25.csv",
};

const LEDGER_FILES = {
  Receipt: "receipt25.csv",
  Payment: "payment25.csv",
  "Credit Note": "CrNote25.csv",
  "Debit Note": "DrNote25.csv",
  Journal: "JournalRegister25.csv",
};

const MASTER_FILES = ["Itemmaster.xlsx", "accmasterxlsx.xlsx"];

function normalizeName(value) {
  return String(value || "").trim().toLowerCase();
}

async function fileMap(sourceDir) {
  const entries = await fsp.readdir(sourceDir, { withFileTypes: true });
  const map = new Map();
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    map.set(normalizeName(entry.name), path.join(sourceDir, entry.name));
  }
  return map;
}

function requiredPath(files, filename) {
  const found = files.get(normalizeName(filename));
  if (!found) {
    throw new Error(`Required source file missing from upload: ${filename}`);
  }
  return found;
}

function workbookRows(filePath) {
  const workbook = XLSX.readFile(filePath, { cellDates: true, raw: false });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  return XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: "",
    blankrows: false,
    raw: false,
  }).map((row) => row.map((value) => String(value ?? "").trim()));
}

function findHeader(rows) {
  const markers = ["bill date", "voucher no", "invoice date", "doc. no", "item name", "account name", "ledger name"];
  const limit = Math.min(40, rows.length);
  for (let i = 0; i < limit; i += 1) {
    const line = rows[i].join(" ").toLowerCase();
    if (rows[i].length >= 3 && markers.some((marker) => line.includes(marker))) return i;
  }
  let bestIndex = 0;
  let bestLength = 0;
  for (let i = 0; i < Math.min(30, rows.length); i += 1) {
    if (rows[i].length > bestLength) {
      bestIndex = i;
      bestLength = rows[i].length;
    }
  }
  return bestIndex;
}

function rowsToObjects(rows, headerIndex) {
  const headers = rows[headerIndex].map((header) => String(header || "").trim());
  return rows.slice(headerIndex + 1)
    .filter((row) => row.some((value) => String(value || "").trim() !== ""))
    .map((row) => {
      const obj = {};
      headers.forEach((header, index) => {
        if (header) obj[header] = String(row[index] ?? "").trim();
      });
      return obj;
    });
}

function readCsvTable(filePath) {
  const rows = workbookRows(filePath);
  const headerIndex = findHeader(rows);
  return {
    rows: rowsToObjects(rows, headerIndex),
    columns: rows[headerIndex].map((column) => String(column || "").trim()),
  };
}

function cleanMaster(filePath) {
  const rows = workbookRows(filePath);
  const headers = (rows[1] || rows[0] || []).map((header) => String(header || "").trim());
  return rows.slice(2)
    .filter((row) => row.some((value) => String(value || "").trim() !== ""))
    .map((row) => {
      const obj = {};
      headers.forEach((header, index) => {
        if (header) obj[header] = String(row[index] ?? "").trim();
      });
      return obj;
    });
}

function asNumber(value) {
  let text = String(value ?? "").trim();
  if (!text) return 0;
  const negative = text.startsWith("(") && text.endsWith(")");
  text = text.replace(/,/g, "").replace(/₹/g, "").replace(/\$/g, "").replace(/[()]/g, "");
  const parsed = Number.parseFloat(text);
  if (Number.isNaN(parsed)) return 0;
  return negative ? -parsed : parsed;
}

function cleanText(value, fallback = "Unmapped") {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function isoDate(value) {
  const text = String(value ?? "").trim();
  if (!text) return "";
  const match = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/);
  if (match) {
    const day = Number(match[1]);
    const month = Number(match[2]);
    let year = Number(match[3]);
    if (year < 100) year += 2000;
    if (day >= 1 && month >= 1 && month <= 12) {
      return `${year.toString().padStart(4, "0")}-${month.toString().padStart(2, "0")}-${day.toString().padStart(2, "0")}`;
    }
  }
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toISOString().slice(0, 10);
}

function monthKey(date) {
  if (!date) return "Undated";
  return date.slice(0, 7) || "Undated";
}

function shortItemFamily(name) {
  const cleaned = String(name || "").trim().replace(/\s+/g, " ").replace(/\s*MRP[- ]?\d+.*$/i, "");
  return cleaned ? cleaned.slice(0, 44) : "Unmapped";
}

function mapByName(rows) {
  const map = new Map();
  for (const row of rows) {
    const name = cleanText(row.Name, "");
    if (name) map.set(name, row);
  }
  return map;
}

function isTotalRow(row) {
  return Object.values(row).some((value) => String(value || "").trim().toLowerCase() === "total");
}

function forwardFill(rows, columns) {
  const last = Object.fromEntries(columns.map((column) => [column, ""]));
  return rows.map((row) => {
    const next = { ...row };
    for (const column of columns) {
      const raw = String(next[column] ?? "").trim();
      next[`${column} Source`] = raw !== "";
      if (raw) last[column] = raw;
      next[column] = last[column] || "";
    }
    return next;
  });
}

export async function sourceSignature(sourceDir) {
  const entries = await fsp.readdir(sourceDir, { withFileTypes: true });
  const fileStats = [];
  for (const entry of entries) {
    if (!entry.isFile() || !/\.(csv|xlsx|xls)$/i.test(entry.name)) continue;
    const fullPath = path.join(sourceDir, entry.name);
    const stat = await fsp.stat(fullPath);
    fileStats.push(`${entry.name}:${stat.size}:${stat.mtimeMs}`);
  }
  return fileStats.sort().join("|");
}

export async function buildDashboardData(sourceDir) {
  if (!fs.existsSync(sourceDir)) {
    throw new Error(`Data source folder does not exist: ${sourceDir}`);
  }

  const files = await fileMap(sourceDir);
  for (const filename of [...Object.values(ITEM_FACT_FILES), ...Object.values(LEDGER_FILES), ...MASTER_FILES]) {
    requiredPath(files, filename);
  }

  const items = cleanMaster(requiredPath(files, "Itemmaster.xlsx"));
  const accounts = cleanMaster(requiredPath(files, "accmasterxlsx.xlsx"));
  const itemMap = mapByName(items);
  const accountMap = mapByName(accounts);
  const itemFacts = [];
  const ledgerFacts = [];
  const sourceProfile = [];

  for (const [txType, filename] of Object.entries(ITEM_FACT_FILES)) {
    const table = readCsvTable(requiredPath(files, filename));
    let rows = table.rows.filter((row) => !isTotalRow(row));
    rows = forwardFill(rows, ["Vch. Series", "Bill Date", "Bill No.", "Party Name", "Final Amt", "Transport", "Distance"]);

    for (const row of rows) {
      const itemName = cleanText(row["Item Name"]);
      const partyName = cleanText(row["Party Name"]);
      const itemDim = itemMap.get(itemName) || {};
      const accountDim = accountMap.get(partyName) || {};
      const date = isoDate(row["Bill Date"]);
      const isHeader = Boolean(row["Bill No. Source"]);
      itemFacts.push({
        tx: txType,
        date,
        month: monthKey(date),
        voucher: cleanText(row["Bill No."], "No Voucher"),
        vchSeries: cleanText(row["Vch. Series"], "Unspecified"),
        party: partyName,
        accountGroup: cleanText(accountDim["Group Name"]),
        state: cleanText(accountDim.State),
        station: cleanText(accountDim.Station),
        item: itemName,
        itemFamily: shortItemFamily(itemName),
        itemGroup: cleanText(itemDim["Group Name"]),
        mainUnit: cleanText(itemDim["Main Unit"]),
        altUnit: cleanText(itemDim["Alt. Unit"]),
        transport: cleanText(row.Transport, "Unspecified"),
        distance: asNumber(row.Distance),
        price: asNumber(row.Price),
        qty: asNumber(row["Main Qt"]),
        altQty: asNumber(row["Billed Quantity Alt"]),
        amount: asNumber(row.Amount),
        finalAmount: isHeader ? asNumber(row["Final Amt"]) : 0,
        isHeader,
      });
    }

    sourceProfile.push({
      file: filename,
      role: txType,
      rows: rows.length,
      vouchers: rows.filter((row) => row["Bill No. Source"]).length,
      columns: table.columns.slice(0, 12),
    });
  }

  for (const [txType, filename] of Object.entries(LEDGER_FILES)) {
    const table = readCsvTable(requiredPath(files, filename));
    let rows = table.rows.filter((row) => !isTotalRow(row));
    rows = forwardFill(rows, ["Bill Date", "Bill No."]);

    for (const row of rows) {
      const accountName = cleanText(row["Account Name"]);
      const accountDim = accountMap.get(accountName) || {};
      const date = isoDate(row["Bill Date"]);
      const isHeader = Boolean(row["Bill Date Source"]);
      const debit = asNumber(row["Debit Amount"]);
      const credit = asNumber(row["Credit Amount"]);
      let businessAmount = 0;
      if (txType === "Receipt") businessAmount = isHeader ? debit : 0;
      else if (txType === "Payment") businessAmount = isHeader ? credit : 0;
      else if (txType === "Credit Note" || txType === "Debit Note") businessAmount = isHeader ? debit + credit : 0;
      else businessAmount = Math.max(debit, credit);
      ledgerFacts.push({
        tx: txType,
        date,
        month: monthKey(date),
        voucher: cleanText(row["Bill No."], "No Voucher"),
        account: accountName,
        accountGroup: cleanText(accountDim["Group Name"]),
        state: cleanText(accountDim.State),
        station: cleanText(accountDim.Station),
        debit,
        credit,
        businessAmount,
        isHeader,
      });
    }

    sourceProfile.push({
      file: filename,
      role: txType,
      rows: rows.length,
      vouchers: rows.filter((row) => row["Bill Date Source"]).length,
      columns: table.columns.slice(0, 5),
    });
  }

  return {
    generatedAt: new Date().toISOString().replace("T", " ").slice(0, 19),
    company: "MLH GOBONGO PVT. LTD.",
    periodLabel: "FY 2025-26",
    itemFacts,
    ledgerFacts,
    sourceProfile,
    masters: {
      items: items.length,
      accounts: accounts.length,
      itemFields: Object.keys(items[0] || {}),
      accountFields: Object.keys(accounts[0] || {}),
    },
  };
}
