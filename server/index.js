import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import {
  ACCESS_COOKIE,
  authConfigured,
  checkPassword,
  clearSessionCookies,
  createRequireAuth,
  expectedToken,
  parseCookies,
  sessionCookie,
} from "./auth.js";
import { buildDashboardDataFromWorkbook } from "./dashboardBuilder.js";
import { buildAnalytics } from "./analyticsBuilder.js";
import { buildCeoOverview } from "./ceoBuilder.js";
import { buildPartyAnalysis } from "./partyBuilder.js";
import { buildCustomerPareto } from "./paretoBuilder.js";
import { buildCustomerAnalysis } from "./customerAnalysisBuilder.js";
import { buildReceivables } from "./receivablesBuilder.js";
import { buildItemGroups } from "./itemGroupsBuilder.js";
import { buildStateMis } from "./stateMisBuilder.js";
import { buildSegmentMis } from "./segmentMisBuilder.js";
import { buildProductPareto } from "./productParetoBuilder.js";
import { buildStockMovement } from "./stockMovementBuilder.js";
import { buildCashBank } from "./cashBankBuilder.js";
import { buildVendorPayables } from "./vendorPayablesBuilder.js";
import { buildSalesForecast } from "./salesForecastBuilder.js";
import { fetchGoogleWorkbook, workbookSignature, extractGoogleSheetId } from "./googleSheetsSource.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
try {
  process.loadEnvFile(path.join(rootDir, ".env"));
} catch {
  // Cloud deployments provide environment variables directly.
}

const isVercel = Boolean(process.env.VERCEL);
const secureCookies = isVercel || process.env.NODE_ENV === "production";

