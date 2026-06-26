# Project Naming, Root-Folder Change & Header Affordance — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users rename a Dev Console project (typed or via clickable root-path "folder chips"), change its root folder safely, and make the header button clearly a "manage projects" control — all behavior covered by automated tests.

**Architecture:** A new `ProjectNameField` component and a `useProjectWatcher` hook (which also fixes a file-watcher leak/race), plus additive changes to `settings.tsx` (a generic `ConfirmModal`, an optimistic `updateProjectField`, a Project-name section, and a Root-folder row) and a header affordance tweak. No schema or IPC additions.

**Tech Stack:** React 19 + TypeScript, `@cyoda/console-design-system` (tokens via `useTokens()`), `@tanstack/react-query`, lucide-react, Vitest 4 + `@testing-library/react` (happy-dom).

## Global Constraints

- All styling uses design tokens via `useTokens()`; no hard-coded colors except existing literals (`"#fff"`/`"#FFFFFF"`).
- Project `name`: trim; commit only if length is **1–200** and changed; on a rejected/empty/unchanged commit, the input **reverts to the current `name`**.
- Folder chips: `rootPath.split("/").filter(Boolean)`, de-duplicated preserving order, **last 5**; rendered as native `<button type="button">`; each has `onMouseDown={(e) => e.preventDefault()}`.
- Header chevron is `aria-hidden`; tooltip text is exactly **"Manage projects"**.
- `updateProjectField` composes concurrent edits via `qc.getQueryData`/`qc.setQueryData(["app-config"], …)` (optimistic write) before the async save.
- File watcher: in cleanup, chain `unwatchProject(root)` onto the `watchProject` promise (`watching.finally(...)`) — never a bare `void unwatchProject(root)`.
- Root change resets `workflowRoot` and `entityRoot` to `null`; confirm modal only when at least one was non-null.
- `ConfirmModal` overlay: `position:fixed; inset:0; background:rgba(0,0,0,0.4); display:grid; placeItems:center; zIndex:1000`.
- No changes to `@cyoda/workflow-project-model` or to the IPC surface (reuse the existing `unwatchProject`).
- New tests live in co-located `__tests__/` dirs (matches `src/agent/__tests__/`, `src/assistant/__tests__/`). The `settings` test fixture must include `workflowRoot:null`/`entityRoot:null` and a mutable `active` via `vi.hoisted`.
- Run all commands from the worktree root: `/Users/paul/dev/cyoda-dev-console/.claude/worktrees/project-config-guidance`. TDD: failing test first, watch it fail, implement, watch it pass, commit.

---

### Task 1: Header affordance — chevron + "Manage projects" tooltip

**Files:**
- Modify: `apps/dev-console/src/components/HeaderContext.tsx`
- Test: `apps/dev-console/src/__tests__/headerContext.test.tsx`

**Interfaces:**
- Consumes: nothing new.
- Produces: `HeaderContext` unchanged props; button `title="Manage projects"`, an `aria-hidden` `ChevronDown` after the name, accessible name still the project name.

- [ ] **Step 1: Add failing tests**

Append inside the existing `describe("HeaderContext", …)` block in `apps/dev-console/src/__tests__/headerContext.test.tsx` (add `fireEvent` to the `@testing-library/react` import and `vi` to the `vitest` import):

```tsx
// update imports at top:
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
```

```tsx
  it("uses a 'Manage projects' tooltip", () => {
    wrap(<HeaderContext projectName="order-demo" dirty={false} />);
    expect(screen.getByRole("button", { name: "order-demo" })).toHaveAttribute(
      "title",
      "Manage projects",
    );
  });

  it("renders a chevron that does not change the accessible name", () => {
    const { container } = wrap(<HeaderContext projectName="order-demo" dirty={false} />);
    expect(container.querySelector(".lucide-chevron-down")).toBeInTheDocument();
    // accessible name is still just the project name (chevron is aria-hidden)
    expect(screen.getByRole("button", { name: "order-demo" })).toBeInTheDocument();
  });

  it("calls onProjectClick when clicked", () => {
    const onProjectClick = vi.fn();
    wrap(<HeaderContext projectName="order-demo" dirty={false} onProjectClick={onProjectClick} />);
    fireEvent.click(screen.getByRole("button", { name: "order-demo" }));
    expect(onProjectClick).toHaveBeenCalledTimes(1);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter ./apps/dev-console exec vitest run src/__tests__/headerContext.test.tsx`
Expected: FAIL (title is "Switch project"; no `.lucide-chevron-down`).

- [ ] **Step 3: Implement**

In `apps/dev-console/src/components/HeaderContext.tsx`, change the lucide import and the button:

```tsx
import { FolderOpen, ChevronDown } from "lucide-react";
```

Change `title="Switch project"` to `title="Manage projects"`, and add the chevron after the name span:

```tsx
        <FolderOpen size={14} color="#fff" />
        <span>{projectName}</span>
        <ChevronDown size={14} color="#fff" aria-hidden />
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter ./apps/dev-console exec vitest run src/__tests__/headerContext.test.tsx`
Expected: PASS (all HeaderContext tests).

- [ ] **Step 5: Commit**

```bash
git add apps/dev-console/src/components/HeaderContext.tsx apps/dev-console/src/__tests__/headerContext.test.tsx
git commit -m "feat(dev-console): header button signals 'Manage projects' (chevron + tooltip)"
```

