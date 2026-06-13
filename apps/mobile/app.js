const STORAGE_KEY = "eazinvoice_mobile_records";

const state = loadState();
const panels = document.querySelectorAll("[data-panel]");
const navButtons = document.querySelectorAll("[data-view]");

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    return {
      invoices: Array.isArray(saved.invoices) ? saved.invoices : [],
      orders: Array.isArray(saved.orders) ? saved.orders : [],
    };
  } catch {
    return { invoices: [], orders: [] };
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
  const amount = number(value).toFixed(2);
  return `${currency} ${amount}`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
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
    partyName: String(data.get("partyName") || "").trim(),
    partyEmail: String(data.get("partyEmail") || "").trim(),
    currency: String(data.get("currency") || "INR"),
    itemName: String(data.get("itemName") || "").trim(),
    itemCode: String(data.get("itemCode") || "").trim(),
    quantity: number(data.get("quantity")),
    rate: number(data.get("rate")),
    discount: number(data.get("discount")),
    taxRate: number(data.get("taxRate")),
    createdAt: new Date().toISOString(),
  };
  return { ...values, ...calculateRecord(values) };
}

function createdOnly(records) {
  return records.filter((record) => record.status === "created");
}

function totals() {
  const income = createdOnly(state.invoices).reduce((sum, record) => sum + number(record.total), 0);
  const expenses = createdOnly(state.orders).reduce((sum, record) => sum + number(record.total), 0);
  return { income, expenses, profit: income - expenses };
}

function setText(id, value) {
  const node = document.getElementById(id);
  if (node) node.textContent = value;
}

function switchView(name) {
  panels.forEach((panel) => panel.classList.toggle("active", panel.dataset.panel === name));
  navButtons.forEach((button) => button.classList.toggle("active", button.dataset.view === name));
}

function recordRow(record) {
  const label = record.type === "order"
    ? record.documentType === "wo" ? "Work Order" : "Purchase Order"
    : "Invoice";
  return `
    <article class="record-row">
      <div>
        <strong>${escapeHtml(record.number)}</strong>
        <span>${escapeHtml(label)} · ${escapeHtml(record.partyName || "No party")} · ${escapeHtml(money(record.total, record.currency))}</span>
      </div>
      <mark class="${record.status === "created" ? "green" : "amber"}">${escapeHtml(record.status)}</mark>
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
  const max = Math.max(summary.income, summary.expenses, 1);
  const incomeHeight = Math.max(8, Math.round((summary.income / max) * 120));
  const expenseHeight = Math.max(8, Math.round((summary.expenses / max) * 120));
  node.innerHTML = `
    <div style="height:${incomeHeight}px"><span>Income</span></div>
    <div style="height:${expenseHeight}px"><span>Expenses</span></div>
  `;
}

function render() {
  const summary = totals();
  setText("invoiceCount", String(state.invoices.length));
  setText("poCount", String(state.orders.length));
  setText("incomeTotal", money(summary.income));
  setText("expenseTotal", money(summary.expenses));
  setText("reportRevenue", money(summary.income));
  setText("reportExpenses", money(summary.expenses));
  setText("reportProfit", money(summary.profit));
  renderList("invoiceList", state.invoices, "No invoices yet.");
  renderList("poList", state.orders, "No PO / WO records yet.");
  renderList("recentList", [...state.invoices, ...state.orders].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 5), "No recent activity yet.");
  renderChart(summary);
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
    if (record.type === "order") state.orders.push(record);
    else state.invoices.push(record);
    saveState();
    form.reset();
    form.querySelector('[name="quantity"]').value = "1";
    form.querySelector('[name="rate"]').value = "0";
    form.querySelector('[name="discount"]').value = "0";
    form.querySelector('[name="taxRate"]').value = "18";
    if (statusNode) statusNode.textContent = `${record.number} ${status === "created" ? "created" : "saved as draft"} successfully.`;
    render();
  });
}

navButtons.forEach((button) => {
  button.addEventListener("click", () => switchView(button.dataset.view));
});

document.querySelectorAll("[data-jump]").forEach((button) => {
  button.addEventListener("click", () => switchView(button.dataset.jump));
});

document.getElementById("profileButton")?.addEventListener("click", () => {
  switchView("subscription");
});

bindDocumentForm("invoiceForm", "invoiceStatus");
bindDocumentForm("poForm", "poStatus");
render();
