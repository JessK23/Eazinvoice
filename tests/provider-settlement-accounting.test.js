import assert from "node:assert/strict";
import test from "node:test";
import { createApi } from "../apps/api/src/index.js";
import { createStore } from "../apps/api/src/store.js";
import { chartFingerprint } from "../apps/api/src/accounting-chart.js";

function scenario(overrides = {}) {
  const { linkAmount, ...settlementOverrides } = overrides;
  let migration = { status: "completed", fingerprint: chartFingerprint() };
  let beforeMutation = null;
  const persistenceAdapter = {
    load: () => ({}),
    save: () => undefined,
  };
  const store = createStore({}, { persist: false, persistenceAdapter, useSupabaseEmailOtp: false });
  const api = createApi({ store });
  const user = api.createUser({ name: "Settlement Owner", email: `settle-${Date.now()}-${Math.random()}@example.com` });
  const business = api.createBusiness(user, { name: "Settlement Business" });
  const invoice = api.createInvoice({ ownerUserId: user.id, businessId: business.id, status: "created", currency: "INR", invoiceDate: "2026-10-05", items: [{ description: "Settlement", quantity: 1, rate: 10000, gstRate: 0 }] }, { user, businessId: business.id });
  const payment = api.recordInvoicePayment(invoice.id, { amount: 10000, currency: "INR", gateway: "razorpay", gatewayPaymentId: `pay_${Date.now()}`, gatewayOrderId: `order_${Date.now()}`, status: "captured" }, { user, businessId: business.id });
  const bank = api.createBankAccount(user, { businessId: business.id, accountType: "bank", displayName: "Settlement Bank" }, { businessId: business.id });
  const settlement = api.createProviderSettlement(user, {
    businessId: business.id, merchantAccountId: "acct_settle", provider: "razorpay", providerSettlementId: `setl_${Date.now()}`,
    grossAmount: 10000, feeAmount: 200, feeTaxAmount: 0, adjustmentAmount: 0, netAmount: 9800, currency: "INR", settlementDate: "2026-10-05", destinationBankAccountId: bank.id,
    paymentLinks: [{ paymentId: payment.payment.id, amount: linkAmount ?? 10000 }], sourceType: "settlement_report", sourceReference: "settlement-row", payloadHash: "settlement-hash",
    ...settlementOverrides,
  }, { businessId: business.id, previewPlan: "business" });
  persistenceAdapter.mutateState = async (mutation) => {
    const authoritativeState = store.exportState();
    if (beforeMutation) beforeMutation(authoritativeState);
    const outcome = await mutation(authoritativeState, {
      client: {
        query: async (_sql, params) => ({ rows: migration ? [{ business_id: params[0], migration_version: params[1], ...migration }] : [] }),
      },
    });
    return { ...outcome, state: outcome.state };
  };
  return { store, api, user, business, invoice, payment: payment.payment, bank, settlement: settlement.settlement, setMigration: (value) => { migration = value; }, setBeforeMutation: (fn) => { beforeMutation = fn; } };
}

async function addCgstSgstEvidence(s) {
  return s.api.createProviderTaxDocumentForSystem({
    businessId: s.business.id, provider: "razorpay", merchantAccountId: "acct_settle", taxDocumentId: `tax-account-authority-${Date.now()}-${Math.random()}`, documentVersion: "1", currency: "INR",
    providerTaxIdentity: "29AAAAA0000A1Z5", components: { taxableFeeAmount: 200, cgstAmount: 18, sgstAmount: 18, igstAmount: 0, totalTax: 36, documentTotal: 236 },
    jurisdiction: { country: "IN", stateCode: "29", placeOfSupply: "29", sourceReference: "tax-source" },
    settlementLinks: [{ settlementId: s.settlement.id, feeAmount: 200 }], provenance: { sourceType: "provider_tax_document", sourceReference: "tax-source", payloadHash: "tax-hash" }, trustedEvidence: true,
  });
}