---

### Task 2: `useProjectWatcher` hook (extract + fix watch/unwatch leak & race)

**Files:**
- Create: `apps/dev-console/src/hooks/useProjectWatcher.ts`
- Create: `apps/dev-console/src/hooks/__tests__/useProjectWatcher.test.tsx`
- Modify: `apps/dev-console/src/App.tsx` (replace inline watch effect; lines 16, 77-96)

**Interfaces:**
- Consumes: `watchProject`, `unwatchProject`, `onFileChanged` from `../ipc/watcher.js`.
- Produces: `export function useProjectWatcher(rootPath: string | null | undefined, qc: QueryClient): void`.

- [ ] **Step 1: Write the failing test**

Create `apps/dev-console/src/hooks/__tests__/useProjectWatcher.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import type { QueryClient } from "@tanstack/react-query";
import { useProjectWatcher } from "../useProjectWatcher.js";
import { watchProject, unwatchProject, onFileChanged } from "../../ipc/watcher.js";

vi.mock("../../ipc/watcher.js", () => ({
  watchProject: vi.fn(),
  unwatchProject: vi.fn().mockResolvedValue(undefined),
  onFileChanged: vi.fn(),
}));

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

const qc = { invalidateQueries: vi.fn() } as unknown as QueryClient;

beforeEach(() => {
  vi.clearAllMocks();
  (watchProject as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
  (onFileChanged as ReturnType<typeof vi.fn>).mockResolvedValue(() => {});
});

describe("useProjectWatcher", () => {
  it("watches the root on mount and invalidates the scan on file change", async () => {
    let handler: (() => void) | undefined;
    (onFileChanged as ReturnType<typeof vi.fn>).mockImplementation((h: () => void) => {
      handler = h;
      return Promise.resolve(() => {});
    });
    renderHook(() => useProjectWatcher("/a", qc));
    await waitFor(() => expect(watchProject).toHaveBeenCalledWith("/a"));
    await waitFor(() => expect(handler).toBeTypeOf("function"));
    handler!();
    expect(qc.invalidateQueries).toHaveBeenCalledWith({ queryKey: ["scan", "/a"] });
  });

  it("does no work when rootPath is null", () => {
    renderHook(() => useProjectWatcher(null, qc));
    expect(watchProject).not.toHaveBeenCalled();
    expect(unwatchProject).not.toHaveBeenCalled();
  });

  it("unwatches the old root on unmount", async () => {
    const { unmount } = renderHook(() => useProjectWatcher("/a", qc));
    await waitFor(() => expect(watchProject).toHaveBeenCalledWith("/a"));
    unmount();
    await waitFor(() => expect(unwatchProject).toHaveBeenCalledWith("/a"));
    expect(unwatchProject).toHaveBeenCalledTimes(1);
  });

  it("unwatches the old root only AFTER its watchProject resolves, and watches the new root", async () => {
    const d = deferred<void>();
    (watchProject as ReturnType<typeof vi.fn>).mockReturnValueOnce(d.promise); // "/a" pending
    const { rerender } = renderHook(({ rp }) => useProjectWatcher(rp, qc), {
      initialProps: { rp: "/a" },
    });
    rerender({ rp: "/b" }); // cleanup for "/a" scheduled, but watchProject("/a") still pending
    expect(unwatchProject).not.toHaveBeenCalled();
    d.resolve(); // now "/a" watch resolves
    await waitFor(() => expect(unwatchProject).toHaveBeenCalledWith("/a"));
    expect(unwatchProject).toHaveBeenCalledTimes(1);
    expect(watchProject).toHaveBeenCalledWith("/b");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter ./apps/dev-console exec vitest run src/hooks/__tests__/useProjectWatcher.test.tsx`
Expected: FAIL ("Failed to resolve import ../useProjectWatcher.js").

- [ ] **Step 3: Create the hook**

Create `apps/dev-console/src/hooks/useProjectWatcher.ts`:

```tsx
import { useEffect } from "react";
import type { QueryClient } from "@tanstack/react-query";
import { watchProject, unwatchProject, onFileChanged } from "../ipc/watcher.js";

export function useProjectWatcher(
  rootPath: string | null | undefined,
  qc: QueryClient,
): void {
  useEffect(() => {
    if (!rootPath) return;
    const root = rootPath;
    let aborted = false;
    let cleanup: (() => void) | null = null;
    const watching = watchProject(root)
      .then(() => {
        if (aborted) return;
        return onFileChanged(() => {
          void qc.invalidateQueries({ queryKey: ["scan", root] });
        });
      })
      .then((unlisten) => {
        if (unlisten) cleanup = unlisten;
      });
    return () => {
      aborted = true;
      cleanup?.();
      // Chain unwatch onto the watch promise so unwatch_project is sent only
      // after watch_project has resolved (handle inserted). A bare
      // `void unwatchProject(root)` races the pending watch and can leak.
      void watching.finally(() => unwatchProject(root));
    };
  }, [rootPath, qc]);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter ./apps/dev-console exec vitest run src/hooks/__tests__/useProjectWatcher.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Wire the hook into `App.tsx`**

In `apps/dev-console/src/App.tsx`, replace the watcher import (line 16):

```tsx
import { useProjectWatcher } from "./hooks/useProjectWatcher.js";
```

Delete the entire inline watch `useEffect` (the `// File watcher …` comment block, lines 77-96) and replace it with:

