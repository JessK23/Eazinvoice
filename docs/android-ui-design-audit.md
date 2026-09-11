# EazInvoice Android UI Design Audit

## 1. Executive Summary

The Android client is a Capacitor shell that renders the web based mobile UI from `apps/mobile`. It has a coherent navy, blue, teal, gold and white palette, consistent rounded controls, server authoritative workflows, and a usable narrow screen layout. Its visual match to the intended premium fintech direction is **partial**: the foundation is sound, but the current experience is a dense operations console rather than the polished, scan first mobile product described in the brief.

Overall score: **6.2/10**.

The strongest screen is the authenticated dashboard because its metric, risk, quick action and recent record sections create a useful financial cockpit. The weakest screen is the document area because several workflows are stacked into long dense forms and do not yet provide the clear lifecycle hierarchy, itemized editing experience, or primary bottom action expected for invoice and work order creation.

Top five design gaps:

1. Dashboard summaries use a mostly white card treatment instead of differentiated sales, receivables and payables status colors.
2. Sales and purchasing screens expose many unrelated forms in one scroll, which increases cognitive load and weakens task focus.
3. The mobile navigation has six text only destinations and does not match the requested five item Home, Sales, Purchases, Accounting and More model.
4. There is no dedicated work order, quotation or AI Agent presentation in the mobile renderer.
5. Reports, compliance and empty/error states are functional data views but lack structured visual summaries, icons and stronger responsive hierarchy.

## 2. Current UI Architecture

Android is a Capacitor application. `android/app/src/main` provides the native shell, manifest, launcher resources and Gradle configuration; `android/app/src/main/assets/public` receives the synchronized web assets. The UI source of truth is:

- `apps/mobile/index.html`: shell, status banners, content mount and bottom navigation.
- `apps/mobile/app.js`: API client, session restoration, route state, event binding and all screen renderers.
- `apps/mobile/styles.css`: global tokens, layout, cards, forms, buttons, banners and navigation.
- `apps/mobile/manifest.json`: web manifest metadata.
- `apps/mobile/assets/`: header and maskable brand artwork.

Navigation is route state driven (`home`, `sales`, `purchases`, `money`, `reports`, `more`) and rendered into one content area. Reusable string render helpers include metric cards, risk cards, form cards, section titles, record lists, party lists, JSON summaries and business governance panels. Authentication is a separate sign in, sign up and password recovery renderer. The API client calls the Render hosted EazInvoice API; accounting and document authority remain server side.

## 3. Brand / Visual Direction Match

The palette is aligned with the brief: navy is used for headings and identity, blue and teal for primary actions, gold for authentication emphasis, green for healthy states, and amber/red for warnings. Typography is readable system UI with strong weights, and all primary controls meet or exceed a 44px minimum height. Cards, fields and buttons use a consistent 8px radius, which is orderly but less expressive than the target's varied rounded card system.

The current visual language is more utilitarian than premium. Shadows are applied broadly, most cards share the same white surface, icons are sparse, and text labels carry most of the navigation burden. The authentication panel has the strongest brand expression through its navy-to-teal gradient. The authenticated workspace would benefit from more deliberate color coding, visual grouping and lightweight iconography.

## 4. Screen-by-Screen Review

### Dashboard

**Current state:** Six financial metrics, a risk summary, four quick actions and recent financial records. Data is fetched from authoritative report endpoints.

**Score:** visual match 7/10; usability 7/10; consistency 7/10; mobile optimization 7/10; brand alignment 7/10.

**What works:** It gives users a useful financial overview, keeps values server derived, supports read-only states, and uses responsive two-column cards that collapse on small screens.

**What does not match:** The target asks for sales, receivables and payables as visually differentiated cards, greeting/business context and a richer eight action grid. The current six white metric cards and text-only quick actions feel like a compact admin console. There is no recent activity treatment with icons or event semantics.

**Recommended improvement:** Establish three primary colored financial cards, add a compact business greeting below the header, group secondary metrics, and use icon plus label action tiles. Preserve the existing backend values and risk calculations.

**Priority:** High.

### Invoice / Sales

**Current state:** The Sales route stacks Create Invoice, Record Payment, Credit Note, Refund/Reversal and Reverse Payment forms, followed by customers, invoices and correction records.

**Score:** visual match 5/10; usability 5/10; consistency 6/10; mobile optimization 5/10; brand alignment 6/10.

**What works:** Invoice creation, finalization, archive/restore and payment actions call explicit backend endpoints. Draft versus issued status is represented in the form and destructive deletion is avoided.

