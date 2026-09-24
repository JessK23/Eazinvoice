const API_BASE = window.location.origin;

const workspaceSelect = document.getElementById("settingsWorkspace");
const statusEl = document.getElementById("settingsStatus");
const apiKeysList = document.getElementById("apiKeysList");
const apiKeyForm = document.getElementById("apiKeyForm");
const apiKeySecret = document.getElementById("apiKeySecret");
const emailSettingsForm = document.getElementById("emailSettingsForm");
const emailTestForm = document.getElementById("emailTestForm");
const teamForm = document.getElementById("teamForm");
const teamList = document.getElementById("teamList");
const logoutButton = document.getElementById("settingsLogout");

const token = localStorage.getItem("eazinvoice_token") || sessionStorage.getItem("eazinvoice_token") || "";

let state = {
  me: null,
  workspaces: [],
  activeWorkspace: null,
  settings: { emailSettings: {} },
  apiKeys: [],
  team: [],
};

function setStatus(message, tone = "info") {
  if (!statusEl) return;
  statusEl.textContent = message || "";
  statusEl.dataset.tone = tone;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function query(params = {}) {
  const sp = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== null && value !== undefined && String(value).trim() !== "") sp.set(key, value);
  });
  const rendered = sp.toString();
  return rendered ? `?${rendered}` : "";
}

function workspaceParams(extra = {}) {
  const workspace = state.activeWorkspace || {};
  return {
    workspaceOwnerUserId: workspace.ownerUserId || workspace.userId || "",
    businessId: workspace.businessId || "",
    ...extra,
  };
}

async function request(path, { method = "GET", body } = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text().catch(() => "");
  let payload = {};
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = { message: text };
  }
  if (!response.ok) throw new Error(payload.error || payload.message || `Request failed (${response.status})`);
  return payload;
}

async function loadShell() {
  if (!token) {
    window.location.replace("/apps/web/auth.html?tab=login");
    return;
  }
  const me = await request("/me");
  state.me = me.user || null;
  state.workspaces = await request("/business/workspaces");
  state.activeWorkspace = state.workspaces[0] || null;
  if (!state.activeWorkspace) {
    setStatus("No authorized business workspace found.", "error");
    return;
  }
  workspaceSelect.innerHTML = state.workspaces.map((workspace) => (
    `<option value="${escapeHtml(`${workspace.businessId || ""}:${workspace.ownerUserId || workspace.userId || ""}`)}">${escapeHtml(workspace.businessName || workspace.name || "Business")} - ${escapeHtml(String(workspace.role || "owner"))}</option>`
  )).join("");
  await loadData();
}

async function loadData() {
  if (!state.activeWorkspace) return;
  const params = workspaceParams();
  const [settings, apiKeys, team] = await Promise.all([
    request(`/business/settings${query(params)}`).catch(() => ({ emailSettings: {} })),
    request(`/business/api-keys${query(params)}`).catch(() => []),
    request(`/business/team${query(params)}`).catch(() => []),
  ]);
  state.settings = settings || { emailSettings: {} };
  state.apiKeys = Array.isArray(apiKeys) ? apiKeys : (apiKeys.apiKeys || []);
  state.team = Array.isArray(team) ? team : (team.team || []);
  render();
}

function render() {
  const email = state.settings?.emailSettings || {};
  if (emailSettingsForm) {
    emailSettingsForm.elements.smtpHost.value = email.smtpHost || "";
    emailSettingsForm.elements.smtpPort.value = email.smtpPort || "";
    emailSettingsForm.elements.smtpUser.value = email.smtpUser || "";
    emailSettingsForm.elements.smtpPass.value = "";
    emailSettingsForm.elements.fromEmail.value = email.fromEmail || "";
    emailSettingsForm.elements.fromName.value = email.fromName || "";
    emailSettingsForm.elements.replyToEmail.value = email.replyToEmail || "";
    emailSettingsForm.elements.smtpSecure.value = email.smtpSecure ? "on" : "off";
  }
  if (emailTestForm) emailTestForm.elements.to.value = state.me?.email || "";

  apiKeysList.innerHTML = state.apiKeys.length
    ? state.apiKeys.map((key) => `<article class="invoice-card"><div><strong>${escapeHtml(key.label || "API Key")}</strong><div>${escapeHtml(key.tokenPreview || key.tokenPrefix || "Token hidden")}</div></div><div style="display:flex;gap:8px;align-items:center"><span class="pill">${escapeHtml(String(key.status || "active"))}</span>${String(key.status || "").toLowerCase() === "active" ? `<button type="button" class="ghost" data-revoke-key="${escapeHtml(key.id || "")}">Revoke</button>` : ""}</div></article>`).join("")
    : "<p>No API keys yet.</p>";

  teamList.innerHTML = state.team.length
    ? state.team.map((member) => `<article class="invoice-card"><div><strong>${escapeHtml(member.name || member.email || "Member")}</strong><div>${escapeHtml(member.email || "")}</div></div><div style="display:flex;gap:8px;align-items:center"><span class="pill">${escapeHtml(String(member.role || "viewer"))} · ${escapeHtml(String(member.status || "active"))}</span>${String(member.status || "").toLowerCase() === "removed" ? `<button type="button" class="ghost" data-member-status="active" data-member-id="${escapeHtml(member.id || "")}">Activate</button>` : `<button type="button" class="ghost" data-member-status="removed" data-member-id="${escapeHtml(member.id || "")}">Remove</button>`}</div></article>`).join("")
    : "<p>No team members yet.</p>";
}