```tsx
  // File watcher — invalidate scan on external changes (teardown-safe)
  useProjectWatcher(active?.rootPath, qc);
```

- [ ] **Step 6: Typecheck + full dev-console test suite (no regressions)**

Run: `pnpm --filter ./apps/dev-console typecheck && pnpm --filter ./apps/dev-console exec vitest run`
Expected: typecheck clean; all tests pass (the removed import leaves no dangling reference).

- [ ] **Step 7: Commit**

```bash
git add apps/dev-console/src/hooks/useProjectWatcher.ts apps/dev-console/src/hooks/__tests__/useProjectWatcher.test.tsx apps/dev-console/src/App.tsx
git commit -m "fix(dev-console): extract useProjectWatcher; unwatch old root (no watcher leak/race)"
```

---

### Task 3: `ProjectNameField` component

**Files:**
- Create: `apps/dev-console/src/components/ProjectNameField.tsx`
- Create: `apps/dev-console/src/components/__tests__/ProjectNameField.test.tsx`

**Interfaces:**
- Consumes: `useTokens` from `@cyoda/console-design-system`.
- Produces: `export function ProjectNameField({ name, rootPath, onCommit }: { name: string; rootPath: string; onCommit: (name: string) => void }): JSX.Element`. Input has `aria-label="Project name"`; chips are `<button>`s whose accessible name is the folder segment.

- [ ] **Step 1: Write the failing tests**

Create `apps/dev-console/src/components/__tests__/ProjectNameField.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, createEvent } from "@testing-library/react";
import "@testing-library/jest-dom";
import { ThemeProvider } from "@cyoda/console-design-system";
import { ProjectNameField } from "../ProjectNameField.js";

function wrap(ui: React.ReactElement) {
  return render(<ThemeProvider>{ui}</ThemeProvider>);
}
const ROOT = "/Users/paul/projects/order-management-demo";

describe("ProjectNameField", () => {
  it("renders an input prefilled with the name", () => {
    wrap(<ProjectNameField name="my-proj" rootPath={ROOT} onCommit={vi.fn()} />);
    expect(screen.getByLabelText("Project name")).toHaveValue("my-proj");
  });

  it("commits a new value on Enter", () => {
    const onCommit = vi.fn();
    wrap(<ProjectNameField name="my-proj" rootPath={ROOT} onCommit={onCommit} />);
    const input = screen.getByLabelText("Project name");
    fireEvent.change(input, { target: { value: "renamed" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith("renamed");
  });

  it("commits a new value on blur", () => {
    const onCommit = vi.fn();
    wrap(<ProjectNameField name="my-proj" rootPath={ROOT} onCommit={onCommit} />);
    const input = screen.getByLabelText("Project name");
    fireEvent.change(input, { target: { value: "renamed" } });
    fireEvent.blur(input);
    expect(onCommit).toHaveBeenCalledWith("renamed");
  });

  it("trims surrounding whitespace before committing", () => {
    const onCommit = vi.fn();
    wrap(<ProjectNameField name="my-proj" rootPath={ROOT} onCommit={onCommit} />);
    const input = screen.getByLabelText("Project name");
    fireEvent.change(input, { target: { value: "  spaced  " } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onCommit).toHaveBeenCalledWith("spaced");
  });

  it("does not commit empty/whitespace and reverts the input", () => {
    const onCommit = vi.fn();
    wrap(<ProjectNameField name="my-proj" rootPath={ROOT} onCommit={onCommit} />);
    const input = screen.getByLabelText("Project name");
    fireEvent.change(input, { target: { value: "   " } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onCommit).not.toHaveBeenCalled();
    expect(input).toHaveValue("my-proj");
  });

  it("does not commit the unchanged name (Enter or blur) and keeps it shown", () => {
    const onCommit = vi.fn();
    wrap(<ProjectNameField name="my-proj" rootPath={ROOT} onCommit={onCommit} />);
    const input = screen.getByLabelText("Project name");
    fireEvent.keyDown(input, { key: "Enter" });
    fireEvent.blur(input);
    expect(onCommit).not.toHaveBeenCalled();
    expect(input).toHaveValue("my-proj");
  });

  it("reverts to the name on Escape without committing", () => {
    const onCommit = vi.fn();
    wrap(<ProjectNameField name="my-proj" rootPath={ROOT} onCommit={onCommit} />);
    const input = screen.getByLabelText("Project name");
    fireEvent.change(input, { target: { value: "scratch" } });
    fireEvent.keyDown(input, { key: "Escape" });
    expect(onCommit).not.toHaveBeenCalled();
    expect(input).toHaveValue("my-proj");
  });

  it("caps the input length at 200", () => {
    wrap(<ProjectNameField name="my-proj" rootPath={ROOT} onCommit={vi.fn()} />);
    expect(screen.getByLabelText("Project name")).toHaveAttribute("maxlength", "200");
  });

  it("renders a chip per unique trailing folder segment (last 5), including the leaf", () => {
    wrap(<ProjectNameField name="x" rootPath="/a/b/c/d/e/f/order" onCommit={vi.fn()} />);
    // last 5 of [a,b,c,d,e,f,order] => [c,d,e,f,order]
    expect(screen.getByRole("button", { name: "order" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "c" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "a" })).toBeNull();
    expect(screen.queryByRole("button", { name: "b" })).toBeNull();
  });

  it("drops empty and duplicate segments (trailing slash / repeats)", () => {
    wrap(<ProjectNameField name="x" rootPath="/a/build/build/" onCommit={vi.fn()} />);
    expect(screen.getAllByRole("button", { name: "build" })).toHaveLength(1);
  });

  it("renders no chips for an empty or root path", () => {
    const { rerender } = wrap(<ProjectNameField name="x" rootPath="/" onCommit={vi.fn()} />);
    expect(screen.queryByText("Use a folder name:")).toBeNull();
    rerender(<ThemeProvider><ProjectNameField name="x" rootPath="" onCommit={vi.fn()} /></ThemeProvider>);
    expect(screen.queryByText("Use a folder name:")).toBeNull();
  });

  it("renders exactly one chip for a single-segment path", () => {
    wrap(<ProjectNameField name="x" rootPath="/Projects" onCommit={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Projects" })).toBeInTheDocument();
  });

  it("commits the segment once when a chip is clicked and shows it in the input", () => {
    const onCommit = vi.fn();
    wrap(<ProjectNameField name="x" rootPath={ROOT} onCommit={onCommit} />);
    fireEvent.click(screen.getByRole("button", { name: "order-management-demo" }));
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith("order-management-demo");
    expect(screen.getByLabelText("Project name")).toHaveValue("order-management-demo");
  });

  it("does not commit a chip whose segment exceeds 200 chars", () => {
    const long = "z".repeat(250);
    const onCommit = vi.fn();
    wrap(<ProjectNameField name="x" rootPath={`/a/${long}`} onCommit={onCommit} />);
    fireEvent.click(screen.getByRole("button", { name: long }));
    expect(onCommit).not.toHaveBeenCalled();
  });

  it("renders chips as native buttons (keyboard-operable) with the segment as the name", () => {
    wrap(<ProjectNameField name="x" rootPath={ROOT} onCommit={vi.fn()} />);
    const chip = screen.getByRole("button", { name: "projects" });
    expect(chip.tagName).toBe("BUTTON");
    expect(chip).toHaveAttribute("type", "button");
  });

  it("prevents the input from blurring when a chip is pressed (mousedown preventDefault)", () => {
    wrap(<ProjectNameField name="x" rootPath={ROOT} onCommit={vi.fn()} />);
    const chip = screen.getByRole("button", { name: "projects" });
    const ev = createEvent.mouseDown(chip);
    fireEvent(chip, ev);
    expect(ev.defaultPrevented).toBe(true);
  });

  it("preserves unsaved text when the name prop changes, and a later chip click still commits", () => {
    const onCommit = vi.fn();
    const { rerender } = wrap(<ProjectNameField name="a" rootPath={ROOT} onCommit={onCommit} />);
    const input = screen.getByLabelText("Project name");
    fireEvent.change(input, { target: { value: "draft" } });
    rerender(<ThemeProvider><ProjectNameField name="b" rootPath={ROOT} onCommit={onCommit} /></ThemeProvider>);
    expect(input).toHaveValue("draft"); // mount-once seed: not clobbered
    fireEvent.click(screen.getByRole("button", { name: "order-management-demo" }));
    expect(onCommit).toHaveBeenCalledWith("order-management-demo");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter ./apps/dev-console exec vitest run src/components/__tests__/ProjectNameField.test.tsx`
