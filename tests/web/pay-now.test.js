import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const html = fs.readFileSync(new URL("../../apps/web/pay-now.html", import.meta.url), "utf8");
const script = fs.readFileSync(new URL("../../apps/web/pay-now.js", import.meta.url), "utf8");

test("Pay Now page is public, token-based, and uses the public backend authority", () => {
  assert.match(html, /pay-now\.js/);
  assert.match(html, /id="payNowButton"/);
  assert.match(script, /getPublicPaymentRequest/);
  assert.match(script, /preparePublicPaymentRequest/);
  assert.match(script, /new URLSearchParams\(window\.location\.search\)/);
  assert.doesNotMatch(script, /Authorization|eazinvoice_token/);
});

test("Pay Now browser flow never completes financial state from callback data", () => {
  assert.match(script, /Payment returned from checkout\. Verification is pending/);
  assert.match(script, /beginStatusPolling/);
  assert.doesNotMatch(script, /completePaymentRequest|recordInvoicePayment|createPaymentAllocation|completeVerifiedProviderPaymentAtomic/);
  assert.match(script, /amount: Math\.round\(Number\(intent\.amount/);
  assert.match(script, /currency: intent\.currency/);
  assert.match(script, /order_id: intent\.providerOrderId/);
});

test("Pay Now page renders backend lifecycle and payment eligibility without recalculating balance", () => {
  assert.match(script, /projection\.paymentAllowed/);
  assert.match(script, /projection\.paymentBlockReason/);
  assert.doesNotMatch(script, /invoice\.total.*paid|balanceAmount|paidAmount/);
  assert.match(html, /Pay Now/);
  assert.match(script, /payment link is no longer available/i);
});
