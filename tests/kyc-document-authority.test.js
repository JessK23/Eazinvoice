import assert from "node:assert/strict";
import test from "node:test";
import {
  KYC_DOCUMENT_AUTHORITY,
  KYC_RECONCILIATION_STATES,
  deriveLegacyKycMetadataFromReferences,
  reconcileKycCompany,
} from "../apps/api/src/kyc-document-authority.js";
import { createDocumentService } from "../apps/api/src/document-service.js";

function registryDocument(overrides = {}) {
  return {
    id: "doc_1",
    businessId: "biz_1",
    classification: "kyc",
    relatedEntityType: "company_kyc",
    status: "available",
    ...overrides,
  };
}

test("registry-backed KYC is authoritative and reconciliation is read-only", async () => {
  const company = {
    id: "company_1",
    businessId: "biz_1",
    kycStatus: "pending",
    kycDocuments: [{ documentId: "doc_1", documentType: "pan" }],
    documentNames: ["derived-pan.pdf"],
    documentFiles: [{ storedName: "derived-pan.pdf", documentId: "doc_1" }],
  };
  const result = await reconcileKycCompany({
    company,
    getDocumentById: () => registryDocument(),
    inspectDocument: async () => ({ ok: true, status: "available" }),
  });
  assert.equal(result.authority, KYC_DOCUMENT_AUTHORITY.REGISTRY_BACKED);
  assert.equal(result.classification, KYC_RECONCILIATION_STATES.REGISTRY_OK);
  assert.equal(result.readOnly, true);
  assert.equal(result.reviewerStatusUnchanged, true);
  assert.equal(company.kycStatus, "pending");
});

test("registry failures fail closed and never use legacy availability", async () => {
  for (const failure of [
    { status: "missing", expected: KYC_RECONCILIATION_STATES.REGISTRY_OBJECT_MISSING },
    { status: "checksum_mismatch", expected: KYC_RECONCILIATION_STATES.REGISTRY_INTEGRITY_FAILURE },
  ]) {
    const result = await reconcileKycCompany({
      company: {
        businessId: "biz_1",
        kycDocuments: [{ documentId: "doc_1" }],
        documentNames: ["legacy.pdf"],
        documentFiles: [{ storedName: "legacy.pdf", available: true }],
      },
      getDocumentById: () => registryDocument(),
      inspectDocument: async () => failure,
    });
    assert.equal(result.authority, KYC_DOCUMENT_AUTHORITY.REGISTRY_BACKED);
    assert.equal(result.classification, failure.expected);
    assert.notEqual(result.classification, KYC_RECONCILIATION_STATES.LEGACY_ONLY_AVAILABLE);
  }
});

test("legacy-only records are measurable without being upgraded or mutated", async () => {
  const available = await reconcileKycCompany({
    company: { businessId: "biz_1", documentNames: ["old.pdf"], documentFiles: [{ storedName: "old.pdf" }] },
    getDocumentById: () => null,
    legacyRecords: [{ available: true }],
  });
  assert.equal(available.authority, KYC_DOCUMENT_AUTHORITY.LEGACY_ONLY);
  assert.equal(available.classification, KYC_RECONCILIATION_STATES.LEGACY_ONLY_AVAILABLE);

  const missing = await reconcileKycCompany({
    company: { businessId: "biz_1", documentNames: ["old.pdf"], documentFiles: [{ storedName: "old.pdf" }] },
    getDocumentById: () => null,
    legacyRecords: [{ available: false }],
  });
  assert.equal(missing.classification, KYC_RECONCILIATION_STATES.LEGACY_ONLY_MISSING);
});

test("business and classification mismatches are fail-closed", async () => {
  const wrongBusiness = await reconcileKycCompany({
    company: { businessId: "biz_1", kycDocuments: [{ documentId: "doc_1" }] },
    getDocumentById: () => registryDocument({ businessId: "biz_2" }),
  });
  assert.equal(wrongBusiness.classification, KYC_RECONCILIATION_STATES.BUSINESS_BINDING_MISMATCH);

  const wrongClassification = await reconcileKycCompany({
    company: { businessId: "biz_1", kycDocuments: [{ documentId: "doc_1" }] },
    getDocumentById: () => registryDocument({ classification: "supporting_attachment" }),
  });
  assert.equal(wrongClassification.classification, KYC_RECONCILIATION_STATES.CLASSIFICATION_MISMATCH);
});

test("derived compatibility fields contain no filesystem authority", () => {
  const derived = deriveLegacyKycMetadataFromReferences([{ documentId: "doc_1", documentType: "pan", fileName: "pan.pdf", mimeType: "application/pdf" }]);
  assert.deepEqual(derived.documentNames, ["pan.pdf"]);
  assert.equal(derived.documentFiles[0].documentId, "doc_1");
  assert.equal(derived.documentFiles[0].filePath, "");
});

test("DocumentService inspection verifies integrity without mutating registry status", async () => {
  const record = registryDocument({ checksumSha256: "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824" });
  const service = createDocumentService({
    api: { getDocumentRecordById: () => record },
    storage: {
      provider: "local",
      async get() { return { bytes: Buffer.from("hello") }; },
    },
  });
  const result = await service.inspectDocumentForBusiness(record.id, "biz_1");
  assert.deepEqual(result, { ok: true, status: "available" });
  assert.equal(record.status, "available");
});
