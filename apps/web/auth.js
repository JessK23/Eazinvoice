const form = document.getElementById("authForm");
const status = document.getElementById("authStatus");
const signupTab = document.getElementById("signupTab");
const loginTab = document.getElementById("loginTab");
const title = document.getElementById("authTitle");
const googleAuth = document.getElementById("googleAuth");
const requestOtp = document.getElementById("requestOtp");
const resendOtp = document.getElementById("resendOtp");
const otpMeta = document.getElementById("otpMeta");
const otpExpiry = document.getElementById("otpExpiry");
const phoneLabel = document.getElementById("phoneLabel");
const phoneFieldWrap = document.getElementById("phoneFieldWrap");
const nameFieldWrap = document.getElementById("nameFieldWrap");
const signupOnlyFields = document.getElementById("signupOnlyFields");
const companyRegistrantFields = document.getElementById("companyRegistrantFields");
let mode = "signup";
const initialTab = new URLSearchParams(window.location.search).get("tab");
const inviteTokenFromUrl = new URLSearchParams(window.location.search).get("invite") || "";
if (inviteTokenFromUrl) {
  sessionStorage.setItem("eazinvoice_pending_invite", inviteTokenFromUrl);
}
const API_BASE = window.location.origin;
const OTP_IDLE_LABEL = "Send Email OTP";
const OTP_SENT_LABEL = "Sent Successfully";
const OTP_CODE_LENGTH = 6;
const DEFAULT_OTP_EXPIRES_SECONDS = 90;
let otpExpiryTimer = null;
let resendTimer = null;
let otpExpiresAt = 0;
let resendAvailableAt = 0;

async function apiRequest(path, body) {
  const response = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const raw = await response.text().catch(() => "");
  let payload = {};
  try {
    payload = raw ? JSON.parse(raw) : {};
  } catch {
    payload = {};
  }
  if (!response.ok) {
    throw new Error(payload.error || `Request failed (${response.status}). Please try again or contact EazInvoice support.`);
  }
  return payload;
}

async function authenticatedApiRequest(path, token, body) {
  const response = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  const raw = await response.text().catch(() => "");
  let payload = {};
  try {
    payload = raw ? JSON.parse(raw) : {};
  } catch {
    payload = {};
  }
  if (!response.ok) {
    throw new Error(payload.error || `Request failed (${response.status}). Please try again or contact EazInvoice support.`);
  }
  return payload;
}

function saveToken(token) {
  localStorage.setItem("eazinvoice_token", token);
  sessionStorage.setItem("eazinvoice_token", token);
  document.cookie = `eazinvoice_token=${encodeURIComponent(token)}; path=/; SameSite=Lax`;
}

async function acceptPendingInvite(token) {
  const inviteToken = sessionStorage.getItem("eazinvoice_pending_invite") || inviteTokenFromUrl;
  if (!inviteToken) return null;
  const member = await authenticatedApiRequest("/business/team/accept", token, { inviteToken });
  sessionStorage.removeItem("eazinvoice_pending_invite");
  if (member.ownerUserId) {
    localStorage.setItem("eazinvoice_business_workspace_owner", member.ownerUserId);
  }
  return member;
}

function startGoogleOAuth(currentMode) {
  return `${API_BASE}/auth/google/start?mode=${encodeURIComponent(currentMode)}`;
}

function setStatus(message) {
  if (status) status.textContent = message;
}

function setOtpLoading(isLoading) {
  if (!requestOtp) return;
  requestOtp.disabled = isLoading;
  if (isLoading) {
    requestOtp.textContent = "Sending...";
  } else if (requestOtp.textContent !== OTP_SENT_LABEL) {
    requestOtp.textContent = OTP_IDLE_LABEL;
  }
}

function setOtpSent() {
  if (!requestOtp) return;
  requestOtp.disabled = true;
  requestOtp.textContent = OTP_SENT_LABEL;
  requestOtp.classList.add("success");
}

