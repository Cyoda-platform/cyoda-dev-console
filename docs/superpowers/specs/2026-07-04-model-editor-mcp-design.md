# Model Editor MCP — live browser-rendered workflow editor (v1) — design

Date: 2026-07-04
Status: Design — approved for planning
Branch: `feat/live-workflow-editor`
Context: supersedes the abandoned in-app Tauri/WKWebView MCP monitor — see
`docs/decisions/2026-07-04-in-app-mcp-monitor-abandoned.md`.
Revised after an independent design review (2026-07-04) that verified all
load-bearing claims against the pinned packages; corrections are folded in below.

## Goal

Let a developer hold an interactive dialogue with Claude Code (running in the
terminal, inside the `agent-safehouse` sandbox) while a **live, browser-rendered
workflow editor** shows the workflow being worked on. Claude drives *what is
shown* and *the content edits*; the human watches, inspects, and arranges the
canvas, and directs content changes by talking. The visual channel is **one-way**
(server → browser) so the human's exploration costs no tokens.

Target loop: *"show me the Pledge workflow"* → it renders → *"add validation
before state X"* → Claude edits, the view updates → *"optimize the layout so
transitions don't cross"* → Claude re-lays-it-out via ELK, the view settles.

**v1 scope: workflows only.** Entities and project configuration are deliberate
follow-ons (see Scope); the app name is model-agnostic because of that.

## Why this shape (background)

The previous attempt hosted an MCP server *inside* the Cyoda Dev Console (a Tauri
app) and rendered a read-only monitor in a **WKWebView**. It was fully built and
worked un-sandboxed, but **WKWebView cannot render inside `sandbox-exec`** — macOS
sandboxes don't nest, and WebKit's `WebContent` self-sandboxes unconditionally and
dies under the outer Seatbelt (full analysis in the decision record). Since the
tool handlers ran *in* that webview, the whole server was unusable in the user's
runtime.

A throwaway spike (2026-07-04) de-risked the replacement before this design:

- A plain Node server, running **inside** the sandbox, binds `127.0.0.1:<port>`
  and serves over it (the sandbox permits the bind; a browser reaches it).
- The **real `@cyoda/workflow-react` editor** renders in a normal browser
  (headless Chromium), mounted with just a `session` — **no Monaco, no Tauri** —
  with reactflow zoom/pan/minimap, the bottom-left control menu, and dockable
  inspector panels present.
- Claude-driven **live swaps** work over a one-way **SSE** push (rendered Pledge,
  swapped to LegalEntity, no reload); **click-to-inspect** resolves metadata.

The spike proved render + live-swap + click-to-inspect. It did **not** prove the
layout write-back round-trip or the interaction-mode choice — those are specified
below from the code, not deferred.

## Interaction model

**The browser runs the real `@cyoda/workflow-react` editor in full `editor`
mode** — nothing stripped, and **no change to the `@cyoda/workflow-react` package**
(explicitly out of bounds for now). The complete UX is available: drag, inspect,
dock/minimize panels, the control menu, and the content-editing affordances.

Ownership and persistence in v1:

- **Layout is human-arrangeable and persists.** Dragging nodes writes node
  *positions* to `.layout.json` via a server write-back path. This is the human's
  hands-on capability.
- **Content is owned by Claude** (`update_workflow`, validated). Content is
  therefore **single-writer** in v1.
- **Content edits in the browser are not wired to save in v1** — and we **warn,
  we do not strip.** The editor stays fully interactive; when the human edits
  content locally, they are told it won't persist (a read-only-content note + the
  Save control warns "content changes go through Claude"). Wiring content
  write-back later turns this into a full collaborative editor with the *same*
  conflict machinery — a clean extension, not a rewrite.

**Why editor mode, not `viewer`.** The independent review confirmed against the
pinned package (`@cyoda/workflow-react@0.4.1`, `dist/index.js:7553`,
`2780-2790`, `321-342`) that `mode:"viewer"` disables node-drag **and** all
content dispatch together — there is no stock "content-locked but draggable" mode,
and no prop to add one without an upstream change we're not making. So v1 runs
`editor` mode (full UX, human-drag works) and treats content read-only-ness as a
**convention enforced by warning**, not by crippling the editor.

