export const FREE_PLAN_LIMITS = {
  companies: 1,
  customers: 100,
  invoicesPerMonth: 25,
  invoiceItemsPerInvoice: 25,
  templates: 1,
  aiCommandsPerMonth: 0,
};

const UNLIMITED = 999999;
const annualize = (amount) => amount * 12;

export const PLAN_LIMIT_LABELS = {
  companies: "business profiles",
  customers: "customers",
  invoicesPerMonth: "monthly invoices",
  invoiceItemsPerInvoice: "items per invoice",
  templates: "templates",
  aiCommandsPerMonth: "AI commands this month",
};

export const FEATURE_REQUIREMENTS = {
  basicInvoices: {
    minimumPlan: "free",
    label: "Invoice creation",
    message: "Invoice creation is included in every EazInvoice plan.",
  },
  gstInvoices: {
    minimumPlan: "free",
    label: "GST invoices",
    message: "GST invoices are included in every EazInvoice plan.",
  },
  pdfPrint: {
    minimumPlan: "free",
    label: "PDF and print",
    message: "PDF and print are included in every EazInvoice plan.",
  },
  manualPayments: {
    minimumPlan: "free",
    label: "Manual payment tracking",
    message: "Manual payment tracking is included in every EazInvoice plan.",
  },
  emailOtp: {
    minimumPlan: "free",
    label: "Email OTP",
    message: "Email OTP is included in every EazInvoice plan.",
  },
  whatsappShare: {
    minimumPlan: "standard",
    label: "WhatsApp sharing",
    message: "WhatsApp sharing is available on Standard, Pro, and Business plans.",
  },
  razorpayCollections: {
    minimumPlan: "standard",
    label: "Razorpay collection links",
    message: "Razorpay collection links are available on Standard, Pro, and Business plans.",
  },
  recurringInvoices: {
    minimumPlan: "standard",
    label: "Recurring invoice auto-drafts",
    message: "Recurring invoice auto-drafts are available on Standard, Pro, and Business plans.",
  },
  wordpressPaid: {
    minimumPlan: "standard",
    label: "Paid WordPress plugin features",
    message: "Paid WordPress plugin features are available on Standard, Pro, and Business plans.",
  },
  aiInvoiceAssist: {
    minimumPlan: "pro",
    label: "AI invoice assistant",
    message: "AI invoice assistant is available on Pro and Business plans.",
  },
  aiPoAssist: {
    minimumPlan: "pro",
    label: "AI PO and Work Order assistant",
    message: "AI PO and Work Order assistant is available on Pro and Business plans.",
  },
  advancedReports: {
    minimumPlan: "pro",
    label: "Advanced reports",
    message: "Advanced reports and AI report summaries are available on Pro and Business plans.",
  },
  multiBusiness: {
    minimumPlan: "pro",
    label: "Multiple business profiles",
    message: "Multiple business profiles are available on Pro and Business plans.",
  },
  teamAccess: {
    minimumPlan: "business",
    label: "Team access",
    message: "Team access is available on the Business plan.",
  },
  apiAccess: {
    minimumPlan: "business",
    label: "API access",
    message: "API access is available on the Business plan.",
  },
  approvals: {
    minimumPlan: "business",
    label: "Approval workflow",
    message: "Approval workflow is available on the Business plan.",
  },
};

