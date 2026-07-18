import { apiClient, money, requireSession } from "./common.js?v=20260601-session";

const sessionContext = await requireSession();
const token = sessionContext?.token;
let currentUser = sessionContext?.session?.user || null;
if (!token) throw new Error("Authentication required");

const app = document.getElementById("invoiceApp");
const form = document.getElementById("invoiceWorkflowForm");
const companySelect = document.getElementById("companySelect");
const currencySelect = document.getElementById("currencySelect");
const customerSelect = document.getElementById("customerSelect");
const savedCustomerWrap = document.getElementById("savedCustomerWrap");
const existingCustomerFields = document.getElementById("existingCustomerFields");
const newCustomerFields = document.getElementById("newCustomerFields");
const customerModePrompt = document.getElementById("customerModePrompt");
const addNewCustomerBtn = document.getElementById("addNewCustomerBtn");
const cancelNewCustomerBtn = document.getElementById("cancelNewCustomerBtn");
const newCustomerStatus = document.getElementById("newCustomerStatus");
const newCustomerCategory = document.getElementById("newCustomerCategory");
const newCustomerNameLabel = document.getElementById("newCustomerNameLabel");
const newCustomerPanWrap = document.getElementById("newCustomerPanWrap");
const newCustomerGstinWrap = document.getElementById("newCustomerGstinWrap");
const invoiceEntrySections = document.querySelectorAll("[data-invoice-entry]");
const issuerSetup = document.getElementById("issuerSetup");
const issuerStatus = document.getElementById("issuerStatus");
const issuerCompanySelect = document.getElementById("issuerCompanySelect");
const issuerCompanySelectWrap = document.getElementById("issuerCompanySelectWrap");
const issuerNameInput = document.getElementById("issuerNameInput");
const issuerPanInput = document.getElementById("issuerPanInput");
const issuerGstInput = document.getElementById("issuerGstInput");
const issuerGstWrap = document.getElementById("issuerGstWrap");
const issuerStateInput = document.getElementById("issuerStateInput");
const issuerEmailInput = document.getElementById("issuerEmailInput");
const issuerSetupHint = document.getElementById("issuerSetupHint");
const updateIssuerBtn = document.getElementById("updateIssuerBtn");
const itemSuggestions = document.getElementById("itemSuggestions");
const itemsEl = document.getElementById("workflowItems");
const addItem = document.getElementById("addItemBtn");
const status = document.getElementById("invoiceWorkflowStatus");
const invoiceTierIndicator = document.getElementById("invoiceTierIndicator");
const gstModeBadge = document.getElementById("gstModeBadge");
const whatsappShare = document.getElementById("whatsappShare");
const customerModeSelect = document.getElementById("customerModeSelect");
const customerCodePreview = document.getElementById("customerCodePreview");
const taxCodeHead = document.getElementById("taxCodeHead");
const taxRateHead = document.getElementById("taxRateHead");
const summaryTaxLabel = document.getElementById("summaryTaxLabel");
const standardFeaturesPanel = document.getElementById("standardFeaturesPanel");
const standardFeatureBadge = document.getElementById("standardFeatureBadge");
const standardFeatureHint = document.getElementById("standardFeatureHint");
const recurringInvoiceWrap = document.getElementById("recurringInvoiceWrap");
const recurringFrequencyWrap = document.getElementById("recurringFrequencyWrap");
const recurringNextDateWrap = document.getElementById("recurringNextDateWrap");
const recurringInvoiceToggle = document.getElementById("recurringInvoiceToggle");
const recurringFrequency = document.getElementById("recurringFrequency");
const recurringNextDate = document.getElementById("recurringNextDate");
const hideBrandingToggle = document.getElementById("hideBrandingToggle");

const previewCompany = document.getElementById("previewCompany");
const previewCompanyMeta = document.getElementById("previewCompanyMeta");
const previewCustomer = document.getElementById("previewCustomer");
const previewInvoiceNo = document.getElementById("previewInvoiceNo");
const previewDueDate = document.getElementById("previewDueDate");
const previewRows = document.getElementById("previewRows");
const previewSubtotal = document.getElementById("previewSubtotal");
const previewDiscount = document.getElementById("previewDiscount");
const previewTax = document.getElementById("previewTax");
const previewTotal = document.getElementById("previewTotal");
const previewNotes = document.getElementById("previewNotes");
const previewInvoiceDate = document.getElementById("previewInvoiceDate");
const previewPdfSubtotal = document.getElementById("previewPdfSubtotal");
const previewPdfDiscount = document.getElementById("previewPdfDiscount");
const previewPdfTax = document.getElementById("previewPdfTax");
const previewPdfTotal = document.getElementById("previewPdfTotal");
const previewPaymentInstructions = document.getElementById("previewPaymentInstructions");
const previewTerms = document.getElementById("previewTerms");

let companies = [];
let customers = [];
let subscriptions = [];
let invoices = [];
let businessWorkspaces = [];
let activeWorkspace = null;
let activePlanSummary = sessionContext?.session?.plan?.active || sessionContext?.session?.plan || null;
let lastSavedInvoice = null;
let customerMode = "";
let customerLocked = false;
let activePlanKey = sessionContext?.session?.plan?.active?.plan || sessionContext?.session?.plan?.plan || "free";

