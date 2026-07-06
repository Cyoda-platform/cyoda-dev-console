# Model Editor MCP — Transition & State Patch Ops (design)

**Date:** 2026-07-05
**Status:** Approved design (pending written-spec review)
**Feature:** `#7` — patch / transition-level (and state-level) editing for the headless MCP server, on a stable, caller-visible addressing model. Also closes the root of `#2` (transition identity without leaking synthetic layout UUIDs).
**Context:** Fast-follow round after the Group A tool-surface refinement shipped to `staging` (PR #39). This is the design-first Task 3 of `docs/superpowers/plans/2026-07-05-model-editor-mcp-fast-follow.md`. It will almost certainly ship as **its own PR** (larger surface than Tasks 1–2).

---

## 1. Motivation

`update_workflow` and `create_workflow` take the **whole** import-payload. To change one field — toggle a transition's `disabled`, repoint a `next`, fix a typo'd state code — a caller resends ~40 KB and risks clobbering unrelated edits. There is no patch / element-level operation.

The blocker (finding `#2`) was that **transitions have no stable, caller-visible identity**: the layout sidecar keys transition data by internal synthetic UUIDs that are re-minted on every parse and were deliberately hidden. A patch API needs a way to *address* a transition (and a state) that survives round-trips and never depends on those UUIDs.

## 2. Ground-truth constraints (drive the whole design)

Verified against `@cyoda/workflow-core@0.4.0` (vendored) and `apps/model-editor-mcp/server/`:

- **Transition shape:** `{ name, next, manual, disabled, annotations?, criterion?, processors?, schedule? }`. Target state is **`next`** (a `StateCode`); criteria is a single **`criterion?`** tree; processes are **`processors?: Processor[]`**. **No native `id`** — the Zod schema `$strip`s unknown keys, so a caller-invented `id` is silently discarded.
- **States:** `states: Record<StateCode, State>`, `State = { transitions: Transition[], annotations? }`. State codes are JSON object keys → **inherently unique**.
- **Uniqueness rules (all `error`-severity):** transition name unique **within its source state** (`duplicate-transition-name`); workflow name unique within the session (`duplicate-workflow-name`); every transition's `next` and the workflow's `initialState` must reference an existing state (`unknown-transition-target`, `unknown-initial-state`); names match `NAME_REGEX`. Transition names are **not** workflow-wide unique — the same name may recur in different states.
- **Synthetic transition UUIDs** (`meta.ids.transitions`, sidecar `_transitionIds`): random `uuidv4` per parse; the MCP tools never thread a `prior`, so they are re-minted every load and are **never a stable external identity**. Correctly hidden from all responses.
- **Sidecar (`.layout.json`) keying:** top-level keyed by **workflow name** → `WorkflowUiMeta`; `layout.nodes` keyed by **`stateCode`** (stable, human-authored); `transitionPositions`/`edgeAnchors` keyed by the ephemeral UUIDs and written **out-of-band by the desktop dev-console**, never by this server.
- **Read/write pipeline (proven to coexist):** on-disk files are read via `parseImport(synthesizeImportPayload(contents))` (idempotent — a payload that already has `importMode` passes through unchanged; a raw workflow / bare `{workflows}` gets wrapped). `update_workflow` writes `serializeImport(document)` — the **canonical** import-payload (fixed key order, empty containers dropped, defaults applied, `operatorType→operation` normalized). **Transition and state order are preserved on round-trip** (no sorting anywhere in the emit path).
- `update_workflow` is **fail-closed**: if the resulting document has any `error`-severity diagnostic it writes nothing and returns `VALIDATION_FAILED`.

## 3. Addressing model

- **Transition:** the tuple **`(workflow, sourceState, transitionName)`** — the only stable, uniqueness-guaranteed, round-trip-safe key. On any *writable* (i.e. valid) document it is unambiguous, because validation forbids the duplicates that would make it ambiguous.
- **State:** **`(workflow, stateCode)`** — the state code is the stable key, human-authored and already the sidecar's `layout.nodes` key.

Both keys are **mutable by design**: renaming a transition (`update_transition` with `patch.name`) or a state (`rename_state`) changes its address — that is the intent of a rename, not a defect. No synthetic UUID is ever exposed or required.

**Multi-workflow files:** a file's payload may contain several workflows. A tool resolves the file by name via `findByName`, then locates the target workflow inside `session.workflows` by `w.name === workflow`, falling back to the sole workflow when the file has exactly one (mirrors `findByName`'s declared-name-then-basename spirit). No match → `NOT_FOUND`.

