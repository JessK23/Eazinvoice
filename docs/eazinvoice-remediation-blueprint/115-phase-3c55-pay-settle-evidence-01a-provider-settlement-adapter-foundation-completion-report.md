# Phase 3C.55 — PAY-SETTLE-EVIDENCE-01A
## Razorpay Provider Settlement Adapter Foundation Completion Report

**Mode:** Implementation complete; ready for independent final acceptance  
**Baseline:** `49f80b98def61a533084b923c056ba39dd771a44`  
**Scope:** Evidence/provenance/lifecycle only. No settlement accounting, 1110 movement, bank posting, or Banking reconciliation.

## IMPLEMENTED PROVIDER EVIDENCE AUTHORITY

The existing `ProviderSettlement` model was extended rather than replaced. New evidence fields include:

- normalized provenance and adapter version;
- source/reference/record identity and payload hash;
- observation/verification timestamps and credential-version reference;
- normalized tax-component evidence;
- typed adjustment evidence;
- withholding evidence retained as unresolved;
- evidence validation reasons;
- evidence lifecycle and deterministic accounting-readiness result;
- immutable fingerprint coverage for provenance, tax, adjustments, withholding, and destination.

The adapter remains provider-neutral while accepting Razorpay report/API/webhook/import provenance. It does not pretend that an undocumented standard Razorpay settlement API exists.

## PROVENANCE

Evidence records retain provider, source type, source reference/record ID, provider evidence ID, payload hash, adapter version, observed/verified timestamps, and credential-version reference. No provider secrets or raw sensitive payloads are persisted by this package.

## SETTLEMENT IDENTITY

The existing identity remains authoritative:

```text
provider + business/company + merchantAccountId + providerSettlementId
```

Identical evidence replays idempotently. Conflicting economics or provenance produce an immutable fingerprint conflict. No second economic settlement is created for the same identity.

## EVIDENCE LIFECYCLE

The implementation derives:

- `evidence_pending` when required provenance is absent;
- `evidence_verified` when identity/provenance validation succeeds;
- `manual_review` for unknown or contradictory evidence;
- `accountingReadiness: blocked` for all records in this package.

Client input cannot set `evidenceLifecycle`, `accountingReadiness`, or `accountingStatus`. `accountingStatus` remains server-controlled and `not_posted`.

## PAYMENT LINKAGE

Existing authoritative linkage validation is preserved. Linked Payments must exist, belong to the business, be captured, match provider and currency, and remain within captured amount across settlements. No date/amount/customer/Order-proximity heuristic was introduced.

## PROVIDER FEES

Provider fee amount is preserved as evidence when supplied. It is never mapped to generic `5100`, posted to a journal, or treated as accounting-ready without the future governed provider-fee account authority.

## GST / TAX

Optional explicit CGST/SGST/IGST components are normalized and checked against aggregate fee tax. Mixed jurisdictions, negative components, component-total mismatch, and intra-state CGST/SGST mismatch are rejected into manual review/readiness blocking.

Aggregate tax remains evidence only. The implementation does not split it, infer jurisdiction, create Input GST, or mark a settlement accounting-ready.

## TAX DOCUMENT

Provider tax-document references can be retained as provenance/source metadata when supplied. No tax-invoice API is assumed, no invoice ID is synthesized, and no Input GST journal is created.

## ADJUSTMENTS

Typed adjustment components are retained with type, signed amount, currency, provider reference, and source reference. Known types are limited to explicitly supported categories such as rounding, refund, chargeback, dispute, provider correction, reserve/release, incentive, and rebate.

Unknown adjustment types and nonzero opaque aggregate adjustments enter `manual_review`. No adjustment accounting is performed.

## WITHHOLDING / TDS

Withholding evidence is retained if supplied but always receives the unresolved `withholding_contract_unverified` condition. No TDS is inferred, classified, or posted.

## REFUND / CHARGEBACK

The existing refund/reversal authorities remain primary. Provider settlement evidence preserves provider/source references but does not duplicate refund, chargeback, Payment, Customer Advance, A/R, or clearing effects.

## DESTINATION BANK

Destination validation is now bank-only. Cash destinations are rejected. The destination must be an active tenant bank account with an active tenant ledger mapping; missing mappings and 1110/`bank_clearing` destinations are rejected.

This package records/validates destination evidence only. It does not post to the bank.

## CURRENCY

