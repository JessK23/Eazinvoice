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
const accountingAssets = document.getElementById("accountingAssets");
const accountingLiabilities = document.getElementById("accountingLiabilities");
const accountingIncome = document.getElementById("accountingIncome");
const accountingExpenses = document.getElementById("accountingExpenses");
const accountingProfit = document.getElementById("accountingProfit");
const chartOfAccountsList = document.getElementById("chartOfAccountsList");
const trialBalanceList = document.getElementById("trialBalanceList");
const accountingStatus = document.getElementById("accountingStatus");
const refreshAccountingBtn = document.getElementById("refreshAccountingBtn");
const ledgerAccountForm = document.getElementById("ledgerAccountForm");
const ledgerAccountStatus = document.getElementById("ledgerAccountStatus");
const journalEntryForm = document.getElementById("journalEntryForm");
const journalEntryStatus = document.getElementById("journalEntryStatus");
const journalDebitAccount = document.getElementById("journalDebitAccount");
const journalCreditAccount = document.getElementById("journalCreditAccount");
const journalEntriesList = document.getElementById("journalEntriesList");
const bankBookList = document.getElementById("bankBookList");
const cashBookList = document.getElementById("cashBookList");
const ledgerDrilldownList = document.getElementById("ledgerDrilldownList");
const accountingGstCards = document.getElementById("accountingGstCards");
const accountingGstEntries = document.getElementById("accountingGstEntries");
const balanceSheetSummary = document.getElementById("balanceSheetSummary");
const cashFlowSummary = document.getElementById("cashFlowSummary");
const reportMonth = document.getElementById("reportMonth");
const reportYear = document.getElementById("reportYear");
const paymentModal = document.getElementById("paymentModal");
const paymentForm = document.getElementById("paymentForm");
const paymentModalClose = document.getElementById("paymentModalClose");
const paymentModalCancel = document.getElementById("paymentModalCancel");
const paymentModalStatus = document.getElementById("paymentModalStatus");
const paymentModalTitle = document.getElementById("paymentModalTitle");
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
const vendorForm = document.getElementById("vendorForm");
const vendorFormStatus = document.getElementById("vendorFormStatus");
const reportDetailBadge = document.getElementById("reportDetailBadge");
const reportDetailTitle = document.getElementById("reportDetailTitle");
const detailReportPeriod = document.getElementById("detailReportPeriod");
const detailReportMonth = document.getElementById("detailReportMonth");
const detailReportYear = document.getElementById("detailReportYear");
const detailFinancialYear = document.getElementById("detailFinancialYear");
const detailStartDate = document.getElementById("detailStartDate");
const detailEndDate = document.getElementById("detailEndDate");
const detailComplianceStatus = document.getElementById("detailComplianceStatus");
const detailComplianceType = document.getElementById("detailComplianceType");
const reportDetailMetrics = document.getElementById("reportDetailMetrics");
const reportDetailHead = document.getElementById("reportDetailHead");
const reportDetailBody = document.getElementById("reportDetailBody");
const reportExportCsv = document.getElementById("reportExportCsv");
const reportExportPrint = document.getElementById("reportExportPrint");
const reportExportStatus = document.getElementById("reportExportStatus");
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
const aiQuotaPanel = document.getElementById("aiQuotaPanel");
const aiQuotaPlan = document.getElementById("aiQuotaPlan");
const aiQuotaRemaining = document.getElementById("aiQuotaRemaining");
const aiQuotaFeatures = document.getElementById("aiQuotaFeatures");
const aiAssistantResult = document.getElementById("aiAssistantResult");
const aiUsageStats = document.getElementById("aiUsageStats");
const aiUsageHistoryList = document.getElementById("aiUsageHistoryList");
const aiUsageResetNote = document.getElementById("aiUsageResetNote");
const aiUsagePeriodBadge = document.getElementById("aiUsagePeriodBadge");
const adminAiUsagePanel = document.getElementById("adminAiUsagePanel");
const adminAiUsageList = document.getElementById("adminAiUsageList");
const adminOperationsSideLink = document.getElementById("adminOperationsSideLink");
const adminOperationsRefresh = document.getElementById("adminOperationsRefresh");
const adminOperationsStatus = document.getElementById("adminOperationsStatus");
const adminOperationsSummary = document.getElementById("adminOperationsSummary");
const adminOperationsRisks = document.getElementById("adminOperationsRisks");
const adminOperationsTechnical = document.getElementById("adminOperationsTechnical");
const businessWorkspaceBadge = document.getElementById("businessWorkspaceBadge");
const businessWorkspaceNotice = document.getElementById("businessWorkspaceNotice");
const businessWorkspaceStatusBoard = document.getElementById("businessWorkspaceStatusBoard");
const businessWorkspacePermissionPanel = document.getElementById("businessWorkspacePermissionPanel");
const businessWorkspaceFlowChecklist = document.getElementById("businessWorkspaceFlowChecklist");
const businessWorkspaceNavGroup = document.getElementById("businessWorkspaceNavGroup");
const businessWorkspaceSwitcher = document.getElementById("businessWorkspaceSwitcher");
const businessWorkspaceRoleBadge = document.getElementById("businessWorkspaceRoleBadge");
const complianceOverallBadge = document.getElementById("complianceOverallBadge");
const complianceHealthCards = document.getElementById("complianceHealthCards");
const complianceReadinessList = document.getElementById("complianceReadinessList");
const gstComplianceSummary = document.getElementById("gstComplianceSummary");
const complianceAuditSnapshot = document.getElementById("complianceAuditSnapshot");
const complianceExportCsv = document.getElementById("complianceExportCsv");
const compliancePrintReport = document.getElementById("compliancePrintReport");
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
const businessNotificationCount = document.getElementById("businessNotificationCount");
const businessNotificationList = document.getElementById("businessNotificationList");
const businessDeliverySummary = document.getElementById("businessDeliverySummary");
const businessDeliveryFilterForm = document.getElementById("businessDeliveryFilterForm");
const businessDeliveryClearFilters = document.getElementById("businessDeliveryClearFilters");
const businessDeliveryFilterStatus = document.getElementById("businessDeliveryFilterStatus");
const businessDeliveryHistory = document.getElementById("businessDeliveryHistory");
const businessAuditCount = document.getElementById("businessAuditCount");
const businessAuditList = document.getElementById("businessAuditList");
const businessAuditFilterForm = document.getElementById("businessAuditFilterForm");
const businessAuditClearFilters = document.getElementById("businessAuditClearFilters");
const businessAuditFilterStatus = document.getElementById("businessAuditFilterStatus");
const workspaceTargetLinks = document.querySelectorAll("[data-workspace-target]");
const workspaceSectionSelect = document.getElementById("workspaceSectionSelect");
const workspaceSectionHint = document.getElementById("workspaceSectionHint");
const workspaceGroups = document.querySelectorAll(".workspace-group");

let planCatalog = [
  { id: "free", label: "Free", amount: 0, monthlyAmount: 0, annualAmount: 0, billingCycle: "yearly", description: "Basic invoice creation and tracking", features: ["1 company", "limited invoices", "basic reports", "dashboard access", "free WordPress CTA plugin"] },
  { id: "standard", label: "Standard", amount: 2388, monthlyAmount: 199, annualAmount: 2388, billingCycle: "yearly", description: "For growing small businesses", features: ["WhatsApp sharing", "payment links", "recurring drafts", "WordPress paid access"] },
  { id: "pro", label: "Pro", amount: 5988, monthlyAmount: 499, annualAmount: 5988, billingCycle: "yearly", description: "For AI-assisted billing and reporting", features: ["AI invoices", "AI PO/WO", "advanced reports", "multiple businesses"] },
  { id: "business", label: "Business", amount: 11988, monthlyAmount: 999, annualAmount: 11988, billingCycle: "yearly", description: "For teams, approvals, API access, and analytics", features: ["team access", "approval workflows", "API access", "SMTP and gateway controls"] },
];

let currentSubscription = { plan: "free", amount: 0, status: "active" };
let activePlanSummary = { plan: "free", label: "Free", amount: 0, features: {}, subscription: currentSubscription };
let dashboardInvoices = [];
let dashboardCompanies = [];
let dashboardPurchaseOrders = [];
let dashboardCustomers = [];
let dashboardVendors = [];
let dashboardPayments = [];
let dashboardReportSummary = null;
let detailReportSummary = null;
let dashboardTeamMembers = [];
let dashboardApprovalRequests = [];
let dashboardApiKeys = [];
let dashboardBusinessSettings = { emailSettings: {}, paymentSettings: {}, complianceProfile: {} };
let dashboardBusinessCompliance = null;
let dashboardBusinessWorkspaces = [];
let dashboardBusinessAuditEvents = [];
let dashboardBusinessNotifications = [];
let dashboardBusinessDeliveryEvents = [];
let selectedBusinessWorkspaceOwnerId = window.localStorage?.getItem("eazinvoice_business_workspace_owner") || "";
let currentReportExport = { title: "Detailed Report", headers: [], rows: [] };
let razorpayCheckoutPromise = null;
let pendingAiDraftCommand = null;
let pendingAiDraftResult = null;
let aiThinkingMessage = null;
let accountingAccounts = [];

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
    refreshDetailReportSummary().then(() => {
      if (currentDashboardPage().startsWith("report-")) {
        renderReportDetail(currentDashboardPage().replace("report-", ""));
      }
    });
  }
  if (page === "reports") renderMainReportCharts();
  if (page === "admin-operations") loadAdminOperations();
}

function syncWorkspaceSectionControls(groupId) {
  if (workspaceSectionSelect && groupId && workspaceSectionSelect.value !== groupId) {
    workspaceSectionSelect.value = groupId;
  }
  workspaceTargetLinks.forEach((link) => {
    const isActive = link.getAttribute("data-workspace-target") === groupId;
    link.classList.toggle("active", isActive);
    if (isActive) link.setAttribute("aria-current", "true");
    else link.removeAttribute("aria-current");
  });
}

