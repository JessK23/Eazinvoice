import assert from "node:assert/strict";
import test from "node:test";
import { createApi } from "../apps/api/src/index.js";
import { STATE_COLLECTIONS, deriveCounters, normalizeStateDocument } from "../apps/api/src/postgres-state.js";
import { createStore } from "../apps/api/src/store.js";

function setup() {
  const api = createApi({ store: createStore({}, { persist: false, useSupabaseEmailOtp: false }) });
  const user = api.createUser({ name: "Allocation Owner", email: `allocation-${Date.now()}-${Math.random()}@example.com` });
  const businessId = api.listBusinessWorkspaces(user)[0].businessId;
  return { api, user, businessId };
}

function invoice(api, user, businessId, number, rate = 10000) {
  return api.createInvoice({
    ownerUserId: user.id,
    businessId,
    status: "created",
    invoiceNumber: number,
    currency: "INR",
    taxRate: 0,
    items: [{ description: number, quantity: 1, rate }],
  });
}

function vendorBill(api, user, businessId, vendorId, number, rate = 10000) {
  return api.createVendorBill({
    ownerUserId: user.id,
    businessId,
    vendorId,
    vendorBillNumber: number,
    status: "posted",
    currency: "INR",
    taxRate: 0,
    items: [{ description: number, quantity: 1, rate }],
  }, { user, businessId });
}

test("Payment Allocation persists without replacing the Payment identity", () => {
  const { api, user, businessId } = setup();
  const source = invoice(api, user, businessId, "ALLOC-SOURCE", 20000);
  const payment = api.recordInvoicePayment(source.id, { businessId, amount: 10000, idempotencyKey: "alloc-payment-1" }, { user, businessId }).payment;

  const created = api.createPaymentAllocation({
    paymentId: payment.id,
    documentType: "INVOICE",
    documentId: source.id,
    allocatedAmount: 6000,
    idempotencyKey: "alloc-1",
  }, { user, businessId });

  assert.equal(created.allocation.paymentId, payment.id);
  assert.equal(created.allocation.documentId, source.id);
  assert.equal(created.allocation.allocatedAmount, 6000);
  assert.equal(api.listPayments(user, { businessId }).find((entry) => entry.id === payment.id).id, payment.id);
});

test("Payment Allocation supports partial allocation, derived unallocated amount, and idempotent retry", () => {
  const { api, user, businessId } = setup();
  const source = invoice(api, user, businessId, "PARTIAL-SOURCE", 20000);
  const payment = api.recordInvoicePayment(source.id, { businessId, amount: 10000, idempotencyKey: "partial-payment" }, { user, businessId }).payment;

  const first = api.createPaymentAllocation({ paymentId: payment.id, documentType: "INVOICE", documentId: source.id, allocatedAmount: 4000, idempotencyKey: "partial-allocation" }, { user, businessId });
  const replay = api.createPaymentAllocation({ paymentId: payment.id, documentType: "INVOICE", documentId: source.id, allocatedAmount: 4000, idempotencyKey: "partial-allocation" }, { user, businessId });
  const active = api.listPaymentAllocations(user, { businessId, paymentId: payment.id });

  assert.equal(first.allocation.allocatedAmount, 4000);
  assert.equal(replay.idempotentReplay, true);
  assert.equal(active.length, 1);
  assert.equal(payment.amount - active.reduce((sum, entry) => sum + entry.allocatedAmount, 0), 6000);
});