test("simple settlement posts bank, 5300 fee, and 1110 clearing atomically", async () => {
  const s = scenario();
  const result = await s.api.postProviderSettlementAccounting(s.user, s.settlement.id, { businessId: s.business.id, previewPlan: "business" });
  assert.equal(result.posted, true);
  assert.equal(result.settlement.accountingStatus, "posted");
  const journal = s.store.exportState().accountingJournals.find((entry) => entry.id === result.journal.id);
  const lines = s.store.exportState().accountingJournalLines.filter((line) => line.journalId === journal.id);
  assert.equal(journal.totalDebit, 10000);
  assert.equal(journal.totalCredit, 10000);
  const bankCode = s.store.exportState().ledgerAccounts.find((account) => account.id === s.bank.ledgerAccountId).accountCode;
  assert.deepEqual(lines.map((line) => [line.accountCode, line.debit, line.credit]), [[bankCode, 9800, 0], ["5300", 200, 0], ["1110", 0, 10000]]);
  assert.equal(s.store.exportState().accountingJournals.length, 3); // invoice, receipt, settlement
});

test("identical settlement accounting retry is idempotent", async () => {
  const s = scenario();
  const first = await s.api.postProviderSettlementAccounting(s.user, s.settlement.id, { businessId: s.business.id, previewPlan: "business" });
  const second = await s.api.postProviderSettlementAccounting(s.user, s.settlement.id, { businessId: s.business.id, previewPlan: "business" });
  assert.equal(second.idempotentReplay, true);
  assert.equal(second.journal.id, first.journal.id);
  assert.equal(s.store.exportState().accountingJournals.filter((entry) => entry.sourceType === "provider_settlement").length, 1);
});

test("tax-bearing settlement remains ledger-inert", async () => {
  const s = scenario({ feeTaxAmount: 18, netAmount: 9782, taxComponents: { cgstAmount: 9, sgstAmount: 9, sourceReference: "tax-row" } });
  const before = s.store.exportState();
  await assert.rejects(() => s.api.postProviderSettlementAccounting(s.user, s.settlement.id, { businessId: s.business.id, previewPlan: "business" }), /tax/i);
  const after = s.store.exportState();
  assert.equal(after.accountingJournals.length, before.accountingJournals.length);
  assert.equal(after.providerSettlements[0].accountingStatus, "not_posted");
});

test("verified tax-exclusive CGST/SGST evidence posts one balanced GST settlement journal", async () => {
  const s = scenario({ feeTaxAmount: 36, netAmount: 9764, taxComponents: { cgstAmount: 18, sgstAmount: 18, sourceReference: "tax-row" } });
  const evidence = await s.api.createProviderTaxDocumentForSystem({
    businessId: s.business.id, provider: "razorpay", merchantAccountId: "acct_settle", taxDocumentId: "tax-settle-cgst", documentVersion: "1", currency: "INR",
    providerTaxIdentity: "29AAAAA0000A1Z5", components: { taxableFeeAmount: 200, cgstAmount: 18, sgstAmount: 18, igstAmount: 0, totalTax: 36, documentTotal: 236 },
    jurisdiction: { country: "IN", stateCode: "29", placeOfSupply: "29", sourceReference: "tax-source" },
    settlementLinks: [{ settlementId: s.settlement.id, feeAmount: 200 }], provenance: { sourceType: "provider_tax_document", sourceReference: "tax-source", payloadHash: "tax-hash" }, trustedEvidence: true,
  });
  assert.equal(evidence.document.status, "verified");
  const result = await s.api.postProviderSettlementAccounting(s.user, s.settlement.id, { businessId: s.business.id, previewPlan: "business" });
  const state = s.store.exportState();
  const journal = state.accountingJournals.find((entry) => entry.id === result.journal.id);
  const lines = state.accountingJournalLines.filter((line) => line.journalId === journal.id);
  const bankCode = state.ledgerAccounts.find((account) => account.id === s.bank.ledgerAccountId).accountCode;
  assert.equal(journal.totalDebit, 10000);
  assert.deepEqual(lines.map((line) => [line.accountCode, line.debit, line.credit]), [[bankCode, 9764, 0], ["5300", 200, 0], ["2211", 18, 0], ["2212", 18, 0], ["1110", 0, 10000]]);
  assert.equal(state.providerSettlements[0].accountingReadiness, "accounting_eligible");
});