const currencyRules = {
  INR: {
    itemCodeLabel: "HSN/SAC",
    itemCodePlaceholder: "9983",
    taxRateLabel: "GST %",
    summaryTaxLabel: "GST",
    defaultRate: 18,
    modeLabel(company, placeOfSupply) {
      return resolveGstMode(company, placeOfSupply) === "intra" ? "CGST + SGST" : "IGST";
    },
  },
  USD: {
    itemCodeLabel: "Tax Code",
    itemCodePlaceholder: "Optional",
    taxRateLabel: "Sales Tax %",
    summaryTaxLabel: "Sales Tax",
    defaultRate: 0,
    modeLabel: () => "US sales/service tax",
  },
  EUR: {
    itemCodeLabel: "Tax Code",
    itemCodePlaceholder: "Optional",
    taxRateLabel: "VAT %",
    summaryTaxLabel: "VAT",
    defaultRate: 0,
    modeLabel: () => "EU VAT",
  },
  GBP: {
    itemCodeLabel: "Tax Code",
    itemCodePlaceholder: "Optional",
    taxRateLabel: "VAT %",
    summaryTaxLabel: "VAT",
    defaultRate: 0,
    modeLabel: () => "UK VAT",
  },
  AED: {
    itemCodeLabel: "Tax Code",
    itemCodePlaceholder: "Optional",
    taxRateLabel: "VAT %",
    summaryTaxLabel: "VAT",
    defaultRate: 5,
    modeLabel: () => "UAE VAT",
  },
};

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function selectedCurrency() {
  return currencySelect?.value || "INR";
}

function currentCurrencyRule() {
  return currencyRules[selectedCurrency()] || currencyRules.INR;
}

function currencySymbol(currency = selectedCurrency()) {
  return ({
    INR: "₹",
    USD: "$",
    EUR: "€",
    GBP: "£",
    AED: "AED",
  })[currency] || currency;
}

function moneyWithSymbol(value, currency = selectedCurrency()) {
  const symbol = currencySymbol(currency);
  return `${symbol} ${money(value)}`;
}

function currentPlan() {
  if (activePlanSummary?.plan) return String(activePlanSummary.plan || "free").toLowerCase();
  const active = subscriptions.slice().reverse().find((subscription) => {
    const status = String(subscription.status || "active").toLowerCase();
    return status === "active";
  });
  return String(active?.plan || activePlanKey || "free").toLowerCase();
}

function isUnlimitedLimit(value) {
  return Number(value) >= 999999;
}

function quotaMessage(label, used, limit) {
  const numericLimit = Number(limit || 0);
  if (isUnlimitedLimit(numericLimit)) return `${label}: unlimited`;
  const remaining = Math.max(0, numericLimit - Number(used || 0));
  return `${label}: ${remaining} left (${Number(used || 0)}/${numericLimit})`;
}

function renderInvoiceTierIndicator() {
  if (!invoiceTierIndicator) return;
  const planLabel = activePlanSummary?.label || currentPlan().replace(/^\w/, (letter) => letter.toUpperCase());
  const invoiceText = quotaMessage(
    "Invoices this month",
    activePlanSummary?.usage?.invoicesPerMonth,
    activePlanSummary?.limits?.invoicesPerMonth,
  );
  const aiLimit = Number(activePlanSummary?.limits?.aiCommandsPerMonth || 0);
  const aiText = aiLimit > 0
    ? quotaMessage("AI commands this month", activePlanSummary?.usage?.aiCommandsPerMonth, aiLimit)
    : "AI commands: upgrade to Pro";
  const gatewayText = canUseStandardFeatures()
    ? "WhatsApp, recurring drafts, and gateway collection are live"
    : "WhatsApp, recurring drafts, and gateway collection need Standard";
  invoiceTierIndicator.innerHTML = `
    <strong>${escapeHtml(planLabel)} tier</strong>
    <span>${escapeHtml(invoiceText)}</span>
    <span>${escapeHtml(aiText)}</span>
    <span>${escapeHtml(gatewayText)}</span>
  `;
}

function canUseWhatsappShare() {
  return workspaceCanWriteRecords() && ["standard", "pro", "business"].includes(currentPlan());
}

function canUseStandardFeatures() {
  return ["standard", "pro", "business"].includes(currentPlan());
}

function updateStandardFeatureControls() {
  const allowed = canUseStandardFeatures();
  if (standardFeaturesPanel) standardFeaturesPanel.dataset.locked = allowed ? "false" : "true";
  if (standardFeatureBadge) {
    standardFeatureBadge.className = `pill ${allowed ? "blue" : "gold"}`;
    standardFeatureBadge.textContent = allowed ? "Included" : "Upgrade";
  }
  if (standardFeatureHint) {
    standardFeatureHint.textContent = allowed
      ? "Standard features are active for this session. Recurring details are saved with the invoice and branding removal applies to print/PDF."
      : "Recurring drafts and branding removal are available on Standard and higher plans.";
  }
  renderInvoiceTierIndicator();
  [recurringInvoiceToggle, recurringFrequency, recurringNextDate, hideBrandingToggle].forEach((field) => {
    if (!field) return;
    field.disabled = !allowed;
    if (!allowed && field.type === "checkbox") field.checked = false;
  });
  [recurringInvoiceWrap, recurringFrequencyWrap, recurringNextDateWrap].forEach((node) => {
    if (node) node.hidden = false;
  });
  document.getElementById("documentPreview")?.classList.toggle("branding-removed", allowed && Boolean(hideBrandingToggle?.checked));
}

function setStatus(message) {
  if (status) status.textContent = message;
}

function selectedWorkspaceOwnerId() {
  return window.localStorage?.getItem("eazinvoice_business_workspace_owner") || "";
}

function resolveActiveWorkspace() {
  const selectedOwnerId = selectedWorkspaceOwnerId();
  activeWorkspace = businessWorkspaces.find((workspace) => workspace.ownerUserId === selectedOwnerId) || null;
  return activeWorkspace;
}

function activeWorkspaceIsSharedTeam() {
  return activeWorkspace?.source === "team";
}

function selectedWorkspaceRoleLabel() {
  const role = String(activeWorkspace?.role || "owner").replace(/_/g, " ");
  return role.charAt(0).toUpperCase() + role.slice(1);
}

function workspaceCanWriteRecords() {
  return !activeWorkspaceIsSharedTeam() || Boolean(activeWorkspace?.permissions?.writeRecords);
}

