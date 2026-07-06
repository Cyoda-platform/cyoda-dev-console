# Model Editor MCP — Transition & State Patch Ops Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add six additive, element-level MCP editing tools — `update_transition`/`add_transition`/`remove_transition` and `add_state`/`remove_state`/`rename_state` — to `apps/model-editor-mcp/`, addressing transitions by the `(workflow, state, name)` tuple and states by `(workflow, code)`, so callers patch one element instead of resending the whole ~40 KB document.

**Architecture:** Each tool loads the on-disk workflow, mutates the parsed typed document in memory, then **validates by re-expressing the mutated document as an import-payload string and running `ctx.parseImport` on it** (the same fail-closed path `update_workflow` uses — this is what closes review-flaw C2: never `serializeImport` before validating, because `serializeImport` silently drops a malformed criterion). On success it serializes the clean reparsed document and writes it (confined). `rename_state`/`remove_state` additionally cascade/scan **lifecycle `state` criteria** (review-flaw C1 — a state code also lives in a `LifecycleCriterion.value`, which no validator checks) and migrate the `.layout.json` sidecar's state-keyed node position.

**Tech Stack:** Node + TypeScript (ESM), vitest, `@cyoda/workflow-core@0.4.0` (`parseImportPayload`/`serializeImportPayload`/`validateAll`/exported types), `@cyoda/workflow-editor-host/synthesizeImportPayload`, Zod (`.strict()` input schemas).

**Spec:** `docs/superpowers/specs/2026-07-05-model-editor-mcp-patch-ops-design.md` (read §5 pipeline, §6 per-op, §14/§15 the two review rounds). This plan realizes it.

## Global Constraints

- Confined IO only (`ctx.read`/`ctx.write`/`ctx.deleteFile`); `McpResult` via `ok`/`err`/`validationFailed`; name-based tools resolve via discovery (`findByName`) before any path use; `.strict()` Zod input schemas.
- Content is Claude-owned; the browser never persists content. These tools write **only** the content file (server-side confined `ctx.write`) plus, for two state ops, the best-effort sidecar. Do NOT add a browser content-write path.
- **C2 invariant:** validate a mutated document by `JSON.stringify(...)` → `ctx.parseImport`, NEVER `ctx.serializeImport` before validation. `serializeImport` runs only on the clean, already-validated reparsed document.
- **C1 invariant:** state-code references in `lifecycle` criteria (`field:"state"`, `value` scalar or array, nested via `group.conditions[]` and `function.function.criterion`) are invisible to `validateAll` — `rename_state` cascades them, `remove_state` rejects on them.
- Every new/changed tool is registered in `server/manifest.ts` + the `server/index.ts` dispatcher + a `.strict()` schema in `server/schemas.ts`, with tests (happy path + every error envelope).
- Keep the whole suite green: `pnpm --filter model-editor-mcp test`, `… typecheck`, `… build`, and repo `pnpm lint`. Tool surface goes 18 → 24.
- New/changed code mirrors existing patterns — read `server/tools/update.ts`, `server/tools/workflows_crud.ts`, `server/tools/entities.ts`, `server/context.ts`, `server/discovery.ts`, `server/layout.ts`, `server/envelope.ts` before writing.

---

### Task 1: Shared `validationFailed` envelope helper + retrofit

**Files:**
- Modify: `apps/model-editor-mcp/server/envelope.ts`
- Modify: `apps/model-editor-mcp/server/tools/update.ts:26-28`
- Modify: `apps/model-editor-mcp/server/tools/workflows_crud.ts:37-39`
- Test: `apps/model-editor-mcp/server/__tests__/envelope.test.ts` (create if absent)

**Interfaces:**
- Produces: `validationFailed(issues: ValidationIssue[]): McpResult` — the exact `VALIDATION_FAILED` envelope the six new tools and the two existing tools return.

- [ ] **Step 1: Write the failing test.** Create/append `server/__tests__/envelope.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { validationFailed } from "../envelope.js";
import type { ValidationIssue } from "@cyoda/workflow-core";

describe("validationFailed", () => {
  it("produces the exact VALIDATION_FAILED envelope shape the tools rely on", () => {
    const issues: ValidationIssue[] = [{ severity: "error", code: "x", message: "boom" }];
    const r = validationFailed(issues);
    expect(r).toEqual({
      content: [{ type: "text", text: `VALIDATION_FAILED: ${JSON.stringify(issues)}` }],
      isError: true,
      structuredContent: { code: "VALIDATION_FAILED", diagnostics: issues },
    });
  });
});
```

- [ ] **Step 2: Run it — expect FAIL** (`validationFailed` not exported).

Run: `pnpm --filter model-editor-mcp test -- envelope.test.ts`
Expected: FAIL — `validationFailed is not a function` / import error.

- [ ] **Step 3: Add the helper** to `server/envelope.ts` (after `err`):

```ts
import type { ValidationIssue } from "@cyoda/workflow-core";

/**
 * The `VALIDATION_FAILED` envelope — one source of truth for the shape that
 * `update_workflow`, `create_workflow`, and the six patch tools all return.
 * `err()` cannot produce this because it emits no `structuredContent.code`.
 * Valid both returned and thrown — `makeDispatcher` forwards any `content`-bearing object.
 */
export function validationFailed(issues: ValidationIssue[]): McpResult {
  return {
    content: [{ type: "text", text: `VALIDATION_FAILED: ${JSON.stringify(issues)}` }],
    isError: true,
    structuredContent: { code: "VALIDATION_FAILED", diagnostics: issues },
  };
}
```

- [ ] **Step 4: Retrofit the two existing sites.** In `server/tools/update.ts` replace the hand-rolled block (lines ~26-28) with:

```ts
  if (!parsed.document || parsed.issues.some((i) => i.severity === "error")) {
    return validationFailed(parsed.issues);
  }
```
and add `validationFailed` to the `import { ok, err } from "../envelope.js";` line. Do the identical replacement in `server/tools/workflows_crud.ts` (its `createWorkflowTool` VALIDATION_FAILED block, ~lines 37-39), adding `validationFailed` to its envelope import.

- [ ] **Step 5: Run the affected suites — expect PASS** (helper + unchanged behavior).

Run: `pnpm --filter model-editor-mcp test -- envelope.test.ts update workflows_crud`
Expected: PASS — new helper test green; existing `update`/`workflows_crud` VALIDATION_FAILED assertions still green (output byte-identical).

- [ ] **Step 6: Full suite + typecheck, then commit.**

Run: `pnpm --filter model-editor-mcp test && pnpm --filter model-editor-mcp typecheck`
```bash
git add apps/model-editor-mcp/server/envelope.ts apps/model-editor-mcp/server/tools/update.ts apps/model-editor-mcp/server/tools/workflows_crud.ts apps/model-editor-mcp/server/__tests__/envelope.test.ts
git commit -m "refactor(model-editor-mcp): extract shared validationFailed envelope helper"
```

---

### Task 2: `edit_common.ts` — shared load / commit / criterion-walk machinery

**Files:**
- Create: `apps/model-editor-mcp/server/tools/edit_common.ts`
- Create: `apps/model-editor-mcp/server/__tests__/_editHarness.ts` (shared test ctx factory + fixtures)
- Test: `apps/model-editor-mcp/server/__tests__/edit_common.test.ts`

**Interfaces:**
- Consumes: `validationFailed` (Task 1); `ok`/`err` (`envelope.ts`); `findByName` (`discovery.ts`); `jsonDiff` (`diff.ts`); `synthesizeImportPayload`; `ToolContext` (`context.ts`); `@cyoda/workflow-core` types `WorkflowEditorDocument`/`Workflow`/`State`/`Transition`/`Criterion`/`ValidationIssue`.
- Produces:
  - `LoadedWorkflow = { entry: WorkflowFileIndexEntry; document: WorkflowEditorDocument; workflow: Workflow; before: string }`
  - `loadWorkflowForEdit(ctx: ToolContext, name: string): Promise<LoadedWorkflow>` — throws `err("NOT_FOUND"|"PARSE_ERROR", …)`.
  - `commitEditedWorkflow(ctx: ToolContext, loaded: LoadedWorkflow): Promise<{ path: string; diff: unknown; diagnostics: ValidationIssue[] }>` — throws `validationFailed(issues)`.
  - `walkCriteria(criterion: Criterion | undefined, visit: (c: Criterion) => void): void`
  - `cascadeStateRename(workflow: Workflow, oldCode: string, newCode: string): void`
  - `hasLifecycleStateRef(workflow: Workflow, code: string): boolean`
  - `hasPreviousTransitionRef(workflow: Workflow, transitionName: string): boolean`
  - `makeEditCtx(files: Record<string,string>): ToolContext` (test harness; also exports a `WF_FIXTURE` string).

