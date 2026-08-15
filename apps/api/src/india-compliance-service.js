const GSTIN_ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function toNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function toMinor(value) {
  return Math.round(toNumber(value) * 100);
}

export function money(value) {
  return Math.round(toNumber(value)) / 100;
}

function normalizeDate(value, label = "date") {
  const text = String(value || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) throw new Error(`${label} must be YYYY-MM-DD.`);
  return text;
}

function inRange(date, from = "", to = "") {
  const value = String(date || "").slice(0, 10);
  return (!from || value >= from) && (!to || value <= to);
}

function normalizeCode(value = "") {
  return String(value || "").trim().toUpperCase().replace(/\s+/g, "");
}

export function maskTaxIdentifier(value = "", visible = 4) {
  const text = normalizeCode(value);
  if (!text) return "";
  return `${"*".repeat(Math.max(0, text.length - visible))}${text.slice(-visible)}`;
}

export function validatePan(value = "") {
  const pan = normalizeCode(value);
  return {
    value: pan,
    structurallyValid: /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(pan),
    externallyVerified: false,
    masked: maskTaxIdentifier(pan),
  };
}

export function validateTan(value = "") {
  const tan = normalizeCode(value);
  return {
    value: tan,
    structurallyValid: /^[A-Z]{4}[0-9]{5}[A-Z]$/.test(tan),
    externallyVerified: false,
    masked: maskTaxIdentifier(tan),
  };
}

function gstinChecksumIsValid(gstin) {
  if (!/^[0-9A-Z]{15}$/.test(gstin)) return false;
  const payload = gstin.slice(0, 14);
  let factor = 1;
  let sum = 0;
  for (let index = payload.length - 1; index >= 0; index -= 1) {
    const codePoint = GSTIN_ALPHABET.indexOf(payload[index]);
    if (codePoint < 0) return false;
    const product = codePoint * factor;
    sum += Math.floor(product / 36) + (product % 36);
    factor = factor === 2 ? 1 : 2;
  }
  const checkCodePoint = (36 - (sum % 36)) % 36;
  return GSTIN_ALPHABET[checkCodePoint] === gstin[14];
}

export function validateGstin(value = "") {
  const gstin = normalizeCode(value);
  const formatValid = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(gstin);
  return {
    value: gstin,
    structurallyValid: formatValid && gstinChecksumIsValid(gstin),
    formatValid,
    checksumValid: formatValid ? gstinChecksumIsValid(gstin) : false,
    externallyVerified: false,
    stateCode: formatValid ? gstin.slice(0, 2) : "",
    pan: formatValid ? gstin.slice(2, 12) : "",
    masked: maskTaxIdentifier(gstin),
  };
}

export function normalizeIndiaTaxProfile(input = {}, existing = {}) {
  const pan = validatePan(input.pan ?? input.panNumber ?? existing.pan ?? "");
  const tan = validateTan(input.tan ?? input.tanNumber ?? existing.tan ?? "");
  const gstin = validateGstin(input.gstin ?? input.gstNumber ?? existing.gstin ?? "");
  const gstRegistered = input.gstRegistered !== undefined
    ? input.gstRegistered
    : input.gstRegistrationStatus !== undefined
      ? input.gstRegistrationStatus === "registered"
      : existing.gstRegistered ?? false;
  return {
    legalName: String(input.legalName ?? input.businessName ?? existing.legalName ?? "").trim(),
    entityType: String(input.entityType ?? existing.entityType ?? "").trim(),
    pan: pan.value,
    maskedPan: pan.masked,
    panStructurallyValid: pan.value ? pan.structurallyValid : false,
    panExternallyVerified: false,
    tan: tan.value,
    maskedTan: tan.masked,
    tanStructurallyValid: tan.value ? tan.structurallyValid : false,
    tanExternallyVerified: false,
    gstRegistered: Boolean(gstRegistered),
    gstRegistrationStatus: Boolean(gstRegistered) ? "registered" : "not_registered",
    gstin: gstin.value,
    maskedGstin: gstin.masked,
    gstinStructurallyValid: gstin.value ? gstin.structurallyValid : false,
    gstinExternallyVerified: false,
    registrationState: String(input.registrationState ?? existing.registrationState ?? "").trim(),
    stateCode: String(input.stateCode ?? gstin.stateCode ?? existing.stateCode ?? "").trim(),
    gstScheme: String(input.gstScheme ?? input.gstRegistrationType ?? existing.gstScheme ?? "regular").trim(),
    filingFrequency: String(input.filingFrequency ?? existing.filingFrequency ?? "monthly").trim(),
    taxYearStartMonth: Number(input.taxYearStartMonth ?? existing.taxYearStartMonth ?? 4),
    turnoverCategory: String(input.turnoverCategory ?? existing.turnoverCategory ?? "").trim(),
    tdsDeductorApplicable: Boolean(input.tdsDeductorApplicable ?? existing.tdsDeductorApplicable ?? false),
    complianceStatus: String(input.complianceStatus ?? existing.complianceStatus ?? "active").trim(),
    sourceStatus: "self_reported",
    updatedAt: new Date().toISOString(),
  };
}