Expected: FAIL ("Failed to resolve import ../ProjectNameField.js").

- [ ] **Step 3: Implement the component**

Create `apps/dev-console/src/components/ProjectNameField.tsx`:

```tsx
import { useState } from "react";
import { useTokens } from "@cyoda/console-design-system";

const MAX_NAME = 200;
const CHIP_LIMIT = 5;

function chipSegments(rootPath: string): string[] {
  const unique: string[] = [];
  for (const seg of rootPath.split("/").filter(Boolean)) {
    if (!unique.includes(seg)) unique.push(seg);
  }
  return unique.slice(-CHIP_LIMIT);
}

export function ProjectNameField({
  name,
  rootPath,
  onCommit,
}: {
  name: string;
  rootPath: string;
  onCommit: (name: string) => void;
}) {
  const t = useTokens();
  const [value, setValue] = useState(name); // mount-once seed; not re-seeded on prop change

  const commit = (raw: string) => {
    const next = raw.trim();
    if (next.length >= 1 && next.length <= MAX_NAME && next !== name) {
      onCommit(next);
      setValue(next);
    } else {
      setValue(name); // rejected/empty/unchanged → revert visible value
    }
  };

  const segments = chipSegments(rootPath);

  return (
    <div>
      <div style={{ fontSize: t.font.sizes.sm, fontWeight: 600, marginBottom: 2 }}>
        Project name
      </div>
      <input
        aria-label="Project name"
        value={value}
        maxLength={MAX_NAME}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit(value);
          else if (e.key === "Escape") setValue(name);
        }}
        onBlur={() => commit(value)}
        style={{
          width: "100%",
          boxSizing: "border-box",
          height: 26,
          padding: "0 8px",
          fontFamily: t.font.sans,
          fontSize: t.font.sizes.md,
          border: `1px solid ${t.color.border}`,
          borderRadius: t.radius.sm,
          background: t.color.surface,
          color: t.color.text,
          outline: "none",
        }}
      />
      {segments.length > 0 && (
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: t.space.xs,
            marginTop: t.space.xs,
          }}
        >
          <span style={{ fontSize: t.font.sizes.sm, color: t.color.textMuted }}>
            Use a folder name:
          </span>
          {segments.map((seg, i) => (
            <button
              key={`${seg}-${i}`}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => commit(seg)}
              style={{
                fontFamily: t.font.sans,
                fontSize: t.font.sizes.sm,
                color: t.color.text,
                background: t.color.surfaceMuted,
                border: `1px solid ${t.color.border}`,
                borderRadius: t.radius.sm,
                padding: "2px 8px",
                cursor: "pointer",
              }}
            >
              {seg}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter ./apps/dev-console exec vitest run src/components/__tests__/ProjectNameField.test.tsx`