**Clashes are surfaced with machinery that already exists.** The editor ships
`ExternalChangeBanner` / `OverwriteConfirmModal` / `CompareView` (used today in
`apps/dev-console/src/routes/workflow.tsx`). When Claude changes a file the human
is viewing, the file-watch push drives the editor's external-change path →
*"changed on disk — reload / keep mine / compare."* That is the warning; no new
reconciliation UI is built.

**Content vs. layout are separate files** (`Foo.json` vs `Foo.layout.json`), but
they are **not fully decoupled**: `.layout.json` node positions are keyed by state
code (stable), but `transitionPositions`/`edgeAnchors` are keyed by **synthetic
transition UUIDs that are reassigned on every load**. The dev-console already
carries `remapLayoutUuids` (`routes/workflow.tsx:26-72`) to re-map old→new by
ordinal position when content changes. That routine **must be ported** into this
project so a human's edge/transition layout doesn't orphan when Claude edits
content. Node-position layout is robust to content edits; edge-anchor layout is
not without the remap.

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
   real editor (editor mode) and subscribes to SSE.

**Core loop:** Claude calls a tool → server validates + atomic-writes the file
and/or emits a "show" → the **file-watch** (or the show) fires a scoped **SSE
push** → the tab re-renders.

**Single source of truth = the files on disk.** The browser is driven by
file-watch, so it reflects every writer: Claude's tool writes, the human's layout
drags saved back, even the desktop dev-console if open on the same files.

**Trust boundary:** the server runs *inside* the sandbox, so its writes are
confined by safehouse exactly like Claude's own — no privilege escape (unlike a
"GUI outside the sandbox" design). Note this confines *what* the server writes; it
does not authenticate *who asked* — see the `POST /layout` hardening below.

## Components & placement

New workspace app **`apps/model-editor-mcp/`** (model-agnostic name: workflows
first, entities later). Self-contained, reusing the published `@cyoda/workflow-*`
packages and the **logic** (not the modules) salvaged from the parked branch.

Discoverability (so it is obviously *the MCP server*): the `mcp` in the folder
name; a root `README.md` whose first line states it is the MCP server for a live
browser-rendered model editor; a matching `package.json` name/description; and the
`.mcp.json` registration.

**`server/` — headless Node process:**
- `mcp.ts` — stdio JSON-RPC dispatch (`initialize`, `tools/list`, `tools/call`).
  Reuses `@cyoda/agent-bridge-contract`'s **`McpResult`** for tool results;
  defines its **own** request shape (the contract's `McpToolInput` carries a
  webview-routing `callId` with no meaning for stdio — not reused).
- `http.ts` — serves `web/dist/`; the SSE `/events` stream (with
  replay-on-connect); `POST /layout` for human layout write-back, **hardened**
  (Origin/Host must be `127.0.0.1`, the `workflow` name allowlisted against
  discovered workflows before it becomes a path, and a per-session token embedded
  in the served URL). Also a `GET`/tool for connection info (URL/port).
- `watch.ts` — watches the project's workflow files (located via the salvaged
  glob/classification, reusing `@cyoda/workflow-file-indexer` for classification;
  directory enumeration is rebuilt with `node:fs`, since the parked branch's
  `scanProject` was Tauri-bound); on change → scoped SSE push.
- `tools/` — handlers (`list` / `show` / `update` / `optimize_layout` /
  `validate`). `list`/`update`/`validate` port the *logic* from the parked branch
  (`workflows.ts`, `diff.ts`, `glob.ts`, `schemas.ts`), excising the top-level
  Tauri/Zustand/React imports and the local `envelope.ts` (use the
  `agent-bridge-contract` `McpResult`). `update`'s layout deep-merge reuses
  `mergeLayout` (`layout.ts`). **`optimize_layout` is new code** (see Tool surface).
- `files.ts` — confined file layer: writes resolve inside the project root only,
  atomic temp-then-rename (a faithful TS port of the parked `confined.rs`:
  canonicalize + prefix check).

