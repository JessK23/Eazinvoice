# EazInvoice Design System v1

## Scope

This document describes the additive Web-first foundation implemented in `apps/web/design-system-v1.css`. Existing pages do not load that stylesheet yet. Adoption and visible page redesign are deferred to later stages so current Website, Workspace, My Account, Mobile, and WordPress surfaces remain unchanged by Stage 1.

EazInvoice should feel professional, financial, modern, simple, trustworthy, and friendly to MSMEs. The interface should express "Money Managed Easy" through clear hierarchy, restrained presentation, understandable financial states, and obvious actions.

## Brand And Colour Semantics

- Navy (`--eaz-color-navy`) identifies EazInvoice, Workspace, navigation, and headings.
- Deep navy (`--eaz-color-navy-deep`) supports dark brand surfaces.
- Gold (`--eaz-color-gold`) is reserved for brand and marketing emphasis.
- Green (`--eaz-color-green`) means paid, received, completed, or successful financial state.
- Blue and light blue identify links, information, navigation, and ordinary interaction.
- Indigo and its light surface are reserved for AI Agent and future Eazy presentation.
- Amber means due, pending, warning, or attention.
- Red means overdue, failed, error, or destructive action.
- Off-white is the application background; white is the card, form, table, and document surface.
- Slate is primary text; mid grey is secondary text; light grey and border tokens separate surfaces.

Brand and AI gradients exist as tokens for controlled later use. Operational components remain flat by default.

## Typography

The foundation preserves the current Web font stack: Inter when available, followed by system UI fonts. It defines display, H1, H2, H3, body, small, and caption sizes. Financial values use stronger weight and tabular numerals through `.eaz-financial-value` and `.eaz-metric__value`.

Typography reduces at 768px and 390px without changing the product font or existing pages.

## Spacing, Shape, And Elevation

The spacing tokens implement the approved 4, 8, 12, 16, 24, 32, 40, 48, 64, and 80px scale. Radius tokens cover inputs, buttons, cards, large panels, and pills. Elevation is limited to flat, ordinary-card, and floating-surface levels. Borders and surface contrast remain the primary separators.

## Buttons And Financial Actions

`.eaz-button` provides shared dimensions, focus, hover, disabled, and active-ready behavior. Implemented variants are:

- `--primary`: navy operational action.
- `--brand`: solid gold marketing or brand CTA.
- `--secondary`: white surface with navy text.
- `--danger`: red destructive treatment.
- `--financial`: stronger blue treatment for lifecycle-changing financial actions.

The classes provide visual distinction only. They do not implement confirmation or document lifecycle behavior.

## Cards And Metrics

`.eaz-card` is the standard surface. Flat, action, information, warning, and AI variants are available. The metric structure provides label, value, context, state, and action hooks. Metric cards do not become green merely because a number is positive.

## Statuses

`.eaz-status` always carries visible text and supports draft/default grey, issued/sent blue, partially paid blue-green, paid/completed green, due/pending amber, overdue/failed red, and cancelled/void muted red. Colour is supplementary, not the sole status signal.

## Forms

The implemented foundation includes form sections, fields, labels, controls, helper text, error text, checkbox/radio alignment, focus indication, and invalid state. Existing Invoice and PO/WO forms are not changed.

## Tables

`.eaz-table-wrap` and `.eaz-table` provide an overflow-safe table surface with subtle horizontal rules, readable headers, comfortable rows, hover feedback, aligned tabular numbers, and emphasized totals. Search, filters, sort, pagination, and row-action behavior remain application responsibilities for later stages.

## Navigation

Public, Workspace, and My Account navigation receive distinct visual foundation classes: `.eaz-nav--public`, `.eaz-nav--workspace`, and `.eaz-nav--account`. These classes do not merge their route structures or alter Phase 1/2 routing.

## Empty, Loading, And Feedback States

The system includes a useful empty-state container, skeleton loading surface, and success, information, warning, and error notices. Notices support a title, contextual message, and optional action through normal child markup.

## Modal And Drawer Foundations

Overlay, modal, and right-side drawer surfaces define consistent positioning, borders, radius, and elevation. No modal, drawer, persistent AI surface, or Eazy workflow is instantiated in Stage 1.

## Motion And Accessibility

Fast, standard, and marketing duration tokens use restrained easing. Reduced-motion disables component animation and transitions. Controls use a 44px minimum touch target, visible focus rings, explicit text labels, high-contrast semantic pairs, and responsive table overflow.

## Logo

`.eaz-logo`, `.eaz-logo--header`, and `.eaz-logo--mark` size existing assets without redrawing or distorting them. Canonical assets remain under `apps/web/assets/`, including `logo-header.png`, `logo-mark.png`, `logo-full.png`, and the existing favicon/touch-icon set.

## Cross-Platform Direction

The token names and semantic rules are suitable for later translation to Website, Workspace, My Account, Mobile, and WordPress. Stage 1 intentionally modifies only a standalone Web foundation. Cross-platform adoption should preserve each platform's interaction model rather than forcing identical layouts.

## Protected Boundaries

Stage 1 does not change APIs, accounting, posting, ledgers, AR/AP, numbering, document lifecycle, payment authority, GST/TDS, compliance authority, period controls, tenant isolation, authentication, authorization, database schema, migrations, routing, Android versionCode, Mobile authority, or WordPress authority.

## Deferred

Homepage and banner redesign, remaining public Website pages, Workspace Dashboard, sales, purchases, Invoice and PO/WO screens, reports, My Account adoption, Mobile adoption, WordPress adoption, Eazy, behavioral loading logic, table behavior, and final cross-platform responsive/accessibility review are later-stage work.
