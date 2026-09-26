import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

test("admin KYC review UI uses secure review flow without exposing stored file paths", () => {
  const js = readFileSync(path.join(process.cwd(), "apps", "web", "admin.js"), "utf8");
  assert.match(js, /Review KYC/);
  assert.match(js, /getAdminKycReviewCompany\(token, companyId\)/);
  assert.match(js, /getAdminKycDocument\(token, company\.id, documentId\)/);
  assert.doesNotMatch(js, /Stored:\s*\$\{escapeHtml\(\(company\.documentFiles \|\| \[\]\)\.map\(\(file\) => file\.filePath\)/);
  assert.match(js, /Aadhaar Last 4/);
  assert.doesNotMatch(js, /aadhaarNumber/);
});
