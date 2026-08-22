function toNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function toMinorUnits(value) {
  return Math.round(toNumber(value) * 100);
}

function fromMinorUnits(value) {
  return Math.round(toNumber(value) / 1) / 100;
}

function assertNonNegative(value, label) {
  if (toNumber(value) < 0) throw new Error(`${label} cannot be negative.`);
}

function assertValidTaxRate(value) {
  const rate = toNumber(value);
  if (rate < 0 || rate > 100) throw new Error("Tax rate must be between 0 and 100.");
}

export function normalizeFinancialItems(items = [], defaultTaxRate = 0) {
  assertValidTaxRate(defaultTaxRate);
  return (Array.isArray(items) ? items : []).map((item) => {
    const quantity = toNumber(item.quantity);
    const rate = toNumber(item.rate);
    const discount = toNumber(item.discount);
    const gstRate = toNumber(item.gstRate, defaultTaxRate);
    assertNonNegative(quantity, "Quantity");
    assertNonNegative(rate, "Rate");
    assertNonNegative(discount, "Discount");
    assertValidTaxRate(gstRate);
    return {
      description: String(item.description || "").trim(),
      hsnSac: String(item.hsnSac || "").trim(),
      unit: String(item.unit || "").trim(),
      quantity,
      rate,
      discount,
      gstRate,
    };
  });
}

export function calculateFinancialDocument(input = {}) {
  const defaultTaxRate = toNumber(input.taxRate);
  assertValidTaxRate(defaultTaxRate);
  const items = normalizeFinancialItems(input.items, defaultTaxRate);
  const documentDiscountMinor = toMinorUnits(input.discount);
  const shippingMinor = toMinorUnits(input.shipping);
  const roundOffMinor = toMinorUnits(input.roundOff);
  assertNonNegative(input.discount, "Document discount");
  if (shippingMinor < 0) throw new Error("Shipping cannot be negative.");

  const rawLineBases = items.map((item) => toMinorUnits(item.quantity * item.rate));
  const subtotalMinor = rawLineBases.reduce((sum, value) => sum + value, 0);
  const itemDiscountMinor = items.reduce((sum, item, index) => (
    sum + Math.min(rawLineBases[index], toMinorUnits(item.discount))
  ), 0);
  const totalDiscountMinor = Math.min(subtotalMinor, itemDiscountMinor + documentDiscountMinor);

  const lineResults = items.map((item, index) => {
    const lineBaseMinor = rawLineBases[index];
    const proportionalDocumentDiscountMinor = subtotalMinor > 0
      ? Math.round((documentDiscountMinor * lineBaseMinor) / subtotalMinor)
      : 0;
    const lineDiscountMinor = Math.min(
      lineBaseMinor,
      toMinorUnits(item.discount) + proportionalDocumentDiscountMinor,
    );
    const taxableMinor = Math.max(0, lineBaseMinor - lineDiscountMinor);
    const taxMinor = Math.round((taxableMinor * toNumber(item.gstRate, defaultTaxRate)) / 100);
    const gstMode = String(input.gstMode || "intra").trim().toLowerCase();
    const cgstMinor = gstMode === "intra" ? Math.round(taxMinor / 2) : 0;
    const sgstMinor = gstMode === "intra" ? taxMinor - cgstMinor : 0;
    const igstMinor = gstMode === "inter" ? taxMinor : 0;
    return {
      ...item,
      lineSubtotal: fromMinorUnits(lineBaseMinor),
      lineDiscount: fromMinorUnits(lineDiscountMinor),
      taxableAmount: fromMinorUnits(taxableMinor),
      taxAmount: fromMinorUnits(taxMinor),
      cgstAmount: fromMinorUnits(cgstMinor),
      sgstAmount: fromMinorUnits(sgstMinor),
      igstAmount: fromMinorUnits(igstMinor),
      lineTotal: fromMinorUnits(taxableMinor + taxMinor),
    };
  });

  const taxMinor = lineResults.reduce((sum, line) => sum + toMinorUnits(line.taxAmount), 0);
  const cgstMinor = lineResults.reduce((sum, line) => sum + toMinorUnits(line.cgstAmount), 0);
  const sgstMinor = lineResults.reduce((sum, line) => sum + toMinorUnits(line.sgstAmount), 0);
  const igstMinor = lineResults.reduce((sum, line) => sum + toMinorUnits(line.igstAmount), 0);
  const taxableMinor = Math.max(0, subtotalMinor - totalDiscountMinor);
  const totalMinor = taxableMinor + taxMinor + shippingMinor + roundOffMinor;

  return {
    items: lineResults,
    subtotal: fromMinorUnits(subtotalMinor),
    discount: fromMinorUnits(totalDiscountMinor),
    taxableAmount: fromMinorUnits(taxableMinor),
    taxAmount: fromMinorUnits(taxMinor),
    cgstAmount: fromMinorUnits(cgstMinor),
    sgstAmount: fromMinorUnits(sgstMinor),
    igstAmount: fromMinorUnits(igstMinor),
    shipping: fromMinorUnits(shippingMinor),
    roundOff: fromMinorUnits(roundOffMinor),
    total: fromMinorUnits(totalMinor),
    moneyPrecision: "minor_units_2dp",
  };
}

export function calculatePaymentState(document = {}, payments = []) {
  const totalMinor = Math.max(0, toMinorUnits(document.total));
  const paidMinor = Math.min(totalMinor, payments
    .filter((payment) => String(payment.status || "captured").toLowerCase() === "captured")
    .reduce((sum, payment) => sum + Math.max(0, toMinorUnits(payment.amount)), 0));
  const balanceMinor = Math.max(0, totalMinor - paidMinor);
  const status = String(document.status || "").toLowerCase();
  let paymentStatus = "unpaid";
  if (status === "draft") paymentStatus = "draft";
  else if (status === "deleted" || status === "cancelled" || status === "void") paymentStatus = status;
  else if (totalMinor > 0 && balanceMinor <= 0) paymentStatus = "paid";
  else if (paidMinor > 0) paymentStatus = "part_paid";
  else if (document.dueDate && new Date(document.dueDate) < new Date()) paymentStatus = "overdue";
  return {
    paidAmount: fromMinorUnits(paidMinor),
    balanceAmount: fromMinorUnits(balanceMinor),
    paymentStatus,
  };
}

export function validatePaymentApplication(document = {}, input = {}, payments = []) {
  const amountMinor = toMinorUnits(input.amount);
  if (amountMinor <= 0) throw new Error(input.invalidAmountMessage || "Enter a valid payment amount.");
  const current = calculatePaymentState(document, payments);
  const balanceMinor = toMinorUnits(current.balanceAmount);
  if (balanceMinor > 0 && amountMinor > balanceMinor + 1) {
    throw new Error(input.overpaymentMessage || "Payment amount cannot be more than the pending balance.");
  }
  return fromMinorUnits(amountMinor);
}

export function paymentIdempotencyKey(input = {}) {
  return String(
    input.idempotencyKey
      || input.gatewayPaymentId
      || input.razorpay_payment_id
      || input.paymentId
      || "",
  ).trim();
}
