import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const mobileScript = readFileSync(new URL("../apps/mobile/app.js", import.meta.url), "utf8");
const mobileMarkup = readFileSync(new URL("../apps/mobile/index.html", import.meta.url), "utf8");
const mobileStyles = readFileSync(new URL("../apps/mobile/styles.css", import.meta.url), "utf8");
const deleteAccountPage = readFileSync(new URL("../apps/web/delete-account.html", import.meta.url), "utf8");
const pluginSource = readFileSync(
  new URL("../plugins/eazinvoice-billing-workspace-msmes/src/index.php", import.meta.url),
  "utf8"
);

test("mobile document workflows use the SaaS API instead of local accounting", () => {
  assert.match(mobileScript, /createInvoice\(body\)/);
  assert.match(mobileScript, /recordInvoicePayment\(invoiceId, body\)/);
  assert.match(mobileScript, /createPurchaseOrder\(body\)/);
  assert.match(mobileScript, /createVendorBill\(body\)/);
  assert.match(mobileScript, /idempotencyKey\("invoice"\)/);
  assert.doesNotMatch(mobileScript, /function calculateRecord/);
  assert.match(mobileMarkup, /id="workspaceSelect"/);
  assert.match(mobileMarkup, /data-route="sales"/);
});


test("mobile business profile includes entity-aware tax and bank details fields", () => {
  assert.match(mobileScript, /data-form="business-profile"/);
  assert.match(mobileScript, /name="country"/);
  assert.match(mobileScript, /Other country/);
  assert.match(mobileScript, /name="entityType"/);
  assert.match(mobileScript, /<option value="individual"/);
  assert.match(mobileScript, /<option value="freelancer"/);
  assert.match(mobileScript, /<option value="consultant"/);
  assert.match(mobileScript, /<option value="company"/);
  assert.match(mobileScript, /<option value="group"/);
  assert.match(mobileScript, /name="panNumber"/);
  assert.match(mobileScript, /name="gstNumber"/);
  assert.match(mobileScript, /name="aadhaarNumber"/);
  assert.match(mobileScript, /name="bankDetails"/);
  assert.match(mobileScript, /name="taxId"/);
  assert.match(mobileScript, /name="registrationNumber"/);
  assert.match(mobileScript, /aadhaarLast4/);
  assert.match(mobileScript, /requiresGstEntityType/);
  assert.match(mobileScript, /isIndiaCountry/);
  assert.match(mobileScript, /businessIdentityRules/);
  assert.match(mobileScript, /defaultCurrencyForCountry/);
  assert.match(mobileScript, /currency: businessDefaultCurrency\(\)/);
});
test("mobile auth exposes forgot password recovery using the shared reset API", () => {
  assert.match(mobileScript, /authMode/);
  assert.match(mobileScript, /data-auth-mode="reset"/);
  assert.match(mobileScript, /\/auth\/password-reset/);
  assert.match(mobileScript, /Forgot password\?/);
  assert.match(mobileScript, /data-auth-mode="signup"/);
  assert.match(mobileScript, /client: "mobile"/);
  assert.match(mobileMarkup, /id="apiBaseForm"/);
  assert.match(mobileMarkup, /id="apiBaseForm"[^>]*hidden/);
  assert.match(mobileMarkup, /id="workspaceBar"/);
  assert.match(mobileScript, /id="authForm" class="form-stack" novalidate/);
  assert.doesNotMatch(mobileScript, /API Endpoint/);
  assert.doesNotMatch(mobileScript, /Save endpoint/);
  assert.match(mobileScript, /dom\.authForm\?\.addEventListener\("submit"/);
  assert.match(mobileScript, /dom\.authSubmitButton\?\.addEventListener\("click"/);
});

test("mobile document sharing is presentation-only and backend-authoritative", () => {
  assert.match(mobileScript, /function shareDocument/);
  assert.match(mobileScript, /navigator\.share/);
  assert.match(mobileScript, /state\.data\.purchaseOrders/);
  assert.match(mobileScript, /state\.data\.invoices/);
  assert.doesNotMatch(mobileScript, /function createDocumentPdf/);
  assert.match(mobileScript, /server PDF retrieval should be added if backend exposes canonical PDFs|Android share sheet is unavailable/);
});

test("mobile phase 1-2 navigation and dashboard contracts stay focused", () => {
  const navMarkup = mobileMarkup.match(/<nav[\s\S]*?<\/nav>/)?.[0] || "";
  const navRoutes = [...navMarkup.matchAll(/data-route="([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(navRoutes, ["home", "sales", "purchases", "money", "more"]);
  assert.match(mobileScript, /Total sales/);
  assert.match(mobileScript, /Outstanding receivables/);
  assert.match(mobileScript, /Outstanding payables/);
  assert.match(mobileScript, /Latest 5 Invoices/);
  assert.match(mobileScript, /Latest 5 PO\/WO/);
  assert.match(mobileScript, /Needs attention/);
  assert.ok(mobileScript.indexOf("Quick actions") < mobileScript.indexOf("More financials"));
  assert.match(mobileStyles, /action-tile:nth-child\(5\) \.metric-icon/);
  assert.match(mobileScript, /function iconSvg/);
  assert.match(mobileScript, /function attentionSummary/);
  assert.match(mobileScript, /format: "count"/);
  assert.match(mobileStyles, /grid-template-columns: repeat\(4, minmax\(0, 1fr\)\)/);
  assert.match(mobileStyles, /\.profile-menu\[hidden\]/);
  assert.match(mobileMarkup, /class="nav-icon"/);
  assert.match(mobileMarkup, /id="menuButton"/);
  assert.match(mobileMarkup, /id="profileButton"/);
  assert.match(mobileMarkup, /id="mobileMenu"/);
  assert.match(mobileMarkup, /id="profileMenu"/);
  assert.match(mobileMarkup, /data-action="open-account-settings"/);
  assert.match(mobileMarkup, /data-action="open-change-password"/);
  assert.match(mobileScript, /renderAccount/);
  assert.match(mobileScript, /renderAccountSettings/);
  assert.match(mobileScript, /Complete your profile/);
  assert.match(mobileScript, /home-slider-po-wo\.png/);
  assert.match(mobileScript, /home-slider-ai-agent\.png/);
  assert.match(mobileScript, /home-slider-payments\.png/);
  assert.match(mobileScript, /state\.menuOpen/);
  assert.match(mobileScript, /data-action=\"google-auth\"/);
  assert.match(mobileScript, /profileMenuOpen/);
  assert.match(mobileScript, /closeProfileMenu/);
  assert.match(mobileScript, /document\.addEventListener\("pointerdown"/);
  assert.match(mobileScript, /document\.addEventListener\("keydown"/);
  assert.doesNotMatch(mobileScript, /dom\.menuButton\?\.addEventListener\("click"/);
  assert.match(mobileScript, /Save Draft/);
});

test("mobile phase 3 document workflows keep lifecycle and accounting boundaries visible", () => {
  assert.match(mobileScript, /New Invoice/);
  assert.match(mobileScript, /Save Draft \/ Create Invoice/);
  assert.match(mobileScript, /data-add-item/);
  assert.match(mobileScript, /documentItems\(data\)/);
  assert.match(mobileScript, /finalizeInvoice/);
  assert.match(mobileScript, /New Purchase Order/);
  assert.match(mobileScript, /Issue it when ready; it has no accounting impact/);
  assert.match(mobileScript, /New Work Order/);
  assert.match(mobileScript, /documentType: "wo"/);
  assert.match(mobileScript, /Quotation/);
  assert.match(mobileScript, /Coming soon/);
  assert.match(mobileScript, /Print \/ Save as PDF/);
});

test("mobile phase 4 reports and compliance stay summary-first and non-filing", () => {
  assert.match(mobileScript, /function renderReports/);
  assert.match(mobileScript, /reportValue\(source, key\)/);
  assert.doesNotMatch(mobileScript, /\[object Object\]/);
  assert.match(mobileScript, /data-report-period/);
  assert.match(mobileScript, /Profit & Loss/);
  assert.match(mobileScript, /Balance Sheet/);
  assert.match(mobileScript, /trialBalanceView/);
  assert.match(mobileScript, /Outstanding receivables|Receivables/);
  assert.match(mobileScript, /Prepared \/ Not Filed/);
  assert.doesNotMatch(mobileScript, /Secrets stay Web-preferred/);
  assert.match(mobileScript, /Government returns are not filed/);
  assert.match(mobileScript, /Accounting Periods/);
  assert.doesNotMatch(mobileScript, /fileReturn|submitReturn|fileGST/);
});

test("account deletion compliance uses verified email ownership and preserves records", () => {
  assert.match(deleteAccountPage, /Delete Your EazInvoice Account/);
  assert.match(deleteAccountPage, /mailto:support@eazinvoice.com/);
  assert.match(deleteAccountPage, /registered email address/);
  assert.match(deleteAccountPage, /financial, tax, accounting, security, payment, audit or legal records/i);
  assert.match(mobileScript, /delete-account\.html/);
  assert.match(mobileScript, /Account deletion is handled/);
  assert.doesNotMatch(mobileScript, /\/account\/delete|deleteAccount\(/);
});

test("mobile AI Agent stays local, structured and draft-safe", () => {
  assert.match(mobileScript, /function renderAgent/);
  assert.match(mobileScript, /\/ai-agent\/command/);
  assert.match(mobileScript, /data-agent-prompt/);
  assert.match(mobileScript, /\.\/assets\/eazy\.png/);
  assert.doesNotMatch(mobileScript, /\.\/assets\/eazy\.svg/);
  assert.match(mobileScript, /Facts, calculations and recommendations/);
  assert.match(mobileScript, /aiRobotState/);
  assert.match(mobileStyles, /prefers-reduced-motion/);
  assert.match(mobileScript, /More.*EazInvoice AI Agent|EazInvoice AI Agent/);
  assert.match(mobileScript, /statusVisible\(scope\)/);
  assert.match(mobileScript, /setStatus\("The Agent could not complete that request\.", "error", "agent"\)/);
  assert.doesNotMatch(mobileScript, /data-agent-action="(?:finalize|file-gst|file-tds|delete)"/i);
  assert.match(mobileMarkup, /data-route="home"/);
  assert.match(mobileMarkup, /data-route="sales"/);
  assert.match(mobileMarkup, /data-route="purchases"/);
  assert.match(mobileMarkup, /data-route="money"/);
  assert.match(mobileMarkup, /data-route="more"/);
});

test("WordPress saved records expose view, PDF, and paid email actions", () => {
  assert.match(pluginSource, /handle_print_document/);
  assert.match(pluginSource, /handle_email_document/);
  assert.match(pluginSource, /plan_at_least\( 'standard' \)/);
  assert.match(pluginSource, /Email: Standard\+/);
});

test("web auth keeps Google sign-in available for login and signup modes", () => {
  const webAuthScript = readFileSync(new URL("../apps/web/auth.js", import.meta.url), "utf8");
  assert.match(webAuthScript, /googleAuth\?\.addEventListener\("click"/);
  assert.match(webAuthScript, /googleAuth\.hidden = mode === "reset"/);
  assert.match(webAuthScript, /const oauthMode = mode === "signup" \? "signup" : "login"/);
});

test("web dashboard profile menu routes Account Settings to dedicated settings page", () => {
  const dashboard = readFileSync(new URL("../apps/web/dashboard.html", import.meta.url), "utf8");
  const accountSettingsPage = readFileSync(new URL("../apps/web/account-settings.html", import.meta.url), "utf8");
  assert.match(dashboard, /href="\/apps\/web\/account-settings\.html">Account Settings<\/a>/);
  assert.match(accountSettingsPage, /<h1>Account Settings<\/h1>/);
  assert.match(accountSettingsPage, /API Access \/ API Keys/);
  assert.match(accountSettingsPage, /Email Configuration/);
  assert.match(accountSettingsPage, /Business Team/);
});