function openWorkspaceGroup(groupId, scrollIntoView = false) {
  if (!groupId) return;
  workspaceGroups.forEach((group) => {
    group.open = group.id === groupId;
  });
  syncWorkspaceSectionControls(groupId);
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

function activeBusinessWorkspace() {
  if (!dashboardBusinessWorkspaces.length) {
    return {
      ownerUserId: currentUser?.id || "",
      label: currentUser?.name || currentUser?.email || "My workspace",
      role: currentUser?.role === "admin" ? "admin" : "owner",
      source: "owned",
      permissions: {
        read: true,
        writeRecords: true,
        compliance: true,
        approvals: true,
        apiAccess: true,
        manageTeam: true,
        manageSettings: true,
      },
    };
  }
  return dashboardBusinessWorkspaces.find((workspace) => workspace.ownerUserId === selectedBusinessWorkspaceOwnerId)
    || dashboardBusinessWorkspaces[0];
}

function selectedWorkspaceOptions(extra = {}) {
  const workspace = activeBusinessWorkspace();
  return {
    ...extra,
    workspaceOwnerUserId: workspace?.ownerUserId || currentUser?.id || "",
  };
}

function workspaceCan(permission) {
  return Boolean(activeBusinessWorkspace()?.permissions?.[permission]);
}

function activeWorkspaceIsSharedTeam() {
  return activeBusinessWorkspace()?.source === "team";
}

function selectedWorkspaceRoleLabel() {
  const role = String(activeBusinessWorkspace()?.role || "owner").replace(/_/g, " ");
  return role.charAt(0).toUpperCase() + role.slice(1);
}

function workspaceCanWriteRecords() {
  return !activeWorkspaceIsSharedTeam() || workspaceCan("writeRecords");
}

function workspaceWriteLockMessage(action = "change records") {
  return `Your ${selectedWorkspaceRoleLabel()} role can view this Business workspace, but cannot ${action}.`;
}

function setWorkspaceLockStatus(action, element = paymentModalStatus) {
  const message = workspaceWriteLockMessage(action);
  setInlineStatus(element, message, "error");
  return message;
}

function canOpenBusinessWorkspace() {
  return activePlanAllows("teamAccess") || dashboardBusinessWorkspaces.some((workspace) => workspace.source === "team");
}

const WORKSPACE_PERMISSION_COPY = [
  { key: "read", label: "View workspace", description: "See workspace records and shared business context." },
  { key: "writeRecords", label: "Create records", description: "Prepare invoices, PO/WO records, and shared drafts." },
  { key: "compliance", label: "Compliance tasks", description: "Update GST, audit, and statutory follow-up tasks." },
  { key: "approvals", label: "Approvals", description: "Create, approve, or reject approval requests." },
  { key: "apiAccess", label: "API keys", description: "Generate and revoke integration keys." },
  { key: "manageTeam", label: "Team members", description: "Invite, remove, and manage workspace users." },
  { key: "manageSettings", label: "Business settings", description: "Change SMTP, gateway, and business configuration." },
];
const WORKSPACE_SECTION_META = [
  {
    id: "workspace-email-settings",
    title: "Email and SMTP",
    description: "Use only when business emails should go from your own mailbox.",
    permission: "manageSettings",
  },
  {
    id: "workspace-gateway-settings",
    title: "Razorpay Gateway",
    description: "Optional business payment links for invoices.",
    permission: "manageSettings",
  },
  {
    id: "workspace-compliance-profile",
    title: "Compliance Profile",
    description: "GST, PAN, audit, and statutory readiness data.",
    permission: "compliance",
  },
  {
    id: "workspace-team-access",
    title: "Sub-users",
    description: "Create accountant or viewer access by email.",
    permission: "manageTeam",
  },
  {
    id: "workspace-api-access",
    title: "API Access",
    description: "Keys for WordPress and external integrations.",
    permission: "apiAccess",
  },
  {
    id: "workspace-approval-queue",
    title: "Approvals",
    description: "Review requests for invoices, PO, and WO records.",
    permission: "approvals",
  },
  {
    id: "workspace-notification-center",
    title: "Notifications",
    description: "Operational alerts from SMTP, gateway, compliance, approvals, team, API, and audit data.",
    permission: "read",
  },
  {
    id: "workspace-audit-trail",
    title: "Audit Trail",
    description: "Review workspace activity, security, delivery, payment, and gateway events.",
    permission: "read",
  },
];

function businessWorkspaceSectionCards(enabled) {
  const emailSettings = dashboardBusinessSettings.emailSettings || {};
  const paymentSettings = dashboardBusinessSettings.paymentSettings || {};
  const activeKeys = dashboardApiKeys.filter((key) => key.status !== "revoked");
  const smtpConfigured = Boolean(emailSettings.smtpHost && emailSettings.smtpUser && emailSettings.fromEmail);
  const smtpFailed = ["failed", "error"].includes(String(emailSettings.lastDeliveryStatus || emailSettings.lastTestStatus || "").toLowerCase());
  const gatewayStatus = paymentSettings.status || "not_configured";
  const complianceReady = Boolean(dashboardBusinessCompliance?.readiness?.compliance);
  const values = {
    "workspace-email-settings": smtpFailed
      ? { status: "Needs attention", tone: "danger" }
      : smtpConfigured
        ? { status: "Configured", tone: "ready" }
        : { status: "Optional setup", tone: "attention" },
    "workspace-gateway-settings": gatewayStatus === "live_ready"
      ? { status: "Live ready", tone: "ready" }
      : gatewayStatus === "test_mode"
        ? { status: "Test mode", tone: "attention" }
        : { status: "Optional setup", tone: "neutral" },
    "workspace-compliance-profile": complianceReady
      ? { status: "Ready", tone: "ready" }
      : { status: "Review needed", tone: "attention" },
    "workspace-team-access": dashboardTeamMembers.length
      ? { status: `${dashboardTeamMembers.length} sub-user${dashboardTeamMembers.length === 1 ? "" : "s"}`, tone: "ready" }
      : { status: "Optional setup", tone: "neutral" },
    "workspace-api-access": activeKeys.length
      ? { status: `${activeKeys.length} active key${activeKeys.length === 1 ? "" : "s"}`, tone: "ready" }
      : { status: "Optional setup", tone: "neutral" },
    "workspace-approval-queue": dashboardApprovalRequests.length
      ? { status: `${dashboardApprovalRequests.length} request${dashboardApprovalRequests.length === 1 ? "" : "s"}`, tone: "ready" }
      : { status: "Use when needed", tone: "neutral" },
    "workspace-notification-center": dashboardBusinessNotifications.some((notification) => notification.severity === "red")
      ? { status: "Critical alert", tone: "danger" }
      : dashboardBusinessNotifications.some((notification) => notification.severity === "amber")
        ? { status: `${dashboardBusinessNotifications.length} alert${dashboardBusinessNotifications.length === 1 ? "" : "s"}`, tone: "attention" }
        : dashboardBusinessNotifications.length
          ? { status: `${dashboardBusinessNotifications.length} healthy note${dashboardBusinessNotifications.length === 1 ? "" : "s"}`, tone: "ready" }
          : { status: "No alerts", tone: "neutral" },
    "workspace-audit-trail": dashboardBusinessAuditEvents.length
      ? { status: `${dashboardBusinessAuditEvents.length} event${dashboardBusinessAuditEvents.length === 1 ? "" : "s"}`, tone: "ready" }
      : { status: "No events yet", tone: "neutral" },
  };
  return WORKSPACE_SECTION_META.map((item) => {
    const allowed = enabled && workspaceCan(item.permission);
    const current = values[item.id] || { status: "Optional", tone: "neutral" };
    return {
      ...item,
      allowed,
      status: allowed ? current.status : "View only",
      tone: allowed ? current.tone : "locked",
    };
  });
}

function renderBusinessWorkspaceSectionControls(enabled) {
  const cards = businessWorkspaceSectionCards(enabled);
  if (workspaceSectionSelect) {
    [...workspaceSectionSelect.options].forEach((option) => {
      const card = cards.find((item) => item.id === option.value);
      if (card) {
        option.textContent = `${card.title} - ${card.status}`;
        option.dataset.tone = card.tone;
      }
    });
  }
  workspaceTargetLinks.forEach((link) => {
    const targetId = link.getAttribute("data-workspace-target");
    const card = cards.find((item) => item.id === targetId);
    if (!card) return;
    link.dataset.tone = card.tone;
    link.setAttribute("aria-label", `${card.title}: ${card.status}`);
    if (link.classList.contains("workspace-section-shortcut")) {
      link.innerHTML = `
        <strong>${escapeHtml(card.title)}</strong>
        <span>${escapeHtml(card.description)}</span>
        <small>${escapeHtml(card.status)}</small>
      `;
    } else if (link.classList.contains("nav-subitem")) {
      link.title = `${card.title}: ${card.status}`;
      link.innerHTML = `
        <span>${escapeHtml(card.title)}</span>
        <small>${escapeHtml(card.status)}</small>
      `;
    }
  });
  document.querySelectorAll(".workspace-group").forEach((group) => {
    const card = cards.find((item) => item.id === group.id);
    if (!card) return;
    group.dataset.tone = card.tone;
    group.dataset.allowed = card.allowed ? "true" : "false";
    const summary = group.querySelector(".workspace-group-summary");
    if (!summary) return;
    let roleBadge = summary.querySelector("[data-workspace-role-badge]");
    if (!roleBadge) {
      roleBadge = document.createElement("span");
      roleBadge.setAttribute("data-workspace-role-badge", "");
      summary.append(roleBadge);
    }
    roleBadge.className = `pill ${card.allowed ? "blue" : "gold"}`;
    roleBadge.textContent = card.allowed ? "Editable" : "View only";
  });
  if (workspaceSectionHint) {
    const activeId = workspaceSectionSelect?.value || cards[0]?.id || "";
    const active = cards.find((item) => item.id === activeId) || cards[0];
    workspaceSectionHint.textContent = active
      ? `${active.title}: ${active.description} Status: ${active.status}.`
      : "Choose one Business Workspace area at a time.";
  }
}

function renderWorkspacePermissionPanel(enabled) {
  if (!businessWorkspacePermissionPanel) return;
  const workspace = activeBusinessWorkspace();
  const role = workspace?.role || "owner";
  if (!enabled) {
    businessWorkspacePermissionPanel.innerHTML = `
      <div class="workspace-permission-copy">
        <strong>Business Workspace is locked</strong>
        <span>Upgrade to Business or use the admin preview to test team roles, API access, approvals, and compliance workflows.</span>
      </div>
    `;
    return;
  }
  const allowedCount = WORKSPACE_PERMISSION_COPY.filter((item) => workspace?.permissions?.[item.key]).length;
  businessWorkspacePermissionPanel.innerHTML = `
    <div class="workspace-permission-copy">
      <strong>${escapeHtml(workspace?.label || "Selected workspace")}</strong>
      <span>${escapeHtml(role)} role - ${allowedCount}/${WORKSPACE_PERMISSION_COPY.length} permissions enabled</span>
    </div>
    <div class="workspace-permission-grid">
      ${WORKSPACE_PERMISSION_COPY.map((item) => {
        const allowed = Boolean(workspace?.permissions?.[item.key]);
        return `
          <div class="workspace-permission-item" data-allowed="${allowed ? "true" : "false"}">
            <strong>${escapeHtml(item.label)}</strong>
            <span>${escapeHtml(allowed ? "Allowed" : "View only / locked")}</span>
            <small>${escapeHtml(item.description)}</small>
          </div>
        `;
      }).join("")}
    </div>
  `;
}

function renderBusinessWorkspaceFlowChecklist(enabled) {
  if (!businessWorkspaceFlowChecklist) return;
  const workspace = activeBusinessWorkspace();
  if (!enabled) {
    businessWorkspaceFlowChecklist.innerHTML = `
      <div class="workspace-flow-step" data-state="locked">
        <strong>Business flow locked</strong>
        <span>Upgrade to Business to invite users, manage approvals, connect APIs, and run compliance workflows.</span>
      </div>
    `;
    return;
  }

  const activeKeys = dashboardApiKeys.filter((key) => key.status !== "revoked");
  const smtpReady = Boolean(
    dashboardBusinessSettings.emailSettings?.smtpHost
    && dashboardBusinessSettings.emailSettings?.smtpUser
    && dashboardBusinessSettings.emailSettings?.fromEmail,
  );
  const gatewayReady = ["test_mode", "live_ready"].includes(dashboardBusinessSettings.paymentSettings?.status);
  const complianceReady = Boolean(dashboardBusinessCompliance?.readiness?.compliance);
  const steps = [
    {
      label: "Workspace selected",
      detail: workspace?.source === "team"
        ? `Using ${workspace.label || "shared workspace"} as ${workspace.role || "team member"}`
        : "Owner workspace is active",
      state: "done",
    },
    {
      label: "Team invite",
      detail: workspaceCan("manageTeam")
        ? dashboardTeamMembers.length
          ? `${dashboardTeamMembers.length} member${dashboardTeamMembers.length === 1 ? "" : "s"} invited`
          : "Invite an accountant, admin, or viewer"
        : "This role can view team records only",
      state: dashboardTeamMembers.length ? "done" : workspaceCan("manageTeam") ? "open" : "locked",
    },
    {
      label: "Approvals",
      detail: workspaceCan("approvals")
        ? dashboardApprovalRequests.length
          ? `${dashboardApprovalRequests.length} approval request${dashboardApprovalRequests.length === 1 ? "" : "s"} tracked`
          : "Create an approval request when a record needs review"
        : "Approval actions are locked for this role",
      state: dashboardApprovalRequests.length ? "done" : workspaceCan("approvals") ? "open" : "locked",
    },
    {
      label: "API access",
      detail: workspaceCan("apiAccess")
        ? activeKeys.length
          ? `${activeKeys.length} active integration key${activeKeys.length === 1 ? "" : "s"}`
          : "Generate a key for WordPress or external tools"
        : "API keys are owner/admin only",
      state: activeKeys.length ? "done" : workspaceCan("apiAccess") ? "open" : "locked",
    },
    {
      label: "Business settings",
      detail: `SMTP ${smtpReady ? "ready" : "pending"}, gateway ${gatewayReady ? "ready" : "pending"}, compliance ${complianceReady ? "ready" : "pending"}`,
      state: smtpReady && gatewayReady && complianceReady ? "done" : workspaceCan("manageSettings") || workspaceCan("compliance") ? "open" : "locked",
    },
  ];

  businessWorkspaceFlowChecklist.innerHTML = steps.map((step) => `
    <div class="workspace-flow-step" data-state="${escapeHtml(step.state)}">
      <strong>${escapeHtml(step.label)}</strong>
      <span>${escapeHtml(step.detail)}</span>
    </div>
  `).join("");
}

function latestByDate(records = [], field = "updatedAt") {
  return [...records].sort((a, b) => String(b?.[field] || "").localeCompare(String(a?.[field] || "")))[0] || null;
}

function renderBusinessWorkspaceStatusBoard(enabled) {
  if (!businessWorkspaceStatusBoard) return;
  const emailSettings = dashboardBusinessSettings.emailSettings || {};
  const paymentSettings = dashboardBusinessSettings.paymentSettings || {};
  const latestInvite = latestByDate(dashboardTeamMembers, "updatedAt");
  const latestApproval = latestByDate(dashboardApprovalRequests, "updatedAt");
  const activeKeys = dashboardApiKeys.filter((key) => key.status !== "revoked");
  const reminderCounts = dashboardBusinessCompliance?.complianceEngine?.reminders?.counts || {};
  const smtpConfigured = Boolean(emailSettings.smtpHost && emailSettings.smtpUser && emailSettings.fromEmail);
  const smtpTestStatus = emailSettings.lastTestStatus || (smtpConfigured ? "ready" : "not_configured");
  const gatewayStatus = paymentSettings.status || "not_configured";
  const cards = [
    {
      label: "Email and SMTP",
      value: smtpConfigured ? "Configured" : "Not configured",
      detail: smtpConfigured
        ? `Validation: ${smtpTestStatus}`
        : "Needed for invite, approval, and reminder emails.",
      tone: smtpConfigured ? "ready" : "attention",
    },
    {
      label: "Sub-user Access",
      value: dashboardTeamMembers.length ? `${dashboardTeamMembers.length} saved` : "No sub-users",
      detail: latestInvite?.inviteDeliveryMessage || "Sub-users get access by logging in with their verified email.",
      tone: latestInvite?.inviteDeliveryStatus === "failed" ? "danger" : latestInvite ? "ready" : "neutral",
    },
    {
      label: "Approvals",
      value: dashboardApprovalRequests.length ? `${dashboardApprovalRequests.length} tracked` : "No requests",
      detail: latestApproval?.notificationMessage || "Approval email status appears after create, approve, or reject.",
      tone: latestApproval?.notificationStatus === "failed" ? "danger" : latestApproval ? "ready" : "neutral",
    },
    {
      label: "Compliance Reminders",
      value: `${reminderCounts.upcoming || 0} upcoming`,
      detail: `${reminderCounts.overdue || 0} overdue, ${reminderCounts.dueThisMonth || 0} due this month.`,
      tone: reminderCounts.overdue ? "danger" : reminderCounts.upcoming ? "attention" : "neutral",
    },
    {
      label: "Gateway",
      value: gatewayStatus === "live_ready" ? "Live ready" : gatewayStatus === "test_mode" ? "Test mode" : "Not configured",
      detail: paymentSettings.paymentLinkEnabled ? "Invoice payment links enabled." : "Payment links are off.",
      tone: gatewayStatus === "live_ready" ? "ready" : gatewayStatus === "test_mode" ? "attention" : "neutral",
    },
    {
      label: "API Access",
      value: activeKeys.length ? `${activeKeys.length} active key${activeKeys.length === 1 ? "" : "s"}` : "No active keys",
      detail: workspaceCan("apiAccess") ? "Owner/admin can generate or revoke keys." : "This role can view API status only.",
      tone: activeKeys.length ? "ready" : workspaceCan("apiAccess") ? "attention" : "neutral",
    },
  ];
  businessWorkspaceStatusBoard.innerHTML = cards.map((card) => `
    <article class="workspace-status-card" data-tone="${enabled ? escapeHtml(card.tone) : "locked"}">
      <span>${escapeHtml(card.label)}</span>
      <strong>${escapeHtml(enabled ? card.value : "Business required")}</strong>
      <small>${escapeHtml(enabled ? card.detail : "Upgrade to Business to use this workspace tool.")}</small>
    </article>
  `).join("");
}

const AUDIT_ACTION_LABELS = {
  "team.sub_user_created": "Sub-user Created",
  "team.member_updated": "Sub-user Updated",
  "approval.request_created": "Approval Requested",
  "approval.request_decided": "Approval Decided",
  "smtp.validate": "SMTP Validated",
  "smtp.test_email": "SMTP Test Email",
  "smtp.sub_user_access_email": "Sub-user Access Email",
  "smtp.approval_notification": "Approval Notification Email",
  "smtp.scheduled_compliance_reminder": "Scheduled Compliance Reminder",
  "smtp.scheduled_approval_aging": "Scheduled Approval Reminder",
  "smtp.scheduled_team_access_notice": "Scheduled Team Access Notice",
  "smtp.scheduled_gateway_attention": "Scheduled Gateway Attention Notice",
  "smtp.scheduled_business_digest": "Scheduled Business Digest",
  "smtp.compliance_reminder": "Compliance Reminder Email",
  "api_key.created": "API Key Created",
  "api_key.revoked": "API Key Revoked",
  "payment.invoice_recorded": "Invoice Payment Recorded",
  "payment.purchase_order_recorded": "PO/WO Payment Recorded",
  "gateway.invoice_payment_link_created": "Invoice Payment Link Created",
  "gateway.invoice_payment_captured": "Gateway Payment Captured",
  "gateway.subscription_activated": "Subscription Activated",
  "settings.email_saved": "Email Settings Saved",
  "settings.gateway_saved": "Gateway Settings Saved",
  "compliance.task_updated": "Compliance Task Updated",
};

function auditActionLabel(action = "") {
  const key = String(action || "").toLowerCase();
  return AUDIT_ACTION_LABELS[key] || key.split(/[._:-]+/).filter(Boolean).map((part) => (
    part.charAt(0).toUpperCase() + part.slice(1)
  )).join(" ") || "Workspace Event";
}

function auditOutcomeTone(outcome = "") {
  const normalized = String(outcome || "").toLowerCase();
  if (["failed", "blocked"].includes(normalized)) return "gold";
  if (normalized === "not_configured") return "gold";
  if (["success", "sent"].includes(normalized)) return "blue";
  return "gold";
}

function auditFilterOptions() {
  if (!businessAuditFilterForm) return {};
  const formData = new FormData(businessAuditFilterForm);
  return {
    category: formData.get("category") || "",
    outcome: formData.get("outcome") || "",
    actor: formData.get("actor") || "",
    dateFrom: formData.get("dateFrom") || "",
    dateTo: formData.get("dateTo") || "",
  };
}

function auditFilterSummary() {
  const options = auditFilterOptions();
  const labels = [
    options.category ? `category ${options.category}` : "",
    options.outcome ? `outcome ${options.outcome}` : "",
    options.actor ? `user ${options.actor}` : "",
    options.dateFrom ? `from ${options.dateFrom}` : "",
    options.dateTo ? `to ${options.dateTo}` : "",
  ].filter(Boolean);
  return labels.length ? `Filtered by ${labels.join(", ")}.` : "Showing latest workspace events.";
}

function deliveryFilterOptions() {
  if (!businessDeliveryFilterForm) return {};
  const formData = new FormData(businessDeliveryFilterForm);
  return {
    category: "smtp",
    outcome: formData.get("outcome") || "",
    action: String(formData.get("action") || "").trim(),
    dateFrom: formData.get("dateFrom") || "",
    dateTo: formData.get("dateTo") || "",
  };
}

function deliveryFilterSummary() {
  const options = deliveryFilterOptions();
  const labels = [
    options.outcome ? `outcome ${options.outcome}` : "",
    options.action ? `type ${options.action}` : "",
    options.dateFrom ? `from ${options.dateFrom}` : "",
    options.dateTo ? `to ${options.dateTo}` : "",
  ].filter(Boolean);
  return labels.length ? `Filtered by ${labels.join(", ")}.` : "Showing latest SMTP delivery attempts.";
}

function deliveryActionMatches(event, filter = "") {
  if (!filter) return true;
  const needle = String(filter || "").toLowerCase();
  const action = String(event.action || "").toLowerCase();
  const targetType = String(event.targetType || "").toLowerCase();
  const targetLabel = String(event.targetLabel || "").toLowerCase();
  return action.includes(needle) || targetType.includes(needle) || targetLabel.includes(needle);
}

function filteredDeliveryEvents() {
  const options = deliveryFilterOptions();
  return dashboardBusinessDeliveryEvents.filter((event) => deliveryActionMatches(event, options.action));
}

function renderBusinessDeliveryHistory(enabled) {
  if (!businessDeliverySummary && !businessDeliveryHistory) return;
  const events = filteredDeliveryEvents();
  const sent = events.filter((event) => String(event.outcome || "").toLowerCase() === "sent").length;
  const failed = events.filter((event) => String(event.outcome || "").toLowerCase() === "failed").length;
  const notConfigured = events.filter((event) => String(event.outcome || "").toLowerCase() === "not_configured").length;
  const blocked = events.filter((event) => String(event.outcome || "").toLowerCase() === "blocked").length;
  if (businessDeliverySummary) {
    businessDeliverySummary.innerHTML = enabled
      ? `
        <article class="metric-card"><span>Sent</span><strong>${sent}</strong></article>
        <article class="metric-card"><span>Failed</span><strong>${failed}</strong></article>
        <article class="metric-card"><span>Not configured</span><strong>${notConfigured}</strong></article>
        <article class="metric-card"><span>Blocked</span><strong>${blocked}</strong></article>
      `
      : `
        <article class="metric-card"><span>Delivery history</span><strong>Business required</strong></article>
      `;
  }
  if (businessDeliveryFilterStatus) {
    businessDeliveryFilterStatus.textContent = `${deliveryFilterSummary()} ${events.length} delivery event${events.length === 1 ? "" : "s"} shown.`;
  }
  if (businessDeliveryHistory) {
    businessDeliveryHistory.innerHTML = events.length
      ? events.map((event) => {
        const outcome = String(event.outcome || "info").toLowerCase();
        const tone = outcome === "sent" ? "blue" : outcome === "failed" ? "red" : "gold";
        const recipient = event.metadata?.recipient || event.targetLabel || "";
        return `
          <div class="invoice-card delivery-event-card">
            <div>
              <strong>${escapeHtml(auditActionLabel(event.action))}</strong>
              <div class="hint">${escapeHtml(event.message || "Delivery attempt recorded.")}</div>
              <div class="hint">${escapeHtml(recipient ? `Recipient: ${recipient}` : "Recipient not recorded")} - ${escapeHtml(formatAiDate(event.createdAt))}</div>
            </div>
            <span class="pill ${tone}">${escapeHtml(event.outcome || "info")}</span>
          </div>
        `;
      }).join("")
      : `<p>${enabled ? "No SMTP delivery attempts match the current filters." : "Delivery history unlocks in Business."}</p>`;
  }
}

async function refreshBusinessAuditEvents() {
  if (!canOpenBusinessWorkspace()) {
    dashboardBusinessAuditEvents = [];
    return;
  }
  dashboardBusinessAuditEvents = await apiClient.listBusinessAuditEvents(token, {
    ...selectedWorkspaceOptions(),
    ...auditFilterOptions(),
    limit: 75,
  }).catch(() => dashboardBusinessAuditEvents);
}

async function refreshBusinessDeliveryEvents() {
  if (!canOpenBusinessWorkspace()) {
    dashboardBusinessDeliveryEvents = [];
    return;
  }
  const { action, ...queryOptions } = deliveryFilterOptions();
  dashboardBusinessDeliveryEvents = await apiClient.listBusinessAuditEvents(token, {
    ...selectedWorkspaceOptions(),
    ...queryOptions,
    limit: 50,
  }).catch(() => dashboardBusinessDeliveryEvents);
}

async function refreshBusinessNotifications() {
  if (!canOpenBusinessWorkspace()) {
    dashboardBusinessNotifications = [];
    return;
  }
  dashboardBusinessNotifications = await apiClient.listBusinessNotifications(token, selectedWorkspaceOptions())
    .catch(() => dashboardBusinessNotifications);
}

async function refreshBusinessAuditEventsAndRender() {
  await Promise.all([
    refreshBusinessAuditEvents(),
    refreshBusinessDeliveryEvents(),
    refreshBusinessNotifications(),
  ]);
  renderBusinessWorkspace();
}

async function refreshBusinessDeliveryEventsAndRender() {
  await refreshBusinessDeliveryEvents();
  renderBusinessWorkspace();
}

function isUnlimitedLimit(value) {
  return Number(value) >= 999999;
}

function planLimitLine(key, summary) {
  const detail = summary?.usageDetails?.[key];
  const limit = Number(detail?.limit ?? summary?.limits?.[key] ?? 0);
  const used = Number(detail?.used ?? summary?.usage?.[key] ?? 0);
  const label = detail?.label || LIMIT_LABELS[key] || key;
  if (detail?.unlimited || isUnlimitedLimit(limit)) return { label, value: "Unlimited", tone: "blue" };
  const remaining = Number(detail?.remaining ?? Math.max(0, limit - used));
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

function aiQuotaExceeded() {
  if (!canUseAiAssistant()) return false;
  const detail = activePlanSummary?.usageDetails?.aiCommandsPerMonth;
  if (detail?.unlimited || isUnlimitedLimit(detail?.limit ?? activePlanSummary?.limits?.aiCommandsPerMonth)) return false;
  const limit = Number(detail?.limit ?? activePlanSummary?.limits?.aiCommandsPerMonth ?? 0);
  const used = Number(detail?.used ?? activePlanSummary?.usage?.aiCommandsPerMonth ?? 0);
  return limit > 0 && used >= limit;
}

function setAiAssistantStatus(message, tone = "") {
  if (!aiAssistantStatus) return;
  aiAssistantStatus.hidden = !message;
  aiAssistantStatus.textContent = message || "";
  aiAssistantStatus.dataset.tone = tone;
}

function aiIncludedFeatureText(summary = activePlanSummary) {
  const features = [];
  if (summary?.features?.aiInvoiceAssist) features.push("Invoices");
  if (summary?.features?.aiPoAssist) features.push("PO / WO");
  if (summary?.features?.advancedReports) features.push("Reports");
  return features.length ? features.join(", ") : "Locked";
}

function applyAiQuotaResult(quota) {
  if (!quota) return;
  const usage = {
    ...(activePlanSummary.usage || {}),
    aiCommandsPerMonth: Number(quota.used || 0),
  };
  const limits = {
    ...(activePlanSummary.limits || {}),
    aiCommandsPerMonth: Number(quota.limit || 0),
  };
  activePlanSummary = {
    ...activePlanSummary,
    plan: quota.plan || activePlanSummary.plan,
    label: quota.label || activePlanSummary.label,
    usage,
    limits,
    usageDetails: {
      ...(activePlanSummary.usageDetails || {}),
      aiCommandsPerMonth: {
        label: LIMIT_LABELS.aiCommandsPerMonth,
        used: Number(quota.used || 0),
        limit: Number(quota.limit || 0),
        remaining: quota.remaining,
        unlimited: Boolean(quota.unlimited),
        exceeded: Boolean(quota.exceeded),
      },
    },
  };
}

function renderAiQuotaPanel() {
  if (!aiQuotaPanel) return;
  const allowed = canUseAiAssistant();
  const aiLimit = planLimitLine("aiCommandsPerMonth", activePlanSummary);
  aiQuotaPanel.dataset.state = allowed ? aiLimit.tone : "locked";
  if (aiQuotaPlan) aiQuotaPlan.textContent = activePlanSummary?.label || "Free";
  if (aiQuotaRemaining) {
    aiQuotaRemaining.textContent = allowed
      ? aiLimit.value
      : "Upgrade to Pro";
  }
  if (aiQuotaFeatures) {
    aiQuotaFeatures.textContent = aiIncludedFeatureText(activePlanSummary);
  }
}

function aiUsageLimitText(quota = {}) {
  if (quota.unlimited) return "Unlimited";
  const limit = Number(quota.limit || 0);
  return limit > 0 ? String(limit) : "Not included";
}

function aiUsageRemainingText(quota = {}) {
  if (quota.unlimited) return "Unlimited";
  if (Number(quota.limit || 0) <= 0) return "Upgrade to Pro";
  return String(Math.max(0, Number(quota.remaining || 0)));
}

function formatAiDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
  return date.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function renderAiUsageSummary(payload) {
  if (!payload) return;
  const quota = payload.quota || {};
  if (aiUsagePeriodBadge) aiUsagePeriodBadge.textContent = payload.period || "Current month";
  if (aiUsageResetNote) {
    aiUsageResetNote.textContent = `AI usage resets monthly. Next reset: ${payload.reset?.nextResetAt || "next month"}.`;
  }
  if (aiUsageStats) {
    aiUsageStats.innerHTML = `
      <div><span>Used</span><strong>${Number(quota.used || 0)}</strong></div>
      <div><span>Remaining</span><strong>${escapeHtml(aiUsageRemainingText(quota))}</strong></div>
      <div><span>Included</span><strong>${escapeHtml(aiUsageLimitText(quota))}</strong></div>
      <div><span>Plan</span><strong>${escapeHtml(quota.label || "Free")}</strong></div>
    `;
  }
  if (!aiUsageHistoryList) return;
  const history = Array.isArray(payload.history) ? payload.history : [];
  aiUsageHistoryList.innerHTML = history.length
    ? history.map((entry) => `
      <article class="record-card compact">
        <div>
          <strong>${escapeHtml(entry.commandPreview || "AI command")}</strong>
          <div class="hint">${escapeHtml(entry.intent || "unknown")} - ${escapeHtml(entry.status || "recorded")} - ${formatAiDate(entry.createdAt)}</div>
        </div>
        <span class="pill ${entry.billable === false ? "gold" : "blue"}">${entry.billable === false ? "Not counted" : "Counted"}</span>
      </article>
    `).join("")
    : "<p class=\"hint\">No AI commands recorded for this month yet.</p>";
}

function renderAdminAiUsageSummary(payload) {
  if (!adminAiUsagePanel || !adminAiUsageList) return;
  const authorized = Boolean(sessionContext?.session?.admin?.authorized);
  adminAiUsagePanel.hidden = !authorized;
  if (!authorized) return;
  const users = Array.isArray(payload?.users) ? payload.users : [];
  adminAiUsageList.innerHTML = users.length
    ? users.map((entry) => `
      <article class="record-card compact">
        <div>
          <strong>${escapeHtml(entry.name || "Unknown user")}</strong>
          <div class="hint">${escapeHtml(entry.email || "No email")} - latest ${formatAiDate(entry.latestAt)}</div>
        </div>
        <span class="pill blue">${Number(entry.summary?.billable || 0)} counted</span>
      </article>
    `).join("")
    : "<p class=\"hint\">No user AI usage for this month.</p>";
}

async function loadAiUsage() {
  try {
    const usage = await apiClient.getAiUsage(token);
    applyAiQuotaResult(usage.quota);
    renderAiQuotaPanel();
    renderAiUsageSummary(usage);
    if (sessionContext?.session?.admin?.authorized) {
      const adminUsage = await apiClient.getAdminAiUsage(token).catch(() => null);
      renderAdminAiUsageSummary(adminUsage);
    }
  } catch (error) {
    if (aiUsageHistoryList) {
      aiUsageHistoryList.innerHTML = `<p class="inline-status" data-tone="error">${escapeHtml(error.message || "Could not load AI usage.")}</p>`;
    }
  }
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

function riskToneClass(severity) {
  const normalized = String(severity || "").toLowerCase();
  if (normalized === "danger") return "red";
  if (normalized === "attention") return "gold";
  return "blue";
}

function renderAdminOperations(payload) {
  if (!adminOperationsSummary || !adminOperationsRisks || !adminOperationsTechnical) return;
  const summary = payload?.summary || {};
  const subscriptions = summary.subscriptions || {};
  const business = summary.business || {};
  const gateway = payload?.gateway || {};
  const postgres = payload?.persistence?.postgres || {};
  adminOperationsSummary.innerHTML = [
    ["Users", Number(summary.users?.total || 0), `${Number(summary.users?.restricted || 0)} restricted`],
    ["Subscriptions", Number(subscriptions.total || 0), `${Number(subscriptions.paid || 0)} paid`],
    ["KYC Profiles", Number(summary.kyc?.total || 0), `${Number(summary.kyc?.byStatus?.pending || 0)} pending`],
    ["Business Workspaces", Number(business.owners || 0), `${Number(business.smtpReady || 0)} SMTP ready`],
    ["Billing Orders", Number(summary.billing?.orders || 0), `${Number(summary.billing?.captured || 0)} captured`],
  ].map(([label, value, detail]) => `
    <article class="admin-card">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
      <p class="hint">${escapeHtml(detail)}</p>
    </article>
  `).join("");
  const risks = Array.isArray(payload?.risks) ? payload.risks : [];
  adminOperationsRisks.innerHTML = risks.length
    ? risks.map((risk) => `
      <article class="record-card compact">
        <div>
          <strong>${escapeHtml(risk.area || "Operations")}</strong>
          <div class="hint">${escapeHtml(risk.message || "")}</div>
          <div class="hint">${escapeHtml(risk.action || "")}</div>
        </div>
        <span class="pill ${riskToneClass(risk.severity)}">${escapeHtml(risk.severity || "status")}</span>
      </article>
    `).join("")
    : "<p class=\"hint\">No operational checks returned.</p>";
  adminOperationsTechnical.innerHTML = [
    {
      title: "Postgres",
      value: postgres.reachable ? "Reachable" : "Needs attention",
      detail: postgres.database || postgres.error || "No database details available",
      tone: postgres.reachable ? "ready" : "attention",
    },
    {
      title: "Platform Razorpay",
      value: gateway.configured ? "Configured" : "Incomplete",
      detail: gateway.mode ? `${gateway.mode} mode` : "Gateway keys or webhook secret missing",
      tone: gateway.configured ? "ready" : "attention",
    },
    {
      title: "Business SMTP",
      value: `${Number(business.smtpReady || 0)}/${Number(business.owners || 0)} ready`,
      detail: "Workspace-level outgoing email readiness",
      tone: business.owners && business.smtpReady < business.owners ? "attention" : "ready",
    },
  ].map((item) => `
    <article class="quick-card workspace-status-card" data-tone="${escapeHtml(item.tone)}">
      <span>${escapeHtml(item.title)}</span>
      <strong>${escapeHtml(item.value)}</strong>
      <small>${escapeHtml(item.detail)}</small>
    </article>
  `).join("");
  setInlineStatus(adminOperationsStatus, `Updated ${formatAiDate(payload?.generatedAt || new Date().toISOString())}.`, "success");
}

async function loadAdminOperations() {
  if (!sessionContext?.session?.admin?.authorized || !adminOperationsSummary) return;
  setInlineStatus(adminOperationsStatus, "Loading operational health...", "");
  try {
    const payload = await apiClient.getAdminOperations(token);
    renderAdminOperations(payload);
  } catch (error) {
    setInlineStatus(adminOperationsStatus, error.message || "Could not load operations dashboard.", "error");
  }
}

function renderAiAssistantAccess() {
  if (!aiAssistantPanel) return;
  const allowed = canUseAiAssistant();
  const quotaBlocked = aiQuotaExceeded();
  const roleBlocked = allowed && !workspaceCanWriteRecords();
  const disableAiControls = !allowed || quotaBlocked || roleBlocked;
  renderAiQuotaPanel();
  if (aiAssistantPlanBadge) {
    aiAssistantPlanBadge.textContent = allowed
      ? `${activePlanSummary.label || "Pro"} AI enabled`
      : "Upgrade to Pro";
    aiAssistantPlanBadge.className = `pill ${allowed ? "blue" : "gold"}`;
  }
  if (aiCommandRun) aiCommandRun.disabled = disableAiControls;
  if (aiCommandInput) aiCommandInput.disabled = disableAiControls;
  [aiInvoiceExample, aiPoExample, aiReportExample].forEach((button) => {
    if (button) button.disabled = disableAiControls;
  });
  if (aiVoiceButton) {
    aiVoiceButton.disabled = disableAiControls || !("webkitSpeechRecognition" in window || "SpeechRecognition" in window);
    aiVoiceButton.title = aiVoiceButton.disabled && allowed
      ? "Voice input is not available in this browser. Typed commands still work."
      : "Speak an invoice, PO, or report command";
  }
  if (!allowed) {
    const adminPreviewHint = sessionContext?.session?.admin?.authorized
      ? " Admin plan preview can be used to test this locally."
      : "";
    setAiAssistantStatus(`AI command drafting, PO/WO drafting, and AI report summaries are available on Pro and Business plans.${adminPreviewHint}`, "error");
  } else {
    const aiLimit = planLimitLine("aiCommandsPerMonth", activePlanSummary);
    setAiAssistantStatus(
      roleBlocked
        ? workspaceWriteLockMessage("run AI commands that create drafts or update records")
        : quotaBlocked
        ? `Monthly AI command limit reached for ${activePlanSummary.label || "this"} plan. Upgrade or wait for the next monthly reset.`
        : `AI Assistant is live on this plan. ${aiLimit.label}: ${aiLimit.value}.`,
      roleBlocked || aiLimit.tone === "red" ? "error" : "success"
    );
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
    applyAiQuotaResult(result.quota);
    pendingAiDraftCommand = null;
    pendingAiDraftResult = null;
    rerenderDashboardData();
    renderAiAssistantAccess();
    await loadAiUsage();
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
  if (adminOperationsSideLink) adminOperationsSideLink.hidden = false;
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
    const monthlyAmount = Number(plan.monthlyAmount ?? plan.amount ?? 0);
    const annualAmount = Number(plan.annualAmount ?? (monthlyAmount * 12));
    const priceLabel = planId === "free" ? "INR 0" : `INR ${money(monthlyAmount)}/mo`;
    const billingHint = planId === "free" ? "No yearly billing" : `Billed yearly: INR ${money(annualAmount)}`;
    const aiLimit = Number(plan.limits?.aiCommandsPerMonth || 0);
    const aiHint = isUnlimitedLimit(aiLimit)
      ? "AI commands: Unlimited"
      : aiLimit > 0
        ? `AI commands: ${aiLimit}/month`
        : "AI commands: Not included";
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
      <div class="notice compact">${escapeHtml(aiHint)}. AI usage resets monthly; paid plans are collected yearly.</div>
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
    gst: { title: "GST Compliance Report", badge: "GST", description: "Output GST, input GST and estimated net GST payable." },
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

function purchaseOrderPaidAmount(po) {
  return Math.max(0, Number(po?.paidAmount || 0));
}

function purchaseOrderPayableAmount(po) {
  const total = Math.max(0, Number(po?.total || 0));
  const paid = purchaseOrderPaidAmount(po);
  if (Number.isFinite(Number(po?.balanceAmount))) {
    return Math.max(0, Number(po.balanceAmount || 0));
  }
  return Math.max(0, total - paid);
}

function purchaseOrderPaymentStatus(po) {
  const explicit = String(po?.paymentStatus || "").toLowerCase().replace(/\s+/g, "_");
  if (explicit && explicit !== "created") return explicit;
  const payable = purchaseOrderPayableAmount(po);
  const paid = purchaseOrderPaidAmount(po);
  if (payable <= 0 && paid > 0) return "paid";
  if (paid > 0) return "part_paid";
  return "unpaid";
}

function purchaseOrderPaymentLabel(po) {
  return purchaseOrderPaymentStatus(po).replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function vendorPayableRows(purchaseOrders = []) {
  const groups = new Map();
  purchaseOrders.forEach((po) => {
    const vendor = po.billToName || po.vendorName || po.supplierName || "Vendor";
    const key = vendor.trim().toLowerCase();
    const current = groups.get(key) || {
      vendor,
      records: 0,
      total: 0,
      paid: 0,
      payable: 0,
      tax: 0,
    };
    current.records += 1;
    current.total += Number(po.total || 0);
    current.paid += purchaseOrderPaidAmount(po);
    current.payable += purchaseOrderPayableAmount(po);
    current.tax += Number(po.taxAmount || 0);
    groups.set(key, current);
  });
  return [...groups.values()].sort((first, second) => second.payable - first.payable || second.total - first.total);
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

function complianceStatusLabel(status) {
  return String(status || "pending").replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function complianceStatusTone(status) {
  const normalized = String(status || "pending").toLowerCase();
  if (normalized === "filed" || normalized === "not_applicable") return "blue";
  if (normalized === "overdue" || normalized === "profile_missing") return "red";
  if (normalized === "needs_document") return "gold";
  return "amber";
}

function complianceTaskDate(task) {
  return String(task?.dueDate || task?.updatedAt || task?.createdAt || "").slice(0, 10);
}

function filterComplianceTasks(tasks = []) {
  const status = String(detailComplianceStatus?.value || "").toLowerCase();
  const department = String(detailComplianceType?.value || "").toLowerCase();
  const period = detailReportPeriod?.value || "all";
  const today = new Date();
  const sevenDaysAgo = new Date(today);
  sevenDaysAgo.setDate(today.getDate() - 6);
  const weekStart = sevenDaysAgo.toISOString().slice(0, 10);
  const weekEnd = today.toISOString().slice(0, 10);
  const fyRange = financialYearRange(detailFinancialYear?.value || currentFinancialYearLabel(today));
  return tasks.filter((task) => {
    const taskStatus = String(task.status || "pending").toLowerCase();
    const taskDepartment = String(task.department || "").toLowerCase();
    if (status && taskStatus !== status) return false;
    if (department && taskDepartment !== department) return false;
    if (period === "all") return true;
    const dateValue = complianceTaskDate(task);
    if (!dateValue) return true;
    if (period === "weekly") return inDateRange(dateValue, weekStart, weekEnd);
    if (period === "monthly") {
      const selectedYear = detailReportYear?.value || String(today.getFullYear());
      const selectedMonth = detailReportMonth?.value || String(today.getMonth() + 1).padStart(2, "0");
      return dateValue.startsWith(`${selectedYear}-${selectedMonth}`);
    }
    if (period === "yearly") return dateValue.startsWith(detailReportYear?.value || String(today.getFullYear()));
    if (period === "financial-year" && fyRange) return inDateRange(dateValue, fyRange.start, fyRange.end);
    if (period === "custom") return inDateRange(dateValue, detailStartDate?.value || "", detailEndDate?.value || "");
    return true;
  });
}

function complianceStatusBuckets(tasks = []) {
  const order = ["pending", "filed", "overdue", "needs_document", "profile_missing", "not_applicable"];
  return order.map((status) => ({
    label: complianceStatusLabel(status),
    count: tasks.filter((task) => String(task.status || "pending").toLowerCase() === status).length,
  })).filter((row) => row.count > 0);
}
function syncDetailFilterVisibility() {
  const period = detailReportPeriod?.value || "all";
  const reportType = currentDashboardPage().startsWith("report-")
    ? currentDashboardPage().replace("report-", "")
    : "";
  detailFilterFields.forEach((field) => {
    const filter = field.getAttribute("data-report-filter");
    const visible = filter === "period"
      || (reportType === "compliance" && filter === "compliance")
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
    expensesPaid: 0,
    payables: 0,
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
    bucket.expensesPaid += purchaseOrderPaidAmount(po);
    bucket.payables += purchaseOrderPayableAmount(po);
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
    po: { title: "PO / WO Payables by Month", badge: "Payable", key: "payables", tone: "expense" },
    "profit-loss": { title: "Profit by Month", badge: "Net", key: "profit", tone: "profit" },
    gst: { title: "Net GST by Month", badge: "GST", key: "gst", tone: "profit" },
    paid: { title: "Paid Revenue by Month", badge: "Paid", key: "paid", tone: "profit" },
  };
  const config = chartConfig[type] || chartConfig.revenue;
  if (type === "gst") {
    buckets.forEach((bucket) => {
      const monthInvoices = invoices.filter((invoice) => monthKeyForRecord(invoice, "invoice") === bucket.key);
      const monthPurchaseOrders = purchaseOrders.filter((po) => monthKeyForRecord(po, "po") === bucket.key);
      const output = monthInvoices.reduce((sum, invoice) => sum + Number(invoice.taxAmount || 0), 0);
      const input = monthPurchaseOrders.reduce((sum, po) => sum + Number(po.taxAmount || 0), 0);
      bucket.gst = output - input;
    });
  }
  if (reportDetailChartTitle) reportDetailChartTitle.textContent = config.title;
  if (reportDetailChartBadge) reportDetailChartBadge.textContent = config.badge;
  renderLiveBarChart(reportDetailChart, buckets, config.key, { tone: config.tone, prefix: "INR", format: config.format });
}

function activeReportSummary() {
  return currentDashboardPage().startsWith("report-") && detailReportSummary?.available
    ? detailReportSummary
    : dashboardReportSummary;
}

function accountingMoney(value) {
  return `INR ${money(value)}`;
}

function accountingEntryRow(entry) {
  return `
    <div class="mini-table-row">
      <span>${escapeHtml(entry.transactionDate || "")}</span>
      <strong>${escapeHtml(entry.referenceNumber || entry.sourceType || "Entry")}</strong>
      <small>Dr ${money(entry.debit)} / Cr ${money(entry.credit)}</small>
    </div>
  `;
}

function renderAccountingBook(target, entries = []) {
  if (!target) return;
  target.innerHTML = entries.length
    ? entries.map(accountingEntryRow).join("")
    : "<p class=\"hint\">No entries yet.</p>";
}

function renderAccountingGstSummary(payload = {}) {
  if (accountingGstCards) {
    accountingGstCards.innerHTML = [
      metricCard("Output GST", accountingMoney(payload.outputGst || 0)),
      metricCard("Input GST", accountingMoney(payload.inputGst || 0)),
      metricCard(payload.netGstPayable >= 0 ? "Net GST Payable" : "GST Credit Available", accountingMoney(Math.abs(payload.netGstPayable || 0))),
    ].join("");
  }
  if (accountingGstEntries) {
    const entries = payload.entries || [];
    accountingGstEntries.innerHTML = entries.length
      ? entries.map((entry) => `
        <div class="mini-table-row">
          <span>${escapeHtml(entry.transactionDate || "")}</span>
          <strong>${escapeHtml(entry.accountName || entry.accountCode || "GST")}</strong>
          <small>${escapeHtml(entry.referenceNumber || entry.sourceType || "Entry")} - Dr ${money(entry.debit)} / Cr ${money(entry.credit)}</small>
        </div>
      `).join("")
      : "<p class=\"hint\">GST ledger entries will appear after GST invoices or PO/WO records are created.</p>";
  }
}

function accountingStatementRow(label, value, detail = "") {
  return `
    <div class="mini-table-row">
      <span>${escapeHtml(label)}</span>
      <strong>${accountingMoney(value)}</strong>
      <small>${escapeHtml(detail)}</small>
    </div>
  `;
}

function renderAccountingStatements(payload = {}) {
  const balanceSheet = payload.balanceSheet || payload.statements?.balanceSheet || {};
  const cashFlow = payload.cashFlow || payload.statements?.cashFlow || {};
  if (balanceSheetSummary) {
    balanceSheetSummary.innerHTML = [
      accountingStatementRow("Assets", balanceSheet.assets || 0, "Current ledger asset balance"),
      accountingStatementRow("Liabilities", balanceSheet.liabilities || 0, "Vendor payables and GST payable"),
      accountingStatementRow("Equity", balanceSheet.equity || 0, "Owner capital and equity rows"),
      accountingStatementRow("Retained earnings", balanceSheet.retainedEarnings || 0, "Income minus expenses"),
      accountingStatementRow("Balance check", balanceSheet.difference || 0, "Should remain near zero after full postings"),
    ].join("");
  }
  if (cashFlowSummary) {
    cashFlowSummary.innerHTML = [
      accountingStatementRow("Cash and bank", cashFlow.cashAndBank || 0, "Cash in hand plus bank balance"),
      accountingStatementRow("Operating result", cashFlow.operatingCashFlow || 0, "Profit from created records"),
      accountingStatementRow("Receivables", cashFlow.receivables || 0, "Pending customer collections"),
      accountingStatementRow("Payables", cashFlow.payables || 0, "Pending vendor payments"),
      accountingStatementRow("Net working capital", cashFlow.netWorkingCapital || 0, "Receivables minus payables"),
    ].join("");
  }
}

function syncJournalAccountOptions() {
  const options = accountingAccounts.map((account) => (
    `<option value="${escapeHtml(account.id)}">${escapeHtml(account.accountCode)} - ${escapeHtml(account.accountName)}</option>`
  )).join("");
  if (journalDebitAccount) journalDebitAccount.innerHTML = options;
  if (journalCreditAccount) journalCreditAccount.innerHTML = options;
}

function renderAccountingSummary(payload = {}) {
  const summary = payload.summary || {};
  if (accountingAssets) accountingAssets.textContent = accountingMoney(summary.assets);
  if (accountingLiabilities) accountingLiabilities.textContent = accountingMoney(summary.liabilities);
  if (accountingIncome) accountingIncome.textContent = accountingMoney(summary.income);
  if (accountingExpenses) accountingExpenses.textContent = accountingMoney(summary.expenses);
  if (accountingProfit) accountingProfit.textContent = accountingMoney(summary.profit);
  renderAccountingStatements(payload);

  const accounts = (payload.accounts || []).map((account) => ({
    id: account.id,
    accountCode: account.account_code || account.accountCode || "",
    accountName: account.account_name || account.accountName || "",
    accountType: account.account_type || account.accountType || "",
    normalBalance: account.normal_balance || account.normalBalance || "",
    systemAccount: Boolean(account.system_account || account.systemAccount),
  }));
  accountingAccounts = accounts;
  syncJournalAccountOptions();
  if (chartOfAccountsList) {
    chartOfAccountsList.innerHTML = accounts.length
      ? accounts.map((account) => `
        <div class="mini-table-row" data-ledger-account-id="${escapeHtml(account.id || "")}">
          <span>${escapeHtml(account.accountCode)}</span>
          <strong>${escapeHtml(account.accountName)}</strong>
          <small>${escapeHtml(account.accountType)}${account.systemAccount ? " · system" : ""}</small>
        </div>
      `).join("")
      : "<p class=\"hint\">No ledger accounts available yet.</p>";
  }

  const rows = payload.trialBalance || [];
  if (trialBalanceList) {
    trialBalanceList.innerHTML = rows.length
      ? rows.map((row) => `
        <button class="mini-table-row ledger-row-button" type="button" data-ledger-account-id="${escapeHtml(row.id || "")}">
          <span>${escapeHtml(row.accountCode || "")}</span>
          <strong>${escapeHtml(row.accountName || "")}</strong>
          <small>Dr ${money(row.debit)} / Cr ${money(row.credit)}</small>
        </button>
      `).join("")
      : "<p class=\"hint\">Trial balance will appear after invoices or PO/WO records are created.</p>";
  }

  if (accountingStatus) {
    if (payload.available === false || payload.enabled === false) {
      accountingStatus.textContent = payload.reason || payload.error || "Accounting summary is not available yet.";
      accountingStatus.className = "form-status error";
    } else {
      accountingStatus.textContent = `Synced ${payload.invoicesSynced || 0} invoice(s) and ${payload.purchaseOrdersSynced || 0} PO/WO record(s) into the accounting foundation.`;
      accountingStatus.className = "form-status success";
    }
  }
}

async function refreshAccountingSummary() {
  if (!chartOfAccountsList && !trialBalanceList) return null;
  if (accountingStatus) {
    accountingStatus.textContent = "Refreshing accounting summary...";
    accountingStatus.className = "form-status";
  }
  try {
    const workspaceOptions = selectedWorkspaceOptions();
    const payload = await apiClient.getAccountingSummary(token, workspaceOptions);
    const [journals, bankBook, cashBook, gstSummary] = await Promise.all([
      apiClient.listJournalEntries(token, workspaceOptions).catch(() => ({ journals: [] })),
      apiClient.getAccountingBook(token, { ...workspaceOptions, book: "bank" }).catch(() => ({ entries: [] })),
      apiClient.getAccountingBook(token, { ...workspaceOptions, book: "cash" }).catch(() => ({ entries: [] })),
      apiClient.getGstComplianceSummary(token, workspaceOptions).catch(() => ({ entries: [] })),
    ]);
    renderAccountingSummary(payload);
    if (journalEntriesList) {
      journalEntriesList.innerHTML = (journals.journals || []).length
        ? journals.journals.map((journal) => `
          <div class="mini-table-row">
            <span>${escapeHtml(journal.journalDate || "")}</span>
            <strong>${escapeHtml(journal.journalNumber || "Journal")}</strong>
            <small>${escapeHtml(journal.currency || "INR")} ${money(journal.totalDebit || 0)} · ${escapeHtml(journal.narration || "")}</small>
          </div>
        `).join("")
        : "<p class=\"hint\">No manual journals posted yet.</p>";
    }
    renderAccountingBook(bankBookList, bankBook.entries || []);
    renderAccountingBook(cashBookList, cashBook.entries || []);
    renderAccountingGstSummary(gstSummary);
    return payload;
  } catch (error) {
    renderAccountingSummary({ available: false, error: error.message || "Could not load accounting summary." });
    return null;
  }
}

async function loadLedgerDrilldown(accountId) {
  if (!ledgerDrilldownList || !accountId) return;
  ledgerDrilldownList.innerHTML = "<p class=\"hint\">Loading ledger entries...</p>";
  try {
    const payload = await apiClient.getLedgerAccountEntries(token, accountId, selectedWorkspaceOptions());
    renderAccountingBook(ledgerDrilldownList, payload.entries || []);
  } catch (error) {
    ledgerDrilldownList.innerHTML = `<p class="hint">${escapeHtml(error.message || "Could not load ledger entries.")}</p>`;
  }
}

function reportSourceInvoices() {
  const summary = activeReportSummary();
  return summary?.available && Array.isArray(summary.invoices)
    ? summary.invoices
    : dashboardInvoices;
}

function reportSourcePurchaseOrders() {
  const summary = activeReportSummary();
  return summary?.available && Array.isArray(summary.purchaseOrders)
    ? summary.purchaseOrders
    : dashboardPurchaseOrders;
}

function renderMainReportCharts() {
  if (dashboardReportSummary?.available && Array.isArray(dashboardReportSummary.monthlyTrend)) {
    const buckets = dashboardReportSummary.monthlyTrend.map((row) => ({
      key: row.month,
      label: dateLabelFromKey(row.month),
      revenue: Number(row.income || 0),
      paid: 0,
      receivable: 0,
      expenses: Number(row.expenses || 0),
      expensesPaid: Number(row.expensesPaid || 0),
      payables: Number(row.payables || 0),
      profit: Number(row.profit || 0),
      invoiceCount: 0,
      poCount: 0,
    }));
    renderLiveBarChart(mainRevenueChart, buckets.slice(-6), "revenue", { tone: "revenue" });
    renderLiveBarChart(mainProfitChart, buckets.slice(-6), "profit", { tone: "profit" });
    return;
  }
  const invoices = selectedPeriodInvoices(createdInvoicesOnly(dashboardInvoices));
  const purchaseOrders = selectedPeriodPurchaseOrders(activeCreatedPurchaseOrders());
  const buckets = buildMonthlyBuckets(invoices, purchaseOrders, recentMonthKeys(6));
  renderLiveBarChart(mainRevenueChart, buckets.slice(-6), "revenue", { tone: "revenue" });
  renderLiveBarChart(mainProfitChart, buckets.slice(-6), "profit", { tone: "profit" });
}

function renderReportTable(headers, rows) {
  currentReportExport = {
    title: reportDetailTitle?.textContent || "Detailed Report",
    generatedAt: new Date().toLocaleString("en-IN"),
    period: selectedReportPeriodLabel(),
    headers,
    rows,
  };
  if (reportDetailHead) {
    reportDetailHead.innerHTML = `<tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("")}</tr>`;
  }
  if (reportDetailBody) {
    reportDetailBody.innerHTML = rows.length
      ? rows.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`).join("")
      : `<tr><td colspan="${headers.length}">No records for this report period.</td></tr>`;
  }
}

function selectedReportPeriodLabel() {
  const period = detailReportPeriod?.value || "all";
  if (period === "weekly") return "Current week";
  if (period === "monthly") {
    const month = detailReportMonth?.selectedOptions?.[0]?.textContent || "Selected month";
    const year = detailReportYear?.value || String(new Date().getFullYear());
    return `${month} ${year}`;
  }
  if (period === "yearly") return detailReportYear?.value ? `Year ${detailReportYear.value}` : "Current year";
  if (period === "financial-year") return detailFinancialYear?.value ? `FY ${detailFinancialYear.value}` : "Selected financial year";
  if (period === "custom") return `${detailStartDate?.value || "Start"} to ${detailEndDate?.value || "End"}`;
  return "All time";
}

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function complianceExportData() {
  const engine = dashboardBusinessCompliance?.complianceEngine || {};
  const exportData = engine.export || {};
  return {
    title: "EazInvoice Compliance Report",
    generatedAt: new Date().toLocaleString(),
    fileName: exportData.fileName || "eazinvoice-compliance-report.csv",
    headers: exportData.headers || ["Compliance", "Department", "Status", "Due Date", "Reminder Date", "Responsible", "Required Documents"],
    rows: exportData.rows || [],
  };
}

function downloadComplianceCsv() {
  const exportData = complianceExportData();
  if (!exportData.rows.length) {
    setInlineStatus(businessComplianceStatus, "No compliance records are available to export yet.", "error");
    return;
  }
  const lines = [
    [exportData.title],
    [`Generated: ${exportData.generatedAt}`],
    [],
    exportData.headers,
    ...exportData.rows,
  ].map((row) => row.map(csvCell).join(","));
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = exportData.fileName;
  document.body.appendChild(link);
  link.click();
  URL.revokeObjectURL(link.href);
  link.remove();
  setInlineStatus(businessComplianceStatus, `Compliance CSV prepared: ${exportData.fileName}`, "success");
}

function printComplianceReport() {
  const exportData = complianceExportData();
  if (!exportData.rows.length) {
    setInlineStatus(businessComplianceStatus, "No compliance records are available to print yet.", "error");
    return;
  }
  const printWindow = window.open("", "_blank");
  if (!printWindow) {
    window.print();
    return;
  }
  const tableHead = exportData.headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("");
  const tableRows = exportData.rows.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`).join("");
  printWindow.document.write(`
    <!doctype html>
    <html>
      <head>
        <title>${escapeHtml(exportData.title)}</title>
        <style>
          body { font-family: Arial, sans-serif; color: #111827; padding: 24px; }
          table { width: 100%; border-collapse: collapse; margin-top: 16px; }
          th, td { border: 1px solid #d1d5db; padding: 8px; text-align: left; font-size: 12px; }
          th { background: #eef2ff; }
        </style>
      </head>
      <body>
        <h1>${escapeHtml(exportData.title)}</h1>
        <p>Generated: ${escapeHtml(exportData.generatedAt)}</p>
        <table><thead><tr>${tableHead}</tr></thead><tbody>${tableRows}</tbody></table>
      </body>
    </html>
  `);
  printWindow.document.close();
  printWindow.focus();
  printWindow.print();
  setInlineStatus(businessComplianceStatus, "Compliance print view opened.", "success");
}

function downloadCurrentReportCsv() {
  if (!currentReportExport.headers.length) {
    if (reportExportStatus) reportExportStatus.textContent = "Open a report with records before exporting.";
    return;
  }
  const lines = [
    [currentReportExport.title],
    [`Period: ${currentReportExport.period}`],
    [`Generated: ${currentReportExport.generatedAt}`],
    [],
    currentReportExport.headers,
    ...currentReportExport.rows,
  ].map((row) => row.map(csvCell).join(","));
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const link = document.createElement("a");
  const fileName = `${currentReportExport.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "report"}.csv`;
  link.href = URL.createObjectURL(blob);
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  URL.revokeObjectURL(link.href);
  link.remove();
  if (reportExportStatus) reportExportStatus.textContent = `CSV export prepared: ${fileName}`;
}

function printCurrentReport() {
  if (!currentReportExport.headers.length) {
    if (reportExportStatus) reportExportStatus.textContent = "Open a report with records before printing.";
    return;
  }
  const printWindow = window.open("", "_blank");
  if (!printWindow) {
    window.print();
    return;
  }
  const tableHead = currentReportExport.headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("");
  const tableRows = currentReportExport.rows.length
    ? currentReportExport.rows.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`).join("")
    : `<tr><td colspan="${currentReportExport.headers.length}">No records for this report period.</td></tr>`;
  printWindow.document.write(`
    <!doctype html>
    <html>
      <head>
        <title>${escapeHtml(currentReportExport.title)}</title>
        <style>
          body { font-family: Arial, sans-serif; color: #101828; margin: 32px; }
          h1 { margin: 0 0 8px; font-size: 24px; }
          p { margin: 4px 0; color: #475467; }
          table { width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 12px; }
          th, td { border: 1px solid #d0d5dd; padding: 8px; text-align: left; vertical-align: top; }
          th { background: #eef4ff; color: #123b8f; }
        </style>
      </head>
      <body>
        <h1>${escapeHtml(currentReportExport.title)}</h1>
        <p>Period: ${escapeHtml(currentReportExport.period)}</p>
        <p>Generated: ${escapeHtml(currentReportExport.generatedAt)}</p>
        <table><thead><tr>${tableHead}</tr></thead><tbody>${tableRows}</tbody></table>
      </body>
    </html>
  `);
  printWindow.document.close();
  printWindow.focus();
  printWindow.print();
  if (reportExportStatus) reportExportStatus.textContent = "Print/PDF view opened.";
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

  const invoices = filterRecordsByDetailPeriod(createdInvoicesOnly(reportSourceInvoices()), "invoice");
  const purchaseOrders = filterRecordsByDetailPeriod(reportSourcePurchaseOrders().filter((po) => {
    const status = String(po.status || "created").toLowerCase();
    return status !== "draft" && status !== "deleted";
  }), "po");
  const invoiceTotal = invoices.reduce((sum, invoice) => sum + Number(invoice.total || 0), 0);
  const paidTotal = invoices.reduce((sum, invoice) => sum + Number(invoice.paidAmount || 0), 0);
  const unpaidTotal = invoices.reduce((sum, invoice) => sum + Number(invoice.balanceAmount ?? invoice.total ?? 0), 0);
  const expenseTotal = purchaseOrders.reduce((sum, po) => sum + Number(po.total || 0), 0);
  const expensePaidTotal = purchaseOrders.reduce((sum, po) => sum + purchaseOrderPaidAmount(po), 0);
  const payableTotal = purchaseOrders.reduce((sum, po) => sum + purchaseOrderPayableAmount(po), 0);
  const profit = invoiceTotal - expenseTotal;
  renderReportDetailChart(type, invoices, purchaseOrders);

  if (type === "compliance") {
    const data = dashboardBusinessCompliance || {};
    const tasks = filterComplianceTasks(data.complianceTasks || []);
    const summary = data.complianceEngine?.summary || {
      pending: tasks.filter((task) => String(task.status || "pending").toLowerCase() === "pending").length,
      filed: tasks.filter((task) => String(task.status || "pending").toLowerCase() === "filed").length,
      overdue: tasks.filter((task) => String(task.status || "pending").toLowerCase() === "overdue").length,
    };
    const review = data.complianceReview || {};
    const reminders = data.complianceEngine?.reminders || {};
    const nextReminder = reminders.nextReminder || null;
    const missing = Array.isArray(review.missing) ? review.missing : [];
    const gst = data.gst || {};
    const readiness = data.readiness || {};
    if (!activePlanAllows("teamAccess")) {
      if (reportDetailMetrics) reportDetailMetrics.innerHTML = [
        metricCard("Compliance Reports", "Business tier"),
        metricCard("Current Plan", activePlanSummary?.label || "Free"),
        metricCard("GST / Audit", "Locked"),
        metricCard("Task Reminders", "Locked"),
      ].join("");
      renderReportTable(["Compliance Area", "Status", "How to unlock"], [
        ["Statutory task tracker", "Locked", "Upgrade to Business to manage GST, income tax, TDS, MCA and audit tasks."],
        ["Compliance reminders", "Locked", "Business tier enables responsible person, due date and reminder tracking."],
        ["Compliance readiness", "Locked", "Business tier checks PAN, GSTIN, TAN, state and place of business gaps."],
        ["GST payable summary", "Locked", "Business tier combines invoice output GST and PO/WO input GST."],
      ]);
      return;
    }
    if (reportDetailMetrics) reportDetailMetrics.innerHTML = [
      metricCard("Pending Tasks", String(summary.pending || 0)),
      metricCard("Filed Tasks", String(summary.filed || 0)),
      metricCard("Overdue Tasks", String(summary.overdue || 0)),
      metricCard("Profile Gaps", String(missing.length)),
      metricCard("Due This Month", String(summary.dueThisMonth || 0)),
      metricCard("Upcoming Reminders", String(reminders.counts?.upcoming ?? summary.upcomingReminders ?? 0)),
      metricCard("Overdue Compliance", String(reminders.counts?.overdue || 0)),
      metricCard("Next Reminder", nextReminder ? `${nextReminder.complianceName} (${nextReminder.nextReminderDate || nextReminder.dueDate || "date"})` : "None"),
      metricCard("Net GST Payable", `INR ${money(gst.netGstPayable || 0)}`),
      metricCard("Overall Readiness", readiness.overall ? "Ready" : "Review needed"),
    ].join("");
    const rows = tasks.map((task) => [
      task.complianceName || task.id || "Compliance task",
      task.department || "Compliance",
      complianceStatusLabel(task.status),
      task.dueDate || task.dueDateLabel || "Track manually",
      task.responsiblePerson || "Not assigned",
      task.reminderEnabled === false ? "Off" : `${task.nextReminderDate || "date"} (${task.reminderDaysBefore ?? 7} days before)`,
      (task.requiredDocuments || []).join(", ") || "-",
      task.notes || task.record?.auditTrail?.slice(-1)?.[0]?.toStatus || "-",
    ]);
    const profileRows = missing.map((field) => [
      `Profile gap: ${field}`,
      "Readiness",
      "Needs update",
      "Before filing",
      "Owner",
      "-",
      "Missing profile field",
      "Update Compliance Profile in Business Workspace.",
    ]);
    renderReportTable(
      ["Compliance", "Type", "Status", "Due Date", "Responsible", "Reminder", "Documents", "Notes"],
      rows.concat(profileRows),
    );
    return;
  }
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
    const vendorRows = vendorPayableRows(purchaseOrders);
    const partiallyPaid = purchaseOrders.filter((po) => purchaseOrderPaymentStatus(po) === "part_paid").length;
    const fullyPaid = purchaseOrders.filter((po) => purchaseOrderPaymentStatus(po) === "paid").length;
    if (reportDetailMetrics) reportDetailMetrics.innerHTML = [
      metricCard(type === "po" ? "PO / WO Created" : "Expense Records", String(purchaseOrders.length)),
      metricCard("Expense Value", `INR ${money(expenseTotal)}`),
      metricCard("Paid to Vendors", `INR ${money(expensePaidTotal)}`),
      metricCard("Payable Balance", `INR ${money(payableTotal)}`),
      metricCard("Fully Paid", String(fullyPaid)),
      metricCard("Part Paid", String(partiallyPaid)),
    ].join("");
    const recordRows = purchaseOrders.map((po) => [
      po.poNumber || "-",
      String(po.documentType || "po").toUpperCase(),
      po.billToName || "Vendor",
      po.poDate || "-",
      `${po.currency || "INR"} ${money(po.total || 0)}`,
      `${po.currency || "INR"} ${money(purchaseOrderPaidAmount(po))}`,
      `${po.currency || "INR"} ${money(purchaseOrderPayableAmount(po))}`,
      purchaseOrderPaymentLabel(po),
      String(po.status || "created"),
    ]);
    const summaryRows = vendorRows.length
      ? vendorRows.map((row) => [
        "Vendor Summary",
        `${row.records} record${row.records === 1 ? "" : "s"}`,
        row.vendor,
        "-",
        `INR ${money(row.total)}`,
        `INR ${money(row.paid)}`,
        `INR ${money(row.payable)}`,
        row.payable > 0 ? "Payable" : "Clear",
        `GST INR ${money(row.tax)}`,
      ])
      : [];
    renderReportTable(["Document", "Type", "Vendor", "Date", "Total", "Paid", "Payable", "Payment Status", "Record Status"], recordRows.concat(summaryRows));
    return;
  }

  if (type === "profit-loss") {
    if (reportDetailMetrics) reportDetailMetrics.innerHTML = [
      metricCard("Revenue", `INR ${money(invoiceTotal)}`),
      metricCard("Expenses", `INR ${money(expenseTotal)}`),
      metricCard("Gross Profit", `INR ${money(profit)}`),
      metricCard("Receivables", `INR ${money(unpaidTotal)}`),
      metricCard("Payables", `INR ${money(payableTotal)}`),
      metricCard("Margin", invoiceTotal > 0 ? `${((profit / invoiceTotal) * 100).toFixed(2)}%` : "0.00%"),
    ].join("");
    renderReportTable(["Particulars", "Calculation", "Amount"], [
      ["Revenue", "Created invoice total", `INR ${money(invoiceTotal)}`],
      ["Less: Expenses", "Created PO/WO total", `INR ${money(expenseTotal)}`],
      ["Profit / Loss", "Revenue - Expenses", `INR ${money(profit)}`],
      ["Cash Collected", "Paid invoice amount", `INR ${money(paidTotal)}`],
      ["Receivables", "Invoice balance amount", `INR ${money(unpaidTotal)}`],
      ["Vendor Payments Made", "Paid PO/WO amount", `INR ${money(expensePaidTotal)}`],
      ["Payables", "PO/WO balance amount", `INR ${money(payableTotal)}`],
      ["Cash Position View", "Cash collected - vendor payments made", `INR ${money(paidTotal - expensePaidTotal)}`],
    ]);
    return;
  }

  const gstOutput = invoices.reduce((sum, invoice) => sum + Number(invoice.taxAmount || 0), 0);
  const gstInput = purchaseOrders.reduce((sum, po) => sum + Number(po.taxAmount || 0), 0);
  const netGst = gstOutput - gstInput;

  if (type === "gst") {
    if (reportDetailMetrics) reportDetailMetrics.innerHTML = [
      metricCard("Output GST", `INR ${money(gstOutput)}`),
      metricCard("Input GST", `INR ${money(gstInput)}`),
      metricCard("Net GST Payable", `INR ${money(netGst)}`),
      metricCard("GST Records", String(invoices.length + purchaseOrders.length)),
      metricCard("Vendor Payables", `INR ${money(payableTotal)}`),
    ].join("");
    renderReportTable(["GST Report", "Source", "Records", "Taxable / Total", "GST Amount"], [
      ["Output GST", "Created Tax Invoices", String(invoices.length), `INR ${money(invoiceTotal)}`, `INR ${money(gstOutput)}`],
      ["Input GST", "Created PO / WO", String(purchaseOrders.length), `INR ${money(expenseTotal)}`, `INR ${money(gstInput)}`],
      ["Estimated Net GST", "Output GST - Input GST", "-", "-", `INR ${money(netGst)}`],
      ["Compliance Note", "Use this as a working report before filing reconciliation.", "-", selectedReportPeriodLabel(), netGst >= 0 ? "Payable" : "Input credit"],
    ]);
    return;
  }

  const receivables = unpaidTotal;
  const payables = payableTotal;
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
    metricCard("Payables", `INR ${money(payables)}`),
    metricCard("Top Customer", topCustomer ? `${topCustomer.name} - INR ${money(topCustomer.value)}` : "No invoices"),
  ].join("");
  renderReportTable(["Advanced Report", "Current Insight", "Value"], [
    ["Balance Sheet Snapshot", "Receivables minus vendor payables", `INR ${money(receivables - payables)}`],
    ["GST Summary", `Output INR ${money(gstOutput)} less input INR ${money(gstInput)}`, `INR ${money(netGst)}`],
    ["Customer Aging", customerAging[0] ? `${customerAging[0].customer} - ${customerAging[0].bucket}` : "No outstanding balances", customerAging[0] ? `INR ${money(customerAging[0].amount)}` : "INR 0.00"],
    ["Vendor Spend", topVendor ? topVendor.name : "No PO/WO records", topVendor ? `INR ${money(topVendor.value)}` : "INR 0.00"],
    ["Vendor Payables", vendorPayableRows(purchaseOrders)[0]?.vendor || "No payable balances", `INR ${money(payables)}`],
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
  if (dashboardReportSummary?.available && dashboardReportSummary.totals) {
    const totals = dashboardReportSummary.totals;
    if (totalInvoices) totalInvoices.textContent = String(totals.createdInvoices || 0);
    if (paidAmount) paidAmount.textContent = `INR ${money(totals.paidAmount || 0)}`;
    if (unpaidAmount) unpaidAmount.textContent = `INR ${money(totals.unpaidAmount || 0)}`;
    if (overdueCount) overdueCount.textContent = String(totals.overdueInvoices || 0);
    if (monthlyRevenue) monthlyRevenue.textContent = `INR ${money(totals.paymentTotal || totals.paidAmount || 0)}`;
    if (pendingPayments) pendingPayments.textContent = String(totals.pendingPayments || 0);
    if (reportIncomeTotal) reportIncomeTotal.textContent = `INR ${money(totals.revenue || 0)}`;
    if (reportExpenseTotal) reportExpenseTotal.textContent = `INR ${money(totals.expenses || 0)}`;
    if (reportProfitTotal) reportProfitTotal.textContent = `INR ${money(totals.profit || 0)}`;
    renderMainReportCharts();
    return;
  }
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

function currentReportSummaryFilters() {
  return {
    month: reportMonth?.value || "",
    year: reportYear?.value || "",
  };
}

function currentDetailReportSummaryFilters() {
  const period = detailReportPeriod?.value || "all";
  const today = new Date();
  if (period === "weekly") {
    const sevenDaysAgo = new Date(today);
    sevenDaysAgo.setDate(today.getDate() - 6);
    return {
      startDate: sevenDaysAgo.toISOString().slice(0, 10),
      endDate: today.toISOString().slice(0, 10),
    };
  }
  if (period === "monthly") {
    return {
      month: detailReportMonth?.value || String(today.getMonth() + 1).padStart(2, "0"),
      year: detailReportYear?.value || String(today.getFullYear()),
    };
  }
  if (period === "yearly") {
    return {
      year: detailReportYear?.value || String(today.getFullYear()),
    };
  }
  if (period === "financial-year") {
    return {
      financialYear: detailFinancialYear?.value || currentFinancialYearLabel(today),
    };
  }
  if (period === "custom") {
    return {
      startDate: detailStartDate?.value || "",
      endDate: detailEndDate?.value || "",
    };
  }
  return {};
}

async function refreshDashboardReportSummary() {
  try {
    const summary = await apiClient.getReportSummary(token, selectedWorkspaceOptions(currentReportSummaryFilters()));
    dashboardReportSummary = summary?.available ? summary : null;
  } catch {
    dashboardReportSummary = null;
  }
}

async function refreshDetailReportSummary() {
  try {
    const summary = await apiClient.getReportSummary(token, selectedWorkspaceOptions(currentDetailReportSummaryFilters()));
    detailReportSummary = summary?.available ? summary : null;
  } catch {
    detailReportSummary = null;
  }
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
          <div class="badge-row">
            <span class="pill blue">${escapeHtml(customer.customerCode || "Customer")}</span>
            <span class="pill ${String(customer.status || "active").toLowerCase() === "deleted" ? "red" : "green"}">${escapeHtml(String(customer.status || "active").toUpperCase())}</span>
          </div>
          <h3>${escapeHtml(customer.businessName || customer.name || "Customer")}</h3>
          <p>${escapeHtml(customer.phone || "Phone not saved")} - ${escapeHtml(customer.email || "Email not saved")}</p>
          <p class="hint">${escapeHtml(customer.billingAddress || "Address not saved")}</p>
          <p class="hint">GST: ${escapeHtml(customer.gstNumber || "Not added")} | PAN: ${escapeHtml(customer.panNumber || "Not added")} | Due: INR ${money(customerDueAmount(customer))}</p>
        </div>
        <div class="row-actions">
          <button class="ghost small" type="button" data-edit-customer="${escapeHtml(customer.id)}">Edit</button>
          ${String(customer.status || "active").toLowerCase() === "deleted"
            ? `<button class="ghost small" type="button" data-reactivate-customer="${escapeHtml(customer.id)}">Reactivate</button>`
            : `<button class="ghost small danger" type="button" data-delete-customer="${escapeHtml(customer.id)}">Delete</button>`}
        </div>
      </article>
    `).join("")
    : '<div class="notice">No customers yet. Add a customer while creating an invoice.</div>';

  document.querySelectorAll("[data-edit-customer]").forEach((button) => {
    button.addEventListener("click", async () => {
      if (!workspaceCanWriteRecords()) {
        window.alert(workspaceWriteLockMessage("edit customers"));
        return;
      }
      const customerId = button.getAttribute("data-edit-customer");
      const customer = dashboardCustomers.find((entry) => entry.id === customerId);
      if (!customer) return;
      const name = window.prompt("Customer name", customer.name || customer.businessName || "");
      if (name === null) return;
      const phone = window.prompt("Contact number", customer.phone || "");
      if (phone === null) return;
      const email = window.prompt("Email", customer.email || "");
      if (email === null) return;
      const billingAddress = window.prompt("Billing address", customer.billingAddress || "");
      if (billingAddress === null) return;
      try {
        const updated = await apiClient.updateCustomer(token, customerId, {
          ...selectedWorkspaceOptions(),
          name,
          phone,
          email,
          billingAddress,
        });
        dashboardCustomers = dashboardCustomers.map((entry) => (entry.id === updated.id ? updated : entry));
        renderCustomers(dashboardCustomers);
      } catch (error) {
        window.alert(error.message || "Could not update customer.");
      }
    });
  });

  document.querySelectorAll("[data-delete-customer]").forEach((button) => {
    button.addEventListener("click", async () => {
      if (!workspaceCanWriteRecords()) {
        window.alert(workspaceWriteLockMessage("delete customers"));
        return;
      }
      const customerId = button.getAttribute("data-delete-customer");
      if (!customerId || !window.confirm("Delete this customer from the active list? Existing invoices will remain linked historically.")) return;
      try {
        const deleted = await apiClient.deleteCustomer(token, customerId, selectedWorkspaceOptions());
        dashboardCustomers = dashboardCustomers.map((entry) => (entry.id === deleted.id ? deleted : entry));
        renderCustomers(dashboardCustomers);
      } catch (error) {
        window.alert(error.message || "Could not delete customer.");
      }
    });
  });

  document.querySelectorAll("[data-reactivate-customer]").forEach((button) => {
    button.addEventListener("click", async () => {
      if (!workspaceCanWriteRecords()) {
        window.alert(workspaceWriteLockMessage("reactivate customers"));
        return;
      }
      const customerId = button.getAttribute("data-reactivate-customer");
      if (!customerId) return;
      try {
        const restored = await apiClient.reactivateCustomer(token, customerId, selectedWorkspaceOptions());
        dashboardCustomers = dashboardCustomers.map((entry) => (entry.id === restored.id ? restored : entry));
        renderCustomers(dashboardCustomers);
      } catch (error) {
        window.alert(error.message || "Could not reactivate customer.");
      }
    });
  });
}

function vendorSpendByName(purchaseOrders) {
  const spendMap = new Map();
  purchaseOrders.forEach((po) => {
    const status = String(po.status || "created").toLowerCase();
    if (status === "deleted") return;
    const name = String(po.billToName || po.vendorName || "").trim();
    if (!name) return;
    const key = name.toLowerCase();
    const existing = spendMap.get(key) || {
      name,
      total: 0,
      paid: 0,
      payable: 0,
      count: 0,
      address: po.billToAddress || "",
      vendorCode: po.vendorCode || "PO/WO",
    };
    existing.total += status === "draft" ? 0 : Number(po.total || 0);
    existing.paid += status === "draft" ? 0 : Number(po.paidAmount || 0);
    existing.payable += status === "draft" ? 0 : Number(po.balanceAmount ?? po.total ?? 0);
    existing.count += 1;
    if (!existing.address && po.billToAddress) existing.address = po.billToAddress;
    spendMap.set(key, existing);
  });
  return spendMap;
}

function renderVendors(vendors = dashboardVendors, purchaseOrders = dashboardPurchaseOrders) {
  if (!vendorsList) return;
  const spendMap = vendorSpendByName(purchaseOrders);
  const masterVendors = Array.isArray(vendors) ? vendors : [];
  const masterKeys = new Set(masterVendors.map((vendor) => String(vendor.businessName || vendor.name || "").trim().toLowerCase()).filter(Boolean));
  const derivedOnly = [...spendMap.values()].filter((vendor) => !masterKeys.has(String(vendor.name || "").trim().toLowerCase()));
  vendorsList.innerHTML = masterVendors.length || derivedOnly.length
    ? masterVendors.map((vendor) => `
      <article class="management-card">
        <div>
          <div class="badge-row">
            <span class="pill blue">${escapeHtml(vendor.vendorCode || "Vendor")}</span>
            <span class="pill ${String(vendor.status || "active").toLowerCase() === "deleted" ? "red" : "green"}">${escapeHtml(String(vendor.status || "active").toUpperCase())}</span>
          </div>
          <h3>${escapeHtml(vendor.businessName || vendor.name || "Vendor")}</h3>
          <p>${escapeHtml(vendor.phone || "Phone not saved")} - ${escapeHtml(vendor.email || "Email not saved")}</p>
          <p class="hint">${escapeHtml(vendor.billingAddress || "Address not saved")}</p>
          <p class="hint">GST: ${escapeHtml(vendor.gstNumber || "Not added")} | PAN: ${escapeHtml(vendor.panNumber || "Not added")}</p>
          <p class="hint">PO/WO spend: INR ${money(spendMap.get(String(vendor.businessName || vendor.name || "").trim().toLowerCase())?.total || 0)} | Paid: INR ${money(spendMap.get(String(vendor.businessName || vendor.name || "").trim().toLowerCase())?.paid || 0)} | Payable: INR ${money(spendMap.get(String(vendor.businessName || vendor.name || "").trim().toLowerCase())?.payable || 0)}</p>
        </div>
        <div class="row-actions">
          <button class="ghost small" type="button" data-edit-vendor="${escapeHtml(vendor.id)}">Edit</button>
          ${String(vendor.status || "active").toLowerCase() === "deleted"
            ? `<button class="ghost small" type="button" data-reactivate-vendor="${escapeHtml(vendor.id)}">Reactivate</button>`
            : `<button class="ghost small danger" type="button" data-delete-vendor="${escapeHtml(vendor.id)}">Delete</button>`}
        </div>
      </article>
    `).join("") + derivedOnly.map((vendor) => `
      <article class="management-card">
        <div>
          <div class="badge-row">
            <span class="pill gold">${escapeHtml(vendor.vendorCode)}</span>
            <span class="pill blue">PO/WO Derived</span>
          </div>
          <h3>${escapeHtml(vendor.name)}</h3>
          <p>${escapeHtml(vendor.address || "Vendor address not saved")}</p>
          <p class="hint">PO/WO records: ${vendor.count} | Total: INR ${money(vendor.total)} | Payable: INR ${money(vendor.payable)}</p>
        </div>
        <div class="row-actions">
          <a class="ghost small" href="/apps/web/invoice.html?type=po">Create PO/WO</a>
        </div>
      </article>
    `).join("")
    : '<div class="notice">No vendors yet. Create a PO or WO to add vendor details.</div>';

  document.querySelectorAll("[data-edit-vendor]").forEach((button) => {
    button.addEventListener("click", async () => {
      if (!workspaceCanWriteRecords()) {
        window.alert(workspaceWriteLockMessage("edit vendors"));
        return;
      }
      const vendorId = button.getAttribute("data-edit-vendor");
      const vendor = dashboardVendors.find((entry) => entry.id === vendorId);
      if (!vendor) return;
      const name = window.prompt("Vendor name", vendor.name || vendor.businessName || "");
      if (name === null) return;
      const phone = window.prompt("Contact number", vendor.phone || "");
      if (phone === null) return;
      const email = window.prompt("Email", vendor.email || "");
      if (email === null) return;
      const billingAddress = window.prompt("Billing address", vendor.billingAddress || "");
      if (billingAddress === null) return;
      try {
        const updated = await apiClient.updateVendor(token, vendorId, {
          ...selectedWorkspaceOptions(),
          name,
          phone,
          email,
          billingAddress,
        });
        dashboardVendors = dashboardVendors.map((entry) => (entry.id === updated.id ? updated : entry));
        renderVendors(dashboardVendors, dashboardPurchaseOrders);
      } catch (error) {
        window.alert(error.message || "Could not update vendor.");
      }
    });
  });

  document.querySelectorAll("[data-delete-vendor]").forEach((button) => {
    button.addEventListener("click", async () => {
      if (!workspaceCanWriteRecords()) {
        window.alert(workspaceWriteLockMessage("delete vendors"));
        return;
      }
      const vendorId = button.getAttribute("data-delete-vendor");
      if (!vendorId || !window.confirm("Delete this vendor from the active list? Existing PO/WO records will remain linked historically.")) return;
      try {
        const deleted = await apiClient.deleteVendor(token, vendorId, selectedWorkspaceOptions());
        dashboardVendors = dashboardVendors.map((entry) => (entry.id === deleted.id ? deleted : entry));
        renderVendors(dashboardVendors, dashboardPurchaseOrders);
      } catch (error) {
        window.alert(error.message || "Could not delete vendor.");
      }
    });
  });

  document.querySelectorAll("[data-reactivate-vendor]").forEach((button) => {
    button.addEventListener("click", async () => {
      if (!workspaceCanWriteRecords()) {
        window.alert(workspaceWriteLockMessage("reactivate vendors"));
        return;
      }
      const vendorId = button.getAttribute("data-reactivate-vendor");
      if (!vendorId) return;
      try {
        const restored = await apiClient.reactivateVendor(token, vendorId, selectedWorkspaceOptions());
        dashboardVendors = dashboardVendors.map((entry) => (entry.id === restored.id ? restored : entry));
        renderVendors(dashboardVendors, dashboardPurchaseOrders);
      } catch (error) {
        window.alert(error.message || "Could not reactivate vendor.");
      }
    });
  });
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

function paymentsForPurchaseOrder(purchaseOrderId) {
  return dashboardPayments
    .filter((payment) => payment.purchaseOrderId === purchaseOrderId && String(payment.status || "captured").toLowerCase() === "captured")
    .sort((a, b) => String(b.paymentDate || b.createdAt || "").localeCompare(String(a.paymentDate || a.createdAt || "")));
}

function renderPaymentModalDetails(record, context = "invoice") {
  if (!record) return;
  const isPurchaseOrder = context === "purchaseOrder";
  const balance = Number(record.balanceAmount ?? record.total ?? 0);
  const paid = Number(record.paidAmount || 0);
  const currency = record.currency || "INR";
  const number = isPurchaseOrder ? record.poNumber : record.invoiceNumber;
  const party = record.billToName || (isPurchaseOrder ? "Vendor" : "Customer");
  if (paymentModalTitle) paymentModalTitle.textContent = isPurchaseOrder ? "Add PO/WO Payment" : "Add Invoice Payment";
  if (paymentModalInvoiceMeta) {
    paymentModalInvoiceMeta.textContent = `${number || (isPurchaseOrder ? "PO/WO" : "Invoice")} - ${party} - Balance ${currency} ${money(balance)}`;
  }
  if (paymentModalSummary) {
    paymentModalSummary.innerHTML = `
      <div><span>Total Amount</span><strong>${escapeHtml(currency)} ${money(record.total || 0)}</strong></div>
      <div><span>Paid So Far</span><strong>${escapeHtml(currency)} ${money(paid)}</strong></div>
      <div><span>Pending Balance</span><strong>${escapeHtml(currency)} ${money(balance)}</strong></div>
    `;
  }
  if (paymentHistoryList) {
    const payments = isPurchaseOrder ? paymentsForPurchaseOrder(record.id) : paymentsForInvoice(record.id);
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
  if (paymentSubmitButton) paymentSubmitButton.textContent = balance > 0 ? "Add Payment" : isPurchaseOrder ? "PO/WO Paid" : "Invoice Paid";
}

function openPaymentModal(record, context = "invoice") {
  if (!paymentModal || !paymentForm || !paymentInvoiceId || !paymentAmountInput || !paymentDateInput) return;
  const balance = Number(record.balanceAmount ?? record.total ?? 0);
  paymentInvoiceId.value = record.id;
  paymentForm.dataset.context = context;
  paymentAmountInput.value = balance > 0 ? String(balance) : "";
  paymentAmountInput.max = balance > 0 ? String(balance) : "";
  paymentAmountInput.disabled = balance <= 0;
  paymentDateInput.value = new Date().toISOString().slice(0, 10);
  if (paymentModeInput) paymentModeInput.value = "UPI";
  if (paymentReferenceInput) paymentReferenceInput.value = "";
  if (paymentNotesInput) paymentNotesInput.value = "";
  renderPaymentModalDetails(record, context);
  setPaymentModalStatus("");
  paymentModal.hidden = false;
  paymentAmountInput.focus();
}

function closePaymentModal() {
  if (paymentModal) paymentModal.hidden = true;
  paymentForm?.reset();
  if (paymentForm) paymentForm.dataset.context = "invoice";
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
  renderVendors(dashboardVendors, dashboardPurchaseOrders);
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
  const canWriteRecords = workspaceCanWriteRecords();
  if (draftInvoiceCount) draftInvoiceCount.textContent = String(drafts.length);
  if (createdInvoiceCount) createdInvoiceCount.textContent = String(createdInvoices.length);
  if (invoiceRevenueTotal) invoiceRevenueTotal.textContent = `INR ${money(total)}`;
  if (runRecurringDraftsBtn) {
    const canRunRecurring = activePlanAllows("recurringInvoices") && canWriteRecords;
    runRecurringDraftsBtn.disabled = !canRunRecurring;
    runRecurringDraftsBtn.textContent = activePlanAllows("recurringInvoices") ? "Generate Recurring Drafts" : "Recurring Drafts in Standard";
    runRecurringDraftsBtn.title = canRunRecurring
      ? "Create due draft invoices from recurring invoice templates"
      : activePlanAllows("recurringInvoices")
        ? workspaceWriteLockMessage("generate recurring invoice drafts")
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
          <a class="ghost small" href="/apps/web/invoice.html?invoice=${encodeURIComponent(invoiceId)}">${canWriteRecords ? (isDraft ? "Edit Draft" : "Open / Edit") : "Open"}</a>
          ${canWriteRecords && !isDraft && balance > 0 ? `<button class="ghost small" type="button" data-payment-invoice="${escapeHtml(invoiceId)}" data-balance="${balance}">Record Payment</button>` : ""}
          ${canWriteRecords && !isDraft && balance > 0 ? `<button class="ghost small" type="button" data-payment-link="${escapeHtml(invoiceId)}">${activePlanAllows("razorpayCollections") ? "Collect Online" : "Upgrade for Gateway"}</button>` : ""}
          ${canWriteRecords ? `<button class="ghost small danger" type="button" data-delete-invoice="${escapeHtml(invoiceId)}">Delete</button>` : `<span class="pill gold">View only</span>`}
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
      if (!workspaceCanWriteRecords()) {
        setWorkspaceLockStatus("record invoice payments");
        return;
      }
      const invoiceId = button.getAttribute("data-payment-invoice");
      const invoice = dashboardInvoices.find((entry) => entry.id === invoiceId);
      if (invoice) openPaymentModal(invoice);
    });
  });

  document.querySelectorAll("[data-payment-link]").forEach((button) => {
    button.addEventListener("click", async () => {
      if (!workspaceCanWriteRecords()) {
        setWorkspaceLockStatus("create invoice payment links");
        return;
      }
      const invoiceId = button.getAttribute("data-payment-link");
      if (!activePlanAllows("razorpayCollections")) {
        setPaymentModalStatus("Razorpay payment collection is available on Standard and higher plans. Upgrade before using gateway links.", "error");
        return;
      }
      try {
        setPaymentModalStatus("Opening Razorpay checkout...", "");
        const orderPayload = await apiClient.createRazorpayOrder(token, { kind: "invoice", invoiceId, ...selectedWorkspaceOptions() });
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
      if (!workspaceCanWriteRecords()) {
        setWorkspaceLockStatus("delete invoices");
        return;
      }
      const invoiceId = button.getAttribute("data-delete-invoice");
      if (!invoiceId || !window.confirm("Delete this invoice? The number will remain consumed and will not be reused.")) return;
      try {
        const deleted = await apiClient.deleteInvoice(token, invoiceId, selectedWorkspaceOptions());
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
  const canWriteRecords = workspaceCanWriteRecords();
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
    const balance = Number(po.balanceAmount ?? po.total ?? 0);
    const paymentStatus = String(po.paymentStatus || (isDraft ? "draft" : balance <= 0 ? "paid" : "unpaid")).toLowerCase();
    const paymentTone = paymentStatus === "paid" ? "green" : paymentStatus === "part_paid" ? "gold" : paymentStatus === "overdue" ? "red" : tone;
    return `
      <div class="invoice-card">
        <div>
          <strong>${escapeHtml(po.poNumber || `${docType} draft`)}</strong>
          <div class="hint">${escapeHtml(po.billToName || "Vendor")} - ${escapeHtml(po.poDate || "No date")} - ${escapeHtml(currency)} ${money(po.total || 0)} - Balance ${escapeHtml(currency)} ${money(balance)}</div>
        </div>
        <div class="row-actions">
          <a class="ghost small" href="/apps/web/invoice.html?type=po&po=${encodeURIComponent(poId)}">${canWriteRecords ? (isDraft ? "Edit Draft" : "Open / Edit") : "Open"}</a>
          ${canWriteRecords && !isDraft && paymentStatus !== "paid" ? `<button class="ghost small" type="button" data-record-po-payment="${escapeHtml(poId)}">Record Payment</button>` : ""}
          ${canWriteRecords ? `<button class="ghost small danger" type="button" data-delete-po="${escapeHtml(poId)}">Delete</button>` : `<span class="pill gold">View only</span>`}
          <span class="pill ${tone}">${escapeHtml(String(po.status || "created").toUpperCase())}</span>
          <span class="pill ${paymentTone}">${escapeHtml(paymentStatus.replace("_", " ").toUpperCase())}</span>
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
      if (!workspaceCanWriteRecords()) {
        setWorkspaceLockStatus("delete PO/WO records");
        return;
      }
      const poId = button.getAttribute("data-delete-po");
      if (!poId || !window.confirm("Delete this PO/WO? The number will remain consumed and will not be reused.")) return;
      try {
        const deleted = await apiClient.deletePurchaseOrder(token, poId, selectedWorkspaceOptions());
        replacePurchaseOrder(deleted);
        rerenderDashboardData();
      } catch (error) {
        setPaymentModalStatus(error.message || "Could not delete PO/WO.", "error");
      }
    });
  });
  document.querySelectorAll("[data-record-po-payment]").forEach((button) => {
    button.addEventListener("click", () => {
      if (!workspaceCanWriteRecords()) {
        setWorkspaceLockStatus("record PO/WO payments");
        return;
      }
      const poId = button.getAttribute("data-record-po-payment");
      const purchaseOrder = dashboardPurchaseOrders.find((entry) => entry.id === poId);
      if (purchaseOrder) openPaymentModal(purchaseOrder, "purchaseOrder");
    });
  });
}

function renderComplianceDashboard(enabled) {
  const data = dashboardBusinessCompliance || {};
  const readiness = data.readiness || {};
  const financials = data.financials || {};
  const gst = data.gst || {};
  const accountingGst = data.accountingGst || null;
  const review = data.complianceReview || {};
  const engine = data.complianceEngine || {};
  const engineSummary = engine.summary || {};
  const tasks = Array.isArray(engine.tasks) ? engine.tasks : [];
  const reminderDigest = engine.reminders || {};
  const nextReminder = reminderDigest.next || null;
  const upcomingCount = Number(reminderDigest.counts?.upcoming || 0);
  const overdueCount = Number(reminderDigest.counts?.overdue || 0);
  const dueThisMonth = Number(reminderDigest.counts?.dueThisMonth || 0);
  const readyCount = ["compliance", "gst", "smtp", "gateway"].filter((key) => readiness[key]).length;
  if (complianceOverallBadge) {
    complianceOverallBadge.textContent = enabled
      ? readiness.overall ? "Ready" : `${readyCount}/4 ready`
      : "Business required";
    complianceOverallBadge.className = `pill ${enabled && readiness.overall ? "blue" : "gold"}`;
  }
  if (complianceHealthCards) {
    complianceHealthCards.innerHTML = [
      ["Compliance", readiness.compliance ? "Ready" : "Review", review.message || "Profile not checked"],
      ["GST Position", `INR ${money(accountingGst?.netGstPayable ?? gst.netGstPayable ?? 0)}`, `Output INR ${money(accountingGst?.outputGst ?? gst.outputGst ?? 0)} less input INR ${money(accountingGst?.inputGst ?? gst.inputGst ?? 0)}`],
      ["SMTP", readiness.smtp ? "Ready" : "Not ready", data.communication?.status || "not_configured"],
      ["Gateway", readiness.gateway ? "Ready" : "Not ready", data.gateway?.paymentLinkEnabled ? "Payment links enabled" : "Payment links not enabled"],
      ["Profit", `INR ${money(financials.profit || 0)}`, `Revenue INR ${money(financials.revenue || 0)} less expenses INR ${money(financials.expenses || 0)}`],
      ["Receivables", `INR ${money(financials.receivables || 0)}`, `Paid INR ${money(financials.paid || 0)}`],
      ["Compliance reminders", String(upcomingCount), nextReminder ? `${nextReminder.complianceName} on ${nextReminder.nextReminderDate || nextReminder.dueDate || "date"}` : "No upcoming reminder in 30 days"],
    ].map(([title, value, hint]) => `
      <article class="quick-card">
        <strong>${escapeHtml(title)}</strong>
        <span>${escapeHtml(hint)}</span>
        <strong>${escapeHtml(value)}</strong>
      </article>
    `).join("");
  }
  if (complianceReadinessList) {
    const missing = review.missing || [];
    const issues = review.issues || [];
    complianceReadinessList.innerHTML = `
      <strong>Compliance readiness</strong>
      <p>${escapeHtml(review.message || "Business compliance profile has not been checked yet.")}</p>
      ${missing.length ? `<p class="hint"><strong>Missing:</strong> ${escapeHtml(missing.join(", "))}</p>` : ""}
      ${issues.length ? `<p class="hint"><strong>Issues:</strong> ${escapeHtml(issues.join(", "))}</p>` : ""}
      <p class="hint">Entity: ${escapeHtml(review.entityLabel || review.entityType || "Business")} | Financial year starts in month ${escapeHtml(review.fiscalYearStartMonth || 4)}.</p>
      <p class="hint">Generated tasks: ${escapeHtml(engineSummary.total || tasks.length || 0)} | Pending: ${escapeHtml(engineSummary.pending || 0)} | Filed: ${escapeHtml(engineSummary.filed || 0)} | Profile gaps: ${escapeHtml(engineSummary.profileMissing || 0)}</p>
      <p class="hint">Reminders: ${escapeHtml(reminderDigest.counts?.upcoming || 0)} upcoming | ${escapeHtml(reminderDigest.counts?.overdue || 0)} overdue | ${escapeHtml(reminderDigest.counts?.dueThisMonth || 0)} due this month.</p>
      ${tasks.length ? `
        <div class="mini-list compliance-task-list">
          ${tasks.map((task) => `
            <form class="compliance-task-card" data-compliance-task-id="${escapeHtml(task.id)}">
              <div>
                <strong>${escapeHtml(task.complianceName)}</strong>
                <span>${escapeHtml(task.department || "Compliance")} - ${escapeHtml(task.frequency || "review")} - Due ${escapeHtml(task.dueDate || task.dueDateLabel || "date to be tracked")}</span>
                <span class="pill ${complianceStatusTone(task.status)}">${escapeHtml(String(task.status || "pending").replaceAll("_", " ").toUpperCase())}</span>
              </div>
              <div class="compact-fields">
                <select name="status" aria-label="Compliance task status">
                  ${["pending", "filed", "needs_document", "overdue", "not_applicable", "profile_missing"].map((status) => `
                    <option value="${status}" ${String(task.status || "pending") === status ? "selected" : ""}>${status.replaceAll("_", " ")}</option>
                  `).join("")}
                </select>
                <input name="dueDate" type="date" value="${escapeHtml(task.dueDate || "")}" aria-label="Compliance due date" />
                <input name="reminderDaysBefore" type="number" min="0" max="90" value="${escapeHtml(task.reminderDaysBefore ?? 7)}" aria-label="Reminder days before due date" />
                <input name="responsiblePerson" value="${escapeHtml(task.responsiblePerson || "")}" placeholder="Responsible person" />
                <input name="notes" value="${escapeHtml(task.notes || "")}" placeholder="Notes" />
                <span class="hint compact-hint">Docs: ${escapeHtml((task.requiredDocuments || []).join(", ") || "None")}</span>
                <span class="hint compact-hint">Last reminder: ${escapeHtml(task.lastReminderSentAt ? `${task.lastReminderStatus || "sent"} on ${task.lastReminderSentAt.slice(0, 10)}` : "Not sent")}</span>
                <label class="check-row compact"><input name="reminderEnabled" type="checkbox" ${task.reminderEnabled === false ? "" : "checked"} /> Reminder</label>
                <button class="ghost" type="submit">Save</button>
                <button class="ghost" type="button" data-compliance-reminder-id="${escapeHtml(task.id)}">Send reminder</button>
              </div>
            </form>
          `).join("")}
        </div>
      ` : ""}
    `;
  }
  if (gstComplianceSummary) {
    gstComplianceSummary.innerHTML = `
      <strong>GST and audit summary</strong>
      <p>Invoices: ${escapeHtml(gst.invoiceCount || 0)} | PO/WO: ${escapeHtml(gst.purchaseOrderCount || 0)}</p>
      <p>Output GST: INR ${money(gst.outputGst || 0)}</p>
      <p>Input GST: INR ${money(gst.inputGst || 0)}</p>
      <p><strong>Estimated net GST payable: INR ${money(gst.netGstPayable || 0)}</strong></p>
      ${accountingGst?.enabled ? `
        <p class="hint"><strong>Ledger reconciliation:</strong> Output INR ${money(accountingGst.outputGst || 0)} | Input INR ${money(accountingGst.inputGst || 0)} | Net INR ${money(accountingGst.netGstPayable || 0)}</p>
      ` : ""}
    `;
  }
  if (complianceAuditSnapshot) {
    complianceAuditSnapshot.innerHTML = `
      <strong>Audit-ready snapshot</strong>
      <p>Status mix: ${escapeHtml(engineSummary.pending || 0)} pending, ${escapeHtml(engineSummary.filed || 0)} filed, ${escapeHtml(overdueCount)} overdue.</p>
      <p>Reminder queue: ${escapeHtml(upcomingCount)} upcoming, ${escapeHtml(dueThisMonth)} due this month.</p>
      <p>Export includes compliance name, department, status, due date, reminder date, responsible person, and required documents.</p>
    `;
  }
}

function renderBusinessWorkspaceContext(enabled) {
  const workspace = activeBusinessWorkspace();
  const role = workspace?.role || "owner";
  const roleLabel = `${role.charAt(0).toUpperCase()}${role.slice(1)}`;
  if (businessWorkspaceSwitcher) {
    businessWorkspaceSwitcher.innerHTML = dashboardBusinessWorkspaces.length
      ? dashboardBusinessWorkspaces.map((item) => `
        <option value="${escapeHtml(item.ownerUserId)}">${escapeHtml(item.label || item.email || "Business workspace")} (${escapeHtml(item.role || "owner")})</option>
      `).join("")
      : `<option value="${escapeHtml(currentUser?.id || "")}">${escapeHtml(currentUser?.name || "My workspace")} (owner)</option>`;
    businessWorkspaceSwitcher.value = workspace?.ownerUserId || currentUser?.id || "";
    businessWorkspaceSwitcher.disabled = dashboardBusinessWorkspaces.length <= 1;
  }
  if (businessWorkspaceRoleBadge) {
    businessWorkspaceRoleBadge.textContent = roleLabel;
    businessWorkspaceRoleBadge.className = `pill ${workspace?.source === "team" ? "blue" : "gold"}`;
  }
  if (businessWorkspaceBadge) {
    businessWorkspaceBadge.textContent = enabled ? "Workspace active" : "Business required";
    businessWorkspaceBadge.className = `pill ${enabled ? "blue" : "gold"}`;
  }
}

function setFormPermission(form, allowed, lockedMessage = "Your current workspace role can view this section, but cannot change it.") {
  if (!form) return;
  [...form.elements].forEach((element) => { element.disabled = !allowed; });
  form.setAttribute("aria-disabled", String(!allowed));
  form.title = allowed ? "" : lockedMessage;
  const group = form.closest(".workspace-group");
  if (group) {
    group.dataset.permission = allowed ? "enabled" : "locked";
    const status = group.querySelector("[data-workspace-lock-message]");
    if (!allowed && !status) {
      form.insertAdjacentHTML("beforebegin", `<div class="notice compact workspace-lock-message" data-workspace-lock-message>${escapeHtml(lockedMessage)}</div>`);
    } else if (allowed && status) {
      status.remove();
    } else if (status) {
      status.textContent = lockedMessage;
    }
  }
}

function renderBusinessWorkspace() {
  const workspace = activeBusinessWorkspace();
  const enabled = canOpenBusinessWorkspace();
  renderBusinessWorkspaceContext(enabled);
  renderWorkspacePermissionPanel(enabled);
  renderBusinessWorkspaceFlowChecklist(enabled);
  renderBusinessWorkspaceStatusBoard(enabled);
  renderBusinessWorkspaceSectionControls(enabled);
  if (businessWorkspaceNotice) {
    if (!enabled) {
      businessWorkspaceNotice.textContent = "Upgrade to Business, or use Admin plan preview locally, to test team access, approvals, and API keys.";
    } else if (workspace?.source === "team") {
      businessWorkspaceNotice.textContent = `You are viewing ${workspace.label || "a Business workspace"} as ${workspace.role || "team member"}. Open one section at a time; controls are limited by this role.`;
    } else {
      businessWorkspaceNotice.textContent = "Business controls are enabled. Open one section at a time: email, gateway, compliance, team, API, or approvals.";
    }
  }
  setFormPermission(teamInviteForm, enabled && workspaceCan("manageTeam"));
  setFormPermission(apiKeyForm, enabled && workspaceCan("apiAccess"));
  setFormPermission(approvalRequestForm, enabled && workspaceCan("approvals"));
  setFormPermission(businessEmailSettingsForm, enabled && workspaceCan("manageSettings"));
  setFormPermission(businessPaymentSettingsForm, enabled && workspaceCan("manageSettings"));
  setFormPermission(businessComplianceForm, enabled && workspaceCan("compliance"));
  if (businessEmailTestButton) businessEmailTestButton.disabled = !(enabled && workspaceCan("manageSettings"));
  if (teamMemberCount) teamMemberCount.textContent = String(dashboardTeamMembers.length);
  if (approvalRequestCount) approvalRequestCount.textContent = String(dashboardApprovalRequests.length);
  if (apiKeyCount) apiKeyCount.textContent = String(dashboardApiKeys.filter((key) => key.status !== "revoked").length);
  renderComplianceDashboard(enabled);
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
    businessComplianceForm.entityType.value = complianceProfile.entityType || "individual";
    businessComplianceForm.businessCategory.value = complianceProfile.businessCategory || "";
    businessComplianceForm.pan.value = complianceProfile.pan || "";
    businessComplianceForm.tan.value = complianceProfile.tan || "";
    businessComplianceForm.gstin.value = complianceProfile.gstin || "";
    businessComplianceForm.state.value = complianceProfile.state || "";
    businessComplianceForm.placeOfBusiness.value = complianceProfile.placeOfBusiness || "";
    businessComplianceForm.invoicePrefix.value = complianceProfile.invoicePrefix || "";
    businessComplianceForm.annualTurnover.value = complianceProfile.annualTurnover || "";
    businessComplianceForm.employeeCount.value = complianceProfile.employeeCount || "";
    businessComplianceForm.fiscalYearStartMonth.value = String(complianceProfile.fiscalYearStartMonth || 4);
    businessComplianceForm.gstRegistered.checked = Boolean(complianceProfile.gstRegistered);
    businessComplianceForm.tanAvailable.checked = Boolean(complianceProfile.tanAvailable);
    businessComplianceForm.importExport.checked = Boolean(complianceProfile.importExport);
    businessComplianceForm.auditApplicable.checked = Boolean(complianceProfile.auditApplicable);
    businessComplianceForm.responsiblePerson.value = complianceProfile.responsiblePerson || "";
    businessComplianceForm.address.value = complianceProfile.address || "";
  }

  if (teamMembersList) {
    teamMembersList.innerHTML = dashboardTeamMembers.length
      ? dashboardTeamMembers.map((member) => `
        <div class="invoice-card">
          <div>
            <strong>${escapeHtml(member.name || member.email)}</strong>
            <div class="hint">${escapeHtml(member.email)} - ${escapeHtml(member.role || "viewer")} - ${escapeHtml(member.status || "invited")}</div>
            ${member.inviteDeliveryMessage ? `<div class="hint delivery-hint">${escapeHtml(member.inviteDeliveryMessage)}</div>` : ""}
            ${member.status === "active" ? `<div class="notice compact">Access is tied to this email address. No invite link is required.</div>` : ""}
          </div>
          ${member.status !== "removed" && workspaceCan("manageTeam") ? `<button class="ghost danger small" type="button" data-remove-team="${escapeHtml(member.id)}">Remove</button>` : `<span class="pill gold">${member.status === "removed" ? "Removed" : "View only"}</span>`}
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
          ${key.status === "active" && workspaceCan("apiAccess") ? `<button class="ghost danger small" type="button" data-revoke-key="${escapeHtml(key.id)}">Revoke</button>` : `<span class="pill gold">${key.status === "active" ? "View only" : "Revoked"}</span>`}
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
            ${request.notificationMessage ? `<div class="hint delivery-hint">${escapeHtml(request.notificationMessage)}</div>` : ""}
          </div>
          <div class="row-actions">
            ${workspaceCan("approvals") ? `
              <button class="ghost small" type="button" data-approval-decision="${escapeHtml(request.id)}" data-status="approved">Approve</button>
              <button class="ghost danger small" type="button" data-approval-decision="${escapeHtml(request.id)}" data-status="rejected">Reject</button>
            ` : `<span class="pill gold">View only</span>`}
          </div>
        </div>
      `).join("")
      : `<p>${enabled ? "No approval requests yet." : "Approval workflows unlock in Business."}</p>`;
  }

  if (businessAuditCount) {
    businessAuditCount.textContent = `${dashboardBusinessAuditEvents.length} ${dashboardBusinessAuditEvents.length === 1 ? "event" : "events"}`;
  }
  if (businessNotificationCount) {
    const critical = dashboardBusinessNotifications.filter((notification) => notification.severity === "red").length;
    const attention = dashboardBusinessNotifications.filter((notification) => notification.severity === "amber").length;
    businessNotificationCount.textContent = critical
      ? `${critical} critical`
      : attention
        ? `${attention} alert${attention === 1 ? "" : "s"}`
        : `${dashboardBusinessNotifications.length} note${dashboardBusinessNotifications.length === 1 ? "" : "s"}`;
    businessNotificationCount.className = `pill ${critical ? "red" : attention ? "gold" : "blue"}`;
  }
  if (businessNotificationList) {
    const severityLabel = { red: "Critical", amber: "Attention", green: "Healthy" };
    const severityTone = { red: "danger", amber: "attention", green: "ready" };
    businessNotificationList.innerHTML = dashboardBusinessNotifications.length
      ? dashboardBusinessNotifications.map((notification) => `
        <div class="invoice-card business-notification-card" data-severity="${escapeHtml(severityTone[notification.severity] || "ready")}">
          <div>
            <strong>${escapeHtml(notification.title)}</strong>
            <div class="hint">${escapeHtml(notification.message)}</div>
            <div class="hint">${escapeHtml(notification.category || "workspace")} - ${escapeHtml(notification.sourceType || "computed")}</div>
          </div>
          <div class="row-actions">
            <span class="pill ${notification.severity === "red" ? "red" : notification.severity === "amber" ? "gold" : "blue"}">${escapeHtml(severityLabel[notification.severity] || "Notice")}</span>
            ${notification.retryType && notification.retryTargetId ? `
              <button class="ghost small" type="button"
                data-notification-retry-type="${escapeHtml(notification.retryType)}"
                data-notification-retry-target="${escapeHtml(notification.retryTargetId)}">
                ${escapeHtml(notification.retryLabel || "Retry Email")}
              </button>
            ` : ""}
            <button class="ghost small" type="button" data-notification-target="${escapeHtml(notification.targetSection || "workspace-audit-trail")}">
              ${escapeHtml(notification.actionLabel || "Open")}
            </button>
          </div>
        </div>
      `).join("")
      : `<p>${enabled ? "No operational notifications yet." : "Notification Center unlocks in Business."}</p>`;
  }
  renderBusinessDeliveryHistory(enabled);
  if (businessAuditList) {
    businessAuditList.innerHTML = dashboardBusinessAuditEvents.length
      ? dashboardBusinessAuditEvents.map((event) => {
        const tone = auditOutcomeTone(event.outcome);
        const title = auditActionLabel(event.action);
        const meta = [
          event.category,
          event.message,
          event.actorName || event.actorEmail || "System",
          formatAiDate(event.createdAt),
        ].filter(Boolean).join(" - ");
        const metadata = event.metadata && Object.keys(event.metadata).length
          ? JSON.stringify(event.metadata, null, 2)
          : "";
        return `
          <div class="invoice-card audit-event-card">
            <div>
              <strong>${escapeHtml(title)}</strong>
              <div class="hint">${escapeHtml(meta)}</div>
              ${event.targetLabel ? `<div class="hint">${escapeHtml(event.targetType || "target")}: ${escapeHtml(event.targetLabel)}</div>` : ""}
              ${metadata ? `
                <details>
                  <summary>View event details</summary>
                  <pre>${escapeHtml(metadata)}</pre>
                </details>
              ` : ""}
            </div>
            <span class="pill ${tone}">${escapeHtml(event.outcome || "info")}</span>
          </div>
        `;
      }).join("")
      : `<p>${enabled ? "No audit events recorded yet." : "Audit trail unlocks in Business."}</p>`;
  }
  if (businessAuditFilterStatus) {
    businessAuditFilterStatus.textContent = `${auditFilterSummary()} ${dashboardBusinessAuditEvents.length} event${dashboardBusinessAuditEvents.length === 1 ? "" : "s"} shown.`;
  }

  document.querySelectorAll("[data-remove-team]").forEach((button) => {
    button.addEventListener("click", async () => {
      try {
        const member = await apiClient.updateTeamMember(token, button.getAttribute("data-remove-team"), {
          status: "removed",
          ...selectedWorkspaceOptions(),
        });
        dashboardTeamMembers = dashboardTeamMembers.map((item) => (item.id === member.id ? member : item));
        await refreshBusinessAuditEventsAndRender();
      } catch (error) {
        if (businessWorkspaceNotice) businessWorkspaceNotice.textContent = error.message || "Could not update team member.";
      }
    });
  });

  document.querySelectorAll("[data-revoke-key]").forEach((button) => {
    button.addEventListener("click", async () => {
      try {
        const key = await apiClient.revokeApiKey(token, button.getAttribute("data-revoke-key"), selectedWorkspaceOptions());
        dashboardApiKeys = dashboardApiKeys.map((item) => (item.id === key.id ? key : item));
        await refreshBusinessAuditEventsAndRender();
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
          ...selectedWorkspaceOptions(),
        });
        dashboardApprovalRequests = dashboardApprovalRequests.map((item) => (item.id === request.id ? request : item));
        await refreshBusinessAuditEventsAndRender();
        setInlineStatus(
          approvalRequestStatus,
          request.notificationMessage || `Approval request ${request.status}.`,
          request.notificationStatus === "failed" ? "error" : "success",
        );
      } catch (error) {
        if (businessWorkspaceNotice) businessWorkspaceNotice.textContent = error.message || "Could not update approval request.";
        setInlineStatus(approvalRequestStatus, error.message || "Could not update approval request.", "error");
      }
    });
  });

  document.querySelectorAll("[data-notification-target]").forEach((button) => {
    button.addEventListener("click", () => {
      openWorkspaceGroup(button.getAttribute("data-notification-target"), true);
    });
  });
  document.querySelectorAll("[data-notification-retry-type]").forEach((button) => {
    button.addEventListener("click", async () => {
      const retryType = button.getAttribute("data-notification-retry-type");
      const targetId = button.getAttribute("data-notification-retry-target");
      const previousText = button.textContent;
      button.disabled = true;
      button.textContent = "Sending...";
      try {
        const result = await apiClient.retryBusinessNotification(token, {
          ...selectedWorkspaceOptions(),
          type: retryType,
          targetId,
        });
        if (businessWorkspaceNotice) {
          businessWorkspaceNotice.textContent = result.deliveryMessage || "Notification delivery updated.";
        }
        showToast(result.deliveryMessage || "Notification delivery updated.", result.deliveryStatus === "sent" ? "success" : "error");
        await loadBusinessWorkspace();
      } catch (error) {
        if (businessWorkspaceNotice) businessWorkspaceNotice.textContent = error.message || "Could not retry notification delivery.";
        showToast(error.message || "Could not retry notification delivery.", "error");
      } finally {
        button.disabled = false;
        button.textContent = previousText;
      }
    });
  });
}

async function loadBusinessWorkspace() {
  dashboardBusinessWorkspaces = await apiClient.listBusinessWorkspaces(token).catch(() => []);
  if (dashboardBusinessWorkspaces.length) {
    const stillAvailable = dashboardBusinessWorkspaces.some((workspace) => workspace.ownerUserId === selectedBusinessWorkspaceOwnerId);
    if (!selectedBusinessWorkspaceOwnerId || !stillAvailable) {
      const teamWorkspace = dashboardBusinessWorkspaces.find((workspace) => workspace.source === "team");
      selectedBusinessWorkspaceOwnerId = (teamWorkspace || dashboardBusinessWorkspaces[0]).ownerUserId;
      window.localStorage?.setItem("eazinvoice_business_workspace_owner", selectedBusinessWorkspaceOwnerId);
    }
  }
  if (!canOpenBusinessWorkspace()) {
    dashboardTeamMembers = [];
    dashboardApprovalRequests = [];
    dashboardApiKeys = [];
    dashboardBusinessSettings = { emailSettings: {}, paymentSettings: {}, complianceProfile: {} };
    dashboardBusinessCompliance = null;
    dashboardBusinessAuditEvents = [];
    dashboardBusinessNotifications = [];
    dashboardBusinessDeliveryEvents = [];
    renderBusinessWorkspace();
    return;
  }
  const workspaceOptions = selectedWorkspaceOptions();
  const { action, ...deliveryQueryOptions } = deliveryFilterOptions();
  const [members, approvals, apiKeys, settings, compliance, accountingGst, auditEvents, notifications, deliveryEvents] = await Promise.all([
    apiClient.listTeamMembers(token, workspaceOptions).catch(() => []),
    apiClient.listApprovalRequests(token, workspaceOptions).catch(() => []),
    apiClient.listApiKeys(token, workspaceOptions).catch(() => []),
    apiClient.getBusinessSettings(token, workspaceOptions).catch(() => ({ emailSettings: {}, paymentSettings: {}, complianceProfile: {} })),
    apiClient.getBusinessComplianceDashboard(token, workspaceOptions).catch(() => null),
    apiClient.getGstComplianceSummary(token, workspaceOptions).catch(() => null),
    apiClient.listBusinessAuditEvents(token, { ...workspaceOptions, ...auditFilterOptions(), limit: 75 }).catch(() => []),
    apiClient.listBusinessNotifications(token, workspaceOptions).catch(() => []),
    apiClient.listBusinessAuditEvents(token, { ...workspaceOptions, ...deliveryQueryOptions, limit: 50 }).catch(() => []),
  ]);
  dashboardTeamMembers = members;
  dashboardApprovalRequests = approvals;
  dashboardApiKeys = apiKeys;
  dashboardBusinessSettings = settings;
  dashboardBusinessCompliance = compliance && accountingGst?.enabled
    ? { ...compliance, accountingGst }
    : compliance;
  dashboardBusinessAuditEvents = auditEvents;
  dashboardBusinessNotifications = notifications;
  dashboardBusinessDeliveryEvents = deliveryEvents;
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
  if (!workspaceCanWriteRecords()) {
    const message = workspaceWriteLockMessage("run AI commands that create drafts or update records");
    appendAiChatMessage("assistant", message);
    setAiAssistantStatus(message, "error");
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
    applyAiQuotaResult(result.quota);
    renderAiAssistantAccess();
    await loadAiUsage();
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
    aiCommandRun.disabled = !canUseAiAssistant() || aiQuotaExceeded() || !workspaceCanWriteRecords();
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

businessAuditFilterForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (businessAuditFilterStatus) businessAuditFilterStatus.textContent = "Applying audit filters...";
  await refreshBusinessAuditEventsAndRender();
});

businessAuditClearFilters?.addEventListener("click", async () => {
  businessAuditFilterForm?.reset();
  if (businessAuditFilterStatus) businessAuditFilterStatus.textContent = "Clearing audit filters...";
  await refreshBusinessAuditEventsAndRender();
});

businessDeliveryFilterForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (businessDeliveryFilterStatus) businessDeliveryFilterStatus.textContent = "Applying delivery filters...";
  await refreshBusinessDeliveryEventsAndRender();
});

businessDeliveryClearFilters?.addEventListener("click", async () => {
  businessDeliveryFilterForm?.reset();
  if (businessDeliveryFilterStatus) businessDeliveryFilterStatus.textContent = "Clearing delivery filters...";
  await refreshBusinessDeliveryEventsAndRender();
});

teamInviteForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  setInlineStatus(teamInviteStatus, "Creating sub-user access...", "");
  const formData = new FormData(teamInviteForm);
  try {
    const member = await apiClient.createTeamMember(token, {
      name: formData.get("name"),
      email: formData.get("email"),
      role: formData.get("role"),
      ...selectedWorkspaceOptions(),
    });
    dashboardTeamMembers = [member, ...dashboardTeamMembers.filter((item) => item.id !== member.id)];
    teamInviteForm.reset();
    const deliveryStatus = member.inviteDeliveryStatus || "queued";
    const deliveryMessage = member.inviteDeliveryMessage || "Sub-user access saved. The user can log in with the same verified email address.";
    setInlineStatus(
      teamInviteStatus,
      deliveryMessage,
      deliveryStatus === "failed" ? "error" : "success",
    );
    await refreshBusinessAuditEventsAndRender();
  } catch (error) {
    if (businessWorkspaceNotice) businessWorkspaceNotice.textContent = error.message || "Could not create sub-user access.";
    setInlineStatus(teamInviteStatus, error.message || "Could not create sub-user access.", "error");
  }
});

businessEmailSettingsForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  setInlineStatus(businessEmailStatus, "Saving email settings...", "");
  const formData = new FormData(businessEmailSettingsForm);
  try {
    dashboardBusinessSettings = await apiClient.updateBusinessSettings(token, {
      ...selectedWorkspaceOptions(),
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
    dashboardBusinessCompliance = await apiClient.getBusinessComplianceDashboard(token, selectedWorkspaceOptions()).catch(() => dashboardBusinessCompliance);
    await refreshBusinessAuditEventsAndRender();
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
      ...selectedWorkspaceOptions(),
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
    dashboardBusinessCompliance = await apiClient.getBusinessComplianceDashboard(token, selectedWorkspaceOptions()).catch(() => dashboardBusinessCompliance);
    await refreshBusinessAuditEventsAndRender();
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
      ...selectedWorkspaceOptions(),
      paymentSettings: {
        keyId: formData.get("keyId"),
        keySecret: formData.get("keySecret"),
        webhookSecret: formData.get("webhookSecret"),
        paymentLinkEnabled: formData.get("paymentLinkEnabled") === "on",
      },
    });
    if (businessWorkspaceNotice) businessWorkspaceNotice.textContent = "Business Razorpay settings saved. Secrets are hidden after saving.";
    setInlineStatus(businessPaymentStatus, "Business Razorpay settings saved. Secrets are hidden after saving.", "success");
    dashboardBusinessCompliance = await apiClient.getBusinessComplianceDashboard(token, selectedWorkspaceOptions()).catch(() => dashboardBusinessCompliance);
    await refreshBusinessAuditEventsAndRender();
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
      ...selectedWorkspaceOptions(),
      complianceProfile: {
        legalName: formData.get("legalName"),
        entityType: formData.get("entityType"),
        businessCategory: formData.get("businessCategory"),
        pan: formData.get("pan"),
        tan: formData.get("tan"),
        gstin: formData.get("gstin"),
        state: formData.get("state"),
        placeOfBusiness: formData.get("placeOfBusiness"),
        invoicePrefix: formData.get("invoicePrefix"),
        annualTurnover: formData.get("annualTurnover"),
        employeeCount: formData.get("employeeCount"),
        fiscalYearStartMonth: formData.get("fiscalYearStartMonth"),
        gstRegistered: formData.get("gstRegistered") === "on",
        tanAvailable: formData.get("tanAvailable") === "on",
        importExport: formData.get("importExport") === "on",
        auditApplicable: formData.get("auditApplicable") === "on",
        responsiblePerson: formData.get("responsiblePerson"),
        address: formData.get("address"),
      },
    });
    if (businessWorkspaceNotice) businessWorkspaceNotice.textContent = "Compliance profile saved for reports, audit trails, and future GST exports.";
    setInlineStatus(businessComplianceStatus, "Compliance profile saved for reports, audit trails, and future GST exports.", "success");
    dashboardBusinessCompliance = await apiClient.getBusinessComplianceDashboard(token, selectedWorkspaceOptions()).catch(() => dashboardBusinessCompliance);
    await refreshBusinessAuditEventsAndRender();
  } catch (error) {
    if (businessWorkspaceNotice) businessWorkspaceNotice.textContent = error.message || "Could not save compliance profile.";
    setInlineStatus(businessComplianceStatus, error.message || "Could not save compliance profile.", "error");
  }
});

complianceExportCsv?.addEventListener("click", () => {
  downloadComplianceCsv();
});

compliancePrintReport?.addEventListener("click", () => {
  printComplianceReport();
});

complianceReadinessList?.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-compliance-reminder-id]");
  if (!button) return;
  const taskId = button.getAttribute("data-compliance-reminder-id");
  button.disabled = true;
  setInlineStatus(businessComplianceStatus, "Sending compliance reminder...", "");
  try {
    const result = await apiClient.sendComplianceReminder(token, taskId, selectedWorkspaceOptions());
    dashboardBusinessCompliance = await apiClient.getBusinessComplianceDashboard(token, selectedWorkspaceOptions()).catch(() => dashboardBusinessCompliance);
    await refreshBusinessAuditEventsAndRender();
    setInlineStatus(businessComplianceStatus, result.deliveryMessage || "Compliance reminder sent and logged on the task.", "success");
  } catch (error) {
    setInlineStatus(businessComplianceStatus, error.message || "Could not send compliance reminder.", "error");
  } finally {
    button.disabled = false;
  }
});

complianceReadinessList?.addEventListener("submit", async (event) => {
  const form = event.target.closest("[data-compliance-task-id]");
  if (!form) return;
  event.preventDefault();
  const taskId = form.getAttribute("data-compliance-task-id");
  const formData = new FormData(form);
  setInlineStatus(businessComplianceStatus, "Saving compliance task...", "");
  try {
    await apiClient.updateComplianceTask(token, taskId, {
      ...selectedWorkspaceOptions(),
      status: formData.get("status"),
      reminderDaysBefore: formData.get("reminderDaysBefore"),
      dueDate: formData.get("dueDate"),
      reminderEnabled: formData.get("reminderEnabled") === "on",
      responsiblePerson: formData.get("responsiblePerson"),
      notes: formData.get("notes"),
    });
    dashboardBusinessCompliance = await apiClient.getBusinessComplianceDashboard(token, selectedWorkspaceOptions()).catch(() => dashboardBusinessCompliance);
    await refreshBusinessAuditEventsAndRender();
    setInlineStatus(businessComplianceStatus, "Compliance task saved. The dashboard now remembers this status and reminder.", "success");
  } catch (error) {
    setInlineStatus(businessComplianceStatus, error.message || "Could not save compliance task.", "error");
  }
});

apiKeyForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  setInlineStatus(apiKeyStatus, "Generating API key...", "");
  const formData = new FormData(apiKeyForm);
  try {
    const key = await apiClient.createApiKey(token, { label: formData.get("label"), ...selectedWorkspaceOptions() });
    dashboardApiKeys = [key, ...dashboardApiKeys];
    apiKeyForm.reset();
    setInlineStatus(apiKeyStatus, "API key generated. Copy the secret now; it will be hidden after refresh.", "success");
    await refreshBusinessAuditEventsAndRender();
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
      ...selectedWorkspaceOptions(),
      documentType: formData.get("documentType"),
      documentNumber: formData.get("documentNumber"),
      notes: formData.get("notes"),
    });
    dashboardApprovalRequests = [request, ...dashboardApprovalRequests];
    approvalRequestForm.reset();
    setInlineStatus(
      approvalRequestStatus,
      request.notificationMessage || "Approval request created.",
      request.notificationStatus === "failed" ? "error" : "success",
    );
    await refreshBusinessAuditEventsAndRender();
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
  if (!workspaceCanWriteRecords()) {
    setWorkspaceLockStatus("record payments");
    return;
  }
  const paymentContext = paymentForm.dataset.context || "invoice";
  const recordId = paymentInvoiceId?.value || "";
  const amount = Number(paymentAmountInput?.value || 0);
  const currentRecord = paymentContext === "purchaseOrder"
    ? dashboardPurchaseOrders.find((purchaseOrder) => purchaseOrder.id === recordId)
    : dashboardInvoices.find((invoice) => invoice.id === recordId);
  const balance = Number(currentRecord?.balanceAmount ?? currentRecord?.total ?? 0);
  if (!recordId || !Number.isFinite(amount) || amount <= 0) {
    setPaymentModalStatus("Enter a valid payment amount.", "error");
    return;
  }
  if (balance > 0 && amount > balance + 0.01) {
    setPaymentModalStatus(`Payment cannot be more than the pending balance of ${currentRecord?.currency || "INR"} ${money(balance)}.`, "error");
    return;
  }
  try {
    setPaymentModalStatus("Adding payment...", "");
    const result = paymentContext === "purchaseOrder"
      ? await apiClient.recordPurchaseOrderPayment(token, recordId, {
        ...selectedWorkspaceOptions(),
        amount,
        mode: paymentModeInput?.value || "manual",
        reference: paymentReferenceInput?.value || "",
        notes: paymentNotesInput?.value || "",
        paymentDate: paymentDateInput?.value || new Date().toISOString().slice(0, 10),
      })
      : await apiClient.recordInvoicePayment(token, recordId, {
        ...selectedWorkspaceOptions(),
        amount,
        mode: paymentModeInput?.value || "manual",
        reference: paymentReferenceInput?.value || "",
        notes: paymentNotesInput?.value || "",
        paymentDate: paymentDateInput?.value || new Date().toISOString().slice(0, 10),
      });
    const updatedRecord = paymentContext === "purchaseOrder" ? result.purchaseOrder || result : result.invoice || result;
    if (paymentContext === "purchaseOrder") replacePurchaseOrder(updatedRecord);
    else replaceInvoice(updatedRecord);
    if (result.payment) {
      const existingPaymentIndex = dashboardPayments.findIndex((payment) => payment.id === result.payment.id);
      if (existingPaymentIndex >= 0) dashboardPayments[existingPaymentIndex] = result.payment;
      else dashboardPayments.push(result.payment);
    }
    rerenderDashboardData();
    renderPaymentModalDetails(updatedRecord, paymentContext);
    const updatedBalance = Number(updatedRecord.balanceAmount ?? 0);
    if (updatedBalance > 0) {
      paymentAmountInput.value = String(updatedBalance);
      paymentAmountInput.max = String(updatedBalance);
      if (paymentReferenceInput) paymentReferenceInput.value = "";
      if (paymentNotesInput) paymentNotesInput.value = "";
      setPaymentModalStatus(`Payment added. Pending balance is ${updatedRecord.currency || "INR"} ${money(updatedBalance)}. Add another payment when ready.`, "success");
      paymentAmountInput.focus();
    } else {
      setPaymentModalStatus(paymentContext === "purchaseOrder" ? "Payment added. PO/WO is now PAID and reports are refreshed." : "Payment added. Invoice is now PAID and reports are refreshed.", "success");
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
  if (!workspaceCanWriteRecords()) {
    setRecurringDraftStatus(workspaceWriteLockMessage("generate recurring invoice drafts"), "error");
    return;
  }
  runRecurringDraftsBtn.disabled = true;
  setRecurringDraftStatus("Checking due recurring invoices...", "");
  try {
    const result = await apiClient.runRecurringInvoiceDrafts(token, {
      ...selectedWorkspaceOptions(),
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
    runRecurringDraftsBtn.disabled = !activePlanAllows("recurringInvoices") || !workspaceCanWriteRecords();
  }
});

[reportMonth, reportYear].forEach((filter) => {
  filter?.addEventListener("change", async () => {
    await refreshDashboardReportSummary();
    renderDashboardMetrics(dashboardInvoices);
    renderInvoiceWorkspace(dashboardInvoices);
    renderPoWorkspace(dashboardPurchaseOrders);
  });
});

[detailReportPeriod, detailReportMonth, detailReportYear, detailFinancialYear, detailStartDate, detailEndDate, detailComplianceStatus, detailComplianceType].forEach((filter) => {
  filter?.addEventListener("change", async () => {
    syncDetailFilterVisibility();
    await refreshDetailReportSummary();
    if (currentDashboardPage().startsWith("report-")) renderReportDetail(currentDashboardPage().replace("report-", ""));
  });
});

reportExportCsv?.addEventListener("click", downloadCurrentReportCsv);
reportExportPrint?.addEventListener("click", printCurrentReport);

businessWorkspaceSwitcher?.addEventListener("change", async () => {
  selectedBusinessWorkspaceOwnerId = businessWorkspaceSwitcher.value || currentUser?.id || "";
  window.localStorage?.setItem("eazinvoice_business_workspace_owner", selectedBusinessWorkspaceOwnerId);
  window.location.reload();
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

workspaceSectionSelect?.addEventListener("change", () => {
  const targetId = workspaceSectionSelect.value;
  if (!targetId) return;
  if (window.location.hash !== "#business-workspace") {
    window.location.hash = "#business-workspace";
    window.setTimeout(() => openWorkspaceGroup(targetId, true), 40);
    return;
  }
  showDashboardPage("business-workspace");
  openWorkspaceGroup(targetId, true);
});

adminOperationsRefresh?.addEventListener("click", () => {
  loadAdminOperations();
});

workspaceGroups.forEach((group) => {
  group.addEventListener("toggle", () => {
    if (!group.open) return;
    workspaceGroups.forEach((otherGroup) => {
      if (otherGroup !== group) otherGroup.open = false;
    });
    syncWorkspaceSectionControls(group.id);
  });
});

vendorForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!workspaceCanWriteRecords()) {
    setInlineStatus(vendorFormStatus, workspaceWriteLockMessage("create vendors"), "error");
    return;
  }
  const formData = new FormData(vendorForm);
  const vendorName = String(formData.get("name") || "").trim();
  if (!vendorName) {
    setInlineStatus(vendorFormStatus, "Enter the vendor or supplier name before saving.", "error");
    return;
  }
  setInlineStatus(vendorFormStatus, "Saving vendor...", "");
  try {
    const vendor = await apiClient.createVendor(token, {
      ...selectedWorkspaceOptions(),
      vendorType: formData.get("vendorType"),
      name: vendorName,
      phone: formData.get("phone"),
      email: formData.get("email"),
      gstNumber: formData.get("gstNumber"),
      panNumber: formData.get("panNumber"),
      billingAddress: formData.get("billingAddress"),
    });
    dashboardVendors = [vendor, ...dashboardVendors.filter((item) => item.id !== vendor.id)];
    vendorForm.reset();
    renderVendors(dashboardVendors, dashboardPurchaseOrders);
    setInlineStatus(vendorFormStatus, `${vendor.vendorCode || "Vendor"} saved. You can edit, delete, or reactivate this record from the vendor list.`, "success");
  } catch (error) {
    setInlineStatus(vendorFormStatus, error.message || "Could not save vendor.", "error");
  }
});

window.addEventListener("hashchange", () => showDashboardPage());

refreshAccountingBtn?.addEventListener("click", () => {
  refreshAccountingSummary();
});

ledgerAccountForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!workspaceCanWriteRecords()) {
    setInlineStatus(ledgerAccountStatus, workspaceWriteLockMessage("create ledger accounts"), "error");
    return;
  }
  const formData = new FormData(ledgerAccountForm);
  setInlineStatus(ledgerAccountStatus, "Saving ledger account...", "");
  try {
    await apiClient.createLedgerAccount(token, {
      ...selectedWorkspaceOptions(),
      accountCode: formData.get("accountCode"),
      accountName: formData.get("accountName"),
      accountType: formData.get("accountType"),
      normalBalance: formData.get("normalBalance"),
    });
    ledgerAccountForm.reset();
    setInlineStatus(ledgerAccountStatus, "Ledger account saved.", "success");
    await refreshAccountingSummary();
  } catch (error) {
    setInlineStatus(ledgerAccountStatus, error.message || "Could not save ledger account.", "error");
  }
});

journalEntryForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!workspaceCanWriteRecords()) {
    setInlineStatus(journalEntryStatus, workspaceWriteLockMessage("post journal entries"), "error");
    return;
  }
  const formData = new FormData(journalEntryForm);
  const debitAccount = String(formData.get("debitAccount") || "");
  const creditAccount = String(formData.get("creditAccount") || "");
  const amount = Number(formData.get("amount") || 0);
  if (!debitAccount || !creditAccount || debitAccount === creditAccount) {
    setInlineStatus(journalEntryStatus, "Choose different debit and credit accounts.", "error");
    return;
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    setInlineStatus(journalEntryStatus, "Enter a valid journal amount.", "error");
    return;
  }
  setInlineStatus(journalEntryStatus, "Posting journal entry...", "");
  try {
    await apiClient.createJournalEntry(token, {
      ...selectedWorkspaceOptions(),
      journalDate: formData.get("journalDate"),
      currency: formData.get("currency"),
      narration: formData.get("narration"),
      lines: [
        { accountId: debitAccount, debit: amount, credit: 0, description: formData.get("narration") },
        { accountId: creditAccount, debit: 0, credit: amount, description: formData.get("narration") },
      ],
    });
    journalEntryForm.reset();
    setInlineStatus(journalEntryStatus, "Journal entry posted and books updated.", "success");
    await refreshAccountingSummary();
  } catch (error) {
    setInlineStatus(journalEntryStatus, error.message || "Could not post journal entry.", "error");
  }
});

trialBalanceList?.addEventListener("click", (event) => {
  const row = event.target.closest("[data-ledger-account-id]");
  const accountId = row?.getAttribute("data-ledger-account-id");
  if (accountId) loadLedgerDrilldown(accountId);
});

async function initializeDashboard() {
  try {
    const [summary, workspaces, subscriptions] = await Promise.all([
      apiClient.getPlan(token).catch(() => ({ plan: "free", usage: { companies: 0, customers: 0, invoicesPerMonth: 0 }, limits: { companies: 1, customers: 100, invoicesPerMonth: 10 } })),
      apiClient.listBusinessWorkspaces(token).catch(() => []),
      apiClient.listMySubscriptions(token).catch(() => []),
    ]);
    dashboardBusinessWorkspaces = Array.isArray(workspaces) ? workspaces : [];
    if (dashboardBusinessWorkspaces.length) {
      const stillAvailable = dashboardBusinessWorkspaces.some((workspace) => workspace.ownerUserId === selectedBusinessWorkspaceOwnerId);
      if (!selectedBusinessWorkspaceOwnerId || !stillAvailable) {
        const teamWorkspace = dashboardBusinessWorkspaces.find((workspace) => workspace.source === "team");
        selectedBusinessWorkspaceOwnerId = (teamWorkspace || dashboardBusinessWorkspaces[0]).ownerUserId;
        window.localStorage?.setItem("eazinvoice_business_workspace_owner", selectedBusinessWorkspaceOwnerId);
      }
    }
    const workspaceOptions = selectedWorkspaceOptions();
    const [companies, customers, vendors, reports, invoices, purchaseOrders, payments] = await Promise.all([
      apiClient.listCompanies(token, workspaceOptions).catch(() => []),
      apiClient.listCustomers(token, workspaceOptions).catch(() => []),
      apiClient.listVendors(token, workspaceOptions).catch(() => []),
      apiClient.listReports(token, workspaceOptions).catch(() => []),
      apiClient.listInvoices(token, workspaceOptions),
      apiClient.listPurchaseOrders(token, workspaceOptions).catch(() => []),
      apiClient.listPayments(token, workspaceOptions).catch(() => []),
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
  dashboardVendors = vendors;
  dashboardPurchaseOrders = purchaseOrders;
  dashboardPayments = payments;
  populateReportFilters(dashboardInvoices, dashboardPurchaseOrders);
  await refreshDashboardReportSummary();
  await refreshAccountingSummary();
  const activeOrg = companies[0] || null;
  renderDashboardMetrics(dashboardInvoices);
  renderInvoiceWorkspace(dashboardInvoices);
  renderPoWorkspace(dashboardPurchaseOrders);
  renderRecentActivity(dashboardInvoices, dashboardCompanies);
  renderBusinessProfiles(dashboardCompanies);
  renderCustomers(dashboardCustomers);
  renderVendors(dashboardVendors, dashboardPurchaseOrders);
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
    loadAiUsage().catch(() => {});
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
