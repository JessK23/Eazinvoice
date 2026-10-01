export const KYC_DOCUMENT_AUTHORITY = Object.freeze({
  REGISTRY_BACKED: "registry-backed",
  LEGACY_ONLY: "legacy-only",
});

export const KYC_RECONCILIATION_STATES = Object.freeze({
  REGISTRY_OK: "registry_ok",
  LEGACY_ONLY_AVAILABLE: "legacy_only_available",
  LEGACY_ONLY_MISSING: "legacy_only_missing",
  REGISTRY_REFERENCE_MISSING: "registry_reference_missing",
  REGISTRY_OBJECT_MISSING: "registry_object_missing",
  REGISTRY_INTEGRITY_FAILURE: "registry_integrity_failure",
  BUSINESS_BINDING_MISMATCH: "business_binding_mismatch",
  CLASSIFICATION_MISMATCH: "classification_mismatch",
  CONTRADICTORY_METADATA: "contradictory_metadata",
  NO_KYC_DOCUMENTS: "no_kyc_documents",
});

const KYC_DOCUMENT_TYPES = new Set(["pan", "aadhaar", "gst", "address_proof", "registration", "tax_id", "identity", "supporting"]);

function text(value = "") {
  return String(value ?? "").trim();
}

export function normalizeKycDocumentType(value = "") {
  const normalized = text(value).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  if (!normalized) return "supporting";
  return KYC_DOCUMENT_TYPES.has(normalized) ? normalized : "supporting";
}

export function normalizeKycDocumentReferences(value = []) {
  const references = [];
  for (const entry of Array.isArray(value) ? value : []) {
    if (!entry) continue;
    const object = typeof entry === "string" ? { documentId: entry } : entry;
    const documentId = text(object.documentId || object.id);
    if (!documentId) continue;
    references.push({
      documentId,
      documentType: normalizeKycDocumentType(object.documentType || object.kind),
      fileName: text(object.fileName || object.originalFilename),
      mimeType: text(object.mimeType).toLowerCase(),
    });
  }
  return references;
}

export function deriveLegacyKycMetadataFromReferences(references = []) {
  const files = [];
  const names = [];
  for (const entry of normalizeKycDocumentReferences(references)) {
    const safeName = text(entry.fileName || `${entry.documentType || "kyc"}.document`).replace(/[\\/]+/g, "_");
    names.push(safeName);
    files.push({
      storedName: safeName,
      filePath: "",
      mimeType: text(entry.mimeType || "application/octet-stream").toLowerCase(),
      documentId: entry.documentId,
      documentType: normalizeKycDocumentType(entry.documentType),
    });
  }
  return { documentNames: names, documentFiles: files };
}

function legacyMetadataEntries(company = {}) {
  const files = Array.isArray(company.documentFiles) ? company.documentFiles : [];
  const names = Array.isArray(company.documentNames) ? company.documentNames : [];
  const count = Math.max(files.length, names.length);
  return Array.from({ length: count }, (_, index) => ({
    index,
    name: text(files[index]?.storedName || files[index]?.fileName || names[index]),
    available: Boolean(files[index]?.available ?? files[index]?.exists ?? true),
  })).filter((entry) => entry.name);
}

function hasContradictoryLegacyReferences(company, references) {
  const legacyIds = legacyMetadataEntries(company)
    .map((entry) => text(company.documentFiles?.[entry.index]?.documentId))
    .filter(Boolean);
  if (!legacyIds.length) return false;
  const registryIds = new Set(references.map((entry) => entry.documentId));
  return legacyIds.some((id) => !registryIds.has(id));
}

