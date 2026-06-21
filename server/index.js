import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import multer from "multer";
import {
  createUploadedFileBatch,
  getUserForAccessToken,
  hasSupabaseConfig,
  loadDashboardSnapshot,
  refreshAuthSession,
  saveDashboardSnapshot,
  signInWithPassword,
  signOutAccessToken,
  updateUploadBatchStatus,
} from "./supabase.js";
import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  clearSessionCookies,
  createRequireAuth,
  isAuthorizedEmail,
  parseCookies,
  sessionCookie,
} from "./auth.js";
import { buildDashboardData, buildDashboardDataFromWorkbook, sourceSignature as nodeSourceSignature } from "./dashboardBuilder.js";
import { buildAnalytics } from "./analyticsBuilder.js";
import { fetchGoogleWorkbook, workbookSignature } from "./googleSheetsSource.js";
import { normalizeSourceConfig, sourceIdentity } from "./sourceConfig.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
try {
  process.loadEnvFile(path.join(rootDir, ".env"));
} catch {
  // Cloud deployments provide environment variables directly.
}
const configPath = path.join(__dirname, "data-source.json");
const cachePath = path.join(__dirname, "dashboard-cache.json");
const defaultSourceDir = "C:\\Users\\hp\\Downloads\\DataLense\\csv";
const bundledPython = "C:\\Users\\hp\\.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\python\\python.exe";
const pythonScript = path.join(rootDir, "scripts", "build_dashboard_data.py");
const isVercel = Boolean(process.env.VERCEL);
const secureCookies = isVercel || process.env.NODE_ENV === "production";
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    files: 20,
    fileSize: 25 * 1024 * 1024,
  },
});

let cache = {
  sourceKey: "",
  signature: "",
  data: null,
  loadedAt: 0,
};