export function publicTaxProfile(profile = {}) {
  return clone({
    ...profile,
    pan: undefined,
    tan: undefined,
    gstin: undefined,
  });
}

export function financialYearFor(dateValue, startMonth = 4) {
  const date = new Date(`${normalizeDate(dateValue)}T00:00:00Z`);
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + 1;
  const startYear = month >= startMonth ? year : year - 1;
  return {
    label: `${startYear}-${String(startYear + 1).slice(-2)}`,
    startDate: `${startYear}-${String(startMonth).padStart(2, "0")}-01`,
    endDate: `${startYear + 1}-${String(startMonth - 1 || 12).padStart(2, "0")}-${startMonth === 1 ? "31" : "31"}`,
    startYear,
    endYear: startYear + 1,
  };
}

export function normalizeCompliancePeriod(input = {}) {
  const startMonth = Number(input.taxYearStartMonth || 4);
  const anchor = normalizeDate(input.date || input.from || new Date().toISOString().slice(0, 10));
  const fy = financialYearFor(anchor, startMonth);
  const date = new Date(`${anchor}T00:00:00Z`);
  const month = date.getUTCMonth() + 1;
  const year = date.getUTCFullYear();
  if (String(input.periodType || "month") === "quarter") {
    const quarter = Math.floor(((month - startMonth + 12) % 12) / 3) + 1;
    const firstMonth = ((startMonth - 1 + ((quarter - 1) * 3)) % 12) + 1;
    const firstYear = firstMonth >= startMonth ? fy.startYear : fy.endYear;
    const lastMonth = ((firstMonth + 1) % 12) + 1;
    const lastYear = lastMonth >= startMonth ? fy.startYear : fy.endYear;
    return {
      periodType: "quarter",
      periodKey: `${fy.label}-Q${quarter}`,
      financialYear: fy.label,
      from: `${firstYear}-${String(firstMonth).padStart(2, "0")}-01`,
      to: new Date(Date.UTC(lastYear, lastMonth, 0)).toISOString().slice(0, 10),
    };
  }
  return {
    periodType: "month",
    periodKey: `${year}-${String(month).padStart(2, "0")}`,
    financialYear: fy.label,
    from: `${year}-${String(month).padStart(2, "0")}-01`,
    to: new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10),
  };
}

export function selectComplianceRuleSet(ruleSets = [], query = {}) {
  const date = normalizeDate(query.effectiveDate || query.date || new Date().toISOString().slice(0, 10), "effectiveDate");
  const matches = ruleSets
    .filter((rule) => String(rule.status || "active") === "active")
    .filter((rule) => !query.jurisdiction || rule.jurisdiction === query.jurisdiction)
    .filter((rule) => !query.taxType || rule.taxType === query.taxType)
    .filter((rule) => !query.ruleKey || rule.ruleKey === query.ruleKey)
    .filter((rule) => (!rule.effectiveFrom || rule.effectiveFrom <= date) && (!rule.effectiveTo || rule.effectiveTo >= date))
    .sort((a, b) => String(b.effectiveFrom || "").localeCompare(String(a.effectiveFrom || "")) || String(b.version || "").localeCompare(String(a.version || "")));
  return matches[0] || null;
}

