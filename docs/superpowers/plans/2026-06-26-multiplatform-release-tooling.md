# Multi-platform Release Tooling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build, package, and publish Cyoda Dev Console releases across macOS (signed+notarized DMG → auto-committed Homebrew cask), Linux (x86_64+arm64 AppImage + `curl|sh` installer), and Windows (verified compile gate + build-from-source docs), driven by one tag-triggered GitHub Actions workflow.

**Architecture:** A single `release.yml` fans out over an OS matrix using `tauri-apps/tauri-action`. A `guard` job asserts the tag matches the app version; a `create-release` job makes one draft Release (find-or-create) that every build job uploads to via `releaseId` (avoiding tauri-action's parallel create-release race); a `checksums` job aggregates `SHA256SUMS`, attaches the installer + icon, asserts no unwanted bundle types leaked, and un-drafts; a `publish-cask` job validates notarization, renders the cask, and commits it to the consolidated `cyoda/homebrew-cyoda` tap using a GitHub-App token. Pure-shell helpers (version guard, Linux installer, cask renderer) are unit-tested in isolation; the workflow is validated with `actionlint` and rehearsed via a build-only `workflow_dispatch` before any tag is cut.

**Tech Stack:** Tauri 2, `tauri-apps/tauri-action`, GitHub Actions, POSIX `sh`/`bash`, Homebrew cask DSL, `actions/create-github-app-token`, `jq`, `gh` CLI.

## Global Constraints

These apply to **every** task (copied verbatim from the spec):

- **Canonical GitHub org is `cyoda`** (lowercase, as used by cyoda-go's working workflow). Repo: `cyoda/cyoda-dev-console`; tap: `cyoda/homebrew-cyoda`. Author generated URLs against `cyoda/...`. Legacy `Cyoda-platform` survives only via GitHub redirects.
- **Artifact names (D12):** strip spaces at upload via tauri-action `releaseAssetNamePattern: cyoda-dev-console_[version]_[arch].[ext]`. Arch tokens are Tauri-native and **format-specific**: DMG `x86_64`/`aarch64`, AppImage `amd64`/`aarch64`. The cask references only DMGs (tokens `x86_64`/`aarch64`); the installer references only AppImages (tokens `amd64`/`aarch64`). **No post-upload rename.**
- **Bundle targets (D13):** macOS `dmg`, Linux `appimage`, Windows `nsis`+`msi`. Never `targets: "all"` (leaks `.deb`/`.rpm`/`.app`).
- **Publish gate (D10):** auto-publish on green; no manual approval. `publish-cask` is the last job and only runs when builds + checksums pass.
- **Prerelease tags (D8):** any tag containing `-` (e.g. `v0.2.0-rc.1`) builds + publishes a GitHub pre-release but **skips the tap**.
- **Release-bot:** the GitHub **App** is `cyoda-platform-release-bot` (verify at infra time); `cyoda-go-release-bot <noreply@cyoda.com>` is only the cask **commit-author** string. Token references: `app-id: ${{ vars.HOMEBREW_TAP_APP_ID }}`, `private-key: ${{ secrets.HOMEBREW_TAP_APP_KEY }}`, `owner: cyoda`, `repositories: homebrew-cyoda`.
- **Version source of truth:** `apps/dev-console/src-tauri/tauri.conf.json` `.version` (currently `0.1.0`). The tag's base (sans `v`, sans `-rc.N`) must equal it.
- **Monorepo build order:** build workspace deps with `pnpm --filter './packages/*' build` **before** the app build in every build job (the app consumes their gitignored `dist/`).
- **Node 22, pnpm 9.15.4, Rust pinned by `rust-toolchain.toml` (1.96.0).**
- **Commits:** Conventional Commits; end every commit message with the trailer `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

### Implementation note — dry-run model (refines spec §3.1)

tauri-action has **no** dry-run flag; build-only = invoking it with **no release inputs** (no `tagName`/`releaseId`). Rather than a `dry_run` boolean that could unsafely be set false on an arbitrary branch, this plan makes the trigger itself the switch: **`workflow_dispatch` is always build-only (the rehearsal); a `v*.*.*` tag push is the only path that publishes.** Publish-path jobs gate on `github.event_name == 'push'`; build jobs run in both modes and pass `releaseId` only when it exists. This is the robust reading of M-1/§3.1 and removes the footgun.

---

## File Structure

| File | Responsibility |
|---|---|
| `scripts/check-release-version.sh` | **Create.** Normalize tag → compare to `tauri.conf.json` version; exit non-zero on mismatch. |
| `scripts/tests/check-release-version.test.sh` | **Create.** Unit tests for the guard. |
| `scripts/install.sh` | **Create.** Linux AppImage `curl\|sh` installer (arch detect, checksum verify, `.desktop`, idempotent). |
| `scripts/tests/install.test.sh` | **Create.** Unit tests for installer's pure functions. |
| `scripts/render-cask.sh` | **Create.** Emit the Homebrew cask Ruby from `(version, arm_sha, intel_sha)`. |
| `scripts/tests/render-cask.test.sh` | **Create.** Unit tests for the renderer. |
| `apps/dev-console/src-tauri/tauri.conf.json` | **Modify.** Explicit `bundle.targets`, add `bundle.linux`/`bundle.windows`. |
| `apps/dev-console/src-tauri/Cargo.toml` | **Modify.** Clean placeholder metadata + stale `rust-version`. |
| `.github/workflows/release.yml` | **Rewrite.** guard → create-release → build matrix → checksums → publish-cask. |
| `.github/workflows/smoke.yml` | **Modify.** Add Linux build; deps-only build command. |
| `RELEASE.md` | **Rewrite.** All-platform release + automated tap + infra setup. |
| `README.md` | **Modify.** Install section (cask one-liner, Linux one-liner, Windows build note). |
| `AGENTS.md` | **Modify.** Distribution wording → tap-qualified. |
| `docs/release-infra-runbook.md` | **Create.** One-time infra (tap, App, secrets, org) + cyoda-go issue text. |
| `homebrew/cyoda-dev-console.rb` | **Delete.** Cask now lives only in the tap. |
| `scripts/update-cask-sha.sh` | **Delete.** Replaced by automated `render-cask.sh` in CI. |

---

## Task 1: Version guard script

**Files:**
- Create: `scripts/check-release-version.sh`
- Test: `scripts/tests/check-release-version.test.sh`

**Interfaces:**
- Produces: CLI `check-release-version.sh <tag> <tauri.conf.json path>` — exit 0 if the tag's base version equals `.version`, else exit 1 with a `::error::` line. Consumed by the `guard` job in Task 5.

- [ ] **Step 1: Write the failing test**

Create `scripts/tests/check-release-version.test.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
script="${here}/../check-release-version.sh"
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
printf '{"version":"0.2.0"}\n' > "$tmp/conf.json"

fail=0
check() { # desc tag want_rc
  local rc=0
  "$script" "$2" "$tmp/conf.json" >/dev/null 2>&1 || rc=$?
  if [[ "$rc" == "$3" ]]; then echo "ok: $1";
  else echo "FAIL: $1 (rc=$rc want=$3)"; fail=1; fi
}
check "exact match"     v0.2.0        0
check "rc suffix ok"    v0.2.0-rc.1   0
check "beta suffix ok"  v0.2.0-beta.2 0
check "no-v prefix ok"  0.2.0         0
check "version mismatch" v0.3.0       1
check "rc of wrong base" v0.3.0-rc.1  1
[[ "$fail" == 0 ]] && echo "ALL PASS"
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bash scripts/tests/check-release-version.test.sh`
Expected: FAIL — `check-release-version.sh` does not exist (non-zero exit / "No such file").

- [ ] **Step 3: Write the script**

Create `scripts/check-release-version.sh`:

```bash
#!/usr/bin/env bash
# Assert a release tag's base version matches tauri.conf.json.
# Usage: check-release-version.sh <tag> <path-to-tauri.conf.json>
set -euo pipefail

tag="${1:?tag required}"
conf="${2:?tauri.conf.json path required}"

base="${tag#v}"        # strip leading v
base="${base%%-*}"     # strip -rc.N / -beta.N prerelease
base="${base%%+*}"     # strip +build metadata

conf_version="$(jq -r '.version' "$conf")"

if [[ "$base" != "$conf_version" ]]; then
  echo "::error::tag '${tag}' (base '${base}') != tauri.conf.json version '${conf_version}'" >&2
  exit 1
fi
echo "version-ok: ${base}"
```

- [ ] **Step 4: Make it executable and run the test to verify it passes**

Run:
```bash
chmod +x scripts/check-release-version.sh
bash scripts/tests/check-release-version.test.sh
```
Expected: six `ok:` lines then `ALL PASS`.

- [ ] **Step 5: Lint the script**

Run: `bash -n scripts/check-release-version.sh && echo "syntax ok"`
Expected: `syntax ok`. (If `shellcheck` is installed — `brew install shellcheck` — also run `shellcheck scripts/check-release-version.sh` and expect no warnings.)

- [ ] **Step 6: Commit**

```bash
git add scripts/check-release-version.sh scripts/tests/check-release-version.test.sh
git commit -m "$(printf 'feat(release): version guard script\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

---

## Task 2: Bundle targets + Cargo.toml metadata

**Files:**
- Modify: `apps/dev-console/src-tauri/tauri.conf.json`
- Modify: `apps/dev-console/src-tauri/Cargo.toml`

**Interfaces:**
- Produces: a `bundle.targets` array restricted to `["dmg","appimage","nsis","msi"]` so no platform emits `.deb`/`.rpm`/`.app`. Build jobs in Task 5 additionally pass `--bundles` per leg (defense in depth).

- [ ] **Step 1: Set explicit bundle targets**

In `apps/dev-console/src-tauri/tauri.conf.json`, replace the line `"targets": "all",` (inside `"bundle"`) with:

```json
    "targets": ["dmg", "appimage", "nsis", "msi"],
```

(Each platform builds only its applicable subset: macOS→`dmg`, Linux→`appimage`, Windows→`nsis`+`msi`.)

- [ ] **Step 2: Add Linux and Windows bundle config**

In the same `"bundle"` object, after the existing `"macOS": { ... }` block, add `"linux"` and `"windows"` siblings:

```json
    "linux": {
      "appimage": {
        "bundleMediaFramework": false
      }
    },
    "windows": {
      "nsis": {
        "installMode": "perMachine"
      }
    },
```

- [ ] **Step 3: Verify the JSON is valid**

Run: `jq -e '.bundle.targets, .bundle.linux, .bundle.windows' apps/dev-console/src-tauri/tauri.conf.json >/dev/null && echo "json ok"`
Expected: `json ok`.

- [ ] **Step 4: Clean up Cargo.toml metadata**

In `apps/dev-console/src-tauri/Cargo.toml`, under `[package]`, replace the placeholder/stale fields:

```toml
name = "cyoda-dev-console"
version = "0.1.0"
description = "Cyoda Dev Console"
authors = ["Cyoda <info@cyoda.com>"]
license = "MIT"
repository = "https://github.com/cyoda/cyoda-dev-console"
edition = "2021"
rust-version = "1.96.0"
```

Keep the existing `[lib]` `name = "app_lib"` unchanged (the binary/lib internal names are referenced elsewhere — only edit the `[package]` metadata fields shown).

- [ ] **Step 5: Verify Cargo.toml still parses**

Run: `cargo verify-project --manifest-path apps/dev-console/src-tauri/Cargo.toml`
Expected: `{"success":"true"}`.

- [ ] **Step 6: Commit**

```bash
git add apps/dev-console/src-tauri/tauri.conf.json apps/dev-console/src-tauri/Cargo.toml
git commit -m "$(printf 'feat(release): explicit bundle targets; clean Cargo metadata\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

---

## Task 3: Linux installer script

**Files:**
- Create: `scripts/install.sh`
- Test: `scripts/tests/install.test.sh`

**Interfaces:**
- Consumes (at runtime, from the published Release): assets `cyoda-dev-console_<ver>_<amd64|aarch64>.AppImage`, `SHA256SUMS`, `cyoda-dev-console.png`.
- Produces: testable shell functions `appimage_arch <machine>` (echoes `amd64`/`aarch64`, exit 1 otherwise) and `resolve_version` (honors `$VERSION`, else queries GitHub latest). The file is attached to each Release by Task 5's `checksums` job.

- [ ] **Step 1: Write the failing test**

Create `scripts/tests/install.test.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
# Source install.sh without running main().
INSTALL_SH_TEST=1 . "${here}/../install.sh"

fail=0
eq() { if [[ "$2" == "$3" ]]; then echo "ok: $1"; else echo "FAIL: $1 ($2 != $3)"; fail=1; fi; }

eq "x86_64 -> amd64"  "$(appimage_arch x86_64)"  amd64
eq "amd64 -> amd64"   "$(appimage_arch amd64)"   amd64
eq "aarch64 -> aarch64" "$(appimage_arch aarch64)" aarch64
eq "arm64 -> aarch64" "$(appimage_arch arm64)"   aarch64
if appimage_arch riscv64 >/dev/null 2>&1; then echo "FAIL: riscv should be rejected"; fail=1; else echo "ok: riscv rejected"; fi
eq "VERSION override" "$(VERSION=v9.9.9 resolve_version)" v9.9.9
[[ "$fail" == 0 ]] && echo "ALL PASS"
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bash scripts/tests/install.test.sh`
Expected: FAIL — `install.sh` does not exist.

- [ ] **Step 3: Write the installer**

Create `scripts/install.sh`:

```bash
#!/bin/sh
# Cyoda Dev Console — Linux installer (AppImage).
# Usage:  curl --proto '=https' --tlsv1.2 -fsSL \
#           https://github.com/cyoda/cyoda-dev-console/releases/latest/download/install.sh | sh
# Pin a version with:  VERSION=v0.2.0 sh install.sh
set -eu

REPO="cyoda/cyoda-dev-console"
APP_NAME="cyoda-dev-console"
DISPLAY_NAME="Cyoda Dev Console"
BIN_DIR="${HOME}/.local/bin"
DESKTOP_DIR="${HOME}/.local/share/applications"
ICON_DIR="${HOME}/.local/share/icons"

err() { echo "install: $*" >&2; }
require() { command -v "$1" >/dev/null 2>&1 || { err "missing required tool: $1"; exit 1; }; }

# Map `uname -m` to the AppImage arch token Tauri emits (amd64, NOT x86_64).
appimage_arch() {
  case "$1" in
    x86_64|amd64)  echo amd64 ;;
    aarch64|arm64) echo aarch64 ;;
    *) return 1 ;;
  esac
}