Settlement currency remains required and must match linked captured Payments. No FX authority was added. Unsupported or mismatched currency remains fail-closed.

## ARITHMETIC

Existing settlement arithmetic remains minor-unit validated:

```text
net = gross - provider fee - aggregate tax + adjustment
```

The implementation does not manufacture missing components to balance the equation. Typed tax and adjustments are validated when present, while unresolved semantics continue to block accounting readiness.

## IMMUTABILITY

Provenance, tax, adjustment, withholding, destination, Payment linkage, and economic values participate in the evidence fingerprint. Identical replay is safe; conflicting replay is rejected. No ordinary update path was introduced.

## ACCOUNTING-READY GATE

The pure readiness evaluator requires provenance, valid evidence, destination mapping, tax/adjustment status, and absence of manual-review conditions. Because the provider tax-document/GST authority and settlement accounting authority remain separate, the current adapter deliberately returns `accountingReadiness: blocked` rather than manufacturing accounting-ready fixtures.

## ACCOUNTING INERTNESS

Verified by implementation and tests:

- no Journal/JournalEntry/JournalLine creation;
- no 1110 movement;
- no actual bank balance movement;
- no provider-fee expense posting;
- no Input GST posting;
- no A/R, Customer Advance, Allocation, Invoice, or Payment mutation;
- caller-supplied `posted`/`accounting_ready`/verification values cannot promote the record.

## POSTGRESQL

No new migration was required: `providerSettlements` already participates in the existing state collection/counter and PostgreSQL persistence path, so the new evidence fields persist as part of the existing settlement record. Live migration/reload remains unverified because `psql.exe` is unavailable.

## BACKWARD COMPATIBILITY

Existing aggregate-only ProviderSettlement records remain valid identities and amounts. Missing provenance remains `evidence_pending`; aggregate tax does not become a GST split; opaque adjustments remain blocked. No historical settlement economics are rewritten.

## SECURITY

Provider evidence remains server-authoritative and tenant/merchant scoped. Public/customer projections are not expanded with raw evidence or secrets. Browser/client input cannot forge provider verification, tax classification, readiness, or posting state.

## TESTS

New focused suite: **9/9 passed**. Coverage includes provenance, replay/conflict, tenant/payment linkage, over-linking, currency, bank-only/1110 rejection, tax non-inference, unknown adjustment/withholding manual review, legacy compatibility, ledger inertness, and forged-status rejection.

## REGRESSIONS

Relevant serial regression suite: **132 total, 131 passed, 1 skipped, 0 failed**.

Covered provider settlement, Payment, PaymentRequest, PAY-ATOMIC, recovery, credential rotation, accounting, accounting migration, refunds/reversals, Banking exposure, and reporting.

## LINT / BUILD / DATABASE VERIFICATION

- `npm run lint`: **PASS**
- `npm run build`: **PASS**
- `npm run db:verify-state`: **PASS**
- `npm run db:verify-reports`: **PASS**
- `git diff --check`: **PASS**; only expected CRLF warnings for existing Windows working-tree files.

## LIVE RAZORPAY

Not run. No provider credentials or live provider mutation was used. Unsupported standard merchant settlement API, tax-invoice API, UTR, and typed adjustment capabilities remain unverified as required by Report 114.

## LIVE POSTGRESQL

Migration 025 remains unverified because `psql.exe` is unavailable. This is environmental and no production code was changed to bypass it.

## SCOPE LEAKAGE

No settlement journal, 1110 movement, bank posting, provider-fee/GST journal, Banking reconciliation, PAY-ATOMIC, Payment, Allocation, Customer Advance, Invoice, refund/reversal redesign, QR/UPI, notification, Android/mobile, Expense, Quotation, Eazy, or tier work was added.

## FILES CHANGED

- `apps/api/src/store.js`
- `apps/api/src/index.js`
- `tests/provider-settlement-evidence.test.js`
- `docs/eazinvoice-remediation-blueprint/115-phase-3c55-pay-settle-evidence-01a-provider-settlement-adapter-foundation-completion-report.md`

Report 114 was not modified. `android/app/build.gradle` and unrelated/untracked artifacts remain untouched.

## STAGING / COMMIT / PUSH

Nothing was staged, committed, or pushed.

## FINAL VERDICT

**A — PHASE 3C.55 IMPLEMENTATION COMPLETE — READY FOR INDEPENDENT FINAL ACCEPTANCE**

