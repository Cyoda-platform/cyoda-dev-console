# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

---

## What this project is

`cyoda-dev-console` is a monorepo for two sibling Tauri 2 desktop applications:

- **Dev Console** — local, file-based workflow editing. Wraps `cyoda-workflow-editor` so a developer can inspect and correct generated workflow JSON during the build phase.
- **Ops Console** — read-only runtime inspection. Connects to a running Cyoda environment to view deployed workflows, entities, and operational state.

The two apps share a design system and shell but keep all domain logic separate. This is **not** a generic SaaS dashboard — it is a developer tool.

The primary workflow surface is the `cyoda-workflow-editor` monorepo at `../cyoda-workflow-editor`. Do not rewrite or duplicate what that package provides.

---

## Planned monorepo structure

```
cyoda-dev-console/
  apps/
    dev-console/        # Tauri 2 app — local file-based workflow editing
      src/
      src-tauri/
    ops-console/        # Tauri 2 app — runtime inspection
      src/
      src-tauri/
  packages/
    console-shell/          # App frame, sidebar, header — domain-neutral
    console-design-system/  # Tokens, typography, primitives — no domain logic
    workflow-file-indexer/  # Native TS types for workflow discovery (Dev only)
    workflow-project-model/ # Project root config, recent projects, persistence schema
    workflow-editor-host/   # Integration wrapper around cyoda-workflow-editor
    entity-model-viewer/    # Lightweight JSON viewer for entity/model files
    cyoda-api-client/       # Shared HTTP client for Ops Console backend
    runtime-inspection/     # Ops Console runtime panels
    agent-bridge-contract/  # Shared types for BYO AI integration points
```

---

## Technology stack

- **Desktop shell:** Tauri 2 (Rust backend, WebView frontend)
- **Frontend:** React 18, TypeScript 5, Vite
- **State:** TanStack Query (server state), Zustand (local UI state)
- **Fonts:** IBM Plex Sans, IBM Plex Mono
- **Design language:** Carbon-inspired, light mode only
- **Primary colour:** Cyoda green `#004235`; warnings/production-risk: Cyoda orange `#F58220`
- **Package manager:** pnpm (Node ≥ 22, pnpm ≥ 9)

---

## Workflow editor integration

The Dev Console integrates `cyoda-workflow-editor` exclusively through these packages:

```
@cyoda/workflow-core    — parseImportPayload, serializeImportPayload, patches
@cyoda/workflow-react   — WorkflowEditor component
@cyoda/workflow-monaco  — Monaco JSON editor bridge
@cyoda/workflow-layout  — ELK layout engine
```

**Critical invariant:** Saved workflow JSON must always be produced by `serializeImportPayload(document)`. This call strips all editor metadata (layout positions, comments, edge anchors, viewport state stored in `doc.meta.workflowUi`). Never write raw document JSON to disk.

**Dirty state:** compute as `serializeImportPayload(currentDocument) !== savedBaseline`. Do not compare editor metadata.

**WorkflowEditor required props for Dev Console:**
```tsx
<WorkflowEditor
  document={parsedDoc}
  mode="editor"
  developerMode={true}
  enableJsonEditor        // if Monaco is available
  localStorageKey={`${projectId}:${filePath}`}
  onChange={trackDirty}
  onSave={triggerSaveFlow}
/>
```

---

## Tauri native command contract (Dev Console)

The Rust layer must expose only these enumerated commands — no arbitrary shell execution:

```ts
select_project_root(): Promise<string>
scan_project(rootPath: string, options: ScanOptions): Promise<ProjectScanResult>
read_text_file(path: string): Promise<{ path, contents, lastModified, sizeBytes }>
write_text_file_with_confirmed_overwrite(path: string, contents: string): Promise<{ path, lastModified, sizeBytes }>
watch_project(rootPath: string): Promise<void>
unwatch_project(rootPath: string): Promise<void>
reveal_in_finder(path: string): Promise<void>
open_in_ide(path: string, ide: "zed" | "intellij" | "vscode"): Promise<void>

// BYO AI surface (Phase 4+). Behind VITE_FEATURE_FLAG_AGENT (single flag).
read_cyoda_profile_config(): Promise<ProfileSet | null>           // reads ONLY $HOME/.config/cyoda/cyoda-plugin-config.json
detect_agents(): Promise<Array<{ id, installed, version? }>>      // `which` + `<bin> --version`, enumerated bins only
write_project_text_file(activeRoot, relativePath, contents): Promise<{ path, lastModified, sizeBytes }>
llm_complete(provider, model, apiKey, body): Promise<{ status, body }>  // proxies to an allowlisted LLM host
```

