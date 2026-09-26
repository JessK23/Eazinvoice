import { apiClient, money, mountAdminPlanPreview, requireSession } from "./common.js?v=20260924-oauth-cleanup";
import { normalizeActionError, openActionStatusModal } from "./action-error-modal.js?v=20260926-action-error-modal";

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
const subscriptionTierAudit = document.getElementById("subscriptionTierAudit");
const billingOrderAudit = document.getElementById("billingOrderAudit");
const gatewayManagement = document.getElementById("gatewayManagement");
const recurringSchedulerPanel = document.getElementById("recurringSchedulerPanel");
const businessNotificationSchedulerPanel = document.getElementById("businessNotificationSchedulerPanel");
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
  if (["active", "paid", "verified", "consumed", "approved"].includes(normalized)) return "blue";
  if (["failed", "rejected", "cancelled"].includes(normalized)) return "maroon";
  return "gold";
}

let latestKycCompanies = [];
let latestKycReview = null;
let currentKycObjectUrl = null;

function safeAadhaarLast4(value) {
  const digits = String(value || "").replace(/\D/g, "");
  return digits ? digits.slice(-4) : "";
}

function safeReviewStatusText(company = {}) {
  const kyc = String(company.kycStatus || "not_submitted").toLowerCase();
  const review = String(company.reviewStatus || "not_submitted").toLowerCase();
  return `${kyc} / ${review}`;
}

function closeKycReviewDialog() {
  const dialog = document.getElementById("adminKycReviewDialog");
  if (dialog?.open) dialog.close();
}

function closeKycDocumentDialog() {
  const dialog = document.getElementById("adminKycDocumentDialog");
  if (dialog?.open) dialog.close();
  if (currentKycObjectUrl) {
    URL.revokeObjectURL(currentKycObjectUrl);
    currentKycObjectUrl = null;
  }
}

function ensureKycReviewDialog() {
  let dialog = document.getElementById("adminKycReviewDialog");
  if (dialog) return dialog;
  dialog = document.createElement("dialog");
  dialog.id = "adminKycReviewDialog";
  dialog.className = "eaz-modal admin-kyc-review-dialog";
  dialog.innerHTML = `
    <div class="admin-kyc-review-shell">
      <div class="panel-head compact">
        <h3 id="adminKycReviewTitle">Review KYC</h3>
        <button type="button" class="ghost small" data-kyc-close>Close</button>
      </div>
      <div id="adminKycReviewBody" class="list"></div>
      <label class="stack" for="adminKycRejectReason">
        Rejection Reason (required when rejecting)
        <textarea id="adminKycRejectReason" rows="3" placeholder="Provide a clear reason for rejection"></textarea>
      </label>
      <div class="actions">
        <button type="button" class="primary" data-kyc-approve>Approve</button>
        <button type="button" class="ghost" data-kyc-reject>Reject</button>
      </div>
    </div>
  `;
  dialog.setAttribute("aria-labelledby", "adminKycReviewTitle");
  dialog.setAttribute("aria-modal", "true");
  dialog.querySelector("[data-kyc-close]")?.addEventListener("click", closeKycReviewDialog);
  dialog.querySelector("[data-kyc-approve]")?.addEventListener("click", async () => {
    if (!latestKycReview?.id) return;
    try {
      await apiClient.reviewKyc(token, latestKycReview.id, "approve", "Approved by admin reviewer");
      openActionStatusModal({
        tone: "success",
        title: "KYC Approved",
        message: "KYC review is completed and marked as approved.",
        actionLabel: "OK",
        showClose: false,
      });
      closeKycReviewDialog();
      const refreshed = await apiClient.getAdminKycReview(token);
      renderKycQueue(refreshed.companies || []);
    } catch (error) {
      openActionStatusModal(normalizeActionError(error, { title: "Review Update Failed" }));
    }
  });
  dialog.querySelector("[data-kyc-reject]")?.addEventListener("click", async () => {
    if (!latestKycReview?.id) return;
    const reasonInput = dialog.querySelector("#adminKycRejectReason");
    const reason = String(reasonInput?.value || "").trim();
    if (!reason) {
      openActionStatusModal({
        tone: "warning",
        title: "Rejection Reason Required",
        message: "Enter a rejection reason before rejecting KYC.",
        actionLabel: "OK",
        showClose: false,
      });
      reasonInput?.focus();
      return;
    }
    try {
      await apiClient.reviewKyc(token, latestKycReview.id, "reject", reason);
      openActionStatusModal({
        tone: "warning",
        title: "KYC Rejected",
        message: "KYC review is completed and marked as rejected.",
        detail: "The applicant must update details and resubmit for review.",
        actionLabel: "OK",
        showClose: false,
      });
      closeKycReviewDialog();
      const refreshed = await apiClient.getAdminKycReview(token);
      renderKycQueue(refreshed.companies || []);
    } catch (error) {
      openActionStatusModal(normalizeActionError(error, { title: "Review Update Failed" }));
    }
  });
  document.body.append(dialog);
  return dialog;
}

