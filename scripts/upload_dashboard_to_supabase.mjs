import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { buildDashboardData, sourceSignature } from "../server/dashboardBuilder.js";

const __filename = fileURLToPath(import.meta.url);
const rootDir = path.resolve(path.dirname(__filename), "..");
const defaultSourceDir = "C:\\Users\\hp\\Downloads\\DataLense\\csv";

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

loadDotEnv();

const sourceDir = argValue("--source", process.env.DASHBOARD_SOURCE_DIR || defaultSourceDir);
const tableName = process.env.SUPABASE_DASHBOARD_TABLE || "dashboard_snapshots";
const url = String(process.env.SUPABASE_URL || "").replace(/\/rest\/v1\/?$/i, "").replace(/\/$/, "");
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceRoleKey) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Add them to .env or the current shell.");
  process.exit(1);
}

try {
  await fsp.access(rootDir);
  const data = await buildDashboardData(sourceDir);
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
} catch (error) {
  console.error(error.message || error);
  process.exit(1);
}
