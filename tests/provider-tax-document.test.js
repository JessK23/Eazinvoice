import assert from "node:assert/strict";
import test from "node:test";
import { createApi } from "../apps/api/src/index.js";
import { createStore } from "../apps/api/src/store.js";

function scenario() {
  const store = createStore({}, { persist: false, useSupabaseEmailOtp: false });
  const api = createApi({ store });
  const user = api.createUser({ name: "Tax Owner", email: `tax-${Date.now()}-${Math.random()}@example.com` });
  const business = api.createBusiness(user, { name: "Tax Business" });
  const invoice = api.createInvoice({ ownerUserId: user.id, businessId: business.id, status: "created", currency: "INR", invoiceDate: "2026-10-06", items: [{ description: "Tax", quantity: 1, rate: 1000, gstRate: 0 }] }, { user, businessId: business.id });
  const payment = api.recordInvoicePayment(invoice.id, { amount: 1000, currency: "INR", gateway: "razorpay", gatewayPaymentId: `pay_${Date.now()}_${Math.random()}`, gatewayOrderId: `ord_${Date.now()}_${Math.random()}`, status: "captured" }, { user, businessId: business.id });
  const bank = api.createBankAccount(user, { businessId: business.id, accountType: "bank", displayName: "Tax Bank" }, { businessId: business.id });
  const settlement = api.createProviderSettlement(user, { businessId: business.id, merchantAccountId: "acct_tax", provider: "razorpay", providerSettlementId: `setl_${Date.now()}_${Math.random()}`, grossAmount: 1000, feeAmount: 100, feeTaxAmount: 0, adjustmentAmount: 0, netAmount: 900, currency: "INR", settlementDate: "2026-10-06", destinationBankAccountId: bank.id, paymentLinks: [{ paymentId: payment.payment.id, amount: 1000 }], sourceType: "tax-document-fixture", sourceReference: "settlement-row", payloadHash: `hash_${Math.random()}` }, { businessId: business.id, previewPlan: "business" });
  return { store, api, user, business, settlement: settlement.settlement };
}

function taxInput(s, overrides = {}) {
  return {
    businessId: s.business.id, provider: "razorpay", merchantAccountId: "acct_tax", taxDocumentId: "taxinv_1", documentVersion: "1", documentDate: "2026-10-06", taxPeriod: "2026-10", currency: "INR", providerTaxIdentity: "29AAAAA0000A1Z5",
    components: { taxableFeeAmount: 100, cgstAmount: 9, sgstAmount: 9, igstAmount: 0, totalTax: 18, documentTotal: 118 }, jurisdiction: { country: "IN", stateCode: "29", placeOfSupply: "29", sourceReference: "tax-invoice-source" }, settlementLinks: [{ settlementId: s.settlement.id, feeAmount: 100 }], provenance: { sourceType: "provider_tax_document", sourceReference: "tax-invoice-source", payloadHash: "tax-payload-1" }, ...overrides,
  };
}

function secondSettlement(s) {
  const result = s.api.createProviderSettlement(s.user, { businessId: s.business.id, merchantAccountId: "acct_tax", provider: "razorpay", providerSettlementId: `setl_second_${Date.now()}_${Math.random()}`, grossAmount: 500, feeAmount: 50, feeTaxAmount: 0, adjustmentAmount: 0, netAmount: 450, currency: "INR", settlementDate: "2026-10-06", destinationBankAccountId: s.store.exportState().bankAccounts[0].id, paymentLinks: [], sourceType: "tax-document-fixture", sourceReference: "second-row", payloadHash: `second_${Math.random()}` }, { businessId: s.business.id, previewPlan: "business" });
  return result.settlement;
}

function multiTaxInput(s, links, overrides = {}) {
  return taxInput(s, { taxDocumentId: `taxinv_multi_${Date.now()}_${Math.random()}`, components: { taxableFeeAmount: 150, cgstAmount: 9, sgstAmount: 9, igstAmount: 0, totalTax: 18, documentTotal: 168 }, settlementLinks: links, ...overrides });
}

