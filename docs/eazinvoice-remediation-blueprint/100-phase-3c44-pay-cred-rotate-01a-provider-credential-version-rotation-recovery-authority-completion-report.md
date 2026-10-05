# PHASE 3C.44 — PAY-CRED-ROTATE-01A
## Provider Credential-Version / Rotation Recovery Authority — Completion Report

**Mode:** implementation package; no staging, commit, or push performed  
**Baseline:** `13f8f056c053b5369c472f664881e93d69db2db1`  
**Scope:** business Razorpay credential lineage and recovery verification only

## Result

**PHASE 3C.44V — VERIFICATION COMPLETE — READY FOR INDEPENDENT FINAL ACCEPTANCE**

The implementation adds a versioned business-provider credential authority without changing PAY-ATOMIC, Payment Allocation, Customer Advance, Accounting, Banking, Settlement, or Pay Now financial behavior.

## Implemented boundary

- Added persisted `providerCredentialVersions` state with PostgreSQL collection/counter support.
- Business Razorpay settings create an initial active credential version and create a new active version on material credential rotation; the previous version becomes `retired`.
- Credential versions are scoped by provider, business, workspace/company, merchant account, and mode.
- Retired versions remain resolvable for historical verification but are rejected for new provider-Order binding.
- Revoked versions fail closed for unverified recovery evidence.
- Public/operator credential-version views redact key and webhook secrets while retaining configured-state flags.
- PaymentRequest provider-intent projections and binding carry `credentialVersionId`.
- Provider recovery events carry immutable credential lineage and a non-secret verification proof containing provider/business/version/payload-hash/signature-fingerprint evidence.
- Recovery verification resolves the version recorded by the PaymentRequest provider intent, so rotation cannot force historical evidence through the current secret. A valid proof permits later recovery retries without re-reading the current webhook secret.
- Webhook ingestion deliberately does not stamp the current credential version when only a PaymentRequest hint is available; processing resolves the persisted provider-intent lineage first.

## Verification performed

- `node --check apps/api/src/store.js`
- `node --check apps/api/src/index.js`
- `node --check apps/api/src/server.js`
- Direct smoke verification passed for initial version creation, rotation, retirement, redacted projection, and historical credential resolution.
- Added focused coverage for credential rotation, immutable verification proof after rotation, revoked-version recovery blocking, redaction, and active-version Order-binding behavior.
- The first serial execution exposed and closed one real boundary defect: a retired active version could mask an explicit blank/revoked current credential. Current-version selection now requires complete current credentials; historical version lookup remains available when an explicit historical version ID is supplied.
- Recovery runner command: `node --test-isolation=none --test-concurrency=1 --test tests/business-razorpay-credentials.test.js tests/provider-payment-recovery.test.js`
- Focused result: **16 passed, 0 failed**.

The default isolated `node --test` invocation remains unavailable in this Windows environment because Node fails to spawn its test worker with `EPERM` before test code runs. The no-isolation serial runner executed the intended test code successfully. Live PostgreSQL verification remains for the independent acceptance gate.

## Explicit non-scope

No PAY-ATOMIC, accounting, allocation, Customer Advance, Banking, Settlement, Razorpay payment-capture, or customer-facing Pay Now implementation was changed.

## Candidate implementation files

- `apps/api/src/store.js`
- `apps/api/src/postgres-state.js`
- `apps/api/src/index.js`
- `apps/api/src/server.js`
- `tests/business-razorpay-credentials.test.js`
- `tests/provider-payment-recovery.test.js`
- this completion report

Report 98 and Report 99 were not modified, staged, or committed.
