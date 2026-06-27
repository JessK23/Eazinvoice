import { apiClient, money, mountAdminPlanPreview, requireSession } from "./common.js?v=20260601-session";

const sessionContext = await requireSession("/apps/web/auth.html");
const token = sessionContext?.token;
if (!token) throw new Error("Authentication required");
if (!sessionContext.session.admin?.authorized) {
  window.location.replace("/apps/web/access.html");
  throw new Error("Configured admin required");
}
mountAdminPlanPreview(sessionContext);
document.getElementById("protectedContent")?.removeAttribute("hidden");

const adminTotal = document.getElementById("adminTotal");
const adminCount = document.getElementById("adminCount");
const adminCompany = document.getElementById("adminCompany");
const adminIndividual = document.getElementById("adminIndividual");
const adminGroup = document.getElementById("adminGroup");
const adminSubscriptions = document.getElementById("adminSubscriptions");
const billingOrderAudit = document.getElementById("billingOrderAudit");
const gatewayManagement = document.getElementById("gatewayManagement");
const recurringSchedulerPanel = document.getElementById("recurringSchedulerPanel");
const adminUsers = document.getElementById("adminUsers");
const kycReviewQueue = document.getElementById("kycReviewQueue");
const persistenceStatus = document.getElementById("persistenceStatus");

