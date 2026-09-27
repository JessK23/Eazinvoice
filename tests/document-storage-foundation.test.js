import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { createLocalDocumentStorage } from "../apps/api/src/local-document-storage.js";
import { DOCUMENT_CLASSIFICATIONS, DOCUMENT_STATUSES } from "../apps/api/src/document-storage.js";
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

async function createSandbox() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "eazinvoice-doc-foundation-"));
  const storage = createLocalDocumentStorage({ rootDir: root, provider: "local" });
  const api = createFakeApi();
  const service = createDocumentService({ api, storage });
  return { root, storage, api, service };
}

test("local document storage put/get/head/list supports integrity metadata", async () => {
  const { root, storage } = await createSandbox();
  try {
    const payload = Buffer.from("phase1-local-storage", "utf8");
    const put = await storage.put("business/biz_1/kyc/sample.pdf", payload, { mimeType: "application/pdf" });
    assert.equal(put.storageKey, "business/biz_1/kyc/sample.pdf");
    assert.equal(put.sizeBytes, payload.length);
    assert.match(put.checksumSha256, /^[a-f0-9]{64}$/);

    const exists = await storage.exists(put.storageKey);
    assert.equal(exists, true);

    const head = await storage.head(put.storageKey);
    assert.equal(head.sizeBytes, payload.length);

    const loaded = await storage.get(put.storageKey);
    assert.equal(loaded.bytes.toString("utf8"), payload.toString("utf8"));

    const keys = await storage.listKeys("business/biz_1");
    assert.deepEqual(keys, [put.storageKey]);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("local document storage rejects traversal keys", async () => {
  const { root, storage } = await createSandbox();
  try {
    await assert.rejects(() => storage.put("../outside.txt", Buffer.from("x")), /Invalid document storage key|path/i);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("document service stores authoritative metadata with stable document id", async () => {
  const { root, service } = await createSandbox();
  try {
    const owner = { id: "usr_owner", businessIds: ["biz_1"] };
    const record = await service.putDocument({
      user: owner,
      businessId: "biz_1",
      classification: DOCUMENT_CLASSIFICATIONS.KYC,
      relatedEntityType: "company",
      relatedEntityId: "cmp_1",
      originalFilename: "../../sensitive.pdf",
      mimeType: "application/pdf",
      bytes: Buffer.from("kyc-document", "utf8"),
      idempotencyKey: "save-1",
      securityClass: "restricted",
      retentionClass: "kyc",
      legacyFilePath: "legacy/pan.pdf",
    });

    assert.match(String(record.id), /^doc_[a-f0-9-]{32,36}$/);
    assert.equal(record.businessId, "biz_1");
    assert.equal(record.classification, DOCUMENT_CLASSIFICATIONS.KYC);
    assert.equal(record.status, DOCUMENT_STATUSES.AVAILABLE);
    assert.equal(record.sizeBytes, Buffer.from("kyc-document", "utf8").length);
    assert.match(String(record.checksumSha256), /^[a-f0-9]{64}$/);
    assert.match(String(record.storageKey), /^business\/biz_1\/kyc\/doc_[a-f0-9-]{32,36}\.pdf$/);
    assert.equal(String(record.storageKey).includes(".."), false);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("document idempotency returns same authoritative record on retry", async () => {
  const { root, service } = await createSandbox();
  try {
    const owner = { id: "usr_owner", businessIds: ["biz_1"] };
    const first = await service.putDocument({
      user: owner,
      businessId: "biz_1",
      classification: DOCUMENT_CLASSIFICATIONS.KYC,
      mimeType: "application/pdf",
      bytes: Buffer.from("same", "utf8"),
      idempotencyKey: "idem-key",
    });
    const second = await service.putDocument({
      user: owner,
      businessId: "biz_1",
      classification: DOCUMENT_CLASSIFICATIONS.KYC,
      mimeType: "application/pdf",
      bytes: Buffer.from("different-bytes", "utf8"),
      idempotencyKey: "idem-key",
    });
    assert.equal(first.id, second.id);
    assert.equal(first.storageKey, second.storageKey);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("document service enforces business-boundary access", async () => {
  const { root, service } = await createSandbox();
  try {
    const owner = { id: "usr_owner", businessIds: ["biz_1"] };
    const outsider = { id: "usr_out", businessIds: ["biz_2"] };

    const record = await service.putDocument({
      user: owner,
      businessId: "biz_1",
      classification: DOCUMENT_CLASSIFICATIONS.KYC,
      mimeType: "application/pdf",
      bytes: Buffer.from("secure-doc", "utf8"),
    });

    await assert.rejects(() => service.openDocumentForBusiness(record.id, { user: outsider, businessId: "biz_1" }), (error) => (
      Number(error?.statusCode) === 403
    ));

    const admin = { id: "usr_admin", role: "admin" };
    await assert.rejects(() => service.openDocumentForBusiness(record.id, { user: admin, businessId: "biz_2" }), (error) => (
      Number(error?.statusCode) === 404
    ));
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("missing physical object fails closed and marks registry missing", async () => {
  const { root, service, api } = await createSandbox();
  try {
    const owner = { id: "usr_owner", businessIds: ["biz_1"] };
    const record = await service.putDocument({
      user: owner,
      businessId: "biz_1",
      classification: DOCUMENT_CLASSIFICATIONS.KYC,
      mimeType: "application/pdf",
      bytes: Buffer.from("delete-me", "utf8"),
    });

    await fs.rm(path.join(root, record.storageKey), { force: true });

    await assert.rejects(() => service.openDocumentForBusiness(record.id, { user: owner, businessId: "biz_1" }), (error) => (
      Number(error?.statusCode) === 410
      && /re-upload/i.test(String(error?.message || ""))
    ));

    const updated = api.getDocumentRecordById(record.id);
    assert.equal(updated.status, DOCUMENT_STATUSES.MISSING);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("checksum mismatch quarantines document", async () => {
  const { root, service, api } = await createSandbox();
  try {
    const owner = { id: "usr_owner", businessIds: ["biz_1"] };
    const record = await service.putDocument({
      user: owner,
      businessId: "biz_1",
      classification: DOCUMENT_CLASSIFICATIONS.KYC,
      mimeType: "application/pdf",
      bytes: Buffer.from("valid-bytes", "utf8"),
    });

    await fs.writeFile(path.join(root, record.storageKey), Buffer.from("tampered", "utf8"));

    await assert.rejects(() => service.openDocumentForBusiness(record.id, { user: owner, businessId: "biz_1" }), (error) => (
      Number(error?.statusCode) === 409
    ));

    const updated = api.getDocumentRecordById(record.id);
    assert.equal(updated.status, DOCUMENT_STATUSES.QUARANTINED);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("reconciliation detects missing and orphan keys", async () => {
  const { root, storage, service } = await createSandbox();
  try {
    const owner = { id: "usr_owner", businessIds: ["biz_1"] };
    const existing = await service.putDocument({
      user: owner,
      businessId: "biz_1",
      classification: DOCUMENT_CLASSIFICATIONS.KYC,
      mimeType: "application/pdf",
      bytes: Buffer.from("present", "utf8"),
    });
    const missing = await service.putDocument({
      user: owner,
      businessId: "biz_1",
      classification: DOCUMENT_CLASSIFICATIONS.KYC,
      mimeType: "application/pdf",
      bytes: Buffer.from("will-miss", "utf8"),
    });

    await fs.rm(path.join(root, missing.storageKey), { force: true });
    await storage.put("business/biz_1/kyc/orphan.bin", Buffer.from("orphan", "utf8"));

    const summary = await service.reconcileBusinessDocuments("biz_1");
    assert.equal(summary.total, 2);
    assert.equal(summary.available, 1);
    assert.equal(summary.missing, 1);

    const orphans = await service.findOrphanedKeys("biz_1");
    assert.deepEqual(orphans, ["business/biz_1/kyc/orphan.bin"]);
    assert.equal(Boolean(existing.id), true);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