test("canonical customer receipts support partial allocation and update invoice balance", () => {
  const { api, user, businessId } = setup();
  const customer = api.createCustomer({ ownerUserId: user.id, businessId, name: "Receipt Customer" });
  const source = api.createInvoice({
    ownerUserId: user.id,
    businessId,
    customerId: customer.id,
    status: "created",
    invoiceNumber: "RECEIPT-PARTIAL",
    currency: "INR",
    taxRate: 0,
    items: [{ description: "Partial receipt", quantity: 1, rate: 10000 }],
  });
  const receipt = api.recordCustomerReceipt({
    customerId: customer.id,
    businessId,
    amount: 4000,
    currency: "INR",
    mode: "bank_transfer",
    reference: "UTR-PARTIAL",
    idempotencyKey: "receipt-partial-1",
  }, { user, businessId });

  assert.equal(receipt.payment.invoiceId, "");
  assert.equal(receipt.payment.accountingTreatment, "receipt_first");
  assert.equal(receipt.receiptAccounting.posted, true);
  const allocation = api.createPaymentAllocation({
    paymentId: receipt.payment.id,
    documentType: "INVOICE",
    documentId: source.id,
    allocatedAmount: 4000,
    idempotencyKey: "receipt-partial-allocation",
  }, { user, businessId });
  const refreshed = api.getInvoice(source.id);

  assert.equal(allocation.accounting.posted, true);
  assert.equal(refreshed.paidAmount, 4000);
  assert.equal(refreshed.balanceAmount, 6000);
  assert.equal(refreshed.paymentStatus, "part_paid");
  assert.equal(api.getPaymentUnappliedAmount(receipt.payment.id, { businessId }), 0);
  assert.equal(api.listInvoicePayments(source.id).some((payment) => payment.id === receipt.payment.id), true);
});

test("canonical customer receipts preserve overpayments and distinct genuine provider payments", () => {
  const { api, user, businessId } = setup();
  const customer = api.createCustomer({ ownerUserId: user.id, businessId, name: "Overpay Customer" });
  const source = api.createInvoice({
    ownerUserId: user.id,
    businessId,
    customerId: customer.id,
    status: "created",
    invoiceNumber: "RECEIPT-OVERPAY",
    currency: "INR",
    taxRate: 0,
    items: [{ description: "Overpayment", quantity: 1, rate: 10000 }],
  });
  const first = api.recordCustomerReceipt({
    customerId: customer.id,
    businessId,
    amount: 12000,
    currency: "INR",
    provider: "razorpay",
    providerPaymentId: "pay_real_1",
    providerOrderId: "order_real_1",
  }, { user, businessId });
  const replay = api.recordCustomerReceipt({
    customerId: customer.id,
    businessId,
    amount: 12000,
    currency: "INR",
    provider: "razorpay",
    providerPaymentId: "pay_real_1",
    providerOrderId: "order_real_1",
  }, { user, businessId });
  const second = api.recordCustomerReceipt({
    customerId: customer.id,
    businessId,
    amount: 3000,
    currency: "INR",
    provider: "razorpay",
    providerPaymentId: "pay_real_2",
    providerOrderId: "order_real_2",
  }, { user, businessId });

  assert.equal(replay.idempotentReplay, true);
  assert.notEqual(second.payment.id, first.payment.id);
  api.createPaymentAllocation({
    paymentId: first.payment.id,
    documentType: "INVOICE",
    documentId: source.id,
    allocatedAmount: 10000,
    idempotencyKey: "receipt-overpay-allocation",
  }, { user, businessId });
  assert.equal(api.getPaymentUnappliedAmount(first.payment.id, { businessId }), 2000);
  assert.equal(api.getPaymentUnappliedAmount(second.payment.id, { businessId }), 3000);
  assert.equal(api.getInvoice(source.id).balanceAmount, 0);
  assert.throws(() => api.createPaymentAllocation({
    paymentId: second.payment.id,
    documentType: "INVOICE",
    documentId: source.id,
    allocatedAmount: 1,
    idempotencyKey: "receipt-overpay-after-paid",
  }, { user, businessId }), /outstanding balance/i);
});

