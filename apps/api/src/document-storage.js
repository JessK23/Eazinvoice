import path from "node:path";
import { isProductionRuntime } from "./production-config.js";
import { createLocalDocumentStorage } from "./local-document-storage.js";
import { createAzureBlobDocumentStorage } from "./azure-blob-document-storage.js";

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

function asText(value = "") {
  return String(value || "").trim();
}

function explicitUploadsRootFromEnv() {
  return asText(process.env.EAZINVOICE_UPLOADS_DIR || process.env.UPLOADS_DIR);
}

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
  const explicitDir = explicitUploadsRootFromEnv();
  if (explicitDir) return path.resolve(explicitDir);
  const configuredDataDir = asText(process.env.EAZINVOICE_DATA_DIR || process.env.DATA_DIR);
  if (configuredDataDir) return path.resolve(configuredDataDir, "uploads");
  return path.resolve(path.join(process.cwd(), "data", "uploads"));
}

function resolveLocalDocumentRoot(options = {}) {
  const explicitOption = asText(options.rootDir);
  if (explicitOption) {
    return {
      rootDir: path.resolve(explicitOption),
      explicit: true,
      source: "options.rootDir",
    };
  }

  const explicitEnv = explicitUploadsRootFromEnv();
  if (explicitEnv) {
    return {
      rootDir: path.resolve(explicitEnv),
      explicit: true,
      source: "EAZINVOICE_UPLOADS_DIR",
    };
  }

  const configuredDataDir = asText(process.env.EAZINVOICE_DATA_DIR || process.env.DATA_DIR);
  if (configuredDataDir) {
    return {
      rootDir: path.resolve(configuredDataDir, "uploads"),
      explicit: false,
      source: "EAZINVOICE_DATA_DIR/uploads",
    };
  }

  return {
    rootDir: path.resolve(path.join(process.cwd(), "data", "uploads")),
    explicit: false,
    source: "cwd/data/uploads",
  };
}

function assertProductionLocalStorageRoot(localRoot = {}) {
  if (!isProductionRuntime()) return;
  if (!localRoot.explicit) {
    throw new Error("Production local document storage requires an explicitly configured persistent storage directory (set EAZINVOICE_UPLOADS_DIR).");
  }
}

export function createDocumentStorage(options = {}) {
  const provider = String(options.provider || process.env.EAZINVOICE_DOCUMENT_STORAGE_PROVIDER || "local").trim().toLowerCase();

  if (provider === "local") {
    const localRoot = resolveLocalDocumentRoot(options);
    assertProductionLocalStorageRoot(localRoot);
    return createLocalDocumentStorage({
      rootDir: localRoot.rootDir,
      provider,
      production: isProductionRuntime(),
    });
  }

  if (provider === "azure") {
    return createAzureBlobDocumentStorage({
      provider,
      container: options.container || process.env.EAZINVOICE_AZURE_STORAGE_CONTAINER,
      connectionString: options.connectionString || process.env.EAZINVOICE_AZURE_STORAGE_CONNECTION_STRING,
      clientFactory: options.clientFactory,
    });
  }

  throw new Error(`Unsupported document storage provider: ${provider}`);
}
