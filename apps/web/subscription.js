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

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function isUnlimitedLimit(value) {
  return Number(value) >= 999999;
}

function aiUsageText(summary) {
  const detail = summary?.usageDetails?.aiCommandsPerMonth || {};
  const limit = Number(detail.limit ?? summary?.limits?.aiCommandsPerMonth ?? 0);
  const used = Number(detail.used ?? summary?.usage?.aiCommandsPerMonth ?? 0);
  if (detail.unlimited || isUnlimitedLimit(limit)) return `Unlimited (${used} used)`;
  if (limit <= 0) return "Upgrade to Pro";
  return `${Math.max(0, limit - used)} left (${used}/${limit})`;
}

function aiFeatureText(plan) {
  const features = plan?.features || {};
  const labels = [];
  if (features.aiInvoiceAssist) labels.push("AI invoices");
  if (features.aiPoAssist) labels.push("AI PO / WO");
  if (features.advancedReports) labels.push("AI reports");
  return labels.length ? labels.join(", ") : "AI unlocks from Pro";
}

function renderUsage(summary) {
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
        <span class="hint">AI commands this month</span>
        <strong>${escapeHtml(aiUsageText(summary))}</strong>
      </div>
      <div>
        <span class="hint">Included AI tools</span>
        <strong>${escapeHtml(aiFeatureText(summary))}</strong>
      </div>
    `;
  }
  if (usageNote) {
    const resetMessage = Number(summary?.limits?.aiCommandsPerMonth || 0) > 0
      ? "AI command usage is counted monthly and resets automatically at the beginning of the next usage month."
      : "Free and Standard users can continue normal billing workflows. AI invoice, PO/WO, and report assistance starts from Pro.";
    usageNote.textContent = `Paid plans are billed yearly. ${resetMessage}`;
  }
}

function renderPlanCards(catalog = [], activePlan = "free") {
  if (!planCards) return;
  planCards.innerHTML = catalog.map((plan) => {
    const planId = plan.plan || plan.id;
    const monthlyAmount = Number(plan.discountedAmount ?? plan.monthlyAmount ?? plan.amount ?? 0);
    const annualAmount = Number(plan.discountedAnnualAmount ?? plan.annualAmount ?? (monthlyAmount * 12));
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
        <p class="hint">${planId === "free" ? "No yearly billing" : `Billed yearly: INR ${money(annualAmount)}`}</p>
        <p class="plan-summary">${escapeHtml(plan.description || (plan.highlights || []).join(", "))}</p>
        <div class="notice compact">${escapeHtml(aiLine)}. Monthly AI usage resets every usage month.</div>
      </article>
    `;
  }).join("");
}

async function loadPlanUsage() {
  try {
    const payload = await apiClient.listPlans(token);
    renderUsage(payload.active || sessionContext.session?.plan || {});
    renderPlanCards(payload.catalog || [], payload.active?.plan || "free");
  } catch (error) {
    if (usageNote) usageNote.textContent = error.message || "Could not load plan usage.";
  }
}

loadPlanUsage();

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
    window.location.href = "/apps/web/dashboard.html";
  } catch (error) {
    if (status) status.textContent = error.message;
  }
});
