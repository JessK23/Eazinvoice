import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { normalizeActionError } from "../apps/web/action-error-modal.js";

test("reusable action error modal normalizes plan-limit failures into plain language", () => {
  const normalized = normalizeActionError(new Error("business profiles exceeds Free plan limit"));
  assert.equal(normalized.title, "Free Plan Limit Reached");
  assert.match(normalized.message, /does not allow additional business profiles/i);
  assert.equal(normalized.retryable, false);
});

test("reusable action error modal returns safe fallback for technical unknown failures", () => {
  const normalized = normalizeActionError(new Error("SQLSTATE failed at /var/data/users with token=abc123"));
  assert.equal(normalized.title, "Something Went Wrong");
  assert.equal(normalized.message, "EazInvoice couldn't complete this action.");
  assert.doesNotMatch(`${normalized.detail}`.toLowerCase(), /sqlstate|\/var\/|token=/);
});

test("reusable action error modal classifies network failures", () => {
  const normalized = normalizeActionError(new TypeError("Failed to fetch"));
  assert.equal(normalized.title, "Unable to Connect");
  assert.equal(normalized.actionLabel, "Try Again");
  assert.equal(normalized.retryable, true);
});

test("reusable action error modal maps KYC pending and rejected states", () => {
  const pending = normalizeActionError(new Error("KYC pending review"));
  assert.equal(pending.title, "Verification In Progress");
  assert.equal(pending.actionLabel, "Review Status");

  const rejected = normalizeActionError(new Error("KYC rejected: address proof mismatch"));
  assert.equal(rejected.title, "Verification Requires Attention");
  assert.equal(rejected.actionLabel, "Update KYC");
});

test("subscription page wires action-level failures into reusable error modal", () => {
  const js = readFileSync(path.join(process.cwd(), "apps", "web", "subscription.js"), "utf8");
  assert.match(js, /import \{ normalizeActionError, openActionErrorModal \} from "\.\/action-error-modal\.js\?v=20260926-action-error-modal"/);
  assert.match(js, /function showActionError\(/);
  assert.match(js, /showActionError\(error, \{ operation: "save_profile" \}\)/);
  assert.match(js, /showActionError\(error, \{ operation: "payment" \}\)/);
});

test("reusable action error modal styles are available in shared web stylesheet", () => {
  const css = readFileSync(path.join(process.cwd(), "apps", "web", "styles.css"), "utf8");
  assert.match(css, /\.eaz-action-error-modal/);
  assert.match(css, /\.eaz-action-error-modal::backdrop/);
  assert.match(css, /\.eaz-action-error-actions/);
});
