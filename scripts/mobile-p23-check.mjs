import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const checks = [
  {
    name: "mobile API client abstraction",
    file: "apps/mobile/app.js",
    patterns: ["const api = {", "request(path", "timeoutMs", "MobileApiError"],
  },
  {
    name: "backend auth and session handling",
    file: "apps/mobile/app.js",
    patterns: ["requestOtp", "/auth/email-otp/request", "/auth/login", "SESSION_KEY", "logout"],
  },
  {
    name: "business context and stale response protection",
    file: "apps/mobile/app.js",
    patterns: ["list", "businessId", "workspaceParams", "requestEpoch", "switchWorkspace"],
  },
  {
    name: "financial workflows use backend APIs",
    file: "apps/mobile/app.js",
    patterns: ["/invoices", "/credit-notes", "/customer-refunds", "/vendor-bills", "/vendor-credits", "/bank/reconciliation/summary"],
  },
  {
    name: "offline and production URL safety",
    file: "apps/mobile/app.js",
    patterns: ["navigator.onLine", "Financial actions are blocked", "isReleaseUnsafeApiBase", "https"],
  },
  {
    name: "mobile navigation shell",
    file: "apps/mobile/index.html",
    patterns: ["data-route=\"home\"", "data-route=\"sales\"", "data-route=\"purchases\"", "data-route=\"money\"", "data-route=\"reports\"", "data-route=\"more\""],
  },
  {
    name: "Android parity matrix",
    file: "docs/p2-3-android-parity-matrix.md",
    patterns: ["Auth", "Business switch", "Credit Notes", "Vendor Recovery", "Year-End", "Play Data Safety Draft"],
  },
  {
    name: "release signing example is sanitized",
    file: "android/key.properties.example",
    patterns: ["REPLACE_WITH_UPLOAD_STORE_PASSWORD", "REPLACE_WITH_UPLOAD_KEY_PASSWORD"],
  },
];

const failures = [];
for (const check of checks) {
  const text = read(check.file);
  const missing = check.patterns.filter((pattern) => !text.includes(pattern));
  if (missing.length) failures.push(`${check.name}: missing ${missing.join(", ")}`);
}

if (failures.length) {
  console.error("P2-3 mobile check failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log(`P2-3 mobile parity check passed (${checks.length}/${checks.length}).`);