test("receipt accounting failure rolls back Payment and permits provider retry", () => {
  const { api, user, businessId } = setup();
  const customer = api.createCustomer({ ownerUserId: user.id, businessId, name: "Atomic Receipt Customer" });
  const badAccounts = {
    bank_clearing: { id: "wrong-business-bank" },
    customer_advances: { id: "wrong-business-advance" },
  };
  const receiptInput = {
    customerId: customer.id,
    businessId,
    amount: 12000,
    currency: "INR",
    provider: "razorpay",
    providerPaymentId: "atomic-provider-payment",
    providerOrderId: "atomic-provider-order",
    idempotencyKey: "atomic-receipt-key",
  };

  assert.throws(() => api.recordCustomerReceipt({ ...receiptInput, accounts: badAccounts }, { user, businessId }), /Ledger account does not belong/i);
  assert.equal(api.listPayments(user, { businessId }).some((payment) => payment.providerPaymentId === receiptInput.providerPaymentId), false);
  assert.equal(storeFinancialEvents(api, user, businessId).some((event) => event.sourceId === receiptInput.providerPaymentId && event.postingStatus === "posted"), false);

  const retry = api.recordCustomerReceipt(receiptInput, { user, businessId });
  assert.equal(retry.receiptAccounting.posted, true);
  assert.equal(api.listPayments(user, { businessId }).filter((payment) => payment.providerPaymentId === receiptInput.providerPaymentId).length, 1);
  assert.equal(api.getPaymentUnappliedAmount(retry.payment.id, { businessId }), 12000);
});

test("receipt accounting failure is atomic for manual and fully unapplied receipts", () => {
  const { api, user, businessId } = setup();
  const customer = api.createCustomer({ ownerUserId: user.id, businessId, name: "Manual Atomic Customer" });
  const badAccounts = {
    bank_clearing: { id: "wrong-business-bank" },
    customer_advances: { id: "wrong-business-advance" },
  };
  assert.throws(() => api.recordCustomerReceipt({
    customerId: customer.id,
    businessId,
    amount: 10000,
    currency: "INR",
    mode: "bank_transfer",
    reference: "UTR-ATOMIC-MANUAL",
    accounts: badAccounts,
  }, { user, businessId }), /Ledger account does not belong/i);
  assert.equal(api.listPayments(user, { businessId }).filter((payment) => payment.customerId === customer.id).length, 0);
  assert.equal(storeFinancialEvents(api, user, businessId).filter((event) => event.eventType === "customer_receipt_unapplied").length, 0);
});

test("receipt-first allocation accounting failure rolls back allocation and invoice effect", () => {
  const { api, user, businessId } = setup();
  const customer = api.createCustomer({ ownerUserId: user.id, businessId, name: "Atomic Allocation Customer" });
  const source = api.createInvoice({
    ownerUserId: user.id,
    businessId,
    customerId: customer.id,
    status: "created",
    invoiceNumber: "ATOMIC-ALLOCATION",
    currency: "INR",
    taxRate: 0,
    items: [{ description: "Atomic allocation", quantity: 1, rate: 10000 }],
  });
  const receipt = api.recordCustomerReceipt({ customerId: customer.id, businessId, amount: 10000, currency: "INR" }, { user, businessId });
  const badAccounts = {
    customer_advances: { id: "wrong-business-advance" },
    accounts_receivable: { id: "wrong-business-ar" },
  };
  assert.throws(() => api.createPaymentAllocation({
    paymentId: receipt.payment.id,
    documentType: "INVOICE",
    documentId: source.id,
    allocatedAmount: 10000,
    accounts: badAccounts,
  }, { user, businessId }), /Ledger account does not belong/i);
  assert.equal(api.listPaymentAllocations(user, { businessId, paymentId: receipt.payment.id, includeReversed: true }).length, 0);
  assert.equal(api.getInvoice(source.id).balanceAmount, 10000);
  assert.equal(api.getPaymentUnappliedAmount(receipt.payment.id, { businessId }), 10000);
  assert.equal(storeFinancialEvents(api, user, businessId).filter((event) => event.eventType === "customer_payment_allocated").length, 0);

  const retry = api.createPaymentAllocation({
    paymentId: receipt.payment.id,
    documentType: "INVOICE",
    documentId: source.id,
    allocatedAmount: 10000,
    idempotencyKey: "atomic-allocation-retry",
  }, { user, businessId });
  assert.equal(retry.accounting.posted, true);
  assert.equal(api.getInvoice(source.id).balanceAmount, 0);
  assert.equal(api.getPaymentUnappliedAmount(receipt.payment.id, { businessId }), 0);
});

