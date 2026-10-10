import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const dashboardHtml = read("apps/web/dashboard.html");
const dashboardJs = read("apps/web/dashboard.js");

test("Expenses is a Purchases-owned dashboard entry point", () => {
  assert.match(dashboardHtml, /href="\/apps\/web\/dashboard\.html#expenses" data-page-link="expenses">Expenses/);
  assert.match(dashboardHtml, /<section id="expenses"[^>]*data-dashboard-page="expenses"[^>]*data-surface-owner="purchases"[^>]*data-surface-purpose="expenses"/);
  assert.match(dashboardHtml, /id="expensesList"/);
});

test("Expense list reads the existing workspace-scoped backend authority", () => {
  assert.match(dashboardJs, /apiClient\.listExpenses\(token, workspaceOptions\)/);
  assert.match(dashboardJs, /const workspaceOptions = selectedWorkspaceOptions\(\)/);
  assert.match(dashboardJs, /currentOptions\.workspaceOwnerUserId !== workspaceOptions\.workspaceOwnerUserId/);
  assert.match(dashboardJs, /currentOptions\.businessId !== workspaceOptions\.businessId/);
});

test("Expense list exposes backend fields with loading, empty, error and retry states", () => {
  assert.match(dashboardHtml, /Loading Expenses/);
  assert.match(dashboardJs, /No Expenses recorded in this workspace/);
  assert.match(dashboardJs, /data-retry-expenses/);
  assert.match(dashboardJs, /role="alert"/);
  assert.match(dashboardJs, /expense\.payeeName/);
  assert.match(dashboardJs, /expense\.expenseDate/);
  assert.match(dashboardJs, /expense\.currency/);
  assert.match(dashboardJs, /expense\.status/);
});

test("3E.8A does not add creation, reversal, filtering or fake detail authority", () => {
  const expenseSection = dashboardHtml.match(/<section id="expenses"[\s\S]*?<\/section>/)?.[0] || "";
  assert.match(expenseSection, /Search, sorting, pagination, creation and reversal are not available/);
  assert.doesNotMatch(expenseSection, /data-expense-reverse/i);
  assert.doesNotMatch(dashboardJs, /apiClient\.(reverseExpense|getExpense)\(/);
});
