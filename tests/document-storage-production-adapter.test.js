import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { createDocumentStorage, DOCUMENT_CLASSIFICATIONS, resolveUploadsRoot } from "../apps/api/src/document-storage.js";
import { createAzureBlobDocumentStorage } from "../apps/api/src/azure-blob-document-storage.js";
import { createDocumentService } from "../apps/api/src/document-service.js";

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function createFakeApi() {
  const docs = [];
  return {
    createDocumentRecord(input = {}) {
      const now = new Date().toISOString();
      const record = {
        ...clone(input),
        id: String(input.id || ""),
        createdAt: input.createdAt || now,
        updatedAt: now,
      };
      docs.push(record);
      return clone(record);
    },
    listDocumentsForBusiness(businessId) {
      return clone(docs.filter((entry) => String(entry.businessId) === String(businessId)));
    },
    getDocumentRecordById(documentId) {
      return clone(docs.find((entry) => entry.id === documentId) || null);
    },
    updateDocumentRecord(documentId, updates = {}) {
      const document = docs.find((entry) => entry.id === documentId);
      if (!document) return null;
      Object.assign(document, clone(updates), { updatedAt: new Date().toISOString() });
      return clone(document);
    },
    findDocumentByIdempotencyKey(input = {}) {
      const match = docs.find((entry) => (
        String(entry.ownerUserId || "") === String(input.ownerUserId || "")
        && String(entry.businessId || "") === String(input.businessId || "")
        && String(entry.idempotencyKey || "") === String(input.idempotencyKey || "")
      ));
      return clone(match || null);
    },
    listDocumentStorageKeys(businessId = "") {
      return docs
        .filter((entry) => !businessId || String(entry.businessId || "") === String(businessId))
        .map((entry) => String(entry.storageKey || "").trim())
        .filter(Boolean);
    },
    resolveRecordsWorkspaceAccess(user, options = {}, permission = "read") {
      if (!user?.id) throw new Error("Authentication required");
      if (user.role === "admin") {
        return {
          ownerUserId: user.id,
          businessId: options.businessId,
          access: { permissions: { read: true, writeRecords: true } },
        };
      }
      const businessId = String(options.businessId || "");
      const allowed = Array.isArray(user.businessIds) ? user.businessIds : [];
      if (!allowed.includes(businessId)) throw new Error("Business workspace access denied");
      return {
        ownerUserId: user.id,
        businessId,
        access: {
          permissions: {
            read: true,
            writeRecords: permission === "read" ? false : true,
          },
        },
      };
    },
  };
}

class MockBlobClient {
  constructor(containerName, key, blobs, faults = {}) {
    this.containerName = containerName;
    this.key = key;
    this.blobs = blobs;
    this.faults = faults;
    this.url = `https://mock.local/${containerName}/${encodeURIComponent(key)}`;
  }

  maybeThrow(op) {
    const direct = this.faults?.[`${op}:${this.key}`] || this.faults?.[`${op}:*`];
    if (direct) {
      const error = new Error(String(direct.message || `${op} failed`));
      if (direct.statusCode !== undefined) error.statusCode = direct.statusCode;
      if (direct.code !== undefined) error.code = direct.code;
      throw error;
    }
  }

  async uploadData(bytes, options = {}) {
    const ifNoneMatch = options?.conditions?.ifNoneMatch;
    if (ifNoneMatch === "*" && this.blobs.has(this.key)) {
      const error = new Error("Blob already exists");
      error.statusCode = 409;
      throw error;
    }
    this.blobs.set(this.key, {
      bytes: Buffer.from(bytes),
      contentType: String(options?.blobHTTPHeaders?.blobContentType || "application/octet-stream"),
    });
  }

  async exists() {
    this.maybeThrow("exists");
    return this.blobs.has(this.key);
  }

  async downloadToBuffer() {
    const hit = this.blobs.get(this.key);
    if (!hit) {
      const error = new Error("Blob not found");
      error.statusCode = 404;
      throw error;
    }
    return Buffer.from(hit.bytes);
  }

