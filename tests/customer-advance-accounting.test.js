import assert from "node:assert/strict";
import test from "node:test";
import { postCustomerPaymentAllocation } from "../apps/api/src/accounting-service.js";
import { createApi } from "../apps/api/src/index.js";
import { createStore } from "../apps/api/src/store.js";

function setupReceiptState() {
  const sourceStore = createStore({}, { persist: false, useSupabaseEmailOtp: false });
  const api = createApi({ store: sourceStore });
  const user = api.createUser({ name: "Receipt Owner", email: `receipt-${Date.now()}-${Math.random()}@example.com` });
  const businessId = api.listBusinessWorkspaces(user)[0].businessId;
  const customer = api.createCustomer({ ownerUserId: user.id, businessId, name: "Receipt Customer" });
  const otherCustomer = api.createCustomer({ ownerUserId: user.id, businessId, name: "Other Receipt Customer" });
  const invoice = api.createInvoice({
    ownerUserId: user.id,
    businessId,
    customerId: customer.id,
    status: "created",
    invoiceNumber: "ADV-1001",
    currency: "INR",
    taxRate: 0,
    items: [{ description: "Advance test", quantity: 1, rate: 10000 }],
  });
  const otherInvoice = api.createInvoice({
    ownerUserId: user.id,
    businessId,
    customerId: otherCustomer.id,
    status: "created",
    invoiceNumber: "ADV-1002",
    currency: "INR",
    taxRate: 0,
    items: [{ description: "Capacity test", quantity: 1, rate: 20000 }],
  });
  const state = sourceStore.exportState();
  const payment = {
    id: "pay_receipt_0001",
    ownerUserId: user.id,
    businessId,
    invoiceId: "",
    vendorBillId: "",
    customerId: customer.id,
    amount: 12000,
    currency: "INR",
    status: "captured",
    mode: "bank_transfer",
    reference: "UTR-ADV-1001",
    createdAt: "2026-10-04T00:00:00.000Z",
  };
  const allocation = {
    id: "palloc_receipt_0001",
    ownerUserId: user.id,
    businessId,
    paymentId: payment.id,
    documentType: "INVOICE",
    documentId: invoice.id,
    allocatedAmount: 10000,
    currency: "INR",
    status: "active",
    createdAt: "2026-10-04T00:01:00.000Z",
  };
  state.payments.push(payment);
  state.paymentAllocations.push(allocation);
  state.creditNotes.push({
    id: "cn_receipt_0001",
    ownerUserId: user.id,
    businessId,
    customerId: customer.id,
    sourceInvoiceId: invoice.id,
    total: 10000,
    currency: "INR",
    status: "issued",
  });
  state.counters.payment += 1;
  state.counters.paymentAllocation += 1;
  return { store: createStore(state, { persist: false, useSupabaseEmailOtp: false }), businessId, customer, otherCustomer, payment, allocation, invoice, otherInvoice };
}

test("receipt-first Customer Advance postings are balanced, owned, and idempotent", () => {
  const { store, businessId, payment, allocation, invoice } = setupReceiptState();

  const receipt = store.postCustomerReceiptAccounting(payment.id, { businessId });
  assert.equal(receipt.posted, true);
  const allocationPosting = store.postCustomerPaymentAllocationAccounting(allocation.id, { businessId });
  assert.equal(allocationPosting.posted, true);

  const state = store.exportState();
  const accounts = Object.fromEntries(state.ledgerAccounts.filter((account) => account.businessId === businessId).map((account) => [account.accountRole, account]));
  assert.equal(accounts.customer_advances.accountCode, "2110");
  assert.equal(accounts.customer_advances.accountType, "liability");

  const receiptJournal = state.accountingJournals.find((journal) => journal.financialEventId === receipt.event.id);
  const allocationJournal = state.accountingJournals.find((journal) => journal.financialEventId === allocationPosting.event.id);
  assert.deepEqual(state.accountingJournalLines.filter((line) => line.journalId === receiptJournal.id).map((line) => [line.accountCode, line.debit, line.credit]), [
    ["1110", 12000, 0],
    ["2110", 0, 12000],
  ]);
  assert.deepEqual(state.accountingJournalLines.filter((line) => line.journalId === allocationJournal.id).map((line) => [line.accountCode, line.debit, line.credit]), [
    ["2110", 10000, 0],
    ["1100", 0, 10000],
  ]);
  assert.equal(store.getPaymentUnappliedAmount(payment.id, { businessId }), 2000);
  assert.equal(invoice.customerId, payment.customerId);

  const receiptReplay = store.postCustomerReceiptAccounting(payment.id, { businessId });
  const allocationReplay = store.postCustomerPaymentAllocationAccounting(allocation.id, { businessId });
  assert.equal(receiptReplay.replay, true);
  assert.equal(allocationReplay.replay, true);
  assert.equal(store.exportState().accountingJournals.filter((journal) => journal.sourceId === payment.id || journal.sourceId === allocation.id).length, 2);
});

