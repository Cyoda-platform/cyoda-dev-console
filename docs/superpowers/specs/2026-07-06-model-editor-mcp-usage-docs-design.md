# Model Editor MCP — LLM Usage Docs (design)

**Date:** 2026-07-06
**Status:** Approved design.
**Goal:** Give an LLM driving the `model-editor` MCP server a clear operational model for using the 24 tools well together — without bloating every conversation's always-on context.

## Background (MCP loading model, Claude Code v2.1+)

- A tool's `name` + `description` are **always-on** (they also feed tool-search matching); the input **schema is deferred** until the tool is used. So descriptions — not schemas — are the always-on cost (~1,200 tokens across 24 tools today).
- The MCP `initialize` result's **`instructions`** string is loaded once at session start (**capped at 2 KB**, truncated after) and explicitly helps tool-search decide when to reach for this server. We send none today.
- Resources/prompts are **on-demand** (bodies cost zero context until read/invoked).

## Approach (chosen)

Carry the operational model in the server **`instructions`** (always-on but cheap, and it earns its keep via tool-search), and **trim the verbose tool descriptions** by moving their cross-tool guidance (fail-closed, prefer-patch, canonicalization) into instructions. **No on-demand guide** — the exhaustive per-tool reference stays in the human `README.md`. Net always-on footprint is slightly *lower* than today (description trims ≈ −1,000 chars vs instructions ≈ +800 chars) while the operational model becomes explicit.

## The `instructions` string (≤ 2 KB, most-important-first)

> **model-editor** edits Cyoda workflow/entity model files and serves the real graph editor to a browser. Claude owns file content; the browser is read-only for content and human-owned for layout (node positions). Display an item with `show_workflow`/`show_entity`; tidy positions with `optimize_layout` after structural edits.
> For a single change prefer the element tools — `update_transition`/`add_transition`/`remove_transition`, `add_state`/`remove_state`/`rename_state` — over whole-document `update_workflow`. Each is atomic and **fail-closed** (validates the whole document, writes nothing on error), so never stage an invalid intermediate. Create a state before adding transitions into it (`add_transition` to a missing target is rejected). `rename_state` cascades every `next`-ref, `initialState`, lifecycle state-criterion, and the saved layout position.
> Address a transition by `(workflow, state, name)`, a state by `(workflow, code)` — the stable keys. `configure_project` sets session-only workflow/entity globs; `get_project` reports them. `get_workflow` is raw bytes; `show_workflow`/`update_workflow` canonicalize. Errors are `McpResult` envelopes: `NOT_FOUND` / `ALREADY_EXISTS` / `VALIDATION_FAILED` (diagnostics; nothing written) / `INVALID_ARGS` / `INVALID_JSON`.

## Description trims (move cross-tool prose to instructions; keep each tool's own specifics)

`list_workflows`, `show_workflow`, `create_workflow`, `update_workflow`, `update_transition`, `optimize_layout`, `validate_workflows` — trim the fail-closed / canonicalization / prefer-patch prose (now in instructions), keeping per-tool specifics (patch merge semantics, `previousTransition` caveat, layout options, return shapes). All descriptions stay non-empty.

## Files

- **New** `server/instructions.ts` — `export const SERVER_INSTRUCTIONS` (the string above; testable length).
- `server/mcp.ts` — add `instructions: SERVER_INSTRUCTIONS` to the `initialize` result.
- `server/manifest.ts` — trim the 7 descriptions.
- `README.md` — add a short "operational model" note so the human doc and the instructions agree.
- `server/__tests__/mcp.test.ts` — extend the `initialize` test: `result.instructions` present, non-empty, ≤ 2048 bytes, and mentions the key rule (e.g. "fail-closed").

## Constraints / non-goals

- **No tool behavior change** — names, schemas, dispatch, and every handler are untouched (manifest-parity + dispatch tests unaffected).
- `instructions` ≤ 2 KB (Claude Code truncates); every description stays non-empty.
- No on-demand resource/prompt/guide-tool (explicitly out of scope; revisit if the always-on model proves insufficient).

## Verification

`pnpm --filter model-editor-mcp test` (incl. the new `initialize`-instructions assertion) · typecheck · build · repo lint. Single PR off `staging`; no dependency on the open fix PRs.
