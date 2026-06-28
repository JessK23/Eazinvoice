import { apiClient, clearToken, money, mountAdminPlanPreview, requireSession } from "./common.js?v=20260601-session";

const sessionContext = await requireSession();
const token = sessionContext?.token;
const currentUser = sessionContext?.session?.user;
if (!token) throw new Error("Authentication required");
mountAdminPlanPreview(sessionContext);
document.getElementById("appShell")?.removeAttribute("hidden");

const planSummary = document.getElementById("planSummary");
const planEntitlements = document.getElementById("planEntitlements");
const tierIndicatorBanner = document.getElementById("tierIndicatorBanner");
const adminNavLink = document.getElementById("adminNavLink");
const adminSideLink = document.getElementById("adminSideLink");
const profileMenuButton = document.getElementById("profileMenuButton");
const profileDropdown = document.getElementById("profileDropdown");
const profileInitials = document.getElementById("profileInitials");
const profileDisplayName = document.getElementById("profileDisplayName");
const profileDisplayMeta = document.getElementById("profileDisplayMeta");
const profileDropdownName = document.getElementById("profileDropdownName");
const profileDropdownEmail = document.getElementById("profileDropdownEmail");
const profileAdminLink = document.getElementById("profileAdminLink");
const profileLogoutBtn = document.getElementById("profileLogoutBtn");
const orgLogo = document.getElementById("orgLogo");
const orgName = document.getElementById("orgName");
const orgMeta = document.getElementById("orgMeta");
const orgKyc = document.getElementById("orgKyc");
const reportsList = document.getElementById("reportsList");
const subscriptionArea = document.getElementById("subscriptionArea");
const subscriptionHistory = document.getElementById("subscriptionHistory");
const currentPlanBadge = document.getElementById("currentPlanBadge");
const subscriptionStatus = document.getElementById("subscriptionStatus");
const totalInvoices = document.getElementById("totalInvoices");
const paidAmount = document.getElementById("paidAmount");
const unpaidAmount = document.getElementById("unpaidAmount");
const overdueCount = document.getElementById("overdueCount");
const monthlyRevenue = document.getElementById("monthlyRevenue");
const pendingPayments = document.getElementById("pendingPayments");
const recentActivity = document.getElementById("recentActivity");
const draftInvoiceCount = document.getElementById("draftInvoiceCount");
const createdInvoiceCount = document.getElementById("createdInvoiceCount");
const invoiceRevenueTotal = document.getElementById("invoiceRevenueTotal");
const draftInvoicesList = document.getElementById("draftInvoicesList");
const createdInvoicesList = document.getElementById("createdInvoicesList");
const runRecurringDraftsBtn = document.getElementById("runRecurringDraftsBtn");
const recurringDraftStatus = document.getElementById("recurringDraftStatus");
const draftPoCount = document.getElementById("draftPoCount");
const createdPoCount = document.getElementById("createdPoCount");
const poValueTotal = document.getElementById("poValueTotal");
const draftPoList = document.getElementById("draftPoList");
const createdPoList = document.getElementById("createdPoList");
const reportIncomeTotal = document.getElementById("reportIncomeTotal");
const reportExpenseTotal = document.getElementById("reportExpenseTotal");
const reportProfitTotal = document.getElementById("reportProfitTotal");
const reportMonth = document.getElementById("reportMonth");
const reportYear = document.getElementById("reportYear");
const paymentModal = document.getElementById("paymentModal");
const paymentForm = document.getElementById("paymentForm");
const paymentModalClose = document.getElementById("paymentModalClose");
const paymentModalCancel = document.getElementById("paymentModalCancel");
const paymentModalStatus = document.getElementById("paymentModalStatus");
const paymentModalInvoiceMeta = document.getElementById("paymentModalInvoiceMeta");
const paymentModalSummary = document.getElementById("paymentModalSummary");
const paymentHistoryList = document.getElementById("paymentHistoryList");
const paymentInvoiceId = document.getElementById("paymentInvoiceId");
const paymentAmountInput = document.getElementById("paymentAmountInput");
const paymentDateInput = document.getElementById("paymentDateInput");
const paymentModeInput = document.getElementById("paymentModeInput");
const paymentReferenceInput = document.getElementById("paymentReferenceInput");
const paymentNotesInput = document.getElementById("paymentNotesInput");
const paymentSubmitButton = document.getElementById("paymentSubmitButton");
const dashboardPages = document.querySelectorAll("[data-dashboard-page]");
const dashboardPageLinks = document.querySelectorAll("[data-page-link]");
const businessProfilesList = document.getElementById("businessProfilesList");
const customersList = document.getElementById("customersList");
const vendorsList = document.getElementById("vendorsList");
const reportDetailBadge = document.getElementById("reportDetailBadge");
const reportDetailTitle = document.getElementById("reportDetailTitle");
const detailReportPeriod = document.getElementById("detailReportPeriod");
const detailReportMonth = document.getElementById("detailReportMonth");
const detailReportYear = document.getElementById("detailReportYear");
const detailFinancialYear = document.getElementById("detailFinancialYear");
const detailStartDate = document.getElementById("detailStartDate");
const detailEndDate = document.getElementById("detailEndDate");
const reportDetailMetrics = document.getElementById("reportDetailMetrics");
const reportDetailHead = document.getElementById("reportDetailHead");
const reportDetailBody = document.getElementById("reportDetailBody");
const reportDetailChart = document.getElementById("reportDetailChart");
const reportDetailChartTitle = document.getElementById("reportDetailChartTitle");
const reportDetailChartBadge = document.getElementById("reportDetailChartBadge");
const mainRevenueChart = document.getElementById("mainRevenueChart");
const mainProfitChart = document.getElementById("mainProfitChart");
const detailFilterFields = document.querySelectorAll("[data-report-filter]");
const aiAssistantPanel = document.getElementById("aiAssistantPanel");
const aiAssistantPlanBadge = document.getElementById("aiAssistantPlanBadge");
const aiCommandInput = document.getElementById("aiCommandInput");
const aiCommandRun = document.getElementById("aiCommandRun");
const aiInvoiceExample = document.getElementById("aiInvoiceExample");
const aiPoExample = document.getElementById("aiPoExample");
const aiReportExample = document.getElementById("aiReportExample");
const aiVoiceButton = document.getElementById("aiVoiceButton");
const aiAssistantStatus = document.getElementById("aiAssistantStatus");
const aiAssistantResult = document.getElementById("aiAssistantResult");
const businessWorkspaceBadge = document.getElementById("businessWorkspaceBadge");
const businessWorkspaceNotice = document.getElementById("businessWorkspaceNotice");
const businessWorkspaceNavGroup = document.getElementById("businessWorkspaceNavGroup");
const teamMemberCount = document.getElementById("teamMemberCount");
const approvalRequestCount = document.getElementById("approvalRequestCount");
const apiKeyCount = document.getElementById("apiKeyCount");
const teamInviteForm = document.getElementById("teamInviteForm");
const teamInviteStatus = document.getElementById("teamInviteStatus");
const teamMembersList = document.getElementById("teamMembersList");
const businessEmailSettingsForm = document.getElementById("businessEmailSettingsForm");
const businessEmailTestButton = document.getElementById("businessEmailTestButton");
const businessEmailStatus = document.getElementById("businessEmailStatus");
const businessPaymentSettingsForm = document.getElementById("businessPaymentSettingsForm");
const businessPaymentStatus = document.getElementById("businessPaymentStatus");
const businessComplianceForm = document.getElementById("businessComplianceForm");
const businessComplianceStatus = document.getElementById("businessComplianceStatus");
const smtpConfiguredBadge = document.getElementById("smtpConfiguredBadge");
const businessGatewayBadge = document.getElementById("businessGatewayBadge");
const apiKeyForm = document.getElementById("apiKeyForm");
const apiKeyStatus = document.getElementById("apiKeyStatus");
const apiKeysList = document.getElementById("apiKeysList");
const approvalRequestForm = document.getElementById("approvalRequestForm");
const approvalRequestStatus = document.getElementById("approvalRequestStatus");
const approvalRequestsList = document.getElementById("approvalRequestsList");
const workspaceTargetLinks = document.querySelectorAll("[data-workspace-target]");
const workspaceGroups = document.querySelectorAll(".workspace-group");

let planCatalog = [
  { id: "free", label: "Free", amount: 0, monthlyAmount: 0, annualAmount: 0, billingCycle: "yearly", description: "Basic invoice creation and tracking", features: ["1 company", "limited invoices", "basic reports", "dashboard access", "free WordPress CTA plugin"] },
  { id: "standard", label: "Standard", amount: 499, monthlyAmount: 499, discountedAmount: 299, annualAmount: 5988, discountedAnnualAmount: 3588, billingCycle: "yearly", description: "For growing small businesses", features: ["more invoices", "better reports", "company branding", "WordPress Pro for 1 website"] },
  { id: "pro", label: "Pro", amount: 999, monthlyAmount: 999, discountedAmount: 699, annualAmount: 11988, discountedAnnualAmount: 8388, billingCycle: "yearly", description: "For teams and frequent billing", features: ["higher limits", "more reports", "multi-user ready", "WordPress Pro for up to 3 websites"] },
  { id: "business", label: "Business", amount: 1999, monthlyAmount: 1999, discountedAmount: 1499, annualAmount: 23988, discountedAnnualAmount: 17988, billingCycle: "yearly", description: "For teams, approvals, API access, and analytics", features: ["team access", "approval workflows", "API access", "advanced analytics"] },
];

let currentSubscription = { plan: "free", amount: 0, status: "active" };
let activePlanSummary = { plan: "free", label: "Free", amount: 0, features: {}, subscription: currentSubscription };
let dashboardInvoices = [];
let dashboardCompanies = [];
let dashboardPurchaseOrders = [];
let dashboardCustomers = [];
let dashboardPayments = [];
let dashboardTeamMembers = [];
let dashboardApprovalRequests = [];
let dashboardApiKeys = [];
let dashboardBusinessSettings = { emailSettings: {}, paymentSettings: {}, complianceProfile: {} };
let razorpayCheckoutPromise = null;
let pendingAiDraftCommand = null;
let pendingAiDraftResult = null;
let aiThinkingMessage = null;

const FEATURE_GATES = [
  { key: "basicInvoices", label: "Invoice creation", upgrade: "Free" },
  { key: "pdfPrint", label: "PDF and print", upgrade: "Free" },
  { key: "manualPayments", label: "Manual payment tracking", upgrade: "Free" },
  { key: "whatsappShare", label: "WhatsApp sharing", upgrade: "Standard" },
  { key: "razorpayCollections", label: "Razorpay collection links", upgrade: "Standard" },
  { key: "recurringInvoices", label: "Recurring auto-drafts", upgrade: "Standard" },
  { key: "aiInvoiceAssist", label: "AI invoice assistant", upgrade: "Pro" },
  { key: "aiPoAssist", label: "AI PO / WO assistant", upgrade: "Pro" },
  { key: "advancedReports", label: "Advanced reports", upgrade: "Pro" },
  { key: "multiBusiness", label: "Multiple businesses", upgrade: "Pro" },
  { key: "teamAccess", label: "Team access", upgrade: "Business" },
  { key: "approvals", label: "Approval workflow", upgrade: "Business" },
  { key: "apiAccess", label: "API access", upgrade: "Business" },
];

const LIMIT_LABELS = {
  companies: "Business profiles",
  customers: "Customers",
  invoicesPerMonth: "Invoices this month",
  invoiceItemsPerInvoice: "Items per invoice",
  templates: "Templates",
  aiCommandsPerMonth: "AI commands this month",
};

