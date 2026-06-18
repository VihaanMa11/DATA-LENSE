import path from "node:path";
import { extractGoogleSheetId } from "./googleSheetsSource.js";

export function normalizeSourceConfig(input = {}, defaultSourceDir = "") {
  const sourceType = input.sourceType === "google-sheet" ? "google-sheet" : "local-folder";
  if (sourceType === "google-sheet") {
    const googleSheetUrl = String(input.googleSheetUrl || input.googleSheetId || "").trim();
    const googleSheetId = extractGoogleSheetId(googleSheetUrl);
    return { sourceType, sourceDir: "", googleSheetUrl, googleSheetId };
  }
  return {
    sourceType,
    sourceDir: String(input.sourceDir || defaultSourceDir).trim(),
    googleSheetUrl: "",
    googleSheetId: "",
  };
}

export function sourceIdentity(input, defaultSourceDir = "") {
  const config = normalizeSourceConfig(input, defaultSourceDir);
  return config.sourceType === "google-sheet"
    ? `google-sheet:${config.googleSheetId}`
    : `local-folder:${path.resolve(config.sourceDir)}`;
}
