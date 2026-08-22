# Business Tier Hardening Audit

Status date: 2026-08-22

Purpose: record the current Business-tier security posture before EazInvoice is sold to real users.

## Scope Checked

- Business workspace ownership and team membership.
- Owner/admin/accountant/viewer role boundaries.
- API key creation, listing, revocation, hashing, and one-time secret display.
- Business SMTP settings, validation, delivery status, and delivery history.
- Business Razorpay gateway settings.
- Approval workflow access.
- Business audit events and metadata redaction.
- Cross-tenant access attempts through direct ids, `workspaceOwnerUserId`, and `businessId`.
- WordPress API-key connection validation.

## Evidence From Current Tests

The direct API test run on 2026-08-22 passed 138/138 tests using:

```powershell
node tests\api.test.js
```

Relevant passing coverage includes:

- `business tier unlocks team approvals and API keys`
- `api keys are hashed at rest and plaintext keys migrate safely`
- `business workspace endpoints honor plan preview and gating`
- `business notification retry sends emails and records audit outcomes`
- `admin business notification automation sends due notices once per day`
- `business workspace invite routes enforce owner accountant and viewer permissions`
- `security hardening blocks public uploads and cross-user business records`
- `P0-2 tenant isolation protects business membership resources and direct IDs`
- `P0-2A canonical business identity survives multi-business use and ownership transfer`
- `wordpress connection validates active api keys and blocks mismatched accounts`
- `production access audit requires authentication for sensitive api routes`
- `api key creation audit events contain only safe key metadata`

## Current Findings

### Role Controls

Status: implemented with test coverage.

- Sub-users can only be assigned Accountant or Viewer roles.
- Owner/admin style roles are rejected for sub-users.
- Existing admin email addresses cannot be added as Accountant or Viewer sub-users.
- Duplicate active sub-user access is rejected.
- Viewer access can read permitted records and reports but is blocked from mutation workflows.
- Accountant access can perform allowed shared workspace workflows.
- Unrelated users are blocked from workspace reads and writes.

### API Key Safety

Status: implemented with test coverage.

- New API keys are generated with a one-time plaintext token.
- Stored API keys are HMAC hashed.
- Listed API keys do not return the plaintext token or token hash.
- Legacy plaintext API keys migrate to hashed records.
- API key audit metadata uses safe key metadata.

Remaining production consideration:

- `API_KEY_HASH_SECRET` rotation is not versioned yet. Rotating it invalidates existing API keys until a versioned hash-secret strategy is implemented.

### SMTP And Gateway Secrets

Status: implemented with test coverage.

- Business SMTP passwords are hidden after save.
- Razorpay key secret and webhook secret are hidden after save.
- Configured flags are exposed instead of secret values.
- Audit and delivery metadata are tested to avoid raw SMTP passwords, key secrets, and webhook secrets.
- Failed/not-configured delivery states are visible without leaking secrets.

Remaining production consideration:

- Real provider failures should be tested against staging SMTP and Razorpay credentials before public rollout.

### Tenant Isolation

Status: implemented with test coverage.

- Direct cross-user record reads are blocked.
- Cross-workspace reads/writes using another owner id are blocked.
- Cross-business API key and WordPress connection misuse is blocked.
- Canonical business identity and ownership transfer are covered.

Remaining production consideration:

- Postgres RLS validation must be rerun against a valid staging/disposable `DATABASE_URL`; the local `.env` database credentials currently fail authentication.

## Remaining Before Selling

1. Run full Postgres validation with a valid staging/disposable database:
   - `npm run db:verify-schema`
   - `npm run db:validate-p21c`
   - `npm run audit:subscriptions` without `SKIP_POSTGRES_ENTITLEMENT_VERIFY=true`

2. Test Business SMTP with a real controlled mailbox:
   - Validate settings.
   - Send a test email.
   - Confirm delivery history and audit metadata remain sanitized.

3. Test Business Razorpay gateway settings with controlled test/live credentials:
   - Save gateway settings.
   - Confirm status.
   - Confirm secrets remain hidden.
   - Confirm failed configuration messages are safe.

4. Review production logs after a staging smoke:
   - No SMTP password.
   - No Razorpay key secret.
   - No webhook secret.
   - No API key token or hash.
   - No OTP or auth secret.

## Closure Position

Business tier is structurally strong in the codebase and tests. It should not be considered fully production-hardened for paid users until database validation, real SMTP provider behavior, Razorpay settings behavior, and production log review are completed in a staging or production-like environment.
