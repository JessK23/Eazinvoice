export function resolveBusinessDocumentRelatedType(kind = "invoice", record = {}) {
  if (kind === "purchase_order") {
    return String(record.documentType || "po").toLowerCase() === "wo" ? "work_order" : "purchase_order";
  }
  return "invoice";
}

export function resolveBusinessDocumentClassification(kind = "invoice") {
  return kind === "purchase_order" ? "purchase_finalized" : "sales_finalized";
}

export function resolveBusinessDocumentNumber(kind = "invoice", record = {}) {
  if (kind === "purchase_order") {
    return String(record.poNumber || record.draftNumber || record.id || "").trim();
  }
  return String(record.invoiceNumber || record.draftNumber || record.id || "").trim();
}

export function resolveBusinessDocumentArchiveKey(kind = "invoice", record = {}) {
  const marker = kind === "purchase_order"
    ? String(record.issuedAt || record.poNumber || record.updatedAt || record.createdAt || "").trim()
    : String(record.finalizedAt || record.invoiceNumber || record.updatedAt || record.createdAt || "").trim();
  return `business-document:${kind}:${String(record.id || "").trim()}:${marker}`;
}

export function safePdfDownloadName(name = "document.pdf") {
  const sanitized = String(name || "document.pdf").replace(/[^A-Za-z0-9._-]+/g, "_");
  return sanitized.toLowerCase().endsWith(".pdf") ? sanitized : `${sanitized}.pdf`;
}

export function resolveBusinessDocumentFileName(kind = "invoice", record = {}) {
  const docType = kind === "purchase_order"
    ? (String(record.documentType || "po").toLowerCase() === "wo" ? "work_order" : "purchase_order")
    : "invoice";
  const number = resolveBusinessDocumentNumber(kind, record) || String(record.id || "document");
  return safePdfDownloadName(`${docType}_${number}.pdf`);
}

export function findArchivedBusinessDocument(api, { businessId = "", kind = "invoice", relatedEntityId = "" } = {}) {
  const normalizedBusinessId = String(businessId || "").trim();
  const normalizedEntityId = String(relatedEntityId || "").trim();
  if (!normalizedBusinessId || !normalizedEntityId) return null;
  const classification = resolveBusinessDocumentClassification(kind);
  const relatedEntityType = resolveBusinessDocumentRelatedType(kind, {});
  const records = api.listDocumentsForBusiness(normalizedBusinessId)
    .filter((entry) => (
      String(entry.classification || "") === classification
      && String(entry.relatedEntityType || "") === relatedEntityType
      && String(entry.relatedEntityId || "") === normalizedEntityId
    ))
    .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
  return records[0] || null;
}

export async function archiveAuthoritativeBusinessDocumentPdf({
  api,
  documentService,
  pdfBytes,
  kind = "invoice",
  record = {},
  user,
  businessId = "",
}) {
  if (!api || !documentService) {
    return { status: "failed", message: "Document archive service unavailable." };
  }
  if (!record || !record.id) {
    return { status: "failed", message: "No authoritative document record was available for archival." };
  }
  const currentStatus = String(record.status || "").toLowerCase();
  if (["draft", "deleted"].includes(currentStatus)) {
    return { status: "skipped", message: "Draft/temporary records are not archived as authoritative PDFs." };
  }

  try {
    const stored = await documentService.putDocument({
      user,
      businessId: String(businessId || record.businessId || "").trim(),
      classification: resolveBusinessDocumentClassification(kind),
      relatedEntityType: resolveBusinessDocumentRelatedType(kind, record),
      relatedEntityId: String(record.id || "").trim(),
      originalFilename: resolveBusinessDocumentFileName(kind, record),
      mimeType: "application/pdf",
      bytes: pdfBytes,
      idempotencyKey: resolveBusinessDocumentArchiveKey(kind, record),
      retentionClass: "business_record",
      securityClass: "restricted",
    });
    const status = String(stored?.status || "").toLowerCase();
    if (status === "available") {
      return {
        status: "available",
        documentId: stored.id,
        fileName: resolveBusinessDocumentFileName(kind, record),
      };
    }
    return {
      status: "pending",
      documentId: stored?.id || "",
      message: "Authoritative archive is not currently available. Retry archival without re-finalizing.",
    };
  } catch (error) {
    return {
      status: "failed",
      message: "Authoritative PDF archive failed. Retry archival without re-finalizing.",
      detail: String(error?.message || "archive_failed"),
    };
  }
}