workspaceSelect?.addEventListener("change", async () => {
  const [businessId, ownerUserId] = String(workspaceSelect.value || ":").split(":");
  state.activeWorkspace = state.workspaces.find((workspace) => (
    String(workspace.businessId || "") === businessId
    && String(workspace.ownerUserId || workspace.userId || "") === ownerUserId
  )) || state.activeWorkspace;
  await loadData();
});

apiKeyForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = new FormData(apiKeyForm);
  try {
    const created = await request("/business/api-keys", {
      method: "POST",
      body: workspaceParams({
        label: data.get("label"),
        scopes: String(data.get("scopes") || "").split(",").map((entry) => entry.trim()).filter(Boolean),
      }),
    });
    apiKeyForm.reset();
    apiKeySecret.hidden = !created.token;
    apiKeySecret.textContent = created.token
      ? `New API key (shown once): ${created.token}`
      : "API key created.";
    setStatus("API key created.", "success");
    await loadData();
  } catch (error) {
    setStatus(error.message, "error");
  }
});

apiKeysList?.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-revoke-key]");
  if (!button) return;
  try {
    await request(`/business/api-keys/${encodeURIComponent(button.dataset.revokeKey)}${query(workspaceParams())}`, { method: "DELETE" });
    setStatus("API key revoked.", "success");
    await loadData();
  } catch (error) {
    setStatus(error.message, "error");
  }
});

emailSettingsForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = new FormData(emailSettingsForm);
  try {
    await request("/business/settings", {
      method: "PATCH",
      body: workspaceParams({
        emailSettings: {
          smtpHost: data.get("smtpHost"),
          smtpPort: Number(data.get("smtpPort") || 0),
          smtpUser: data.get("smtpUser"),
          smtpPass: data.get("smtpPass"),
          smtpSecure: data.get("smtpSecure") === "on",
          fromEmail: data.get("fromEmail"),
          fromName: data.get("fromName"),
          replyToEmail: data.get("replyToEmail"),
        },
      }),
    });
    setStatus("Email configuration saved.", "success");
    await loadData();
  } catch (error) {
    setStatus(error.message, "error");
  }
});

emailTestForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const recipient = new FormData(emailTestForm).get("to");
  const data = new FormData(emailSettingsForm);
  try {
    await request("/business/settings/email/test", {
      method: "POST",
      body: workspaceParams({
        to: recipient,
        emailSettings: {
          smtpHost: data.get("smtpHost"),
          smtpPort: Number(data.get("smtpPort") || 0),
          smtpUser: data.get("smtpUser"),
          smtpPass: data.get("smtpPass"),
          smtpSecure: data.get("smtpSecure") === "on",
          fromEmail: data.get("fromEmail"),
          fromName: data.get("fromName"),
          replyToEmail: data.get("replyToEmail"),
        },
      }),
    });
    setStatus("Test email sent.", "success");
  } catch (error) {
    setStatus(error.message, "error");
  }
});

teamForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = new FormData(teamForm);
  try {
    await request("/business/team", {
      method: "POST",
      body: workspaceParams({
        name: data.get("name"),
        email: data.get("email"),
        role: data.get("role"),
      }),
    });
    teamForm.reset();
    setStatus("Team member created.", "success");
    await loadData();
  } catch (error) {
    setStatus(error.message, "error");
  }
});

teamList?.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-member-id]");
  if (!button) return;
  try {
    await request(`/business/team/${encodeURIComponent(button.dataset.memberId)}`, {
      method: "PATCH",
      body: workspaceParams({ status: button.dataset.memberStatus }),
    });
    setStatus("Team member updated.", "success");
    await loadData();
  } catch (error) {
    setStatus(error.message, "error");
  }
});

logoutButton?.addEventListener("click", () => {
  localStorage.removeItem("eazinvoice_token");
  sessionStorage.removeItem("eazinvoice_token");
  document.cookie = "eazinvoice_token=; path=/; Max-Age=0; SameSite=Lax";
  window.location.href = "/apps/web/auth.html?tab=login";
});

void loadShell().catch((error) => {
  setStatus(error.message || "Could not load account settings.", "error");
});