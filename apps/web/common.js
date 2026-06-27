import { apiClient } from "../api/src/client.js";

export { apiClient };

export function money(value) {
  return Number(value || 0).toFixed(2);
}

function cookieToken() {
  return document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith("eazinvoice_token="))
    ?.split("=")[1];
}

export function getTokenCandidates() {
  const cookie = cookieToken();
  const candidates = [
    new URLSearchParams(window.location.search).get("token"),
    sessionStorage.getItem("eazinvoice_token"),
    localStorage.getItem("eazinvoice_token"),
    cookie ? decodeURIComponent(cookie) : "",
  ].filter(Boolean);
  return [...new Set(candidates)];
}

export function getToken() {
  return getTokenCandidates()[0] || "";
}

export function saveToken(token) {
  localStorage.setItem("eazinvoice_token", token);
  sessionStorage.setItem("eazinvoice_token", token);
  document.cookie = `eazinvoice_token=${encodeURIComponent(token)}; path=/; SameSite=Lax`;
}

export function clearToken() {
  localStorage.removeItem("eazinvoice_token");
  sessionStorage.removeItem("eazinvoice_token");
  localStorage.removeItem("eazinvoice_user");
  localStorage.removeItem("eazinvoice_admin_plan_preview");
  document.cookie = "eazinvoice_token=; path=/; Max-Age=0; SameSite=Lax";
}

export function getAdminPlanPreview() {
  return localStorage.getItem("eazinvoice_admin_plan_preview") || "";
}

export function setAdminPlanPreview(plan) {
  const normalized = String(plan || "").toLowerCase();
  if (normalized) {
    localStorage.setItem("eazinvoice_admin_plan_preview", normalized);
  } else {
    localStorage.removeItem("eazinvoice_admin_plan_preview");
  }
}

export function mountAdminPlanPreview(sessionContext, { containerSelector = ".topnav" } = {}) {
  if (!sessionContext?.session?.admin?.authorized) return;
  if (document.getElementById("adminPlanPreviewControl")) return;
  const container = document.querySelector(containerSelector) || document.querySelector(".topbar") || document.body;
  const control = document.createElement("label");
  control.id = "adminPlanPreviewControl";
  control.className = "admin-preview-control";
  control.innerHTML = `
    <span>Admin Preview</span>
    <select id="adminPlanPreviewSelect" aria-label="Admin plan preview">
      <option value="">Real plan</option>
      <option value="free">Free</option>
      <option value="standard">Standard</option>
      <option value="pro">Pro</option>
      <option value="business">Business</option>
    </select>
  `;
  container.append(control);

  const select = control.querySelector("select");
  const currentPreview = getAdminPlanPreview();
  select.value = currentPreview;
  select.addEventListener("change", () => {
    setAdminPlanPreview(select.value);
    window.location.reload();
  });

  const activePlan = sessionContext.session.plan?.preview?.enabled
    ? sessionContext.session.plan.label
    : currentPreview
      ? currentPreview.charAt(0).toUpperCase() + currentPreview.slice(1)
      : "";
  if (!activePlan) return;
  const banner = document.createElement("div");
  banner.id = "adminPlanPreviewBanner";
  banner.className = "admin-preview-banner";
  banner.textContent = `Admin Preview Mode: ${activePlan} plan. No billing or subscription record is being changed.`;
  document.querySelector(".topbar, .landing-header")?.after(banner);
}

export async function requireSession(redirectTo = "/apps/web/auth.html") {
  const candidates = getTokenCandidates();
  if (!candidates.length) {
    window.location.replace(redirectTo);
    return null;
  }

  for (const token of candidates) {
    try {
      const session = await apiClient.me(token);
      saveToken(token);
      localStorage.setItem("eazinvoice_user", JSON.stringify({
        ...(session.user || {}),
        plan: session.plan?.plan || "free",
      }));
      return { token, session };
    } catch {
      // Try the next possible session source before logging the user out.
    }
  }

  clearToken();
  window.location.replace(redirectTo);
  return null;
}
