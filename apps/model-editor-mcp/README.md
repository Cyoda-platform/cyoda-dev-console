# model-editor-mcp

MCP server for a live, browser-rendered Cyoda model (workflow) editor, driven by an AI CLI via `.mcp.json`.

Claude Code spawns it over stdio (see `.mcp.json.example`); it serves the real
`@cyoda/workflow-react` editor at a deterministic `http://127.0.0.1:<port>/` and
pushes live updates over SSE. Claude drives content (`update_workflow`, validated)
and layout (`optimize_layout`); the human arranges the canvas (drags persist via
`POST /layout`). Ask Claude for the URL any time via `connection_info`.

## Tools
- `list_workflows()` → `{ workflows: [{ name, path, states, transitions, valid }] }`
- `show_workflow(name)` — render it in the browser + return the parsed document
- `update_workflow(name, content)` — validated whole-document write + diff (writes nothing on failure)
- `optimize_layout(name, options?)` — elkjs re-layout; `options`: `{ orientation?, preset?, nodeSize?, pinned? }`
- `validate_workflow(name)` — diagnostics, read-only
- `connection_info()` — the browser URL/port

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
- `pnpm --filter model-editor-mcp test` — unit/integration (vitest, node env)
- `pnpm --filter model-editor-mcp test:e2e` — headless-chromium render smoke (build first)

## Content vs. layout ownership

Content is single-writer (Claude) in v1: browser content edits warn and do not
persist; layout drags do. Claude owns workflow content (states, transitions,
criteria, annotations) via `update_workflow`; you own the canvas arrangement —
drag nodes yourself, or ask Claude to `optimize_layout` — and those layout
changes persist to the workflow's `.layout.json` sidecar. Register locally by
copying `.mcp.json.example` to `.mcp.json` at the repo root.