test("verified tax-exclusive IGST evidence posts to Input IGST", async () => {
  const s = scenario({ feeTaxAmount: 36, netAmount: 9764, taxComponents: { igstAmount: 36, sourceReference: "tax-row" } });
  await s.api.createProviderTaxDocumentForSystem({
    businessId: s.business.id, provider: "razorpay", merchantAccountId: "acct_settle", taxDocumentId: "tax-settle-igst", documentVersion: "1", currency: "INR",
    providerTaxIdentity: "29AAAAA0000A1Z5", components: { taxableFeeAmount: 200, cgstAmount: 0, sgstAmount: 0, igstAmount: 36, totalTax: 36, documentTotal: 236 },
    jurisdiction: { country: "IN", stateCode: "27", placeOfSupply: "27", sourceReference: "tax-source" },
    settlementLinks: [{ settlementId: s.settlement.id, feeAmount: 200 }], provenance: { sourceType: "provider_tax_document", sourceReference: "tax-source", payloadHash: "tax-hash" }, trustedEvidence: true,
  });
  const result = await s.api.postProviderSettlementAccounting(s.user, s.settlement.id, { businessId: s.business.id, previewPlan: "business" });
  const lines = s.store.exportState().accountingJournalLines.filter((line) => line.journalId === result.journal.id);
  assert.ok(lines.some((line) => line.accountCode === "2213" && line.debit === 36));
  assert.equal(lines.some((line) => line.accountCode === "2211" || line.accountCode === "2212"), false);
});

test("invalid Input GST account authority never partially posts", async () => {
  const mutations = [
    ["duplicate", (state, account) => state.ledgerAccounts.push({ ...account, id: "acct_duplicate_2211" })],
    ["wrong type", (_state, account) => { account.accountType = "liability"; }],
    ["wrong normal balance", (_state, account) => { account.normalBalance = "credit"; }],
    ["wrong role", (_state, account) => { account.accountRole = "output_cgst"; }],
    ["inactive", (_state, account) => { account.status = "inactive"; }],
    ["missing", (state) => { state.ledgerAccounts = state.ledgerAccounts.filter((entry) => entry.accountCode !== "2211"); }],
    ["tenant mismatch", (_state, account) => { account.businessId = "other-business"; }],
  ];
  for (const [label, mutate] of mutations) {
    const s = scenario({ feeTaxAmount: 36, netAmount: 9764, taxComponents: { cgstAmount: 18, sgstAmount: 18, sourceReference: "tax-row" } });
    await addCgstSgstEvidence(s);
    s.setBeforeMutation((state) => {
      const account = state.ledgerAccounts.find((entry) => entry.businessId === s.business.id && entry.accountCode === "2211")
        || state.ledgerAccounts.find((entry) => entry.accountCode === "2211");
      mutate(state, account);
    });
    const before = s.store.exportState();
    await assert.rejects(
      () => s.api.postProviderSettlementAccounting(s.user, s.settlement.id, { businessId: s.business.id, previewPlan: "business" }),
      /Input GST account authority/i,
      label,
    );
    const after = s.store.exportState();
    assert.equal(after.accountingJournals.length, before.accountingJournals.length, label);
    assert.equal(after.providerSettlements[0].accountingStatus, "not_posted", label);
  }
});

test("GST settlement rejects stale Migration 025 authority before posting", async () => {
  const s = scenario({ feeTaxAmount: 36, netAmount: 9764, taxComponents: { cgstAmount: 18, sgstAmount: 18, sourceReference: "tax-row" } });
  await addCgstSgstEvidence(s);
  s.setMigration({ status: "completed", fingerprint: "stale" });
  const before = s.store.exportState();
  await assert.rejects(
    () => s.api.postProviderSettlementAccounting(s.user, s.settlement.id, { businessId: s.business.id, previewPlan: "business" }),
    /accounting authority|migration/i,
  );
  const after = s.store.exportState();
  assert.equal(after.accountingJournals.length, before.accountingJournals.length);
  assert.equal(after.providerSettlements[0].accountingStatus, "not_posted");
});

test("tax-bearing settlement without verified tax evidence remains ledger-inert", async () => {
  const s = scenario({ feeTaxAmount: 36, netAmount: 9764, taxComponents: { cgstAmount: 18, sgstAmount: 18, sourceReference: "tax-row" } });
  await assert.rejects(() => s.api.postProviderSettlementAccounting(s.user, s.settlement.id, { businessId: s.business.id, previewPlan: "business" }), /tax document|eligibility/i);
});

