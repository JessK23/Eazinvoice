import fs from "node:fs";
import path from "node:path";

function configuredDataDir() {
  const configured = process.env.EAZINVOICE_DATA_DIR || process.env.DATA_DIR || "";
  return configured ? path.resolve(configured) : path.join(process.cwd(), "data");
}

function dataFilePath() {
  return path.join(configuredDataDir(), "eazinvoice-data.json");
}

function ensureDataFile() {
  const DATA_DIR = configuredDataDir();
  const DATA_FILE = dataFilePath();
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify({}), "utf8");
  }
}

export function loadPersistedState() {
  try {
    ensureDataFile();
    const DATA_FILE = dataFilePath();
    const raw = fs.readFileSync(DATA_FILE, "utf8");
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function savePersistedState(state) {
  ensureDataFile();
  const DATA_FILE = dataFilePath();
  fs.writeFileSync(DATA_FILE, JSON.stringify(state, null, 2), "utf8");
}

export function describePersistence() {
  ensureDataFile();
  const DATA_DIR = configuredDataDir();
  const DATA_FILE = dataFilePath();
  const stats = fs.statSync(DATA_FILE);
  return {
    mode: process.env.EAZINVOICE_DATA_DIR || process.env.DATA_DIR ? "mounted-json" : "local-json",
    dataDir: DATA_DIR,
    dataFile: DATA_FILE,
    exists: true,
    bytes: stats.size,
    updatedAt: stats.mtime.toISOString(),
  };
}
