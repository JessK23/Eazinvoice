function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function dateOnly(value = "") {
  const text = String(value || "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : "";
}

export function validateAccountingDate(value, label = "accounting date") {
  const date = dateOnly(value);
  if (!date) throw new Error(`${label} must be a YYYY-MM-DD date.`);
  return date;
}

export function financialYearForAccountingDate(value, startMonth = 4) {
  const date = new Date(`${validateAccountingDate(value)}T00:00:00.000Z`);
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + 1;
  const startYear = month >= startMonth ? year : year - 1;
  return {
    label: `${startYear}-${String(startYear + 1).slice(-2)}`,
    startYear,
    endYear: startYear + 1,
    startDate: `${startYear}-${String(startMonth).padStart(2, "0")}-01`,
    endDate: new Date(Date.UTC(startYear + 1, startMonth - 1, 0)).toISOString().slice(0, 10),
  };
}

export function resolveAccountingPeriod(value, options = {}) {
  const accountingDate = validateAccountingDate(value);
  const startMonth = Number(options.financialYearStartMonth || options.taxYearStartMonth || 4);
  const fy = financialYearForAccountingDate(accountingDate, startMonth);
  const [yearText, monthText] = accountingDate.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  return {
    financialYear: fy.label,
    periodType: "month",
    periodKey: `${year}-${String(month).padStart(2, "0")}`,
    startDate: `${year}-${String(month).padStart(2, "0")}-01`,
    endDate: new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10),
    accountingDate,
  };
}

export function findAccountingPeriod(state = {}, businessId = "", accountingDate = "") {
  const date = validateAccountingDate(accountingDate);
  return (state.accountingPeriods || []).find((period) => (
    period.businessId === businessId
    && period.startDate <= date
    && period.endDate >= date
    && period.periodType === "month"
  )) || null;
}

export function periodIdFor(period = {}) {
  return `aper_${period.businessId}_${period.periodKey}`.replace(/[^A-Za-z0-9_]/g, "_");
}

export function ensureAccountingPeriod(state = {}, business = {}, accountingDate = "", options = {}) {
  state.accountingPeriods = Array.isArray(state.accountingPeriods) ? state.accountingPeriods : [];
  const resolved = resolveAccountingPeriod(accountingDate, {
    financialYearStartMonth: business.financialYearStartMonth || business.taxProfile?.taxYearStartMonth || options.financialYearStartMonth || 4,
  });
  let period = findAccountingPeriod(state, business.id, resolved.accountingDate);
  if (!period) {
    period = {
      id: periodIdFor({ businessId: business.id, periodKey: resolved.periodKey }),
      businessId: business.id,
      ownerUserId: business.ownerUserId || null,
      financialYear: resolved.financialYear,
      periodType: resolved.periodType,
      periodKey: resolved.periodKey,
      startDate: resolved.startDate,
      endDate: resolved.endDate,
      status: "open",
      closeHistory: [],
      notes: "",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      closedAt: "",
      closedByUserId: "",
      reopenedAt: "",
      reopenedByUserId: "",
      closeReason: "",
      reopenReason: "",
    };
    state.accountingPeriods.push(period);
  }
  return period;
}

export function validatePostingPeriod(state = {}, business = {}, accountingDate = "", options = {}) {
  const date = validateAccountingDate(accountingDate);
  const period = ensureAccountingPeriod(state, business, date, options);
  const status = String(period.status || "open").toLowerCase();
  if (status === "closed") {
    throw new Error(`Accounting period ${period.periodKey} is closed. Reopen the period or post a correction in an open period.`);
  }
  if (status === "soft_closed" && !options.overrideReason) {
    throw new Error(`Accounting period ${period.periodKey} is soft-closed. Provide an override reason to post.`);
  }
  if (status === "soft_closed") {
    period.closeHistory = Array.isArray(period.closeHistory) ? period.closeHistory : [];
    period.closeHistory.push({
      action: "soft_close_override_posting",
      actorUserId: options.actorUserId || "",
      reason: String(options.overrideReason || "").trim(),
      accountingDate: date,
      sourceType: options.sourceType || "",
      sourceId: options.sourceId || "",
      createdAt: new Date().toISOString(),
    });
    period.updatedAt = new Date().toISOString();
  }
  return clone({ period, accountingDate: date });
}

export function transitionAccountingPeriod(period = {}, action = "", input = {}) {
  const previousStatus = String(period.status || "open");
  const now = new Date().toISOString();
  const reason = String(input.reason || input.notes || "").trim();
  if (!reason) throw new Error("A period close/reopen reason is required.");
  const nextStatus = action === "soft_close" ? "soft_closed" : action === "close" ? "closed" : action === "reopen" ? "open" : "";
  if (!nextStatus) throw new Error("Unsupported accounting period transition.");
  period.closeHistory = Array.isArray(period.closeHistory) ? period.closeHistory : [];
  period.closeHistory.push({
    action,
    previousStatus,
    nextStatus,
    actorUserId: input.actorUserId || "",
    reason,
    readinessStatus: input.readinessStatus || "",
    createdAt: now,
  });
  period.status = nextStatus;
  period.updatedAt = now;
  if (action === "close") {
    period.closedAt = now;
    period.closedByUserId = input.actorUserId || "";
    period.closeReason = reason;
  }
  if (action === "reopen") {
    period.reopenedAt = now;
    period.reopenedByUserId = input.actorUserId || "";
    period.reopenReason = reason;
  }
  return clone(period);
}
