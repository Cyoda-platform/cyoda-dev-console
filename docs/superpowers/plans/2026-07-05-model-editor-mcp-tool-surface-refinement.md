# Model Editor MCP — Tool-Surface Refinement Plan (Group A)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to execute this plan task-by-task (fresh implementer + task review per task, whole-branch review at the end). Steps use `- [ ]`.

**Goal:** Refine the `apps/model-editor-mcp/` MCP tool surface per dogfooding feedback — close the workflow CRUD gap, make reads predictable, cut response bloat/noise — and fold it into the OPEN PR #39 before merge.

**Architecture:** `apps/model-editor-mcp/` is a headless Node MCP server serving the real `@cyoda/workflow-react` editor to a browser (13 tools; workflows + entities + project config). Complete, twice-reviewed, green (build / 226 vitest / real headless-Chromium e2e / typecheck / lint). Branch `feat/live-workflow-editor` → **PR #39** against `staging`. This round is ADDITIVE refinement on that base.

**Tech Stack:** Node + TypeScript (ESM), vitest, Playwright (e2e), React 19 + Vite (web/), `@cyoda/workflow-*`, `@cyoda/agent-bridge-contract` (`McpResult`).

## Where things stand (read before starting)
- The feature works end-to-end — verified by live dogfooding this session: all tools drive correctly, and the browser renders workflows (graph + ELK layout + kind badges) and entities (JSON tree) with self-service picker navigation, zero console errors. `.mcp.json` (repo root) + `apps/model-editor-mcp/examples/` (Order/Payment/Shipment workflows + Customer/Order/Payment/Product entities + an `Order.layout.json`) let a Claude session load the server and dogfood it.
- Durable ledger of the whole build: `.superpowers/sdd/progress.md`. Base plan: `docs/superpowers/plans/2026-07-04-model-editor-mcp.md`. Expansion plan: `docs/superpowers/plans/2026-07-05-model-editor-mcp-expansion.md`. Spec: `docs/superpowers/specs/2026-07-04-model-editor-mcp-design.md`.
- **NONE of this round is a correctness blocker.** It's ergonomics + completeness. Fold into #39, re-review, then finish.

## Dogfooding feedback (12 findings) + triage — the "why"
A separate Claude session graded the tool surface. Verified-accurate claims:
- **#6 (fix, biggest):** no `create_workflow`/`delete_workflow`; `update_workflow` hard-requires existence (`findByName` → `NOT_FOUND`, `tools/update.ts:17-18`) so you can't create/remove a workflow via MCP. Breaks the original "AI can CRUD workflow configurations" intent.
- **#1 + #5 (fix):** `show_workflow` returns CANONICALIZED content (`parseImport → serializeImport`, `tools/show.ts:22,25`) not the raw file (silent normalization: `operatorType→operation`, empty `context` dropped, `disabled:false` injected) → round-tripping via `update_workflow` silently commits transforms. And read semantics are asymmetric: workflows have only `show_workflow` (renders, side-effect) with no pure read; entities have only `get_entity` (pure) with no render.
- **#2 + #8 (fix):** `optimize_layout` leaks `_transitionIds` (internal synthetic-UUID map, uncorrelatable to the name-based source) + responses are bloated (full doc echo). Token efficiency was a core goal.
- **#9 (fix):** `_connection.url` (with session token) injected into EVERY result by `withConnection` (`mcp.ts:43,53-55`) — noise + token-spray into every payload/log.
- **#3/#4/#11/#12 (document — intended but unstated):** `configure_project` is session-only (resets on restart; defaults from `--workflow-globs`/`--entity-globs`) — the globs "improving on reconnect" was the rebuilt server's new narrow defaults, NOT persistence. Discovery is a fresh per-call scan + a file-watcher live-pushing to the browser. `optimize_layout` persisting a `.layout.json` sidecar is intended; its presets (`websiteCompact`/`configuratorReadable`/`opsAudit`) + orientation defaults are undocumented. Port is deterministic per project path (stable); token regenerates per process (security) — `connection_info` is the recovery.
- **#7 + #10 (DEFERRED to a fast-follow, NOT this round):** patch/partial `update_workflow` (needs a stable transition-identity model first — ties to #2); enrich `list_entities` + validity reasons / batch-validate.

