# AGENTS.md

Guidance for AI agents (Codex, Claude Code, etc.) working in this repository.

---

## What this project is

`cyoda-dev-console` is a pnpm monorepo of **two** local, file-based developer tools
for Cyoda **workflow and entity models** — neither needs a running Cyoda
environment. Both are built on the `@cyoda/workflow-*` editor (published from the
sibling repo `../cyoda-workflow-editor`; do not rewrite or duplicate what those
packages provide).

- **Dev Console** (`apps/dev-console`) — a **Tauri 2 desktop app** for inspecting and
  correcting generated workflow JSON during the build phase, with an optional in-app
  BYO-AI assistant.
- **model-editor-mcp** (`apps/model-editor-mcp`) — a headless **MCP server** (published
  to npm as `@cyoda/model-editor-mcp`) that serves the real workflow/entity editor to a
  browser and is driven by an AI CLI via `.mcp.json`; the agent edits model files, the
  human watches the diagram update live.

> Historical note: an Ops Console plus `cyoda-api-client` / `runtime-inspection`
> packages were specced but never built; that spec now lives under `docs/archive/`.
> Ignore it — it is not the current shape of the repo.

---

## Monorepo structure

```
apps/
  dev-console/            # Tauri 2 desktop app (src/ = React frontend, src-tauri/ = Rust backend)
  model-editor-mcp/       # MCP server (server/ = Node stdio server, web/ = Vite editor UI)
packages/                 # all internal — private, unpublished
  console-design-system/  # tokens, typography, primitive components (no domain logic)
  console-shell/          # desktop app frame, sidebar, header (domain-neutral)
  entity-model-viewer/    # read-only entity JSON-tree view
  workflow-editor-host/   # integration wrapper around @cyoda/workflow-react; synthesizeImportPayload
  workflow-file-indexer/  # discovers/indexes workflow files on disk
  workflow-project-model/ # Dev Console project/root config + persistence schema
  agent-bridge-contract/  # type-only contract for the app↔editor / AI bridge
```

The desktop app compiles the internal packages in via Tauri/Vite; the MCP server
esbuild-bundles them into its published artifact. `packages/*/dist` is gitignored —
run `pnpm build` (or `pnpm --filter './packages/*' build`) before building either app
and after any pull that touches `packages/*`.

---

## Technology stack

- **Desktop shell:** Tauri 2 (Rust backend, WebView frontend)
- **Frontend:** React 19, TypeScript 6, Vite
- **State (Dev Console):** TanStack Query (server state), Zustand (local UI state)
- **MCP server:** Node ≥ 22, a hand-rolled MCP protocol over stdio (no
  `@modelcontextprotocol/sdk`); serves a Vite-built web bundle over loopback HTTP + SSE
- **Design:** Carbon-inspired, light mode; Cyoda green `#004235`, warning/production-risk
  orange `#F58220`
- **Package manager:** pnpm (Node ≥ 22, pnpm 11.18.0 pinned via `packageManager`).
  Install scripts are blocked unless the package is listed under `allowBuilds` in
  `pnpm-workspace.yaml`, and `minimumReleaseAge` there keeps releases younger than
  14 days out of the lockfile (`@cyoda/*` is exempt). Transitive version pins go in
  that file's `overrides:` — **not** `package.json`'s `pnpm.overrides`, which pnpm 11
  silently ignores.

---

## Workflow editor integration (`@cyoda/workflow-*`)

Both apps consume the editor as exact-pinned **public-npm** packages
(`@cyoda/workflow-core`, `-react`, `-viewer`, `-monaco`, `-graph`, `-layout`). To
upgrade, bump the pins in **all** consumers together — both apps **and** the internal
`workflow-editor-host` / `workflow-file-indexer` — or the MCP bundle ends up with split
versions. See `README.md` → "Workflow editor" for local co-development.

**Critical invariant:** saved workflow JSON must always be produced by
`serializeImportPayload(document)` (from `@cyoda/workflow-core`). It strips editor
metadata (layout positions, comments, edge anchors, viewport state in
`doc.meta.workflowUi`). **Never write raw document JSON to disk.** Compute dirty state
as `serializeImportPayload(current) !== savedBaseline` — never compare editor metadata.

---

## Dev Console — Tauri command contract

The Rust backend exposes only an **enumerated** set of commands (modules `project`,
`fs_io`, `watcher`, `shell_ext`, `config`, `agent`, `llm`) — no arbitrary shell, no
arbitrary outbound URLs. Current commands:

- **project / fs:** `select_project_root`, `scan_project`, `read_text_file`,
  `write_text_file_with_confirmed_overwrite`, `save_file_as`, `delete_file`,
  `write_project_text_file`
- **watch:** `watch_project`, `unwatch_project`
- **shell:** `reveal_in_finder`, `open_in_ide` (fixed IDE enum)
- **config:** `load_app_config`, `save_app_config`, `read_cyoda_profile_config`
  (reads only `$HOME/.config/cyoda/cyoda-plugin-config.json`)
- **BYO AI (behind `VITE_FEATURE_FLAG_AGENT`):** `detect_agents`, `llm_complete`

Security invariants — **do not weaken**:

- All file writes resolve **inside the selected project root** (or an explicit save-as
  target), reject `..`/absolute paths, re-validate the resolved parent against the
  canonical root after `mkdir` (symlink-escape defense), and are atomic (temp file in
  the same dir → rename). Config files: parent `0700`, file `0600`.
- `detect_agents` may spawn only a fixed allowlist of known agent CLIs with a fixed
  `--version` argument — never an arbitrary command string.
- `llm_complete` is the **only** outbound network egress. It takes a `provider` enum
  (not a URL), maps it to a fixed host allowlist (`api.anthropic.com`, `api.openai.com`,
  `generativelanguage.googleapis.com`), attaches the provider auth header, and POSTs a
  caller-built body. The webview CSP stays locked (`connect-src 'self' ipc:`) because
  egress goes through this command, not the renderer.
- API keys live in the renderer's **session storage** (origin-scoped, cleared when the
  window closes), pass through `llm_complete` per call, and are never persisted by the
  Rust layer, logged, or written into a task bundle.

---

## model-editor-mcp — how it works

- Claude Code spawns it over stdio via `.mcp.json`; it serves the real
  `@cyoda/workflow-react` editor plus a read-only entity viewer at a deterministic
  loopback `http://127.0.0.1:<port>/` and pushes live updates over SSE.
- **Content is single-writer (the agent).** The browser is read-only for content and
  human-owned only for canvas layout (drags persist to `.layout.json` sidecars). Prefer
  the atomic, fail-closed element tools (`update_transition` / `add_transition` /
  `remove_transition`, `add_state` / `remove_state` / `rename_state`) over
  whole-document `update_workflow`.
- The published package is a **self-contained esbuild bundle** (empty runtime
  dependencies); it releases independently on `mcp-v*` tags.
- Authoritative reference for the full tool surface + operational model:
  **`apps/model-editor-mcp/README.md`**. Release details: `RELEASE.md`.

---

## Key data types

```ts
type WorkflowFileStatus = "valid-workflow" | "invalid-workflow" | "json-not-workflow" | "parse-error";

type WorkflowFileIndexEntry = {
  path: string; relativePath: string; status: WorkflowFileStatus;
  workflows: Array<{ name: string; version?: string; entity?: string }>;
  lastModified: string; sizeBytes: number; error?: string;
};

type DevProject = {
  id: string; name: string; rootPath: string;
  workflowGlobs: string[]; entityGlobs: string[];
  createdAt: string; lastOpenedAt: string;
};
```

Default workflow glob `**/*.json`; always exclude `node_modules/**`, `.git/**`,
`dist/**`, `build/**`, `target/**`, `.turbo/**`, `.next/**`, `coverage/**`.

---

## Package boundary rules

| Package | Must NOT import |
|---|---|
| `console-design-system` | any domain package |
| `console-shell` | workflow / entity / agent domain packages |
| `workflow-file-indexer`, `workflow-project-model`, `workflow-editor-host`, `entity-model-viewer` | app code |

Shared packages receive domain navigation items **as props** — they do not import
domain modules.

---

## Commands

```bash
pnpm install
pnpm build      # all packages + apps (required before an app build; re-run after pulls touching packages/*)
pnpm test       # all tests
pnpm lint       # eslint
pnpm typecheck  # tsc --noEmit across the workspace

pnpm tauri:dev  /  pnpm tauri:build                          # Dev Console (desktop)
pnpm --filter @cyoda/model-editor-mcp  build | test | test:e2e   # MCP server
```

---

## Docs

- `README.md` — project overview, install (both artifacts), develop.
- `RELEASE.md` — release process for the desktop app **and** the MCP npm package.
- `apps/model-editor-mcp/README.md` — MCP tools + operational model.
- `docs/decisions/` — architecture decision records; `docs/superpowers/{specs,plans}/`
  — per-feature design records; `docs/archive/` — superseded specs, kept for history.
- `../cyoda-workflow-editor/README.md` — the workflow editor package API.