test("trusted provider tax evidence preserves explicit CGST/SGST authority and is ledger-inert", () => {
  const s = scenario();
  const before = s.store.exportState();
  const result = s.api.createProviderTaxDocumentForSystem({ ...taxInput(s), trustedEvidence: true });
  assert.equal(result.document.status, "verified");
  assert.equal(result.document.accountingReadiness, "blocked");
  const after = s.store.exportState();
  assert.equal(after.accountingJournals.length, before.accountingJournals.length);
  assert.equal(after.financialEvents.length, before.financialEvents.length);
  assert.equal(after.providerSettlements[0].accountingStatus, "not_posted");
});

test("explicit IGST evidence is accepted without geographic inference", () => {
  const s = scenario();
  const result = s.api.createProviderTaxDocumentForSystem({ ...taxInput(s, { taxDocumentId: "taxinv_igst", components: { taxableFeeAmount: 100, cgstAmount: 0, sgstAmount: 0, igstAmount: 18, totalTax: 18, documentTotal: 118 }, jurisdiction: { country: "IN", stateCode: "27", placeOfSupply: "27", sourceReference: "provider-tax-row" } }), trustedEvidence: true });
  assert.equal(result.document.status, "verified");
  assert.equal(result.document.components.igstAmount, 18);
});

test("zero-tax evidence is supported but remains non-accounting", () => {
  const s = scenario();
  const result = s.api.createProviderTaxDocumentForSystem({ ...taxInput(s, { taxDocumentId: "taxinv_zero", components: { taxableFeeAmount: 100, cgstAmount: 0, sgstAmount: 0, igstAmount: 0, totalTax: 0, documentTotal: 100 } }), trustedEvidence: true });
  assert.equal(result.document.status, "verified");
  assert.equal(result.document.accountingStatus, "not_posted");
});

test("identical tax-document replay is idempotent and conflicting replay fails", () => {
  const s = scenario();
  const first = s.api.createProviderTaxDocumentForSystem({ ...taxInput(s), trustedEvidence: true });
  const second = s.api.createProviderTaxDocumentForSystem({ ...taxInput(s), trustedEvidence: true });
  assert.equal(second.idempotentReplay, true);
  assert.equal(second.document.id, first.document.id);
  assert.throws(() => s.api.createProviderTaxDocumentForSystem({ ...taxInput(s, { components: { taxableFeeAmount: 90, cgstAmount: 9, sgstAmount: 9, igstAmount: 0, totalTax: 18, documentTotal: 108 } }), trustedEvidence: true }), /conflicts/i);
});

test("different document IDs cannot claim the same provider-fee component economics", () => {
  const s = scenario();
  const first = s.api.createProviderTaxDocumentForSystem({ ...taxInput(s), trustedEvidence: true });
  const duplicate = s.api.createProviderTaxDocumentForSystem({ ...taxInput(s, { taxDocumentId: "taxinv_duplicate", provenance: { sourceType: "provider_tax_document", sourceReference: "other-import", payloadHash: "other-payload" } }), trustedEvidence: true });
  assert.equal(first.document.status, "verified");
  assert.equal(duplicate.document.status, "manual_review");
  assert.match(duplicate.document.reasons.join(","), /duplicate_component_economic_identity/);
  assert.equal(s.store.exportState().providerTaxDocuments.length, 2);
});