function storeFinancialEvents(api, user, businessId) {
  return api.listAccountingEventLedger(user, { businessId }).financialEvents;
}

test("directly Invoice-bound Payment stays bound to the original Invoice", () => {
  const { api, user, businessId } = setup();
  const source = invoice(api, user, businessId, "BOUND-SOURCE", 10000);
  const other = invoice(api, user, businessId, "BOUND-OTHER", 10000);
  const payment = api.recordInvoicePayment(source.id, { businessId, amount: 4000, idempotencyKey: "bound-payment" }, { user, businessId }).payment;

  const sameDocument = api.createPaymentAllocation({ paymentId: payment.id, documentType: "INVOICE", documentId: source.id, allocatedAmount: 4000, idempotencyKey: "bound-allocation" }, { user, businessId });

  assert.equal(sameDocument.allocation.documentId, source.id);
  assert.equal(api.listPayments(user, { businessId }).filter((entry) => entry.id === payment.id).length, 1);
  assert.throws(() => api.createPaymentAllocation({ paymentId: payment.id, documentType: "INVOICE", documentId: other.id, allocatedAmount: 1, idempotencyKey: "bound-other" }, { user, businessId }), /original Invoice/i);
});

test("directly Vendor-Bill-bound Payment stays bound to the original Vendor Bill", () => {
  const { api, user, businessId } = setup();
  const vendor = api.createVendor({ name: "Allocation Vendor", businessId }, { user, businessId });
  const source = vendorBill(api, user, businessId, vendor.id, "VB-ALLOC-SOURCE", 10000);
  const target = vendorBill(api, user, businessId, vendor.id, "VB-ALLOC-TARGET", 10000);
  const wrongTypeTarget = invoice(api, user, businessId, "VB-WRONG-DIRECTION", 10000);
  const payment = api.recordVendorBillPayment(source.id, { businessId, amount: 4000, idempotencyKey: "vendor-bound-payment" }, { user, businessId }).payment;

  const sameDocument = api.createPaymentAllocation({ paymentId: payment.id, documentType: "VENDOR_BILL", documentId: source.id, allocatedAmount: 4000, idempotencyKey: "vendor-bound-allocation" }, { user, businessId });

  assert.equal(sameDocument.allocation.documentId, source.id);
  assert.throws(() => api.createPaymentAllocation({ paymentId: payment.id, documentType: "VENDOR_BILL", documentId: target.id, allocatedAmount: 1, idempotencyKey: "vendor-other" }, { user, businessId }), /original Vendor Bill/i);
  assert.throws(() => api.createPaymentAllocation({ paymentId: payment.id, documentType: "INVOICE", documentId: wrongTypeTarget.id, allocatedAmount: 1 }, { user, businessId }), /direction/i);
});

test("allocation idempotency rejects changed amount, Payment, document, and currency", () => {
  const { api, user, businessId } = setup();
  const source = invoice(api, user, businessId, "IDEMP-SOURCE", 10000);
  const otherSource = invoice(api, user, businessId, "IDEMP-OTHER-SOURCE", 10000);
  const target = invoice(api, user, businessId, "IDEMP-TARGET", 10000);
  const otherTarget = invoice(api, user, businessId, "IDEMP-OTHER-TARGET", 10000);
  const payment = api.recordInvoicePayment(source.id, { businessId, amount: 5000, idempotencyKey: "idemp-payment-a" }, { user, businessId }).payment;
  const otherPayment = api.recordInvoicePayment(otherSource.id, { businessId, amount: 5000, idempotencyKey: "idemp-payment-b" }, { user, businessId }).payment;
  const base = { paymentId: payment.id, documentType: "INVOICE", documentId: source.id, allocatedAmount: 1000, currency: "INR", idempotencyKey: "allocation-key" };

  api.createPaymentAllocation(base, { user, businessId });
  assert.throws(() => api.createPaymentAllocation({ ...base, allocatedAmount: 900 }, { user, businessId }), /different request/i);
  assert.throws(() => api.createPaymentAllocation({ ...base, paymentId: otherPayment.id }, { user, businessId }), /different request|original Invoice/i);
  assert.throws(() => api.createPaymentAllocation({ ...base, documentId: otherTarget.id }, { user, businessId }), /different request|original Invoice/i);
  assert.throws(() => api.createPaymentAllocation({ ...base, currency: "USD" }, { user, businessId }), /different request|currency/i);
});

