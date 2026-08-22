const PLACEHOLDER_PATTERN = /^(change_me|changeme|replace_me|replace_with|your_|test|secret|password|eazinvoice-admin)/i;

function truthy(value) {
  return ["1", "true", "yes", "on"].includes(String(value || "").trim().toLowerCase());
}

function runtimeEnvironment(env = process.env) {
  return String(env.EAZINVOICE_ENV || env.NODE_ENV || "development").trim().toLowerCase();
}

export function isProductionRuntime(env = process.env) {
  return runtimeEnvironment(env) === "production";
}

export function resolveStorageMode(options = {}, env = process.env) {
  if (options.persist === false) return "memory";
  const requested = String(options.storage || env.EAZINVOICE_STORAGE || "").trim().toLowerCase();
  if (["memory", "json", "postgres"].includes(requested)) return requested;
  return isProductionRuntime(env) ? "postgres" : "json";
}

export function redactSecret(value = "") {
  const text = String(value || "");
  if (!text) return "";
  if (text.length <= 8) return "***";
  return `${text.slice(0, 4)}***${text.slice(-4)}`;
}

export function redactMessage(value = "") {
  return String(value || "")
    .replace(/postgres:\/\/([^:]+):([^@]+)@/gi, "postgres://$1:***@")
    .replace(/(api[_-]?key|secret|password|token|otp)(=|:)\s*[^,\s&]+/gi, "$1$2***");
}

function hasStrongSecret(env, key, minLength = 24) {
  const value = String(env[key] || "").trim();
  return value.length >= minLength && !PLACEHOLDER_PATTERN.test(value);
}

function originList(env) {
  return String(env.CORS_ALLOWED_ORIGINS || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

export function validateProductionConfig(options = {}, env = process.env) {
  const production = options.production ?? isProductionRuntime(env);
  const storageMode = resolveStorageMode(options, env);
  const issues = [];
  const warnings = [];
  if (production && storageMode !== "postgres") {
    issues.push({ code: "production_requires_postgres_storage", message: "Production must use EAZINVOICE_STORAGE=postgres." });
  }
  if (production && !String(env.DATABASE_URL || "").trim()) {
    issues.push({ code: "database_url_required", message: "DATABASE_URL is required in production." });
  }
  if (production && !truthy(env.EAZINVOICE_POSTGRES_SSL_REQUIRED)) {
    issues.push({ code: "postgres_ssl_required", message: "EAZINVOICE_POSTGRES_SSL_REQUIRED=true is required in production." });
  }
  if (production && !hasStrongSecret(env, "API_KEY_HASH_SECRET")) {
    issues.push({ code: "api_key_hash_secret_weak", message: "API_KEY_HASH_SECRET must be a strong stable production secret." });
  }
  if (production && !hasStrongSecret(env, "ADMIN_ACCESS_KEY", 16)) {
    issues.push({ code: "admin_access_key_weak", message: "ADMIN_ACCESS_KEY must not use a weak/default value in production." });
  }
  if (production && !originList(env).length) {
    issues.push({ code: "cors_allowlist_required", message: "CORS_ALLOWED_ORIGINS must be explicit in production." });
  }
  if (production && originList(env).some((origin) => /^http:\/\/localhost|^http:\/\/127\.0\.0\.1/i.test(origin))) {
    issues.push({ code: "cors_dev_origin_in_production", message: "Production CORS allowlist must not include localhost unless running a controlled staging profile." });
  }
  if (!production && storageMode !== "postgres" && String(env.DATABASE_URL || "").trim()) {
    warnings.push({ code: "postgres_configured_but_not_authoritative", message: "DATABASE_URL is configured but runtime storage is not postgres." });
  }
  return {
    production,
    environment: runtimeEnvironment(env),
    storageMode,
    valid: issues.length === 0,
    issues,
    warnings,
  };
}

export function assertProductionConfig(options = {}, env = process.env) {
  const result = validateProductionConfig(options, env);
  if (!result.valid) {
    throw new Error(`Production configuration invalid: ${result.issues.map((issue) => issue.code).join(", ")}`);
  }
  return result;
}
