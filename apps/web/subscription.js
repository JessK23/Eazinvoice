import { apiClient, money, requireSession } from "./common.js?v=20260601-session";

const form = document.getElementById("subscriptionForm");
const status = document.getElementById("subscriptionStatus");
const planBadge = document.getElementById("subscriptionPlanBadge");
const usageGrid = document.getElementById("subscriptionUsageGrid");
const usageNote = document.getElementById("subscriptionUsageNote");
const planCards = document.getElementById("subscriptionPlanCards");
const sessionContext = await requireSession();
const token = sessionContext?.token;
if (!token) throw new Error("Authentication required");
document.getElementById("protectedContent")?.removeAttribute("hidden");

const managementPanel = document.createElement("div");
managementPanel.id = "subscriptionManagementPanel";
managementPanel.className = "subscription-box";
planCards?.after(managementPanel);

let razorpayCheckoutPromise = null;
let currentCatalog = [];
let currentPlanSummary = sessionContext.session?.plan || {};
let currentSubscriptions = [];

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function setStatus(message, tone = "") {
  if (!status) return;
  status.textContent = message || "";
  status.dataset.tone = tone;
}

function isUnlimitedLimit(value) {
  return Number(value) >= 999999;
}

function isActiveSubscription(subscription) {
  return String(subscription?.status || "").toLowerCase() === "active";
}

function isPaidSubscription(subscription) {
  return isActiveSubscription(subscription) && String(subscription?.plan || "free").toLowerCase() !== "free";
}

function activeSubscription(subscriptions = []) {
  return subscriptions.slice().reverse().find(isActiveSubscription) || null;
}

function subscriptionTone(statusValue) {
  const normalized = String(statusValue || "").toLowerCase();
  if (["active", "consumed", "verified"].includes(normalized)) return "blue";
  if (["failed", "cancelled", "expired", "rejected"].includes(normalized)) return "maroon";
  return "gold";
}

function aiUsageText(summary) {
  const detail = summary?.usageDetails?.aiCommandsPerMonth || {};
  const limit = Number(detail.limit ?? summary?.limits?.aiCommandsPerMonth ?? 0);
  const used = Number(detail.used ?? summary?.usage?.aiCommandsPerMonth ?? 0);
  if (detail.unlimited || isUnlimitedLimit(limit)) return `Unlimited (${used} used)`;
  if (limit <= 0) return "Upgrade to Pro";
  return `${Math.max(0, limit - used)} left (${used}/${limit})`;
}

function featureRows(summary) {
  const features = summary?.features || {};
  const rows = [
    ["WhatsApp sharing", features.whatsappShare, "Standard"],
    ["Razorpay collection links", features.razorpayCollections, "Standard"],
    ["Recurring invoice drafts", features.recurringInvoices, "Standard"],
    ["AI invoice assistant", features.aiInvoiceAssist, "Pro"],
    ["AI PO / WO assistant", features.aiPoAssist, "Pro"],
    ["Advanced reports", features.advancedReports, "Pro"],
    ["Team access", features.teamAccess, "Business"],
    ["API keys", features.apiAccess, "Business"],
    ["Approval workflow", features.approvals, "Business"],
  ];
  return rows.map(([label, enabled, tier]) => `
    <div class="entitlement-row">
      <span>${escapeHtml(label)}</span>
      <strong>${enabled ? "Unlocked" : `Locked - ${tier}+`}</strong>
    </div>
  `).join("");
}

function tierAuditRows(catalog = []) {
  return catalog
    .filter((plan) => (plan.plan || plan.id) !== "free")
    .map((plan) => {
      const monthlyAmount = Number(plan.monthlyAmount ?? plan.amount ?? 0);
      const annualAmount = Number(plan.annualAmount ?? (monthlyAmount * 12));
      return `
        <div class="entitlement-row">
          <span>${escapeHtml(plan.label || plan.plan)} checkout</span>
          <strong>INR ${money(annualAmount)} yearly (${Math.round(annualAmount * 100)} paise)</strong>
        </div>
      `;
    })
    .join("");
}

