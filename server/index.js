import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { hasSupabaseConfig, loadDashboardSnapshot } from "./supabase.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const configPath = path.join(__dirname, "data-source.json");
const cachePath = path.join(__dirname, "dashboard-cache.json");
const defaultSourceDir = "C:\\Users\\hp\\Downloads\\DataLense\\csv";
const bundledPython = "C:\\Users\\hp\\.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\python\\python.exe";
const pythonScript = path.join(rootDir, "scripts", "build_dashboard_data.py");
const isVercel = Boolean(process.env.VERCEL);

let cache = {
  sourceDir: "",
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
    return {
      sourceDir: parsed.sourceDir || defaultSourceDir,
    };
  } catch {
    return { sourceDir: defaultSourceDir };
  }
}

async function writeConfig(sourceDir) {
  await fs.mkdir(path.dirname(configPath), { recursive: true });
  await fs.writeFile(configPath, JSON.stringify({ sourceDir }, null, 2), "utf8");
}

async function readDiskCache(sourceDir, signature) {
  try {
    const raw = await fs.readFile(cachePath, "utf8");
    const parsed = JSON.parse(raw);
    const cachedSource = path.resolve(parsed.sourceDir || "");
    const activeSource = path.resolve(sourceDir);
    if (cachedSource !== activeSource || parsed.signature !== signature || !parsed.data) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

async function writeDiskCache(sourceDir, signature, data, loadedAt) {
  await fs.writeFile(
    cachePath,
    JSON.stringify({ sourceDir, signature, loadedAt, data }),
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
  if (isVercel) {
    const snapshot = await loadDashboardSnapshot();
    return snapshot || cloudDashboard(hasSupabaseConfig() ? "Supabase dashboard snapshot" : "Vercel cloud deployment");
  }

  const { sourceDir } = await readConfig();
  if (!(await pathExists(sourceDir))) {
    const error = new Error(`Data source folder does not exist: ${sourceDir}`);
    error.status = 400;
    throw error;
  }

  const signature = await sourceSignature(sourceDir);
  if (!force && cache.data && cache.sourceDir === sourceDir && cache.signature === signature) {
      return {
        ...cache.data,
        sourceDir,
        sourceSignature: signature,
        cacheStatus: "hit",
        loadedAt: cache.loadedAt,
      };
  }

  if (!force) {
    const diskCache = await readDiskCache(sourceDir, signature);
    if (diskCache) {
      cache = {
        sourceDir,
        signature,
        data: diskCache.data,
        loadedAt: diskCache.loadedAt || Date.now(),
      };
      return {
        ...diskCache.data,
        sourceDir,
        sourceSignature: signature,
        cacheStatus: "disk-cache",
        loadedAt: cache.loadedAt,
      };
    }
  }

  const data = await runPython(sourceDir);
  const loadedAt = Date.now();
  cache = {
    sourceDir,
    signature,
    data,
    loadedAt,
  };
  await writeDiskCache(sourceDir, signature, data, loadedAt);
  return {
    ...data,
    sourceSignature: signature,
    cacheStatus: "refreshed",
    loadedAt: cache.loadedAt,
  };
}

async function createApp() {
  const app = express();
  app.use(express.json({ limit: "1mb" }));

  app.get("/api/source", async (_req, res, next) => {
    try {
      const config = await readConfig();
      res.json({
        ...config,
        exists: !isVercel && await pathExists(config.sourceDir),
        cloudMode: isVercel,
        supabaseConfigured: hasSupabaseConfig(),
      });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/source", async (req, res, next) => {
    try {
      if (isVercel) {
        res.status(400).json({
          error: "This cloud deployment cannot connect to a local Windows folder. Use the local app for folder sync or add cloud storage.",
        });
        return;
      }
      const sourceDir = String(req.body?.sourceDir || "").trim();
      if (!sourceDir) {
        res.status(400).json({ error: "Enter a folder path containing the CSV/XLSX source files." });
        return;
      }
      if (!(await pathExists(sourceDir))) {
        res.status(400).json({ error: `Folder not found: ${sourceDir}` });
        return;
      }
      await writeConfig(sourceDir);
      cache = { sourceDir: "", signature: "", data: null, loadedAt: 0 };
      const data = await loadDashboard({ force: true });
      res.json({ sourceDir, data });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/dashboard", async (_req, res, next) => {
    try {
      res.json(await loadDashboard());
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/status", async (_req, res, next) => {
    try {
      const { sourceDir } = await readConfig();
      const exists = !isVercel && await pathExists(sourceDir);
      res.json({
        sourceDir,
        exists,
        cloudMode: isVercel,
        supabaseConfigured: hasSupabaseConfig(),
        sourceSignature: exists ? await sourceSignature(sourceDir) : isVercel ? hasSupabaseConfig() ? "supabase-configured" : "cloud-deployment" : "",
        loadedAt: path.resolve(cache.sourceDir || "") === path.resolve(sourceDir) ? cache.loadedAt : 0,
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