test("aggregate-only, mismatched, and unsupported component evidence fails closed", () => {
  const s = scenario();
  const aggregate = s.api.createProviderTaxDocumentForSystem({ ...taxInput(s, { taxDocumentId: "taxinv_aggregate", components: undefined, feeTaxAmount: 18 }), trustedEvidence: true });
  assert.equal(aggregate.document.status, "manual_review");
  assert.match(aggregate.document.reasons.join(","), /missing_explicit_tax_components/);
  const mismatch = s.api.createProviderTaxDocumentForSystem({ ...taxInput(s, { taxDocumentId: "taxinv_mismatch", components: { taxableFeeAmount: 100, cgstAmount: 9, sgstAmount: 9, igstAmount: 0, totalTax: 17, documentTotal: 117 } }), trustedEvidence: true });
  assert.match(mismatch.document.reasons.join(","), /tax_component_total_mismatch/);
  assert.throws(() => s.api.createProviderTaxDocumentForSystem({ ...taxInput(s, { taxDocumentId: "taxinv_usd", currency: "USD" }), trustedEvidence: true }), /currency/i);
});

test("tax-bearing evidence without provider tax identity or fee coverage is manual review", () => {
  const s = scenario();
  const result = s.api.createProviderTaxDocumentForSystem({ ...taxInput(s, { taxDocumentId: "taxinv_identity", providerTaxIdentity: "", components: { taxableFeeAmount: 101, cgstAmount: 9, sgstAmount: 9, igstAmount: 0, totalTax: 18, documentTotal: 119 } }), trustedEvidence: true });
  assert.match(result.document.reasons.join(","), /missing_authoritative_provider_tax_identity/);
  assert.match(result.document.reasons.join(","), /taxable_fee_exceeds_linked_settlement_fees/);
  assert.equal(result.document.status, "manual_review");
});

test("untrusted authenticated submission cannot forge verified status", () => {
  const s = scenario();
  const result = s.api.submitProviderTaxDocument(s.user, { ...taxInput(s), status: "verified", accountingReadiness: "accounting_ready", accountingStatus: "posted", evidenceLifecycle: "verified" }, { businessId: s.business.id, previewPlan: "business" });
  assert.notEqual(result.document.status, "verified");
  assert.equal(result.document.accountingReadiness, "blocked");
  assert.equal(result.document.accountingStatus, "not_posted");
});

test("cross-tenant settlement linkage is rejected", () => {
  const a = scenario();
  const b = scenario();
  const foreign = b.api.createProviderSettlement(b.user, { businessId: b.business.id, merchantAccountId: "acct_tax", provider: "razorpay", providerSettlementId: `foreign_${Date.now()}_${Math.random()}`, grossAmount: 1000, feeAmount: 100, feeTaxAmount: 0, adjustmentAmount: 0, netAmount: 900, currency: "INR", settlementDate: "2026-10-06", destinationBankAccountId: b.store.exportState().bankAccounts[0].id, paymentLinks: [], sourceType: "tax-document-fixture", sourceReference: "foreign-row", payloadHash: `foreign_${Math.random()}` }, { businessId: b.business.id, previewPlan: "business" });
  assert.throws(() => a.api.createProviderTaxDocumentForSystem({ ...taxInput(a, { settlementLinks: [{ settlementId: foreign.settlement.id, feeAmount: 100 }] }), trustedEvidence: true }), /linkage/i);
});

test("correction evidence preserves prior document and links replacement", () => {
  const s = scenario();
  const first = s.api.createProviderTaxDocumentForSystem({ ...taxInput(s), trustedEvidence: true });
  const replacement = s.api.createProviderTaxDocumentForSystem({ ...taxInput(s, { taxDocumentId: "taxinv_2", supersedesId: first.document.id, correctionType: "credit_note" }), trustedEvidence: true });
  assert.equal(replacement.document.supersedesId, first.document.id);
  assert.equal(s.store.exportState().providerTaxDocuments.length, 2);
  assert.equal(s.store.exportState().providerTaxDocuments.find((entry) => entry.id === first.document.id).status, "verified");
});

