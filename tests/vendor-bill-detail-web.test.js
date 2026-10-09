import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { apiClient, ApiRequestError } from "../apps/api/src/client.js";

const html = fs.readFileSync("apps/web/vendor-bill.html", "utf8");
const js = fs.readFileSync("apps/web/vendor-bill.js", "utf8");
const dashboard = fs.readFileSync("apps/web/dashboard.js", "utf8");

test("Vendor Bill list exposes a dedicated detail route", () => {
  assert.match(dashboard, /vendor-bill\.html\?bill=/);
  assert.match(html, /vendorBillDetailPanel/);
});
test("detail uses the existing backend Vendor Bill and workspace authorities", () => {
  assert.match(js, /listBusinessWorkspaces\(token\)/);
  assert.match(js, /getVendorBill\(token, billId, workspaceSnapshot\)/);
  assert.match(js, /listPayments\(token, workspaceSnapshot\)/);
  assert.match(js, /recordVendorBillPayment\(token, billId/);
  assert.match(js, /workspaceOwnerUserId/);
  assert.match(js, /businessId/);
});
test("missing or stale workspace and cross-business responses fail closed", () => {
  assert.match(js, /selected workspace is unavailable/);
  assert.match(js, /Workspace context changed/);
  assert.match(js, /bill\.businessId !== workspaceSnapshot\.businessId/);
  assert.doesNotMatch(js, /dashboardBusinessWorkspaces\[0\]/);
});
test("detail exposes payable fields, payment state, explicit sources, and supported lifecycle", () => {
  for (const id of ["vendorBillDetailOutstanding", "vendorBillDetailPaid", "vendorBillDetailPaymentStatus", "vendorBillDetailItems", "vendorBillDetailPayments", "vendorBillSourceSection"]) assert.match(html, new RegExp(id));
  assert.match(js, /explicitSource/);
  assert.match(js, /\["deleted", "cancelled", "void"\]/);
  assert.match(js, /state === "draft"/); // backend remains the lifecycle authority; draft payment is not enabled here.
});
test("payment action is bounded by current payable balance and remains idempotent", () => {
  assert.match(js, /amount > Number\(loadedBill\.balanceAmount/);
  assert.match(js, /createPaymentAttemptKey/);
  assert.match(js, /paymentAttemptKey/);
  assert.doesNotMatch(js, /idempotencyKey: `vendor-bill-\$\{billId\}/);
  assert.match(js, /form\.querySelector\("button"\)\.disabled = true/);
});
test("payment history is identifier-scoped and distinguishes unavailable from empty", () => {
  assert.match(js, /payment\.vendorBillId === billId/);
  assert.match(js, /payment\.businessId === workspaceSnapshot\.businessId/);
  assert.match(js, /Payment history is unavailable/);
  assert.match(js, /No payments recorded/);
});
test("payment attempt releases only on explicit backend not_recorded evidence", () => {
  assert.match(js, /error\?\.payload\?\.paymentOutcome === "not_recorded"/);
  assert.match(js, /delete form\.dataset\.paymentAttemptKey/);
  assert.match(js, /Payment outcome is unknown/);
  assert.doesNotMatch(js, /status === 4\d\d/);
});
test("page has no browser-side accounting or unsupported PO/WO actions", () => {
  assert.doesNotMatch(js, /createJournal|postJournal|createAllocation|recordPurchaseOrderPayment/);
  assert.doesNotMatch(js, /archive|restore|cancelVendorBill/);
});

test("shared API errors preserve response metadata without classifying rejection", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ error: "Payment request failed" }), {
    status: 422,
    headers: { "Content-Type": "application/json" },
  });
  let error;
  try {
    await apiClient.getVendorBill("token", "bill-1");
  } catch (caught) {
    error = caught;
  } finally {
    globalThis.fetch = originalFetch;
  }
  assert.ok(error instanceof ApiRequestError);
  assert.equal(error.name, "ApiRequestError");
  assert.equal(error.status, 422);
  assert.deepEqual(error.payload, { error: "Payment request failed" });
  assert.equal(error.path, "/vendor-bills/bill-1");
  assert.equal(error.paymentRecorded, undefined);
});
