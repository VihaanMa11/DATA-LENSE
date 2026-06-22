import { buildDashboardData } from "../server/dashboardBuilder.js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dir = String.raw`C:\Users\hp\Downloads\DataLense\csv`;
const data = await buildDashboardData(dir);
console.log("itemMaster rows:", (data.itemMaster || []).length);
console.log("sample master:", JSON.stringify(data.itemMaster[0]));
const cachePath = path.join(__dirname, "..", "server", "dashboard-cache.json");
fs.writeFileSync(cachePath, JSON.stringify({ sourceKey: "local", signature: "regen", data, loadedAt: Date.now() }));
console.log("cache rewritten:", cachePath);