test("a predecessor cannot acquire a second authoritative successor", () => {
  const s = scenario();
  const first = s.api.createProviderTaxDocumentForSystem({ ...taxInput(s), trustedEvidence: true });
  const replacement = s.api.createProviderTaxDocumentForSystem({ ...taxInput(s, { taxDocumentId: "taxinv_chain_b", supersedesId: first.document.id }), trustedEvidence: true });
  const competing = s.api.createProviderTaxDocumentForSystem({ ...taxInput(s, { taxDocumentId: "taxinv_chain_c", supersedesId: first.document.id, provenance: { sourceType: "provider_tax_document", sourceReference: "competing", payloadHash: "competing" } }), trustedEvidence: true });
  assert.equal(replacement.document.status, "verified");
  assert.equal(competing.document.status, "manual_review");
  assert.match(competing.document.reasons.join(","), /multiple_authoritative_successors/);
});

test("multi-settlement CGST and SGST allocations require exact component conservation", () => {
  const s = scenario();
  const second = secondSettlement(s);
  const exact = s.api.createProviderTaxDocumentForSystem({ ...multiTaxInput(s, [
    { settlementId: s.settlement.id, feeAmount: 100, componentAmounts: { cgstAmount: 4.5, sgstAmount: 4.5, igstAmount: 0, totalTax: 9 } },
    { settlementId: second.id, feeAmount: 50, componentAmounts: { cgstAmount: 4.5, sgstAmount: 4.5, igstAmount: 0, totalTax: 9 } },
  ]), trustedEvidence: true });
  assert.equal(exact.document.status, "verified");
  const under = s.api.createProviderTaxDocumentForSystem({ ...multiTaxInput(s, [
    { settlementId: s.settlement.id, feeAmount: 100, componentAmounts: { cgstAmount: 4, sgstAmount: 4.5, igstAmount: 0, totalTax: 8.5 } },
    { settlementId: second.id, feeAmount: 50, componentAmounts: { cgstAmount: 4.5, sgstAmount: 4.5, igstAmount: 0, totalTax: 9 } },
  ]), trustedEvidence: true });
  assert.equal(under.document.status, "manual_review");
  assert.match(under.document.reasons.join(","), /component_allocation_total_mismatch/);
  const over = s.api.createProviderTaxDocumentForSystem({ ...multiTaxInput(s, [
    { settlementId: s.settlement.id, feeAmount: 100, componentAmounts: { cgstAmount: 5, sgstAmount: 4.5, igstAmount: 0, totalTax: 9.5 } },
    { settlementId: second.id, feeAmount: 50, componentAmounts: { cgstAmount: 5, sgstAmount: 4.5, igstAmount: 0, totalTax: 9.5 } },
  ]), trustedEvidence: true });
  assert.equal(over.document.status, "manual_review");
  assert.match(over.document.reasons.join(","), /component_allocation_total_mismatch/);
});

test("multi-settlement aggregate tax cannot hide component mismatch or absent components", () => {
  const s = scenario();
  const second = secondSettlement(s);
  const mismatch = s.api.createProviderTaxDocumentForSystem({ ...multiTaxInput(s, [
    { settlementId: s.settlement.id, feeAmount: 100, componentAmounts: { cgstAmount: 8, sgstAmount: 4, igstAmount: 0, totalTax: 12 } },
    { settlementId: second.id, feeAmount: 50, componentAmounts: { cgstAmount: 1, sgstAmount: 6, igstAmount: 0, totalTax: 7 } },
  ]), trustedEvidence: true });
  assert.equal(mismatch.document.status, "manual_review");
  assert.match(mismatch.document.reasons.join(","), /component_allocation_total_mismatch/);
  const absent = s.api.createProviderTaxDocumentForSystem({ ...multiTaxInput(s, [
    { settlementId: s.settlement.id, feeAmount: 100, componentAmounts: { cgstAmount: 9, sgstAmount: 4.5, igstAmount: 1, totalTax: 14.5 } },
    { settlementId: second.id, feeAmount: 50, componentAmounts: { cgstAmount: 0, sgstAmount: 4.5, igstAmount: 0, totalTax: 4.5 } },
  ]), trustedEvidence: true });
  assert.equal(absent.document.status, "manual_review");
  assert.match(absent.document.reasons.join(","), /allocation_for_absent_component/);
});