test("receipt-first accounting rejects missing or cross-business customer ownership", () => {
  const { store, payment, allocation, businessId } = setupReceiptState();
  assert.throws(() => store.postCustomerPaymentAllocationAccounting(allocation.id, { businessId }), /Receipt-first Customer Advance authority/i);
  const state = store.exportState();
  state.payments[0].customerId = "missing-customer";
  const invalidStore = createStore(state, { persist: false, useSupabaseEmailOtp: false });
  assert.throws(() => invalidStore.postCustomerReceiptAccounting(payment.id, { businessId }), /customer does not belong/i);
  assert.equal(invalidStore.exportState().accountingJournals.filter((journal) => journal.sourceId === payment.id).length, 0);
});

test("allocation reversal restores Customer Advance and is idempotent", () => {
  const { store, payment, allocation, businessId } = setupReceiptState();
  store.postCustomerReceiptAccounting(payment.id, { businessId });
  store.postCustomerPaymentAllocationAccounting(allocation.id, { businessId });

  const first = store.reversePaymentAllocation(allocation.id, { businessId });
  const second = store.reversePaymentAllocation(allocation.id, { businessId });
  const state = store.exportState();
  const reversalJournal = state.accountingJournals.find((journal) => journal.sourceId === allocation.id && journal.sourceType === "payment_allocation_reversal");
  const lines = state.accountingJournalLines.filter((line) => line.journalId === reversalJournal.id);

  assert.equal(first.allocation.status, "reversed");
  assert.equal(second.idempotentReplay, true);
  assert.equal(store.getPaymentUnappliedAmount(payment.id, { businessId }), 12000);
  assert.deepEqual(lines.map((line) => [line.accountCode, line.debit, line.credit]), [["1100", 10000, 0], ["2110", 0, 10000]]);
  assert.equal(state.accountingJournals.filter((journal) => journal.sourceType === "payment_allocation_reversal").length, 1);
});

test("receipt refunds reduce Customer Advance and refunded money cannot be reallocated", () => {
  const { store, payment, allocation, invoice, otherInvoice, customer, businessId } = setupReceiptState();
  store.postCustomerReceiptAccounting(payment.id, { businessId });
  store.postCustomerPaymentAllocationAccounting(allocation.id, { businessId });
  store.reversePaymentAllocation(allocation.id, { businessId });

  const refund = store.createCustomerRefund({
    businessId,
    sourceCreditNoteId: "cn_receipt_0001",
    sourcePaymentId: payment.id,
    customerId: customer.id,
    amount: 2000,
    currency: "INR",
    idempotencyKey: "receipt-refund-1",
  });
  const replay = store.createCustomerRefund({
    businessId,
    sourceCreditNoteId: "cn_receipt_0001",
    sourcePaymentId: payment.id,
    customerId: customer.id,
    amount: 2000,
    currency: "INR",
    idempotencyKey: "receipt-refund-1",
  });
  const state = store.exportState();
  const refundJournal = state.accountingJournals.find((journal) => journal.sourceId === refund.id && journal.sourceType === "payment_allocation" /* impossible sentinel */);
  const receiptRefundEvent = state.financialEvents.find((event) => event.sourceId === refund.id && event.eventType === "customer_receipt_refunded");
  const receiptRefundJournal = state.accountingJournals.find((journal) => journal.financialEventId === receiptRefundEvent.id);
  const refundLines = state.accountingJournalLines.filter((line) => line.journalId === receiptRefundJournal.id);

  assert.equal(refund.id, replay.id);
  assert.throws(() => store.createCustomerRefund({
    businessId,
    sourceCreditNoteId: "cn_receipt_0001",
    sourcePaymentId: payment.id,
    customerId: customer.id,
    amount: 1000,
    currency: "INR",
    idempotencyKey: "receipt-refund-1",
  }), /different request/i);
  assert.equal(store.getPaymentUnappliedAmount(payment.id, { businessId }), 10000);
  assert.deepEqual(refundLines.map((line) => [line.accountCode, line.debit, line.credit]), [["2110", 2000, 0], ["1110", 0, 2000]]);
  assert.equal(refundJournal, undefined);
  assert.throws(() => store.createPaymentAllocation({ paymentId: payment.id, documentType: "INVOICE", documentId: otherInvoice.id, allocatedAmount: 10001, currency: "INR", businessId }, { businessId }), /available amount|outstanding balance|customer does not match/i);
  assert.equal(invoice.customerId, customer.id);
});

