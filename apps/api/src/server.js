import http from "node:http";
import crypto from "node:crypto";
import fsSync from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { URL } from "node:url";
import { createApi } from "./index.js";
import { createStore } from "./store.js";
import {
  createCoreTableSyncPersistenceAdapter,
  createPostgresPersistenceAdapter,
  isCoreTableSyncEnabled,
  wantsPostgresStorage,
} from "./postgres-persistence-adapter.js";
import {
  listPostgresSubscriptionsForUser,
  summarizePostgresEntitlements,
  usePostgresEntitlements,
} from "./postgres-entitlements.js";
import {
  syncInvoicePaymentToCoreTables,
  syncInvoiceToCoreTable,
  syncBusinessWorkspaceToCoreTables,
  syncPurchaseOrderToCoreTable,
  syncSubscriptions,
} from "./postgres-core-sync.js";
import { hasPostgresConfig, withPostgresClient } from "./postgres.js";
import { createSessionStore } from "./session-store.js";
import { getFeatureRequirement, PLAN_CATALOG, resolvePlanUsageStatus } from "./plans.js";
import { sendSmtpMail } from "./smtp.js";

function loadLocalEnv() {
  const envPath = [".env", ".env.example"]
    .map((fileName) => path.join(process.cwd(), fileName))
    .find((candidate) => fsSync.existsSync(candidate));
  if (!envPath) return;
  const raw = fsSync.readFileSync(envPath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

loadLocalEnv();

function getPublicAppUrl(req = null) {
  const configured = process.env.PUBLIC_APP_URL || process.env.APP_BASE_URL || "";
  if (configured) return configured.replace(/\/+$/, "");
  const host = req?.headers?.host || "localhost:3001";
  const proto = host.includes("localhost") || host.includes("127.0.0.1") ? "http" : "https";
  return `${proto}://${host}`;
}

function fillInviteTemplate(template, values = {}) {
  return String(template || "")
    .replace(/\{\{\s*name\s*\}\}/gi, values.name || "there")
    .replace(/\{\{\s*businessName\s*\}\}/gi, values.businessName || "EazInvoice workspace")
    .replace(/\{\{\s*role\s*\}\}/gi, values.role || "viewer")
    .replace(/\{\{\s*loginUrl\s*\}\}/gi, values.loginUrl || "")
    .replace(/\{\{\s*inviteLink\s*\}\}/gi, values.inviteLink || "");
}

function businessSmtpReady(settings = {}) {
  return Boolean(
    settings.smtpHost
    && settings.smtpPort
    && settings.smtpUser
    && settings.smtpPass
    && settings.fromEmail
  );
}

function smtpNotConfiguredMessage(action = "send this email") {
  return `Business SMTP is not configured, so EazInvoice saved the record but could not ${action}. Configure SMTP in Business Workspace to enable external email delivery.`;
}

function buildComplianceReminderMessage(emailSettings = {}, task = {}, recipient = "") {
  const businessName = emailSettings.senderName || "EazInvoice workspace";
  const complianceName = task.complianceName || task.id || "Compliance task";
  const dueDate = task.dueDate || task.dueDateLabel || "not set";
  const documents = Array.isArray(task.requiredDocuments) && task.requiredDocuments.length
    ? task.requiredDocuments.join(", ")
    : "As applicable";
  const lines = [
    "Hi,",
    "",
    `This is a compliance reminder from ${businessName}.`,
    "",
    `Task: ${complianceName}`,
    `Department: ${task.department || "Compliance"}`,
    `Due date: ${dueDate}`,
    `Responsible: ${task.responsiblePerson || "Not assigned"}`,
    `Required documents: ${documents}`,
    task.notes ? `Notes: ${task.notes}` : "",
    "",
    "Please review this task in your EazInvoice Business Workspace.",
    "",
    "EazInvoice",
  ];
  return {
    to: recipient,
    subject: `Compliance reminder: ${complianceName}`,
    text: lines.filter((line) => line !== "").join("\n"),
  };
}
function buildTeamInviteMessage(emailSettings = {}, member = {}, user = {}, req = null) {
  const appUrl = getPublicAppUrl(req);
  const loginUrl = `${appUrl}/apps/web/auth.html?tab=login`;
  const businessName = emailSettings.senderName || user.name || "EazInvoice";
  const text = fillInviteTemplate(
    emailSettings.inviteTemplate || "Hi {{name}},\n\n{{businessName}} has created a secure EazInvoice sub-user access for this email address as {{role}}.\n\nPlease sign up or log in using this same email address. No invite link is required.\n\nLogin page:\n{{loginUrl}}\n\nEazInvoice",
    {
      name: member.name,
      businessName,
      role: member.role,
      loginUrl,
    },
  );
  return {
    to: member.email,
    subject: emailSettings.inviteSubject || `EazInvoice access created for ${businessName}`,
    text,
  };
}

function buildApprovalNotificationMessage(emailSettings = {}, approval = {}, action = "created", actor = {}) {
  const businessName = emailSettings.senderName || actor.name || "EazInvoice workspace";
  const statusText = action === "decision"
    ? `marked as ${approval.status || "updated"}`
    : "created";
  const lines = [
    "Hi,",
    "",
    `An approval request has been ${statusText} in ${businessName}.`,
    "",
    `Document: ${approval.documentNumber || "Draft document"}`,
    `Type: ${String(approval.documentType || "invoice").replace(/_/g, " ")}`,
    `Status: ${approval.status || "pending"}`,
    approval.notes ? `Request notes: ${approval.notes}` : "",
    approval.decisionNotes ? `Decision notes: ${approval.decisionNotes}` : "",
    "",
    "Please review it in your EazInvoice Business Workspace.",
    "",
    "EazInvoice",
  ];
  return {
    subject: action === "decision"
      ? `Approval ${approval.status || "updated"}: ${approval.documentNumber || "Draft document"}`
      : `Approval requested: ${approval.documentNumber || "Draft document"}`,
    text: lines.filter((line) => line !== "").join("\n"),
  };
}

async function sendBusinessApprovalNotification(api, user, approval, body = {}, options = {}, action = "created") {
  const deliverySettings = api.getBusinessEmailDeliverySettings(user, {
    previewPlan: options.previewPlan,
    workspaceOwnerUserId: body.workspaceOwnerUserId || approval.ownerUserId || null,
    companyId: body.companyId || approval.companyId || null,
  });
  if (!businessSmtpReady(deliverySettings)) {
    return {
      notificationStatus: "not_configured",
      notificationMessage: smtpNotConfiguredMessage("send approval notification emails"),
    };
  }
  const owner = approval.ownerUserId ? api.getUserById(approval.ownerUserId) : null;
  const requester = approval.requestedByUserId ? api.getUserById(approval.requestedByUserId) : null;
  const fallbackRecipient = action === "decision"
    ? requester?.email
    : owner?.email;
  const recipient = String(
    body.notificationRecipient
    || fallbackRecipient
    || deliverySettings.replyToEmail
    || deliverySettings.fromEmail
    || user.email
    || "",
  ).trim();
  try {
    await sendSmtpMail(deliverySettings, {
      to: recipient,
      ...buildApprovalNotificationMessage(deliverySettings, approval, action, user),
    });
    return {
      notificationStatus: "sent",
      notificationMessage: `Approval notification sent to ${recipient}`,
    };
  } catch (error) {
    return {
      notificationStatus: "failed",
      notificationMessage: `Approval saved, but notification email failed: ${error.message}`,
    };
  }
}

function securityHeaders(extra = {}) {
  return {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "SAMEORIGIN",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    "Cross-Origin-Resource-Policy": "same-origin",
    ...extra,
  };
}

function sendJson(res, status, payload) {
  res.writeHead(status, {
    ...securityHeaders(),
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Eazinvoice-Plan-Preview",
    "Access-Control-Allow-Methods": "GET,POST,PATCH,DELETE,OPTIONS",
  });
  res.end(JSON.stringify(payload));
}

function knownRequestErrorStatus(error) {
  const message = String(error?.message || "");
  if (/Authentication required/i.test(message)) return 401;
  if (/access denied|team role cannot perform|Forbidden/i.test(message)) return 403;
  if (/available on|requires|upgrade|paid|standard|pro|business|plan/i.test(message)) return 402;
  return 500;
}

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8") || "{}"));
    req.on("error", reject);
  });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      try {
        const raw = Buffer.concat(chunks).toString("utf8") || "{}";
        resolve(JSON.parse(raw));
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

function parseJsonBody(raw) {
  return JSON.parse(raw || "{}");
}

function createOAuthStateStore() {
  const states = new Map();
  return {
    create(payload) {
      const state = `st_${Math.random().toString(36).slice(2, 10)}`;
      states.set(state, payload);
      return state;
    },
    consume(state) {
      const payload = states.get(state) ?? null;
      states.delete(state);
      return payload;
    },
  };
}

async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

async function saveBase64File({ fileName, mimeType, dataUrl }) {
  const uploadsDir = path.join(ROOT, "data", "uploads");
  await ensureDir(uploadsDir);
  const match = String(dataUrl || "").match(/^data:(.*?);base64,(.*)$/);
  if (!match) throw new Error("Invalid upload payload");
  const [, detectedMime, base64] = match;
  const safeName = String(fileName || "document")
    .replace(/[^A-Za-z0-9._-]+/g, "_")
    .slice(0, 80);
  const extension = (String(mimeType || detectedMime).split("/")[1] || "bin").replace(/[^A-Za-z0-9]/g, "");
  const storedName = `${Date.now()}_${safeName}.${extension}`;
  const filePath = path.join(uploadsDir, storedName);
  await fs.writeFile(filePath, Buffer.from(base64, "base64"));
  return {
    storedName,
    filePath: path.posix.join("/data/uploads", storedName),
    mimeType: mimeType || detectedMime,
  };
}

function getAdminIdentity() {
  return {
    email: process.env.ADMIN_EMAIL || "support@eazinvoice.com",
    accessKey: process.env.ADMIN_ACCESS_KEY || "eazinvoice-admin",
  };
}

function getAdminEmails() {
  const configured = [
    getAdminIdentity().email,
    process.env.ADMIN_EMAILS || "",
    "info@eazinvoice.com",
    "support@eazinvoice.com",
  ];
  return new Set(configured
    .flatMap((entry) => String(entry || "").split(","))
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean));
}

function usePostgresDashboardReports(options = {}) {
  const requested = options.reportsSource || process.env.EAZINVOICE_REPORTS_SOURCE || "";
  const normalized = String(requested).trim().toLowerCase();
  if (["runtime", "json", "local", "false", "off"].includes(normalized)) return false;
  if (normalized === "postgres") return true;
  return hasPostgresConfig();
}

  async function resolvePlanSummary(api, user, previewPlan, options = {}) {
    if (usePostgresEntitlements(options)) {
      try {
        const summary = await summarizePostgresEntitlements(user, { previewPlan });
        if (summary.available) return summary;
    } catch (error) {
      console.warn("Postgres entitlement summary failed; falling back to runtime store.", error.message);
    }
  }
    return api.getFreePlanSummary(user, { previewPlan });
  }

  async function resolveWriteEntitlement(api, user, previewPlan, options = {}, increments = {}) {
    const summary = await resolvePlanSummary(api, user, previewPlan, options);
    const nextUsage = {
      ...(summary.usage || {}),
    };
    Object.entries(increments).forEach(([key, value]) => {
      if (key === "invoiceItemsPerInvoice") {
        nextUsage[key] = Math.max(Number(nextUsage[key] || 0), Number(value || 0));
      } else {
        nextUsage[key] = Number(nextUsage[key] || 0) + Number(value || 0);
      }
    });
    const changedLimits = Object.fromEntries(
      Object.keys(increments).map((key) => [key, summary.limits?.[key] ?? Number.POSITIVE_INFINITY]),
    );
    const status = resolvePlanUsageStatus(nextUsage, changedLimits, { planLabel: summary.label || summary.plan || "active" });
    return {
      summary,
      limits: summary.limits || {},
      status,
      nextUsage,
    };
  }

  async function sendPlanLimitIfBlocked(res, api, user, previewPlan, options = {}, increments = {}) {
    const entitlement = await resolveWriteEntitlement(api, user, previewPlan, options, increments);
    if (!entitlement.status.allowed) {
      sendJson(res, 402, { error: entitlement.status.reason, plan: entitlement.summary.plan });
      return null;
    }
    return entitlement;
  }

async function resolveUserSubscriptions(api, user, options = {}) {
  if (usePostgresEntitlements(options)) {
    try {
      const result = await listPostgresSubscriptionsForUser(user.id);
      if (result.available) return result.subscriptions;
    } catch (error) {
      console.warn("Postgres subscription list failed; falling back to runtime store.", error.message);
    }
  }
  return api.listSubscriptions().filter((subscription) => subscription.userId === user.id);
}

