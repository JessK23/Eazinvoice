# EAZINVOICE PHASE 3C.2 — 3C-AUTH-02 COMPLETION REPORT

## 1. Baseline

- Branch: `main`
- Starting HEAD: `5adad4685aada189a07ece929b9a8ebd9bff84d6`
- `origin/main`: `5adad4685aada189a07ece929b9a8ebd9bff84d6`
- Pre-existing tracked modification: `android/app/build.gradle` (preserved)
- Pre-existing untracked artifacts: architecture documents, `.gradle*`, `.tmp*`, screenshots, plugin archives, and tools (preserved and not staged)
- No staged files, commit, or push was made.

## 2. Current-State KYC Trace

- Upload: `POST /kyc/documents` validates the upload, calls `DocumentService.putDocument`, writes `classification: "kyc"`, `relatedEntityType: "company_kyc"`, business scope, checksum and storage metadata, then returns the registry `documentId`.
- Save: `/companies` create/update accepts authoritative `kycDocuments` references, validates registry existence, business binding, KYC classification/relationship and document availability through DocumentService, and derives compatibility `documentNames`/`documentFiles` when registry references exist.
- Admin review: `/admin/kyc-review` and its detail/document routes require `hasKycReviewAuthority`; registry-backed documents are opened through DocumentService. Legacy-only records use the constrained historical resolver. Paths and full Aadhaar are not returned.
- Status: the existing company reviewer state remains `not_submitted`/`pending`/`verified`/`rejected`, with `reviewStatus` mapped to `not_submitted`/`pending`/`approved`/`rejected`. Only the authorized admin review PATCH changes it.
- Paid gate: paid subscription creation, Razorpay order creation, renewal and activation continue to require the existing submitted/verified KYC conditions. Upload and reconciliation do not approve KYC.
- Replacement: each upload creates a new immutable registry `documentId`; the company reference can be replaced while the prior registry record/object remains preserved.
- Legacy path: when no authoritative `kycDocuments` references exist, historical `documentNames`/`documentFiles` are resolved through the sanitized legacy path. Missing files fail safely. A registry-backed failure never enters this legacy branch.

## 3. Authority Conflict

The application contained two representations: registry-backed `company.kycDocuments` references and historical `documentNames`/`documentFiles` plus legacy files. The previous code already preferred registry references, but the distinction was implicit and reconciliation was easy to confuse with retrieval. AUTH-02 makes the classification explicit: registry-backed records are authoritative; legacy-only records are compatibility-only; contradictory or failed registry evidence is reported and fails closed.

Reviewer status remains a separate authority from document identity and integrity.

## 4. Implementation

| File | Responsibility | AUTH-02 reason |
|---|---|---|
| `apps/api/src/kyc-document-authority.js` | Pure KYC reference normalization, compatibility derivation, authority classification and read-only reconciliation | Makes registry-backed versus legacy-only state deterministic without a migration or public API |
| `apps/api/src/document-service.js` | Adds `inspectDocumentForBusiness`, a non-mutating registry/storage/integrity inspection | Reuses DocumentService storage and checksum authority for read-only reconciliation |
| `apps/api/src/server.js` | Uses the shared KYC normalization/derivation helpers; existing upload, validation, review and paid-gate routes remain intact | Centralizes the narrow KYC contract without redesigning server workflows |
| `apps/api/src/persistence-authority.js` | Adds a descriptive `kyc-document-authority` entry | Records DocumentService/registry authority without routing behavior |
| `tests/kyc-document-authority.test.js` | Focused authority, failure, isolation, replacement-compatibility and read-only classification tests | Proves the transition boundary |
| `tests/persistence-authority.test.js` | Verifies the AUTH-01 diagnostic matrix entry | Prevents descriptive drift |
| `docs/eazinvoice-remediation-blueprint/33-phase-3c2-completion-report.md` | Evidence and acceptance record | Required package report |

No migration, dependency, backfill, public reconciliation endpoint, UI change or storage-provider change was added.

## 5. Post-3C.2 KYC Authority Model