async function pathExists(target) {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Direct-to-sheet data layer. Stateless: every request carries the sheet URL.
// An in-memory cache (process-local, keyed by sheet id + content signature)
// avoids re-parsing the workbook when only the period filter changes. No DB.
// ---------------------------------------------------------------------------
const sheetCache = new Map(); // sheetId -> { signature, data, loadedAt }

async function fetchDashboard(sheetUrl, { force = false } = {}) {
  const sheetId = extractGoogleSheetId(sheetUrl);
  if (!sheetId) {
    const error = new Error("Enter a valid Google Sheets URL or ID.");
    error.status = 400;
    throw error;
  }
  const { workbook } = await fetchGoogleWorkbook(sheetId);
  const signature = workbookSignature(workbook);
  const cached = sheetCache.get(sheetId);
  if (!force && cached && cached.signature === signature) {
    return { ...cached.data, sourceType: "google-sheet", sourceSignature: signature, cacheStatus: "hit", loadedAt: cached.loadedAt };
  }
  const data = buildDashboardDataFromWorkbook(workbook);
  const loadedAt = Date.now();
  sheetCache.set(sheetId, { signature, data, loadedAt });
  return { ...data, sourceType: "google-sheet", sourceSignature: signature, cacheStatus: force ? "fresh" : "miss", loadedAt };
}

function sheetUrlFrom(req) {
  return String(req.query?.sheetUrl || req.get?.("x-sheet-url") || req.body?.sheetUrl || "").trim();
}

function requireSheet(req, res) {
  const sheetUrl = sheetUrlFrom(req);
  if (!sheetUrl) {
    res.status(400).json({ error: "No Google Sheet connected. Open Data Source settings and sync a sheet.", needsSource: true });
    return null;
  }
  return sheetUrl;
}

async function createApp() {
  const app = express();
  app.use(express.json({ limit: "1mb" }));

  // ---- Auth: shared-password gate ----
  app.post("/api/auth/login", (req, res) => {
    if (!authConfigured()) {
      res.status(503).json({ error: "Authentication is not configured. Set DASHBOARD_PASSWORD." });
      return;
    }
    const inputPassword = String(req.body?.password || "");
    if (!inputPassword) {
      res.status(400).json({ error: "Enter the dashboard password." });
      return;
    }
    if (!checkPassword(inputPassword)) {
      res.status(401).json({ error: "Incorrect password." });
      return;
    }
    res.setHeader("Set-Cookie", sessionCookie(ACCESS_COOKIE, expectedToken(), { secure: secureCookies, maxAge: 60 * 60 * 24 * 30 }));
    res.json({ ok: true });
  });

  app.get("/api/auth/session", (req, res) => {
    const token = parseCookies(req.headers.cookie)[ACCESS_COOKIE];
    if (token && token === expectedToken()) {
      res.json({ ok: true });
      return;
    }
    res.setHeader("Set-Cookie", clearSessionCookies({ secure: secureCookies }));
    res.status(401).json({ error: "Authentication required." });
  });

  app.post("/api/auth/logout", (_req, res) => {
    res.setHeader("Set-Cookie", clearSessionCookies({ secure: secureCookies }));
    res.json({ signedOut: true });
  });

  // Everything below /api requires a valid session cookie.
  app.use("/api", createRequireAuth({ secure: secureCookies }));

  // ---- Data: direct-to-sheet, stateless ----
  app.post("/api/sync", async (req, res, next) => {
    try {
      const sheetUrl = requireSheet(req, res);
      if (!sheetUrl) return;
      res.json(await fetchDashboard(sheetUrl, { force: true }));
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/dashboard", async (req, res, next) => {
    try {
      const sheetUrl = requireSheet(req, res);
      if (!sheetUrl) return;
      res.json(await fetchDashboard(sheetUrl));
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/analytics", async (req, res, next) => {
    try {
      const sheetUrl = requireSheet(req, res);
      if (!sheetUrl) return;
      const dash = await fetchDashboard(sheetUrl);
      const monthsParam = String(req.query.months || "").trim();
      const fy = String(req.query.fy || "").trim();
      const months = monthsParam ? monthsParam.split(",").map((m) => m.trim()).filter(Boolean) : null;
      res.json(buildAnalytics(dash, { ...(fy ? { fy } : {}), ...(months ? { months } : {}) }));
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/ceo", async (req, res, next) => {
    try {
      const sheetUrl = requireSheet(req, res);
      if (!sheetUrl) return;
      const dash = await fetchDashboard(sheetUrl);
      const fy = String(req.query.fy || "").trim();
      res.json(buildCeoOverview(dash, fy ? { fy } : {}));
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/party", async (req, res, next) => {
    try {
      const sheetUrl = requireSheet(req, res);
      if (!sheetUrl) return;
      const dash = await fetchDashboard(sheetUrl);
      const fy = String(req.query.fy || "").trim();
      res.json(buildPartyAnalysis(dash, fy ? { fy } : {}));
    } catch (e) { next(e); }
  });

  app.get("/api/customer-pareto", async (req, res, next) => {
    try {
      const sheetUrl = requireSheet(req, res);
      if (!sheetUrl) return;
      const dash = await fetchDashboard(sheetUrl);
      const fy = String(req.query.fy || "").trim();
      res.json(buildCustomerPareto(dash, fy ? { fy } : {}));
    } catch (e) { next(e); }
  });

  app.get("/api/customer-analysis", async (req, res, next) => {
    try {
      const sheetUrl = requireSheet(req, res);
      if (!sheetUrl) return;
      const dash = await fetchDashboard(sheetUrl);
      const fy = String(req.query.fy || "").trim();
      res.json(buildCustomerAnalysis(dash, fy ? { fy } : {}));
    } catch (e) { next(e); }
  });

  app.get("/api/receivables", async (req, res, next) => {
    try {
      const sheetUrl = requireSheet(req, res);
      if (!sheetUrl) return;
      const dash = await fetchDashboard(sheetUrl);
      const fy = String(req.query.fy || "").trim();
      res.json(buildReceivables(dash, fy ? { fy } : {}));
    } catch (e) { next(e); }
  });

  app.get("/api/item-groups", async (req, res, next) => {
    try {
      const sheetUrl = requireSheet(req, res);
      if (!sheetUrl) return;
      const dash = await fetchDashboard(sheetUrl);
      const fy = String(req.query.fy || "").trim();
      res.json(buildItemGroups(dash, fy ? { fy } : {}));
    } catch (e) { next(e); }
  });

  app.get("/api/state-mis", async (req, res, next) => {
    try {
      const sheetUrl = requireSheet(req, res);
      if (!sheetUrl) return;
      const dash = await fetchDashboard(sheetUrl);
      const fy = String(req.query.fy || "").trim();
      res.json(buildStateMis(dash, fy ? { fy } : {}));
    } catch (e) { next(e); }
  });

  app.get("/api/segment-mis", async (req, res, next) => {
    try {
      const sheetUrl = requireSheet(req, res);
      if (!sheetUrl) return;
      const dash = await fetchDashboard(sheetUrl);
      const fy = String(req.query.fy || "").trim();
      res.json(buildSegmentMis(dash, fy ? { fy } : {}));
    } catch (e) { next(e); }
  });

  app.get("/api/product-pareto", async (req, res, next) => {
    try {
      const sheetUrl = requireSheet(req, res);
      if (!sheetUrl) return;
      const dash = await fetchDashboard(sheetUrl);
      const fy = String(req.query.fy || "").trim();
      res.json(buildProductPareto(dash, fy ? { fy } : {}));
    } catch (e) { next(e); }
  });

  app.get("/api/stock-movement", async (req, res, next) => {
    try {
      const sheetUrl = requireSheet(req, res);
      if (!sheetUrl) return;
      const dash = await fetchDashboard(sheetUrl);
      const fy = String(req.query.fy || "").trim();
      res.json(buildStockMovement(dash, fy ? { fy } : {}));
    } catch (e) { next(e); }
  });

  app.get("/api/cash-bank", async (req, res, next) => {
    try {
      const sheetUrl = requireSheet(req, res);
      if (!sheetUrl) return;
      const dash = await fetchDashboard(sheetUrl);
      const fy = String(req.query.fy || "").trim();
      res.json(buildCashBank(dash, fy ? { fy } : {}));
    } catch (e) { next(e); }
  });

  app.get("/api/vendor-payables", async (req, res, next) => {
    try {
      const sheetUrl = requireSheet(req, res);
      if (!sheetUrl) return;
      const dash = await fetchDashboard(sheetUrl);
      const fy = String(req.query.fy || "").trim();
      res.json(buildVendorPayables(dash, fy ? { fy } : {}));
    } catch (e) { next(e); }
  });

  app.get("/api/sales-forecast", async (req, res, next) => {
    try {
      const sheetUrl = requireSheet(req, res);
      if (!sheetUrl) return;
      const dash = await fetchDashboard(sheetUrl);
      const fy = String(req.query.fy || "").trim();
      res.json(buildSalesForecast(dash, fy ? { fy } : {}));
    } catch (e) { next(e); }
  });

  app.post("/api/refresh", async (req, res, next) => {
    try {
      const sheetUrl = requireSheet(req, res);
      if (!sheetUrl) return;
      res.json(await fetchDashboard(sheetUrl, { force: true }));
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/status", (_req, res) => {
    res.json({ ok: true, cloudMode: isVercel, cachedSheets: sheetCache.size });
  });

  app.use((error, _req, res, _next) => {
    console.error(error);
    res.status(error.status || 500).json({ error: error.message || "Unexpected server error" });
  });

  if (!isVercel) {
    const distDir = path.join(rootDir, "dist");
    const hasProductionBuild = await pathExists(path.join(distDir, "index.html"));
    const useVite = process.env.DASHBOARD_DEV === "1" || !hasProductionBuild;
    if (useVite) {
      const { createServer } = await import("vite");
      const vite = await createServer({ root: rootDir, server: { middlewareMode: true }, appType: "spa" });
      app.use(vite.middlewares);
    } else {
      app.use(express.static(distDir));
      app.get(/.*/, (_req, res) => {
        res.sendFile(path.join(distDir, "index.html"));
      });
    }
  }

  return app;
}

const appPromise = createApp();

if (!isVercel) {
  const port = Number(process.env.PORT || 5173);
  appPromise.then((app) => app.listen(port, () => {
    console.log(`MIS dashboard app running at http://localhost:${port}`);
  })).catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

export default appPromise;
