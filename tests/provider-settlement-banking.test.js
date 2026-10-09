import assert from "node:assert/strict";
import test from "node:test";
import { createApi } from "../apps/api/src/index.js";
import { createStore } from "../apps/api/src/store.js";
import { chartFingerprint } from "../apps/api/src/accounting-chart.js";
import { buildInternalBankTransactions } from "../apps/api/src/bank-reconciliation-service.js";

function scenario() {
  let migration = { status: "completed", fingerprint: chartFingerprint() };
  const persistenceAdapter = { load: () => ({}), save: () => undefined };
  const store = createStore({}, { persist: false, persistenceAdapter, useSupabaseEmailOtp: false });
  const api = createApi({ store });
  const user = api.createUser({ name: "Banking Owner", email: `banking-${Date.now()}-${Math.random()}@example.com` });
  const business = api.createBusiness(user, { name: "Banking Business" });
  const invoice = api.createInvoice({
    ownerUserId: user.id,
    businessId: business.id,
    status: "created",
    currency: "INR",
    invoiceDate: "2026-10-06",
    items: [{ description: "Settlement", quantity: 1, rate: 10000, gstRate: 0 }],
  }, { user, businessId: business.id });
  const payment = api.recordInvoicePayment(invoice.id, {
    amount: 10000,
    currency: "INR",
    gateway: "razorpay",
    gatewayPaymentId: `pay_${Date.now()}_${Math.random()}`,
    gatewayOrderId: `order_${Date.now()}_${Math.random()}`,
    status: "captured",
  }, { user, businessId: business.id });
  const bank = api.createBankAccount(user, { businessId: business.id, accountType: "bank", displayName: "Settlement Bank" }, { businessId: business.id });
  const settlement = api.createProviderSettlement(user, {
    businessId: business.id,
    merchantAccountId: "acct_banking",
    provider: "razorpay",
    providerSettlementId: `setl_${Date.now()}_${Math.random()}`,
    grossAmount: 10000,
    feeAmount: 200,
    feeTaxAmount: 0,
    adjustmentAmount: 0,
    netAmount: 9800,
    currency: "INR",
    settlementDate: "2026-10-07",
    destinationBankAccountId: bank.id,
    paymentLinks: [{ paymentId: payment.payment.id, amount: 10000 }],
    sourceType: "settlement_report",
    sourceReference: "payout-row",
    payloadHash: `hash_${Math.random()}`,
  }, { businessId: business.id, previewPlan: "business" });
  persistenceAdapter.mutateState = async (mutation) => {
    const outcome = await mutation(store.exportState(), {
      client: { query: async (_sql, params) => ({ rows: migration ? [{ business_id: params[0], migration_version: params[1], ...migration }] : [] }) },
    });
    return { ...outcome, state: outcome.state };
  };
  return { store, api, user, business, bank, settlement: settlement.settlement, setMigration: (value) => { migration = value; } };
}

async function post(s) {
  return s.api.postProviderSettlementAccounting(s.user, s.settlement.id, { businessId: s.business.id, previewPlan: "business" });
}

test("posted zero-tax provider settlement projects only its actual-bank net line", async () => {
  const s = scenario();
  const result = await post(s);
  const state = s.store.exportState();
  const projected = buildInternalBankTransactions(state, state.bankAccounts.find((entry) => entry.id === s.bank.id));
  assert.equal(result.posted, true);
  assert.equal(projected.length, 1);
  assert.deepEqual(projected[0], {
    businessId: s.business.id,
    bankAccountId: s.bank.id,
    ledgerAccountId: s.bank.ledgerAccountId,
    sourceType: "provider_settlement",
    sourceId: s.settlement.id,
    journalId: result.journal.id,
    journalLineId: projected[0].journalLineId,
    transactionDate: "2026-10-07",
    direction: "money_in",
    amount: 9800,
    amountMinor: 980000,
    currency: "INR",
    reference: s.settlement.providerSettlementId,
    narration: `Provider settlement ${s.settlement.providerSettlementId}`,
  });
});

test("provider settlement projection is stable and excludes fee, GST, and clearing lines", async () => {
  const s = scenario();
  await post(s);
  const first = buildInternalBankTransactions(s.store.exportState(), s.store.exportState().bankAccounts.find((entry) => entry.id === s.bank.id));
  const second = buildInternalBankTransactions(s.store.exportState(), s.store.exportState().bankAccounts.find((entry) => entry.id === s.bank.id));
  assert.equal(first.length, 1);
  assert.equal(first[0].journalLineId, second[0].journalLineId);
  assert.equal(first[0].amount, 9800);
  assert.equal(first[0].reference, s.settlement.providerSettlementId);
});

test("Banking match and unmatch link the posted settlement without changing accounting", async () => {
  const s = scenario();
  const result = await post(s);
  const before = s.store.exportState();
  const imported = s.api.importBankStatement(s.user, {
    businessId: s.business.id,
    bankAccountId: s.bank.id,
    currency: "INR",
    lines: [{ transactionDate: "2026-10-07", credit: 9800, debit: 0, currency: "INR", externalReference: s.settlement.providerSettlementId, description: "Razorpay payout" }],
  }, { businessId: s.business.id });
  const line = imported.imported[0];
  const suggestions = s.api.suggestBankMatches(s.user, line.id, { businessId: s.business.id });
  assert.equal(suggestions.candidates.length, 1);
  assert.equal(suggestions.candidates[0].sourceType, "provider_settlement");
  const match = s.api.confirmBankMatch(s.user, { businessId: s.business.id, bankAccountId: s.bank.id, statementLineId: line.id, sourceType: "provider_settlement", sourceId: s.settlement.id, matchedAmount: 9800 }, { businessId: s.business.id });
  assert.equal(match.sourceId, s.settlement.id);
  const unmatched = s.api.unmatchBankReconciliation(s.user, match.id, { businessId: s.business.id });
  assert.equal(unmatched.status, "unmatched");
  const after = s.store.exportState();
  assert.deepEqual(after.accountingJournals, before.accountingJournals);
  assert.deepEqual(after.accountingJournalLines, before.accountingJournalLines);
  assert.equal(after.providerSettlements[0].accountingStatus, "posted");
});

test("unposted provider settlement is not exposed as a Banking candidate", () => {
  const s = scenario();
  const state = s.store.exportState();
  const projected = buildInternalBankTransactions(state, state.bankAccounts.find((entry) => entry.id === s.bank.id));
  assert.equal(projected.length, 0);
});