export const PLAN_CATALOG = {
  free: {
    plan: "free",
    label: "Free",
    description: "Basic GST-ready billing for individuals and very small teams starting out.",
    amount: 0,
    monthlyAmount: 0,
    annualAmount: 0,
    currency: "INR",
    billingCycle: "yearly",
    priceDisplay: "INR 0",
    limits: FREE_PLAN_LIMITS,
    features: {
      basicInvoices: true,
      gstInvoices: true,
      pdfPrint: true,
      manualPayments: true,
      emailOtp: true,
      whatsappShare: false,
      razorpayCollections: false,
      recurringInvoices: false,
      aiInvoiceAssist: false,
      aiPoAssist: false,
      advancedReports: false,
      multiBusiness: false,
      teamAccess: false,
      apiAccess: false,
      approvals: false,
      wordpressFree: true,
      wordpressPaid: false,
    },
    highlights: [
      "Limited GST-ready invoices",
      "One business profile",
      "Manual payment tracking",
      "Basic reports",
    ],
    implementation: {
      status: "active",
      ready: ["Basic invoices", "GST invoices", "PDF/print", "Manual payment tracking", "Basic reports", "WordPress free plugin"],
      pending: [],
    },
  },
  standard: {
    plan: "standard",
    label: "Standard",
    description: "Paid billing automation for small businesses that need sharing, collections, and recurring work.",
    amount: 150,
    monthlyAmount: 150,
    annualAmount: annualize(150),
    currency: "INR",
    billingCycle: "yearly",
    priceDisplay: "INR 150/month, INR 1,800 billed yearly",
    limits: {
      companies: 1,
      customers: 500,
      invoicesPerMonth: 300,
      invoiceItemsPerInvoice: 100,
      templates: 3,
      aiCommandsPerMonth: 0,
    },
    features: {
      basicInvoices: true,
      gstInvoices: true,
      pdfPrint: true,
      manualPayments: true,
      emailOtp: true,
      whatsappShare: true,
      razorpayCollections: true,
      recurringInvoices: true,
      aiInvoiceAssist: false,
      aiPoAssist: false,
      advancedReports: false,
      multiBusiness: false,
      teamAccess: false,
      apiAccess: false,
      approvals: false,
      wordpressFree: true,
      wordpressPaid: true,
    },
    highlights: [
      "WhatsApp sharing",
      "Razorpay collection links",
      "Recurring invoice drafts",
      "Branding removal",
    ],
    implementation: {
      status: "active",
      ready: ["WhatsApp sharing", "Razorpay invoice collection links", "Higher limits", "WordPress paid access flag", "Recurring invoice metadata", "Branding removal controls", "Automatic recurring scheduler"],
      pending: [],
    },
  },
  pro: {
    plan: "pro",
    label: "Pro",
    description: "Advanced invoicing, PO, reporting, and AI-assisted workflows for frequent billing teams.",
    amount: 600,
    monthlyAmount: 600,
    annualAmount: annualize(600),
    currency: "INR",
    billingCycle: "yearly",
    priceDisplay: "INR 600/month, INR 7,200 billed yearly",
    limits: {
      companies: 5,
      customers: 2500,
      invoicesPerMonth: 1500,
      invoiceItemsPerInvoice: 250,
      templates: 10,
      aiCommandsPerMonth: 300,
    },
    features: {
      basicInvoices: true,
      gstInvoices: true,
      pdfPrint: true,
      manualPayments: true,
      emailOtp: true,
      whatsappShare: true,
      razorpayCollections: true,
      recurringInvoices: true,
      aiInvoiceAssist: true,
      aiPoAssist: true,
      advancedReports: true,
      multiBusiness: true,
      teamAccess: false,
      apiAccess: false,
      approvals: false,
      wordpressFree: true,
      wordpressPaid: true,
    },
    highlights: [
      "AI invoice and PO command drafts",
      "Advanced reports",
      "Multiple businesses",
      "Payment automation",
    ],
    implementation: {
      status: "active",
      ready: ["Command-based AI invoice assistant", "Command-based AI PO and Work Order assistant", "AI report command summary", "Browser voice input for AI commands", "OpenAI refinement when configured", "AI usage logging", "Advanced report pages", "Advanced analytics detail views", "Multiple business limits", "Payment automation gates", "All Standard features"],
      pending: [],
    },
  },
  business: {
    plan: "business",
    label: "Business",
    description: "Full business workspace for teams, approvals, API access, analytics, and priority support.",
    amount: 1500,
    monthlyAmount: 1500,
    annualAmount: annualize(1500),
    currency: "INR",
    billingCycle: "yearly",
    priceDisplay: "INR 1,500/month, INR 18,000 billed yearly",
    limits: {
      companies: UNLIMITED,
      customers: UNLIMITED,
      invoicesPerMonth: UNLIMITED,
      invoiceItemsPerInvoice: 500,
      templates: 25,
      aiCommandsPerMonth: UNLIMITED,
    },
    features: {
      basicInvoices: true,
      gstInvoices: true,
      pdfPrint: true,
      manualPayments: true,
      emailOtp: true,
      whatsappShare: true,
      razorpayCollections: true,
      recurringInvoices: true,
      aiInvoiceAssist: true,
      aiPoAssist: true,
      advancedReports: true,
      multiBusiness: true,
      teamAccess: true,
      apiAccess: true,
      approvals: true,
      wordpressFree: true,
      wordpressPaid: true,
    },
    highlights: [
      "Team access and approvals",
      "API access",
      "Business analytics",
      "Priority support",
    ],
    implementation: {
      status: "active",
      ready: [
        "Highest limits",
        "Team invitations and role management",
        "Business SMTP settings and validation",
        "Business Razorpay gateway settings",
        "Compliance profile",
        "Customer API key portal",
        "Approval workflow screens",
        "Priority support workspace",
        "All Pro features",
      ],
      pending: [],
    },
  },
};