test("multi-settlement IGST conservation is exact and duplicate settlement rows are rejected", () => {
  const s = scenario();
  const second = secondSettlement(s);
  const exact = s.api.createProviderTaxDocumentForSystem({ ...multiTaxInput(s, [
    { settlementId: s.settlement.id, feeAmount: 100, componentAmounts: { cgstAmount: 0, sgstAmount: 0, igstAmount: 10, totalTax: 10 } },
    { settlementId: second.id, feeAmount: 50, componentAmounts: { cgstAmount: 0, sgstAmount: 0, igstAmount: 8, totalTax: 8 } },
  ], { components: { taxableFeeAmount: 150, cgstAmount: 0, sgstAmount: 0, igstAmount: 18, totalTax: 18, documentTotal: 168 } }), trustedEvidence: true });
  assert.equal(exact.document.status, "verified");
  const under = s.api.createProviderTaxDocumentForSystem({ ...multiTaxInput(s, [
    { settlementId: s.settlement.id, feeAmount: 100, componentAmounts: { cgstAmount: 0, sgstAmount: 0, igstAmount: 9, totalTax: 9 } },
    { settlementId: second.id, feeAmount: 50, componentAmounts: { cgstAmount: 0, sgstAmount: 0, igstAmount: 8, totalTax: 8 } },
  ], { taxDocumentId: "taxinv_igst_under", components: { taxableFeeAmount: 150, cgstAmount: 0, sgstAmount: 0, igstAmount: 18, totalTax: 18, documentTotal: 168 } }), trustedEvidence: true });
  assert.equal(under.document.status, "manual_review");
  assert.throws(() => s.api.createProviderTaxDocumentForSystem({ ...multiTaxInput(s, [
    { settlementId: s.settlement.id, feeAmount: 50, componentAmounts: { cgstAmount: 4.5, sgstAmount: 4.5, igstAmount: 0, totalTax: 9 } },
    { settlementId: s.settlement.id, feeAmount: 50, componentAmounts: { cgstAmount: 4.5, sgstAmount: 4.5, igstAmount: 0, totalTax: 9 } },
  ], { taxDocumentId: "taxinv_duplicate_link" }), trustedEvidence: true }), /linkage must be unique/i);
});

test("provider identity and settlement fee linkage are tenant/provider scoped", () => {
  const s = scenario();
  assert.throws(() => s.api.createProviderTaxDocumentForSystem({ ...taxInput(s, { merchantAccountId: "other_acct" }), trustedEvidence: true }), /linkage/i);
  assert.throws(() => s.api.createProviderTaxDocumentForSystem({ ...taxInput(s, { settlementLinks: [{ settlementId: s.settlement.id, feeAmount: 101 }] }), trustedEvidence: true }), /fee linkage/i);
});

test("tax evidence survives state reconstruction without creating accounting effects", () => {
  const s = scenario();
  s.api.createProviderTaxDocumentForSystem({ ...taxInput(s), trustedEvidence: true });
  const restored = createStore(s.store.exportState(), { persist: false, useSupabaseEmailOtp: false });
  const docs = restored.listProviderTaxDocuments({ businessId: s.business.id });
  assert.equal(docs.length, 1);
  assert.equal(docs[0].status, "verified");
  assert.equal(restored.exportState().accountingJournals.length, s.store.exportState().accountingJournals.length);
});

test("legacy settlement without tax evidence remains unchanged", () => {
  const s = scenario();
  const before = s.store.exportState().providerSettlements[0];
  assert.equal(s.store.listProviderTaxDocuments({ businessId: s.business.id }).length, 0);
  assert.equal(s.store.exportState().providerSettlements[0].id, before.id);
  assert.equal(s.store.exportState().providerSettlements[0].accountingStatus, "not_posted");
});
