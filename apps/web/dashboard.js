import { apiClient, clearToken, money, requireSession } from "./common.js?v=20260601-session";

const sessionContext = await requireSession();
const token = sessionContext?.token;
const currentUser = sessionContext?.session?.user;
if (!token) throw new Error("Authentication required");
document.getElementById("appShell")?.removeAttribute("hidden");

const planSummary = document.getElementById("planSummary");
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

const planCatalog = [
  { id: "free", label: "Free", amount: 0, billingCycle: "monthly", description: "Basic invoice creation and tracking", features: ["1 company", "limited invoices", "basic reports", "dashboard access", "free WordPress CTA plugin"] },
  { id: "standard", label: "Standard", amount: 499, billingCycle: "monthly", description: "For growing small businesses", features: ["more invoices", "better reports", "company branding", "WordPress Pro for 1 website"] },
  { id: "pro", label: "Pro", amount: 999, billingCycle: "monthly", description: "For teams and frequent billing", features: ["higher limits", "more reports", "multi-user ready", "WordPress Pro for up to 3 websites"] },
];

let currentSubscription = { plan: "free", amount: 0, status: "active" };
let dashboardInvoices = [];
let dashboardCompanies = [];
let dashboardPurchaseOrders = [];
let dashboardCustomers = [];
let dashboardPayments = [];
let razorpayCheckoutPromise = null;

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
  document.title = page === "reports" ? "Eazinvoice Reports" : `Eazinvoice ${page.replace(/-/g, " ")}`;
  if (page.startsWith("report-")) {
    syncDetailFilterVisibility();
    renderReportDetail(page.replace("report-", ""));
  }
  if (page === "reports") renderMainReportCharts();
}

function isPaidSubscription(subscription) {
  return String(subscription?.plan || "free").toLowerCase() !== "free" || Number(subscription?.amount || 0) > 0;
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
  subscriptionArea.innerHTML = planCatalog.map((plan) => `
    <div class="plan-tile ${plan.id === currentPlan ? "selected" : ""}">
      <div class="panel-head">
        <div>
          <strong>${plan.label}</strong>
          <div class="hint">${plan.description}</div>
        </div>
        <span class="pill ${plan.id === "free" ? "gold" : plan.id === "standard" ? "blue" : "maroon"}">INR ${money(plan.amount)}</span>
      </div>
      <ul class="feature-list">
        ${plan.features.map((feature) => `<li>${feature}</li>`).join("")}
      </ul>
      <button type="button" class="primary plan-switch" data-plan="${plan.id}" data-amount="${plan.amount}">${plan.id === currentPlan ? "Current Plan" : `Switch to ${plan.label}`}</button>
    </div>
  `).join("");

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
            billingCycle: "monthly",
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

  if (reportDetailMetrics) reportDetailMetrics.innerHTML = [
    metricCard("Available Now", "Basic"),
    metricCard("Paid Reports", "GST, aging, balance sheet"),
    metricCard("Current Revenue", `INR ${money(invoiceTotal)}`),
    metricCard("Current Expenses", `INR ${money(expenseTotal)}`),
  ].join("");
  renderReportTable(["Report", "Status", "Notes"], [
    ["Balance Sheet", "Paid tier", "Assets, liabilities and capital summary"],
    ["GST Report", "Paid tier", "GST output/input summaries and tax period views"],
    ["Customer Aging", "Paid tier", "Outstanding by customer and age bucket"],
    ["Growth Graphs", "Paid tier", "Revenue, expenses and profit trend analytics"],
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
          ${!isDraft && balance > 0 ? `<button class="ghost small" type="button" data-payment-link="${escapeHtml(invoiceId)}">${isPaidSubscription(currentSubscription) ? "Collect Online" : "Gateway Paid Tier"}</button>` : ""}
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

async function loadSubscriptionPanel(existingSubscriptions) {
  const subscriptions = existingSubscriptions || await apiClient.listMySubscriptions(token);
  const current = subscriptions[subscriptions.length - 1] || { plan: "free", amount: 0 };
  currentSubscription = current;
  if (currentPlanBadge) currentPlanBadge.textContent = `Current: ${current.plan || "free"} · INR ${money(current.amount || 0)}`;
  if (subscriptionHistory) {
    subscriptionHistory.innerHTML = subscriptions.length
      ? subscriptions.slice().reverse().map((subscription) => `
        <div class="invoice-card">
          <div>
            <strong>${escapeHtml(subscription.plan || "Subscription")}</strong>
            <div class="hint">${escapeHtml(subscription.billingCycle || "monthly")} - INR ${money(subscription.amount || 0)} - ${escapeHtml(subscription.status || "active")}</div>
          </div>
          <span class="pill blue">${escapeHtml(subscription.subscriberType || "user")}</span>
        </div>
      `).join("")
      : "<p>No subscription history yet.</p>";
  }
  renderPlanCards(current.plan || "free");
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
      Invoices: ${summary.usage.invoicesPerMonth}/${summary.limits.invoicesPerMonth}
    `;
  }

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
initializeDashboard();
