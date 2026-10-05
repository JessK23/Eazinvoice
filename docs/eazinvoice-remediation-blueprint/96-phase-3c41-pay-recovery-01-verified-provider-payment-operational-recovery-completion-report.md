# PHASE 3C.41 — PAY-RECOVERY-01 VERIFIED PROVIDER PAYMENT OPERATIONAL RECOVERY COMPLETION REPORT

## PHASE

Phase 3C.41 / PAY-RECOVERY-01 — Verified Provider Payment Operational Recovery.

## BASELINE

Implementation baseline: `b03772ea2f0fa3b2640703e0c6bcdc247da0e8d1` (`HEAD == origin/main` before this package).

Report 95 remains unchanged. No files were staged, committed, or pushed.

## IMPLEMENTATION SUMMARY

Implemented a durable provider-event recovery inbox around the existing payment authorities. The inbox records operational evidence and retry state; it does not create a second Payment, allocation, accounting, settlement, or Banking authority.

The webhook recovery path verifies provider evidence, claims one event under a lease, invokes the existing `completeVerifiedProviderPaymentAtomic` authority, and only then marks the operational event completed. A failure to mark completion after PAY-ATOMIC has committed remains retryable and converges through the existing provider identity and atomic-completion idempotency rules.

## PROVIDER EVENT INBOX

Added tenant-scoped `providerRecoveryEvents` records with received, verification, processing, attempt, lease, error, and completion metadata. Safe projections omit raw bodies and signatures.

## EVENT IDENTITY

Provider event IDs are idempotent within provider/business lineage. Fallback identity includes provider, scope, event type, payment/order lineage, and payload hash. Conflicting immutable payload or lineage reuse is rejected.

## RAW EVIDENCE

The exact raw webhook body and signature are retained in the authoritative state for later verification/recovery, but are not returned by normal API/list projections.

## VERIFICATION AUTHORITY

Existing PaymentRequest provider-evidence resolution and existing Razorpay raw-body signature verification remain authoritative. The inbox does not infer authenticity from a browser callback or from an unverified event.

## RECOVERY LIFECYCLE

Supported operational states are `received`, `verified_pending`, `processing`, `completed`, `retryable_failure`, `terminal_failure`, and `manual_review`. Invalid JSON/signatures and non-captured evidence fail closed; lineage conflicts and missing PaymentRequest evidence go to manual review.

## CLAIM / LEASE AUTHORITY

Claiming uses the existing persistence mutation boundary and a persisted lease/worker identity. It is not protected by a process-local mutex. A second worker sees the active lease as busy; an expired lease can be reclaimed.

## WEBHOOK INTEGRATION

Razorpay webhook delivery is durably ingested before recovery processing when PaymentRequest evidence is present or resolvable. Completed replays return success without repeating financial effects. Non-completed events return an accepted/recovery status where appropriate.

## PAY-ATOMIC INTEGRATION

Recovery calls the existing `completeVerifiedProviderPaymentAtomic` method. No financial mutation logic was copied into the inbox or server recovery worker.

## RETRY AUTHORITY

Retryable financial-processing failures retain the event and schedule a future retry. Operator retries use the same recovery worker and cannot directly declare a Payment, allocation, or completion.

## OPERATOR RECOVERY

Configured administrators can list safe recovery projections and request retry for retryable/manual-review events. Raw secrets and evidence are not exposed by these routes.

## SYSTEM RECOVERY

The server scheduler scans verified-pending, due retryable, and lease-expired processing events and invokes the same recovery worker. Scheduler activity is de-duplicated per pass and does not create a second authority.

## FAILURE CLASSIFICATION

Invalid signature is terminal. Missing or conflicting PaymentRequest lineage is manual review. Incomplete/non-captured evidence is terminal. PAY-ATOMIC processing failure is retryable. Provider event identity conflicts are rejected during ingestion.

## CRASH RECOVERY

Covered explicitly: PAY-ATOMIC commits Payment/accounting/allocation state, then inbox completion persistence fails. The event remains recoverable; after lease expiry, retry discovers the already-applied provider Payment through the existing identity/idempotency authority and converges to one completed inbox event with one Payment and one allocation.

## PROVIDER RETRY

Duplicate webhook delivery and duplicate provider evidence do not create another Payment, accounting journal, allocation, or invoice effect. A genuinely different provider Payment remains distinct and is handled by the existing PAY-ATOMIC overpayment/Customer Advance rules.

## CONCURRENCY

The recovery claim boundary is persisted and lease-based. The focused lease test proves one active worker claim. Live multi-process PostgreSQL recovery concurrency was not available in this environment; the existing PostgreSQL transaction/CAS authority is reused rather than replaced.

## STALE PAYMENTREQUEST

