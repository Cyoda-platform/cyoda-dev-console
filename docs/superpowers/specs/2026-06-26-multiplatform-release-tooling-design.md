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
| D10 | Publish gate | **Auto-publish on green** (match cyoda-go) — no manual approval; safety comes from the rehearsal stack (§3.1) |
| D11 | GitHub org | `Cyoda` is canonical; migrate repo + all generated URLs off legacy `Cyoda-platform` |

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

### 3.1 Release safety — avoiding one-shot releases

A tag binds to a commit, so the real `vX.Y.Z` tag must be cut only when the tooling is *already proven*, never as a first attempt. Safety is layered so the tag is the last, already-rehearsed step (mirrors and extends cyoda-go, which rehearses via GoReleaser `--snapshot` on PRs):

1. **`workflow_dispatch` dry-run** — manual "Run workflow" trigger on **any branch** that runs the full multi-platform build but **uploads nothing and commits nothing**. Unlimited, free, **no tag / no version consumed**. This is where pipeline/tooling bugs get fixed before any tag exists. Implemented as a `dry_run` input that skips the upload + `publish-cask` steps.
2. **Smoke on `staging`** — `smoke.yml` builds macOS (existing) and Linux (added) on every push, surfacing breakage between releases.
3. **Pre-release `-rc.N` tags** — build all platforms and publish a GitHub **pre-release** with real, installable artifacts, but **skip the tap** (D8). Cut `-rc.1`, `-rc.2`, … freely for real-world install testing without burning the final version or publishing Homebrew metadata.
4. **Real tag → draft Release** — `tauri-action` builds into a *draft*; each job is independently re-runnable, so a transient notarization flake is just a re-run of the same tag.
5. **Auto-publish on green (D10)** — `publish-cask` is the **last** job, `needs:` all builds + checksums. It only runs when everything is green, so a failed build **never** publishes a cask; a failed run spends no public version. No manual approval gate (matches cyoda-go).

Net flow: dry-run until green → (optional) rc tag for install testing → cut real tag → builds into draft → auto-publishes on green. No "must work first time" moment.

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

### Org migration (`Cyoda-platform` → `Cyoda`)
`Cyoda` is the canonical GitHub org; `Cyoda-platform` is legacy. All canonical references use `Cyoda/...`: repo `Cyoda/cyoda-dev-console`, tap `Cyoda/homebrew-cyoda`, the `install.sh` raw URL, and cask/release download URLs. GitHub auto-redirects old org paths, so existing links keep working during the shift, but generated artifacts (cask URLs, installer URL) must be authored against `Cyoda/` from the start. The historical `homebrew-cyoda-go` tap also used a flat `cyoda.rb`; the consolidated tap normalizes to `Formula/` + `Casks/`.

---

## 6. Linux

- **Build:** add `bundle.linux` config; install Tauri Linux deps in-job (`webkit2gtk-4.1`, `libgtk-3-dev`, `libappindicator3-dev` / `libayatana-appindicator3-dev`, `librsvg2-dev`, `patchelf`, AppImage tooling). Emit `*.AppImage` for **x86_64 and arm64** on their respective native runners.
- **Convenience installer — `scripts/install.sh`**, run as:
  ```sh
  curl --proto '=https' --tlsv1.2 -fsSL \
    https://raw.githubusercontent.com/Cyoda/cyoda-dev-console/staging/scripts/install.sh | sh
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
| T2 | Rewrite `release.yml`: tauri-action matrix (`build-macos`, `build-linux` incl. arm64, `build-windows` gate), draft Release. Add `workflow_dispatch` with a `dry_run` input (build-only; skip upload + `publish-cask`) per §3.1. Prerelease tags skip the tap. |
| T3 | `checksums` job: aggregate `SHA256SUMS`, attach, un-draft Release. |
| T4 | `publish-cask` job: App-token mint → render cask template → commit to `Cyoda/homebrew-cyoda` as the bot; skip prereleases. |
| T5 | `Casks/cyoda-dev-console.rb` template (in-repo source of generation); delete `scripts/update-cask-sha.sh` and `homebrew/cyoda-dev-console.rb`. |
| T6 | `scripts/install.sh` Linux installer (arch detect, checksum verify, desktop entry, idempotent). |
| T7 | Add Linux build to `smoke.yml`; keep macOS smoke. |
| T8 | Docs: rewrite `RELEASE.md` (all platforms + automated tap + one-time App/secrets setup); update `README.md` install section. |
| T9 | **Open a GitHub issue on `cyoda-go`** for the tap rename/retarget coordination (§5). Capture the dual-publish cycle and bot-App install. |
| T10 | One-time infra (documented, manual): create `Cyoda/homebrew-cyoda` with `Formula/`+`Casks/`; install `cyoda-go-release-bot` App on it; add `HOMEBREW_TAP_APP_ID` var + `HOMEBREW_TAP_APP_KEY` secret to this repo. |
| T11 | Org migration: move repo to `Cyoda/cyoda-dev-console`; author all generated URLs (cask, installer, release downloads) against `Cyoda/`; rely on GitHub redirects for legacy `Cyoda-platform` links. |

### 8.1 Sequencing — code first, infra gates only the real release

The code deliverables (T1–T8) are independent of the one-time infra/org actions (T9–T11) and can be built and **fully validated via `workflow_dispatch` dry-run** (§3.1) before the tap, bot App, secrets, or org move exist — dry-run uploads nothing and commits nothing, so it needs none of them.

Only **cutting a real release** is gated on infra:
- A real (or `-rc.N`) **tag** that uploads artifacts needs nothing extra — it just creates a GitHub Release on this repo.
- The **`publish-cask` job** is the only step that requires T10 (tap repo exists + `cyoda-go-release-bot` installed on it + `HOMEBREW_TAP_APP_ID`/`HOMEBREW_TAP_APP_KEY` present). Until then it is the only failing job; everything else (DMGs, AppImages, checksums) still publishes. The job must therefore **fail loudly with a clear "tap infra not provisioned" message** rather than silently skipping, so a misconfiguration is never mistaken for success.

Recommended order: T1–T8 (code, dry-run tested) → T10/T11 (infra + org) → T9 (cyoda-go coordination issue, can be filed in parallel) → first `-rc` tag → first real tag.

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

- **Notarization under tauri-action:** must be re-validated before first real release; mitigation = `workflow_dispatch` dry-run (no version) then a throwaway `-rc.N` tag (§3.1), both before cutting `vX.Y.Z`. Auto-publish (D10) is safe because a notarization failure fails `build-macos`, so `publish-cask` never runs.
- **arm64 Linux runner availability:** `ubuntu-22.04-arm` is the named runner; confirm org access at implementation time, else fall back to x86_64-only with arm64 deferred (D5 reverts cleanly).
- **Cross-repo timing:** cyoda-go retarget (T9) must land (or dual-publish) before the old tap is retired, to avoid breaking existing `cyoda-go` users.