**What does not match:** There is no focused “New Invoice” page, customer selector, item line editor, subtotal/GST/total hierarchy or sticky primary action. Multiple financial correction workflows compete with invoice creation in the same scroll. The status select includes “Save Draft”, “Issue Invoice” and “Create”, which is functional but visually ambiguous.

**Recommended improvement:** Make invoice creation the primary screen with a step or card structure, repeatable item rows and a clear total summary. Place payment and correction actions in separate detail views or contextual drawers. Keep lifecycle wording and server numbering unchanged.

**Priority:** Critical for redesign quality; functional boundaries remain unchanged.

### Quotation

**Current state:** No quotation renderer or dedicated mobile route was found.

**Score:** visual match 2/10; usability 2/10; consistency 3/10; mobile optimization 2/10; brand alignment 3/10.

**What works:** The shared form and card primitives could support a quotation without creating a new visual system.

**What does not match:** The target explicitly includes quotation in the quick action model, but the mobile UI does not expose it.

**Recommended improvement:** Add a quotation entry point only after confirming the existing API lifecycle and conversion rules. Reuse the invoice item editor and distinguish quotation status from issued accounting documents.

**Priority:** Medium, with functional review required.

### Purchase Order / Purchasing

**Current state:** Purchase Order, Vendor Bill, Vendor Payment, Vendor Credit/Recovery and Supplier Recovery forms are stacked together, with vendor and record lists beneath them.

**Score:** visual match 5/10; usability 5/10; consistency 6/10; mobile optimization 5/10; brand alignment 6/10.

**What works:** The notice correctly states that purchase orders have no accounting impact, while vendor bills create the liability. Endpoint separation mirrors those boundaries.

**What does not match:** The screen is dense and does not provide a focused “New Purchase Order” or “New Vendor Bill” experience. There is little visual distinction between intention documents and accounting documents.

**Recommended improvement:** Use separate task cards or routes, add status badges and amount summaries, and retain the explicit non-accounting notice for purchase orders.

**Priority:** High.

### Work Order

**Current state:** No dedicated work order renderer or route was found.

**Score:** visual match 2/10; usability 2/10; consistency 3/10; mobile optimization 2/10; brand alignment 3/10.

**What works:** Existing form cards and item fields are reusable building blocks.

**What does not match:** The requested work description, project fields, completion date, materials/services, notes and primary Create/Issue action are absent.

**Recommended improvement:** Add a focused work order screen only after confirming the current backend document model. Preserve its non-accounting boundary unless the backend explicitly says otherwise.

**Priority:** Medium, with functional review required.

### Money / Banking

**Current state:** A/R, A/P and unmatched bank metrics, ageing summaries, and a bank list. Detailed matching remains Web-preferred.

**Score:** visual match 6/10; usability 6/10; consistency 6/10; mobile optimization 6/10; brand alignment 6/10.

**What works:** The screen is appropriately summary oriented and communicates that detailed matching belongs on Web. Values are backend derived.

**What does not match:** There is limited visual differentiation between receivables, payables and bank evidence, and no clear action hierarchy for the next task.

**Recommended improvement:** Use colored financial summary cards, ageing chips and an explicit “Open detailed matching on Web” action.

**Priority:** Medium.

### Reports

**Current state:** Profit and Loss, Balance Sheet, Trial Balance and General Ledger sections render compact JSON summaries and record rows.

**Score:** visual match 4/10; usability 5/10; consistency 6/10; mobile optimization 5/10; brand alignment 5/10.

**What works:** Read-only posture and backend reconciliation status are clear. Dense ledger drill-down is correctly Web-preferred.

**What does not match:** Raw JSON-like cards are not an approachable financial reporting experience. There are no charts, labeled totals, period controls or visual balance indicators.

**Recommended improvement:** Introduce report summary cards, period filters and expandable account sections. Keep the mobile view summary-first and route deep drill-down to Web.

**Priority:** High.

### GST / TDS / Compliance

**Current state:** These appear under More with compact JSON summaries, issue counts, accounting periods, year-end preview, business/team governance and endpoint settings.

**Score:** visual match 4/10; usability 5/10; consistency 6/10; mobile optimization 5/10; brand alignment 5/10.

**What works:** The “prepared is not government-filed” boundary is explicit, and close/year-end operations are labeled Web-preferred or preview-only.

