# Multi-platform release tooling — design

Date: 2026-06-26
Status: Approved (brainstorming), pending spec review
Scope: Build / package / publish release artifacts for Cyoda Dev Console across macOS, Linux, and Windows, and consolidate Homebrew distribution into a single strategic tap.

---

## 1. Purpose & context

Cyoda Dev Console is a Tauri 2 app (React + TypeScript + Vite frontend, Rust `src-tauri`). Today only **macOS** has a real release pipeline:

- `.github/workflows/release.yml` triggers on `v*.*.*` tags, matrix-builds `aarch64`/`x86_64`, imports an Apple Developer ID certificate, signs + notarizes, and uploads two DMGs to a GitHub Release.
- A Homebrew cask (`homebrew/cyoda-dev-console.rb`) plus a **manual** SHA step: after each release a human downloads both DMGs, runs `scripts/update-cask-sha.sh`, pastes hashes + version into the cask, tests, commits, and copies the cask into a separate tap repo. Error-prone; the cask is duplicated in-repo and in the tap.
- Windows / Linux: nothing — no bundle config, no CI, no docs.

A sibling project, **`cyoda-go`**, has already solved automated Homebrew publishing: GoReleaser computes every SHA256 and commits the regenerated formula directly to the tap, authored by a dedicated GitHub App (`cyoda-go-release-bot`) that mints a short-lived, tap-scoped installation token at runtime. We adopt that *automation pattern* (we cannot use GoReleaser itself — it is Go-specific; the Tauri analog is `tauri-apps/tauri-action`).

### Goals
1. One tag → one GitHub Release containing every platform's artifacts.
2. macOS distribution via a **consolidated, auto-updated** Homebrew tap — no manual SHA work.
3. Linux distribution via AppImage + a `curl | sh` convenience installer.
4. Windows: verified build-from-source (no published binaries, no signing cost).
5. Robust, maintainable, easy-to-understand CI that preserves the proven macOS signing/notarization path.

### Non-goals (YAGNI)
- No `.deb` / `.rpm`, no Linux GPG signing (checksums instead).
- No Windows published artifacts, no Windows code signing, no Windows arm64.
- No in-app auto-update (consistent with specs §5.3 — updates via package manager / re-run installer).
- No vanity install URL yet (raw GitHub URL; can front with a redirect later).

---

## 2. Decisions (locked during brainstorming)

| # | Decision | Choice |
|---|---|---|
| D1 | Win/Linux delivery surface | GitHub Releases download |
| D2 | Windows signing | None — build-from-source; market too small to justify cost |
| D3 | Windows scope | Bundle config + CI compile gate (no upload) + build-from-source docs |
| D4 | Linux format | AppImage only |
| D5 | Linux arch | **x86_64 AND arm64** (native `ubuntu-22.04-arm` runners; no QEMU) |
| D6 | Linux install UX | `curl \| sh` installer (minimal.dev pattern) over GitHub-Release AppImage |
| D7 | CI mechanism | Unify on `tauri-apps/tauri-action` + explicit cask-publish job |
| D8 | Cask publish | **Full auto-commit** to tap as `cyoda-go-release-bot`; skip prerelease tags |
| D9 | Tap | Consolidate into `Cyoda/homebrew-cyoda` (`Formula/` + `Casks/`); reuse existing bot App |

---

## 3. Architecture

`release.yml`, triggered by `v*.*.*` tags. Version source of truth = `apps/dev-console/src-tauri/tauri.conf.json`; the pushed tag must match. `tauri-action` handles build/sign/notarize/upload; an explicit job handles cask publishing.

### Jobs

| Job | Runner(s) | Output | Published? |
|---|---|---|---|
| `build-macos` | `macos-14` × {`aarch64-apple-darwin`, `x86_64-apple-darwin`} | signed + **notarized** `.dmg` ×2 | ✅ → Release |
| `build-linux` | `ubuntu-22.04` (x64) + `ubuntu-22.04-arm` (arm64) | `.AppImage` ×2 | ✅ → Release |
| `build-windows` | `windows-latest` | build only, **no upload** (compile gate) | ❌ |
| `checksums` | ubuntu (`needs:` macos, linux) | `SHA256SUMS` over all DMGs + AppImages | ✅ → Release, then un-draft |
| `publish-cask` | ubuntu (`needs:` checksums) | regenerated `Casks/cyoda-dev-console.rb` committed to tap | ✅ → tap |

- **Draft until complete:** `tauri-action` creates/uploads to a **draft** Release keyed by the tag; `checksums` attaches `SHA256SUMS` and un-drafts. Avoids users seeing a half-populated release and avoids parallel jobs racing to create it.
- **Ubuntu pinned to 22.04:** AppImage links the build host's glibc; building on the oldest supported runner maximizes the range of distros it runs on. `ubuntu-22.04-arm` is the native arm64 equivalent.

