import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const dashboardHtml = read("apps/web/dashboard.html");
const dashboardJs = read("apps/web/dashboard.js");

test("Expense creation is a Purchases-owned route with backend contract fields", () => {
  assert.match(dashboardHtml, /id="expense-create"[^>]*data-dashboard-page="expense-create"[^>]*data-surface-owner="purchases"/);
  for (const field of ["expenseDate", "payeeName", "description", "amount", "currency", "expenseAccountId", "bankAccountId"]) {
    assert.match(dashboardHtml, new RegExp(`name="${field}"`), field);
  }
  assert.match(dashboardJs, /apiClient\.createExpense\(token, requestPayload\)/);
});

test("Expense account selectors use existing authorities and exclude ineligible funding accounts", () => {
  assert.match(dashboardJs, /apiClient\.listLedgerAccounts\(token, workspaceOptions\)/);
  assert.match(dashboardJs, /apiClient\.listBankAccounts\(token, workspaceOptions\)/);
  assert.match(dashboardJs, /account\.accountType.*expense/);
  assert.match(dashboardJs, /account\.normalBalance.*debit/);
  assert.match(dashboardJs, /\["bank", "cash"\]\.includes/);
  assert.match(dashboardJs, /!== "1110"/);
});

test("Expense submission preserves backend authority and retry identity", () => {
  assert.match(dashboardJs, /workspaceCanWriteRecords\(\)/);
  assert.match(dashboardJs, /idempotencyKey: expenseSubmission\.key/);
  assert.match(dashboardJs, /globalThis\.crypto\?\.randomUUID/);
  assert.match(dashboardJs, /Workspace changed while the Expense was being recorded/);
  assert.match(dashboardJs, /backendErrorMessage\(error\)/);
  assert.doesNotMatch(dashboardJs, /postJournal|createJournalEntry\(token.*expense/i);
});

test("Expense form preserves the read-only list and does not add detail or reversal authority", () => {
  assert.match(dashboardJs, /await loadDashboardExpenses\(\)/);
  assert.doesNotMatch(dashboardJs, /apiClient\.(getExpense|reverseExpense)\(token/);
  assert.doesNotMatch(dashboardHtml, /href="[^"]*expense-detail|data-expense-reverse/);
});
