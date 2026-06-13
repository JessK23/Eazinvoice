const API_BASE = window.location.origin;
const tokenFromUrl = new URLSearchParams(window.location.search).get("token") || "";
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
const profileForm = document.getElementById("profileForm");
const companyForm = document.getElementById("companyAccessForm");
const profileStatus = document.getElementById("profileStatus");
const companyStatus = document.getElementById("companyStatus");
const adminAccessTab = document.getElementById("adminAccessTab");
const companyAccessTab = document.getElementById("companyAccessTab");
const addCompanyAccessBtn = document.getElementById("addCompanyAccessBtn");
const companyAccessHint = document.getElementById("companyAccessHint");
const accessDraftInvoiceCount = document.getElementById("accessDraftInvoiceCount");
const accessCreatedInvoiceCount = document.getElementById("accessCreatedInvoiceCount");
const accessDraftInvoicesList = document.getElementById("accessDraftInvoicesList");
const accessCreatedInvoicesList = document.getElementById("accessCreatedInvoicesList");
const accessDraftPoCount = document.getElementById("accessDraftPoCount");
const accessCreatedPoCount = document.getElementById("accessCreatedPoCount");

let currentUser = null;
let companies = [];
let customers = [];
let invoices = [];
let purchaseOrders = [];
let plan = null;
let adminAuthorized = false;

function authHeaders() {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request(path, { method = "GET", body } = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "Request failed");
  return payload;
}

