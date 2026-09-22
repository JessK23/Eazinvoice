export const ACCOUNT_PROFILE_REQUIRED_FIELDS = ["name", "email", "phone"];
export const BUSINESS_PROFILE_REQUIRED_FIELDS = ["name", "businessType", "entityType"];

function hasValue(value) {
  return typeof value === "string" ? Boolean(value.trim()) : value !== null && value !== undefined;
}

function missingFields(record, requiredFields) {
  return requiredFields.filter((field) => !hasValue(record?.[field]));
}

export function getProfileSetupState(user, companies) {
  const accountMissing = missingFields(user, ACCOUNT_PROFILE_REQUIRED_FIELDS);
  const companyList = Array.isArray(companies) ? companies : [];
  const activeCompany = companyList[0];
  const businessMissing = missingFields(activeCompany, BUSINESS_PROFILE_REQUIRED_FIELDS);
  const businessComplete = Boolean(activeCompany) && businessMissing.length === 0;

  return {
    accountComplete: accountMissing.length === 0,
    businessComplete,
    accountMissing,
    businessMissing,
    needsSetup: accountMissing.length > 0 || !businessComplete,
    destination: accountMissing.length > 0
      ? "/apps/web/access.html?tab=profile"
      : "/apps/web/access.html?tab=company",
  };
}

export function showProfileSetupDialog(state, { documentRef = document } = {}) {
  if (!state?.needsSetup) return false;
  const dialog = documentRef.getElementById("profileSetupDialog");
  if (!dialog || dialog.open) return false;

  const accountStatus = dialog.querySelector("[data-profile-status=account]");
  const businessStatus = dialog.querySelector("[data-profile-status=business]");
  const action = dialog.querySelector("[data-profile-setup-action]");
  const previousFocus = documentRef.activeElement;

  const setStatus = (element, complete) => {
    if (!element) return;
    element.textContent = complete ? "Complete" : "Needs attention";
    element.classList.toggle("is-complete", complete);
    element.classList.toggle("needs-attention", !complete);
  };
  setStatus(accountStatus, state.accountComplete);
  setStatus(businessStatus, state.businessComplete);
  if (action) {
    action.href = state.destination;
    action.textContent = state.accountComplete ? "Complete Business Profile" : "Complete Account Profile";
  }

  dialog.addEventListener("close", () => previousFocus?.focus?.(), { once: true });
  dialog.showModal();
  return true;
}
