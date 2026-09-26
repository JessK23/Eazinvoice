const MODAL_ID = "eazActionErrorModal";
const FOCUSABLE_SELECTOR = "button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])";

function toText(value) {
  return String(value ?? "").trim();
}

function detectStatus(error) {
  const direct = Number(error?.status || error?.statusCode || error?.httpStatus || 0);
  if (Number.isFinite(direct) && direct > 0) return direct;
  const message = toText(error?.message || error);
  const match = message.match(/\b(4\d\d|5\d\d)\b/);
  return match ? Number(match[1]) : 0;
}

function isNetworkFailure(error, rawMessage) {
  const text = rawMessage.toLowerCase();
  return error?.name === "TypeError"
    || /failed to fetch|networkerror|network request|unable to connect|connection reset|connection refused|timed out|timeout|econn|dns/i.test(text);
}

function hasTechnicalLeakRisk(text) {
  if (!text) return false;
  return /(stack\s*trace|\bat\s+\S+\s*\(|exception|sqlstate|select\s+.+\s+from|internal server|enoent|eacces|\\users\\|\/var\/|token=|secret|password|apikey|jwt|bearer\s+[a-z0-9_\-.]+)/i.test(text);
}

function safeDetail(text) {
  const trimmed = toText(text);
  if (!trimmed) return "";
  if (hasTechnicalLeakRisk(trimmed)) return "";
  return trimmed.slice(0, 260);
}

function normalizePlanLimit(rawMessage) {
  const match = rawMessage.match(/(.+?)\s+exceeds\s+(.+?)\s+plan\s+limit/i);
  if (!match) {
    return {
      title: "Plan Limit Reached",
      message: "Your current plan does not allow this action right now.",
      detail: "Upgrade your plan or remove existing usage before trying again.",
      actionLabel: "View Plans",
      actionKind: "view_plans",
      retryable: false,
    };
  }
  const resource = toText(match[1]);
  const plan = toText(match[2]);
  const planLabel = plan ? `${plan[0].toUpperCase()}${plan.slice(1)}` : "current";
  return {
    title: `${planLabel} Plan Limit Reached`,
    message: `Your current ${planLabel} plan does not allow additional ${resource}.`,
    detail: "Update your plan if you need more capacity.",
    actionLabel: "View Plans",
    actionKind: "view_plans",
    retryable: false,
  };
}

export function normalizeActionError(error, context = {}) {
  const rawMessage = toText(error?.safeMessage || error?.message || error);
  const status = detectStatus(error);

  if (isNetworkFailure(error, rawMessage)) {
    return {
      title: "Unable to Connect",
      message: "EazInvoice couldn't reach the server.",
      detail: "Check your internet connection and try again.",
      actionLabel: "Try Again",
      actionKind: "retry",
      retryable: true,
      status,
    };
  }

  if (/\b(upload|document|file)\b/i.test(rawMessage) && /(invalid|unsupported|too large|failed|reject|size|mime|type|signature|malformed)/i.test(rawMessage)) {
    return {
      title: "Document Upload Failed",
      message: "We couldn't upload one or more documents.",
      detail: safeDetail(rawMessage) || "Check file type and size, then try again.",
      actionLabel: "Try Again",
      actionKind: "retry",
      retryable: true,
      status,
    };
  }

  if (/\bkyc\b/i.test(rawMessage) && /(reject|rejected|clarification|attention)/i.test(rawMessage)) {
    return {
      title: "Verification Requires Attention",
      message: "Your verification could not be approved.",
      detail: safeDetail(rawMessage) || "Please update your KYC details and submit again.",
      actionLabel: "Update KYC",
      actionKind: "focus_kyc",
      retryable: false,
      status,
    };
  }

  if (/\bkyc\b/i.test(rawMessage) && /(pending|under review|in progress|awaiting)/i.test(rawMessage)) {
    return {
      title: "Verification In Progress",
      message: "Your KYC has been submitted and is awaiting review.",
      detail: "You'll be able to continue once verification is approved.",
      actionLabel: "Review Status",
      actionKind: "focus_kyc",
      retryable: false,
      status,
    };
  }

  if (/\bkyc\b/i.test(rawMessage) && /(incomplete|required|missing|documents)/i.test(rawMessage)) {
    return {
      title: "KYC Information Incomplete",
      message: "Required verification information is missing.",
      detail: safeDetail(rawMessage) || "Complete the required KYC fields and documents, then try again.",
      actionLabel: "Complete KYC",
      actionKind: "focus_kyc",
      retryable: false,
      status,
    };
  }

  if (/plan\s+limit|exceeds\s+.+\s+plan\s+limit|active\s+plan\s+limit/i.test(rawMessage)) {
    return {
      ...normalizePlanLimit(rawMessage),
      status,
    };
  }

  if (/payment|razorpay|checkout|order\b/i.test(rawMessage)) {
    return {
      title: "Payment Could Not Be Started",
      message: "We couldn't start payment right now.",
      detail: safeDetail(rawMessage) || "Please try again in a moment.",
      actionLabel: "Try Again",
      actionKind: "retry",
      retryable: true,
      status,
    };
  }

  if (/verification required|kyc verification/i.test(rawMessage)) {
    return {
      title: "KYC Information Incomplete",
      message: "Verification is required before this action can continue.",
      detail: "Complete KYC and wait for approval to unlock paid features.",
      actionLabel: "Complete KYC",
      actionKind: "focus_kyc",
      retryable: false,
      status,
    };
  }

  if (status >= 500 || !rawMessage || hasTechnicalLeakRisk(rawMessage)) {
    return {
      title: "Something Went Wrong",
      message: "EazInvoice couldn't complete this action.",
      detail: "Please try again.",
      actionLabel: "Close",
      actionKind: "close",
      retryable: false,
      status,
    };
  }

  return {
    title: context.title || "Action Failed",
    message: context.message || "We couldn't complete this action.",
    detail: safeDetail(rawMessage) || "Please try again.",
    actionLabel: context.actionLabel || "Try Again",
    actionKind: context.actionKind || "retry",
    retryable: context.retryable !== false,
    status,
  };
}

function ensureActionErrorModal(documentRef = globalThis.document) {
  if (!documentRef || !documentRef.body) return null;
  let dialog = documentRef.getElementById(MODAL_ID);
  if (!dialog) {
    dialog = documentRef.createElement("dialog");
    dialog.id = MODAL_ID;
    dialog.className = "eaz-action-error-modal";
    dialog.setAttribute("role", "alertdialog");
    dialog.setAttribute("aria-modal", "true");
    dialog.innerHTML = `
      <div class="eaz-action-error-card" role="document">
        <div class="eaz-action-error-icon" aria-hidden="true">!</div>
        <h2 id="eazActionErrorTitle" class="eaz-action-error-title"></h2>
        <p id="eazActionErrorMessage" class="eaz-action-error-message"></p>
        <p id="eazActionErrorDetail" class="eaz-action-error-detail" hidden></p>
        <div class="eaz-action-error-actions">
          <button type="button" id="eazActionErrorPrimary" class="primary">Try Again</button>
          <button type="button" id="eazActionErrorClose" class="ghost">Close</button>
        </div>
      </div>
    `;
    dialog.setAttribute("aria-labelledby", "eazActionErrorTitle");
    dialog.setAttribute("aria-describedby", "eazActionErrorMessage eazActionErrorDetail");
    documentRef.body.append(dialog);
  }
  return dialog;
}

export function openActionErrorModal(config, options = {}) {
  const documentRef = options.documentRef || globalThis.document;
  const dialog = ensureActionErrorModal(documentRef);
  if (!dialog) return false;

  const normalized = config?.title && config?.message
    ? config
    : normalizeActionError(config?.error ?? config, config?.context || {});
  const title = dialog.querySelector("#eazActionErrorTitle");
  const message = dialog.querySelector("#eazActionErrorMessage");
  const detail = dialog.querySelector("#eazActionErrorDetail");
  const primary = dialog.querySelector("#eazActionErrorPrimary");
  const close = dialog.querySelector("#eazActionErrorClose");

  if (!title || !message || !detail || !primary || !close) return false;

  title.textContent = normalized.title;
  message.textContent = normalized.message;
  detail.textContent = normalized.detail || "";
  detail.hidden = !normalized.detail;
  primary.textContent = normalized.actionLabel || "Try Again";

  const previousFocus = documentRef.activeElement;
  const onClose = () => {
    dialog.removeEventListener("close", onClose);
    previousFocus?.focus?.();
  };
  dialog.addEventListener("close", onClose);

  const finish = (callback) => {
    if (dialog.open) dialog.close();
    if (typeof callback === "function") callback();
  };

  primary.onclick = () => finish(config?.onPrimary);
  close.onclick = () => finish(config?.onClose);

  dialog.oncancel = (event) => {
    event.preventDefault();
    finish(config?.onClose);
  };

  dialog.onkeydown = (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      finish(config?.onClose);
      return;
    }
    if (event.key !== "Tab") return;
    const focusables = Array.from(dialog.querySelectorAll(FOCUSABLE_SELECTOR))
      .filter((entry) => !entry.hasAttribute("disabled") && !entry.getAttribute("aria-hidden"));
    if (!focusables.length) return;
    const currentIndex = focusables.indexOf(documentRef.activeElement);
    const nextIndex = event.shiftKey
      ? (currentIndex <= 0 ? focusables.length - 1 : currentIndex - 1)
      : (currentIndex >= focusables.length - 1 ? 0 : currentIndex + 1);
    event.preventDefault();
    focusables[nextIndex].focus();
  };

  if (!dialog.open) dialog.showModal();
  queueMicrotask(() => {
    if (primary && !primary.hidden) primary.focus();
    else close.focus();
  });

  return true;
}


