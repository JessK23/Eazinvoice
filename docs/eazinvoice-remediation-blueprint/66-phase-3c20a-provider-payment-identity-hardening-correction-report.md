# PHASE 3C.20A — PAY-IDEM-01A

## Provider Payment Identity Hardening Correction Report

### Baseline

- Branch: `main`
- `HEAD == origin/main == 060411a6376f4137e8784e1f7577b5b9120331de`
- PAY-IDEM-01 remained uncommitted.
- No staging, commit, push, reset, restore, stash, cleanup, Android change, or unrelated artifact change was performed.

### Original acceptance failure

The independent 3C.20 acceptance rejected PAY-IDEM-01 for two material fail-open cases:

1. Provider-shaped partial input could fall through to ordinary Payment creation.
2. Conflicting canonical and legacy provider lineage could be silently interpreted by preferring one field set.

The original candidate was otherwise structurally sound: canonical Payment authority, business/provider/payment identity, provider Order and financial conflict checks, legacy lookup, tenant authorization, AUTH-01 persistence, and the PostgreSQL transaction boundary were preserved.

### Exact corrections

`apps/api/src/store.js` now performs identity validation before Payment creation or existing `idempotencyKey` replay:

- a provider without a provider Payment ID fails closed;
- a provider Payment ID without a provider fails closed;
- an Order ID without a complete provider Payment identity fails closed;
- partial legacy gateway identity fails closed;
- canonical and legacy provider names must reconcile;
- canonical and legacy Payment IDs must match when both are present;
- canonical and legacy Order IDs must match when both are present;
- an existing non-provider Payment cannot be replayed by a provider-shaped request with the same idempotency key;
- corrupt historical canonical/legacy conflicts fail closed rather than being selected or rewritten.

Genuine manual Payments with no provider/gateway identity fields remain unchanged. Matching canonical and legacy Razorpay lineage remains readable and replay-safe.

### Identity and compatibility contract

The identity remains:

```text
businessId + normalized provider + trimmed providerPaymentId
```

Provider names are trimmed and lower-cased. Provider Payment and Order IDs are trimmed but otherwise preserved. Historical gateway-only records remain discoverable when their lineage is complete and consistent. No destructive migration or second financial store was introduced.

### Caller sweep

The repository-wide sweep found only two production Payment creation sites: canonical customer Invoice Payment creation and Vendor Bill Payment creation. `recordGatewayPayment` routes through `recordInvoicePayment`; the API facade and Invoice HTTP routes preserve workspace authorization before Store mutation. Vendor Bill Payments remain a separate manual/AP path and do not receive customer-provider identity semantics. Refunds and reversals do not create original captured Payments.

### Persistence and financial boundaries

The existing AUTH-01 PostgreSQL `mutateState`/advisory-lock boundary remains the authority for external Invoice Payments. No process-local financial lock was added. PAY-IDEM-01A adds no PaymentRequest completion, Allocation, new Invoice semantics, Accounting, Banking, settlement, fee/tax, overpayment, customer-credit, event-receipt, Pay Now, QR, UPI, tier, Mobile, Android, Expense, or Quotation behavior.

### Tests

The focused provider identity suite now has 10 passing tests covering:

- complete replay and canonical fields;
- amount, currency, and Order conflicts;
- business and provider isolation;
- legacy gateway-only discovery;
- manual compatibility;
- all partial identity forms;
- canonical/legacy Payment-ID and Order-ID conflicts;
- conflicting idempotency keys;
- conflicting historical state;
- persistence rejection.

The relevant regression set passed 206/206, including Payment, Invoice, Vendor Bill, Allocation, PaymentRequest, provider intent, credential, AUTH-01, Accounting, and Banking coverage.

### Environmental limitations

Live PostgreSQL concurrency remains unverified. Schema verification remains unavailable because `psql.exe` is not installed. No repository `check:mobile` script exists. The known `db.example.com` fixture DNS failure remains environmental and unrelated.

### Proposed combined commit boundary

- `apps/api/src/store.js`
- `tests/payment-provider-identity.test.js`
- `docs/eazinvoice-remediation-blueprint/65-phase-3c20-external-provider-payment-identity-idempotency-completion-report.md`
- `docs/eazinvoice-remediation-blueprint/66-phase-3c20a-provider-payment-identity-hardening-correction-report.md`

Do not include Android changes, Report 64, Report 58, or unrelated untracked artifacts.

### Next gate recommendation

Do not begin PAY-OVERPAY-01 or PAY-ATOMIC-01 until this combined candidate passes final acceptance. Once accepted, PAY-OVERPAY-01 should be the next architecture gate, followed by PAY-ATOMIC-01. Atomic completion requires a defined authority for second genuine provider Payments, overpayment, late payment, and captured-but-unallocatable money.

### Final verdict

**PHASE 3C.20A — CORRECTION IMPLEMENTED — READY FOR COMBINED FINAL ACCEPTANCE.**

No files were staged, committed, or pushed.