function currentDashboardPage() {
  const page = (window.location.hash || "#reports").replace(/^#/, "");
  const supported = new Set([...dashboardPages].map((section) => section.getAttribute("data-dashboard-page")));
  if (page.startsWith("report-")) return page;
  return supported.has(page) ? page : "reports";
}

function showDashboardPage(page = currentDashboardPage()) {
  const visiblePage = page.startsWith("report-") ? "report-detail" : page;
  dashboardPages.forEach((section) => {
    section.hidden = section.getAttribute("data-dashboard-page") !== visiblePage;
  });
  dashboardPageLinks.forEach((link) => {
    const isActive = link.getAttribute("data-page-link") === (page.startsWith("report-") ? "reports" : page);
    link.classList.toggle("active", isActive);
    if (isActive) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  });
  if (businessWorkspaceNavGroup) {
    businessWorkspaceNavGroup.open = visiblePage === "business-workspace";
  }
  document.title = page === "reports" ? "Eazinvoice Reports" : `Eazinvoice ${page.replace(/-/g, " ")}`;
  if (page.startsWith("report-")) {
    syncDetailFilterVisibility();
    renderReportDetail(page.replace("report-", ""));
  }
  if (page === "reports") renderMainReportCharts();
}

function openWorkspaceGroup(groupId, scrollIntoView = false) {
  if (!groupId) return;
  workspaceGroups.forEach((group) => {
    group.open = group.id === groupId;
  });
  const target = document.getElementById(groupId);
  if (scrollIntoView && target) {
    target.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

function isPaidSubscription(subscription) {
  return String(subscription?.status || "").toLowerCase() === "active" &&
    (String(subscription?.plan || "free").toLowerCase() !== "free" || Number(subscription?.amount || 0) > 0);
}

function activePlanAllows(featureName) {
  return Boolean(activePlanSummary?.features?.[featureName]);
}

function isUnlimitedLimit(value) {
  return Number(value) >= 999999;
}

function planLimitLine(key, summary) {
  const limit = Number(summary?.limits?.[key] ?? 0);
  const used = Number(summary?.usage?.[key] ?? 0);
  const label = LIMIT_LABELS[key] || key;
  if (isUnlimitedLimit(limit)) return { label, value: "Unlimited", tone: "blue" };
  const remaining = Math.max(0, limit - used);
  const value = `${remaining} left (${used}/${limit})`;
  return {
    label,
    value,
    tone: remaining <= 0 ? "red" : remaining <= Math.max(1, Math.ceil(limit * 0.15)) ? "amber" : "blue",
  };
}

function renderPlanEntitlements(summary) {
  const planLabel = summary?.label || "Free";
  const limits = ["invoicesPerMonth", "customers", "companies", "aiCommandsPerMonth"].map((key) => planLimitLine(key, summary));
  if (tierIndicatorBanner) {
    const invoiceLimit = planLimitLine("invoicesPerMonth", summary);
    const aiLimit = planLimitLine("aiCommandsPerMonth", summary);
    const aiText = Number(summary?.limits?.aiCommandsPerMonth || 0) > 0
      ? `AI: ${aiLimit.value}`
      : "AI: upgrade to Pro";
    tierIndicatorBanner.innerHTML = `
      <strong>${escapeHtml(planLabel)} tier</strong>
      <span>${escapeHtml(invoiceLimit.label)}: ${escapeHtml(invoiceLimit.value)}</span>
      <span>${escapeHtml(aiText)}</span>
      <a href="/apps/web/subscription.html">Upgrade / manage plan</a>
    `;
  }
  if (!planEntitlements) return;
  const featureRows = FEATURE_GATES.map((feature) => {
    const included = Boolean(summary?.features?.[feature.key]);
    return `
      <div class="entitlement-row">
        <span>${escapeHtml(feature.label)}</span>
        <strong class="pill ${included ? "blue" : "gold"}">${included ? "Live" : `Upgrade: ${escapeHtml(feature.upgrade)}`}</strong>
      </div>
    `;
  }).join("");
  planEntitlements.innerHTML = `
    <div class="entitlement-section">
      ${limits.map((item) => `
        <div class="entitlement-row">
          <span>${escapeHtml(item.label)}</span>
          <strong class="pill ${item.tone}">${escapeHtml(item.value)}</strong>
        </div>
      `).join("")}
    </div>
    <div class="entitlement-section compact">
      ${featureRows}
    </div>
  `;
}

function canUseAiAssistant() {
  return activePlanAllows("aiInvoiceAssist") || activePlanAllows("aiPoAssist") || activePlanAllows("advancedReports");
}

function setAiAssistantStatus(message, tone = "") {
  if (!aiAssistantStatus) return;
  aiAssistantStatus.hidden = !message;
  aiAssistantStatus.textContent = message || "";
  aiAssistantStatus.dataset.tone = tone;
}

function appendAiChatMessage(role, content, { html = false, thinking = false } = {}) {
  if (!aiAssistantResult) return null;
  const message = document.createElement("div");
  message.className = `ai-chat-message ${role}${thinking ? " thinking" : ""}`;
  const avatar = document.createElement("div");
  avatar.className = "ai-avatar";
  avatar.textContent = role === "user" ? "You" : "AI";
  const bubble = document.createElement("div");
  bubble.className = "ai-bubble";
  if (html) bubble.innerHTML = content;
  else bubble.textContent = content;
  message.append(avatar, bubble);
  aiAssistantResult.append(message);
  aiAssistantResult.scrollTop = aiAssistantResult.scrollHeight;
  return message;
}

function showAiThinking() {
  removeAiThinking();
  aiThinkingMessage = appendAiChatMessage("assistant", "<span class=\"ai-dot\"></span><span class=\"ai-dot\"></span><span class=\"ai-dot\"></span> Thinking through your records...", { html: true, thinking: true });
}

function removeAiThinking() {
  aiThinkingMessage?.remove();
  aiThinkingMessage = null;
}

function setInlineStatus(element, message, tone = "") {
  if (!element) return;
  element.hidden = !message;
  element.textContent = message || "";
  element.dataset.tone = tone;
}

function attachFormValidityStatus(form, statusElement, message) {
  form?.addEventListener("invalid", () => {
    setInlineStatus(statusElement, message, "error");
  }, true);
}

function renderAiAssistantAccess() {
  if (!aiAssistantPanel) return;
  const allowed = canUseAiAssistant();
  if (aiAssistantPlanBadge) {
    aiAssistantPlanBadge.textContent = allowed
      ? `${activePlanSummary.label || "Pro"} AI enabled`
      : "Pro / Business";
    aiAssistantPlanBadge.className = `pill ${allowed ? "blue" : "gold"}`;
  }
  if (aiCommandRun) aiCommandRun.disabled = !allowed;
  if (aiCommandInput) aiCommandInput.disabled = !allowed;
  [aiInvoiceExample, aiPoExample, aiReportExample].forEach((button) => {
    if (button) button.disabled = !allowed;
  });
  if (aiVoiceButton) {
    aiVoiceButton.disabled = !allowed || !("webkitSpeechRecognition" in window || "SpeechRecognition" in window);
    aiVoiceButton.title = aiVoiceButton.disabled && allowed
      ? "Voice input is not available in this browser. Typed commands still work."
      : "Speak an invoice, PO, or report command";
  }
  if (!allowed) {
    setAiAssistantStatus("AI command drafting and AI report summaries are available on Pro and Business plans. Admin plan preview can be used to test this locally.", "error");
  } else {
    const aiLimit = planLimitLine("aiCommandsPerMonth", activePlanSummary);
    setAiAssistantStatus(`AI Assistant is live on this plan. ${aiLimit.label}: ${aiLimit.value}.`, aiLimit.tone === "red" ? "error" : "success");
  }
}

function renderAiResult(result) {
  if (!aiAssistantResult) return;
  if (result.intent === "report") {
    pendingAiDraftResult = null;
    const metrics = result.metrics || {};
    appendAiChatMessage("assistant", `
      <div class="ai-result-card ai-agent-card">
        <div>
          <strong>${escapeHtml(result.title || "AI Report Summary")}</strong>
          <div class="hint">${escapeHtml(result.summary || "Report generated from current records.")}</div>
          <div class="badge-row">
            <span class="pill blue">${escapeHtml(result.provider === "openai" ? "OpenAI assisted" : "Local rules assisted")}</span>
            <span class="pill blue">Revenue INR ${money(metrics.totalAmount || 0)}</span>
            <span class="pill gold">Expenses INR ${money(metrics.expenseAmount || 0)}</span>
            <span class="pill blue">Profit INR ${money(metrics.profit || 0)}</span>
          </div>
        </div>
        <a class="ghost small" href="/apps/web/dashboard.html#reports">Open reports</a>
      </div>
    `, { html: true });
    return;
  }
  if (result.intent === "clarification") {
    pendingAiDraftCommand = null;
    pendingAiDraftResult = null;
    appendAiChatMessage("assistant", `
      <div class="ai-result-card ai-agent-card">
        <div>
          <strong>More details needed</strong>
          <div class="hint">${escapeHtml(result.question || result.message || "Please add a little more detail before I prepare this draft.")}</div>
          <div class="badge-row">
            ${(result.missingFields || []).map((field) => `<span class="pill gold">${escapeHtml(field)}</span>`).join("")}
          </div>
        </div>
      </div>
    `, { html: true });
    return;
  }
  const record = result.createdRecord || result.proposedRecord || {};
  const isPo = result.intent === "purchase_order";
  const recordNumber = isPo ? record.poNumber : record.invoiceNumber;
  const href = isPo
    ? `/apps/web/invoice.html?type=po&po=${encodeURIComponent(record.id || "")}`
    : `/apps/web/invoice.html?invoice=${encodeURIComponent(record.id || "")}`;
  const isSaved = Boolean(result.createdRecord?.id);
  const customerMissing = result.customerMatch?.status === "missing";
  const warnings = Array.isArray(result.warnings) ? result.warnings : [];
  const providerLabel = result.provider === "openai" ? "OpenAI assisted" : "Local rules assisted";
  const message = appendAiChatMessage("assistant", `
    <div class="ai-result-card ai-agent-card">
      <div>
        <strong>${escapeHtml(recordNumber || (isSaved ? (isPo ? "PO / WO draft created" : "Invoice draft created") : (isPo ? "Proposed PO / WO draft" : "Proposed invoice draft")))}</strong>
        ${customerMissing ? `<div class="notice ai-result-notice"><strong>Customer not saved yet:</strong> ${escapeHtml(result.customerMatch?.name || record.billToName || "This customer")} is not in your customer list. Add the customer first if you want saved customer details, PAN, GST, address, and future auto-fill.</div>` : ""}
        ${warnings.length ? `<div class="badge-row">${warnings.map((warning) => `<span class="pill gold">${escapeHtml(warning)}</span>`).join("")}</div>` : ""}
        <div class="hint">${escapeHtml(isSaved ? (result.message || "Draft created. Review before final creation.") : "Review this AI proposal. Save it only if the customer/vendor, item, tax, and amount look correct.")}</div>
        <div class="hint">${escapeHtml(record.billToName || (isPo ? "Vendor" : "Customer"))} - ${escapeHtml(record.currency || "INR")} ${money(record.total || 0)} - ${escapeHtml(String(record.status || "draft"))}</div>
        <div class="badge-row">
          <span class="pill blue">${escapeHtml(providerLabel)}</span>
          <span class="pill blue">${escapeHtml(record.items?.[0]?.description || "Item")}</span>
          <span class="pill gold">Tax ${money(record.taxAmount || 0)}</span>
          <span class="pill blue">Total ${escapeHtml(record.currency || "INR")} ${money(record.total || 0)}</span>
        </div>
      </div>
      <div class="row-actions">
        ${customerMissing ? '<a class="ghost small" href="/apps/web/invoice.html">Add customer in invoice flow</a>' : ""}
        ${isSaved ? `<a class="ghost small" href="${href}">Open draft</a>` : '<button class="primary small ai-save-draft-button" type="button">Create Draft</button>'}
        ${isSaved ? "" : '<button class="ghost small ai-discard-draft-button" type="button">Discard</button>'}
      </div>
    </div>
  `, { html: true });
  message?.querySelector(".ai-save-draft-button")?.addEventListener("click", savePendingAiDraft);
  message?.querySelector(".ai-discard-draft-button")?.addEventListener("click", () => {
    pendingAiDraftCommand = null;
    pendingAiDraftResult = null;
    appendAiChatMessage("assistant", "Proposal discarded. Send a fresh instruction whenever you are ready.");
    setAiAssistantStatus("AI proposal discarded.", "");
  });
}

async function savePendingAiDraft() {
  if (!pendingAiDraftCommand) {
    setAiAssistantStatus("No AI proposal is waiting to be saved.", "error");
    return;
  }
  setAiAssistantStatus("Creating draft from AI proposal...", "");
  try {
    const result = await apiClient.runAiCommand(token, {
      command: pendingAiDraftCommand,
      approvedDraft: pendingAiDraftResult
        ? {
          intent: pendingAiDraftResult.intent,
          confidence: pendingAiDraftResult.confidence,
          payload: pendingAiDraftResult.payload,
        }
        : undefined,
      saveDraft: true,
    });
    if (result.intent === "invoice" && result.createdRecord) replaceInvoice(result.createdRecord);
    if (result.intent === "purchase_order" && result.createdRecord) replacePurchaseOrder(result.createdRecord);
    pendingAiDraftCommand = null;
    pendingAiDraftResult = null;
    rerenderDashboardData();
    renderAiResult(result);
    setAiAssistantStatus("AI draft saved. You can open and edit it before final creation.", "success");
  } catch (error) {
    setAiAssistantStatus(error.message || "Could not create draft from AI proposal.", "error");
  }
}

function subscriptionStatusTone(status) {
  const normalized = String(status || "").toLowerCase();
  if (normalized === "active") return "blue";
  if (["failed", "rejected", "cancelled"].includes(normalized)) return "maroon";
  return "gold";
}

function loadRazorpayCheckout() {
  if (window.Razorpay) return Promise.resolve();
  if (!razorpayCheckoutPromise) {
    razorpayCheckoutPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://checkout.razorpay.com/v1/checkout.js";
      script.async = true;
      script.onload = resolve;
      script.onerror = () => reject(new Error("Could not load Razorpay Checkout. Check your connection and try again."));
      document.head.appendChild(script);
    });
  }
  return razorpayCheckoutPromise;
}

async function openRazorpayCheckout(orderPayload, onVerified) {
  await loadRazorpayCheckout();
  return new Promise((resolve, reject) => {
    const checkout = new window.Razorpay({
      key: orderPayload.keyId,
      amount: orderPayload.order.amount,
      currency: orderPayload.order.currency,
      name: "EazInvoice",
      description: orderPayload.description || "EazInvoice payment",
      order_id: orderPayload.order.id,
      prefill: orderPayload.prefill || {},
      theme: { color: "#123b8f" },
      handler: async (response) => {
        try {
          const verified = await apiClient.verifyRazorpayPayment(token, response);
          await onVerified?.(verified);
          resolve(verified);
        } catch (error) {
          reject(error);
        }
      },
      modal: {
        ondismiss: () => resolve(null),
      },
    });
    checkout.open();
  });
}

if (currentUser?.role === "admin") {
  if (adminNavLink) adminNavLink.hidden = false;
  if (adminSideLink) adminSideLink.hidden = false;
  if (profileAdminLink) profileAdminLink.hidden = false;
}

function displayNameFor(user, organization) {
  return organization?.legalName || organization?.name || user?.name || user?.email || "User";
}

function renderProfile(user, organization) {
  const displayName = displayNameFor(user, organization);
  const initials = displayName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "U";
  if (profileInitials) profileInitials.textContent = initials;
  if (profileDisplayName) profileDisplayName.textContent = displayName;
  if (profileDisplayMeta) profileDisplayMeta.textContent = user?.role === "admin" ? "Admin account" : "User account";
  if (profileDropdownName) profileDropdownName.textContent = displayName;
  if (profileDropdownEmail) profileDropdownEmail.textContent = user?.email || "";
}

function renderPlanCards(currentPlan) {
  if (!subscriptionArea) return;
  subscriptionArea.innerHTML = planCatalog.map((plan) => {
    const planId = plan.id || plan.plan;
    const featureList = Array.isArray(plan.features) ? plan.features : plan.highlights || [];
    const featureFlags = Array.isArray(plan.features) ? {} : plan.features || {};
    const isCurrent = planId === currentPlan;
    const monthlyAmount = Number(plan.discountedAmount ?? plan.monthlyAmount ?? plan.amount ?? 0);
    const annualAmount = Number(plan.discountedAnnualAmount ?? plan.annualAmount ?? (monthlyAmount * 12));
    const priceLabel = planId === "free" ? "INR 0" : `INR ${money(monthlyAmount)}/mo`;
    const billingHint = planId === "free" ? "No yearly billing" : `Billed yearly: INR ${money(annualAmount)}`;
    return `
    <div class="plan-tile ${isCurrent ? "selected" : ""}">
      <div class="panel-head">
        <div>
          <strong>${escapeHtml(plan.label)}</strong>
          <div class="hint">${escapeHtml(plan.description || (plan.highlights || []).join(", "))}</div>
          <div class="hint">${escapeHtml(billingHint)}</div>
        </div>
        <span class="pill ${planId === "free" ? "gold" : planId === "standard" ? "blue" : "maroon"}">${escapeHtml(priceLabel)}</span>
      </div>
      <ul class="feature-list">
        ${featureList.map((feature) => `<li>${escapeHtml(feature)}</li>`).join("")}
      </ul>
      <div class="badge-row">
        ${featureFlags.aiInvoiceAssist ? '<span class="pill blue">AI invoice</span>' : '<span class="pill gold">AI locked</span>'}
        ${featureFlags.razorpayCollections ? '<span class="pill blue">Gateway</span>' : '<span class="pill gold">Manual payments</span>'}
        ${featureFlags.apiAccess ? '<span class="pill blue">API</span>' : ""}
      </div>
      <button type="button" class="primary plan-switch" data-plan="${escapeHtml(planId)}" data-amount="${annualAmount}">${isCurrent ? "Current Plan" : `Switch to ${escapeHtml(plan.label)}`}</button>
    </div>
  `; }).join("");

  subscriptionArea.querySelectorAll(".plan-switch").forEach((button) => {
    button.addEventListener("click", async () => {
      const plan = button.getAttribute("data-plan");
      const amount = Number(button.getAttribute("data-amount") || 0);
      try {
        if (amount > 0) {
          if (subscriptionStatus) subscriptionStatus.textContent = "Opening Razorpay checkout...";
          const orderPayload = await apiClient.createRazorpayOrder(token, { kind: "subscription", plan });
          const verified = await openRazorpayCheckout(orderPayload, async () => {
            if (subscriptionStatus) subscriptionStatus.textContent = `Payment verified. ${plan} plan is active.`;
          });
          if (!verified) {
            if (subscriptionStatus) subscriptionStatus.textContent = "Razorpay checkout was closed before payment.";
            return;
          }
        } else {
          await apiClient.createSubscription(token, {
            subscriberType: "individual",
            amount,
            currency: "INR",
            plan,
            billingCycle: "yearly",
            status: "active",
          });
          if (subscriptionStatus) subscriptionStatus.textContent = `Switched to ${plan} plan.`;
        }
        await loadSubscriptionPanel();
      } catch (error) {
        if (subscriptionStatus) {
          subscriptionStatus.innerHTML = error.message.includes("KYC documents")
            ? `${error.message} <a href="/apps/web/subscription.html">Submit profile</a>`
            : error.message;
        }
      }
    });
  });
}

function createdInvoicesOnly(invoices) {
  return invoices.filter((invoice) => {
    const status = String(invoice.status || "created").toLowerCase();
    return status !== "draft" && status !== "deleted";
  });
}

function paymentTone(status) {
  const normalized = String(status || "unpaid").toLowerCase().replace(/\s+/g, "_");
  if (normalized === "paid") return "green";
  if (normalized === "part_paid" || normalized === "partial_paid") return "amber";
  if (normalized === "draft") return "gold";
  return "red";
}

function selectedPeriodInvoices(invoices) {
  const month = reportMonth?.value || "";
  const year = reportYear?.value || "";
  return invoices.filter((invoice) => {
    const invoiceDate = String(invoice.invoiceDate || "");
    if (year && !invoiceDate.startsWith(year)) return false;
    if (month && invoiceDate.slice(5, 7) !== month) return false;
    return true;
  });
}

function selectedPeriodPurchaseOrders(purchaseOrders) {
  const month = reportMonth?.value || "";
  const year = reportYear?.value || "";
  return purchaseOrders.filter((po) => {
    const poDate = String(po.poDate || po.issueDate || po.createdAt || "");
    if (year && !poDate.startsWith(year)) return false;
    if (month && poDate.slice(5, 7) !== month) return false;
    return true;
  });
}

function toDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function recordDate(record, type = "invoice") {
  return String(type === "po" ? record.poDate || record.issueDate || record.createdAt || "" : record.invoiceDate || record.createdAt || "");
}

function currentFinancialYearLabel(date = new Date()) {
  const year = date.getFullYear();
  const start = date.getMonth() >= 3 ? year : year - 1;
  return `${start}-${String(start + 1).slice(2)}`;
}

function financialYearRange(label) {
  const startYear = Number(String(label || "").slice(0, 4));
  if (!Number.isFinite(startYear)) return null;
  return {
    start: `${startYear}-04-01`,
    end: `${startYear + 1}-03-31`,
  };
}

function inDateRange(dateValue, startValue, endValue) {
  if (!dateValue) return false;
  if (startValue && dateValue < startValue) return false;
  if (endValue && dateValue > endValue) return false;
  return true;
}

function filterRecordsByDetailPeriod(records, type = "invoice") {
  const period = detailReportPeriod?.value || "all";
  const month = detailReportMonth?.value || "";
  const year = detailReportYear?.value || "";
  const fy = detailFinancialYear?.value || "";
  const start = detailStartDate?.value || "";
  const end = detailEndDate?.value || "";
  const today = new Date();
  const sevenDaysAgo = new Date(today);
  sevenDaysAgo.setDate(today.getDate() - 6);
  const weekStart = sevenDaysAgo.toISOString().slice(0, 10);
  const weekEnd = today.toISOString().slice(0, 10);
  const fyRange = financialYearRange(fy || currentFinancialYearLabel(today));

  return records.filter((record) => {
    const dateValue = recordDate(record, type).slice(0, 10);
    if (!dateValue) return false;
    if (period === "weekly") return inDateRange(dateValue, weekStart, weekEnd);
    if (period === "monthly") {
      const selectedYear = year || String(today.getFullYear());
      const selectedMonth = month || String(today.getMonth() + 1).padStart(2, "0");
      return dateValue.startsWith(`${selectedYear}-${selectedMonth}`);
    }
    if (period === "yearly") return dateValue.startsWith(year || String(today.getFullYear()));
    if (period === "financial-year" && fyRange) return inDateRange(dateValue, fyRange.start, fyRange.end);
    if (period === "custom") return inDateRange(dateValue, start, end);
    return true;
  });
}

function reportTypeConfig(type) {
  const configs = {
    revenue: { title: "Revenue Report", badge: "Revenue", description: "Invoice revenue, paid amount and receivables." },
    invoices: { title: "Invoice Report", badge: "Invoices", description: "Invoice records by status, value and payment state." },
    expenses: { title: "Expense Report", badge: "Expenses", description: "Expenses from created Purchase Orders and Work Orders." },
    po: { title: "PO / WO Report", badge: "PO / WO", description: "Purchase Order and Work Order records." },
    "profit-loss": { title: "Profit and Loss Report", badge: "P&L", description: "Revenue minus expenses for the selected period." },
    paid: { title: "Paid Reports", badge: "Paid feature", description: "Advanced reports available in paid plans." },
  };
  return configs[type] || configs.revenue;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function metricCard(label, value) {
  return `<article class="metric-card"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></article>`;
}

function groupRecordsByName(records, nameSelector, valueSelector) {
  const groups = new Map();
  records.forEach((record) => {
    const name = nameSelector(record) || "Unknown";
    const current = groups.get(name) || { name, count: 0, value: 0 };
    current.count += 1;
    current.value += Number(valueSelector(record) || 0);
    groups.set(name, current);
  });
  return [...groups.values()].sort((first, second) => second.value - first.value);
}

function daysPastDue(invoice) {
  const dueDate = parseDate(invoice.dueDate);
  if (!dueDate) return 0;
  const diff = Date.now() - dueDate.getTime();
  return diff > 0 ? Math.floor(diff / 86400000) : 0;
}

function agingBucketLabel(invoice) {
  const days = daysPastDue(invoice);
  if (days <= 0) return "Current";
  if (days <= 30) return "1-30 days";
  if (days <= 60) return "31-60 days";
  return "60+ days";
}

function buildCustomerAging(invoices) {
  const buckets = new Map();
  invoices.forEach((invoice) => {
    const balance = Number(invoice.balanceAmount ?? invoice.total ?? 0);
    if (balance <= 0) return;
    const customer = invoice.billToName || "Customer";
    const bucket = agingBucketLabel(invoice);
    const key = `${customer}|${bucket}`;
    const current = buckets.get(key) || { customer, bucket, invoices: 0, amount: 0 };
    current.invoices += 1;
    current.amount += balance;
    buckets.set(key, current);
  });
  return [...buckets.values()].sort((first, second) => second.amount - first.amount);
}

function syncDetailFilterVisibility() {
  const period = detailReportPeriod?.value || "all";
  detailFilterFields.forEach((field) => {
    const filter = field.getAttribute("data-report-filter");
    const visible = filter === "period"
      || (period === "monthly" && (filter === "month" || filter === "year"))
      || (period === "yearly" && filter === "year")
      || (period === "financial-year" && filter === "financial-year")
      || (period === "custom" && filter === "custom");
    field.hidden = !visible;
  });
}

function dateLabelFromKey(key) {
  const [year, month] = String(key || "").split("-");
  const monthName = new Date(Number(year), Number(month) - 1, 1).toLocaleString("en-IN", { month: "short" });
  return `${monthName} ${String(year || "").slice(2)}`;
}

function monthKeyForRecord(record, type = "invoice") {
  const dateValue = recordDate(record, type).slice(0, 10);
  return dateValue ? dateValue.slice(0, 7) : "";
}

function recentMonthKeys(count = 6) {
  const now = new Date();
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth() - (count - 1 - index), 1);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
  });
}