function ensureKycDocumentDialog() {
  let dialog = document.getElementById("adminKycDocumentDialog");
  if (dialog) return dialog;
  dialog = document.createElement("dialog");
  dialog.id = "adminKycDocumentDialog";
  dialog.className = "eaz-modal admin-kyc-document-dialog";
  dialog.innerHTML = `
    <div class="admin-kyc-review-shell">
      <div class="panel-head compact">
        <h3 id="adminKycDocumentTitle">KYC Document</h3>
        <button type="button" class="ghost small" data-kyc-document-close>Close</button>
      </div>
      <div id="adminKycDocumentBody" class="list"></div>
    </div>
  `;
  dialog.setAttribute("aria-labelledby", "adminKycDocumentTitle");
  dialog.setAttribute("aria-modal", "true");
  dialog.querySelector("[data-kyc-document-close]")?.addEventListener("click", closeKycDocumentDialog);
  document.body.append(dialog);
  return dialog;
}

function renderKycReviewBody(company) {
  const body = document.getElementById("adminKycReviewBody");
  if (!body) return;
  const docs = Array.isArray(company.documents) ? company.documents : [];
  body.innerHTML = `
    <div class="invoice-card">
      <strong>${escapeHtml(company.name || company.legalName || "Applicant")}</strong>
      <div class="hint">Entity: ${escapeHtml(company.entityType || "-")} - Country: ${escapeHtml(company.country || "-")}</div>
      <div class="hint">PAN: ${escapeHtml(company.panNumber || "-")}</div>
      <div class="hint">Aadhaar Last 4: ${escapeHtml(safeAadhaarLast4(company.aadhaarLast4) || "-")}</div>
      <div class="hint">Address: ${escapeHtml(company.address || "-")}</div>
      <div class="hint">Address Proof: ${escapeHtml(company.addressProof || "-")}</div>
      <div class="hint">Status: ${escapeHtml(safeReviewStatusText(company))}</div>
      <div class="hint">Submitted: ${escapeHtml(company.createdAt || "-")} - Reviewed: ${escapeHtml(company.reviewedAt || "-")}</div>
      <div class="hint">Reviewer Notes: ${escapeHtml(company.reviewNotes || "-")}</div>
    </div>
    <div class="invoice-card">
      <strong>Uploaded Documents</strong>
      <div class="list">
        ${docs.length
    ? docs.map((document) => `
              <div class="expense-entry-row">
                <span>${escapeHtml(document.fileName || "Document")}</span>
                <span>${escapeHtml(document.mimeType || "-")}</span>
                <button type="button" class="ghost small" data-kyc-document="${escapeHtml(document.id)}">View</button>
              </div>
            `).join("")
    : '<div class="hint">No uploaded documents found.</div>'}
      </div>
    </div>
  `;

  body.querySelectorAll("button[data-kyc-document]").forEach((button) => {
    button.addEventListener("click", async () => {
      const documentId = button.getAttribute("data-kyc-document");
      if (!documentId) return;
      try {
        const documentDialog = ensureKycDocumentDialog();
        const documentBody = documentDialog.querySelector("#adminKycDocumentBody");
        if (documentBody) documentBody.innerHTML = "<p class=\"hint\">Loading document...</p>";
        const file = await apiClient.getAdminKycDocument(token, company.id, documentId);
        closeKycDocumentDialog();
        const blobUrl = URL.createObjectURL(file.blob);
        currentKycObjectUrl = blobUrl;
        if (documentBody) {
          if ((file.contentType || "").startsWith("image/")) {
            documentBody.innerHTML = `<img src="${blobUrl}" alt="KYC document preview" class="admin-kyc-document-image" />`;
          } else {
            documentBody.innerHTML = `<iframe src="${blobUrl}" title="KYC document preview" class="admin-kyc-document-frame"></iframe>`;
          }
        }
        documentDialog.showModal();
      } catch (error) {
        openActionStatusModal(normalizeActionError(error, { title: "Document View Failed" }));
      }
    });
  });
}

