const API_BASE = window.location.origin;
const initialParams = new URLSearchParams(window.location.search);
const tokenFromUrl = initialParams.get("token") || "";
const legacyAccessTab = initialParams.get("tab") || "";

if (tokenFromUrl) {
  localStorage.setItem("eazinvoice_token", tokenFromUrl);
  sessionStorage.setItem("eazinvoice_token", tokenFromUrl);
  document.cookie = `eazinvoice_token=${encodeURIComponent(tokenFromUrl)}; path=/; SameSite=Lax`;
  const cleanUrl = new URL(window.location.href);
  cleanUrl.searchParams.delete("token");
  window.history.replaceState({}, document.title, `${cleanUrl.pathname}${cleanUrl.search}${cleanUrl.hash}`);
}

const cookieToken = document.cookie
  .split(";")
  .map((part) => part.trim())
  .find((part) => part.startsWith("eazinvoice_token="))
  ?.split("=")[1];
const token = localStorage.getItem("eazinvoice_token")
  || sessionStorage.getItem("eazinvoice_token")
  || (cookieToken ? decodeURIComponent(cookieToken) : "")
  || tokenFromUrl;

const legacyAccessDestinations = {
  dashboard: "/apps/web/dashboard.html",
  invoice: "/apps/web/dashboard.html#invoices",
  po: "/apps/web/dashboard.html#purchase-orders",
  reports: "/apps/web/dashboard.html#reports",
  ai: "/apps/web/dashboard.html#ai-agent",
  features: "/apps/web/subscription.html",
};
if (legacyAccessDestinations[legacyAccessTab]) {
  window.location.replace(legacyAccessDestinations[legacyAccessTab]);
}

const app = document.getElementById("accessApp");
const tabs = document.querySelectorAll(".access-tab");
const panes = document.querySelectorAll(".access-pane");
const logout = document.getElementById("accessLogout");
const accessProfileMenu = document.getElementById("accessProfileMenu");
const accessProfileButton = document.getElementById("accessProfileButton");
const accessProfileDropdown = document.getElementById("accessProfileDropdown");
const accessProfileInitials = document.getElementById("accessProfileInitials");
const accessProfileName = document.getElementById("accessProfileName");
const accessProfileMeta = document.getElementById("accessProfileMeta");
const accessDropdownName = document.getElementById("accessDropdownName");
const accessDropdownEmail = document.getElementById("accessDropdownEmail");
const accessAdminLink = document.getElementById("accessAdminLink");
const profileForm = document.getElementById("profileForm");
const companyForm = document.getElementById("companyAccessForm");
const profileStatus = document.getElementById("profileStatus");
const companyStatus = document.getElementById("companyStatus");
const companyAccessTab = document.getElementById("companyAccessTab");
const addCompanyAccessBtn = document.getElementById("addCompanyAccessBtn");
const companyAccessHint = document.getElementById("companyAccessHint");
const accessTierBanner = document.getElementById("accessTierBanner");
const accessTierBannerBadge = document.getElementById("accessTierBannerBadge");
const accessTierBannerTitle = document.getElementById("accessTierBannerTitle");
const accessTierBannerText = document.getElementById("accessTierBannerText");
const accessTierBannerTags = document.getElementById("accessTierBannerTags");
const accessTierBannerMetric = document.getElementById("accessTierBannerMetric");
const accessTierBannerMetricText = document.getElementById("accessTierBannerMetricText");

let currentUser = null;
let companies = [];
let plan = null;
let adminAuthorized = false;

function authHeaders() {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request(path, { method = "GET", body } = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: body ? JSON.stringify(body) : undefined,
  });
  const responseText = await response.text();
  let payload = {};
  if (responseText) {
    try {
      payload = JSON.parse(responseText);
    } catch {
      payload = { message: responseText };
    }
  }
  if (!response.ok) throw new Error(payload.error || payload.message || `Request failed (${response.status})`);
  return payload;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function setText(id, value) {
  const node = document.getElementById(id);
  if (node) node.textContent = value;
}

function renderTierBanner() {
  if (!accessTierBanner) return;
  const tier = (plan?.plan || "free").toLowerCase();
  if (app) app.dataset.plan = tier;
  if (accessTierBannerBadge) accessTierBannerBadge.textContent = plan?.label || `${tier.charAt(0).toUpperCase()}${tier.slice(1)} plan`;
  if (accessTierBannerTitle) accessTierBannerTitle.textContent = "Your account and plan";
  if (accessTierBannerText) accessTierBannerText.textContent = "Keep your account, business identity, and subscription details current.";
  if (accessTierBannerMetric) accessTierBannerMetric.textContent = "Workspace";
  if (accessTierBannerMetricText) accessTierBannerMetricText.textContent = "Open Workspace for invoices, PO/WO, reports, payments, and AI.";
  if (accessTierBannerTags) {
    accessTierBannerTags.innerHTML = ["Account profile", "Business profile", "Subscription"]
      .map((tag) => `<span class="pill blue">${escapeHtml(tag)}</span>`)
      .join("");
  }
}

