import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { normalizeActionError, normalizeActionStatus } from "../apps/web/action-error-modal.js";

test("reusable action status modal normalizes plan-limit failures into plain language", () => {
  const normalized = normalizeActionError(new Error("business profiles exceeds Free plan limit"));
  assert.equal(normalized.tone, "warning");
  assert.equal(normalized.title, "Free Plan Limit Reached");
  assert.match(normalized.message, /does not allow additional business profiles/i);
  assert.equal(normalized.retryable, false);
});

test("reusable action status modal returns safe fallback for technical unknown failures", () => {
  const normalized = normalizeActionError(new Error("SQLSTATE failed at /var/data/users with token=abc123"));
  assert.equal(normalized.tone, "error");
  assert.equal(normalized.title, "Something Went Wrong");
  assert.equal(normalized.message, "EazInvoice couldn't complete this action.");
  assert.doesNotMatch(`${normalized.detail}`.toLowerCase(), /sqlstate|\/var\/|token=/);
});

test("reusable action status modal classifies network failures", () => {
  const normalized = normalizeActionError(new TypeError("Failed to fetch"));
  assert.equal(normalized.tone, "error");
  assert.equal(normalized.title, "Unable to Connect");
  assert.equal(normalized.actionLabel, "Try Again");
  assert.equal(normalized.retryable, true);
});

test("reusable action status modal supports success informational and warning variants", () => {
  const success = normalizeActionStatus({
    tone: "success",
    title: "Profile Saved",
    message: "Saved.",
    actionLabel: "OK",
    showClose: false,
  });
  assert.equal(success.tone, "success");
  assert.equal(success.actionLabel, "OK");
  assert.equal(success.showClose, false);

  const info = normalizeActionStatus({ tone: "info", title: "Verification In Progress", message: "Awaiting review." });
  assert.equal(info.tone, "info");

  const warning = normalizeActionStatus({ tone: "warning", title: "Action Required", message: "Need additional data." });
  assert.equal(warning.tone, "warning");
  assert.equal(warning.closeLabel, "Cancel");
});

test("reusable action status modal maps KYC pending and rejected states", () => {
  const pending = normalizeActionError(new Error("KYC pending review"));
  assert.equal(pending.tone, "info");
  assert.equal(pending.title, "Verification In Progress");
  assert.equal(pending.actionLabel, "Review Status");

  const rejected = normalizeActionError(new Error("KYC rejected: address proof mismatch"));
  assert.equal(rejected.tone, "warning");
  assert.equal(rejected.title, "Verification Requires Attention");
  assert.equal(rejected.actionLabel, "Update KYC");
});

test("subscription page wires status modal for save success and error handling", () => {
  const js = readFileSync(path.join(process.cwd(), "apps", "web", "subscription.js"), "utf8");
  assert.match(js, /import \{ normalizeActionError, openActionStatusModal \} from "\.\/action-error-modal\.js\?v=20260926-action-error-modal"/);
  assert.match(js, /function resolveKycSaveSuccessStatus\(/);
  assert.match(js, /title: isFirstSubmission \? "KYC Submitted Successfully" : "KYC Update Saved"/);
  assert.match(js, /Paid-plan activation will become available after your KYC is approved\./);
  assert.match(js, /showActionStatus\(successStatus\)/);
  assert.match(js, /showActionError\(error, \{ operation: "save_profile" \}\)/);
  assert.doesNotMatch(js, /Profile saved for paid plan review\. You can now choose a paid yearly plan\./);
  assert.doesNotMatch(js, /form\.reset\(/);
});

test("reusable action status modal styles are available in shared web stylesheet", () => {
  const css = readFileSync(path.join(process.cwd(), "apps", "web", "styles.css"), "utf8");
  assert.match(css, /\.eaz-action-status-modal/);
  assert.match(css, /data-tone="success"/);
  assert.match(css, /data-tone="warning"/);
  assert.match(css, /data-tone="info"/);
  assert.match(css, /\.eaz-action-error-modal/);
});

test("api regression guards for existing company update path and authoritative payment gating remain present", () => {
  const apiTests = readFileSync(path.join(process.cwd(), "tests", "api.test.js"), "utf8");
  assert.match(apiTests, /free-plan business limit blocks only new company creation, not existing company profile updates/);
  assert.match(apiTests, /paid subscription renewal requires authoritative KYC verification/);
  assert.match(apiTests, /razorpay paid checkout shows KYC blocker before gateway order creation/);
});
