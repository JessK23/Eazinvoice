import { apiClient, money, requireSession } from "./common.js";

const sessionContext = await requireSession();
const token = sessionContext?.token;
const params = new URLSearchParams(window.location.search);
const expenseId = params.get("expense") || "";
const selectedOwner = window.localStorage?.getItem("eazinvoice_business_workspace_owner") || sessionContext?.session?.user?.id || "";
let workspaceSnapshot = null;
let workspaceWriteAllowed = false;
let loadedExpense = null;
let latestReversal = null;
let loadingGeneration = 0;
let reversalIntent = { key: "", fingerprint: "" };

const $ = (id) => document.getElementById(id);
const panel = $("expenseDetailPanel");
const body = $("expenseDetailBody");
const errorBox = $("expenseDetailError");
const status = $("expenseDetailStatus");

function text(id, value) {
  const node = $(id);
  if (node) node.textContent = value === undefined || value === null || value === "" ? "Unavailable" : String(value);
}

function displayMoney(value, currency = loadedExpense?.currency || "INR") {
  return `${currency} ${money(value || 0)}`;
}

function fail(message) {
  body.hidden = true;
  errorBox.hidden = false;
  errorBox.textContent = message;
  errorBox.dataset.tone = "error";
  status.textContent = "Expense unavailable";
}

function currentOwnerId() {
  return window.localStorage?.getItem("eazinvoice_business_workspace_owner") || sessionContext?.session?.user?.id || "";
}

function sameWorkspace(snapshot) {
  return Boolean(snapshot && currentOwnerId() === snapshot.ownerUserId);
}

async function currentWorkspaceMatches(snapshot) {
  try {
    if (!sameWorkspace(snapshot)) return false;
    const workspaces = await apiClient.listBusinessWorkspaces(token);
    const current = (Array.isArray(workspaces) ? workspaces : []).find((entry) => entry.ownerUserId === snapshot.ownerUserId);
    return Boolean(current && (current.businessId || "") === (snapshot.businessId || ""));
  } catch {
    return false;
  }
}

function workspaceCanReverse() {
  return workspaceWriteAllowed === true;
}

function createReversalKey() {
  if (!globalThis.crypto?.randomUUID) throw new Error("Secure reversal identity is unavailable. Refresh and try again.");
  return `expense-reversal-${globalThis.crypto.randomUUID()}`;
}

function renderReversal(reversal = latestReversal) {
  const target = $("expenseDetailReversal");
  if (!target) return;
  target.replaceChildren();
  const reversedId = loadedExpense?.reversedById || reversal?.reversal?.id || reversal?.id;
  if (!reversedId && String(loadedExpense?.status || "").toLowerCase() !== "reversed") {
    target.textContent = "No reversal recorded.";
    return;
  }
  const card = document.createElement("article");
  card.className = "quick-card";
  const details = [
    ["Status", loadedExpense?.status || reversal?.expense?.status || "reversed"],
    ["Reversal", reversedId],
    ["Reason", reversal?.reversal?.reason || reversal?.reason],
    ["Reversal date", reversal?.reversal?.reversalDate],
    ["Reversing user", reversal?.reversal?.createdByUserId],
    ["Reversal journal", reversal?.reversal?.journalId],
  ].filter(([, value]) => value !== undefined && value !== null && value !== "");
  card.textContent = details.length ? details.map(([label, value]) => `${label}: ${value}`).join(" · ") : "Expense is reversed. Additional reversal audit fields are not exposed by the detail authority.";
  target.append(card);
}

function renderActions(expense) {
  const target = $("expenseDetailActions");
  target.replaceChildren();
  const state = String(expense.status || "recorded").toLowerCase();
  if (state === "reversed" || expense.reversedById) {
    const note = document.createElement("span");
    note.className = "pill green";
    note.textContent = "Reversed — read only";
    target.append(note);
    return;
  }
  if (!workspaceCanReverse()) {
    const note = document.createElement("span");
    note.className = "pill gold";
    note.textContent = "View only — your workspace role cannot reverse Expenses";
    target.append(note);
    return;
  }
  const form = document.createElement("form");
  form.className = "stacked-form";
  form.id = "expenseReversalForm";
  form.innerHTML = `<label>Reversal reason <textarea name="reason" maxlength="500" rows="3" required placeholder="Explain why this Expense must be reversed"></textarea></label><button class="ghost small danger" type="submit">Reverse Expense</button><p class="inline-status" data-reversal-status aria-live="polite"></p>`;
  target.append(form);
  form.addEventListener("submit", reverseExpense);
}