const validTabs = new Set(Array.from(tabs).map((tab) => tab.dataset.tab).filter(Boolean));

function requestedTab() {
  const queryTab = new URLSearchParams(window.location.search).get("tab");
  const hashTab = window.location.hash ? window.location.hash.replace(/^#/, "") : "";
  return validTabs.has(queryTab) ? queryTab : validTabs.has(hashTab) ? hashTab : "status";
}

function showTab(name, { push = true } = {}) {
  const nextTab = validTabs.has(name) ? name : "status";
  tabs.forEach((tab) => tab.classList.toggle("active", tab.dataset.tab === nextTab));
  panes.forEach((pane) => {
    pane.hidden = pane.dataset.pane !== nextTab;
  });
  if (push) {
    const url = new URL(window.location.href);
    url.searchParams.set("tab", nextTab);
    window.history.pushState({ tab: nextTab }, "", `${url.pathname}${url.search}${url.hash}`);
  }
}

function fillForm(form, values) {
  if (!form) return;
  Object.entries(values).forEach(([key, value]) => {
    const input = form.elements[key];
    if (!input) return;
    if (input.type === "checkbox") input.checked = Boolean(value);
    else input.value = value || "";
  });
}

function renderAccess() {
  const activeCompany = companies[0] || null;
  const type = currentUser?.subscriberType || (currentUser?.registrant ? "company" : "individual");
  const displayName = currentUser?.name || currentUser?.email || "User";
  const initials = displayName.split(/\s+/).filter(Boolean).slice(0, 2)
    .map((part) => part[0]?.toUpperCase()).join("") || "U";

  accessProfileMenu?.removeAttribute("hidden");
  if (accessProfileInitials) accessProfileInitials.textContent = initials;
  if (accessProfileName) accessProfileName.textContent = displayName;
  if (accessProfileMeta) accessProfileMeta.textContent = adminAuthorized ? "Admin account" : `${(plan?.plan || "free").toUpperCase()} plan`;
  if (accessDropdownName) accessDropdownName.textContent = displayName;
  if (accessDropdownEmail) accessDropdownEmail.textContent = currentUser?.email || "";
  if (accessAdminLink) accessAdminLink.hidden = !adminAuthorized;

  localStorage.setItem("eazinvoice_user", JSON.stringify({
    name: displayName,
    email: currentUser?.email || "",
    role: currentUser?.role || "user",
    plan: plan?.plan || "free",
  }));

  setText("accessName", displayName);
  setText("accessEmail", currentUser?.email || "");
  setText("accessCompany", activeCompany
    ? `${activeCompany.name || "Business"} - ${activeCompany.entityType || "business"}`
    : type === "individual" ? "Individual account - no business profile yet" : "No business profile yet");
  setText("accessIntro", "Manage your profile, business details, account settings and subscription.");
  setText("accessPlanBadge", `${(plan?.plan || "free").toUpperCase()} Plan`);
  setText("statusPlan", (plan?.plan || "free").toUpperCase());
  setText("statusCompanies", `${companies.length}/${plan?.limits?.companies || 1}`);
  setText("statusEmail", currentUser?.emailVerified ? "Verified" : "Pending");
  setText("statusMobile", currentUser?.phone ? "Registered" : "Pending");
  renderTierBanner();

  const activity = document.getElementById("statusActivity");
  if (activity) {
    activity.innerHTML = `
      <div class="invoice-card">
        <div><strong>Account status</strong><div class="hint">${adminAuthorized ? "Administrator account" : "Standard account access"}</div></div>
        <span class="pill blue">${escapeHtml(currentUser?.accountStatus || "active")}</span>
      </div>
      <div class="invoice-card">
        <div><strong>Business profile</strong><div class="hint">${activeCompany ? escapeHtml(activeCompany.name || "Business details saved") : "No business profile saved"}</div></div>
        <span class="pill gold">${activeCompany ? "Available" : "Optional"}</span>
      </div>
      <div class="invoice-card">
        <div><strong>Plan and subscription</strong><div class="hint">${escapeHtml(plan?.status?.reason || "Account is within plan limits")}</div></div>
        <a class="ghost small" href="/apps/web/subscription.html">Manage</a>
      </div>`;
  }

  fillForm(profileForm, {
    name: currentUser?.name,
    email: currentUser?.email,
    phone: currentUser?.phone,
    role: currentUser?.role || "user",
    panNumber: currentUser?.panNumber,
    aadhaarNumber: currentUser?.aadhaarNumber,
  });
  fillForm(companyForm, activeCompany || { entityType: "company", name: "" });

  if (companyAccessTab) companyAccessTab.hidden = false;
  if (addCompanyAccessBtn) {
    addCompanyAccessBtn.hidden = Boolean(activeCompany);
    addCompanyAccessBtn.dataset.opening = "";
  }
  if (companyAccessHint) {
    companyAccessHint.textContent = activeCompany
      ? "Update the business identity associated with this account."
      : "Add a business identity without changing the existing profile data contract.";
  }
}

function normalizeRejectedAdminRoute() {
  if (legacyAccessTab !== "admin") return;
  const url = new URL(window.location.href);
  url.searchParams.delete("tab");
  window.history.replaceState({}, document.title, `${url.pathname}${url.search}${url.hash}`);
}

async function loadAccess() {
  if (!token) {
    window.location.replace("/apps/web/auth.html?tab=login");
    return;
  }
  try {
    const me = await request("/me");
    currentUser = me.user;
    plan = me.plan;
    adminAuthorized = Boolean(me.admin?.authorized);
    if (legacyAccessTab === "admin" && adminAuthorized) {
      window.location.replace("/apps/web/admin.html");
      return;
    }
    normalizeRejectedAdminRoute();
    companies = await request("/companies");
    renderAccess();
    app?.removeAttribute("hidden");
  } catch {
    localStorage.removeItem("eazinvoice_token");
    sessionStorage.removeItem("eazinvoice_token");
    window.location.replace("/apps/web/auth.html?tab=login");
  }
}

tabs.forEach((tab) => tab.addEventListener("click", () => showTab(tab.dataset.tab)));
window.addEventListener("popstate", () => showTab(requestedTab(), { push: false }));

logout?.addEventListener("click", () => {
  localStorage.removeItem("eazinvoice_token");
  sessionStorage.removeItem("eazinvoice_token");
  localStorage.removeItem("eazinvoice_user");
  document.cookie = "eazinvoice_token=; path=/; Max-Age=0; SameSite=Lax";
  window.location.href = "/apps/web/index.html";
});

accessProfileButton?.addEventListener("click", () => {
  const isOpen = !accessProfileDropdown?.hidden;
  if (accessProfileDropdown) accessProfileDropdown.hidden = isOpen;
  accessProfileButton.setAttribute("aria-expanded", String(!isOpen));
});

document.addEventListener("click", (event) => {
  if (!accessProfileDropdown || accessProfileDropdown.hidden || !accessProfileButton) return;
  const target = event.target;
  if (target instanceof Node && (accessProfileDropdown.contains(target) || accessProfileButton.contains(target))) return;
  accessProfileDropdown.hidden = true;
  accessProfileButton.setAttribute("aria-expanded", "false");
});

document.querySelectorAll(".profile-tab-jump").forEach((button) => {
  button.addEventListener("click", () => {
    showTab(button.dataset.profileTab || "profile");
    if (accessProfileDropdown) accessProfileDropdown.hidden = true;
    accessProfileButton?.setAttribute("aria-expanded", "false");
  });
});

profileForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = new FormData(profileForm);
  const type = currentUser?.subscriberType || (currentUser?.registrant ? "company" : "individual");
  const panNumber = String(data.get("panNumber") || "").trim();
  const currentPassword = String(data.get("currentPassword") || "");
  const newPassword = String(data.get("newPassword") || "");
  if (type === "individual" && !panNumber) {
    if (profileStatus) profileStatus.textContent = "PAN number is mandatory for individual profiles.";
    return;
  }
  if (newPassword && !currentPassword) {
    if (profileStatus) profileStatus.textContent = "Enter current password before setting a new password.";
    return;
  }
  try {
    const updated = await request("/me", {
      method: "PATCH",
      body: {
        name: data.get("name"),
        phone: data.get("phone"),
        panNumber,
        aadhaarNumber: data.get("aadhaarNumber"),
        currentPassword,
        newPassword,
      },
    });
    currentUser = updated.user;
    if (profileForm.elements.currentPassword) profileForm.elements.currentPassword.value = "";
    if (profileForm.elements.newPassword) profileForm.elements.newPassword.value = "";
    if (profileStatus) profileStatus.textContent = "Account profile updated.";
    renderAccess();
  } catch (error) {
    if (profileStatus) profileStatus.textContent = error.message;
  }
});

addCompanyAccessBtn?.addEventListener("click", () => {
  showTab("company");
  if (companyStatus) companyStatus.textContent = "Complete the business details and save the profile.";
});

companyForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = new FormData(companyForm);
  try {
    const payload = {
      profilePurpose: "onboarding",
      name: data.get("name"),
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
    const existingCompany = companies[0];
    const company = existingCompany
      ? await request(`/companies/${existingCompany.id}`, { method: "PATCH", body: payload })
      : await request("/companies", { method: "POST", body: payload });
    companies = [company, ...companies.filter((entry) => entry.id !== company.id)];
    if ((currentUser?.subscriberType || "individual") === "individual") {
      const updated = await request("/me", {
        method: "PATCH",
        body: { subscriberType: "company" },
      });
      currentUser = updated.user;
    }
    if (companyStatus) companyStatus.textContent = `Saved ${company.name}.`;
    renderAccess();
  } catch (error) {
    if (companyStatus) companyStatus.textContent = error.message;
  }
});

if (!legacyAccessDestinations[legacyAccessTab]) {
  showTab(requestedTab(), { push: false });
  loadAccess();
}
