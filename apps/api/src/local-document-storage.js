import crypto from "node:crypto";
import fsSync from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";

function normalizeStorageKey(key = "") {
  const normalized = String(key || "").trim().replace(/\\+/g, "/").replace(/^\/+/, "");
  if (!normalized || normalized.includes("..")) {
    throw new Error("Invalid document storage key.");
  }
  if (!/^[A-Za-z0-9/_\-.]+$/.test(normalized)) {
    throw new Error("Invalid document storage key.");
  }
  return normalized;
}

function resolveStoragePath(rootDir, storageKey) {
  const normalizedKey = normalizeStorageKey(storageKey);
  const absoluteRoot = path.resolve(rootDir);
  const absolutePath = path.resolve(path.join(absoluteRoot, normalizedKey));
  if (!absolutePath.startsWith(absoluteRoot)) {
    throw new Error("Invalid document storage path.");
  }
  return {
    normalizedKey,
    absoluteRoot,
    absolutePath,
  };
}

function sha256Hex(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function asText(value = "") {
  return String(value || "").trim();
}

export function validateLocalDocumentStorageRoot(rootDir, options = {}) {
  const absoluteRoot = path.resolve(String(rootDir || path.join(process.cwd(), "data", "uploads")));
  const production = Boolean(options.production);

  if (!path.isAbsolute(absoluteRoot)) {
    throw new Error("Document storage root must resolve to an absolute path.");
  }

  const cwd = path.resolve(process.cwd());
  if (production && (absoluteRoot === cwd || absoluteRoot.startsWith(`${cwd}${path.sep}`))) {
    throw new Error("Production local document storage root must be outside the application source directory.");
  }

  try {
    fsSync.mkdirSync(absoluteRoot, { recursive: true });
    const stats = fsSync.statSync(absoluteRoot);
    if (!stats.isDirectory()) {
      throw new Error("Configured document storage root is not a directory.");
    }
    fsSync.accessSync(absoluteRoot, fsSync.constants.R_OK | fsSync.constants.W_OK);
    const probeName = `.eazinvoice-storage-probe-${process.pid}-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
    const probePath = path.join(absoluteRoot, probeName);
    fsSync.writeFileSync(probePath, "probe", { flag: "wx" });
    fsSync.accessSync(probePath, fsSync.constants.R_OK | fsSync.constants.W_OK);
    fsSync.rmSync(probePath, { force: true });
  } catch (error) {
    throw new Error(`Document storage root validation failed for ${absoluteRoot}: ${asText(error?.message || error)}`);
  }

  return absoluteRoot;
}

export function createLocalDocumentStorage(options = {}) {
  const rootDir = validateLocalDocumentStorageRoot(options.rootDir || path.join(process.cwd(), "data", "uploads"), {
    production: Boolean(options.production),
  });
  const provider = String(options.provider || "local").trim().toLowerCase();

  return {
    provider,
    rootDir,

    async put(storageKey, bytes, metadata = {}) {
      const content = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes || []);
      const { normalizedKey, absolutePath } = resolveStoragePath(rootDir, storageKey);
      await fs.mkdir(path.dirname(absolutePath), { recursive: true });
      await fs.writeFile(absolutePath, content, { flag: "wx" });
      return {
        storageKey: normalizedKey,
        sizeBytes: content.length,
        checksumSha256: sha256Hex(content),
        mimeType: String(metadata.mimeType || "").trim().toLowerCase(),
      };
    },

    async get(storageKey) {
      const { normalizedKey, absolutePath } = resolveStoragePath(rootDir, storageKey);
      const bytes = await fs.readFile(absolutePath);
      return {
        storageKey: normalizedKey,
        bytes,
        sizeBytes: bytes.length,
        checksumSha256: sha256Hex(bytes),
      };
    },

    async head(storageKey) {
      const { normalizedKey, absolutePath } = resolveStoragePath(rootDir, storageKey);
      const stats = await fs.stat(absolutePath);
      return {
        storageKey: normalizedKey,
        sizeBytes: Number(stats.size || 0),
      };
    },

    async exists(storageKey) {
      try {
        await this.head(storageKey);
        return true;
      } catch {
        return false;
      }
    },

    async archive(storageKey) {
      const { normalizedKey, absolutePath, absoluteRoot } = resolveStoragePath(rootDir, storageKey);
      const archiveKey = `archive/${Date.now()}_${normalizedKey.replace(/[^A-Za-z0-9/_\-.]+/g, "_")}`;
      const archivePath = path.resolve(path.join(absoluteRoot, archiveKey));
      await fs.mkdir(path.dirname(archivePath), { recursive: true });
      await fs.rename(absolutePath, archivePath);
      return {
        storageKey: normalizedKey,
        archiveKey,
      };
    },

    async remove(storageKey) {
      const { absolutePath } = resolveStoragePath(rootDir, storageKey);
      await fs.rm(absolutePath, { force: true });
    },

    async listKeys(prefix = "") {
      const normalizedPrefix = String(prefix || "").trim().replace(/\\+/g, "/").replace(/^\/+/, "");
      const basePath = normalizedPrefix
        ? resolveStoragePath(rootDir, normalizedPrefix).absolutePath
        : path.resolve(rootDir);
      const keys = [];

      async function walk(currentPath) {
        const entries = await fs.readdir(currentPath, { withFileTypes: true }).catch(() => []);
        for (const entry of entries) {
          const full = path.join(currentPath, entry.name);
          if (entry.isDirectory()) {
            await walk(full);
            continue;
          }
          const relative = path.relative(rootDir, full).replace(/\\+/g, "/");
          keys.push(relative);
        }
      }

      await walk(basePath);
      return keys;
    },
  };
}