function renderExpense(expense) {
  loadedExpense = expense;
  const currency = expense.currency || "INR";
  text("expenseDetailTitle", expense.id);
  text("expenseDetailPayee", expense.payeeName);
  text("expenseDetailDate", expense.expenseDate);
  text("expenseDetailState", expense.status);
  text("expenseDetailCurrency", currency);
  text("expenseDetailAmount", displayMoney(expense.amount, currency));
  text("expenseDetailDescription", expense.description);
  text("expenseDetailAccount", expense.expenseAccountCode || expense.expenseAccountId);
  text("expenseDetailFunding", expense.bankAccountId || expense.fundingLedgerAccountId);
  text("expenseDetailCreated", expense.createdAt);
  text("expenseDetailCreatedBy", expense.createdByUserId);
  text("expenseDetailJournal", expense.journalId);
  text("expenseDetailEvent", expense.financialEventId);
  renderReversal();
  renderActions(expense);
  body.hidden = false;
  status.textContent = "Authoritative Expense details loaded.";
}

async function reverseExpense(event) {
  event.preventDefault();
  const form = event.currentTarget;
  if (form.dataset.submitting === "true") return;
  const statusNode = form.querySelector("[data-reversal-status]");
  if (!(await currentWorkspaceMatches(workspaceSnapshot))) {
    statusNode.textContent = "Workspace context changed. Reload the Expense before reversing it.";
    statusNode.dataset.tone = "error";
    return;
  }
  const reason = String(new FormData(form).get("reason") || "").trim();
  if (!reason) {
    statusNode.textContent = "A meaningful reversal reason is required.";
    statusNode.dataset.tone = "error";
    return;
  }
  const fingerprint = JSON.stringify({ expenseId, reason, workspace: workspaceSnapshot });
  if (reversalIntent.fingerprint !== fingerprint) reversalIntent = { key: createReversalKey(), fingerprint };
  if (!window.confirm("Reverse this Expense through the controlled accounting authority?")) return;
  form.dataset.submitting = "true";
  form.querySelector("button").disabled = true;
  statusNode.textContent = "Reversing Expense...";
  try {
    const result = await apiClient.reverseExpense(token, expenseId, {
      ...workspaceSnapshot,
      reason,
      idempotencyKey: reversalIntent.key,
      reversalDate: new Date().toISOString().slice(0, 10),
    });
    if (!(await currentWorkspaceMatches(workspaceSnapshot))) {
      statusNode.textContent = "Workspace changed while the reversal was saving. Reload before continuing.";
      statusNode.dataset.tone = "error";
      return;
    }
    latestReversal = result;
    reversalIntent = { key: "", fingerprint: "" };
    await load();
  } catch (error) {
    form.dataset.submitting = "false";
    form.querySelector("button").disabled = false;
    statusNode.textContent = error?.message || "The Expense reversal was not confirmed. Retry only with the same reason.";
    statusNode.dataset.tone = "error";
  }
}

async function load(knownReversal = null) {
  if (!sessionContext || !token) return;
  if (!expenseId) { fail("An Expense identifier is required."); return; }
  const generation = ++loadingGeneration;
  latestReversal = knownReversal || latestReversal;
  try {
    const workspaces = await apiClient.listBusinessWorkspaces(token);
    const workspace = (Array.isArray(workspaces) ? workspaces : []).find((entry) => entry.ownerUserId === selectedOwner);
    if (!workspace) { fail("The selected workspace is unavailable. Choose a valid workspace before opening this Expense."); return; }
    workspaceSnapshot = {
      ownerUserId: workspace.ownerUserId,
      businessId: workspace.businessId || "",
    };
    workspaceWriteAllowed = workspace.source !== "team" || Boolean(workspace.permissions?.writeRecords);
    const expense = await apiClient.getExpense(token, expenseId, workspaceSnapshot);
    if (generation !== loadingGeneration || !sameWorkspace(workspaceSnapshot) || expense?.id !== expenseId || (workspaceSnapshot.businessId && expense.businessId !== workspaceSnapshot.businessId)) {
      fail("Expense context is stale or does not belong to the selected workspace.");
      return;
    }
    renderExpense(expense);
  } catch (error) {
    if (loadedExpense) renderExpense(loadedExpense);
    else fail(error.message || "Could not load this Expense.");
  }
}

load();
