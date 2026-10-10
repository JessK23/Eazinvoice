import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const dashboardHtml = read("apps/web/dashboard.html");
const dashboardJs = read("apps/web/dashboard.js");
const apiClient = read("apps/api/src/client.js");
const server = read("apps/api/src/server.js");

test("Command Center, Accounting, and Reports have explicit separate ownership", () => {
  assert.match(dashboardHtml, /data-dashboard-page="home"[^>]*data-surface-owner="command-center"[^>]*data-surface-purpose="operational-summary"/);
  assert.match(dashboardHtml, /data-dashboard-page="accounting"[^>]*data-surface-owner="accounting"[^>]*data-surface-purpose="accounting-operations"/);
  assert.match(dashboardHtml, /data-dashboard-page="reports"[^>]*data-surface-owner="reports"[^>]*data-surface-purpose="report-consumption"/);
  assert.match(dashboardHtml, /data-dashboard-page="report-detail"[^>]*data-surface-owner="reports"/);
  assert.match(dashboardHtml, />Reports<\/a>/);
  assert.match(dashboardHtml, /data-advanced-tab="banking" data-surface-owner="banking"/);
  assert.match(dashboardHtml, /data-advanced-tab="gst" data-surface-owner="compliance"/);
  assert.match(dashboardHtml, /data-advanced-tab="periods" data-surface-owner="accounting"/);
});

test("Accounting views reuse existing backend accounting routes", () => {
  assert.match(dashboardHtml, /Accounting Overview/);
  assert.match(dashboardHtml, /Chart and Trial Balance/);
  assert.doesNotMatch(dashboardHtml, /Chart, GL and Trial Balance/);
  assert.match(dashboardJs, /apiClient\.getAccountingSummary\(token, workspaceOptions\)/);
  assert.match(dashboardJs, /apiClient\.listJournalEntries\(token, workspaceOptions\)/);
  assert.match(dashboardJs, /apiClient\.getAccountingBook\(token, \{ \.\.\.workspaceOptions, book: "bank" \}\)/);
  assert.match(dashboardJs, /apiClient\.getGstComplianceSummary\(token, workspaceOptions\)/);
  assert.match(apiClient, /getAccountingSummary\(token, filters = \{\}\)[\s\S]*request\(`\/accounting\/summary/);
  assert.match(apiClient, /getFinancialReport\(token, reportType, filters = \{\}\)[\s\S]*request\(`\/reports\//);
  assert.match(server, /url\.pathname === "\/accounting\/summary" && req\.method === "GET"/);
  assert.match(server, /\["\/accounting\/trial-balance", "trial-balance"\]/);
  assert.match(server, /\["\/accounting\/general-ledger", "general-ledger"\]/);
  assert.doesNotMatch(dashboardJs, /getFinancialReport\(token, "general-ledger"/);
});

test("Reports remains consumption-only and Accounting remains the operational owner", () => {
  assert.match(dashboardHtml, /Canonical accounting operations view/);
  assert.match(dashboardHtml, /Reports consumes projections and analysis/);
  assert.match(dashboardJs, /apiClient\.getReportSummary\(token, selectedWorkspaceOptions/);
  assert.doesNotMatch(dashboardHtml, /Expense tracking from created PO\/WO records/);
  assert.doesNotMatch(dashboardHtml, /href="\/apps\/web\/invoice\.html\?type=expense"/);
});

test("Expense backend capability is exposed without adding a Web dashboard surface", () => {
  assert.doesNotMatch(dashboardHtml, /data-dashboard-page="expenses"/);
  assert.doesNotMatch(dashboardHtml, /data-dashboard-page="quotations"/);
  assert.match(apiClient, /createExpense|listExpenses/);
  assert.match(server, /url\.pathname === "\/expenses"/);
  assert.doesNotMatch(apiClient, /createQuotation|listQuotations/);
  assert.doesNotMatch(server, /url\.pathname === "\/quotations"/);
});

test("Accounting loading remains read-only", () => {
  const refreshBlock = dashboardJs.match(/async function refreshAccountingSummary\(\)[\s\S]*?\n}\n\nasync function loadLedgerDrilldown/);
  assert.ok(refreshBlock, "Accounting refresh function should remain present");
  assert.doesNotMatch(refreshBlock[0], /createInvoice|createVendorBill|recordPayment|createJournalEntry|createLedgerAccount/);
});