function shouldSyncSubscriptionEntitlements(options = {}) {
  if (options.persist === false) return false;
  return hasPostgresConfig() && (isCoreTableSyncEnabled(options) || usePostgresEntitlements(options));
}

function shouldSyncInvoicePaymentReports(options = {}) {
  if (options.persist === false) return false;
  return hasPostgresConfig() && (isCoreTableSyncEnabled(options) || usePostgresDashboardReports(options));
}

function shouldSyncPurchaseOrderReports(options = {}) {
  if (options.persist === false) return false;
  return hasPostgresConfig() && (isCoreTableSyncEnabled(options) || usePostgresDashboardReports(options));
}

async function syncSchedulerInvoiceReportRows(result, source = "recurring-scheduler") {
  if (!shouldSyncInvoicePaymentReports()) {
    return [];
  }
  const createdInvoices = [
    ...(result?.created || []),
    ...((result?.results || []).flatMap((entry) => entry.created || [])),
  ];
  const synced = [];
  for (const invoice of createdInvoices) {
    try {
      await syncInvoiceToCoreTable(invoice, {
        auditEvent: "invoice_report_synced",
        source,
      });
      synced.push({
        invoiceId: invoice.id,
        synced: true,
      });
    } catch (error) {
      synced.push({
        invoiceId: invoice.id,
        synced: false,
        error: error.message,
      });
    }
  }
  return synced;
}

function adminRoleForEmail(email) {
  return getAdminEmails().has(String(email || "").trim().toLowerCase());
}

function adminPermissionsForEmail(email) {
  return adminRoleForEmail(email)
    ? ["admin", "subscriptions", "kyc-review", "account-control"]
    : [];
}

function getEmailOtpExpirySeconds() {
  const configured = Number(process.env.EMAIL_OTP_EXPIRES_SECONDS || 30);
  return Number.isFinite(configured) && configured > 0 ? configured : 30;
}

function getPublicBaseUrl() {
  if (process.env.PUBLIC_BASE_URL) return process.env.PUBLIC_BASE_URL.replace(/\/+$/, "");
  if (process.env.NODE_ENV === "production") return "https://www.eazinvoice.com";
  return "http://localhost:3001";
}

function isConfiguredAdminUser(user) {
  return Boolean(user?.email && adminRoleForEmail(user.email));
}

function getAdminPlanPreview(req, user) {
  if (!isConfiguredAdminUser(user)) return "";
  const requested = String(req.headers["x-eazinvoice-plan-preview"] || "").trim().toLowerCase();
  return PLAN_CATALOG[requested] ? requested : "";
}

function hasSubmittedKyc(company) {
  return Boolean(
    String(company.panNumber || "").trim() ||
    String(company.gstNumber || "").trim() ||
    String(company.addressProof || "").trim() ||
    (Array.isArray(company.documentNames) && company.documentNames.length) ||
    (Array.isArray(company.documentFiles) && company.documentFiles.length)
  );
}

function isPaidPlan(input) {
  return String(input.plan || "free").toLowerCase() !== "free" || Number(input.amount || 0) > 0;
}

function currentUserPlan(api, user) {
  const subscriptions = api.listSubscriptions()
    .filter((subscription) => subscription.userId === user.id)
    .slice()
    .reverse();
  return subscriptions.find((subscription) => String(subscription.status || "active").toLowerCase() === "active")
    || subscriptions[0]
    || { plan: "free", amount: 0, status: "active" };
}

function hasActivePaidPlan(api, user) {
  const plan = currentUserPlan(api, user);
  return isPaidPlan(plan) && String(plan.status || "active").toLowerCase() === "active";
}

function canManageSubscription(user, subscription) {
  if (!user || !subscription) return false;
  return isConfiguredAdminUser(user) || subscription.userId === user.id;
}

function hasPaidEntitlement(api, user, previewPlan = "") {
  return (previewPlan && previewPlan !== "free") || hasActivePaidPlan(api, user);
}

function hasStandardEntitlement(api, user, previewPlan = "") {
  return (previewPlan && previewPlan !== "free") || hasActivePaidPlan(api, user);
}

function sanitizeStandardInvoiceFeatures(api, user, previewPlan, body) {
  if (hasStandardEntitlement(api, user, previewPlan)) return body;
  return {
    ...body,
    recurringEnabled: false,
    recurringFrequency: "",
    recurringNextDate: "",
    hideEazinvoiceBranding: false,
  };
}

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const normalized = String(password || "");
  if (normalized.length < 8) {
    throw new Error("Password must be at least 8 characters");
  }
  const hash = crypto.pbkdf2Sync(normalized, salt, 100000, 32, "sha256").toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password, storedHash) {
  if (!storedHash) return false;
  const [salt, expectedHash] = String(storedHash).split(":");
  if (!salt || !expectedHash) return false;
  const actualHash = crypto.pbkdf2Sync(String(password || ""), salt, 100000, 32, "sha256").toString("hex");
  return crypto.timingSafeEqual(Buffer.from(actualHash, "hex"), Buffer.from(expectedHash, "hex"));
}

function readRegistrant(body) {
  if (body.subscriberType !== "company") return null;
  const registrant = {
    name: String(body.registrantName || body.name || "").trim(),
    designation: String(body.registrantDesignation || "").trim(),
    email: String(body.registrantEmail || body.email || "").trim(),
    phone: normalizePhone(body.registrantPhone || body.phone),
  };
  if (!registrant.name || !registrant.designation || !registrant.email || registrant.phone.length < 10) {
    throw new Error("Company signup requires registrant name, designation, email, and mobile number");
  }
  return registrant;
}

function promoteAdmin(user) {
  if (!user || !adminRoleForEmail(user.email)) return user;
  const promoted = {
    ...user,
    role: "admin",
    permissions: ["admin", "subscriptions", "kyc-review", "account-control"],
    accountStatus: user.accountStatus || "active",
  };
  return promoted;
}

function normalizePhone(phone) {
  const digits = String(phone || "").replace(/\D/g, "");
  if (digits.length === 10) return `91${digits}`;
  return digits;
}

function getSupabaseAuthConfig() {
  return {
    url: String(process.env.SUPABASE_URL || process.env.SUPABASE_PROJECT_URL || "").replace(/\/+$/, ""),
    key: process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || "",
  };
}

function isSupabaseEmailOtpConfigured() {
  const config = getSupabaseAuthConfig();
  return Boolean(config.url && config.key);
}

