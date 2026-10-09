# PHASE

AUTH-SIGNUP-01 — Company Registration Failure and OTP Security Correction

# BASELINE

The repository contained pre-existing uncommitted Phase 3C.64 accounting changes in:

- `apps/api/src/store.js`
- `apps/api/src/accounting-service.js`
- `tests/provider-settlement-accounting.test.js`
- `tests/provider-tax-document.test.js`

Those files were preserved and not modified.

# OTP AUTOPOPULATION ROOT CAUSE

The OTP was being populated by application JavaScript. `apps/web/auth.js` read `response.devOtp` from the OTP request response and assigned it to the OTP input. The same code also displayed the value in the status message.

The corrected client clears the OTP input when requesting or resending a code and never reads or assigns a returned OTP. The field retains `autocomplete="one-time-code"`, so supported browser/password-manager accessibility behavior is not disabled; any remaining autofill would be external to the application and must be distinguished during live browser verification.

# OTP SECURITY FINDINGS

Corrected:

- Local OTP generation now uses `crypto.randomInt`, not `Math.random`.
- Production OTP responses omit `devOtp` and raw `otp` fields.
- Development OTP exposure is explicit and environment-gated for local/test compatibility only.
- OTP requests replace the prior code for the email and mode.
- Expired entries are deleted during verification.
- Invalid attempts are bounded at five attempts per issued code.
- Successful verification consumes the code exactly once.
- The client clears stale input after expiry and before a fresh request.
- OTP values are not logged, placed in URLs, or emitted in the new report.

The existing route-level OTP request rate limiter remains in place. Supabase and app-SMTP delivery remain the configured provider paths; the correction does not replace the email provider.

# FETCH FAILED ROOT CAUSE

The screenshot alone could not establish whether the live request failed at the browser, network, API, OTP verifier, persistence layer, or deployment configuration. The repository did establish one concrete defect: `apps/web/auth.js` allowed a native `fetch` exception to surface directly as `fetch failed`.

The client now maps network failures to:

`Unable to connect to EazInvoice. Please check your connection and try again.`

HTTP/API errors continue to use the server's safe error message. The signup persistence boundary now returns a safe `503 REGISTRATION_UNAVAILABLE` response rather than exposing an internal exception.

The exact production failing request still requires browser Network evidence or server logs from the affected deployment. The likely signup endpoint to inspect is `POST /auth/signup`, after the preceding `POST /auth/email-otp/request`.

# FAILING API ENDPOINT

The signup chain is:

```text
auth.html
  → POST /auth/email-otp/request
  → user enters received code
  → POST /auth/signup
  → server-side OTP verification
  → registrant/password validation
  → authoritative user creation/update
  → session token creation
  → dashboard redirect
```

The code trace did not prove a production transport or backend failure. It did prove that the frontend previously obscured a transport failure as raw `fetch failed` and that application code exposed/populated a local OTP.

# COMPANY SIGNUP VALIDATION

Existing company validation remains server-authoritative. It requires registrant name, designation, email, and a normalized mobile number of at least ten digits. The correction preserves Account → Business → Workspace authority and does not impose paid KYC on free signup.

The new regression verifies registrant field mapping and that invalid registrant data does not create a user. Existing company signup tests continue to pass.

# TRANSACTION SAFETY

The signup route validates password and company registrant data before the authoritative user mutation. The user creation/update is awaited. Persistence failure is returned as a safe temporary-unavailable response, and no session is created on failure. Existing duplicate-email request protection and canonical email identity rules remain active.

OTP verification remains one-time and is not reusable after successful signup/login/reset verification.

# CHANGED FILES

- `apps/api/src/server.js`
- `apps/web/auth.js`
- `tests/auth-signup-security.test.js`
- this Report 143

No accounting file, accounting test, Android file, WordPress file, migration, or unrelated artifact was changed.

# FOCUSED TESTS

New focused suite:

```text
node --test --test-isolation=none --test-concurrency=1 tests/auth-signup-security.test.js
```

Result: **4 passed, 0 failed**.

Coverage includes production OTP redaction, no application autofill, resend invalidation, bounded attempts, one-time behavior, company registrant mapping, and no partial account on invalid registrant data.

# REGRESSIONS

Authentication/API regression command:

```text
node --test --test-isolation=none --test-concurrency=1 \
  tests/auth-signup-security.test.js tests/api.test.js
```

Result: **174 passed, 0 failed**.

# LINT

`npm run lint` — **PASS**.

# BUILD

`npm run build` — **PASS**.

# POSTGRESQL VERIFICATION

`npm run db:verify-state` — **PASS**; PostgreSQL state round-trip verified.

The signup-focused correction introduced no schema or migration change. Report verification was not rerun because this isolated auth correction did not alter accounting/reporting state or report definitions.

# PRODUCTION DEPLOYMENT REQUIREMENTS

The correction requires:

- Web deployment for `apps/web/auth.js`.
- API deployment for `apps/api/src/server.js`.
- Normal production configuration for the selected Supabase or app-SMTP OTP provider.
- No database migration.

Do not expose development OTP responses in production. Confirm `NODE_ENV` or `EAZINVOICE_ENV` is set to a production value, and verify deployment logs do not contain OTP values.

# OUTSTANDING VERIFICATION

- Capture the affected production browser Network trace to identify whether `/auth/email-otp/request` or `/auth/signup` fails and its status/response.
- Inspect secured production API logs for the registration failure code without recording OTPs, passwords, or tokens.
- Verify the deployed web bundle no longer assigns `response.devOtp`.
- Verify real email delivery, expiry, resend, and browser autofill behavior in production.
- Verify production CORS/HTTPS/proxy configuration if the request still cannot reach the API.

# ACCOUNTING FILES PRESERVED

The uncommitted Phase 3.64 files were preserved exactly and were not edited:

- `apps/api/src/store.js`
- `apps/api/src/accounting-service.js`
- `tests/provider-settlement-accounting.test.js`
- `tests/provider-tax-document.test.js`

The pre-existing `android/app/build.gradle` modification and unrelated untracked artifacts were also preserved.

# REPORT

Report 143 — AUTH-SIGNUP-01 Company Registration Failure and OTP Security Correction.

# FINAL VERDICT

**READY FOR INDEPENDENT AUTH ACCEPTANCE**

The repository-level OTP disclosure/autofill defect and misleading network-error handling are corrected and regression-tested. Production root-cause verification remains outstanding until the deployed request trace and secured logs identify the actual failing request, so this is not a production deployment approval.