# Echo the version tag to install. Honors $VERSION, else GitHub "latest".
resolve_version() {
  if [ -n "${VERSION:-}" ]; then echo "${VERSION}"; return 0; fi
  curl --proto '=https' --tlsv1.2 -fsSL \
    "https://api.github.com/repos/${REPO}/releases/latest" \
    | grep '"tag_name"' | head -n1 | cut -d'"' -f4
}

main() {
  [ "$(uname -s)" = "Linux" ] || { err "this installer is for Linux only"; exit 1; }
  require curl
  require sha256sum

  arch="$(appimage_arch "$(uname -m)")" || { err "unsupported architecture: $(uname -m)"; exit 1; }
  version="$(resolve_version)"
  [ -n "${version}" ] || { err "could not resolve a release version"; exit 1; }
  ver="${version#v}"

  asset="${APP_NAME}_${ver}_${arch}.AppImage"
  base="https://github.com/${REPO}/releases/download/${version}"

  tmp="$(mktemp -d)"; trap 'rm -rf "${tmp}"' EXIT

  err "downloading ${asset} ..."
  curl --proto '=https' --tlsv1.2 -fsSL -o "${tmp}/${asset}"     "${base}/${asset}"
  curl --proto '=https' --tlsv1.2 -fsSL -o "${tmp}/SHA256SUMS"   "${base}/SHA256SUMS"

  err "verifying checksum ..."
  ( cd "${tmp}" && grep " ${asset}\$" SHA256SUMS | sha256sum -c - ) \
    || { err "checksum verification FAILED for ${asset}"; exit 1; }

  mkdir -p "${BIN_DIR}" "${DESKTOP_DIR}" "${ICON_DIR}"
  install -m 0755 "${tmp}/${asset}" "${BIN_DIR}/${APP_NAME}"

  # Icon is a best-effort cosmetic; release ships cyoda-dev-console.png.
  if curl --proto '=https' --tlsv1.2 -fsSL -o "${tmp}/icon.png" "${base}/${APP_NAME}.png"; then
    install -m 0644 "${tmp}/icon.png" "${ICON_DIR}/${APP_NAME}.png"
  fi

  cat > "${DESKTOP_DIR}/${APP_NAME}.desktop" <<EOF
[Desktop Entry]
Type=Application
Name=${DISPLAY_NAME}
Exec=${BIN_DIR}/${APP_NAME}
Icon=${ICON_DIR}/${APP_NAME}.png
Categories=Development;
Terminal=false
EOF

  err "installed ${DISPLAY_NAME} ${ver} -> ${BIN_DIR}/${APP_NAME}"
  case ":${PATH}:" in
    *":${BIN_DIR}:"*) ;;
    *) err "note: ${BIN_DIR} is not on your PATH — add it to run 'cyoda-dev-console'";;
  esac
}