**What does not match:** Compliance is mixed with settings and governance, and the presentation is data-dense. The API endpoint form is a development concern and should not be prominent in a production mobile flow.

**Recommended improvement:** Group compliance into a dedicated review page with open, due soon and overdue cards; keep endpoint configuration behind a protected developer setting or remove it from release UI.

**Priority:** High for information architecture; no backend change implied.

### AI Agent

**Current state:** No AI Agent screen or mobile route was found in `apps/mobile/app.js`.

**Score:** visual match 1/10; usability 1/10; consistency 2/10; mobile optimization 1/10; brand alignment 2/10.

**What works:** The backend and Web application contain AI command and assistant capabilities that can inform a future mobile presentation.

**What does not match:** There is no branded assistant introduction, prompt cards, chat history, structured answer cards or bottom input.

**Recommended improvement:** Add a mobile AI view using the existing gated, draft-only assistant behavior. Present facts, calculations and recommendations separately, and never allow autonomous posting, payments, filing, deletion or tenant boundary bypass.

**Priority:** Medium, with functional review required.

### Login / Sign Up / Forgot Password

**Current state:** A branded gradient authentication panel supports sign in, sign up, email OTP request and password recovery. Native runtime defaults to the production API.

**Score:** visual match 7/10; usability 7/10; consistency 7/10; mobile optimization 7/10; brand alignment 8/10.

**What works:** Strongest brand expression, clear mode labels, 44px controls, OTP expiry feedback, and explicit recovery guidance.

**What does not match:** The three mode buttons may become crowded on very narrow devices, and the form is still text-heavy. OTP delivery and redirect behavior depend on hosted Supabase template and production API configuration.

**Recommended improvement:** Preserve the current flow, improve mode selection with a segmented control or secondary recovery link, and add accessible error illustrations only if they do not obscure the form.

**Priority:** Medium.

### Business Selector / More / Settings

**Current state:** The authenticated workspace bar contains profile, business selector and logout. More contains compliance, periods, year-end, governance and endpoint settings.

**Score:** visual match 5/10; usability 6/10; consistency 6/10; mobile optimization 6/10; brand alignment 5/10.

**What works:** Business switching is server-backed and hidden when there is only one workspace. Secrets and detailed governance are marked Web-preferred.

**What does not match:** More is an overloaded catch-all route. Settings and operational compliance have different user intents and should not share one long page.

**Recommended improvement:** Split More into grouped list rows with icons and clear destinations, and keep developer endpoint configuration out of normal production navigation.

**Priority:** High.

## 5. Global Design System Gaps

- Color tokens exist, but semantic financial surfaces are not consistently applied.
- Typography has strong weights but no documented display, heading, body and caption scale.
- Radius is almost uniformly 8px; the target calls for a more intentional card and control hierarchy.
- Shadows are global and fairly heavy; use elevation by component importance.
- Iconography is minimal and inconsistent with a finance navigation system.
- Empty, loading and error states are mostly text or generic records rather than designed states.
- The six item text bottom navigation does not match the requested five item information architecture.
- Forms use repeated labels and inputs without an established field group, helper, error or read-only pattern.
- Data summaries use JSON presentation in places where structured cards would improve comprehension.
- The mobile shell is responsive, but several screens remain desktop-like in information density.

## 6. Mobile UX Issues

Touch targets are generally adequate because buttons use a 44px minimum height. The small-screen breakpoint collapses grids effectively, but it also turns long multi-form screens into very tall scrolls. Authentication mode labels can wrap or feel cramped on narrow screens. The fixed bottom navigation has six destinations, which reduces label clarity and leaves no dedicated Accounting item. There is no clear scroll position context, segmented document navigation, sticky total or sticky primary action. Status and offline banners are useful but should be visually separated from business content.

Accessibility foundations are present through labels, `aria-label`, `aria-live`, hidden states and semantic buttons. More work is needed for focus visibility, error association, color-independent status, dynamic announcements after save/finalize and icon labels once iconography is introduced.

## 7. Design vs Functional Boundaries

### A. Design-only changes

- Color, typography, spacing, elevation and radius tokens.
- Card composition, iconography, action tiles and status badges.
- Navigation labels and grouping when routes remain equivalent.
- Structured report and compliance presentation.
- Loading, empty, error and offline visual states.
- Responsive layout, focus treatment and touch feedback.

### B. UI structure changes