function renderUsage(summary, subscriptions = []) {
  const active = activeSubscription(subscriptions);
  if (planBadge) {
    planBadge.textContent = summary?.label || "Free";
    planBadge.className = `pill ${summary?.plan === "free" ? "gold" : "blue"}`;
  }
  if (usageGrid) {
    usageGrid.innerHTML = `
      <div>
        <span class="hint">Current plan</span>
        <strong>${escapeHtml(summary?.label || "Free")}</strong>
      </div>
      <div>
        <span class="hint">Yearly billing</span>
        <strong>${active ? `${escapeHtml(active.currency || "INR")} ${money(active.amount || 0)}` : "No paid billing"}</strong>
      </div>
      <div>
        <span class="hint">Renews / expires</span>
        <strong>${escapeHtml(String(active?.renewsAt || active?.expiresAt || "Not applicable").slice(0, 10))}</strong>
      </div>
      <div>
        <span class="hint">AI commands this month</span>
        <strong>${escapeHtml(aiUsageText(summary))}</strong>
      </div>
      <div>
        <span class="hint">Gateway payment</span>
        <strong>${escapeHtml(active?.gatewayPaymentId || active?.gatewayOrderId || "Not paid yet")}</strong>
      </div>
      <div>
        <span class="hint">Plan status</span>
        <strong>${escapeHtml(active?.status || "free")}</strong>
      </div>
    `;
  }
  if (usageNote) {
    const preview = summary?.preview?.enabled ? " Admin preview is active and does not change billing." : "";
    usageNote.textContent = `Paid plans show monthly pricing for easy comparison, but Razorpay collects the full yearly amount at checkout.${preview}`;
  }
}

function planButton(planId, activePlan) {
  if (planId === activePlan) return `<button class="ghost small" type="button" disabled>Current plan</button>`;
  if (planId === "free") return `<button class="ghost small plan-downgrade" type="button">Downgrade to Free</button>`;
  return `<button class="primary small plan-checkout" type="button" data-plan="${escapeHtml(planId)}">Pay yearly</button>`;
}

function renderPlanCards(catalog = [], activePlan = "free") {
  if (!planCards) return;
  planCards.innerHTML = catalog.map((plan) => {
    const planId = plan.plan || plan.id;
    const monthlyAmount = Number(plan.monthlyAmount ?? plan.amount ?? 0);
    const annualAmount = Number(plan.annualAmount ?? (monthlyAmount * 12));
    const aiLimit = Number(plan.limits?.aiCommandsPerMonth || 0);
    const aiLine = isUnlimitedLimit(aiLimit)
      ? "AI commands: Unlimited"
      : aiLimit > 0
        ? `AI commands: ${aiLimit}/month`
        : "AI commands: Not included";
    return `
      <article class="plan-card ${planId === activePlan ? "selected" : ""}">
        <span class="plan-label">${escapeHtml(plan.label || planId)}</span>
        <h2>${planId === "free" ? "INR 0" : `INR ${money(monthlyAmount)}/mo`}</h2>
        <p class="hint">${planId === "free" ? "No yearly billing" : `Collected yearly: INR ${money(annualAmount)}`}</p>
        <p class="plan-summary">${escapeHtml(plan.description || (plan.highlights || []).join(", "))}</p>
        <div class="notice compact">${escapeHtml(aiLine)}</div>
        <div class="notice compact">${planId === "free" ? "Free features stay available forever." : `Razorpay order should be INR ${money(annualAmount)} yearly (${Math.round(annualAmount * 100)} paise).`}</div>
        <div class="badge-row">
          ${(plan.highlights || []).slice(0, 4).map((item) => `<span class="pill blue">${escapeHtml(item)}</span>`).join("")}
        </div>
        <div class="actions">${planButton(planId, activePlan)}</div>
      </article>
    `;
  }).join("");

  planCards.querySelectorAll(".plan-checkout").forEach((button) => {
    button.addEventListener("click", () => startPaidCheckout(button.dataset.plan));
  });
  planCards.querySelector(".plan-downgrade")?.addEventListener("click", downgradeToFree);
}

