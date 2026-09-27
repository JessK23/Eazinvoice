import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { createDocumentStorage, DOCUMENT_CLASSIFICATIONS } from "../apps/api/src/document-storage.js";
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
  constructor(containerName, key, blobs) {
    this.containerName = containerName;
    this.key = key;
    this.blobs = blobs;
    this.url = `https://mock.local/${containerName}/${encodeURIComponent(key)}`;
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

function createMockAzureContainer(containerName, blobs) {
  return {
    async createIfNotExists() {
      return { succeeded: true };
    },
    getBlockBlobClient(key) {
      return new MockBlobClient(containerName, key, blobs);
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

test("storage factory rejects invalid provider and fails closed on missing azure config", () => {
  assert.throws(() => createDocumentStorage({ provider: "unknown" }), /Unsupported document storage provider/i);
  assert.throws(() => createDocumentStorage({ provider: "azure", connectionString: "", container: "" }), /Azure document storage/i);
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
