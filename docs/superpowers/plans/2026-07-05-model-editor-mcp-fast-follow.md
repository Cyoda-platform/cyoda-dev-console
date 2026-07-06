# Model Editor MCP — Fast-Follow Plan (#7, #10, + create-destination fix)

> **For agentic workers:** REQUIRED SUB-SKILL: execute this plan with superpowers:subagent-driven-development (fresh implementer + task review per task, whole-branch review at the end). Steps use `- [ ]`. **Task 3 (#7) is design-first — run superpowers:brainstorming before writing any code for it.**

**Goal:** The three items deferred from / surfaced after the Group A tool-surface refinement round (which shipped to `staging` via PR #39): make workflow/entity creation land files in the right place (new, low-severity ergonomics), close the `list_entities`/`list_workflows` asymmetry (#10), and add patch/transition-level `update_workflow` on a stable transition-identity model (#7 — the hard one, also fixes #2's root).

**Architecture:** `apps/model-editor-mcp/` is a headless Node/TypeScript (ESM) MCP server serving the real `@cyoda/workflow-react` editor to a browser. **17 tools** as of the merge (workflows: list/show/get/create/update/delete/optimize/validate; entities: list/get/create/update/delete/show_entity; project: get/configure; connection_info). Confined IO, `McpResult` envelopes, `.strict()` zod schemas, name-based resolution via discovery. Green on `staging` (build / 252 vitest / typecheck / lint 0-err / e2e 2/2 real headless Chromium).

**Tech Stack:** Node + TypeScript (ESM), vitest, Playwright (e2e), React 19 + Vite (`web/`), `@cyoda/workflow-*`, `@cyoda/agent-bridge-contract`.

## Where things stand (read before starting)
- **Base for Task 1 = current `staging` tip after the PR #39 merge (commit `1c37cdb` — verify with `git rev-parse HEAD` on a fresh branch off staging).** This plan's branch is `feat/model-editor-fast-follow` off that.
- Durable build ledger: `.superpowers/sdd/progress.md` (gitignored scratch — the full Group A history + this fast-follow's triage live there). Prior plans: `docs/superpowers/plans/2026-07-04-model-editor-mcp.md`, `…-expansion.md`, `…-tool-surface-refinement.md`. Spec: `docs/superpowers/specs/2026-07-04-model-editor-mcp-design.md`.
- **None of this is a correctness blocker.** The feature is merged and working. This is ergonomics + completeness.
- Dogfooding harness: repo-root `.mcp.json` (untracked) + `apps/model-editor-mcp/examples/` let a Claude session load the server and drive all 17 tools live.

## Global Constraints (unchanged from the refinement round — enforce)
- Content stays Claude-owned; the browser never persists content (graph warns, JSON pane read-only, `api.ts` GET-only, `POST /layout` is the only browser write). Do NOT add a browser content-write path.
- Confined IO only (`ctx.read`/`ctx.write`/`ctx.deleteFile`); `McpResult` via `ok`/`err`; name-based tools resolve via discovery (`findByName`/`findEntityByName`) before any path use; `.strict()` zod schemas.
- New/changed tools mirror EXISTING patterns exactly — read `server/tools/entities.ts`, `server/tools/list.ts`, `server/tools/update.ts`, `server/tools/workflows_crud.ts`, `server/discovery.ts`, `server/manifest.ts`, `server/index.ts` before writing.
- Every tool change: registered in `manifest.ts` + `index.ts` dispatcher + `.strict()` schema in `schemas.ts`, with tests (happy path + error envelopes).
- Keep the whole suite green (build / 252 vitest / typecheck / lint / 2 e2e). The e2e (`test:e2e`) must still pass.

---

### Task 1: create-destination — land new files where the existing ones live (post-round nit)
**Files:** `server/discovery.ts` (`resolveWorkflowCreatePath` + `resolveEntityCreatePath`); tests in `server/__tests__/discovery.test.ts` (or the create-tool tests).
**The problem (verified):** both `resolve*CreatePath` derive the destination from the FIRST glob's literal prefix — the segments before the first wildcard. With the default `models/workflow/**/*.json` glob, the prefix stops at `**`, so a new workflow lands at `models/workflow/<name>.json`. In a versioned/nested layout where the existing workflows live in `models/workflow/v1/`, the `**` still matches the new file (so it IS created/valid/discovered) but one directory ABOVE the rest — the discovered set then straddles `models/workflow/` and `models/workflow/v1/`. `create_entity` has the identical wart. (A non-`**` glob like `models/workflow/v1/*.json` already resolves correctly — the bug is specific to `**`-spanning globs over a nested layout.)
**Behavior:** Prefer the directory where the existing discovered files ACTUALLY live. Concretely: derive the destination directory from the current discovery result — if there are existing workflows/entities, use the directory of the majority (or, simplest defensible rule, the directory of the first discovered entry after the existing sort). Fall back to the current glob-literal-prefix rule ONLY when discovery is empty (nothing to be "next to"). Apply SYMMETRICALLY to both `resolveWorkflowCreatePath` and `resolveEntityCreatePath` (keep them consistent — they were mirrored on purpose). The resolver will need the discovered entries (or their dirs) passed in, since it currently only sees globs — thread that through from the create tools (which already call `ctx.discover()`/`ctx.discoverEntities()` for the existence check, so the entries are in hand).
- [ ] Failing test: with glob `models/workflow/**/*.json` and an existing workflow at `models/workflow/v1/Foo.json`, `create_workflow("Bar", …)` writes to `models/workflow/v1/Bar.json` (NOT `models/workflow/Bar.json`). Same for entities. Empty-discovery case still falls back to the glob prefix.
- [ ] Implement; keep the two resolvers symmetric. Register nothing new (behavior change only). Green. Commit.

### Task 2: #10 — list enrichment + validity reasons + batch validate
**Files:** `server/tools/entities.ts` (`listEntitiesTool`), `server/tools/list.ts` (`listWorkflowsTool`), a new `validate_workflows` (batch) in `server/tools/validate.ts` or a sibling; `schemas.ts`; `manifest.ts`; `index.ts`; tests.
**Behavior:**
- `list_entities` → enrich each entry with `lastModified` (and `sizeBytes` if cheap) so it matches the richness of `list_workflows`. `ctx.read`/discovery already surface `lastModified`; thread it through the entity discovery entry or read per-file (prefer discovery-time metadata — avoid an N+1 read if discovery already has it; check `discoverEntities`).
- `list_workflows` validity → attach a REASON to `valid: false` (the first error-severity diagnostic, or a short summary) rather than a bare boolean, so a caller knows WHY a workflow is invalid without a separate `validate_workflow` round-trip.
- `validate_workflows` (batch) → validate ALL discovered workflows in one call, returning `[{ name, valid, diagnostics|reason }]`. Mirror `validate_workflow`'s per-workflow logic; `.strict()` schema (likely no args, or an optional name filter). Register in manifest + index.
- [ ] Failing tests: `list_entities` carries `lastModified`; an invalid workflow in `list_workflows` carries a non-empty reason; `validate_workflows` returns one entry per discovered workflow with correct valid flags. Error envelopes as usual.
- [ ] Implement + register + schemas + manifest. Update the README tool count/list (now 18 tools). Green. Commit.

### Task 3: #7 — patch / transition-level `update_workflow` on a stable transition-identity model (DESIGN-FIRST)
**This is the hard one. Do NOT start coding it.** Run superpowers:brainstorming first, then superpowers:writing-plans to expand THIS task into its own detailed sub-plan before implementation. Escalate to the human on the identity-model decision.
**The problem:** `update_workflow` (and now `create_workflow`) take the WHOLE import-payload; to change one field a caller resends ~40 KB. There is no patch/transition-level op. The blocker is that transitions have no stable, caller-visible identity — the layout sidecar keys them by internal SYNTHETIC UUIDs (`_transitionIds`) that are reassigned on each load and are deliberately NOT exposed (that was finding #2, and why `optimize_layout`'s response was trimmed). A patch API needs a stable way to ADDRESS a transition (and correlate it to layout data) without leaking or depending on the synthetic UUIDs.
**Design questions to resolve in brainstorming (not here):**
- What is the stable addressing key for a transition? (e.g. `(workflow, sourceState, name)` tuple? an explicit user-authored id? a content-hash?) It must survive round-trips and be meaningful to an AI caller.
- What patch shape? (JSON-Patch-style ops? a targeted `update_transition`/`add_transition`/`remove_transition` set? a partial-merge document?)
- How does the chosen identity also let callers correlate layout positions (closing #2's root)?
- Backward compatibility: whole-doc `update_workflow` must keep working.
- [ ] Brainstorm the transition-identity model + patch API with the human; capture decisions in a spec.
- [ ] Write the detailed sub-plan (superpowers:writing-plans), then execute it (TDD). Green. Commit.

---

## After the tasks
1. Whole-branch review of THIS round (opus): `scripts/review-package <base> <head>` (`<base>` = the commit before Task 1 — record it in the ledger).
2. Fix any Critical/Important (one fix subagent with the full findings list).
3. Re-run the full aggregate incl. `pnpm --filter model-editor-mcp test:e2e`.
4. Push a fresh branch → open a PR against `staging` → superpowers:finishing-a-development-branch for the merge decision.

## Sequencing note
Tasks 1 and 2 are independent, mechanical, and cheap — land them first for quick wins. Task 3 (#7) is a genuine design problem; it may become its own PR after brainstorming, rather than riding this one. Don't block 1+2 on 3.
