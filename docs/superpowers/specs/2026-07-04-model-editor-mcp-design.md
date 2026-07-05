# Model Editor MCP — live browser-rendered workflow editor (v1) — design

Date: 2026-07-04
Status: Design — approved for planning
Branch: `feat/live-workflow-editor`
Context: supersedes the abandoned in-app Tauri/WKWebView MCP monitor — see
`docs/decisions/2026-07-04-in-app-mcp-monitor-abandoned.md`.

## Goal

Let a developer hold an interactive dialogue with Claude Code (running in the
terminal, inside the `agent-safehouse` sandbox) while a **live, browser-rendered
workflow editor** shows the workflow being worked on. Claude drives *what is
shown* and *the content and layout edits*; the human watches, inspects, and
arranges the canvas, and directs changes by talking. The visual channel is
**one-way** (server → browser) so the human's exploration costs no tokens.

Concretely, the target loop is: *"show me the Pledge workflow"* → it renders →
*"add validation before state X"* → Claude edits, the view updates → *"optimize
the layout so transitions don't cross"* → Claude re-lays-it-out via ELK, the
view settles.

**v1 scope: workflows only.** Entities and project configuration are deliberate
follow-ons (see Scope). The app name is model-agnostic because of that.

## Why this shape (background)

The previous attempt hosted an MCP server *inside* the Cyoda Dev Console (a Tauri
app) and rendered a read-only monitor in a **WKWebView**. It was fully built and
worked un-sandboxed, but **WKWebView cannot render inside `sandbox-exec`** — macOS
sandboxes don't nest, and WebKit's `WebContent` self-sandboxes unconditionally and
dies under the outer Seatbelt (full analysis in the decision record). Since the
tool handlers ran *in* that webview, the whole server was unusable in the user's
actual runtime.

A throwaway spike (2026-07-04) de-risked the replacement before this design:

- A plain Node server, running **inside** the sandbox, binds `127.0.0.1:<port>`
  and serves over it (the sandbox permits the bind; a browser reaches it).
- The **real `@cyoda/workflow-react` editor** renders in a normal browser
  (headless Chromium), mounted with just a `session` + stubbed `io` — **no Monaco,
  no Tauri** — with reactflow zoom/pan/minimap, the bottom-left control menu, and
  dockable inspector panels all present.
- Claude-driven **live swaps** work over a one-way **SSE** push (rendered Pledge,
  then swapped to LegalEntity, no reload), and **click-to-inspect** resolves
  metadata via `lookupById`.

So both the runtime (sandboxed server + browser render + live push) and the
product surface (the real editor) are proven. This design productionizes the
spike.

## Interaction model

- **Content is read-only in the browser.** Claude owns workflow *logic* (states,
  transitions, processors, criteria). The human changes logic by *telling Claude*,
  never by editing in the browser — which removes any content merge-conflict story.
- **The full interactive canvas is retained.** Zoom, pan, click-to-inspect,
  dock/minimize the inspector panels, the control menu — all available. These are
  pure client-side interactions; they touch nothing and cost no tokens.
- **The human owns arranging.** Dragging nodes to tidy the graph is allowed and
  **persisted**, because it writes only node *positions* to the `.layout.json` —
  a different file from the workflow content.
- **Content and layout are separate files** (`Foo.json` vs `Foo.layout.json`).
  That separation is what makes "read-only content + human-owned arranging" work
  without collision: Claude editing logic and the human arranging positions never
  touch the same file.

## Architecture & topology

Two long-lived processes plus the browser:

1. **Claude Code** (terminal, inside safehouse) — spawns the server on session
   start via `.mcp.json`; talks to it over **stdio JSON-RPC (MCP)**.
2. **The model-editor-mcp server** (headless Node, spawned *by* Claude Code, so
   also inside safehouse) — one process, two faces:
   - **North (to Claude):** MCP stdio server exposing the tools.
   - **South (to the human):** HTTP + SSE server on `127.0.0.1:<port>` serving the
     editor bundle and pushing live updates.
   - Also **watches** the project's workflow files.