function workspaceOptions(extra = {}) {
  const workspace = resolveActiveWorkspace();
  return workspace?.ownerUserId ? { ...extra, workspaceOwnerUserId: workspace.ownerUserId } : extra;
}

function workspaceWriteLockMessage(action = "change records") {
  return `Your ${selectedWorkspaceRoleLabel()} role can view this Business workspace, but cannot ${action}.`;
}

function lockInvoiceFormForWorkspaceRole() {
  if (!form || workspaceCanWriteRecords()) return;
  form.querySelectorAll("input, select, textarea, button").forEach((field) => {
    field.disabled = true;
  });
  document.getElementById("printInvoice")?.removeAttribute("disabled");
  if (whatsappShare) {
    whatsappShare.setAttribute("aria-disabled", "true");
    whatsappShare.textContent = "WhatsApp Share (View only)";
  }
  setStatus(workspaceWriteLockMessage("edit or create invoices and PO/WO records"));
}

function guardWorkspaceWrite(action) {
  if (workspaceCanWriteRecords()) return true;
  setStatus(workspaceWriteLockMessage(action));
  return false;
}

function setNewCustomerStatus(message, tone = "") {
  if (!newCustomerStatus) return;
  newCustomerStatus.textContent = message;
  newCustomerStatus.dataset.tone = tone;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function lineBase(item) {
  return number(item.quantity) * number(item.rate);
}

function lineDiscount(item) {
  return Math.min(lineBase(item), Math.max(0, number(item.discount)));
}

function lineTaxable(item) {
  return Math.max(0, lineBase(item) - lineDiscount(item));
}

function lineTax(item) {
  return (lineTaxable(item) * number(item.gstRate)) / 100;
}

function lineTotal(item) {
  return lineTaxable(item) + lineTax(item);
}

function selectedCompany() {
  if (companySelect?.value === "__user__") return userIssuer();
  return companies.find((company) => company.id === companySelect?.value) || null;
}

function firstCompany() {
  return selectedCompany() || companies[0] || userIssuer();
}

function userIssuer() {
  if (!currentUser) return null;
  const initials = String(currentUser.name || currentUser.email || "Individual")
    .trim()
    .toUpperCase()
    .split(/[^A-Z0-9]+/)
    .filter(Boolean)
    .map((word) => word[0])
    .join("")
    .slice(0, 4) || "IND";
  return {
    id: "__user__",
    isUserIssuer: true,
    name: currentUser.name || currentUser.email || "Individual",
    legalName: "",
    companyCode: initials,
    entityType: "individual",
    panNumber: currentUser.panNumber || "",
    gstNumber: "",
    email: currentUser.email || "",
    phone: currentUser.phone || "",
    state: "",
    pincode: "",
  };
}

function selectedCustomer() {
  if (customerMode !== "existing") return null;
  return customers.find((customer) => customer.id === customerSelect?.value) || null;
}

function invoiceNumberValue() {
  return String(form?.querySelector('input[name="invoiceNumber"]')?.value || "").trim();
}

function issuerCode(company = selectedCompany()) {
  const raw = company?.companyCode || company?.name || currentUser?.name || "INV";
  const cleaned = String(raw)
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "");
  return cleaned.slice(0, 8) || "INV";
}

function generateDraftInvoiceNumber(company = selectedCompany()) {
  const nextNumber = String(invoices.length + 1).padStart(4, "0");
  const invoiceDate = form?.querySelector('input[name="invoiceDate"]')?.value || new Date().toISOString().slice(0, 10);
  const year = String(invoiceDate).slice(0, 4);
  return `${issuerCode(company)}/${year}/${nextNumber}`;
}

function ensureDraftInvoiceNumber() {
  if (lastSavedInvoice) return;
  const input = form?.querySelector('input[name="invoiceNumber"]');
  const company = selectedCompany();
  if (!input || !company) return;
  input.value = generateDraftInvoiceNumber(company);
}

function customerChoiceLocked() {
  return customerLocked || Boolean(invoiceNumberValue());
}

function setInvoiceEntryVisible(isVisible) {
  invoiceEntrySections.forEach((section) => {
    section.hidden = !isVisible;
  });
  if (isVisible) ensureDraftInvoiceNumber();
}

function subscriberType() {
  return currentUser?.subscriberType || (currentUser?.registrant ? "company" : "individual");
}

function isGroupUser() {
  return subscriberType() === "group";
}

function activeIssuer() {
  if (issuerCompanySelect?.value === "__user__") return userIssuer();
  return companies.find((company) => company.id === issuerCompanySelect?.value)
    || selectedCompany()
    || firstCompany();
}

function issuerNeedsSetup(company = activeIssuer()) {
  const type = subscriberType();
  if (!company) return true;
  if (company.isUserIssuer) return !currentUser?.panNumber;
  return type === "individual" ? !company.panNumber : (!company.panNumber || !company.gstNumber);
}

function setIssuerStatus(message, tone = "") {
  if (!issuerStatus) return;
  issuerStatus.textContent = message;
  issuerStatus.dataset.tone = tone;
}

function populateIssuerFields() {
  const company = activeIssuer();
  const isUser = company?.isUserIssuer;
  if (issuerCompanySelectWrap) issuerCompanySelectWrap.hidden = false;
  if (issuerGstWrap) issuerGstWrap.hidden = isUser || subscriberType() === "individual";
  if (issuerSetupHint) {
    issuerSetupHint.textContent = isUser
      ? "Your own registered name will be used as the invoice issuer. Add PAN before continuing."
      : isGroupUser()
        ? "Choose the company issuing this invoice and update PAN/GST before continuing."
        : "Choose your registered name or company name for this invoice. Company issuers need PAN/GST before continuing.";
  }
  if (issuerCompanySelect) {
    const own = userIssuer();
    issuerCompanySelect.innerHTML = [
      own ? `<option value="__user__">${escapeHtml(own.name)} (Individual)</option>` : "",
      ...companies.map((entry) => `<option value="${entry.id}">${escapeHtml(entry.legalName || entry.name || "Company")}</option>`),
    ].join("") || '<option value="">Create profile</option>';
    if (company?.id) issuerCompanySelect.value = company.id;
  }
  if (issuerNameInput) issuerNameInput.value = company?.legalName || company?.name || currentUser?.name || "";
  if (issuerPanInput) issuerPanInput.value = company?.panNumber || "";
  if (issuerGstInput) issuerGstInput.value = company?.gstNumber || "";
  if (issuerStateInput) issuerStateInput.value = company?.state || "";
  if (issuerEmailInput) issuerEmailInput.value = company?.email || currentUser?.email || "";
}

