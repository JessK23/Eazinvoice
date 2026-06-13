import { apiClient, money, requireSession } from "./common.js?v=20260601-session";

const sessionContext = await requireSession("/apps/web/auth.html");
const token = sessionContext?.token;
if (!token) throw new Error("Authentication required");
if (!sessionContext.session.admin?.authorized) {
  window.location.replace("/apps/web/access.html");
  throw new Error("Configured admin required");
}
document.getElementById("protectedContent")?.removeAttribute("hidden");

const adminTotal = document.getElementById("adminTotal");
const adminCount = document.getElementById("adminCount");
const adminCompany = document.getElementById("adminCompany");
const adminIndividual = document.getElementById("adminIndividual");
const adminGroup = document.getElementById("adminGroup");
const adminSubscriptions = document.getElementById("adminSubscriptions");
const adminUsers = document.getElementById("adminUsers");
const kycReviewQueue = document.getElementById("kycReviewQueue");

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

Promise.all([
  apiClient.getAdminMoney(token),
  apiClient.listAdminUsers(token),
  apiClient.getAdminKycReview(token),
]).then(([payload, usersPayload, kycPayload]) => {
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
  renderUserControls(usersPayload.users || []);
  renderKycQueue(kycPayload.companies || []);
});