# Run main only when executed, not when sourced by tests.
if [ "${INSTALL_SH_TEST:-}" != "1" ]; then
  main "$@"
fi
```

- [ ] **Step 4: Make it executable and run the test to verify it passes**

Run:
```bash
chmod +x scripts/install.sh
bash scripts/tests/install.test.sh
```
Expected: `ok:` lines for each case then `ALL PASS`.

- [ ] **Step 5: Lint**

Run: `sh -n scripts/install.sh && echo "syntax ok"`
Expected: `syntax ok`. (If available: `shellcheck -s sh scripts/install.sh`.)

- [ ] **Step 6: Commit**

```bash
git add scripts/install.sh scripts/tests/install.test.sh
git commit -m "$(printf 'feat(release): Linux AppImage curl|sh installer\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

---

## Task 4: Cask renderer (and remove the manual cask path)

**Files:**
- Create: `scripts/render-cask.sh`
- Test: `scripts/tests/render-cask.test.sh`
- Delete: `homebrew/cyoda-dev-console.rb`
- Delete: `scripts/update-cask-sha.sh`

**Interfaces:**
- Consumes: nothing.
- Produces: CLI `render-cask.sh <tag> <arm_sha256> <intel_sha256>` → prints the cask Ruby to stdout. The cask `url` uses asset names `cyoda-dev-console_#{version}_#{arch}.dmg` with `arch arm:"aarch64", intel:"x86_64"` (D12 DMG tokens). Consumed by `publish-cask` in Task 5.