**`web/` — browser bundle:**
- Mounts the real `@cyoda/workflow-react` editor in **`editor` mode**
  (`ThemeProvider`-wrapped; no Monaco), mirroring the dev-console route's session
  wiring: `useEditorSession` + `ExternalChangeBanner`/`OverwriteConfirmModal` for
  clash warnings, and `remapLayoutUuids` for layout-key stability across content
  changes.
- SSE client that swaps the shown workflow on push and drives the editor's
  external-change path when the shown file changes underneath the human.
- **Layout write-back** (`onWorkflowUiChange` → `POST /layout` with the session
  token) — content-save is not wired in v1 (it warns).
- Vite-built to `web/dist/`, served by `server/http.ts`.

## Tool surface (v1)

Five tools; each does something Claude's native file tools cannot (Claude still
*reads* files natively, so there is no `get`):

- **`list_workflows()`** → `[{ name, path, states, transitions, valid }]`.
  Classified discovery (workflow vs. other JSON), reusing the salvaged filter +
  `workflow-file-indexer`. Convenience over a raw glob.
- **`show_workflow(name)`** → displays it in the browser (SSE "show") *and*
  returns the parsed document to Claude. The push carries **content and the
  (UUID-remapped) layout metadata**, so the shown workflow renders with its saved
  positions. The navigation control — the file system cannot flip the view.
- **`update_workflow(name, content)`** → validates + canonicalizes the whole
  document via `workflow-core` (`parseImportPayload`/`serializeImportPayload` +
  `validateAll`); on success atomic-writes the `.json` and returns a **diff**
  (old→new) + diagnostics; on failure returns errors and **writes nothing**.
  File-watch then pushes to the browser. Whole-document write + diff-in-result (no
  PATCH).
- **`optimize_layout(name, options?)`** → **new code**: parse → `projectToGraph`
  (`@cyoda/workflow-graph`) → `layoutGraph` (`@cyoda/workflow-layout`, i.e. elkjs)
  → merge positions into `.layout.json` via `mergeLayout`; the tab re-renders.
  `options` map to the real `LayoutOptions` (`@cyoda/workflow-layout@0.1.3`):
  `{ orientation?: "vertical"|"horizontal", pinned?: PinnedNode[], preset?,
  nodeSize? }`. **There is no `direction`, no `spacing`.** Pinning requires
  explicit coordinates (`PinnedNode = {id,x,y}`); Claude pins by echoing a node's
  *current* saved position, so it still never invents coordinates. Returns the
  updated positions summary. ELK returns no crossing count and v1 does not compute
  one — the human's eyes close the layout loop (see Resolved plumbing decisions).
- **`validate_workflow(name)`** → parse + `validateAll` → diagnostics; read-only.

Properties:
- **Validation gates content writes** — malformed Cyoda JSON never lands on disk
  via `update_workflow`. (Claude could still native-Write a file; the file-watch
  would show it, possibly with parse errors — the system is forgiving, but
  `update_workflow` is the guarded path.)
- **Every write pushes** — all tool effects and the human's layout drags reach the
  tab through the same file-watch path.

Entities later follow the same shape (`show_entity`, `update_entity`, …).

## Layout capability (how "optimize the layout" works — honestly)

Layout is **not** Claude guessing coordinates. The engine is **elkjs** (the
Eclipse Layout Kernel, already used by the editor), exposed as
`layoutGraph(graph, options)`. Division of labor:

- **ELK does the geometry** — its layered algorithm minimizes crossings and lays
  out spacing/routing deterministically. "Tidy it / don't cross" is exactly ELK's
  default behavior; Claude never hand-writes x/y.
- **Claude supplies the intent ELK exposes** — realistically that is
  `orientation` (vertical/horizontal) and **pinning** specific nodes (by echoing
  their current coordinates) to anchor, say, the happy path while ELK arranges the
  rest. This is the honest extent of the semantic control the engine offers; there
  is no distinct "group these" ELK option — grouping reduces to pinning +
  orientation. Claude reasons from the workflow *structure* (terminal states,
  happy path, error branches) to choose these, not from pixels.
- **The human's eyes close the loop** — ELK lays out → human looks → "pin the
  rejection branch on the left" → Claude re-pins and re-runs.

The gimmick case — an LLM eyeballing coordinates to reduce crossings — is exactly
what this avoids: crossings are ELK's job; Claude's job is orientation + pins.