async function supabaseAuthRequest(pathname, body) {
  const config = getSupabaseAuthConfig();
  const response = await fetch(`${config.url}/auth/v1/${pathname}`, {
    method: "POST",
    headers: {
      apikey: config.key,
      Authorization: `Bearer ${config.key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.msg || payload.message || payload.error_description || payload.error || "Supabase email OTP request failed");
  }
  return payload;
}

async function requestSupabaseEmailOtp({ email }) {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  if (!normalizedEmail || !normalizedEmail.includes("@")) {
    throw new Error("Enter a valid email address for OTP verification");
  }
  await supabaseAuthRequest("otp", {
    email: normalizedEmail,
    create_user: true,
  });
  return { email: normalizedEmail, expiresInSeconds: getEmailOtpExpirySeconds() };
}

async function verifySupabaseEmailOtp({ email, otp }) {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  await supabaseAuthRequest("verify", {
    email: normalizedEmail,
    token: String(otp || "").trim(),
    type: "email",
  });
  return normalizedEmail;
}

function createEmailOtpStore() {
  const otps = new Map();
  return {
    request({ mode, email }) {
      const normalizedEmail = String(email || "").trim().toLowerCase();
      if (!normalizedEmail || !normalizedEmail.includes("@")) {
        throw new Error("Enter a valid email address for OTP verification");
      }
      const otp = String(Math.floor(100000 + Math.random() * 900000));
      otps.set(normalizedEmail, {
        otp,
        mode: mode || "login",
        expiresAt: Date.now() + getEmailOtpExpirySeconds() * 1000,
      });
      return { email: normalizedEmail, expiresInSeconds: getEmailOtpExpirySeconds(), devOtp: otp };
    },
    verify({ otp, mode, email }) {
      const normalizedEmail = String(email || "").trim().toLowerCase();
      const entry = otps.get(normalizedEmail);
      if (!entry || entry.expiresAt < Date.now()) {
        throw new Error("Email OTP has expired. Request a new OTP.");
      }
      if (entry.otp !== String(otp || "").trim()) {
        throw new Error("Invalid email OTP");
      }
      if (mode && entry.mode !== mode) {
        throw new Error("OTP was requested for a different auth flow");
      }
      otps.delete(normalizedEmail);
      return normalizedEmail;
    },
  };
}

function extractToken(req) {
  const auth = req.headers.authorization || "";
  if (auth.startsWith("Bearer ")) return auth.slice(7);
  return null;
}

const PAID_PLAN_CATALOG = Object.fromEntries(
  Object.entries(PLAN_CATALOG).filter(([plan]) => plan !== "free")
);

function annualPlanCharge(plan) {
  return Number(plan.annualAmount ?? (Number(plan.amount || 0) * 12));
}

function getRazorpayConfig() {
  const keyId = process.env.RAZORPAY_KEY_ID || "";
  const keySecret = process.env.RAZORPAY_KEY_SECRET || "";
  return {
    keyId,
    keySecret,
    webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET || "",
    publicUrl: process.env.EAZINVOICE_PUBLIC_URL || process.env.RENDER_EXTERNAL_URL || "http://localhost:3001",
    enabled: Boolean(keyId && keySecret),
  };
}

function maskSecret(value) {
  const text = String(value || "");
  if (!text) return "";
  if (text.length <= 8) return "configured";
  return `${text.slice(0, 8)}...${text.slice(-4)}`;
}

function getGatewayStatus() {
  const razorpay = getRazorpayConfig();
  const keyMode = razorpay.keyId.includes("_live_") ? "live" : razorpay.keyId.includes("_test_") ? "test" : "unknown";
  return {
    adminEmails: [...getAdminEmails()],
    razorpay: {
      provider: "razorpay",
      enabled: razorpay.enabled,
      mode: razorpay.enabled ? keyMode : "not_configured",
      keyIdMasked: maskSecret(razorpay.keyId),
      keySecretConfigured: Boolean(razorpay.keySecret),
      webhookSecretConfigured: Boolean(razorpay.webhookSecret),
      publicUrl: razorpay.publicUrl,
      webhookUrl: `${razorpay.publicUrl.replace(/\/$/, "")}/webhooks/razorpay`,
      supportedFlows: [
        "Paid plan checkout",
        "Invoice online collection",
        "Verified payment signature",
        "Webhook signature verification",
      ],
      requiredEnvironmentVariables: [
        "RAZORPAY_KEY_ID",
        "RAZORPAY_KEY_SECRET",
        "RAZORPAY_WEBHOOK_SECRET",
        "EAZINVOICE_PUBLIC_URL",
      ],
    },
  };
}

function verifyRazorpaySignature({ orderId, paymentId, signature, keySecret }) {
  const expected = crypto
    .createHmac("sha256", keySecret)
    .update(`${orderId}|${paymentId}`)
    .digest("hex");
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(String(signature || ""));
  return expectedBuffer.length === actualBuffer.length && crypto.timingSafeEqual(expectedBuffer, actualBuffer);
}

function verifyRazorpayWebhook(rawBody, signature, webhookSecret) {
  if (!webhookSecret) return false;
  const expected = crypto.createHmac("sha256", webhookSecret).update(rawBody).digest("hex");
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(String(signature || ""));
  return expectedBuffer.length === actualBuffer.length && crypto.timingSafeEqual(expectedBuffer, actualBuffer);
}

async function razorpayRequest(pathname, body) {
  const config = getRazorpayConfig();
  if (!config.enabled) {
    throw new Error("Razorpay is not configured. Add RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.");
  }
  const credentials = Buffer.from(`${config.keyId}:${config.keySecret}`).toString("base64");
  const response = await fetch(`https://api.razorpay.com/v1${pathname}`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error?.description || payload.error?.reason || "Razorpay request failed");
  }
  return payload;
}

const ROOT = process.cwd();
const STATIC_ROOTS = [
  { prefix: "/apps/web/", dir: path.join(ROOT, "apps", "web") },
  { prefix: "/apps/mobile/", dir: path.join(ROOT, "apps", "mobile") },
  { prefix: "/plugins/wordpress/", dir: path.join(ROOT, "plugins", "wordpress") },
  { prefix: "/apps/api/src/", dir: path.join(ROOT, "apps", "api", "src") },
  { prefix: "/data/uploads/", dir: path.join(ROOT, "data", "uploads") },
];

function contentType(filePath) {
  if (filePath.endsWith(".html")) return "text/html; charset=utf-8";
  if (filePath.endsWith(".css")) return "text/css; charset=utf-8";
  if (filePath.endsWith(".js")) return "application/javascript; charset=utf-8";
  if (filePath.endsWith(".php")) return "text/plain; charset=utf-8";
  return "application/octet-stream";
}

async function tryServeStatic(urlPath, res) {
  const match = STATIC_ROOTS.find((root) => urlPath.startsWith(root.prefix));
  if (!match) return false;
  const relativePath = urlPath.slice(match.prefix.length);
  if (match.prefix === "/apps/api/src/" && relativePath !== "client.js") {
    res.writeHead(403, securityHeaders({ "Content-Type": "text/plain; charset=utf-8" }));
    res.end("Forbidden");
    return true;
  }
  const filePath = path.join(match.dir, relativePath || "index.html");
  try {
    const data = await fs.readFile(filePath);
    res.writeHead(200, {
      ...securityHeaders(),
      "Content-Type": contentType(filePath),
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "no-store",
    });
    res.end(data);
    return true;
  } catch {
    return false;
  }
}

export function createServer(options = {}) {
  const persistenceAdapter = options.persistenceAdapter
    ?? (options.persist !== false && isCoreTableSyncEnabled(options) ? createCoreTableSyncPersistenceAdapter() : undefined);
  const store = options.store ?? createStore({}, {
    persist: options.persist !== false,
    persistenceAdapter,
  });
  const api = createApi({ store });
  const sessions = createSessionStore();
  const oauthStates = createOAuthStateStore();
  const emailOtps = createEmailOtpStore();
  const useSupabaseEmailOtp = options.useSupabaseEmailOtp ?? isSupabaseEmailOtpConfigured();
  const rateBuckets = new Map();

  function isRateLimited(req, url) {
    const sensitive = [
      "/auth/email-otp/request",
      "/auth/signup",
      "/auth/login",
      "/billing/razorpay/order",
      "/billing/razorpay/verify",
      "/webhooks/razorpay",
      "/wordpress/connection",
    ];
    if (!sensitive.includes(url.pathname)) return false;
    const windowMs = 60_000;
    const max = url.pathname === "/auth/email-otp/request" ? 20 : 120;
    const now = Date.now();
    const ip = String(req.headers["x-forwarded-for"] || req.socket.remoteAddress || "local").split(",")[0].trim();
    const key = `${ip}:${req.method}:${url.pathname}`;
    const bucket = (rateBuckets.get(key) || []).filter((timestamp) => now - timestamp < windowMs);
    bucket.push(now);
    rateBuckets.set(key, bucket);
    return bucket.length > max;
  }

  function subscriptionEntitlementKey(subscription) {
    if (!subscription) return "";
    return [
      String(subscription.id || ""),
      String(subscription.userId || ""),
      String(subscription.plan || "free").toLowerCase(),
      String(subscription.status || "active").toLowerCase(),
      String(subscription.gatewayOrderId || ""),
      String(subscription.gatewayPaymentId || ""),
      String(subscription.expiresAt || subscription.renewsAt || ""),
    ].join("|");
  }

  async function syncUserSubscriptionEntitlements(userId, source = "subscription-write") {
    if (!userId || !shouldSyncSubscriptionEntitlements(options)) {
      return {
        synced: false,
      };
    }
    const subscriptions = api.listSubscriptions().filter((entry) => entry.userId === userId);
    await withPostgresClient(async (client) => {
      await client.query("BEGIN");
      try {
        await syncSubscriptions(client, subscriptions);
        await client.query(
          `insert into eazinvoice_audit_events (event_type, entity_type, entity_id, metadata)
           values ($1, $2, $3, $4::jsonb)`,
          [
            "subscription_entitlements_verified",
            "subscription",
            userId,
            JSON.stringify({
              userId,
              source,
              subscriptions: subscriptions.length,
            }),
          ],
        );
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    });
    const result = await listPostgresSubscriptionsForUser(userId);
    if (!result.available) {
      throw new Error("Subscription was saved but Postgres entitlements are unavailable.");
    }
    const expected = subscriptions.map(subscriptionEntitlementKey).sort();
    const actual = result.subscriptions.map(subscriptionEntitlementKey).sort();
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      throw new Error("Subscription was saved but its Postgres entitlement mirror did not match.");
    }
    return {
      synced: true,
      subscriptions: subscriptions.length,
    };
  }

  async function sendSubscriptionLifecycleResult(res, subscription, source, statusCode = 200) {
    const entitlementSync = await syncUserSubscriptionEntitlements(subscription.userId, source);
    sendJson(res, statusCode, { ...subscription, entitlementSync });
  }

  async function syncInvoicePaymentReportRows(recorded) {
    if (!recorded?.invoice || !recorded?.payment || !shouldSyncInvoicePaymentReports(options)) {
      return {
        synced: false,
      };
    }
    await syncInvoicePaymentToCoreTables(recorded.invoice, recorded.payment, {
      auditEvent: "invoice_payment_report_synced",
      source: "payment-recording",
    });
    return {
      synced: true,
    };
  }

  async function syncInvoiceReportRows(invoice, source = "invoice-write") {
    if (!invoice || !shouldSyncInvoicePaymentReports(options)) {
      return {
        synced: false,
      };
    }
    await syncInvoiceToCoreTable(invoice, {
      auditEvent: "invoice_report_synced",
      source,
    });
    return {
      synced: true,
    };
  }

  async function syncPurchaseOrderReportRows(purchaseOrder, source = "purchase-order-write") {
    if (!purchaseOrder || !shouldSyncPurchaseOrderReports(options)) {
      return {
        synced: false,
      };
    }
    await syncPurchaseOrderToCoreTable(purchaseOrder, {
      auditEvent: "purchase_order_report_synced",
      source,
    });
    return {
      synced: true,
    };
  }

  async function syncBusinessWorkspaceRows(source = "business-workspace-write") {
    if (options.persist === false || !hasPostgresConfig() || !isCoreTableSyncEnabled(options)) {
      return {
        synced: false,
      };
    }
    await syncBusinessWorkspaceToCoreTables(api.exportDataSnapshot(), {
      auditEvent: "business_workspace_write_synced",
      source,
    });
    return {
      synced: true,
    };
  }

  async function activateVerifiedRazorpayOrder(orderMeta, paymentId, orderId) {
    if (!orderMeta) return null;
    const now = new Date().toISOString();
    api.updateBillingOrder(orderId, {
      status: "verified",
      gatewayPaymentId: paymentId,
      verifiedAt: now,
    });

    if (orderMeta.kind === "subscription") {
      const existing = api.listSubscriptions().find((subscription) => (
        subscription.gatewayOrderId === orderId || subscription.gatewayPaymentId === paymentId
      ));
      if (existing) {
        const entitlementSync = await syncUserSubscriptionEntitlements(existing.userId, "razorpay-duplicate-verification");
        return { ok: true, type: "subscription", subscription: existing, duplicate: true, entitlementSync };
      }
      const subscriptionUser = api.getUserById(orderMeta.userId);
      const subscription = api.createSubscription({
        subscriberType: "individual",
        subscriberName: subscriptionUser?.name || subscriptionUser?.email || "Subscriber",
        companyId: orderMeta.companyId || null,
        userId: orderMeta.userId,
        amount: orderMeta.amount,
        monthlyAmount: orderMeta.monthlyAmount,
        annualAmount: orderMeta.annualAmount ?? orderMeta.amount,
        currency: orderMeta.currency,
        plan: orderMeta.plan,
        billingCycle: orderMeta.billingCycle,
        status: "active",
        adminUserId: subscriptionUser && isConfiguredAdminUser(subscriptionUser) ? subscriptionUser.id : null,
        gateway: "razorpay",
        gatewayPaymentId: paymentId,
        gatewayOrderId: orderId,
      });
      const entitlementSync = await syncUserSubscriptionEntitlements(subscription.userId, "razorpay-activation");
      api.updateBillingOrder(orderId, { status: "consumed", consumedAt: new Date().toISOString() });
      return { ok: true, type: "subscription", subscription, entitlementSync };
    }

    if (orderMeta.kind === "invoice") {
      const invoice = api.getInvoice(orderMeta.invoiceId);
      const alreadyCaptured = api.listPayments()
        .find((payment) => payment.gatewayOrderId === orderId || payment.gatewayPaymentId === paymentId);
      if (alreadyCaptured && invoice) {
        const reportSync = await syncInvoicePaymentReportRows({ invoice, payment: alreadyCaptured });
        return { ok: true, type: "invoice", invoice, payment: alreadyCaptured, duplicate: true, reportSync };
      }
      const recorded = api.recordInvoicePayment(orderMeta.invoiceId, {
        amount: orderMeta.amount,
        currency: orderMeta.currency,
        mode: "payment_gateway",
        reference: paymentId,
        notes: "Verified Razorpay checkout payment",
        status: "captured",
        gateway: "razorpay",
        gatewayPaymentId: paymentId,
        gatewayOrderId: orderId,
      });
      if (!recorded) return null;
      const reportSync = await syncInvoicePaymentReportRows(recorded);
      api.updateBillingOrder(orderId, { status: "consumed", consumedAt: new Date().toISOString() });
      return { ok: true, type: "invoice", ...recorded, reportSync };
    }

    return null;
  }

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, "http://localhost");

    if ((url.pathname === "/" || url.pathname === "/index.html") && (req.method === "GET" || req.method === "HEAD")) {
      res.writeHead(302, {
        ...securityHeaders(),
        Location: "/apps/web/index.html",
        "Cache-Control": "no-store",
      });
      res.end();
      return;
    }

    if (await tryServeStatic(url.pathname, res)) return;

    if (isRateLimited(req, url)) {
      sendJson(res, 429, { error: "Too many requests. Please wait a moment and try again." });
      return;
    }

    if (req.method === "OPTIONS") {
      sendJson(res, 204, {});
      return;
    }

    if (url.pathname === "/health" && req.method === "GET") {
      sendJson(res, 200, api.healthCheck());
      return;
    }

    if (url.pathname === "/webhooks/razorpay" && req.method === "POST") {
      try {
        const rawBody = await readRawBody(req);
        const config = getRazorpayConfig();
        if (!verifyRazorpayWebhook(rawBody, req.headers["x-razorpay-signature"], config.webhookSecret)) {
          sendJson(res, 401, { error: "Invalid Razorpay webhook signature" });
          return;
        }
        const body = parseJsonBody(rawBody);
        const event = String(body.event || body.type || "payment.captured");
        if (!event.includes("payment") && !event.includes("payment_link")) {
          sendJson(res, 202, { ok: true, ignored: true });
          return;
        }
        const payload = body.payload?.payment?.entity || body.payload?.payment_link?.entity || body.payload || body;
        const orderId = payload.order_id || payload.razorpay_order_id || payload.notes?.gatewayOrderId || "";
        const paymentId = payload.razorpay_payment_id || payload.payment_id || payload.id || "";
        const orderMeta = orderId ? api.getBillingOrderByGatewayOrderId(orderId) : null;
        if (orderMeta) {
          const activated = await activateVerifiedRazorpayOrder(orderMeta, paymentId, orderId);
          if (!activated) {
            sendJson(res, 404, { error: "Razorpay order could not be activated" });
            return;
          }
          sendJson(res, 200, activated);
          return;
        }
        const recorded = api.recordGatewayPayment({
          invoiceId: payload.invoiceId || payload.notes?.invoiceId,
          paymentLinkId: payload.paymentLinkId || payload.payment_link_id || payload.id,
          amount: payload.amount ? Number(payload.amount) / 100 : payload.amountPaid,
          currency: payload.currency,
          razorpay_payment_id: paymentId,
          razorpay_order_id: orderId,
          gateway: "razorpay",
        });
        if (!recorded) {
          sendJson(res, 404, { error: "Invoice not found for payment webhook" });
          return;
        }
        const reportSync = await syncInvoicePaymentReportRows(recorded);
        sendJson(res, 200, { ok: true, ...recorded, reportSync });
      } catch (error) {
        sendJson(res, 400, { error: error.message });
      }
      return;
    }

    if (url.pathname === "/auth/email-otp/request" && req.method === "POST") {
      try {
        const body = await readBody(req);
        const mode = body.mode || "login";
        const existing = api.getUserByEmail(body.email ?? "");
        if (mode === "signup" && existing) {
          sendJson(res, 409, {
            error: "You have already registered. Please login.",
            code: "USER_ALREADY_REGISTERED",
          });
          return;
        }
        if (mode === "login" && !existing) {
          sendJson(res, 404, {
            error: "This email is not registered yet. Please signup first.",
            code: "USER_NOT_REGISTERED",
          });
          return;
        }
        const otp = useSupabaseEmailOtp
          ? await requestSupabaseEmailOtp({ email: body.email })
          : emailOtps.request({
            email: body.email,
            mode,
          });
        sendJson(res, 200, {
          ok: true,
          provider: useSupabaseEmailOtp ? "supabase" : "local-email",
          message: useSupabaseEmailOtp ? "Email OTP sent by Supabase" : "Email OTP requested",
          ...otp,
        });
      } catch (error) {
        const isRateLimit = /rate limit/i.test(error.message || "");
        sendJson(res, isRateLimit ? 429 : 400, {
          error: isRateLimit
            ? "Supabase email OTP rate limit exceeded. Please wait a few minutes before requesting another code."
            : error.message,
        });
      }
      return;
    }

    if (url.pathname === "/auth/signup" && req.method === "POST") {
      const body = await readBody(req);
      try {
        if (useSupabaseEmailOtp) {
          await verifySupabaseEmailOtp({ email: body.email, otp: body.otp });
        } else {
          emailOtps.verify({
            otp: body.otp,
            email: body.email,
            mode: "signup",
          });
        }
      } catch (error) {
        sendJson(res, 401, { error: error.message });
        return;
      }
      const existing = api.getUserByEmail(body.email ?? "");
      let passwordHash;
      let registrant;
      const normalizedPhone = normalizePhone(body.phone);
      try {
        passwordHash = hashPassword(body.password);
        registrant = readRegistrant(body);
      } catch (error) {
        sendJson(res, 400, { error: error.message });
        return;
      }
      const user = promoteAdmin(existing
        ? api.updateUserAuthDetails(existing.id, {
          phone: normalizedPhone,
          mobileVerified: false,
          emailVerified: true,
          passwordHash,
          subscriberType: body.subscriberType || existing.subscriberType || "individual",
          registrant,
        })
        : api.createUser({
        name: body.name ?? "",
        email: body.email ?? "",
        phone: normalizedPhone,
        mobileVerified: false,
        emailVerified: true,
        passwordHash,
        subscriberType: body.subscriberType || "individual",
        registrant,
        role: adminRoleForEmail(body.email) ? "admin" : "user",
        permissions: adminPermissionsForEmail(body.email),
      }));
      const token = sessions.create(user);
      sendJson(res, 201, { user, token });
      return;
    }

    if (url.pathname === "/auth/login" && req.method === "POST") {
      const body = await readBody(req);
      const existing = api.getUserByEmail(body.email ?? "");
      if (!existing) {
        sendJson(res, 401, { error: "Invalid email, password, or OTP" });
        return;
      }
      if (!verifyPassword(body.password, existing.passwordHash)) {
        sendJson(res, 401, { error: "Invalid email, password, or OTP" });
        return;
      }
      try {
        if (useSupabaseEmailOtp) {
          await verifySupabaseEmailOtp({ email: body.email, otp: body.otp });
        } else {
          emailOtps.verify({
            otp: body.otp,
            email: body.email,
            mode: "login",
          });
        }
      } catch (error) {
        sendJson(res, 401, { error: error.message });
        return;
      }
      const user = promoteAdmin(existing
        ? api.updateUserAuthDetails(existing.id, {
          emailVerified: true,
        })
        : null);
      const token = sessions.create(user);
      sendJson(res, 200, { user, token });
      return;
    }

    if (url.pathname === "/auth/google" && req.method === "POST") {
      const body = await readBody(req);
      const user = promoteAdmin(api.createUser({
        name: body.name ?? "Google User",
        email: body.email ?? "google-user@example.com",
        role: adminRoleForEmail(body.email) ? "admin" : "user",
        permissions: adminPermissionsForEmail(body.email),
      }));
      const token = sessions.create(user);
      sendJson(res, 200, { user, token, provider: "google" });
      return;
    }

    if (url.pathname === "/auth/admin" && req.method === "POST") {
      sendJson(res, 410, { error: "Admin access now uses the normal signup and login flow." });
      return;
    }

    if (url.pathname === "/auth/google/start" && req.method === "GET") {
      const clientId = process.env.GOOGLE_CLIENT_ID;
      const redirectUri = process.env.GOOGLE_REDIRECT_URI || `${getPublicBaseUrl()}/auth/google/callback`;
      if (!clientId) {
        sendJson(res, 500, {
          error: "Google login is not configured yet. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REDIRECT_URI.",
        });
        return;
      }
      const state = oauthStates.create({
        mode: url.searchParams.get("mode") || "login",
      });
      const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
      authUrl.searchParams.set("client_id", clientId);
      authUrl.searchParams.set("redirect_uri", redirectUri);
      authUrl.searchParams.set("response_type", "code");
      authUrl.searchParams.set("scope", "openid email profile");
      authUrl.searchParams.set("state", state);
      authUrl.searchParams.set("access_type", "offline");
      authUrl.searchParams.set("prompt", "consent");
      res.writeHead(302, {
        ...securityHeaders(),
        Location: authUrl.toString(),
        "Access-Control-Allow-Origin": "*",
      });
      res.end();
      return;
    }

    if (url.pathname === "/auth/google/callback" && req.method === "GET") {
      const code = url.searchParams.get("code");
      const state = url.searchParams.get("state");
      const oauthState = oauthStates.consume(state);
      if (!code || !oauthState) {
        sendJson(res, 400, { error: "Invalid Google OAuth callback" });
        return;
      }

      const clientId = process.env.GOOGLE_CLIENT_ID;
      const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
      const redirectUri = process.env.GOOGLE_REDIRECT_URI || `${getPublicBaseUrl()}/auth/google/callback`;
      if (!clientId || !clientSecret) {
        sendJson(res, 500, {
          error: "Google OAuth secrets are not configured. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.",
        });
        return;
      }

      const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri,
          grant_type: "authorization_code",
        }),
      });
      const tokenPayload = await tokenResponse.json();
      if (!tokenResponse.ok) {
        sendJson(res, 400, { error: tokenPayload.error_description || tokenPayload.error || "Google token exchange failed" });
        return;
      }

      const profileResponse = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
        headers: { Authorization: `Bearer ${tokenPayload.access_token}` },
      });
      const profile = await profileResponse.json();
      if (!profileResponse.ok) {
        sendJson(res, 400, { error: profile.error || "Google userinfo failed" });
        return;
      }

      const user = api.createUser({
        name: profile.name || profile.email || "Google User",
        email: profile.email || "google-user@example.com",
        role: adminRoleForEmail(profile.email) ? "admin" : "user",
        permissions: adminPermissionsForEmail(profile.email),
      });
      const token = sessions.create(user);
      const destination = new URL(`${getPublicBaseUrl()}/apps/web/index.html`);
      destination.searchParams.set("token", token);
      destination.searchParams.set("provider", "google");
      destination.searchParams.set("mode", oauthState.mode);
      const html = `<!doctype html><html><body><script>localStorage.setItem('eazinvoice_token', ${JSON.stringify(token)});window.location.href=${JSON.stringify(destination.toString())};</script></body></html>`;
      res.writeHead(200, securityHeaders({ "Content-Type": "text/html; charset=utf-8" }));
      res.end(html);
      return;
    }

    if (url.pathname === "/wordpress/connection" && req.method === "POST") {
      try {
        const body = await readBody(req);
        sendJson(res, 200, api.validateWordPressConnection(body));
      } catch (error) {
        sendJson(res, /invalid|not found|revoked|does not belong/i.test(error.message) ? 401 : 400, { error: error.message });
      }
      return;
    }

    const token = extractToken(req);
    const sessionUser = token ? sessions.get(token) : null;
    const user = sessionUser ? api.getUserById(sessionUser.id) || sessionUser : null;
    if (!user) {
      sendJson(res, 401, { error: "Unauthorized" });
      return;
    }
    const previewPlan = getAdminPlanPreview(req, user);
    if (user.accountStatus === "restricted" && !isConfiguredAdminUser(user)) {
      sendJson(res, 403, {
        error: "Account restricted by admin",
        restrictedReason: user.restrictedReason || "Suspicious activity review",
      });
      return;
    }

    if (url.pathname === "/me" && req.method === "GET") {
      sendJson(res, 200, {
        user,
        plan: await resolvePlanSummary(api, user, previewPlan, options),
        admin: {
          authorized: isConfiguredAdminUser(user),
          email: getAdminIdentity().email,
          planPreview: previewPlan,
        },
      });
      return;
    }

    if (url.pathname === "/me" && req.method === "PATCH") {
      const body = await readBody(req);
      const registrant = body.registrant && typeof body.registrant === "object"
        ? {
          name: String(body.registrant.name || "").trim(),
          designation: String(body.registrant.designation || "").trim(),
          email: String(body.registrant.email || "").trim(),
          phone: normalizePhone(body.registrant.phone || ""),
        }
        : undefined;
      const newPassword = String(body.newPassword || "");
      if (newPassword && !verifyPassword(body.currentPassword, user.passwordHash)) {
        sendJson(res, 400, { error: "Current password is incorrect" });
        return;
      }
      const updated = api.updateUserProfile(user.id, {
        name: body.name,
        phone: body.phone ? normalizePhone(body.phone) : undefined,
        panNumber: body.panNumber,
        aadhaarNumber: body.aadhaarNumber,
        subscriberType: body.subscriberType,
        registrant,
      });
      if (newPassword) {
        api.updateUserAuthDetails(user.id, { passwordHash: hashPassword(newPassword) });
      }
      sendJson(res, 200, {
        user: updated,
        plan: api.getFreePlanSummary(updated, { previewPlan: getAdminPlanPreview(req, updated) }),
        admin: {
          authorized: isConfiguredAdminUser(updated),
          email: getAdminIdentity().email,
          planPreview: getAdminPlanPreview(req, updated),
        },
      });
      return;
    }

    if (url.pathname === "/admin/money" && req.method === "GET") {
      if (!isConfiguredAdminUser(user)) {
        sendJson(res, 403, { error: "Forbidden" });
        return;
      }
      sendJson(res, 200, {
        admin: user,
        summary: api.summarizeMonetization(),
        subscriptions: api.listSubscriptions(),
        billingOrders: api.listBillingOrders(),
        monetization: api.listMonetization(),
      });
      return;
    }

    if (url.pathname === "/admin/subscription-audit" && req.method === "GET") {
      if (!isConfiguredAdminUser(user)) {
        sendJson(res, 403, { error: "Forbidden" });
        return;
      }
      const catalog = api.listPlans().map((plan) => ({
        plan: plan.plan,
        label: plan.label,
        monthlyAmount: plan.monthlyAmount ?? plan.amount ?? 0,
        annualAmount: plan.annualAmount ?? annualPlanCharge(plan),
        razorpayAmountPaise: Math.round(Number(plan.annualAmount ?? annualPlanCharge(plan)) * 100),
        billingCycle: plan.billingCycle || "yearly",
        expected: plan.plan === "free"
          ? "No paid checkout"
          : `${plan.currency || "INR"} ${plan.monthlyAmount ?? plan.amount}/month collected yearly as ${plan.currency || "INR"} ${plan.annualAmount ?? annualPlanCharge(plan)}`,
      }));
      const users = api.listUsers();
      const usersById = new Map(users.map((entry) => [entry.id, entry]));
      const subscriptions = api.listSubscriptions();
      const billingOrders = api.listBillingOrders();
      const rows = await Promise.all(subscriptions.map(async (subscription) => {
        const subscriber = usersById.get(subscription.userId) || null;
        const activeSummary = subscriber
          ? await resolvePlanSummary(api, subscriber, "", options)
          : null;
        const postgresStatus = {
          checked: false,
          status: "not_configured",
          message: "Postgres entitlement reads are not enabled for this request.",
        };
        if (subscriber && usePostgresEntitlements(options)) {
          try {
            const postgresSummary = await summarizePostgresEntitlements(subscriber);
            postgresStatus.checked = true;
            postgresStatus.status = postgresSummary.available && postgresSummary.plan === activeSummary?.plan
              ? "matched"
              : "mismatch";
            postgresStatus.message = postgresSummary.available
              ? `Postgres plan ${postgresSummary.plan || "free"} / runtime plan ${activeSummary?.plan || "free"}`
              : "Postgres entitlement summary was unavailable.";
          } catch (error) {
            postgresStatus.checked = true;
            postgresStatus.status = "failed";
            postgresStatus.message = error.message;
          }
        }
        return {
          ...subscription,
          userEmail: subscriber?.email || "",
          userName: subscriber?.name || "",
          activePlan: activeSummary?.plan || "free",
          activePlanLabel: activeSummary?.label || "Free",
          entitlementSync: postgresStatus,
        };
      }));
      const summary = rows.reduce((acc, subscription) => {
        const status = String(subscription.status || "active").toLowerCase();
        acc.total += 1;
        acc.byStatus[status] = (acc.byStatus[status] || 0) + 1;
        if (String(subscription.plan || "free").toLowerCase() !== "free") acc.paid += 1;
        if (subscription.entitlementSync?.status === "mismatch" || subscription.entitlementSync?.status === "failed") acc.syncIssues += 1;
        return acc;
      }, { total: 0, paid: 0, syncIssues: 0, byStatus: {} });
      sendJson(res, 200, { summary, catalog, subscriptions: rows, billingOrders });
      return;
    }

    if (url.pathname === "/admin/gateway" && req.method === "GET") {
      if (!isConfiguredAdminUser(user)) {
        sendJson(res, 403, { error: "Forbidden" });
        return;
      }
      sendJson(res, 200, getGatewayStatus());
      return;
    }

    if (url.pathname === "/admin/persistence" && req.method === "GET") {
      if (!isConfiguredAdminUser(user)) {
        sendJson(res, 403, { error: "Forbidden" });
        return;
      }
      sendJson(res, 200, await api.getPersistenceStatus());
      return;
    }

    if (url.pathname === "/admin/users" && req.method === "GET") {
      if (!isConfiguredAdminUser(user)) {
        sendJson(res, 403, { error: "Forbidden" });
        return;
      }
      sendJson(res, 200, {
        users: api.listUsers(),
        restricted: api.listRestrictedUsers(),
      });
      return;
    }

    if (url.pathname === "/admin/kyc-review" && req.method === "GET") {
      if (!isConfiguredAdminUser(user)) {
        sendJson(res, 403, { error: "Forbidden" });
        return;
      }
      sendJson(res, 200, {
        companies: api.listCompanies(),
      });
      return;
    }

    if (url.pathname.startsWith("/admin/kyc-review/") && req.method === "PATCH") {
      if (!isConfiguredAdminUser(user)) {
        sendJson(res, 403, { error: "Forbidden" });
        return;
      }
      const companyId = url.pathname.split("/")[3];
      const action = url.searchParams.get("action") || "approve";
      const body = await readBody(req).catch(() => ({}));
      const updated = api.updateCompanyKyc(companyId, {
        kycStatus: action === "approve" ? "verified" : "rejected",
        reviewStatus: action === "approve" ? "approved" : "rejected",
        reviewNotes: body.reason || body.notes || (action === "approve" ? "KYC approved" : "KYC rejected"),
        reviewedAt: new Date().toISOString(),
      });
      if (!updated) {
        sendJson(res, 404, { error: "Company not found" });
        return;
      }
      sendJson(res, 200, updated);
      return;
    }

    if (url.pathname === "/uploads" && req.method === "POST") {
      const body = await readBody(req);
      const files = Array.isArray(body.files) ? body.files : [];
      if (!files.length) {
        sendJson(res, 400, { error: "No files to upload" });
        return;
      }
      const stored = [];
      for (const file of files) {
        stored.push(await saveBase64File(file));
      }
      sendJson(res, 201, { files: stored });
      return;
    }

    if (url.pathname.startsWith("/admin/users/") && req.method === "PATCH") {
      if (!isConfiguredAdminUser(user)) {
        sendJson(res, 403, { error: "Forbidden" });
        return;
      }
      const userId = url.pathname.split("/")[3];
      const action = url.searchParams.get("action") || "restrict";
      const body = await readBody(req).catch(() => ({}));
      if (action === "permissions") {
        const targetUser = api.getUserById(userId);
        const requestedPermissions = Array.isArray(body.permissions) ? body.permissions : [];
        const permissions = adminRoleForEmail(targetUser?.email)
          ? requestedPermissions
          : requestedPermissions.filter((permission) => permission !== "admin");
        const updated = api.setUserPermissions(userId, permissions);
        if (!updated) {
          sendJson(res, 404, { error: "User not found" });
          return;
        }
        sendJson(res, 200, updated);
        return;
      }
      const updated = api.setUserRestriction(userId, {
        accountStatus: action === "restore" ? "active" : "restricted",
        restrictedReason: body.reason || (action === "restore" ? "" : "Suspicious activity review"),
        restrictedAt: action === "restore" ? "" : new Date().toISOString(),
      });
      if (!updated) {
        sendJson(res, 404, { error: "User not found" });
        return;
      }
      sendJson(res, 200, updated);
      return;
    }

    if (url.pathname === "/plan/free" && req.method === "GET") {
      sendJson(res, 200, await resolvePlanSummary(api, user, previewPlan, options));
      return;
    }

    if (url.pathname === "/plans" && req.method === "GET") {
      sendJson(res, 200, {
        active: await resolvePlanSummary(api, user, previewPlan, options),
        catalog: api.listPlans(),
      });
      return;
    }

    if (url.pathname === "/companies" && req.method === "GET") {
      sendJson(res, 200, api.listCompanies(user, {
        previewPlan,
        workspaceOwnerUserId: url.searchParams.get("workspaceOwnerUserId") || null,
      }));
      return;
    }

    if (url.pathname === "/companies" && req.method === "POST") {
      const body = await readBody(req);
      const entityType = body.entityType || "company";
      const isOnboardingProfile = body.profilePurpose === "onboarding";
      const requiresAadhaar = entityType === "freelancer" || entityType === "consultant";
      const address = String(body.address || "").trim();
      const panNumber = String(body.panNumber || "").trim();
      const gstNumber = String(body.gstNumber || "").trim();
      const aadhaarNumber = String(body.aadhaarNumber || "").trim();
      const addressProof = String(body.addressProof || "").trim();
      if (!isOnboardingProfile) {
        if (requiresAadhaar) {
          if (!panNumber || aadhaarNumber.length < 4 || !address || !addressProof) {
            sendJson(res, 400, { error: "Individual KYC requires PAN, Aadhaar, address and address proof" });
            return;
          }
        } else if (!panNumber && !gstNumber) {
          sendJson(res, 400, { error: "Company or group KYC requires company PAN or GST" });
          return;
        }
      }
      if (!await sendPlanLimitIfBlocked(res, api, user, previewPlan, options, { companies: 1 })) return;
      const workspace = api.resolveRecordsWorkspaceAccess(user, {
        previewPlan,
        workspaceOwnerUserId: body.workspaceOwnerUserId || null,
      }, body.workspaceOwnerUserId ? "manageSettings" : "writeRecords");
      sendJson(res, 201, api.createCompany({
        ...body,
        ownerUserId: workspace.ownerUserId,
        entityType,
        kycStatus: isOnboardingProfile ? "not_submitted" : "pending",
        reviewStatus: "pending",
        reviewedAt: "",
        kycMode: "document-review",
        kycDocumentType: requiresAadhaar ? "aadhaar-pan-address-proof" : "company-pan-or-gst",
      }));
      return;
    }

    if (url.pathname.startsWith("/companies/") && req.method === "PATCH") {
      const companyId = url.pathname.split("/")[2];
      const workspaceOwnerUserId = url.searchParams.get("workspaceOwnerUserId") || null;
      const existingCompany = api.listCompanies(user, { previewPlan, workspaceOwnerUserId }).find((company) => company.id === companyId);
      if (!existingCompany) {
        sendJson(res, 404, { error: "Company not found" });
        return;
      }
      api.resolveRecordsWorkspaceAccess(user, {
        previewPlan,
        workspaceOwnerUserId: workspaceOwnerUserId || existingCompany.ownerUserId,
      }, "manageSettings");
      const body = await readBody(req);
      const updated = api.updateCompany(companyId, body);
      sendJson(res, 200, updated);
      return;
    }

    if (url.pathname === "/customers" && req.method === "GET") {
      sendJson(res, 200, api.listCustomers(user, {
        previewPlan,
        workspaceOwnerUserId: url.searchParams.get("workspaceOwnerUserId") || null,
      }));
      return;
    }

    if (url.pathname === "/customers" && req.method === "POST") {
      const body = await readBody(req);
      if (!await sendPlanLimitIfBlocked(res, api, user, previewPlan, options, { customers: 1 })) return;
      sendJson(res, 201, api.createCustomer({
        ...body,
        ownerUserId: body.workspaceOwnerUserId || user.id,
      }, { user, previewPlan, workspaceOwnerUserId: body.workspaceOwnerUserId || null }));
      return;
    }

    if (url.pathname === "/billing/razorpay/order" && req.method === "POST") {
      try {
        const body = await readBody(req);
        const config = getRazorpayConfig();
        if (!config.enabled) {
          sendJson(res, 503, { error: "Razorpay is not configured yet. Add live Razorpay keys in Render environment variables." });
          return;
        }
        const kind = String(body.kind || "subscription").toLowerCase();
        let orderContext;

        if (kind === "subscription") {
          const planId = String(body.plan || "").toLowerCase();
          const selectedPlan = PAID_PLAN_CATALOG[planId];
          if (!selectedPlan) {
            sendJson(res, 400, { error: "Choose a valid paid plan." });
            return;
          }
          const companies = api.listCompanies(user);
          const kycProfile = companies.find((company) => hasSubmittedKyc(company));
          if (!kycProfile) {
            sendJson(res, 400, { error: "Paid plans require KYC documents. Submit your organization or identity documents first." });
            return;
          }
          if (kycProfile.kycStatus === "rejected" || kycProfile.reviewStatus === "rejected") {
            sendJson(res, 403, { error: "KYC documents were rejected. Update documents before choosing a paid plan." });
            return;
          }
          orderContext = {
            kind,
            userId: user.id,
            companyId: body.companyId || kycProfile.id,
            plan: selectedPlan.plan,
            amount: annualPlanCharge(selectedPlan),
            monthlyAmount: selectedPlan.monthlyAmount ?? selectedPlan.amount,
            annualAmount: annualPlanCharge(selectedPlan),
            currency: selectedPlan.currency,
            billingCycle: "yearly",
            description: `${selectedPlan.label} plan - ${selectedPlan.currency} ${selectedPlan.monthlyAmount ?? selectedPlan.amount}/month billed yearly`,
          };
        } else if (kind === "invoice") {
          if (!hasPaidEntitlement(api, user, previewPlan)) {
            sendJson(res, 402, { error: getFeatureRequirement("razorpayCollections").message });
            return;
          }
          const invoice = api.getInvoice(body.invoiceId, user);
          if (!invoice) {
            sendJson(res, 404, { error: "Invoice not found" });
            return;
          }
          const amount = Number(invoice.balanceAmount ?? invoice.total ?? 0);
          if (!Number.isFinite(amount) || amount <= 0) {
            sendJson(res, 400, { error: "This invoice has no pending balance." });
            return;
          }
          orderContext = {
            kind,
            userId: user.id,
            invoiceId: invoice.id,
            amount,
            currency: invoice.currency || "INR",
            description: `Invoice ${invoice.invoiceNumber || invoice.id}`,
          };
        } else {
          sendJson(res, 400, { error: "Unsupported Razorpay order type." });
          return;
        }

        const amountInPaise = Math.round(Number(orderContext.amount) * 100);
        const order = await razorpayRequest("/orders", {
          amount: amountInPaise,
          currency: orderContext.currency,
          receipt: `eaz_${kind}_${Date.now()}`.slice(0, 40),
          notes: {
            eazinvoice_kind: kind,
            userId: orderContext.userId,
            invoiceId: orderContext.invoiceId || "",
            companyId: orderContext.companyId || "",
            plan: orderContext.plan || "",
            billingCycle: orderContext.billingCycle || "",
          },
        });
        api.createBillingOrder({
          ...orderContext,
          gateway: "razorpay",
          gatewayOrderId: order.id,
          orderId: order.id,
          amount: amountInPaise / 100,
          status: "created",
        });
        sendJson(res, 201, {
          keyId: config.keyId,
          order,
          description: orderContext.description,
          prefill: {
            name: user.name || "",
            email: user.email || "",
            contact: user.phone || "",
          },
        });
      } catch (error) {
        sendJson(res, 400, { error: error.message });
      }
      return;
    }

    if (url.pathname === "/billing/razorpay/verify" && req.method === "POST") {
      try {
        const body = await readBody(req);
        const config = getRazorpayConfig();
        const orderId = String(body.razorpay_order_id || "");
        const paymentId = String(body.razorpay_payment_id || "");
        const signature = String(body.razorpay_signature || "");
        if (!orderId || !paymentId || !signature) {
          sendJson(res, 400, { error: "Missing Razorpay payment verification details." });
          return;
        }
        if (!verifyRazorpaySignature({ orderId, paymentId, signature, keySecret: config.keySecret })) {
          sendJson(res, 401, { error: "Razorpay payment signature verification failed." });
          return;
        }
        const orderMeta = api.getBillingOrderByGatewayOrderId(orderId);
        if (!orderMeta || orderMeta.userId !== user.id) {
          sendJson(res, 404, { error: "Razorpay order was not found for this user session." });
          return;
        }
        const activated = await activateVerifiedRazorpayOrder(orderMeta, paymentId, orderId);
        if (!activated) {
          sendJson(res, 404, { error: "Razorpay order could not be activated." });
          return;
        }
        sendJson(res, 200, activated);
      } catch (error) {
        sendJson(res, 400, { error: error.message });
      }
      return;
    }

    if (url.pathname === "/subscriptions" && req.method === "POST") {
      const body = await readBody(req);
      if (isPaidPlan(body)) {
        const companies = api.listCompanies(user);
        const kycProfile = companies.find((company) => hasSubmittedKyc(company));
        if (!kycProfile) {
          sendJson(res, 400, {
            error: "Paid plans require KYC documents. Submit your organization or identity documents first.",
          });
          return;
        }
        if (kycProfile.kycStatus === "rejected" || kycProfile.reviewStatus === "rejected") {
          sendJson(res, 403, {
            error: "KYC documents were rejected. Update documents before choosing a paid plan.",
          });
          return;
        }
        body.companyId = body.companyId || kycProfile.id;
        body.status = kycProfile.kycStatus === "verified" ? "payment_pending" : "kyc_pending";
        const selectedPlan = PAID_PLAN_CATALOG[String(body.plan || "").toLowerCase()];
        if (selectedPlan) {
          body.amount = annualPlanCharge(selectedPlan);
          body.monthlyAmount = selectedPlan.monthlyAmount ?? selectedPlan.amount;
          body.annualAmount = annualPlanCharge(selectedPlan);
          body.currency = selectedPlan.currency;
          body.billingCycle = "yearly";
        }
      }
      const subscription = api.createSubscription({
        ...body,
        userId: user.id,
        adminUserId: isConfiguredAdminUser(user) ? user.id : null,
      });
      const entitlementSync = await syncUserSubscriptionEntitlements(subscription.userId, "subscription-endpoint");
      sendJson(res, 201, { ...subscription, entitlementSync });
      return;
    }

    if (url.pathname === "/subscriptions/expire" && req.method === "POST") {
      if (!isConfiguredAdminUser(user)) {
        sendJson(res, 403, { error: "Forbidden" });
        return;
      }
      const body = await readBody(req).catch(() => ({}));
      const expired = api.expireSubscriptions(body.now || new Date().toISOString());
      const userIds = [...new Set(expired.map((subscription) => subscription.userId).filter(Boolean))];
      const entitlementSync = [];
      for (const userId of userIds) {
        entitlementSync.push(await syncUserSubscriptionEntitlements(userId, "subscription-expiry"));
      }
      sendJson(res, 200, { expired, entitlementSync });
      return;
    }

    {
      const subscriptionLifecycleMatch = url.pathname.match(/^\/subscriptions\/([^/]+)\/(cancel|renew|downgrade)$/);
      if (subscriptionLifecycleMatch && req.method === "POST") {
        const [, subscriptionId, action] = subscriptionLifecycleMatch;
        const existing = api.getSubscription(subscriptionId);
        if (!existing) {
          sendJson(res, 404, { error: "Subscription not found" });
          return;
        }
        if (!canManageSubscription(user, existing)) {
          sendJson(res, 403, { error: "Forbidden" });
          return;
        }
        const body = await readBody(req).catch(() => ({}));
        if (action === "cancel") {
          const cancelled = api.cancelSubscription(subscriptionId, body);
          await sendSubscriptionLifecycleResult(res, cancelled, "subscription-cancelled");
          return;
        }
        if (action === "renew") {
          const plan = PLAN_CATALOG[String(existing.plan || "free").toLowerCase()] || PLAN_CATALOG.free;
          const renewed = api.renewSubscription(subscriptionId, {
            ...body,
            amount: body.amount ?? annualPlanCharge(plan),
            monthlyAmount: body.monthlyAmount ?? (plan.monthlyAmount ?? plan.amount),
            annualAmount: body.annualAmount ?? annualPlanCharge(plan),
            currency: body.currency ?? plan.currency,
            billingCycle: "yearly",
          });
          await sendSubscriptionLifecycleResult(res, renewed, "subscription-renewed");
          return;
        }
        if (action === "downgrade") {
          const targetPlanId = String(body.plan || "free").trim().toLowerCase();
          const targetPlan = PLAN_CATALOG[targetPlanId];
          if (!targetPlan) {
            sendJson(res, 400, { error: "Choose a valid target plan." });
            return;
          }
          const downgraded = api.createSubscription({
            subscriberType: existing.subscriberType || "individual",
            subscriberName: existing.subscriberName || user.name || user.email || "Subscriber",
            companyId: existing.companyId || null,
            userId: existing.userId,
            groupName: existing.groupName || "",
            plan: targetPlan.plan,
            amount: targetPlan.plan === "free" ? 0 : annualPlanCharge(targetPlan),
            monthlyAmount: targetPlan.monthlyAmount ?? targetPlan.amount,
            annualAmount: targetPlan.plan === "free" ? 0 : annualPlanCharge(targetPlan),
            currency: targetPlan.currency,
            billingCycle: "yearly",
            status: "active",
            adminUserId: isConfiguredAdminUser(user) ? user.id : existing.adminUserId || null,
            gateway: body.gateway || "manual",
            gatewayPaymentId: body.gatewayPaymentId || "",
            gatewayOrderId: body.gatewayOrderId || "",
            previousSubscriptionId: existing.id,
            lifecycleAction: "downgrade",
          });
          await sendSubscriptionLifecycleResult(res, downgraded, "subscription-downgraded", 201);
          return;
        }
      }
    }

    if (url.pathname === "/subscriptions/me" && req.method === "GET") {
      sendJson(res, 200, await resolveUserSubscriptions(api, user, options));
      return;
    }

    if (url.pathname === "/reports/summary" && req.method === "GET") {
      if (!usePostgresDashboardReports(options)) {
        sendJson(res, 200, {
          available: false,
          reason: "Postgres dashboard reports are not enabled.",
        });
        return;
      }
      try {
        sendJson(res, 200, await api.summarizePostgresReports(user, Object.fromEntries(url.searchParams.entries())));
      } catch (error) {
        sendJson(res, 500, {
          available: false,
          error: error.message,
        });
      }
      return;
    }

    if (url.pathname === "/reports" && req.method === "GET") {
      if (usePostgresDashboardReports(options)) {
        try {
          sendJson(res, 200, await api.summarizePostgresReports(user, Object.fromEntries(url.searchParams.entries())));
        } catch (error) {
          sendJson(res, 500, {
            available: false,
            error: error.message,
          });
        }
        return;
      }
      sendJson(res, 200, api.listReports(user, {
        workspaceOwnerUserId: url.searchParams.get("workspaceOwnerUserId") || null,
      }));
      return;
    }

    if (url.pathname === "/reports" && req.method === "POST") {
      const body = await readBody(req);
      const workspace = api.resolveRecordsWorkspaceAccess(user, {
        previewPlan,
        workspaceOwnerUserId: body.workspaceOwnerUserId || null,
      }, "writeRecords");
      sendJson(res, 201, api.createReport({
        ...body,
        ownerUserId: workspace.ownerUserId,
      }));
      return;
    }

    if (url.pathname === "/business/team" && req.method === "GET") {
      try {
        sendJson(res, 200, api.listTeamMembers(user, {
          previewPlan,
          workspaceOwnerUserId: url.searchParams.get("workspaceOwnerUserId") || null,
        }));
      } catch (error) {
        sendJson(res, /business/i.test(error.message) ? 402 : 400, { error: error.message });
      }
      return;
    }

    if (url.pathname === "/business/workspaces" && req.method === "GET") {
      try {
        sendJson(res, 200, api.listBusinessWorkspaces(user));
      } catch (error) {
        sendJson(res, 400, { error: error.message });
      }
      return;
    }

    if (url.pathname === "/business/settings" && req.method === "GET") {
      try {
        sendJson(res, 200, api.getBusinessSettings(user, {
          previewPlan,
          workspaceOwnerUserId: url.searchParams.get("workspaceOwnerUserId") || null,
          companyId: url.searchParams.get("companyId") || null,
        }));
      } catch (error) {
        sendJson(res, /business/i.test(error.message) ? 402 : 400, { error: error.message });
      }
      return;
    }

    if (url.pathname === "/business/settings" && req.method === "PATCH") {
      try {
        const body = await readBody(req);
        const settings = api.updateBusinessSettings(user, body, { previewPlan });
        const businessWorkspaceSync = await syncBusinessWorkspaceRows("business-settings-update");
        sendJson(res, 200, { ...settings, businessWorkspaceSync });
      } catch (error) {
        sendJson(res, /business/i.test(error.message) ? 402 : 400, { error: error.message });
      }
      return;
    }

    if (url.pathname === "/business/settings/email/test" && req.method === "POST") {
      try {
        const body = await readBody(req);
        const validated = api.validateBusinessEmailSettings(user, body, { previewPlan });
        const businessWorkspaceSync = await syncBusinessWorkspaceRows("business-email-validation");
        const status = validated.emailSettings?.lastTestStatus || "ready";
        if (body.sendTestEmail && status === "ready") {
          const deliverySettings = api.getBusinessEmailDeliverySettings(user, {
            previewPlan,
            workspaceOwnerUserId: body.workspaceOwnerUserId || null,
            companyId: body.companyId || null,
          });
          const recipient = String(
            body.testRecipient
            || deliverySettings.replyToEmail
            || deliverySettings.fromEmail
            || user.email
            || "",
          ).trim();
          try {
            await sendSmtpMail(deliverySettings, {
              to: recipient,
              subject: "EazInvoice SMTP test email",
              text: `Hi,\n\nThis is a test email from EazInvoice Business Workspace for ${deliverySettings.senderName || user.name || "your business"}.\n\nIf you received this, SMTP delivery is working.\n\nEazInvoice`,
            });
            sendJson(res, 200, {
              ...validated,
              businessWorkspaceSync,
              emailSettings: {
                ...validated.emailSettings,
                lastDeliveryStatus: "sent",
                lastDeliveryMessage: `Test email sent to ${recipient}`,
              },
            });
          } catch (deliveryError) {
            sendJson(res, 400, {
              error: `SMTP settings validated, but test email failed: ${deliveryError.message}`,
              businessWorkspaceSync,
              emailSettings: {
                ...validated.emailSettings,
                lastDeliveryStatus: "failed",
                lastDeliveryMessage: deliveryError.message,
              },
            });
          }
          return;
        }
        sendJson(res, 200, { ...validated, businessWorkspaceSync });
      } catch (error) {
        sendJson(res, /business/i.test(error.message) ? 402 : 400, { error: error.message });
      }
      return;
    }

    if (url.pathname === "/business/compliance-dashboard" && req.method === "GET") {
      try {
        sendJson(res, 200, api.getBusinessComplianceDashboard(user, {
          previewPlan,
          workspaceOwnerUserId: url.searchParams.get("workspaceOwnerUserId") || null,
          companyId: url.searchParams.get("companyId") || null,
        }));
      } catch (error) {
        sendJson(res, /business/i.test(error.message) ? 402 : 400, { error: error.message });
      }
      return;
    }

    if (url.pathname.startsWith("/business/compliance-tasks/") && url.pathname.endsWith("/reminder") && req.method === "POST") {
      try {
        const taskId = decodeURIComponent(url.pathname.split("/")[3] || "");
        const body = await readBody(req);
        const compliance = api.getBusinessComplianceDashboard(user, {
          previewPlan,
          workspaceOwnerUserId: body.workspaceOwnerUserId || null,
          companyId: body.companyId || null,
        });
        const task = (compliance.complianceTasks || []).find((entry) => entry.id === taskId);
        if (!task) {
          sendJson(res, 404, { error: "Compliance task not found" });
          return;
        }
        if (task.reminderEnabled === false) {
          sendJson(res, 400, { error: "Reminder is disabled for this compliance task." });
          return;
        }
        const deliverySettings = api.getBusinessEmailDeliverySettings(user, {
          previewPlan,
          workspaceOwnerUserId: body.workspaceOwnerUserId || null,
          companyId: body.companyId || null,
        });
        const recipient = String(
          body.recipient
          || deliverySettings.replyToEmail
          || deliverySettings.fromEmail
          || user.email
          || "",
        ).trim();
        if (!businessSmtpReady(deliverySettings)) {
          sendJson(res, 400, {
            error: "Configure and validate Business SMTP settings before sending compliance reminders.",
            deliveryStatus: "not_configured",
            deliveryMessage: smtpNotConfiguredMessage("send compliance reminders"),
          });
          return;
        }
        try {
          await sendSmtpMail(deliverySettings, buildComplianceReminderMessage(deliverySettings, task, recipient));
          const updatedTask = api.recordComplianceReminderDelivery(user, taskId, {
            companyId: body.companyId || null,
            workspaceOwnerUserId: body.workspaceOwnerUserId || null,
            to: recipient,
            status: "sent",
            message: `Reminder sent to ${recipient}`,
          }, { previewPlan });
          const businessWorkspaceSync = await syncBusinessWorkspaceRows("business-compliance-reminder-sent");
          sendJson(res, 200, {
            ...updatedTask,
            deliveryStatus: "sent",
            deliveryMessage: `Compliance reminder sent to ${recipient}`,
            businessWorkspaceSync,
          });
        } catch (deliveryError) {
          const updatedTask = api.recordComplianceReminderDelivery(user, taskId, {
            companyId: body.companyId || null,
            workspaceOwnerUserId: body.workspaceOwnerUserId || null,
            to: recipient,
            status: "failed",
            message: deliveryError.message,
          }, { previewPlan });
          const businessWorkspaceSync = await syncBusinessWorkspaceRows("business-compliance-reminder-failed");
          sendJson(res, 400, {
            error: `Compliance reminder failed: ${deliveryError.message}`,
            ...updatedTask,
            deliveryStatus: "failed",
            deliveryMessage: deliveryError.message,
            businessWorkspaceSync,
          });
        }
      } catch (error) {
        sendJson(res, /business/i.test(error.message) ? 402 : 400, { error: error.message });
      }
      return;
    }
    if (url.pathname.startsWith("/business/compliance-tasks/") && req.method === "PATCH") {
      try {
        const taskId = decodeURIComponent(url.pathname.split("/").pop() || "");
        const body = await readBody(req);
        const task = api.updateComplianceTask(user, taskId, body, { previewPlan });
        const businessWorkspaceSync = await syncBusinessWorkspaceRows("business-compliance-task-update");
        sendJson(res, 200, { ...task, businessWorkspaceSync });
      } catch (error) {
        sendJson(res, /business/i.test(error.message) ? 402 : 404, { error: error.message });
      }
      return;
    }

    if (url.pathname === "/business/team" && req.method === "POST") {
      try {
        const body = await readBody(req);
        let member = api.createTeamMember(user, body, { previewPlan });
        let deliveryStatus = member.inviteDeliveryStatus || "queued";
        let deliveryMessage = smtpNotConfiguredMessage("send the sub-user access email");
        try {
          const deliverySettings = api.getBusinessEmailDeliverySettings(user, {
            previewPlan,
            workspaceOwnerUserId: body.workspaceOwnerUserId || null,
            companyId: body.companyId || null,
          });
          if (businessSmtpReady(deliverySettings)) {
            await sendSmtpMail(deliverySettings, buildTeamInviteMessage(deliverySettings, member, user, req));
            deliveryStatus = "sent";
            deliveryMessage = `Sub-user access email sent to ${member.email}. They must log in with this same email address.`;
            member = api.updateTeamMember(user, member.id, {
              inviteDeliveryStatus: deliveryStatus,
              inviteDeliveryMessage: deliveryMessage,
              inviteSentAt: new Date().toISOString(),
            }, { previewPlan });
          } else {
            deliveryStatus = "not_configured";
            member = api.updateTeamMember(user, member.id, {
              inviteDeliveryStatus: deliveryStatus,
              inviteDeliveryMessage: deliveryMessage,
            }, { previewPlan });
          }
        } catch (deliveryError) {
          deliveryStatus = "failed";
          deliveryMessage = `Sub-user access saved, but email delivery failed: ${deliveryError.message}`;
          member = api.updateTeamMember(user, member.id, {
            inviteDeliveryStatus: deliveryStatus,
            inviteDeliveryMessage: deliveryMessage,
          }, { previewPlan });
        }
        const businessWorkspaceSync = await syncBusinessWorkspaceRows("business-team-invite");
        sendJson(res, 201, {
          ...member,
          inviteDeliveryStatus: deliveryStatus,
          inviteDeliveryMessage: deliveryMessage,
          businessWorkspaceSync,
        });
      } catch (error) {
        sendJson(res, /business/i.test(error.message) ? 402 : 400, { error: error.message });
      }
      return;
    }

    if (url.pathname.startsWith("/business/team/") && req.method === "PATCH") {
      try {
        const id = url.pathname.split("/")[3];
        const body = await readBody(req);
        const member = api.updateTeamMember(user, id, body, { previewPlan });
        const businessWorkspaceSync = await syncBusinessWorkspaceRows("business-team-update");
        sendJson(res, 200, { ...member, businessWorkspaceSync });
      } catch (error) {
        sendJson(res, /business/i.test(error.message) ? 402 : 404, { error: error.message });
      }
      return;
    }

    if (url.pathname === "/business/team/accept" && req.method === "POST") {
      sendJson(res, 410, {
        error: "Invite links are disabled. Ask the Business owner to create sub-user access for your email, then log in with that email.",
      });
      return;
    }

    if (url.pathname === "/business/approvals" && req.method === "GET") {
      try {
        sendJson(res, 200, api.listApprovalRequests(user, {
          previewPlan,
          workspaceOwnerUserId: url.searchParams.get("workspaceOwnerUserId") || null,
        }));
      } catch (error) {
        sendJson(res, /business/i.test(error.message) ? 402 : 400, { error: error.message });
      }
      return;
    }

    if (url.pathname === "/business/approvals" && req.method === "POST") {
      try {
        const body = await readBody(req);
        const approval = api.createApprovalRequest(user, body, { previewPlan });
        const notification = await sendBusinessApprovalNotification(api, user, approval, body, { previewPlan }, "created");
        const businessWorkspaceSync = await syncBusinessWorkspaceRows("business-approval-create");
        sendJson(res, 201, { ...approval, ...notification, businessWorkspaceSync });
      } catch (error) {
        sendJson(res, /business/i.test(error.message) ? 402 : 400, { error: error.message });
      }
      return;
    }

    if (url.pathname.startsWith("/business/approvals/") && req.method === "PATCH") {
      try {
        const id = url.pathname.split("/")[3];
        const body = await readBody(req);
        const approval = api.decideApprovalRequest(user, id, body, { previewPlan });
        const notification = await sendBusinessApprovalNotification(api, user, approval, body, { previewPlan }, "decision");
        const businessWorkspaceSync = await syncBusinessWorkspaceRows("business-approval-decision");
        sendJson(res, 200, { ...approval, ...notification, businessWorkspaceSync });
      } catch (error) {
        sendJson(res, /business/i.test(error.message) ? 402 : 404, { error: error.message });
      }
      return;
    }

    if (url.pathname === "/business/api-keys" && req.method === "GET") {
      try {
        sendJson(res, 200, api.listApiKeys(user, {
          previewPlan,
          workspaceOwnerUserId: url.searchParams.get("workspaceOwnerUserId") || null,
        }));
      } catch (error) {
        sendJson(res, /business/i.test(error.message) ? 402 : 400, { error: error.message });
      }
      return;
    }

    if (url.pathname === "/business/api-keys" && req.method === "POST") {
      try {
        const body = await readBody(req);
        const apiKey = api.createApiKey(user, body, { previewPlan });
        const businessWorkspaceSync = await syncBusinessWorkspaceRows("business-api-key-create");
        sendJson(res, 201, { ...apiKey, businessWorkspaceSync });
      } catch (error) {
        sendJson(res, /business/i.test(error.message) ? 402 : 400, { error: error.message });
      }
      return;
    }

    if (url.pathname.startsWith("/business/api-keys/") && req.method === "DELETE") {
      try {
        const id = url.pathname.split("/")[3];
        const apiKey = api.revokeApiKey(user, id, {
          previewPlan,
          workspaceOwnerUserId: url.searchParams.get("workspaceOwnerUserId") || null,
        });
        const businessWorkspaceSync = await syncBusinessWorkspaceRows("business-api-key-revoke");
        sendJson(res, 200, { ...apiKey, businessWorkspaceSync });
      } catch (error) {
        sendJson(res, /business/i.test(error.message) ? 402 : 404, { error: error.message });
      }
      return;
    }

    if (url.pathname === "/ai/usage" && req.method === "GET") {
      try {
        sendJson(res, 200, api.getAiUsageSummary(user, {
          previewPlan,
          month: url.searchParams.get("month") || "",
        }));
      } catch (error) {
        sendJson(res, 400, { error: error.message });
      }
      return;
    }

    if (url.pathname === "/admin/ai-usage" && req.method === "GET") {
      if (!isConfiguredAdminUser(user)) {
        sendJson(res, 403, { error: "Forbidden" });
        return;
      }
      try {
        sendJson(res, 200, api.getAdminAiUsageSummary(user, {
          month: url.searchParams.get("month") || "",
        }));
      } catch (error) {
        sendJson(res, 400, { error: error.message });
      }
      return;
    }

    if (url.pathname === "/ai/command" && req.method === "POST") {
      try {
        const body = await readBody(req);
        sendJson(res, 201, await api.runAiCommandAsync(user, body, {
          previewPlan,
          workspaceOwnerUserId: body.workspaceOwnerUserId || null,
        }));
      } catch (error) {
        const status = /pro|business|ai/i.test(error.message) ? 402 : 400;
        sendJson(res, status, { error: error.message });
      }
      return;
    }

    if (url.pathname === "/admin/recurring/run" && req.method === "POST") {
      if (!isConfiguredAdminUser(user)) {
        sendJson(res, 403, { error: "Forbidden" });
        return;
      }
      const body = await readBody(req).catch(() => ({}));
      const result = api.runRecurringInvoiceSchedulerForAllUsers({
        targetDate: body.targetDate,
        maxPerTemplate: body.maxPerTemplate,
      });
      const reportSync = await syncSchedulerInvoiceReportRows(result, "admin-recurring-scheduler");
      sendJson(res, 201, { ...result, reportSync });
      return;
    }

    if (url.pathname === "/admin/recurring/status" && req.method === "GET") {
      if (!isConfiguredAdminUser(user)) {
        sendJson(res, 403, { error: "Forbidden" });
        return;
      }
      sendJson(res, 200, {
        enabled: String(process.env.RECURRING_SCHEDULER_ENABLED || "").toLowerCase() === "true",
        intervalHours: Number(process.env.RECURRING_SCHEDULER_INTERVAL_HOURS || 24),
        maxPerTemplate: Number(process.env.RECURRING_SCHEDULER_MAX_PER_TEMPLATE || 12),
        timezone: "UTC date-only",
        note: "Recurring draft generation is idempotent and only processes active paid users whose plan includes recurringInvoices.",
      });
      return;
    }

    if (url.pathname === "/subscriptions" && req.method === "GET") {
      if (!isConfiguredAdminUser(user)) {
        sendJson(res, 403, { error: "Forbidden" });
        return;
      }
      sendJson(res, 200, api.listSubscriptions());
      return;
    }

    if (url.pathname === "/invoices" && req.method === "GET") {
      sendJson(res, 200, api.listInvoices(user, {
        previewPlan,
        workspaceOwnerUserId: url.searchParams.get("workspaceOwnerUserId") || null,
      }));
      return;
    }

    if (url.pathname === "/payments" && req.method === "GET") {
      sendJson(res, 200, api.listPayments(user, {
        previewPlan,
        workspaceOwnerUserId: url.searchParams.get("workspaceOwnerUserId") || null,
      }));
      return;
    }

    if (url.pathname === "/invoices" && req.method === "POST") {
      const body = sanitizeStandardInvoiceFeatures(api, user, previewPlan, await readBody(req));
      const workspace = api.resolveRecordsWorkspaceAccess(user, {
        previewPlan,
        workspaceOwnerUserId: body.workspaceOwnerUserId || null,
      }, "writeRecords");
      const entitlement = await sendPlanLimitIfBlocked(res, api, workspace.owner, previewPlan, options, {
        invoicesPerMonth: 1,
      });
      if (!entitlement) return;
      try {
        const invoice = api.createInvoice({
          ...body,
          ownerUserId: workspace.ownerUserId,
        }, { user, previewPlan, planLimits: entitlement.limits, workspaceOwnerUserId: workspace.ownerUserId });
        const reportSync = await syncInvoiceReportRows(invoice, "invoice-create");
        sendJson(res, 201, { ...invoice, reportSync });
      } catch (error) {
        sendJson(res, 400, { error: error.message });
      }
      return;
    }

    if (url.pathname === "/invoices/recurring/run" && req.method === "POST") {
      try {
        const body = await readBody(req).catch(() => ({}));
        const workspace = api.resolveRecordsWorkspaceAccess(user, {
          previewPlan,
          workspaceOwnerUserId: body.workspaceOwnerUserId || null,
        }, "writeRecords");
        const result = api.runRecurringInvoiceScheduler(user, {
          previewPlan,
          workspaceOwnerUserId: workspace.ownerUserId,
          targetDate: body.targetDate,
          maxPerTemplate: body.maxPerTemplate,
        });
        const reportSync = [];
        for (const invoice of result.created || []) {
          reportSync.push({
            invoiceId: invoice.id,
            ...(await syncInvoiceReportRows(invoice, "recurring-invoice-draft")),
          });
        }
        sendJson(res, 201, { ...result, reportSync });
      } catch (error) {
        const status = /standard/i.test(error.message) ? 402 : 400;
        sendJson(res, status, { error: error.message });
      }
      return;
    }

    if (url.pathname.startsWith("/invoices/") && req.method === "GET") {
      const id = url.pathname.split("/")[2];
      const invoice = api.getInvoice(id, user, {
        previewPlan,
        workspaceOwnerUserId: url.searchParams.get("workspaceOwnerUserId") || null,
      });
      if (!invoice) {
        sendJson(res, 404, { error: "Not found" });
        return;
      }
      sendJson(res, 200, invoice);
      return;
    }

    if (url.pathname.startsWith("/invoices/") && url.pathname.endsWith("/payments") && req.method === "POST") {
      const id = url.pathname.split("/")[2];
      const body = await readBody(req);
      const existing = api.getInvoice(id, user, {
        previewPlan,
        workspaceOwnerUserId: body.workspaceOwnerUserId || null,
      });
      if (!existing) {
        sendJson(res, 404, { error: "Not found" });
        return;
      }
      const amount = Number(body.amount ?? existing.balanceAmount ?? existing.total);
      if (!Number.isFinite(amount) || amount <= 0) {
        sendJson(res, 400, { error: "Enter a valid received amount" });
        return;
      }
      const balance = Number(existing.balanceAmount ?? existing.total ?? 0);
      if (balance > 0 && amount > balance + 0.01) {
        sendJson(res, 400, { error: "Payment amount cannot be more than the pending invoice balance" });
        return;
      }
      try {
        const recorded = api.recordInvoicePayment(id, {
          amount,
          currency: body.currency || existing.currency,
          mode: body.mode || "manual",
          reference: body.reference,
          notes: body.notes,
          paymentDate: body.paymentDate,
          workspaceOwnerUserId: body.workspaceOwnerUserId || null,
        }, { user, previewPlan, workspaceOwnerUserId: body.workspaceOwnerUserId || null });
        const reportSync = await syncInvoicePaymentReportRows(recorded);
        sendJson(res, 201, { ...recorded, reportSync });
      } catch (error) {
        sendJson(res, 400, { error: error.message });
      }
      return;
    }

    if (url.pathname.startsWith("/invoices/") && url.pathname.endsWith("/payment-link") && req.method === "POST") {
      const id = url.pathname.split("/")[2];
      const body = await readBody(req).catch(() => ({}));
      const existing = api.getInvoice(id, user, {
        previewPlan,
        workspaceOwnerUserId: body.workspaceOwnerUserId || null,
      });
      if (!existing) {
        sendJson(res, 404, { error: "Not found" });
        return;
      }
      const entitlementOwner = existing.ownerUserId ? api.getUserById(existing.ownerUserId) : user;
      if (!hasPaidEntitlement(api, entitlementOwner, previewPlan)) {
        sendJson(res, 402, { error: getFeatureRequirement("razorpayCollections").message });
        return;
      }
      try {
        const invoice = api.createInvoicePaymentLink(id, {
          gateway: body.gateway || "razorpay",
          url: body.url,
          workspaceOwnerUserId: body.workspaceOwnerUserId || null,
        }, { user, previewPlan, workspaceOwnerUserId: body.workspaceOwnerUserId || null });
        const reportSync = await syncInvoiceReportRows(invoice, "invoice-payment-link");
        sendJson(res, 201, { ...invoice, reportSync });
      } catch (error) {
        sendJson(res, 400, { error: error.message });
      }
      return;
    }

    if (url.pathname.startsWith("/invoices/") && req.method === "PATCH") {
      const id = url.pathname.split("/")[2];
      const body = sanitizeStandardInvoiceFeatures(api, user, previewPlan, await readBody(req));
      const existing = api.getInvoice(id, user, {
        previewPlan,
        workspaceOwnerUserId: body.workspaceOwnerUserId || null,
      });
      if (!existing) {
        sendJson(res, 404, { error: "Not found" });
        return;
      }
      const workspace = api.resolveRecordsWorkspaceAccess(user, {
        previewPlan,
        workspaceOwnerUserId: body.workspaceOwnerUserId || existing.ownerUserId || null,
      }, "writeRecords");
      const entitlement = await resolveWriteEntitlement(api, workspace.owner, previewPlan, options);
      try {
        const invoice = api.updateInvoice(id, body, { user, previewPlan, planLimits: entitlement.limits, workspaceOwnerUserId: workspace.ownerUserId });
        const reportSync = await syncInvoiceReportRows(invoice, "invoice-update");
        sendJson(res, 200, { ...invoice, reportSync });
      } catch (error) {
        sendJson(res, 400, { error: error.message });
      }
      return;
    }

    if (url.pathname.startsWith("/invoices/") && req.method === "DELETE") {
      const id = url.pathname.split("/")[2];
      const deleted = api.deleteInvoice(id, user, {
        previewPlan,
        workspaceOwnerUserId: url.searchParams.get("workspaceOwnerUserId") || null,
      });
      if (!deleted) {
        sendJson(res, 404, { error: "Not found" });
        return;
      }
      const reportSync = await syncInvoiceReportRows(deleted, "invoice-delete");
      sendJson(res, 200, { ...deleted, reportSync });
      return;
    }

    if (url.pathname === "/purchase-orders" && req.method === "GET") {
      sendJson(res, 200, api.listPurchaseOrders(user, {
        previewPlan,
        workspaceOwnerUserId: url.searchParams.get("workspaceOwnerUserId") || null,
      }));
      return;
    }

    if (url.pathname === "/purchase-orders" && req.method === "POST") {
      const body = await readBody(req);
      const workspace = api.resolveRecordsWorkspaceAccess(user, {
        previewPlan,
        workspaceOwnerUserId: body.workspaceOwnerUserId || null,
      }, "writeRecords");
      const entitlement = await resolveWriteEntitlement(api, workspace.owner, previewPlan, options);
      try {
        const purchaseOrder = api.createPurchaseOrder({
          ...body,
          ownerUserId: workspace.ownerUserId,
        }, { user, previewPlan, planLimits: entitlement.limits, workspaceOwnerUserId: workspace.ownerUserId });
        const reportSync = await syncPurchaseOrderReportRows(purchaseOrder, "purchase-order-create");
        sendJson(res, 201, { ...purchaseOrder, reportSync });
      } catch (error) {
        sendJson(res, 400, { error: error.message });
      }
      return;
    }

    if (url.pathname.startsWith("/purchase-orders/") && req.method === "GET") {
      const id = url.pathname.split("/")[2];
      const purchaseOrder = api.getPurchaseOrder(id, user, {
        previewPlan,
        workspaceOwnerUserId: url.searchParams.get("workspaceOwnerUserId") || null,
      });
      if (!purchaseOrder) {
        sendJson(res, 404, { error: "Not found" });
        return;
      }
      sendJson(res, 200, purchaseOrder);
      return;
    }

    if (url.pathname.startsWith("/purchase-orders/") && req.method === "PATCH") {
      const id = url.pathname.split("/")[2];
      const body = await readBody(req);
      const existing = api.getPurchaseOrder(id, user, {
        previewPlan,
        workspaceOwnerUserId: body.workspaceOwnerUserId || null,
      });
      if (!existing) {
        sendJson(res, 404, { error: "Not found" });
        return;
      }
      const workspace = api.resolveRecordsWorkspaceAccess(user, {
        previewPlan,
        workspaceOwnerUserId: body.workspaceOwnerUserId || existing.ownerUserId || null,
      }, "writeRecords");
      const entitlement = await resolveWriteEntitlement(api, workspace.owner, previewPlan, options);
      try {
        const purchaseOrder = api.updatePurchaseOrder(id, body, { user, previewPlan, planLimits: entitlement.limits, workspaceOwnerUserId: workspace.ownerUserId });
        const reportSync = await syncPurchaseOrderReportRows(purchaseOrder, "purchase-order-update");
        sendJson(res, 200, { ...purchaseOrder, reportSync });
      } catch (error) {
        sendJson(res, 400, { error: error.message });
      }
      return;
    }

    if (url.pathname.startsWith("/purchase-orders/") && req.method === "DELETE") {
      const id = url.pathname.split("/")[2];
      const deleted = api.deletePurchaseOrder(id, user, {
        previewPlan,
        workspaceOwnerUserId: url.searchParams.get("workspaceOwnerUserId") || null,
      });
      if (!deleted) {
        sendJson(res, 404, { error: "Not found" });
        return;
      }
      const reportSync = await syncPurchaseOrderReportRows(deleted, "purchase-order-delete");
      sendJson(res, 200, { ...deleted, reportSync });
      return;
    }

      sendJson(res, 404, { error: "Not found" });
    } catch (error) {
      const status = knownRequestErrorStatus(error);
      if (status === 500) {
        console.error("Unhandled request error:", {
          method: req.method,
          url: req.url,
          message: error.message,
          stack: error.stack,
        });
      }
      if (!res.headersSent) {
        sendJson(res, status, {
          error: status === 500
            ? "EazInvoice could not complete this request. Please try again, and check Render logs if it repeats."
            : error.message,
        });
      } else {
        res.end();
      }
    }
  });
  server.eazinvoiceApi = api;
  return server;
}