test("taxable-fee mismatch blocks GST settlement posting", async () => {
  const s = scenario({ feeTaxAmount: 36, netAmount: 9764, taxComponents: { cgstAmount: 18, sgstAmount: 18, sourceReference: "tax-row" } });
  const evidence = await s.api.createProviderTaxDocumentForSystem({
    businessId: s.business.id, provider: "razorpay", merchantAccountId: "acct_settle", taxDocumentId: "tax-settle-mismatch", currency: "INR",
    providerTaxIdentity: "29AAAAA0000A1Z5", components: { taxableFeeAmount: 190, cgstAmount: 18, sgstAmount: 18, igstAmount: 0, totalTax: 36, documentTotal: 226 },
    jurisdiction: { country: "IN", stateCode: "29", placeOfSupply: "29", sourceReference: "tax-source" }, settlementLinks: [{ settlementId: s.settlement.id, feeAmount: 200 }],
    provenance: { sourceType: "provider_tax_document", sourceReference: "tax-source", payloadHash: "tax-hash" }, trustedEvidence: true,
  });
  assert.equal(evidence.document.status, "verified");
  await assert.rejects(() => s.api.postProviderSettlementAccounting(s.user, s.settlement.id, { businessId: s.business.id, previewPlan: "business" }), /taxable.?fee/i);
  assert.equal(s.store.exportState().providerSettlements[0].accountingStatus, "not_posted");
});

test("settlement requires completed current Migration 025 authority", async () => {
  for (const migration of [null, { status: "processing", fingerprint: chartFingerprint() }, { status: "manual_review", fingerprint: chartFingerprint() }, { status: "completed", fingerprint: "stale" }]) {
    const s = scenario();
    s.setMigration(migration);
    const before = s.store.exportState();
    await assert.rejects(() => s.api.postProviderSettlementAccounting(s.user, s.settlement.id, { businessId: s.business.id, previewPlan: "business" }), /accounting authority|migration/i);
    const after = s.store.exportState();
    assert.equal(after.accountingJournals.length, before.accountingJournals.length);
    assert.equal(after.providerSettlements[0].accountingStatus, "not_posted");
  }
});

test("posted settlement consumption prevents a second settlement from reusing clearing", async () => {
  const s = scenario();
  await assert.rejects(() => s.api.createProviderSettlement(s.user, {
    businessId: s.business.id, merchantAccountId: "acct_settle", provider: "razorpay", providerSettlementId: "setl_duplicate",
    grossAmount: 10000, feeAmount: 200, feeTaxAmount: 0, adjustmentAmount: 0, netAmount: 9800, currency: "INR", settlementDate: "2026-10-05", destinationBankAccountId: s.bank.id,
    paymentLinks: [{ paymentId: s.payment.id, amount: 10000 }], sourceType: "settlement_report", sourceReference: "settlement-row-2", payloadHash: "settlement-hash-2",
  }, { businessId: s.business.id, previewPlan: "business" }), /captured Payment amount/i);
  await s.api.postProviderSettlementAccounting(s.user, s.settlement.id, { businessId: s.business.id, previewPlan: "business" });
});

test("effective completed reversal removes unavailable clearing before posting", async () => {
  const s = scenario();
  s.setBeforeMutation((state) => {
    state.paymentReversals.push({ id: "rev-1", originalPaymentId: s.payment.id, businessId: s.business.id, status: "posted", amount: 10000, financialEventId: "rev-event-1" });
    state.financialEvents.push({ id: "rev-event-1", businessId: s.business.id, postingStatus: "posted" });
  });
  const before = s.store.exportState();
  await assert.rejects(() => s.api.postProviderSettlementAccounting(s.user, s.settlement.id, { businessId: s.business.id, previewPlan: "business" }), /clearing availability|insufficient/i);
  const after = s.store.exportState();
  assert.equal(after.accountingJournals.length, before.accountingJournals.length);
  assert.equal(after.providerSettlements[0].accountingStatus, "not_posted");
});

test("shared authoritative refund and reversal lineage is counted once", async () => {
  const s = scenario({ grossAmount: 8000, feeAmount: 200, netAmount: 7800, linkAmount: 8000 });
  s.setBeforeMutation((state) => {
    state.financialEvents.push({ id: "shared-reduction", businessId: s.business.id, postingStatus: "posted" });
    state.paymentReversals.push({ id: "rev-shared", originalPaymentId: s.payment.id, businessId: s.business.id, status: "posted", amount: 2000, financialEventId: "shared-reduction" });
    state.customerRefunds.push({ id: "refund-shared", sourcePaymentId: s.payment.id, businessId: s.business.id, status: "processed", amount: 2000, financialEventId: "shared-reduction" });
  });
  const result = await s.api.postProviderSettlementAccounting(s.user, s.settlement.id, { businessId: s.business.id, previewPlan: "business" });
  assert.equal(result.posted, true);
});

