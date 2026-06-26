# Project Configuration Guidance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add guidance to the Dev Console Projects page that nudges users to set workflow/entity folders explicitly (rather than rely on evolving auto-detection) and teaches a versioned, distinct-filename folder convention.

**Architecture:** Two pieces, each with a distinct job. (1) A dismissible, soft-blue awareness callout at the top of the Projects page, backed by `localStorage`, that collapses to a "Show setup tips" reset link when dismissed. (2) An always-available, collapsed-by-default "Recommended folder structure" disclosure inside each project's Configure section. The shared `WarningBanner` design-system component gains an `info` severity and an optional `onDismiss` affordance; no detection behavior or config schema changes.

**Tech Stack:** React 19 + TypeScript, `@cyoda/console-design-system` (design tokens via `useTokens()`), `@tanstack/react-query`, Vitest 4 + `@testing-library/react` (happy-dom for design-system, Node localStorage for dev-console).

## Global Constraints

- Design-system components must use design tokens via `useTokens()` — no hard-coded colors except existing literals (e.g. `"#FFFFFF"`). Tokens available: `color.blueSoft` (`#EFF6FF`), `color.surfaceMuted` (`#F1F5F9`), `color.text`, `color.textMuted`, `font.mono`, `font.sizes.sm/lg`, `radius.sm`, `space.xs/sm/md`.
- `WarningBanner` changes must be backward-compatible: existing call sites pass neither `info` nor `onDismiss` and must render unchanged.
- Dismiss flag key is exactly `"cyoda.setupTipsDismissed"`, value `"1"`. No `AppConfig`/config-schema changes.
- Each package's tests run green before committing. Run from the worktree root: `/Users/paul/dev/cyoda-dev-console/.claude/worktrees/project-config-guidance`.
- TDD: write the failing test first, watch it fail, implement minimally, watch it pass, commit.

---

### Task 1: `WarningBanner` — `info` severity + `onDismiss`

**Files:**
- Modify: `packages/console-design-system/src/WarningBanner.tsx`
- Test: `packages/console-design-system/src/__tests__/WarningBanner.test.tsx`

**Interfaces:**
- Consumes: `useTokens()` from `./ThemeProvider` (already imported).
- Produces: `WarningBanner` now accepts `severity?: "info" | "warning" | "caution" | "success"` (default `"warning"`) and `onDismiss?: () => void`. When `onDismiss` is provided, a `<button aria-label="Dismiss">` rendering `×` appears; clicking it calls `onDismiss`. Task 2 consumes `severity="info"` + `onDismiss`.

- [ ] **Step 1: Add the failing tests**

Append these tests inside the existing `describe("WarningBanner", ...)` block in `packages/console-design-system/src/__tests__/WarningBanner.test.tsx` (the file already imports `render`, `screen`, `describe`, `it`, `expect`, `ThemeProvider`, `WarningBanner`, and defines `wrap`). Also add `fireEvent` to the existing `@testing-library/react` import and `vi` to the existing `vitest` import:

```tsx
// update existing imports at top of file:
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
```

```tsx
  it("renders with info severity without errors", () => {
    wrap(<WarningBanner severity="info">Heads up.</WarningBanner>);
    expect(screen.getByRole("alert")).toHaveTextContent("Heads up.");
  });

  it("renders no dismiss button when onDismiss is absent", () => {
    wrap(<WarningBanner>No dismiss here.</WarningBanner>);
    expect(screen.queryByRole("button", { name: /dismiss/i })).toBeNull();
  });

  it("renders a dismiss button and calls onDismiss when clicked", () => {
    const onDismiss = vi.fn();
    wrap(
      <WarningBanner severity="info" onDismiss={onDismiss}>
        Dismiss me.
      </WarningBanner>,
    );
    const btn = screen.getByRole("button", { name: /dismiss/i });
    fireEvent.click(btn);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter ./packages/console-design-system exec vitest run src/__tests__/WarningBanner.test.tsx`
Expected: FAIL — the `info`/`onDismiss` tests fail (no dismiss button found; TS may also flag `severity="info"` / `onDismiss` as unknown props).

- [ ] **Step 3: Implement `info` severity + `onDismiss`**

Replace the entire contents of `packages/console-design-system/src/WarningBanner.tsx` with:

```tsx
import type { ReactNode } from "react";
import { useTokens } from "./ThemeProvider";

type Severity = "info" | "warning" | "caution" | "success";

export function WarningBanner({
  severity = "warning",
  onDismiss,
  children,
}: {
  severity?: Severity;
  onDismiss?: () => void;
  children: ReactNode;
}) {
  const t = useTokens();

  const styles: Record<Severity, { bg: string; fg: string }> = {
    info:    { bg: t.color.blueSoft, fg: t.color.text },
    warning: { bg: t.color.warning,  fg: t.color.text },
    caution: { bg: t.color.danger,   fg: "#FFFFFF"    },
    success: { bg: t.color.teal,     fg: "#FFFFFF"    },
  };

  const { bg, fg } = styles[severity];

  return (
    <div
      role="alert"
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: t.space.sm,
        background: bg,
        color: fg,
        padding: `${t.space.sm} ${t.space.md}`,
        borderRadius: t.radius.sm,
        fontFamily: t.font.sans,
        fontSize: t.font.sizes.sm,
      }}
    >
      <div style={{ flex: 1 }}>{children}</div>
      {onDismiss && (
        <button
          type="button"
          aria-label="Dismiss"
          onClick={onDismiss}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            color: fg,
            fontSize: t.font.sizes.lg,
            lineHeight: 1,
            padding: 0,
            flexShrink: 0,
          }}
        >
          ×
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter ./packages/console-design-system exec vitest run src/__tests__/WarningBanner.test.tsx`
Expected: PASS — all WarningBanner tests (including the 3 new ones) green.

- [ ] **Step 5: Typecheck the package**

Run: `pnpm --filter ./packages/console-design-system typecheck`
Expected: no type errors.

- [ ] **Step 6: Commit**

```bash
git add packages/console-design-system/src/WarningBanner.tsx packages/console-design-system/src/__tests__/WarningBanner.test.tsx
git commit -m "feat(design-system): add info severity and onDismiss to WarningBanner"
```

---

### Task 2: Projects page — dismissible awareness callout + reset link

**Files:**
- Modify: `apps/dev-console/src/routes/settings.tsx` (import on line 8; component body around lines 51–60 and the JSX after the header, around lines 166–170)
- Test: `apps/dev-console/src/__tests__/settings.test.tsx`

**Interfaces:**
- Consumes: `WarningBanner` (with `severity="info"` + `onDismiss`) from Task 1; `useTokens()`; global `localStorage`.
- Produces: top-of-page callout shown unless `localStorage["cyoda.setupTipsDismissed"] === "1"`; when dismissed, a "Show setup tips" button restores it. No new exports.

- [ ] **Step 1: Add the failing tests**

In `apps/dev-console/src/__tests__/settings.test.tsx`, add `fireEvent` to the existing `@testing-library/react` import, clear `localStorage` in `beforeEach`, and append the tests below.

Update the import and `beforeEach`:

```tsx
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
```

```tsx
  beforeEach(() => {
    queryClient.clear();
    localStorage.clear();
  });
```

Append inside `describe("SettingsRoute", ...)`:

```tsx
  it("shows the setup-tips callout by default", async () => {
    wrap(<SettingsRoute />);
    await waitFor(() =>
      expect(
        screen.getByText(/Auto-detection of workflow and entity files is still evolving/i),
      ).toBeInTheDocument(),
    );
  });

  it("dismisses the callout, persists the flag, and shows a reset link", async () => {
    wrap(<SettingsRoute />);
    await waitFor(() => screen.getByRole("button", { name: /dismiss/i }));
    fireEvent.click(screen.getByRole("button", { name: /dismiss/i }));

    expect(
      screen.queryByText(/Auto-detection of workflow and entity files is still evolving/i),
    ).toBeNull();
    expect(localStorage.getItem("cyoda.setupTipsDismissed")).toBe("1");
    expect(screen.getByRole("button", { name: /show setup tips/i })).toBeInTheDocument();
  });

  it("restores the callout when the reset link is clicked", async () => {
    localStorage.setItem("cyoda.setupTipsDismissed", "1");
    wrap(<SettingsRoute />);
    await waitFor(() => screen.getByRole("button", { name: /show setup tips/i }));
    fireEvent.click(screen.getByRole("button", { name: /show setup tips/i }));

    expect(
      screen.getByText(/Auto-detection of workflow and entity files is still evolving/i),
    ).toBeInTheDocument();
    expect(localStorage.getItem("cyoda.setupTipsDismissed")).toBeNull();
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter ./apps/dev-console exec vitest run src/__tests__/settings.test.tsx`
Expected: FAIL — callout text and "Show setup tips" / "Dismiss" buttons are not found.

