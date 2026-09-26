export const REQUIREMENT_PURPOSES = Object.freeze({
  CORE_PROFILE: "CORE_PROFILE",
  DOCUMENT: "DOCUMENT",
  KYC_PAID_FEATURE: "KYC_PAID_FEATURE",
});

const ACCOUNT_CORE_FIELDS = Object.freeze(["name", "email", "phone"]);
const BUSINESS_CORE_FIELDS = Object.freeze(["name", "businessType", "entityType"]);
const DOCUMENT_FIELDS = Object.freeze({
  invoice: ["name", "entityType"],
  quotation: ["name", "entityType"],
  purchase_order: ["name", "entityType"],
  work_order: ["name", "entityType"],
});

const COUNTRY_ALIASES = Object.freeze({
  INDIA: "IN",
  IN: "IN",
  US: "US",
  USA: "US",
  "UNITED STATES": "US",
  "UNITED STATES OF AMERICA": "US",
});

const SUPPORTED_KYC_COUNTRIES = new Set(["IN", "US"]);

function hasValue(value) {
  if (Array.isArray(value)) return value.length > 0;
  return typeof value === "string" ? Boolean(value.trim()) : value !== null && value !== undefined;
}

function missing(record, fields) {
  return fields.filter((field) => !hasValue(record?.[field]));
}

function normalizeCountryAlias(value) {
  const normalized = String(value || "").trim().toUpperCase();
  return COUNTRY_ALIASES[normalized] || normalized;
}

export function normalizeCountry(value) {
  const normalized = normalizeCountryAlias(value);
  return normalized || "IN";
}

export function normalizeEntityType(value) {
  return String(value || "company").trim().toLowerCase() || "company";
}

export function isIndividualEntity(value) {
  return ["individual", "freelancer", "consultant", "sole proprietorship", "sole proprietor", "proprietor"]
    .includes(normalizeEntityType(value));
}

export function normalizeKycStatus(business = {}) {
  const value = String(business.kycStatus || business.reviewStatus || "not_started").trim().toLowerCase();
  if (["verified", "approved"].includes(value)) return "verified";
  if (["pending", "submitted", "under_review", "kyc_pending"].includes(value)) return "submitted";
  if (value === "rejected") return "rejected";
  return "not_started";
}

function kycRequirement(country, entityType) {
  const normalizedCountry = normalizeCountry(country);
  const individual = isIndividualEntity(entityType);
  const requiredFields = ["address"];
  const anyOf = [["addressProof", "documentNames", "documentFiles"]];

  if (normalizedCountry === "IN") {
    if (individual) requiredFields.push("panNumber", "aadhaarLast4");
    else anyOf.push(["panNumber", "gstNumber"]);
    return {
      requiredFields,
      anyOf,
      configuredCountry: true,
      countryModel: "india",
    };
  }

  if (normalizedCountry === "US") {
    if (individual) anyOf.push(["taxId", "documentNames", "documentFiles"]);
    else anyOf.push(["registrationNumber", "taxId", "documentNames", "documentFiles"]);
    return {
      requiredFields,
      anyOf,
      configuredCountry: true,
      countryModel: "international-us",
    };
  }

  if (individual) anyOf.push(["taxId", "documentNames", "documentFiles"]);
  else anyOf.push(["registrationNumber", "taxId", "documentNames", "documentFiles"]);

  return {
    requiredFields,
    anyOf,
    configuredCountry: false,
    countryModel: "generic-international",
  };
}

export function resolveProfileRequirements({
  user = {},
  business = {},
  purpose = REQUIREMENT_PURPOSES.CORE_PROFILE,
  documentType = "invoice",
} = {}) {
  const country = normalizeCountry(business.country || business.kycCountry);
  const entityType = normalizeEntityType(business.entityType || business.businessType);
  const normalizedPurpose = Object.values(REQUIREMENT_PURPOSES).includes(purpose)
    ? purpose
    : REQUIREMENT_PURPOSES.CORE_PROFILE;

  if (normalizedPurpose === REQUIREMENT_PURPOSES.CORE_PROFILE) {
    const accountMissing = missing(user, ACCOUNT_CORE_FIELDS);
    const businessMissing = missing(business, BUSINESS_CORE_FIELDS);
    return {
      purpose: normalizedPurpose,
      country,
      entityType,
      accountRequiredFields: [...ACCOUNT_CORE_FIELDS],
      businessRequiredFields: [...BUSINESS_CORE_FIELDS],
      accountMissing,
      businessMissing,
      complete: accountMissing.length === 0 && businessMissing.length === 0,
    };
  }

  if (normalizedPurpose === REQUIREMENT_PURPOSES.DOCUMENT) {
    const type = String(documentType || "invoice").trim().toLowerCase().replace(/[-\s]+/g, "_");
    const requiredFields = DOCUMENT_FIELDS[type] || DOCUMENT_FIELDS.invoice;
    const missingFields = missing(business, requiredFields);
    return {
      purpose: normalizedPurpose,
      country,
      entityType,
      documentType: type,
      requiredFields: [...requiredFields],
      missingFields,
      complete: missingFields.length === 0,
    };
  }

  const definition = kycRequirement(country, entityType);
  const missingFields = missing(business, definition.requiredFields);
  const missingAnyOf = definition.anyOf.filter((group) => !group.some((field) => hasValue(business?.[field])));
  const status = normalizeKycStatus(business);
  return {
    purpose: normalizedPurpose,
    country,
    entityType,
    requiredFields: definition.requiredFields,
    anyOf: definition.anyOf,
    missingFields,
    missingAnyOf,
    status,
    submitted: status === "submitted" || status === "verified",
    verified: status === "verified",
    complete: missingFields.length === 0 && missingAnyOf.length === 0,
    configuredCountry: definition.configuredCountry,
    unsupportedCountry: !definition.configuredCountry,
    countryModel: definition.countryModel,
    supportedCountries: [...SUPPORTED_KYC_COUNTRIES],
  };
}

export function resolveFeatureEligibility({
  user = {},
  business = {},
  plan = "free",
  subscriptionStatus = "inactive",
  featureRequiresPaidPlan = false,
  featureRequiresKyc = false,
  documentType = "",
} = {}) {
  const normalizedPlan = String(plan || "free").trim().toLowerCase();
  const normalizedSubscription = String(subscriptionStatus || "inactive").trim().toLowerCase();
  const paidEntitlement = normalizedPlan !== "free" && ["active", "trial", "trialing"].includes(normalizedSubscription);
  const core = resolveProfileRequirements({ user, business, purpose: REQUIREMENT_PURPOSES.CORE_PROFILE });
  const document = documentType
    ? resolveProfileRequirements({ business, purpose: REQUIREMENT_PURPOSES.DOCUMENT, documentType })
    : null;
  const kyc = resolveProfileRequirements({ business, purpose: REQUIREMENT_PURPOSES.KYC_PAID_FEATURE });

  let reason = "eligible";
  if (document && !document.complete) reason = "document_profile_incomplete";
  else if (featureRequiresPaidPlan && !paidEntitlement) reason = "paid_entitlement_required";
  else if (featureRequiresKyc && !kyc.verified) reason = "kyc_verification_required";

  return {
    allowed: reason === "eligible",
    reason,
    core,
    document,
    kyc,
    plan: normalizedPlan,
    subscriptionStatus: normalizedSubscription,
    paidEntitlement,
  };
}
