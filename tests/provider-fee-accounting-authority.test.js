import assert from "node:assert/strict";
import test from "node:test";
import { createApi } from "../apps/api/src/index.js";
import { createStore } from "../apps/api/src/store.js";

function scenario() {
  const store = createStore({}, { persist: false, useSupabaseEmailOtp: false });
  const api = createApi({ store });
  const user = api.createUser({ name: "Fee Owner", email: `fee-${Date.now()}@example.com` });
  const business = api.createBusiness(user, { name: "Fee Business" });
  return { store, api, user, business };
}

test("provider fee authority bootstraps one provider-neutral Expense account", () => {
  const s = scenario();
  const first = s.api.getProviderFeeAccountAuthority(s.user, { businessId: s.business.id });
  const second = s.api.getProviderFeeAccountAuthority(s.user, { businessId: s.business.id });
  assert.equal(first.status, "canonical");
  assert.equal(first.account.accountCode, "5300");
  assert.equal(first.account.accountName, "Payment Provider Fees");
  assert.equal(first.account.accountRole, "provider_fee_expense");
  assert.equal(first.account.accountType, "expense");
  assert.equal(first.account.normalBalance, "debit");
  assert.equal(second.account.id, first.account.id);
  assert.equal(s.store.exportState().accountingJournals.length, 0);
});

test("provider fee authority never reuses generic or name-only accounts", () => {
  const s = scenario();
  const authority = s.api.getProviderFeeAccountAuthority(s.user, { businessId: s.business.id });
  assert.equal(authority.status, "canonical");
  assert.equal(authority.account.accountCode, "5300");
  assert.notEqual(authority.account.accountCode, "5100");
});

test("duplicate or incompatible provider fee authority fails closed", () => {
  const s = scenario();
  const canonical = s.api.getProviderFeeAccountAuthority(s.user, { businessId: s.business.id });
  const state = s.store.exportState();
  state.ledgerAccounts.push({ ...canonical.account, id: "acct_duplicate" });
  const duplicateStore = createStore(state, { persist: false, useSupabaseEmailOtp: false });
  assert.equal(duplicateStore.getProviderFeeAccountAuthority(s.business.id).status, "manual_review");
  assert.equal(duplicateStore.getProviderFeeAccountAuthority(s.business.id).reasonCode, "duplicate_provider_fee_accounts");

  const incompatibleState = s.store.exportState();
  const account = incompatibleState.ledgerAccounts.find((entry) => entry.accountCode === "5300");
  account.accountType = "asset";
  const incompatibleStore = createStore(incompatibleState, { persist: false, useSupabaseEmailOtp: false });
  assert.equal(incompatibleStore.getProviderFeeAccountAuthority(s.business.id).status, "manual_review");
  assert.equal(incompatibleStore.getProviderFeeAccountAuthority(s.business.id).reasonCode, "incompatible_provider_fee_account");
});

test("provider fee authority is tenant-scoped and does not mutate historical journals", () => {
  const s = scenario();
  const otherUser = s.api.createUser({ name: "Other Owner", email: `fee-other-${Date.now()}@example.com` });
  const otherBusiness = s.api.createBusiness(otherUser, { name: "Other Business" });
  const before = s.store.exportState();
  const own = s.api.getProviderFeeAccountAuthority(s.user, { businessId: s.business.id });
  const other = s.store.getProviderFeeAccountAuthority(otherBusiness.id);
  assert.equal(own.account.businessId, s.business.id);
  assert.equal(other.account.businessId, otherBusiness.id);
  assert.notEqual(own.account.id, other.account.id);
  assert.deepEqual(s.store.exportState().accountingJournals, before.accountingJournals);
});

test("inactive and deleted provider fee authorities fail closed without replacement", () => {
  for (const status of ["inactive", "deleted"]) {
    const s = scenario();
    const canonical = s.api.getProviderFeeAccountAuthority(s.user, { businessId: s.business.id });
    const state = s.store.exportState();
    const account = state.ledgerAccounts.find((entry) => entry.id === canonical.account.id);
    account.status = status;
    const beforeCount = state.ledgerAccounts.filter((entry) => entry.businessId === s.business.id && entry.accountCode === "5300").length;
    const restored = createStore(state, { persist: false, useSupabaseEmailOtp: false });
    const result = restored.getProviderFeeAccountAuthority(s.business.id);
    assert.equal(result.status, "manual_review");
    assert.equal(result.reasonCode, status === "deleted" ? "provider_fee_account_deleted" : "provider_fee_account_inactive");
    assert.equal(restored.exportState().ledgerAccounts.filter((entry) => entry.businessId === s.business.id && entry.accountCode === "5300").length, beforeCount);
    assert.equal(createStore(restored.exportState(), { persist: false, useSupabaseEmailOtp: false }).getProviderFeeAccountAuthority(s.business.id).status, "manual_review");
  }
});
