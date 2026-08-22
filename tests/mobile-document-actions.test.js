import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const mobileScript = readFileSync(new URL("../apps/mobile/app.js", import.meta.url), "utf8");
const mobileMarkup = readFileSync(new URL("../apps/mobile/index.html", import.meta.url), "utf8");
const pluginSource = readFileSync(
  new URL("../plugins/eazinvoice-billing-workspace-msmes/src/index.php", import.meta.url),
  "utf8"
);

test("mobile document workflows use the SaaS API instead of local accounting", () => {
  assert.match(mobileScript, /createInvoice\(body\)/);
  assert.match(mobileScript, /recordInvoicePayment\(invoiceId, body\)/);
  assert.match(mobileScript, /createPurchaseOrder\(body\)/);
  assert.match(mobileScript, /createVendorBill\(body\)/);
  assert.match(mobileScript, /idempotencyKey\("invoice"\)/);
  assert.doesNotMatch(mobileScript, /function calculateRecord/);
  assert.match(mobileMarkup, /id="workspaceSelect"/);
  assert.match(mobileMarkup, /data-route="sales"/);
});

test("mobile document sharing is presentation-only and backend-authoritative", () => {
  assert.match(mobileScript, /function shareDocument/);
  assert.match(mobileScript, /navigator\.share/);
  assert.match(mobileScript, /state\.data\.purchaseOrders/);
  assert.match(mobileScript, /state\.data\.invoices/);
  assert.doesNotMatch(mobileScript, /function createDocumentPdf/);
  assert.match(mobileScript, /server PDF retrieval should be added if backend exposes canonical PDFs|Android share sheet is unavailable/);
});

test("WordPress saved records expose view, PDF, and paid email actions", () => {
  assert.match(pluginSource, /handle_print_document/);
  assert.match(pluginSource, /handle_email_document/);
  assert.match(pluginSource, /plan_at_least\( 'standard' \)/);
  assert.match(pluginSource, /Email: Standard\+/);
});