Recovery resolves provider lineage through the existing PaymentRequest/Invoice/Business authorities. It does not make an expired or completed request reusable and does not create a replacement request.

## LATE PAYMENT

Captured evidence remains recoverable after a request becomes stale, subject to existing PAY-ATOMIC rules. The recovery inbox does not discard captured money merely because operational processing was delayed.

## CREDIT NOTE AFTER ORDER

The recovery path delegates current receivable capacity and overpayment handling to PAY-ATOMIC and the canonical credit-adjusted outstanding authority. It does not trust the historical provider Order amount as a new receivable authority.

## ZERO A/R

Recovery preserves verified captured money when current A/R is zero; PAY-ATOMIC retains the unapplied/customer-advance remainder.

## OVERPAYMENT

No overpayment logic was duplicated. Existing Customer Advance and allocation rules remain responsible for the unallocated captured amount.

## SECOND GENUINE PAYMENT

Provider identity is payment-specific. A second genuine captured Payment is not collapsed into a webhook replay and remains subject to the existing second-payment/overpayment behavior.

## SECURITY

Webhook signatures are checked against the exact retained raw body and business merchant webhook secret. Public/admin projections omit raw bodies and signatures. Tenant/business lineage is required for recovery and cross-business conflicts fail closed.

## ACCOUNTING

No new journal authority was added. Financial accounting continues through PAY-ATOMIC and the existing receipt-first Customer Advance authority.

## PERSISTENCE

`providerRecoveryEvents` is integrated into the existing authoritative state document, normalized PostgreSQL state collection, and counter conventions. This deliberately avoids a second persistence authority or an uncoordinated standalone recovery database.

## FILES CHANGED

- `apps/api/src/store.js`
- `apps/api/src/postgres-state.js`
- `apps/api/src/index.js`
- `apps/api/src/server.js`
- `tests/provider-payment-recovery.test.js`
- `docs/eazinvoice-remediation-blueprint/96-phase-3c41-pay-recovery-01-verified-provider-payment-operational-recovery-completion-report.md`

## FOCUSED TESTS

Recovery and adjacent payment suites passed **80/80** in serial/no-isolation mode, including inbox idempotency/redaction, invalid signature, successful PAY-ATOMIC recovery, lease contention, duplicate delivery, and the crash-window convergence test.

## REGRESSIONS

The complete repository suite passed **444**, skipped **1**, with **1 environmental failure** in the pre-existing PostgreSQL document-registry test because `db.example.com` could not resolve. No recovery test failed.

## LINT

`npm run lint` passed.

## BUILD

`npm run build` passed.

## POSTGRESQL REPORT VERIFICATION

`npm run db:verify-state` passed against the configured local PostgreSQL state verification path and reported `providerRecoveryEvents` as a recognized state collection. The live document-registry test could not resolve its configured `db.example.com` host.

## DIFF CHECK

Working-tree `git diff --check` and empty-index `git diff --cached --check` passed. The index remains empty.

## LIVE RAZORPAY

Not run. Focused tests use deterministic local provider evidence and the configured test webhook secret.

## LIVE POSTGRESQL

Not fully verified for multi-process recovery concurrency in this environment. The structural implementation uses the existing PostgreSQL persistence/CAS and transaction boundary; live concurrency remains an acceptance-environment check.

## ENVIRONMENTAL LIMITATIONS

The default Node test runner attempted worker processes and hit Windows sandbox `spawn EPERM`; serial `--test-isolation=none` execution was used. One full-suite PostgreSQL test requires unavailable DNS host `db.example.com`.

## BLOCKERS CLOSED

- No second financial authority was introduced.
- Recovery is idempotent across duplicate event/payment delivery.
- Provider authenticity remains server-side and business-scoped.
- PAY-ATOMIC remains the only financial completion authority.
- The PAY-ATOMIC-committed/inbox-update-failed crash window is covered and converges on retry.

## REMAINING BLOCKERS

Live multi-process PostgreSQL recovery concurrency and live Razorpay behavior remain unverified. These are acceptance-environment verification items, not a discovered local structural defect.

## CANDIDATE COMMIT BOUNDARY

The six files listed above form the candidate 3C.41 implementation/report boundary. No approval to stage or commit is implied by this report.

## STAGING / COMMIT / PUSH

Not performed by this implementation package. The pre-existing `android/app/build.gradle` modification and unrelated/untracked workspace artifacts remain outside the candidate boundary.

## FINAL VERDICT

**PHASE 3C.41 — IMPLEMENTATION COMPLETE — READY FOR INDEPENDENT FINAL ACCEPTANCE**

The implementation is complete and the focused/serial evidence supports an independent acceptance gate. Do not stage, commit, or push until that read-only gate independently verifies the six-file boundary and the recovery crash-window behavior.
