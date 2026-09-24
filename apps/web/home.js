import {
  apiClient,
  cleanupOauthCallbackUrl,
  clearToken,
  getTokenCandidates,
  hasOauthCallbackParams,
  mountAdminPlanPreview,
  saveToken,
} from "./common.js?v=20260924-oauth-cleanup";

const navLinks = document.querySelectorAll(".landing-nav a[href^='#']");
navLinks.forEach((link) => {
  link.addEventListener("click", (event) => {
    const target = document.querySelector(link.getAttribute("href"));
    if (!target) return;
    event.preventDefault();
    if (link.getAttribute("href") === "#home") {
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    target.scrollIntoView({ behavior: "smooth", block: "start" });
  });
});

const loginLink = document.getElementById("homeLoginLink");
const signupLink = document.getElementById("homeSignupLink");
const accessPlanLink = document.getElementById("homeAccessPlanLink");
const profileMenu = document.getElementById("homeProfileMenu");
const profileButton = document.getElementById("homeProfileButton");
const profileDropdown = document.getElementById("homeProfileDropdown");
const profileInitials = document.getElementById("homeProfileInitials");
const profileName = document.getElementById("homeProfileName");
const dropdownName = document.getElementById("homeDropdownName");
const dropdownEmail = document.getElementById("homeDropdownEmail");
const logoutButton = document.getElementById("homeLogoutButton");
const primaryAction = document.getElementById("homePrimaryAction");
const secondaryAction = document.getElementById("homeSecondaryAction");

function cachedUser() {
  try {
    return JSON.parse(localStorage.getItem("eazinvoice_user") || "null");
  } catch {
    return null;
  }
}

function showLoggedOutHome() {
  loginLink?.removeAttribute("hidden");
  signupLink?.removeAttribute("hidden");
  accessPlanLink?.setAttribute("hidden", "hidden");
  profileMenu?.setAttribute("hidden", "hidden");
  profileDropdown?.setAttribute("hidden", "hidden");
  if (primaryAction) {
    primaryAction.href = "/apps/web/dashboard.html";
    primaryAction.textContent = "Open Workspace";
  }
  if (secondaryAction) {
    secondaryAction.href = "#workflow";
    secondaryAction.textContent = "See How It Works";
  }
}

function showLoggedInHome(user) {
  loginLink?.setAttribute("hidden", "hidden");
  signupLink?.setAttribute("hidden", "hidden");
  accessPlanLink?.removeAttribute("hidden");
  profileMenu?.removeAttribute("hidden");
  const displayName = user?.name || user?.email || "User";
  const plan = String(user?.plan || "free").toLowerCase();
  const planLabel = `${plan.charAt(0).toUpperCase()}${plan.slice(1)} - My Account`;
  const initials = displayName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "U";
  if (profileInitials) profileInitials.textContent = initials;
  if (profileName) profileName.textContent = displayName;
  if (dropdownName) dropdownName.textContent = displayName;
  if (dropdownEmail) dropdownEmail.textContent = user?.email || "Signed in";
  if (accessPlanLink) accessPlanLink.textContent = planLabel;
  if (primaryAction) {
    primaryAction.href = "/apps/web/dashboard.html";
    primaryAction.textContent = "Open Workspace";
  }
  if (secondaryAction) {
    secondaryAction.href = "/apps/web/invoice.html";
    secondaryAction.textContent = "Create Invoice";
  }
}

profileButton?.addEventListener("click", () => {
  const isOpen = !profileDropdown?.hidden;
  if (profileDropdown) profileDropdown.hidden = isOpen;
  profileButton.setAttribute("aria-expanded", String(!isOpen));
});

document.addEventListener("click", (event) => {
  if (!profileDropdown || profileDropdown.hidden || !profileButton) return;
  const target = event.target;
  if (target instanceof Node && (profileDropdown.contains(target) || profileButton.contains(target))) return;
  profileDropdown.hidden = true;
  profileButton.setAttribute("aria-expanded", "false");
});

logoutButton?.addEventListener("click", () => {
  clearToken();
  window.location.href = "/apps/web/index.html";
});

export async function resolveHomeAuthSession({
  tokenCandidates,
  callbackParamsPresent,
  readCachedUser,
  verifyToken,
  persistToken,
  persistUser,
  onAuthenticated,
  onLoggedOut,
  onFallbackAuthenticated,
  onMountAdminPlanPreview,
  cleanupCallbackUrl,
  clearPersistedToken,
}) {
  const fallbackUser = readCachedUser?.() || { name: "User", email: "Signed in" };
  if (tokenCandidates.length) {
    onFallbackAuthenticated?.(fallbackUser);
    for (const candidate of tokenCandidates) {
      try {
        const session = await verifyToken(candidate);
        const user = { ...(session.user || {}), plan: session.plan?.plan || "free" };
        persistToken(candidate);
        persistUser(user);
        cleanupCallbackUrl();
        onAuthenticated?.(user, { token: candidate, session });
        onMountAdminPlanPreview?.({ token: candidate, session });
        return { status: "authenticated", user };
      } catch {
        // Keep checking remaining sources; one stale token should not hide a valid login.
      }
    }

    if (callbackParamsPresent) {
      clearPersistedToken();
      cleanupCallbackUrl();
      onLoggedOut?.();
      return { status: "oauth-callback-invalid" };
    }

    onFallbackAuthenticated?.(fallbackUser);
    return { status: "fallback-cached", user: fallbackUser };
  }

  if (callbackParamsPresent) cleanupCallbackUrl();
  onLoggedOut?.();
  return { status: "logged-out" };
}

await resolveHomeAuthSession({
  tokenCandidates: getTokenCandidates(),
  callbackParamsPresent: hasOauthCallbackParams(),
  readCachedUser: cachedUser,
  verifyToken: (token) => apiClient.me(token),
  persistToken: saveToken,
  persistUser: (user) => localStorage.setItem("eazinvoice_user", JSON.stringify(user)),
  onAuthenticated: (user) => showLoggedInHome(user),
  onLoggedOut: () => showLoggedOutHome(),
  onFallbackAuthenticated: (user) => showLoggedInHome(user),
  onMountAdminPlanPreview: (context) => mountAdminPlanPreview(context, { containerSelector: ".landing-nav" }),
  cleanupCallbackUrl: cleanupOauthCallbackUrl,
  clearPersistedToken: clearToken,
});