  async getProperties() {
    const hit = this.blobs.get(this.key);
    if (!hit) {
      const error = new Error("Blob not found");
      error.statusCode = 404;
      throw error;
    }
    return {
      contentLength: hit.bytes.length,
      contentType: hit.contentType,
      copyStatus: "success",
    };
  }

  async deleteIfExists() {
    this.blobs.delete(this.key);
    return true;
  }

  async startCopyFromURL(sourceUrl) {
    const marker = `/${this.containerName}/`;
    const idx = String(sourceUrl || "").indexOf(marker);
    const sourceKey = idx === -1 ? "" : decodeURIComponent(String(sourceUrl).slice(idx + marker.length));
    const source = this.blobs.get(sourceKey);
    if (!source) {
      const error = new Error("Source blob missing");
      error.statusCode = 404;
      throw error;
    }
    this.blobs.set(this.key, {
      bytes: Buffer.from(source.bytes),
      contentType: source.contentType,
    });
    return { copyStatus: "success" };
  }
}

function createMockAzureContainer(containerName, blobs, faults = {}) {
  return {
    async createIfNotExists() {
      return { succeeded: true };
    },
    getBlockBlobClient(key) {
      return new MockBlobClient(containerName, key, blobs, faults);
    },
    async *listBlobsFlat(options = {}) {
      const prefix = String(options?.prefix || "");
      for (const key of [...blobs.keys()].sort()) {
        if (!prefix || key.startsWith(prefix)) {
          yield { name: key };
        }
      }
    },
  };
}

test("storage factory keeps local adapter behavior", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "eaz-doc-factory-local-"));
  try {
    const storage = createDocumentStorage({ provider: "local", rootDir: root });
    const put = await storage.put("business/biz_local/supporting_attachment/a.bin", Buffer.from("local", "utf8"), { mimeType: "application/octet-stream" });
    assert.equal(put.storageKey, "business/biz_local/supporting_attachment/a.bin");
    assert.equal(await storage.exists(put.storageKey), true);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("development uploads root fallback remains available", () => {
  const previous = {
    EAZINVOICE_ENV: process.env.EAZINVOICE_ENV,
    NODE_ENV: process.env.NODE_ENV,
    EAZINVOICE_UPLOADS_DIR: process.env.EAZINVOICE_UPLOADS_DIR,
    UPLOADS_DIR: process.env.UPLOADS_DIR,
    EAZINVOICE_DATA_DIR: process.env.EAZINVOICE_DATA_DIR,
    DATA_DIR: process.env.DATA_DIR,
  };
  try {
    process.env.EAZINVOICE_ENV = "development";
    process.env.NODE_ENV = "development";
    delete process.env.EAZINVOICE_UPLOADS_DIR;
    delete process.env.UPLOADS_DIR;
    delete process.env.EAZINVOICE_DATA_DIR;
    delete process.env.DATA_DIR;
    const fallbackRoot = resolveUploadsRoot();
    assert.equal(path.isAbsolute(fallbackRoot), true);
    assert.match(fallbackRoot.replace(/\\/g, "/"), /\/data\/uploads$/i);
  } finally {
    Object.entries(previous).forEach(([key, value]) => {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    });
  }
});

test("storage factory rejects invalid provider and fails closed on missing azure config", () => {
  assert.throws(() => createDocumentStorage({ provider: "unknown" }), /Unsupported document storage provider/i);
  assert.throws(() => createDocumentStorage({ provider: "azure", connectionString: "", container: "" }), /Azure document storage/i);
});

test("production local storage fails closed without explicit persistent uploads root", () => {
  const previous = {
    EAZINVOICE_ENV: process.env.EAZINVOICE_ENV,
    NODE_ENV: process.env.NODE_ENV,
    EAZINVOICE_UPLOADS_DIR: process.env.EAZINVOICE_UPLOADS_DIR,
    UPLOADS_DIR: process.env.UPLOADS_DIR,
    EAZINVOICE_DATA_DIR: process.env.EAZINVOICE_DATA_DIR,
    DATA_DIR: process.env.DATA_DIR,
  };
  try {
    process.env.EAZINVOICE_ENV = "production";
    process.env.NODE_ENV = "production";
    delete process.env.EAZINVOICE_UPLOADS_DIR;
    delete process.env.UPLOADS_DIR;
    process.env.EAZINVOICE_DATA_DIR = path.join(process.cwd(), "data", "fallback-data-root");
    assert.throws(
      () => createDocumentStorage({ provider: "local" }),
      /requires an explicitly configured persistent storage directory/i,
    );
  } finally {
    Object.entries(previous).forEach(([key, value]) => {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    });
  }
});

test("production local storage accepts explicit uploads root and survives reinitialization", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "eaz-doc-prod-local-"));
  const previous = {
    EAZINVOICE_ENV: process.env.EAZINVOICE_ENV,
    NODE_ENV: process.env.NODE_ENV,
    EAZINVOICE_UPLOADS_DIR: process.env.EAZINVOICE_UPLOADS_DIR,
  };
  try {
    process.env.EAZINVOICE_ENV = "production";
    process.env.NODE_ENV = "production";
    process.env.EAZINVOICE_UPLOADS_DIR = root;

    const storageA = createDocumentStorage({ provider: "local" });
    const payload = Buffer.from("render-persistent-disk-probe", "utf8");
    const key = "business/biz_1/supporting_attachment/reinit.bin";
    await storageA.put(key, payload, { mimeType: "application/octet-stream" });

    const storageB = createDocumentStorage({ provider: "local" });
    const loaded = await storageB.get(key);
    assert.equal(loaded.bytes.toString("utf8"), "render-persistent-disk-probe");
  } finally {
    Object.entries(previous).forEach(([key, value]) => {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    });
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("local storage root validation fails closed for invalid root target", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "eaz-doc-root-invalid-"));
  const filePath = path.join(root, "not-a-directory");
  await fs.writeFile(filePath, "x", "utf8");
  await assert.rejects(
    async () => {
      const storage = createDocumentStorage({ provider: "local", rootDir: filePath });
      await storage.put("business/biz_1/supporting_attachment/a.bin", Buffer.from("x"));
    },
    /root validation failed|not a directory/i,
  );
  await fs.rm(root, { recursive: true, force: true });
});

