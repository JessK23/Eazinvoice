import crypto from "node:crypto";
import {
  DOCUMENT_CLASSIFICATIONS,
  DOCUMENT_STATUSES,
  normalizeDocumentClassification,
  normalizeDocumentStatus,
} from "./document-storage.js";

function asText(value = "") {
  return String(value || "").trim();
}

function makeDocumentId() {
  if (typeof crypto.randomUUID === "function") {
    return `doc_${crypto.randomUUID()}`;
  }
  return `doc_${crypto.randomBytes(16).toString("hex")}`;
}

function safeEntityType(value = "") {
  return asText(value).toLowerCase().replace(/[^a-z0-9_:-]+/g, "_") || "document";
}

function extensionForMime(mimeType = "") {
  const normalized = asText(mimeType).toLowerCase();
  if (normalized === "application/pdf") return "pdf";
  if (normalized === "image/png") return "png";
  if (["image/jpeg", "image/jpg"].includes(normalized)) return "jpg";
  return "bin";
}

function generateChecksum(bytes) {
  const content = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes || []);
  return {
    checksumSha256: crypto.createHash("sha256").update(content).digest("hex"),
    sizeBytes: content.length,
  };
}

function safeBusinessScope(document = {}) {
  return asText(document.businessId || "system").replace(/[^A-Za-z0-9_-]+/g, "_") || "system";
}

function buildStorageKey(document = {}) {
  const classification = normalizeDocumentClassification(document.classification || DOCUMENT_CLASSIFICATIONS.SUPPORTING_ATTACHMENT);
  const ext = extensionForMime(document.mimeType);
  const scope = safeBusinessScope(document);
  return `business/${scope}/${classification}/${document.id}.${ext}`;
}

function statusForStoredObject(currentStatus) {
  return normalizeDocumentStatus(currentStatus || DOCUMENT_STATUSES.AVAILABLE);
}