function partyState(party = {}, transaction = {}) {
  return String(transaction.placeOfSupply || transaction.billingStateCode || party.stateCode || party.registrationStateCode || party.state || "").trim();
}

function deriveGstMode(supplierState = "", recipientState = "") {
  if (!supplierState || !recipientState) return { expectedGstMode: "", status: "needs_review", issue: "missing_place_of_supply" };
  return supplierState === recipientState
    ? { expectedGstMode: "intra", status: "classified", issue: "" }
    : { expectedGstMode: "inter", status: "classified", issue: "" };
}

function transactionTaxSnapshot(transaction = {}, direction = "output") {
  const cgst = toMinor(transaction.cgstAmount);
  const sgst = toMinor(transaction.sgstAmount);
  const igst = toMinor(transaction.igstAmount);
  const tax = cgst + sgst + igst;
  return {
    taxableValue: money(toMinor(transaction.total) - tax),
    cgst: money(cgst),
    sgst: money(sgst),
    igst: money(igst),
    taxAmount: money(tax),
    grossValue: money(toMinor(transaction.total)),
    direction,
  };
}

export function classifyGstTransaction(state = {}, business = {}, transaction = {}, options = {}) {
  const profile = business.taxProfile || {};
  const rule = selectComplianceRuleSet(state.complianceRuleSets || [], {
    jurisdiction: "IN",
    taxType: "GST",
    ruleKey: options.ruleKey || "gst_classification",
    effectiveDate: options.date || transaction.invoiceDate || transaction.billDate || transaction.creditNoteDate || transaction.vendorCreditDate || transaction.createdAt?.slice(0, 10) || new Date().toISOString().slice(0, 10),
  });
  const supplierState = String(options.supplierState || profile.stateCode || profile.registrationState || "").trim();
  const party = options.party || {};
  const recipientState = partyState(party, transaction);
  const derived = deriveGstMode(supplierState, recipientState);
  const suppliedMode = String(transaction.gstMode || "").trim().toLowerCase();
  const tax = transactionTaxSnapshot(transaction, options.direction || "output");
  const issues = [];
  if (!rule) issues.push("missing_gst_rule_configuration");
  if (profile.gstRegistered && (!profile.gstinStructurallyValid && !profile.gstin)) issues.push("missing_business_gstin");
  if (profile.gstRegistered && profile.gstin && !profile.gstinStructurallyValid) issues.push("invalid_business_gstin");
  if (derived.issue) issues.push(derived.issue);
  if (derived.expectedGstMode && suppliedMode && suppliedMode !== derived.expectedGstMode) issues.push("inconsistent_gst_mode");
  if (toMinor(tax.taxAmount) > 0 && !["intra", "inter"].includes(suppliedMode)) issues.push("unsupported_or_missing_gst_mode");
  let status = "classified";
  if (!profile.gstRegistered && toMinor(tax.taxAmount) === 0) status = "not_applicable";
  else if (issues.some((issue) => issue.startsWith("invalid") || issue === "inconsistent_gst_mode")) status = "invalid";
  else if (issues.length) status = "needs_review";
  const gstin = options.direction === "input" ? party.gstNumber || party.gstin || "" : party.gstNumber || party.gstin || "";
  const gstinValidation = validateGstin(gstin);
  return {
    jurisdiction: "IN",
    taxType: "GST",
    sourceType: options.sourceType || "",
    sourceId: transaction.id || "",
    documentNumber: transaction.invoiceNumber || transaction.vendorBillNumber || transaction.creditNoteNumber || transaction.vendorCreditNumber || "",
    documentDate: transaction.invoiceDate || transaction.billDate || transaction.creditNoteDate || transaction.vendorCreditDate || transaction.createdAt?.slice(0, 10) || "",
    registrationId: options.registrationId || "",
    ruleSetId: rule?.id || "",
    ruleVersion: rule?.version || "",
    ruleKey: rule?.ruleKey || "",
    ruleSource: rule?.sourceType || "",
    classificationStatus: status,
    issues,
    supplierState,
    recipientState,
    expectedGstMode: derived.expectedGstMode,
    suppliedGstMode: suppliedMode,
    placeOfSupply: transaction.placeOfSupply || recipientState,
    b2bB2c: gstinValidation.structurallyValid ? "B2B" : "B2C_or_unregistered",
    counterpartyGstinMasked: gstinValidation.masked,
    counterpartyGstinStructurallyValid: gstin ? gstinValidation.structurallyValid : false,
    supplyType: String(transaction.supplyType || "domestic_taxable").trim(),
    reverseChargeApplicable: Boolean(transaction.reverseChargeApplicable),
    itcStatus: options.direction === "input" ? String(transaction.itcStatus || options.defaultItcStatus || "not_verified") : "not_applicable",
    hsnSacStatus: (transaction.items || []).some((item) => item.hsnSac) ? "provided" : "not_provided",
    tax,
    generatedAt: new Date().toISOString(),
  };
}

