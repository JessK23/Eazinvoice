import { apiClient, money, requireSession } from "./common.js";

const sessionContext = await requireSession();
const token = sessionContext?.token;
const params = new URLSearchParams(window.location.search);
const billId = params.get("bill") || params.get("vendorBill") || "";
const selectedOwner = window.localStorage?.getItem("eazinvoice_business_workspace_owner") || sessionContext?.session?.user?.id || "";
let workspaceSnapshot = null;
let loadedBill = null;
let loadingGeneration = 0;

const $ = (id) => document.getElementById(id);
const panel = $("vendorBillDetailPanel");
const body = $("vendorBillDetailBody");
const errorBox = $("vendorBillDetailError");
const status = $("vendorBillDetailStatus");
const esc = (value) => String(value ?? "");

function setText(id, value) { const node = $(id); if (node) node.textContent = esc(value || "Unavailable"); }
function displayMoney(value, currency = loadedBill?.currency || "INR") { return `${currency} ${money(value)}`; }
function fail(message) {
  body.hidden = true;
  errorBox.hidden = false;
  errorBox.textContent = message;
  errorBox.dataset.tone = "error";
  status.textContent = "Vendor Bill unavailable";
}
function sameWorkspace(snapshot) {
  const owner = window.localStorage?.getItem("eazinvoice_business_workspace_owner") || sessionContext?.session?.user?.id || "";
  return snapshot && owner === snapshot.ownerUserId;
}
async function currentWorkspaceMatches(snapshot) {
  try {
    if (!sameWorkspace(snapshot)) return false;
    const workspaces = await apiClient.listBusinessWorkspaces(token);
    const current = (Array.isArray(workspaces) ? workspaces : []).find((entry) => entry.ownerUserId === snapshot?.ownerUserId);
    return Boolean(current && (current.businessId || "") === (snapshot.businessId || ""));
  } catch {
    return false;
  }
}
function createPaymentAttemptKey() {
  if (!globalThis.crypto?.randomUUID) throw new Error("Secure payment attempt identity is unavailable. Refresh and try again.");
  return `vendor-bill-${globalThis.crypto.randomUUID()}`;
}
function explicitSource(bill) {
  const sourceId = bill.sourcePurchaseOrderId || bill.sourceWorkOrderId || bill.sourceDocumentId || bill.sourceId;
  const sourceType = bill.sourcePurchaseOrderId ? "Purchase Order" : bill.sourceWorkOrderId ? "Work Order" : bill.sourceDocumentType || bill.sourceType;
  return sourceId && sourceType ? { sourceId, sourceType } : null;
}
function renderItems(items) {
  const target = $("vendorBillDetailItems");
  target.replaceChildren();
  if (!Array.isArray(items) || !items.length) { target.textContent = "No line items were returned."; return; }
  items.forEach((item) => {
    const row = document.createElement("article");
    row.className = "quick-card";
    row.textContent = `${item.description || item.name || "Item"} · Qty ${item.quantity ?? 0} · ${displayMoney(item.amount ?? (Number(item.quantity || 0) * Number(item.rate || 0)))}`;
    target.append(row);
  });
}
function renderPayments(payments, unavailableMessage = "") {
  const target = $("vendorBillDetailPayments");
  target.replaceChildren();
  if (unavailableMessage) { target.textContent = unavailableMessage; return; }
  if (!Array.isArray(payments) || !payments.length) { target.textContent = "No payments recorded."; return; }
  payments.forEach((payment) => {
    const row = document.createElement("article");
    row.className = "quick-card";
    row.textContent = `${displayMoney(payment.amount, payment.currency)} · ${payment.paymentDate || "date unavailable"} · ${payment.status || "status unavailable"}${payment.reference ? ` · ${payment.reference}` : ""}`;
    target.append(row);
  });
}
function renderSource(bill) {
  const source = explicitSource(bill);
  const section = $("vendorBillSourceSection");
  const target = $("vendorBillDetailSource");
  section.hidden = !source;
  target.replaceChildren();
  if (!source) return;
  const line = document.createElement("span");
  line.textContent = `${source.sourceType}: ${source.sourceId}`;
  target.append(line);
}
function renderActions(bill) {
  const target = $("vendorBillDetailActions");
  target.replaceChildren();
  const state = String(bill.status || "draft").toLowerCase();
  if (state === "draft") {
    $("vendorBillEdit").hidden = false;
    const note = document.createElement("span"); note.className = "pill gold"; note.textContent = "Draft — edit from Vendor Bills"; target.append(note); return;
  }
  $("vendorBillEdit").hidden = true;
  if (["deleted", "cancelled", "void"].includes(state)) {
    const note = document.createElement("span"); note.className = "pill gold"; note.textContent = "No payable actions are available for this bill."; target.append(note); return;
  }
  if (Number(bill.balanceAmount || 0) > 0) {
    const form = document.createElement("form"); form.className = "stacked-form"; form.id = "vendorBillPaymentForm";
    form.innerHTML = `<div class="form-grid two"><label>Payment amount<input name="amount" type="number" min="0.01" step="0.01" max="${esc(bill.balanceAmount)}" required /></label><label>Payment date<input name="paymentDate" type="date" value="${new Date().toISOString().slice(0, 10)}" required /></label><label>Mode<select name="mode"><option value="bank">Bank</option><option value="cash">Cash</option><option value="manual">Manual</option></select></label><label>Reference<input name="reference" placeholder="Optional reference" /></label></div><button class="primary" type="submit">Record payment</button><p class="inline-status" data-payment-status aria-live="polite"></p>`;
    target.append(form);
    form.addEventListener("submit", recordPayment);
  } else {
    const note = document.createElement("span"); note.className = "pill green"; note.textContent = "Payable balance is settled."; target.append(note);
  }
}
function renderBill(bill, payments = [], paymentHistoryError = "") {
  loadedBill = bill;
  const currency = bill.currency || "INR";
  setText("vendorBillDetailTitle", bill.vendorBillNumber || bill.internalBillNumber || bill.id);
  setText("vendorBillDetailVendor", bill.vendorName || bill.vendor?.businessName || bill.vendor?.name || bill.vendorId);
  setText("vendorBillDetailDate", bill.billDate);
  setText("vendorBillDetailDueDate", bill.dueDate);
  setText("vendorBillDetailState", bill.status);
  setText("vendorBillDetailSubtotal", displayMoney(bill.subtotal, currency)); setText("vendorBillDetailTax", displayMoney(bill.tax, currency)); setText("vendorBillDetailTotal", displayMoney(bill.total, currency)); setText("vendorBillDetailPaid", displayMoney(bill.paidAmount, currency)); setText("vendorBillDetailOutstanding", displayMoney(bill.balanceAmount, currency)); setText("vendorBillDetailPaymentStatus", bill.paymentStatus); setText("vendorBillDetailCurrency", currency);
  renderItems(bill.items); renderPayments(payments, paymentHistoryError); renderSource(bill); renderActions(bill);
  body.hidden = false; status.textContent = "Authoritative Vendor Bill details loaded.";
}
async function recordPayment(event) {
  event.preventDefault();
  if (event.currentTarget.dataset.submitting === "true") return;
  if (!(await currentWorkspaceMatches(workspaceSnapshot))) { fail("Workspace context changed. Reload the Vendor Bill before recording a payment."); return; }
  const form = event.currentTarget; const statusNode = form.querySelector("[data-payment-status]"); const data = new FormData(form); const amount = Number(data.get("amount"));
  if (!Number.isFinite(amount) || amount <= 0 || amount > Number(loadedBill.balanceAmount || 0)) { statusNode.textContent = "Enter an amount within the current payable balance."; statusNode.dataset.tone = "error"; return; }
  const payload = JSON.stringify({ amount, paymentDate: data.get("paymentDate"), mode: data.get("mode"), reference: data.get("reference") || "", currency: loadedBill.currency || "INR" });
  const attemptKey = form.dataset.paymentAttemptKey || createPaymentAttemptKey();
  if (form.dataset.paymentPayload && form.dataset.paymentPayload !== payload) { statusNode.textContent = "Payment details changed. Start a new payment attempt before retrying."; statusNode.dataset.tone = "error"; return; }
  form.dataset.paymentAttemptKey = attemptKey;
  form.dataset.paymentPayload = payload;
  form.dataset.submitting = "true";
  form.querySelector("button").disabled = true;
  try {
    await apiClient.recordVendorBillPayment(token, billId, { workspaceOwnerUserId: workspaceSnapshot.ownerUserId, businessId: workspaceSnapshot.businessId, amount, paymentDate: data.get("paymentDate"), mode: data.get("mode"), reference: data.get("reference"), idempotencyKey: attemptKey });
    if (!(await currentWorkspaceMatches(workspaceSnapshot))) { fail("Workspace context changed while the payment was saving. Reload before continuing."); return; }
    await load();
  } catch (error) {
    form.dataset.submitting = "false";
    form.querySelector("button").disabled = false;
    const definitiveRejection = error?.payload?.paymentOutcome === "not_recorded";
    const sameAttempt = form.dataset.paymentAttemptKey === attemptKey;
    if (definitiveRejection && sameAttempt) {
      delete form.dataset.paymentAttemptKey;
      delete form.dataset.paymentPayload;
      statusNode.textContent = "Payment was not recorded. Correct the details and try again.";
    } else {
      statusNode.textContent = "Payment outcome is unknown. Retry only by reusing this same attempt.";
    }
    statusNode.dataset.tone = "error";
  }
}
async function load() {
  if (!sessionContext || !token) return;
  if (!billId) { fail("A Vendor Bill identifier is required."); return; }
  const generation = ++loadingGeneration;
  try {
    const workspaces = await apiClient.listBusinessWorkspaces(token);
    const workspace = (Array.isArray(workspaces) ? workspaces : []).find((entry) => entry.ownerUserId === selectedOwner);
    if (!workspace) { fail("The selected workspace is unavailable. Choose a valid workspace before opening this Vendor Bill."); return; }
    workspaceSnapshot = { ownerUserId: workspace.ownerUserId, businessId: workspace.businessId || "" };
    const bill = await apiClient.getVendorBill(token, billId, workspaceSnapshot);
    if (generation !== loadingGeneration || !sameWorkspace(workspaceSnapshot) || bill?.id !== billId || (workspaceSnapshot.businessId && bill.businessId !== workspaceSnapshot.businessId)) { fail("Vendor Bill context is stale or does not belong to the selected workspace."); return; }
    let payments = null;
    let paymentHistoryError = "Payment history is unavailable. Refresh to try again.";
    try { payments = await apiClient.listPayments(token, workspaceSnapshot); } catch { /* preserve the authoritative bill while surfacing history failure */ }
    const paymentRows = Array.isArray(payments) ? payments.filter((payment) => payment && payment.vendorBillId === billId && (!workspaceSnapshot.businessId || payment.businessId === workspaceSnapshot.businessId)) : null;
    renderBill(bill, paymentRows, Array.isArray(payments) ? "" : paymentHistoryError);
  } catch (error) {
    if (loadedBill) renderBill(loadedBill, null, "Payment history is unavailable. Refresh to try again.");
    else fail(error.message || "Could not load this Vendor Bill.");
  }
}
load();
