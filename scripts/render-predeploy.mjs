import { spawnSync } from "node:child_process";
import path from "node:path";
import { loadLocalEnv } from "./postgres-env.mjs";

const ROOT = process.cwd();

loadLocalEnv(ROOT);

function runStep(label, args) {
  const result = spawnSync(process.execPath, args, {
    stdio: "inherit",
    cwd: ROOT,
    env: process.env,
    windowsHide: true,
  });
  if (result.status !== 0) {
    throw new Error(`${label} failed with exit code ${result.status ?? "unknown"}.`);
  }
}

function normalize(value) {
  return String(value || "").trim().toLowerCase();
}

const storageMode = normalize(process.env.EAZINVOICE_STORAGE);
if (storageMode !== "postgres") {
  throw new Error("Render pre-deploy migration gate requires EAZINVOICE_STORAGE=postgres.");
}

if (!String(process.env.DATABASE_URL || "").trim()) {
  throw new Error("Render pre-deploy migration gate requires DATABASE_URL.");
}

console.log("[render-predeploy] Running PostgreSQL migrations...");
runStep("Postgres migrate", [path.join(ROOT, "scripts", "postgres-check.mjs"), "--migrate"]);

console.log("[render-predeploy] Verifying required schema compatibility...");
runStep("Postgres schema verify", [path.join(ROOT, "scripts", "postgres-check.mjs"), "--verify-schema"]);

console.log("[render-predeploy] Migration gate passed.");
