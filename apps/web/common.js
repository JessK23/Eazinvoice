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
  document.cookie = "eazinvoice_token=; path=/; Max-Age=0; SameSite=Lax";
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
