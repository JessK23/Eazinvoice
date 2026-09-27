import crypto from "node:crypto";
import { createAzureBlobDocumentStorage } from "../apps/api/src/azure-blob-document-storage.js";
import { loadLocalEnv } from "./postgres-env.mjs";

loadLocalEnv(process.cwd());

const container = String(process.env.EAZINVOICE_AZURE_STORAGE_CONTAINER || "").trim();
const connectionString = String(process.env.EAZINVOICE_AZURE_STORAGE_CONNECTION_STRING || "").trim();

if (!container || !connectionString) {
  throw new Error("Azure probe requires EAZINVOICE_AZURE_STORAGE_CONTAINER and EAZINVOICE_AZURE_STORAGE_CONNECTION_STRING.");
}

const storage = createAzureBlobDocumentStorage({ container, connectionString });
const nonce = `${Date.now()}_${crypto.randomBytes(6).toString("hex")}`;
const sourceKey = `healthchecks/azure-probe/${nonce}/source.bin`;
const payload = Buffer.from(`eazinvoice-azure-probe-${nonce}`, "utf8");

let archived = false;

try {
  console.log("[azure-check] Starting Azure document storage acceptance probe...");

  const put = await storage.put(sourceKey, payload, { mimeType: "application/octet-stream" });
  if (String(put.storageKey) !== sourceKey) throw new Error("put returned unexpected storage key");

  const head = await storage.head(sourceKey);
  if (Number(head.sizeBytes || 0) !== payload.length) throw new Error("head size mismatch");

  const existsBeforeGet = await storage.exists(sourceKey);
  if (!existsBeforeGet) throw new Error("exists returned false after put");

  const loaded = await storage.get(sourceKey);
  if (!Buffer.isBuffer(loaded.bytes) || !loaded.bytes.equals(payload)) throw new Error("get payload mismatch");

  archived = await storage.archive(sourceKey);
  if (!archived) throw new Error("archive returned false for existing probe object");

  const existsAfterArchive = await storage.exists(sourceKey);
  if (existsAfterArchive) throw new Error("source still exists after archive");

  const keys = await storage.listKeys(`healthchecks/azure-probe/${nonce}/`);
  const archivedKeys = keys.filter((entry) => String(entry).includes("archive/") && String(entry).includes(sourceKey));
  if (archivedKeys.length !== 1) throw new Error("archive key was not discoverable under probe prefix");

  await storage.remove(archivedKeys[0]);
  const removed = await storage.exists(archivedKeys[0]);
  if (removed) throw new Error("archived probe key still exists after remove");

  console.log("[azure-check] Azure probe passed.");
} catch (error) {
  console.error("[azure-check] Probe failed:", String(error?.message || error));
  process.exitCode = 1;
} finally {
  try {
    if (await storage.exists(sourceKey)) {
      await storage.remove(sourceKey);
    }
  } catch {
  }
  if (!archived) {
    try {
      const keys = await storage.listKeys(`archive/`);
      const probeArchiveKeys = keys.filter((entry) => String(entry).includes(sourceKey));
      for (const key of probeArchiveKeys) {
        await storage.remove(key).catch(() => {});
      }
    } catch {
    }
  }
}
