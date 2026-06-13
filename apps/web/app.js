import { apiClient } from "../../api/src/client.js";

const companyForm = document.getElementById("companyForm");
const invoiceForm = document.getElementById("invoiceForm");
const authForm = document.getElementById("authForm");
const authTitle = document.getElementById("authTitle");
const authStatus = document.getElementById("authStatus");
const authView = document.getElementById("authView");
const homeView = document.getElementById("homeView");
const appShell = document.getElementById("appShell");
const signupTab = document.getElementById("signupTab");
const loginTab = document.getElementById("loginTab");
const googleAuth = document.getElementById("googleAuth");
const itemsEl = document.getElementById("items");
const previewRows = document.getElementById("previewRows");
const invoiceList = document.getElementById("invoiceList");
const planSummary = document.getElementById("planSummary");
const companyStatus = document.getElementById("companyStatus");
const invoiceStatus = document.getElementById("invoiceStatus");
const logoutBtn = document.getElementById("logoutBtn");
const openSignup = document.getElementById("openSignup");
const openLogin = document.getElementById("openLogin");
const adminPanel = document.getElementById("adminPanel");
const adminTotal = document.getElementById("adminTotal");
const adminCount = document.getElementById("adminCount");
const adminCompany = document.getElementById("adminCompany");
const adminIndividual = document.getElementById("adminIndividual");
const adminGroup = document.getElementById("adminGroup");
const adminSubscriptions = document.getElementById("adminSubscriptions");

let token = localStorage.getItem("eazinvoice_token") || "";
let authMode = "signup";
let currentCompany = null;
let currentCustomer = null;