- [ ] **Step 3: Import `WarningBanner`**

In `apps/dev-console/src/routes/settings.tsx`, line 8, add `WarningBanner` to the design-system import:

```tsx
import { Button, EmptyState, FilePath, Panel, WarningBanner, useTokens } from "@cyoda/console-design-system";
```

- [ ] **Step 4: Add dismiss state + handlers**

In `apps/dev-console/src/routes/settings.tsx`, immediately after the existing `const [entityRootError, setEntityRootError] = useState<string | null>(null);` (line 60), add:

```tsx
  const [tipsDismissed, setTipsDismissed] = useState<boolean>(
    () => localStorage.getItem("cyoda.setupTipsDismissed") === "1",
  );
  const dismissTips = () => {
    localStorage.setItem("cyoda.setupTipsDismissed", "1");
    setTipsDismissed(true);
  };
  const showTips = () => {
    localStorage.removeItem("cyoda.setupTipsDismissed");
    setTipsDismissed(false);
  };
```

- [ ] **Step 5: Render the callout / reset link under the header**

In the same file, find the header block that ends with `</div>` after the "Open project…" button (the `<div>` opened around line 167, closed at line 170). Insert the following block immediately after that closing `</div>` and before the `{recentProjects.length === 0 ? (` line:

```tsx
      {tipsDismissed ? (
        <button
          type="button"
          onClick={showTips}
          style={{
            display: "block",
            background: "none",
            border: "none",
            cursor: "pointer",
            color: t.color.textMuted,
            fontSize: t.font.sizes.sm,
            padding: 0,
            textDecoration: "underline",
            marginBottom: t.space.md,
          }}
        >
          Show setup tips
        </button>
      ) : (
        <div style={{ marginBottom: t.space.md }}>
          <WarningBanner severity="info" onDismiss={dismissTips}>
            <strong>Set your project folders explicitly.</strong> Auto-detection of
            workflow and entity files is still evolving and may not always pick the
            right files. For reliable results, open <strong>Configure</strong> on a
            project and set the workflow and entity folders explicitly.
          </WarningBanner>
        </div>
      )}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `pnpm --filter ./apps/dev-console exec vitest run src/__tests__/settings.test.tsx`
Expected: PASS — all SettingsRoute tests green, including the 3 new ones.

- [ ] **Step 7: Commit**

```bash
git add apps/dev-console/src/routes/settings.tsx apps/dev-console/src/__tests__/settings.test.tsx
git commit -m "feat(dev-console): add dismissible setup-tips callout to Projects page"
```

---

### Task 3: Projects page — "Recommended folder structure" disclosure

**Files:**
- Modify: `apps/dev-console/src/routes/settings.tsx` (component state near line 60; the `configOpen` block around lines 225–236)
- Test: `apps/dev-console/src/__tests__/settings.test.tsx`

**Interfaces:**
- Consumes: `useTokens()`; existing `configureOpenId` / "Configure" toggle.
- Produces: a collapsed-by-default disclosure inside the Configure section, toggled by a button named "Recommended folder structure", revealing the convention text and a `models/workflows|schema/v[N]/[entity].json` example. No new exports.

- [ ] **Step 1: Add the failing tests**

Append inside `describe("SettingsRoute", ...)` in `apps/dev-console/src/__tests__/settings.test.tsx` (note: `fireEvent` was already imported in Task 2):

```tsx
  it("hides the folder-structure detail until the disclosure is expanded", async () => {
    wrap(<SettingsRoute />);
    await waitFor(() => screen.getByRole("button", { name: /configure/i }));
    fireEvent.click(screen.getByRole("button", { name: /configure/i }));

    expect(screen.getByRole("button", { name: /recommended folder structure/i })).toBeInTheDocument();
    expect(screen.queryByText(/distinct per-entity file names/i)).toBeNull();
  });

  it("reveals the folder-structure convention when expanded", async () => {
    wrap(<SettingsRoute />);
    await waitFor(() => screen.getByRole("button", { name: /configure/i }));
    fireEvent.click(screen.getByRole("button", { name: /configure/i }));
    fireEvent.click(screen.getByRole("button", { name: /recommended folder structure/i }));

    expect(screen.getByText(/distinct per-entity file names/i)).toBeInTheDocument();
    expect(screen.getByText(/example data for/i)).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter ./apps/dev-console exec vitest run src/__tests__/settings.test.tsx`
Expected: FAIL — no "Recommended folder structure" button exists yet.

- [ ] **Step 3: Add disclosure state**

In `apps/dev-console/src/routes/settings.tsx`, immediately after the `showTips` handler added in Task 2, add:

```tsx
  const [structureOpen, setStructureOpen] = useState(false);
```

- [ ] **Step 4: Render the disclosure inside the Configure section**

In the same file, locate the "Scan configuration" label div inside the `configOpen && (...)` block:

```tsx
                    <div style={{ fontSize: t.font.sizes.sm, fontWeight: 600, color: t.color.textMuted }}>
                      Scan configuration
                    </div>
```

Insert the following block immediately after that closing `</div>` and before the first `<ScanRootRow` (the "Workflow root" row):

```tsx
                    <div>
                      <button
                        type="button"
                        aria-expanded={structureOpen}
                        onClick={() => setStructureOpen((v) => !v)}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: t.space.xs,
                          background: "none",
                          border: "none",
                          cursor: "pointer",
                          padding: 0,
                          fontSize: t.font.sizes.sm,
                          color: t.color.text,
                        }}
                      >
                        <span aria-hidden>{structureOpen ? "▾" : "▸"}</span>
                        Recommended folder structure
                      </button>
                      {structureOpen && (
                        <div style={{ marginTop: t.space.xs, fontSize: t.font.sizes.sm, color: t.color.textMuted }}>
                          <p style={{ margin: `0 0 ${t.space.xs}` }}>
                            Keep a versioned layout and a distinct file name per entity, so files
                            are easy to tell apart in the sidebar:
                          </p>
                          <pre
                            style={{
                              margin: 0,
                              padding: t.space.sm,
                              background: t.color.surfaceMuted,
                              borderRadius: t.radius.sm,
                              fontFamily: t.font.mono,
                              fontSize: t.font.sizes.sm,
                              color: t.color.text,
                              overflowX: "auto",
                            }}
                          >
{`models/
  workflows/
    v1/
      order.json        ← workflow for "order"
      customer.json
  schema/
    v1/
      order.json        ← example data for "order"
      customer.json`}
                          </pre>
                          <p style={{ margin: `${t.space.xs} 0 0` }}>
                            Point <strong>Workflow root</strong> at <code>models/workflows</code>{" "}
                            and <strong>Entity root</strong> at <code>models/schema</code>. Always
                            include the model version (<code>v1</code>, <code>v2</code>, …) to stay
                            future-proof. Other layouts work too — the keys are: explicit roots,
                            versioned folders, and distinct per-entity file names.
                          </p>
                        </div>
                      )}
                    </div>
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm --filter ./apps/dev-console exec vitest run src/__tests__/settings.test.tsx`
Expected: PASS — all SettingsRoute tests green, including the 2 new disclosure tests.

- [ ] **Step 6: Typecheck dev-console**

Run: `pnpm --filter ./apps/dev-console typecheck`
Expected: no type errors.

- [ ] **Step 7: Commit**

```bash
git add apps/dev-console/src/routes/settings.tsx apps/dev-console/src/__tests__/settings.test.tsx
git commit -m "feat(dev-console): add Recommended folder structure disclosure to project config"
```

---

### Final verification (after all tasks)

- [ ] **Run the full workspace build + tests**

```bash
pnpm build && pnpm test
```
Expected: build succeeds; all package test suites pass (design-system + dev-console include the new tests).

- [ ] **Manual smoke (optional but recommended)**

Launch the app (`pnpm --filter dev-console tauri:dev`), open the Projects page:
- The soft-blue callout appears under "Projects"; the `×` dismisses it and leaves a "Show setup tips" link; the link restores it; the dismissal survives a reload (localStorage).
- Open Configure on a project; "▸ Recommended folder structure" is collapsed by default and expands to show the `models/…/v1/…` example and the convention text.