| Concern | Current authority | Compatibility source | Fallback | Target |
|---|---|---|---|---|
| KYC documents | Registry-backed DocumentService references | Legacy fields only for legacy-only records | Registry failure fails closed; legacy is not consulted | Registry metadata plus configured storage |
| KYC reviewer status | Existing authorized reviewer/company status fields | None | Existing status semantics | Same reviewer authority |
| KYC binary storage | Existing DocumentService storage adapter | Historical legacy file only when no registry reference exists | Missing/corrupt registry object fails closed | Provider-agnostic configured adapter |
| KYC paid gate | Existing server eligibility and Razorpay checks | None | Pending/rejected remain blocked | Same gate |

## 6. Registry-Backed Behavior

`documentId` is the authoritative identity. The server validates that the registry record belongs to the company business, has `classification: "kyc"` and `relatedEntityType: "company_kyc"`, and can be opened through DocumentService. Missing objects, provider/storage failures and checksum mismatches fail closed. Replacement uploads receive a new immutable ID; the old record is not overwritten.

## 7. Legacy Compatibility

Legacy fields and files remain for historical access and existing client compatibility. They are used only when the company has no authoritative registry references. They cannot override or rescue a registry-backed reference. Legacy-only state is derived from the absence of normalized `kycDocuments` plus legacy evidence; no persisted migration flag is introduced.

## 8. No-Silent-Fallback Proof

`tests/kyc-document-authority.test.js` verifies that registry `missing` and `checksum_mismatch` results classify as `REGISTRY_OBJECT_MISSING` and `REGISTRY_INTEGRITY_FAILURE`, respectively, even when an available legacy file is present. The result never becomes `LEGACY_ONLY_AVAILABLE`.

## 9. Reconciliation

`reconcileKycCompany` is an internal read-only helper. It reports registry reference missing, object missing, integrity failure, business mismatch, classification mismatch, contradictory metadata, legacy-only available/missing and no-documents states. `inspectDocumentForBusiness` uses the existing DocumentService storage/checksum logic without updating registry status, company fields, reviewer status, subscriptions or files. No historical records were migrated or backfilled during this package.

## 10. Reviewer State

Reviewer status authority is unchanged. Document upload, integrity inspection and reconciliation cannot approve or reject KYC. Only the existing authorized review route changes reviewer state.

## 11. Subscription / Payment Gate

Pending and rejected KYC remain blocked by the existing paid-feature/subscription rules. Verified/approved KYC continues to satisfy the existing KYC portion of the gate. Razorpay order, signature verification and activation semantics were not changed.

## 12. Security

Business binding and DocumentService access checks remain enforced. Wrong-business and wrong-classification references fail closed. Admin review authorization remains unchanged. Aadhaar remains last-four-only in review responses, and raw storage/filesystem paths remain suppressed. Registry integrity failures are unavailable rather than served from legacy copies.

## 13. Persistence Authority Contract

AUTH-01 was updated narrowly with a descriptive `kyc-document-authority` entity entry: read/write authority is DocumentService, the registry is the metadata mirror/authority, fallback is `none` for registry-backed records, and legacy-only compatibility is explicit. `persistence-authority.js` remains pure diagnostic code and is not imported as an operational router.

## 14. Tests

- `node --test --test-isolation=none tests/kyc-document-authority.test.js tests/persistence-authority.test.js` — PASS, 14/14.
- `node --test --test-isolation=none` applicable KYC/document/subscription/isolation files — PASS, 214/214.
- Standard focused runner — UNAVAILABLE/ENVIRONMENTAL: Windows `spawn EPERM` before assertions.
- `npm run lint` — PASS.

## 15. Runtime Verification

- `npm run db:verify-reports` — PASS; local PostgreSQL report totals matched.
- `npm run db:verify-schema` — UNAVAILABLE; `psql.exe` was not found.
- PostgreSQL document-registry test — UNAVAILABLE/ENVIRONMENTAL; configured fixture hostname `db.example.com` failed with `ENOTFOUND`.
- No production credentials, deployed Render runtime or Azure runtime was changed or fabricated.

## 16. Regression Validation

- `npm run build` — PASS.
- `npm run lint` — PASS.
- `npm run mobile:check` — PASS, 8/8.
- `node --test --test-isolation=none tests/*.test.js` — 295 passed, 1 environmental PostgreSQL DNS failure.
- `npm test` — UNAVAILABLE/ENVIRONMENTAL; 21 files failed before assertions because Windows test workers returned `spawn EPERM`.
- `npm run db:verify-schema` — UNAVAILABLE because `psql.exe` is absent.
- `git diff --check` — PASS.

