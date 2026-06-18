import test from "node:test";
import assert from "node:assert/strict";
import { normalizeSourceConfig, sourceIdentity } from "../server/sourceConfig.js";

const SHEET_ID = "1MXcOQP7fA6m7hjGcEHpdWkDw221ykqMyQ4atp98rMLQ";

test("normalizeSourceConfig migrates legacy folder-only configuration", () => {
  assert.deepEqual(normalizeSourceConfig({ sourceDir: "C:\\Data" }), {
    sourceType: "local-folder",
    sourceDir: "C:\\Data",
    googleSheetUrl: "",
    googleSheetId: "",
  });
});

test("normalizeSourceConfig stores a canonical Google Sheets source", () => {
  const config = normalizeSourceConfig({
    sourceType: "google-sheet",
    googleSheetUrl: `https://docs.google.com/spreadsheets/d/${SHEET_ID}/edit?usp=sharing`,
  });
  assert.equal(config.sourceType, "google-sheet");
  assert.equal(config.googleSheetId, SHEET_ID);
  assert.equal(config.sourceDir, "");
});

test("sourceIdentity is stable for equivalent Google Sheets URLs", () => {
  assert.equal(
    sourceIdentity({ sourceType: "google-sheet", googleSheetUrl: SHEET_ID }),
    sourceIdentity({ sourceType: "google-sheet", googleSheetUrl: `https://docs.google.com/spreadsheets/d/${SHEET_ID}/edit` }),
  );
});