function maybeOpenIssuerSetup() {
  const customerReady = customerMode === "existing" && Boolean(customerSelect?.value);
  if (!customerReady) {
    if (issuerSetup) issuerSetup.hidden = true;
    setInvoiceEntryVisible(false);
    return;
  }
  populateIssuerFields();
  if (issuerNeedsSetup()) {
    if (issuerSetup) issuerSetup.hidden = false;
    setInvoiceEntryVisible(false);
    return;
  }
  if (issuerSetup) issuerSetup.hidden = true;
  const company = activeIssuer();
  if (companySelect && company?.id) companySelect.value = company.id;
  setInvoiceEntryVisible(true);
}

function customerNameInput() {
  return form?.querySelector('input[name="customerName"]') || null;
}

function customerAddressInput() {
  return form?.querySelector('textarea[name="customerBillingAddress"]') || null;
}

function newCustomerNameInput() {
  return form?.querySelector('input[name="newCustomerName"]') || null;
}

function newCustomerAddressInput() {
  return form?.querySelector('textarea[name="newCustomerBillingAddress"]') || null;
}

function fillBillToFromCustomer() {
  const customer = selectedCustomer();
  const nameInput = customerNameInput();
  const addressInput = customerAddressInput();
  if (!customer) {
    if (customerMode === "existing") {
      if (nameInput) nameInput.value = "";
      if (addressInput) addressInput.value = "";
    }
    if (customerCodePreview) customerCodePreview.textContent = customerMode === "existing" ? "No saved customer" : "New customer";
    renderPreview();
    return;
  }
  if (nameInput) nameInput.value = customer.businessName || customer.name || "";
  if (addressInput) addressInput.value = customer.billingAddress || customer.shippingAddress || "";
  if (customerCodePreview) customerCodePreview.textContent = customer.customerCode || customer.id || "Saved customer";
  renderPreview();
}

function setCustomerMode(nextMode, options = {}) {
  if (customerChoiceLocked() && !options.force) {
    setStatus("Customer cannot be changed after the invoice number is generated.");
    return;
  }
  customerMode = nextMode;
  if (customerModeSelect && customerModeSelect.value !== customerMode) {
    customerModeSelect.value = customerMode;
  }
  if (existingCustomerFields) existingCustomerFields.hidden = customerMode !== "existing";
  if (newCustomerFields) newCustomerFields.hidden = customerMode !== "new";
  if (customerModePrompt) customerModePrompt.hidden = customerMode === "existing" || customerMode === "new";
  if (savedCustomerWrap) savedCustomerWrap.hidden = customerMode !== "existing";
  if (customerSelect) customerSelect.disabled = customerMode !== "existing";
  const nameInput = customerNameInput();
  const addressInput = customerAddressInput();
  const newNameInput = newCustomerNameInput();
  const newAddressInput = newCustomerAddressInput();
  if (customerMode === "existing") {
    if (nameInput) nameInput.readOnly = true;
    if (addressInput) addressInput.readOnly = true;
    if (newNameInput) newNameInput.required = false;
    fillBillToFromCustomer();
    maybeOpenIssuerSetup();
  } else if (customerMode === "new") {
    if (customerSelect) customerSelect.value = "";
    if (nameInput) nameInput.value = "";
    if (addressInput) addressInput.value = "";
    if (newNameInput) {
      newNameInput.required = true;
      newNameInput.focus();
    }
    if (customerCodePreview) customerCodePreview.textContent = "New customer";
    updateNewCustomerTaxFields();
    setInvoiceEntryVisible(false);
    renderPreview();
  } else {
    if (customerSelect) customerSelect.value = "";
    if (nameInput) {
      nameInput.value = "";
      nameInput.readOnly = true;
    }
    if (addressInput) {
      addressInput.value = "";
      addressInput.readOnly = true;
    }
    if (newNameInput) newNameInput.required = false;
    if (customerCodePreview) customerCodePreview.textContent = "Choose customer";
    setInvoiceEntryVisible(false);
    renderPreview();
  }
}

function updateNewCustomerTaxFields() {
  const isInr = selectedCurrency() === "INR";
  const isCompany = newCustomerCategory?.value === "company";
  if (newCustomerNameLabel) newCustomerNameLabel.textContent = isCompany ? "Business Name" : "Customer Name";
  const showTaxIds = isInr && isCompany;
  if (newCustomerPanWrap) newCustomerPanWrap.hidden = !showTaxIds;
  if (newCustomerGstinWrap) newCustomerGstinWrap.hidden = !showTaxIds;
}

function clearNewCustomerFields() {
  ["newCustomerName", "newCustomerPhone", "newCustomerEmail", "newCustomerPan", "newCustomerGstin"].forEach((name) => {
    const input = form?.querySelector(`[name="${name}"]`);
    if (input) input.value = "";
  });
  const addressInput = newCustomerAddressInput();
  if (addressInput) addressInput.value = "";
}

function lockCustomerChoice() {
  customerLocked = true;
  customerModeSelect?.setAttribute("disabled", "disabled");
  customerSelect?.setAttribute("disabled", "disabled");
  existingCustomerFields?.querySelectorAll("input, textarea, select").forEach((field) => {
    field.setAttribute("disabled", "disabled");
  });
  newCustomerFields?.querySelectorAll("input, textarea, select").forEach((field) => {
    field.setAttribute("disabled", "disabled");
  });
  if (customerCodePreview) customerCodePreview.textContent = `${customerCodePreview.textContent || "Customer"} locked`;
}

