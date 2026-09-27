import crypto from "node:crypto";
import { createDocumentStorage } from "../apps/api/src/document-storage.js";
import { loadLocalEnv } from "./postgres-env.mjs";

loadLocalEnv(process.cwd());

const storage = createDocumentStorage({ provider: "local" });
const provider = String(storage?.provider || "");
const rootDir = String(storage?.rootDir || "");

if (provider !== "local") {
  throw new Error(`Local storage check requires provider=local; got ${provider || "unknown"}.`);
}
if (!rootDir) {
  throw new Error("Local storage check requires a configured rootDir.");
}

const nonce = `${Date.now()}_${crypto.randomBytes(6).toString("hex")}`;
const sourceKey = `_system/probes/local-storage/${nonce}/source.bin`;
const payload = Buffer.from(`eazinvoice-local-probe-${nonce}`, "utf8");

let archiveKey = "";

try {
  console.log("[local-check] Document storage provider:", provider);
  console.log("[local-check] Document storage root:", rootDir);

  const put = await storage.put(sourceKey, payload, { mimeType: "application/octet-stream" });
  if (String(put.storageKey) !== sourceKey) throw new Error("put returned unexpected storage key");

  const head = await storage.head(sourceKey);
  if (Number(head.sizeBytes || 0) !== payload.length) throw new Error("head size mismatch");

  const existsAfterPut = await storage.exists(sourceKey);
  if (!existsAfterPut) throw new Error("exists returned false after put");

  const loaded = await storage.get(sourceKey);
  if (!Buffer.isBuffer(loaded.bytes) || !loaded.bytes.equals(payload)) throw new Error("get payload mismatch");

  const archived = await storage.archive(sourceKey);
  archiveKey = String(archived?.archiveKey || "");
  if (!archiveKey) throw new Error("archive did not return archiveKey");

  const existsAfterArchive = await storage.exists(sourceKey);
  if (existsAfterArchive) throw new Error("source still exists after archive");

  const archiveExists = await storage.exists(archiveKey);
  if (!archiveExists) throw new Error("archive key missing after archive");

  await storage.remove(archiveKey);
  const archiveRemoved = await storage.exists(archiveKey);
  if (archiveRemoved) throw new Error("archive key still exists after remove");

  console.log("[local-check] Local storage probe passed.");
} catch (error) {
  console.error("[local-check] Probe failed:", String(error?.message || error));
  process.exitCode = 1;
} finally {
  try {
    if (await storage.exists(sourceKey)) {
      await storage.remove(sourceKey);
    }
  } catch {
  }
  try {
    if (archiveKey && await storage.exists(archiveKey)) {
      await storage.remove(archiveKey);
    }
  } catch {
  }
}
