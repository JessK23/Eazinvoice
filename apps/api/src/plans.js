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
    amount: 499,
    monthlyAmount: 499,
    discountedAmount: 299,
    annualAmount: annualize(499),
    discountedAnnualAmount: annualize(299),
    currency: "INR",
    billingCycle: "yearly",
    priceDisplay: "INR 499/month, billed yearly",
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
    amount: 999,
    monthlyAmount: 999,
    discountedAmount: 699,
    annualAmount: annualize(999),
    discountedAnnualAmount: annualize(699),
    currency: "INR",
    billingCycle: "yearly",
    priceDisplay: "INR 999/month, billed yearly",
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
      status: "partially_active",
      ready: ["Command-based AI invoice assistant", "Command-based AI PO and Work Order assistant", "AI report command summary", "Browser voice input for AI commands", "OpenAI refinement when configured", "AI usage logging", "Advanced report pages", "Advanced analytics detail views", "Multiple business limits", "Payment automation gates", "All Standard features"],
      pending: [],
    },
  },
  business: {
    plan: "business",
    label: "Business",
    description: "Full business workspace for teams, approvals, API access, analytics, and priority support.",
    amount: 1999,
    monthlyAmount: 1999,
    discountedAmount: 1499,
    annualAmount: annualize(1999),
    discountedAnnualAmount: annualize(1499),
    currency: "INR",
    billingCycle: "yearly",
    priceDisplay: "INR 1999/month, billed yearly",
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
      status: "planned_with_foundation",
      ready: ["Highest limits", "API access entitlement flag", "Approval entitlement flag", "All Pro features"],
      pending: ["Team invitations and roles", "Customer API key portal", "Approval workflow screens", "Priority support workflow"],
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
  return subscriptions
    .slice()
    .reverse()
    .find((subscription) => String(subscription.status || "active").toLowerCase() === "active");
}

export function getActivePlanDefinition(subscriptions = []) {
  const subscription = getActiveSubscription(subscriptions);
  return getPlanDefinition(subscription?.plan || "free");
}

export function hasPlanFeature(plan, feature) {
  return Boolean(getPlanDefinition(plan).features[feature]);
}

export function resolvePlanUsageStatus(usage, limits) {
  const overLimit = Object.entries(limits).find(([key, limit]) => {
    const value = usage[key] ?? 0;
    return value > limit;
  });

  return {
    allowed: !overLimit,
    reason: overLimit ? `${overLimit[0]} exceeds free plan limit` : "within limits",
  };
}
