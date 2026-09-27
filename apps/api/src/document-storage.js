import path from "node:path";
import { createLocalDocumentStorage } from "./local-document-storage.js";

export const DOCUMENT_CLASSIFICATIONS = Object.freeze({
  KYC: "kyc",
  BUSINESS_ASSET: "business_asset",
  SALES_FINALIZED: "sales_finalized",
  PURCHASE_FINALIZED: "purchase_finalized",
  SUPPORTING_ATTACHMENT: "supporting_attachment",
});

export const DOCUMENT_STATUSES = Object.freeze({
  PENDING_STORAGE: "pending_storage",
  AVAILABLE: "available",
  MISSING: "missing",
  QUARANTINED: "quarantined",
  ARCHIVED: "archived",
});

export function normalizeDocumentClassification(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return Object.values(DOCUMENT_CLASSIFICATIONS).includes(normalized)
    ? normalized
    : DOCUMENT_CLASSIFICATIONS.SUPPORTING_ATTACHMENT;
}

export function normalizeDocumentStatus(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return Object.values(DOCUMENT_STATUSES).includes(normalized)
    ? normalized
    : DOCUMENT_STATUSES.PENDING_STORAGE;
}

export function resolveUploadsRoot() {
  const explicitDir = String(process.env.EAZINVOICE_UPLOADS_DIR || process.env.UPLOADS_DIR || "").trim();
  if (explicitDir) return path.resolve(explicitDir);
  const configuredDataDir = String(process.env.EAZINVOICE_DATA_DIR || process.env.DATA_DIR || "").trim();
  if (configuredDataDir) return path.resolve(configuredDataDir, "uploads");
  return path.resolve(path.join(process.cwd(), "data", "uploads"));
}

export function createDocumentStorage(options = {}) {
  const provider = String(options.provider || process.env.EAZINVOICE_DOCUMENT_STORAGE_PROVIDER || "local").trim().toLowerCase();
  if (provider !== "local") {
    throw new Error(`Unsupported document storage provider: ${provider}`);
  }
  return createLocalDocumentStorage({
    rootDir: options.rootDir || resolveUploadsRoot(),
    provider,
  });
}
