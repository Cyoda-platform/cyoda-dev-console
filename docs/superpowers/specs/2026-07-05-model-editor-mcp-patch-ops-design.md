# Model Editor MCP — Transition & State Patch Ops (design)

**Date:** 2026-07-05
**Status:** Approved design, **revised after two independent design-review iterations** (round 1 found + fixed two Critical silent-data-loss flaws, §14; round 2 verified both fixes against source and added refinements, §15). Pending final written-spec review.
**Feature:** `#7` — patch / transition-level (and state-level) editing for the headless MCP server, on a stable, caller-visible addressing model. Also closes the root of `#2` (transition identity without leaking synthetic layout UUIDs).
**Context:** Fast-follow round after the Group A tool-surface refinement shipped to `staging` (PR #39). This is the design-first Task 3 of `docs/superpowers/plans/2026-07-05-model-editor-mcp-fast-follow.md`. It will almost certainly ship as **its own PR** (larger surface than Tasks 1–2).

---

## 1. Motivation

`update_workflow` and `create_workflow` take the **whole** import-payload. To change one field — toggle a transition's `disabled`, repoint a `next`, fix a typo'd state code — a caller resends ~40 KB and risks clobbering unrelated edits. There is no patch / element-level operation.

The blocker (finding `#2`) was that **transitions have no stable, caller-visible identity**: the layout sidecar keys transition data by internal synthetic UUIDs that are re-minted on every parse and were deliberately hidden. A patch API needs a way to *address* a transition (and a state) that survives round-trips and never depends on those UUIDs.

## 2. Ground-truth constraints (drive the whole design)

Verified against `@cyoda/workflow-core@0.4.0` (vendored at `node_modules/.pnpm/@cyoda+workflow-core@0.4.0/…/dist/`) and `apps/model-editor-mcp/server/`, across two review passes:

- **Transition shape:** `{ name, next, manual, disabled, annotations?, criterion?, processors?, schedule? }`. Target state is **`next`** (a `StateCode`); criteria is a single **`criterion?`** tree; processes are **`processors?: Processor[]`**. **No native `id`** — the Zod schema `$strip`s unknown keys, so a caller-invented `id` is silently discarded. **In `TransitionSchema`, `name`/`next`/`manual` are REQUIRED and `disabled` DEFAULTS to `false`; `manual` has NO default** (`index.js:187–188`) — so a newly-created transition must supply `manual` (drives `add_transition`'s required set, §4/§6/§8).
- **States:** `states: Record<StateCode, State>`, `State = { transitions: Transition[], annotations? }`. State codes are JSON object keys → **inherently unique**.
- **Uniqueness rules (all `error`-severity):** transition name unique **within its source state** (`duplicate-transition-name`, `index.js:1296–1303`); workflow name unique within the session (`duplicate-workflow-name`, `1172–1189`); every transition's `next` and the workflow's `initialState` must reference an existing state (`unknown-transition-target` `1235–1241`, `unknown-initial-state` `1199–1206`); names match `NAME_REGEX = /^[A-Za-z][A-Za-z0-9_-]*$/`. Transition names are **not** workflow-wide unique — the same name may recur in different states.
- **State codes are referenced in THREE typed sites** — `Workflow.initialState`, `Transition.next`, and the `states` record keys — **plus one untyped site: a `LifecycleCriterion` with `field:"state"` carries a state code in its free-form `value`** (`index.d.ts:30–35`; `value` is a `JsonValue` that may be a **scalar or an array**), nestable inside any `group`/`function` criterion at workflow *or* transition level. This untyped site is **not** covered by any `error`-severity validator (the `lifecycle` rule checks only `field`/`operation`, never `value`, `index.js:1412–1421`). It is load-bearing for `rename_state`/`remove_state` (§6, §14). The **sibling** untyped site `LifecycleCriterion` with `field:"previousTransition"` carries a **transition name** in `value`, equally unchecked (drives `update_transition`'s rename caveat, §6, §15).
- **Compound criteria nest via TWO fields:** `GroupCriterion.conditions[]` and `FunctionCriterion.function.criterion` (`index.d.ts:20,27`; `index.js:141,150`). Any criterion recursion (the C1 cascade/scan) must traverse **both**, or a lifecycle node nested under a function criterion is missed.
- **`serializeImportPayload` silently drops a structurally-invalid criterion.** `outputCriterion` (`index.js:318–371`) is a `switch (c.type)` with **no default and no post-switch return** → returns `undefined` for a criterion whose `type` is missing/unknown; the criterion vanishes from the output. `serializeImportPayload` itself has **no try/catch** (`1939–1945`), and a *different* malformation (e.g. `group` with non-array `conditions`) throws a `TypeError`. Drives the structural gate (§5, §14).
- **`validateAll` (= `ctx.validate`) is semantic-only** (`validateAll → validateSemantics`, `index.js:2097`); it assumes a structurally well-formed document. So a structurally-malformed injected criterion is caught by **neither** `validateAll` **nor** a serialize→reparse round-trip (serialize already dropped it). Structural validation must be done explicitly against the exported schemas (§5).
- **The exported `CriterionSchema` genuinely REJECTS a bad criterion** (round-2 verified): it is a `z.union` of five branches each pinning the discriminant with `z.literal("simple"|"lifecycle"|"array"|"group"|"function")` (`index.js:111,117,123,139,146`); a missing/unknown `type` fails all branches. `TransitionSchema.criterion = CriterionSchema.optional()` (`index.js:190`) — a **declared** key, so its interior is validated, not stripped. `ProcessorSchema`/`TransitionScheduleSchema` are likewise declared+required-fielded, so `TransitionSchema` catches processor/schedule malformations too. This is why the §5 structural gate works.
- **`parseImportPayload` canonicalizes BEFORE it validates:** it runs `normalizeOperatorAlias` (`operatorType→operation`, `index.js:244–267`) and `normalizeWorkflowInput` name-trimming (`index.js:934–956`) *before* the Zod schemas. So `update_workflow` accepts the `operatorType` alias and untrimmed names; the patch tools' structural gate must apply the same normalization to caller bodies (§5 step 4) or it would reject inputs `update_workflow` accepts.
- **Synthetic transition UUIDs** (`meta.ids.transitions`, sidecar `_transitionIds`): random `uuidv4` per parse; the MCP tools never thread a `prior`, so they are re-minted every load and are **never a stable external identity**. Correctly hidden from all responses.
- **Sidecar (`.layout.json`) keying:** top-level keyed by **declared workflow name** → `WorkflowUiMeta`; `layout.nodes` keyed by **`stateCode`** (stable); `transitionPositions`/`edgeAnchors` keyed by the ephemeral UUIDs and written **out-of-band by the desktop dev-console**, never by this server.
- **Read/write pipeline (proven to coexist):** on-disk files are read via `parseImport(synthesizeImportPayload(contents))` (idempotent — a payload that already has `importMode` passes through unchanged, `synthesizeImportPayload.ts:23`; a raw workflow / bare `{workflows}` gets wrapped). `update_workflow` writes `serializeImport(document)` — the **canonical** import-payload. **Transition and state order are preserved on round-trip** (no sorting in the emit path). `ctx.parseImport`/`ctx.serializeImport` are the bare functions called with no options, so the dialect defaults to `LATEST_CYODA_VERSION = "0.8"`, which emits `schedule`+`annotations` (drives the §7 dialect guardrail).
- `update_workflow` is **fail-closed**: if the resulting document has any `error`-severity diagnostic it writes nothing and returns `VALIDATION_FAILED`.

## 3. Addressing model

- **Transition:** the tuple **`(workflow, sourceState, transitionName)`** — the only stable, uniqueness-guaranteed, round-trip-safe key. On any *writable* (i.e. valid) document it is unambiguous, because validation forbids the duplicates that would make it ambiguous.
- **State:** **`(workflow, stateCode)`** — the state code is the stable key, human-authored and already the sidecar's `layout.nodes` key.

Both keys are **mutable by design**: renaming a transition (`update_transition` with `patch.name`) or a state (`rename_state`) changes its address — that is the intent of a rename, not a defect. No synthetic UUID is ever exposed or required.

**Multi-workflow files:** a file's payload may contain several workflows. A tool resolves the file by name via `findByName`, then locates the target workflow inside `session.workflows` by `w.name === workflow`, falling back to the sole workflow when the file has exactly one. No match → `NOT_FOUND`. The whole file (all sibling workflows) is re-serialized on write; siblings round-trip through the same canonicalization (harmless re-canonicalization noise at worst). **Two documented consequences (fail-closed spans siblings):** if any sibling is structurally unparseable, step-2 load blocks the edit; if any sibling carries a pre-existing *semantic* error, the step-5 gate rejects across all workflows — so a broken sibling in the same file must be fixed before workflow A can be patched. **Known inherited constraint:** `duplicate-workflow-name` is per-file only; two *different* files each declaring `Foo` → `findByName` always resolves the sort-first file, so the other's `Foo` is unaddressable by any name-based tool (predates the patch surface). Documented, not fixed here.

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

- `patch` / `transition` / `state` bodies mirror the model fields (see §8). `patch` fields are all optional; **`add_transition.transition` requires `name` + `next` + `manual`** (the model's required transition fields; `disabled` defaults to `false`); seeded `add_state.state.transitions[]` bodies carry the same requirement; `add_state.state` is optional (defaults to `{ transitions: [] }`).
- `diff` = `jsonDiff(before, canonical-after)` on the same basis as `update_workflow` (raw on-disk `before` vs canonical write). When `before` is already canonical (the common case) the diff is a tight delta; a first patch on a hand-authored non-canonical file additionally shows one-time canonicalization noise (key reorder, `disabled:false` injection, `operatorType→operation`), exactly as `update_workflow` does today.
- `diagnostics` = the non-error issues (warnings/info) from the successful parse, matching `update_workflow`'s `diagnostics` field, **plus** any advisory warnings the op adds (e.g. the `update_transition` rename `previousTransition` warning, §6). Errors never reach a success response (fail-closed).
- On the response after a rename (`update_transition` with `patch.name`), `name` is the **resulting** (new) name.

## 5. Shared pipeline (all six tools)

1. **Resolve file:** `findByName(await ctx.discover(), workflow)` → `NOT_FOUND` if unresolved.
2. **Load:** read on-disk contents; `document = parseImport(synthesizeImportPayload(contents)).document`. If not structurally parseable (no `document`) → error envelope (the file is broken; direct the caller to `update_workflow`). Locate the target workflow in `session.workflows` (§3).
3. **Locate + apply:** find the addressed state / transition; return the op-specific `NOT_FOUND` / `ALREADY_EXISTS` (§6) before any mutation; apply the op to the typed document in memory.
4. **Structural gate (closes review Critical C2).** First apply the same pre-validation canonicalization `parseImportPayload` uses so the gate accepts exactly what `update_workflow` accepts (§2): run the exported `normalizeOperatorAlias` on any injected criterion and trim string identifiers (`name`/`next`/`code`). Then validate every **caller-supplied** transition body (the patch merged onto the existing transition; the new transition; each seeded state transition) against `@cyoda/workflow-core`'s **exported `TransitionSchema`** (which composes `CriterionSchema`/`ProcessorSchema`/`TransitionScheduleSchema` — verified to reject a malformed/unknown-`type` criterion, §2). On failure → `VALIDATION_FAILED` (write nothing) with the Zod issues. The MCP input schema stays loose (§8); the source-of-truth schemas do the real structural enforcement — no grammar re-encoding, no drift.
5. **Semantic fail-closed gate:** run the mutated document through the **same** workflow-core semantic gate `update_workflow` uses — `serializeImport` (wrapped in try/catch → `VALIDATION_FAILED`, never `INTERNAL_ERROR`/crash), re-parse, and reject on any `error`-severity diagnostic (**write nothing**). Catches cross-element semantics: dangling `next`/`initialState`, in-state duplicate names, `NAME_REGEX` violations.
6. **Write:** `ctx.write(entry.relativePath, canonical)` (confined). Content-file only — the watcher live-pushes the change to the browser via the existing mechanism.
7. **Sidecar (state renames/removes only, §7):** best-effort, *after* the content write.
8. **Return** the op-specific success envelope with `diff` + `diagnostics`.

Two shared internals keep the six handlers thin: `loadWorkflowForEdit(ctx, workflow) → { entry, document, workflow }` (steps 1–2 + `NOT_FOUND`) and `commitEditedWorkflow(ctx, entry, document, before) → McpResult` (steps 4–6 + `diff`). The `VALIDATION_FAILED` envelope is produced by a shared `validationFailed(issues)` helper (§9). A shared `walkCriteria(criterion, visit)` helper traverses `group.conditions[]` **and** `function.function.criterion` (§2) for the C1 cascade/scan.

## 6. Per-op semantics & error envelopes

**`update_transition`** — locate `(workflow, state, name)` → `NOT_FOUND` on any missing segment. **Shallow field-merge:** each provided `patch` field replaces that field; omitted fields are preserved. Nested `criterion`/`processors`/`schedule`/`annotations` **replace wholesale** (no deep merge). The merged transition is structurally validated (§5 step 4). `patch.name` renames the transition (new name re-validated for in-state uniqueness). **Rename caveat (previousTransition):** a `lifecycle` criterion with `field:"previousTransition"` references a transition by *name*, and transition names are not globally unique, so the correct target of a rename is ambiguous — v1 does **not** auto-rewrite such references; instead it **scans and emits a non-blocking `warning` diagnostic** naming any `previousTransition` criterion whose `value` matches the old name, so the caller can review/fix via `update_workflow`. Documented limitation (§11). Field **clearing is not supported in v1** — to drop an optional field, use whole-doc `update_workflow`.

**`add_transition`** — locate `(workflow, state)` → `NOT_FOUND`. Requires `name`+`next`+`manual` (§4). If a transition with that name already exists in the state → **`ALREADY_EXISTS`** (pre-check before mutation). Append to `state.transitions`. `next` referencing a nonexistent state → `VALIDATION_FAILED`. (Note the deliberate code split: a duplicate at *add* is `ALREADY_EXISTS`; a *rename* collision is the semantic gate's `VALIDATION_FAILED` — different codes for the pre-check vs the gate.)

**`remove_transition`** — locate `(workflow, state, name)` → `NOT_FOUND`. Remove from `state.transitions`. Removing the last transition out of a state (including the initial state, leaving it terminal) is **allowed** — the model treats a terminal state as info-only; intended.

**`add_state`** — locate `workflow` → `NOT_FOUND`. If `states[code]` exists → **`ALREADY_EXISTS`**. Set `states[code] = state ?? { transitions: [] }`; any seeded transitions are structurally validated (§5 step 4) and require `name`+`next`+`manual`. Bad `code` regex or a seeded transition's dangling `next` → `VALIDATION_FAILED`. No sidecar change.

**`remove_state`** — locate `workflow`; `states[code]` missing → `NOT_FOUND`. Delete the key. The semantic gate catches dangling `next`/`initialState` → `VALIDATION_FAILED` naming them. **Additionally (closes review Critical C1):** because a `lifecycle` criterion referencing the removed code lives in a free-form `value` no `error`-rule checks, `remove_state` uses `walkCriteria` over every workflow- and transition-level criterion for a `lifecycle` node with `field==="state"` whose `value` **equals or (if an array) contains** `code`; if any exist it rejects with `VALIDATION_FAILED` naming them (the caller repoints first) rather than leaving a silent dangling gate. Sidecar: best-effort remove `layout.nodes[code]` (cosmetic).

**`rename_state`** — locate `workflow`; `states[oldCode]` missing → `NOT_FOUND`; `states[newCode]` already present → `ALREADY_EXISTS`. **Auto-cascade** in one atomic op:
1. rebuild `states` **preserving key order** with `oldCode → newCode` substituted in place;
2. rewrite `initialState` if it equals `oldCode`;
3. rewrite **every** transition's `next: oldCode → newCode` across all states (including self-references);
4. **(closes review Critical C1)** `walkCriteria` over every criterion tree (`workflow.criterion` and every transition's `criterion`, traversing both `group.conditions` and `function.function.criterion`) and rewrite each `lifecycle` node with `field==="state"` whose `value` **equals** `oldCode` (scalar) **or contains** `oldCode` (array element) to `newCode`.
Bad `newCode` regex → `VALIDATION_FAILED`. Sidecar: migrate `layout.nodes[oldCode] → [newCode]` (§7).

Standard envelopes elsewhere: `INVALID_ARGS` (schema `safeParse` failure); the `VALIDATION_FAILED` envelope is byte-identical to `update_workflow`/`create_workflow` (`{ code, diagnostics }`, `isError`) via the shared helper (§9).

## 7. Layout handling

Content edits touch **only the content file**; the watcher live-pushes the re-parsed document (state positions are keyed by the stable `stateCode`, so they survive content edits untouched). **Two state ops** additionally touch the sidecar:

- **`rename_state`** must migrate `layout.nodes[oldCode] → [newCode]` — otherwise the renamed state loses its saved position and re-lays-out to the origin.
- **`remove_state`** best-effort removes the now-orphaned `layout.nodes[code]` (cosmetic).

A small confined **sidecar helper** performs this: read `<contentRelativePath>.replace(/\.json$/, ".layout.json")` if present; edit `sidecar[<resolved workflow.name>].layout.nodes` (rename or delete one `stateCode` key) — keyed by the **resolved declared `workflow.name`**, never the caller's `workflow` argument (which may be a file basename via `findByName`'s fallback); write back **preserving all other keys** (`_transitionIds`, `transitionPositions`, `edgeAnchors`, other workflows' entries). No sidecar file → no-op. **Best-effort, after the content write:** a sidecar failure logs to stderr and never aborts or reverts the (already-succeeded) content edit — the state keeps its edit and merely loses its saved position, which the next `optimize_layout` restores.

**Explicitly not touched:** `transitionPositions`/`edgeAnchors` (ephemeral-UUID-keyed, desktop-owned). **Dialect guardrail (round-2):** `schedule`+`annotations` survive round-trip only because the default `0.8` dialect emits them; the `0.7` dialect silently drops both and the structural gate would not catch that (they are structurally valid — the *dialect* strips them). Not reachable today (`ctx.serializeImport` is called with no options → `0.8`), but if `sourceVersion` ever becomes configurable this needs a guardrail.

## 8. Schemas (`.strict()`)

New Zod inputs in `server/schemas.ts` (all `.strict()`), each with a `z.infer` type export. A shared transition-body helper models the fields explicitly at the top level with **loose** nested passthroughs — the deep grammar is enforced at apply-time against the exported `TransitionSchema` (§5 step 4):

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

// newTransitionBody = transitionBody with name + next + manual REQUIRED (model's required fields)
// stateBody         = z.object({ transitions: z.array(newTransitionBody).optional(),
//                                annotations: z.record(z.string(), z.unknown()).optional() }).strict()
updateTransitionInput = z.object({ workflow, state, name, patch: transitionBody }).strict();  // patch = any subset (empty = canonicalizing no-op)
addTransitionInput    = z.object({ workflow, state, transition: newTransitionBody }).strict();
removeTransitionInput = z.object({ workflow, state, name }).strict();
addStateInput         = z.object({ workflow, code, state: stateBody.optional() }).strict();  // state defaults to { transitions: [] }
removeStateInput      = z.object({ workflow, code }).strict();
renameStateInput      = z.object({ workflow, oldCode, newCode }).strict();
```

(`workflow`/`state`/`name`/`code`/`oldCode`/`newCode` = `z.string().min(1)`.) The MCP input schema requires `name`/`next`/`manual` on a *new* transition body but does NOT re-encode the criterion grammar; the structural gate (§5 step 4) enforces criterion/processor/schedule shape. Manifest JSON-Schema entries describe the same fields.

## 9. Registration, shared helpers & module structure

- **Shared `VALIDATION_FAILED` helper (closes review Important I1):** the exact envelope is currently hand-rolled identically in `update.ts` and `workflows_crud.ts`, and `err()` does not emit `structuredContent.code`. Extract `validationFailed(issues)` into `envelope.ts` (producing `content:[{type:"text",text:"VALIDATION_FAILED: "+JSON.stringify(issues)}], isError:true, structuredContent:{code:"VALIDATION_FAILED",diagnostics:issues}`), use it in all six new tools, and **retrofit the two existing sites** (round-2 verified `makeDispatcher` forwards any `content`-bearing object unchanged, so a returned helper result is safe).
- **Handlers:** `server/tools/transitions.ts` (update/add/remove transition) and `server/tools/states.ts` (add/remove/rename state); shared `loadWorkflowForEdit`/`commitEditedWorkflow` + `walkCriteria` (state-code / lifecycle recursion) in a small `server/tools/edit_common.ts` (final boundaries per the plan); sidecar helper in `server/layout.ts`.
- **Register each tool** in `manifest.ts`, the `index.ts` dispatcher map, and `schemas.ts`. Tool-count assertions in `manifest.test.ts` bump 18 → 24.
- **README:** 18 → 24; add the six tools under Workflows with a one-line addressing note (tuple for transitions, `(workflow, code)` for states) and the two documented limitations (no field-clearing; rename does not track `previousTransition`).

## 10. Backward compatibility

`update_workflow`, `create_workflow`, and all other existing tools are **unchanged** (the `validationFailed` retrofit is a pure internal extraction — identical output). The patch tools are purely additive. Whole-doc editing remains the escape hatch for anything the patch surface intentionally omits. **Content-ownership invariant preserved:** every write is a server-side confined `ctx.write` from a Claude MCP call, never the browser (the browser's only persistence path remains `POST /layout` → sidecar). Sidecar writes are server-side best-effort, consistent with `optimize_layout`.

## 11. Out of scope (YAGNI)

`update_state` (state annotations — rarely edited via MCP); field-clearing / `null`-to-delete in `update_transition`; deep-merge of nested fields; batch/atomic multi-op tools; any transition-edge position management or synthetic-UUID exposure; workflow-level rename; fixing the pre-existing cross-file duplicate-workflow-name ambiguity (§3); **auto-rewriting `lifecycle field:"previousTransition"` references on transition rename** (ambiguous — v1 warns only, §6).

## 12. Testing strategy (TDD)

Per tool, happy path + every error envelope, **write-nothing-on-failure asserted via a spy** (`ctx.write` never called on any rejection):

- `update_transition`: field-merge (toggle `disabled`, repoint `next`, replace `criterion`); rename via `patch.name`; `NOT_FOUND`; `VALIDATION_FAILED` (`next`→nonexistent state; rename→in-state collision). **C2 regression:** a `patch.criterion` with unknown/missing `type` → `VALIDATION_FAILED`, criterion NOT silently dropped, `ctx.write` not called (RED-fails a serialize→reparse-only gate). **Normalization parity:** a `criterion` using `operatorType` (alias) and an untrimmed name are ACCEPTED (not rejected), matching `update_workflow`. **previousTransition:** a rename with a `lifecycle field:"previousTransition"` referencing the old name still succeeds but returns a non-blocking `warning` diagnostic naming it.
- `add_transition`: append (body includes `manual`); **missing `manual` → `VALIDATION_FAILED`**; `ALREADY_EXISTS` (dup name); `NOT_FOUND`; `VALIDATION_FAILED` (dangling `next`).
- `remove_transition`: remove; `NOT_FOUND`; removing the last transition out of the initial state succeeds.
- `add_state`: add empty + add seeded-with-transitions (each with `manual`); `ALREADY_EXISTS`; bad-regex `VALIDATION_FAILED`; seeded transition with malformed criterion → `VALIDATION_FAILED`.
- `remove_state`: remove; `NOT_FOUND`; **dangling-`next` `VALIDATION_FAILED`**; **C1 regression:** a `lifecycle field:"state"` criterion (including one nested under a `group`/`function`, and an **array-valued** `value` containing the code) still referencing the removed code → `VALIDATION_FAILED` (not a silent orphan); sidecar `layout.nodes[code]` removed (real-fs).
- `rename_state`: **cascade** proven — `next` and `initialState` pointing at `oldCode` now point at `newCode`; **C1 regression:** a `lifecycle field:"state"` criterion `value` (workflow-level, transition-level, nested under a function criterion, and array-valued) rewritten `oldCode → newCode`; state key order preserved; `NOT_FOUND`/`ALREADY_EXISTS`; **sidecar `layout.nodes` key migrated** while `_transitionIds`/other keys preserved (real-fs).
- Shared `validationFailed` helper: unit-tested for the exact envelope; the two retrofitted sites keep their existing assertions green.
- Schema `.strict()` rejection for all six inputs (`schemas.test.ts`).
- `manifest.test.ts`: 24-tool parity + dispatch smoke for the six.
- Existing suite stays green (build / vitest / typecheck / lint / e2e).

## 13. Decisions locked (confirmed with the human)

1. **Addressing key:** transition tuple `(workflow, state, name)`; state `(workflow, code)`.
2. **Surface:** all six ops (transition + state trios).
3. **`rename_state`:** auto-cascade — `next` + `initialState` + **lifecycle-`state` criterion values (scalar or array, nested)** — plus sidecar node-key migration. `remove_state` scans-and-rejects on the same references.
4. **`add_transition` / seeded transitions require `name`+`next`+`manual`** (the model's required fields; `manual` has no default).
5. **`update_transition` rename** does not auto-track `lifecycle previousTransition` references (ambiguous) — it warns; documented limitation.
6. **Fail-closed on the *result*** (patch a currently-invalid file → allowed if result is valid) — identical contract to `update_workflow`; the burden spans siblings in a multi-workflow file.
7. **No field-clearing in v1**; nested fields **replace wholesale**; `diff` basis matches `update_workflow`.
8. **No changes to `update_workflow`/`create_workflow`** semantics (only the internal `validationFailed` extraction) or to transition-edge position handling.

## 14. Review round 1 outcome (folded in)

Verified six load-bearing claims; addressing-unambiguity, order-preservation, idempotency, sidecar keying confirmed solid. **Two Critical silent-data-loss flaws found + fixed:**
- **C1** — `rename_state`/`remove_state` silently corrupt `lifecycle`-`state` criteria (state codes also in a `LifecycleCriterion.value`, unchecked). Fix: cascade/scan those values (§6). Regression-tested.
- **C2** — malformed `patch.criterion` silently dropped, written `ok:true` (`outputCriterion` returns `undefined` for unknown `type`; `validateAll` semantic-only). Fix: structural gate vs exported `TransitionSchema` before serialize (§5 step 4). Regression-tested.
Also: shared `validationFailed` helper (I1), guarded serialize (I2), cross-file duplicate-name constraint documented (I3), diff canonicalization noise (M1), terminal-initial-state allowed (M2).

## 15. Review round 2 outcome (folded in)

Independently **verified both C1 and C2 fixes effective against source** (CriterionSchema is a `z.literal`-discriminated union → genuinely rejects a bad `type`; the state-code enumeration is complete). Refinements folded in:
- **`manual` required, no default** — `add_transition`/seeded transitions require `manual`; the happy path and tests reflect it (§4/§6/§8/§12). *(Was: would RED-fail the tests as written.)*
- **`lifecycle previousTransition` orphan on transition rename** — same silent class as C1, but a transition name is ambiguous → v1 warns rather than auto-rewrites (§6/§11); documented.
- **Criterion recursion is over two fields** (`group.conditions` + `function.function.criterion`) and lifecycle `value` may be an **array** — the `walkCriteria` helper and C1 cascade/scan handle both (§2/§5/§6).
- **Normalization skew** — the structural gate first applies `normalizeOperatorAlias` + identifier-trim so the patch tools accept the same inputs `update_workflow` does (§2/§5 step 4).
- **Multi-workflow fail-closed spans siblings** and **collision-code split** (`ALREADY_EXISTS` on add vs `VALIDATION_FAILED` on rename) documented (§3/§6).
- **Dialect guardrail** for `schedule`/`annotations` under a non-default dialect (§7).
Verified sound (no change needed): the `validationFailed` envelope shape + dispatcher forwarding, reject ordering, sidecar declared-name keying, schedule/annotations preservation under the default `0.8` dialect.