test("distinct authoritative refund and reversal lineages can both reduce clearing", async () => {
  const s = scenario({ grossAmount: 5000, feeAmount: 200, netAmount: 4800, linkAmount: 5000 });
  s.setBeforeMutation((state) => {
    state.financialEvents.push(
      { id: "reduction-refund", businessId: s.business.id, postingStatus: "posted" },
      { id: "reduction-reversal", businessId: s.business.id, postingStatus: "posted" },
    );
    state.customerRefunds.push({ id: "refund-distinct", sourcePaymentId: s.payment.id, businessId: s.business.id, status: "processed", amount: 2000, financialEventId: "reduction-refund" });
    state.paymentReversals.push({ id: "reversal-distinct", originalPaymentId: s.payment.id, businessId: s.business.id, status: "posted", amount: 3000, financialEventId: "reduction-reversal" });
  });
  const result = await s.api.postProviderSettlementAccounting(s.user, s.settlement.id, { businessId: s.business.id, previewPlan: "business" });
  assert.equal(result.posted, true);
});

test("completed reduction without authoritative lineage fails closed", async () => {
  const s = scenario();
  s.setBeforeMutation((state) => {
    state.customerRefunds.push({ id: "refund-ambiguous", sourcePaymentId: s.payment.id, businessId: s.business.id, status: "processed", amount: 2000 });
  });
  await assert.rejects(() => s.api.postProviderSettlementAccounting(s.user, s.settlement.id, { businessId: s.business.id, previewPlan: "business" }), /ambiguous/i);
});

test("over-reduction is inconsistent rather than silently clamped", async () => {
  const s = scenario();
  s.setBeforeMutation((state) => {
    state.financialEvents.push(
      { id: "over-refund", businessId: s.business.id, postingStatus: "posted" },
      { id: "over-reversal", businessId: s.business.id, postingStatus: "posted" },
    );
    state.customerRefunds.push({ id: "refund-over", sourcePaymentId: s.payment.id, businessId: s.business.id, status: "processed", amount: 6000, financialEventId: "over-refund" });
    state.paymentReversals.push({ id: "reversal-over", originalPaymentId: s.payment.id, businessId: s.business.id, status: "posted", amount: 5000, financialEventId: "over-reversal" });
  });
  await assert.rejects(() => s.api.postProviderSettlementAccounting(s.user, s.settlement.id, { businessId: s.business.id, previewPlan: "business" }), /exceeds captured|reduction_exceeds_captured/i);
});

test("incompatible 1110 semantics remain ledger-inert", async () => {
  for (const mutation of [
    (account) => { account.accountType = "liability"; account.normalBalance = "credit"; },
    (account) => { account.accountRole = "accounts_receivable"; },
    (account) => { account.status = "inactive"; },
  ]) {
    const s = scenario();
    s.setBeforeMutation((state) => mutation(state.ledgerAccounts.find((account) => account.businessId === s.business.id && account.accountCode === "1110")));
    const before = s.store.exportState();
    await assert.rejects(() => s.api.postProviderSettlementAccounting(s.user, s.settlement.id, { businessId: s.business.id, previewPlan: "business" }), /clearing authority|unavailable/i);
    const after = s.store.exportState();
    assert.equal(after.accountingJournals.length, before.accountingJournals.length);
    assert.equal(after.providerSettlements[0].accountingStatus, "not_posted");
  }
});

test("incompatible destination bank ledger semantics remain ledger-inert", async () => {
  for (const mutation of [
    (account) => { account.accountType = "liability"; account.normalBalance = "credit"; },
    (account) => { account.bankAccountType = "cash"; },
    (account) => { account.status = "inactive"; },
  ]) {
    const s = scenario();
    s.setBeforeMutation((state) => mutation(state.ledgerAccounts.find((account) => account.id === s.bank.ledgerAccountId)));
    const before = s.store.exportState();
    await assert.rejects(() => s.api.postProviderSettlementAccounting(s.user, s.settlement.id, { businessId: s.business.id, previewPlan: "business" }), /destination bank|destination ledger/i);
    const after = s.store.exportState();
    assert.equal(after.accountingJournals.length, before.accountingJournals.length);
    assert.equal(after.providerSettlements[0].accountingStatus, "not_posted");
  }
});