## Data flow, layout & reconciliation

**Scoped pushes:** the file-watch push carries `{ workflow, revision, origin?,
content, layoutMeta }` — the server re-reads the file and includes the fresh
content + remapped layout, because the browser cannot touch disk; the browser
re-renders only if the changed workflow is the one it is showing. `show_workflow`
is the one command that *switches* which workflow is shown.

**Replay-on-connect:** the server holds "current shown workflow"; a (re)connecting
tab immediately receives it (content + layout). Refresh is seamless.

**Layout — the one two-writer file:**
- Human drags a node → browser debounces → `POST /layout` (session token) → the
  **server** (inside the sandbox, confined) writes `.layout.json`. The browser
  never touches disk.
- Claude runs `optimize_layout` → ELK → writes `.layout.json`.
- **Rule: last-writer-wins; the browser always reflects the file.** A manual
  arrangement persists until overwritten (another drag, or asking Claude to
  re-optimize). Layout is just positions, so there is no merge.

**Echo suppression (specified, not "mirrored"):** each tab generates its own
**origin id** (a per-tab UUID, distinct from the shared per-server session token,
which stays the auth secret). A `POST /layout` carries that origin; the server tags
the resulting file-watch push with it; the **originating tab ignores** a push
bearing its own origin (so an in-flight drag is not disrupted), while **other
tabs** (a second tab, the desktop app) apply it. This is per-tab origin scoping,
not the parked branch's mtime dedup.

**Mid-drag pushes:** if a push for the shown workflow arrives while the human is
actively dragging, the browser **defers applying it until the drag ends** (then
reconciles to the file), so nodes never snap under the cursor.

**Content is single-writer (Claude) in v1**, so there is no content merge; the
human viewing while Claude edits is handled by the editor's `ExternalChangeBanner`.

**Two servers, one project is unsupported** — the origin-scoped suppression cannot
dedupe another server's writes. The server takes a per-project lock (or a port
deterministically derived from the project path, below) and refuses (with a clear
message) a second instance for the same project.

## Startup / DevX

- One-time: a `.mcp.json` entry registers the server (`command: node`,
  `args: [<built server>, "--project", "."]`).
- On session start, Claude Code spawns it; the server binds a **port
  deterministically derived from the project path** (stable across sessions → a
  bookmarkable URL; collisions fall back to the next free port).
