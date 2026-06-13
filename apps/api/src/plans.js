export const FREE_PLAN_LIMITS = {
  companies: 1,
  customers: 100,
  invoicesPerMonth: 25,
  invoiceItemsPerInvoice: 25,
  templates: 1,
};

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
