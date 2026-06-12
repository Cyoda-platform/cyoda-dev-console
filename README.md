# Cyoda Dev Console

A Tauri 2 desktop application for inspecting and correcting generated workflow JSON during the build phase. Wraps `cyoda-workflow-editor` so a developer can work with workflow files locally, without a running Cyoda environment.

## Installation

```bash
brew install --cask cyoda/cyoda/cyoda-dev-console
```

On first launch, the app prompts you to select your Cyoda project folder. No project information is captured during `brew install`.

## Updates

Updates ship via Homebrew only. Run:

```bash
brew upgrade --cask cyoda-dev-console
```

In-app auto-update is intentionally NOT enabled in this release (see `docs/specs.md` §5.3).

---

## CI secrets required for release

The tag-triggered release workflow (`.github/workflows/release.yml`) needs these GitHub repository secrets:

| Secret | Description |
|---|---|
| `APPLE_CERTIFICATE` | Base64-encoded `.p12` code-signing certificate |
| `APPLE_CERTIFICATE_PASSWORD` | Password for the `.p12` file |
| `APPLE_SIGNING_IDENTITY` | Certificate common name, e.g. `Developer ID Application: Cyoda Ltd (TEAMID)` |
| `APPLE_ID` | Apple ID used for notarization (App Store Connect account) |
| `APPLE_PASSWORD` | App-specific password for the Apple ID |
| `APPLE_TEAM_ID` | Apple Developer Team ID |

After a release tag is pushed, two `.dmg` artifacts (Apple Silicon and Intel) are attached to the GitHub release. Update the SHA256 values in `homebrew/cyoda-dev-console.rb` using:

```bash
./scripts/update-cask-sha.sh path/to/arm.dmg path/to/intel.dmg
```

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
