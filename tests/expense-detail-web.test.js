import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const dashboardHtml = read("apps/web/dashboard.html");
const dashboardJs = read("apps/web/dashboard.js");
const detailHtml = read("apps/web/expense.html");
const detailJs = read("apps/web/expense.js");

test("Expense rows navigate to the dedicated detail route", () => {
  assert.match(dashboardJs, /expense\.html\?expense=/);
  assert.match(detailHtml, /id="expenseDetailBody"/);
  assert.match(detailHtml, /Back to Expenses/);
});

test("Expense detail is read-only and displays persisted fields", () => {
  for (const id of ["expenseDetailPayee", "expenseDetailDate", "expenseDetailAmount", "expenseDetailDescription", "expenseDetailAccount", "expenseDetailFunding", "expenseDetailJournal"]) {
    assert.match(detailHtml, new RegExp(`id="${id}"`), id);
  }
  assert.match(detailJs, /apiClient\.getExpense\(token, expenseId, workspaceSnapshot\)/);
  assert.doesNotMatch(detailJs, /apiClient\.(updateExpense|deleteExpense)\(/);
});

test("Reversal uses the existing controlled endpoint and requires authorization and reason", () => {
  assert.match(detailJs, /workspaceCanReverse\(\)/);
  assert.match(detailJs, /apiClient\.reverseExpense\(token, expenseId/);
  assert.match(detailJs, /A meaningful reversal reason is required/);
  assert.match(detailJs, /reversalIntent\.key/);
  assert.match(detailJs, /expense-reversal-\$\{globalThis\.crypto\.randomUUID\(\)\}/);
  assert.match(detailJs, /Reconciled|reversal was not confirmed|controlled accounting authority/i);
  assert.match(detailJs, /form\.dataset\.submitting === "true"/);
});

test("Workspace and lifecycle guards prevent stale or repeated financial actions", () => {
  assert.match(detailJs, /currentWorkspaceMatches\(workspaceSnapshot\)/);
  assert.match(detailJs, /loadingGeneration/);
  assert.match(detailJs, /expense\.reversedById/);
  assert.match(detailJs, /expense\.businessId !== workspaceSnapshot\.businessId/);
  assert.doesNotMatch(detailJs, /postJournal|createJournalEntry/);
  assert.match(dashboardHtml, /data-page-link="expenses"/);
});