## 4. Tool surface (6 new tools; total 18 → 24)

**Transition trio**

| Tool | Input | Result (on success) |
|------|-------|---------------------|
| `update_transition` | `{ workflow, state, name, patch }` | `{ workflow, state, name, path, ok, diff, diagnostics }` |
| `add_transition` | `{ workflow, state, transition }` | `{ workflow, state, name, path, ok, diff, diagnostics }` |
| `remove_transition` | `{ workflow, state, name }` | `{ workflow, state, name, path, ok, diff }` |

**State trio**

| Tool | Input | Result (on success) |
|------|-------|---------------------|
| `add_state` | `{ workflow, code, state? }` | `{ workflow, code, path, ok, diff, diagnostics }` |
| `remove_state` | `{ workflow, code }` | `{ workflow, code, path, ok, diff }` |
| `rename_state` | `{ workflow, oldCode, newCode }` | `{ workflow, oldCode, newCode, path, ok, diff, diagnostics }` |

- `patch` / `transition` / `state` bodies mirror the model fields (see §9). `patch` fields are all optional; `add_transition.transition` requires at least `name` + `next`; `add_state.state` is optional (defaults to `{ transitions: [] }`).
- `diff` = `jsonDiff(before, canonical-after)` on the same basis as `update_workflow` (raw on-disk `before` vs canonical write). In practice `before` is already canonical (tool-written), so the diff is a tight delta.
- `diagnostics` = the non-error issues (warnings/info) from the successful parse, matching `update_workflow`'s `diagnostics` field. Errors never reach a success response (fail-closed).

## 5. Shared pipeline (all six tools)

1. **Resolve file:** `findByName(await ctx.discover(), workflow)` → `NOT_FOUND` if unresolved.
2. **Load:** read on-disk contents; `document = parseImport(synthesizeImportPayload(contents)).document`. If not structurally parseable (no `document`) → error envelope (the file is broken; direct the caller to `update_workflow`). Locate the target workflow in `session.workflows` (§3).
3. **Locate + apply:** find the addressed state / transition; return the op-specific `NOT_FOUND` / `ALREADY_EXISTS` (§6) before any mutation; apply the op to the typed document in memory.
4. **Fail-closed validate:** run the mutated document through the **same** workflow-core gate `update_workflow` uses — serialize to canonical, re-parse, and reject on any `error`-severity diagnostic (**write nothing**, return `VALIDATION_FAILED` with `diagnostics`). Serialization is guarded so **malformed nested patch data surfaces as `VALIDATION_FAILED`, never a crash**.
5. **Write:** `ctx.write(entry.relativePath, canonical)` (confined). Content-file only — the watcher live-pushes the change to the browser via the existing mechanism.
6. **Sidecar (state renames/removes only, §7):** best-effort, *after* the content write.
7. **Return** the op-specific success envelope with `diff` + `diagnostics`.

Two shared internals keep the six handlers thin: `loadWorkflowForEdit(ctx, workflow) → { entry, document, workflow }` (steps 1–2 + `NOT_FOUND`) and `commitEditedWorkflow(ctx, entry, document, before) → McpResult` (steps 4–5 + `diff`).

## 6. Per-op semantics & error envelopes

**`update_transition`** — locate `(workflow, state, name)` → `NOT_FOUND` on any missing segment. **Shallow field-merge:** each provided `patch` field replaces that field; omitted fields are preserved. Nested `criterion`/`processors`/`schedule`/`annotations` **replace wholesale** (no deep merge). `patch.name` renames the transition (new name re-validated for in-state uniqueness). Field **clearing is not supported in v1** — to drop an optional field, use whole-doc `update_workflow` (documented limitation).

**`add_transition`** — locate `(workflow, state)` → `NOT_FOUND`. If a transition with that name already exists in the state → **`ALREADY_EXISTS`** (checked before mutation; complements the validation gate). Append to `state.transitions`. `next` referencing a nonexistent state → `VALIDATION_FAILED`.