function itemCatalog() {
  const catalog = new Map();
  [
    { description: "Consulting Services", hsnSac: "9983", quantity: 1, rate: 0, discount: 0, gstRate: currentCurrencyRule().defaultRate },
    { description: "Website Design", hsnSac: "9983", quantity: 1, rate: 15000, discount: 0, gstRate: currentCurrencyRule().defaultRate },
  ].forEach((item) => catalog.set(item.description.toLowerCase(), item));
  invoices.forEach((invoice) => {
    (invoice.items || []).forEach((item) => {
      if (item.description) catalog.set(String(item.description).toLowerCase(), item);
    });
  });
  return [...catalog.values()];
}

function renderItemSuggestions() {
  if (!itemSuggestions) return;
  itemSuggestions.innerHTML = itemCatalog()
    .map((item) => `<option value="${escapeHtml(item.description)}"></option>`)
    .join("");
}

function applyItemSuggestion(row) {
  const description = row.querySelector('input[name="description"]')?.value.trim().toLowerCase();
  const match = itemCatalog().find((item) => String(item.description || "").trim().toLowerCase() === description);
  if (!match) return;
  const hsn = row.querySelector('input[name="hsnSac"]');
  const qty = row.querySelector('input[name="quantity"]');
  const rate = row.querySelector('input[name="rate"]');
  const gst = row.querySelector('input[name="gstRate"]');
  if (hsn && !hsn.value) hsn.value = match.hsnSac || "";
  if (qty && number(qty.value) === 0) qty.value = String(match.quantity || 1);
  if (rate && number(rate.value) === 0) rate.value = String(match.rate || 0);
  if (gst && number(gst.value) === currentCurrencyRule().defaultRate) gst.value = String(match.gstRate ?? currentCurrencyRule().defaultRate);
}

function createItemRow(data = {}) {
  const row = document.createElement("div");
  row.className = "workflow-item-row";
  const rule = currentCurrencyRule();
  row.innerHTML = `
    <label><span>Item Name</span><input name="description" value="${escapeHtml(data.description || "")}" placeholder="Website design" required /></label>
    <label><span data-tax-code-label>${rule.itemCodeLabel}</span><input name="hsnSac" value="${escapeHtml(data.hsnSac || "")}" placeholder="${escapeHtml(rule.itemCodePlaceholder)}" /></label>
    <label><span>Qty</span><input name="quantity" type="number" min="0" step="0.01" value="${data.quantity || 1}" /></label>
    <label><span>Rate / Amt</span><input name="rate" type="number" min="0" step="0.01" value="${data.rate || 0}" /></label>
    <label><span>Discount Amt</span><input name="discount" type="number" min="0" step="0.01" value="${data.discount || 0}" /></label>
    <label><span data-tax-rate-label>${rule.taxRateLabel}</span><input name="gstRate" type="number" min="0" step="0.01" value="${data.gstRate ?? rule.defaultRate}" /></label>
    <output class="line-total">0.00</output>
    <button class="ghost small" type="button">Remove</button>
  `;
  const updateLine = () => {
    const item = readItemRow(row);
    const output = row.querySelector(".line-total");
    if (output) output.textContent = moneyWithSymbol(lineTotal(item));
    renderPreview();
  };
  row.querySelector("button")?.addEventListener("click", () => {
    row.remove();
    renderPreview();
  });
  const descriptionInput = row.querySelector('input[name="description"]');
  if (descriptionInput) {
    descriptionInput.setAttribute("list", "itemSuggestions");
    descriptionInput.addEventListener("change", () => {
      applyItemSuggestion(row);
      updateLine();
    });
  }
  row.querySelectorAll("input").forEach((input) => input.addEventListener("input", updateLine));
  window.setTimeout(updateLine, 0);
  return row;
}

function readItemRow(row) {
  return {
    description: row.querySelector('input[name="description"]').value,
    hsnSac: row.querySelector('input[name="hsnSac"]').value,
    quantity: number(row.querySelector('input[name="quantity"]').value),
    rate: number(row.querySelector('input[name="rate"]').value),
    discount: number(row.querySelector('input[name="discount"]').value),
    gstRate: number(row.querySelector('input[name="gstRate"]').value),
  };
}

function readItems() {
  return [...itemsEl.querySelectorAll(".workflow-item-row")].map(readItemRow);
}

function totals(items, data) {
  const subtotal = items.reduce((sum, item) => sum + lineBase(item), 0);
  const itemDiscount = items.reduce((sum, item) => sum + lineDiscount(item), 0);
  const discount = itemDiscount;
  const tax = items.reduce((sum, item) => {
    const taxable = lineTaxable(item);
    return sum + (taxable * item.gstRate) / 100;
  }, 0);
  const taxableAmount = Math.max(0, subtotal - discount);
  const total = taxableAmount + tax;
  return { subtotal, discount, tax, total };
}

function resolveGstMode(company, placeOfSupply) {
  const companyState = String(company?.state || "").trim().toLowerCase();
  const supplyState = String(placeOfSupply || "").trim().toLowerCase();
  if (!companyState || !supplyState || companyState === supplyState) return "intra";
  return "inter";
}

function customerNameFromForm(data, mode = customerMode, customer = selectedCustomer()) {
  if (mode === "new") return data.get("newCustomerName") || "Customer";
  return data.get("customerName") || customer?.businessName || customer?.name || "Customer";
}

function customerAddressFromForm(data, mode = customerMode, customer = selectedCustomer()) {
  if (mode === "new") return data.get("newCustomerBillingAddress") || "";
  return data.get("customerBillingAddress") || customer?.billingAddress || customer?.shippingAddress || "";
}

