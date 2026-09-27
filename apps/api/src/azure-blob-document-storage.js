import crypto from "node:crypto";

function asText(value = "") {
  return String(value || "").trim();
}

function normalizeStorageKey(key = "") {
  const normalized = asText(key).replace(/\\+/g, "/").replace(/^\/+/, "");
  if (!normalized || normalized.includes("..")) {
    throw new Error("Invalid document storage key.");
  }
  if (!/^[A-Za-z0-9/_\-.]+$/.test(normalized)) {
    throw new Error("Invalid document storage key.");
  }
  return normalized;
}

function sha256Hex(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function isNotFoundError(error) {
  const status = Number(error?.statusCode || error?.status || 0);
  const code = asText(error?.code).toLowerCase();
  return status === 404
    || ["blobnotfound", "resourcenotfound", "containernotfound"].includes(code);
}

function ensureContainerName(value = "") {
  const name = asText(value).toLowerCase();
  if (!name) throw new Error("Azure document storage container is required.");
  if (!/^[a-z0-9](?:[a-z0-9-]{1,61}[a-z0-9])?$/.test(name)) {
    throw new Error("Azure document storage container name is invalid.");
  }
  return name;
}

async function waitForCopyCompletion(blobClient, timeoutMs = 120000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const properties = await blobClient.getProperties();
    const copyStatus = String(properties?.copyStatus || "").toLowerCase();
    if (!copyStatus || copyStatus === "success") return;
    if (copyStatus === "failed" || copyStatus === "aborted") {
      throw new Error("Azure blob archive copy failed.");
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error("Azure blob archive copy timed out.");
}

export function createAzureBlobDocumentStorage(options = {}) {
  const provider = "azure";
  const containerName = ensureContainerName(options.container || process.env.EAZINVOICE_AZURE_STORAGE_CONTAINER);
  const connectionString = asText(options.connectionString || process.env.EAZINVOICE_AZURE_STORAGE_CONNECTION_STRING);
  const clientFactory = typeof options.clientFactory === "function" ? options.clientFactory : null;

  if (!clientFactory && !connectionString) {
    throw new Error("Azure document storage requires EAZINVOICE_AZURE_STORAGE_CONNECTION_STRING.");
  }

  let containerPromise = null;

  async function loadContainerClient() {
    if (!containerPromise) {
      containerPromise = (async () => {
        if (clientFactory) {
          return clientFactory({ containerName, provider });
        }
        let sdk;
        try {
          sdk = await import("@azure/storage-blob");
        } catch {
          throw new Error("Azure storage adapter selected but '@azure/storage-blob' is not installed.");
        }
        const service = sdk.BlobServiceClient.fromConnectionString(connectionString);
        const containerClient = service.getContainerClient(containerName);
        await containerClient.createIfNotExists();
        return containerClient;
      })();
    }
    return containerPromise;
  }

  return {
    provider,
    containerName,

    async put(storageKey, bytes, metadata = {}) {
      const key = normalizeStorageKey(storageKey);
      const content = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes || []);
      const container = await loadContainerClient();
      const blob = container.getBlockBlobClient(key);
      await blob.uploadData(content, {
        blobHTTPHeaders: {
          blobContentType: asText(metadata.mimeType).toLowerCase() || "application/octet-stream",
        },
        conditions: { ifNoneMatch: "*" },
      });
      return {
        storageKey: key,
        sizeBytes: content.length,
        checksumSha256: sha256Hex(content),
        mimeType: asText(metadata.mimeType).toLowerCase(),
      };
    },

    async get(storageKey) {
      const key = normalizeStorageKey(storageKey);
      const container = await loadContainerClient();
      const blob = container.getBlockBlobClient(key);
      const bytes = await blob.downloadToBuffer();
      return {
        storageKey: key,
        bytes,
        sizeBytes: bytes.length,
        checksumSha256: sha256Hex(bytes),
      };
    },

    async head(storageKey) {
      const key = normalizeStorageKey(storageKey);
      const container = await loadContainerClient();
      const blob = container.getBlockBlobClient(key);
      const properties = await blob.getProperties();
      return {
        storageKey: key,
        sizeBytes: Number(properties.contentLength || 0),
      };
    },

    async exists(storageKey) {
      const key = normalizeStorageKey(storageKey);
      try {
        const container = await loadContainerClient();
        const blob = container.getBlockBlobClient(key);
        return await blob.exists();
      } catch (error) {
        if (isNotFoundError(error)) return false;
        throw error;
      }
    },

    async stat(storageKey) {
      const key = normalizeStorageKey(storageKey);
      try {
        return await this.head(key);
      } catch (error) {
        if (isNotFoundError(error)) return null;
        throw error;
      }
    },

    isNotFoundError,

    async archive(storageKey) {
      const key = normalizeStorageKey(storageKey);
      const archiveKey = `archive/${Date.now()}_${key.replace(/[^A-Za-z0-9/_\-.]+/g, "_")}`;
      const container = await loadContainerClient();
      const source = container.getBlockBlobClient(key);
      if (!await source.exists()) return false;
      const target = container.getBlockBlobClient(archiveKey);
      await target.startCopyFromURL(source.url);
      await waitForCopyCompletion(target);
      await source.deleteIfExists();
      return true;
    },

    async remove(storageKey) {
      const key = normalizeStorageKey(storageKey);
      const container = await loadContainerClient();
      const blob = container.getBlockBlobClient(key);
      await blob.deleteIfExists();
      return true;
    },

    async listKeys(prefix = "") {
      const container = await loadContainerClient();
      const normalizedPrefix = normalizeStorageKey(prefix || "x").replace(/(^x$)|(^x\/)/, "");
      const keys = [];
      for await (const blob of container.listBlobsFlat({ prefix: normalizedPrefix || undefined })) {
        const key = asText(blob?.name);
        if (key) keys.push(key);
      }
      return keys;
    },
  };
}