- [ ] **Step 1: Write the test harness** `server/__tests__/_editHarness.ts`:

```ts
import { parseImportPayload, serializeImportPayload, validateAll } from "@cyoda/workflow-core";
import { synthesizeImportPayload } from "@cyoda/workflow-editor-host/synthesizeImportPayload";
import type { WorkflowFileIndexEntry } from "@cyoda/workflow-file-indexer";
import type { ToolContext } from "../context.js";

/** In-memory ToolContext with REAL workflow-core parse/serialize/validate, so
 *  validation-path tests (C1/C2) exercise the real library, not a mock. */
export function makeEditCtx(files: Record<string, string>): ToolContext {
  const store: Record<string, string> = { ...files };
  return {
    root: "/proj",
    workflowGlobs: ["**/*.json"],
    entityGlobs: [],
    connectionUrl: "http://127.0.0.1:0",
    read: async (rel) => {
      if (!(rel in store)) throw new Error(`ENOENT: ${rel}`);
      return { contents: store[rel], lastModified: "t", sizeBytes: store[rel].length };
    },
    write: async (rel, contents) => { store[rel] = contents; return { path: rel, lastModified: "t", sizeBytes: contents.length }; },
    deleteFile: async (rel) => { delete store[rel]; },
    discover: async () =>
      Object.keys(store)
        .filter((r) => r.endsWith(".json") && !r.endsWith(".layout.json"))
        .map((rel) => {
          let workflows: { name: string }[] = [];
          try {
            const p = parseImportPayload(synthesizeImportPayload(store[rel]));
            workflows = (p.document?.session.workflows ?? []).map((w) => ({ name: w.name }));
          } catch { /* unparseable → no names, still discoverable by basename */ }
          return { relativePath: rel, path: `/proj/${rel}`, workflows, status: "workflow", contents: store[rel], lastModified: "t", sizeBytes: 0 } as unknown as WorkflowFileIndexEntry;
        }),
    discoverEntities: async () => [],
    setGlobs: () => {},
    parseImport: parseImportPayload,
    serializeImport: serializeImportPayload,
    validate: validateAll,
  };
}

/** A minimal valid single-workflow import payload: states draft→review→done,
 *  one transition carries a lifecycle state-criterion (for C1 tests). */
export const WF_FIXTURE = JSON.stringify({
  importMode: "MERGE",
  workflows: [
    {
      version: "1", name: "Order", initialState: "draft", active: true,
      states: {
        draft: { transitions: [{ name: "submit", next: "review", manual: false, disabled: false }] },
        review: { transitions: [{ name: "approve", next: "done", manual: true, disabled: false,
          criterion: { type: "lifecycle", field: "state", operation: "EQUALS", value: "draft" } }] },
        done: { transitions: [] },
      },
    },
  ],
});
```

- [ ] **Step 2: Write failing tests** `server/__tests__/edit_common.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { loadWorkflowForEdit, commitEditedWorkflow, walkCriteria, cascadeStateRename, hasLifecycleStateRef, hasPreviousTransitionRef } from "../tools/edit_common.js";
import { makeEditCtx, WF_FIXTURE } from "./_editHarness.js";
import type { Criterion } from "@cyoda/workflow-core";

describe("loadWorkflowForEdit", () => {
  it("resolves the file + target workflow", async () => {
    const ctx = makeEditCtx({ "Order.json": WF_FIXTURE });
    const loaded = await loadWorkflowForEdit(ctx, "Order");
    expect(loaded.workflow.name).toBe("Order");
    expect(Object.keys(loaded.workflow.states)).toEqual(["draft", "review", "done"]);
  });
  it("throws NOT_FOUND for an unknown workflow", async () => {
    const ctx = makeEditCtx({ "Order.json": WF_FIXTURE });
    await expect(loadWorkflowForEdit(ctx, "Nope")).rejects.toMatchObject({ isError: true, content: [{ text: expect.stringContaining("NOT_FOUND") }] });
  });
});

describe("commitEditedWorkflow", () => {
  it("writes canonical + returns a diff on a valid mutation", async () => {
    const ctx = makeEditCtx({ "Order.json": WF_FIXTURE });
    const loaded = await loadWorkflowForEdit(ctx, "Order");
    loaded.workflow.states.draft.transitions[0].disabled = true;
    const w = vi.spyOn(ctx, "write");
    const r = await commitEditedWorkflow(ctx, loaded);
    expect(w).toHaveBeenCalledTimes(1);
    expect(JSON.parse((w.mock.calls[0][1]))).toBeTruthy();
    expect(r.path).toBe("Order.json");
  });
  it("C2: a malformed criterion is REJECTED (not silently dropped), writing nothing", async () => {
    const ctx = makeEditCtx({ "Order.json": WF_FIXTURE });
    const loaded = await loadWorkflowForEdit(ctx, "Order");
    // inject a structurally-invalid criterion (unknown type)
    (loaded.workflow.states.draft.transitions[0] as unknown as { criterion: unknown }).criterion = { type: "bogus", nope: 1 };
    const w = vi.spyOn(ctx, "write");
    await expect(commitEditedWorkflow(ctx, loaded)).rejects.toMatchObject({ isError: true, structuredContent: { code: "VALIDATION_FAILED" } });
    expect(w).not.toHaveBeenCalled();
  });
  it("rejects a dangling next (semantic gate)", async () => {
    const ctx = makeEditCtx({ "Order.json": WF_FIXTURE });
    const loaded = await loadWorkflowForEdit(ctx, "Order");
    loaded.workflow.states.draft.transitions[0].next = "ghost";
    await expect(commitEditedWorkflow(ctx, loaded)).rejects.toMatchObject({ structuredContent: { code: "VALIDATION_FAILED" } });
  });
});

describe("walkCriteria", () => {
  it("visits nodes nested under group.conditions AND function.function.criterion", () => {
    const seen: string[] = [];
    const c: Criterion = { type: "group", operator: "AND", conditions: [
      { type: "lifecycle", field: "state", operation: "EQUALS", value: "a" },
      { type: "function", function: { name: "f", criterion: { type: "lifecycle", field: "state", operation: "EQUALS", value: "b" } } },
    ] };
    walkCriteria(c, (n) => { if (n.type === "lifecycle") seen.push(String(n.value)); });
    expect(seen.sort()).toEqual(["a", "b"]);
  });
});

describe("cascadeStateRename", () => {
  it("rewrites next, initialState, and lifecycle state-criteria (incl. nested + array), preserving key order", async () => {
    const ctx = makeEditCtx({ "Order.json": WF_FIXTURE });
    const { workflow } = await loadWorkflowForEdit(ctx, "Order");
    // add an array-valued lifecycle state ref nested in a group, on the submit transition
    workflow.states.draft.transitions[0].criterion = { type: "group", operator: "OR", conditions: [
      { type: "lifecycle", field: "state", operation: "EQUALS", value: ["draft", "done"] },
    ] };
    cascadeStateRename(workflow, "draft", "cart");
    expect(Object.keys(workflow.states)).toEqual(["cart", "review", "done"]); // order preserved, key substituted in place
    expect(workflow.initialState).toBe("cart");
    // the review→done transition's lifecycle value "draft" → "cart"
    expect((workflow.states.review.transitions[0].criterion as { value: string }).value).toBe("cart");
    // the array-valued nested one: "draft" → "cart", "done" untouched
    const grp = workflow.states.cart.transitions[0].criterion as { conditions: { value: string[] }[] };
    expect(grp.conditions[0].value).toEqual(["cart", "done"]);
  });
});

describe("ref scans", () => {
  it("hasLifecycleStateRef finds a state referenced by a lifecycle criterion", async () => {
    const ctx = makeEditCtx({ "Order.json": WF_FIXTURE });
    const { workflow } = await loadWorkflowForEdit(ctx, "Order");
    expect(hasLifecycleStateRef(workflow, "draft")).toBe(true); // review→approve criterion references "draft"
    expect(hasLifecycleStateRef(workflow, "review")).toBe(false);
  });
  it("hasPreviousTransitionRef finds a transition referenced by a lifecycle previousTransition criterion", async () => {
    const ctx = makeEditCtx({ "Order.json": WF_FIXTURE });
    const { workflow } = await loadWorkflowForEdit(ctx, "Order");
    workflow.states.done.transitions.push({ name: "reopen", next: "draft", manual: true, disabled: false,
      criterion: { type: "lifecycle", field: "previousTransition", operation: "EQUALS", value: "submit" } } as never);
    expect(hasPreviousTransitionRef(workflow, "submit")).toBe(true);
    expect(hasPreviousTransitionRef(workflow, "approve")).toBe(false);
  });
});
```