test("direct Accounting allocation boundary rejects cross-customer lineage", () => {
  const { store, payment, allocation, otherCustomer, otherInvoice, businessId } = setupReceiptState();
  store.postCustomerReceiptAccounting(payment.id, { businessId });
  const state = store.exportState();
  const mismatchedAllocation = { ...allocation, id: "palloc_cross_customer", documentId: otherInvoice.id };
  state.paymentAllocations = state.paymentAllocations.filter((entry) => entry.id !== allocation.id);
  state.paymentAllocations.push(mismatchedAllocation);
  const directStore = createStore(state, { persist: false, useSupabaseEmailOtp: false });
  const before = directStore.exportState();
  assert.equal(otherCustomer.id, otherInvoice.customerId);
  const directState = directStore.exportState();
  const paymentRecord = directState.payments.find((entry) => entry.id === payment.id);
  const otherInvoiceRecord = directState.invoices.find((entry) => entry.id === otherInvoice.id);
  const business = directState.businesses.find((entry) => entry.id === businessId);
  assert.throws(() => postCustomerPaymentAllocation(directState, mismatchedAllocation, paymentRecord, otherInvoiceRecord, business), /customer does not match/i);
  const after = directStore.exportState();
  assert.equal(after.financialEvents.length, before.financialEvents.length);
  assert.equal(after.accountingJournals.length, before.accountingJournals.length);
  assert.equal(directStore.getPaymentUnappliedAmount(payment.id, { businessId }), 2000);
});

test("receipt reversal reduces Customer Advance without going negative", () => {
  const { store, payment, allocation, businessId } = setupReceiptState();
  store.postCustomerReceiptAccounting(payment.id, { businessId });
  store.postCustomerPaymentAllocationAccounting(allocation.id, { businessId });
  store.reversePaymentAllocation(allocation.id, { businessId });
  store.createCustomerPaymentReversal({ originalPaymentId: payment.id, businessId, amount: 10000, idempotencyKey: "receipt-reversal-1" });
  const replay = store.createCustomerPaymentReversal({ originalPaymentId: payment.id, businessId, amount: 10000, idempotencyKey: "receipt-reversal-1" });
  assert.throws(() => store.createCustomerPaymentReversal({ originalPaymentId: payment.id, businessId, amount: 9000, idempotencyKey: "receipt-reversal-1" }), /different request/i);
  const state = store.exportState();
  const event = state.financialEvents.find((entry) => entry.eventType === "customer_receipt_reversed");
  const journal = state.accountingJournals.find((entry) => entry.financialEventId === event.id);
  assert.equal(replay.id, state.paymentReversals.find((entry) => entry.id === replay.id)?.id);
  assert.equal(store.getPaymentUnappliedAmount(payment.id, { businessId }), 2000);
  assert.equal(state.accountingJournalLines.filter((line) => line.journalId === journal.id).reduce((sum, line) => sum + line.debit - line.credit, 0), 0);
});
