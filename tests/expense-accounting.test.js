import assert from "node:assert/strict";
import test from "node:test";
import { createApi } from "../apps/api/src/index.js";
import { createStore } from "../apps/api/src/store.js";

function scenario() {
  const store = createStore({}, { persist: false, useSupabaseEmailOtp: false });
  const api = createApi({ store });
  const user = api.createUser({ name: "Expense Owner", email: `expense-${Date.now()}-${Math.random()}@example.com` });
  const business = api.createBusiness(user, { name: "Expense Business", currency: "INR" });
  const bank = api.createBankAccount(user, { businessId: business.id, accountType: "bank", currency: "INR", displayName: "Operating Bank" });
  return { store, api, user, business, bank };
}

function input(s, overrides = {}) {
  return {
    businessId: s.business.id,
    bankAccountId: s.bank.id,
    expenseDate: "2026-10-10",
    payeeName: "Local supplier",
    description: "Office supplies",
    amount: 1000,
    currency: "INR",
    expenseAccountCode: "5100",
    idempotencyKey: `expense-${Date.now()}-${Math.random()}`,
    ...overrides,
  };
}

function cashScenario(openingBalance = 0) {
  const store = createStore({}, { persist: false, useSupabaseEmailOtp: false });
  const api = createApi({ store });
  const user = api.createUser({ name: "Cash Owner", email: `cash-${Date.now()}-${Math.random()}@example.com` });
  const business = api.createBusiness(user, { name: "Cash Business", currency: "INR" });
  const cash = api.createBankAccount(user, { businessId: business.id, accountType: "cash", currency: "INR", openingBalance, displayName: "Petty Cash" });
  return { store, api, user, business, bank: cash };
}

test("records one atomic zero-tax Expense and balanced bank-funded journal", async () => {
  const s = scenario();
  const result = await s.api.createExpense(s.user, input(s));
  assert.equal(result.expense.status, "recorded");
  assert.equal(result.accounting.journal.totalDebit, 1000);
  assert.equal(result.accounting.journal.totalCredit, 1000);
  const lines = s.store.exportState().accountingJournalLines.filter((line) => line.journalId === result.expense.journalId);
  assert.deepEqual(lines.map((line) => [line.accountCode, line.debit, line.credit]), [["5100", 1000, 0], [s.bank.ledgerAccountCode, 0, 1000]]);
});

test("same idempotency key replays, but a changed payload is rejected", async () => {
  const s = scenario();
  const body = input(s, { idempotencyKey: "stable-expense-key" });
  const first = await s.api.createExpense(s.user, body);
  const replay = await s.api.createExpense(s.user, body);
  assert.equal(replay.idempotentReplay, true);
  assert.equal(replay.expense.id, first.expense.id);
  assert.throws(() => s.api.createExpense(s.user, { ...body, amount: 2000 }));
  assert.equal(s.store.exportState().expenses.length, 1);
  assert.equal(s.store.exportState().accountingJournals.length, 1);
});

test("rejects nonzero tax, wrong currency, invalid funding account, and unauthorized actor before posting", async () => {
  const s = scenario();
  for (const overrides of [{ taxAmount: 1 }, { currency: "USD" }, { bankAccountId: "missing" }]) {
    assert.throws(() => s.api.createExpense(s.user, input(s, overrides)));
  }
  const viewer = s.api.createUser({ name: "Viewer", email: `viewer-${Date.now()}@example.com` });
  s.store.createTeamMember({ ownerUserId: s.user.id, businessId: s.business.id, email: viewer.email, name: viewer.name, role: "viewer", status: "active", acceptedUserId: viewer.id });
  assert.throws(() => s.api.createExpense(viewer, input(s)));
  assert.equal(s.store.exportState().expenses.length, 0);
  assert.equal(s.store.exportState().accountingJournals.length, 0);
});

