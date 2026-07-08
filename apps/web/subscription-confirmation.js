import { apiClient, money, requireSession } from "./common.js?v=20260601-session";

const sessionContext = await requireSession();
const title = document.getElementById("confirmationTitle");
const message = document.getElementById("confirmationMessage");
const details = document.getElementById("confirmationDetails");

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function latestSubscription(subscriptions = []) {
  return subscriptions.slice().reverse().find((entry) => String(entry.status || "").toLowerCase() === "active")
    || subscriptions.slice().reverse()[0]
    || null;
}

if (sessionContext) {
  document.getElementById("protectedContent")?.removeAttribute("hidden");
  try {
    const [plans, subscriptions] = await Promise.all([
      apiClient.listPlans(sessionContext.token),
      apiClient.listMySubscriptions(sessionContext.token),
    ]);
    const active = latestSubscription(subscriptions);
    const plan = plans.active || {};
    if (title) title.textContent = `${plan.label || "Free"} Plan ${active ? "Activated" : "Active"}`;
    if (message) {
      message.textContent = active
        ? `Your ${plan.label || active.plan} plan is active. Paid amounts are collected yearly and your tier features are now available.`
        : "Your Free plan is active. Upgrade anytime when you are ready for paid features.";
    }
    if (details) {
      details.innerHTML = `
        <div class="usage-grid">
          <div><span class="hint">Plan</span><strong>${escapeHtml(plan.label || active?.plan || "Free")}</strong></div>
          <div><span class="hint">Billing</span><strong>${active ? `${escapeHtml(active.currency || "INR")} ${money(active.amount || 0)} yearly` : "INR 0"}</strong></div>
          <div><span class="hint">Renewal</span><strong>${escapeHtml(String(active?.renewsAt || active?.expiresAt || "Not applicable").slice(0, 10))}</strong></div>
          <div><span class="hint">Gateway order</span><strong>${escapeHtml(active?.gatewayOrderId || "Not applicable")}</strong></div>
          <div><span class="hint">Payment ID</span><strong>${escapeHtml(active?.gatewayPaymentId || "Not applicable")}</strong></div>
          <div><span class="hint">Status</span><strong>${escapeHtml(active?.status || "free")}</strong></div>
        </div>
      `;
    }
  } catch (error) {
    if (title) title.textContent = "Subscription Check Failed";
    if (message) message.textContent = error.message || "Could not load your subscription status. Please open Dashboard and refresh.";
  }
}
