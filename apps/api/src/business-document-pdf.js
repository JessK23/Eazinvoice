function asText(value = "") {
  return String(value ?? "");
}

function money(value) {
  const amount = Number(value || 0);
  if (!Number.isFinite(amount)) return "0.00";
  return amount.toFixed(2);
}

function escapePdfText(value = "") {
  return asText(value)
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)")
    .replace(/[\r\n]+/g, " ");
}

function docLabel(kind = "invoice", document = {}) {
  if (kind === "purchase_order") {
    return String(document.documentType || "po").toLowerCase() === "wo" ? "Work Order" : "Purchase Order";
  }
  return "Invoice";
}

function docNumber(kind = "invoice", document = {}) {
  if (kind === "purchase_order") {
    return asText(document.poNumber || document.draftNumber || document.id || "");
  }
  return asText(document.invoiceNumber || document.draftNumber || document.id || "");
}

function docDate(kind = "invoice", document = {}) {
  if (kind === "purchase_order") {
    return asText(document.poDate || document.issuedAt || "");
  }
  return asText(document.invoiceDate || document.finalizedAt || "");
}

function buildLines(document = {}, kind = "invoice") {
  const rows = Array.isArray(document.items) ? document.items : [];
  const lines = [
    `EazInvoice ${docLabel(kind, document)} (Authoritative Archive)`,
    `Document ID: ${asText(document.id || "")}`,
    `Number: ${docNumber(kind, document)}`,
    `Date: ${docDate(kind, document)}`,
    `Status: ${asText(document.status || "")}`,
    `Business: ${asText(document.businessId || document.ownerUserId || "")}`,
    `Party: ${asText(document.billToName || "")}`,
    "",
    "Line Items",
  ];
  rows.forEach((item, index) => {
    lines.push(
      `${index + 1}. ${asText(item.description || "Item")}`,
      `   Qty ${asText(item.quantity ?? 0)} x Rate ${money(item.rate)} | Tax ${money(item.gstRate ?? document.taxRate ?? 0)}% | Total ${money(item.total)}`,
    );
  });
  lines.push(
    "",
    `Subtotal: ${money(document.subtotal)}`,
    `Tax: ${money(document.taxAmount)}`,
    `Discount: ${money(document.discount)}`,
    `Shipping: ${money(document.shipping)}`,
    `Round Off: ${money(document.roundOff)}`,
    `Total: ${money(document.total)}`,
    `Generated At: ${new Date().toISOString()}`,
  );
  return lines;
}

export function generateBusinessDocumentPdfBytes(document = {}, kind = "invoice") {
  const lines = buildLines(document, kind).slice(0, 55);
  const contentLines = ["BT", "/F1 11 Tf", "40 790 Td", "14 TL"];
  for (const line of lines) {
    contentLines.push(`(${escapePdfText(line)}) Tj`, "T*");
  }
  contentLines.push("ET");
  const contentStream = contentLines.join("\n");

  const objects = [
    "1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj",
    "2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj",
    "3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >> endobj",
    "4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj",
    `5 0 obj << /Length ${Buffer.byteLength(contentStream, "utf8")} >> stream\n${contentStream}\nendstream endobj`,
  ];

  const chunks = ["%PDF-1.4\n"];
  const offsets = [0];
  let length = Buffer.byteLength(chunks[0], "utf8");
  for (const object of objects) {
    offsets.push(length);
    const chunk = `${object}\n`;
    chunks.push(chunk);
    length += Buffer.byteLength(chunk, "utf8");
  }

  const xrefStart = length;
  const xrefRows = [
    "xref",
    `0 ${objects.length + 1}`,
    "0000000000 65535 f ",
    ...offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n `),
    "trailer",
    `<< /Size ${objects.length + 1} /Root 1 0 R >>`,
    "startxref",
    String(xrefStart),
    "%%EOF",
  ];
  chunks.push(`${xrefRows.join("\n")}\n`);
  return Buffer.from(chunks.join(""), "utf8");
}
