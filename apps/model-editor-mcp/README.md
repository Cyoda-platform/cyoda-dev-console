# model-editor-mcp

MCP server for a live, browser-rendered Cyoda model editor — workflows AND entities — driven by an AI CLI via `.mcp.json`.

Claude Code spawns it over stdio (see `.mcp.json.example`); it serves the real
`@cyoda/workflow-react` editor plus a read-only entity viewer at a deterministic
`http://127.0.0.1:<port>/` and pushes live updates over SSE. Claude drives all
content (workflows via `update_workflow`, entities via `create_entity`/
`update_entity`/`delete_entity`, both validated); the human arranges the canvas
(drags persist via `POST /layout`) and browses freely — a collapsible sidebar
picker lets you jump between any discovered workflow or entity without asking
Claude. Ask Claude for the URL any time via `connection_info`.

## Content ownership

Content is single-writer (Claude) throughout: the workflow graph pane warns on
local edits (Save doesn't persist); the workflow JSON pane and the entity
Tree/JSON panes are genuinely **read-only** Monaco/tree views — there is no
browser content-write path anywhere in this app. Layout drags are the one
thing the human owns directly, persisted to each workflow's `.layout.json`
sidecar.

## Discovery — explicit, narrow locations only

There is no whole-project scan. The server globs only `workflowGlobs`/
`entityGlobs` (defaults: `models/workflow/**/*.json`, `models/schema/**/*.json`
— override with `--workflow-globs`/`--entity-globs` at startup, or mid-session
via `configure_project`). An **entity** is a separate plain-JSON *object* file
(never embedded in a workflow); entity tools are name-based, exactly like the
workflow tools (name = file stem).

## Tools

Workflows:
- `list_workflows()` → `{ workflows: [{ name, path, states, transitions, valid }] }`
- `show_workflow(name)` — render it in the browser + return the parsed document
- `update_workflow(name, content)` — validated whole-document write + diff (writes nothing on failure)
- `optimize_layout(name, options?)` — elkjs re-layout; `options`: `{ orientation?, preset?, nodeSize?, pinned? }`
- `validate_workflow(name)` — diagnostics, read-only

Entities (separate plain-JSON object files; name = file stem):
- `list_entities()` → `{ entities: [{ name, path }] }`
- `get_entity(name)` — read raw JSON contents
- `create_entity(name, content)` — rejects if the name already exists
- `update_entity(name, content)` — overwrite an existing entity's whole document
- `delete_entity(name)`

Project configuration (session-only, never persisted to disk):
- `configure_project({ name?, workflowGlobs?, entityGlobs? })` — updates the session's discovery globs
- `get_project()` → `{ root, workflowGlobs, entityGlobs, counts: { workflows, entities } }`

Connection:
- `connection_info()` — the browser URL/port

## Browser navigation

The left sidebar lists discovered Workflows/Entities (filterable; collapsible
to full-width canvas). Clicking an item fetches it directly from the server
(`GET /api/workflow/:name` / `GET /api/entity/:name`, loopback-gated and
name-allowlisted — no new write surface) — this works independently of
Claude. A workflow opens with **Graph | JSON** tabs (JSON is the read-only
Monaco pane, a *separate* pane from the graph's own JSON tab, which stays
read-only-content-with-a-warning as before); an entity opens with **Tree |
JSON** tabs (both read-only). Claude's `show_workflow` always overrides
whatever the human is currently browsing — the visual channel stays one-way
for content, browsable in both directions for navigation.

## Register with Claude Code

Build the server, then copy the example config to the repo root:

```bash
pnpm --filter model-editor-mcp build
cp apps/model-editor-mcp/.mcp.json.example .mcp.json
```

Claude Code reads `.mcp.json` at the repo root and starts the server over
stdio the next time you run it there. Watch stderr for the line
`model-editor-mcp: http://127.0.0.1:<port>/?token=<hex>` and open that URL in
a browser to see the live editor — it updates as Claude calls tools, with no
reload needed.

## Develop
- `pnpm --filter model-editor-mcp build` — compile the server (`dist/`) and the web bundle (`web/dist/`)
- `pnpm --filter model-editor-mcp test` — unit/integration (vitest, node + happy-dom)
- `pnpm --filter model-editor-mcp test:e2e` — headless-chromium render smoke (build first)
