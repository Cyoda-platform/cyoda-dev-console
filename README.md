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

# Start the desktop app in dev mode (hot-reload)
pnpm tauri:dev

# Run all tests
pnpm -r test

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
```

## Implementation phases

See [`docs/phases/`](docs/phases/) for the phased implementation plan.
