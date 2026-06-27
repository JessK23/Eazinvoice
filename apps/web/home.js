import { apiClient, clearToken, getTokenCandidates, mountAdminPlanPreview, saveToken } from "./common.js?v=20260601-session";

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

const tokenCandidates = getTokenCandidates();
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
const loggedPanel = document.getElementById("loggedInHomePanel");
const loggedName = document.getElementById("loggedInHomeName");
const loggedMeta = document.getElementById("loggedInHomeMeta");

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
  loggedPanel?.setAttribute("hidden", "hidden");
  if (primaryAction) {
    primaryAction.href = "/apps/web/auth.html";
    primaryAction.textContent = "Start Free";
  }
  if (secondaryAction) {
    secondaryAction.href = "/apps/web/auth.html?tab=login";
    secondaryAction.textContent = "Login";
  }
}

function showLoggedInHome(user) {
  loginLink?.setAttribute("hidden", "hidden");
  signupLink?.setAttribute("hidden", "hidden");
  accessPlanLink?.removeAttribute("hidden");
  profileMenu?.removeAttribute("hidden");
  loggedPanel?.removeAttribute("hidden");
  const displayName = user?.name || user?.email || "User";
  const plan = String(user?.plan || "free").toLowerCase();
  const planLabel = `${plan.charAt(0).toUpperCase()}${plan.slice(1)} - User Access`;
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
  if (loggedName) loggedName.textContent = `Welcome, ${displayName}`;
  if (loggedMeta) loggedMeta.textContent = user?.email || "Signed in";
  if (primaryAction) {
    primaryAction.href = "/apps/web/access.html";
    primaryAction.textContent = "Open User Access";
  }
  if (secondaryAction) {
    secondaryAction.href = "/apps/web/dashboard.html";
    secondaryAction.textContent = "View Reports Dashboard";
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

if (tokenCandidates.length) {
  showLoggedInHome(cachedUser() || { name: "User", email: "Signed in" });
  let matchedSession = false;
  for (const candidate of tokenCandidates) {
    try {
      const session = await apiClient.me(candidate);
      const user = { ...(session.user || {}), plan: session.plan?.plan || "free" };
      saveToken(candidate);
      localStorage.setItem("eazinvoice_user", JSON.stringify(user));
      showLoggedInHome(user);
      mountAdminPlanPreview({ token: candidate, session }, { containerSelector: ".landing-nav" });
      matchedSession = true;
      break;
    } catch {
      // Keep checking the remaining token sources; one stale token should not hide a valid login.
    }
  }
  if (!matchedSession) showLoggedInHome(cachedUser() || { name: "User", email: "Signed in" });
} else {
  showLoggedOutHome();
}