function buildMonthlyBuckets(invoices = [], purchaseOrders = [], minimumKeys = []) {
  const keys = new Set(minimumKeys);
  invoices.forEach((invoice) => {
    const key = monthKeyForRecord(invoice, "invoice");
    if (key) keys.add(key);
  });
  purchaseOrders.forEach((po) => {
    const key = monthKeyForRecord(po, "po");
    if (key) keys.add(key);
  });
  const sortedKeys = [...keys].sort();
  const buckets = sortedKeys.map((key) => ({
    key,
    label: dateLabelFromKey(key),
    revenue: 0,
    paid: 0,
    receivable: 0,
    expenses: 0,
    profit: 0,
    invoiceCount: 0,
    poCount: 0,
  }));
  const bucketMap = new Map(buckets.map((bucket) => [bucket.key, bucket]));
  invoices.forEach((invoice) => {
    const bucket = bucketMap.get(monthKeyForRecord(invoice, "invoice"));
    if (!bucket) return;
    bucket.revenue += Number(invoice.total || 0);
    bucket.paid += Number(invoice.paidAmount || 0);
    bucket.receivable += Number(invoice.balanceAmount ?? invoice.total ?? 0);
    bucket.invoiceCount += 1;
  });
  purchaseOrders.forEach((po) => {
    const bucket = bucketMap.get(monthKeyForRecord(po, "po"));
    if (!bucket) return;
    bucket.expenses += Number(po.total || 0);
    bucket.poCount += 1;
  });
  buckets.forEach((bucket) => {
    bucket.profit = bucket.revenue - bucket.expenses;
  });
  return buckets;
}

function renderLiveBarChart(container, rows, valueKey, options = {}) {
  if (!container) return;
  const filteredRows = rows.filter((row) => Number.isFinite(Number(row[valueKey])));
  const max = Math.max(...filteredRows.map((row) => Math.abs(Number(row[valueKey] || 0))), 0);
  if (!filteredRows.length || max <= 0) {
    container.innerHTML = '<div class="notice compact">No graph data for this period yet.</div>';
    return;
  }
  const tone = options.tone || "revenue";
  container.innerHTML = filteredRows.map((row) => {
    const value = Number(row[valueKey] || 0);
    const height = Math.max(8, Math.round((Math.abs(value) / max) * 100));
    const signedTone = value < 0 ? "loss" : tone;
    const displayValue = options.format === "count" ? String(value) : `${options.prefix || "INR"} ${money(value)}`;
    return `
      <div class="live-chart-item">
        <div class="live-chart-track">
          <span class="live-chart-bar ${signedTone}" style="height:${height}%"></span>
        </div>
        <strong>${escapeHtml(displayValue)}</strong>
        <span>${escapeHtml(row.label)}</span>
      </div>
    `;
  }).join("");
}

function renderReportDetailChart(type, invoices, purchaseOrders) {
  const buckets = buildMonthlyBuckets(invoices, purchaseOrders);
  const chartConfig = {
    revenue: { title: "Revenue by Month", badge: "Revenue", key: "revenue", tone: "revenue" },
    invoices: { title: "Invoices by Month", badge: "Count", key: "invoiceCount", tone: "count", format: "count" },
    expenses: { title: "Expenses by Month", badge: "Expense", key: "expenses", tone: "expense" },
    po: { title: "PO / WO by Month", badge: "Count", key: "poCount", tone: "count", format: "count" },
    "profit-loss": { title: "Profit by Month", badge: "Net", key: "profit", tone: "profit" },
    paid: { title: "Paid Revenue by Month", badge: "Paid", key: "paid", tone: "profit" },
  };
  const config = chartConfig[type] || chartConfig.revenue;
  if (reportDetailChartTitle) reportDetailChartTitle.textContent = config.title;
  if (reportDetailChartBadge) reportDetailChartBadge.textContent = config.badge;
  renderLiveBarChart(reportDetailChart, buckets, config.key, { tone: config.tone, prefix: "INR", format: config.format });
}

function renderMainReportCharts() {
  const invoices = selectedPeriodInvoices(createdInvoicesOnly(dashboardInvoices));
  const purchaseOrders = selectedPeriodPurchaseOrders(activeCreatedPurchaseOrders());
  const buckets = buildMonthlyBuckets(invoices, purchaseOrders, recentMonthKeys(6));
  renderLiveBarChart(mainRevenueChart, buckets.slice(-6), "revenue", { tone: "revenue" });
  renderLiveBarChart(mainProfitChart, buckets.slice(-6), "profit", { tone: "profit" });
}

