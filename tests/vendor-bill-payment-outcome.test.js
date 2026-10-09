import assert from "node:assert/strict";
import test from "node:test";
import { createApi } from "../apps/api/src/index.js";
import { createStore } from "../apps/api/src/store.js";

function setupVendorBill() {
  const api = createApi({ store: createStore({}, { persist: false, useSupabaseEmailOtp: false }) });
  const user = api.createUser({ name: "Payment Outcome", email: `payment-outcome-${Date.now()}@example.com` });
  const businessId = api.listBusinessWorkspaces(user)[0].businessId;
  const vendor = api.createVendor({ name: "Outcome Vendor", businessId }, { user, businessId });
  const draft = api.createVendorBill({
    ownerUserId: user.id,
    businessId,
    vendorId: vendor.id,
    vendorBillNumber: `OUTCOME-${Date.now()}`,
    status: "draft",
    billDate: "2026-10-01",
    items: [{ description: "Outcome test", quantity: 1, rate: 1000, gstRate: 0 }],
  }, { user, businessId });
  const bill = api.updateVendorBill(draft.id, { status: "posted" }, { user, businessId });
  return { api, user, businessId, bill };
}

test("definitive pre-recording Vendor Bill rejection carries not_recorded", () => {
  const { api, user, businessId, bill } = setupVendorBill();
  assert.throws(
    () => api.recordVendorBillPayment(bill.id, {
      businessId,
      amount: 2000,
      idempotencyKey: "outcome-overpayment",
    }, { user, businessId }),
    (error) => error.paymentOutcome === "not_recorded" && /pending vendor bill balance/i.test(error.message),
  );
  assert.equal(api.listPayments(user, { businessId }).some((payment) => payment.vendorBillId === bill.id), false);
});

test("Vendor Bill payment requires matching currency and supported mode before recording", () => {
  const { api, user, businessId, bill } = setupVendorBill();
  for (const input of [
    { currency: "USD", mode: "bank" },
    { currency: "INR", mode: "bogus" },
    { currency: "USD", mode: "bogus" },
  ]) {
    assert.throws(
      () => api.recordVendorBillPayment(bill.id, {
        ...input,
        businessId,
        amount: 100,
        idempotencyKey: `invalid-${input.currency}-${input.mode}`,
      }, { user, businessId }),
      (error) => error.paymentOutcome === "not_recorded",
    );
  }
  assert.equal(api.listPayments(user, { businessId }).some((payment) => payment.vendorBillId === bill.id), false);
  assert.equal(api.listAccountingEventLedger(user, { businessId }).journals.some((journal) => journal.sourceType === "vendor_payment"), false);
});

test("Vendor Bill payment preserves established mode aliases and bill currency", () => {
  const { api, user, businessId, bill } = setupVendorBill();
  const result = api.recordVendorBillPayment(bill.id, {
    businessId,
    amount: 1000,
    currency: " inr ",
    mode: "Bank Transfer",
    idempotencyKey: "valid-currency-mode",
  }, { user, businessId });
  assert.equal(result.payment.currency, "INR");
  assert.equal(result.payment.mode, "bank_transfer");
});

test("draft Vendor Bill rejection carries not_recorded", () => {
  const { api, user, businessId } = setupVendorBill();
  const draft = api.createVendorBill({
    ownerUserId: user.id,
    businessId,
    status: "draft",
    vendorBillNumber: `DRAFT-${Date.now()}`,
    billDate: "2026-10-01",
    items: [{ description: "Draft outcome test", quantity: 1, rate: 1000, gstRate: 0 }],
  }, { user, businessId });
  assert.throws(
    () => api.recordVendorBillPayment(draft.id, { businessId, amount: 100 }, { user, businessId }),
    (error) => error.paymentOutcome === "not_recorded",
  );
});

test("successful Vendor Bill payment keeps existing response and idempotency behavior", () => {
  const { api, user, businessId, bill } = setupVendorBill();
  const first = api.recordVendorBillPayment(bill.id, {
    businessId,
    amount: 1000,
    idempotencyKey: "outcome-success",
  }, { user, businessId });
  const replay = api.recordVendorBillPayment(bill.id, {
    businessId,
    amount: 1000,
    idempotencyKey: "outcome-success",
  }, { user, businessId });
  assert.equal(first.payment.amount, 1000);
  assert.equal(replay.idempotentReplay, true);
  assert.equal(replay.payment.id, first.payment.id);
});

test("persistence failure remains ambiguous instead of claiming not_recorded", async () => {
  let failSaves = false;
  let lastState = {};
  const persistenceAdapter = {
    load() { return {}; },
    save(state) {
      if (failSaves) return Promise.reject(new Error("persistence unavailable"));
      lastState = JSON.parse(JSON.stringify(state));
      return undefined;
    },
    reload() { return Promise.resolve(lastState); },
  };
  const api = createApi({ store: createStore({}, { persistenceAdapter, useSupabaseEmailOtp: false }) });
  const user = api.createUser({ name: "Persistence Outcome", email: `persistence-outcome-${Date.now()}@example.com` });
  const businessId = api.listBusinessWorkspaces(user)[0].businessId;
  const vendor = api.createVendor({ name: "Persistence Vendor", businessId }, { user, businessId });
  const draft = api.createVendorBill({
    ownerUserId: user.id,
    businessId,
    vendorId: vendor.id,
    vendorBillNumber: `PERSIST-${Date.now()}`,
    status: "draft",
    billDate: "2026-10-01",
    items: [{ description: "Persistence outcome test", quantity: 1, rate: 1000, gstRate: 0 }],
  }, { user, businessId });
  const bill = api.updateVendorBill(draft.id, { status: "posted" }, { user, businessId });
  failSaves = true;
  await assert.rejects(
    api.recordVendorBillPayment(bill.id, { businessId, amount: 1000, idempotencyKey: "outcome-persistence" }, { user, businessId }),
    (error) => error.paymentOutcome === undefined && /persistence unavailable/i.test(error.message),
  );
});
