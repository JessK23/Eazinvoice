import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const html = read("apps/web/invoice.html");
const dashboard = read("apps/web/dashboard.js");
const server = read("apps/api/src/server.js");
const reportPath = "docs/eazinvoice-remediation-blueprint/167-phase-3d9-po-wo-detail-lifecycle-implementation.md";

test("PO and WO dashboard links use the typed detail route without breaking draft editing", () => {
  assert.match(dashboard, /type=\$\{docType\.toLowerCase\(\)\}&po=\$\{encodeURIComponent\(poId\)\}\$\{isDraft && canWriteRecords \? "" : "&view=detail"\}/);
  assert.match(dashboard, /const docType = String\(po\.documentType \|\| "po"\)\.toLowerCase\(\) === "wo" \? "WO" : "PO"/);
  assert.match(html, /if \(!poIdFromUrl \|\| invoiceDetailMode\) return;/);
});

test("PO and WO detail uses the existing purchase-order authority and validates document type", () => {
  assert.match(html, /const requestedPurchaseDocumentType = workflowType === "wo" \? "wo" : "po"/);
  assert.match(html, /if \(!invoiceIdFromUrl && !\(isPoFlow && invoiceDetailMode\)\) return;/);
  assert.match(html, /api\(detailScopedPath\(`\/purchase-orders\/\$\{encodeURIComponent\(poIdFromUrl\)\}`\)\)/);
  assert.match(html, /const actualType = persistedPurchaseDocumentType\(documentRecord\);/);
  assert.match(html, /if \(actualType !== requestedPurchaseDocumentType\) throw new Error/);
  assert.match(server, /url\.pathname\.startsWith\("\/purchase-orders\/"\) && req\.method === "GET"/);
});

test("PO and WO detail renders authoritative document fields safely", () => {
  for (const field of ["purchaseOrderDetailVendor", "purchaseOrderDetailDate", "purchaseOrderDetailDueDate", "purchaseOrderDetailSubtotal", "purchaseOrderDetailTax", "purchaseOrderDetailTotal", "purchaseOrderDetailItems", "purchaseOrderDetailNotes"]) {
    assert.match(html, new RegExp(field));
  }
  assert.match(html, /escapeHtml\(item\.description \|\| "Item"\)/);
  assert.match(html, /escapeHtml\(note\)/);
  assert.match(html, /fallbackSavedInvoice = documentRecord/);
});

