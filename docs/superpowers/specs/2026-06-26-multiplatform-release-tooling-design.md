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
| D12 | Artifact naming | Remove the spaces (the real bug) at upload via tauri-action `releaseAssetNamePattern: cyoda-dev-console_[version]_[arch].[ext]`. **Keep Tauri's native, format-specific arch tokens** — DMG `x86_64`/`aarch64`, AppImage `amd64`/`aarch64` — since the cask references only DMGs and the installer only AppImages; they need not share a token. No post-upload rename. |
| D13 | Bundle targets | Explicit per-platform: macOS `dmg`, Linux `appimage`, Windows `nsis`+`msi` — **not** `targets: "all"` (which leaks `.deb`/`.rpm`/`.app`) |

---

## 3. Architecture

`release.yml`, triggered by `v*.*.*` tags. Version source of truth = `apps/dev-console/src-tauri/tauri.conf.json`; the pushed tag must match. `tauri-action` handles build/sign/notarize/upload; an explicit job handles cask publishing.

### Jobs

| Job | Runner(s) | Output | Published? |
|---|---|---|---|
| `guard` | ubuntu | assert tag == `tauri.conf.json` version; fail loud on mismatch | — |
| `create-release` | ubuntu (`needs:` guard) | create **one** draft Release, output `release_id` | draft |
| `build-macos` | `macos-14` × {`aarch64-apple-darwin`, `x86_64-apple-darwin`} | signed + **notarized** `.dmg` ×2 | ✅ → Release |
| `build-linux` | `ubuntu-22.04` (x64) + `ubuntu-22.04-arm` (arm64) | `.AppImage` ×2 | ✅ → Release |
| `build-windows` | `windows-latest` | build only, **no upload** (compile gate) | ❌ |
| `checksums` | ubuntu (`needs:` macos, linux) | `SHA256SUMS` over all DMGs + AppImages; attach `install.sh` | ✅ → Release, then un-draft |
| `publish-cask` | ubuntu (`needs:` checksums) | validate notarization → regenerate `Casks/cyoda-dev-console.rb` → commit to tap | ✅ → tap |