function renderReportTable(headers, rows) {
  if (reportDetailHead) {
    reportDetailHead.innerHTML = `<tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("")}</tr>`;
  }
  if (reportDetailBody) {
    reportDetailBody.innerHTML = rows.length
      ? rows.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`).join("")
      : `<tr><td colspan="${headers.length}">No records for this report period.</td></tr>`;
  }
}

function activeCreatedPurchaseOrders() {
  return dashboardPurchaseOrders.filter((po) => {
    const status = String(po.status || "created").toLowerCase();
    return status !== "draft" && status !== "deleted";
  });
}

function renderReportDetail(rawType = "revenue") {
  const type = rawType === "profit" ? "profit-loss" : rawType;
  const config = reportTypeConfig(type);
  syncDetailFilterVisibility();
  if (reportDetailBadge) reportDetailBadge.textContent = config.badge;
  if (reportDetailTitle) reportDetailTitle.textContent = config.title;

  const invoices = filterRecordsByDetailPeriod(createdInvoicesOnly(dashboardInvoices), "invoice");
  const purchaseOrders = filterRecordsByDetailPeriod(activeCreatedPurchaseOrders(), "po");
  const invoiceTotal = invoices.reduce((sum, invoice) => sum + Number(invoice.total || 0), 0);
  const paidTotal = invoices.reduce((sum, invoice) => sum + Number(invoice.paidAmount || 0), 0);
  const unpaidTotal = invoices.reduce((sum, invoice) => sum + Number(invoice.balanceAmount ?? invoice.total ?? 0), 0);
  const expenseTotal = purchaseOrders.reduce((sum, po) => sum + Number(po.total || 0), 0);
  const profit = invoiceTotal - expenseTotal;
  renderReportDetailChart(type, invoices, purchaseOrders);

  if (type === "revenue") {
    if (reportDetailMetrics) reportDetailMetrics.innerHTML = [
      metricCard("Invoice Revenue", `INR ${money(invoiceTotal)}`),
      metricCard("Paid Revenue", `INR ${money(paidTotal)}`),
      metricCard("Receivable", `INR ${money(unpaidTotal)}`),
      metricCard("Invoices", String(invoices.length)),
    ].join("");
    renderReportTable(["Invoice", "Customer", "Date", "Total", "Paid", "Balance", "Status"], invoices.map((invoice) => [
      invoice.invoiceNumber || "-",
      invoice.billToName || "Customer",
      invoice.invoiceDate || "-",
      `${invoice.currency || "INR"} ${money(invoice.total || 0)}`,
      `${invoice.currency || "INR"} ${money(invoice.paidAmount || 0)}`,
      `${invoice.currency || "INR"} ${money(invoice.balanceAmount ?? invoice.total ?? 0)}`,
      String(invoice.paymentStatus || "unpaid").replace(/_/g, " "),
    ]));
    return;
  }

  if (type === "invoices") {
    const paidCount = invoices.filter((invoice) => String(invoice.paymentStatus || "").toLowerCase() === "paid").length;
    const unpaidCount = invoices.filter((invoice) => Number(invoice.balanceAmount ?? invoice.total ?? 0) > 0).length;
    if (reportDetailMetrics) reportDetailMetrics.innerHTML = [
      metricCard("Created Invoices", String(invoices.length)),
      metricCard("Paid Invoices", String(paidCount)),
      metricCard("Pending Invoices", String(unpaidCount)),
      metricCard("Total Value", `INR ${money(invoiceTotal)}`),
    ].join("");
    renderReportTable(["Invoice", "Customer", "Date", "Due Date", "Value", "Payment Status"], invoices.map((invoice) => [
      invoice.invoiceNumber || "-",
      invoice.billToName || "Customer",
      invoice.invoiceDate || "-",
      invoice.dueDate || "-",
      `${invoice.currency || "INR"} ${money(invoice.total || 0)}`,
      String(invoice.paymentStatus || "unpaid").replace(/_/g, " "),
    ]));
    return;
  }

  if (type === "expenses" || type === "po") {
    if (reportDetailMetrics) reportDetailMetrics.innerHTML = [
      metricCard(type === "po" ? "PO / WO Created" : "Expense Records", String(purchaseOrders.length)),
      metricCard("Expense Value", `INR ${money(expenseTotal)}`),
      metricCard("Purchase Orders", String(purchaseOrders.filter((po) => String(po.documentType || "po") === "po").length)),
      metricCard("Work Orders", String(purchaseOrders.filter((po) => String(po.documentType || "po") === "wo").length)),
    ].join("");
    renderReportTable(["Document", "Type", "Vendor", "Date", "Value", "Status"], purchaseOrders.map((po) => [
      po.poNumber || "-",
      String(po.documentType || "po").toUpperCase(),
      po.billToName || "Vendor",
      po.poDate || "-",
      `${po.currency || "INR"} ${money(po.total || 0)}`,
      String(po.status || "created"),
    ]));
    return;
  }

  if (type === "profit-loss") {
    if (reportDetailMetrics) reportDetailMetrics.innerHTML = [
      metricCard("Revenue", `INR ${money(invoiceTotal)}`),
      metricCard("Expenses", `INR ${money(expenseTotal)}`),
      metricCard("Gross Profit", `INR ${money(profit)}`),
      metricCard("Margin", invoiceTotal > 0 ? `${((profit / invoiceTotal) * 100).toFixed(2)}%` : "0.00%"),
    ].join("");
    renderReportTable(["Particulars", "Calculation", "Amount"], [
      ["Revenue", "Created invoice total", `INR ${money(invoiceTotal)}`],
      ["Less: Expenses", "Created PO/WO total", `INR ${money(expenseTotal)}`],
      ["Profit / Loss", "Revenue - Expenses", `INR ${money(profit)}`],
      ["Cash Collected", "Paid invoice amount", `INR ${money(paidTotal)}`],
      ["Receivables", "Invoice balance amount", `INR ${money(unpaidTotal)}`],
    ]);
    return;
  }

  const gstOutput = invoices.reduce((sum, invoice) => sum + Number(invoice.taxAmount || 0), 0);
  const gstInput = purchaseOrders.reduce((sum, po) => sum + Number(po.taxAmount || 0), 0);
  const netGst = gstOutput - gstInput;
  const receivables = unpaidTotal;
  const customerTotals = groupRecordsByName(
    invoices,
    (invoice) => invoice.billToName || "Customer",
    (invoice) => invoice.total || 0,
  );
  const vendorTotals = groupRecordsByName(
    purchaseOrders,
    (po) => po.billToName || "Vendor",
    (po) => po.total || 0,
  );
  const topCustomer = customerTotals[0];
  const topVendor = vendorTotals[0];
  const customerAging = buildCustomerAging(invoices);

  if (!activePlanAllows("advancedReports")) {
    if (reportDetailMetrics) reportDetailMetrics.innerHTML = [
      metricCard("Available Now", "Upgrade"),
      metricCard("Current Revenue", `INR ${money(invoiceTotal)}`),
      metricCard("Current Expenses", `INR ${money(expenseTotal)}`),
      metricCard("Advanced Reports", "Pro or Business"),
    ].join("");
    renderReportTable(["Report", "Status", "What unlocks"], [
      ["Balance Sheet Snapshot", "Locked", "Pro and Business reports show receivables, payables and net position."],
      ["GST Position", "Locked", "Output GST, input GST and net GST payable for selected periods."],
      ["Customer Aging", "Locked", "Outstanding receivables grouped by customer and age bucket."],
      ["Vendor Spend", "Locked", "Vendor-wise PO and WO spend from purchase records."],
      ["Growth Analytics", "Locked", "Revenue, expense and profit trend charts."],
    ]);
    return;
  }

  if (reportDetailMetrics) reportDetailMetrics.innerHTML = [
    metricCard("Net Profit", `INR ${money(profit)}`),
    metricCard("GST Position", `INR ${money(netGst)}`),
    metricCard("Receivables", `INR ${money(receivables)}`),
    metricCard("Top Customer", topCustomer ? `${topCustomer.name} - INR ${money(topCustomer.value)}` : "No invoices"),
  ].join("");
  renderReportTable(["Advanced Report", "Current Insight", "Value"], [
    ["Balance Sheet Snapshot", "Receivables minus purchase commitments", `INR ${money(receivables - expenseTotal)}`],
    ["GST Summary", `Output INR ${money(gstOutput)} less input INR ${money(gstInput)}`, `INR ${money(netGst)}`],
    ["Customer Aging", customerAging[0] ? `${customerAging[0].customer} - ${customerAging[0].bucket}` : "No outstanding balances", customerAging[0] ? `INR ${money(customerAging[0].amount)}` : "INR 0.00"],
    ["Vendor Spend", topVendor ? topVendor.name : "No PO/WO records", topVendor ? `INR ${money(topVendor.value)}` : "INR 0.00"],
    ["Growth Analytics", "Filtered revenue and profit chart above", `Margin ${invoiceTotal > 0 ? ((profit / invoiceTotal) * 100).toFixed(2) : "0.00"}%`],
    ["Profit and Loss", `Revenue INR ${money(invoiceTotal)} less expenses INR ${money(expenseTotal)}`, `INR ${money(profit)}`],
  ]);
}

function populateReportFilters(invoices, purchaseOrders = dashboardPurchaseOrders) {
  const invoiceYears = createdInvoicesOnly(invoices).map((invoice) => String(invoice.invoiceDate || "").slice(0, 4));
  const poYears = purchaseOrders
    .filter((po) => String(po.status || "created").toLowerCase() !== "deleted")
    .map((po) => String(po.poDate || po.issueDate || po.createdAt || "").slice(0, 4));
  const years = [...new Set([...invoiceYears, ...poYears].filter(Boolean))].sort().reverse();
  if (reportYear) {
    const current = reportYear.value;
    reportYear.innerHTML = '<option value="">All years</option>' + years.map((year) => `<option value="${year}">${year}</option>`).join("");
    if (years.includes(current)) reportYear.value = current;
  }
  if (reportMonth && reportMonth.options.length <= 1) {
    reportMonth.innerHTML = `
      <option value="">All months</option>
      <option value="01">January</option>
      <option value="02">February</option>
      <option value="03">March</option>
      <option value="04">April</option>
      <option value="05">May</option>
      <option value="06">June</option>
      <option value="07">July</option>
      <option value="08">August</option>
      <option value="09">September</option>
      <option value="10">October</option>
      <option value="11">November</option>
      <option value="12">December</option>
    `;
  }
  if (detailReportYear) {
    const current = detailReportYear.value;
    detailReportYear.innerHTML = '<option value="">All years</option>' + years.map((year) => `<option value="${year}">${year}</option>`).join("");
    if (years.includes(current)) detailReportYear.value = current;
  }
  if (detailReportMonth && detailReportMonth.options.length <= 1) {
    detailReportMonth.innerHTML = reportMonth?.innerHTML || `
      <option value="">All months</option>
      <option value="01">January</option>
      <option value="02">February</option>
      <option value="03">March</option>
      <option value="04">April</option>
      <option value="05">May</option>
      <option value="06">June</option>
      <option value="07">July</option>
      <option value="08">August</option>
      <option value="09">September</option>
      <option value="10">October</option>
      <option value="11">November</option>
      <option value="12">December</option>
    `;
  }
  if (detailFinancialYear) {
    const current = detailFinancialYear.value;
    const fyLabels = [...new Set(years.map((year) => `${year}-${String(Number(year) + 1).slice(2)}`))];
    const defaultFy = currentFinancialYearLabel();
    const options = [...new Set([defaultFy, ...fyLabels])].filter(Boolean);
    detailFinancialYear.innerHTML = '<option value="">Select FY</option>' + options.map((fy) => `<option value="${fy}">${fy}</option>`).join("");
    if (options.includes(current)) detailFinancialYear.value = current;
  }
}

function renderDashboardMetrics(invoices) {
  const createdInvoices = selectedPeriodInvoices(createdInvoicesOnly(invoices));
  const createdPurchaseOrders = selectedPeriodPurchaseOrders(dashboardPurchaseOrders.filter((po) => {
    const status = String(po.status || "created").toLowerCase();
    return status !== "draft" && status !== "deleted";
  }));
  const now = new Date();
  const month = now.toISOString().slice(0, 7);
  const total = createdInvoices.reduce((sum, invoice) => sum + Number(invoice.total || 0), 0);
  const paid = createdInvoices.reduce((sum, invoice) => sum + Number(invoice.paidAmount || 0), 0);
  const unpaid = createdInvoices.reduce((sum, invoice) => sum + Number(invoice.balanceAmount ?? invoice.total ?? 0), 0);
  const expenses = createdPurchaseOrders.reduce((sum, po) => sum + Number(po.total || 0), 0);
  const monthTotal = (reportMonth?.value || reportYear?.value)
    ? paid
    : createdInvoices
      .filter((invoice) => String(invoice.invoiceDate || "").startsWith(month))
      .reduce((sum, invoice) => sum + Number(invoice.paidAmount || 0), 0);
  const overdue = createdInvoices.filter((invoice) => invoice.dueDate && new Date(invoice.dueDate) < now && Number(invoice.balanceAmount ?? invoice.total ?? 0) > 0).length;
  if (totalInvoices) totalInvoices.textContent = String(createdInvoices.length);
  if (paidAmount) paidAmount.textContent = `INR ${money(paid)}`;
  if (unpaidAmount) unpaidAmount.textContent = `INR ${money(unpaid)}`;
  if (overdueCount) overdueCount.textContent = String(overdue);
  if (monthlyRevenue) monthlyRevenue.textContent = `INR ${money(monthTotal)}`;
  if (pendingPayments) pendingPayments.textContent = String(createdInvoices.filter((invoice) => Number(invoice.balanceAmount ?? invoice.total ?? 0) > 0).length);
  if (reportIncomeTotal) reportIncomeTotal.textContent = `INR ${money(total)}`;
  if (reportExpenseTotal) reportExpenseTotal.textContent = `INR ${money(expenses)}`;
  if (reportProfitTotal) reportProfitTotal.textContent = `INR ${money(total - expenses)}`;
  renderMainReportCharts();
}

function renderRecentActivity(invoices, companies) {
  if (!recentActivity) return;
  const recentInvoices = invoices.slice().reverse().slice(0, 4).map((invoice) => `
    <div class="invoice-card">
      <div>
        <strong>${escapeHtml(invoice.invoiceNumber || "Invoice")}</strong>
        <div class="hint">${escapeHtml(invoice.invoiceDate || "No date")} - INR ${money(invoice.total || 0)} - ${escapeHtml(String(invoice.paymentStatus || "unpaid").replace(/_/g, " "))}</div>
      </div>
      <span class="pill ${paymentTone(invoice.paymentStatus)}">${escapeHtml(String(invoice.paymentStatus || "unpaid").replace(/_/g, " ").toUpperCase())}</span>
    </div>
  `);
  const recentCompanies = companies.slice().reverse().slice(0, 2).map((company) => `
    <div class="invoice-card">
      <div>
        <strong>${escapeHtml(company.legalName || company.name || "Business")}</strong>
        <div class="hint">${escapeHtml(company.entityType || "business")} profile</div>
      </div>
      <span class="pill blue">Business</span>
    </div>
  `);
  recentActivity.innerHTML = [...recentInvoices, ...recentCompanies].length
    ? [...recentInvoices, ...recentCompanies].join("")
    : "<p>No activity yet. Create your first invoice to start the timeline.</p>";
}

function renderBusinessProfiles(companies) {
  if (!businessProfilesList) return;
  businessProfilesList.innerHTML = companies.length
    ? companies.map((company) => `
      <article class="management-card">
        <div>
          <span class="pill blue">${escapeHtml(company.companyCode || "Business")}</span>
          <h3>${escapeHtml(company.legalName || company.name || "Business profile")}</h3>
          <p>${escapeHtml(company.entityType || "company")} - ${escapeHtml(company.state || "State not saved")} - ${escapeHtml(company.email || "Email not saved")}</p>
          <p class="hint">PAN: ${escapeHtml(company.panNumber || "Not added")} | GST: ${escapeHtml(company.gstNumber || "Not added")} | KYC: ${escapeHtml(company.kycStatus || "not submitted")}</p>
        </div>
        <div class="row-actions">
          <a class="ghost small" href="/apps/web/onboarding.html?company=${encodeURIComponent(company.id)}">Edit</a>
          <button class="ghost small danger" type="button" disabled>Delete</button>
          <button class="ghost small" type="button" disabled>Re-activate</button>
        </div>
      </article>
    `).join("")
    : '<div class="notice">No business profile yet. Use "Add Company / Profile" to create one.</div>';
}

function customerDueAmount(customer) {
  return dashboardInvoices
    .filter((invoice) => invoice.customerId === customer.id && String(invoice.status || "created").toLowerCase() !== "deleted")
    .reduce((sum, invoice) => sum + Number(invoice.balanceAmount ?? invoice.total ?? 0), 0);
}

function renderCustomers(customers) {
  if (!customersList) return;
  customersList.innerHTML = customers.length
    ? customers.map((customer) => `
      <article class="management-card">
        <div>
          <span class="pill blue">${escapeHtml(customer.customerCode || "Customer")}</span>
          <h3>${escapeHtml(customer.businessName || customer.name || "Customer")}</h3>
          <p>${escapeHtml(customer.phone || "Phone not saved")} - ${escapeHtml(customer.email || "Email not saved")}</p>
          <p class="hint">${escapeHtml(customer.billingAddress || "Address not saved")}</p>
          <p class="hint">GST: ${escapeHtml(customer.gstNumber || "Not added")} | PAN: ${escapeHtml(customer.panNumber || "Not added")} | Due: INR ${money(customerDueAmount(customer))}</p>
        </div>
        <div class="row-actions">
          <button class="ghost small" type="button" disabled>Edit</button>
          <button class="ghost small danger" type="button" disabled>Delete</button>
        </div>
      </article>
    `).join("")
    : '<div class="notice">No customers yet. Add a customer while creating an invoice.</div>';
}

function renderVendors(purchaseOrders) {
  if (!vendorsList) return;
  const vendorMap = new Map();
  purchaseOrders.forEach((po) => {
    const status = String(po.status || "created").toLowerCase();
    if (status === "deleted") return;
    const key = po.customerId || po.billToName || po.vendorCode || po.id;
    const existing = vendorMap.get(key) || {
      vendorCode: po.vendorCode || "Vendor",
      name: po.billToName || "Vendor",
      address: po.billToAddress || "",
      total: 0,
      count: 0,
    };
    existing.total += status === "draft" ? 0 : Number(po.total || 0);
    existing.count += 1;
    vendorMap.set(key, existing);
  });
  const vendors = [...vendorMap.values()];
  vendorsList.innerHTML = vendors.length
    ? vendors.map((vendor) => `
      <article class="management-card">
        <div>
          <span class="pill blue">${escapeHtml(vendor.vendorCode)}</span>
          <h3>${escapeHtml(vendor.name)}</h3>
          <p>${escapeHtml(vendor.address || "Vendor address not saved")}</p>
          <p class="hint">PO/WO records: ${vendor.count} | Total expense value: INR ${money(vendor.total)}</p>
        </div>
        <div class="row-actions">
          <button class="ghost small" type="button" disabled>Edit</button>
          <button class="ghost small danger" type="button" disabled>Delete</button>
        </div>
      </article>
    `).join("")
    : '<div class="notice">No vendors yet. Create a PO or WO to add vendor details.</div>';
}

function setPaymentModalStatus(message, tone = "") {
  if (!paymentModalStatus) return;
  paymentModalStatus.textContent = message || "";
  paymentModalStatus.dataset.tone = tone;
}

function setRecurringDraftStatus(message, tone = "") {
  if (!recurringDraftStatus) return;
  recurringDraftStatus.hidden = !message;
  recurringDraftStatus.textContent = message || "";
  recurringDraftStatus.dataset.tone = tone;
}

function paymentsForInvoice(invoiceId) {
  return dashboardPayments
    .filter((payment) => payment.invoiceId === invoiceId && String(payment.status || "captured").toLowerCase() === "captured")
    .sort((a, b) => String(b.paymentDate || b.createdAt || "").localeCompare(String(a.paymentDate || a.createdAt || "")));
}

function renderPaymentModalDetails(invoice) {
  if (!invoice) return;
  const balance = Number(invoice.balanceAmount ?? invoice.total ?? 0);
  const paid = Number(invoice.paidAmount || 0);
  const currency = invoice.currency || "INR";
  if (paymentModalInvoiceMeta) {
    paymentModalInvoiceMeta.textContent = `${invoice.invoiceNumber || "Invoice"} - ${invoice.billToName || "Customer"} - Balance ${currency} ${money(balance)}`;
  }
  if (paymentModalSummary) {
    paymentModalSummary.innerHTML = `
      <div><span>Total Amount</span><strong>${escapeHtml(currency)} ${money(invoice.total || 0)}</strong></div>
      <div><span>Paid So Far</span><strong>${escapeHtml(currency)} ${money(paid)}</strong></div>
      <div><span>Pending Balance</span><strong>${escapeHtml(currency)} ${money(balance)}</strong></div>
    `;
  }
  if (paymentHistoryList) {
    const payments = paymentsForInvoice(invoice.id);
    paymentHistoryList.innerHTML = payments.length
      ? `
        <h3>Payment History</h3>
        ${payments.map((payment) => `
          <div class="payment-history-row">
            <strong>${escapeHtml(payment.currency || currency)} ${money(payment.amount || 0)}</strong>
            <span>${escapeHtml(payment.paymentDate || "No date")} - ${escapeHtml(payment.mode || "manual")}${payment.reference ? ` - ${escapeHtml(payment.reference)}` : ""}</span>
          </div>
        `).join("")}
      `
      : '<div class="notice compact">No payments recorded yet. Add the first payment below.</div>';
  }
  if (paymentSubmitButton) paymentSubmitButton.textContent = balance > 0 ? "Add Payment" : "Invoice Paid";
}

function openPaymentModal(invoice) {
  if (!paymentModal || !paymentForm || !paymentInvoiceId || !paymentAmountInput || !paymentDateInput) return;
  const balance = Number(invoice.balanceAmount ?? invoice.total ?? 0);
  paymentInvoiceId.value = invoice.id;
  paymentAmountInput.value = balance > 0 ? String(balance) : "";
  paymentAmountInput.max = balance > 0 ? String(balance) : "";
  paymentAmountInput.disabled = balance <= 0;
  paymentDateInput.value = new Date().toISOString().slice(0, 10);
  if (paymentModeInput) paymentModeInput.value = "UPI";
  if (paymentReferenceInput) paymentReferenceInput.value = "";
  if (paymentNotesInput) paymentNotesInput.value = "";
  renderPaymentModalDetails(invoice);
  setPaymentModalStatus("");
  paymentModal.hidden = false;
  paymentAmountInput.focus();
}

function closePaymentModal() {
  if (paymentModal) paymentModal.hidden = true;
  paymentForm?.reset();
  setPaymentModalStatus("");
}

function replaceInvoice(invoice) {
  if (!invoice?.id) return;
  const index = dashboardInvoices.findIndex((entry) => entry.id === invoice.id);
  if (index >= 0) dashboardInvoices[index] = invoice;
  else dashboardInvoices.push(invoice);
}

function replacePurchaseOrder(purchaseOrder) {
  if (!purchaseOrder?.id) return;
  const index = dashboardPurchaseOrders.findIndex((entry) => entry.id === purchaseOrder.id);
  if (index >= 0) dashboardPurchaseOrders[index] = purchaseOrder;
  else dashboardPurchaseOrders.push(purchaseOrder);
}

function rerenderDashboardData() {
  populateReportFilters(dashboardInvoices, dashboardPurchaseOrders);
  syncDetailFilterVisibility();
  renderDashboardMetrics(dashboardInvoices);
  renderInvoiceWorkspace(dashboardInvoices);
  renderPoWorkspace(dashboardPurchaseOrders);
  renderRecentActivity(dashboardInvoices, dashboardCompanies);
  renderBusinessProfiles(dashboardCompanies);
  renderCustomers(dashboardCustomers);
  renderVendors(dashboardPurchaseOrders);
  if (currentDashboardPage().startsWith("report-")) renderReportDetail(currentDashboardPage().replace("report-", ""));
}

function renderInvoiceWorkspaceLegacy(invoices) {
  const drafts = invoices.filter((invoice) => String(invoice.status || "").toLowerCase() === "draft");
  const createdInvoices = createdInvoicesOnly(invoices);
  const total = createdInvoices.reduce((sum, invoice) => sum + Number(invoice.total || 0), 0);
  if (draftInvoiceCount) draftInvoiceCount.textContent = String(drafts.length);
  if (createdInvoiceCount) createdInvoiceCount.textContent = String(createdInvoices.length);
  if (invoiceRevenueTotal) invoiceRevenueTotal.textContent = `INR ${money(total)}`;

  const renderInvoiceRow = (invoice, tone = "gold") => `
    <div class="invoice-card">
      <div>
        <strong>${escapeHtml(invoice.invoiceNumber || "Draft invoice")}</strong>
        <div class="hint">${escapeHtml(invoice.billToName || "Customer")} - ${escapeHtml(invoice.invoiceDate || "No date")} - ${escapeHtml(invoice.currency || "INR")} ${money(invoice.total || 0)}</div>
      </div>
      <div class="row-actions">
        <a class="ghost small" href="/apps/web/invoice.html?invoice=${encodeURIComponent(invoice.id || "")}">Open</a>
        <span class="pill ${tone}">${escapeHtml(String(invoice.status || (tone === "gold" ? "draft" : "created")).toUpperCase())}</span>
      </div>
    </div>
  `;

  if (draftInvoicesList) {
    draftInvoicesList.innerHTML = drafts.length
      ? drafts.slice().reverse().map((invoice) => renderInvoiceRow(invoice, "gold")).join("")
      : '<div class="notice">No invoice drafts yet. Use "Generate New Invoice" to create one.</div>';
  }

  if (createdInvoicesList) {
    createdInvoicesList.innerHTML = createdInvoices.length
      ? createdInvoices.slice().reverse().map((invoice) => renderInvoiceRow(invoice, "blue")).join("")
      : '<div class="notice">No invoices created yet.</div>';
  }
}

function renderInvoiceWorkspace(invoices) {
  const drafts = invoices.filter((invoice) => String(invoice.status || "").toLowerCase() === "draft");
  const createdInvoices = selectedPeriodInvoices(createdInvoicesOnly(invoices));
  const total = createdInvoices.reduce((sum, invoice) => sum + Number(invoice.total || 0), 0);
  if (draftInvoiceCount) draftInvoiceCount.textContent = String(drafts.length);
  if (createdInvoiceCount) createdInvoiceCount.textContent = String(createdInvoices.length);
  if (invoiceRevenueTotal) invoiceRevenueTotal.textContent = `INR ${money(total)}`;
  if (runRecurringDraftsBtn) {
    const canRunRecurring = activePlanAllows("recurringInvoices");
    runRecurringDraftsBtn.disabled = !canRunRecurring;
    runRecurringDraftsBtn.textContent = canRunRecurring ? "Generate Recurring Drafts" : "Recurring Drafts in Standard";
    runRecurringDraftsBtn.title = canRunRecurring
      ? "Create due draft invoices from recurring invoice templates"
      : "Recurring invoice drafts are available on Standard and higher plans";
  }

  const renderInvoiceRow = (invoice, tone = "gold") => {
    const isDraft = String(invoice.status || "").toLowerCase() === "draft";
    const rawPaymentStatus = invoice.paymentStatus || (isDraft ? "draft" : "unpaid");
    const paymentStatus = String(rawPaymentStatus).replace(/_/g, " ");
    const balance = Number(invoice.balanceAmount ?? invoice.total ?? 0);
    const invoiceId = String(invoice.id || "");
    const currency = invoice.currency || "INR";
    return `
      <div class="invoice-card">
        <div>
          <strong>${escapeHtml(invoice.invoiceNumber || "Draft invoice")}</strong>
          <div class="hint">${escapeHtml(invoice.billToName || "Customer")} - ${escapeHtml(invoice.invoiceDate || "No date")} - ${escapeHtml(currency)} ${money(invoice.total || 0)} - Paid ${escapeHtml(currency)} ${money(invoice.paidAmount || 0)} - Balance ${escapeHtml(currency)} ${money(balance)}</div>
          ${invoice.paymentLink?.url ? `<div class="hint">Payment link: ${escapeHtml(invoice.paymentLink.url)}</div>` : ""}
        </div>
        <div class="row-actions">
          <a class="ghost small" href="/apps/web/invoice.html?invoice=${encodeURIComponent(invoiceId)}">${isDraft ? "Edit Draft" : "Open / Edit"}</a>
          ${!isDraft && balance > 0 ? `<button class="ghost small" type="button" data-payment-invoice="${escapeHtml(invoiceId)}" data-balance="${balance}">Record Payment</button>` : ""}
          ${!isDraft && balance > 0 ? `<button class="ghost small" type="button" data-payment-link="${escapeHtml(invoiceId)}">${activePlanAllows("razorpayCollections") ? "Collect Online" : "Upgrade for Gateway"}</button>` : ""}
          <button class="ghost small danger" type="button" data-delete-invoice="${escapeHtml(invoiceId)}">Delete</button>
          <span class="pill ${paymentTone(rawPaymentStatus)}">${escapeHtml(paymentStatus.toUpperCase())}</span>
        </div>
      </div>
    `;
  };

  if (draftInvoicesList) {
    draftInvoicesList.innerHTML = drafts.length
      ? drafts.slice().reverse().map((invoice) => renderInvoiceRow(invoice, "gold")).join("")
      : '<div class="notice">No invoice drafts yet. Use "Generate New Invoice" to create one.</div>';
  }

  if (createdInvoicesList) {
    createdInvoicesList.innerHTML = createdInvoices.length
      ? createdInvoices.slice().reverse().map((invoice) => renderInvoiceRow(invoice, "blue")).join("")
      : '<div class="notice">No invoices created yet.</div>';
  }

  document.querySelectorAll("[data-payment-invoice]").forEach((button) => {
    button.addEventListener("click", () => {
      const invoiceId = button.getAttribute("data-payment-invoice");
      const invoice = dashboardInvoices.find((entry) => entry.id === invoiceId);
      if (invoice) openPaymentModal(invoice);
    });
  });

  document.querySelectorAll("[data-payment-link]").forEach((button) => {
    button.addEventListener("click", async () => {
      const invoiceId = button.getAttribute("data-payment-link");
      if (!activePlanAllows("razorpayCollections")) {
        setPaymentModalStatus("Razorpay payment collection is available on Standard and higher plans. Upgrade before using gateway links.", "error");
        return;
      }
      try {
        setPaymentModalStatus("Opening Razorpay checkout...", "");
        const orderPayload = await apiClient.createRazorpayOrder(token, { kind: "invoice", invoiceId });
        const verified = await openRazorpayCheckout(orderPayload, async (result) => {
          const updatedInvoice = result.invoice || result;
          replaceInvoice(updatedInvoice);
          if (result.payment) {
            const existingPaymentIndex = dashboardPayments.findIndex((payment) => payment.id === result.payment.id);
            if (existingPaymentIndex >= 0) dashboardPayments[existingPaymentIndex] = result.payment;
            else dashboardPayments.push(result.payment);
          }
          rerenderDashboardData();
          setPaymentModalStatus("Razorpay payment verified and invoice status updated.", "success");
        });
        if (!verified) setPaymentModalStatus("Razorpay checkout was closed before payment.", "error");
      } catch (error) {
        setPaymentModalStatus(error.message || "Payment gateway automation is available only in paid tiers.", "error");
      }
    });
  });

  document.querySelectorAll("[data-delete-invoice]").forEach((button) => {
    button.addEventListener("click", async () => {
      const invoiceId = button.getAttribute("data-delete-invoice");
      if (!invoiceId || !window.confirm("Delete this invoice? The number will remain consumed and will not be reused.")) return;
      try {
        const deleted = await apiClient.deleteInvoice(token, invoiceId);
        replaceInvoice(deleted);
        rerenderDashboardData();
      } catch (error) {
        setPaymentModalStatus(error.message || "Could not delete invoice.", "error");
      }
    });
  });
}

function renderPoWorkspace(purchaseOrders) {
  const activePurchaseOrders = purchaseOrders.filter((po) => String(po.status || "created").toLowerCase() !== "deleted");
  const drafts = activePurchaseOrders.filter((po) => String(po.status || "created").toLowerCase() === "draft");
  const created = selectedPeriodPurchaseOrders(activePurchaseOrders.filter((po) => String(po.status || "created").toLowerCase() !== "draft"));
  const total = created.reduce((sum, po) => sum + Number(po.total || 0), 0);
  if (draftPoCount) draftPoCount.textContent = String(drafts.length);
  if (createdPoCount) createdPoCount.textContent = String(created.length);
  if (poValueTotal) poValueTotal.textContent = `INR ${money(total)}`;

  const legacyRenderPoRow = (po, tone = "blue") => `
    <div class="invoice-card">
      <div>
        <strong>${escapeHtml(po.poNumber || "Purchase order")}</strong>
        <div class="hint">${escapeHtml(po.billToName || "Vendor")} - ${escapeHtml(po.poDate || "No date")} - INR ${money(po.total || 0)}</div>
      </div>
      <span class="pill ${tone}">${escapeHtml(String(po.status || "created").toUpperCase())}</span>
    </div>
  `;

  const renderPoRow = (po, tone = "blue") => {
    const isDraft = String(po.status || "created").toLowerCase() === "draft";
    const docType = String(po.documentType || "po").toLowerCase() === "wo" ? "WO" : "PO";
    const poId = String(po.id || "");
    const currency = po.currency || "INR";
    return `
      <div class="invoice-card">
        <div>
          <strong>${escapeHtml(po.poNumber || `${docType} draft`)}</strong>
          <div class="hint">${escapeHtml(po.billToName || "Vendor")} - ${escapeHtml(po.poDate || "No date")} - ${escapeHtml(currency)} ${money(po.total || 0)}</div>
        </div>
        <div class="row-actions">
          <a class="ghost small" href="/apps/web/invoice.html?type=po&po=${encodeURIComponent(poId)}">${isDraft ? "Edit Draft" : "Open / Edit"}</a>
          <button class="ghost small danger" type="button" data-delete-po="${escapeHtml(poId)}">Delete</button>
          <span class="pill ${tone}">${escapeHtml(String(po.status || "created").toUpperCase())}</span>
        </div>
      </div>
    `;
  };

  if (draftPoList) {
    draftPoList.innerHTML = drafts.length
      ? drafts.slice().reverse().map((po) => renderPoRow(po, "gold")).join("")
      : '<div class="notice">No PO drafts yet.</div>';
  }
  if (createdPoList) {
    createdPoList.innerHTML = created.length
      ? created.slice().reverse().map((po) => renderPoRow(po, "blue")).join("")
      : '<div class="notice">No purchase orders created yet.</div>';
  }

  document.querySelectorAll("[data-delete-po]").forEach((button) => {
    button.addEventListener("click", async () => {
      const poId = button.getAttribute("data-delete-po");
      if (!poId || !window.confirm("Delete this PO/WO? The number will remain consumed and will not be reused.")) return;
      try {
        const deleted = await apiClient.deletePurchaseOrder(token, poId);
        replacePurchaseOrder(deleted);
        rerenderDashboardData();
      } catch (error) {
        setPaymentModalStatus(error.message || "Could not delete PO/WO.", "error");
      }
    });
  });
}

function renderBusinessWorkspace() {
  const enabled = activePlanAllows("teamAccess") && activePlanAllows("approvals") && activePlanAllows("apiAccess");
  if (businessWorkspaceBadge) {
    businessWorkspaceBadge.textContent = enabled ? "Business active" : "Business required";
    businessWorkspaceBadge.className = `pill ${enabled ? "blue" : "gold"}`;
  }
  if (businessWorkspaceNotice) {
    businessWorkspaceNotice.textContent = enabled
      ? "Business controls are enabled for this account. Admin preview can be used locally to test each tier safely."
      : "Upgrade to Business, or use Admin plan preview locally, to test team access, approvals, and API keys.";
  }
  [teamInviteForm, apiKeyForm, approvalRequestForm, businessEmailSettingsForm, businessPaymentSettingsForm, businessComplianceForm].forEach((form) => {
    if (!form) return;
    [...form.elements].forEach((element) => { element.disabled = !enabled; });
  });
  if (businessEmailTestButton) businessEmailTestButton.disabled = !enabled;
  if (teamMemberCount) teamMemberCount.textContent = String(dashboardTeamMembers.length);
  if (approvalRequestCount) approvalRequestCount.textContent = String(dashboardApprovalRequests.length);
  if (apiKeyCount) apiKeyCount.textContent = String(dashboardApiKeys.filter((key) => key.status !== "revoked").length);
  const emailSettings = dashboardBusinessSettings.emailSettings || {};
  const paymentSettings = dashboardBusinessSettings.paymentSettings || {};
  const complianceProfile = dashboardBusinessSettings.complianceProfile || {};
  if (smtpConfiguredBadge) {
    const configured = Boolean(emailSettings.smtpHost && emailSettings.smtpUser && emailSettings.fromEmail);
    smtpConfiguredBadge.textContent = configured ? "SMTP ready" : "SMTP not set";
    smtpConfiguredBadge.className = `pill ${configured ? "blue" : "gold"}`;
  }
  if (businessGatewayBadge) {
    const status = paymentSettings.status || "not_configured";
    businessGatewayBadge.textContent = status === "live_ready" ? "Live ready" : status === "test_mode" ? "Test key" : "Not configured";
    businessGatewayBadge.className = `pill ${status === "live_ready" ? "blue" : "gold"}`;
  }
  if (businessEmailSettingsForm && !businessEmailSettingsForm.matches(":focus-within")) {
    businessEmailSettingsForm.senderName.value = emailSettings.senderName || "";
    businessEmailSettingsForm.fromEmail.value = emailSettings.fromEmail || "";
    businessEmailSettingsForm.replyToEmail.value = emailSettings.replyToEmail || "";
    businessEmailSettingsForm.smtpHost.value = emailSettings.smtpHost || "";
    businessEmailSettingsForm.smtpPort.value = emailSettings.smtpPort || "";
    businessEmailSettingsForm.smtpUser.value = emailSettings.smtpUser || "";
    businessEmailSettingsForm.smtpPass.value = "";
    businessEmailSettingsForm.smtpSecure.checked = Boolean(emailSettings.smtpSecure);
    businessEmailSettingsForm.inviteSubject.value = emailSettings.inviteSubject || "";
    businessEmailSettingsForm.inviteTemplate.value = emailSettings.inviteTemplate || "";
  }
  if (businessPaymentSettingsForm && !businessPaymentSettingsForm.matches(":focus-within")) {
    businessPaymentSettingsForm.keyId.value = paymentSettings.keyId || "";
    businessPaymentSettingsForm.keySecret.value = "";
    businessPaymentSettingsForm.webhookSecret.value = "";
    businessPaymentSettingsForm.paymentLinkEnabled.checked = Boolean(paymentSettings.paymentLinkEnabled);
  }
  if (businessComplianceForm && !businessComplianceForm.matches(":focus-within")) {
    businessComplianceForm.legalName.value = complianceProfile.legalName || "";
    businessComplianceForm.pan.value = complianceProfile.pan || "";
    businessComplianceForm.tan.value = complianceProfile.tan || "";
    businessComplianceForm.gstin.value = complianceProfile.gstin || "";
    businessComplianceForm.state.value = complianceProfile.state || "";
    businessComplianceForm.placeOfBusiness.value = complianceProfile.placeOfBusiness || "";
    businessComplianceForm.invoicePrefix.value = complianceProfile.invoicePrefix || "";
    businessComplianceForm.fiscalYearStartMonth.value = String(complianceProfile.fiscalYearStartMonth || 4);
    businessComplianceForm.gstRegistered.checked = Boolean(complianceProfile.gstRegistered);
    businessComplianceForm.address.value = complianceProfile.address || "";
  }

  if (teamMembersList) {
    teamMembersList.innerHTML = dashboardTeamMembers.length
      ? dashboardTeamMembers.map((member) => `
        <div class="invoice-card">
          <div>
            <strong>${escapeHtml(member.name || member.email)}</strong>
            <div class="hint">${escapeHtml(member.email)} - ${escapeHtml(member.role || "viewer")} - ${escapeHtml(member.status || "invited")}</div>
          </div>
          ${member.status !== "removed" ? `<button class="ghost danger small" type="button" data-remove-team="${escapeHtml(member.id)}">Remove</button>` : "<span class=\"pill gold\">Removed</span>"}
        </div>
      `).join("")
      : `<p>${enabled ? "No team members invited yet." : "Team access unlocks in Business."}</p>`;
  }

  if (apiKeysList) {
    apiKeysList.innerHTML = dashboardApiKeys.length
      ? dashboardApiKeys.map((key) => `
        <div class="invoice-card">
          <div>
            <strong>${escapeHtml(key.label || "API key")}</strong>
            <div class="hint"><code>${escapeHtml(key.tokenPreview || "hidden")}</code> - ${escapeHtml(key.status || "active")}</div>
            ${key.token ? `<div class="notice"><strong>Copy now:</strong> <code>${escapeHtml(key.token)}</code></div>` : ""}
          </div>
          ${key.status === "active" ? `<button class="ghost danger small" type="button" data-revoke-key="${escapeHtml(key.id)}">Revoke</button>` : "<span class=\"pill gold\">Revoked</span>"}
        </div>
      `).join("")
      : `<p>${enabled ? "No API keys created yet." : "API access unlocks in Business."}</p>`;
  }

  if (approvalRequestsList) {
    approvalRequestsList.innerHTML = dashboardApprovalRequests.length
      ? dashboardApprovalRequests.map((request) => `
        <div class="invoice-card">
          <div>
            <strong>${escapeHtml(request.documentNumber || request.documentType)}</strong>
            <div class="hint">${escapeHtml(String(request.documentType || "").replace(/_/g, " "))} - ${escapeHtml(request.status || "pending")}</div>
            ${request.notes ? `<div class="hint">${escapeHtml(request.notes)}</div>` : ""}
          </div>
          <div class="row-actions">
            <button class="ghost small" type="button" data-approval-decision="${escapeHtml(request.id)}" data-status="approved">Approve</button>
            <button class="ghost danger small" type="button" data-approval-decision="${escapeHtml(request.id)}" data-status="rejected">Reject</button>
          </div>
        </div>
      `).join("")
      : `<p>${enabled ? "No approval requests yet." : "Approval workflows unlock in Business."}</p>`;
  }

  document.querySelectorAll("[data-remove-team]").forEach((button) => {
    button.addEventListener("click", async () => {
      try {
        const member = await apiClient.updateTeamMember(token, button.getAttribute("data-remove-team"), { status: "removed" });
        dashboardTeamMembers = dashboardTeamMembers.map((item) => (item.id === member.id ? member : item));
        renderBusinessWorkspace();
      } catch (error) {
        if (businessWorkspaceNotice) businessWorkspaceNotice.textContent = error.message || "Could not update team member.";
      }
    });
  });

  document.querySelectorAll("[data-revoke-key]").forEach((button) => {
    button.addEventListener("click", async () => {
      try {
        const key = await apiClient.revokeApiKey(token, button.getAttribute("data-revoke-key"));
        dashboardApiKeys = dashboardApiKeys.map((item) => (item.id === key.id ? key : item));
        renderBusinessWorkspace();
      } catch (error) {
        if (businessWorkspaceNotice) businessWorkspaceNotice.textContent = error.message || "Could not revoke API key.";
      }
    });
  });

  document.querySelectorAll("[data-approval-decision]").forEach((button) => {
    button.addEventListener("click", async () => {
      try {
        const request = await apiClient.decideApprovalRequest(token, button.getAttribute("data-approval-decision"), {
          status: button.getAttribute("data-status"),
        });
        dashboardApprovalRequests = dashboardApprovalRequests.map((item) => (item.id === request.id ? request : item));
        renderBusinessWorkspace();
      } catch (error) {
        if (businessWorkspaceNotice) businessWorkspaceNotice.textContent = error.message || "Could not update approval request.";
      }
    });
  });
}

async function loadBusinessWorkspace() {
  if (!activePlanAllows("teamAccess") && !activePlanAllows("approvals") && !activePlanAllows("apiAccess")) {
    dashboardTeamMembers = [];
    dashboardApprovalRequests = [];
    dashboardApiKeys = [];
    dashboardBusinessSettings = { emailSettings: {}, paymentSettings: {}, complianceProfile: {} };
    renderBusinessWorkspace();
    return;
  }
  const [members, approvals, apiKeys, settings] = await Promise.all([
    apiClient.listTeamMembers(token).catch(() => []),
    apiClient.listApprovalRequests(token).catch(() => []),
    apiClient.listApiKeys(token).catch(() => []),
    apiClient.getBusinessSettings(token).catch(() => ({ emailSettings: {}, paymentSettings: {}, complianceProfile: {} })),
  ]);
  dashboardTeamMembers = members;
  dashboardApprovalRequests = approvals;
  dashboardApiKeys = apiKeys;
  dashboardBusinessSettings = settings;
  renderBusinessWorkspace();
}

async function loadSubscriptionPanel(existingSubscriptions) {
  const subscriptions = existingSubscriptions || await apiClient.listMySubscriptions(token);
  const plansPayload = await apiClient.listPlans(token).catch(() => null);
  if (Array.isArray(plansPayload?.catalog)) {
    planCatalog = plansPayload.catalog.map((plan) => ({
      ...plan,
      id: plan.plan,
      description: (plan.highlights || []).join(", "),
    }));
  }
  const activePlan = plansPayload?.active || null;
  const activeSubscription = subscriptions.slice().reverse().find((subscription) => String(subscription.status || "").toLowerCase() === "active");
  currentSubscription = activePlan?.subscription || activeSubscription || { plan: "free", amount: 0, status: "active" };
  activePlanSummary = activePlan || {
    plan: currentSubscription.plan || "free",
    label: currentSubscription.plan || "Free",
    amount: currentSubscription.amount || 0,
    features: {},
    subscription: currentSubscription,
  };
  if (activePlan) renderPlanEntitlements(activePlan);
  if (currentPlanBadge) currentPlanBadge.textContent = `Current: ${activePlanSummary.label || activePlanSummary.plan || "Free"} - INR ${money(activePlanSummary.amount || 0)}`;
  renderAiAssistantAccess();
  if (subscriptionHistory) {
    subscriptionHistory.innerHTML = subscriptions.length
      ? subscriptions.slice().reverse().map((subscription) => `
        <div class="invoice-card">
          <div>
            <strong>${escapeHtml(subscription.plan || "Subscription")}</strong>
            <div class="hint">${escapeHtml(subscription.billingCycle || "yearly")} - INR ${money(subscription.amount || 0)} collected${subscription.monthlyAmount ? ` - INR ${money(subscription.monthlyAmount)}/mo equivalent` : ""} - ${escapeHtml(subscription.status || "active")}</div>
            ${subscription.renewsAt ? `<div class="hint">Renews on ${escapeHtml(String(subscription.renewsAt).slice(0, 10))}</div>` : ""}
            ${subscription.gatewayOrderId ? `<div class="hint">Order: <code>${escapeHtml(subscription.gatewayOrderId)}</code></div>` : ""}
            ${subscription.gatewayPaymentId ? `<div class="hint">Payment: <code>${escapeHtml(subscription.gatewayPaymentId)}</code></div>` : ""}
          </div>
          <span class="pill ${subscriptionStatusTone(subscription.status)}">${escapeHtml(String(subscription.status || "active").toUpperCase())}</span>
        </div>
      `).join("")
      : "<p>No subscription history yet.</p>";
  }
  renderPlanCards(activePlanSummary.plan || "free");
  await loadBusinessWorkspace().catch(() => renderBusinessWorkspace());
}

profileMenuButton?.addEventListener("click", () => {
  const isOpen = !profileDropdown?.hidden;
  if (profileDropdown) profileDropdown.hidden = isOpen;
  profileMenuButton.setAttribute("aria-expanded", String(!isOpen));
});

document.addEventListener("click", (event) => {
  if (!profileDropdown || profileDropdown.hidden || !profileMenuButton) return;
  const target = event.target;
  if (target instanceof Node && (profileDropdown.contains(target) || profileMenuButton.contains(target))) return;
  profileDropdown.hidden = true;
  profileMenuButton.setAttribute("aria-expanded", "false");
});

profileLogoutBtn?.addEventListener("click", () => {
  clearToken();
  window.location.href = "/apps/web/index.html";
});

aiInvoiceExample?.addEventListener("click", () => {
  if (aiCommandInput) aiCommandInput.value = "Create invoice for Rahul Sharma for website design INR 15000 plus 18% GST due in 7 days";
  aiCommandInput?.focus();
});

aiPoExample?.addEventListener("click", () => {
  if (aiCommandInput) aiCommandInput.value = "Generate PO for Dell laptops quantity 5 INR 50000 plus 18% GST";
  aiCommandInput?.focus();
});

aiReportExample?.addEventListener("click", () => {
  if (aiCommandInput) aiCommandInput.value = "Show profit and loss report summary";
  aiCommandInput?.focus();
});

aiVoiceButton?.addEventListener("click", () => {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    setAiAssistantStatus("Voice input is not available in this browser. Please type the command.", "error");
    return;
  }
  const recognition = new SpeechRecognition();
  recognition.lang = "en-IN";
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;
  aiVoiceButton.disabled = true;
  aiVoiceButton.textContent = "Listening...";
  setAiAssistantStatus("Listening. Speak the invoice, PO, or report command clearly.", "");
  recognition.onresult = (event) => {
    const transcript = event.results?.[0]?.[0]?.transcript || "";
    if (aiCommandInput) aiCommandInput.value = transcript;
    setAiAssistantStatus("Voice command captured. Review the text, then send it.", "success");
  };
  recognition.onerror = () => {
    setAiAssistantStatus("Could not capture voice command. Typed commands still work.", "error");
  };
  recognition.onend = () => {
    aiVoiceButton.disabled = !canUseAiAssistant();
    aiVoiceButton.textContent = "Voice input";
  };
  recognition.start();
});

async function sendAiCommand() {
  if (!canUseAiAssistant()) {
    setAiAssistantStatus("AI assistant is available on Pro and Business plans.", "error");
    return;
  }
  const command = aiCommandInput?.value?.trim() || "";
  if (!command) {
    setAiAssistantStatus("Enter a command for invoice, PO/WO, or report generation.", "error");
    return;
  }
  aiCommandRun.disabled = true;
  if (aiCommandInput) aiCommandInput.value = "";
  appendAiChatMessage("user", command);
  showAiThinking();
  setAiAssistantStatus("AI is reviewing your command...", "");
  try {
    const result = await apiClient.runAiCommand(token, { command, previewOnly: true });
    removeAiThinking();
    pendingAiDraftCommand = result.intent === "invoice" || result.intent === "purchase_order" ? command : null;
    pendingAiDraftResult = pendingAiDraftCommand ? result : null;
    renderAiResult(result);
    const missingCustomer = result.customerMatch?.status === "missing";
    setAiAssistantStatus(
      result.intent === "report"
        ? "AI report summary ready."
        : missingCustomer
          ? "AI proposal ready, but this customer is not saved yet. Add the customer first or create the draft and complete details later."
          : "AI proposal ready. Review it, then create the draft if it looks correct.",
      missingCustomer ? "" : "success"
    );
  } catch (error) {
    const message = error.message === "Not found"
      ? "AI command route was not found on the running server. Restart the EazInvoice server and try again."
      : error.message || "Could not run AI command.";
    removeAiThinking();
    appendAiChatMessage("assistant", message);
    setAiAssistantStatus(message, "error");
  } finally {
    aiCommandRun.disabled = !canUseAiAssistant();
  }
}

aiCommandRun?.addEventListener("click", sendAiCommand);

aiCommandInput?.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" || event.shiftKey) return;
  event.preventDefault();
  sendAiCommand();
});

attachFormValidityStatus(
  businessEmailSettingsForm,
  businessEmailStatus,
  "Please fix the highlighted email/SMTP fields first. Reply-to must be a complete email address, for example info@eazinvoice.com.",
);
attachFormValidityStatus(teamInviteForm, teamInviteStatus, "Please enter a valid invitee email address.");
attachFormValidityStatus(apiKeyForm, apiKeyStatus, "Please enter an API key label.");
attachFormValidityStatus(approvalRequestForm, approvalRequestStatus, "Please enter a document number or draft name.");

teamInviteForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  setInlineStatus(teamInviteStatus, "Inviting team member...", "");
  const formData = new FormData(teamInviteForm);
  try {
    const member = await apiClient.createTeamMember(token, {
      name: formData.get("name"),
      email: formData.get("email"),
      role: formData.get("role"),
    });
    dashboardTeamMembers = [member, ...dashboardTeamMembers.filter((item) => item.id !== member.id)];
    teamInviteForm.reset();
    const deliveryStatus = member.inviteDeliveryStatus || "queued";
    const deliveryMessage = member.inviteDeliveryMessage || "Team member invitation saved in the Business workspace.";
    setInlineStatus(
      teamInviteStatus,
      deliveryMessage,
      deliveryStatus === "failed" ? "error" : "success",
    );
    renderBusinessWorkspace();
  } catch (error) {
    if (businessWorkspaceNotice) businessWorkspaceNotice.textContent = error.message || "Could not invite team member.";
    setInlineStatus(teamInviteStatus, error.message || "Could not invite team member.", "error");
  }
});

businessEmailSettingsForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  setInlineStatus(businessEmailStatus, "Saving email settings...", "");
  const formData = new FormData(businessEmailSettingsForm);
  try {
    dashboardBusinessSettings = await apiClient.updateBusinessSettings(token, {
      emailSettings: {
        senderName: formData.get("senderName"),
        fromEmail: formData.get("fromEmail"),
        replyToEmail: formData.get("replyToEmail"),
        smtpHost: formData.get("smtpHost"),
        smtpPort: formData.get("smtpPort"),
        smtpUser: formData.get("smtpUser"),
        smtpPass: formData.get("smtpPass"),
        smtpSecure: formData.get("smtpSecure") === "on",
        inviteSubject: formData.get("inviteSubject"),
        inviteTemplate: formData.get("inviteTemplate"),
      },
    });
    if (businessWorkspaceNotice) businessWorkspaceNotice.textContent = "Business email settings saved. SMTP password is hidden after saving.";
    setInlineStatus(businessEmailStatus, "Business email settings saved. SMTP password is hidden after saving.", "success");
    renderBusinessWorkspace();
  } catch (error) {
    if (businessWorkspaceNotice) businessWorkspaceNotice.textContent = error.message || "Could not save email settings.";
    setInlineStatus(businessEmailStatus, error.message || "Could not save email settings.", "error");
  }
});

businessEmailTestButton?.addEventListener("click", async () => {
  if (!businessEmailSettingsForm?.reportValidity()) {
    setInlineStatus(businessEmailStatus, "Please fix the highlighted email/SMTP fields first. Reply-to must be a complete email address.", "error");
    return;
  }
  setInlineStatus(businessEmailStatus, "Validating SMTP settings and sending a test email when possible...", "");
  const formData = new FormData(businessEmailSettingsForm);
  const hasPassword = Boolean(String(formData.get("smtpPass") || "").trim());
  try {
    dashboardBusinessSettings = await apiClient.validateBusinessEmailSettings(token, {
      sendTestEmail: hasPassword,
      testRecipient: formData.get("replyToEmail") || formData.get("fromEmail"),
      emailSettings: {
        senderName: formData.get("senderName"),
        fromEmail: formData.get("fromEmail"),
        replyToEmail: formData.get("replyToEmail"),
        smtpHost: formData.get("smtpHost"),
        smtpPort: formData.get("smtpPort"),
        smtpUser: formData.get("smtpUser"),
        smtpPass: formData.get("smtpPass"),
        smtpSecure: formData.get("smtpSecure") === "on",
        inviteSubject: formData.get("inviteSubject"),
        inviteTemplate: formData.get("inviteTemplate"),
      },
    });
    const status = dashboardBusinessSettings.emailSettings?.lastTestStatus || "ready";
    const deliveryStatus = dashboardBusinessSettings.emailSettings?.lastDeliveryStatus || "";
    const deliveryMessage = dashboardBusinessSettings.emailSettings?.lastDeliveryMessage || "";
    if (businessWorkspaceNotice) businessWorkspaceNotice.textContent = status === "ready"
      ? (deliveryStatus === "sent" ? deliveryMessage : "SMTP settings look complete. Re-enter the mailbox password/app password and click Validate to send a real test email.")
      : `SMTP settings need attention: ${status}`;
    setInlineStatus(
      businessEmailStatus,
      status === "ready"
        ? (deliveryStatus === "sent" ? deliveryMessage : "SMTP fields are valid. Enter the mailbox password/app password before sending a real test email.")
        : `SMTP settings need attention: ${status}`,
      status === "ready" ? "success" : "error",
    );
    renderBusinessWorkspace();
  } catch (error) {
    if (businessWorkspaceNotice) businessWorkspaceNotice.textContent = error.message || "Could not validate SMTP settings.";
    setInlineStatus(businessEmailStatus, error.message || "Could not validate SMTP settings.", "error");
  }
});

businessPaymentSettingsForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  setInlineStatus(businessPaymentStatus, "Saving gateway settings...", "");
  const formData = new FormData(businessPaymentSettingsForm);
  try {
    dashboardBusinessSettings = await apiClient.updateBusinessSettings(token, {
      paymentSettings: {
        keyId: formData.get("keyId"),
        keySecret: formData.get("keySecret"),
        webhookSecret: formData.get("webhookSecret"),
        paymentLinkEnabled: formData.get("paymentLinkEnabled") === "on",
      },
    });
    if (businessWorkspaceNotice) businessWorkspaceNotice.textContent = "Business Razorpay settings saved. Secrets are hidden after saving.";
    setInlineStatus(businessPaymentStatus, "Business Razorpay settings saved. Secrets are hidden after saving.", "success");
    renderBusinessWorkspace();
  } catch (error) {
    if (businessWorkspaceNotice) businessWorkspaceNotice.textContent = error.message || "Could not save payment gateway settings.";
    setInlineStatus(businessPaymentStatus, error.message || "Could not save payment gateway settings.", "error");
  }
});

businessComplianceForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  setInlineStatus(businessComplianceStatus, "Saving compliance profile...", "");
  const formData = new FormData(businessComplianceForm);
  try {
    dashboardBusinessSettings = await apiClient.updateBusinessSettings(token, {
      complianceProfile: {
        legalName: formData.get("legalName"),
        pan: formData.get("pan"),
        tan: formData.get("tan"),
        gstin: formData.get("gstin"),
        state: formData.get("state"),
        placeOfBusiness: formData.get("placeOfBusiness"),
        invoicePrefix: formData.get("invoicePrefix"),
        fiscalYearStartMonth: formData.get("fiscalYearStartMonth"),
        gstRegistered: formData.get("gstRegistered") === "on",
        address: formData.get("address"),
      },
    });
    if (businessWorkspaceNotice) businessWorkspaceNotice.textContent = "Compliance profile saved for reports, audit trails, and future GST exports.";
    setInlineStatus(businessComplianceStatus, "Compliance profile saved for reports, audit trails, and future GST exports.", "success");
    renderBusinessWorkspace();
  } catch (error) {
    if (businessWorkspaceNotice) businessWorkspaceNotice.textContent = error.message || "Could not save compliance profile.";
    setInlineStatus(businessComplianceStatus, error.message || "Could not save compliance profile.", "error");
  }
});

apiKeyForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  setInlineStatus(apiKeyStatus, "Generating API key...", "");
  const formData = new FormData(apiKeyForm);
  try {
    const key = await apiClient.createApiKey(token, { label: formData.get("label") });
    dashboardApiKeys = [key, ...dashboardApiKeys];
    apiKeyForm.reset();
    setInlineStatus(apiKeyStatus, "API key generated. Copy the secret now; it will be hidden after refresh.", "success");
    renderBusinessWorkspace();
  } catch (error) {
    if (businessWorkspaceNotice) businessWorkspaceNotice.textContent = error.message || "Could not create API key.";
    setInlineStatus(apiKeyStatus, error.message || "Could not create API key.", "error");
  }
});

approvalRequestForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  setInlineStatus(approvalRequestStatus, "Creating approval request...", "");
  const formData = new FormData(approvalRequestForm);
  try {
    const request = await apiClient.createApprovalRequest(token, {
      documentType: formData.get("documentType"),
      documentNumber: formData.get("documentNumber"),
      notes: formData.get("notes"),
    });
    dashboardApprovalRequests = [request, ...dashboardApprovalRequests];
    approvalRequestForm.reset();
    setInlineStatus(approvalRequestStatus, "Approval request created.", "success");
    renderBusinessWorkspace();
  } catch (error) {
    if (businessWorkspaceNotice) businessWorkspaceNotice.textContent = error.message || "Could not create approval request.";
    setInlineStatus(approvalRequestStatus, error.message || "Could not create approval request.", "error");
  }
});

paymentModalClose?.addEventListener("click", closePaymentModal);
paymentModalCancel?.addEventListener("click", closePaymentModal);
paymentModal?.addEventListener("click", (event) => {
  if (event.target === paymentModal) closePaymentModal();
});

paymentForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const invoiceId = paymentInvoiceId?.value || "";
  const amount = Number(paymentAmountInput?.value || 0);
  const currentInvoice = dashboardInvoices.find((invoice) => invoice.id === invoiceId);
  const balance = Number(currentInvoice?.balanceAmount ?? currentInvoice?.total ?? 0);
  if (!invoiceId || !Number.isFinite(amount) || amount <= 0) {
    setPaymentModalStatus("Enter a valid payment amount.", "error");
    return;
  }
  if (balance > 0 && amount > balance + 0.01) {
    setPaymentModalStatus(`Payment cannot be more than the pending balance of ${currentInvoice?.currency || "INR"} ${money(balance)}.`, "error");
    return;
  }
  try {
    setPaymentModalStatus("Adding payment...", "");
    const result = await apiClient.recordInvoicePayment(token, invoiceId, {
      amount,
      mode: paymentModeInput?.value || "manual",
      reference: paymentReferenceInput?.value || "",
      notes: paymentNotesInput?.value || "",
      paymentDate: paymentDateInput?.value || new Date().toISOString().slice(0, 10),
    });
    const updatedInvoice = result.invoice || result;
    replaceInvoice(updatedInvoice);
    if (result.payment) {
      const existingPaymentIndex = dashboardPayments.findIndex((payment) => payment.id === result.payment.id);
      if (existingPaymentIndex >= 0) dashboardPayments[existingPaymentIndex] = result.payment;
      else dashboardPayments.push(result.payment);
    }
    rerenderDashboardData();
    renderPaymentModalDetails(updatedInvoice);
    const updatedBalance = Number(updatedInvoice.balanceAmount ?? 0);
    if (updatedBalance > 0) {
      paymentAmountInput.value = String(updatedBalance);
      paymentAmountInput.max = String(updatedBalance);
      if (paymentReferenceInput) paymentReferenceInput.value = "";
      if (paymentNotesInput) paymentNotesInput.value = "";
      setPaymentModalStatus(`Payment added. Pending balance is ${updatedInvoice.currency || "INR"} ${money(updatedBalance)}. Add another payment when received.`, "success");
      paymentAmountInput.focus();
    } else {
      setPaymentModalStatus("Payment added. Invoice is now PAID and reports are refreshed.", "success");
      setTimeout(closePaymentModal, 900);
    }
  } catch (error) {
    setPaymentModalStatus(error.message || "Could not add payment.", "error");
  }
});

runRecurringDraftsBtn?.addEventListener("click", async () => {
  if (!activePlanAllows("recurringInvoices")) {
    setRecurringDraftStatus("Recurring draft generation is available on Standard and higher plans.", "error");
    return;
  }
  runRecurringDraftsBtn.disabled = true;
  setRecurringDraftStatus("Checking due recurring invoices...", "");
  try {
    const result = await apiClient.runRecurringInvoiceDrafts(token, {
      targetDate: new Date().toISOString().slice(0, 10),
    });
    (result.created || []).forEach(replaceInvoice);
    const createdCount = result.created?.length || 0;
    rerenderDashboardData();
    setRecurringDraftStatus(
      createdCount
        ? `${createdCount} recurring draft${createdCount === 1 ? "" : "s"} created. Open Draft Invoices to continue.`
        : "No due recurring invoices found for today.",
      createdCount ? "success" : ""
    );
  } catch (error) {
    setRecurringDraftStatus(error.message || "Could not generate recurring drafts.", "error");
  } finally {
    runRecurringDraftsBtn.disabled = !activePlanAllows("recurringInvoices");
  }
});

[reportMonth, reportYear].forEach((filter) => {
  filter?.addEventListener("change", () => {
    renderDashboardMetrics(dashboardInvoices);
    renderInvoiceWorkspace(dashboardInvoices);
    renderPoWorkspace(dashboardPurchaseOrders);
  });
});

[detailReportPeriod, detailReportMonth, detailReportYear, detailFinancialYear, detailStartDate, detailEndDate].forEach((filter) => {
  filter?.addEventListener("change", () => {
    syncDetailFilterVisibility();
    if (currentDashboardPage().startsWith("report-")) renderReportDetail(currentDashboardPage().replace("report-", ""));
  });
});

workspaceTargetLinks.forEach((link) => {
  link.addEventListener("click", (event) => {
    const targetId = link.getAttribute("data-workspace-target");
    if (!targetId) return;
    event.preventDefault();
    if (window.location.hash !== "#business-workspace") {
      window.location.hash = "#business-workspace";
      window.setTimeout(() => openWorkspaceGroup(targetId, true), 40);
      return;
    }
    showDashboardPage("business-workspace");
    openWorkspaceGroup(targetId, true);
  });
});

workspaceGroups.forEach((group) => {
  group.addEventListener("toggle", () => {
    if (!group.open) return;
    workspaceGroups.forEach((otherGroup) => {
      if (otherGroup !== group) otherGroup.open = false;
    });
  });
});

window.addEventListener("hashchange", () => showDashboardPage());

async function initializeDashboard() {
  try {
    const [summary, companies, customers, reports, invoices, purchaseOrders, payments, subscriptions] = await Promise.all([
      apiClient.getPlan(token).catch(() => ({ plan: "free", usage: { companies: 0, customers: 0, invoicesPerMonth: 0 }, limits: { companies: 1, customers: 100, invoicesPerMonth: 10 } })),
      apiClient.listCompanies(token).catch(() => []),
      apiClient.listCustomers(token).catch(() => []),
      apiClient.listReports(token).catch(() => []),
      apiClient.listInvoices(token),
      apiClient.listPurchaseOrders(token).catch(() => []),
      apiClient.listPayments(token).catch(() => []),
      apiClient.listMySubscriptions(token).catch(() => []),
    ]);
  currentSubscription = subscriptions.slice().reverse().find((subscription) => String(subscription.status || "active").toLowerCase() === "active")
    || subscriptions[subscriptions.length - 1]
    || currentSubscription;

  if (planSummary) {
    planSummary.innerHTML = `
      <strong>${summary.plan.toUpperCase()}</strong><br />
      Companies: ${summary.usage.companies}/${summary.limits.companies}<br />
      Customers: ${summary.usage.customers}/${summary.limits.customers}<br />
      Invoices: ${summary.usage.invoicesPerMonth}/${summary.limits.invoicesPerMonth}<br />
      AI: ${summary.limits.aiCommandsPerMonth ? `${summary.usage.aiCommandsPerMonth}/${summary.limits.aiCommandsPerMonth}` : "Upgrade to Pro"}
    `;
  }
  renderPlanEntitlements(summary);

  dashboardInvoices = invoices;
  dashboardCompanies = companies;
  dashboardCustomers = customers;
  dashboardPurchaseOrders = purchaseOrders;
  dashboardPayments = payments;
  populateReportFilters(dashboardInvoices, dashboardPurchaseOrders);
  const activeOrg = companies[0] || null;
  renderDashboardMetrics(dashboardInvoices);
  renderInvoiceWorkspace(dashboardInvoices);
  renderPoWorkspace(dashboardPurchaseOrders);
  renderRecentActivity(dashboardInvoices, dashboardCompanies);
  renderBusinessProfiles(dashboardCompanies);
  renderCustomers(dashboardCustomers);
  renderVendors(dashboardPurchaseOrders);
  renderProfile(currentUser, activeOrg);
  if (activeOrg) {
    if (orgName) orgName.textContent = activeOrg.entityType === "freelancer" || activeOrg.entityType === "consultant" ? activeOrg.name : activeOrg.legalName || activeOrg.name;
    if (orgMeta) orgMeta.textContent = `${activeOrg.entityType.toUpperCase()} · ${activeOrg.address || "No address saved"}`;
    if (orgKyc) {
      orgKyc.textContent = `KYC: ${activeOrg.kycStatus || "pending"} · Review: ${activeOrg.reviewStatus || "pending"} · Mode: ${activeOrg.kycMode || "document-review"}`;
    }
    if (activeOrg.logoUrl && orgLogo) {
      orgLogo.src = activeOrg.logoUrl;
      orgLogo.hidden = false;
    }
  } else {
    if (orgName) orgName.textContent = "No organization profile yet";
    if (orgMeta) orgMeta.textContent = "Free tier can continue. Paid plans require a submitted profile.";
    if (orgKyc) orgKyc.textContent = "";
  }

  if (reportsList) {
    reportsList.innerHTML = reports.length
      ? reports.map((report) => `
        <div class="report-card">
          <strong>${report.title}</strong>
          <div class="hint">${report.reportType} · Invoices: ${report.totalInvoices} · POs: ${report.totalPurchaseOrders}</div>
        </div>
      `).join("")
      : "<p>No reports yet for this organization.</p>";
  }
    loadSubscriptionPanel(subscriptions).catch((error) => {
      if (subscriptionStatus) subscriptionStatus.textContent = error.message || "Could not load subscription details.";
    });
    showDashboardPage();
  } catch (error) {
    renderProfile(currentUser, null);
    if (recentActivity) recentActivity.innerHTML = `<p>${error.message || "Could not load dashboard data. Please refresh or login again."}</p>`;
    showDashboardPage();
  }
}

showDashboardPage();
renderAiAssistantAccess();
initializeDashboard();