function setupRecurringScheduler(server) {
  const recurringEnabled = String(process.env.RECURRING_SCHEDULER_ENABLED || "").toLowerCase() === "true";
  if (recurringEnabled) {
    const intervalHours = Math.max(1, Number(process.env.RECURRING_SCHEDULER_INTERVAL_HOURS || 24));
    const maxPerTemplate = Math.max(1, Number(process.env.RECURRING_SCHEDULER_MAX_PER_TEMPLATE || 12));
    const intervalMs = intervalHours * 60 * 60 * 1000;
    const run = async () => {
      try {
        const api = server.eazinvoiceApi;
        const result = api.runRecurringInvoiceSchedulerForAllUsers({
          targetDate: new Date().toISOString().slice(0, 10),
          maxPerTemplate,
        });
        await syncSchedulerInvoiceReportRows(result, "background-recurring-scheduler");
        if (result.createdCount > 0) {
          console.log(`Eazinvoice recurring scheduler created ${result.createdCount} draft(s).`);
        }
      } catch (error) {
        console.error("Eazinvoice recurring scheduler failed:", error.message);
      }
    };
    const startupDelayMs = Math.min(60000, Math.max(1000, Number(process.env.RECURRING_SCHEDULER_STARTUP_DELAY_MS || 10000)));
    const startupTimer = setTimeout(run, startupDelayMs);
    const intervalTimer = setInterval(run, intervalMs);
    server.on("close", () => {
      clearTimeout(startupTimer);
      clearInterval(intervalTimer);
    });
  }
}

export async function createServerAsync(options = {}) {
  if (!options.store && options.persist !== false && wantsPostgresStorage(options)) {
    const persistenceAdapter = await createPostgresPersistenceAdapter();
    return createServer({
      ...options,
      persistenceAdapter,
    });
  }
  return createServer(options);
}

export function startServer(port = 3001) {
  const server = createServer();
  server.listen(port);
  setupRecurringScheduler(server);
  return server;
}

export async function startServerAsync(port = 3001) {
  const server = await createServerAsync();
  server.listen(port);
  setupRecurringScheduler(server);
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (wantsPostgresStorage()) {
    await startServerAsync(Number(process.env.PORT || 3001));
  } else {
    startServer(Number(process.env.PORT || 3001));
  }
  console.log(`Eazinvoice API running on http://localhost:${process.env.PORT || 3001}`);
}