function renderPreview() {
  ensureDraftInvoiceNumber();
  const data = new FormData(form);
  const company = selectedCompany();
  const items = readItems();
  const total = totals(items, data);
  const rule = currentCurrencyRule();
  if (gstModeBadge) gstModeBadge.textContent = rule.modeLabel(company, data.get("placeOfSupply"));
  if (previewCompany) previewCompany.textContent = company?.legalName || company?.name || "Your Business";
  if (previewCompanyMeta) previewCompanyMeta.textContent = [company?.gstNumber, company?.state, company?.pincode].filter(Boolean).join(" | ") || "Business details";
  if (previewCustomer) previewCustomer.textContent = customerNameFromForm(data);
  if (previewInvoiceNo) previewInvoiceNo.textContent = data.get("invoiceNumber") || "Auto";
  if (previewInvoiceDate) previewInvoiceDate.textContent = data.get("invoiceDate") || "-";
  if (previewDueDate) previewDueDate.textContent = data.get("dueDate") || "-";
  if (previewRows) {
    previewRows.innerHTML = items.map((item) => `
      <tr>
        <td>${escapeHtml(item.description || "-")}</td>
        <td>${escapeHtml(item.hsnSac || "-")}</td>
        <td>${item.quantity}</td>
        <td>${moneyWithSymbol(item.rate)}</td>
        <td>${moneyWithSymbol(item.discount || 0)}</td>
        <td>${item.gstRate}</td>
        <td>${moneyWithSymbol(lineTotal(item))}</td>
      </tr>
    `).join("");
  }
  if (previewSubtotal) previewSubtotal.textContent = moneyWithSymbol(total.subtotal);
  if (previewDiscount) previewDiscount.textContent = moneyWithSymbol(total.discount);
  if (previewTax) previewTax.textContent = moneyWithSymbol(total.tax);
  if (previewTotal) previewTotal.textContent = moneyWithSymbol(total.total);
  if (previewPdfSubtotal) previewPdfSubtotal.textContent = moneyWithSymbol(total.subtotal);
  if (previewPdfDiscount) previewPdfDiscount.textContent = moneyWithSymbol(total.discount);
  if (previewPdfTax) previewPdfTax.textContent = moneyWithSymbol(total.tax);
  if (previewPdfTotal) previewPdfTotal.textContent = moneyWithSymbol(total.total);
  if (previewPaymentInstructions) previewPaymentInstructions.textContent = data.get("paymentInstructions") || "-";
  if (previewTerms) previewTerms.textContent = data.get("terms") || "-";
  if (previewNotes) previewNotes.textContent = data.get("paymentInstructions") || "";
  document.getElementById("documentPreview")?.classList.toggle("branding-removed", canUseStandardFeatures() && Boolean(hideBrandingToggle?.checked));
  updateWhatsappShare(total, data);
}

async function ensureInvoiceCustomer(data, companyId) {
  if (!guardWorkspaceWrite("create customers while saving invoices")) {
    throw new Error(workspaceWriteLockMessage("create customers while saving invoices"));
  }
  if (customerMode !== "existing" && customerMode !== "new") {
    throw new Error("Choose Existing Customer or New Customer before saving the invoice.");
  }
  const existing = selectedCustomer();
  if (existing) return existing;
  const name = String(data.get("newCustomerName") || "").trim();
  if (!name) throw new Error("Enter the new customer's name before saving the invoice.");
  const customer = await apiClient.createCustomer(token, {
    ...workspaceOptions(),
    companyId,
    name,
    gstNumber: data.get("newCustomerGstin"),
    phone: data.get("newCustomerPhone"),
    email: data.get("newCustomerEmail"),
    billingAddress: data.get("newCustomerBillingAddress"),
  });
  customers.push(customer);
  populateSelects();
  customerMode = "existing";
  if (customerSelect) customerSelect.value = customer.id;
  setCustomerMode("existing", { force: true });
  if (customerCodePreview) customerCodePreview.textContent = customer.customerCode || customer.id;
  return customer;
}

async function addNewCustomerToList() {
  if (!guardWorkspaceWrite("create customers")) {
    setNewCustomerStatus(workspaceWriteLockMessage("create customers"), "error");
    return null;
  }
  const company = firstCompany();
  const data = new FormData(form);
  const name = String(data.get("newCustomerName") || "").trim();
  if (!name) {
    setNewCustomerStatus("Enter the new customer's name before adding.", "error");
    newCustomerNameInput()?.focus();
    return null;
  }
  try {
    addNewCustomerBtn?.setAttribute("disabled", "disabled");
    setNewCustomerStatus("Adding customer...", "");
    const customer = await apiClient.createCustomer(token, {
      ...workspaceOptions(),
      companyId: company?.id || null,
      name,
      businessName: newCustomerCategory?.value === "company" ? name : "",
      phone: data.get("newCustomerPhone"),
      email: data.get("newCustomerEmail"),
      gstNumber: selectedCurrency() === "INR" && newCustomerCategory?.value === "company" ? data.get("newCustomerGstin") : "",
      panNumber: selectedCurrency() === "INR" && newCustomerCategory?.value === "company" ? data.get("newCustomerPan") : "",
      billingAddress: data.get("newCustomerBillingAddress"),
    });
    customers.push(customer);
    populateSelects();
    if (customerSelect) customerSelect.value = customer.id;
    setCustomerMode("existing", { force: true });
    setInvoiceEntryVisible(true);
    fillBillToFromCustomer();
    clearNewCustomerFields();
    const message = `Customer ${customer.customerCode || customer.id} added and selected. Continue the invoice below.`;
    setNewCustomerStatus(message, "success");
    setStatus(message);
    return customer;
  } catch (error) {
    setNewCustomerStatus(error.message || "Could not add customer.", "error");
    return null;
  } finally {
    addNewCustomerBtn?.removeAttribute("disabled");
  }
}