Expected: PASS (18 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/dev-console/src/components/ProjectNameField.tsx apps/dev-console/src/components/__tests__/ProjectNameField.test.tsx
git commit -m "feat(dev-console): add ProjectNameField (editable name + folder chips)"
```

---

### Task 4: Generic `ConfirmModal` (refactor `ConfirmRemoveModal`)

**Files:**
- Modify: `apps/dev-console/src/routes/settings.tsx` (replace `ConfirmRemoveModal` def at lines 10-43 and its use at line 371-377)
- Test: `apps/dev-console/src/__tests__/settings.test.tsx`

**Interfaces:**
- Produces: `function ConfirmModal({ title, body, confirmLabel, confirmVariant = "primary", onConfirm, onCancel }: { title: string; body: ReactNode; confirmLabel: string; confirmVariant?: "primary" | "danger"; onConfirm: () => void; onCancel: () => void }): JSX.Element`. Consumed by the remove flow now and the root-change flow in Task 6.

- [ ] **Step 1: Add a failing test**

Append to `apps/dev-console/src/__tests__/settings.test.tsx` (add `fireEvent` to the `@testing-library/react` import if not present):

```tsx
  it("removes a project via the shared confirm modal (bolded name in body)", async () => {
    wrap(<SettingsRoute />);
    await waitFor(() => screen.getByRole("button", { name: /remove/i }));
    fireEvent.click(screen.getByRole("button", { name: /remove/i }));
    await waitFor(() => expect(screen.getByText("Remove project?")).toBeInTheDocument());
    // the project name renders bold inside the modal body
    const strong = screen.getByText("order-demo", { selector: "strong" });
    expect(strong).toBeInTheDocument();
    const { saveAppConfig } = await import("../ipc/config.js");
    fireEvent.click(screen.getAllByRole("button", { name: /remove/i }).at(-1)!);
    await waitFor(() => expect(saveAppConfig).toHaveBeenCalled());
    const saved = (saveAppConfig as ReturnType<typeof vi.fn>).mock.calls.at(-1)![0];
    expect(saved.recentProjects.find((p: { id: string }) => p.id === "proj-1")).toBeUndefined();
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter ./apps/dev-console exec vitest run src/__tests__/settings.test.tsx -t "shared confirm modal"`
Expected: FAIL initially only if behavior differs; it may PASS against the current `ConfirmRemoveModal` (same text). If it passes, proceed — Step 3 is a safe refactor that must keep it green. (This test is the regression guard for the extraction.)

- [ ] **Step 3: Refactor to `ConfirmModal`**

In `apps/dev-console/src/routes/settings.tsx`, add to the React import at line 1:

```tsx
import { useState, type ReactNode } from "react";
```

Replace the entire `ConfirmRemoveModal` function (lines 10-43) with:

```tsx
function ConfirmModal({
  title,
  body,
  confirmLabel,
  confirmVariant = "primary",
  onConfirm,
  onCancel,
}: {
  title: string;
  body: ReactNode;
  confirmLabel: string;
  confirmVariant?: "primary" | "danger";
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const t = useTokens();
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.4)",
        display: "grid",
        placeItems: "center",
        zIndex: 1000,
      }}
    >
      <Panel title={title}>
        <p style={{ fontFamily: t.font.sans, fontSize: t.font.sizes.md, color: t.color.text, margin: `0 0 ${t.space.sm}` }}>
          {body}
        </p>
        <div style={{ display: "flex", gap: t.space.sm, justifyContent: "flex-end", marginTop: t.space.md }}>
          <Button variant="secondary" onClick={onCancel}>Cancel</Button>
          <Button variant={confirmVariant} onClick={onConfirm}>{confirmLabel}</Button>
        </div>
      </Panel>
    </div>
  );
}
```

Then replace the remove-modal usage (the `{confirmRemoveId !== null && (<ConfirmRemoveModal …/>)}` block near line 371) with:

```tsx
    {confirmRemoveId !== null && (
      <ConfirmModal
        title="Remove project?"
        body={
          <>
            <strong>
              {configQ.data?.recentProjects.find((p) => p.id === confirmRemoveId)?.name ?? ""}
            </strong>{" "}
            will be removed from the project list. The files on disk are not affected.
          </>
        }
        confirmLabel="Remove"
        confirmVariant="danger"
        onConfirm={() => { void handleRemove(confirmRemoveId); setConfirmRemoveId(null); }}
        onCancel={() => setConfirmRemoveId(null)}
      />
    )}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter ./apps/dev-console exec vitest run src/__tests__/settings.test.tsx -t "shared confirm modal"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/dev-console/src/routes/settings.tsx apps/dev-console/src/__tests__/settings.test.tsx
