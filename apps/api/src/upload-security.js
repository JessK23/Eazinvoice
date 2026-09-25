import crypto from "node:crypto";
import path from "node:path";

export const UPLOAD_MAX_BYTES = 5 * 1024 * 1024;

const ALLOWED_MIME = new Map([
  ["application/pdf", { extensions: ["pdf"], signature: "pdf" }],
  ["image/png", { extensions: ["png"], signature: "png" }],
  ["image/jpeg", { extensions: ["jpg", "jpeg"], signature: "jpeg" }],
]);

const BASE64_PATTERN = /^[A-Za-z0-9+/]+={0,2}$/;

export class UploadValidationError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = "UploadValidationError";
    this.statusCode = statusCode;
  }
}

function getExtension(fileName = "") {
  const normalized = String(fileName || "").trim().replace(/\\+/g, "/");
  const baseName = path.posix.basename(normalized);
  const dot = baseName.lastIndexOf(".");
  if (dot <= 0 || dot === baseName.length - 1) return "";
  return baseName.slice(dot + 1).toLowerCase();
}

function sanitizeFileStem(fileName = "") {
  const normalized = String(fileName || "").trim().replace(/\\+/g, "/");
  const baseName = path.posix.basename(normalized);
  const stem = baseName.includes(".") ? baseName.slice(0, baseName.lastIndexOf(".")) : baseName;
  return stem
    .replace(/[\x00-\x1F\x7F]+/g, "")
    .replace(/[^A-Za-z0-9._-]+/g, "_")
    .replace(/^[_\.\-]+|[_\.\-]+$/g, "")
    .slice(0, 60) || "document";
}

function decodeBase64Strict(base64) {
  const normalized = String(base64 || "").replace(/\s+/g, "");
  if (!normalized) {
    throw new UploadValidationError("Upload payload is empty.");
  }
  if (normalized.length % 4 !== 0 || !BASE64_PATTERN.test(normalized)) {
    throw new UploadValidationError("Upload payload is not valid base64.");
  }
  const bytes = Buffer.from(normalized, "base64");
  if (!bytes.length) {
    throw new UploadValidationError("Upload payload is empty.");
  }
  return bytes;
}

function verifySignature(signature, bytes) {
  if (signature === "pdf") {
    return bytes.length >= 5
      && bytes[0] === 0x25
      && bytes[1] === 0x50
      && bytes[2] === 0x44
      && bytes[3] === 0x46
      && bytes[4] === 0x2D;
  }
  if (signature === "png") {
    return bytes.length >= 8
      && bytes[0] === 0x89
      && bytes[1] === 0x50
      && bytes[2] === 0x4E
      && bytes[3] === 0x47
      && bytes[4] === 0x0D
      && bytes[5] === 0x0A
      && bytes[6] === 0x1A
      && bytes[7] === 0x0A;
  }
  if (signature === "jpeg") {
    return bytes.length >= 3
      && bytes[0] === 0xFF
      && bytes[1] === 0xD8
      && bytes[2] === 0xFF;
  }
  return true;
}

export function validateUploadInput(input = {}) {
  const fileName = String(input.fileName || "").trim();
  const mimeType = String(input.mimeType || "").trim().toLowerCase();
  const dataUrl = String(input.dataUrl || "").trim();
  if (!mimeType || !fileName || !dataUrl) {
    throw new UploadValidationError("Upload requires fileName, mimeType, and dataUrl.");
  }

  const match = dataUrl.match(/^data:([^;]+);base64,([A-Za-z0-9+/=\s]+)$/i);
  if (!match) {
    throw new UploadValidationError("Upload payload must be a base64 data URL.");
  }
  const detectedMime = String(match[1] || "").trim().toLowerCase();
  const base64Payload = match[2] || "";
  if (detectedMime !== mimeType) {
    throw new UploadValidationError("Upload MIME mismatch between metadata and payload.");
  }

  const policy = ALLOWED_MIME.get(mimeType);
  if (!policy) {
    throw new UploadValidationError("Unsupported document type. Allowed: PDF, PNG, JPEG.");
  }

  const extension = getExtension(fileName);
  if (!extension) {
    throw new UploadValidationError("Uploaded file must include an extension.");
  }
  if (!policy.extensions.includes(extension)) {
    throw new UploadValidationError("File extension does not match document type.");
  }

  const bytes = decodeBase64Strict(base64Payload);
  if (bytes.length > UPLOAD_MAX_BYTES) {
    throw new UploadValidationError("Uploaded file exceeds size limit.", 413);
  }
  if (!verifySignature(policy.signature, bytes)) {
    throw new UploadValidationError("Document content does not match the declared file type.");
  }

  const safeFileStem = sanitizeFileStem(fileName);
  const safeExtension = policy.extensions[0];
  const randomPart = crypto.randomBytes(8).toString("hex");
  const storedName = `${Date.now()}_${randomPart}_${safeFileStem}.${safeExtension}`;

  return {
    bytes,
    mimeType,
    storedName,
    filePath: path.posix.join("/data/uploads", storedName),
  };
}