function updateTaxLabels() {
  const rule = currentCurrencyRule();
  if (taxCodeHead) taxCodeHead.textContent = rule.itemCodeLabel;
  if (taxRateHead) taxRateHead.textContent = rule.taxRateLabel;
  if (summaryTaxLabel) summaryTaxLabel.textContent = rule.summaryTaxLabel;
  itemsEl?.querySelectorAll("[data-tax-code-label]").forEach((node) => {
    node.textContent = rule.itemCodeLabel;
  });
  itemsEl?.querySelectorAll("[data-tax-rate-label]").forEach((node) => {
    node.textContent = rule.taxRateLabel;
  });
  itemsEl?.querySelectorAll('input[name="hsnSac"]').forEach((input) => {
    input.placeholder = rule.itemCodePlaceholder;
  });
  renderPreview();
}

function updateWhatsappShare(total, data) {
  const shareText = lastSavedInvoice
    ? `Invoice ${lastSavedInvoice.invoiceNumber} for ${customerNameFromForm(data)}: ${selectedCurrency()} ${money(lastSavedInvoice.total)}`
    : `Draft invoice for ${customerNameFromForm(data)}: ${selectedCurrency()} ${money(total.total)}`;
  if (!whatsappShare) return;
  if (canUseWhatsappShare()) {
    whatsappShare.href = `https://wa.me/?text=${encodeURIComponent(shareText)}`;
    whatsappShare.removeAttribute("aria-disabled");
    whatsappShare.textContent = "WhatsApp Share";
  } else {
    whatsappShare.href = "#";
    whatsappShare.setAttribute("aria-disabled", "true");
    whatsappShare.textContent = "WhatsApp Share (Paid)";
  }
}

function populateSelects() {
  if (companySelect) {
    const own = userIssuer();
    companySelect.innerHTML = [
      '<option value="">Select invoice issuer</option>',
      own ? `<option value="__user__">${escapeHtml(own.name)} (Individual)</option>` : "",
      ...companies.map((company) => `<option value="${company.id}">${escapeHtml(company.legalName || company.name)}</option>`),
    ].join("");
  }
  if (issuerCompanySelect) {
    const own = userIssuer();
    issuerCompanySelect.innerHTML = [
      own ? `<option value="__user__">${escapeHtml(own.name)} (Individual)</option>` : "",
      ...companies.map((company) => `<option value="${company.id}">${escapeHtml(company.legalName || company.name || "Business")}</option>`),
    ].join("") || "<option value=\"\">Create profile</option>";
  }
  if (customerSelect) {
    customerSelect.innerHTML = customers.length
      ? customers.map((customer) => {
        const code = customer.customerCode || customer.id;
        const label = [code, customer.businessName || customer.name].filter(Boolean).join(" - ");
        return `<option value="${customer.id}">${escapeHtml(label)}</option>`;
      }).join("")
      : "<option value=\"\">No saved customers yet</option>";
  }
}

addItem?.addEventListener("click", () => {
  if (!guardWorkspaceWrite("add invoice or PO/WO items")) return;
  itemsEl.appendChild(createItemRow());
  renderPreview();
});

