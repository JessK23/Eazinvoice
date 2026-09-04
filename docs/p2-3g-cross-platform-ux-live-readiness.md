# P2-3G Cross-Platform Document UX, Archival, Sharing & Live Readiness

Final status: **P2-3G CROSS-PLATFORM UX & LIVE READINESS — PASSED WITH EXTERNAL GATES**

## A. Executive Summary

P2-3G extends the P2-3F document lifecycle remediation across Web, Android, and the WordPress plugin boundary. The application code now treats document print/PDF as presentation-only, keeps final invoice numbers server-authoritative, prevents finalized invoice deletion through ordinary delete flows, adds an Invoice Archive/Inactive repository, and aligns Email/WhatsApp paid entitlement UX with backend gates.

The application-code gates passed locally. External launch gates remain for Render live deployment validation, live Razorpay transaction/webhook proof, Android physical-device release smoke after Play upload-key activation, and official WordPress Plugin Check.

## B. Starting State / P2-3F Baseline

P2-3F remained the baseline and was not weakened:

- invoice drafts update the same record;
- invoice finalization updates the draft and allocates final numbers server-side;
- repeat finalization is idempotent;
- print/PDF actions are presentation-only;
- finalized invoices and issued PO/WO records are locked from material edit;
- PO/WO records remain non-accounting intent documents;
- draft delete remains available only for drafts.

## C. Print / Save as PDF Changes

Document-facing terminology now uses **Print / Save as PDF** instead of misleading "Generate PDF" language in active Web, Android, WordPress, and user-manual surfaces reviewed in this pass.

Web dashboard print actions now fetch printable invoice and PO/WO previews with the current bearer token before opening the preview. This avoids unauthenticated raw links returning `Unauthorized`.

## D. Web Back Navigation

The invoice editor uses application-aware dirty-state navigation and avoids silent loss of unsaved material edits. Dashboard entry points return users to normal EazInvoice screens rather than closing windows.

## E. Android Back Navigation

Android now tracks in-app route history and form dirty state. Bottom navigation and route actions use the mobile router instead of creating inconsistent hash-only transitions. Unsaved form changes are protected before route changes.

## F. WordPress Back Navigation

The WordPress plugin keeps navigation inside the plugin/admin workflow and adds unsaved-change protection for local plugin forms. It does not attempt to make local plugin records equivalent to SaaS accounting records.

## G. Unsaved-Change Protection

Editable Web, Android, and WordPress surfaces use the required warning copy:

> Discard unsaved changes?
>
> You have unsaved changes. Going back will discard them.

The prompt is suppressed after successful save/finalize flows.

## H. Invoice Archive / Inactive Repository

Finalized invoices can now be moved to Inactive/Archived instead of being physically deleted. Draft invoices can still be deleted. Archived invoices retain their invoice ID, final number, business ownership, line items, accounting links, payments, and audit metadata.

## I. Archive Accounting Integrity

Archive and restore are visibility changes only:

- no invoice renumbering;
- no journal reposting;
- no GST mutation;
- no payment recreation;
- no financial-event mutation.

Regression tests cover archive/restore preserving financial events, journals, payments, and final numbers.

## J. Active/Archived UX

The Web dashboard defaults normal Invoice Records to active records and adds an **Inactive / Archived** section. Archived invoices can be restored to active view without accounting impact.

## K. Email Entitlement

Email sharing remains Standard-and-above. Free users receive clear upgrade messaging instead of raw API errors. Backend entitlement remains authoritative.

## L. WhatsApp Entitlement

WhatsApp sharing remains Standard-and-above and is protected server-side. The app returns safe messaging and does not invent insecure public financial document links.

## M. Web Parity

Web now exposes the corrected document actions for invoice draft/finalized/archived states and PO/WO draft/issued states. Print/PDF preview, archive, restore, email, WhatsApp, payment, and gateway actions are separated by state and entitlement.

## N. Android Parity

Android uses the SaaS backend for document lifecycle actions. It exposes invoice finalize/archive/restore/WhatsApp actions and PO/WO issue/print actions where appropriate. PO/WO records no longer inherit invoice-only actions.

## O. WordPress Boundary/Parity

The WordPress plugin remains a separate product line with local/free records and paid connected-workflow messaging. This pass aligns terminology and safety UX without pretending local WordPress records are authoritative SaaS accounting records.

## P. Document Action Matrix

| Document state | Allowed actions | Blocked ordinary actions |
| --- | --- | --- |
| Invoice draft | Edit, Save Draft, Finalize, Delete Draft, Back | Print as final, Archive |
| Invoice finalized/unpaid | View, Print / Save as PDF, Email, WhatsApp, Record Payment, Archive, Back | Material edit, physical delete |
| Invoice paid | View, Print / Save as PDF, Email, WhatsApp, Archive, correction workflows | Material edit, physical delete |
| Invoice archived | View, Print / Save as PDF, Restore to Active View | Renumber, repost, physical delete |
| PO/WO draft | Edit, Save Draft, Issue, Delete Draft, Back | Record Payment |
| PO/WO issued | View, Print / Save as PDF, Email/share where entitled, Back | Record Payment, material edit, unsafe delete |

