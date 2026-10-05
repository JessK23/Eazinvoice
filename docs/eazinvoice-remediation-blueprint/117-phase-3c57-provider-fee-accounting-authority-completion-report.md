# Phase 3C.57 â€” ACCT-PROVIDER-FEE-01 Provider Fee Accounting Authority

**Mode:** Implementation complete; ready for independent final acceptance
**Baseline:** `c4f12ea43af438deebdf0ef429000383d1786277`
**Scope:** Provider-neutral fee-account authority only. No settlement posting.

## Implementation

The canonical chart now defines:

```text
5300 â€” Payment Provider Fees
role: provider_fee_expense
type: expense
normal balance: debit
```

The role is provider-neutral and represents payment-provider/gateway processing fees. It does not represent generic operating expense, bank charges, GST, TDS, refunds, chargebacks, penalties, adjustments, or FX costs. Razorpay is not embedded in the accounting semantic.

`5300` is a deterministic canonical code after the existing expense range; `5100` remains generic Operating Expense and is not reused. The semantic role remains the authoritative contract; future settlement posting must resolve the role rather than search by account name.

## Bootstrap and resolution

Existing shared accounting bootstrap creates/resolves exactly one `provider_fee_expense` account per business. Repeated resolution returns the same account identity and creates no duplicate or journal. The new resolver is available through the authoritative store and authenticated API boundary as `getProviderFeeAccountAuthority`.

The resolver returns `canonical` only when exactly one active tenant-owned account has role `provider_fee_expense`, type `expense`, and debit normal balance. Missing, duplicate, deleted, incompatible, or otherwise ambiguous candidates return `manual_review` semantics and no account is selected.

Name-only accounts such as â€œRazorpay Chargesâ€, â€œGateway Feesâ€, or â€œPayment Processing Feesâ€ are not inferred as canonical. Generic `5100` is never silently reused.

## Existing businesses and migration

Existing businesses receive the canonical account prospectively through the shared chart/bootstrap path. Existing similarly named accounts are preserved and are not reclassified by name. Existing account IDs and posted journal lines remain unchanged. Migration 025â€™s chart fingerprint incorporates the new canonical role through the existing accounting-authority model; no separate competing chart or historical rewrite was introduced.

No closed period or opening balance is changed. The account authority itself has zero economic effect before a future settlement journal exists.

## Manual review and tenant isolation

Duplicate provider-fee roles, wrong type/normal balance, deleted/inactive mappings, missing business context, and cross-tenant candidates fail closed. Each business resolves only its own account and receives a distinct account identity. No client field can declare the semantic role, account type, normal balance, or migration completion.

## PostgreSQL and concurrency

The role is included in the shared canonical chart consumed by PostgreSQL accounting bootstrap/migration and the existing `ledgerAccounts` state collection. No new settlement persistence authority was introduced. Runtime state reconstruction and repeated bootstrap are deterministic. Live PostgreSQL execution and cross-process bootstrap remain outstanding runtime verification items; the implementation does not claim them as live-tested.

## Accounting boundaries

This package does not create journals, move value from `1110`, post actual bank value, recognize GST, classify TDS, post adjustments, alter Payment/Allocation/Customer Advance/A/R, or change refunds/reversals. ProviderSettlement remains `accountingStatus: not_posted` and accounting-inert. PAY-ATOMIC remains unchanged.

Reporting sees zero economic change because only an unused account authority is added; future settlement posting will be responsible for fee expense effects.

## Files changed

- `apps/api/src/accounting-chart.js`
- `apps/api/src/accounting-service.js`
- `apps/api/src/store.js`
- `apps/api/src/index.js`
- `tests/provider-fee-accounting-authority.test.js`
- this report

Report 116, Android changes, temporary files, and unrelated artifacts were not modified.

## Tests and remaining blockers

Focused tests cover canonical role/type/normal balance, deterministic bootstrap, generic non-reuse, duplicate and incompatible manual review, tenant isolation, historical-journal immutability, and zero journal impact. Relevant accounting, migration, settlement, evidence, Payment, PAY-ATOMIC, refund/reversal, Banking, and reporting regressions are required at acceptance.

Remaining blockers for `PAY-SETTLE-01B` are independent of this package: settlement journal transaction/idempotency, provider tax-document/GST authority, typed adjustment policy, withholding policy, and live PostgreSQL verification.

## Verdict

**A â€” IMPLEMENTATION COMPLETE â€” READY FOR INDEPENDENT FINAL ACCEPTANCE**