- **The URL reaches the human via a `connection_info` MCP tool** (and is echoed in
  every tool result's metadata) — **not** printed to stdout, which is the MCP
  JSON-RPC channel. So Claude can always tell the human the URL on request.
- **The browser is optional.** Claude's tools work headlessly whether or not a tab
  is open — a robustness win over the abandoned design, which *blocked* on the
  webview and timed out `UI_NOT_READY`. Open the tab whenever; replay-on-connect
  shows current state.

## Error handling

- **Invalid content** → `update_workflow` returns diagnostics and writes nothing.
- **Malformed file on disk** → the editor's `ParseErrorView` shows the error in
  the tab — never a blank.
- **Confinement** → `files.ts` rejects any path resolving outside the project root;
  the sandbox is a second layer.
- **`POST /layout` hardening** → reject non-`127.0.0.1` Origin/Host; require the
  per-session token; allowlist the `workflow` name against discovered workflows
  before it is used as a path (localhost is not a trust boundary — this closes the
  DNS-rebinding/CSRF surface).
- **Port in use** → the server picks the next free port and re-surfaces it via
  `connection_info`.
- **SSE drop** → the browser auto-retries and replays on reconnect.
- **Human content edit that won't persist** → the read-only-content note + a
  warning on Save; the `ExternalChangeBanner` covers the Claude-changed-it case.

## Testing

Applying the lesson from the abandoned attempt — *test the real runtime* — and the
review's point that the render smoke alone doesn't guard the risky new paths:

- **Unit** — port the salvaged pure logic tests (`diff`, `glob`, `schemas`,
  `dispatch`, `mergeLayout`, and the `update`/`validate` handlers); already green
  on the parked branch.
- **`remapLayoutUuids`** — port its behavior with a unit test (content-edit →
  layout keys re-map by ordinal position; edge anchors don't orphan).
- **Server integration (headless Node)** — drive the server over stdio:
  - `update_workflow` valid/invalid → file written / not written + scoped SSE push;
  - `optimize_layout` → positions changed in `.layout.json`;
  - `POST /layout` → file written + scoped push to a **second** SSE client + **no
    bounce** to the originating tab; Origin/token rejection paths.
- **Browser-render smoke** (the spike, scripted, as a standalone `@playwright/test`):
  1. `vite build` `web/`; copy 1–2 sample workflows into a temp fixture project.
  2. Spawn the server against the fixture; launch **headless Chromium**; `page.goto`.
     Drive `show_workflow('A')` **over the real MCP stdio** (JSON-RPC to stdin).
  3. Assert `.react-flow__node` renders, node count == state count, edges present,
     no console errors; then `show_workflow('B')` → node set changed.
  4. Teardown.
  Headless Chromium is a real engine (unlike happy-dom, which has no layout and
  cannot render reactflow — the exact prior blind spot), is what CI runs, and is
  what safehouse's `playwright-chrome` supports.
- **New infra:** the repo has no browser testing today; this adds it — one dev
  dependency (`@playwright/test` + its Chromium).
- **CI placement:** because Tauri is gone, the whole suite is cheap (vite build +
  node server + headless render, no native toolchain) — light enough to run in
  `ci.yml` **on every PR**.

## Scope

**SCOPE EXPANDED (2026-07-05):** the "workflows-only" framing below was a reaction
to the WKWebView wall (now gone). The original intent — the *full* editor — is
restored. Entities, a read-only JSON view, self-service navigation, and explicit
Claude-set locations (`configure_project`) are now **in scope**. See
**"Full-editor scope expansion"** at the end of this document for the detailed
design; the tool/component/data-flow sections above describe the workflow core
that expansion builds on.

**In scope (single release):** workflows (`list`/`show`/`update`/`optimize_layout`/
`validate`) **and** entities (`list`/`get`/`create`/`update`/`delete_entity`) **and**
project config (`configure_project`/`get_project`, explicit narrow locations); the
full-`editor`-mode browser editor with human-owned layout write-back, a **read-only
Monaco JSON view**, a **read-only entity JSON-tree view**, and **self-service
navigation** (a workflow/entity picker); content owned by Claude throughout
(browser content-edits warned/read-only, never saved); hardened `POST /layout` +
loopback-gated read endpoints; `connection_info`; deterministic port.

**Still out of scope** (deliberate):
- **Content write-back from the browser** (collaborative content editing) — content
  stays Claude-owned; the graph warns, the JSON is read-only.
- An upstream `@cyoda/workflow-react` change (e.g. a per-pane `contentReadOnly`
  prop) — we use a *separate* read-only Monaco pane instead of the editor's JSON
  tab, so no upstream change is needed.
- A graphical **entity-schema diagram** — entities render as a searchable JSON tree
  (that is what `entity-model-viewer` is); a bespoke schema visualizer is a
  separate, much larger effort.
- Auth / multi-user / remote access (localhost, single user, one project/server).

## Reuse / salvage inventory (logic, not modules)

From the parked branch `docs/mcp-service-design` (see the decision record):
portable **logic** — `update`/`validate`/`list` behaviors, JSON `diff`, layout
`mergeLayout`, zod `schemas`, `glob` — but each parked module imports Tauri
(`ipc/mcpIo`), React/Zustand stores, and a local `envelope.ts`; the imports are
excised and IO is swapped to `files.ts`. `confined.rs` → `files.ts` (path safety).
From the dev-console route: **`remapLayoutUuids`** (new dependency, ported).
Genuinely **new**: the stdio + http/sse + watch plumbing, the web shell,
`optimize_layout` (ELK stitch: `projectToGraph` → `layoutGraph` → `mergeLayout`),
directory enumeration (`node:fs`, replacing Tauri `scanProject`), and the
`connection_info`/port + `POST /layout` hardening. Published deps do the heavy
lifting: `@cyoda/workflow-core`, `@cyoda/workflow-graph`, `@cyoda/workflow-layout`
(elkjs), `@cyoda/workflow-react`, `@cyoda/workflow-file-indexer`,
`@cyoda/agent-bridge-contract` (`McpResult`).

## Resolved plumbing decisions (locked)

No items are left for the implementer to invent. The three that a first pass might
hand-wave are decided here:

- **`POST /layout` auth token.** At startup the server generates a random token
  (`crypto.randomBytes(16).toString("hex")`), embeds it in the served page (so
  same-origin JS has it) and in the URL that `connection_info` surfaces. The
  browser sends it as an `X-Session-Token` header on `POST /layout`; the server
  rejects mismatches. Combined with the loopback Origin/Host check, a cross-origin
  page can neither read the token (same-origin policy) nor guess it. No cookies.
- **Deterministic port + duplicate detection.**
  `port = 49152 + (fnv1a(absoluteProjectPath) mod 16384)` — the dynamic/private
  range, so the URL is stable and bookmarkable per project. On bind: if free, use
  it. If in use, `GET /_id` on it — if it reports the *same* project root, this is
  a duplicate instance, so the server exits with a clear message and the existing
  URL (the running server + `/_id` *is* the lock; no lockfile). If a *different*
  project (hash collision), bind the next free port and surface it via
  `connection_info`.
- **Crossing-count metric — deferred, not open.** `optimize_layout` returns the
  updated positions only; ELK returns no crossing count and v1 does not compute
  one. The human's eyes close the layout loop. A computed crossing count for
  autonomous iteration is a documented follow-on, not v1.

---

# Full-editor scope expansion (2026-07-05)

Restores the original intent (AI CRUDs workflows AND entities AND project config,
with a full live UI you can navigate) on the now-proven browser-served runtime.
Grounded in a code survey of the real packages + the parked branch's already-built
entity/project tools.

## Explicit narrow locations — no auto-discovery
The human's requirement: no whole-tree scan + classifier guessing (it produces
false positives). Instead, **Claude Code sets the locations explicitly and
narrowly**, and discovery reads *only* those globs.

- The `ToolContext` gains **`entityGlobs`**, and its `workflowGlobs`/`entityGlobs`
  become **runtime-mutable** (a small holder, not the current frozen literal) so
  `configure_project` can update them mid-session; `discover*` and the watcher read
  the *current* globs.
- CLI: `--workflow-globs` / `--entity-globs` set the initial values; sensible
  narrow defaults follow the observed convention (`models/workflow/**/*.json`,
  `models/schema/**/*.json`) rather than `**/*.json`.
- **Discovery is narrow-glob, not scan-and-classify.** `discoverWorkflows` globs
  `workflowGlobs`; a new **`discoverEntities(root, entityGlobs)`** globs
  `entityGlobs` and takes each matched file that parses to a JSON *object* as an
  entity (skip parse-errors; no `**/*.json` full-tree walk). Because the globs
  point at the real workflow/entity dirs, there are no false positives.

## Entities (Claude CRUD; human read-only view)
Grounded fact: an **entity is a separate plain-JSON object file** (e.g.
`models/schema/v1/CollateralAsset.json`), NOT embedded in a workflow. (The
classifier's `export-payload` = `entityName+modelVersion+workflows` is a *workflow
export bundle*, a workflow file — not an entity.) Entities relate to workflows only
by name/convention + `annotations.entity`.

- **Tools** (ported from `docs/mcp-service-design:.../tools/entities.ts`, IO swapped
  to the confined layer): `list_entities()`, `get_entity(name)`,
  `create_entity(name, content)`, `update_entity(name, content)`,
  `delete_entity(name)`. **Name-based** (name = file stem, resolved against
  `entityGlobs`), consistent with the workflow tools. `create`/`update` JSON-parse-
  guard (`INVALID_JSON`), `create` rejects existing (`ALREADY_EXISTS`), `update`/
  `delete` require existing (`NOT_FOUND`), whole-document writes.
- Requires a confined **`rmConfined`** added to `files.ts` (guard via the existing
  `resolveInsideRoot`) exposed as `ctx.deleteFile`.
- **View (read-only):** the `EntityViewer` component (a searchable/collapsible JSON
  tree — ported from the dev-console's local copy `src/components/{EntityViewer,
  JsonTree}.tsx`; peers react/react-dom + `@cyoda/console-design-system` tokens, no
  CSS) plus a read-only Monaco JSON tab. Claude owns entity content; the human
  browses/inspects. `EntityViewer` takes `contents: string` (raw JSON).

## Project config
Ported from `docs/mcp-service-design:.../tools/project.ts` (session-only, never
persisted — already matches the headless model):
- `configure_project({ name?, workflowGlobs?, entityGlobs? })` → updates the mutable
  context globs; `get_project()` → `{ root, workflowGlobs, entityGlobs, counts:
  { workflows, entities } }`.

## Read-only Monaco JSON view (workflows)
Grounded constraint: the editor's built-in JSON tab is read-only **only** in
`mode:"viewer"`, which *also* freezes the graph (kills layout drag) — there is no
per-pane toggle, and `editorOptions.readOnly` is overridden. So the JSON view is a
**separate read-only Monaco pane**, NOT the editor's `jsonEditor` tab:
- Port the dev-console's `MonacoJsonViewer` (a plain `monaco.editor.create(...)`)
  with **`readOnly: true`**, and `getMonacoRuntime()` (the two `?worker` imports:
  `monaco-editor/esm/vs/editor/editor.worker?worker` and
  `.../language/json/json.worker?worker`, wired via `window.MonacoEnvironment`).
- The graph stays full `editor` mode (drag + inspect + warn-on-content-edit); the
  JSON is genuinely un-editable. Content is view-only on both surfaces.

## Self-service navigation
The browser navigates independently of Claude:
- New loopback-gated read endpoints: `GET /api/index` → the current workflow +
  entity lists (from the narrow discovery); `GET /api/workflow/:name` /
  `GET /api/entity/:name` → the item's content (server read+parse; name allowlisted
  against discovery before any path use — same guard as `POST /layout`). No new
  *write* surface (content stays Claude-only).
- The browser tracks a **current view** (set by the human's picker OR Claude's
  `show_workflow` SSE push — last one wins). Live `content`/`layout` pushes apply
  only to the current view; pushes for other items are ignored until viewed.

## Browser layout / ergonomics
- **Collapsible left sidebar** = the picker (Workflows / Entities groups,
  filterable; toggle to hide → full-width canvas).
- **Contextual tabbed main:** a workflow → **Graph | JSON** (JSON = the read-only
  Monaco pane); an entity → **Tree | JSON** (both read-only). One pane at a time —
  no stacked clutter.
- Reuse the editor's **built-in dockable/minimizable inspector + control menu +
  minimap** (no second inspector added).
- Read-only status is a **quiet chip**, not a banner; `ExternalChangeBanner` only on
  an actual clash.

## Security delta
The `GET /api/*` read endpoints serve project file contents, so they carry the
**same loopback Origin/Host gate** as `/events`/`/_id` (DNS-rebinding protection),
and the `:name` is allowlisted against discovery before it is used as a path. There
is **no new write endpoint** — `POST /layout` is unchanged and remains the only
state-changing browser surface.

## Salvage delta
Ports from `docs/mcp-service-design`: `tools/entities.ts` (entity CRUD),
`tools/project.ts` (`configure_project`/`get_project`), their zod schemas
(`getProjectInput`/`configureProjectInput`/`{list,get,create,update,delete}
EntityInput`, all `.strict()`). Ports from the dev-console: `EntityViewer` +
`JsonTree`, `MonacoJsonViewer`, `monacoRuntime.ts` worker setup. New: `rmConfined`
(+ `ctx.deleteFile`), `discoverEntities`, mutable-globs `ToolContext`, the
`GET /api/*` read endpoints, and the web-shell sidebar/tabs/entity-view/JSON-view
layout. `entity-model-viewer` peers only react/react-dom + design-system tokens.

## Testing delta
Extend the vitest suites for the entity tools + `configure_project` + `discoverEntities`
+ `rmConfined` + the read endpoints (loopback-gate + name-allowlist rejections);
extend the Playwright smoke to also drive an **entity** into the read-only JSON-tree
view and exercise the **self-service picker** switching between a workflow and an
entity (real render, headless Chromium).