- Split Sales and Purchases into focused task views.
- Add document detail/edit shells with item rows and totals.
- Add dedicated Work Order, Quotation and AI Agent screens if their existing APIs are confirmed.
- Replace the six item bottom navigation with the approved five group model, mapping Accounting to the current Money/Reports surfaces.
- Move endpoint configuration into a protected developer-only area.

### C. Functional changes requiring product/backend consideration

- Quotation and Work Order routes if no matching authoritative endpoints exist.
- AI Agent mobile actions and entitlement behavior.
- Any change to invoice finalization, numbering, posting or archive semantics.
- Any change to payment, credit, refund or recovery workflows.
- Any change to business switching, permissions or tenant scope.

The redesign must preserve draft versus finalized state, server-side numbering, finalized immutability, archive/inactive semantics, accounting boundaries and AI safety controls.

## 8. Proposed Design System

Use the existing tokens as a base and document them centrally:

- **Colors:** navy for identity and headings; blue/teal for primary actions; gold for brand emphasis; soft green for healthy/paid; soft blue for information; amber for due/review; red for blocking errors; neutral wash and surfaces.
- **Typography:** 30–34px display authentication title; 22–24px page title; 18–20px section title; 16px body; 13–14px labels; 11–12px metadata. Use weight rather than all caps for hierarchy.
- **Spacing:** 4px base increments, with 8px control gaps, 12px card padding, 16px section padding and 24px major section spacing.
- **Radius:** 12–16px primary cards, 10–12px controls, 999px status pills.
- **Cards:** summary, action, form, list, warning and empty-state variants with controlled elevation.
- **Forms:** label, helper, input, error and read-only states; repeatable item row; date and selector field groups.
- **Buttons:** primary, secondary, tertiary/text, destructive and icon-only with explicit loading states.
- **Status badges:** draft, issued, paid, overdue, archived, review and prepared/not filed.
- **Navigation:** five grouped destinations with icon plus label and a consistent selected state.
- **Lists:** leading icon/status, title, supporting metadata, amount/status at the end, and contextual actions.
- **AI cards:** user message, assistant response, fact/calculation/recommendation sections, suggested prompt tile and safe draft action.
- **States:** designed loading skeleton, empty illustration, inline error with retry, offline banner and success confirmation.

## 9. Recommended Redesign Sequence

1. **Phase 1 - Design system:** establish tokens, component variants, accessibility states and navigation mapping.
2. **Phase 2 - Dashboard:** redesign financial summary cards, greeting, quick actions, recent activity and bottom navigation.
3. **Phase 3 - Document creation:** create focused invoice, quotation, purchase order and work order shells with item rows and lifecycle actions.
4. **Phase 4 - Reports / compliance:** replace raw summaries with structured cards, period controls and review states.
5. **Phase 5 - AI Agent:** add branded chat and structured answer cards behind existing entitlements and safety controls.
6. **Phase 6 - Polish / accessibility / consistency:** test narrow devices, focus order, contrast, loading/error states and Android packaging.

## 10. Files Likely To Be Changed

- `apps/mobile/styles.css` for tokens, layout and component variants.
- `apps/mobile/index.html` for shell/navigation structure.
- `apps/mobile/app.js` for route composition and render structure.
- `apps/mobile/assets/` for approved iconography or illustrations.
- `tests/mobile-document-actions.test.js` and new focused UI contract tests.
- `android/app/src/main/res/` only if launcher or adaptive icon assets are intentionally updated.
- `docs/user-manual-android.md` and release/readiness documentation after behavior is verified.

No source files were changed for this audit. No assets were generated and no commit was created.

## 11. Risks / Regression Areas

- Splitting forms can accidentally hide lifecycle actions or alter payload fields.
- Rewording status actions can obscure the distinction between draft, issued and finalized documents.
- New item editors must continue using server-calculated totals and numbering.
- Navigation regrouping must preserve route permissions and active state.
- AI presentation must not imply autonomous accounting, payment, filing or deletion.
- Removing endpoint settings from the UI requires a documented developer workflow for local testing.
- New images and icons must retain contrast, reasonable bundle size and Android adaptive icon compatibility.
- Any new route needs mobile parity, offline/error handling and authorization coverage.

## 12. Overall Assessment

The current Android UI is a credible functional foundation with good brand colors, responsive primitives and safe backend boundaries. It needs a deliberate mobile information architecture and a reusable visual system before it will match the supplied premium fintech direction. A redesign is recommended, sequenced from shared primitives through dashboard and document workflows, with functional changes isolated for explicit product review.

**ANDROID UI VISUAL MATCH — PARTIAL**
