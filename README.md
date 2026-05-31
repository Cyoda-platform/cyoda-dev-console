# Cyoda Dev Console

A Tauri 2 desktop application for inspecting and correcting generated workflow JSON during the build phase. Wraps `cyoda-workflow-editor` so a developer can work with workflow files locally, without a running Cyoda environment.

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