async function pathExists(target) {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

async function readConfig() {
  try {
    const raw = await fs.readFile(configPath, "utf8");
    const parsed = JSON.parse(raw);
    return normalizeSourceConfig(parsed, defaultSourceDir);
  } catch {
    return normalizeSourceConfig({ sourceDir: defaultSourceDir }, defaultSourceDir);
  }
}

async function writeConfig(config) {
  await fs.mkdir(path.dirname(configPath), { recursive: true });
  await fs.writeFile(configPath, JSON.stringify(config, null, 2), "utf8");
}

async function readDiskCache(sourceKey, signature) {
  try {
    const raw = await fs.readFile(cachePath, "utf8");
    const parsed = JSON.parse(raw);
    if (parsed.sourceKey !== sourceKey || parsed.signature !== signature || !parsed.data) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

async function writeDiskCache(sourceKey, signature, data, loadedAt) {
  await fs.writeFile(
    cachePath,
    JSON.stringify({ sourceKey, signature, loadedAt, data }),
    "utf8",
  );
}

async function sourceSignature(sourceDir) {
  const entries = await fs.readdir(sourceDir, { withFileTypes: true });
  const fileStats = [];
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (!/\.(csv|xlsx|xls)$/i.test(entry.name)) continue;
    const fullPath = path.join(sourceDir, entry.name);
    const stat = await fs.stat(fullPath);
    fileStats.push(`${entry.name}:${stat.size}:${stat.mtimeMs}`);
  }
  return fileStats.sort().join("|");
}

function runPython(sourceDir) {
  const pythonExe = process.env.DASHBOARD_PYTHON || bundledPython;
  return new Promise((resolve, reject) => {
    execFile(
      pythonExe,
      [pythonScript, "--source", sourceDir],
      {
        cwd: rootDir,
        maxBuffer: 80 * 1024 * 1024,
        windowsHide: true,
      },
      (error, stdout, stderr) => {
        if (error) {
          reject(new Error(stderr || error.message));
          return;
        }
        try {
          resolve(JSON.parse(stdout));
        } catch (parseError) {
          reject(new Error(`Dashboard parser returned invalid JSON: ${parseError.message}`));
        }
      },
    );
  });
}

function cleanUploadName(filename) {
  return path.basename(String(filename || "").replace(/\\/g, "/"));
}

function isAllowedUpload(filename) {
  return /\.(csv|xlsx|xls)$/i.test(filename);
}

function cloudDashboard(sourceDir = "Vercel cloud deployment") {
  return {
    company: "MLH GOBONGO PVT. LTD.",
    sourceDir,
    sourceSignature: "cloud-deployment",
    cacheStatus: "cloud",
    loadedAt: Date.now(),
    cloudMode: true,
    cloudMessage: hasSupabaseConfig()
      ? "Supabase is configured, but no active dashboard snapshot was found. Run the Supabase upload script after creating the table."
      : "This Vercel deployment cannot read CSV/XLSX files from your local Windows folder. Add Supabase environment variables and upload a dashboard snapshot for cloud data.",
    itemFacts: [],
    ledgerFacts: [],
    sourceProfile: [],
  };
}

async function loadDashboard({ force = false } = {}) {
  const config = await readConfig();
  if (isVercel && config.sourceType !== "google-sheet") {
    const snapshot = await loadDashboardSnapshot();
    return snapshot || cloudDashboard(hasSupabaseConfig() ? "Supabase dashboard snapshot" : "Vercel cloud deployment");
  }

  const sourceKey = sourceIdentity(config, defaultSourceDir);
  let sourceLabel;
  let signature;
  let freshData;

  if (config.sourceType === "google-sheet") {
    const { workbook } = await fetchGoogleWorkbook(config.googleSheetId);
    signature = workbookSignature(workbook);
    sourceLabel = "Google Sheets workbook";
    freshData = () => buildDashboardDataFromWorkbook(workbook);
  } else {
    sourceLabel = config.sourceDir;
    if (!(await pathExists(config.sourceDir))) {
      const error = new Error(`Data source folder does not exist: ${config.sourceDir}`);
      error.status = 400;
      throw error;
    }
    signature = await sourceSignature(config.sourceDir);
    freshData = () => runPython(config.sourceDir);
  }

  if (!force && cache.data && cache.sourceKey === sourceKey && cache.signature === signature) {
      return {
        ...cache.data,
        sourceDir: sourceLabel,
        sourceType: config.sourceType,
        sourceSignature: signature,
        cacheStatus: "hit",
        loadedAt: cache.loadedAt,
      };
  }

  if (!force) {
    const diskCache = await readDiskCache(sourceKey, signature);
    if (diskCache) {
      cache = {
        sourceKey,
        signature,
        data: diskCache.data,
        loadedAt: diskCache.loadedAt || Date.now(),
      };
      return {
        ...diskCache.data,
        sourceDir: sourceLabel,
        sourceType: config.sourceType,
        sourceSignature: signature,
        cacheStatus: "disk-cache",
        loadedAt: cache.loadedAt,
      };
    }
  }

  const data = await freshData();
  const loadedAt = Date.now();
  cache = {
    sourceKey,
    signature,
    data,
    loadedAt,
  };
  await writeDiskCache(sourceKey, signature, data, loadedAt);
  return {
    ...data,
    sourceDir: sourceLabel,
    sourceType: config.sourceType,
    sourceSignature: signature,
    cacheStatus: "refreshed",
    loadedAt: cache.loadedAt,
  };
}

async function createApp() {
  const app = express();
  app.use(express.json({ limit: "1mb" }));

  const setSessionCookies = (response, session) => {
    response.setHeader("Set-Cookie", [
      sessionCookie(ACCESS_COOKIE, session.access_token, { secure: secureCookies, maxAge: session.expires_in || 3600 }),
      sessionCookie(REFRESH_COOKIE, session.refresh_token, { secure: secureCookies, maxAge: 60 * 60 * 24 * 30 }),
    ]);
  };
  const clearAuthCookies = (response) => response.setHeader("Set-Cookie", clearSessionCookies({ secure: secureCookies }));
  const authUserResponse = (user) => ({ user: { id: user.id, email: user.email } });

  app.post("/api/auth/login", async (req, res) => {
    try {
      const email = String(req.body?.email || "").trim().toLowerCase();
      const password = String(req.body?.password || "");
      if (!email || !password) {
        res.status(400).json({ error: "Enter your email and password." });
        return;
      }
      const { user, session } = await signInWithPassword(email, password);
      if (!isAuthorizedEmail(user.email)) {
        await signOutAccessToken(session.access_token).catch(() => {});
        clearAuthCookies(res);
        res.status(401).json({ error: "This account is not authorized for this dashboard." });
        return;
      }
      setSessionCookies(res, session);
      res.json(authUserResponse(user));
    } catch (error) {
      const unavailable = error.message === "Supabase authentication is not configured.";
      res.status(unavailable ? 503 : 401).json({
        error: unavailable ? "Authentication service is not configured." : "Email or password is incorrect.",
      });
    }
  });

  app.get("/api/auth/session", async (req, res) => {
    const cookies = parseCookies(req.headers.cookie);
    try {
      let user;
      if (cookies[ACCESS_COOKIE]) {
        user = await getUserForAccessToken(cookies[ACCESS_COOKIE]).catch(() => null);
      }
      if (user && isAuthorizedEmail(user.email)) {
        res.json(authUserResponse(user));
        return;
      }
      if (cookies[REFRESH_COOKIE]) {
        const refreshed = await refreshAuthSession(cookies[REFRESH_COOKIE]);
        if (!isAuthorizedEmail(refreshed.user.email)) throw new Error("UNAUTHORIZED_USER");
        setSessionCookies(res, refreshed.session);
        res.json(authUserResponse(refreshed.user));
        return;
      }
    } catch {
      // Invalid sessions are handled by the common unauthenticated response below.
    }
    clearAuthCookies(res);
    res.status(401).json({ error: "Authentication required." });
  });

  app.post("/api/auth/logout", async (req, res) => {
    const accessToken = parseCookies(req.headers.cookie)[ACCESS_COOKIE];
    await signOutAccessToken(accessToken).catch(() => {});
    clearAuthCookies(res);
    res.json({ signedOut: true });
  });

  app.use("/api", createRequireAuth({ getUser: getUserForAccessToken, secure: secureCookies }));

  app.get("/api/source", async (_req, res, next) => {
    try {
      const config = await readConfig();
      res.json({
        ...config,
        exists: config.sourceType === "google-sheet" || (!isVercel && await pathExists(config.sourceDir)),
        cloudMode: isVercel,
        supabaseConfigured: hasSupabaseConfig(),
      });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/source", async (req, res, next) => {
    try {
      const config = normalizeSourceConfig(req.body, defaultSourceDir);
      if (isVercel && config.sourceType === "local-folder") {
        res.status(400).json({
          error: "This cloud deployment cannot connect to a local Windows folder. Use the local app for folder sync or add cloud storage.",
        });
        return;
      }
      if (config.sourceType === "local-folder" && !config.sourceDir) {
        res.status(400).json({ error: "Enter a folder path containing the CSV/XLSX source files." });
        return;
      }
      if (config.sourceType === "local-folder" && !(await pathExists(config.sourceDir))) {
        res.status(400).json({ error: `Folder not found: ${config.sourceDir}` });
        return;
      }
      await writeConfig(config);
      cache = { sourceKey: "", signature: "", data: null, loadedAt: 0 };
      const data = await loadDashboard({ force: true });
      res.json({ ...config, data });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/upload-dashboard", upload.array("files", 20), async (req, res, next) => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "datalence-upload-"));
    try {
      if (!hasSupabaseConfig()) {
        res.status(400).json({
          error: "Supabase is not configured. Add SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY before uploading files.",
        });
        return;
      }

      const files = req.files || [];
      if (!files.length) {
        res.status(400).json({ error: "Choose one or more CSV/XLSX files to upload." });
        return;
      }

      const invalid = files.find((file) => !isAllowedUpload(file.originalname));
      if (invalid) {
        res.status(400).json({ error: `Unsupported file type: ${invalid.originalname}` });
        return;
      }

      for (const file of files) {
        const filename = cleanUploadName(file.originalname);
        await fs.writeFile(path.join(tempDir, filename), file.buffer);
      }

      const { uploadBatchId } = await createUploadedFileBatch({
        files,
        status: "uploaded",
        message: "Dashboard source files uploaded. Processing started.",
      });

      try {
        const sourceSig = await nodeSourceSignature(tempDir);
        const data = await buildDashboardData(tempDir);
        const sourceDir = `Supabase upload batch ${uploadBatchId}`;
        await saveDashboardSnapshot({
          data,
          sourceDir,
          sourceSignature: sourceSig,
          uploadBatchId,
        });
        await updateUploadBatchStatus({
          uploadBatchId,
          status: "processed",
          message: "Dashboard files uploaded and parsed successfully.",
        });
        res.json({
          ...data,
          sourceDir,
          sourceSignature: sourceSig,
          cacheStatus: "supabase-uploaded",
          supabaseMode: true,
          uploadBatchId,
        });
      } catch (processingError) {
        await updateUploadBatchStatus({
          uploadBatchId,
          status: "uploaded",
          message: `Files are stored in Supabase, but processing failed: ${processingError.message}`,
        });
        res.status(202).json({
          uploadBatchId,
          uploaded: true,
          processed: false,
          message: `Files are stored in Supabase, but processing failed: ${processingError.message}`,
        });
      }
    } catch (error) {
      next(error);
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  app.get("/api/dashboard", async (_req, res, next) => {
    try {
      res.json(await loadDashboard());
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/analytics", async (_req, res, next) => {
    try {
      const dash = await loadDashboard();
      res.json(buildAnalytics(dash));
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/status", async (_req, res, next) => {
    try {
      const config = await readConfig();
      const key = sourceIdentity(config, defaultSourceDir);
      const exists = config.sourceType === "google-sheet" || (!isVercel && await pathExists(config.sourceDir));
      let activeSignature = "";
      if (config.sourceType === "google-sheet") {
        const { workbook } = await fetchGoogleWorkbook(config.googleSheetId);
        activeSignature = workbookSignature(workbook);
      } else if (exists) {
        activeSignature = await sourceSignature(config.sourceDir);
      }
      res.json({
        ...config,
        exists,
        cloudMode: isVercel,
        supabaseConfigured: hasSupabaseConfig(),
        sourceSignature: activeSignature,
        loadedAt: cache.sourceKey === key ? cache.loadedAt : 0,
      });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/refresh", async (_req, res, next) => {
    try {
      res.json(await loadDashboard({ force: true }));
    } catch (error) {
      next(error);
    }
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
      const vite = await createServer({
        root: rootDir,
        server: { middlewareMode: true },
        appType: "spa",
      });
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