test("allocation persistence reconstruction preserves records and next IDs", () => {
  let persisted = {};
  const persistenceAdapter = {
    load: () => structuredClone(persisted),
    save: (state) => { persisted = structuredClone(state); },
  };
  const firstStore = createStore({}, { persistenceAdapter });
  const firstApi = createApi({ store: firstStore });
  const user = firstApi.createUser({ name: "Reload Owner", email: `reload-${Date.now()}-${Math.random()}@example.com` });
  const businessId = firstApi.listBusinessWorkspaces(user)[0].businessId;
  const source = invoice(firstApi, user, businessId, "RELOAD-SOURCE", 10000);
  const payment = firstApi.recordInvoicePayment(source.id, { businessId, amount: 4000, idempotencyKey: "reload-payment" }, { user, businessId }).payment;
  const first = firstApi.createPaymentAllocation({ paymentId: payment.id, documentType: "INVOICE", documentId: source.id, allocatedAmount: 4000, idempotencyKey: "reload-allocation" }, { user, businessId });
  const reloadedApi = createApi({ store: createStore({}, { persistenceAdapter }) });
  const allocations = reloadedApi.listPaymentAllocations(user, { businessId, includeReversed: true });

  assert.equal(allocations[0].id, first.allocation.id);
  assert.equal(allocations[0].idempotencyKey, "reload-allocation");
  assert.equal(persisted.paymentAllocations.length, 1);
  assert.equal(persisted.counters.paymentAllocation, 1);
  assert.equal(STATE_COLLECTIONS.includes("paymentAllocations"), true);
  assert.equal(normalizeStateDocument({ paymentAllocations: [first.allocation] }).paymentAllocations.length, 1);
  assert.equal(deriveCounters({ paymentAllocations: [first.allocation] }).paymentAllocation, 1);
});

test("Payment Allocation rejects zero, negative, payment over-allocation, and document over-allocation", () => {
  const { api, user, businessId } = setup();
  const source = invoice(api, user, businessId, "GUARD-SOURCE", 10000);
  const payment = api.recordInvoicePayment(source.id, { businessId, amount: 5000, idempotencyKey: "guard-payment" }, { user, businessId }).payment;

  assert.throws(() => api.createPaymentAllocation({ paymentId: payment.id, documentType: "INVOICE", documentId: source.id, allocatedAmount: 0 }, { user, businessId }), /greater than zero/i);
  assert.throws(() => api.createPaymentAllocation({ paymentId: payment.id, documentType: "INVOICE", documentId: source.id, allocatedAmount: -1 }, { user, businessId }), /greater than zero/i);
  api.createPaymentAllocation({ paymentId: payment.id, documentType: "INVOICE", documentId: source.id, allocatedAmount: 4000, idempotencyKey: "guard-allocation" }, { user, businessId });
  assert.throws(() => api.createPaymentAllocation({ paymentId: payment.id, documentType: "INVOICE", documentId: source.id, allocatedAmount: 2000, idempotencyKey: "guard-payment-over" }, { user, businessId }), /available amount/i);
});