### Why tauri-action (D7)
It is the maintained, canonical multi-platform Tauri release tool — the Tauri analog of cyoda-go's GoReleaser. It natively does "one tag → one Release with each OS's artifacts," consumes the Apple `APPLE_*` env contract for signing/notarization, and avoids the `--target` cargo-passthrough quirk the current smoke workflow had to comment around. The one migration cost is re-validating notarization under its env vars (documented path). The existing macOS smoke build stays as a cheap guard.

---

## 4. macOS

- **Build/sign/notarize** via `tauri-action` with existing Apple secrets re-expressed as env:
  `APPLE_SIGNING_IDENTITY`, `APPLE_ID`, `APPLE_PASSWORD`, `APPLE_TEAM_ID`, `APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`. Two arch-specific signed + notarized DMGs (cask consumes both). Notarization is required — a `.app` in a cask is Gatekeeper-blocked without it (unlike cyoda-go's CLI, which needs none).
- **`publish-cask` job** (replaces all manual SHA work):
  1. `actions/create-github-app-token@v3` with `app-id: ${{ vars.HOMEBREW_TAP_APP_ID }}`, `private-key: ${{ secrets.HOMEBREW_TAP_APP_KEY }}`, `owner: Cyoda`, `repositories: homebrew-cyoda` → short-lived tap-scoped token.
  2. Read the two macOS DMG hashes from `SHA256SUMS`.
  3. Render `Casks/cyoda-dev-console.rb` from a template: `version` from the tag, `sha256 arm:/intel:` from the DMG hashes — keeping the cask's existing per-arch DSL (`arch arm:/intel:`, `app "Cyoda Dev Console.app"`, `zap`, `depends_on macos`).
  4. Commit + push to `Cyoda/homebrew-cyoda` as `cyoda-go-release-bot <noreply@cyoda.com>`, message `Cask update for cyoda-dev-console version vX.Y.Z`.
  5. **Skip on prerelease tags** (`-rc`, `-beta`, `-alpha`).
- **Removals:** delete `scripts/update-cask-sha.sh` and the in-repo `homebrew/cyoda-dev-console.rb` (the cask now lives only in the tap).

---

## 5. Homebrew tap consolidation

### Target structure — `Cyoda/homebrew-cyoda`
```
Formula/
  cyoda.rb               # cyoda-go (CLI formula)
Casks/
  cyoda-dev-console.rb   # this app (auto-committed here)
  cyoda-ops-console.rb   # future
README.md                # tap usage
```
- Passive metadata repo (no CI of its own), pushed into by each product's release pipeline — same model as today's `homebrew-cyoda-go`.
- Install: `brew install --cask cyoda/cyoda/cyoda-dev-console` (already what dev-console docs reference — no doc churn).
- **Reuse the existing `cyoda-go-release-bot` GitHub App** (do not mint a new one): install it on `Cyoda/homebrew-cyoda` with `Contents: read/write`. App-ID stored as repo **variable** `HOMEBREW_TAP_APP_ID`, private key as secret `HOMEBREW_TAP_APP_KEY` in the dev-console repo, mirroring cyoda-go.

### cyoda-go coordination (cross-repo — tracked, not done here)
The tap rename requires changes in the **`cyoda-go`** repo, which this project does not own. This spec includes a deliverable to **open a GitHub issue on `cyoda-go`** (see §8, T9) capturing:
- Retarget GoReleaser `brews:` `repository` from `homebrew-cyoda-go` → `homebrew-cyoda`, writing into `Formula/` (GoReleaser `directory: Formula`).
- For ≥1 release cycle, **dual-publish** (or keep the old tap updated) for backwards compatibility.
- Update cyoda-go README/tap install instructions to `cyoda/cyoda`.
- Confirm the `cyoda-go-release-bot` App is installed on the new tap and that App-ID/key vars/secrets resolve in cyoda-go's workflow.
- Note org-slug drift observed today (`Cyoda` vs `cyoda-platform`, root `cyoda.rb` vs `Formula/`) so the migration normalizes it.

---

## 6. Linux

- **Build:** add `bundle.linux` config; install Tauri Linux deps in-job (`webkit2gtk-4.1`, `libgtk-3-dev`, `libappindicator3-dev` / `libayatana-appindicator3-dev`, `librsvg2-dev`, `patchelf`, AppImage tooling). Emit `*.AppImage` for **x86_64 and arm64** on their respective native runners.
- **Convenience installer — `scripts/install.sh`**, run as:
  ```sh
  curl --proto '=https' --tlsv1.2 -fsSL \
    https://raw.githubusercontent.com/Cyoda-platform/cyoda-dev-console/staging/scripts/install.sh | sh
  ```
  Behavior:
  1. Verify OS = Linux; map `uname -m` → `x86_64` / `aarch64`; refuse anything else with a clear message.
  2. Resolve version: latest Release via GitHub API, or `VERSION=vX.Y.Z` env to pin.
  3. Download the matching AppImage **and** `SHA256SUMS`; verify the hash; abort on mismatch.
  4. Install to `~/.local/bin/cyoda-dev-console` (no sudo); `chmod +x`. Warn if `~/.local/bin` not on `PATH`.
  5. Write `~/.local/share/applications/cyoda-dev-console.desktop` + install an icon under `~/.local/share/icons/` for menu integration.
  6. Idempotent: re-running upgrades in place. Updates = re-run the one-liner (consistent with no-auto-update philosophy).
- Direct download of the `.AppImage` from the Releases page remains supported.

---

## 7. Windows

- Add `bundle.windows` config (NSIS + MSI) referencing the existing `icons/icon.ico`, so the bundle is well-formed for those building locally.
- `build-windows` job runs `tauri build` on `windows-latest` purely as a **compile/bundle gate** — uploads nothing — keeping build-from-source instructions honest.
- `RELEASE.md` gains a "Build from source on Windows" section: prereqs (Rust per `rust-toolchain.toml`, Node 22, pnpm, MSVC Build Tools), `pnpm install && pnpm -r build && pnpm --filter dev-console tauri:build`, and a note that the resulting unsigned `.exe`/installer triggers a SmartScreen "unknown publisher" warning (More info → Run anyway).

---

## 8. Deliverables / work breakdown

| # | Deliverable |
|---|---|
| T1 | `tauri.conf.json`: add `bundle.linux` and `bundle.windows`; confirm `bundle.targets` per-platform. |
| T2 | Rewrite `release.yml`: tauri-action matrix (`build-macos`, `build-linux` incl. arm64, `build-windows` gate), draft Release. |
| T3 | `checksums` job: aggregate `SHA256SUMS`, attach, un-draft Release. |
| T4 | `publish-cask` job: App-token mint → render cask template → commit to `Cyoda/homebrew-cyoda` as the bot; skip prereleases. |
| T5 | `Casks/cyoda-dev-console.rb` template (in-repo source of generation); delete `scripts/update-cask-sha.sh` and `homebrew/cyoda-dev-console.rb`. |
| T6 | `scripts/install.sh` Linux installer (arch detect, checksum verify, desktop entry, idempotent). |
| T7 | Add Linux build to `smoke.yml`; keep macOS smoke. |
| T8 | Docs: rewrite `RELEASE.md` (all platforms + automated tap + one-time App/secrets setup); update `README.md` install section. |
| T9 | **Open a GitHub issue on `cyoda-go`** for the tap rename/retarget coordination (§5). Capture the dual-publish cycle and bot-App install. |
| T10 | One-time infra (documented, manual): create `Cyoda/homebrew-cyoda` with `Formula/`+`Casks/`; install `cyoda-go-release-bot` App on it; add `HOMEBREW_TAP_APP_ID` var + `HOMEBREW_TAP_APP_KEY` secret to this repo. |

---

## 9. Testing / verification

- **CI-level:** a green tag run (3 published targets + Windows gate + checksums + cask commit) proves the pipeline. Linux added to smoke catches AppImage regressions on `staging` before tagging.
- **Manual checklist** (added to `RELEASE.md`):
  - macOS: cask installs from the tap on a clean account, both arches; app launches with no Gatekeeper warning; `spctl --assess` reports Notarized.
  - Linux (both arches): AppImage launches on clean Ubuntu; `install.sh` installs → working menu entry → second run upgrades cleanly; tampered file fails checksum and aborts.
  - Windows: build-from-source produces a launchable app.
  - Cask auto-commit lands in the tap with the bot author and correct per-arch SHAs; prerelease tag does **not** touch the tap.

---

## 10. Open risks

- **Notarization under tauri-action:** must be re-validated on first run; mitigation = test on a throwaway prerelease tag before a real release.
- **arm64 Linux runner availability:** `ubuntu-22.04-arm` is the named runner; confirm org access at implementation time, else fall back to x86_64-only with arm64 deferred (D5 reverts cleanly).
- **Cross-repo timing:** cyoda-go retarget (T9) must land (or dual-publish) before the old tap is retired, to avoid breaking existing `cyoda-go` users.