## Global Constraints
- Content stays Claude-owned; the browser never persists content (graph warns, JSON pane read-only, `api.ts` GET-only, `POST /layout` is the only browser write). Do not add a browser content-write path.
- Confined IO only (`ctx.read`/`ctx.write`/`ctx.deleteFile`); `McpResult` envelope via `ok`/`err`; name-based tools resolve via discovery before any path use; `.strict()` zod schemas.
- New tools mirror the EXISTING tool patterns exactly — read `server/tools/entities.ts` (CRUD), `server/tools/show.ts`, `server/tools/update.ts`, `server/discovery.ts` (`findByName`/`findEntityByName`/`resolveEntityCreatePath`), `server/mcp.ts` (`withConnection`/dispatcher), `server/manifest.ts`, `server/index.ts` (dispatcher wiring), `server/sse.ts` (`setShown`/`currentShown`), `web/src/App.tsx` (SSE state machine + current-view) before writing.
- Every new tool: registered in `manifest.ts` + `index.ts` dispatcher + `.strict()` schema in `schemas.ts`, with tests (happy path + error envelopes) — mirror how Task 16/18 did it.
- Keep the whole suite green (currently 226 vitest + 2 e2e). The e2e (`test:e2e`) must still pass.

---

### Task 1: De-spray `_connection` (#9)
**Files:** Modify `server/mcp.ts` (remove/gate `withConnection`); ensure `connection_info` + `get_project` still surface the URL in their own payloads (they already do). Test: `server/__tests__/*` that asserted `_connection` on arbitrary results.
**Behavior:** Tool results must NOT carry `_connection.url` anymore. `connection_info` remains the canonical way to get the URL (it already returns `{url, port}`); `get_project` already includes `_connection` in its own shape — keep the URL discoverable there if cheap, but stop the blanket injection into every result.
- [ ] Find every test asserting `_connection` on a non-connection tool result; update them to assert its ABSENCE (grep `_connection` across `server/__tests__`).
- [ ] Remove the `withConnection` wrap in the dispatcher (`mcp.ts:43`); delete/retire `withConnection` if now unused.
- [ ] Confirm `connection_info` still returns `{url, port}` and the web shell still gets the token — the browser reads the token from the server-injected `window.__MODEL_EDITOR__`, NOT from a tool result, so this is safe. Verify `web/` is unaffected.
- [ ] `pnpm --filter model-editor-mcp test` + typecheck + lint green. Commit.

### Task 2: `get_workflow` (raw read) + document canonicalization (#1, #5 part 1)
**Files:** Create `server/tools/get_workflow.ts` (mirror `getEntityTool`); add `getWorkflowInput` to `schemas.ts`; register in `manifest.ts` + `index.ts`. Test: `server/__tests__/get_workflow.test.ts`.
**Behavior:** `get_workflow(name)` → `{ name, path, content: <RAW file contents via ctx.read>, lastModified }` — NO `parseImport`/`serializeImport`, so it round-trips byte-faithfully (unlike `show_workflow`). `NOT_FOUND` when absent (via `findByName`). In the `show_workflow` + `update_workflow` tool DESCRIPTIONS (manifest) note that they canonicalize (parse→serialize) and that `get_workflow` is the raw read.
- [ ] Failing test: `get_workflow` returns the raw on-disk bytes for a fixture with a legacy field (e.g. a transition with an extra key) — assert the field is PRESERVED (proving no canonicalization).
- [ ] Implement (mirror `getEntityTool`, but read a workflow entry via `findByName`).
- [ ] Register + schema + manifest description note. Test NOT_FOUND. Green. Commit.

### Task 3: `create_workflow` + `delete_workflow` (#6 — the big one)
**Files:** `server/discovery.ts` (add `resolveWorkflowCreatePath` — mirror `resolveEntityCreatePath`, deriving the dir from `workflowGlobs`); `server/tools/workflows_crud.ts` (or extend an existing tools file) with `createWorkflowTool`/`deleteWorkflowTool` (mirror `createEntityTool`/`deleteEntityTool`); schemas `createWorkflowInput`/`deleteWorkflowInput`; register in `manifest.ts` + `index.ts`. Tests.
**Behavior:**
- `create_workflow(name, content)`: JSON-parse-guard (`INVALID_JSON`); reject if a workflow with that name already exists (`ALREADY_EXISTS`, checked via `findByName` BEFORE writing); resolve a destination via `resolveWorkflowCreatePath`; `ctx.write`. Content is a full import-payload (`{importMode, workflows:[…]}`). Consider validating semantics and surfacing issues in the result (non-fatal), mirroring `update_workflow`.
- `delete_workflow(name)`: `findByName` → `NOT_FOUND` when absent (do NOT rely on `ctx.deleteFile` surfacing ENOENT — it throws `ConfinementError`, see the base ledger); `ctx.deleteFile(entry.relativePath)`; ALSO delete the `<name>.layout.json` sidecar if present (best-effort — check existence first, same NOT_FOUND-safe pattern).
- [ ] Failing tests: create → then `list_workflows` shows it; create dup → `ALREADY_EXISTS`; create bad JSON → `INVALID_JSON`; delete existing → gone from list + sidecar removed; delete missing → `NOT_FOUND`.
- [ ] Implement `resolveWorkflowCreatePath` + both tools (mirror the entity CRUD). Register + schemas + manifest.
- [ ] Green. Commit.

