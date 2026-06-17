import { execFile } from "node:child_process";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __filename = fileURLToPath(import.meta.url);
const rootDir = path.resolve(path.dirname(__filename), "..");
const defaultSourceDir = "C:\\Users\\hp\\Downloads\\DataLense\\csv";
const defaultPython = "C:\\Users\\hp\\.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\python\\python.exe";

function loadDotEnv() {
  const envPath = path.join(rootDir, ".env");
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index === -1) continue;
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[key]) process.env[key] = value;
  }
}

function argValue(name, fallback = "") {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] || fallback : fallback;
}

async function sourceSignature(sourceDir) {
  const entries = await fsp.readdir(sourceDir, { withFileTypes: true });
  const stats = [];
  for (const entry of entries) {
    if (!entry.isFile() || !/\.(csv|xlsx|xls)$/i.test(entry.name)) continue;
    const fullPath = path.join(sourceDir, entry.name);
    const stat = await fsp.stat(fullPath);
    stats.push(`${entry.name}:${stat.size}:${stat.mtimeMs}`);
  }
  return stats.sort().join("|");
}

function buildDashboard(sourceDir, outputPath) {
  const pythonExe = process.env.DASHBOARD_PYTHON || defaultPython;
  const script = path.join(rootDir, "scripts", "build_dashboard_data.py");
  return new Promise((resolve, reject) => {
    execFile(
      pythonExe,
      [script, "--source", sourceDir, "--output", outputPath],
      { cwd: rootDir, windowsHide: true, maxBuffer: 80 * 1024 * 1024 },
      (error, _stdout, stderr) => {
        if (error) {
          reject(new Error(stderr || error.message));
          return;
        }
        resolve();
      },
    );
  });
}

loadDotEnv();

const sourceDir = argValue("--source", process.env.DASHBOARD_SOURCE_DIR || defaultSourceDir);
const tableName = process.env.SUPABASE_DASHBOARD_TABLE || "dashboard_snapshots";
const url = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceRoleKey) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Add them to .env or the current shell.");
  process.exit(1);
}

const tmpPath = path.join(os.tmpdir(), `datalence-dashboard-${Date.now()}.json`);

try {
  await buildDashboard(sourceDir, tmpPath);
  const data = JSON.parse(await fsp.readFile(tmpPath, "utf8"));
  const signature = await sourceSignature(sourceDir);
  const supabase = createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  const inactive = await supabase
    .from(tableName)
    .update({ is_active: false })
    .eq("source_name", "mlh_dashboard")
    .eq("is_active", true);
  if (inactive.error) throw inactive.error;

  const inserted = await supabase.from(tableName).insert({
    source_name: "mlh_dashboard",
    source_dir: sourceDir,
    source_signature: signature,
    data,
    is_active: true,
  });
  if (inserted.error) throw inserted.error;

  console.log(JSON.stringify({
    uploaded: true,
    table: tableName,
    itemFacts: data.itemFacts?.length || 0,
    ledgerFacts: data.ledgerFacts?.length || 0,
    sourceSignatureLength: signature.length,
  }, null, 2));
} finally {
  await fsp.rm(tmpPath, { force: true });
}