function formatRemaining(ms) {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function stopOtpTimers() {
  if (otpExpiryTimer) window.clearInterval(otpExpiryTimer);
  if (resendTimer) window.clearInterval(resendTimer);
  otpExpiryTimer = null;
  resendTimer = null;
}

function updateOtpExpiry() {
  if (!otpExpiry || !otpExpiresAt) return;
  const remaining = otpExpiresAt - Date.now();
  otpExpiry.textContent = remaining > 0
    ? `OTP expires in ${formatRemaining(remaining)}`
    : "OTP expired. Request a fresh code.";
}

function updateResendButton() {
  if (!resendOtp) return;
  const remaining = resendAvailableAt - Date.now();
  if (remaining > 0) {
    resendOtp.disabled = true;
    resendOtp.textContent = `Send again in ${formatRemaining(remaining)}`;
  } else {
    resendOtp.disabled = false;
    resendOtp.textContent = "Send again";
  }
}

function normalizedOtpExpirySeconds(expiresInSeconds) {
  const parsed = Number(expiresInSeconds);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_OTP_EXPIRES_SECONDS;
}

function startOtpTimers(expiresInSeconds = DEFAULT_OTP_EXPIRES_SECONDS) {
  stopOtpTimers();
  const expirySeconds = normalizedOtpExpirySeconds(expiresInSeconds);
  otpExpiresAt = Date.now() + expirySeconds * 1000;
  resendAvailableAt = Date.now() + expirySeconds * 1000;
  if (otpMeta) otpMeta.hidden = false;
  updateOtpExpiry();
  updateResendButton();
  otpExpiryTimer = window.setInterval(updateOtpExpiry, 1000);
  resendTimer = window.setInterval(updateResendButton, 1000);
}

function resetOtpButton() {
  stopOtpTimers();
  otpExpiresAt = 0;
  resendAvailableAt = 0;
  if (otpMeta) otpMeta.hidden = true;
  if (!requestOtp) return;
  requestOtp.disabled = false;
  requestOtp.textContent = OTP_IDLE_LABEL;
  requestOtp.classList.remove("success");
}

function selectedSubscriberType() {
  return form?.querySelector('input[name="subscriberType"]:checked')?.value || "individual";
}

function setCompanyRegistrantRequired(required) {
  companyRegistrantFields?.querySelectorAll("input").forEach((input) => {
    input.required = required;
  });
}

function renderCompanyRegistrantFields() {
  const showCompanyFields = mode === "signup" && selectedSubscriberType() === "company";
  if (companyRegistrantFields) companyRegistrantFields.hidden = !showCompanyFields;
  setCompanyRegistrantRequired(showCompanyFields);
}

function setMode(nextMode) {
  mode = nextMode;
  setStatus("");
  resetOtpButton();
  signupTab?.classList.toggle("active", mode === "signup");
  loginTab?.classList.toggle("active", mode === "login");
  signupTab?.setAttribute("aria-selected", String(mode === "signup"));
  loginTab?.setAttribute("aria-selected", String(mode === "login"));
  if (title) title.textContent = mode === "signup" ? "Create your free account" : "Welcome back";
  const submit = form?.querySelector('button[type="submit"]');
  if (submit) submit.textContent = mode === "signup" ? "Continue" : "Login";
  const passwordInput = form?.querySelector('input[name="password"]');
  if (passwordInput) passwordInput.placeholder = mode === "signup" ? "Create password" : "Enter password";
  if (phoneLabel) phoneLabel.textContent = "Mobile Number";
  if (phoneFieldWrap) phoneFieldWrap.hidden = mode === "login";
  const phoneInput = form?.querySelector('input[name="phone"]');
  if (phoneInput) {
    phoneInput.required = mode === "signup";
    phoneInput.value = mode === "login" ? "" : phoneInput.value;
  }
  if (nameFieldWrap) nameFieldWrap.hidden = mode === "login";
  const nameInput = form?.querySelector('input[name="name"]');
  if (nameInput) {
    nameInput.required = mode === "signup";
    nameInput.value = mode === "login" ? "" : nameInput.value;
  }
  if (signupOnlyFields) signupOnlyFields.hidden = mode === "login";
  renderCompanyRegistrantFields();
  if (googleAuth) googleAuth.hidden = mode === "login";
}

signupTab?.addEventListener("click", () => setMode("signup"));
loginTab?.addEventListener("click", () => setMode("login"));
form?.querySelectorAll('input[name="subscriberType"]').forEach((input) => {
  input.addEventListener("change", renderCompanyRegistrantFields);
});
form?.querySelectorAll('input[name="email"]').forEach((input) => {
  input.addEventListener("input", resetOtpButton);
});

form?.querySelector('input[name="otp"]')?.addEventListener("input", (event) => {
  event.target.value = event.target.value.replace(/\D/g, "").slice(0, OTP_CODE_LENGTH);
});

async function requestEmailOtp() {
  const hadSentOtp = requestOtp?.textContent === OTP_SENT_LABEL;
  const data = new FormData(form);
  const email = String(data.get("email") || "").trim();
  if (!email) {
    setStatus("Enter your email before requesting OTP.");
    return;
  }
  setOtpLoading(true);
  setStatus("Sending email OTP...");
  try {
    const response = await apiRequest("/auth/email-otp/request", {
      email,
      mode,
    });
    const otpInput = form?.querySelector('input[name="otp"]');
    if (otpInput && response.devOtp) otpInput.value = response.devOtp;
    setStatus(response.devOtp
      ? `OTP sent to ${response.email}. Local test OTP: ${response.devOtp}`
      : `OTP sent to ${response.email}. Enter the code you receive.`);
    setOtpSent();
    startOtpTimers(response.expiresInSeconds);
  } catch (error) {
    setStatus(error.message || "Could not send OTP. Please try again.");
    if (/already registered/i.test(error.message || "")) {
      window.setTimeout(() => setMode("login"), 900);
    }
    if (/not registered/i.test(error.message || "")) {
      window.setTimeout(() => setMode("signup"), 900);
    }
    if (hadSentOtp) {
      setOtpSent();
      updateOtpExpiry();
      updateResendButton();
    } else {
      resetOtpButton();
    }
  } finally {
    if (requestOtp?.textContent !== OTP_SENT_LABEL) setOtpLoading(false);
  }
}

googleAuth?.addEventListener("click", () => { window.location.href = startGoogleOAuth(mode); });
requestOtp?.addEventListener("click", requestEmailOtp);
resendOtp?.addEventListener("click", requestEmailOtp);

form?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = new FormData(form);
  try {
    const response = mode === "login"
      ? await apiRequest("/auth/login", {
        email: data.get("email"),
        password: data.get("password"),
        otp: data.get("otp"),
      })
      : await apiRequest("/auth/signup", {
        name: data.get("name"),
        email: data.get("email"),
        password: data.get("password"),
        phone: data.get("phone"),
        otp: data.get("otp"),
        subscriberType: data.get("subscriberType"),
        registrantName: data.get("registrantName"),
        registrantDesignation: data.get("registrantDesignation"),
        registrantEmail: data.get("registrantEmail"),
        registrantPhone: data.get("registrantPhone"),
    });
    saveToken(response.token);
    let inviteAccepted = false;
    try {
      inviteAccepted = Boolean(await acceptPendingInvite(response.token));
    } catch (inviteError) {
      setStatus(`${mode === "signup" ? "Registration successful" : "Login successful"}, but the team invite could not be accepted: ${inviteError.message}`);
      return;
    }
    setStatus(inviteAccepted
      ? "Invite accepted. Taking you to the Business Workspace..."
      : mode === "signup"
        ? "Registration successful. Email verified. Taking you to your access page..."
        : "Login successful. Taking you to your access page...");
    window.setTimeout(() => {
      window.location.href = inviteAccepted ? "/apps/web/dashboard.html#business-workspace" : "/apps/web/access.html";
    }, 700);
  } catch (error) {
    setStatus(error.message);
  }
});

setMode(initialTab === "login" ? "login" : "signup");
