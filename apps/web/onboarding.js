import { apiClient, requireSession } from "./common.js?v=20260924-oauth-cleanup";

const sessionContext = await requireSession();
const token = sessionContext?.token;
if (!token) throw new Error("Authentication required");

const app = document.getElementById("onboardingApp");
const stepNumber = document.getElementById("stepNumber");
const stepTitle = document.getElementById("stepTitle");
const stepIntro = document.getElementById("stepIntro");
const startSetup = document.getElementById("startSetup");
const skipProfile = document.getElementById("skipProfile");
const finishIntro = document.getElementById("finishIntro");
const form = document.getElementById("businessProfileForm");
const status = document.getElementById("onboardingStatus");
const onboardingChecklist = document.getElementById("onboardingChecklist");
const params = new URLSearchParams(window.location.search);
const editCompanyId = params.get("company") || "";
let companies = [];

const stepCopy = {
  1: {
    title: "Welcome to Eazinvoice",
    intro: "Set up your business once so invoices, GST details, and payment instructions are ready when you start billing.",
  },
  2: {
    title: "Create your business profile",
    intro: "These details appear on invoices and can be completed further when you move to a paid plan.",
  },
  3: {
    title: "Choose your first daily action",
    intro: "Start with the record that matters today. EazInvoice will keep financial authority in the backend as you add real data.",
  },
  4: {
    title: "Your dashboard is ready",
    intro: "Use daily actions to create invoices, track payables, review reports, and return to setup when details change.",
  },
};

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function showStep(step) {
  document.querySelectorAll(".onboarding-step").forEach((section) => {
    section.hidden = section.dataset.step !== String(step);
  });
  if (stepNumber) stepNumber.textContent = String(step);
  if (stepTitle) stepTitle.textContent = stepCopy[step].title;
  if (stepIntro) stepIntro.textContent = stepCopy[step].intro;
}

function checklistItem(label, complete, href) {
  return `
    <a class="setup-check-item" data-complete="${complete ? "true" : "false"}" href="${escapeHtml(href)}">
      <strong>${complete ? "Done" : "Next"}</strong>
      <span>${escapeHtml(label)}</span>
    </a>
  `;
}

function renderChecklist() {
  if (!onboardingChecklist) return;
  const hasCompany = companies.length > 0;
  const gstReady = companies.some((company) => company.gstNumber || company.gstin || company.gstRegistered || company.panNumber);
  onboardingChecklist.innerHTML = [
    checklistItem("Business profile", hasCompany, "/apps/web/onboarding.html"),
    checklistItem("GST/PAN details", gstReady, "/apps/web/onboarding.html"),
    checklistItem("First customer or invoice", false, "/apps/web/invoice.html#customerStep"),
    checklistItem("Subscription choice", false, "/apps/web/subscription.html"),
  ].join("");
}

function fillForm(company) {
  if (!form || !company) return;
  Object.entries({
    name: company.name || company.legalName || "",
    logoUrl: company.logoUrl || "",
    businessType: company.businessType || "",
    entityType: company.entityType || "company",
    gstNumber: company.gstNumber || company.gstin || "",
    panNumber: company.panNumber || "",
    phone: company.phone || "",
    email: company.email || "",
    state: company.state || "",
    pincode: company.pincode || "",
    upiId: company.upiId || "",
    address: company.address || "",
    bankDetails: company.bankDetails || "",
  }).forEach(([name, value]) => {
    const field = form.elements[name];
    if (field) field.value = value;
  });
  if (form.elements.gstRegistered) {
    form.elements.gstRegistered.checked = Boolean(company.gstRegistered || company.gstNumber || company.gstin);
  }
}

startSetup?.addEventListener("click", () => showStep(2));
skipProfile?.addEventListener("click", () => showStep(3));
finishIntro?.addEventListener("click", () => showStep(4));

form?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = new FormData(form);
  try {
    const payload = {
      profilePurpose: "onboarding",
      name: data.get("name"),
      logoUrl: data.get("logoUrl"),
      businessType: data.get("businessType"),
      entityType: data.get("entityType"),
      gstRegistered: data.get("gstRegistered") === "on",
      gstNumber: data.get("gstNumber"),
      panNumber: data.get("panNumber"),
      phone: data.get("phone"),
      email: data.get("email"),
      state: data.get("state"),
      pincode: data.get("pincode"),
      upiId: data.get("upiId"),
      address: data.get("address"),
      bankDetails: data.get("bankDetails"),
    };
    const profile = editCompanyId
      ? await apiClient.updateCompany(token, editCompanyId, payload)
      : await apiClient.createCompany(token, payload);
    companies = [profile, ...companies.filter((company) => company.id !== profile.id)];
    renderChecklist();
    if (status) status.textContent = `Saved ${profile.name}.`;
    showStep(3);
  } catch (error) {
    if (status) status.textContent = error.message;
  }
});

try {
  companies = await apiClient.listCompanies(token).catch(() => []);
  const company = editCompanyId
    ? companies.find((entry) => entry.id === editCompanyId)
    : companies[0];
  if (company) fillForm(company);
  renderChecklist();
  app?.removeAttribute("hidden");
  showStep(editCompanyId ? 2 : 1);
} catch (error) {
  if (status) status.textContent = error.message || "Could not load onboarding.";
  app?.removeAttribute("hidden");
  showStep(1);
}