3. **The browser tab** — the human opens `http://127.0.0.1:<port>/`; it loads the
   real editor (read-only content) and subscribes to SSE.

**Core loop:** Claude calls a tool → server validates + atomic-writes the file
and/or emits a "show" → the **file-watch** (or the show) fires an **SSE push** →
the tab re-renders.

**Single source of truth = the files on disk.** Because the browser is driven by
file-watch, it reflects *every* writer: Claude's tool writes, the human's layout
drags saved back, even the desktop dev-console if open on the same files.

**Trust boundary:** the server runs *inside* the sandbox, so its writes are
confined by safehouse exactly like Claude's own — no privilege escape (unlike a
"GUI outside the sandbox" design).

## Components & placement

New workspace app **`apps/model-editor-mcp/`** (model-agnostic name: workflows
first, entities later). Self-contained, reusing the published `@cyoda/workflow-*`
packages and the salvaged tool logic.

Discoverability (so it is obviously *the MCP server*): the `mcp` in the folder
name; a root `README.md` whose first line states it is the MCP server for a live
browser-rendered model editor; a matching `package.json` name/description; and the
`.mcp.json` registration itself.

**`server/` — headless Node process:**
- `mcp.ts` — stdio JSON-RPC dispatch (`initialize`, `tools/list`, `tools/call`),
  reusing `@cyoda/agent-bridge-contract` `McpResult` / `McpToolInput` types.
- `http.ts` — serves `web/dist/` + the SSE `/events` stream, with
  replay-on-connect; accepts `POST /layout` for human layout write-back.
- `watch.ts` — watches the project's workflow files (located via the salvaged
  glob/classification, reusing `@cyoda/workflow-file-indexer`; e.g.
  `models/workflow/v1/*.json` + `*.layout.json`, but the path is discovered, not
  hardcoded); on change → scoped SSE push.
- `tools/` — handlers (`list` / `show` / `update` / `optimize_layout` /
  `validate`), **ported from the parked branch** (`workflows.ts`, `layout.ts`,
  `diff.ts`, `glob.ts`, `schemas.ts`) with file-IO swapped from Tauri `invoke` to
  `files.ts`.
- `files.ts` — confined file layer: writes resolve inside the project root only,
  atomic temp-then-rename (the parked branch's `confined.rs` semantics, in TS).

**`web/` — browser bundle:**
- Mounts the real `@cyoda/workflow-react` editor in **read-only-content mode**
  (`ThemeProvider`-wrapped; no Monaco).
- SSE client that swaps the shown workflow on push.
- Narrow **layout write-back** (`onWorkflowUiChange` → `POST /layout`); content
  stays read-only.
- Vite-built to `web/dist/`, served by `server/http.ts`.

**Reuse, not rebuild:** parse/validate/canonicalize = `@cyoda/workflow-core`;
layout = `@cyoda/workflow-layout` (ELK); editor = `@cyoda/workflow-react`; tool
behaviors + schemas + diff = ported from `docs/mcp-service-design`. The only
genuinely new code is the server plumbing (stdio + http/sse + watch) and the thin
browser shell.

**Pinned at implementation:** the exact read-only mechanism — the editor's stock
`viewer` mode vs. a content-locked `editor` mode that keeps node-drag — depends on
whether `viewer` permits dragging. Resolvable regardless, because layout is a
separate file (worst case, enable layout writes independently of content).

## Tool surface (v1)

Five tools; each does something Claude's native file tools cannot (Claude still
*reads* files natively, so there is no `get`):

- **`list_workflows()`** → `[{ name, path, states, transitions, valid }]`.
  Classified discovery (workflow files vs. other JSON), reusing the salvaged
  filter. Convenience over a raw glob.
