import fs from "node:fs";
import path from "node:path";

function configuredDataDir() {
  const configured = process.env.EAZINVOICE_DATA_DIR || process.env.DATA_DIR || "";
  return configured ? path.resolve(configured) : path.join(process.cwd(), "data");
}

function sessionFilePath() {
  return path.join(configuredDataDir(), "eazinvoice-sessions.json");
}

function ensureSessionFile() {
  const DATA_DIR = configuredDataDir();
  const SESSION_FILE = sessionFilePath();
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(SESSION_FILE)) {
    fs.writeFileSync(SESSION_FILE, JSON.stringify({}), "utf8");
  }
}

function loadSessions() {
  try {
    ensureSessionFile();
    const SESSION_FILE = sessionFilePath();
    return JSON.parse(fs.readFileSync(SESSION_FILE, "utf8") || "{}");
  } catch {
    return {};
  }
}

function saveSessions(sessions) {
  ensureSessionFile();
  const SESSION_FILE = sessionFilePath();
  fs.writeFileSync(SESSION_FILE, JSON.stringify(sessions, null, 2), "utf8");
}

export function createSessionStore() {
  const sessions = loadSessions();
  return {
    create(user) {
      const token = `sess_${Math.random().toString(36).slice(2, 10)}`;
      sessions[token] = user;
      saveSessions(sessions);
      return token;
    },
    get(token) {
      return sessions[token] ?? null;
    },
  };
}
