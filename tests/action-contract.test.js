import assert from "node:assert/strict";
import test from "node:test";
import {
  ACTION_STATUS,
  HANDOFF_POLICIES,
  IDEMPOTENCY_POLICIES,
  RETRY_POLICIES,
  describeActionContract,
  getActionContract,
  listActionContracts,
} from "../apps/api/src/action-contract.js";

test("semantic action IDs are unique and catalog entries are deterministic", () => {
  const actions = listActionContracts();
  assert.equal(new Set(actions.map((action) => action.actionId)).size, actions.length);
  assert.deepEqual(listActionContracts(), listActionContracts());
  assert.equal(getActionContract("missing.action"), null);
});

test("Vendor Create is terminal vendor work with no automatic financial handoff", () => {
  const action = describeActionContract("vendor.create");
  assert.equal(action.intent, "Create vendor master data");
  assert.equal(action.authority, "vendor/business authority");
  assert.equal(action.terminal, true);
  assert.equal(action.successDestination, "vendor.list-or-detail");
  assert.equal(action.handoffPolicy, HANDOFF_POLICIES.NONE);
  assert.equal(action.idempotencyPolicy, IDEMPOTENCY_POLICIES.NONE);
  assert.doesNotMatch(JSON.stringify(action), /invoice|purchaseOrder|expense\.detail/i);
});

test("Customer Create is terminal customer work with no automatic invoice handoff", () => {
  const action = describeActionContract("customer.create");
  assert.equal(action.terminal, true);
  assert.equal(action.successDestination, "customer.list-or-detail");
  assert.equal(action.handoffPolicy, HANDOFF_POLICIES.NONE);
  assert.doesNotMatch(JSON.stringify(action), /invoice\.detail/i);
});

test("invoice draft, finalize and purchase issue remain distinct lifecycle actions", () => {
  const draft = describeActionContract("invoice.create-draft");
  const update = describeActionContract("invoice.update-draft");
  const finalize = describeActionContract("invoice.finalize");
  const issue = describeActionContract("purchase-order.issue");
  assert.equal(draft.lifecycleTransition, "absent -> draft");
  assert.equal(update.lifecycleTransition, "draft -> draft");
  assert.equal(finalize.lifecycleTransition, "draft -> issued");
  assert.equal(issue.lifecycleTransition, "draft -> issued");
  assert.notEqual(draft.actionId, finalize.actionId);
  assert.equal(finalize.idempotencyPolicy, IDEMPOTENCY_POLICIES.RESOURCE_KEY);
  assert.equal(issue.idempotencyPolicy, IDEMPOTENCY_POLICIES.RESOURCE_KEY);
});

test("payment and KYC actions reference existing authorities and business scope", () => {
  const payment = describeActionContract("invoice.payment");
  const kyc = describeActionContract("kyc.document-upload");
  assert.match(payment.authority, /payment and accounting/i);
  assert.equal(payment.idempotencyPolicy, IDEMPOTENCY_POLICIES.NONE);
  assert.equal(payment.retryPolicy, RETRY_POLICIES.UNSAFE);
  assert.match(payment.retryBasis, /does not currently propagate/i);
  assert.match(kyc.authority, /DocumentService/i);
  assert.equal(payment.businessScopeRequirement, "required");
  assert.equal(kyc.businessScopeRequirement, "required");
});

test("Expense is implemented while Quotation remains unavailable", () => {
  const expense = describeActionContract("expense.create");
  assert.equal(expense.status, ACTION_STATUS.IMPLEMENTED);
  assert.deepEqual(expense.entryPoints, ["POST /expenses"]);
  assert.equal(expense.idempotencyPolicy, IDEMPOTENCY_POLICIES.ACCOUNTING_EVENT_KEY);
  assert.equal(expense.sideEffectClass, "financial-event");
  for (const actionId of ["quotation.create"]) {
    const action = describeActionContract(actionId);
    assert.equal(action.status, ACTION_STATUS.PLANNED);
    assert.deepEqual(action.entryPoints, []);
    assert.equal(action.sideEffectClass, "planned");
    assert.equal(action.failureOutcome[0], "unavailable");
  }
  const vendorBill = describeActionContract("vendor-bill.create");
  assert.equal(vendorBill.status, ACTION_STATUS.IMPLEMENTED);
  assert.deepEqual(vendorBill.entryPoints, ["POST /vendor-bills"]);
  assert.equal(vendorBill.surfaceStatus, "dedicated target surface pending");
  assert.equal(vendorBill.failureOutcome.includes("unavailable"), false);
  assert.equal(listActionContracts({ includePlanned: false }).some((action) => action.actionId === "expense.create"), true);
});

test("archive and restore preserve business status while changing archive metadata", () => {
  for (const actionId of ["invoice.archive", "invoice.restore"]) {
    const action = describeActionContract(actionId);
    assert.equal(action.lifecycleTransition, "business status preserved");
    assert.match(action.resourceMetadataEffect, /preserving invoice business status/i);
    assert.equal(action.idempotencyPolicy, IDEMPOTENCY_POLICIES.NONE);
    assert.equal(action.retryPolicy, RETRY_POLICIES.IDEMPOTENT);
  }
});

test("action contracts use semantic destinations and preserve retry distinctions", () => {
  const invoice = describeActionContract("invoice.finalize");
  const vendor = describeActionContract("vendor.create");
  assert.equal(invoice.diagnostics.uiRoute, false);
  assert.equal(invoice.retryPolicy, RETRY_POLICIES.IDEMPOTENT);
  assert.equal(invoice.idempotencyPolicy, IDEMPOTENCY_POLICIES.RESOURCE_KEY);
  assert.equal(vendor.retryPolicy, RETRY_POLICIES.UNSAFE);
  assert.equal(invoice.diagnostics.businessScopeRequired, true);
});

test("catalog import and description are side-effect-free and secret-safe", () => {
  const serialized = JSON.stringify(listActionContracts());
  assert.doesNotMatch(serialized, /DATABASE_URL|password|token|secret|Aadhaar/i);
  assert.equal(describeActionContract("vendor.create").diagnostics.automaticHandoff, false);
});