- **`show_workflow(name)`** → displays it in the browser (SSE "show") *and*
  returns the parsed document to Claude. The **navigation control** — the file
  system cannot flip the view.
- **`update_workflow(name, content)`** → validates + canonicalizes the whole
  document via `workflow-core`; on success atomic-writes the `.json` and returns a
  **diff** (old→new) + diagnostics; on failure returns errors and **writes
  nothing**. File-watch then pushes to the browser. Whole-document write +
  diff-in-result (no PATCH).
- **`optimize_layout(name, options?)`** → runs **ELK** (`layoutGraph`) with
  `options` (`direction`, `pinnedStates`, `spacing`), merges positions into
  `.layout.json`; the tab re-renders. Returns a layout summary + crossing count so
  Claude can iterate against a number.
- **`validate_workflow(name)`** → parse + `validateAll` → diagnostics; read-only.

Properties:
- **Validation gates content writes** — malformed Cyoda JSON never lands on disk
  via `update_workflow`. (Claude could still native-Write a file; the file-watch
  would show it, possibly with parse errors — the system is forgiving, but
  `update_workflow` is the guarded path.)
- **Every write pushes** — all tool effects and the human's layout drags reach the
  tab through the same file-watch path.

Entities later follow the same shape (`show_entity`, `update_entity`,
`validate_entity`).

## Layout capability (how "optimize the layout" actually works)

Layout is **not** Claude guessing coordinates. The engine is **elkjs** (the
Eclipse Layout Kernel, already used by the editor), exposed as
`layoutGraph(graph, options)`. Division of labor:

- **ELK does the geometry** — crossing minimization, layering, spacing, edge
  routing. Deterministic. Claude never hand-writes x/y.