### Task 4: `show_entity` (#5 part 2 — render an entity, Claude-driven)
**Files:** `server/sse.ts` (`setShown`/`ShownPayload` — generalize to carry `kind: "workflow" | "entity"`); `server/tools/show_entity.ts` (mirror `showWorkflowTool` but for an entity — resolve via `findEntityByName`, read raw contents, `setShown({kind:"entity", …})`, push over SSE); `web/src/App.tsx` (handle an entity `show` SSE event → set the current view to that entity, same path the picker uses); register in `manifest.ts`/`index.ts` + `showEntityInput` schema. Tests (server + a DOM-light web test that an entity-show event switches the view). Optionally extend `e2e/smoke.spec.ts`.
**Behavior:** `show_entity(name)` makes the browser switch to that entity's Tree/JSON view (the human's picker already does this client-side; this is the Claude-driven equivalent, symmetric with `show_workflow`). Preserve all base live-loop behavior (auto-apply, echo-suppression, current-view gating). This is the trickiest task — it touches the SSE shown-model + the browser state machine. Study how `show_workflow`→`setShown`→`App.tsx` works first, and how the picker sets an entity view, then unify.
- [ ] Failing test: an entity `show` event drives the browser to the entity view (mirror the existing `show_workflow` push test + the AppShell picker test).
- [ ] Implement server + web. Keep the workflow show path unchanged.
- [ ] Green (incl. web tests). Commit.

### Task 5: `optimize_layout` — drop `_transitionIds`, trim bloat (#2, #8)
**Files:** `server/tools/optimize_layout.ts` (+ its test).
**Behavior:** Remove `_transitionIds` (the internal synthetic-UUID map) from the response entirely — it's uncorrelatable to the name-based source and is pure internal state. Keep the persisted `.layout.json` write and return a lean result: `{ name, path, ok: true, nodeCount }` (positions still persisted to disk + pushed to the browser, but not echoed as a large blob unless a caller opts in). If retaining positions in the response is preferred, at minimum drop `_transitionIds`. Update the tool description to state it persists a `.layout.json` sidecar and to document the `preset`/`orientation` options.
- [ ] Failing test: response has no `_transitionIds`; the `.layout.json` sidecar is still written.
- [ ] Implement + update the manifest description (presets/orientation/sidecar-write). Green. Commit.

### Task 6: Documentation (#1, #3, #4, #11, #12)
**Files:** `apps/model-editor-mcp/README.md` (+ tool `description` fields in `manifest.ts` where a one-liner clarifies behavior).
**Behavior:** Document, accurately: `show_workflow`/`update_workflow` canonicalize (raw read = `get_workflow`); `configure_project` is session-only (resets on restart; defaults from CLI flags); discovery is a fresh per-call scan + a browser file-watcher; `optimize_layout` persists a `.layout.json` sidecar + what the presets/orientation do; the port is deterministic-per-project and the token regenerates per process (use `connection_info` after a restart). Update the tool count / list to include the new `create_workflow`/`delete_workflow`/`get_workflow`/`show_entity`.
- [ ] Update README + manifest descriptions. `pnpm -r build` + test + typecheck + lint green (docs shouldn't break, confirm). Commit.

---

## After the tasks
1. Whole-branch review of THIS round (opus): `scripts/review-package <base> <head>` where `<base>` = the commit before Task 1 (record it). Focus: no browser content-write path introduced; base live-loop preserved (esp. after Task 4's App.tsx change); new tools consistent with existing patterns; `_connection` genuinely gone everywhere; tests unweakened.
2. Fix any Critical/Important (one fix subagent).
3. Re-run the full aggregate incl. `pnpm --filter model-editor-mcp test:e2e`.
4. Push to the branch (updates PR #39). Then use `superpowers:finishing-a-development-branch` for the merge decision (the branch is already pushed as PR #39, so this likely means: confirm CI green, then merge the PR).

## Deferred to a FAST-FOLLOW (do NOT do here)
- **#7** patch/partial `update_workflow` (design a stable transition-identity model first — this also gives callers a way to correlate layout data, addressing the root of #2).
- **#10** enrich `list_entities` (lastModified/size), add validity reasons + a batch `validate_workflows`.