- [ ] **Step 1: Write the failing test**

Create `scripts/tests/render-cask.test.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
out="$("${here}/../render-cask.sh" v0.2.0 AAAAARM111 BBBBINTEL222)"

fail=0
has() { if grep -qF "$2" <<<"$out"; then echo "ok: $1"; else echo "FAIL: $1"; fail=1; fi; }

has "version stripped of v"  'version "0.2.0"'
has "arm sha"                'arm:   "AAAAARM111"'
has "intel sha"              'intel: "BBBBINTEL222"'
has "arch map"               'arch arm: "aarch64", intel: "x86_64"'
has "dmg url scheme"         'cyoda-dev-console_#{version}_#{arch}.dmg'
has "cyoda org in url"       'github.com/cyoda/cyoda-dev-console/releases'
has "monterey floor"         'depends_on macos: ">= :monterey"'
has "app stanza"             'app "Cyoda Dev Console.app"'
[[ "$fail" == 0 ]] && echo "ALL PASS"
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bash scripts/tests/render-cask.test.sh`
Expected: FAIL — `render-cask.sh` does not exist.

- [ ] **Step 3: Write the renderer**

Create `scripts/render-cask.sh`:

```bash
#!/usr/bin/env bash
# Render the Homebrew cask for a cyoda-dev-console release.
# Usage: render-cask.sh <tag> <arm_sha256> <intel_sha256>
set -euo pipefail

tag="${1:?tag required}"
arm="${2:?arm sha256 required}"
intel="${3:?intel sha256 required}"
ver="${tag#v}"

cat <<EOF
cask "cyoda-dev-console" do
  version "${ver}"
  sha256 arm:   "${arm}",
         intel: "${intel}"

  arch arm: "aarch64", intel: "x86_64"
  url "https://github.com/cyoda/cyoda-dev-console/releases/download/v#{version}/cyoda-dev-console_#{version}_#{arch}.dmg"

  name "Cyoda Dev Console"
  desc "Local file-based editor for Cyoda workflows"
  homepage "https://cyoda.com"

  auto_updates false
  depends_on macos: ">= :monterey"

  app "Cyoda Dev Console.app"

  zap trash: [
    "~/Library/Application Support/Cyoda Dev Console",
    "~/Library/Preferences/com.cyoda.devconsole.plist",
    "~/Library/Saved Application State/com.cyoda.devconsole.savedState",
  ]
end
EOF
```

> Note: `depends_on macos: ">= :monterey"` is coupled to `tauri.conf.json` `bundle.macOS.minimumSystemVersion: "12.0"` (Monterey = 12.x). If that floor changes, update both (Mi-6).

- [ ] **Step 4: Make it executable and run the test to verify it passes**

Run:
```bash
chmod +x scripts/render-cask.sh
bash scripts/tests/render-cask.test.sh
```
Expected: `ok:` lines then `ALL PASS`.

- [ ] **Step 5: Optional Homebrew style gate (if `brew` is installed)**

Run:
```bash
scripts/render-cask.sh v0.2.0 $(printf 'a%.0s' {1..64}) $(printf 'b%.0s' {1..64}) > /tmp/cyoda-dev-console.rb
brew style --cask /tmp/cyoda-dev-console.rb || true
```
Expected: no style errors (a `brew`-not-installed environment may skip this; the unit test in Step 4 is the authoritative gate).

- [ ] **Step 6: Delete the superseded manual cask path**

Run:
```bash
git rm homebrew/cyoda-dev-console.rb scripts/update-cask-sha.sh
```
(The cask now lives only in the tap, generated by `render-cask.sh`. `RELEASE.md` is rewritten in Task 7.)

- [ ] **Step 7: Commit**