- **Claude does the intent ELK can't infer** — from the workflow's *structure*
  (which states are terminal, the happy path, error branches): flow direction,
  **pinning** (`PinnedNode` — "keep the happy path straight, pin these, arrange the
  rest"), grouping, spacing. This reasoning is from structure, not pixels.
- **The human's eyes close the loop** — ELK lays out → human looks → "push the
  rejection branch left" → Claude adjusts a pin/direction and re-runs ELK.

"Minimize crossings / tidy it" is reliable (it is ELK). "Arrange it to read like
X" is genuine Claude value (semantic constraints → ELK). The gimmick case —
eyeballing coordinates — is exactly what the design avoids.

## Data flow, layout & reconciliation

**Scoped pushes:** the file-watch push carries `{ workflow, revision }`; the
browser re-renders only if the changed workflow is the one it is showing.
`show_workflow` is the one command that *switches* which workflow is shown.

**Replay-on-connect:** the server holds "current shown workflow"; a (re)connecting
tab immediately receives it. Refresh is seamless; opening the tab after Claude has
been working shows current state.

**Layout — the one two-writer file:**
- Human drags a node → browser debounces → `POST /layout` → the **server** (inside
  the sandbox, confined) writes `.layout.json`. The browser never touches disk.
- Claude runs `optimize_layout` → ELK → writes `.layout.json`.
- **Rule: last-writer-wins; the browser always reflects the file.** A manual
  arrangement persists until overwritten (another drag, or the human asking Claude
  to re-optimize). Layout is just positions, so there is no merge.

**Echo suppression:** when a drag round-trips (browser → server → file → watch →
push), the server tags that write with the tab's origin id so the push does not
bounce back and disrupt the in-progress drag; other viewers still receive it. This
mirrors the parked branch's `save_origin` idea.

## Startup / DevX

- One-time: a `.mcp.json` entry registers the server (`command: node`,
  `args: [<built server>, "--project", "."]`).
- On session start, Claude Code spawns it; the server binds a stable localhost
  port and surfaces the URL (Claude reports it; it is also logged). The human opens
  the tab once.
- **The browser is optional.** Claude's tools work headlessly whether or not a tab
  is open — a robustness win over the abandoned design, which *blocked* on the
  webview and timed out `UI_NOT_READY`. Open the tab whenever; replay-on-connect
  shows current state.

## Error handling

- **Invalid content** → `update_workflow` returns diagnostics and writes nothing;
  Claude fixes and retries.
- **Malformed file on disk** (e.g., a native-Write of bad JSON) → the editor's
  `ParseErrorView` shows the error in the tab — never a blank.
- **Confinement** → `files.ts` rejects any path resolving outside the project root;
  the sandbox is a second layer.
- **Port in use** → the server picks the next free port and re-surfaces the URL.
- **SSE drop** → the browser auto-retries and replays on reconnect.

## Testing

Applying the lesson from the abandoned attempt — *test the real runtime*:

- **Unit** — port the salvaged tests (`diff`, `glob`, `schemas`, `dispatch`,
  workflow/layout handlers); pure logic, already green on the parked branch.
- **Server integration** — spin the server, drive it over stdio, assert file writes
  + SSE pushes (headless Node).
- **Browser-render smoke** (the spike, scripted, as a standalone `@playwright/test`):
  1. *Arrange* — `vite build` the `web/` bundle; copy 1–2 sample workflows into a
     temp fixture project (hermetic; no dependency on a real project).
  2. *Act* — spawn the server against the fixture (`--project <tmp>`); it binds a
     port. Launch **headless Chromium**, `page.goto(url)`. Drive `show_workflow('A')`
     **over the real MCP stdio** (JSON-RPC to stdin) — exercising MCP → server →
     file/SSE → browser, not a shortcut.
  3. *Assert* — `waitForSelector('.react-flow__node')`; node count == state count;
     edges present; no uncaught console errors. Then `show_workflow('B')` → assert
     the node set changed (live-swap). Optionally click a node → inspector
     populates.
  4. *Teardown* — kill server, close browser.

  Headless Chromium is a real browser engine (unlike happy-dom, which has no layout
  and cannot render reactflow — the exact prior blind spot), is what CI runs, and
  is what safehouse's `playwright-chrome` supports.

- **New infra:** the repo has no browser testing today (deferred previously); this
  smoke adds it — one dev dependency (`@playwright/test` + its Chromium).
- **CI placement:** because Tauri is gone, the smoke is cheap (vite build + node
  server + headless render, no native toolchain) — light enough to run in `ci.yml`
  **on every PR**, guarding the render continuously rather than only on staging.

## Scope

**v1 (this spec):** workflows only — `list` / `show` / `update` / `optimize_layout`
/ `validate`, the read-only-content browser editor with full canvas interactions,
human-owned layout arranging, and the browser-render smoke.

**Out of scope for v1** (deliberate):
- Entity + project-configuration tools (follow-on; same tool shape and same server).
- Collaborative *content* editing in the browser (content stays read-only; only
  layout writes back).
- Auth / multi-user / remote access (localhost, single user).
- The Monaco JSON editor tab in the browser (not needed to view; addable later).
- Multiple projects per server instance (one project per server).

## Reuse / salvage inventory

From the parked branch `docs/mcp-service-design` (see the decision record):
portable pure logic — workflow validate/canonicalize (`@cyoda/workflow-core`), JSON
diff (`diff.ts`), layout deep-merge (`mergeLayout` in `layout.ts`), entity/workflow
tool behaviors, zod schemas (`schemas.ts`), glob matcher (`glob.ts`); plus ELK
auto-layout (`@cyoda/workflow-layout`) and the editor (`@cyoda/workflow-react`).
Discarded: the whole Rust/Tauri/WKWebView shell.

## Open details (resolved at implementation, not blocking)

- Read-only mechanism: `viewer` mode vs. content-locked `editor` mode (depends on
  whether `viewer` permits node-drag).
- Port strategy + exactly how the URL is surfaced to the human (tool result vs.
  log vs. a `connection_info` tool).
- Server distribution/build for the `.mcp.json` `command` (built entry vs. a small
  launcher).
