# In-app (Tauri/WKWebView) MCP monitor — abandoned

Date: 2026-07-04
Status: Accepted
Supersedes: the design on branch `docs/mcp-service-design`
(`docs/superpowers/specs/2026-07-03-mcp-service-design.md` + its plan)

## Context

We set out to let an AI CLI (Claude Code first) drive a local Cyoda project — configure it, CRUD entity-schema / workflow / `.layout.json` files — **with the changes reflected live in a workflow-editor UI**. The distinctive requirement, from the first brainstorm, was *"MCP events then triggering updates of the UI"*: an interactive loop where the human converses with the agent and watches the workflow visualization update as the agent works.

The design we built: the **Cyoda Dev Console (a Tauri 2 app) hosts an MCP server**. Claude Code spawns the app in an `mcp-stdio` mode; on the first tool call it opens a **read-only WKWebView monitor window** and routes the 16 tools (project/entity/workflow/layout CRUD + session control) **into that webview**, where the handlers run (reusing `@cyoda/workflow-*`) and drive the UI.

This was implemented in full (16 TDD tasks), independently reviewed task-by-task and whole-branch, CI-wired, and **verified working when run un-sandboxed** (the `mcp-smoke.sh` end-to-end passed 14/14: window rendered, tools round-tripped, files written).

## Decision driver — the finding

The user runs Claude Code **inside the [`agent-safehouse`](https://github.com/eugene1g/agent-safehouse) `sandbox-exec` sandbox on macOS**. In that runtime, **the WKWebView monitor window cannot render** — and this is a *structural* limit, not a missing permission:

- **macOS sandboxes do not nest.** Once `sandbox-exec` wraps a process, a child cannot apply a *second* sandbox — the kernel returns `EPERM`.
- **WebKit's `WebContent` process self-sandboxes unconditionally and dies if it can't.** `AuxiliaryProcessMac.mm`: `if (!applySandbox(...)) { WTFLogAlways("Unable to apply sandbox"); CRASH(); }`. Under the outer Seatbelt, that nested `sandbox_apply` fails → renderer dies → blank window.
- **No knob disables it.** Unlike Chromium (`--no-sandbox`) or WebKitGTK (`WEBKIT_DISABLE_SANDBOX_THIS_IS_DANGEROUS`, Linux-only), macOS WKWebView exposes no env var / `WKPreferences` / SPI / Tauri-wry option to skip the WebContent sandbox, and none can be added.

Empirically confirmed: we granted **every** `mach-lookup`/`iokit-open` the sandbox denied (via the safehouse GUI profile `--enable=electron` + a `local-overrides.sb` fragment) until the denial stream went silent — and the window stayed **blank with no crash report**, because the failure is the kernel refusing the nested sandbox, not a denied operation.

Because the tool handlers run **inside** the webview, a non-rendering webview makes the entire MCP server non-functional in the user's actual runtime. The feature works only where the webview renders (un-sandboxed), which is not where it's used.

## Decision

**Abandon the in-app / Tauri-hosted MCP approach.** Do **not** merge `docs/mcp-service-design`; keep it as history. The goal is sound; the *shell* is wrong for the runtime.

## New direction (to be de-risked, then brainstormed — NOT yet designed)

The real goal is an **interactive Claude ↔ human dialogue with a live, Claude-driven workflow visualization**, token-efficient (Claude manipulates the workflow model; the human sees the render — the visual is one-way, never fed back to Claude). That is better served by rendering the editor in a **real browser** (the user's own, or a Chromium the sandbox already supports) served by a **headless local server** (which runs fine inside the sandbox — no GUI), with Claude driving via a command surface + a one-way live push to the browser. This is the "token-efficient Playwright analogue" the user described.

**Before designing it, prove the two runtime unknowns with a throwaway spike** (see Process lesson):
1. a headless server inside safehouse can bind a localhost port the browser reaches;
2. the workflow editor renders in a plain browser tab and can be live-pushed a "show this workflow / here's the layout" update.

Only if both hold do we brainstorm → spec → plan the real design.

## Salvage inventory (reuse from `docs/mcp-service-design`, don't rebuild)

Portable **pure logic** (TS, dependency-injected — swap the Tauri `invoke` file deps for the new server's file layer):
- Workflow validate/canonicalize via `@cyoda/workflow-core` (`parse`/`serializeImportPayload`) + `synthesizeImportPayload` from `@cyoda/workflow-editor-host` — `src/mcp/tools/workflows.ts`
- JSON diff — `src/mcp/diff.ts`
- Layout field-preserving deep-merge (`mergeLayout`) — `src/mcp/tools/layout.ts`
- Entity CRUD behaviors — `src/mcp/tools/entities.ts`
- zod input schemas — `src/mcp/schemas.ts`
- Glob matcher — `src/mcp/glob.ts`
- `WORKFLOW_STATUSES` filtering + synthesis-parity pattern (workflow-vs-entity classification)
- The **ELK auto-layout** engine (`@cyoda/workflow-layout`) — for "optimize the layout" (already used by the editor)

Discarded (the wrong shell):
- Rust `mcp-stdio` transport / bridge / window — `src-tauri/src/mcp/*`
- Monitor-mode `App.tsx` bootstrap, read-only viewer wiring, `deriveMonitorConfig`
- Activity panel / status chip / `signal_review` / `set_window_visibility`
- The `mcp-smoke.sh` e2e + the `smoke.yml` `mcp-e2e` CI job

## Process lesson

We built, TDD-tested, task-reviewed, whole-branch-reviewed, and CI-wired a **complete** feature before discovering its core premise (a webview rendering) did not hold in the target runtime. The runtime constraint was discoverable on day one with a five-minute test.

**Validate the risky *runtime* assumptions with a throwaway spike before the brainstorm/spec/build — not after.** For anything that must run in a specific host (a sandbox, CI, a particular OS), prove it renders/runs *there* first.

## References
- Full implementation + design docs: branch `docs/mcp-service-design`
- Sandbox / testing notes: memory `devconsole-testing-gaps`
- WebKit sandbox: `AuxiliaryProcessMac.mm` (`initializeSandbox`); "Sandboxing on macOS" (M. Rowe) — macOS sandboxes do not nest
