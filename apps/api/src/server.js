import http from "node:http";
import crypto from "node:crypto";
import fsSync from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { URL } from "node:url";
import { createApi } from "./index.js";
import { createStore } from "./store.js";
import { createSessionStore } from "./session-store.js";
import { PLAN_CATALOG } from "./plans.js";
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
    .replace(/\{\{\s*inviteLink\s*\}\}/gi, values.inviteLink || "");
}

function buildTeamInviteMessage(emailSettings = {}, member = {}, user = {}, req = null) {
  const appUrl = getPublicAppUrl(req);
  const inviteLink = `${appUrl}/apps/web/auth.html?tab=signup&invite=${encodeURIComponent(member.inviteToken || "")}`;
  const businessName = emailSettings.senderName || user.name || "EazInvoice";
  const text = fillInviteTemplate(
    emailSettings.inviteTemplate || "Hi {{name}},\n\nYou have been invited to join {{businessName}} on EazInvoice as {{role}}.\n\nAccept the invitation here:\n{{inviteLink}}\n\nEazInvoice",
    {
      name: member.name,
      businessName,
      role: member.role,
      inviteLink,
    },
  );
  return {
    to: member.email,
    subject: emailSettings.inviteSubject || `Invitation to join ${businessName} on EazInvoice`,
    text,
  };
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
  return Number(plan.discountedAnnualAmount ?? plan.annualAmount ?? (Number(plan.amount || 0) * 12));
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
  const store = options.store ?? createStore({}, { persist: options.persist !== false });
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

  function activateVerifiedRazorpayOrder(orderMeta, paymentId, orderId) {
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
      if (existing) return { ok: true, type: "subscription", subscription: existing, duplicate: true };
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
      api.updateBillingOrder(orderId, { status: "consumed", consumedAt: new Date().toISOString() });
      return { ok: true, type: "subscription", subscription };
    }

    if (orderMeta.kind === "invoice") {
      const invoice = api.getInvoice(orderMeta.invoiceId);
      const alreadyCaptured = api.listPayments()
        .some((payment) => payment.gatewayOrderId === orderId || payment.gatewayPaymentId === paymentId);
      if (alreadyCaptured && invoice) return { ok: true, type: "invoice", invoice, duplicate: true };
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
      api.updateBillingOrder(orderId, { status: "consumed", consumedAt: new Date().toISOString() });
      return { ok: true, type: "invoice", ...recorded };
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
          const activated = activateVerifiedRazorpayOrder(orderMeta, paymentId, orderId);
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
        sendJson(res, 200, { ok: true, ...recorded });
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
        plan: api.getFreePlanSummary(user, { previewPlan }),
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
      sendJson(res, 200, api.getPersistenceStatus());
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
      sendJson(res, 200, api.getFreePlanSummary(user, { previewPlan }));
      return;
    }

    if (url.pathname === "/plans" && req.method === "GET") {
      sendJson(res, 200, {
        active: api.getFreePlanSummary(user, { previewPlan }),
        catalog: api.listPlans(),
      });
      return;
    }

    if (url.pathname === "/companies" && req.method === "GET") {
      sendJson(res, 200, api.listCompanies(user));
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
      sendJson(res, 201, api.createCompany({
        ...body,
        ownerUserId: user.id,
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
      const existingCompany = api.listCompanies(user).find((company) => company.id === companyId);
      if (!existingCompany) {
        sendJson(res, 404, { error: "Company not found" });
        return;
      }
      const body = await readBody(req);
      const updated = api.updateCompany(companyId, body);
      sendJson(res, 200, updated);
      return;
    }

    if (url.pathname === "/customers" && req.method === "GET") {
      sendJson(res, 200, api.listCustomers(user));
      return;
    }

    if (url.pathname === "/customers" && req.method === "POST") {
      const body = await readBody(req);
      sendJson(res, 201, api.createCustomer({ ...body, ownerUserId: user.id }));
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
            monthlyAmount: selectedPlan.discountedAmount ?? selectedPlan.monthlyAmount ?? selectedPlan.amount,
            annualAmount: annualPlanCharge(selectedPlan),
            currency: selectedPlan.currency,
            billingCycle: "yearly",
            description: `${selectedPlan.label} plan - ${selectedPlan.currency} ${selectedPlan.discountedAmount ?? selectedPlan.monthlyAmount ?? selectedPlan.amount}/month billed yearly`,
          };
        } else if (kind === "invoice") {
          if (!hasPaidEntitlement(api, user, previewPlan)) {
            sendJson(res, 402, { error: "Payment gateway links and automatic payment updates are available only in paid tiers." });
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
        const activated = activateVerifiedRazorpayOrder(orderMeta, paymentId, orderId);
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
          body.monthlyAmount = selectedPlan.discountedAmount ?? selectedPlan.monthlyAmount ?? selectedPlan.amount;
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
      sendJson(res, 201, subscription);
      return;
    }

    if (url.pathname === "/subscriptions/me" && req.method === "GET") {
      const subscriptions = api.listSubscriptions().filter((subscription) => subscription.userId === user.id);
      sendJson(res, 200, subscriptions);
      return;
    }

    if (url.pathname === "/reports" && req.method === "GET") {
      sendJson(res, 200, api.listReports(user));
      return;
    }

    if (url.pathname === "/reports" && req.method === "POST") {
      const body = await readBody(req);
      sendJson(res, 201, api.createReport({
        ...body,
        ownerUserId: user.id,
      }));
      return;
    }

    if (url.pathname === "/business/team" && req.method === "GET") {
      try {
        sendJson(res, 200, api.listTeamMembers(user, { previewPlan }));
      } catch (error) {
        sendJson(res, /business/i.test(error.message) ? 402 : 400, { error: error.message });
      }
      return;
    }

    if (url.pathname === "/business/settings" && req.method === "GET") {
      try {
        sendJson(res, 200, api.getBusinessSettings(user, {
          previewPlan,
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
        sendJson(res, 200, api.updateBusinessSettings(user, body, { previewPlan }));
      } catch (error) {
        sendJson(res, /business/i.test(error.message) ? 402 : 400, { error: error.message });
      }
      return;
    }

    if (url.pathname === "/business/settings/email/test" && req.method === "POST") {
      try {
        const body = await readBody(req);
        const validated = api.validateBusinessEmailSettings(user, body, { previewPlan });
        const status = validated.emailSettings?.lastTestStatus || "ready";
        if (body.sendTestEmail && status === "ready") {
          const deliverySettings = api.getBusinessEmailDeliverySettings(user, {
            previewPlan,
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
              emailSettings: {
                ...validated.emailSettings,
                lastDeliveryStatus: "sent",
                lastDeliveryMessage: `Test email sent to ${recipient}`,
              },
            });
          } catch (deliveryError) {
            sendJson(res, 400, {
              error: `SMTP settings validated, but test email failed: ${deliveryError.message}`,
              emailSettings: {
                ...validated.emailSettings,
                lastDeliveryStatus: "failed",
                lastDeliveryMessage: deliveryError.message,
              },
            });
          }
          return;
        }
        sendJson(res, 200, validated);
      } catch (error) {
        sendJson(res, /business/i.test(error.message) ? 402 : 400, { error: error.message });
      }
      return;
    }

    if (url.pathname === "/business/team" && req.method === "POST") {
      try {
        const body = await readBody(req);
        let member = api.createTeamMember(user, body, { previewPlan });
        let deliveryStatus = member.inviteDeliveryStatus || "queued";
        let deliveryMessage = "Invite saved. Configure SMTP to send the external email.";
        try {
          const deliverySettings = api.getBusinessEmailDeliverySettings(user, {
            previewPlan,
            companyId: body.companyId || null,
          });
          const emailReady = deliverySettings.smtpHost
            && deliverySettings.smtpPort
            && deliverySettings.smtpUser
            && deliverySettings.smtpPass
            && deliverySettings.fromEmail;
          if (emailReady) {
            await sendSmtpMail(deliverySettings, buildTeamInviteMessage(deliverySettings, member, user, req));
            deliveryStatus = "sent";
            deliveryMessage = `Invitation email sent to ${member.email}`;
            member = api.updateTeamMember(user, member.id, {
              inviteDeliveryStatus: deliveryStatus,
              inviteDeliveryMessage: deliveryMessage,
              inviteSentAt: new Date().toISOString(),
            }, { previewPlan });
          }
        } catch (deliveryError) {
          deliveryStatus = "failed";
          deliveryMessage = `Invite saved, but email delivery failed: ${deliveryError.message}`;
          member = api.updateTeamMember(user, member.id, {
            inviteDeliveryStatus: deliveryStatus,
            inviteDeliveryMessage: deliveryMessage,
          }, { previewPlan });
        }
        sendJson(res, 201, {
          ...member,
          inviteDeliveryStatus: deliveryStatus,
          inviteDeliveryMessage: deliveryMessage,
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
        sendJson(res, 200, api.updateTeamMember(user, id, body, { previewPlan }));
      } catch (error) {
        sendJson(res, /business/i.test(error.message) ? 402 : 404, { error: error.message });
      }
      return;
    }

    if (url.pathname === "/business/team/accept" && req.method === "POST") {
      try {
        const body = await readBody(req);
        sendJson(res, 200, api.acceptTeamInvite(user, body.inviteToken, { previewPlan }));
      } catch (error) {
        sendJson(res, /business/i.test(error.message) ? 402 : 404, { error: error.message });
      }
      return;
    }

    if (url.pathname === "/business/approvals" && req.method === "GET") {
      try {
        sendJson(res, 200, api.listApprovalRequests(user, { previewPlan }));
      } catch (error) {
        sendJson(res, /business/i.test(error.message) ? 402 : 400, { error: error.message });
      }
      return;
    }

    if (url.pathname === "/business/approvals" && req.method === "POST") {
      try {
        const body = await readBody(req);
        sendJson(res, 201, api.createApprovalRequest(user, body, { previewPlan }));
      } catch (error) {
        sendJson(res, /business/i.test(error.message) ? 402 : 400, { error: error.message });
      }
      return;
    }

    if (url.pathname.startsWith("/business/approvals/") && req.method === "PATCH") {
      try {
        const id = url.pathname.split("/")[3];
        const body = await readBody(req);
        sendJson(res, 200, api.decideApprovalRequest(user, id, body, { previewPlan }));
      } catch (error) {
        sendJson(res, /business/i.test(error.message) ? 402 : 404, { error: error.message });
      }
      return;
    }

    if (url.pathname === "/business/api-keys" && req.method === "GET") {
      try {
        sendJson(res, 200, api.listApiKeys(user, { previewPlan }));
      } catch (error) {
        sendJson(res, /business/i.test(error.message) ? 402 : 400, { error: error.message });
      }
      return;
    }

    if (url.pathname === "/business/api-keys" && req.method === "POST") {
      try {
        const body = await readBody(req);
        sendJson(res, 201, api.createApiKey(user, body, { previewPlan }));
      } catch (error) {
        sendJson(res, /business/i.test(error.message) ? 402 : 400, { error: error.message });
      }
      return;
    }

    if (url.pathname.startsWith("/business/api-keys/") && req.method === "DELETE") {
      try {
        const id = url.pathname.split("/")[3];
        sendJson(res, 200, api.revokeApiKey(user, id, { previewPlan }));
      } catch (error) {
        sendJson(res, /business/i.test(error.message) ? 402 : 404, { error: error.message });
      }
      return;
    }

    if (url.pathname === "/ai/command" && req.method === "POST") {
      try {
        const body = await readBody(req);
        sendJson(res, 201, await api.runAiCommandAsync(user, body, { previewPlan }));
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
      sendJson(res, 201, api.runRecurringInvoiceSchedulerForAllUsers({
        targetDate: body.targetDate,
        maxPerTemplate: body.maxPerTemplate,
      }));
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
      sendJson(res, 200, api.listInvoices(user));
      return;
    }

    if (url.pathname === "/payments" && req.method === "GET") {
      sendJson(res, 200, api.listPayments(user));
      return;
    }

    if (url.pathname === "/invoices" && req.method === "POST") {
      const body = sanitizeStandardInvoiceFeatures(api, user, previewPlan, await readBody(req));
      const summary = api.getFreePlanSummary(user, { previewPlan });
      if (!summary.status.allowed) {
        sendJson(res, 402, { error: summary.status.reason });
        return;
      }
      try {
        sendJson(res, 201, api.createInvoice({
          ...body,
          ownerUserId: user.id,
        }, { previewPlan }));
      } catch (error) {
        sendJson(res, 400, { error: error.message });
      }
      return;
    }

    if (url.pathname === "/invoices/recurring/run" && req.method === "POST") {
      try {
        const body = await readBody(req).catch(() => ({}));
        const result = api.runRecurringInvoiceScheduler(user, {
          previewPlan,
          targetDate: body.targetDate,
          maxPerTemplate: body.maxPerTemplate,
        });
        sendJson(res, 201, result);
      } catch (error) {
        const status = /standard/i.test(error.message) ? 402 : 400;
        sendJson(res, status, { error: error.message });
      }
      return;
    }

    if (url.pathname.startsWith("/invoices/") && req.method === "GET") {
      const id = url.pathname.split("/")[2];
      const invoice = api.getInvoice(id, user);
      if (!invoice) {
        sendJson(res, 404, { error: "Not found" });
        return;
      }
      sendJson(res, 200, invoice);
      return;
    }

    if (url.pathname.startsWith("/invoices/") && url.pathname.endsWith("/payments") && req.method === "POST") {
      const id = url.pathname.split("/")[2];
      const existing = api.getInvoice(id, user);
      if (!existing) {
        sendJson(res, 404, { error: "Not found" });
        return;
      }
      const body = await readBody(req);
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
      const recorded = api.recordInvoicePayment(id, {
        amount,
        currency: body.currency || existing.currency,
        mode: body.mode || "manual",
        reference: body.reference,
        notes: body.notes,
        paymentDate: body.paymentDate,
      });
      sendJson(res, 201, recorded);
      return;
    }

    if (url.pathname.startsWith("/invoices/") && url.pathname.endsWith("/payment-link") && req.method === "POST") {
      const id = url.pathname.split("/")[2];
      const existing = api.getInvoice(id, user);
      if (!existing) {
        sendJson(res, 404, { error: "Not found" });
        return;
      }
      if (!hasPaidEntitlement(api, user, previewPlan)) {
        sendJson(res, 402, { error: "Payment gateway links and automatic payment updates are available only in paid tiers." });
        return;
      }
      const body = await readBody(req).catch(() => ({}));
      const invoice = api.createInvoicePaymentLink(id, {
        gateway: body.gateway || "razorpay",
        url: body.url,
      });
      sendJson(res, 201, invoice);
      return;
    }

    if (url.pathname.startsWith("/invoices/") && req.method === "PATCH") {
      const id = url.pathname.split("/")[2];
      const existing = api.getInvoice(id, user);
      if (!existing) {
        sendJson(res, 404, { error: "Not found" });
        return;
      }
      const body = sanitizeStandardInvoiceFeatures(api, user, previewPlan, await readBody(req));
      try {
        sendJson(res, 200, api.updateInvoice(id, body, { previewPlan }));
      } catch (error) {
        sendJson(res, 400, { error: error.message });
      }
      return;
    }

    if (url.pathname.startsWith("/invoices/") && req.method === "DELETE") {
      const id = url.pathname.split("/")[2];
      const deleted = api.deleteInvoice(id, user);
      if (!deleted) {
        sendJson(res, 404, { error: "Not found" });
        return;
      }
      sendJson(res, 200, deleted);
      return;
    }

    if (url.pathname === "/purchase-orders" && req.method === "GET") {
      sendJson(res, 200, api.listPurchaseOrders(user));
      return;
    }

    if (url.pathname === "/purchase-orders" && req.method === "POST") {
      const body = await readBody(req);
      try {
        sendJson(res, 201, api.createPurchaseOrder({
          ...body,
          ownerUserId: user.id,
        }, { previewPlan }));
      } catch (error) {
        sendJson(res, 400, { error: error.message });
      }
      return;
    }

    if (url.pathname.startsWith("/purchase-orders/") && req.method === "GET") {
      const id = url.pathname.split("/")[2];
      const purchaseOrder = api.getPurchaseOrder(id, user);
      if (!purchaseOrder) {
        sendJson(res, 404, { error: "Not found" });
        return;
      }
      sendJson(res, 200, purchaseOrder);
      return;
    }

    if (url.pathname.startsWith("/purchase-orders/") && req.method === "PATCH") {
      const id = url.pathname.split("/")[2];
      const existing = api.getPurchaseOrder(id, user);
      if (!existing) {
        sendJson(res, 404, { error: "Not found" });
        return;
      }
      const body = await readBody(req);
      try {
        sendJson(res, 200, api.updatePurchaseOrder(id, body, { previewPlan }));
      } catch (error) {
        sendJson(res, 400, { error: error.message });
      }
      return;
    }

    if (url.pathname.startsWith("/purchase-orders/") && req.method === "DELETE") {
      const id = url.pathname.split("/")[2];
      const deleted = api.deletePurchaseOrder(id, user);
      if (!deleted) {
        sendJson(res, 404, { error: "Not found" });
        return;
      }
      sendJson(res, 200, deleted);
      return;
    }

      sendJson(res, 404, { error: "Not found" });
    } catch (error) {
      console.error("Unhandled request error:", {
        method: req.method,
        url: req.url,
        message: error.message,
        stack: error.stack,
      });
      if (!res.headersSent) {
        sendJson(res, 500, {
          error: "EazInvoice could not complete this request. Please try again, and check Render logs if it repeats.",
        });
      } else {
        res.end();
      }
    }
  });
  server.eazinvoiceApi = api;
  return server;
}

export function startServer(port = 3001) {
  const server = createServer();
  server.listen(port);
  const recurringEnabled = String(process.env.RECURRING_SCHEDULER_ENABLED || "").toLowerCase() === "true";
  if (recurringEnabled) {
    const intervalHours = Math.max(1, Number(process.env.RECURRING_SCHEDULER_INTERVAL_HOURS || 24));
    const maxPerTemplate = Math.max(1, Number(process.env.RECURRING_SCHEDULER_MAX_PER_TEMPLATE || 12));
    const intervalMs = intervalHours * 60 * 60 * 1000;
    const run = () => {
      try {
        const api = server.eazinvoiceApi;
        const result = api.runRecurringInvoiceSchedulerForAllUsers({
          targetDate: new Date().toISOString().slice(0, 10),
          maxPerTemplate,
        });
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
  return server;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  startServer(Number(process.env.PORT || 3001));
  console.log(`Eazinvoice API running on http://localhost:${process.env.PORT || 3001}`);
}
