# Cyoda Dev Console

A Tauri 2 desktop application for inspecting and correcting generated workflow JSON during the build phase. Wraps `cyoda-workflow-editor` so a developer can work with workflow files locally, without a running Cyoda environment.

## Install

- **macOS:** `brew install --cask cyoda/cyoda/cyoda-dev-console`
- **Linux:** `curl --proto '=https' --tlsv1.2 -fsSL https://github.com/cyoda/cyoda-dev-console/releases/latest/download/install.sh | sh`
- **Windows:** build from source — see [RELEASE.md](RELEASE.md#build-from-source-on-windows).

## Updates

Updates ship via Homebrew (macOS) or re-running the Linux installer. In-app auto-update is intentionally NOT enabled in this release (see `docs/specs.md` §5.3).

---

## Prerequisites

| Tool | Version |
|---|---|
| Node.js | ≥ 22 |
| pnpm | ≥ 9 |
| Rust (stable) | via [rustup](https://rustup.rs) |
| cargo-tauri | 2.x (`cargo install tauri-cli --version "^2"`) |
| Xcode Command Line Tools | macOS only |

## Commands

```bash
# Install dependencies
pnpm install

# Build workspace packages (packages/*/dist is gitignored — required before
# tauri:dev/tauri:build, and again after any pull that touches packages/*)
pnpm build

# Start the desktop app in dev mode (hot-reload)
pnpm tauri:dev

# Run all tests
pnpm test

# Lint
pnpm lint

# Typecheck
pnpm typecheck

# Production build (Vite + Tauri bundle)
pnpm tauri:build
```

## Monorepo structure

```
apps/
  dev-console/        # Tauri 2 app
packages/
  console-design-system/  # Tokens, typography, primitive components
  console-shell/          # App frame, sidebar, header
  agent-bridge-contract/  # Type-only contract for the BYO AI surface
```

### Workflow editor (`@cyoda/workflow-*`)

The workflow editor is consumed as **published packages from the public npm
registry** (`@cyoda/workflow-core`, `-react`, `-viewer`, `-monaco`, `-graph`,
`-layout`), pinned to exact versions. No registry auth is required to install.
To upgrade, bump the versions in the consuming manifests and run `pnpm install`.

**Local co-development** (editing the lib in `../cyoda-workflow-editor` against
this app): use `pnpm` overrides or `pnpm link` to point the `@cyoda/workflow-*`
deps at the sibling checkout, build the lib (`pnpm -r build` there), then
re-install here. Keep those local edits out of commits — committed manifests must
stay on the published versions so CI (which has no sibling checkout) installs cleanly.

## BYO AI (AI Assistant)

The Dev Console has an in-app AI Assistant, plus optional tooling to set up a separate
command-line agent. The whole area is **off by default**, gated by a single feature flag (see
`apps/dev-console/.env.example`):

```
VITE_FEATURE_FLAG_AGENT=true
```

With it on, an **AI Assistant** entry appears in the sidebar. Opening it:

- **Set up AI** (always visible): pick a provider (Anthropic / OpenAI / Gemini, Anthropic
  default), confirm the model, and paste your API key. That's the only setup needed — no
  workflow or profile required first.
- **Assistant chat**: ask about Cyoda workflows; with a workflow open in the editor, the
  Assistant can propose a change and apply it through a diff.
- **Advanced: external agents** (collapsed): the optional **Connect** / **Bundle** / **Profiles**
  tools for wiring up an *external* CLI agent (Claude Code, Gemini CLI, Codex) outside the app.
  Most users can ignore this.

To try it locally, create `apps/dev-console/.env` with `VITE_FEATURE_FLAG_AGENT=true` and run
`pnpm tauri:dev`.

**What leaves your machine.** Everything except the Assistant is fully local. The Assistant
sends the selected workflow JSON and your chat messages to your chosen LLM provider, using your
own API key. Keys are stored in the app's local storage (origin-scoped) and are sent only to
that provider — never to Cyoda, never written into a task bundle. LLM calls are proxied through
the Rust backend to a fixed provider host allowlist (`api.anthropic.com`, `api.openai.com`,
`generativelanguage.googleapis.com`); there is no arbitrary outbound network access. Applied
workflow edits are always re-validated and re-serialized through `@cyoda/workflow-core` before
being written to disk.

Model presets are pinned to current provider model IDs and may need bumping as those APIs
evolve (see `apps/dev-console/src/assistant/providers/`).

## Implementation phases

See [`docs/phases/`](docs/phases/) for the phased implementation plan.