export function createDocumentService({ api, storage }) {
  if (!api) throw new Error("DocumentService requires api");
  if (!storage) throw new Error("DocumentService requires storage adapter");

  function requireDocumentBusinessAccess(user, businessId, permission = "read") {
    if (!user?.id) {
      const error = new Error("Authentication required.");
      error.statusCode = 401;
      throw error;
    }
    if (typeof api.resolveRecordsWorkspaceAccess === "function") {
      try {
        api.resolveRecordsWorkspaceAccess(user, { businessId }, permission === "read" ? "read" : "writeRecords");
      } catch {
        const error = new Error("Forbidden");
        error.statusCode = 403;
        throw error;
      }
      return;
    }
    if (user.role === "admin") return;
    const business = typeof api.getBusinessById === "function"
      ? api.getBusinessById(businessId)
      : null;
    if (!business || asText(business.ownerUserId) !== asText(user.id)) {
      const error = new Error("Forbidden");
      error.statusCode = 403;
      throw error;
    }
  }

  return {
    storage,

    buildStorageKey,

    async putDocument({
      user,
      businessId = "",
      classification = DOCUMENT_CLASSIFICATIONS.SUPPORTING_ATTACHMENT,
      relatedEntityType = "",
      relatedEntityId = "",
      originalFilename = "",
      mimeType = "",
      bytes,
      idempotencyKey = "",
      retentionClass = "",
      securityClass = "",
      legacyFilePath = "",
    } = {}) {
      const ownerUserId = asText(user?.id);
      if (!ownerUserId) throw new Error("Authentication required.");
      const normalizedBusinessId = asText(businessId);
      if (!normalizedBusinessId) throw new Error("businessId is required.");
      requireDocumentBusinessAccess(user, normalizedBusinessId, "write");
      const normalizedClassification = normalizeDocumentClassification(classification);
      const checksum = generateChecksum(bytes);
      const normalizedIdempotencyKey = asText(idempotencyKey);

      if (normalizedIdempotencyKey) {
        const existing = api.findDocumentByIdempotencyKey({
          ownerUserId,
          businessId: normalizedBusinessId,
          idempotencyKey: normalizedIdempotencyKey,
        });
        if (existing) {
          const exists = await storage.exists(existing.storageKey).catch(() => false);
          if (!exists && existing.status === DOCUMENT_STATUSES.AVAILABLE) {
            return api.updateDocumentRecord(existing.id, {
              status: DOCUMENT_STATUSES.MISSING,
            });
          }
          return existing;
        }
      }

      const pending = api.createDocumentRecord({
        id: makeDocumentId(),
        ownerUserId,
        businessId: normalizedBusinessId,
        classification: normalizedClassification,
        relatedEntityType: safeEntityType(relatedEntityType),
        relatedEntityId: asText(relatedEntityId),
        storageProvider: storage.provider,
        storageKey: "",
        originalFilename: asText(originalFilename),
        mimeType: asText(mimeType).toLowerCase(),
        sizeBytes: checksum.sizeBytes,
        checksumSha256: checksum.checksumSha256,
        status: DOCUMENT_STATUSES.PENDING_STORAGE,
        createdByUserId: ownerUserId,
        idempotencyKey: normalizedIdempotencyKey,
        retentionClass: asText(retentionClass),
        securityClass: asText(securityClass),
        legacyFilePath: asText(legacyFilePath),
      });

      const storageKey = buildStorageKey({
        ...pending,
        classification: normalizedClassification,
        mimeType,
      });

      try {
        const stored = await storage.put(storageKey, bytes, { mimeType });
        const finalized = api.updateDocumentRecord(pending.id, {
          status: statusForStoredObject(DOCUMENT_STATUSES.AVAILABLE),
          storageProvider: storage.provider,
          storageKey: stored.storageKey,
          sizeBytes: stored.sizeBytes,
          checksumSha256: stored.checksumSha256,
        });
        if (!finalized) {
          await storage.remove(storageKey).catch(() => {});
          throw new Error("Document registry update failed after storage write.");
        }
        return finalized;
      } catch (error) {
        const missing = api.updateDocumentRecord(pending.id, {
          status: DOCUMENT_STATUSES.MISSING,
        });
        if (!missing) {
          await storage.remove(storageKey).catch(() => {});
        }
        throw error;
      }
    },

    async openDocumentForBusiness(documentId, businessIdOrOptions) {
      const options = typeof businessIdOrOptions === "object" && businessIdOrOptions !== null
        ? businessIdOrOptions
        : { businessId: businessIdOrOptions };
      const normalizedBusinessId = asText(options.businessId);
      if (options.user) {
        requireDocumentBusinessAccess(options.user, normalizedBusinessId, "read");
      }
      const document = api.getDocumentRecordById(documentId);
      if (!document) {
        const error = new Error("Document not found");
        error.statusCode = 404;
        throw error;
      }
      if (asText(document.businessId) !== normalizedBusinessId) {
        const error = new Error("Document not found");
        error.statusCode = 404;
        throw error;
      }
      if (document.status === DOCUMENT_STATUSES.ARCHIVED) {
        const error = new Error("Document archived");
        error.statusCode = 410;
        throw error;
      }
      const exists = await storage.exists(document.storageKey).catch(() => false);
      if (!exists) {
        api.updateDocumentRecord(document.id, { status: DOCUMENT_STATUSES.MISSING });
        const error = new Error("Document is no longer available. Ask the user to re-upload the document.");
        error.statusCode = 410;
        throw error;
      }
      const file = await storage.get(document.storageKey);
      const checksum = generateChecksum(file.bytes);
      if (checksum.checksumSha256 !== asText(document.checksumSha256)) {
        api.updateDocumentRecord(document.id, { status: DOCUMENT_STATUSES.QUARANTINED });
        const error = new Error("Document integrity verification failed.");
        error.statusCode = 409;
        throw error;
      }
      if (document.status !== DOCUMENT_STATUSES.AVAILABLE) {
        api.updateDocumentRecord(document.id, { status: DOCUMENT_STATUSES.AVAILABLE });
      }
      return {
        document,
        bytes: file.bytes,
      };
    },

    async reconcileDocument(documentId) {
      const document = api.getDocumentRecordById(documentId);
      if (!document) {
        return { ok: false, status: "not_found", documentId };
      }
      const exists = await storage.exists(document.storageKey).catch(() => false);
      if (!exists) {
        const updated = api.updateDocumentRecord(document.id, { status: DOCUMENT_STATUSES.MISSING });
        return {
          ok: false,
          status: "missing",
          document: updated || document,
        };
      }
      const file = await storage.get(document.storageKey).catch(() => null);
      if (!file) {
        const updated = api.updateDocumentRecord(document.id, { status: DOCUMENT_STATUSES.MISSING });
        return {
          ok: false,
          status: "missing",
          document: updated || document,
        };
      }
      const checksum = generateChecksum(file.bytes);
      if (asText(document.checksumSha256) && checksum.checksumSha256 !== asText(document.checksumSha256)) {
        const updated = api.updateDocumentRecord(document.id, { status: DOCUMENT_STATUSES.QUARANTINED });
        return {
          ok: false,
          status: "checksum_mismatch",
          document: updated || document,
        };
      }
      const updated = document.status === DOCUMENT_STATUSES.AVAILABLE
        ? document
        : api.updateDocumentRecord(document.id, { status: DOCUMENT_STATUSES.AVAILABLE });
      return {
        ok: true,
        status: "available",
        document: updated || document,
      };
    },

    async reconcileBusinessDocuments(businessId) {
      const records = api.listDocumentsForBusiness(businessId);
      const results = [];
      for (const record of records) {
        results.push(await this.reconcileDocument(record.id));
      }
      return {
        total: results.length,
        missing: results.filter((entry) => entry.status === "missing").length,
        checksumMismatches: results.filter((entry) => entry.status === "checksum_mismatch").length,
        available: results.filter((entry) => entry.status === "available").length,
        results,
      };
    },

    async findOrphanedKeys(businessId = "") {
      const normalizedBusinessId = asText(businessId);
      const scopePrefix = normalizedBusinessId ? `business/${normalizedBusinessId}/` : "business/";
      const keys = await storage.listKeys(scopePrefix);
      const knownKeys = new Set(api.listDocumentStorageKeys(normalizedBusinessId));
      return keys.filter((key) => !knownKeys.has(key));
    },
  };
}