**`remove_transition`** — locate `(workflow, state, name)` → `NOT_FOUND`. Remove from `state.transitions`. (Removal rarely produces an error; the gate still runs.)

**`add_state`** — locate `workflow` → `NOT_FOUND`. If `states[code]` exists → **`ALREADY_EXISTS`**. Set `states[code] = state ?? { transitions: [] }`. Bad `code` regex or a seeded transition's dangling `next` → `VALIDATION_FAILED`. No sidecar change (no saved position yet).

**`remove_state`** — locate `workflow`; `states[code]` missing → `NOT_FOUND`. Delete the key. Fail-closed catches dangling references: any surviving transition `next` or `initialState` still pointing at `code` → `VALIDATION_FAILED` naming them (the caller repoints first). Sidecar: best-effort remove `layout.nodes[code]` (cosmetic).

**`rename_state`** — locate `workflow`; `states[oldCode]` missing → `NOT_FOUND`; `states[newCode]` already present → `ALREADY_EXISTS`. **Auto-cascade** in one atomic op: rebuild `states` **preserving key order** with `oldCode → newCode` substituted in place; rewrite `initialState` if it equals `oldCode`; rewrite **every** transition's `next: oldCode → newCode` across all states (including self-references). Bad `newCode` regex → `VALIDATION_FAILED`. Sidecar: migrate `layout.nodes[oldCode] → [newCode]` (§7).

Standard envelopes elsewhere: `INVALID_ARGS` (schema `safeParse` failure), and the `VALIDATION_FAILED` envelope is byte-identical to `update_workflow`/`create_workflow` (`{ code, diagnostics }`, `isError`).

## 7. Layout handling

Content edits touch **only the content file**; the watcher live-pushes the re-parsed document (state positions in the sidecar are keyed by the stable `stateCode`, so they survive content edits untouched). **Two state ops** additionally touch the sidecar:

- **`rename_state`** must migrate `layout.nodes[oldCode] → [newCode]` — otherwise the renamed state loses its saved position and re-lays-out to the origin.
- **`remove_state`** best-effort removes the now-orphaned `layout.nodes[code]` (cosmetic; an orphan is harmless).