- **Single draft, no race (B1 fix):** tauri-action's find-or-create-release step races when every matrix job runs it with the same `tagName` ([tauri-action#914](https://github.com/tauri-apps/tauri-action/issues/914)) — draft status does **not** prevent this. So a dedicated `create-release` job creates the draft once and outputs `release_id`; every build job passes `releaseId: ${{ needs.create-release.outputs.release_id }}` (never `tagName`). `checksums` attaches `SHA256SUMS` + `install.sh` and un-drafts.
- **Idempotent + serialized (M-B):** `create-release` must **find-or-create** (reuse an existing release for the tag) so a re-run of the same tag attaches to the same draft instead of creating a second one (GitHub allows multiple releases per tag). The workflow sets `concurrency: { group: release-${{ github.ref }}, cancel-in-progress: false }` so overlapping/closely-pushed tags don't run `create-release` in parallel and break the single-draft invariant. This is the one correctness property dry-run can't exercise, so it must be designed in, not discovered.
- **Release notes (M-A):** `create-release` populates the Release body via GitHub auto-generated notes (`generate_release_notes: true`) before un-drafting — otherwise every published release ships an empty body (a regression vs. cyoda-go's GoReleaser changelog). Auto-notes are commit/PR-based, so they're valid at creation even before artifacts exist. **Caveat (M-4):** `generate_release_notes` only fires on the create path; on a find-or-create *re-run* that **finds** an existing release, the body is not refreshed — so the find branch must explicitly PATCH the body (call the generate-notes API) if notes are missing. A `CHANGELOG`-driven body can replace this later.
- **Version guard normalization (Mi-4):** the `guard` job strips the leading `v` and any `-rc.N`/prerelease suffix from `github.ref_name` and asserts the base equals `.version` in `tauri.conf.json` (so `v0.2.0` **and** `v0.2.0-rc.1` both require config `0.2.0`). Fail loud on mismatch — dev-console bakes the version at build time, so a mismatch otherwise yields 404 cask/installer URLs.
- **Ubuntu pinned to 22.04:** AppImage links the build host's glibc; building on the oldest supported runner maximizes the range of distros it runs on. `ubuntu-22.04-arm` is the native arm64 equivalent (and the *only* non-QEMU arm path — linuxdeploy cannot cross-compile arm AppImages).

### 3.1 Release safety — avoiding one-shot releases

A tag binds to a commit, so the real `vX.Y.Z` tag must be cut only when the tooling is *already proven*, never as a first attempt. Safety is layered so the tag is the last, already-rehearsed step (mirrors and extends cyoda-go, which rehearses via GoReleaser `--snapshot` on PRs):

1. **`workflow_dispatch` dry-run** — manual "Run workflow" trigger on **any branch** that runs the full multi-platform build but **uploads nothing and commits nothing**. Unlimited, free, **no tag / no version consumed**. **Mechanism (M-1):** tauri-action has *no* dry-run flag — build-only is achieved by **not passing any release input** (`tagName`/`releaseName`/`releaseId` all omitted). So the `dry_run` path skips `create-release`/`checksums`/`publish-cask` entirely and the build jobs invoke tauri-action with no release params (optionally `uploadWorkflowArtifacts: true` to keep bundles for inspection). Do **not** model dry-run as "create the draft but skip upload."
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
- **Notarization-is-mandatory (M3, rationale corrected per Mi-1):** the official `Homebrew/homebrew-cask` removal of failing casks does **not** apply to a third-party tap like `Cyoda/homebrew-cyoda`. The operative change is Homebrew 5.0.0 (Nov 2025) **removing the `--no-quarantine` bypass** → Gatekeeper blocks an un-notarized `.app` on launch for cask users. Either way notarization is non-optional, and with auto-publish (D10) a silently-invalid staple would publish a broken cask. **`publish-cask` therefore validates the actual DMG first** (`spctl --assess --type install` / `xcrun stapler validate`) and aborts on failure — not relying on "`build-macos` didn't error." The §9 manual `spctl` check is too late (post-publish), so this gate moves into CI.
- **Artifact names — D12 (locked):** Tauri emits bundles using `productName` **verbatim** with **format-specific arch tokens** — DMG `Cyoda Dev Console_<v>_{x86_64,aarch64}.dmg` (spaces), AppImage `Cyoda Dev Console_<v>_{amd64,aarch64}.AppImage`. The spaces (not the arch tokens) are the real bug: the in-repo cask URL has **never** matched a real artifact, and spaces break `sha256sum -c` / installer lookup. **Fix: pass tauri-action `releaseAssetNamePattern: cyoda-dev-console_[version]_[arch].[ext]`** so assets upload space-free; `[arch]` keeps its native per-format value (DMG `x86_64`/`aarch64`, AppImage `amd64`/`aarch64`). **No post-upload rename** — the cask references only DMGs (tokens `x86_64`/`aarch64`, matching its existing `arch arm:/intel:` DSL with zero change) and the installer references only AppImages (tokens `amd64`/`aarch64`), so the two never need a shared token. `SHA256SUMS` is generated over the actual uploaded (space-free) filenames.
- **`publish-cask` job** (replaces all manual SHA work):
  1. `actions/create-github-app-token@v3` with **exactly cyoda-go's proven references** — `app-id: ${{ vars.HOMEBREW_TAP_APP_ID }}` (a repo **variable**, App-ID isn't sensitive), `private-key: ${{ secrets.HOMEBREW_TAP_APP_KEY }}` (secret), `owner: cyoda` (lowercase — the actual slug cyoda-go's workflow uses; don't assume case-insensitivity), `repositories: homebrew-cyoda` → short-lived tap-scoped token. (The GitHub **App** is the existing `cyoda-platform-release-bot`; `cyoda-go-release-bot` is only the *commit-author* string — see §5. Verify the exact installed App at T10.)
  2. Validate notarization (above); read the two macOS DMG hashes from `SHA256SUMS`.
  3. Render `Casks/cyoda-dev-console.rb` from a template: `version` from the tag, `sha256 arm:/intel:` from the DMG hashes, `url` from the canonical scheme (D12) — per-arch DSL (`arch arm:/intel:`, `app "Cyoda Dev Console.app"`, `zap`). DSL verified current/valid. The template must keep `depends_on macos: ">= :monterey"` **coupled to** `tauri.conf.json` `bundle.macOS.minimumSystemVersion` (12.0 = Monterey) so the two can't silently diverge (Mi-6).
  4. Commit + push to `Cyoda/homebrew-cyoda` as `cyoda-go-release-bot <noreply@cyoda.com>` (commit-author string, matching cyoda-go's tap history), message `Cask update for cyoda-dev-console version vX.Y.Z`.
  5. **Skip on any prerelease tag** — match the presence of a `-` suffix (catches `-rc`, `-beta`, `-pre`, …). Functionally equivalent to cyoda-go's GoReleaser `skip_upload: auto` semver prerelease detection (not the identical mechanism).
- **First-publish bootstrap:** on the very first cask push the `Casks/` dir may not yet exist; the job must create it (and tolerate an empty/just-created tap) rather than assuming a path.
- **Removals:** delete `scripts/update-cask-sha.sh` and the in-repo `homebrew/cyoda-dev-console.rb` (the cask now lives only in the tap; `RELEASE.md` rewritten in lockstep — T8).

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
- **Reuse the existing release-bot GitHub App** (do not mint a new one). Per cyoda-go's `MAINTAINING.md`, the App is registered as **`cyoda-platform-release-bot`** (the `cyoda-go-release-bot <noreply@cyoda.com>` string is only the *commit author*, not the App — these were conflated in earlier drafts). Install that App **additionally** on `Cyoda/homebrew-cyoda` with `Contents: read/write` (scope to the tap repo only — not org-wide). Store App-ID as repo **variable** `vars.HOMEBREW_TAP_APP_ID` and the private key as secret `secrets.HOMEBREW_TAP_APP_KEY` — matching cyoda-go's *executable* `release.yml` (its prose MAINTAINING.md says "secret" for the ID, but the working workflow reads `vars.`; follow the code, not the doc). **Verify** the real App name/ID at T10.
- **Same-account assumption:** `Cyoda` and `cyoda` are the *same* GitHub account (org slugs are case-insensitive), so one App installation can mint tokens for both the legacy and new tap repos. Confirm at T10 that the tap repo and the App live under the same account, or the cross-repo token mint fails only at real-release time.

### cyoda-go coordination (cross-repo — tracked, not done here)
The tap rename requires changes in the **`cyoda-go`** repo, which this project does not own. This spec includes a deliverable to **open a GitHub issue on `cyoda-go`** (see §8, T9) capturing:
- Retarget GoReleaser `brews:` `repository` from `homebrew-cyoda-go` → `homebrew-cyoda`, writing into `Formula/` (GoReleaser `directory: Formula`).
- For ≥1 release cycle, **dual-publish** (or keep the old tap updated) for backwards compatibility.
- Update cyoda-go README/tap install instructions to `cyoda/cyoda`.
- Confirm the release-bot App (`cyoda-platform-release-bot`) is installed on the new tap and that the App-ID/key secrets resolve in cyoda-go's workflow.

### Org migration (`Cyoda-platform` → `Cyoda`)
`Cyoda` is the canonical GitHub org; `Cyoda-platform` is legacy. All canonical references use `Cyoda/...`: repo `Cyoda/cyoda-dev-console`, tap `Cyoda/homebrew-cyoda`, the `install.sh` raw URL, and cask/release download URLs. GitHub auto-redirects old org paths, so existing links keep working during the shift, but generated artifacts (cask URLs, installer URL) must be authored against `Cyoda/` from the start. The historical `homebrew-cyoda-go` tap also used a flat `cyoda.rb`; the consolidated tap normalizes to `Formula/` + `Casks/`.

---

## 6. Linux

- **Build:** add `bundle.linux` config; install Tauri Linux deps in-job — `webkit2gtk-4.1`, `libgtk-3-dev`, **`libayatana-appindicator3-dev`** (the maintained replacement; the old `libappindicator3-dev` is dropped on current toolchains — do not list both), `librsvg2-dev`, `patchelf`, plus AppImage tooling. No `libssl-dev` needed: `reqwest` uses `rustls-tls` (Cargo.toml), so there is no system-OpenSSL dependency. Emit `*.AppImage` for **x86_64 and arm64** on their respective native runners.
- **arm64 AppImage caveat (M2):** linuxdeploy/AppImage tooling on arm64 has known FUSE issues in CI; document the `APPIMAGE_EXTRACT_AND_RUN=1` (and `NO_STRIP=1` if needed) escape hatch in the job up front rather than discovering it live.
- **Monorepo build ordering (m2):** every build job must build the **workspace packages** **before** the app — `beforeBuildCommand` only runs the app's own `pnpm build` (vite), not the deps it consumes from their gitignored `dist/`. Use `pnpm --filter './packages/*' build` (deps only) rather than a blanket `pnpm -r build`, which redundantly runs the app's vite build a second time before tauri-action's `beforeBuildCommand` does it again (Mi-5). Note: existing `smoke.yml`/`ci.yml` use `pnpm -r build` (builds *all* packages incl. the app, not "deps first") — T7 should align smoke to the deps-only form.
- **Convenience installer — `scripts/install.sh`**, published as a **per-release asset** (M4) so the canonical URL is version-pinned, not a moving branch (this is the lesson cyoda-go already adopted — never `curl|sh` off a branch):
  ```sh
  curl --proto '=https' --tlsv1.2 -fsSL \
    https://github.com/Cyoda/cyoda-dev-console/releases/latest/download/install.sh | sh
  ```
  Behavior:
  1. Verify OS = Linux; map `uname -m` to the **AppImage** arch token (D12 keeps native tokens): `x86_64`/`amd64` → `amd64`, `aarch64`/`arm64` → `aarch64`; refuse anything else with a clear message. **This is the B-1 trap: AppImages use `amd64`, not `x86_64`** — so the installer must map to AppImage tokens, distinct from the DMG/cask `x86_64` token.
  2. Resolve version: latest Release via GitHub API, or `VERSION=vX.Y.Z` env to pin.
  3. Download the matching AppImage **and** `SHA256SUMS`; verify with `sha256sum -c` against the canonical no-space filename (D12); abort on mismatch.
  4. Install to `~/.local/bin/cyoda-dev-console` (no sudo); `chmod +x`. Warn if `~/.local/bin` not on `PATH`.
  5. Write `~/.local/share/applications/cyoda-dev-console.desktop` (with `Exec=~/.local/bin/cyoda-dev-console`) + install a **known icon shipped in the installer/repo** (`src-tauri/icons/128x128.png`) under `~/.local/share/icons/` — do not rely on extracting the AppImage's `.DirIcon`.
  6. Idempotent: re-running upgrades in place. Updates = re-run the one-liner (consistent with no-auto-update philosophy).
- Direct download of the `.AppImage` from the Releases page remains supported.

---

## 7. Windows

- Add `bundle.windows` config (NSIS + MSI) referencing the existing `icons/icon.ico`, so the bundle is well-formed for those building locally.
- `build-windows` job runs `tauri build` on `windows-latest` purely as a **compile/bundle gate** — uploads nothing — keeping build-from-source instructions honest. Scope it honestly (M5): it catches *compile/bundle* breakage only (MSVC build, `icon.ico` + NSIS/MSI config well-formedness, Windows `cfg` paths), not runtime. For a Tauri app the Rust surface is small, so its main value is proving the Windows bundle config stays valid — worth keeping, not oversold.
- `RELEASE.md` gains a "Build from source on Windows" section: prereqs (Rust per `rust-toolchain.toml`, Node 22, pnpm, MSVC Build Tools), `pnpm install && pnpm -r build && pnpm --filter dev-console tauri:build`, and a note that the resulting unsigned `.exe`/installer triggers a SmartScreen "unknown publisher" warning (More info → Run anyway).

---

## 8. Deliverables / work breakdown

| # | Deliverable |
|---|---|
| T1 | `tauri.conf.json`: add `bundle.linux` and `bundle.windows`; **remove `targets: "all"`** and pass tauri-action `--bundles` per matrix leg (D13: macOS `dmg`, Linux `appimage`, Windows `nsis`+`msi`) — defense in depth: config no longer defaults to `all` *and* each leg is explicit, so a forgotten `--bundles` can't leak `.deb`/`.rpm`/`.app`. Clean up placeholder `Cargo.toml` metadata: `name = "app"`, `authors = ["you"]`, empty `license`/`repository`, **and stale `rust-version = "1.77.2"`** (align to toolchain 1.96.0 or drop) (M-5). |
| T2 | Rewrite `release.yml`: top-level `concurrency: release-${{ github.ref }}` (**M-B**); `guard` (normalized tag == `tauri.conf.json` version, fail loud — **M1/Mi-4**) → `create-release` (**find-or-create** single draft + `generate_release_notes`, `release_id` output — **B1/M-A/M-B**) → build matrix (`build-macos`, `build-linux` incl. arm64, `build-windows` gate) all using `releaseId` not `tagName`; each job builds workspace deps first via `pnpm --filter './packages/*' build` (**m2/Mi-5**). Add `workflow_dispatch` `dry_run` input that **fully skips release lookup/upload + `publish-cask`** (not merely `releaseDraft:true` — **n4**). Skip tap on any `-` prerelease tag. Pin token-mint + tap-push actions to full commit SHAs (**Mi-3**). |
| T3 | Space-free asset names come from tauri-action `releaseAssetNamePattern` at **upload** time (D12) — *not* a post-upload rename. `checksums` job: build `SHA256SUMS` over the uploaded filenames, attach it **and `install.sh`** to the Release, assert no leaked extensions (D13), un-draft. |
| T4 | `publish-cask` job: **validate notarization** (`spctl`/`stapler`, **M3**) → App-token mint → render cask template against the canonical artifact URLs (**B2**) → commit to `Cyoda/homebrew-cyoda` as the bot; skip prereleases. |
| T5 | `Casks/cyoda-dev-console.rb` template (in-repo source of generation) — URLs derived from one canonical artifact-name scheme (**B2**); delete `scripts/update-cask-sha.sh` and `homebrew/cyoda-dev-console.rb`. |
| T6 | `scripts/install.sh` Linux installer (arch detect, checksum verify, `.desktop` + repo-shipped icon, idempotent); published as a per-release asset (**M4**). |
| T7 | Add Linux build to `smoke.yml`; keep macOS smoke; align smoke's `pnpm -r build` to the deps-only `pnpm --filter './packages/*' build` form (M-6). |
| T8 | Docs: rewrite `RELEASE.md` (all platforms + automated tap + one-time App/secrets setup); update `README.md` install section; **sweep `AGENTS.md`** §Distribution (drifts to bare `brew install --cask cyoda-dev-console` / "two separate casks") to the tap-qualified `cyoda/cyoda/...` form (**N-4**). |
| T9 | **Open a GitHub issue on `cyoda-go`** for the tap rename/retarget coordination (§5). Capture the dual-publish cycle and bot-App install. |
| T10 | One-time infra (documented, manual): **verify the real release-bot App name/ID** (cyoda-go docs say `cyoda-platform-release-bot`); create `Cyoda/homebrew-cyoda` with `Formula/`+`Casks/`; install that App on it (`Contents: read/write`, tap-repo-scoped); confirm tap + App share the `cyoda` account (use lowercase `owner: cyoda` as cyoda-go's workflow does, don't rely on case-insensitivity — M-2); add `HOMEBREW_TAP_APP_ID` as a repo **variable** and `HOMEBREW_TAP_APP_KEY` as a **secret** to this repo (matching cyoda-go's executable workflow — M-3). |
| T11 | Org migration: move repo to `Cyoda/cyoda-dev-console`; author all generated URLs (cask, installer, release downloads) against `Cyoda/`; rely on GitHub redirects for legacy `Cyoda-platform` links. |

### 8.1 Sequencing — code first, infra gates only the real release

The code deliverables (T1–T8) are independent of the one-time infra/org actions (T9–T11) and can be built and **fully validated via `workflow_dispatch` dry-run** (§3.1) before the tap, bot App, secrets, or org move exist — dry-run uploads nothing and commits nothing, so it needs none of them.

Only **cutting a real release** is gated on infra:
- A real (or `-rc.N`) **tag** that uploads artifacts needs nothing extra — it just creates a GitHub Release on this repo.
- The **`publish-cask` job** is the only step that requires T10 (tap repo exists + the `cyoda-platform-release-bot` App installed on it + `vars.HOMEBREW_TAP_APP_ID`/`secrets.HOMEBREW_TAP_APP_KEY` present). Until then it is the only failing job; everything else (DMGs, AppImages, checksums) still publishes. The job must therefore **fail loudly with a clear "tap infra not provisioned" message** rather than silently skipping, so a misconfiguration is never mistaken for success.

Recommended order: T1–T8 (code, dry-run tested) → T10/T11 (infra + org) → T9 (cyoda-go coordination issue, can be filed in parallel) → first `-rc` tag → first real tag.

---

## 9. Testing / verification

- **CI-level:** a green tag run (3 published targets + Windows gate + checksums + cask commit) proves the pipeline. Linux added to smoke catches AppImage regressions on `staging` before tagging. The `checksums` job asserts the Release carries **only** the intended asset extensions (`.dmg`, `.AppImage`, `SHA256SUMS`, `install.sh`) — failing if a `.deb`/`.rpm`/`.app` leaks (D13 guard) — and `create-release` produced a non-empty body (M-A).
- **Manual checklist** (added to `RELEASE.md`):
  - macOS: cask installs from the tap on a clean account, both arches; app launches with no Gatekeeper warning; `spctl --assess` reports Notarized.
  - Linux (both arches): AppImage launches on clean Ubuntu; `install.sh` installs → working menu entry → second run upgrades cleanly; tampered file fails checksum and aborts.
  - Windows: build-from-source produces a launchable app.
  - Cask auto-commit lands in the tap with the bot author and correct per-arch SHAs; prerelease tag does **not** touch the tap.

---

## 10. Open risks

- **Notarization under tauri-action:** must be re-validated before first real release; mitigation = `workflow_dispatch` dry-run (no version) then a throwaway `-rc.N` tag (§3.1), both before cutting `vX.Y.Z`. Auto-publish (D10) is safe because a notarization failure fails `build-macos`, so `publish-cask` never runs.
- **arm64 Linux — AppImage tooling, not runner availability, is the real risk (M2):** `ubuntu-22.04-arm` is GA (public repos free since Aug 2025; private since Jan 2026), so the runner is not in doubt. The residual risk is linuxdeploy/AppImage FUSE behavior on arm64 in CI — mitigated by the documented `APPIMAGE_EXTRACT_AND_RUN=1` escape hatch; if it proves intractable, fall back to x86_64-only with arm64 deferred (D5 reverts cleanly).
- **Cross-repo timing:** cyoda-go retarget (T9) must land (or dual-publish) before the old tap is retired, to avoid breaking existing `cyoda-go` users.
