import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

const html = read("apps/web/dashboard.html");
const js = read("apps/web/dashboard.js");
const css = read("apps/web/styles.css");
const doc = read("docs/p2-2-web-client-parity-matrix.md");

const checks = [
  ["dashboard has global business switcher", html.includes('id="globalBusinessSwitcher"')],
  ["dashboard has finance cockpit", html.includes('class="finance-cockpit"') && html.includes("Finance Cockpit")],
  ["dashboard states backend authority", html.includes("Backend authoritative")],
  ["navigation exposes sales", html.includes("Sales") && html.includes("Invoices and Payments")],
  ["navigation exposes purchases", html.includes("Purchases") && html.includes("Purchases and Payables")],
  ["navigation exposes accounting", html.includes("Books and Statements")],
  ["navigation exposes banking", html.includes("Bank and Cash")],
  ["navigation exposes compliance", html.includes("GST and TDS")],
  ["navigation exposes business governance", html.includes("Workspace and Governance")],
  ["js wires global switcher", js.includes("globalBusinessSwitcher") && js.includes("selectBusinessWorkspace(globalBusinessSwitcher.value)")],
  ["js renders finance cockpit", js.includes("function renderFinanceCockpit()") && js.includes("renderFinanceCockpit();")],
  ["js uses selected workspace options", js.includes("workspaceOwnerUserId") && js.includes("selectedWorkspaceOptions")],
  ["css styles finance cockpit", css.includes(".finance-cockpit") && css.includes(".finance-readiness-board")],
  ["parity matrix exists", doc.includes("P2-2 Web Client Parity") && doc.includes("Backend Authority")],
  ["advanced workflows page exists", html.includes('data-dashboard-page="advanced-workflows"') && html.includes("Advanced Financial Workflows")],
  ["advanced tabs cover corrections", html.includes('data-advanced-tab="corrections"')],
  ["advanced tabs cover settlements", html.includes('data-advanced-tab="settlements"')],
  ["advanced tabs cover banking", html.includes('data-advanced-tab="banking"')],
  ["advanced tabs cover periods", html.includes('data-advanced-tab="periods"')],
  ["advanced tabs cover year end", html.includes('data-advanced-tab="year-end"')],
  ["advanced tabs cover GST", html.includes('data-advanced-tab="gst"')],
  ["advanced tabs cover TDS", html.includes('data-advanced-tab="tds"')],
  ["client exposes credit note API", js.includes("createCreditNote") && js.includes("listCreditNotes")],
  ["client exposes vendor credit API", js.includes("createVendorCredit") && js.includes("listVendorCredits")],
  ["client exposes settlement API", js.includes("reverseCustomerPayment") && js.includes("createCustomerRefund") && js.includes("createVendorRefund")],
  ["client exposes bank reconciliation API", js.includes("importBankStatement") && js.includes("confirmBankMatch") && js.includes("unmatchBankReconciliation")],
  ["client exposes accounting governance API", js.includes("changeAccountingPeriodStatus") && js.includes("createOpeningBalance")],
  ["client exposes year-end API", js.includes("previewYearEndClose") && js.includes("executeYearEndClose") && js.includes("reopenYearEndClose")],
  ["dashboard renders advanced workflows", js.includes("function renderAdvancedWorkflowTab") && js.includes("loadAdvancedWorkflows")],
  ["dashboard maps friendly advanced errors", js.includes("function backendErrorMessage")],
  ["dashboard protects double submission", js.includes("advancedActionSubmit.disabled = true")],
  ["css styles advanced workflows", css.includes(".advanced-workspace-grid") && css.includes(".advanced-table")],
];

const failures = checks.filter(([, passed]) => !passed);

if (failures.length) {
  console.error("P2-2 web parity check failed:");
  for (const [label] of failures) console.error(`- ${label}`);
  process.exit(1);
}

console.log(`P2-2 web parity check passed (${checks.length}/${checks.length}).`);
