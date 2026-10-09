import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const html = read("apps/web/invoice.html");
const dashboard = read("apps/web/dashboard.js");
const server = read("apps/api/src/server.js");

test("Invoice list links use the canonical deep-linkable detail view", () => {
  assert.match(dashboard, /invoice\.html\?invoice=\$\{encodeURIComponent\(invoice\.id \|\| ""\)\}&view=detail/);
  assert.match(dashboard, /invoice\.html\?invoice=\$\{encodeURIComponent\(invoiceId\)\}\$\{isDraft && canWriteRecords \? "" : "&view=detail"\}/);
  assert.match(html, /invoiceDetailPanel/);
});

test("Invoice detail reads existing authorities and renders server fields", () => {
  assert.match(html, /const invoiceDetailMode = params\.get\("view"\) === "detail"/);
  assert.match(html, /api\(`\/invoices\/\$\{encodeURIComponent\(invoiceIdFromUrl\)\}`\)/);
  assert.match(html, /detailScopedPath\("\/payments"\)/);
  assert.match(html, /detailScopedPath\(`\/payment-allocations\?documentType=INVOICE&documentId=/);
  assert.match(html, /detailScopedPath\(`\/payment-requests\?invoiceId=/);
  assert.match(html, /invoiceDetailOutstanding/);
  assert.match(html, /invoiceDetailCredits/);
  assert.match(html, /invoiceDetailItems/);
  assert.match(html, /allocation\.amount \?\? allocation\.allocatedAmount/);
  assert.match(html, /allocation\.currency \|\| invoice\.currency/);
});

test("Invoice detail actions remain existing lifecycle calls and do not create financial authority", () => {
  assert.match(html, /\/invoices\/\$\{encodeURIComponent\(invoice\.id\)\}\/finalize/);
  assert.match(html, /\/invoices\/\$\{encodeURIComponent\(invoice\.id\)\}\/archive/);
  assert.match(html, /\/invoices\/\$\{encodeURIComponent\(invoice\.id\)\}\/restore/);
  assert.doesNotMatch(html, /createPaymentAllocation|recordInvoicePayment|createPaymentRequest/);
  assert.match(server, /url\.pathname\.startsWith\("\/invoices\/"\) && req\.method === "GET"/);
  assert.match(server, /url\.pathname\.startsWith\("\/invoices\/"\) && url\.pathname\.endsWith\("\/finalize"\)/);
});

test("Invoice detail preserves legacy editor links and handles unavailable states", () => {
  assert.match(html, /editDraft\.href = `\/apps\/web\/invoice\.html\?invoice=/);
  assert.match(html, /Invoice unavailable/);
  assert.match(html, /Payment history is unavailable/);
  assert.match(html, /No line items were returned/);
});

test("Invoice detail distinguishes payment and Payment Request lifecycle states", () => {
  assert.match(html, /function paymentStateLabel\(payment\)/);
  assert.match(html, /Captured \/ verified/);
  assert.match(html, /Pending \/ in progress/);
  assert.match(html, /Failed \/ rejected/);
  assert.match(html, /function paymentRequestStateLabel\(request\)/);
  assert.match(html, /Completed \/ fulfilled/);
  assert.match(html, /Expired \/ cancelled/);
  assert.match(html, /Payment Request history is unavailable/);
});

test("Invoice detail propagates the established workspace context and fails closed", () => {
  assert.match(html, /api\("\/business\/workspaces"\)/);
  assert.match(html, /eazinvoice_business_workspace_owner/);
  assert.match(html, /workspaceOwnerUserId: selectedWorkspace\.ownerUserId/);
  assert.match(html, /Business workspace context is unavailable/);
  assert.match(html, /detailScopedPath\("\/payments"\)/);
  assert.match(html, /detailScopedPath\(`\/payment-allocations/);
  assert.match(html, /detailScopedPath\(`\/payment-requests/);
  assert.match(html, /if \(!selectedWorkspace\)/);
  assert.match(html, /selected Business workspace is no longer available/);
  assert.doesNotMatch(html, /storedOwner\)[\s\S]{0,500}availableWorkspaces\.find\(\(entry\) => entry\.source === "team"\)/);
});

test("Invoice detail distinguishes invalid stored selection from initial selection", () => {
  assert.match(html, /if \(storedOwner\) \{/);
  assert.match(html, /else \{/);
  assert.match(html, /workspace membership could not be verified/);
  assert.match(html, /Select an authorized Business workspace before opening this Invoice/);
});

test("Invoice detail discards delayed responses after workspace context changes", () => {
  assert.match(html, /const snapshot = detailContextSnapshot\(\);/);
  assert.match(html, /storedOwner: localStorage\.getItem\("eazinvoice_business_workspace_owner"\)/);
  assert.match(html, /const isCurrentLoad = \(\) => loadGeneration === detailLoadGeneration && isDetailContextCurrent\(snapshot\);/);
  assert.match(html, /const invoice = await api\(detailScopedPath\([\s\S]*?\)\);\s*if \(!isCurrentLoad\(\)\) return;/);
  assert.match(html, /\]\);\s*if \(!isCurrentLoad\(\)\) return;[\s\S]*?const statusValue/);
  assert.match(html, /window\.addEventListener\("storage", \(event\) =>/);
  assert.match(html, /invalidateDetailContext\("Business workspace selection changed/);
});

test("Invoice lifecycle actions require the captured context and ignore stale responses", () => {
  assert.match(html, /function detailActionContext\(snapshot, invoice, expectedStatus\)/);
  assert.match(html, /if \(!isDetailContextCurrent\(snapshot\) \|\| !invoice\?\.id \|\| invoice\.id !== invoiceIdFromUrl\) return false/);
  assert.match(html, /async function runDetailLifecycleAction\(button, snapshot, invoice, expectedStatus, route/);
  assert.match(html, /if \(!detailActionContext\(snapshot, invoice, expectedStatus\) \|\| button\.disabled\) return;/);
  assert.match(html, /await api\(detailScopedPath\(route\)/);
  assert.match(html, /if \(isDetailContextCurrent\(snapshot\)\) await loadInvoiceDetail\(\);/);
  assert.match(html, /if \(isDetailContextCurrent\(snapshot\)\) \{/);
  assert.match(html, /const button = detailActionButton\("Finalize Invoice", \(\) => runDetailLifecycleAction/);
});
