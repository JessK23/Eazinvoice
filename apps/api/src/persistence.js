import fs from "node:fs";
import path from "node:path";
import { saveStateToPostgres } from "./postgres-state.js";

function configuredDataDir() {
  const configured = process.env.EAZINVOICE_DATA_DIR || process.env.DATA_DIR || "";
  return configured ? path.resolve(configured) : path.join(process.cwd(), "data");
}

function hasConfiguredDataDir() {
  return Boolean(process.env.EAZINVOICE_DATA_DIR || process.env.DATA_DIR);
}

function postgresDualWriteEnabled() {
  return ["1", "true", "yes", "on"].includes(String(process.env.EAZINVOICE_POSTGRES_DUAL_WRITE || "").toLowerCase());
}

function storageConfigError(error) {
  const dataDir = configuredDataDir();
  return new Error(
    `EazInvoice production storage is not writable at ${dataDir}. In Render, add a persistent disk mounted at this exact path, or update EAZINVOICE_DATA_DIR to the actual disk mount path. Original error: ${error.message}`,
  );
}

function dataFilePath() {
  return path.join(configuredDataDir(), "eazinvoice-data.json");
}

function backupFilePath() {
  return path.join(configuredDataDir(), "eazinvoice-data.backup.json");
}

function ensureDataFile() {
  const DATA_DIR = configuredDataDir();
  const DATA_FILE = dataFilePath();
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (!fs.existsSync(DATA_FILE)) {
      fs.writeFileSync(DATA_FILE, JSON.stringify({}), "utf8");
    }
  } catch (error) {
    throw storageConfigError(error);
  }
}

export function loadPersistedState() {
  try {
    ensureDataFile();
    const DATA_FILE = dataFilePath();
    const raw = fs.readFileSync(DATA_FILE, "utf8");
    return raw ? JSON.parse(raw) : {};
  } catch (error) {
    if (hasConfiguredDataDir()) {
      throw error;
    }
    return {};
  }
}

export function savePersistedState(state) {
  ensureDataFile();
  const DATA_FILE = dataFilePath();
  const BACKUP_FILE = backupFilePath();
  const TEMP_FILE = `${DATA_FILE}.${process.pid}.tmp`;
  const serialized = JSON.stringify(state, null, 2);
  try {
    if (fs.existsSync(DATA_FILE)) {
      fs.copyFileSync(DATA_FILE, BACKUP_FILE);
    }
    fs.writeFileSync(TEMP_FILE, serialized, "utf8");
    fs.renameSync(TEMP_FILE, DATA_FILE);
    if (postgresDualWriteEnabled() && process.env.DATABASE_URL) {
      saveStateToPostgres(state, {
        source: "json-dual-write",
        sourcePath: DATA_FILE,
      }).catch((error) => {
        console.error("Postgres dual-write failed:", error.message);
      });
    }
  } catch (error) {
    if (fs.existsSync(TEMP_FILE)) {
      fs.rmSync(TEMP_FILE, { force: true });
    }
    throw storageConfigError(error);
  }
}

export function describePersistence() {
  ensureDataFile();
  const DATA_DIR = configuredDataDir();
  const DATA_FILE = dataFilePath();
  const BACKUP_FILE = backupFilePath();
  const stats = fs.statSync(DATA_FILE);
  return {
    mode: process.env.EAZINVOICE_DATA_DIR || process.env.DATA_DIR ? "mounted-json" : "local-json",
    postgresDualWrite: postgresDualWriteEnabled(),
    dataDir: DATA_DIR,
    dataFile: DATA_FILE,
    backupFile: BACKUP_FILE,
    backupExists: fs.existsSync(BACKUP_FILE),
    configured: hasConfiguredDataDir(),
    exists: true,
    bytes: stats.size,
    updatedAt: stats.mtime.toISOString(),
  };
}
