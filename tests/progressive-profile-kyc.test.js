import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  REQUIREMENT_PURPOSES,
  resolveFeatureEligibility,
  resolveProfileRequirements,
} from "../apps/api/src/profile-requirements.js";

const completeUser = { name: "Free Owner", email: "owner@example.com", phone: "9000000000" };
const coreBusiness = { id: "biz-a", name: "Alpha Traders", businessType: "services", entityType: "company", country: "IN" };
const verifiedBusiness = {
  ...coreBusiness,
  address: "1 Main Street",
  addressProof: "address-proof.pdf",
  panNumber: "ABCDE1234F",
  kycStatus: "verified",
};

test("1. Free + core complete + KYC absent keeps normal Free access", () => {
  const result = resolveFeatureEligibility({ user: completeUser, business: coreBusiness, plan: "free", subscriptionStatus: "active" });
  assert.equal(result.core.complete, true);
  assert.equal(result.kyc.status, "not_started");
  assert.equal(result.allowed, true);
});

test("2. Free + core incomplete produces only a core profile reminder", () => {
  const result = resolveFeatureEligibility({ user: { email: "owner@example.com" }, business: coreBusiness });
  assert.equal(result.core.complete, false);
  assert.deepEqual(result.core.accountMissing.sort(), ["name", "phone"]);
  assert.equal(result.kyc.status, "not_started");
});

test("3. Missing document issuer fields returns a document-specific requirement, not KYC", () => {
  const result = resolveFeatureEligibility({ user: completeUser, business: { country: "IN" }, documentType: "invoice" });
  assert.equal(result.allowed, false);
  assert.equal(result.reason, "document_profile_incomplete");
  assert.deepEqual(result.document.missingFields.sort(), ["entityType", "name"]);
  assert.equal(result.kyc.status, "not_started");
});

test("4. Free dashboard with absent KYC has no KYC block", () => {
  const mobile = readFileSync(new URL("../apps/mobile/app.js", import.meta.url), "utf8");
  assert.doesNotMatch(mobile, /state\.profileSetup\?\.needsSetup[\s\S]{0,160}state\.route = "account"/);
  assert.match(mobile, /Required for paid features/);
});

test("5. Free paid-upgrade selection evaluates paid entitlement and KYC independently", () => {
  const result = resolveFeatureEligibility({
    user: completeUser,
    business: coreBusiness,
    plan: "free",
    subscriptionStatus: "active",
    featureRequiresPaidPlan: true,
    featureRequiresKyc: true,
  });
  assert.equal(result.reason, "paid_entitlement_required");
  assert.equal(result.paidEntitlement, false);
  assert.equal(result.kyc.verified, false);
});

test("6. Paid-feature attempt with incomplete KYC returns the verification gate", () => {
  const result = resolveFeatureEligibility({
    user: completeUser,
    business: coreBusiness,
    plan: "pro",
    subscriptionStatus: "active",
    featureRequiresPaidPlan: true,
    featureRequiresKyc: true,
  });
  assert.equal(result.reason, "kyc_verification_required");
  assert.equal(result.allowed, false);
});

test("7. Authoritatively verified KYC participates in paid-feature eligibility", () => {
  const result = resolveFeatureEligibility({
    user: completeUser,
    business: verifiedBusiness,
    plan: "pro",
    subscriptionStatus: "active",
    featureRequiresPaidPlan: true,
    featureRequiresKyc: true,
  });
  assert.equal(result.kyc.verified, true);
  assert.equal(result.allowed, true);
});

test("8. Active subscription without verified KYC is not KYC eligible", () => {
  const result = resolveFeatureEligibility({
    user: completeUser,
    business: { ...coreBusiness, kycStatus: "submitted" },
    plan: "business",
    subscriptionStatus: "active",
    featureRequiresPaidPlan: true,
    featureRequiresKyc: true,
  });
  assert.equal(result.paidEntitlement, true);
  assert.equal(result.kyc.verified, false);
  assert.equal(result.allowed, false);
});

test("9. Verified KYC without paid entitlement does not unlock paid features", () => {
  const result = resolveFeatureEligibility({
    user: completeUser,
    business: verifiedBusiness,
    plan: "free",
    subscriptionStatus: "active",
    featureRequiresPaidPlan: true,
    featureRequiresKyc: true,
  });
  assert.equal(result.kyc.verified, true);
  assert.equal(result.paidEntitlement, false);
  assert.equal(result.allowed, false);
});

test("10. Country/entity changes recalculate purpose-specific requirement sets", () => {
  const indiaIndividual = resolveProfileRequirements({
    business: { country: "IN", entityType: "freelancer" },
    purpose: REQUIREMENT_PURPOSES.KYC_PAID_FEATURE,
  });
  const internationalCompany = resolveProfileRequirements({
    business: { country: "US", entityType: "company" },
    purpose: REQUIREMENT_PURPOSES.KYC_PAID_FEATURE,
  });
  assert.ok(indiaIndividual.requiredFields.includes("aadhaarLast4"));
  assert.ok(internationalCompany.anyOf.some((group) => group.includes("registrationNumber")));
  assert.notDeepEqual(indiaIndividual, internationalCompany);
});

test("11. Active-business switching evaluates the selected business only", () => {
  const alpha = resolveFeatureEligibility({ user: completeUser, business: verifiedBusiness, plan: "pro", subscriptionStatus: "active", featureRequiresKyc: true });
  const beta = resolveFeatureEligibility({ user: completeUser, business: { ...coreBusiness, id: "biz-b", name: "Beta Services" }, plan: "pro", subscriptionStatus: "active", featureRequiresKyc: true });
  assert.equal(alpha.allowed, true);
  assert.equal(beta.allowed, false);
});

test("12. Free-tier UI does not demand unnecessary sensitive KYC fields", () => {
  const mobile = readFileSync(new URL("../apps/mobile/app.js", import.meta.url), "utf8");
  const dashboardPrompt = mobile.match(/function profileSetupPrompt\(\) \{([\s\S]*?)\n\}/)?.[1] || "";
  assert.match(dashboardPrompt, /Add the information needed for your EazInvoice documents\./);
  assert.match(dashboardPrompt, /Remind me later/);
  assert.doesNotMatch(dashboardPrompt, /\b(?:PAN|Aadhaar|KYC)\b|address proof/i);
});