function money(value) {
  return Number(value || 0).toFixed(2);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function setView(mode) {
  if (!authForm) return;
  authMode = mode;
  signupTab?.classList.toggle("active", mode === "signup");
  loginTab?.classList.toggle("active", mode === "login");
  if (authTitle) authTitle.textContent = mode === "signup" ? "Create your free account" : "Welcome back";
  const submitButton = authForm.querySelector('button[type="submit"]');
  if (submitButton) submitButton.textContent = mode === "signup" ? "Continue" : "Sign in";
  const nameField = authForm.querySelector('input[name="name"]');
  if (nameField?.parentElement) nameField.parentElement.hidden = mode === "login";
}

function readSubscriptionForm() {
  const formData = new FormData(authForm);
  return {
    subscriberType: formData.get("subscriberType"),
    amount: Number(formData.get("subscriptionAmount") || 0),
    currency: formData.get("currency") || "INR",
  };
}

function setAuthed(isAuthed) {
  if (homeView) homeView.hidden = isAuthed;
  if (authView) authView.hidden = isAuthed;
  if (appShell) appShell.hidden = !isAuthed;
}

function createItemRow(data = {}) {
  const row = document.createElement("div");
  row.className = "item-row";
  row.innerHTML = `
    <label>Description <input name="description" value="${escapeHtml(data.description ?? "")}" placeholder="Service fee" /></label>
    <label>Qty <input name="quantity" type="number" min="0" value="${Number(data.quantity ?? 1)}" /></label>
    <label>Rate <input name="rate" type="number" min="0" value="${Number(data.rate ?? 0)}" /></label>
    <button type="button" class="ghost">Remove</button>
  `;
  row.querySelector("button").addEventListener("click", () => {
    row.remove();
    renderPreview();
  });
  row.querySelectorAll("input").forEach((input) => input.addEventListener("input", renderPreview));
  return row;
}

function readItems() {
  return [...itemsEl.querySelectorAll(".item-row")].map((row) => ({
    description: row.querySelector('input[name="description"]').value,
    quantity: Number(row.querySelector('input[name="quantity"]').value || 0),
    rate: Number(row.querySelector('input[name="rate"]').value || 0),
  }));
}

function totals(items, taxRate) {
  const subtotal = items.reduce((sum, item) => sum + item.quantity * item.rate, 0);
  const taxAmount = subtotal * (taxRate / 100);
  return { subtotal, taxAmount, total: subtotal + taxAmount };
}

function renderPreview() {
  if (!invoiceForm || !itemsEl || !previewRows) return;
  const formData = new FormData(invoiceForm);
  const items = readItems();
  const taxRate = Number(formData.get("taxRate") || 0);
  const t = totals(items, taxRate);
  const invoiceDate = formData.get("invoiceDate") || new Date().toISOString().slice(0, 10);
  const dueDate = formData.get("dueDate") || "";
  document.getElementById("subtotal").textContent = money(t.subtotal);
  document.getElementById("taxAmount").textContent = money(t.taxAmount);
  document.getElementById("grandTotal").textContent = money(t.total);
  document.getElementById("previewSubtotal").textContent = money(t.subtotal);
  document.getElementById("previewTax").textContent = money(t.taxAmount);
  document.getElementById("previewTotal").textContent = money(t.total);
  document.getElementById("previewMeta").innerHTML = `
    <div class="meta-box"><strong>Invoice Date</strong><div>${escapeHtml(invoiceDate)}</div></div>
    <div class="meta-box"><strong>Due Date</strong><div>${escapeHtml(dueDate || "-")}</div></div>
    <div class="meta-box"><strong>Company</strong><div>${escapeHtml(currentCompany?.name || "Not saved yet")}</div></div>
  `;
  previewRows.innerHTML = items.map((item) => `
    <tr>
      <td>${escapeHtml(item.description || "-")}</td>
      <td>${item.quantity}</td>
      <td>${money(item.rate)}</td>
      <td>${money(item.quantity * item.rate)}</td>
    </tr>
  `).join("");
}

async function renderPlan() {
  if (!planSummary) return;
  const summary = await apiClient.getPlan(token);
  planSummary.innerHTML = `
    <strong>${escapeHtml(summary.plan.toUpperCase())}</strong><br />
    Companies: ${summary.usage.companies}/${summary.limits.companies}<br />
    Customers: ${summary.usage.customers}/${summary.limits.customers}<br />
    Invoices: ${summary.usage.invoicesPerMonth}/${summary.limits.invoicesPerMonth}
  `;
}

async function renderInvoices() {
  if (!invoiceList) return;
  const invoices = await apiClient.listInvoices(token);
  invoiceList.innerHTML = invoices.length
    ? invoices.map((invoice) => `
      <div class="invoice-card">
        <div>
          <strong>${escapeHtml(invoice.invoiceNumber || "Invoice")}</strong>
          <div>${escapeHtml(invoice.invoiceDate || "No date")} - Total ${money(invoice.total)}</div>
        </div>
        <span class="pill maroon">${invoice.items.length} items</span>
      </div>
    `).join("")
    : "<p>No invoices yet.</p>";
}

async function renderAdminPanel() {
  if (!adminPanel || !adminTotal || !adminCount || !adminCompany || !adminIndividual || !adminGroup || !adminSubscriptions) return;
  const payload = await apiClient.getAdminMoney(token);
  const summary = payload.summary;
  adminPanel.hidden = false;
  adminTotal.textContent = money(summary.totalAmount);
  adminCount.textContent = String(summary.count);
  adminCompany.textContent = money(summary.byType.company || 0);
  adminIndividual.textContent = money(summary.byType.individual || 0);
  adminGroup.textContent = money(summary.byType.group || 0);
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

async function restoreSession() {
  const tokenFromUrl = new URLSearchParams(window.location.search).get("token");
  if (tokenFromUrl) {
    token = tokenFromUrl;
    localStorage.setItem("eazinvoice_token", token);
    window.history.replaceState({}, document.title, window.location.pathname);
  }
  if (!token) {
    if (window.location.pathname.endsWith("/dashboard.html") || window.location.pathname.endsWith("/admin.html")) {
      window.location.href = "/apps/web/auth.html";
      return;
    }
    setAuthed(false);
    if (homeView) homeView.hidden = false;
    return;
  }
  try {
    await apiClient.me(token);
    setAuthed(true);
    await renderPlan();
    await renderInvoices();
    try {
      await renderAdminPanel();
    } catch {
      if (window.location.pathname.endsWith("/admin.html")) {
        window.location.href = "/apps/web/dashboard.html";
        return;
      }
      if (adminPanel) adminPanel.hidden = true;
    }
  } catch {
    token = "";
    localStorage.removeItem("eazinvoice_token");
    setAuthed(false);
    if (window.location.pathname.endsWith("/dashboard.html") || window.location.pathname.endsWith("/admin.html")) {
      window.location.href = "/apps/web/auth.html";
      return;
    }
    if (homeView) homeView.hidden = false;
  }
}

signupTab?.addEventListener("click", () => setView("signup"));
loginTab?.addEventListener("click", () => setView("login"));

openSignup?.addEventListener("click", () => {
  setView("signup");
  if (authView) authView.hidden = false;
  if (homeView) homeView.hidden = true;
});

openLogin?.addEventListener("click", () => {
  setView("login");
  if (authView) authView.hidden = false;
  if (homeView) homeView.hidden = true;
});

googleAuth?.addEventListener("click", () => {
  window.location.href = apiClient.startGoogleOAuth(authMode);
});

authForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(authForm);
  const payload = {
    name: formData.get("name"),
    email: formData.get("email"),
  };
  try {
    const response = authMode === "login"
      ? await apiClient.login(payload)
      : await apiClient.signup(payload);
    token = response.token;
    localStorage.setItem("eazinvoice_token", token);
    authStatus.textContent = `Signed in as ${response.user.email || response.user.name}`;
    window.location.href = "/apps/web/subscription.html";
  } catch (error) {
    authStatus.textContent = error.message;
  }
});