- [ ] **Step 3: Run — expect FAIL** (`edit_common.js` missing).

Run: `pnpm --filter model-editor-mcp test -- edit_common.test.ts`
Expected: FAIL — cannot import `../tools/edit_common.js`.

- [ ] **Step 4: Implement** `server/tools/edit_common.ts`:

```ts
import { synthesizeImportPayload } from "@cyoda/workflow-editor-host/synthesizeImportPayload";
import type { WorkflowEditorDocument, Workflow, Criterion, ValidationIssue } from "@cyoda/workflow-core";
import type { WorkflowFileIndexEntry } from "@cyoda/workflow-file-indexer";
import { err, validationFailed } from "../envelope.js";
import type { ToolContext } from "../context.js";
import { findByName } from "../discovery.js";
import { jsonDiff } from "../diff.js";

export interface LoadedWorkflow {
  entry: WorkflowFileIndexEntry;
  document: WorkflowEditorDocument;
  workflow: Workflow;   // a live reference into document.session.workflows — mutate it in place
  before: string;
}

/** Steps 1–2 of the shared pipeline (§5). Throws the error envelope on failure. */
export async function loadWorkflowForEdit(ctx: ToolContext, name: string): Promise<LoadedWorkflow> {
  const entry = findByName(await ctx.discover(), name);
  if (!entry) throw err("NOT_FOUND", `no workflow named "${name}"`);
  const before = (await ctx.read(entry.relativePath)).contents;
  const parsed = ctx.parseImport(synthesizeImportPayload(before));
  if (!parsed.document) throw err("PARSE_ERROR", `workflow "${name}" is not parseable; fix it with update_workflow`);
  const wfs = parsed.document.session.workflows;
  const workflow = wfs.find((w) => w.name === name) ?? (wfs.length === 1 ? wfs[0] : undefined);
  if (!workflow) throw err("NOT_FOUND", `no workflow named "${name}" in "${entry.relativePath}"`);
  return { entry, document: parsed.document, workflow, before };
}

/**
 * Steps 4–5 (§5). Validate the mutated document by re-expressing it as an
 * import-payload string and RE-PARSING it — NOT by serializing first
 * (serialize silently drops a malformed criterion → C2). On any error-severity
 * issue, throw VALIDATION_FAILED (writes nothing). On success, serialize the
 * clean reparsed document and write it, returning a before→after diff.
 */
export async function commitEditedWorkflow(ctx: ToolContext, loaded: LoadedWorkflow): Promise<{ path: string; diff: unknown; diagnostics: ValidationIssue[] }> {
  const { entry, document, before } = loaded;
  const payload = JSON.stringify({ importMode: document.session.importMode ?? "MERGE", workflows: document.session.workflows });
  const parsed = ctx.parseImport(payload);
  if (!parsed.document || parsed.issues.some((i) => i.severity === "error")) {
    throw validationFailed(parsed.issues);
  }
  const canonical = ctx.serializeImport(parsed.document);
  await ctx.write(entry.relativePath, canonical);
  let beforeParsed: unknown = {};
  try { beforeParsed = JSON.parse(before); } catch { /* diff against {} */ }
  const diff = jsonDiff(beforeParsed, JSON.parse(canonical));
  return { path: entry.relativePath, diff, diagnostics: parsed.issues };
}

/** Depth-first visit over a criterion tree, traversing BOTH compound forms. */
export function walkCriteria(criterion: Criterion | undefined, visit: (c: Criterion) => void): void {
  if (!criterion) return;
  visit(criterion);
  if (criterion.type === "group") {
    for (const child of criterion.conditions) walkCriteria(child, visit);
  } else if (criterion.type === "function") {
    walkCriteria(criterion.function.criterion, visit);
  }
}

function eachWorkflowCriterion(workflow: Workflow, visit: (c: Criterion) => void): void {
  walkCriteria(workflow.criterion, visit);
  for (const state of Object.values(workflow.states)) {
    for (const t of state.transitions) walkCriteria(t.criterion, visit);
  }
}

/** Atomic state rename: key (order-preserving), initialState, every next, and
 *  every lifecycle state-criterion value (scalar or array). Closes C1. */
export function cascadeStateRename(workflow: Workflow, oldCode: string, newCode: string): void {
  const rebuilt: Record<string, Workflow["states"][string]> = {};
  for (const [code, state] of Object.entries(workflow.states)) rebuilt[code === oldCode ? newCode : code] = state;
  workflow.states = rebuilt;
  if (workflow.initialState === oldCode) workflow.initialState = newCode;
  for (const state of Object.values(workflow.states)) {
    for (const t of state.transitions) if (t.next === oldCode) t.next = newCode;
  }
  eachWorkflowCriterion(workflow, (c) => {
    if (c.type === "lifecycle" && c.field === "state") {
      if (Array.isArray(c.value)) c.value = c.value.map((v) => (v === oldCode ? newCode : v));
      else if (c.value === oldCode) c.value = newCode;
    }
  });
}

/** True if any lifecycle `state` criterion references `code` (scalar or array). Closes C1 for remove_state. */
export function hasLifecycleStateRef(workflow: Workflow, code: string): boolean {
  let found = false;
  eachWorkflowCriterion(workflow, (c) => {
    if (c.type === "lifecycle" && c.field === "state") {
      if (Array.isArray(c.value) ? c.value.includes(code) : c.value === code) found = true;
    }
  });
  return found;
}

/** True if any lifecycle `previousTransition` criterion references `transitionName`. Drives the rename warning. */
export function hasPreviousTransitionRef(workflow: Workflow, transitionName: string): boolean {
  let found = false;
  eachWorkflowCriterion(workflow, (c) => {
    if (c.type === "lifecycle" && c.field === "previousTransition") {
      if (Array.isArray(c.value) ? c.value.includes(transitionName) : c.value === transitionName) found = true;
    }
  });
  return found;
}
```

- [ ] **Step 5: Run — expect PASS.**

Run: `pnpm --filter model-editor-mcp test -- edit_common.test.ts`
Expected: PASS — all 9 tests green, including the C2 (malformed criterion rejected, write not called) and cascade (nested + array) cases.

- [ ] **Step 6: Full suite + typecheck, then commit.**

Run: `pnpm --filter model-editor-mcp test && pnpm --filter model-editor-mcp typecheck`
```bash
git add apps/model-editor-mcp/server/tools/edit_common.ts apps/model-editor-mcp/server/__tests__/_editHarness.ts apps/model-editor-mcp/server/__tests__/edit_common.test.ts
git commit -m "feat(model-editor-mcp): shared edit machinery (load/commit/criterion-walk/state-rename)"
```

---

### Task 3: Sidecar state-node helpers in `layout.ts`

**Files:**
- Modify: `apps/model-editor-mcp/server/layout.ts`
- Test: `apps/model-editor-mcp/server/__tests__/layout.test.ts` (append)

**Interfaces:**
- Consumes: `Pick<ToolContext, "read" | "write">`.
- Produces:
  - `renameSidecarStateNode(io: Pick<ToolContext,"read"|"write">, contentRel: string, workflowName: string, oldCode: string, newCode: string): Promise<void>` — best-effort, never throws.
  - `removeSidecarStateNode(io: Pick<ToolContext,"read"|"write">, contentRel: string, workflowName: string, code: string): Promise<void>` — best-effort, never throws.