test("reverses an Expense atomically, preserves the original, and rejects a second reversal", async () => {
  const s = scenario();
  const created = await s.api.createExpense(s.user, input(s, { idempotencyKey: "reverse-source" }));
  const reversed = await s.api.reverseExpense(created.expense.id, { idempotencyKey: "reverse-1", reversalDate: "2026-10-10", reason: "Duplicate purchase" }, { user: s.user, businessId: s.business.id });
  assert.equal(reversed.expense.status, "reversed");
  assert.equal(s.store.exportState().expenses[0].status, "reversed");
  assert.equal(s.store.exportState().accountingJournals.length, 2);
  assert.throws(() => s.api.reverseExpense(created.expense.id, { idempotencyKey: "reverse-2" }, { user: s.user, businessId: s.business.id }));
});

test("requires a meaningful reversal reason before any reversal mutation", async () => {
  const s = scenario();
  const created = await s.api.createExpense(s.user, input(s, { idempotencyKey: "reason-source" }));
  assert.throws(() => s.api.reverseExpense(created.expense.id, { idempotencyKey: "missing-reason", reason: "   " }, { user: s.user, businessId: s.business.id }), /reason is required/i);
  assert.equal(s.store.exportState().expenseReversals.length, 0);
  assert.equal(s.store.exportState().accountingJournals.length, 1);
});

test("blocks ordinary reversal after the expense journal is reconciled", async () => {
  const s = scenario();
  const created = await s.api.createExpense(s.user, input(s, { idempotencyKey: "reconcile-source" }));
  const imported = s.api.importBankStatement(s.user, {
    businessId: s.business.id,
    bankAccountId: s.bank.id,
    lines: [{ transactionDate: "2026-10-10", debit: 1000, currency: "INR", externalReference: "reconcile-source" }],
  }, { businessId: s.business.id });
  const line = imported.imported[0];
  const match = s.api.confirmBankMatch(s.user, {
    businessId: s.business.id,
    bankAccountId: s.bank.id,
    statementLineId: line.id,
    sourceType: "expense",
    sourceId: created.expense.id,
    matchedAmount: 1000,
  }, { businessId: s.business.id });
  assert.equal(match.status, "matched");
  assert.throws(() => s.api.reverseExpense(created.expense.id, { idempotencyKey: "reconcile-reversal", reason: "Corrected duplicate" }, { user: s.user, businessId: s.business.id }), /reconciled/i);
  assert.equal(s.store.exportState().expenses[0].status, "recorded");
  assert.equal(s.store.exportState().accountingJournals.length, 1);
});

test("enforces cash sufficiency using the authoritative opening balance", async () => {
  const s = cashScenario(1000);
  const exact = await s.api.createExpense(s.user, input(s, { bankAccountId: s.bank.id, amount: 1000, idempotencyKey: "cash-exact" }));
  assert.equal(exact.expense.status, "recorded");
  assert.throws(() => s.api.createExpense(s.user, input(s, { bankAccountId: s.bank.id, amount: 1, idempotencyKey: "cash-over" })), /cash balance is insufficient/i);
  assert.equal(s.store.exportState().expenses.length, 1);
  assert.equal(s.store.exportState().accountingJournals.length, 1);
});

test("does not apply cash sufficiency enforcement to bank-funded Expenses", async () => {
  const s = scenario();
  const result = await s.api.createExpense(s.user, input(s, { amount: 1000000, idempotencyKey: "bank-policy" }));
  assert.equal(result.expense.status, "recorded");
});

test("does not partially persist an Expense when accounting posting fails", async () => {
  const s = scenario();
  const state = s.store.exportState();
  state.ledgerAccounts = state.ledgerAccounts.filter((account) => account.accountCode !== s.bank.ledgerAccountCode);
  const broken = createApi({ store: createStore(state, { persist: false, useSupabaseEmailOtp: false }) });
  const brokenUser = broken.getUserById(s.user.id);
  assert.throws(() => broken.createExpense(brokenUser, input({ ...s, store: null }, { bankAccountId: s.bank.id })));
  assert.equal(broken.exportDataSnapshot().expenses.length, 0);
  assert.equal(broken.exportDataSnapshot().accountingJournals.length, 0);
});