All file writes must be validated to be inside the selected project root (or an explicit save-as destination). File writes are atomic (temp file in same directory, then rename). Config file permissions: parent `0700`, file `0600`.

**Process spawn / network boundaries (BYO AI):** the enumerated set is still closed — no arbitrary shell or arbitrary URLs.
- `detect_agents` and IDE/agent detection may only spawn a **fixed allowlist of binaries** (`Codex`, `gemini`, `codex`) with a fixed argument (`--version`); never an arbitrary command string.
- `llm_complete` is the **only** outbound network egress. It accepts a `provider` enum (not a URL), maps it to a fixed host allowlist (`api.anthropic.com`, `api.openai.com`, `generativelanguage.googleapis.com`), attaches the provider auth header, and POSTs a caller-built body. It must never accept a URL argument. The webview CSP stays locked (`connect-src 'self' ipc:`) precisely because egress goes through this command, not the renderer.
- `write_project_text_file` rejects `..`/absolute paths and re-validates the resolved parent against the canonical root after `mkdir` (symlink-escape defense); writes are atomic at `0600`.
- API keys live in the renderer's `localStorage` (origin-scoped) and pass through `llm_complete` per call; they are never persisted by the Rust layer, logged, or written into a task bundle.

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

Default workflow glob: `**/*.json`. Always exclude: `node_modules/**`, `.git/**`, `dist/**`, `build/**`, `target/**`, `.turbo/**`, `.next/**`, `coverage/**`.

---

## External file change handling

The file watcher must not race with the Dev Console's own saves or with Monaco's debounced JSON sync. Use a save-origin marker. External change notification must be debounced long enough to avoid triggering from:
- Monaco keystrokes
- The app's own `write_text_file_with_confirmed_overwrite` call

---

## Package boundary rules

| Package | Must NOT import |
|---|---|
| `console-design-system` | Any domain package |
| `console-shell` | Workflow, runtime, entity, or agent domain packages |
| `workflow-file-indexer`, `workflow-project-model`, `workflow-editor-host`, `entity-model-viewer` | `cyoda-api-client`, `runtime-inspection` |
| `cyoda-api-client`, `runtime-inspection` | Dev-side packages |

Shared packages receive domain navigation items **as props** — they do not import domain modules.

---

## Ops Console production guard

Production environments (`env: "production"`) are read-only by default. In MVP there are no write affordances in the Ops Console. Any future write action requires: session-level explicit enablement + typed confirmation + 5-second cooldown + audit record.

---

## BYO AI integration points

The Dev Console leaves hooks for the BYO AI spec (separate document, `docs/BYO_AI-spec.md`) but does not implement AI features. Required hooks:
- Project root awareness
- Selected workflow context
- Selected entity/model context
- Task bundle hook
- Agent setup route/menu location

Do not remove these hooks. Do not implement BYO AI logic from this spec.

---

## Implementation phases

- **Phase 0:** Monorepo scaffold — Tauri 2 apps, shared packages, build/lint/test wiring, signing placeholders
- **Phase 1:** Dev Console MVP — first-run wizard, scanner, file tree, editor host, save flow, file watching, entity viewer, IDE integration
- **Phase 2:** Ops Console MVP — connection setup, API client, read-only workflow/entity views, export, production guard
- **Phase 3:** Cross-console workflow comparison and change-task generation
- **Phase 4:** BYO AI integration hooks only (per separate spec)

---

## Config persistence

Dev Console persists project config to: `~/Library/Application Support/Cyoda Dev Console/config.json`

Ops Console connection config is distinct from Dev Console project roots — never merge them.

---

## Distribution

Two separate Homebrew casks:
```
brew install --cask cyoda-dev-console
brew install --cask cyoda-ops-console
```

Project root selection happens inside the app's first-run wizard, not during `brew install`. Release artifacts must be signed (Apple Developer ID), notarized, and stapled. MVP uses `brew upgrade` for updates — no in-app auto-update.

---

## Docs

- `docs/specs.md` — full Dev Console + Ops Console implementation specification
- `docs/BYO_AI-spec.md` — AI agent integration specification (Phase 2; Tracks A, B, C)
- `../cyoda-workflow-editor/README.md` — workflow editor package API and usage