git commit -m "refactor(dev-console): extract generic ConfirmModal from ConfirmRemoveModal"
```

---

### Task 5: Project-name section + optimistic `updateProjectField` + test fixtures

**Files:**
- Modify: `apps/dev-console/src/routes/settings.tsx` (import `ProjectNameField`; rewrite `updateProjectField` lines 134-145; render the name section in the Configure block before "Scan configuration", around line 276)
- Test: `apps/dev-console/src/__tests__/settings.test.tsx` (upgrade the mock fixture; add tests)

**Interfaces:**
- Consumes: `ProjectNameField` (Task 3); `updateProjectField` (rewritten).
- Produces: `updateProjectField` now does an optimistic `qc.setQueryData(["app-config"], updated)` and reads `qc.getQueryData(["app-config"]) ?? configQ.data!`.

- [ ] **Step 1: Upgrade the test fixtures + add failing tests**

In `apps/dev-console/src/__tests__/settings.test.tsx`:

(a) Add `workflowRoot: null` and `entityRoot: null` to the mocked project (in the `loadAppConfig` `recentProjects[0]`).

(b) Replace the `projectStore` mock with a hoisted, mutable one:

```tsx
const store = vi.hoisted(() => ({
  active: null as null | { id: string },
  setActive: vi.fn(),
  clearActive: vi.fn(),
}));
vi.mock("../state/projectStore.js", () => ({
  useProjectStore: vi.fn((selector: (s: typeof store) => unknown) => selector(store)),
}));
```

In `beforeEach`, reset it: `store.active = null; store.setActive.mockClear();`.

(c) Add tests:

```tsx
  it("shows the Project name input in the Configure panel", async () => {
    wrap(<SettingsRoute />);
    await waitFor(() => screen.getByRole("button", { name: /configure/i }));
    fireEvent.click(screen.getByRole("button", { name: /configure/i }));
    expect(screen.getByLabelText("Project name")).toBeInTheDocument();
  });

  it("persists an edited name", async () => {
    const { saveAppConfig } = await import("../ipc/config.js");
    wrap(<SettingsRoute />);
    await waitFor(() => screen.getByRole("button", { name: /configure/i }));
    fireEvent.click(screen.getByRole("button", { name: /configure/i }));
    const input = screen.getByLabelText("Project name");
    fireEvent.change(input, { target: { value: "Renamed Project" } });
    fireEvent.blur(input);
    await waitFor(() => {
      const saved = (saveAppConfig as ReturnType<typeof vi.fn>).mock.calls.at(-1)![0];
      expect(saved.recentProjects.find((p: { id: string }) => p.id === "proj-1").name).toBe("Renamed Project");
    });
  });

  it("re-setActives the active project after an edit", async () => {
    store.active = { id: "proj-1" };
    wrap(<SettingsRoute />);
    await waitFor(() => screen.getByRole("button", { name: /configure/i }));
    fireEvent.click(screen.getByRole("button", { name: /configure/i }));
    const input = screen.getByLabelText("Project name");
    fireEvent.change(input, { target: { value: "Active Renamed" } });
    fireEvent.blur(input);
    await waitFor(() =>
      expect(store.setActive).toHaveBeenCalledWith(
        expect.objectContaining({ id: "proj-1", name: "Active Renamed" }),
      ),
    );
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter ./apps/dev-console exec vitest run src/__tests__/settings.test.tsx -t "Project name|persists an edited name|re-setActives"`
Expected: FAIL (no "Project name" input yet).

- [ ] **Step 3: Make `updateProjectField` optimistic**

In `apps/dev-console/src/routes/settings.tsx`, replace `updateProjectField` (lines 134-145) with:

```tsx
  const updateProjectField = async (projectId: string, patch: Partial<DevProject>) => {
    const current = qc.getQueryData<AppConfig>(["app-config"]) ?? configQ.data!;
    const updated: AppConfig = {
      ...current,
      recentProjects: current.recentProjects.map((p) =>
        p.id === projectId ? { ...p, ...patch } : p,
      ),
    };
    qc.setQueryData(["app-config"], updated); // optimistic: next edit reads this
    await saveMutation.mutateAsync(updated);
    const updatedProject = updated.recentProjects.find((p) => p.id === projectId);
    if (updatedProject && active?.id === projectId) setActive(updatedProject);
  };
```

- [ ] **Step 4: Render the name section**

In the `configOpen` block, insert the name section immediately before the `Scan configuration` label `<div>` (the one at ~line 276). Add the import at line 8 area:

```tsx
import { ProjectNameField } from "../components/ProjectNameField.js";
```

Insert:

```tsx
                    <ProjectNameField
                      name={p.name}
                      rootPath={p.rootPath}
                      onCommit={(name) => void updateProjectField(p.id, { name })}
                    />

```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm --filter ./apps/dev-console exec vitest run src/__tests__/settings.test.tsx`
Expected: PASS (all settings tests, including the three new ones and the Task 4 remove test).

- [ ] **Step 6: Commit**

```bash
git add apps/dev-console/src/routes/settings.tsx apps/dev-console/src/__tests__/settings.test.tsx
git commit -m "feat(dev-console): edit project name in Configure; optimistic updateProjectField"
```

---

### Task 6: Root-folder change (row + confirm) + concurrent-edit coverage

**Files:**
- Modify: `apps/dev-console/src/routes/settings.tsx` (state + `handleChangeRoot`; Root-folder row in the Configure block; render the change-root `ConfirmModal`)
- Test: `apps/dev-console/src/__tests__/settings.test.tsx`

**Interfaces:**
- Consumes: `ConfirmModal` (Task 4), `updateProjectField` (Task 5), `selectProjectRoot` (existing), `FilePath`, `Button`.
- Produces: a "Root folder" row with a "Change…" button; `handleChangeRoot(p)`; a `confirmRootChange` state object `{ id: string; abs: string } | null`.

- [ ] **Step 1: Add failing tests**

In `apps/dev-console/src/__tests__/settings.test.tsx`, add (these reconfigure the `selectProjectRoot` mock per test via `vi.mocked`):

```tsx
  it("shows the Root folder row with a Change button", async () => {
    wrap(<SettingsRoute />);
    await waitFor(() => screen.getByRole("button", { name: /configure/i }));
    fireEvent.click(screen.getByRole("button", { name: /configure/i }));
    expect(screen.getByText("Root folder")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /change…|change/i })).toBeInTheDocument();
  });

  it("changes root and resets scan roots (no confirm when both already null)", async () => {
    const { selectProjectRoot } = await import("../ipc/project.js");
    (selectProjectRoot as ReturnType<typeof vi.fn>).mockResolvedValueOnce("/new/root");
    const { saveAppConfig } = await import("../ipc/config.js");
    wrap(<SettingsRoute />);
    await waitFor(() => screen.getByRole("button", { name: /configure/i }));
    fireEvent.click(screen.getByRole("button", { name: /configure/i }));
    fireEvent.click(screen.getByRole("button", { name: /change/i }));
    await waitFor(() => {
      const saved = (saveAppConfig as ReturnType<typeof vi.fn>).mock.calls.at(-1)![0];
      const proj = saved.recentProjects.find((p: { id: string }) => p.id === "proj-1");
      expect(proj.rootPath).toBe("/new/root");
      expect(proj.workflowRoot).toBeNull();
      expect(proj.entityRoot).toBeNull();
    });
    expect(screen.queryByText("Change root folder?")).toBeNull();
  });

  it("cancelled folder picker changes nothing", async () => {
    const { selectProjectRoot } = await import("../ipc/project.js");
    (selectProjectRoot as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);
    const { saveAppConfig } = await import("../ipc/config.js");
    (saveAppConfig as ReturnType<typeof vi.fn>).mockClear();
    wrap(<SettingsRoute />);
    await waitFor(() => screen.getByRole("button", { name: /configure/i }));
    fireEvent.click(screen.getByRole("button", { name: /configure/i }));
    fireEvent.click(screen.getByRole("button", { name: /change/i }));
    await new Promise((r) => setTimeout(r, 0));
    expect(saveAppConfig).not.toHaveBeenCalled();
    expect(screen.queryByText("Change root folder?")).toBeNull();
  });

  it("picking the current root is a no-op", async () => {
    const { selectProjectRoot } = await import("../ipc/project.js");
    (selectProjectRoot as ReturnType<typeof vi.fn>).mockResolvedValueOnce("/projects/order-demo");
    const { saveAppConfig } = await import("../ipc/config.js");
    (saveAppConfig as ReturnType<typeof vi.fn>).mockClear();
    wrap(<SettingsRoute />);
    await waitFor(() => screen.getByRole("button", { name: /configure/i }));
    fireEvent.click(screen.getByRole("button", { name: /configure/i }));
    fireEvent.click(screen.getByRole("button", { name: /change/i }));
    await new Promise((r) => setTimeout(r, 0));
    expect(saveAppConfig).not.toHaveBeenCalled();
  });

  it("confirms before resetting scan roots when one is set", async () => {
    const { loadAppConfig, saveAppConfig } = await import("../ipc/config.js");
    (loadAppConfig as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      version: 1,
      activeProjectId: "proj-1",
      recentProjects: [{
        id: "proj-1", name: "order-demo", rootPath: "/projects/order-demo",
        workflowGlobs: ["**/*.json"], entityGlobs: ["**/*.json"],
        workflowRoot: "models/workflows", entityRoot: null,
        createdAt: "2026-01-01T00:00:00.000Z", lastOpenedAt: "2026-01-01T00:00:00.000Z",
      }],
    });
    const { selectProjectRoot } = await import("../ipc/project.js");
    (selectProjectRoot as ReturnType<typeof vi.fn>).mockResolvedValueOnce("/new/root");
    wrap(<SettingsRoute />);
    await waitFor(() => screen.getByRole("button", { name: /configure/i }));
    fireEvent.click(screen.getByRole("button", { name: /configure/i }));
    fireEvent.click(screen.getByRole("button", { name: /change/i }));
    await waitFor(() => expect(screen.getByText("Change root folder?")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /change root/i }));
    await waitFor(() => {
      const saved = (saveAppConfig as ReturnType<typeof vi.fn>).mock.calls.at(-1)![0];
      const proj = saved.recentProjects.find((p: { id: string }) => p.id === "proj-1");
      expect(proj.rootPath).toBe("/new/root");
      expect(proj.workflowRoot).toBeNull();
    });
  });

  it("does not persist a non-active project edit via setActive", async () => {
    // store.active stays null (default) → editing this project must not call setActive
    const { saveAppConfig } = await import("../ipc/config.js");
    wrap(<SettingsRoute />);
    await waitFor(() => screen.getByRole("button", { name: /configure/i }));
    fireEvent.click(screen.getByRole("button", { name: /configure/i }));
    const input = screen.getByLabelText("Project name");
    fireEvent.change(input, { target: { value: "NonActive" } });
    fireEvent.blur(input);
    await waitFor(() => expect(saveAppConfig).toHaveBeenCalled());
    expect(store.setActive).not.toHaveBeenCalled();
  });

  it("composes a name edit and a root change (optimistic update)", async () => {
    const { selectProjectRoot } = await import("../ipc/project.js");
    (selectProjectRoot as ReturnType<typeof vi.fn>).mockResolvedValueOnce("/new/root");
    const { saveAppConfig } = await import("../ipc/config.js");
    wrap(<SettingsRoute />);
    await waitFor(() => screen.getByRole("button", { name: /configure/i }));
    fireEvent.click(screen.getByRole("button", { name: /configure/i }));
    const input = screen.getByLabelText("Project name");
    fireEvent.change(input, { target: { value: "Both" } });
    fireEvent.blur(input);                                   // edit 1: name
    fireEvent.click(screen.getByRole("button", { name: /change/i })); // edit 2: root
    await waitFor(() => {
      const saved = (saveAppConfig as ReturnType<typeof vi.fn>).mock.calls.at(-1)![0];
      const proj = saved.recentProjects.find((p: { id: string }) => p.id === "proj-1");
      expect(proj.name).toBe("Both");
      expect(proj.rootPath).toBe("/new/root");
    });
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter ./apps/dev-console exec vitest run src/__tests__/settings.test.tsx -t "Root folder|changes root|cancelled folder|current root|confirms before|non-active|composes"`
Expected: FAIL (no "Root folder" row / Change button yet).

- [ ] **Step 3: Add state + handler**

In `apps/dev-console/src/routes/settings.tsx`, add state next to the other `useState`s (near line 60):

```tsx
  const [confirmRootChange, setConfirmRootChange] = useState<{ id: string; abs: string } | null>(null);
```

Add handlers (next to `handleBrowseEntityRoot`):

```tsx
  const applyRootChange = (projectId: string, abs: string) =>
    updateProjectField(projectId, { rootPath: abs, workflowRoot: null, entityRoot: null });

  const handleChangeRoot = async (p: DevProject) => {
    const abs = await selectProjectRoot();
    if (!abs || abs === p.rootPath) return;
    if (p.workflowRoot != null || p.entityRoot != null) {
      setConfirmRootChange({ id: p.id, abs });
      return;
    }
    await applyRootChange(p.id, abs);
  };
```

- [ ] **Step 4: Render the Root-folder row**

In the `configOpen` block, immediately after the `<ProjectNameField … />` added in Task 5 (and before the `Scan configuration` label), insert:

```tsx
                    <div>
                      <div style={{ fontSize: t.font.sizes.sm, fontWeight: 600, marginBottom: 2 }}>
                        Root folder
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: t.space.sm }}>
                        <FilePath path={p.rootPath} copyable />
                        <Button variant="secondary" onClick={() => void handleChangeRoot(p)}>
                          Change…
                        </Button>
                      </div>
                    </div>

```

- [ ] **Step 5: Render the change-root confirm modal**

Next to the remove `ConfirmModal` (near line 371), add:

```tsx
    {confirmRootChange !== null && (
      <ConfirmModal
        title="Change root folder?"
        body={
          <>
            The workflow and entity folders are set relative to the current root.
            Changing the root resets them to Auto-detect.
          </>
        }
        confirmLabel="Change root"
        onConfirm={() => {
          const { id, abs } = confirmRootChange;
          void applyRootChange(id, abs);
          setConfirmRootChange(null);
        }}
        onCancel={() => setConfirmRootChange(null)}
      />
    )}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `pnpm --filter ./apps/dev-console exec vitest run src/__tests__/settings.test.tsx`
Expected: PASS (all settings tests).

- [ ] **Step 7: Commit**

```bash
git add apps/dev-console/src/routes/settings.tsx apps/dev-console/src/__tests__/settings.test.tsx
git commit -m "feat(dev-console): change project root folder (resets scan roots, with confirm)"
```

---

### Final verification (after all tasks)

- [ ] **Build + full test suite + typecheck**

```bash
pnpm build && pnpm test && pnpm --filter ./apps/dev-console typecheck
```
Expected: build succeeds; all suites pass (HeaderContext, ProjectNameField, useProjectWatcher, settings); typecheck clean.

- [ ] **Manual smoke (optional, real browser via the running Tauri app)**

Open Projects → Configure a project: rename via typing and via a folder chip (header updates); change the root folder (scan roots reset; confirm appears only when a scan root was set); the header button shows a chevron and "Manage projects" tooltip. (Per `devconsole-testing-gaps`, the chip blur/click no-double-commit is the one behavior to eyeball here.)
