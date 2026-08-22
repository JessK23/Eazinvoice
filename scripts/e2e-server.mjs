import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const port = Number(process.env.PORT || 3101);
const runId = `${Date.now()}-${process.pid}`;
const dataDir = path.join(process.cwd(), ".tmp", `p2-2c-e2e-${runId}`);

fs.mkdirSync(dataDir, { recursive: true });

process.env.NODE_ENV = "test";
process.env.EAZINVOICE_ENV = "test";
process.env.EAZINVOICE_STORAGE = "json";
process.env.EAZINVOICE_CORE_TABLE_SYNC = "false";
process.env.EAZINVOICE_POSTGRES_DUAL_WRITE = "false";
process.env.EAZINVOICE_REPORTS_SOURCE = "runtime";
process.env.EAZINVOICE_ENTITLEMENTS_SOURCE = "runtime";
process.env.EAZINVOICE_DATA_DIR = dataDir;
process.env.DATA_DIR = dataDir;
process.env.DATABASE_URL = "";
process.env.EAZINVOICE_E2E_AUTH = "true";
process.env.EAZINVOICE_E2E_AUTH_SECRET ||= `p2-2c-local-secret-${runId}`;
process.env.EAZINVOICE_PUBLIC_URL = `http://localhost:${port}`;

const { startServerAsync } = await import("../apps/api/src/server.js");
const server = await startServerAsync(port);

console.log(`EazInvoice P2-2C E2E server running on http://localhost:${port}`);
console.log(`EazInvoice P2-2C isolated data dir: ${dataDir}`);

function shutdown() {
  server.close(() => {
    try {
      const resolved = path.resolve(dataDir);
      const workspaceTmp = path.resolve(process.cwd(), ".tmp");
      if (resolved.startsWith(`${workspaceTmp}${path.sep}`) || resolved === workspaceTmp) {
        fs.rmSync(resolved, { recursive: true, force: true });
      }
    } catch (error) {
      console.warn(`Could not clean P2-2C data dir: ${error.message}`);
    }
    process.exit(0);
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
process.on("uncaughtException", (error) => {
  console.error(error);
  process.exit(1);
});

process.stdout.write(os.EOL);
