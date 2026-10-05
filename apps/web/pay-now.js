import { apiClient } from "../../api/src/client.js";

const statusEl = document.getElementById("payNowStatus");
const contentEl = document.getElementById("payNowContent");
const errorEl = document.getElementById("payNowError");
const refreshButton = document.getElementById("payNowRefresh");
const payButton = document.getElementById("payNowButton");
const businessEl = document.getElementById("payNowBusiness");
const descriptionEl = document.getElementById("payNowDescription");
const invoiceEl = document.getElementById("payNowInvoice");
const amountEl = document.getElementById("payNowAmount");
const lifecycleEl = document.getElementById("payNowLifecycle");
const expiryEl = document.getElementById("payNowExpiry");
const hintEl = document.getElementById("payNowHint");

const publicToken = new URLSearchParams(window.location.search).get("token") || "";
let currentProjection = null;
let preparationInFlight = false;
let statusPollTimer = null;

function setStatus(message, loading = false) {
  statusEl.textContent = "";
  if (loading) {
    const spinner = document.createElement("span");
    spinner.className = "pay-now-spinner";
    spinner.setAttribute("aria-hidden", "true");
    statusEl.append(spinner);
  }
  const text = document.createElement("span");
  text.textContent = message;
  statusEl.append(text);
}

function setError(message, { refresh = false } = {}) {
  errorEl.textContent = message;
  errorEl.hidden = false;
  refreshButton.hidden = !refresh;
}

function clearError() {
  errorEl.textContent = "";
  errorEl.hidden = true;
  refreshButton.hidden = true;
}

function money(amount, currency) {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency: currency || "INR" }).format(Number(amount || 0));
  } catch {
    return `${currency || "INR"} ${Number(amount || 0).toFixed(2)}`;
  }
}

function labelStatus(status) {
  return String(status || "unavailable").replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function showProjection(projection) {
  currentProjection = projection || null;
  contentEl.hidden = !projection;
  if (!projection) return;
  businessEl.textContent = projection.business?.name || "EazInvoice business";
  descriptionEl.textContent = projection.invoice?.description || "Secure invoice payment";
  invoiceEl.textContent = projection.invoice?.number || "Invoice payment";
  amountEl.textContent = money(projection.amount, projection.currency);
  lifecycleEl.textContent = labelStatus(projection.status);
  expiryEl.textContent = projection.expiresAt ? `Available until ${new Date(projection.expiresAt).toLocaleString()}` : "";
  payButton.disabled = !projection.paymentAllowed;
  payButton.hidden = !projection.paymentAllowed;
  if (projection.paymentAllowed) {
    setStatus("Payment details are ready.");
    hintEl.textContent = "Your payment is verified securely by EazInvoice after checkout.";
    return;
  }
  const messages = {
    completed: "This payment request has already been completed.",
    expired: "This payment link has expired.",
    cancelled: "This payment link is no longer available.",
    amount_no_longer_collectible: "This payment amount is no longer available. Please request an updated payment link from the business.",
    no_collectible_outstanding: "There is no outstanding amount available through this payment link.",
    invalid_status: "This payment link is unavailable.",
  };
  setStatus(messages[projection.paymentBlockReason] || "This payment link is not currently available.");
  hintEl.textContent = "No payment has been started.";
}

async function loadProjection({ initial = false } = {}) {
  clearError();
  if (!publicToken || publicToken.length < 32) {
    contentEl.hidden = true;
    setStatus("This payment link is invalid or unavailable.");
    setError("Please use the complete payment link provided by the business.");
    return;
  }
  if (initial) setStatus("Loading secure payment details…", true);
  try {
    const result = await apiClient.getPublicPaymentRequest(publicToken);
    showProjection(result.paymentRequest);
  } catch {
    contentEl.hidden = true;
    setStatus("This payment link is invalid or unavailable.");
    setError("The payment link could not be found or is no longer available.");
  }
}

function loadRazorpay() {
  if (window.Razorpay) return Promise.resolve(window.Razorpay);
  const existing = document.querySelector('script[src="https://checkout.razorpay.com/v1/checkout.js"]');
  if (existing) return new Promise((resolve, reject) => {
    existing.addEventListener("load", () => resolve(window.Razorpay), { once: true });
    existing.addEventListener("error", () => reject(new Error("Checkout could not load.")), { once: true });
  });
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.onload = () => window.Razorpay ? resolve(window.Razorpay) : reject(new Error("Checkout could not load."));
    script.onerror = () => reject(new Error("Checkout could not load."));
    document.head.appendChild(script);
  });
}

function beginStatusPolling() {
  window.clearTimeout(statusPollTimer);
  let attempts = 0;
  const poll = async () => {
    attempts += 1;
    try {
      const result = await apiClient.getPublicPaymentRequest(publicToken);
      showProjection(result.paymentRequest);
      if (["completed", "expired", "cancelled"].includes(String(result.paymentRequest?.status || "").toLowerCase())) {
        setStatus(result.paymentRequest.status === "completed" ? "Payment verified successfully." : "Payment status updated.");
        if (result.paymentRequest.status === "completed") {
          hintEl.textContent = "Thank you. Your payment has been confirmed by EazInvoice.";
        }
        return;
      }
    } catch {
      // Keep the neutral pending state; the customer can refresh explicitly.
    }
    if (attempts < 8) statusPollTimer = window.setTimeout(poll, 2500);
    else refreshButton.hidden = false;
  };
  poll();
}

async function startCheckout() {
  if (preparationInFlight || !currentProjection?.paymentAllowed) return;
  preparationInFlight = true;
  payButton.disabled = true;
  clearError();
  setStatus("Preparing secure checkout…", true);
  try {
    const prepared = await apiClient.preparePublicPaymentRequest(publicToken);
    const intent = prepared.providerIntent;
    if (!intent?.providerOrderId || !prepared.publicKeyId) throw new Error("Checkout is not ready yet.");
    const Razorpay = await loadRazorpay();
    setStatus("Checkout is ready. Complete payment in the secure provider window.");
    const checkout = new Razorpay({
      key: prepared.publicKeyId,
      amount: Math.round(Number(intent.amount || 0) * 100),
      currency: intent.currency,
      order_id: intent.providerOrderId,
      name: prepared.paymentRequest?.business?.name || currentProjection.business?.name || "EazInvoice",
      description: prepared.paymentRequest?.invoice?.description || currentProjection.invoice?.description || "Invoice payment",
      handler: () => {
        setStatus("Payment returned from checkout. Verification is pending…", true);
        hintEl.textContent = "EazInvoice is confirming the provider result. This page will not treat checkout return alone as payment success.";
        beginStatusPolling();
      },
      modal: {
        ondismiss: () => {
          if (preparationInFlight) setStatus("Checkout was closed. You can try again when ready.");
          payButton.disabled = false;
        },
      },
    });
    checkout.open();
  } catch (error) {
    payButton.disabled = false;
    setStatus("Payment link is available, but checkout could not be started.");
    setError(/expired|cancelled|amount|collectible|not currently payable/i.test(error.message || "")
      ? "This payment link is no longer available for this amount. Please request an updated link from the business."
      : "Unable to start payment right now. Please try again.", { refresh: true });
  } finally {
    preparationInFlight = false;
  }
}

payButton?.addEventListener("click", startCheckout);
refreshButton?.addEventListener("click", () => loadProjection());
loadProjection({ initial: true });