function renderManagement(summary, subscriptions = []) {
  if (!managementPanel) return;
  const active = activeSubscription(subscriptions);
  managementPanel.innerHTML = `
    <div class="subscription-head">
      <strong>Plan Control and Entitlements</strong>
      <span class="pill ${subscriptionTone(active?.status || "free")}">${escapeHtml(String(active?.status || "free").toUpperCase())}</span>
    </div>
    <div class="grid two">
      <div class="notice compact">
        <strong>Active subscription</strong>
        <div>${active ? `${escapeHtml(active.plan || "free")} - ${escapeHtml(active.currency || "INR")} ${money(active.amount || 0)} yearly` : "Free plan active"}</div>
        <div class="hint">Order: ${escapeHtml(active?.gatewayOrderId || "Not available")}</div>
        <div class="hint">Payment: ${escapeHtml(active?.gatewayPaymentId || "Not available")}</div>
      </div>
      <div class="notice compact">
        <strong>Feature access</strong>
        ${featureRows(summary)}
      </div>
      <div class="notice compact">
        <strong>Checkout verification</strong>
        ${tierAuditRows(currentCatalog)}
      </div>
    </div>
    <div class="subscription-history">
      <h3>Subscription History</h3>
      ${subscriptions.length ? subscriptions.slice().reverse().map((subscription) => `
        <div class="invoice-card">
          <div>
            <strong>${escapeHtml(subscription.plan || "free")} - ${escapeHtml(subscription.currency || "INR")} ${money(subscription.amount || 0)}</strong>
            <div class="hint">${escapeHtml(subscription.billingCycle || "yearly")} - ${escapeHtml(subscription.status || "active")}</div>
            ${subscription.renewsAt ? `<div class="hint">Renews ${escapeHtml(String(subscription.renewsAt).slice(0, 10))}</div>` : ""}
            ${subscription.gatewayPaymentId ? `<div class="hint">Payment <code>${escapeHtml(subscription.gatewayPaymentId)}</code></div>` : ""}
          </div>
          <div class="actions">
            ${isPaidSubscription(subscription) ? `<button class="ghost small" data-sub-action="cancel" data-sub="${escapeHtml(subscription.id)}">Cancel</button>` : ""}
            ${String(subscription.status || "").toLowerCase() === "cancelled" ? `<button class="ghost small" data-sub-action="renew" data-sub="${escapeHtml(subscription.id)}">Renew</button>` : ""}
            <span class="pill ${subscriptionTone(subscription.status)}">${escapeHtml(String(subscription.status || "active").toUpperCase())}</span>
          </div>
        </div>
      `).join("") : "<p>No subscription history yet.</p>"}
    </div>
  `;

  managementPanel.querySelectorAll("button[data-sub-action]").forEach((button) => {
    button.addEventListener("click", () => handleSubscriptionAction(button.dataset.subAction, button.dataset.sub));
  });
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
      document.head.append(script);
    });
  }
  return razorpayCheckoutPromise;
}