## 17. Files Changed

- `apps/api/src/kyc-document-authority.js`
- `apps/api/src/document-service.js`
- `apps/api/src/server.js`
- `apps/api/src/persistence-authority.js`
- `tests/kyc-document-authority.test.js`
- `tests/persistence-authority.test.js`
- `docs/eazinvoice-remediation-blueprint/33-phase-3c2-completion-report.md`

## 18. Protected Areas

Web UI, Mobile UI, Android, accounting, payments/Razorpay, invoice lifecycle, PO/WO lifecycle, numbering, Render settings, Azure settings and storage-provider selection were not changed. DocumentService architecture was preserved; only a narrow non-mutating inspection capability was added. No database migration or schema file was changed.

## 19. Stop-Condition Review

No stop condition occurred. No migration, broad backfill, legacy deletion, reviewer-state change, paid-gate change, DocumentService redesign, provider change, UI redesign, dependency addition or unrelated package implementation was necessary.

## 20. Git State

The pre-existing Android modification and unrelated untracked artifacts remain. AUTH-02 files are unstaged. No staging, commit or push was performed.

## 21. 46 Acceptance Answers

1. YES — new current KYC uploads are registry-backed.
2. YES — `documentId` is authoritative for registry-backed records.
3. YES — DocumentService remains the operation authority.
4. YES — registry metadata outranks legacy metadata for registry-backed records.
5. NO — legacy fields alone do not establish registry-backed authority; they remain compatibility-only.
6. NO — references require existence, business, classification and integrity validation.
7. YES — compatibility fields are derived from registry references where applicable.
8. YES — registry-backed retrieval is registry-first.
9. NO — missing registry objects do not silently fall back to legacy.
10. NO — checksum failures do not silently fall back to legacy.
11. YES — safe historical legacy-only retrieval remains supported.
12. YES — missing historical legacy content fails safely.
13. YES — cross-business document use is blocked.
14. YES — wrong classification is blocked.
15. YES — replacement creates a new immutable `documentId`.
16. YES — old document identity is preserved.
17. NO — upload does not auto-approve KYC.
18. NO — reconciliation does not approve or reject KYC.
19. YES — reviewer authority is unchanged.
20. YES — KYC status transitions are unchanged.
21. YES — pending remains blocked where the existing paid gate requires verification.
22. YES — rejected remains blocked.
23. YES — verified/approved continues to clear the KYC portion of the existing gate.
24. YES — Razorpay/payment authority is unchanged.
25. YES — Aadhaar privacy is preserved.
26. YES — filesystem/storage paths are hidden.
27. YES — the new reconciliation mechanism is read-only.
28. YES — no broad historical backfill was added.
29. NO — no database migration was added.
30. NO — no package dependency was added.
31. YES — storage-provider architecture is unchanged.
32. YES — Render/Azure settings are unchanged.
33. YES — Web UI is unchanged.
34. YES — Mobile UI is unchanged.
35. YES — accounting is unchanged.
36. YES — invoice/PO/WO lifecycle and numbering are unchanged.
37. YES — tenant/business isolation is preserved.
38. YES — `persistence-authority.js` remains descriptive only.
39. YES — the authority contract describes post-3C.2 KYC document authority.
40. YES — focused KYC authority tests pass under isolation-disabled execution.
41. YES — DocumentService/storage tests pass under isolation-disabled execution.
42. YES — subscription/KYC-gate tests pass.
43. YES — tenant-isolation tests pass.
44. YES — applicable regression passes excluding the explicitly evidenced DNS failure.
45. YES — `git diff --check` passes.
46. YES — the implementation boundary is limited to 3C.2.

## 22. Remaining KYC Transition Debt

Historical legacy-only records still require measured reconciliation in each deployed environment. A later package may decide whether to backfill or retire legacy fields after caller, data, integrity, rollback and runtime gates pass. PostgreSQL schema CLI verification, deployed storage verification and the invalid fixture hostname remain runtime items. None were implemented or hidden here.

## 23. Final Verdict

**PHASE 3C.2 — VERIFIED WITH RUNTIME ITEMS OUTSTANDING**