function registryResultForInspection(result = {}) {
  const status = text(result.status).toLowerCase();
  if (result.ok === true || status === "available" || status === "ok") return KYC_RECONCILIATION_STATES.REGISTRY_OK;
  if (["checksum_mismatch", "integrity_failure", "quarantined"].includes(status)) return KYC_RECONCILIATION_STATES.REGISTRY_INTEGRITY_FAILURE;
  if (["missing", "not_found", "object_missing"].includes(status)) return KYC_RECONCILIATION_STATES.REGISTRY_OBJECT_MISSING;
  return KYC_RECONCILIATION_STATES.REGISTRY_OBJECT_MISSING;
}

export async function reconcileKycCompany({ company = {}, getDocumentById, inspectDocument, legacyRecords } = {}) {
  if (typeof getDocumentById !== "function") throw new Error("KYC reconciliation requires getDocumentById");
  const references = normalizeKycDocumentReferences(company.kycDocuments || []);
  const entries = [];

  if (references.length) {
    for (const reference of references) {
      const record = getDocumentById(reference.documentId);
      if (!record) {
        entries.push({ documentId: reference.documentId, state: KYC_RECONCILIATION_STATES.REGISTRY_REFERENCE_MISSING });
        continue;
      }
      if (text(record.businessId) !== text(company.businessId)) {
        entries.push({ documentId: reference.documentId, state: KYC_RECONCILIATION_STATES.BUSINESS_BINDING_MISMATCH });
        continue;
      }
      if (text(record.classification).toLowerCase() !== "kyc" || text(record.relatedEntityType).toLowerCase() !== "company_kyc") {
        entries.push({ documentId: reference.documentId, state: KYC_RECONCILIATION_STATES.CLASSIFICATION_MISMATCH });
        continue;
      }
      const inspected = typeof inspectDocument === "function"
        ? await inspectDocument(record.id, company.businessId)
        : { status: record.status };
      entries.push({ documentId: reference.documentId, state: registryResultForInspection(inspected) });
    }
    if (hasContradictoryLegacyReferences(company, references)) {
      entries.push({ state: KYC_RECONCILIATION_STATES.CONTRADICTORY_METADATA });
    }
  } else {
    const legacy = Array.isArray(legacyRecords) ? legacyRecords : legacyMetadataEntries(company);
    if (!legacy.length) {
      entries.push({ state: KYC_RECONCILIATION_STATES.NO_KYC_DOCUMENTS });
    } else if (legacy.every((entry) => Boolean(entry.available ?? entry.exists))) {
      entries.push({ state: KYC_RECONCILIATION_STATES.LEGACY_ONLY_AVAILABLE });
    } else {
      entries.push({ state: KYC_RECONCILIATION_STATES.LEGACY_ONLY_MISSING });
    }
  }

  const priority = [
    KYC_RECONCILIATION_STATES.CONTRADICTORY_METADATA,
    KYC_RECONCILIATION_STATES.BUSINESS_BINDING_MISMATCH,
    KYC_RECONCILIATION_STATES.CLASSIFICATION_MISMATCH,
    KYC_RECONCILIATION_STATES.REGISTRY_REFERENCE_MISSING,
    KYC_RECONCILIATION_STATES.REGISTRY_OBJECT_MISSING,
    KYC_RECONCILIATION_STATES.REGISTRY_INTEGRITY_FAILURE,
    KYC_RECONCILIATION_STATES.LEGACY_ONLY_MISSING,
    KYC_RECONCILIATION_STATES.REGISTRY_OK,
    KYC_RECONCILIATION_STATES.LEGACY_ONLY_AVAILABLE,
    KYC_RECONCILIATION_STATES.NO_KYC_DOCUMENTS,
  ];
  const classification = priority.find((state) => entries.some((entry) => entry.state === state)) || KYC_RECONCILIATION_STATES.NO_KYC_DOCUMENTS;
  return {
    authority: references.length ? KYC_DOCUMENT_AUTHORITY.REGISTRY_BACKED : KYC_DOCUMENT_AUTHORITY.LEGACY_ONLY,
    classification,
    entries,
    readOnly: true,
    reviewerStatusUnchanged: true,
    subscriptionStateUnchanged: true,
  };
}