async function openKycReview(companyId) {
  if (!companyId) return;
  try {
    const company = await apiClient.getAdminKycReviewCompany(token, companyId);
    latestKycReview = company;
    const dialog = ensureKycReviewDialog();
    const reasonInput = dialog.querySelector("#adminKycRejectReason");
    if (reasonInput) reasonInput.value = "";
    renderKycReviewBody(company);
    dialog.showModal();
  } catch (error) {
    openActionStatusModal(normalizeActionError(error, { title: "Review Load Failed" }));
  }
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

function renderAdminSubscriptions(payload) {
  if (!adminSubscriptions) return;
  const subscriptions = payload?.subscriptions || [];
  const summary = payload?.summary || {};
  const catalog = payload?.catalog || [];
  if (subscriptionTierAudit) {
    subscriptionTierAudit.innerHTML = `
      <div class="invoice-card gateway-card">
        <div>
          <div class="panel-head compact">
            <div>
              <strong>Paid Tier Verification</strong>
              <div class="hint">Use this to confirm live pricing, yearly collection, and Razorpay order amounts before deeper paid-feature testing.</div>
            </div>
            ${badge(summary.syncIssues ? "SYNC REVIEW" : "AUDIT READY", summary.syncIssues ? "gold" : "blue")}
          </div>
          <div class="metric-grid gateway-metrics">
            ${catalog.filter((plan) => plan.plan !== "free").map((plan) => `
              <article class="metric-card">
                <span>${escapeHtml(plan.label || plan.plan)}</span>
                <strong>${escapeHtml(plan.monthlyAmount)} / month</strong>
                <small>${escapeHtml(plan.annualAmount)} yearly - ${escapeHtml(plan.razorpayAmountPaise)} paise</small>
              </article>
            `).join("")}
          </div>
          <div class="notice compact">Admin preview does not create subscriptions. Real activation must come through verified Razorpay payment or an admin-controlled lifecycle action.</div>
        </div>
      </div>
    `;
  }
  adminSubscriptions.innerHTML = `
    <div class="metric-grid gateway-metrics">
      <article class="metric-card"><span>Total</span><strong>${escapeHtml(summary.total ?? subscriptions.length)}</strong></article>
      <article class="metric-card"><span>Paid Plans</span><strong>${escapeHtml(summary.paid ?? 0)}</strong></article>
      <article class="metric-card"><span>Active</span><strong>${escapeHtml(summary.byStatus?.active ?? 0)}</strong></article>
      <article class="metric-card"><span>Sync Issues</span><strong>${escapeHtml(summary.syncIssues ?? 0)}</strong></article>
    </div>
    ${subscriptions.length
      ? subscriptions.slice().reverse().map((subscription) => {
        const sync = subscription.entitlementSync || {};
        const syncTone = sync.status === "matched" ? "blue" : sync.status === "not_configured" ? "gold" : "maroon";
        return `
          <div class="invoice-card">
            <div>
              <strong>${escapeHtml(subscription.userName || subscription.subscriberName || "Subscriber")}</strong>
              <div class="hint">${escapeHtml(subscription.userEmail || "")} - ${escapeHtml(subscription.subscriberType || "user")}</div>
              <div class="hint">${escapeHtml(subscription.plan || "free")} - ${escapeHtml(subscription.currency || "INR")} ${money(subscription.amount)} yearly - ${escapeHtml(subscription.status || "active")}</div>
              <div class="hint">Renews: ${escapeHtml(String(subscription.renewsAt || subscription.expiresAt || "-").slice(0, 10))}</div>
              <div class="hint">Order: <code>${escapeHtml(subscription.gatewayOrderId || "Not available")}</code></div>
              <div class="hint">Payment: <code>${escapeHtml(subscription.gatewayPaymentId || "Not available")}</code></div>
              <div class="hint">${escapeHtml(sync.message || "Runtime entitlement only")}</div>
            </div>
            <div class="actions">
              <span class="pill ${statusTone(subscription.status)}">${escapeHtml(String(subscription.status || "active").toUpperCase())}</span>
              <span class="pill ${syncTone}">${escapeHtml(String(sync.status || "runtime").toUpperCase())}</span>
            </div>
          </div>
        `;
      }).join("")
      : "<p>No subscriptions yet.</p>"}
  `;
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
  latestKycCompanies = Array.isArray(companies) ? companies : [];
  kycReviewQueue.innerHTML = latestKycCompanies.length
    ? latestKycCompanies.map((company) => `
      <div class="invoice-card">
        <div>
          <strong>${escapeHtml(company.name || "Company")}</strong>
          <div class="hint">${escapeHtml(company.entityType || "company")} - ${escapeHtml(company.country || "IN")}</div>
          <div class="hint">KYC ${escapeHtml(company.kycStatus || "not_submitted")} - Review ${escapeHtml(company.reviewStatus || "not_submitted")}</div>
          <div class="badge-row">
            ${badge((company.kycStatus || "not_submitted").toUpperCase(), statusTone(company.kycStatus || "not_submitted"))}
            ${badge((company.reviewStatus || "not_submitted").toUpperCase(), statusTone(company.reviewStatus || "not_submitted"))}
          </div>
          <div class="hint">Docs: ${escapeHtml((company.documents || []).map((entry) => entry.fileName).join(", ") || "none")}</div>
          <div class="hint">Aadhaar Last 4: ${escapeHtml(safeAadhaarLast4(company.aadhaarLast4) || "-")}</div>
        </div>
        <div class="actions">
          <button class="primary small" data-action="review" data-company="${escapeHtml(company.id)}">Review KYC</button>
        </div>
      </div>
    `).join("")
    : "<p>No KYC items waiting for review.</p>";

  kycReviewQueue.querySelectorAll("button[data-action=\"review\"][data-company]").forEach((button) => {
    button.addEventListener("click", async () => {
      const companyId = button.getAttribute("data-company");
      await openKycReview(companyId);
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

function renderBusinessNotificationScheduler(payload) {
  if (!businessNotificationSchedulerPanel) return;
  businessNotificationSchedulerPanel.innerHTML = `
    <div class="invoice-card gateway-card">
      <div>
        <div class="panel-head compact">
          <div>
            <strong>Business Notification Delivery</strong>
            <div class="hint">Runs SMTP notices for Business workspaces: compliance reminders, approval aging, team access notices, gateway attention, and optional workspace digest.</div>
          </div>
          ${badge(payload?.enabled ? "AUTO ENABLED" : "MANUAL MODE", payload?.enabled ? "blue" : "gold")}
        </div>
        <div class="metric-grid gateway-metrics">
          <article class="metric-card"><span>Interval</span><strong>${escapeHtml(payload?.intervalHours ?? 24)} hours</strong></article>
          <article class="metric-card"><span>Approval Age</span><strong>${escapeHtml(payload?.approvalAgeDays ?? 2)} days</strong></article>
          <article class="metric-card"><span>Max per Workspace</span><strong>${escapeHtml(payload?.maxPerWorkspace ?? 8)}</strong></article>
          <article class="metric-card"><span>Digest</span><strong>${payload?.digestEnabled ? "Enabled" : "Manual"}</strong></article>
        </div>
        <div class="notice compact">${escapeHtml(payload?.note || "Run manually to check due Business workspace notifications now.")}</div>
        <form id="businessNotificationSchedulerForm" class="audit-filter-bar scheduler-control-form">
          <label>
            Target date
            <input name="targetDate" type="date" value="${escapeHtml(new Date().toISOString().slice(0, 10))}" />
          </label>
          <label>
            Approval age days
            <input name="approvalAgeDays" type="number" min="0" value="${escapeHtml(payload?.approvalAgeDays ?? 2)}" />
          </label>
          <label>
            Max per workspace
            <input name="maxPerWorkspace" type="number" min="1" value="${escapeHtml(payload?.maxPerWorkspace ?? 8)}" />
          </label>
          <label class="checkbox-line">
            <input name="includeDigest" type="checkbox" ${payload?.digestEnabled ? "checked" : ""} />
            Include digest
          </label>
          <label class="checkbox-line">
            <input name="force" type="checkbox" />
            Force rerun today
          </label>
        </form>
        <p id="businessNotificationSchedulerStatus" class="inline-status" hidden></p>
      </div>
      <div class="actions">
        <button id="runBusinessNotificationScheduler" class="primary" type="button">Run Notifications</button>
      </div>
    </div>
  `;

  const form = businessNotificationSchedulerPanel.querySelector("#businessNotificationSchedulerForm");
  const status = businessNotificationSchedulerPanel.querySelector("#businessNotificationSchedulerStatus");
  const runButton = businessNotificationSchedulerPanel.querySelector("#runBusinessNotificationScheduler");
  runButton?.addEventListener("click", async () => {
    const formData = new FormData(form);
    const body = {
      targetDate: formData.get("targetDate") || new Date().toISOString().slice(0, 10),
      approvalAgeDays: Number(formData.get("approvalAgeDays") || payload?.approvalAgeDays || 2),
      maxPerWorkspace: Number(formData.get("maxPerWorkspace") || payload?.maxPerWorkspace || 8),
      includeDigest: formData.get("includeDigest") === "on",
      force: formData.get("force") === "on",
    };
    runButton.disabled = true;
    if (status) {
      status.hidden = false;
      status.textContent = "Checking Business workspaces and SMTP delivery rules...";
      status.dataset.tone = "";
    }
    try {
      const result = await apiClient.runAdminBusinessNotificationScheduler(token, body);
      if (status) {
        status.textContent = [
          `${result.sent || 0} sent`,
          `${result.failed || 0} failed`,
          `${result.notConfigured || 0} not configured`,
          `${result.skipped || 0} skipped`,
          `${result.eligibleWorkspaces || 0} Business workspace(s) checked`,
        ].join(" - ");
        status.dataset.tone = result.failed ? "error" : "success";
      }
    } catch (error) {
      if (status) {
        status.textContent = error.message || "Could not run Business notification automation.";
        status.dataset.tone = "error";
      }
    } finally {
      runButton.disabled = false;
    }
  });
}

Promise.all([
  apiClient.getAdminMoney(token),
  apiClient.getAdminSubscriptionAudit(token),
  apiClient.listAdminUsers(token),
  apiClient.getAdminKycReview(token),
  apiClient.getAdminGateway(token),
  apiClient.getAdminPersistence(token),
  apiClient.getAdminRecurringStatus(token),
  apiClient.getAdminBusinessNotificationStatus(token),
]).then(([payload, subscriptionAuditPayload, usersPayload, kycPayload, gatewayPayload, persistencePayload, recurringPayload, businessNotificationPayload]) => {
  const summary = payload.summary;
  if (adminTotal) adminTotal.textContent = money(summary.totalAmount);
  if (adminCount) adminCount.textContent = String(summary.count);
  if (adminCompany) adminCompany.textContent = money(summary.byType.company || 0);
  if (adminIndividual) adminIndividual.textContent = money(summary.byType.individual || 0);
  if (adminGroup) adminGroup.textContent = money(summary.byType.group || 0);
  renderAdminSubscriptions(subscriptionAuditPayload);
  renderBillingOrderAudit(payload.billingOrders || []);
  renderGatewayManagement(gatewayPayload);
  renderRecurringScheduler(recurringPayload);
  renderBusinessNotificationScheduler(businessNotificationPayload);
  renderPersistenceStatus(persistencePayload);
  renderUserControls(usersPayload.users || []);
  renderKycQueue(kycPayload.companies || []);
});
