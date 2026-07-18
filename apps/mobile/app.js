const STORAGE_KEY = "eazinvoice_mobile_workspace_v2";
const PLAN_ORDER = ["free", "standard", "pro", "business"];
const PLAN_PRICES = {
  free: "INR 0",
  standard: "INR 199/month, INR 2,388 yearly",
  pro: "INR 499/month, INR 5,988 yearly",
  business: "INR 999/month, INR 11,988 yearly",
};
const PLAN_LIMITS = {
  free: {
    manualInvoices: "Manual invoice and PO/WO workspace available",
    ai: "AI locked - upgrade to Pro",
    business: "Business tools locked",
  },
  standard: {
    manualInvoices: "Free features plus Standard sharing tools",
    ai: "AI locked - upgrade to Pro",
    business: "Business tools locked",
  },
  pro: {
    manualInvoices: "Free and Standard features included",
    ai: "AI invoice, PO/WO, and report assistant enabled",
    business: "Business tools locked",
  },
  business: {
    manualInvoices: "All previous tier features included",
    ai: "Full AI workflow enabled",
    business: "Teams, API, SMTP, and gateway tools enabled",
  },
};

const state = loadState();
const panels = document.querySelectorAll("[data-panel]");
const navButtons = document.querySelectorAll("[data-view]");
const drawerLinks = document.querySelectorAll(".drawer-link");

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    return {
      plan: PLAN_ORDER.includes(saved.plan) ? saved.plan : "pro",
      invoices: Array.isArray(saved.invoices) ? saved.invoices : [],
      orders: Array.isArray(saved.orders) ? saved.orders : [],
      customers: Array.isArray(saved.customers) ? saved.customers : [],
      vendors: Array.isArray(saved.vendors) ? saved.vendors : [],
      team: Array.isArray(saved.team) ? saved.team : [],
      payments: Array.isArray(saved.payments) ? saved.payments : [],
      smtpValidated: Boolean(saved.smtpValidated),
      gatewayReady: Boolean(saved.gatewayReady),
      apiKeyLabel: saved.apiKeyLabel || "",
    };
  } catch {
    return {
      plan: "pro",
      invoices: [],
      orders: [],
      customers: [],
      vendors: [],
      team: [],
      payments: [],
      smtpValidated: false,
      gatewayReady: false,
      apiKeyLabel: "",
    };
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function money(value, currency = "INR") {
  const amount = number(value).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${currency} ${amount}`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function hasPlan(required) {
  return PLAN_ORDER.indexOf(state.plan) >= PLAN_ORDER.indexOf(required);
}

function documentNumber(type, documentType = "po") {
  const year = new Date().getFullYear();
  if (type === "invoice") {
    return `MOB/INV/${year}/${String(state.invoices.length + 1).padStart(4, "0")}`;
  }
  const prefix = documentType === "wo" ? "WO" : "PO";
  return `MOB/${prefix}/${year}/${String(state.orders.length + 1).padStart(4, "0")}`;
}

function calculateRecord(values) {
  const subtotal = number(values.quantity) * number(values.rate);
  const discount = Math.min(subtotal, Math.max(0, number(values.discount)));
  const taxable = Math.max(0, subtotal - discount);
  const taxAmount = (taxable * number(values.taxRate)) / 100;
  return {
    subtotal,
    discount,
    taxAmount,
    total: taxable + taxAmount,
    paidAmount: 0,
    paymentStatus: "unpaid",
  };
}

function formValues(form, status) {
  const data = new FormData(form);
  const type = data.get("type") === "order" ? "order" : "invoice";
  const documentType = data.get("documentType") === "wo" ? "wo" : "po";
  const values = {
    id: crypto.randomUUID ? crypto.randomUUID() : `ei_${Date.now()}`,
    type,
    documentType,
    status,
    number: documentNumber(type, documentType),
    partyMode: String(data.get("partyMode") || "existing"),
    partyName: String(data.get("partyName") || "").trim(),
    partyEmail: String(data.get("partyEmail") || "").trim(),
    currency: String(data.get("currency") || "INR"),
    itemName: String(data.get("itemName") || "").trim(),
    itemCode: String(data.get("itemCode") || "").trim(),
    quantity: number(data.get("quantity")),
    rate: number(data.get("rate")),
    discount: number(data.get("discount")),
    taxRate: number(data.get("taxRate")),
    paymentTerms: String(data.get("paymentTerms") || ""),
    paymentMode: String(data.get("paymentMode") || ""),
    createdAt: new Date().toISOString(),
  };
  return { ...values, ...calculateRecord(values) };
}

function createdOnly(records) {
  return records.filter((record) => record.status === "created");
}

function withinFilter(record, filter) {
  if (filter === "all") return true;
  const created = new Date(record.createdAt);
  const now = new Date();
  if (filter === "month") {
    return created.getFullYear() === now.getFullYear() && created.getMonth() === now.getMonth();
  }
  if (filter === "year") {
    return created.getFullYear() === now.getFullYear();
  }
  return true;
}

function totals() {
  const filter = document.getElementById("reportFilter")?.value || "all";
  const invoices = createdOnly(state.invoices).filter((record) => withinFilter(record, filter));
  const orders = createdOnly(state.orders).filter((record) => withinFilter(record, filter));
  const income = invoices.reduce((sum, record) => sum + number(record.total), 0);
  const expenses = orders.reduce((sum, record) => sum + number(record.total), 0);
  const unpaid = invoices.reduce((sum, record) => sum + Math.max(0, number(record.total) - number(record.paidAmount)), 0);
  const paidRevenue = invoices.reduce((sum, record) => sum + number(record.paidAmount), 0);
  const payables = orders.reduce((sum, record) => sum + Math.max(0, number(record.total) - number(record.paidAmount)), 0);
  return {
    income,
    expenses,
    profit: income - expenses,
    unpaid,
    paidRevenue,
    payables,
    assets: paidRevenue + unpaid,
    liabilitiesAndEquity: payables + income - expenses,
    workingCapital: unpaid - payables,
  };
}

function setText(id, value) {
  const node = document.getElementById(id);
  if (node) node.textContent = value;
}

function closeDrawer() {
  document.getElementById("drawer")?.classList.remove("open");
}

function switchView(name) {
  const target = panels.length && document.querySelector(`[data-panel="${name}"]`) ? name : "home";
  panels.forEach((panel) => panel.classList.toggle("active", panel.dataset.panel === target));
  navButtons.forEach((button) => button.classList.toggle("active", button.dataset.view === target));
  drawerLinks.forEach((button) => button.classList.toggle("active", button.dataset.view === target));
  closeDrawer();
}

function recordLabel(record) {
  if (record.type !== "order") return "Invoice";
  return record.documentType === "wo" ? "Work Order" : "Purchase Order";
}

function paymentClass(record) {
  if (record.status !== "created") return "amber";
  if (number(record.paidAmount) >= number(record.total)) return "green";
  if (number(record.paidAmount) > 0) return "orange";
  return "red";
}

function paymentText(record) {
  if (record.status !== "created") return "Draft";
  if (number(record.paidAmount) >= number(record.total)) return "Paid";
  if (number(record.paidAmount) > 0) return "Partial";
  return "Unpaid";
}

function recordRow(record) {
  const balance = Math.max(0, number(record.total) - number(record.paidAmount));
  const paymentButton = record.type === "invoice" && record.status === "created"
    ? `<button class="tiny-button" type="button" data-pay="${escapeHtml(record.id)}">Record</button>`
    : "";
  return `
    <article class="record-row">
      <div>
        <strong>${escapeHtml(record.number)}</strong>
        <span>${escapeHtml(recordLabel(record))} - ${escapeHtml(record.partyName || "No party")}</span>
        <small>${escapeHtml(money(record.total, record.currency))} - Balance ${escapeHtml(money(balance, record.currency))}</small>
      </div>
      <div class="row-actions">
        ${paymentButton}
        <mark class="${paymentClass(record)}">${escapeHtml(paymentText(record))}</mark>
      </div>
    </article>
  `;
}

function renderList(id, records, emptyText) {
  const node = document.getElementById(id);
  if (!node) return;
  node.innerHTML = records.length
    ? records.slice().reverse().map(recordRow).join("")
    : `<div class="empty-state">${emptyText}</div>`;
}

function renderChart(summary) {
  const node = document.getElementById("miniChart");
  if (!node) return;
  const max = Math.max(summary.income, summary.expenses, Math.abs(summary.profit), 1);
  const rows = [
    ["Revenue", summary.income, "blue"],
    ["Expenses", summary.expenses, "gold"],
    ["Profit", Math.max(0, summary.profit), "green"],
  ];
  node.innerHTML = rows.map(([label, value, tone]) => {
    const width = Math.max(6, Math.round((value / max) * 100));
    return `
      <div class="bar-row">
        <span>${label}</span>
        <strong>${money(value)}</strong>
        <i class="${tone}" style="width:${width}%"></i>
      </div>
    `;
  }).join("");
}

function renderPlan() {
  const label = state.plan.toUpperCase();
  const limits = PLAN_LIMITS[state.plan] || PLAN_LIMITS.free;
  setText("planName", label);
  setText("manualInvoiceLimit", limits.manualInvoices);
  setText("aiLimitText", limits.ai);
  setText("businessLimitText", limits.business);
  const planSelect = document.getElementById("planSelect");
  if (planSelect) planSelect.value = state.plan;
  document.querySelectorAll("[data-plan-card]").forEach((card) => {
    card.classList.toggle("selected", card.dataset.planCard === state.plan);
    const price = PLAN_PRICES[card.dataset.planCard];
    const priceNode = card.querySelector("em");
    if (price && priceNode) priceNode.textContent = price;
  });
  document.body.dataset.plan = state.plan;
  setText("aiAccessPill", hasPlan("pro") ? "Enabled" : "Locked");
  setText("businessAccessPill", hasPlan("business") ? "Enabled" : "Locked");
}

function renderTeam() {
  renderList("teamList", state.team.map((member) => ({
    ...member,
    type: "team",
    status: "created",
    number: member.role,
    total: 0,
    paidAmount: 0,
    currency: "INR",
  })), "No team invitations yet.");
}

function renderSettings() {
  setText("smtpStatus", state.smtpValidated ? "Validated locally" : "Not validated");
  setText("gatewayStatus", state.gatewayReady ? "Configured locally" : "Not configured");
  const apiKeyResult = document.getElementById("apiKeyResult");
  if (apiKeyResult) {
    apiKeyResult.textContent = state.apiKeyLabel
      ? `${state.apiKeyLabel}: ezi_live_•••••••••••• shown only at creation`
      : "No API key generated in this mobile test workspace.";
  }
}

function render() {
  const summary = totals();
  setText("invoiceCount", String(state.invoices.length));
  setText("poCount", String(state.orders.length));
  setText("customerCount", String(state.customers.length));
  setText("incomeTotal", money(summary.income));
  setText("expenseTotal", money(summary.expenses));
  setText("homeProfitTotal", money(summary.profit));
  setText("reportRevenue", money(summary.income));
  setText("reportExpenses", money(summary.expenses));
  setText("reportProfit", money(summary.profit));
  setText("reportUnpaid", money(summary.unpaid));
  setText("mobileBalanceAssets", `Assets ${money(summary.assets)}`);
  setText("mobileBalanceLiabilities", `Liabilities + equity ${money(summary.liabilitiesAndEquity)}`);
  setText("mobileCashFlow", `Operating ${money(summary.profit)}`);
  setText("mobileWorkingCapital", `Receivables minus payables ${money(summary.workingCapital)}`);
  renderList("invoiceList", state.invoices, "No invoices yet.");
  renderList("poList", state.orders, "No PO / WO records yet.");
  renderList("recentList", [...state.invoices, ...state.orders].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 5), "No recent activity yet.");
  renderTeam();
  renderChart(summary);
  renderPlan();
  renderSettings();
}

function rememberParty(record) {
  if (record.partyMode !== "new" || !record.partyName) return;
  const collection = record.type === "order" ? state.vendors : state.customers;
  const exists = collection.some((entry) => entry.name.toLowerCase() === record.partyName.toLowerCase());
  if (!exists) {
    collection.push({
      id: crypto.randomUUID ? crypto.randomUUID() : `party_${Date.now()}`,
      name: record.partyName,
      email: record.partyEmail,
    });
  }
}

function resetForm(form) {
  form.reset();
  form.querySelector('[name="quantity"]').value = "1";
  form.querySelector('[name="rate"]').value = "0";
  form.querySelector('[name="discount"]').value = "0";
  form.querySelector('[name="taxRate"]').value = "18";
}

function bindDocumentForm(formId, statusId) {
  const form = document.getElementById(formId);
  const statusNode = document.getElementById(statusId);
  if (!form) return;
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const submitter = event.submitter;
    const status = submitter?.dataset.status === "created" ? "created" : "draft";
    const record = formValues(form, status);
    rememberParty(record);
    if (record.type === "order") state.orders.push(record);
    else state.invoices.push(record);
    saveState();
    resetForm(form);
    if (statusNode) statusNode.textContent = `${record.number} ${status === "created" ? "created" : "saved as draft"} successfully.`;
    render();
  });
}

function openPaymentSheet(invoiceId) {
  const invoice = state.invoices.find((record) => record.id === invoiceId);
  if (!invoice) return;
  const balance = Math.max(0, number(invoice.total) - number(invoice.paidAmount));
  if (balance <= 0) return;
  const sheet = document.getElementById("paymentSheet");
  const form = document.getElementById("paymentForm");
  if (!sheet || !form) return;
  form.elements.invoiceId.value = invoiceId;
  form.elements.amount.value = String(balance);
  form.elements.paymentDate.value = new Date().toISOString().slice(0, 10);
  form.elements.reference.value = "";
  form.elements.notes.value = "";
  setText("paymentSummary", `${invoice.number} - Balance ${money(balance, invoice.currency)}`);
  setText("paymentStatus", "");
  sheet.classList.add("open");
  sheet.setAttribute("aria-hidden", "false");
  form.elements.amount.focus();
}

function closePaymentSheet() {
  const sheet = document.getElementById("paymentSheet");
  if (!sheet) return;
  sheet.classList.remove("open");
  sheet.setAttribute("aria-hidden", "true");
}

function addPayment(invoiceId, payment) {
  const invoice = state.invoices.find((record) => record.id === invoiceId);
  if (!invoice) return false;
  const balance = Math.max(0, number(invoice.total) - number(invoice.paidAmount));
  const amount = Math.min(balance, number(payment.amount));
  if (amount <= 0) return false;
  invoice.paidAmount = Math.min(number(invoice.total), number(invoice.paidAmount) + amount);
  invoice.paymentStatus = invoice.paidAmount >= invoice.total ? "paid" : "partial";
  state.payments.push({
    id: crypto.randomUUID ? crypto.randomUUID() : `pay_${Date.now()}`,
    invoiceId,
    amount,
    mode: String(payment.mode || ""),
    reference: String(payment.reference || "").trim(),
    notes: String(payment.notes || "").trim(),
    paymentDate: String(payment.paymentDate || new Date().toISOString().slice(0, 10)),
    createdAt: new Date().toISOString(),
  });
  saveState();
  render();
  return true;
}

function runAiCommand() {
  const result = document.getElementById("aiResult");
  const prompt = document.getElementById("aiPrompt")?.value.trim() || "";
  if (!result) return;
  if (!hasPlan("pro")) {
    result.innerHTML = `<strong>Upgrade required</strong><span>AI Assistant is available from the Pro tier onward.</span>`;
    return;
  }
  if (!prompt) {
    result.innerHTML = `<strong>Enter a command</strong><span>Tell EazAI whether you want an invoice, PO/WO, or report summary.</span>`;
    return;
  }
  const amountMatch = prompt.match(/(?:inr|rs\.?|₹)?\s*([0-9][0-9,]*(?:\.[0-9]+)?)/i);
  const amount = amountMatch ? number(amountMatch[1].replaceAll(",", "")) : 0;
  const taxMatch = prompt.match(/([0-9]+(?:\.[0-9]+)?)\s*%/);
  const taxRate = taxMatch ? number(taxMatch[1]) : 18;
  const isOrder = /\b(po|purchase|work order|vendor|supplier)\b/i.test(prompt);
  const isReport = /\b(report|summary|profit|revenue|expense|unpaid)\b/i.test(prompt);
  const nameMatch = prompt.match(/(?:for|from)\s+([A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+){0,3})/);
  const partyName = nameMatch?.[1] || (isOrder ? "New Vendor" : "New Customer");

  if (isReport) {
    const summary = totals();
    result.innerHTML = `
      <strong>AI report summary</strong>
      <span>Revenue is ${money(summary.income)}, expenses are ${money(summary.expenses)}, profit is ${money(summary.profit)}, and unpaid invoices stand at ${money(summary.unpaid)}.</span>
    `;
    return;
  }

  const record = {
    id: crypto.randomUUID ? crypto.randomUUID() : `ai_${Date.now()}`,
    type: isOrder ? "order" : "invoice",
    documentType: isOrder && /\bwo|work order\b/i.test(prompt) ? "wo" : "po",
    status: "draft",
    number: documentNumber(isOrder ? "order" : "invoice", isOrder ? "po" : "invoice"),
    partyMode: "new",
    partyName,
    partyEmail: "",
    currency: "INR",
    itemName: prompt.includes("website") ? "Website service" : isOrder ? "Requested goods / service" : "Professional service",
    itemCode: "",
    quantity: 1,
    rate: amount,
    discount: 0,
    taxRate,
    paymentTerms: "Due in 7 days",
    paymentMode: "UPI",
    createdAt: new Date().toISOString(),
  };
  Object.assign(record, calculateRecord(record));
  if (record.type === "order") state.orders.push(record);
  else state.invoices.push(record);
  rememberParty(record);
  saveState();
  render();
  result.innerHTML = `
    <strong>${escapeHtml(record.number)} drafted</strong>
    <span>${escapeHtml(recordLabel(record))} for ${escapeHtml(record.partyName)} has been saved as a draft for ${escapeHtml(money(record.total, record.currency))}.</span>
  `;
}

navButtons.forEach((button) => button.addEventListener("click", () => switchView(button.dataset.view)));
drawerLinks.forEach((button) => button.addEventListener("click", () => switchView(button.dataset.view)));
document.querySelectorAll("[data-jump]").forEach((button) => button.addEventListener("click", () => switchView(button.dataset.jump)));
document.getElementById("menuButton")?.addEventListener("click", () => document.getElementById("drawer")?.classList.toggle("open"));
document.getElementById("profileButton")?.addEventListener("click", () => switchView("subscription"));
document.getElementById("planSelect")?.addEventListener("change", (event) => {
  state.plan = event.target.value;
  saveState();
  render();
});
document.getElementById("reportFilter")?.addEventListener("change", render);
document.getElementById("runAiButton")?.addEventListener("click", runAiCommand);
document.querySelectorAll("[data-example]").forEach((button) => {
  button.addEventListener("click", () => {
    const examples = {
      invoice: "Create GST invoice for Rachel Antony for website design INR 40000 plus 18% GST.",
      po: "Create PO for ABC Technologies for laptop supply INR 75000 plus 18% GST.",
      report: "Summarize revenue, expenses, profit, and unpaid invoices.",
    };
    document.getElementById("aiPrompt").value = examples[button.dataset.example];
  });
});

document.body.addEventListener("click", (event) => {
  const payButton = event.target.closest("[data-pay]");
  if (payButton) openPaymentSheet(payButton.dataset.pay);
});

document.getElementById("closePaymentSheet")?.addEventListener("click", closePaymentSheet);
document.getElementById("cancelPaymentSheet")?.addEventListener("click", closePaymentSheet);
document.getElementById("paymentSheet")?.addEventListener("click", (event) => {
  if (event.target.id === "paymentSheet") closePaymentSheet();
});
document.getElementById("paymentForm")?.addEventListener("submit", (event) => {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  const ok = addPayment(String(data.get("invoiceId") || ""), {
    amount: data.get("amount"),
    paymentDate: data.get("paymentDate"),
    mode: data.get("mode"),
    reference: data.get("reference"),
    notes: data.get("notes"),
  });
  if (ok) {
    setText("paymentStatus", "Payment updated successfully.");
    closePaymentSheet();
  } else {
    setText("paymentStatus", "Enter a valid payment amount.");
  }
});

document.getElementById("teamForm")?.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!hasPlan("business")) return;
  const data = new FormData(event.currentTarget);
  const email = String(data.get("memberEmail") || "").trim();
  if (!email) return;
  state.team.push({
    id: crypto.randomUUID ? crypto.randomUUID() : `team_${Date.now()}`,
    partyName: email,
    partyEmail: email,
    role: String(data.get("role") || "Viewer"),
    createdAt: new Date().toISOString(),
  });
  event.currentTarget.reset();
  saveState();
  render();
});

document.getElementById("validateSmtpButton")?.addEventListener("click", () => {
  if (!hasPlan("business")) return;
  state.smtpValidated = true;
  saveState();
  render();
});

document.getElementById("gatewayButton")?.addEventListener("click", () => {
  if (!hasPlan("business")) return;
  state.gatewayReady = true;
  saveState();
  render();
});

document.getElementById("apiKeyButton")?.addEventListener("click", () => {
  if (!hasPlan("business")) return;
  state.apiKeyLabel = `Mobile API ${new Date().toLocaleDateString("en-IN")}`;
  saveState();
  render();
});

bindDocumentForm("invoiceForm", "invoiceStatus");
bindDocumentForm("poForm", "poStatus");
render();