async function openRazorpayCheckout(orderPayload) {
  await loadRazorpayCheckout();
  return new Promise((resolve, reject) => {
    const checkout = new window.Razorpay({
      key: orderPayload.keyId,
      order_id: orderPayload.order?.id,
      amount: orderPayload.order?.amount,
      currency: orderPayload.order?.currency || "INR",
      name: "EazInvoice",
      description: orderPayload.description || "EazInvoice paid plan",
      prefill: orderPayload.prefill || {},
      handler: async (response) => {
        try {
          const verified = await apiClient.verifyRazorpayPayment(token, response);
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

async function startPaidCheckout(plan) {
  if (!plan) return;
  setStatus(`Opening Razorpay yearly checkout for ${plan}...`);
  try {
    const orderPayload = await apiClient.createRazorpayOrder(token, { kind: "subscription", plan });
    const verified = await openRazorpayCheckout(orderPayload);
    if (!verified) {
      setStatus("Razorpay checkout was closed before payment. Your plan was not changed.", "error");
      return;
    }
    setStatus(`${verified.subscription?.plan || plan} plan activated successfully.`, "success");
    await refreshSubscriptionPage();
  } catch (error) {
    setStatus(error.message || "Payment could not be completed. Please try again.", "error");
  }
}

async function downgradeToFree() {
  const active = activeSubscription(currentSubscriptions);
  if (!active || String(active.plan || "free").toLowerCase() === "free") {
    setStatus("You are already on the Free plan.");
    return;
  }
  if (!window.confirm("Downgrade to Free? Paid features will lock immediately.")) return;
  try {
    await apiClient.downgradeSubscription(token, active.id, { plan: "free" });
    setStatus("Plan downgraded to Free.", "success");
    await refreshSubscriptionPage();
  } catch (error) {
    setStatus(error.message || "Could not downgrade subscription.", "error");
  }
}

async function handleSubscriptionAction(action, subscriptionId) {
  if (!subscriptionId) return;
  try {
    if (action === "cancel") {
      if (!window.confirm("Cancel this subscription? Paid features will lock when cancellation is processed.")) return;
      await apiClient.cancelSubscription(token, subscriptionId, { reason: "Cancelled from subscription page" });
      setStatus("Subscription cancelled.", "success");
    }
    if (action === "renew") {
      await apiClient.renewSubscription(token, subscriptionId);
      setStatus("Subscription renewed.", "success");
    }
    await refreshSubscriptionPage();
  } catch (error) {
    setStatus(error.message || "Could not update subscription.", "error");
  }
}

async function refreshSubscriptionPage() {
  try {
    const [plans, subscriptions] = await Promise.all([
      apiClient.listPlans(token),
      apiClient.listMySubscriptions(token),
    ]);
    currentCatalog = plans.catalog || [];
    currentPlanSummary = plans.active || {};
    currentSubscriptions = subscriptions || [];
    renderUsage(currentPlanSummary, currentSubscriptions);
    renderPlanCards(currentCatalog, currentPlanSummary.plan || "free");
    renderManagement(currentPlanSummary, currentSubscriptions);
  } catch (error) {
    setStatus(error.message || "Could not load subscription details.", "error");
  }
}

await refreshSubscriptionPage();

form?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = new FormData(form);
  try {
    const entityType = data.get("entityType");
    const aadhaarNumber = String(data.get("aadhaarNumber") || "").replace(/\D/g, "");
    const hasAadhaar = aadhaarNumber.length >= 4;
    const fileEntries = await Promise.all(["panDocument", "aadhaarDocument", "gstDocument"].map(async (field) => {
      const file = data.get(field);
      if (!file || typeof file === "string") return null;
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error(`Failed to read ${file.name}`));
        reader.readAsDataURL(file);
      });
      return {
        fileName: file.name,
        mimeType: file.type,
        dataUrl,
      };
    }));
    const uploaded = fileEntries.filter(Boolean).length
      ? await apiClient.uploadDocuments(token, fileEntries.filter(Boolean))
      : { files: [] };
    await apiClient.createCompany(token, {
      ownerUserId: null,
      name: data.get("entityName"),
      legalName: data.get("entityName"),
      entityType,
      address: data.get("address"),
      gstNumber: data.get("gstNumber"),
      panNumber: data.get("panNumber"),
      addressProof: data.get("addressProof"),
      documentNames: uploaded.files.map((file) => file.storedName),
      documentFiles: uploaded.files,
      logoUrl: data.get("logoUrl"),
      kycStatus: "pending",
      kycMode: "document-review",
      aadhaarLast4: hasAadhaar ? aadhaarNumber.slice(-4) : "",
    });
    setStatus("Profile saved for paid plan review. You can now choose a paid yearly plan.", "success");
    form.reset();
    await refreshSubscriptionPage();
  } catch (error) {
    setStatus(error.message || "Could not save profile.", "error");
  }
});
