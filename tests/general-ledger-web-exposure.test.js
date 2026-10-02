import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const dashboardHtml = read("apps/web/dashboard.html");
const dashboardJs = read("apps/web/dashboard.js");
const apiClient = read("apps/api/src/client.js");
const server = read("apps/api/src/server.js");

test("Accounting exposes a dedicated General Ledger read surface", () => {
  assert.match(dashboardHtml, /href="\/apps\/web\/dashboard\.html#general-ledger" data-page-link="general-ledger">General Ledger/);
  assert.match(dashboardHtml, /data-dashboard-page="general-ledger"[^>]*data-surface-owner="accounting"[^>]*data-surface-purpose="general-ledger-read"/);
  assert.match(dashboardHtml, /id="generalLedgerFilterForm"[^>]*data-surface-action="general-ledger\.read"/);
  assert.match(dashboardHtml, /id="generalLedgerList"/);
  assert.match(dashboardHtml, /Read only/);
});

test("General Ledger reuses the scoped backend capability through the centralized client", () => {
  assert.match(apiClient, /getGeneralLedger\(token, filters = \{\}\)[\s\S]*request\(`\/accounting\/general-ledger\$\{queryString\(filters\)\}`/);
  assert.match(server, /\["\/accounting\/general-ledger", "general-ledger"\]/);
  assert.match(server, /workspaceOwnerUserId: url\.searchParams\.get\("workspaceOwnerUserId"\)/);
  assert.match(server, /businessId: url\.searchParams\.get\("businessId"\)/);
  assert.match(server, /accountId: url\.searchParams\.get\("accountId"\)/);
  assert.match(server, /accountCode: url\.searchParams\.get\("accountCode"\)/);
  assert.match(dashboardJs, /apiClient\.getGeneralLedger\(token, generalLedgerFilters\(\)\)/);
  assert.doesNotMatch(dashboardJs, /fetch\([^)]*accounting\/general-ledger/);
});

test("General Ledger renders server-provided values without browser accounting calculations", () => {
  const renderBlock = dashboardJs.match(/function renderGeneralLedger\(payload = \{\}\)[\s\S]*?\n}\n\nasync function loadGeneralLedger/);
  assert.ok(renderBlock, "General Ledger renderer should be present");
  assert.match(renderBlock[0], /row\.debit/);
  assert.match(renderBlock[0], /row\.credit/);
  assert.match(renderBlock[0], /row\.runningBalance/);
  assert.doesNotMatch(renderBlock[0], /reduce\(|\+\s*Number|Math\.|toFixed\(/);
  assert.match(dashboardJs, /if \(visiblePage === "general-ledger"\) loadGeneralLedger\(\)/);
});

test("General Ledger has no posting, persistence, or cross-process controls", () => {
  const surface = dashboardHtml.match(/<section id="general-ledger"[\s\S]*?<\/section>/)?.[0] || "";
  assert.doesNotMatch(surface, /Post Journal|Save Ledger Account|Create|Payment|Reconcile|Expense|Quotation|Invoice|Vendor Bill/);
  assert.doesNotMatch(dashboardJs, /generalLedger.*createJournalEntry|generalLedger.*createLedgerAccount|generalLedger.*recordInvoicePayment/);
  assert.doesNotMatch(surface, /method="post"|method="patch"|method="delete"/i);
});

test("Existing Accounting, drill-down, Reports, Banking, Compliance, and future boundaries remain present", () => {
  assert.match(dashboardHtml, /data-dashboard-page="accounting"[^>]*data-surface-owner="accounting"/);
  assert.match(dashboardHtml, /id="trialBalanceList"/);
  assert.match(dashboardHtml, /id="ledgerDrilldownList"/);
  assert.match(dashboardHtml, /data-dashboard-page="reports"[^>]*data-surface-owner="reports"/);
  assert.match(dashboardHtml, /data-advanced-tab="banking" data-surface-owner="banking"/);
  assert.match(dashboardHtml, /data-advanced-tab="gst" data-surface-owner="compliance"/);
  assert.doesNotMatch(apiClient, /createExpense|listExpenses|createQuotation|listQuotations/);
  assert.doesNotMatch(server, /url\.pathname === "\/expenses"|url\.pathname === "\/quotations"/);
  assert.match(dashboardJs, /getLedgerAccountEntries\(token, accountId, selectedWorkspaceOptions\(\)\)/);
});
