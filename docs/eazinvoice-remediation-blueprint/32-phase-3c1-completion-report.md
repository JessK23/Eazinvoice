# EAZINVOICE PHASE 3C.1 — 3C-AUTH-01 COMPLETION REPORT

## 1. Baseline

- Branch: `main`
- Starting HEAD: `b0a550623ecfc022031a07082d65c62ad9f107ec`
- `origin/main`: `b0a550623ecfc022031a07082d65c62ad9f107ec`
- Pre-existing tracked change: `android/app/build.gradle`
- Pre-existing untracked artifacts: preserved unchanged

## 2. Files changed

| File | Change | Responsibility |
|---|---|---|
| `apps/api/src/persistence-authority.js` | New | side-effect-free current authority/mode/entity matrix contract |
| `tests/persistence-authority.test.js` | New | focused mode, authority, fallback, target-separation and secret-safety tests |
| `docs/eazinvoice-remediation-blueprint/32-phase-3c1-completion-report.md` | New | implementation evidence and acceptance report |

No existing production module was wired into business routes. This keeps the package boundary atomic and prevents accidental behavior changes.

## 3. Authority contract

The new module exports `describePersistenceAuthority(options, env)`. It derives the existing storage mode through `resolveStorageMode`, interprets dual-write/core-sync/report/entitlement flags, separates current active authority from target authority, and returns structural diagnostics without connecting to PostgreSQL or changing state.

Supported current modes include memory, runtime JSON, runtime + Postgres dual-write, Postgres-selected, and mixed transitional. Entity entries expose current mode, read authority, write authority, mirror, fallback policy, target authority and cutover state.

`targetAuthority: "postgres"` is descriptive only. It cannot change current read/write authority.

## 4. Entity authority matrix

The contract classifies users/memberships/roles, business/profile, customers, vendors, invoices, PO/WO, payments/receipts, subscriptions, entitlements, KYC, document registry metadata, document binaries, accounting/ledger/posting, reports, banking/reconciliation, compliance/tax, team/approvals/API keys and audit/notifications.

Runtime state families follow the active storage mode. Reports and entitlements follow their existing independent source flags: report reads are fail-closed when PostgreSQL reporting is selected, while entitlement reads retain their existing runtime fallback. Binary documents remain storage-adapter authority; DocumentService/registry semantics were not changed.

## 5. Configuration interpretation

- `EAZINVOICE_STORAGE`: interpreted through existing `resolveStorageMode`; no default changed.
- `EAZINVOICE_POSTGRES_DUAL_WRITE`: runtime remains primary; Postgres state document is a mirror.
- `EAZINVOICE_CORE_TABLE_SYNC`: normalized Postgres core tables are a projection unless Postgres storage is selected.
- `EAZINVOICE_REPORTS_SOURCE`: runtime/json values select runtime; `postgres` selects Postgres reads; unspecified behavior mirrors existing server logic when Postgres is configured.
- `EAZINVOICE_ENTITLEMENTS_SOURCE`: `postgres` selects Postgres entitlement reads; writes/activation remain runtime authority as existing code documents.
- `DATABASE_URL`: configuration presence only; it is never included in diagnostics.

## 6. Compatibility

Runtime compatibility remains. Existing configured dual-write behavior remains. No migration, backfill, source switch, legacy retirement, environment change, or Render change occurred. Target PostgreSQL is never treated as active merely because it is the target.

## 7. Diagnostics

Diagnostics are available through the pure `describePersistenceAuthority` function for tests and later controlled integration. They expose mode, source roles, mirror roles, fallback, target and verification state. They do not expose URLs, passwords, tokens, customer data, KYC content, or raw financial records.

## 8. PostgreSQL verification

Static authority tests were added and run. The available local verification results are:

- `npm run db:verify-state` — PASS; state round-trip verified against local PostgreSQL.
- `npm run db:verify-core` — PASS; normalized core counts matched runtime state.
- `npm run db:verify-reports` — PASS; report totals matched normalized invoices, payments, PO/WO and profit tables.
- `npm run db:verify-entitlements` — PASS; 38 users and 2 subscriptions matched entitlement reads.
- `npm run db:verify-schema` — UNAVAILABLE; repository script could not find `psql.exe`.
- Full regression Postgres document-registry test — UNAVAILABLE/FAIL due to the existing test environment resolving `db.example.com` (`ENOTFOUND`), not an assertion failure.

**RUNTIME VERIFICATION OUTSTANDING** — schema CLI verification, document-registry connectivity under the test environment, and any deployed-target verification remain unproven. No fabricated full PostgreSQL pass is claimed.

## 9. Regression validation

Executed validation:

- `node --test --test-isolation=none tests/persistence-authority.test.js` — PASS, 7/7.
- `npm run lint` — PASS.
- `npm run build` — PASS.
- `npm run mobile:check` — PASS, 8/8 mobile parity checks.
- `node --test --test-isolation=none tests/*.test.js` — 289 passed, 1 unavailable/failed Postgres document-registry test because `db.example.com` could not resolve.
- `git diff --check` — PASS.

The standard `npm test` command is affected by the Windows sandbox's worker `spawn EPERM`; the same suite was executed successfully with Node's test isolation disabled, with the single external Postgres failure recorded above.

## 10. Protected authorities

Tenant/business access, accounting/posting, KYC/reviewer status, DocumentService/registry, Razorpay/payment activation, entitlement gates, invoice/PO/WO lifecycle and server-side numbering were not modified.

## 11. Stop-condition review

No implementation stop condition was encountered because the module is isolated and not wired into routes. Any future attempt to alter source selection, add a migration, modify financial semantics, touch client code, or expose a materially changed public API must stop and split into a new package.

## 12. Git state

The pre-existing Android modification and untracked artifacts remain. New package files are unstaged. No commit or push occurred.

## 13. Acceptance checklist

1. YES — centralized authority contract exists.
2. YES — major persisted entity families are classified.
3. YES — active mode is deterministic from existing configuration.
4. YES — read authority is explicit.
5. YES — write authority is explicit.
6. YES — mirror/projection role is explicit.
7. YES — fallback policy is explicit.
8. YES — current and target authority are separate.
9. YES — PostgreSQL is target without cutover.
10. YES — runtime compatibility remains.
11. YES — configured dual-write behavior is represented, not changed.
12. YES — report-source semantics are represented without changing server behavior.
13. YES — entitlement-source semantics are represented without changing server behavior.
14. YES — DocumentService/registry unchanged.
15. YES — KYC unchanged.
16. YES — payment/Razorpay unchanged.
17. YES — accounting/posting unchanged.
18. YES — invoice/PO/WO lifecycle unchanged.
19. YES — numbering unchanged.
20. YES — tenant/business isolation unchanged.
21. YES — no migration.
22. YES — no backfill.
23. YES — no production source switch.
24. YES — no Web/Mobile/Eazy changes.
25. YES — diagnostics exclude secrets.
26. YES — focused authority tests added.
27. UNVERIFIED — schema CLI and deployed PostgreSQL verification remain outstanding.
28. UNVERIFIED — one Postgres document-registry regression requires a valid test database hostname; the remaining 289 tests passed.
29. YES — `git diff --check` is clean for tracked changes.
30. YES — only package-scoped files were added.

## 14. Final verdict

**PHASE 3C.1 — VERIFIED WITH RUNTIME ITEMS OUTSTANDING**