## Q. Security/RLS Validation

Runtime API authorization remains business/workspace-scoped. Archive/restore rejects cross-business access in tests. Maintenance Postgres import/sync/verifier scripts use an explicit `app.rls_bypass` session setting for controlled administrative operations only; this is not used as a normal client authorization path.

Local production schema verification could not be completed from this Codex process because `.env` points at `postgres://postgres:***@localhost:5432/eazinvoice` and that local role fails password authentication. The user previously verified Render Postgres migration/schema compatibility from a separate PowerShell session.

## R. Accounting Invariants

Verified locally:

- invoice draft: zero journals;
- invoice finalization: expected journals only;
- repeat finalization: zero duplicate journals;
- print/PDF: zero document or journal mutation;
- archive: zero journal mutation;
- restore: zero journal mutation;
- PO/WO issue and print: zero accounting impact.

## S. Tests Added/Changed

Added focused API coverage for:

- invoice archive and restore;
- archive payment/journal/financial-event preservation;
- archived default-list hiding and archived-only visibility;
- cross-business archive/restore rejection;
- print preview and sharing gates as presentation-only flows.

Existing mobile/WordPress document action tests continue to cover mobile SaaS API usage and WordPress local product boundary.

## T. Full Regression Results

Passed:

- `npm run build`
- `node tests\api.test.js` — 142/142 pass during focused run
- `npm test` — 145/145 pass
- `npm run web:p22-check` — 32/32 pass
- `npm run mobile:check` — 8/8 pass
- `node tests\mobile-document-actions.test.js` — 3/3 pass
- `npm run mobile:sync`
- `npm run release:check`
- `npm audit` — 0 vulnerabilities
- `git diff --check` — pass with Windows LF-to-CRLF warnings only

Not completed locally:

- official WordPress Plugin Check, because PHP/WP tooling is not installed on this machine;
- local Postgres schema verification, because local `.env` has invalid localhost Postgres credentials;
- live production `/readyz`, because outbound shell HTTPS attempted proxy `127.0.0.1` and was refused.

## U. Git Pre-Push Review

Remote state was fetched successfully after elevated permission:

- branch: `main`
- `HEAD`: `46ed4a0 Merge GitHub launch roadmap updates`
- `origin/main`: `46ed4a0 Merge GitHub launch roadmap updates`
- `origin/main..HEAD`: no commits
- no remote divergence detected.

Secret scan found placeholders/test fixture values only. `android/key.properties` is ignored. No `.jks` or `.keystore` is staged.

The tracked diff is broad and includes recovered P2-3C/P2-3D/P2-3F work plus P2-3G work. Untracked generated/plugin artifacts remain present and were not automatically included.

## V. Commit Details

Primary release commit:

- `0098d13 feat: complete document lifecycle and cross-platform readiness`
- `6d2b2a9 docs: record p2-3g push result`

The primary code commit includes the reviewed recovered P2-3C/P2-3D/P2-3F work and the P2-3G implementation/report. The follow-up commit records the actual push result in this report. Untracked generated plugin ZIP artifacts and local tooling folders were left out of the commits.

## W. Push Result

Pushed normally to the confirmed deployment branch:

- remote: `origin`
- branch: `main`
- range: `46ed4a0..6d2b2a9`

No force push was used.

## X. Render Deployment Result

Render redeployment still needs external confirmation from the Render dashboard. The GitHub push to `main` succeeded; verify that Render picked up latest commit `6d2b2a9`, completed build/deploy, and marked the service Live.

## Y. Production Validation

Production validation could not be completed from this environment after the push:

- shell request to `https://www.eazinvoice.com/readyz` failed through local proxy `127.0.0.1`;
- deployment still needs Render evidence showing the new commit built and is Live;
- `/readyz` must show production environment, Postgres storage, reachable DB, and schema compatibility before broad marketing.

## Z. Remaining Commercial/Release Gates

READY:

- local web/API/mobile document lifecycle code;
- P2-3F invariants;
- P2-3G archive/restore UX and tests;
- Android code surface after mobile sync;
- WordPress plugin boundary and terminology alignment.

LIMITED:

- WordPress plugin remains local/free with paid connected workflow boundary;
- WhatsApp sharing uses safe gated messaging, not insecure public document URLs;
- Android physical-device release smoke remains required after the upload-key waiting period.

NOT YET:

- broad paid marketing;
- Razorpay live Standard purchase, upgrade, webhook 200, and entitlement activation proof;
- official WordPress Plugin Check;
- Render live deployment verification for this recovered work;
- quotation lifecycle implementation and quotation-to-invoice conversion.

Final closure state: **P2-3G CROSS-PLATFORM UX & LIVE READINESS — PASSED WITH EXTERNAL GATES**.
