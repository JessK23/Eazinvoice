import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const html = read("apps/web/dashboard.html");
const js = read("apps/web/dashboard.js");
const client = read("apps/api/src/client.js");
const server = read("apps/api/src/server.js");
const store = read("apps/api/src/store.js");

test("Banking has one canonical operational Web owner", () => {
  assert.match(html, /#banking" data-page-link="banking">Banking Overview/);
  assert.match(html, /data-dashboard-page="banking"[^>]*data-surface-owner="banking"[^>]*data-surface-purpose="banking-operations"/);
  assert.match(html, /id="bankingAccountForm"[^>]*data-surface-action="bank-account\.create"/);
  assert.match(html, /id="bankingImportForm"[^>]*data-surface-action="statement-import\.create"/);
  assert.match(html, /id="bankingMatchForm"[^>]*data-surface-action="reconciliation\.match"/);
  assert.match(html, /id="bankingUnmatchForm"[^>]*data-surface-action="reconciliation\.unmatch"/);
});

test("Banking client adapters and production routes are reused exactly", () => {
  assert.match(client, /listBankAccounts\(token/);
  assert.match(client, /listBankStatementLines\(token/);
  assert.match(client, /getBankMatchSuggestions\(token/);
  assert.match(client, /confirmBankMatch\(token/);
  assert.match(client, /unmatchBankReconciliation\(token/);
  assert.match(server, /url\.pathname === "\/bank\/accounts" && req\.method === "GET"/);
  assert.match(server, /url\.pathname === "\/bank\/statement-imports" && req\.method === "POST"/);
  assert.match(server, /url\.pathname === "\/bank\/reconciliation\/matches" && req\.method === "POST"/);
  assert.match(server, /url\.pathname\.startsWith\("\/bank\/reconciliation\/matches\/"\) && req\.method === "DELETE"/);
});

test("Banking requests preserve workspace and business scope", () => {
  assert.match(js, /apiClient\.listBankAccounts\(token, workspaceOptions\)/);
  assert.match(js, /apiClient\.createBankAccount\(token, \{[\s\S]*selectedWorkspaceOptions\(\)/);
  assert.match(js, /apiClient\.confirmBankMatch\(token, \{[\s\S]*selectedWorkspaceOptions\(\)/);
  assert.match(js, /apiClient\.unmatchBankReconciliation\(token, matchId, selectedWorkspaceOptions\(\)\)/);
  assert.match(server, /workspaceOwnerUserId: url\.searchParams\.get\("workspaceOwnerUserId"\)/);
  assert.match(server, /businessId: url\.searchParams\.get\("businessId"\)/);
});

test("Match and Unmatch are explicit single backend operations", () => {
  const matchStart = js.indexOf("bankingMatchForm?.addEventListener");
  const unmatchStart = js.indexOf("bankingUnmatchForm?.addEventListener");
  assert.ok(matchStart >= 0);
  assert.ok(unmatchStart > matchStart);
  const matchBlock = js.slice(matchStart, unmatchStart);
  const unmatchBlock = js.slice(unmatchStart, js.indexOf("workspaceTargetLinks.forEach", unmatchStart));
  assert.equal((matchBlock.match(/apiClient\.confirmBankMatch\(/g) || []).length, 1);
  assert.equal((unmatchBlock.match(/apiClient\.unmatchBankReconciliation\(/g) || []).length, 1);
  assert.match(matchBlock, /statementLineId/);
  assert.match(matchBlock, /sourceType/);
  assert.match(matchBlock, /sourceId/);
  assert.match(unmatchBlock, /matchId/);
  assert.match(store, /Only exact one-to-one reconciliation matches are supported/);
  assert.match(store, /match\.status = "unmatched"/);
});

test("Banking Web does not implement reconciliation or accounting authority", () => {
  const surface = html.match(/<section id="banking"[\s\S]*?<\/section>/)?.[0] || "";
  const bankingFunctions = js.slice(js.indexOf("function bankingAccountLabel"), js.indexOf("function postedInvoicesForCorrections"));
  assert.match(surface, /No browser accounting/);
  assert.doesNotMatch(surface, /Post Journal|General Ledger|Create Invoice|Create Vendor Bill/);
  assert.doesNotMatch(bankingFunctions, /suggestMatchesForLine|createJournal|postJournal/);
  assert.doesNotMatch(bankingFunctions, /reduce\(/);
});

test("Banking actions remain in Banking and Advanced Workflows redirects operational entry", () => {
  assert.match(js, /if \(page === "banking"\) loadBanking\(\)/);
  assert.match(js, /Operational Banking actions are now available on the canonical Banking page/);
  assert.match(js, /#banking" data-page-link="banking">Open Banking workspace/);
  assert.doesNotMatch(html, /#reports" data-page-link="reports">Reconciliation Exceptions/);
});

test("Future domains and protected surfaces remain outside this package", () => {
  assert.match(html, /Quotation Coming Later/);
  assert.doesNotMatch(client, /createExpense|listExpenses|createQuotation|listQuotations/);
  assert.doesNotMatch(server, /url\.pathname === "\/expenses"|url\.pathname === "\/quotations"/);
  assert.match(html, /data-dashboard-page="accounting"[^>]*data-surface-owner="accounting"/);
  assert.match(html, /data-dashboard-page="reports"[^>]*data-surface-owner="reports"/);
});