test("PO and WO lifecycle actions remain within supported authority", () => {
  assert.match(html, /\/purchase-orders\/\$\{encodeURIComponent\(documentRecord\.id\)\}\/issue/);
  assert.match(html, /method: "DELETE"/);
  assert.match(html, /\/purchase-orders\/\$\{encodeURIComponent\(documentRecord\.id\)\}\/pdf/);
  assert.match(html, /No payment or payable action is available/);
  assert.match(html, /payment and settlement are unavailable/);
  assert.doesNotMatch(html, /purchase-orders\/[^"`]*\/(?:archive|restore|cancel|void|payment|settlement)/i);
});

test("PO issue preserves validated workspace context and idempotency", () => {
  assert.match(html, /workspaceOwnerUserId: snapshot\.workspaceOwnerUserId/);
  assert.match(html, /businessId: snapshot\.businessId/);
  assert.match(html, /idempotencyKey: `detail-issue-\$\{documentRecord\.id\}`/);
  assert.match(html, /runPurchaseDocumentLifecycleAction\(issueButton, snapshot, documentRecord, "draft"/);
  assert.match(html, /issueBody\)/);
  assert.match(html, /recordId: invoiceIdFromUrl \|\| poIdFromUrl/);
});

test("all PO and WO lifecycle actions require the exact persisted document type", () => {
  assert.match(html, /function isPurchaseDocumentTypeCurrent\(documentRecord\)/);
  assert.match(html, /persistedPurchaseDocumentType\(documentRecord\) === requestedPurchaseDocumentType/);
  assert.match(html, /!isPurchaseDocumentTypeCurrent\(documentRecord\)/);
  assert.match(html, /isPoFlow && invoiceDetailMode && \(!persistedTypeLabel \|\| !isPurchaseDocumentTypeCurrent\(documentRecord\)\)/);
  assert.match(html, /async function deletePurchaseDocumentDetail/);
  assert.match(html, /async function printPurchaseDocumentDetail/);
  assert.match(html, /function purchaseDocumentActionContext/);
});

test("email modal identity is derived from validated persisted PO/WO type", () => {
  const helperStart = html.indexOf("      function persistedPurchaseDocumentType(record) {");
  const helperEnd = html.indexOf("      function applyWorkflowMode()", helperStart);
  const helperSource = helperStart >= 0 && helperEnd > helperStart ? html.slice(helperStart, helperEnd) : "";
  assert.ok(helperSource, "persisted document type helpers exist");
  const helpers = vm.runInNewContext(`${helperSource}; ({ persistedPurchaseDocumentType, persistedPurchaseDocumentTypeLabel })`);
  const { persistedPurchaseDocumentType, persistedPurchaseDocumentTypeLabel } = helpers;
  assert.equal(persistedPurchaseDocumentType({ documentType: "po" }), "po");
  assert.equal(persistedPurchaseDocumentType({ documentType: "wo" }), "wo");
  for (const record of [{}, { documentType: null }, { documentType: "" }, { documentType: "PO" }, { documentType: "wo " }, { documentType: "invoice" }]) {
    assert.equal(persistedPurchaseDocumentType(record), "");
  }
  assert.equal(persistedPurchaseDocumentTypeLabel({ documentType: "wo" }), "Work Order");
  assert.equal(persistedPurchaseDocumentTypeLabel({ documentType: "po" }), "Purchase Order");
  assert.equal(persistedPurchaseDocumentTypeLabel({ documentType: "" }), "");
  assert.match(html, /const persistedTypeLabel = isPoFlow \? persistedPurchaseDocumentTypeLabel\(documentRecord\) : ""/);
  assert.match(html, /if \(isPoFlow && invoiceDetailMode && \(!persistedTypeLabel \|\| !isPurchaseDocumentTypeCurrent\(documentRecord\)\)\)/);
  assert.match(html, /documentEmailTitle\.textContent = isPoFlow \? `Email \$\{emailDocumentLabel\}`/);
});

test("detail loader requires explicit persisted type before rendering or enabling actions", () => {
  assert.match(html, /const actualType = persistedPurchaseDocumentType\(documentRecord\);/);
  assert.match(html, /if \(!actualType\) throw new Error\("This document type could not be verified/);
  assert.match(html, /fallbackSavedInvoice = null;/);
  assert.match(html, /body\.hidden = true;/);
  assert.match(html, /if \(actions\) actions\.innerHTML = "";/);
  assert.match(html, /if \(actualType !== requestedPurchaseDocumentType\) throw new Error/);
});

test("delete action reuses strict persisted type authority", () => {
  assert.match(html, /!isPurchaseDocumentTypeCurrent\(documentRecord\)/);
  assert.match(html, /documentRecord\?\.id !== poIdFromUrl/);
  assert.doesNotMatch(html, /String\(documentRecord\.documentType \|\| "po"\)\.toLowerCase\(\) !== requestedPurchaseDocumentType/);
  assert.match(html, /if \(!isPurchaseDocumentContextCurrent\(snapshot\) \|\| !isPurchaseDocumentTypeCurrent\(documentRecord\)/);
});

test("PO and WO detail rejects stale asynchronous context and fails closed", () => {
  assert.match(html, /const snapshot = purchaseDocumentSnapshot\(\);/);
  assert.match(html, /const isCurrentLoad = \(\) => loadGeneration === detailLoadGeneration && isPurchaseDocumentContextCurrent\(snapshot\);/);
  assert.match(html, /if \(!isCurrentLoad\(\)\) return;/);
  assert.match(html, /if \(!isPurchaseDocumentContextCurrent\(snapshot\)/);
  assert.match(html, /Business workspace context is unavailable/);
  assert.match(html, /Document unavailable/);
});

test("Phase 3D.9 implementation report is part of the candidate boundary", () => {
  const report = read(reportPath);
  assert.match(report, /3D-WEB-02B/);
  assert.match(report, /does not add or imply payment/i);
});