export function evaluateTdsForVendorBill(state = {}, business = {}, bill = {}, vendor = {}) {
  const profile = business.taxProfile || {};
  const date = bill.billDate || bill.createdAt?.slice(0, 10) || new Date().toISOString().slice(0, 10);
  const nature = String(bill.tdsNatureOfPayment || bill.paymentNature || bill.expenseCategory || "").trim();
  const rule = selectComplianceRuleSet(state.complianceRuleSets || [], {
    jurisdiction: "IN",
    taxType: "TDS",
    ruleKey: nature || "default_tds",
    effectiveDate: date,
  });
  const issues = [];
  if (!profile.tdsDeductorApplicable && !bill.tdsOverride) {
    return { status: "not_applicable", applicability: "not_applicable", issues: ["business_not_marked_as_tds_deductor"], amount: 0 };
  }
  if (!rule) return { status: "needs_review", applicability: "needs_review", issues: ["missing_tds_rule_configuration"], amount: 0 };
  if (rule.config?.requiresPaymentNature && !nature) issues.push("missing_payment_nature");
  if (rule.config?.requiresPan && !validatePan(vendor.panNumber || vendor.pan || "").structurallyValid) issues.push("missing_or_invalid_vendor_pan");
  if (issues.length) return { status: "needs_review", applicability: "needs_review", issues, ruleSetId: rule.id, ruleVersion: rule.version, amount: 0 };
  const taxableMinor = toMinor(bill.total) - toMinor(bill.cgstAmount) - toMinor(bill.sgstAmount) - toMinor(bill.igstAmount);
  const fy = financialYearFor(date, profile.taxYearStartMonth || 4);
  const priorMinor = (state.vendorBills || [])
    .filter((entry) => entry.businessId === business.id && entry.vendorId === bill.vendorId && entry.id !== bill.id)
    .filter((entry) => inRange(entry.billDate || entry.createdAt, fy.startDate, fy.endDate))
    .filter((entry) => String(entry.tdsNatureOfPayment || entry.paymentNature || entry.expenseCategory || "") === nature)
    .reduce((sum, entry) => {
      const entryTax = toMinor(entry.cgstAmount) + toMinor(entry.sgstAmount) + toMinor(entry.igstAmount);
      return sum + Math.max(0, toMinor(entry.total) - entryTax);
    }, 0);
  const thresholdMinor = toMinor(rule.config?.thresholdAmount);
  const crossesThreshold = !thresholdMinor || priorMinor + taxableMinor > thresholdMinor;
  if (!crossesThreshold) {
    return {
      status: "not_applicable",
      applicability: "below_threshold",
      issues: [],
      ruleSetId: rule.id,
      ruleVersion: rule.version,
      grossAmount: money(taxableMinor),
      priorCumulativeAmount: money(priorMinor),
      amount: 0,
    };
  }
  const rate = toNumber(rule.config?.rate);
  const amountMinor = Math.round(taxableMinor * rate / 100);
  return {
    status: "classified",
    applicability: "applicable",
    issues: [],
    ruleSetId: rule.id,
    ruleVersion: rule.version,
    ruleReference: rule.reference || "",
    sourceType: rule.sourceType || "configured",
    natureOfPayment: nature,
    statutoryProvision: rule.config?.statutoryProvision || "",
    grossAmount: money(taxableMinor),
    amountSubjectToTds: money(taxableMinor),
    priorCumulativeAmount: money(priorMinor),
    cumulativeAmount: money(priorMinor + taxableMinor),
    thresholdAmount: money(thresholdMinor),
    rate,
    amount: money(amountMinor),
    netVendorPayable: money(toMinor(bill.total) - amountMinor),
    deductionDate: date,
  };
}