function badge(text, tone = "blue") {
  return `<span class="pill ${tone}">${escapeHtml(text)}</span>`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function statusTone(status) {
  const normalized = String(status || "").toLowerCase();
  if (["active", "paid", "verified", "consumed"].includes(normalized)) return "blue";
  if (["failed", "rejected", "cancelled"].includes(normalized)) return "maroon";
  return "gold";
}

function renderBillingOrderAudit(orders) {
  if (!billingOrderAudit) return;
  billingOrderAudit.innerHTML = orders.length
    ? orders.slice().reverse().map((order) => {
      const amount = Number(order.amount || 0);
      const gatewayOrder = order.gatewayOrderId || "Not created";
      const gatewayPayment = order.gatewayPaymentId || "Not verified";
      const target = order.kind === "invoice"
        ? `Invoice ${order.invoiceId || ""}`.trim()
        : `Plan ${order.plan || ""}`.trim();
      return `
        <div class="invoice-card">
          <div>
            <strong>${escapeHtml(order.kind || "billing")} - ${escapeHtml(target || "Record")}</strong>
            <div class="hint">User ${escapeHtml(order.userId || "unknown")} - ${escapeHtml(order.currency || "INR")} ${money(amount)} - ${escapeHtml(order.status || "created")}</div>
            <div class="hint">Order: <code>${escapeHtml(gatewayOrder)}</code></div>
            <div class="hint">Payment: <code>${escapeHtml(gatewayPayment)}</code></div>
            <div class="hint">Created ${escapeHtml(order.createdAt || "-")} ${order.verifiedAt ? `- Verified ${escapeHtml(order.verifiedAt)}` : ""} ${order.consumedAt ? `- Consumed ${escapeHtml(order.consumedAt)}` : ""}</div>
          </div>
          <span class="pill ${statusTone(order.status)}">${escapeHtml(String(order.status || "created").toUpperCase())}</span>
        </div>
      `;
    }).join("")
    : "<p>No Razorpay billing orders yet.</p>";
}

function renderUserControls(users) {
  if (!adminUsers) return;
  adminUsers.innerHTML = users.length
    ? users.map((user) => `
      <div class="invoice-card">
        <div>
          <strong>${escapeHtml(user.name || user.email || "User")}</strong>
          <div class="hint">${escapeHtml(user.email || "")} - ${escapeHtml(user.role || "user")} - ${escapeHtml(user.accountStatus || "active")}</div>
          <div class="badge-row">
            ${badge((user.role || "user").toUpperCase(), user.role === "admin" ? "maroon" : "blue")}
            ${badge((user.accountStatus || "active").toUpperCase(), user.accountStatus === "restricted" ? "gold" : "blue")}
            ${(user.permissions || []).map((perm) => badge(perm.replace(/-/g, " ").toUpperCase(), "gold")).join("") || badge("NO PERMISSIONS", "blue")}
          </div>
          <div class="hint">${user.restrictedReason ? `Reason: ${escapeHtml(user.restrictedReason)}` : "No restriction reason"}</div>
        </div>
        <div class="actions">
          <button class="ghost small" data-action="restrict" data-user="${escapeHtml(user.id)}">Restrict</button>
          <button class="ghost small" data-action="restore" data-user="${escapeHtml(user.id)}">Restore</button>
          <button class="ghost small" data-action="kyc-review" data-user="${escapeHtml(user.id)}">Grant KYC Review</button>
        </div>
      </div>
    `).join("")
    : "<p>No users yet.</p>";

  adminUsers.querySelectorAll("button[data-user]").forEach((button) => {
    button.addEventListener("click", async () => {
      const userId = button.getAttribute("data-user");
      const action = button.getAttribute("data-action");
      if (action === "kyc-review") {
        await apiClient.setAdminUserPermissions(token, userId, ["kyc-review"]);
      } else {
        const reason = action === "restrict" ? prompt("Restriction reason", "Suspicious activity review") || "Suspicious activity review" : "";
        await apiClient.setAdminUserRestriction(token, userId, action, reason);
      }
      const refreshed = await apiClient.listAdminUsers(token);
      renderUserControls(refreshed.users);
    });
  });
}

function renderKycQueue(companies) {
  if (!kycReviewQueue) return;
  kycReviewQueue.innerHTML = companies.length
    ? companies.map((company) => `
      <div class="invoice-card">
        <div>
          <strong>${escapeHtml(company.name || "Company")}</strong>
          <div class="hint">${escapeHtml(company.entityType || "company")} - KYC ${escapeHtml(company.kycStatus || "pending")} - Review ${escapeHtml(company.reviewStatus || "pending")}</div>
          <div class="badge-row">
            ${badge((company.kycStatus || "pending").toUpperCase(), company.kycStatus === "verified" ? "blue" : "gold")}
            ${badge((company.reviewStatus || "pending").toUpperCase(), company.reviewStatus === "approved" ? "blue" : company.reviewStatus === "rejected" ? "maroon" : "gold")}
          </div>
          <div class="hint">Docs: ${escapeHtml((company.documentNames || []).join(", ") || "none")}</div>
          <div class="hint">Stored: ${escapeHtml((company.documentFiles || []).map((file) => file.filePath).join(", ") || "none")}</div>
        </div>
        <div class="actions">
          <button class="ghost small" data-action="approve" data-company="${escapeHtml(company.id)}">Approve</button>
          <button class="ghost small" data-action="reject" data-company="${escapeHtml(company.id)}">Reject</button>
        </div>
      </div>
    `).join("")
    : "<p>No KYC items waiting for review.</p>";

  kycReviewQueue.querySelectorAll("button[data-company]").forEach((button) => {
    button.addEventListener("click", async () => {
      const companyId = button.getAttribute("data-company");
      const action = button.getAttribute("data-action");
      const reason = action === "reject" ? prompt("Reject reason", "KYC documents need review") || "KYC documents need review" : "Approved by admin";
      await apiClient.reviewKyc(token, companyId, action, reason);
      const refreshed = await apiClient.getAdminKycReview(token);
      renderKycQueue(refreshed.companies || []);
    });
  });
}

function renderGatewayManagement(payload) {
  if (!gatewayManagement) return;
  const gateway = payload?.razorpay || {};
  const configured = Boolean(gateway.enabled);
  const envList = (gateway.requiredEnvironmentVariables || []).map((name) => `<code>${escapeHtml(name)}</code>`).join(", ");
  gatewayManagement.innerHTML = `
    <div class="invoice-card gateway-card">
      <div>
        <div class="panel-head compact">
          <div>
            <strong>Razorpay Payment Gateway</strong>
            <div class="hint">Only admin logins such as info@eazinvoice.com can view this gateway console.</div>
          </div>
          ${badge(configured ? `${String(gateway.mode || "live").toUpperCase()} MODE` : "NOT CONFIGURED", configured ? "blue" : "gold")}
        </div>
        <div class="metric-grid gateway-metrics">
          <article class="metric-card"><span>Gateway</span><strong>Razorpay</strong></article>
          <article class="metric-card"><span>Key ID</span><strong>${escapeHtml(gateway.keyIdMasked || "Missing")}</strong></article>
          <article class="metric-card"><span>Secret Key</span><strong>${gateway.keySecretConfigured ? "Configured" : "Missing"}</strong></article>
          <article class="metric-card"><span>Webhook Secret</span><strong>${gateway.webhookSecretConfigured ? "Configured" : "Missing"}</strong></article>
        </div>
        <div class="notice compact">
          <strong>Webhook URL</strong>
          <div><code>${escapeHtml(gateway.webhookUrl || "/webhooks/razorpay")}</code></div>
        </div>
        <div class="hint">Render environment variables required: ${envList}</div>
        <div class="badge-row">
          ${(gateway.supportedFlows || []).map((flow) => badge(flow, "blue")).join("")}
        </div>
      </div>
      <div class="actions">
        <a class="ghost small" href="/apps/web/dashboard.html#subscription">Test Plan Checkout</a>
        <a class="ghost small" href="/apps/web/dashboard.html#invoices">Test Invoice Collection</a>
      </div>
    </div>
  `;
}

function renderPersistenceStatus(payload) {
  if (!persistenceStatus) return;
  const persistence = payload?.persistence || {};
  const records = payload?.records || {};
  persistenceStatus.innerHTML = `
    <div class="invoice-card gateway-card">
      <div>
        <div class="panel-head compact">
          <div>
            <strong>Persistence and Release Safety</strong>
            <div class="hint">Use this before pushing live updates so registered users and billing records are not lost.</div>
          </div>
          ${badge(String(persistence.mode || "unknown").toUpperCase(), "gold")}
        </div>
        <div class="metric-grid gateway-metrics">
          <article class="metric-card"><span>Users</span><strong>${escapeHtml(records.users ?? 0)}</strong></article>
          <article class="metric-card"><span>Invoices</span><strong>${escapeHtml(records.invoices ?? 0)}</strong></article>
          <article class="metric-card"><span>Subscriptions</span><strong>${escapeHtml(records.subscriptions ?? 0)}</strong></article>
          <article class="metric-card"><span>Payments</span><strong>${escapeHtml(records.payments ?? 0)}</strong></article>
        </div>
        <div class="notice compact">
          <strong>Data file</strong>
          <div><code>${escapeHtml(persistence.dataFile || "Not available")}</code></div>
        </div>
        <div class="hint">${escapeHtml(payload?.warning || "")}</div>
      </div>
    </div>
  `;
}

function renderRecurringScheduler(payload) {
  if (!recurringSchedulerPanel) return;
  recurringSchedulerPanel.innerHTML = `
    <div class="invoice-card gateway-card">
      <div>
        <div class="panel-head compact">
          <div>
            <strong>Recurring Invoice Auto-Drafts</strong>
            <div class="hint">Creates due invoice drafts for Standard, Pro, and Business users without changing subscriptions or user records.</div>
          </div>
          ${badge(payload?.enabled ? "AUTO ENABLED" : "MANUAL MODE", payload?.enabled ? "blue" : "gold")}
        </div>
        <div class="metric-grid gateway-metrics">
          <article class="metric-card"><span>Interval</span><strong>${escapeHtml(payload?.intervalHours ?? 24)} hours</strong></article>
          <article class="metric-card"><span>Max per Template</span><strong>${escapeHtml(payload?.maxPerTemplate ?? 12)}</strong></article>
          <article class="metric-card"><span>Date Rule</span><strong>${escapeHtml(payload?.timezone || "UTC date-only")}</strong></article>
          <article class="metric-card"><span>Eligible Plans</span><strong>Paid tiers</strong></article>
        </div>
        <div class="notice compact">${escapeHtml(payload?.note || "Run manually to generate due recurring drafts now.")}</div>
        <p id="recurringSchedulerStatus" class="inline-status" hidden></p>
      </div>
      <div class="actions">
        <button id="runAdminRecurringScheduler" class="primary" type="button">Run Now</button>
      </div>
    </div>
  `;

  const status = recurringSchedulerPanel.querySelector("#recurringSchedulerStatus");
  const runButton = recurringSchedulerPanel.querySelector("#runAdminRecurringScheduler");
  runButton?.addEventListener("click", async () => {
    runButton.disabled = true;
    if (status) {
      status.hidden = false;
      status.textContent = "Checking all paid recurring invoice templates...";
      status.dataset.tone = "";
    }
    try {
      const result = await apiClient.runAdminRecurringScheduler(token, {
        targetDate: new Date().toISOString().slice(0, 10),
      });
      if (status) {
        status.textContent = `${result.createdCount || 0} draft(s) created across ${result.usersProcessed || 0} paid user(s).`;
        status.dataset.tone = "success";
      }
    } catch (error) {
      if (status) {
        status.textContent = error.message || "Could not run recurring scheduler.";
        status.dataset.tone = "error";
      }
    } finally {
      runButton.disabled = false;
    }
  });
}

Promise.all([
  apiClient.getAdminMoney(token),
  apiClient.listAdminUsers(token),
  apiClient.getAdminKycReview(token),
  apiClient.getAdminGateway(token),
  apiClient.getAdminPersistence(token),
  apiClient.getAdminRecurringStatus(token),
]).then(([payload, usersPayload, kycPayload, gatewayPayload, persistencePayload, recurringPayload]) => {
  const summary = payload.summary;
  if (adminTotal) adminTotal.textContent = money(summary.totalAmount);
  if (adminCount) adminCount.textContent = String(summary.count);
  if (adminCompany) adminCompany.textContent = money(summary.byType.company || 0);
  if (adminIndividual) adminIndividual.textContent = money(summary.byType.individual || 0);
  if (adminGroup) adminGroup.textContent = money(summary.byType.group || 0);
  if (adminSubscriptions) {
    adminSubscriptions.innerHTML = payload.subscriptions.length
      ? payload.subscriptions.map((subscription) => `
        <div class="invoice-card">
          <div>
            <strong>${escapeHtml(subscription.subscriberName || subscription.groupName || subscription.subscriberType || "Subscriber")}</strong>
            <div>${escapeHtml(subscription.subscriberType || "user")} - ${escapeHtml(subscription.plan || "free")} - ${escapeHtml(subscription.currency || "INR")} ${money(subscription.amount)}</div>
          </div>
          <span class="pill blue">${escapeHtml(subscription.status || "active")}</span>
        </div>
      `).join("")
      : "<p>No subscriptions yet.</p>";
  }
  renderBillingOrderAudit(payload.billingOrders || []);
  renderGatewayManagement(gatewayPayload);
  renderRecurringScheduler(recurringPayload);
  renderPersistenceStatus(persistencePayload);
  renderUserControls(usersPayload.users || []);
  renderKycQueue(kycPayload.companies || []);
});
