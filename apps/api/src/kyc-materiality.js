import {
  normalizeCountry,
  normalizeEntityType,
  REQUIREMENT_PURPOSES,
  resolveProfileRequirements,
} from "./profile-requirements.js";

const MATERIAL_FIELD_NORMALIZERS = Object.freeze({
  country: (value) => normalizeCountry(value),
  kycCountry: (value) => normalizeCountry(value),
  entityType: (value) => normalizeEntityType(value),
  address: normalizeText,
  addressProof: normalizeText,
  panNumber: normalizeIdentityToken,
  aadhaarLast4: normalizeAadhaarLast4,
  gstNumber: normalizeIdentityToken,
  taxId: normalizeIdentityToken,
  registrationNumber: normalizeIdentityToken,
  documentNames: normalizeDocumentNames,
  documentFiles: normalizeDocumentFiles,
});

function normalizeText(value) {
  return String(value || "").trim().replace(/\s+/g, " ").toLowerCase();
}

function normalizeIdentityToken(value) {
  return String(value || "").trim().replace(/\s+/g, "").toUpperCase();
}

function normalizeAadhaarLast4(value) {
  return String(value || "").replace(/\D/g, "").slice(-4);
}

function normalizeDocumentNames(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value
    .map((entry) => String(entry || "").trim().toLowerCase())
    .filter(Boolean))]
    .sort();
}

function normalizeDocumentFiles(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value
    .map((entry) => {
      if (!entry) return "";
      if (typeof entry === "string") return String(entry).trim().toLowerCase();
      const storedName = String(entry.storedName || "").trim().toLowerCase();
      const filePath = String(entry.filePath || "").trim().toLowerCase();
      const mimeType = String(entry.mimeType || "").trim().toLowerCase();
      if (!storedName && !filePath) return "";
      return `${storedName}|${filePath}|${mimeType}`;
    })
    .filter(Boolean))]
    .sort();
}

function resolveKycRequirementContext(record = {}) {
  return {
    country: normalizeCountry(record.country || record.kycCountry),
    entityType: normalizeEntityType(record.entityType || record.businessType),
  };
}

function isAuthoritativelyVerifiedKyc(company = {}) {
  return resolveProfileRequirements({
    business: company,
    purpose: REQUIREMENT_PURPOSES.KYC_PAID_FEATURE,
  }).verified;
}

export function detectMaterialKycIdentityChange(previous = {}, next = {}) {
  const changedFields = Object.entries(MATERIAL_FIELD_NORMALIZERS)
    .filter(([field, normalize]) => {
      const before = normalize(previous?.[field]);
      const after = normalize(next?.[field]);
      return JSON.stringify(before) !== JSON.stringify(after);
    })
    .map(([field]) => field);

  const previousContext = resolveKycRequirementContext(previous);
  const nextContext = resolveKycRequirementContext(next);
  const requirementContextChanged = previousContext.country !== nextContext.country
    || previousContext.entityType !== nextContext.entityType;

  return {
    materialChanged: changedFields.length > 0,
    changedFields,
    requirementContextChanged,
    previousContext,
    nextContext,
  };
}

export function shouldReevaluateVerifiedKyc(previous = {}, next = {}) {
  const detection = detectMaterialKycIdentityChange(previous, next);
  const previousWasVerified = isAuthoritativelyVerifiedKyc(previous);
  return {
    ...detection,
    previousWasVerified,
    shouldReevaluate: previousWasVerified && detection.materialChanged,
  };
}