test("azure adapter uses server-generated keys and supports durable restart semantics", async () => {
  const blobs = new Map();
  const containerName = "eazinvoice-documents";
  const clientFactory = () => createMockAzureContainer(containerName, blobs);
  const storageA = createAzureBlobDocumentStorage({ container: containerName, clientFactory });
  const api = createFakeApi();
  const serviceA = createDocumentService({ api, storage: storageA });

  const owner = { id: "usr_owner", businessIds: ["biz_1"] };
  const first = await serviceA.putDocument({
    user: owner,
    businessId: "biz_1",
    classification: DOCUMENT_CLASSIFICATIONS.KYC,
    relatedEntityType: "company_kyc",
    relatedEntityId: "cmp_1",
    originalFilename: "pan.pdf",
    mimeType: "application/pdf",
    bytes: Buffer.from("durable-payload", "utf8"),
    idempotencyKey: "azure-idem-1",
  });

  const storageB = createAzureBlobDocumentStorage({ container: containerName, clientFactory });
  const serviceB = createDocumentService({ api, storage: storageB });
  const loaded = await serviceB.openDocumentForBusiness(first.id, { user: owner, businessId: "biz_1" });
  assert.equal(loaded.bytes.toString("utf8"), "durable-payload");

  await assert.rejects(() => storageA.put("../escape.pdf", Buffer.from("x")), /Invalid document storage key/i);

  const keys = await storageA.listKeys("business/biz_1");
  assert.equal(keys.length, 1);
  assert.match(keys[0], /^business\/biz_1\//);
});

test("azure adapter reconciliation semantics remain fail-closed", async () => {
  const blobs = new Map();
  const containerName = "eazinvoice-documents";
  const clientFactory = () => createMockAzureContainer(containerName, blobs);
  const storage = createAzureBlobDocumentStorage({ container: containerName, clientFactory });
  const api = createFakeApi();
  const service = createDocumentService({ api, storage });
  const owner = { id: "usr_owner", businessIds: ["biz_1"] };

  const record = await service.putDocument({
    user: owner,
    businessId: "biz_1",
    classification: DOCUMENT_CLASSIFICATIONS.KYC,
    relatedEntityType: "company_kyc",
    relatedEntityId: "cmp_1",
    originalFilename: "proof.pdf",
    mimeType: "application/pdf",
    bytes: Buffer.from("checksum-source", "utf8"),
  });

  blobs.delete(record.storageKey);
  await assert.rejects(() => service.openDocumentForBusiness(record.id, { user: owner, businessId: "biz_1" }), (error) => Number(error?.statusCode) === 410);
  const missing = api.getDocumentRecordById(record.id);
  assert.equal(String(missing.status), "missing");

  const record2 = await service.putDocument({
    user: owner,
    businessId: "biz_1",
    classification: DOCUMENT_CLASSIFICATIONS.KYC,
    relatedEntityType: "company_kyc",
    relatedEntityId: "cmp_2",
    originalFilename: "proof2.pdf",
    mimeType: "application/pdf",
    bytes: Buffer.from("checksum-source-2", "utf8"),
  });

  const hit = blobs.get(record2.storageKey);
  blobs.set(record2.storageKey, { bytes: Buffer.from("tampered", "utf8"), contentType: hit.contentType });
  await assert.rejects(() => service.openDocumentForBusiness(record2.id, { user: owner, businessId: "biz_1" }), (error) => Number(error?.statusCode) === 409);
  const quarantined = api.getDocumentRecordById(record2.id);
  assert.equal(String(quarantined.status), "quarantined");
});

test("azure exists distinguishes not-found from operational failures", async () => {
  const blobs = new Map();
  const containerName = "eazinvoice-documents";
  const faults = {
    "exists:business/biz_1/supporting_attachment/notfound.bin": { statusCode: 404, code: "BlobNotFound", message: "missing" },
    "exists:business/biz_1/supporting_attachment/auth.bin": { statusCode: 403, code: "AuthenticationFailed", message: "auth failed" },
  };
  const storage = createAzureBlobDocumentStorage({
    container: containerName,
    clientFactory: () => createMockAzureContainer(containerName, blobs, faults),
  });

  const missing = await storage.exists("business/biz_1/supporting_attachment/notfound.bin");
  assert.equal(missing, false);

  await assert.rejects(
    () => storage.exists("business/biz_1/supporting_attachment/auth.bin"),
    /auth failed/i,
  );
});

test("provider mismatch is surfaced without marking document missing", async () => {
  const localRoot = await fs.mkdtemp(path.join(os.tmpdir(), "eaz-doc-provider-mismatch-"));
  const blobs = new Map();
  const containerName = "eazinvoice-documents";
  try {
    const localStorage = createDocumentStorage({ provider: "local", rootDir: localRoot });
    const api = createFakeApi();
    const localService = createDocumentService({ api, storage: localStorage });
    const owner = { id: "usr_owner", businessIds: ["biz_1"] };

    const stored = await localService.putDocument({
      user: owner,
      businessId: "biz_1",
      classification: DOCUMENT_CLASSIFICATIONS.KYC,
      relatedEntityType: "company_kyc",
      relatedEntityId: "cmp_legacy",
      originalFilename: "legacy.pdf",
      mimeType: "application/pdf",
      bytes: Buffer.from("legacy-local-doc", "utf8"),
    });

    const azureStorage = createAzureBlobDocumentStorage({
      container: containerName,
      clientFactory: () => createMockAzureContainer(containerName, blobs),
    });
    const azureService = createDocumentService({ api, storage: azureStorage });

    await assert.rejects(
      () => azureService.openDocumentForBusiness(stored.id, { user: owner, businessId: "biz_1" }),
      (error) => Number(error?.statusCode) === 409 && /provider mismatch/i.test(String(error?.message || "")),
    );

    const unchanged = api.getDocumentRecordById(stored.id);
    assert.equal(String(unchanged.status), "available");
    assert.equal(String(unchanged.storageProvider), "local");
  } finally {
    await fs.rm(localRoot, { recursive: true, force: true });
  }
});