- [ ] **Step 1: Write failing tests** (append to `server/__tests__/layout.test.ts`):

```ts
import { renameSidecarStateNode, removeSidecarStateNode } from "../layout.js";

describe("sidecar state-node helpers", () => {
  function io(store: Record<string, string>) {
    return {
      read: async (rel: string) => { if (!(rel in store)) throw new Error("ENOENT"); return { contents: store[rel], lastModified: "t", sizeBytes: 0 }; },
      write: async (rel: string, c: string) => { store[rel] = c; return { path: rel, lastModified: "t", sizeBytes: 0 }; },
    };
  }
  it("rename migrates layout.nodes[old]→[new], preserving _transitionIds + other keys", async () => {
    const store = { "Order.layout.json": JSON.stringify({ _transitionIds: { u1: { workflow: "Order", state: "draft", transitionUuid: "u1" } }, Order: { layout: { nodes: { draft: { x: 1, y: 2 }, done: { x: 3, y: 4 } } } } }) };
    await renameSidecarStateNode(io(store), "Order.json", "Order", "draft", "cart");
    const p = JSON.parse(store["Order.layout.json"]);
    expect(p.Order.layout.nodes.cart).toEqual({ x: 1, y: 2 });
    expect(p.Order.layout.nodes.draft).toBeUndefined();
    expect(p.Order.layout.nodes.done).toEqual({ x: 3, y: 4 });
    expect(p._transitionIds).toBeTruthy();
  });
  it("rename is a no-op when there is no sidecar file (never throws)", async () => {
    const store: Record<string, string> = {};
    await expect(renameSidecarStateNode(io(store), "Order.json", "Order", "draft", "cart")).resolves.toBeUndefined();
    expect(store["Order.layout.json"]).toBeUndefined();
  });
  it("remove deletes layout.nodes[code], preserving the rest", async () => {
    const store = { "Order.layout.json": JSON.stringify({ Order: { layout: { nodes: { draft: { x: 1, y: 2 }, done: { x: 3, y: 4 } } } } }) };
    await removeSidecarStateNode(io(store), "Order.json", "Order", "draft");
    const p = JSON.parse(store["Order.layout.json"]);
    expect(p.Order.layout.nodes.draft).toBeUndefined();
    expect(p.Order.layout.nodes.done).toEqual({ x: 3, y: 4 });
  });
});
```

- [ ] **Step 2: Run — expect FAIL** (functions missing).

Run: `pnpm --filter model-editor-mcp test -- layout.test.ts`
Expected: FAIL — `renameSidecarStateNode is not a function`.

- [ ] **Step 3: Implement** (append to `server/layout.ts`):

```ts
type SidecarIO = Pick<import("./context.js").ToolContext, "read" | "write">;

function sidecarRelFor(contentRel: string): string {
  return contentRel.replace(/\.json$/, ".layout.json");
}

/** Best-effort read→mutate→write of one workflow's `layout.nodes` state key.
 *  Never throws: a missing/corrupt sidecar or a failed write is logged and swallowed
 *  (the content edit already succeeded; the state just loses its saved position). */
async function mutateSidecarNodes(io: SidecarIO, contentRel: string, workflowName: string, mutate: (nodes: Record<string, unknown>) => boolean): Promise<void> {
  const rel = sidecarRelFor(contentRel);
  let raw: string;
  try { raw = (await io.read(rel)).contents; } catch { return; } // no sidecar → nothing to migrate
  let parsed: Record<string, { layout?: { nodes?: Record<string, unknown> } }>;
  try { parsed = JSON.parse(raw); } catch { return; } // corrupt → leave it untouched
  const nodes = parsed[workflowName]?.layout?.nodes;
  if (!nodes) return;
  if (!mutate(nodes)) return; // nothing changed
  try { await io.write(rel, JSON.stringify(parsed, null, 2)); }
  catch (e) { process.stderr.write(`[patch] sidecar update failed for ${rel}: ${String(e)}\n`); }
}

export async function renameSidecarStateNode(io: SidecarIO, contentRel: string, workflowName: string, oldCode: string, newCode: string): Promise<void> {
  await mutateSidecarNodes(io, contentRel, workflowName, (nodes) => {
    if (!(oldCode in nodes)) return false;
    nodes[newCode] = nodes[oldCode];
    delete nodes[oldCode];
    return true;
  });
}

export async function removeSidecarStateNode(io: SidecarIO, contentRel: string, workflowName: string, code: string): Promise<void> {
  await mutateSidecarNodes(io, contentRel, workflowName, (nodes) => {
    if (!(code in nodes)) return false;
    delete nodes[code];
    return true;
  });
}
```

- [ ] **Step 4: Run — expect PASS.**

Run: `pnpm --filter model-editor-mcp test -- layout.test.ts`
Expected: PASS — all three new cases green; existing `layout.test.ts` cases still green.

- [ ] **Step 5: Full suite + typecheck, then commit.**

Run: `pnpm --filter model-editor-mcp test && pnpm --filter model-editor-mcp typecheck`
```bash
git add apps/model-editor-mcp/server/layout.ts apps/model-editor-mcp/server/__tests__/layout.test.ts
git commit -m "feat(model-editor-mcp): best-effort sidecar state-node rename/remove helpers"
```

---

### Task 4: Transition trio — `transitions.ts` + schemas + manifest + dispatcher

**Files:**
- Create: `apps/model-editor-mcp/server/tools/transitions.ts`
- Modify: `apps/model-editor-mcp/server/schemas.ts` (add 3 inputs)
- Modify: `apps/model-editor-mcp/server/manifest.ts` (add 3 entries; count → 21)
- Modify: `apps/model-editor-mcp/server/index.ts` (import + 3 dispatcher wires)
- Modify: `apps/model-editor-mcp/server/__tests__/manifest.test.ts` (add the 3 names; bump count 18 → 21)
- Test: `apps/model-editor-mcp/server/__tests__/transitions.test.ts`

**Interfaces:**
- Consumes: `loadWorkflowForEdit`/`commitEditedWorkflow`/`hasPreviousTransitionRef` (Task 2); `ok`/`err` (`envelope.ts`); the 3 new schemas below.
- Produces: `updateTransitionTool(args, ctx)`, `addTransitionTool(args, ctx)`, `removeTransitionTool(args, ctx)` — each `(args: unknown, ctx: ToolContext) => Promise<McpResult>`.

- [ ] **Step 1: Add the schemas** to `server/schemas.ts`:

```ts
/** Loose transition body — deep grammar enforced at apply-time by the §5 re-parse gate. */
const transitionBody = z.object({
  name: z.string().min(1).optional(),
  next: z.string().min(1).optional(),
  manual: z.boolean().optional(),
  disabled: z.boolean().optional(),
  criterion: z.record(z.string(), z.unknown()).optional(),
  processors: z.array(z.record(z.string(), z.unknown())).optional(),
  schedule: z.record(z.string(), z.unknown()).optional(),
  annotations: z.record(z.string(), z.unknown()).optional(),
}).strict();

/** A NEW transition must supply the model's required fields (manual has no default). */
const newTransitionBody = transitionBody.extend({
  name: z.string().min(1),
  next: z.string().min(1),
  manual: z.boolean(),
}).strict();

export const updateTransitionInput = z.object({ workflow: z.string().min(1), state: z.string().min(1), name: z.string().min(1), patch: transitionBody }).strict();
export const addTransitionInput = z.object({ workflow: z.string().min(1), state: z.string().min(1), transition: newTransitionBody }).strict();
export const removeTransitionInput = z.object({ workflow: z.string().min(1), state: z.string().min(1), name: z.string().min(1) }).strict();
export type UpdateTransitionInput = z.infer<typeof updateTransitionInput>;
export type AddTransitionInput = z.infer<typeof addTransitionInput>;
export type RemoveTransitionInput = z.infer<typeof removeTransitionInput>;
```
(`transitionBody` and `newTransitionBody` are module-scoped consts in `schemas.ts`; Task 5's `stateBody` reuses `newTransitionBody` — same file, no export needed.)

- [ ] **Step 2: Write failing tests** `server/__tests__/transitions.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { updateTransitionTool, addTransitionTool, removeTransitionTool } from "../tools/transitions.js";
import { makeEditCtx, WF_FIXTURE } from "./_editHarness.js";

describe("update_transition", () => {
  it("merges provided fields, preserves the rest, writes canonical", async () => {
    const ctx = makeEditCtx({ "Order.json": WF_FIXTURE });
    const r = await updateTransitionTool({ workflow: "Order", state: "draft", name: "submit", patch: { disabled: true } }, ctx) as { structuredContent: { ok: boolean; name: string } };
    expect(r.structuredContent.ok).toBe(true);
    const written = JSON.parse((await ctx.read("Order.json")).contents);
    const t = written.workflows[0].states.draft.transitions[0];
    expect(t.disabled).toBe(true);
    expect(t.next).toBe("review"); // preserved
  });
  it("renames via patch.name and returns the new name", async () => {
    const ctx = makeEditCtx({ "Order.json": WF_FIXTURE });
    const r = await updateTransitionTool({ workflow: "Order", state: "draft", name: "submit", patch: { name: "send" } }, ctx) as { structuredContent: { name: string } };
    expect(r.structuredContent.name).toBe("send");
  });
  it("NOT_FOUND for an unknown transition, writing nothing", async () => {
    const ctx = makeEditCtx({ "Order.json": WF_FIXTURE });
    const w = vi.spyOn(ctx, "write");
    await expect(updateTransitionTool({ workflow: "Order", state: "draft", name: "ghost", patch: {} }, ctx)).rejects.toMatchObject({ content: [{ text: expect.stringContaining("NOT_FOUND") }] });
    expect(w).not.toHaveBeenCalled();
  });
  it("C2: a malformed patch.criterion is VALIDATION_FAILED (not silently dropped), writing nothing", async () => {
    const ctx = makeEditCtx({ "Order.json": WF_FIXTURE });
    const w = vi.spyOn(ctx, "write");
    await expect(updateTransitionTool({ workflow: "Order", state: "draft", name: "submit", patch: { criterion: { type: "bogus" } } }, ctx)).rejects.toMatchObject({ structuredContent: { code: "VALIDATION_FAILED" } });
    expect(w).not.toHaveBeenCalled();
  });
  it("normalization parity: an operatorType-alias criterion is ACCEPTED (parseImport normalizes operatorType→operation)", async () => {
    const ctx = makeEditCtx({ "Order.json": WF_FIXTURE });
    const r = await updateTransitionTool({ workflow: "Order", state: "draft", name: "submit", patch: { criterion: { type: "lifecycle", field: "state", operatorType: "EQUALS", value: "review" } } }, ctx) as { structuredContent: { ok: boolean } };
    expect(r.structuredContent.ok).toBe(true);
  });
  it("warns (non-blocking) when a rename leaves a lifecycle previousTransition ref", async () => {
    const wf = JSON.parse(WF_FIXTURE);
    wf.workflows[0].states.done.transitions.push({ name: "reopen", next: "draft", manual: true, disabled: false, criterion: { type: "lifecycle", field: "previousTransition", operation: "EQUALS", value: "submit" } });
    const ctx = makeEditCtx({ "Order.json": JSON.stringify(wf) });
    const r = await updateTransitionTool({ workflow: "Order", state: "draft", name: "submit", patch: { name: "send" } }, ctx) as { structuredContent: { ok: boolean; diagnostics: { severity: string; code: string }[] } };
    expect(r.structuredContent.ok).toBe(true);
    expect(r.structuredContent.diagnostics.some((d) => d.severity === "warning" && d.code === "previous-transition-ref-not-cascaded")).toBe(true);
  });
});

describe("add_transition", () => {
  it("appends a new transition (with manual) and writes it", async () => {
    const ctx = makeEditCtx({ "Order.json": WF_FIXTURE });
    const r = await addTransitionTool({ workflow: "Order", state: "draft", transition: { name: "cancel", next: "done", manual: true } }, ctx) as { structuredContent: { ok: boolean } };
    expect(r.structuredContent.ok).toBe(true);
    const t = JSON.parse((await ctx.read("Order.json")).contents).workflows[0].states.draft.transitions;
    expect(t.map((x: { name: string }) => x.name)).toContain("cancel");
  });
  it("missing manual → INVALID_ARGS (schema requires it)", async () => {
    const ctx = makeEditCtx({ "Order.json": WF_FIXTURE });
    await expect(addTransitionTool({ workflow: "Order", state: "draft", transition: { name: "cancel", next: "done" } }, ctx)).rejects.toMatchObject({ content: [{ text: expect.stringContaining("INVALID_ARGS") }] });
  });
  it("ALREADY_EXISTS for a duplicate name, writing nothing", async () => {
    const ctx = makeEditCtx({ "Order.json": WF_FIXTURE });
    const w = vi.spyOn(ctx, "write");
    await expect(addTransitionTool({ workflow: "Order", state: "draft", transition: { name: "submit", next: "done", manual: true } }, ctx)).rejects.toMatchObject({ content: [{ text: expect.stringContaining("ALREADY_EXISTS") }] });
    expect(w).not.toHaveBeenCalled();
  });
  it("dangling next → VALIDATION_FAILED", async () => {
    const ctx = makeEditCtx({ "Order.json": WF_FIXTURE });
    await expect(addTransitionTool({ workflow: "Order", state: "draft", transition: { name: "cancel", next: "ghost", manual: true } }, ctx)).rejects.toMatchObject({ structuredContent: { code: "VALIDATION_FAILED" } });
  });
});

describe("remove_transition", () => {
  it("removes the addressed transition", async () => {
    const ctx = makeEditCtx({ "Order.json": WF_FIXTURE });
    const r = await removeTransitionTool({ workflow: "Order", state: "draft", name: "submit" }, ctx) as { structuredContent: { ok: boolean } };
    expect(r.structuredContent.ok).toBe(true);
    expect(JSON.parse((await ctx.read("Order.json")).contents).workflows[0].states.draft.transitions).toHaveLength(0);
  });
  it("NOT_FOUND for an unknown transition", async () => {
    const ctx = makeEditCtx({ "Order.json": WF_FIXTURE });
    await expect(removeTransitionTool({ workflow: "Order", state: "draft", name: "ghost" }, ctx)).rejects.toMatchObject({ content: [{ text: expect.stringContaining("NOT_FOUND") }] });
  });
});
```

- [ ] **Step 3: Run — expect FAIL** (`transitions.js` missing).

Run: `pnpm --filter model-editor-mcp test -- transitions.test.ts`
Expected: FAIL — cannot import `../tools/transitions.js`.

- [ ] **Step 4: Implement** `server/tools/transitions.ts`:

```ts
import { ok, err } from "../envelope.js";
import type { McpResult } from "../envelope.js";
import type { ToolContext } from "../context.js";
import type { Transition, ValidationIssue } from "@cyoda/workflow-core";
import { updateTransitionInput, addTransitionInput, removeTransitionInput } from "../schemas.js";
import { loadWorkflowForEdit, commitEditedWorkflow, hasPreviousTransitionRef } from "./edit_common.js";

/** `update_transition` — shallow field-merge onto the addressed transition (nested fields replace wholesale). */
export async function updateTransitionTool(args: unknown, ctx: ToolContext): Promise<McpResult> {
  const input = updateTransitionInput.safeParse(args);
  if (!input.success) throw err("INVALID_ARGS", input.error.message);
  const { workflow, state, name, patch } = input.data;

  const loaded = await loadWorkflowForEdit(ctx, workflow);
  const st = loaded.workflow.states[state];
  if (!st) throw err("NOT_FOUND", `no state "${state}" in workflow "${workflow}"`);
  const idx = st.transitions.findIndex((t) => t.name === name);
  if (idx === -1) throw err("NOT_FOUND", `no transition "${name}" on state "${state}"`);

  st.transitions[idx] = { ...st.transitions[idx], ...patch } as unknown as Transition; // re-parse gate validates the merge
  const resultName = st.transitions[idx].name;

  const { path, diff, diagnostics } = await commitEditedWorkflow(ctx, loaded);
  const out: ValidationIssue[] = [...diagnostics];
  if (patch.name && patch.name !== name && hasPreviousTransitionRef(loaded.workflow, name)) {
    out.push({ severity: "warning", code: "previous-transition-ref-not-cascaded",
      message: `renamed transition "${name}"→"${patch.name}" is still referenced by a lifecycle previousTransition criterion pointing at "${name}"; review with update_workflow` });
  }
  return ok({ workflow, state, name: resultName, path, ok: true, diff, diagnostics: out });
}

/** `add_transition` — append a new transition; ALREADY_EXISTS on a duplicate name. */
export async function addTransitionTool(args: unknown, ctx: ToolContext): Promise<McpResult> {
  const input = addTransitionInput.safeParse(args);
  if (!input.success) throw err("INVALID_ARGS", input.error.message);
  const { workflow, state, transition } = input.data;

  const loaded = await loadWorkflowForEdit(ctx, workflow);
  const st = loaded.workflow.states[state];
  if (!st) throw err("NOT_FOUND", `no state "${state}" in workflow "${workflow}"`);
  if (st.transitions.some((t) => t.name === transition.name)) throw err("ALREADY_EXISTS", `transition "${transition.name}" already exists on state "${state}"`);
  st.transitions.push(transition as unknown as Transition);

  const { path, diff, diagnostics } = await commitEditedWorkflow(ctx, loaded);
  return ok({ workflow, state, name: transition.name, path, ok: true, diff, diagnostics });
}

/** `remove_transition` — delete the addressed transition. */
export async function removeTransitionTool(args: unknown, ctx: ToolContext): Promise<McpResult> {
  const input = removeTransitionInput.safeParse(args);
  if (!input.success) throw err("INVALID_ARGS", input.error.message);
  const { workflow, state, name } = input.data;

  const loaded = await loadWorkflowForEdit(ctx, workflow);
  const st = loaded.workflow.states[state];
  if (!st) throw err("NOT_FOUND", `no state "${state}" in workflow "${workflow}"`);
  const idx = st.transitions.findIndex((t) => t.name === name);
  if (idx === -1) throw err("NOT_FOUND", `no transition "${name}" on state "${state}"`);
  st.transitions.splice(idx, 1);

  const { path, diff } = await commitEditedWorkflow(ctx, loaded);
  return ok({ workflow, state, name, path, ok: true, diff });
}
```

- [ ] **Step 5: Register** — in `server/manifest.ts` add three `TOOL_MANIFEST` entries (place after `delete_workflow`):

```ts
  { name: "update_transition", description: "Patch one transition, addressed by (workflow, state, name). `patch` sets any subset of { name, next, manual, disabled, criterion, processors, schedule, annotations }; provided fields replace (nested criterion/processors/schedule/annotations replace wholesale), omitted fields are preserved. `patch.name` renames. Validated + written canonical; writes nothing on failure. A rename does NOT auto-update lifecycle `previousTransition` references (returns a warning instead).", inputSchema: { type: "object", properties: { workflow: { type: "string", minLength: 1 }, state: { type: "string", minLength: 1 }, name: { type: "string", minLength: 1 }, patch: { type: "object", properties: { name: { type: "string", minLength: 1 }, next: { type: "string", minLength: 1 }, manual: { type: "boolean" }, disabled: { type: "boolean" }, criterion: { type: "object" }, processors: { type: "array" }, schedule: { type: "object" }, annotations: { type: "object" } }, additionalProperties: false } }, required: ["workflow", "state", "name", "patch"], additionalProperties: false } },
  { name: "add_transition", description: "Add a new transition to a state. `transition` requires name + next + manual (disabled defaults false). ALREADY_EXISTS if the name is already used in that state; VALIDATION_FAILED if next references a nonexistent state.", inputSchema: { type: "object", properties: { workflow: { type: "string", minLength: 1 }, state: { type: "string", minLength: 1 }, transition: { type: "object", properties: { name: { type: "string", minLength: 1 }, next: { type: "string", minLength: 1 }, manual: { type: "boolean" }, disabled: { type: "boolean" }, criterion: { type: "object" }, processors: { type: "array" }, schedule: { type: "object" }, annotations: { type: "object" } }, required: ["name", "next", "manual"], additionalProperties: false } }, required: ["workflow", "state", "transition"], additionalProperties: false } },
  { name: "remove_transition", description: "Remove a transition, addressed by (workflow, state, name).", inputSchema: { type: "object", properties: { workflow: { type: "string", minLength: 1 }, state: { type: "string", minLength: 1 }, name: { type: "string", minLength: 1 } }, required: ["workflow", "state", "name"], additionalProperties: false } },
```
In `server/index.ts` add the import `import { updateTransitionTool, addTransitionTool, removeTransitionTool } from "./tools/transitions.js";` and three dispatcher entries (after `delete_workflow`): `update_transition: (a) => updateTransitionTool(a, ctx), add_transition: (a) => addTransitionTool(a, ctx), remove_transition: (a) => removeTransitionTool(a, ctx),`.
In `server/__tests__/manifest.test.ts` add the three names to the `EXPECTED` list and bump the tool-count assertion 18 → 21.

- [ ] **Step 6: Run — expect PASS.**

Run: `pnpm --filter model-editor-mcp test -- transitions.test.ts manifest.test.ts schemas.test.ts`
Expected: PASS — transition tests green; manifest parity at 21; schema `.strict()` intact.

- [ ] **Step 7: Full suite + typecheck + build, then commit.**

Run: `pnpm --filter model-editor-mcp test && pnpm --filter model-editor-mcp typecheck && pnpm --filter model-editor-mcp build`
```bash
git add apps/model-editor-mcp/server/tools/transitions.ts apps/model-editor-mcp/server/schemas.ts apps/model-editor-mcp/server/manifest.ts apps/model-editor-mcp/server/index.ts apps/model-editor-mcp/server/__tests__/transitions.test.ts apps/model-editor-mcp/server/__tests__/manifest.test.ts
git commit -m "feat(model-editor-mcp): update/add/remove_transition tools (surface 18->21)"
```

---

### Task 5: State trio — `states.ts` + schemas + manifest + dispatcher

**Files:**
- Create: `apps/model-editor-mcp/server/tools/states.ts`
- Modify: `apps/model-editor-mcp/server/schemas.ts` (add 3 inputs)
- Modify: `apps/model-editor-mcp/server/manifest.ts` (add 3 entries; count → 24)
- Modify: `apps/model-editor-mcp/server/index.ts` (import + 3 dispatcher wires)
- Modify: `apps/model-editor-mcp/server/__tests__/manifest.test.ts` (add 3 names; bump 21 → 24)
- Test: `apps/model-editor-mcp/server/__tests__/states.test.ts`

**Interfaces:**
- Consumes: `loadWorkflowForEdit`/`commitEditedWorkflow`/`cascadeStateRename`/`hasLifecycleStateRef` (Task 2); `renameSidecarStateNode`/`removeSidecarStateNode` (Task 3); `validationFailed` (Task 1); `newTransitionBody` (Task 4 schema); the 3 new schemas below.
- Produces: `addStateTool(args, ctx)`, `removeStateTool(args, ctx)`, `renameStateTool(args, ctx)` — each `(args: unknown, ctx: ToolContext) => Promise<McpResult>`.

- [ ] **Step 1: Add the schemas** to `server/schemas.ts`:

```ts
const stateBody = z.object({
  transitions: z.array(newTransitionBody).optional(),
  annotations: z.record(z.string(), z.unknown()).optional(),
}).strict();

export const addStateInput = z.object({ workflow: z.string().min(1), code: z.string().min(1), state: stateBody.optional() }).strict();
export const removeStateInput = z.object({ workflow: z.string().min(1), code: z.string().min(1) }).strict();
export const renameStateInput = z.object({ workflow: z.string().min(1), oldCode: z.string().min(1), newCode: z.string().min(1) }).strict();
export type AddStateInput = z.infer<typeof addStateInput>;
export type RemoveStateInput = z.infer<typeof removeStateInput>;
export type RenameStateInput = z.infer<typeof renameStateInput>;
```

- [ ] **Step 2: Write failing tests** `server/__tests__/states.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { addStateTool, removeStateTool, renameStateTool } from "../tools/states.js";
import { makeEditCtx, WF_FIXTURE } from "./_editHarness.js";

describe("add_state", () => {
  it("adds an empty state", async () => {
    const ctx = makeEditCtx({ "Order.json": WF_FIXTURE });
    const r = await addStateTool({ workflow: "Order", code: "archived" }, ctx) as { structuredContent: { ok: boolean } };
    expect(r.structuredContent.ok).toBe(true);
    expect(JSON.parse((await ctx.read("Order.json")).contents).workflows[0].states.archived).toEqual({ transitions: [] });
  });
  it("adds a state seeded with a transition (requires manual)", async () => {
    const ctx = makeEditCtx({ "Order.json": WF_FIXTURE });
    const r = await addStateTool({ workflow: "Order", code: "hold", state: { transitions: [{ name: "resume", next: "draft", manual: true }] } }, ctx) as { structuredContent: { ok: boolean } };
    expect(r.structuredContent.ok).toBe(true);
  });
  it("ALREADY_EXISTS for a duplicate code, writing nothing", async () => {
    const ctx = makeEditCtx({ "Order.json": WF_FIXTURE });
    const w = vi.spyOn(ctx, "write");
    await expect(addStateTool({ workflow: "Order", code: "draft" }, ctx)).rejects.toMatchObject({ content: [{ text: expect.stringContaining("ALREADY_EXISTS") }] });
    expect(w).not.toHaveBeenCalled();
  });
  it("seeded transition with a dangling next → VALIDATION_FAILED", async () => {
    const ctx = makeEditCtx({ "Order.json": WF_FIXTURE });
    await expect(addStateTool({ workflow: "Order", code: "hold", state: { transitions: [{ name: "x", next: "ghost", manual: true }] } }, ctx)).rejects.toMatchObject({ structuredContent: { code: "VALIDATION_FAILED" } });
  });
});

describe("remove_state", () => {
  it("removes a state with no dangling references", async () => {
    const ctx = makeEditCtx({ "Order.json": WF_FIXTURE });
    // "done" is referenced by approve.next — remove a leaf we can safely delete: add + remove
    await addStateTool({ workflow: "Order", code: "archived" }, ctx);
    const r = await removeStateTool({ workflow: "Order", code: "archived" }, ctx) as { structuredContent: { ok: boolean } };
    expect(r.structuredContent.ok).toBe(true);
    expect(JSON.parse((await ctx.read("Order.json")).contents).workflows[0].states.archived).toBeUndefined();
  });
  it("NOT_FOUND for an unknown code", async () => {
    const ctx = makeEditCtx({ "Order.json": WF_FIXTURE });
    await expect(removeStateTool({ workflow: "Order", code: "ghost" }, ctx)).rejects.toMatchObject({ content: [{ text: expect.stringContaining("NOT_FOUND") }] });
  });
  it("dangling next → VALIDATION_FAILED (semantic gate) — removing a state a transition targets", async () => {
    const ctx = makeEditCtx({ "Order.json": WF_FIXTURE });
    await expect(removeStateTool({ workflow: "Order", code: "review" }, ctx)).rejects.toMatchObject({ structuredContent: { code: "VALIDATION_FAILED" } }); // submit.next === "review"
  });
  it("C1: rejects via the lifecycle GUARD (not the semantic gate) when ONLY a lifecycle criterion references the code", async () => {
    // Isolate the guard: a leaf state "shipped" referenced SOLELY by a lifecycle criterion —
    // nothing next-points to it, it is not initialState — so the semantic gate would NOT catch it.
    // (If the C1 guard were removed, remove would succeed and write would be called — this test catches that regression.)
    const wf = JSON.parse(WF_FIXTURE);
    wf.workflows[0].states.shipped = { transitions: [] };
    wf.workflows[0].states.review.transitions[0].criterion = { type: "lifecycle", field: "state", operation: "EQUALS", value: "shipped" };
    const ctx = makeEditCtx({ "Order.json": JSON.stringify(wf) });
    const w = vi.spyOn(ctx, "write");
    const r = await removeStateTool({ workflow: "Order", code: "shipped" }, ctx).catch((e) => e as { structuredContent?: { code?: string; diagnostics?: { code: string }[] } });
    expect(r).toMatchObject({ structuredContent: { code: "VALIDATION_FAILED", diagnostics: [{ code: "state-referenced-by-lifecycle-criterion" }] } });
    expect(w).not.toHaveBeenCalled();
  });
});

describe("rename_state", () => {
  it("cascades next + initialState + lifecycle state-criteria and migrates the sidecar node", async () => {
    const ctx = makeEditCtx({
      "Order.json": WF_FIXTURE,
      "Order.layout.json": JSON.stringify({ Order: { layout: { nodes: { draft: { x: 5, y: 6 }, review: { x: 7, y: 8 } } } } }),
    });
    const r = await renameStateTool({ workflow: "Order", oldCode: "draft", newCode: "cart" }, ctx) as { structuredContent: { ok: boolean } };
    expect(r.structuredContent.ok).toBe(true);
    const wf = JSON.parse((await ctx.read("Order.json")).contents).workflows[0];
    expect(wf.initialState).toBe("cart");
    expect(Object.keys(wf.states)).toEqual(["cart", "review", "done"]); // order preserved
    expect(wf.states.review.transitions[0].criterion.value).toBe("cart"); // lifecycle value cascaded
    const side = JSON.parse((await ctx.read("Order.layout.json")).contents);
    expect(side.Order.layout.nodes.cart).toEqual({ x: 5, y: 6 });
    expect(side.Order.layout.nodes.draft).toBeUndefined();
  });
  it("NOT_FOUND for an unknown oldCode; ALREADY_EXISTS if newCode exists", async () => {
    const ctx = makeEditCtx({ "Order.json": WF_FIXTURE });
    await expect(renameStateTool({ workflow: "Order", oldCode: "ghost", newCode: "x" }, ctx)).rejects.toMatchObject({ content: [{ text: expect.stringContaining("NOT_FOUND") }] });
    await expect(renameStateTool({ workflow: "Order", oldCode: "draft", newCode: "review" }, ctx)).rejects.toMatchObject({ content: [{ text: expect.stringContaining("ALREADY_EXISTS") }] });
  });
});
```

- [ ] **Step 3: Run — expect FAIL** (`states.js` missing).

Run: `pnpm --filter model-editor-mcp test -- states.test.ts`
Expected: FAIL — cannot import `../tools/states.js`.

- [ ] **Step 4: Implement** `server/tools/states.ts`:

```ts
import { ok, err, validationFailed } from "../envelope.js";
import type { McpResult } from "../envelope.js";
import type { ToolContext } from "../context.js";
import type { State } from "@cyoda/workflow-core";
import { addStateInput, removeStateInput, renameStateInput } from "../schemas.js";
import { loadWorkflowForEdit, commitEditedWorkflow, cascadeStateRename, hasLifecycleStateRef } from "./edit_common.js";
import { renameSidecarStateNode, removeSidecarStateNode } from "../layout.js";

/** `add_state` — add a new state (optionally seeded); ALREADY_EXISTS on a duplicate code. */
export async function addStateTool(args: unknown, ctx: ToolContext): Promise<McpResult> {
  const input = addStateInput.safeParse(args);
  if (!input.success) throw err("INVALID_ARGS", input.error.message);
  const { workflow, code, state } = input.data;

  const loaded = await loadWorkflowForEdit(ctx, workflow);
  if (code in loaded.workflow.states) throw err("ALREADY_EXISTS", `state "${code}" already exists in workflow "${workflow}"`);
  loaded.workflow.states[code] = (state ?? { transitions: [] }) as unknown as State;

  const { path, diff, diagnostics } = await commitEditedWorkflow(ctx, loaded);
  return ok({ workflow, code, path, ok: true, diff, diagnostics });
}

/** `remove_state` — delete a state. Semantic gate catches dangling next/initialState;
 *  an explicit scan catches lifecycle state-criteria the validator ignores (C1). */
export async function removeStateTool(args: unknown, ctx: ToolContext): Promise<McpResult> {
  const input = removeStateInput.safeParse(args);
  if (!input.success) throw err("INVALID_ARGS", input.error.message);
  const { workflow, code } = input.data;

  const loaded = await loadWorkflowForEdit(ctx, workflow);
  if (!(code in loaded.workflow.states)) throw err("NOT_FOUND", `no state "${code}" in workflow "${workflow}"`);
  if (hasLifecycleStateRef(loaded.workflow, code)) {
    throw validationFailed([{ severity: "error", code: "state-referenced-by-lifecycle-criterion",
      message: `state "${code}" is referenced by a lifecycle criterion (field:"state"); repoint it before removing` }]);
  }
  delete loaded.workflow.states[code];

  const { path, diff } = await commitEditedWorkflow(ctx, loaded);
  await removeSidecarStateNode(ctx, loaded.entry.relativePath, loaded.workflow.name, code);
  return ok({ workflow, code, path, ok: true, diff });
}

/** `rename_state` — atomic auto-cascade + sidecar node migration. */
export async function renameStateTool(args: unknown, ctx: ToolContext): Promise<McpResult> {
  const input = renameStateInput.safeParse(args);
  if (!input.success) throw err("INVALID_ARGS", input.error.message);
  const { workflow, oldCode, newCode } = input.data;

  const loaded = await loadWorkflowForEdit(ctx, workflow);
  if (!(oldCode in loaded.workflow.states)) throw err("NOT_FOUND", `no state "${oldCode}" in workflow "${workflow}"`);
  if (newCode in loaded.workflow.states) throw err("ALREADY_EXISTS", `state "${newCode}" already exists in workflow "${workflow}"`);
  cascadeStateRename(loaded.workflow, oldCode, newCode);

  const { path, diff, diagnostics } = await commitEditedWorkflow(ctx, loaded);
  await renameSidecarStateNode(ctx, loaded.entry.relativePath, loaded.workflow.name, oldCode, newCode);
  return ok({ workflow, oldCode, newCode, path, ok: true, diff, diagnostics });
}
```

- [ ] **Step 5: Register** — in `server/manifest.ts` add three entries (after `remove_transition`):

```ts
  { name: "add_state", description: "Add a new state to a workflow, optionally seeded with transitions (each requires name + next + manual). ALREADY_EXISTS if the code already exists.", inputSchema: { type: "object", properties: { workflow: { type: "string", minLength: 1 }, code: { type: "string", minLength: 1 }, state: { type: "object", properties: { transitions: { type: "array" }, annotations: { type: "object" } }, additionalProperties: false } }, required: ["workflow", "code"], additionalProperties: false } },
  { name: "remove_state", description: "Remove a state. Rejects (VALIDATION_FAILED) if any transition `next`, the `initialState`, or a lifecycle state-criterion still references it — repoint those first. Also removes the state's saved layout position.", inputSchema: { type: "object", properties: { workflow: { type: "string", minLength: 1 }, code: { type: "string", minLength: 1 } }, required: ["workflow", "code"], additionalProperties: false } },
  { name: "rename_state", description: "Rename a state code, cascading every transition `next`, the `initialState`, and lifecycle state-criteria (scalar or array) from oldCode to newCode in one atomic op, and migrating its saved layout position. Does not touch lifecycle `previousTransition` references.", inputSchema: { type: "object", properties: { workflow: { type: "string", minLength: 1 }, oldCode: { type: "string", minLength: 1 }, newCode: { type: "string", minLength: 1 } }, required: ["workflow", "oldCode", "newCode"], additionalProperties: false } },
```
In `server/index.ts` add `import { addStateTool, removeStateTool, renameStateTool } from "./tools/states.js";` and three dispatcher entries: `add_state: (a) => addStateTool(a, ctx), remove_state: (a) => removeStateTool(a, ctx), rename_state: (a) => renameStateTool(a, ctx),`.
In `server/__tests__/manifest.test.ts` add the three names to `EXPECTED` and bump the count assertion 21 → 24.

- [ ] **Step 6: Run — expect PASS.**

Run: `pnpm --filter model-editor-mcp test -- states.test.ts manifest.test.ts schemas.test.ts`
Expected: PASS — state tests green (including C1 remove-guard + rename cascade + sidecar migration); manifest parity at 24.

- [ ] **Step 7: Full suite + typecheck + build, then commit.**

Run: `pnpm --filter model-editor-mcp test && pnpm --filter model-editor-mcp typecheck && pnpm --filter model-editor-mcp build`
```bash
git add apps/model-editor-mcp/server/tools/states.ts apps/model-editor-mcp/server/schemas.ts apps/model-editor-mcp/server/manifest.ts apps/model-editor-mcp/server/index.ts apps/model-editor-mcp/server/__tests__/states.test.ts apps/model-editor-mcp/server/__tests__/manifest.test.ts
git commit -m "feat(model-editor-mcp): add/remove/rename_state tools with cascade + sidecar migration (surface 21->24)"
```

---

### Task 6: README + docs

**Files:**
- Modify: `apps/model-editor-mcp/README.md`

**Interfaces:** none (docs only).

- [ ] **Step 1: Update the README.** Change the tool count `18` → `24` (both the intro count line and any "N of M tools" phrasing). Under the Workflows tool group, add the six tools with a one-line addressing note and the two documented limitations:

```markdown
- `update_transition(workflow, state, name, patch)` — patch one transition (addressed by the `(workflow, state, name)` tuple). `patch` sets any subset of `{ name, next, manual, disabled, criterion, processors, schedule, annotations }`; provided fields replace (nested values wholesale), omitted are preserved; `patch.name` renames. Writes nothing on validation failure. A rename does not auto-update lifecycle `previousTransition` references — it returns a warning.
- `add_transition(workflow, state, transition)` — append a new transition (`transition` requires `name` + `next` + `manual`). `ALREADY_EXISTS` on a duplicate name in the state.
- `remove_transition(workflow, state, name)` — remove the addressed transition.
- `add_state(workflow, code, state?)` — add a new state (optionally seeded with transitions). `ALREADY_EXISTS` on a duplicate code.
- `remove_state(workflow, code)` — remove a state; rejects if any `next`, the `initialState`, or a lifecycle state-criterion still references it. Also drops its saved layout position.
- `rename_state(workflow, oldCode, newCode)` — rename a state code, cascading every `next`, `initialState`, and lifecycle state-criterion, and migrating its saved layout position.

Element edits are Claude-owned like all content edits; each writes only the content file (plus, for state rename/remove, a best-effort layout-sidecar node migration) and live-pushes to the browser. To clear an optional transition field, use whole-doc `update_workflow`.
```

- [ ] **Step 2: Verify the count matches the manifest, then commit.**

Run: `grep -c '"name":' apps/model-editor-mcp/server/manifest.ts` (expect 24) and re-read the README's count line.
```bash
git add apps/model-editor-mcp/README.md
git commit -m "docs(model-editor-mcp): document the 6 transition/state patch tools (surface 24)"
```

---

## After the tasks (controller)

1. Whole-branch review (opus) of this round via `scripts/review-package <base-before-Task-1> <head>`; fix any Critical/Important with ONE fix subagent.
2. Full aggregate: `pnpm --filter model-editor-mcp test && … typecheck && … build && pnpm -r build && pnpm lint && pnpm --filter model-editor-mcp test:e2e`.
3. This ships as its **own PR** against `staging` (distinct from the Tasks 1–2 quick-wins) — superpowers:finishing-a-development-branch for the merge decision.

## Self-Review (completed against the spec)

- **Spec coverage:** §4 six tools → Tasks 4–5; §5 pipeline (load/commit/re-parse gate) → Task 2; §6 per-op envelopes → Tasks 4–5 tests; §7 sidecar migration → Task 3 + Task 5; §8 `.strict()` schemas → Tasks 4–5; §9 `validationFailed` helper + `walkCriteria` + module layout → Tasks 1–2; §12 test cases (C1/C2, manual-required, previousTransition warning, normalization parity, sidecar) → Tasks 2/4/5; §11 out-of-scope respected (no `update_state`, no field-clearing, no previousTransition cascade). README (§9) → Task 6.
- **Placeholder scan:** none — every code/test step carries complete code.
- **Type consistency:** `loadWorkflowForEdit`/`commitEditedWorkflow`/`walkCriteria`/`cascadeStateRename`/`hasLifecycleStateRef`/`hasPreviousTransitionRef`/`renameSidecarStateNode`/`removeSidecarStateNode`/`validationFailed`/`newTransitionBody` names and signatures are identical across their definition (Tasks 1–3) and use sites (Tasks 4–5).
