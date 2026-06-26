# Project naming, root-folder change & header affordance — design

**Date:** 2026-06-25
**Status:** Approved (design); revised after independent review
**Scope:** Dev Console Projects panel (`apps/dev-console/src/routes/settings.tsx`), header (`apps/dev-console/src/components/HeaderContext.tsx`), the file-watch lifecycle (`apps/dev-console/src/App.tsx`), one new component, and a confirm-modal extraction.

## Problem

1. The top-right header button shows the active project's folder name with tooltip
   *"Switch project"* — a weak hint that it opens project management.
2. The project `name` is just the folder basename, set once at creation, never
   editable, so the header name is rarely meaningful.
3. Users cannot rename a project, and the only easy "good name" — an ancestor
   folder — requires retyping.
4. Users cannot change a project's root folder without removing and re-opening.

## Goal

Let users name a project (typing or one-click from a path folder), change its
root folder safely, and make the header button clearly a "manage projects"
control. **Every behavior is covered by an automated test** (TDD) so regressions
surface in `pnpm test`, not in manual use — with one explicit, documented
exception: the chip blur-before-click *ordering* is not unit-testable in
happy-dom (handled by construction; deferred to a browser test).

## Current state (verified)

- `HeaderContext.tsx`: blue button, `FolderOpen` icon + `projectName`, optional
  dirty dot, `title="Switch project"`, `onClick={onProjectClick}`.
- `DevProjectSchema` (`packages/workflow-project-model/src/schema.ts`):
  `name` (1–200 chars), `rootPath` (abs), `workflowRoot`/`entityRoot`
  (**nullable, relative to `rootPath`**), globs, timestamps, uuid `id`.
- `name` set at creation in `settings.tsx` `handleOpenProject` and
  `first-run.tsx` as `path.split("/").pop()`. Never editable.
- `rootPath` consumers: scan query key (`App.tsx:60`), **file-watch effect
  (`App.tsx:78-96`)**, new-file path construction, delete, ProjectExplorer
  (`projectRoot` prop, reveal-in-finder, open-in-ide), `FilePath` display,
  `toRelative()` helper, open-time de-dup.
- **Watcher lifecycle bug (found in review, verified):** the watch effect's
  cleanup calls only `cleanup?.()` (unlistens the JS `project://file-changed`
  event). It **never calls `unwatchProject(oldRoot)`**, and `unwatchProject`
  (`ipc/watcher.ts:9`, Tauri command `unwatch_project`) is called nowhere in the
  frontend. So the scan query refetches on `rootPath` change (keyed on it), but
  the **old Rust-side watcher leaks**. This feature makes changing an active
  project's root a first-class action, so the leak becomes trivially reachable —
  the fix is in scope (Design F).
- Persistence: `updateProjectField(projectId, patch)` (`settings.tsx:134-145`)
  reads `configQ.data!`, merges, saves via `saveAppConfig`, and re-`setActive`
  **only if** `active?.id === projectId`. `selectProjectRoot` already exists for
  folder picking.
- Local input reference: `NewFileInput` (`ProjectExplorer.tsx:546-590`) — mount-
  once local state (no re-seed), Enter/Escape handling, token styling.
- `ConfirmRemoveModal` (`settings.tsx`) is the existing modal pattern; it bolds
  the project name in its body.

## Decisions (from brainstorming)

- **Naming:** editable name field **plus** clickable folder chips from the root
  path; chip click commits immediately.
- **Root change:** a "Change…" button; on change, **reset** `workflowRoot`/
  `entityRoot` to `null` (Auto-detect) because they were relative to the old root.
- **Header:** keep name + folder icon, add a chevron, tooltip → "Manage projects".

## Design

### A. Header affordance — `components/HeaderContext.tsx`

- Add a `ChevronDown` (lucide-react, size 14, white) after `<span>{name}</span>`,
  with **`aria-hidden`** so it does not alter the button's accessible name.
- Change `title` to `"Manage projects"`.
- No change to props, click behavior, or the dirty dot.

### B. New component — `components/ProjectNameField.tsx`

Focused, independently testable. Interface:

```tsx
export function ProjectNameField({
  name,
  rootPath,
  onCommit,
}: {
  name: string;
  rootPath: string;
  onCommit: (name: string) => void;
}): JSX.Element;
```

Behavior:
- Controlled `<input>` (styled like `NewFileInput`), local state **seeded once on
  mount** via `useState(name)`. It is **not** re-seeded from the `name` prop on
  change (a re-seed would clobber in-progress keystrokes when an async
  `saveAppConfig` resolves and bumps `name` — the `NewFileInput` reference
  deliberately avoids this). The parent renders one field per project; switching
  projects remounts the field, so mount-once seeding is correct.
- **Commit guard** `commit(raw)` — used by both the input and chips:
  `const next = raw.trim();` commit only if `next.length >= 1 && next.length <= 200
  && next !== name`; then `onCommit(next)`. Empty/over-long/unchanged → no commit.
- Input: on **Enter** and **blur**, run `commit(value)`. If `commit` does **not**
  fire `onCommit` (value empty/over-long/unchanged after trim), reset the local
  input value back to `name` — so an empty/invalid entry visibly reverts rather
  than lingering. **Escape** resets to `name` without committing. `maxLength={200}`.
- Folder **chips**: `segments = rootPath.split("/").filter(Boolean)` (this drops
  empty segments from leading/trailing/duplicate slashes); de-duplicate while
  preserving order; take the **last 5**. Render each as a native
  `<button type="button">` styled as a chip (native button → keyboard-operable
  and self-labeling for free). To prevent the input's blur from firing a spurious
  commit before the chip's click (real Chromium fires blur-before-click; happy-dom
  does not, so this must be handled by construction, not left to tests), each chip
  uses **`onMouseDown={(e) => e.preventDefault()}`**; its `onClick` calls
  `commit(segment)` and sets the local input value. Because `commit` enforces the
  1–200 length rule, an over-long segment is a no-op (the typed path is capped by
  `maxLength`; this is the same rule for chips). A `rootPath` with zero usable
  segments (`""`, `"/"`) renders no chips.
- Layout: input is `width:100%`/`box-sizing:border-box`; chips wrap. No shrink-to-
  fit width driver is introduced (field/chips live inside the panel-width-
  constrained Configure section).

### C. Root-folder change — `routes/settings.tsx`

A new row inside the expanded Configure section:
- Label "Root folder", `FilePath(rootPath)` (copyable), and a **Change…** `Button`.
- Handler `handleChangeRoot(p)`:
  1. `const abs = await selectProjectRoot();` if `!abs` or `abs === p.rootPath`,
     return (no-op).
  2. If `p.workflowRoot != null || p.entityRoot != null`, open the confirm modal
     (Design D) carrying `abs`; on confirm, apply; on cancel, drop it.
  3. Apply = `updateProjectField(p.id, { rootPath: abs, workflowRoot: null,
     entityRoot: null })`. The scan refetches via its `rootPath`-keyed query; the
     watcher is correctly torn down and re-established by Design F.

### D. Confirm-modal extraction — `routes/settings.tsx`

```tsx
function ConfirmModal({
  title, body, confirmLabel, confirmVariant = "primary", onConfirm, onCancel,
}: {
  title: string; body: ReactNode; confirmLabel: string;
  confirmVariant?: "primary" | "danger"; onConfirm: () => void; onCancel: () => void;
}): JSX.Element;
```

- Reuse the **full** overlay from `ConfirmRemoveModal` (`position:fixed; inset:0;
  background:rgba(0,0,0,0.4); display:grid; placeItems:center; zIndex:1000`) and
  its `Panel` styling; `title` maps to `<Panel title={title}>` (not a duplicated
  heading), and `body` renders inside the panel.
- Re-implement `ConfirmRemoveModal` via `ConfirmModal` (`confirmVariant="danger"`,
  `confirmLabel="Remove"`, body keeps the **bolded project name**) — behavior
  unchanged.
- Root-change confirm: `title="Change root folder?"`, body explaining the
  workflow/entity folders reset to Auto-detect, `confirmLabel="Change root"`.

### E. Configure panel layout — `routes/settings.tsx`

