# Project configuration guidance — design

**Date:** 2026-06-25
**Status:** Approved (design)
**Scope:** Dev Console → Projects page (`apps/dev-console/src/routes/settings.tsx`) + shared `WarningBanner`.

## Problem

Users configuring a project on the Projects page often rely on the directory
**auto-detection** feature. Auto-detection is still evolving and may not always
pick the right workflow/entity files. We want to:

1. Make users aware that auto-detection may not give the desired results, and
   nudge them to set the **workflow** and **entity** folders explicitly.
2. Recommend **distinct, per-entity file names** so files are easy to tell apart
   in the left sidebar.
3. Recommend a **versioned best-practice folder structure**:
   - `models/workflows/v[N]/[entity-name].json` — workflows
   - `models/schema/v[N]/[entity-name].json` — entity example data
   Including the model version keeps the layout future-proof. Other layouts are
   valid too; the keys are explicit roots, versioned folders, and distinct names.

This is **guidance only** — no change to detection behavior or the config schema.

## Current state (for reference)

- `SettingsRoute` (`apps/dev-console/src/routes/settings.tsx`) renders the
  Projects list. Each project is a `Panel` with a collapsible **Configure**
  section (`configureOpenId` state) containing two `ScanRootRow`s: **Workflow
  root** and **Entity root**. Empty roots fall back to "Auto-detect".
- Existing hint text: *"Only show workflows from this folder (leave empty to
  auto-detect)"* (lines 240, 250).
- `WarningBanner` (`packages/console-design-system/src/WarningBanner.tsx`)
  supports severities `warning | caution | success`, all solid backgrounds.
  It renders `children` only — no dismiss affordance today.
- Styling: design tokens via `useTokens()`; relevant tokens include
  `color.blueSoft`, `color.blue`, `color.text`, `color.textMuted`, `font.mono`.

## Decision summary

Split the guidance into two pieces, each doing a distinct job (no duplication):

1. **Awareness** — a dismissible callout at the **top of the Projects page**, so
   even users who never open Configure get the message.
2. **Reference** — an expandable "Recommended folder structure" disclosure
   **inside the Configure section**, next to the fields it applies to.

## Design

### 1. `WarningBanner` enhancements (shared design-system)

File: `packages/console-design-system/src/WarningBanner.tsx`

- Add an **`info`** severity: soft-blue treatment (`bg: t.color.blueSoft`,
  `fg: t.color.text`). Saturated amber reads as a problem; soft blue reads as
  guidance. Existing severities are unchanged.
- Add an optional **`onDismiss?: () => void`** prop. When provided, render a
  right-aligned `×` button (accessible label "Dismiss") inside the banner.
  Layout becomes `flex` with content on the left and `×` on the right.
- Backward-compatible: existing call sites pass neither new prop and behave
  exactly as before.

### 2. Top-of-page awareness callout (dismissible)

File: `apps/dev-console/src/routes/settings.tsx`, directly under the "Projects"
header (before the projects list / empty state).

Wording:

> **Set your project folders explicitly.** Auto-detection of workflow and entity
> files is still evolving and may not always pick the right files. For reliable
> results, open **Configure** on a project and set the workflow and entity
> folders explicitly.

Behavior:

- Rendered with `<WarningBanner severity="info" onDismiss={dismiss}>`.
- **Dismiss** sets `localStorage["cyoda.setupTipsDismissed"] = "1"`.
- When dismissed, the callout is replaced **in the same spot** by a small muted
  text button **"Show setup tips"** that clears the flag (re-shows the callout).
  Dismissal collapses to a one-line re-open link rather than disappearing.
- State held in a `useState` initialized from `localStorage`, so it reacts
  immediately without a reload.

### 3. Expandable "Recommended folder structure" (inside Configure)

File: `apps/dev-console/src/routes/settings.tsx`, inside the `configOpen` block,
above the two `ScanRootRow`s (under the existing "Scan configuration" label).

- A collapsed-by-default disclosure: a `▸ / ▾` toggle labelled
  **"Recommended folder structure"** (local `useState`, e.g. keyed per project
  or a single boolean — single boolean is fine since one project configures at a
  time). No dismiss/persistence needed; it is always available.
- Expanded content:

  > Keep a versioned layout and a distinct file name per entity, so files are
  > easy to tell apart in the sidebar:
  >
  > ```
  > models/
  >   workflows/
  >     v1/
  >       order.json        ← workflow for "order"
  >       customer.json
  >   schema/
  >     v1/
  >       order.json        ← example data for "order"
  >       customer.json
  > ```
  >
  > Point **Workflow root** at `models/workflows` and **Entity root** at
  > `models/schema`. Always include the model version (`v1`, `v2`, …) to stay
  > future-proof. Other layouts work too — the keys are: explicit roots,
  > versioned folders, and distinct per-entity file names.

- The code block uses `font.mono` and a muted surface background, consistent
  with existing token usage.

### 4. Persistence choice

Use `localStorage["cyoda.setupTipsDismissed"]` for the dismiss flag rather than
extending `AppConfig`.

- Rationale: it is a pure UI preference (not project data), keeps the change
  scoped to the app, requires no config-schema version bump, and makes "reset"
  trivial (clear/flip the key via the "Show setup tips" link).
- Tradeoff: not synced across machines/profiles. Acceptable for a dev tool. If
  cross-machine sync is later wanted, migrate the flag to `AppConfig`
  (`workflow-project-model` is a local `workspace:*` package, so the type is
  editable).

## Files touched

- `packages/console-design-system/src/WarningBanner.tsx` — `info` severity +
  optional `onDismiss`.
- `apps/dev-console/src/routes/settings.tsx` — top callout (dismiss state +
  "Show setup tips" link) and the "Recommended folder structure" disclosure.

## Non-goals

- No change to auto-detection behavior, globs, or the config schema.
- No new persisted config fields.
- No changes to the sidebar / file indexer.

## Testing

- Unit/render: `WarningBanner` renders the `×` only when `onDismiss` is passed;
  `info` severity applies soft-blue tokens.
- Settings route: callout shows by default; dismissing hides it and shows
  "Show setup tips"; clicking that restores it; the disclosure toggles open/closed.
  (Follow existing test patterns in the repo; jsdom + the design-system
  `ThemeProvider` where needed.)
- Manual: verify wording renders correctly and the dismiss state survives a
  reload (localStorage).
