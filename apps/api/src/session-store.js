import fs from "node:fs";
import path from "node:path";

const DATA_DIR = path.join(process.cwd(), "data");
const SESSION_FILE = path.join(DATA_DIR, "eazinvoice-sessions.json");

function ensureSessionFile() {
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
    return JSON.parse(fs.readFileSync(SESSION_FILE, "utf8") || "{}");
  } catch {
    return {};
  }
}

function saveSessions(sessions) {
  ensureSessionFile();
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