function money(value) {
  return `INR ${Number(value || 0).toFixed(2)}`;
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

function badge(text, tone = "blue") {
  return `<span class="pill ${tone}">${text}</span>`;
}

const validTabs = new Set(Array.from(tabs).map((tab) => tab.dataset.tab).filter(Boolean));

function requestedTab() {
  const queryTab = new URLSearchParams(window.location.search).get("tab");
  const hashTab = window.location.hash ? window.location.hash.replace(/^#/, "") : "";
  return validTabs.has(queryTab) ? queryTab : validTabs.has(hashTab) ? hashTab : "status";
}

function showTab(name, { push = true } = {}) {
  if (name === "company" && companyAccessTab?.hidden && !addCompanyAccessBtn?.dataset.opening) return;
  tabs.forEach((tab) => tab.classList.toggle("active", tab.dataset.tab === name));
  panes.forEach((pane) => {
    pane.hidden = pane.dataset.pane !== name;
  });
  if (push) {
    const url = new URL(window.location.href);
    url.searchParams.set("tab", name);
    window.history.pushState({ tab: name }, "", `${url.pathname}${url.search}${url.hash}`);
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
  const hasCompanyControls = type === "company" || type === "group";
  const displayName = activeCompany?.name || currentUser?.name || currentUser?.email || "User";
  const initials = displayName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "U";
  accessProfileMenu?.removeAttribute("hidden");
  if (accessProfileInitials) accessProfileInitials.textContent = initials;
  if (accessProfileName) accessProfileName.textContent = displayName;
  if (accessProfileMeta) accessProfileMeta.textContent = adminAuthorized ? "Admin account" : `${(plan?.plan || "free").toUpperCase()} plan`;
  if (accessDropdownName) accessDropdownName.textContent = displayName;
  if (accessDropdownEmail) accessDropdownEmail.textContent = currentUser?.email || "";
  localStorage.setItem("eazinvoice_user", JSON.stringify({
    name: displayName,
    email: currentUser?.email || "",
    role: currentUser?.role || "user",
    plan: plan?.plan || "free",
  }));
  setText("accessName", activeCompany?.name || currentUser?.name || currentUser?.email || "User");
  setText("accessEmail", currentUser?.email || "");
  setText("accessCompany", activeCompany ? `${activeCompany.entityType || "business"} - ${activeCompany.state || "state pending"}` : type === "individual" ? "Individual profile" : "No company profile yet");
  setText("accessIntro", type === "individual"
    ? "Manage your personal profile, invoices, purchase orders, reports, and plan features from one place."
    : "Manage your profile, company profile, invoices, purchase orders, reports, and plan features from one place.");
  setText("accessPlanBadge", `${(plan?.plan || "free").toUpperCase()} Plan`);
  setText("statusPlan", (plan?.plan || "free").toUpperCase());
  setText("statusInvoices", String(invoices.length));
  setText("statusCompanies", `${companies.length}/${plan?.limits?.companies || 1}`);
  setText("statusCustomers", `${customers.length}/${plan?.limits?.customers || 100}`);
  setText("statusPo", String(purchaseOrders.length));
  setText("statusEmail", currentUser?.emailVerified ? "Verified" : "Pending");
  setText("statusMobile", currentUser?.phone ? "Registered" : "Pending");

  const total = invoices.reduce((sum, invoice) => sum + Number(invoice.total || 0), 0);
  const activity = document.getElementById("statusActivity");
  if (activity) {
    activity.innerHTML = `
      <div class="invoice-card">
        <div><strong>Account status</strong><div class="hint">${adminAuthorized ? "Admin access enabled" : "Normal user access"}</div></div>
        <span class="pill blue">${escapeHtml(currentUser?.accountStatus || "active")}</span>
      </div>
      <div class="invoice-card">
        <div><strong>Total invoice value</strong><div class="hint">${money(total)} across saved invoices</div></div>
        <span class="pill gold">Billing</span>
      </div>
      <div class="invoice-card">
        <div><strong>Plan usage</strong><div class="hint">${escapeHtml(plan?.status?.reason || "within limits")}</div></div>
        <span class="pill maroon">Tier</span>
      </div>
    `;
  }

  fillForm(profileForm, {
    name: currentUser?.name,
    email: currentUser?.email,
    phone: currentUser?.phone,
    role: currentUser?.role || "user",
    panNumber: currentUser?.panNumber,
    aadhaarNumber: currentUser?.aadhaarNumber,
  });

  fillForm(companyForm, activeCompany || {
    entityType: currentUser?.registrant ? "company" : "company",
    name: activeCompany?.name || "",
  });

  if (adminAccessTab) adminAccessTab.hidden = !adminAuthorized;
  if (companyAccessTab) companyAccessTab.hidden = !hasCompanyControls;
  if (addCompanyAccessBtn) {
    addCompanyAccessBtn.hidden = type !== "individual";
    addCompanyAccessBtn.dataset.opening = "";
  }
  if (companyAccessHint) {
    companyAccessHint.textContent = type === "individual"
      ? "Do you want to add a company? Save the company details and your login access will switch to company mode."
      : type === "group"
        ? "Add or update company profiles under this group login."
        : "Update your registered company profile.";
  }
  if (!hasCompanyControls && document.querySelector('.access-pane[data-pane="company"]')?.hidden === false) {
    showTab("profile");
  }
  renderAccessInvoiceWorkspace();
  renderAccessPoWorkspace();
}

function createdInvoicesOnly(records) {
  return records.filter((invoice) => String(invoice.status || "created").toLowerCase() !== "draft");
}

function renderAccessInvoiceWorkspace() {
  const drafts = invoices.filter((invoice) => String(invoice.status || "").toLowerCase() === "draft");
  const created = createdInvoicesOnly(invoices);
  if (accessDraftInvoiceCount) accessDraftInvoiceCount.textContent = String(drafts.length);
  if (accessCreatedInvoiceCount) accessCreatedInvoiceCount.textContent = String(created.length);

  const row = (invoice, tone) => `
    <div class="invoice-card">
      <div>
        <strong>${escapeHtml(invoice.invoiceNumber || "Draft invoice")}</strong>
        <div class="hint">${escapeHtml(invoice.billToName || "Customer")} - ${escapeHtml(invoice.invoiceDate || "No date")} - ${escapeHtml(invoice.currency || "INR")} ${Number(invoice.total || 0).toFixed(2)}</div>
      </div>
      <div class="row-actions">
        <a class="ghost small" href="/apps/web/invoice.html?invoice=${encodeURIComponent(invoice.id)}">Open</a>
        <span class="pill ${tone}">${escapeHtml(String(invoice.status || (tone === "gold" ? "draft" : "created")).toUpperCase())}</span>
      </div>
    </div>
  `;

  if (accessDraftInvoicesList) {
    accessDraftInvoicesList.innerHTML = drafts.length
      ? drafts.slice().reverse().map((invoice) => row(invoice, "gold")).join("")
      : '<div class="notice">No invoice drafts yet.</div>';
  }
  if (accessCreatedInvoicesList) {
    accessCreatedInvoicesList.innerHTML = created.length
      ? created.slice().reverse().map((invoice) => row(invoice, "blue")).join("")
      : '<div class="notice">No generated invoices yet.</div>';
  }
}

function renderAccessPoWorkspace() {
  const drafts = purchaseOrders.filter((po) => String(po.status || "").toLowerCase() === "draft");
  const created = purchaseOrders.filter((po) => String(po.status || "created").toLowerCase() !== "draft");
  if (accessDraftPoCount) accessDraftPoCount.textContent = String(drafts.length);
  if (accessCreatedPoCount) accessCreatedPoCount.textContent = String(created.length);
}

function renderAdminUsers(users) {
  const adminUsers = document.getElementById("accessAdminUsers");
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
            ${(user.permissions || []).map((permission) => badge(permission.replace(/-/g, " ").toUpperCase(), "gold")).join("") || badge("NO PERMISSIONS", "blue")}
          </div>
          <div class="hint">${user.restrictedReason ? `Reason: ${escapeHtml(user.restrictedReason)}` : "No restriction reason"}</div>
        </div>
        <div class="actions">
          <button class="ghost small" data-admin-action="restrict" data-user="${escapeHtml(user.id)}">Restrict</button>
          <button class="ghost small" data-admin-action="restore" data-user="${escapeHtml(user.id)}">Restore</button>
          <button class="ghost small" data-admin-action="kyc-review" data-user="${escapeHtml(user.id)}">Grant KYC Review</button>
        </div>
      </div>
    `).join("")
    : "<p>No users yet.</p>";

  adminUsers.querySelectorAll("button[data-user]").forEach((button) => {
    button.addEventListener("click", async () => {
      const userId = button.getAttribute("data-user");
      const action = button.getAttribute("data-admin-action");
      if (action === "kyc-review") {
        await request(`/admin/users/${userId}?action=permissions`, {
          method: "PATCH",
          body: { permissions: ["kyc-review"] },
        });
      } else {
        const reason = action === "restrict" ? "Suspicious activity review" : "";
        await request(`/admin/users/${userId}?action=${encodeURIComponent(action)}`, {
          method: "PATCH",
          body: { reason },
        });
      }
      const refreshed = await request("/admin/users");
      renderAdminUsers(refreshed.users || []);
    });
  });
}

function renderAdminKyc(companiesForReview) {
  const kycQueue = document.getElementById("accessAdminKyc");
  if (!kycQueue) return;
  kycQueue.innerHTML = companiesForReview.length
    ? companiesForReview.map((company) => `
      <div class="invoice-card">
        <div>
          <strong>${escapeHtml(company.name || "Company")}</strong>
          <div class="hint">${escapeHtml(company.entityType || "company")} - KYC ${escapeHtml(company.kycStatus || "pending")} - Review ${escapeHtml(company.reviewStatus || "pending")}</div>
          <div class="badge-row">
            ${badge((company.kycStatus || "pending").toUpperCase(), company.kycStatus === "verified" ? "blue" : "gold")}
            ${badge((company.reviewStatus || "pending").toUpperCase(), company.reviewStatus === "approved" ? "blue" : company.reviewStatus === "rejected" ? "maroon" : "gold")}
          </div>
          <div class="hint">Docs: ${escapeHtml((company.documentNames || []).join(", ") || "none")}</div>
        </div>
        <div class="actions">
          <button class="ghost small" data-kyc-action="approve" data-company="${escapeHtml(company.id)}">Approve</button>
          <button class="ghost small" data-kyc-action="reject" data-company="${escapeHtml(company.id)}">Reject</button>
        </div>
      </div>
    `).join("")
    : "<p>No KYC items waiting for review.</p>";

  kycQueue.querySelectorAll("button[data-company]").forEach((button) => {
    button.addEventListener("click", async () => {
      const companyId = button.getAttribute("data-company");
      const action = button.getAttribute("data-kyc-action");
      const reason = action === "reject" ? "KYC documents need review" : "Approved by admin";
      await request(`/admin/kyc-review/${companyId}?action=${encodeURIComponent(action)}`, {
        method: "PATCH",
        body: { reason },
      });
      const refreshed = await request("/admin/kyc-review");
      renderAdminKyc(refreshed.companies || []);
    });
  });
}

async function loadAdminAccess() {
  if (!adminAuthorized) return;
  const [moneyPayload, usersPayload, kycPayload] = await Promise.all([
    request("/admin/money"),
    request("/admin/users"),
    request("/admin/kyc-review"),
  ]);
  const summary = moneyPayload.summary || {};
  setText("accessAdminTotal", money(summary.totalAmount));
  setText("accessAdminCount", String(summary.count || 0));
  setText("accessAdminCompany", money(summary.byType?.company || 0));
  setText("accessAdminIndividual", money(summary.byType?.individual || 0));
  setText("accessAdminGroup", money(summary.byType?.group || 0));
  const subscriptions = document.getElementById("accessAdminSubscriptions");
  if (subscriptions) {
    subscriptions.innerHTML = (moneyPayload.subscriptions || []).length
      ? moneyPayload.subscriptions.map((subscription) => `
        <div class="invoice-card">
          <div>
            <strong>${escapeHtml(subscription.subscriberName || subscription.groupName || subscription.subscriberType || "Subscriber")}</strong>
            <div class="hint">${escapeHtml(subscription.subscriberType || "user")} - ${escapeHtml(subscription.plan || "free")} - ${escapeHtml(subscription.currency || "INR")} ${Number(subscription.amount || 0).toFixed(2)}</div>
          </div>
          <span class="pill blue">${escapeHtml(subscription.status || "active")}</span>
        </div>
      `).join("")
      : "<p>No subscriptions yet.</p>";
  }
  renderAdminUsers(usersPayload.users || []);
  renderAdminKyc(kycPayload.companies || []);
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
    companies = await request("/companies");
    customers = await request("/customers");
    invoices = await request("/invoices");
    purchaseOrders = await request("/purchase-orders");
    renderAccess();
    await loadAdminAccess();
    app?.removeAttribute("hidden");
  } catch {
    localStorage.removeItem("eazinvoice_token");
    window.location.replace("/apps/web/auth.html?tab=login");
  }
}

tabs.forEach((tab) => {
  tab.addEventListener("click", () => showTab(tab.dataset.tab));
});

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
    if (profileStatus) profileStatus.textContent = "Profile updated.";
    renderAccess();
  } catch (error) {
    if (profileStatus) profileStatus.textContent = error.message;
  }
});

addCompanyAccessBtn?.addEventListener("click", () => {
  addCompanyAccessBtn.dataset.opening = "true";
  showTab("company");
  if (companyStatus) companyStatus.textContent = "Do you want to add a company? Fill the details and save.";
  addCompanyAccessBtn.dataset.opening = "";
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

showTab(requestedTab(), { push: false });
loadAccess();