Inside the `configOpen` block, ordered:
1. **Project name** — `<ProjectNameField name={p.name} rootPath={p.rootPath}
   onCommit={(name) => void updateProjectField(p.id, { name })} />`
2. **Root folder** — the row from C.
3. Existing **Scan configuration** (unchanged).

The card header keeps rendering `p.name`; for the active project, edits reflect
immediately because `updateProjectField` re-`setActive`s it.

### F. File-watcher lifecycle — extract `hooks/useProjectWatcher.ts`

The watch logic currently lives inline in `DevConsoleApp` and is hard to unit-
test (it's buried behind providers, routes, `loadAppConfig`, `scanProject`,
etc.). Extract it into a focused, independently testable hook and fix the leak
there.

```tsx
// apps/dev-console/src/hooks/useProjectWatcher.ts
export function useProjectWatcher(rootPath: string | null | undefined, qc: QueryClient): void {
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
      .then((unlisten) => { if (unlisten) cleanup = unlisten; });
    return () => {
      aborted = true;
      cleanup?.();
      // Chain unwatch onto the watch promise so unwatch_project is sent only
      // AFTER watch_project has resolved (handle inserted). A bare
      // `void unwatchProject(root)` races the not-yet-resolved watch_project:
      // unwatch could win the registry lock first (no-op remove), then
      // watch_project inserts a never-aborted task → leak. watch_project and
      // unwatch_project are independent async Tauri commands sharing one
      // Mutex<HashMap> with no ordering guarantee (verified in watcher.rs).
      void watching.finally(() => unwatchProject(root));
    };
  }, [rootPath, qc]);
}
```

`DevConsoleApp` replaces its inline watch `useEffect` with
`useProjectWatcher(active?.rootPath, qc)`. This fixes the leak on both root
change (this feature) and plain project switching (pre-existing), and is
unit-testable by mocking `ipc/watcher` with controllable promises (see test
group below).

### G. Concurrent-edit safety — `updateProjectField` (`routes/settings.tsx`)

The feature adds two mutating controls in one panel (name field + root change),
so two quick edits can both read the same closed-over `configQ.data!` snapshot and
the second `saveAppConfig` clobbers the first (last-write-wins on the whole
`recentProjects` array). Make `updateProjectField` read the latest cache and
write through it optimistically so sequential edits compose:

```tsx
const updateProjectField = async (projectId: string, patch: Partial<DevProject>) => {
  const current = qc.getQueryData<AppConfig>(["app-config"]) ?? configQ.data!;
  const updated: AppConfig = {
    ...current,
    recentProjects: current.recentProjects.map((p) =>
      p.id === projectId ? { ...p, ...patch } : p,
    ),
  };
  qc.setQueryData(["app-config"], updated); // optimistic: next read sees it
  await saveMutation.mutateAsync(updated);
  const updatedProject = updated.recentProjects.find((p) => p.id === projectId);
  if (updatedProject && active?.id === projectId) setActive(updatedProject);
};
```

`saveMutation.onSuccess` still invalidates `["app-config"]` to reconcile with
disk. (`saveAppConfig`/`projectStore` are mocked in tests, so the optimistic
cache write is observable via `qc.getQueryData` / the last `saveAppConfig` call.)

## Files

- Modify: `apps/dev-console/src/components/HeaderContext.tsx` (chevron + tooltip).
- Create: `apps/dev-console/src/components/ProjectNameField.tsx`.
- Modify: `apps/dev-console/src/routes/settings.tsx` (ConfirmModal extraction,
  root-folder row + handler + confirm, Project-name section, `updateProjectField`
  concurrent-edit fix — Design G).
- Create: `apps/dev-console/src/hooks/useProjectWatcher.ts` (Design F).
- Modify: `apps/dev-console/src/App.tsx` (use `useProjectWatcher`, replacing the
  inline watch effect).

No schema change. The IPC surface is unchanged but the existing `unwatchProject`
binding is now actually called (correction to the prior draft, which wrongly
claimed the IPC layer was untouched and the watcher "re-ran automatically").

## Non-goals (YAGNI)

- No breadcrumb/path-tree component; chips are a flat, de-duplicated, capped list.
- No drag-and-drop.
- **Project names need not be unique** — two projects may share a name; we do not
  enforce or warn on collisions.
