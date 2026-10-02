# EazInvoice — Phase 3C.12B / AUTH-01B Completion Report

## Scope

3C.12B repairs the ordinary AUTH-01 mutation completion contract. It does not redesign PostgreSQL persistence, PAY-BASE-03 allocation transactions, Accounting, Banking, or future Payment Request flows.

## Original Defect

Ordinary Store mutations could change local state, call asynchronous `persist()`, return success, and only later receive a PostgreSQL CAS or persistence failure. Payment creation and reversal had already been hardened in 3C.12A; this package extends the same completion boundary to the exported Store mutation surface.

## Mutation Inventory

The affected ordinary mutation families include invoices, purchase/work orders, Vendor Bills, credits, refunds, Banking statements and reconciliation, Accounting state, business/workspace state, access/security state, compliance state, and other AUTH-01 collections. PAY-BASE-03 allocation creation and reversal remain transaction-scoped through `mutateState()`.

## Persistence Completion Contract

The Store now exposes its exported methods through a completion wrapper. If a mutation starts asynchronous persistence, its result resolves only after the tracked AUTH-01 save succeeds. If persistence fails, the caller receives the failure and the existing reload path is attempted. Synchronous in-memory adapters remain synchronous.

The server's JSON response helper also consumes Promise payloads so direct mutation routes do not serialize unresolved Promise objects or report success before completion.

## Reload Failure Safety

If save fails and authoritative reload succeeds, local state is replaced with the authoritative snapshot and the mutation rejects. If reload also fails, AUTH-01 is marked unhealthy. Subsequent persisted writes reject with an explicit unhealthy-authority error instead of silently continuing from rejected local state.

## Representative Coverage

Executable tests cover Invoice, Vendor Bill, Banking statement import, Accounting journal, Sales Credit Note, Payment persistence failure, save-plus-reload failure, no unhandled rejection, and synchronous in-memory compatibility.

## PAY-BASE Preservation

Payment Allocation creation and reversal continue to use the PostgreSQL transaction, advisory lock, primary-state row lock, authoritative reload, validation, idempotency, counter update, projection persistence, and commit/rollback boundary. No allocation semantics or accounting/banking semantics were changed.

## Validation

- AUTH-01B focused tests: pass.
- Existing Payment Allocation and persistence tests: pass.
- Build and lint: pass.
- Full serial suite and live PostgreSQL validation remain required after this package.

## Environmental Limitations

Live multi-connection PostgreSQL execution is not claimed unless an isolated reachable database is supplied. Schema verification also requires an available `psql.exe`.

## Remaining Acceptance Work

The combined 3C.11 + 3C.12 + 3C.12A + 3C.12B acceptance must verify every changed caller, live PostgreSQL concurrency where available, and the complete regression suite before commit.

## 3C.12C Supersession Note

The later combined acceptance found that this report's caller-closure statement was premature. Several older callers still treated now-awaitable mutations as synchronous domain objects: AI-created Invoice/PO drafts and finalization, recurring-invoice scheduler paths, and invoice payment-link creation. AI usage-log writes also remained detached from the operation result. These were integration defects in caller propagation, not defects in the PAY-BASE-03 transaction or AUTH-01 persistence primitive.

3C.12C closes those callers and adds focused executable coverage. This report must therefore be read as the AUTH-01B persistence-contract report, with its prior readiness verdict superseded by the 3C.12C result below.

## Final Verdict

**PHASE 3C.12B — PERSISTENCE CONTRACT VERIFIED; CALLER CLOSURE DEFERRED TO 3C.12C**