form?.addEventListener("input", renderPreview);
companySelect?.addEventListener("change", () => {
  if (!lastSavedInvoice) {
    const invoiceNumberInput = form?.querySelector('input[name="invoiceNumber"]');
    if (invoiceNumberInput) invoiceNumberInput.value = "";
  }
  renderPreview();
});
currencySelect?.addEventListener("change", () => {
  const rule = currentCurrencyRule();
  itemsEl?.querySelectorAll('input[name="gstRate"]').forEach((input) => {
    input.value = String(rule.defaultRate);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  updateNewCustomerTaxFields();
  updateTaxLabels();
});
customerSelect?.addEventListener("change", fillBillToFromCustomer);
customerModeSelect?.addEventListener("change", () => setCustomerMode(customerModeSelect.value));
newCustomerCategory?.addEventListener("change", updateNewCustomerTaxFields);
addNewCustomerBtn?.addEventListener("click", addNewCustomerToList);
cancelNewCustomerBtn?.addEventListener("click", () => setCustomerMode("", { force: true }));
recurringInvoiceToggle?.addEventListener("change", renderPreview);
recurringFrequency?.addEventListener("change", renderPreview);
recurringNextDate?.addEventListener("change", renderPreview);
hideBrandingToggle?.addEventListener("change", renderPreview);
issuerCompanySelect?.addEventListener("change", () => {
  populateIssuerFields();
  maybeOpenIssuerSetup();
});
updateIssuerBtn?.addEventListener("click", async () => {
  if (!guardWorkspaceWrite("update issuer profiles")) return;
  const name = issuerNameInput?.value.trim() || currentUser?.name || "My Business";
  const panNumber = issuerPanInput?.value.trim() || "";
  const gstNumber = issuerGstInput?.value.trim() || "";
  const existing = activeIssuer();
  const isUser = existing?.isUserIssuer;
  if (!panNumber) {
    setIssuerStatus("PAN number is required before continuing.", "error");
    return;
  }
  if (!isUser && !gstNumber) {
    setIssuerStatus("GST number is required for company profiles before continuing.", "error");
    return;
  }
  const payload = {
    profilePurpose: "onboarding",
    entityType: isUser ? "freelancer" : "company",
    name,
    legalName: isUser ? "" : name,
    panNumber,
    gstNumber: isUser ? "" : gstNumber,
    state: issuerStateInput?.value || "",
    email: issuerEmailInput?.value || currentUser?.email || "",
  };
  try {
    updateIssuerBtn.setAttribute("disabled", "disabled");
    setIssuerStatus("Updating issuer profile...", "");
    const company = isUser
      ? (currentUser = (await apiClient.updateMe(token, { name, panNumber })).user, userIssuer())
      : existing?.id
      ? await apiClient.updateCompany(token, existing.id, payload, workspaceOptions())
      : await apiClient.createCompany(token, { ...payload, ...workspaceOptions() });
    if (!company.isUserIssuer) {
      const index = companies.findIndex((entry) => entry.id === company.id);
      if (index >= 0) companies[index] = company;
      else companies.push(company);
    }
    populateSelects();
    if (companySelect) companySelect.value = company.id;
    if (issuerCompanySelect) issuerCompanySelect.value = company.id;
    if (issuerSetup) issuerSetup.hidden = true;
    setInvoiceEntryVisible(true);
    setIssuerStatus("Issuer profile updated. Continue the invoice below.", "success");
  } catch (error) {
    setIssuerStatus(error.message || "Could not update issuer profile.", "error");
  } finally {
    updateIssuerBtn.removeAttribute("disabled");
  }
});
document.getElementById("printInvoice")?.addEventListener("click", () => window.print());
whatsappShare?.addEventListener("click", (event) => {
  if (canUseWhatsappShare()) return;
  event.preventDefault();
  setStatus(workspaceCanWriteRecords()
    ? "WhatsApp sharing is available on Standard and higher plans. Please upgrade to use this feature."
    : workspaceWriteLockMessage("share invoices externally"));
});

form?.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!guardWorkspaceWrite("save invoice drafts")) return;
  const data = new FormData(form);
  const company = selectedCompany();
  if (!company) {
    if (status) status.textContent = "Select your registered name or company before saving an invoice.";
    return;
  }
  try {
    const originalCustomerMode = customerMode;
    const customer = selectedCustomer();
    const issuerCompanyId = company.isUserIssuer ? null : company.id;
    const invoiceCustomer = customer || await ensureInvoiceCustomer(data, issuerCompanyId);
    const gstMode = resolveGstMode(company, data.get("placeOfSupply"));
    lastSavedInvoice = await apiClient.createInvoice(token, {
      ...workspaceOptions(),
      companyId: issuerCompanyId,
      customerId: invoiceCustomer?.id || null,
      invoiceNumber: data.get("invoiceNumber"),
      status: "draft",
      invoiceDate: data.get("invoiceDate"),
      dueDate: data.get("dueDate"),
      currency: data.get("currency"),
      paymentTerms: data.get("paymentTerms"),
      placeOfSupply: data.get("placeOfSupply"),
      taxRate: 0,
      gstMode,
      discount: 0,
      shipping: 0,
      roundOff: 0,
      modeOfDelivery: data.get("modeOfDelivery"),
      modeOfPayment: data.get("modeOfPayment"),
      notes: "",
      paymentInstructions: data.get("paymentInstructions"),
      terms: data.get("terms"),
      recurringEnabled: canUseStandardFeatures() && data.get("recurringEnabled") === "on",
      recurringFrequency: canUseStandardFeatures() ? data.get("recurringFrequency") : "",
      recurringNextDate: canUseStandardFeatures() ? data.get("recurringNextDate") : "",
      hideEazinvoiceBranding: canUseStandardFeatures() && data.get("hideEazinvoiceBranding") === "on",
      billToName: customerNameFromForm(data, originalCustomerMode, invoiceCustomer),
      billToAddress: customerAddressFromForm(data, originalCustomerMode, invoiceCustomer),
      items: readItems(),
    });
    const invoiceNumberInput = form?.querySelector('input[name="invoiceNumber"]');
    if (invoiceNumberInput) invoiceNumberInput.value = lastSavedInvoice.invoiceNumber || "";
    lockCustomerChoice();
    if (status) {
      status.innerHTML = `Saved draft ${lastSavedInvoice.invoiceNumber}. <a href="/apps/web/dashboard.html#invoices">View it in Invoice Summary</a>`;
    }
    renderPreview();
  } catch (error) {
    if (status) status.textContent = error.message;
  }
});

async function initializeInvoicePage() {
  app?.removeAttribute("hidden");
  const today = new Date().toISOString().slice(0, 10);
  const due = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  form?.querySelector('input[name="invoiceDate"]')?.setAttribute("value", today);
  form?.querySelector('input[name="dueDate"]')?.setAttribute("value", due);

  try {
    const [planSummary, loadedWorkspaces, loadedSubscriptions] = await Promise.all([
      apiClient.getPlan(token).catch(() => null),
      apiClient.listBusinessWorkspaces(token).catch(() => []),
      apiClient.listMySubscriptions(token).catch(() => []),
    ]);
    activePlanSummary = planSummary || activePlanSummary;
    businessWorkspaces = Array.isArray(loadedWorkspaces) ? loadedWorkspaces : [];
    const loadOptions = workspaceOptions();
    const [loadedCompanies, loadedCustomers, loadedInvoices] = await Promise.all([
      apiClient.listCompanies(token, loadOptions).catch(() => []),
      apiClient.listCustomers(token, loadOptions).catch(() => []),
      apiClient.listInvoices(token, loadOptions).catch(() => []),
    ]);
    companies = loadedCompanies;
    customers = loadedCustomers;
    invoices = loadedInvoices;
    subscriptions = loadedSubscriptions;
    populateSelects();
    renderItemSuggestions();
    setCustomerMode("", { force: true });
    updateNewCustomerTaxFields();
    if (!itemsEl?.querySelector(".workflow-item-row")) {
      itemsEl?.appendChild(createItemRow({ description: "Website design", hsnSac: "9983", quantity: 1, rate: 15000, discount: 0, gstRate: 18 }));
    }
    updateTaxLabels();
    updateStandardFeatureControls();
    renderPreview();
    lockInvoiceFormForWorkspaceRole();
    if (status && !companies.length && workspaceCanWriteRecords()) {
      status.textContent = "You can raise invoices using your registered name. Add PAN if asked before continuing.";
    }
  } catch (error) {
    setStatus(error.message || "Could not load invoice data. Please refresh or login again.");
  }
}

initializeInvoicePage();