A small confined **sidecar helper** performs this: read `<contentRelativePath>.replace(/\.json$/, ".layout.json")` if present; edit `sidecar[<declaredWorkflowName>].layout.nodes` (rename or delete one `stateCode` key); write back **preserving all other keys** (`_transitionIds`, `transitionPositions`, `edgeAnchors`, other workflows' entries). No sidecar file → no-op. This helper is **best-effort and runs after the content write**: a sidecar failure logs to stderr and never aborts or reverts the (already-succeeded) content edit — the state keeps its edit and merely loses its saved position, which the next `optimize_layout` restores.

**Explicitly not touched:** `transitionPositions`/`edgeAnchors` (ephemeral-UUID-keyed, desktop-owned). The pre-existing positional-remap-after-count-change behavior in `remapLayoutUuids` is unchanged; `add_transition`/`remove_transition` do not attempt to preserve any transition-edge positions (this server never wrote them).

## 8. Schemas (`.strict()`)

New Zod inputs in `server/schemas.ts` (all `.strict()`), each with a `z.infer` type export. A shared transition-body helper models the fields explicitly at the top level with **loose** nested passthroughs (deep grammar delegated to the workflow-core gate — avoids re-encoding and drift):

```ts
const transitionBody = z.object({
  name:        z.string().min(1).optional(),
  next:        z.string().min(1).optional(),
  manual:      z.boolean().optional(),
  disabled:    z.boolean().optional(),
  criterion:   z.record(z.string(), z.unknown()).optional(),
  processors:  z.array(z.record(z.string(), z.unknown())).optional(),
  schedule:    z.record(z.string(), z.unknown()).optional(),
  annotations: z.record(z.string(), z.unknown()).optional(),
}).strict();

// stateBody = z.object({ transitions: z.array(transitionBody).optional(),
//                        annotations: z.record(z.string(), z.unknown()).optional() }).strict()
updateTransitionInput = z.object({ workflow, state, name, patch: transitionBody }).strict();  // patch = any subset (empty = canonicalizing no-op)
addTransitionInput    = z.object({ workflow, state, transition: <transitionBody with name + next required> }).strict();
removeTransitionInput = z.object({ workflow, state, name }).strict();
addStateInput         = z.object({ workflow, code, state: stateBody.optional() }).strict();  // state defaults to { transitions: [] }
removeStateInput      = z.object({ workflow, code }).strict();
renameStateInput      = z.object({ workflow, oldCode, newCode }).strict();
```

(`workflow`/`state`/`name`/`code`/`oldCode`/`newCode` = `z.string().min(1)`.) Manifest JSON-Schema entries describe the same fields, nested `criterion`/`processors` as loose `object`/`array`.

## 9. Registration & module structure

- **Handlers:** `server/tools/transitions.ts` (update/add/remove transition) and `server/tools/states.ts` (add/remove/rename state); shared `loadWorkflowForEdit`/`commitEditedWorkflow` in a small `server/tools/edit_common.ts` (or co-located — the plan decides); sidecar helper in `server/layout.ts`.
- **Register each tool** in `manifest.ts` (clear description), the `index.ts` dispatcher map, and `schemas.ts`. Tool count assertions in `manifest.test.ts` bump 18 → 24.
- **README:** 18 → 24; add the six tools under Workflows with a one-line addressing note (tuple for transitions, `(workflow, code)` for states).

## 10. Backward compatibility

`update_workflow`, `create_workflow`, and all other existing tools are **unchanged**. The patch tools are purely additive. Whole-doc editing remains the escape hatch for anything the patch surface intentionally omits (field-clearing, bulk restructuring).

## 11. Out of scope (YAGNI)

`update_state` (state annotations — rarely edited via MCP); field-clearing / `null`-to-delete in `update_transition`; deep-merge of nested fields; batch/atomic multi-op tools; any transition-edge position management or synthetic-UUID exposure; workflow-level rename (that's the file/`create`/`delete` surface).

## 12. Testing strategy (TDD)

Per tool, happy path + every error envelope, with **write-nothing-on-failure asserted via a spy** (`ctx.write` never called on any rejection):

- `update_transition`: field-merge (toggle `disabled`, repoint `next`, replace `criterion`); rename via `patch.name`; `NOT_FOUND` (missing workflow/state/name); `VALIDATION_FAILED` (`next`→nonexistent state; rename→in-state collision); **malformed `criterion` → `VALIDATION_FAILED`, not a crash**.
- `add_transition`: append; `ALREADY_EXISTS` (dup name); `NOT_FOUND`; `VALIDATION_FAILED` (dangling `next`).
- `remove_transition`: remove; `NOT_FOUND`.
- `add_state`: add empty + add seeded-with-transitions; `ALREADY_EXISTS`; bad-regex `VALIDATION_FAILED`.
- `remove_state`: remove; `NOT_FOUND`; **dangling-reference `VALIDATION_FAILED`** (a transition still points at the removed code); sidecar `layout.nodes[code]` removed (real-fs).
- `rename_state`: **cascade** proven — a transition `next` and `initialState` that pointed at `oldCode` now point at `newCode`; state key order preserved; `NOT_FOUND`/`ALREADY_EXISTS`; **sidecar `layout.nodes` key migrated `oldCode → newCode`** while `_transitionIds`/other keys are preserved (real-fs).
- Schema `.strict()` rejection for all six inputs (`schemas.test.ts`).
- `manifest.test.ts`: 24-tool parity + dispatch smoke for the six.
- Existing suite stays green (build / vitest / typecheck / lint / e2e). Optional e2e extension deferred (the round's aggregate e2e already guards the render/live-push chain).

## 13. Decisions locked (confirmed with the human)

1. **Addressing key:** transition tuple `(workflow, state, name)`; state `(workflow, code)`.
2. **Surface:** all six ops (transition + state trios).
3. **`rename_state`:** auto-cascade (`next` + `initialState`) + sidecar node-key migration.
4. **Fail-closed on the *result*** (patching a currently-invalid file is allowed; rejected only if the result is invalid) — identical contract to `update_workflow`.
5. **No field-clearing in v1**; nested fields **replace wholesale**; `diff` basis matches `update_workflow`.
6. **No changes to `update_workflow`/`create_workflow`** or to transition-edge position handling.
