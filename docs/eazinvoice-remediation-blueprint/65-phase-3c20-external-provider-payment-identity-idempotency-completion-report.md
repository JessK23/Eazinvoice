# PHASE 3C.20 — PAY-IDEM-01

## External Provider Payment Identity / Idempotency Completion Report

### Baseline

- Branch: `main`
- Baseline: `060411a6376f4137e8784e1f7577b5b9120331de`
- `HEAD == origin/main` before implementation.
- No files were staged, committed, pushed, reset, restored, stashed, or cleaned.
- Existing `android/app/build.gradle`, Report 64, Report 58, temporary files, Gradle artifacts, screenshots, plugin archives, and unrelated documentation remain outside this package.

### Discovery and canonical authority

The existing `state.payments` collection, payment counter, `recordInvoicePayment`, Vendor Bill payment path, reversal/refund records, Accounting posting, and Payment Allocation consumers remain the financial authorities. No parallel provider-payment entity or store was introduced. Manual Invoice Payments and Vendor Bill Payments remain on their existing paths.

PAY-IDEM-01 extends canonical customer Payments with optional provider metadata:

- `provider`
- `providerPaymentId`
- `providerOrderId`

Legacy `gateway`, `gatewayPaymentId`, and `gatewayOrderId` are retained for compatibility. New external records carry both the canonical metadata and the legacy fields required by existing readers.

### Identity and normalization

The financial identity is business-scoped:

```text
businessId + normalized provider + trimmed providerPaymentId
```

Provider names are trimmed and lower-cased. Provider payment and order IDs are trimmed but otherwise preserved; their provider-defined identity is not case-folded or rewritten. Manual/cash/bank-transfer-style values do not become external-provider identities.

The identity lookup is internal to Store mutation logic. There is no anonymous provider-ID lookup endpoint and no raw provider-ID-to-Payment public function.

### Replay and conflict behavior

External Invoice Payment creation now uses the existing authoritative `persistenceAdapter.mutateState` boundary when available. Under that boundary, the authoritative state is reloaded, the identity is searched, and creation or replay occurs inside the existing transaction/advisory-lock mechanism.

An exact identity replay returns the existing canonical Payment and does not create another Payment. A replay with a changed amount, currency, provider Order, Invoice binding, or direction fails closed. If historical authoritative state already contains more than one matching identity, the lookup fails closed rather than selecting or merging one record.

The original 3C.20 acceptance found two residual defects: incomplete provider-shaped input could fall through to the ordinary Payment path, and conflicting canonical/legacy provider fields were not explicitly rejected. PAY-IDEM-01A corrects both. Any provider-shaped field now requires a complete, internally consistent provider Payment identity; matching canonical and legacy fields remain compatible, while conflicting Payment IDs, Order IDs, or provider lineage fail closed. Existing idempotency-key replay is checked against provider identity rather than allowed to hide a conflict.

The existing `idempotencyKey` remains a client/request replay identity. It is not replaced or conflated with provider financial identity. Provider event IDs are delivery identities and are not persisted as financial identity in this package; different event IDs carrying the same provider payment therefore converge through `providerPaymentId` when they reach the Payment path. A separate provider-event receipt authority remains deferred because adding it would expand this package beyond Payment identity.

### Tenant, workspace, and legacy behavior

Identity search is scoped by the Invoice's authoritative business. The existing API facade resolves the Invoice and workspace access before invoking Store mutation, so provider identity cannot bypass existing tenant authorization. Same provider/payment IDs in different businesses do not collide.

Historical Payments without the new fields remain readable. Legacy Razorpay Payments are discoverable through the compatibility pair `gateway=razorpay` and `gatewayPaymentId`. No destructive migration is required. Provider identity metadata contains no credentials or secrets.

Payment reversals/refunds remain separate authorities and cannot be interpreted as a second captured Payment by this package. Vendor Bill Payments remain unchanged.

### Financial boundaries

PAY-IDEM-01 does not modify PaymentRequest lifecycle, Payment Allocation semantics, Accounting journal design, Banking/reconciliation, settlement, gateway fees/tax, overpayment/customer-credit behavior, UI, Mobile, Android, tiers, Expense, Quotation, or Eazy. Existing Payment creation may retain its already-existing Invoice balance and Accounting behavior; no new effect was added by the identity authority.

No completion or allocation occurs merely because provider identity is recognized. PAY-REQ-02C remains required for verified-provider Payment → Allocation → Invoice → PaymentRequest completion.

### Tests and validation

Focused new coverage in `tests/payment-provider-identity.test.js` verifies:

- same business/provider/payment ID replay;
- changed amount, currency, and provider Order rejection;
- business and provider isolation;
- legacy gateway-only Payment replay;
- manual Payment compatibility;
- persistence rejection propagation.

Focused regression set: 47 passed, 0 failed, covering the new identity suite plus PaymentRequest, provider-intent, Allocation, Razorpay credential, AUTH-01, and billing-order persistence suites.

Full serial suite: 396 tests, 394 passed, 1 skipped (live PostgreSQL concurrency), and 1 environmental failure. The failure is `tests/postgres-document-registry.test.js`, which cannot resolve the configured fixture host `db.example.com` (`ENOTFOUND`). It is unrelated to PAY-IDEM-01.

`npm run lint`, `npm run build`, `npm run db:verify-reports`, and `git diff --check` passed. `npm run db:verify-schema` could not run because `psql.exe` is unavailable. The repository has no `check:mobile` npm script, so that requested command is unavailable; no Android files were changed.

Live PostgreSQL concurrency execution remains unverified. Structural safety is established by reuse of the existing PostgreSQL `mutateState`/advisory-lock transaction boundary; this report does not overclaim live database evidence.

### Files changed by PAY-IDEM-01

- `apps/api/src/store.js`
- `tests/payment-provider-identity.test.js`
- `docs/eazinvoice-remediation-blueprint/65-phase-3c20-external-provider-payment-identity-idempotency-completion-report.md`

### Proposed commit boundary

Only the three files above belong to the PAY-IDEM-01 candidate boundary. Do not stage or include the pre-existing Android modification, Report 64, Report 58, or unrelated untracked artifacts.

### Reassessment of 3C.19 blockers

1. External provider Payment identity: **closed structurally by PAY-IDEM-01**.
2. Atomic Payment + Allocation + Invoice effect + PaymentRequest completion: **remaining**.
3. Unapplied/overpayment/customer-credit handling: **remaining**.
4. Provider event receipt authority: **remaining/deferred**.
5. PaymentRequest completion contract: **remaining; must be part of the later verified completion design**.

### Proposed next package

After combined final acceptance, `PAY-OVERPAY-01` should be the next architecture gate. Atomic completion must first know how to handle a second genuine provider Payment, overpayment, late payment, or captured-but-unallocatable money. PAY-ATOMIC-01 should follow that decision.

### Final verdict

**PHASE 3C.20A — CORRECTION IMPLEMENTED — READY FOR COMBINED FINAL ACCEPTANCE.**

PAY-IDEM-01 plus PAY-IDEM-01A establishes the requested canonical external provider Payment identity without starting PAY-REQ-02C. The original 3C.20 acceptance did not pass; the two identified defects were corrected surgically. The combined candidate remains unapproved for commit pending a final acceptance gate. No staging, commit, or push was performed.