- No root-path de-duplication/merge when a changed root collides with another
  project's root (open-time de-dup is unchanged).
- No file migration on root change; only stored config changes.
- Rapid root re-toggling (A→B→A before A's unwatch completes) is not specially
  handled; the per-cleanup promise chain covers the common single-change case.

## Test coverage (TDD — every row is a test)

**`components/__tests__/ProjectNameField.test.tsx` (new)**
1. Renders an input prefilled with `name`.
2. Type new value + **Enter** → `onCommit` called once with the trimmed value.
3. Type new value + **blur** → `onCommit` called with the trimmed value.
4. Surrounding whitespace → `onCommit` receives the trimmed string.
5. Empty/whitespace + Enter → `onCommit` **not** called; field reverts to `name`.
6. Unchanged name committed via **Enter or blur** → `onCommit` **not** called,
   input still shows `name`.
7. **Escape** → field reverts to `name`, `onCommit` not called.
8. Input has `maxLength=200`; a typed value cannot exceed it.
9. Renders one chip per *unique* folder segment (≤5); last segment present.
10. Deep `rootPath` (>5 unique segments) → only the last 5 chips render.
11. `rootPath` with trailing slash / duplicate segments → no empty/duplicate chips.
12. `rootPath` of `""` or `"/"` → no chips rendered.
13. Single-segment `rootPath` → exactly one chip.
14. Clicking a chip → `onCommit` called once with that segment; input shows it.
15. Chip whose segment length > 200 → `onCommit` **not** called (the 1–200 guard
    rejects it uniformly; never persists a >200 string).
16. Chips are keyboard-operable (focusable `<button>`, Enter/Space activates and
    commits the segment).
17. Chips set `onMouseDown` `preventDefault` (assert the handler calls
    `preventDefault` on a `mouseDown` event — the structural guard against the
    input blurring before the click). **Note:** the real blur-before-click
    *ordering* (and thus that no double-commit occurs in a real browser) is NOT
    unit-testable in happy-dom — it does not fire blur on mousedown, and a
    synthetic `fireEvent.blur` is not suppressed by `preventDefault`. We verify
    the guard is *present* (this case) and rely on it by construction; the
    end-to-end no-double-commit is a real-browser concern (see Out-of-scope).
18. External `name` prop change while the input holds unsaved text → text is
    **preserved** (mount-once seed; no re-seed clobber). Then a further chip
    click still commits the chip segment once (interleave check).

**`__tests__/settings.test.tsx` (extend)** — the mocked project fixture must
include `workflowRoot: null` and `entityRoot: null` (currently omitted →
`undefined`), and tests that need them override per-case.
19. Configure panel shows the Project-name input and the "Root folder" row.
20. Editing the name + committing persists it (assert `saveAppConfig`'s last call
    contains the new `name` for that project id).
21. **Active** project edit (mock `active` = that project): `setActive` called with
    the patched project (verifies header/propagation path, `settings.tsx:144`).
22. Change root, scan roots **null**: mock `selectProjectRoot`→new path; no confirm
    modal; `saveAppConfig`'s last call has `rootPath` **equal to the mocked picked
    path** and `workflowRoot:null, entityRoot:null`.
23. Change root, a scan root **set** (override the fixture so `workflowRoot` is
    non-null): confirm modal appears; **confirm** persists `rootPath` = the picked
    path + nulled scan roots; **cancel** persists nothing.
24. `selectProjectRoot` returns null (cancelled) → no persistence, no modal.
25. Picked path equals current `rootPath` → no-op.
26. Change root of a **non-active** project (mock `active` = a different project):
    persists the patch; `setActive` **not** called.
27. **Concurrent edit composes:** commit a name, then immediately change the root
    (synchronously, before the first save's refetch) → assert the **last
    `saveAppConfig` call's payload** carries **both** the new name and the new
    root. Assert on the payload, not cache state — the mocked `loadAppConfig`
    refetch would overwrite the optimistic cache, so a cache-timing assertion
    would be flaky. Guards the `updateProjectField` optimistic write (Design G).
28. Remove flow through the extracted `ConfirmModal` still works **and** the body
    shows the **bolded project name** (regression for the extraction).

**`__tests__/headerContext.test.tsx` (extend)**
29. Tooltip is "Manage projects".
30. A chevron renders; it is `aria-hidden` and does not change the button's
    accessible name (still the project name).
31. Clicking the button calls `onProjectClick`.
32. Dirty dot renders only when `dirty` is true.

**`hooks/__tests__/useProjectWatcher.test.tsx` (new — Design F, mock `ipc/watcher`)**
33. On mount with a root → `watchProject(root)` called and `onFileChanged`
    registered; a `project://file-changed` emission invalidates `["scan", root]`.
34. On `rootPath` change → the **new** root is watched **and** `unwatchProject(old)`
    is called exactly once, only **after** the old `watchProject` promise resolves
    (use a deferred/controllable promise to assert ordering: resolve `watchProject`
    late and confirm `unwatchProject` fires after, not before).
35. On unmount → `unwatchProject(root)` called once and the event listener removed.
36. Null/undefined `rootPath` → no watch/unwatch calls.

Test mechanics follow existing patterns: `ProjectNameField` via
`@testing-library/react` + `ThemeProvider` and `fireEvent`. Do **not** drive case
17 with `fireEvent.blur` + `fireEvent.click` — that would dispatch a real blur
(not suppressed by `preventDefault`) and assert the *buggy* double-commit; assert
the `mouseDown` `preventDefault` guard directly instead. `settings`/`headerContext`
reuse the existing IPC/`projectStore` mocks and the `vi.stubGlobal` localStorage
stub; the settings fixture gains `workflowRoot:null`/`entityRoot:null`. Tests that
assert propagation set the `projectStore` mock's `active` to the project under edit
(the current mock hardcodes `active: null`, which makes `setActive` unobservable).
`useProjectWatcher` tests mock `ipc/watcher` (`watchProject`, `unwatchProject`,
`onFileChanged`) and render the hook via a tiny host component or
`@testing-library/react`'s `renderHook`, using deferred promises to assert
watch→unwatch ordering. Persistence assertions inspect the `saveAppConfig` mock's
last call. Post-click/async DOM assertions use `await waitFor`.

New tests live in co-located `__tests__/` dirs (`components/__tests__/`,
`hooks/__tests__/`), matching the existing convention already used by
`src/agent/__tests__/` and `src/assistant/__tests__/` (vitest's default include
picks up nested `__tests__`). The `settings`/`headerContext` extensions stay in
`src/__tests__/` alongside the current files. An end-to-end test of the
`settings.tsx` root change → `App.tsx` `useProjectWatcher` wiring is **not**
added — the hook's unit tests (33–36) cover the lifecycle logic and `App.tsx`
just passes `active?.rootPath`; a full-app render test would be high-cost,
low-yield (consistent with `devconsole-testing-gaps`).

**Mount-once seeding invariant (case 18):** correctness depends on the field
mounting fresh per project — it renders only inside `{configOpen && …}` and
`configureOpenId` is a single id, so at most one panel's field is mounted and each
project's `<Panel>` is keyed by `p.id`. Switching projects (or reopening Configure)
remounts the field, re-seeding from the current `name`. If a future change allowed
multiple Configure panels open at once or reused the field across projects without
remount, the seed could go stale — out of scope now, noted as an invariant.

## Out-of-scope for unit tests (stated honestly)

happy-dom does not compute CSS layout, so chip-wrapping/field-width *visual*
results are not asserted (see `devconsole-testing-gaps`). The feature introduces
no shrink-to-fit width driver, so this is low-risk; verify visually once if
desired.

The chip **blur-before-click ordering** (and thus the end-to-end guarantee that a
chip click never double-commits the input's in-progress text) is **not** unit-
testable in happy-dom: it doesn't fire blur on mousedown, and a synthetic
`fireEvent.blur` isn't cancelled by `preventDefault`. The unit tests verify the
guard is *present* (case 17 asserts `mouseDown` `preventDefault`) and that chip
click commits once (case 14); the real-browser no-double-commit is an end-to-end
concern — the first candidate for a Vitest browser-mode/Playwright test if that
infra is added (see `devconsole-testing-gaps`).
