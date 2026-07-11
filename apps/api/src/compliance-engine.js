const ENTITY_TYPE_LABELS = {
  sole_proprietorship: "Sole proprietorship",
  partnership_firm: "Partnership firm",
  llp: "LLP",
  opc: "One person company",
  private_limited_company: "Private limited company",
  public_limited_company: "Public limited company",
  section_8_company: "Section 8 company",
  trust: "Trust",
  society: "Society",
  huf: "HUF",
  freelancer: "Freelancer",
  professional_practice: "Professional practice",
  educational_institution: "Educational institution",
  ngo: "NGO",
  religious_organization: "Religious organization",
  publishing_house: "Publishing house",
  trading_company: "Trading company",
  manufacturing_company: "Manufacturing company",
  service_company: "Service company",
  retail_store: "Retail store",
  restaurant: "Restaurant",
  construction_company: "Construction company",
  ecommerce_business: "E-commerce business",
  import_export_business: "Import/export business",
  company: "Company",
  individual: "Individual",
  group: "Group",
};

const COMPANY_ENTITY_TYPES = new Set([
  "company",
  "llp",
  "opc",
  "private_limited_company",
  "public_limited_company",
  "section_8_company",
]);

function cleanString(value) {
  return String(value || "").trim();
}

function cleanUpper(value) {
  return cleanString(value).toUpperCase();
}

function cleanLower(value) {
  return cleanString(value).toLowerCase();
}

function toNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}
function pad2(value) {
  return String(value).padStart(2, "0");
}

function isoDate(year, month, day) {
  return String(year) + "-" + pad2(month) + "-" + pad2(day);
}