export function buildGstSalesRegister(state = {}, business = {}, options = {}) {
  return buildGstRegister(state, business, { ...options, direction: "output" });
}

export function buildGstPurchaseRegister(state = {}, business = {}, options = {}) {
  return buildGstRegister(state, business, { ...options, direction: "input" });
}

function buildGstRegister(state = {}, business = {}, options = {}) {
  const from = options.from || "";
  const to = options.to || "";
  const snapshots = (state.transactionComplianceSnapshots || [])
    .filter((entry) => entry.businessId === business.id && entry.taxType === "GST" && entry.direction === options.direction)
    .filter((entry) => inRange(entry.documentDate, from, to));
  const rows = snapshots.map((entry) => clone(entry));
  const docRows = rows.filter((row) => !["sales_credit_note", "vendor_credit"].includes(row.sourceType));
  const correctionRows = rows.filter((row) => ["sales_credit_note", "vendor_credit"].includes(row.sourceType));
  const sum = (values, selector) => values.reduce((total, row) => total + toMinor(selector(row)), 0);
  return {
    businessId: business.id,
    reportType: options.direction === "input" ? "gst_purchase_register" : "gst_sales_register",
    from,
    to,
    basis: "posted_transaction_compliance_snapshots",
    filingStatus: "not_filed_by_eazinvoice",
    rows,
    totals: {
      grossTaxableValue: money(sum(docRows, (row) => row.taxableValue)),
      creditAdjustments: money(sum(correctionRows, (row) => row.taxableValue)),
      netTaxableValue: money(sum(docRows, (row) => row.taxableValue) - sum(correctionRows, (row) => row.taxableValue)),
      cgst: money(sum(docRows, (row) => row.cgst)),
      sgst: money(sum(docRows, (row) => row.sgst)),
      igst: money(sum(docRows, (row) => row.igst)),
      correctionCgst: money(sum(correctionRows, (row) => row.cgst)),
      correctionSgst: money(sum(correctionRows, (row) => row.sgst)),
      correctionIgst: money(sum(correctionRows, (row) => row.igst)),
      netCgst: money(sum(docRows, (row) => row.cgst) - sum(correctionRows, (row) => row.cgst)),
      netSgst: money(sum(docRows, (row) => row.sgst) - sum(correctionRows, (row) => row.sgst)),
      netIgst: money(sum(docRows, (row) => row.igst) - sum(correctionRows, (row) => row.igst)),
    },
  };
}

export function buildComplianceReadiness(state = {}, business = {}, options = {}) {
  const from = options.from || "";
  const to = options.to || "";
  const snapshots = (state.transactionComplianceSnapshots || [])
    .filter((entry) => entry.businessId === business.id)
    .filter((entry) => !from || !to || inRange(entry.documentDate, from, to));
  const obligations = (state.complianceObligations || [])
    .filter((entry) => entry.businessId === business.id)
    .filter((entry) => !from || !to || inRange(entry.periodFrom || entry.dueDate, from, to));
  const issues = [];
  snapshots.forEach((snapshot) => {
    if (["needs_review", "invalid"].includes(snapshot.classificationStatus)) {
      issues.push({
        severity: snapshot.classificationStatus === "invalid" ? "blocked" : "warning",
        sourceType: snapshot.sourceType,
        sourceId: snapshot.sourceId,
        issueCodes: snapshot.issues || [],
      });
    }
  });
  obligations.filter((obligation) => ["due", "overdue"].includes(obligation.status)).forEach((obligation) => {
    issues.push({ severity: obligation.status === "overdue" ? "blocked" : "warning", sourceType: "compliance_obligation", sourceId: obligation.id, issueCodes: [obligation.status] });
  });
  return {
    businessId: business.id,
    status: issues.some((issue) => issue.severity === "blocked") ? "blocked" : issues.length ? "warning" : "ready",
    filingSemantics: "readiness_only_not_government_acceptance",
    issues,
    counts: {
      snapshots: snapshots.length,
      obligations: obligations.length,
      tdsReviewItems: (state.tdsTransactions || []).filter((entry) => entry.businessId === business.id && entry.status === "needs_review").length,
    },
  };
}