test("Payment Allocation rejects cross-business, nonexistent, and incompatible documents", () => {
  const first = setup();
  const secondUser = first.api.createUser({ name: "Other Owner", email: `allocation-other-${Date.now()}-${Math.random()}@example.com` });
  const secondBusinessId = first.api.listBusinessWorkspaces(secondUser)[0].businessId;
  const source = invoice(first.api, first.user, first.businessId, "SCOPE-SOURCE", 10000);
  const foreignInvoice = invoice(first.api, secondUser, secondBusinessId, "SCOPE-FOREIGN", 10000);
  const payment = first.api.recordInvoicePayment(source.id, { businessId: first.businessId, amount: 10000, idempotencyKey: "scope-payment" }, { user: first.user, businessId: first.businessId }).payment;

  assert.throws(() => first.api.createPaymentAllocation({ paymentId: payment.id, documentType: "INVOICE", documentId: foreignInvoice.id, allocatedAmount: 1 }, { user: first.user, businessId: first.businessId }), /business/i);
  assert.throws(() => first.api.createPaymentAllocation({ paymentId: "missing-payment", documentType: "INVOICE", documentId: source.id, allocatedAmount: 1 }, { user: first.user, businessId: first.businessId }), /Payment is required/i);
  assert.throws(() => first.api.createPaymentAllocation({ paymentId: payment.id, documentType: "VENDOR_BILL", documentId: "missing-bill", allocatedAmount: 1 }, { user: first.user, businessId: first.businessId }), /document was not found|direction/i);
});

test("Payment Allocation reversal is explicit and does not post accounting or touch Banking", () => {
  const { api, user, businessId } = setup();
  const source = invoice(api, user, businessId, "REVERSE-SOURCE", 20000);
  const payment = api.recordInvoicePayment(source.id, { businessId, amount: 10000, idempotencyKey: "reverse-payment" }, { user, businessId }).payment;
  const created = api.createPaymentAllocation({ paymentId: payment.id, documentType: "INVOICE", documentId: source.id, allocatedAmount: 5000, idempotencyKey: "reverse-allocation" }, { user, businessId });
  const before = api.listAccountingEventLedger(user, { businessId });
  const reversed = api.reversePaymentAllocation(created.allocation.id, {}, { user, businessId });
  const after = api.listAccountingEventLedger(user, { businessId });

  assert.equal(reversed.allocation.status, "reversed");
  assert.equal(after.financialEvents.length, before.financialEvents.length);
  assert.equal(after.journals.length, before.journals.length);
  assert.equal(api.listPaymentAllocations(user, { businessId, paymentId: payment.id }).length, 0);
  assert.equal(api.listPaymentAllocations(user, { businessId, paymentId: payment.id, includeReversed: true }).length, 1);
});

test("Payment reversal with an active allocation keeps allocation metadata without creating allocation capacity", () => {
  const { api, user, businessId } = setup();
  const source = invoice(api, user, businessId, "REVERSE-ACTIVE-SOURCE", 20000);
  const payment = api.recordInvoicePayment(source.id, { businessId, amount: 10000, idempotencyKey: "reverse-active-payment" }, { user, businessId }).payment;
  api.createPaymentAllocation({ paymentId: payment.id, documentType: "INVOICE", documentId: source.id, allocatedAmount: 5000, idempotencyKey: "reverse-active-allocation" }, { user, businessId });

  const before = api.listAccountingEventLedger(user, { businessId });
  const reversal = api.reverseCustomerPayment({ businessId, originalPaymentId: payment.id, idempotencyKey: "reverse-active-reversal" }, { user, businessId });
  const active = api.listPaymentAllocations(user, { businessId, paymentId: payment.id });
  const after = api.listAccountingEventLedger(user, { businessId });

  assert.equal(reversal.status, "posted");
  assert.equal(active.length, 1);
  assert.equal(after.financialEvents.length, before.financialEvents.length + 1);
  assert.throws(() => api.createPaymentAllocation({ paymentId: payment.id, documentType: "INVOICE", documentId: source.id, allocatedAmount: 1, idempotencyKey: "reverse-active-new" }, { user, businessId }), /available amount/i);
});