function addDays(dateValue, days) {
  const date = new Date(String(dateValue) + "T00:00:00.000Z");
  if (Number.isNaN(date.getTime())) return "";
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function resolveComplianceYear(profile) {
  const year = Math.floor(toNumber(profile.complianceYear, new Date().getFullYear()));
  return year >= 2000 && year <= 2100 ? year : new Date().getFullYear();
}

function firstReminderDays(schedule = []) {
  const firstNumeric = schedule
    .map((item) => Number(String(item || "").match(/\d+/)?.[0]))
    .find((item) => Number.isFinite(item));
  return firstNumeric || 7;
}

function buildDueDate(ruleId, profile) {
  const year = resolveComplianceYear(profile);
  const month = Math.min(12, Math.max(1, profile.fiscalYearStartMonth || 4));
  const fiscalCloseYear = month === 1 ? year : year + 1;
  const dueDates = {
    income_tax_return: isoDate(fiscalCloseYear, 7, 31),
    gst_return_reconciliation: isoDate(year, month, 20),
    tds_tcs_review: isoDate(year, 7, 31),
    mca_annual_filing: isoDate(fiscalCloseYear, 10, 30),
    statutory_audit_review: isoDate(fiscalCloseYear, 9, 30),
    shops_establishment_review: isoDate(year, 12, 31),
    professional_tax_review: isoDate(year, month, 30),
    iec_import_export_review: isoDate(year, month, 30),
    records_retention: isoDate(year, month, 30),
  };
  return dueDates[ruleId] || isoDate(fiscalCloseYear, 3, 31);
}

function statusDescription(status) {
  const normalized = cleanLower(status || "pending");
  return {
    pending: "Action pending",
    filed: "Filed or completed",
    overdue: "Past due date",
    not_applicable: "Marked not applicable",
    needs_document: "Waiting for documents",
    profile_missing: "Complete compliance profile first",
  }[normalized] || "Action pending";
}

export function normalizeComplianceProfile(profile = {}, user = {}) {
  const entityType = cleanLower(profile.entityType || user?.subscriberType || "individual");
  const employeeCount = Math.max(0, Math.floor(toNumber(profile.employeeCount, 0)));
  const annualTurnover = Math.max(0, toNumber(profile.annualTurnover, 0));
  const hasEmployees = profile.hasEmployees !== undefined
    ? Boolean(profile.hasEmployees)
    : employeeCount > 0;
  const tanAvailable = profile.tanAvailable !== undefined
    ? Boolean(profile.tanAvailable)
    : Boolean(cleanString(profile.tan));

  return {
    entityType,
    legalName: cleanString(profile.legalName || user?.name),
    businessCategory: cleanLower(profile.businessCategory || profile.businessType),
    industry: cleanString(profile.industry),
    gstRegistered: Boolean(profile.gstRegistered),
    gstin: cleanUpper(profile.gstin),
    pan: cleanUpper(profile.pan),
    tan: cleanUpper(profile.tan),
    tanAvailable,
    state: cleanString(profile.state),
    address: cleanString(profile.address),
    placeOfBusiness: cleanString(profile.placeOfBusiness),
    invoicePrefix: cleanUpper(profile.invoicePrefix),
    fiscalYearStartMonth: Math.min(12, Math.max(1, Math.floor(toNumber(profile.fiscalYearStartMonth, 4)))),
    annualTurnover,
    turnoverRange: cleanString(profile.turnoverRange),
    employeeCount,
    hasEmployees,
    importExport: Boolean(profile.importExport || entityType === "import_export_business" || profile.businessCategory === "import_export"),
    auditApplicable: Boolean(profile.auditApplicable || annualTurnover >= 10000000),
    responsiblePerson: cleanString(profile.responsiblePerson || profile.legalName || user?.name),
    complianceYear: cleanString(profile.complianceYear || new Date().toISOString().slice(0, 4)),
  };
}

export function assessComplianceProfile(profile = {}, user = {}) {
  const normalized = normalizeComplianceProfile(profile, user);
  const required = [
    ["legalName", "legal name"],
    ["pan", "PAN"],
    ["state", "state"],
    ["address", "registered address"],
    ["placeOfBusiness", "place of business"],
    ["invoicePrefix", "invoice prefix"],
  ];
  const missing = required
    .filter(([field]) => !cleanString(normalized[field]))
    .map(([, label]) => label);
  const issues = [];
  const panPattern = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
  const tanPattern = /^[A-Z]{4}[0-9]{5}[A-Z]$/;
  const gstinPattern = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

  if (normalized.pan && !panPattern.test(normalized.pan)) issues.push("PAN format should be ABCDE1234F");
  if (normalized.tan && !tanPattern.test(normalized.tan)) issues.push("TAN format should be ABCD12345E");
  if (normalized.tanAvailable && !normalized.tan) missing.push("TAN");
  if (normalized.gstRegistered && !normalized.gstin) missing.push("GSTIN");
  if (normalized.gstin && !gstinPattern.test(normalized.gstin)) issues.push("GSTIN format is invalid");
  if (normalized.gstRegistered && normalized.gstin && normalized.pan && normalized.gstin.slice(2, 12) !== normalized.pan) {
    issues.push("GSTIN PAN segment should match the PAN field");
  }

  const ready = missing.length === 0 && issues.length === 0;
  return {
    entityType: normalized.entityType,
    entityLabel: ENTITY_TYPE_LABELS[normalized.entityType] || "Business",
    businessCategory: normalized.businessCategory,
    fiscalYearStartMonth: normalized.fiscalYearStartMonth,
    ready,
    gstReady: !normalized.gstRegistered || Boolean(normalized.gstin && !issues.some((issue) => issue.includes("GSTIN"))),
    entityAwareReady: ready && Boolean(normalized.entityType),
    missing,
    issues,
    status: ready ? "ready" : "attention_required",
    message: ready
      ? "Compliance profile is ready for GST, audit, and statutory reminders."
      : [...missing.map((item) => `missing ${item}`), ...issues].join("; "),
  };
}

export function buildComplianceRuleCatalog() {
  return [
    {
      id: "income_tax_return",
      complianceName: "Income tax return review",
      department: "Income Tax",
      frequency: "yearly",
      dueDateRule: { label: "After financial-year close" },
      reminderSchedule: ["30 days before", "7 days before"],
      requiredDocuments: ["PAN", "invoice summary", "expense summary"],
      appliesWhen: () => true,
      penaltyInformation: "Late filing may attract interest and late fees.",
    },
    {
      id: "gst_return_reconciliation",
      complianceName: "GST return reconciliation",
      department: "GST",
      frequency: "monthly/quarterly",
      dueDateRule: { label: "As per GST return cycle" },
      reminderSchedule: ["10 days before", "2 days before"],
      requiredDocuments: ["GSTIN", "sales invoices", "purchase input GST records"],
      appliesWhen: (profile) => profile.gstRegistered,
      penaltyInformation: "Mismatch or late filing may affect input credit and late fees.",
    },
    {
      id: "tds_tcs_review",
      complianceName: "TDS/TCS review",
      department: "Income Tax",
      frequency: "quarterly",
      dueDateRule: { label: "Quarterly statement cycle" },
      reminderSchedule: ["15 days before", "3 days before"],
      requiredDocuments: ["TAN", "vendor payments", "salary/professional fee records"],
      appliesWhen: (profile) => profile.tanAvailable || profile.hasEmployees || COMPANY_ENTITY_TYPES.has(profile.entityType),
      penaltyInformation: "Delayed deduction/deposit can attract interest and penalties.",
    },
    {
      id: "mca_annual_filing",
      complianceName: "MCA annual filing",
      department: "MCA",
      frequency: "yearly",
      dueDateRule: { label: "Annual company filing cycle" },
      reminderSchedule: ["45 days before", "15 days before"],
      requiredDocuments: ["financial statements", "board approval", "directors/KMP details"],
      appliesWhen: (profile) => COMPANY_ENTITY_TYPES.has(profile.entityType),
      penaltyInformation: "Company law filings can carry additional fees for delay.",
    },
    {
      id: "statutory_audit_review",
      complianceName: "Statutory audit applicability review",
      department: "Audit",
      frequency: "yearly",
      dueDateRule: { label: "Before return finalization" },
      reminderSchedule: ["60 days before", "30 days before"],
      requiredDocuments: ["ledger summary", "sales register", "purchase register"],
      appliesWhen: (profile) => profile.auditApplicable || profile.annualTurnover >= 10000000,
      penaltyInformation: "Audit applicability should be checked before filing returns.",
    },
    {
      id: "shops_establishment_review",
      complianceName: "Shops and establishment review",
      department: "State Labour",
      frequency: "yearly/renewal",
      dueDateRule: { label: "As per state registration" },
      reminderSchedule: ["30 days before"],
      requiredDocuments: ["state", "place of business", "employee count"],
      appliesWhen: (profile) => Boolean(profile.state && profile.placeOfBusiness),
      penaltyInformation: "State rules vary by location and activity.",
    },
    {
      id: "professional_tax_review",
      complianceName: "Professional tax review",
      department: "State Tax",
      frequency: "monthly/annual",
      dueDateRule: { label: "As per state rules" },
      reminderSchedule: ["7 days before"],
      requiredDocuments: ["employee count", "state registration details"],
      appliesWhen: (profile) => profile.hasEmployees,
      penaltyInformation: "Applicability depends on state and employee strength.",
    },
    {
      id: "iec_import_export_review",
      complianceName: "IEC/import-export review",
      department: "DGFT",
      frequency: "yearly/transactional",
      dueDateRule: { label: "Before import/export activity" },
      reminderSchedule: ["Before transaction"],
      requiredDocuments: ["IEC", "PAN", "bank details"],
      appliesWhen: (profile) => profile.importExport,
      penaltyInformation: "Import/export activity normally requires IEC and transaction documentation.",
    },
    {
      id: "records_retention",
      complianceName: "Financial records retention",
      department: "Internal Controls",
      frequency: "ongoing",
      dueDateRule: { label: "Ongoing" },
      reminderSchedule: ["monthly"],
      requiredDocuments: ["invoices", "purchase records", "payment proofs"],
      appliesWhen: () => true,
      penaltyInformation: "Keep source records available for audits and assessments.",
    },
  ];
}

export function generateComplianceSchedule(profile = {}, user = {}) {
  const normalized = normalizeComplianceProfile(profile, user);
  const review = assessComplianceProfile(normalized, user);
  return buildComplianceRuleCatalog()
    .filter((rule) => rule.appliesWhen(normalized))
    .map((rule) => {
      const status = review.ready ? "pending" : "profile_missing";
      const dueDate = buildDueDate(rule.id, normalized);
      const reminderDaysBefore = firstReminderDays(rule.reminderSchedule);
      const nextReminderDate = dueDate ? addDays(dueDate, -reminderDaysBefore) : "";
      return {
        id: rule.id,
        complianceName: rule.complianceName,
        department: rule.department,
        complianceType: rule.department,
        frequency: rule.frequency,
        periodLabel: String(resolveComplianceYear(normalized)) + "-" + String(resolveComplianceYear(normalized) + 1).slice(2),
        dueDate,
        dueDateLabel: rule.dueDateRule?.label || "",
        reminderSchedule: rule.reminderSchedule,
        reminderDaysBefore,
        nextReminderDate,
        requiredDocuments: rule.requiredDocuments,
        status,
        statusDescription: statusDescription(status),
        responsiblePerson: normalized.responsiblePerson || normalized.legalName || user?.name || "",
        penaltyInformation: rule.penaltyInformation,
        exportReady: true,
      };
    });
}

export function buildComplianceReminderDigest(tasks = [], todayValue = new Date().toISOString().slice(0, 10)) {
  const today = String(todayValue || new Date().toISOString().slice(0, 10)).slice(0, 10);
  const upcomingCutoff = addDays(today, 30);
  const actionable = tasks.filter((task) => !["filed", "not_applicable"].includes(cleanLower(task.status)));
  const byDueDate = (a, b) => String(a.dueDate || a.nextReminderDate || "9999-12-31").localeCompare(String(b.dueDate || b.nextReminderDate || "9999-12-31"));
  const overdue = actionable
    .filter((task) => task.dueDate && task.dueDate < today)
    .sort(byDueDate);
  const dueThisMonth = actionable
    .filter((task) => task.dueDate && String(task.dueDate).startsWith(today.slice(0, 7)))
    .sort(byDueDate);
  const upcoming = actionable
    .filter((task) => task.nextReminderDate && task.nextReminderDate >= today && task.nextReminderDate <= upcomingCutoff)
    .sort((a, b) => String(a.nextReminderDate || "9999-12-31").localeCompare(String(b.nextReminderDate || "9999-12-31")));
  const nextTask = upcoming[0] || dueThisMonth[0] || overdue[0] || null;
  return {
    today,
    upcomingWindowDays: 30,
    counts: {
      overdue: overdue.length,
      dueThisMonth: dueThisMonth.length,
      upcoming: upcoming.length,
      actionable: actionable.length,
    },
    nextReminder: nextTask ? {
      id: nextTask.id,
      complianceName: nextTask.complianceName,
      department: nextTask.department,
      dueDate: nextTask.dueDate || "",
      nextReminderDate: nextTask.nextReminderDate || "",
      status: nextTask.status || "pending",
      responsiblePerson: nextTask.responsiblePerson || "",
    } : null,
    overdue: overdue.slice(0, 8),
    upcoming: upcoming.slice(0, 8),
    dueThisMonth: dueThisMonth.slice(0, 8),
  };
}
export function summarizeComplianceTasks(tasks = []) {
  const statusCount = tasks.reduce((acc, task) => {
    const status = cleanLower(task.status || "pending");
    acc[status] = (acc[status] || 0) + 1;
    return acc;
  }, {});
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const currentMonth = today.slice(0, 7);
  const upcomingCutoff = addDays(today, 30);
  return {
    total: tasks.length,
    pending: statusCount.pending || 0,
    profileMissing: statusCount.profile_missing || 0,
    filed: statusCount.filed || 0,
    overdue: statusCount.overdue || 0,
    notApplicable: statusCount.not_applicable || 0,
    needsDocument: statusCount.needs_document || 0,
    renewalAlerts: tasks.filter((task) => /renewal/i.test(task.frequency || task.dueDateLabel || "")).length,
    pendingDocuments: tasks.filter((task) => (task.requiredDocuments || []).length && !["filed", "not_applicable"].includes(cleanLower(task.status))).length,
    dueThisMonth: tasks.filter((task) => String(task.dueDate || "").startsWith(currentMonth)).length,
    upcomingReminders: tasks.filter((task) => task.nextReminderDate && task.nextReminderDate >= today && task.nextReminderDate <= upcomingCutoff).length,
  };
}