export function normalizePlan(plan) {
  const key = String(plan || "free").trim().toLowerCase();
  return PLAN_CATALOG[key] ? key : "free";
}

export function getPlanDefinition(plan) {
  return PLAN_CATALOG[normalizePlan(plan)];
}

export function listPlans() {
  return Object.values(PLAN_CATALOG).map((entry) => ({
    ...entry,
    limits: { ...entry.limits },
    features: { ...entry.features },
    highlights: [...entry.highlights],
    implementation: {
      status: entry.implementation.status,
      ready: [...entry.implementation.ready],
      pending: [...entry.implementation.pending],
    },
  }));
}

export function getActiveSubscription(subscriptions = []) {
  const now = Date.now();
  return subscriptions
    .slice()
    .reverse()
    .find((subscription) => {
      if (String(subscription.status || "active").toLowerCase() !== "active") return false;
      if (!subscription.expiresAt) return true;
      const expiresAt = Date.parse(subscription.expiresAt);
      return Number.isNaN(expiresAt) || expiresAt > now;
    });
}

export function getActivePlanDefinition(subscriptions = []) {
  const subscription = getActiveSubscription(subscriptions);
  return getPlanDefinition(subscription?.plan || "free");
}

export function hasPlanFeature(plan, feature) {
  return Boolean(getPlanDefinition(plan).features[feature]);
}

export function getFeatureRequirement(feature) {
  return FEATURE_REQUIREMENTS[feature] || {
    minimumPlan: "business",
    label: feature,
    message: `${feature} is not available on the active plan.`,
  };
}

function isUnlimitedLimit(limit) {
  return Number(limit) >= UNLIMITED;
}

export function buildPlanUsageDetails(usage = {}, limits = {}) {
  return Object.fromEntries(
    Object.entries(limits).map(([key, limit]) => {
      const numericLimit = Number(limit ?? 0);
      const used = Number(usage[key] ?? 0);
      const unlimited = isUnlimitedLimit(numericLimit);
      return [key, {
        key,
        label: PLAN_LIMIT_LABELS[key] || key,
        used,
        limit: numericLimit,
        remaining: unlimited ? null : Math.max(0, numericLimit - used),
        unlimited,
        exceeded: !unlimited && used > numericLimit,
      }];
    }),
  );
}

export function resolvePlanUsageStatus(usage, limits, options = {}) {
  const planLabel = typeof options === "string"
    ? options
    : options.planLabel || options.label || "active";
  const overLimit = Object.entries(limits).find(([key, limit]) => {
    const value = usage[key] ?? 0;
    return !isUnlimitedLimit(limit) && value > limit;
  });

  return {
    allowed: !overLimit,
    reason: overLimit
      ? `${PLAN_LIMIT_LABELS[overLimit[0]] || overLimit[0]} exceeds ${planLabel} plan limit`
      : "within limits",
    limitKey: overLimit?.[0] || null,
    limitLabel: overLimit ? PLAN_LIMIT_LABELS[overLimit[0]] || overLimit[0] : null,
    limit: overLimit ? Number(overLimit[1]) : null,
    used: overLimit ? Number(usage[overLimit[0]] ?? 0) : null,
  };
}