export function buildTdsRegister(state = {}, business = {}, options = {}) {
  const from = options.from || "";
  const to = options.to || "";
  const rows = (state.tdsTransactions || [])
    .filter((entry) => entry.businessId === business.id)
    .filter((entry) => inRange(entry.deductionDate || entry.transactionDate, from, to))
    .map((entry) => clone(entry));
  return {
    businessId: business.id,
    reportType: "tds_register",
    from,
    to,
    filingStatus: "internal_register_not_filed",
    rows,
    totals: {
      grossAmount: money(rows.reduce((sum, row) => sum + toMinor(row.grossAmount), 0)),
      amountSubjectToTds: money(rows.reduce((sum, row) => sum + toMinor(row.amountSubjectToTds), 0)),
      tdsAmount: money(rows.reduce((sum, row) => sum + toMinor(row.tdsAmount), 0)),
      netVendorPayable: money(rows.reduce((sum, row) => sum + toMinor(row.netVendorPayable), 0)),
    },
  };
}

export function buildGstReconciliation(state = {}, business = {}, options = {}) {
  const sales = buildGstSalesRegister(state, business, options);
  const purchases = buildGstPurchaseRegister(state, business, options);
  const journalsById = new Map((state.accountingJournals || []).map((journal) => [journal.id, journal]));
  const inRequestedPeriod = (line) => {
    const journal = journalsById.get(line.journalId) || {};
    if (journal.sourceType === "opening_balance") return false;
    return inRange(journal.journalDate || journal.createdAt, options.from || "", options.to || "");
  };
  const lineNet = (code) => (state.accountingJournalLines || [])
    .filter((line) => line.businessId === business.id && line.accountCode === code && inRequestedPeriod(line))
    .reduce((sum, line) => sum + toMinor(line.credit) - toMinor(line.debit), 0);
  const assetLineNet = (code) => (state.accountingJournalLines || [])
    .filter((line) => line.businessId === business.id && line.accountCode === code && inRequestedPeriod(line))
    .reduce((sum, line) => sum + toMinor(line.debit) - toMinor(line.credit), 0);
  const checks = [
    ["output_cgst", toMinor(sales.totals.netCgst), lineNet("2201")],
    ["output_sgst", toMinor(sales.totals.netSgst), lineNet("2202")],
    ["output_igst", toMinor(sales.totals.netIgst), lineNet("2203")],
    ["input_cgst", toMinor(purchases.totals.netCgst), assetLineNet("2211")],
    ["input_sgst", toMinor(purchases.totals.netSgst), assetLineNet("2212")],
    ["input_igst", toMinor(purchases.totals.netIgst), assetLineNet("2213")],
  ].map(([id, expectedMinor, actualMinor]) => ({
    id,
    status: expectedMinor === actualMinor ? "reconciled" : "failed",
    expected: money(expectedMinor),
    actual: money(actualMinor),
    difference: money(actualMinor - expectedMinor),
  }));
  return {
    businessId: business.id,
    reportType: "gst_compliance_reconciliation",
    sales,
    purchases,
    checks,
    status: checks.every((check) => check.status === "reconciled") ? "reconciled" : "exception",
  };
}

export function buildTdsReconciliation(state = {}, business = {}, options = {}) {
  const register = buildTdsRegister(state, business, options);
  const journalsById = new Map((state.accountingJournals || []).map((journal) => [journal.id, journal]));
  const ledgerMinor = (state.accountingJournalLines || [])
    .filter((line) => line.businessId === business.id && line.accountCode === "2220")
    .filter((line) => journalsById.get(line.journalId)?.sourceType !== "opening_balance")
    .reduce((sum, line) => sum + toMinor(line.credit) - toMinor(line.debit), 0);
  const registerMinor = toMinor(register.totals.tdsAmount);
  return {
    businessId: business.id,
    reportType: "tds_liability_reconciliation",
    register,
    checks: [{
      id: "tds_register_to_ledger",
      status: registerMinor === ledgerMinor ? "reconciled" : "failed",
      expected: money(registerMinor),
      actual: money(ledgerMinor),
      difference: money(ledgerMinor - registerMinor),
    }],
  };
}