logoutBtn?.addEventListener("click", () => {
  token = "";
  localStorage.removeItem("eazinvoice_token");
  currentCompany = null;
  currentCustomer = null;
  companyStatus.textContent = "";
  invoiceStatus.textContent = "";
  authStatus.textContent = "";
  setAuthed(false);
  if (homeView) homeView.hidden = false;
  setView("signup");
  if (adminPanel) adminPanel.hidden = true;
});

companyForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(companyForm);
  try {
    currentCompany = await apiClient.createCompany(token, {
      name: formData.get("name"),
      legalName: formData.get("legalName"),
      email: formData.get("email"),
      phone: formData.get("phone"),
    });
    currentCustomer = await apiClient.createCustomer(token, {
      name: "Default Customer",
      companyId: currentCompany.id,
    });
    companyStatus.textContent = `Saved ${currentCompany.name}`;
    await renderPlan();
    renderPreview();
  } catch (error) {
    companyStatus.textContent = error.message;
  }
});

invoiceForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!currentCompany) {
    invoiceStatus.textContent = "Save a company first.";
    return;
  }
  const formData = new FormData(invoiceForm);
  try {
    const invoice = await apiClient.createInvoice(token, {
      companyId: currentCompany.id,
      customerId: currentCustomer?.id ?? null,
      invoiceNumber: formData.get("invoiceNumber"),
      taxRate: Number(formData.get("taxRate") || 0),
      invoiceDate: formData.get("invoiceDate"),
      dueDate: formData.get("dueDate"),
      notes: formData.get("notes"),
      items: readItems(),
    });
    invoiceStatus.textContent = `Saved ${invoice.invoiceNumber}`;
    await renderPlan();
    await renderInvoices();
    try {
      await renderAdminPanel();
    } catch {
      if (adminPanel) adminPanel.hidden = true;
    }
  } catch (error) {
    invoiceStatus.textContent = error.message;
  }
});

document.getElementById("addItem")?.addEventListener("click", () => {
  itemsEl?.appendChild(createItemRow());
  renderPreview();
});

document.getElementById("printInvoice")?.addEventListener("click", () => window.print());

if (itemsEl) {
  itemsEl.appendChild(createItemRow({ description: "Service Fee", quantity: 1, rate: 5000 }));
  itemsEl.appendChild(createItemRow({ description: "Support", quantity: 2, rate: 750 }));
}
invoiceForm?.querySelectorAll("input, textarea").forEach((input) => input.addEventListener("input", renderPreview));

if (authForm) setView("signup");
renderPreview();
restoreSession();