```bash
git add scripts/render-cask.sh scripts/tests/render-cask.test.sh
git commit -m "$(printf 'feat(release): cask renderer; remove manual cask + sha script\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

---

## Task 5: Release workflow

**Files:**
- Rewrite: `.github/workflows/release.yml`

**Interfaces:**
- Consumes: `scripts/check-release-version.sh` (Task 1), `scripts/install.sh` (Task 3), `scripts/render-cask.sh` (Task 4), the bundle config (Task 2).
- Produces: on a `v*.*.*` tag, one GitHub Release with DMGs (×2), AppImages (×2), `SHA256SUMS`, `cyoda-dev-console.png`, `install.sh`; and (for non-prerelease tags) a cask commit on `cyoda/homebrew-cyoda`. On `workflow_dispatch`, a build-only rehearsal that publishes nothing.

- [ ] **Step 1: Write the workflow**

Replace the entire contents of `.github/workflows/release.yml` with:

```yaml
name: Release
on:
  push:
    tags: ["v*.*.*"]
  workflow_dispatch: {}   # build-only rehearsal; never publishes

concurrency:
  group: release-${{ github.ref }}
  cancel-in-progress: false

permissions:
  contents: write

jobs:
  guard:
    if: ${{ github.event_name == 'push' }}
    runs-on: ubuntu-22.04
    steps:
      - uses: actions/checkout@v4
      - run: ./scripts/check-release-version.sh "${{ github.ref_name }}" apps/dev-console/src-tauri/tauri.conf.json

  create-release:
    needs: guard
    if: ${{ github.event_name == 'push' }}
    runs-on: ubuntu-22.04
    outputs:
      release_id: ${{ steps.rel.outputs.id }}
    steps:
      - name: Find or create the draft release
        id: rel
        uses: actions/github-script@v7
        with:
          script: |
            const tag = context.ref.replace('refs/tags/', '');
            const { owner, repo } = context.repo;
            let rel;
            try {
              rel = (await github.rest.repos.getReleaseByTag({ owner, repo, tag })).data;
            } catch (e) {
              rel = (await github.rest.repos.createRelease({
                owner, repo, tag_name: tag, name: tag,
                draft: true, prerelease: tag.includes('-'),
                generate_release_notes: true,
              })).data;
            }
            if (!rel.body) {
              const notes = await github.rest.repos.generateReleaseNotes({ owner, repo, tag_name: tag });
              await github.rest.repos.updateRelease({ owner, repo, release_id: rel.id, body: notes.data.body });
            }
            core.setOutput('id', String(rel.id));

  build-macos:
    needs: create-release
    if: ${{ always() && (github.event_name == 'workflow_dispatch' || needs.create-release.result == 'success') }}
    runs-on: macos-14
    strategy:
      fail-fast: false
      matrix:
        target: [aarch64-apple-darwin, x86_64-apple-darwin]
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: pnpm }
      - uses: dtolnay/rust-toolchain@stable
        with: { targets: "${{ matrix.target }}" }
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter './packages/*' build
      - uses: tauri-apps/tauri-action@v0
        env:
          APPLE_CERTIFICATE: ${{ secrets.APPLE_CERTIFICATE }}
          APPLE_CERTIFICATE_PASSWORD: ${{ secrets.APPLE_CERTIFICATE_PASSWORD }}
          APPLE_SIGNING_IDENTITY: ${{ secrets.APPLE_SIGNING_IDENTITY }}
          APPLE_ID: ${{ secrets.APPLE_ID }}
          APPLE_PASSWORD: ${{ secrets.APPLE_PASSWORD }}
          APPLE_TEAM_ID: ${{ secrets.APPLE_TEAM_ID }}
        with:
          projectPath: apps/dev-console
          releaseId: ${{ needs.create-release.outputs.release_id }}
          args: --target ${{ matrix.target }} --bundles dmg
          releaseAssetNamePattern: cyoda-dev-console_[version]_[arch].[ext]

  build-linux:
    needs: create-release
    if: ${{ always() && (github.event_name == 'workflow_dispatch' || needs.create-release.result == 'success') }}
    strategy:
      fail-fast: false
      matrix:
        runner: [ubuntu-22.04, ubuntu-22.04-arm]
    runs-on: ${{ matrix.runner }}
    env:
      APPIMAGE_EXTRACT_AND_RUN: "1"
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: pnpm }
      - uses: dtolnay/rust-toolchain@stable
      - name: Install Linux bundle dependencies
        run: |
          sudo apt-get update
          sudo apt-get install -y \
            libwebkit2gtk-4.1-dev libgtk-3-dev \
            libayatana-appindicator3-dev librsvg2-dev patchelf
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter './packages/*' build
      - uses: tauri-apps/tauri-action@v0
        with:
          projectPath: apps/dev-console
          releaseId: ${{ needs.create-release.outputs.release_id }}
          args: --bundles appimage
          releaseAssetNamePattern: cyoda-dev-console_[version]_[arch].[ext]

  build-windows:
    needs: create-release
    if: ${{ always() && (github.event_name == 'workflow_dispatch' || needs.create-release.result == 'success') }}
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: pnpm }
      - uses: dtolnay/rust-toolchain@stable
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter './packages/*' build
      # Compile/bundle gate only — no releaseId, so nothing is uploaded.
      - uses: tauri-apps/tauri-action@v0
        with:
          projectPath: apps/dev-console
          args: --bundles nsis,msi

  checksums:
    needs: [build-macos, build-linux]
    if: ${{ github.event_name == 'push' }}
    runs-on: ubuntu-22.04
    env:
      GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
    steps:
      - uses: actions/checkout@v4
      - name: Download published bundles
        run: |
          mkdir -p dist && cd dist
          gh release download "${{ github.ref_name }}" --repo "${{ github.repository }}" \
            --pattern '*.dmg' --pattern '*.AppImage'
      - name: Assert no unwanted bundle types leaked (D13)
        run: |
          cd dist
          if ls | grep -Ei '\.(deb|rpm|app|app\.tar\.gz)$'; then
            echo "::error::unexpected bundle artifact present in release"; exit 1
          fi
      - name: Stage installer icon
        run: cp apps/dev-console/src-tauri/icons/128x128.png dist/cyoda-dev-console.png
      - name: Generate SHA256SUMS over installable artifacts
        run: cd dist && sha256sum cyoda-dev-console_*.dmg cyoda-dev-console_*.AppImage > SHA256SUMS
      - name: Attach SHA256SUMS, icon, and installer
        run: |
          gh release upload "${{ github.ref_name }}" \
            dist/SHA256SUMS dist/cyoda-dev-console.png scripts/install.sh \
            --repo "${{ github.repository }}" --clobber
      - name: Publish (un-draft) the release
        run: gh release edit "${{ github.ref_name }}" --draft=false --repo "${{ github.repository }}"

  publish-cask:
    needs: checksums
    if: ${{ github.event_name == 'push' && !contains(github.ref_name, '-') }}
    runs-on: macos-14
    steps:
      - uses: actions/checkout@v4
      - name: Download DMGs + checksums
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          mkdir -p dist && cd dist
          gh release download "${{ github.ref_name }}" --repo "${{ github.repository }}" \
            --pattern '*.dmg' --pattern 'SHA256SUMS'
      - name: Validate notarization (fail closed)
        run: |
          for dmg in dist/*.dmg; do
            echo "validating ${dmg}"
            xcrun stapler validate "${dmg}" || { echo "::error::not notarized: ${dmg}"; exit 1; }
          done
      - name: Read per-arch SHA256
        id: sha
        run: |
          ver="${GITHUB_REF_NAME#v}"
          arm="$(grep "cyoda-dev-console_${ver}_aarch64.dmg\$" dist/SHA256SUMS | cut -d' ' -f1)"
          intel="$(grep "cyoda-dev-console_${ver}_x86_64.dmg\$" dist/SHA256SUMS | cut -d' ' -f1)"
          test -n "${arm}" && test -n "${intel}" || { echo "::error::missing DMG hash"; exit 1; }
          echo "arm=${arm}"   >> "$GITHUB_OUTPUT"
          echo "intel=${intel}" >> "$GITHUB_OUTPUT"
      - name: Mint tap token
        id: token
        uses: actions/create-github-app-token@v1
        with:
          app-id: ${{ vars.HOMEBREW_TAP_APP_ID }}
          private-key: ${{ secrets.HOMEBREW_TAP_APP_KEY }}
          owner: cyoda
          repositories: homebrew-cyoda
      - name: Render and commit the cask
        env:
          GH_TOKEN: ${{ steps.token.outputs.token }}
        run: |
          git clone "https://x-access-token:${GH_TOKEN}@github.com/cyoda/homebrew-cyoda.git" tap
          mkdir -p tap/Casks
          ./scripts/render-cask.sh "${GITHUB_REF_NAME}" \
            "${{ steps.sha.outputs.arm }}" "${{ steps.sha.outputs.intel }}" \
            > tap/Casks/cyoda-dev-console.rb
          cd tap
          git config user.name  "cyoda-go-release-bot"
          git config user.email "noreply@cyoda.com"
          git add Casks/cyoda-dev-console.rb
          git commit -m "Cask update for cyoda-dev-console version ${GITHUB_REF_NAME}"
          git push
```

> **Action pinning (Mi-3):** before the first real tag, pin at least `actions/create-github-app-token` and `actions/github-script` to full commit SHAs (e.g. `gh api repos/actions/create-github-app-token/git/ref/tags/v1 --jq .object.sha`). Dependabot (already configured) keeps the SHA comments current. Major-version tags are acceptable for the non-privileged build actions.

- [ ] **Step 2: Lint the workflow**

Run: `actionlint .github/workflows/release.yml`
Expected: no output (exit 0). Fix any reported issues. (If `actionlint` is missing: `brew install actionlint`.)

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/release.yml
git commit -m "$(printf 'feat(release): unified multi-platform release workflow\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

- [ ] **Step 4: Integration rehearsal — build-only dry run (no version consumed)**

Push the work branch, then trigger the build-only path and confirm it builds all platforms and uploads nothing:

```bash
git push -u origin release-tooling
gh workflow run Release --ref release-tooling
gh run watch "$(gh run list --workflow=Release --branch=release-tooling --limit=1 --json databaseId --jq '.[0].databaseId')"
```
Expected: `build-macos` (×2), `build-linux` (×2), `build-windows` succeed; `guard`/`create-release`/`checksums`/`publish-cask` are **skipped**; **no GitHub Release is created** (verify: `gh release list --repo cyoda/cyoda-dev-console` shows nothing new). If `ubuntu-22.04-arm` is unavailable to the org, the arm leg fails here — fall back per spec §10 (drop the `ubuntu-22.04-arm` matrix entry and defer arm64).

> The full publish path (tag → DMG/AppImage/cask) cannot be rehearsed until the tap infra (Task 8) exists. First real validation is an `-rc` tag after Task 8.

---

## Task 6: Smoke workflow — add Linux

**Files:**
- Modify: `.github/workflows/smoke.yml`

**Interfaces:**
- Produces: a `staging`-push Linux AppImage build so AppImage breakage surfaces between releases. macOS smoke unchanged.

- [ ] **Step 1: Add a Linux smoke job and align the build command**

Replace the contents of `.github/workflows/smoke.yml` with:

```yaml
name: Smoke
on:
  push:
    branches: [staging]
jobs:
  macos:
    runs-on: macos-14
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: pnpm }
      - uses: dtolnay/rust-toolchain@stable
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter './packages/*' build
      - run: pnpm --filter dev-console tauri:build -- --bundles dmg
  linux:
    runs-on: ubuntu-22.04
    env:
      APPIMAGE_EXTRACT_AND_RUN: "1"
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: pnpm }
      - uses: dtolnay/rust-toolchain@stable
      - name: Install Linux bundle dependencies
        run: |
          sudo apt-get update
          sudo apt-get install -y \
            libwebkit2gtk-4.1-dev libgtk-3-dev \
            libayatana-appindicator3-dev librsvg2-dev patchelf
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter './packages/*' build
      - run: pnpm --filter dev-console tauri:build -- --bundles appimage
```

> The macOS smoke build keeps `--bundles dmg` so the explicit-targets config is exercised; `tauri:build -- --bundles X` is the local-CLI equivalent of the workflow's `--bundles` (the `-- --target` quirk noted in the old smoke comment only affected `--target`, not `--bundles`).

- [ ] **Step 2: Lint**

Run: `actionlint .github/workflows/smoke.yml`
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/smoke.yml
git commit -m "$(printf 'ci(smoke): add Linux AppImage build; deps-only prebuild\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

---

## Task 7: Documentation

**Files:**
- Rewrite: `RELEASE.md`
- Modify: `README.md`
- Modify: `AGENTS.md`

**Interfaces:** none (docs).

- [ ] **Step 1: Rewrite `RELEASE.md`**

Replace `RELEASE.md` with the following (covers all platforms, the automated tap, prerequisites, and the build-from-source path):

````markdown
# Release Process

Cyoda Dev Console ships as: a notarized macOS DMG (installed via the Homebrew cask in `cyoda/homebrew-cyoda`), a Linux AppImage (GitHub Releases + `curl|sh` installer), and build-from-source on Windows. One tagged workflow produces everything.

## How a release flows

1. Bump `version` in `apps/dev-console/src-tauri/tauri.conf.json` (SemVer) and commit.
2. Push a tag `vX.Y.Z` (or `vX.Y.Z-rc.N` to rehearse without touching Homebrew).
3. `release.yml` runs: `guard` (tag must equal the config version) → `create-release` (one draft) → build macOS ×2 (signed+notarized DMG), Linux ×2 (AppImage), Windows (compile gate, no upload) → `checksums` (SHA256SUMS + installer + icon, then un-draft) → `publish-cask` (validate notarization, regenerate the cask, commit it to the tap as `cyoda-go-release-bot`). Prerelease tags skip `publish-cask`.

## Rehearsing without cutting a release

Trigger the workflow manually (build-only, nothing published, no version consumed):

```bash
gh workflow run Release --ref <your-branch>
```

## Prerequisites (one-time)

- **Apple:** Developer ID Application cert + app-specific password. Repo secrets: `APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`, `APPLE_SIGNING_IDENTITY`, `APPLE_ID`, `APPLE_PASSWORD`, `APPLE_TEAM_ID`.
- **Homebrew tap:** see `docs/release-infra-runbook.md` (create `cyoda/homebrew-cyoda`, install the release-bot App, set `vars.HOMEBREW_TAP_APP_ID` + `secrets.HOMEBREW_TAP_APP_KEY`).

## Install (end users)

- **macOS:** `brew install --cask cyoda/cyoda/cyoda-dev-console`
- **Linux:** `curl --proto '=https' --tlsv1.2 -fsSL https://github.com/cyoda/cyoda-dev-console/releases/latest/download/install.sh | sh`
  (or download the `.AppImage` from the Releases page; `chmod +x` and run.)
- **Windows:** build from source (below).

## Build from source on Windows

No prebuilt Windows binaries are published. Requirements: [Rust](https://rustup.rs) (the repo pins the toolchain via `rust-toolchain.toml`), Node 22, pnpm 9, and the **MSVC C++ Build Tools** (Visual Studio "Desktop development with C++").

```powershell
pnpm install --frozen-lockfile
pnpm --filter "./packages/*" build
pnpm --filter dev-console tauri:build
```

The bundle lands under `apps/dev-console/src-tauri/target/release/bundle/`. The resulting installer/exe is **unsigned**, so Windows SmartScreen shows an "unknown publisher" warning — choose **More info → Run anyway**.

## Post-release verification

- macOS: `brew install --cask cyoda/cyoda/cyoda-dev-console` on a clean account; app launches with no Gatekeeper warning; `spctl --assess --type execute --verbose "Cyoda Dev Console.app"` → "source=Notarized Developer ID".
- Linux (both arches): installer round-trip — install → menu entry appears → re-run upgrades cleanly → a tampered file fails the checksum and aborts.
- Cask commit landed in the tap with author `cyoda-go-release-bot` and correct per-arch SHAs; a prerelease tag did **not** touch the tap.

## No in-app auto-update

Updates are delivered via `brew upgrade` (macOS) or re-running the Linux installer. See `docs/specs.md` §5.3.
````

- [ ] **Step 2: Update the `README.md` install section**

Open `README.md`, find the existing install/usage section, and ensure it contains exactly these three install paths (replace any older macOS-only or `Cyoda-platform` instructions):

```markdown
## Install

- **macOS:** `brew install --cask cyoda/cyoda/cyoda-dev-console`
- **Linux:** `curl --proto '=https' --tlsv1.2 -fsSL https://github.com/cyoda/cyoda-dev-console/releases/latest/download/install.sh | sh`
- **Windows:** build from source — see [RELEASE.md](RELEASE.md#build-from-source-on-windows).
```

- [ ] **Step 3: Sweep `AGENTS.md` distribution wording**

In `AGENTS.md`, find the distribution section (search for `brew install` / `homebrew` / "cask"). Replace any bare `brew install --cask cyoda-dev-console` or "two separate casks" phrasing with the tap-qualified form `brew install --cask cyoda/cyoda/cyoda-dev-console`, and update any `Cyoda-platform/...` references to `cyoda/...`.

- [ ] **Step 4: Verify no stale references remain**

Run:
```bash
grep -rn "Cyoda-platform\|update-cask-sha\|homebrew/cyoda-dev-console.rb" README.md RELEASE.md AGENTS.md || echo "clean"
```
Expected: `clean` (no matches).

- [ ] **Step 5: Commit**

```bash
git add RELEASE.md README.md AGENTS.md
git commit -m "$(printf 'docs(release): all-platform release + install instructions\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

---

## Task 8: Infrastructure runbook + cyoda-go coordination

**Files:**
- Create: `docs/release-infra-runbook.md`

**Interfaces:** none. This task documents the one-time manual infra (T10/T11) and the cross-repo coordination (T9). The actual GitHub operations (creating the tap, installing the App, filing the issue) are performed by a human/maintainer following this runbook — the deliverable here is the runbook + ready-to-paste issue text.

- [ ] **Step 1: Write the runbook**

Create `docs/release-infra-runbook.md`:

````markdown
# Release Infrastructure Runbook (one-time)

Performed once before the first real release. The release workflow (`release.yml`) is fully build-rehearsable via `gh workflow run Release` *before* any of this exists; only the publish path (DMG cask + Linux Release) needs it.

## 1. Consolidated Homebrew tap

Create `cyoda/homebrew-cyoda` with this layout:

```
Formula/
  cyoda.rb               # cyoda-go (migrated — see §3)
Casks/
  cyoda-dev-console.rb   # auto-committed by release.yml
README.md                # brew install --cask cyoda/cyoda/cyoda-dev-console
```

The `Casks/cyoda-dev-console.rb` file is generated by CI; it need not exist beforehand (the workflow creates `Casks/` on first push).

## 2. Release-bot GitHub App

Reuse the existing App used by cyoda-go (registered name **`cyoda-platform-release-bot`** per cyoda-go's `MAINTAINING.md` — verify the exact name/ID).

1. Confirm the App and the tap repo both live under the **`cyoda`** account (the workflow mints with `owner: cyoda`, lowercase — do not rely on case-insensitivity).
2. Install the App on `cyoda/homebrew-cyoda` with permission **Contents: Read and write**, scoped to that repo only (not org-wide).
3. In `cyoda/cyoda-dev-console` → Settings → Secrets and variables → Actions:
   - **Variable** `HOMEBREW_TAP_APP_ID` = the App's numeric ID.
   - **Secret** `HOMEBREW_TAP_APP_KEY` = the App's private-key `.pem` contents.

## 3. cyoda-go coordination (file as a GitHub issue on `cyoda/cyoda-go`)

> **Title:** Migrate Homebrew publishing to the consolidated `cyoda/homebrew-cyoda` tap
>
> **Body:**
> We are consolidating Cyoda's Homebrew distribution into a single tap, `cyoda/homebrew-cyoda`, with `Formula/` (CLI: cyoda-go) and `Casks/` (desktop apps: cyoda-dev-console, future ops-console). Requested changes in cyoda-go:
> - Retarget GoReleaser `brews:` `repository` from `homebrew-cyoda-go` → `homebrew-cyoda`, writing into `Formula/` (`directory: Formula`).
> - For ≥1 release cycle, **dual-publish** to both taps (or keep the old tap updated) for backwards compatibility.
> - Update cyoda-go README/tap install instructions to `brew install cyoda/cyoda/cyoda` (or the formula's install name).
> - Confirm the `cyoda-platform-release-bot` App is installed on `cyoda/homebrew-cyoda` and that `vars.HOMEBREW_TAP_APP_ID` / `secrets.HOMEBREW_TAP_APP_KEY` resolve in cyoda-go's workflow.
> - Normalize org slug to `cyoda` and tap layout to `Formula/` + `Casks/`.

## 4. Org migration (`Cyoda-platform` → `cyoda`)

`cyoda` is canonical. Move `cyoda-dev-console` to the `cyoda` org if not already there. All generated URLs (cask, installer, release downloads) are authored against `cyoda/...`; GitHub redirects keep legacy `Cyoda-platform` links working during the transition.

## 5. First release sequence

1. Build-rehearse: `gh workflow run Release --ref <branch>` → all platforms green, nothing published.
2. Cut a prerelease: `git tag v0.2.0-rc.1 && git push origin v0.2.0-rc.1` → DMGs + AppImages publish to a GitHub **pre-release**; tap untouched. Install-test both platforms.
3. Cut the real tag: `git tag v0.2.0 && git push origin v0.2.0` → full release + cask commit to the tap.
````

- [ ] **Step 2: Verify the runbook renders and links resolve**

Run:
```bash
grep -n "HOMEBREW_TAP_APP_ID\|cyoda/homebrew-cyoda\|cyoda-platform-release-bot" docs/release-infra-runbook.md
```
Expected: matches confirming the variable, tap, and App name are all documented.

- [ ] **Step 3: Commit**

```bash
git add docs/release-infra-runbook.md
git commit -m "$(printf 'docs(release): one-time infra runbook + cyoda-go coordination\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

---

## Done criteria

- All unit tests pass: `bash scripts/tests/check-release-version.test.sh && bash scripts/tests/install.test.sh && bash scripts/tests/render-cask.test.sh`.
- `actionlint .github/workflows/release.yml .github/workflows/smoke.yml` is clean.
- A build-only `workflow_dispatch` run of `Release` is green on all five build legs and publishes nothing.
- Docs contain no `Cyoda-platform` / `update-cask-sha` / in-repo-cask references.
- Infra runbook + cyoda-go issue text are ready for a maintainer to action; first real release follows the §5 sequence (rehearse → `-rc` → real tag).
```
