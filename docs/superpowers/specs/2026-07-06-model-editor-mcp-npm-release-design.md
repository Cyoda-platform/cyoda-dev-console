# model-editor-mcp npm release (+ coordinated release of both artifacts) — design

Date: 2026-07-06
Status: Approved (brainstorming), pending spec review
Scope: Publish `apps/model-editor-mcp` to public npm as `@cyoda/model-editor-mcp` so external developers can install it into any AI CLI (Claude Code et al.) via `npx`; and define how a coordinated "release event" cuts **both** the desktop `dev-console` and the MCP together while keeping their versions and triggers independent.

Related: [`2026-06-26-multiplatform-release-tooling-design.md`](./2026-06-26-multiplatform-release-tooling-design.md) (the desktop pipeline this builds alongside), `RELEASE.md`, `docs/release-infra-runbook.md`.

---

## 1. Purpose & context

The repo ships **two** artifacts, today at very different maturity:

- **`dev-console`** — Tauri desktop app. **Fully piped:** `.github/workflows/release.yml` on `v*.*.*` tags → notarized macOS DMG (Homebrew cask in `cyoda/homebrew-cyoda`), Linux AppImage (GitHub Releases + `curl|sh`), Windows build-from-source. Not functional for macOS until the Apple secrets are provisioned (§9); no code work remains.
- **`model-editor-mcp`** — Node MCP server (hand-rolled MCP protocol over stdio; no `@modelcontextprotocol/sdk`). Serves the Vite-built editor (`web/dist`) as static files at a deterministic loopback URL and drives it over SSE. **No external distribution story at all:** `"private": true`, no version, depends on unpublished `workspace:*` packages, and the only documented install is *build inside this monorepo + `cp .mcp.json.example .mcp.json`*. An outside developer cannot install it.

**Why the workspace-dep problem is new:** `dev-console` depends on the same internal packages and ships fine because Tauri/Vite **compile them into the app bundle** — nothing is published. The MCP is the *first* artifact shipped **as an npm package**, so "what about the unpublished workspace deps" arises here for the first time.

### Goals
1. `npx @cyoda/model-editor-mcp` works in any repo with Node present (Claude Code requires Node, so this is a safe assumption — no standalone binary needed).
2. One new **public** package on npm under `@cyoda` (same channel/namespace as the `@cyoda/workflow-*` packages it consumes); nothing internal leaked.
3. Independent version + trigger for the MCP (`mcp-v*` tags), with a documented **coordinated release** procedure that cuts both artifacts together.
4. Consumer-visible **provenance** (verified-build attestation), matching the `@cyoda/workflow-*` packages.
5. Reuse existing, proven org patterns (auth wiring, monorepo build ordering, rehearsal-before-tag) rather than invent new ceremony.

### Non-goals (YAGNI)
- No standalone binary / Docker image for the MCP (Node is guaranteed on the consumer's machine).
- No publishing of the internal `workspace:*` packages (`agent-bridge-contract`, `workflow-editor-host`, `workflow-file-indexer`) — they are `0.0.0` internal glue with no external audience; they get **bundled in**, not published (D3).
- No Changesets machinery in this repo (it exists to coordinate *many* interdependent public packages, e.g. cyoda-workflow-editor's ~7; here there is exactly **one** publishable package — D5).
- No OIDC trusted publishing **yet** — bootstrap with `NPM_TOKEN`; OIDC is a later hardening (§11, D7).
- No in-app auto-update / no locking the two artifacts to a single shared version (D4).
- No changes to the desktop `release.yml` (it works; touching it is needless risk).

---

## 2. Decisions (locked during brainstorming)

| # | Decision | Choice |
|---|---|---|
| D1 | MCP audience | **Public** — external app developers, public npm |
| D2 | Install mechanism | `npx @cyoda/model-editor-mcp` in the consumer's `.mcp.json` (assumes Node; no binary) |
| D3 | Packaging | **Approach A — one self-contained bundled package.** esbuild inlines all `@cyoda/*` (workspace + public) + `zod` into a single `dist/index.js`; `web/dist` ships alongside; empty runtime `dependencies`. Exactly one new public package; instant `npx`; no internal packages leaked. |
| D4 | Version coupling | **Independent** versions & cadence. The MCP can also ship alone (MCP-only patch without a desktop rebuild/notarization). |
| D5 | Release trigger | **`mcp-v*` git tag** → `release-mcp.yml`. Same *ceremony* as the desktop (`bump manifest → push tag → guard → publish`), distinct *prefix* so the two triggers on one git history never collide. Not Changesets. |
| D6 | Auth | **`NPM_TOKEN`** (granular, `@cyoda`-scoped, write) exposed as `NODE_AUTH_TOKEN`, mirroring `cyoda-workflow-editor` exactly. |
| D7 | Provenance | **On from day one**, declared in the manifest via `"publishConfig": { "access": "public", "provenance": true }` + job `id-token: write` — byte-identical to every `@cyoda/workflow-*` package. Independent of the auth method. |
| D8 | Package name | **`@cyoda/model-editor-mcp`** (scoped, namespace-consistent). Bin command stays the short `model-editor-mcp`. |
| D9 | Prerelease semantics | npm-native: package.json version literally carries the prerelease (`0.1.0-rc.1`); such versions publish under the **`next`** dist-tag; stable → `latest`. (Diverges from the desktop's suffix-stripping guard — npm versions are immutable, §5.3.) |
| D10 | Coordinated release | Independent triggers, coordinated *event*: a release pushes **both** `vX.Y.Z` (desktop) and `mcp-vA.B.C` (MCP); the two workflows run independently. Documented procedure; optional one-click orchestrator deferred (§11). |

---

## 3. Architecture

Two independent release workflows on one repo, coordinated by procedure:

| Artifact | Trigger | Workflow | Channel | Version source of truth |
|---|---|---|---|---|
| dev-console (unchanged) | `v*.*.*` | `release.yml` | GitHub Release + Homebrew cask | `apps/dev-console/src-tauri/tauri.conf.json` `.version` |
| model-editor-mcp (new) | `mcp-v*.*.*` | `release-mcp.yml` | public npm `@cyoda` | `apps/model-editor-mcp/package.json` `.version` |

**Non-collision (proven):** `release.yml` triggers on `v*.*.*`; `mcp-v0.1.0` does not start with `v`, so it never matches. `release-mcp.yml` triggers only on `mcp-v*.*.*`. Each tag fires exactly one workflow.

### 3.1 Packaging (D3 — Approach A)

The published package is self-contained:
- **Server** → a single bundled ESM file `dist/index.js` with a `#!/usr/bin/env node` shebang. esbuild inlines the three unpublished workspace deps (`@cyoda/agent-bridge-contract`, `@cyoda/workflow-editor-host`, `@cyoda/workflow-file-indexer`), the public `@cyoda/workflow-{core,graph,layout}`, and `zod`. Node built-ins stay external (automatic for `platform: node`).
- **Web UI** → `web/dist`, already self-contained from Vite (React, monaco, reactflow, `@cyoda/workflow-react`, `console-design-system` all bundled by Vite). Shipped as static assets; served by the server.
- **Published `dependencies`: empty.** Everything is either bundled (server) or pre-built (web).

**web/dist path resolution is unchanged.** The server computes `distDir = join(dirname(fileURLToPath(import.meta.url)), "..", "web", "dist")` (`server/index.ts:178`). With `files: ["dist", "web/dist"]`, the published package root holds both `dist/index.js` and `web/dist/`, so `../web/dist` resolves correctly — bundled or not. esbuild in ESM mode preserves `import.meta.url`, so this and the "am I the entry module" auto-start guard (`server/index.ts:262`) both keep working. **No server source changes required.**

### 3.2 Release workflow — `release-mcp.yml`

```
on: push: tags ['mcp-v*.*.*'];  workflow_dispatch: {}   # rehearsal, never publishes
permissions: { contents: read, id-token: write }        # id-token for provenance
concurrency: { group: release-mcp-${{ github.ref }}, cancel-in-progress: false }
```

| Job | Runner | Does | Publishes? |
|---|---|---|---|
| `guard` (push only) | ubuntu | `check-mcp-release-version.sh` — tag base == package.json `version` (§5.3) | — |
| `publish` (push) / `pack` (dispatch) | ubuntu | install → build workspace deps → build+bundle MCP → **publish** (push) or **`npm pack` + assert tarball shape** (dispatch) | npm (push only) |

`publish` steps (mirrors `cyoda-workflow-editor`'s auth wiring):
```yaml
- uses: actions/checkout@v7
- uses: pnpm/action-setup@v6
- uses: actions/setup-node@v6
  with: { node-version: 22, cache: pnpm, registry-url: https://registry.npmjs.org }
- run: pnpm install --frozen-lockfile
- run: pnpm --filter './packages/*' build            # deps first — esbuild resolves their built dist/
- run: pnpm --filter @cyoda/model-editor-mcp build    # tsc typecheck + esbuild bundle + vite web build
# push → publish; dispatch → pack-only (see §3.3)
- run: pnpm --filter @cyoda/model-editor-mcp publish --no-git-checks ${DIST_TAG:+--tag "$DIST_TAG"}
  env:
    NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```
`DIST_TAG` = `next` when the version contains `-` (prerelease), else unset (defaults to `latest`) — D9.

**Monorepo build ordering (from the desktop spec's m2/Mi-5):** `pnpm --filter './packages/*' build` builds workspace deps into their gitignored `dist/` *before* the MCP build, because esbuild resolves those deps through their built `main`/`exports`. Never a blanket `pnpm -r build`.

### 3.3 Release safety — rehearse before the tag

npm versions are **permanent and immutable** — a burned version cannot be re-published. That makes the pre-tag rehearsal even more important than for the (re-runnable, draft-based) desktop release. Layers:

1. **`workflow_dispatch` rehearsal (primary):** builds + bundles + `npm pack`, **publishes nothing, consumes no version**. Asserts the packed tarball is correct: `dist/index.js` present **with shebang**, `web/dist/` present, runtime `dependencies` **empty**, and **no `workspace:*` / `link:` specifiers** survive in the packed `package.json`. Unlimited, free.
2. **`staging` smoke:** extend `smoke.yml` to `pnpm --filter @cyoda/model-editor-mcp build` + `npm pack` (no publish) so packaging breakage surfaces between releases. The existing Playwright render e2e already guards the web bundle.
3. **Real prerelease (`mcp-v0.1.0-rc.1`, optional):** with package.json at `0.1.0-rc.1`, publishes a real, installable `0.1.0-rc.1` to the **`next`** dist-tag — `npx @cyoda/model-editor-mcp` (which resolves `latest`) is unaffected; testers opt in with `@next`. Each npm version is unique, so an rc never blocks the final.
4. **Real tag (`mcp-v0.1.0`):** publishes `0.1.0` to `latest`. `guard` fails loud on any tag/manifest mismatch before the immutable publish.

### 3.4 Coordinated release of both artifacts (D10)

A "release" is an **event**, not a single trigger. To cut both:
1. Bump `apps/dev-console/src-tauri/tauri.conf.json` `.version` and `apps/model-editor-mcp/package.json` `.version` (each on its own SemVer line — they need not match), commit.
2. Push **both** tags: `git push origin vX.Y.Z mcp-vA.B.C`.
3. `release.yml` and `release-mcp.yml` run **independently and in parallel**; neither depends on the other. A failure in one does not roll back the other (npm publish and a GitHub Release/cask are not a distributed transaction — accepted, documented).

This preserves D4: an MCP-only patch is just a lone `mcp-v*` tag; a desktop-only fix is a lone `v*` tag. The coordinated first public release additionally requires the desktop's Apple secrets to be provisioned (§9) — the MCP half has no such dependency and could ship first if desired.

---

## 4. Package manifest changes (`apps/model-editor-mcp/package.json`)

- Remove `"private": true`.
- Rename `"model-editor-mcp"` → **`"@cyoda/model-editor-mcp"`**.
- Add `"version"` (real SemVer; first release `0.1.0`, or `0.1.0-rc.1` to rehearse-publish).
- Add `"bin": { "model-editor-mcp": "./dist/index.js" }` (short CLI name; enables `npx`).
- Add `"files": ["dist", "web/dist", "README.md"]`.
- Add `"engines": { "node": ">=22" }`.
- Add `"publishConfig": { "access": "public", "provenance": true }` (D7).
- **Runtime `dependencies` → `{}`**; move every current dep to `devDependencies` (build-time only: the `@cyoda/*` libs, `zod`, and all React/monaco/reactflow web deps). Keep `type: "module"`.
- Add `esbuild` to `devDependencies` (currently only transitive via Vite; make it explicit).

**Ripple — the scope rename touches `pnpm --filter` references** (`--filter model-editor-mcp` no longer matches a scoped name; use `--filter @cyoda/model-editor-mcp`):
- root `package.json` scripts (if any reference it), `apps/model-editor-mcp/README.md` (Develop/Register sections), `AGENTS.md`, `.github/workflows/*` that filter it, and any docs. Grep `--filter model-editor-mcp` and `filter.*model-editor-mcp` across the repo and update each. (The bin/command name `model-editor-mcp` is unchanged, so consumer-facing CLI text stays.)

---

## 5. Build & bundle (`apps/model-editor-mcp`)

### 5.1 Build script
Current: `"build": "tsc -p tsconfig.build.json && vite build --config web/vite.config.ts"` (per-file `tsc` emit).
New: `"build": "tsc --noEmit && node scripts/bundle-server.mjs && vite build --config web/vite.config.ts"`.
- `tsc --noEmit` keeps full type-checking (we lose nothing by not emitting from tsc).
- **`apps/model-editor-mcp/scripts/bundle-server.mjs`** (app-local — the build runs with CWD = the app dir, so `scripts/` here is app-relative, distinct from the **repo-root** `scripts/` that holds the release guards in §5.3) runs esbuild:
  - `entryPoints: ["server/index.ts"]`, `outfile: "dist/index.js"`, `bundle: true`, `platform: "node"`, `format: "esm"`, `target: "node22"`, `sourcemap: true`, `banner: { js: "#!/usr/bin/env node" }`.
  - Bundles all `@cyoda/*` + `zod` (nothing marked external except Node built-ins, which `platform: node` externalizes automatically).
  - `chmod +x dist/index.js` after write (so the `bin` is executable when unpacked).
- The old standalone `tsconfig.build.json` emit path is removed (or repurposed for `--noEmit`); `typecheck` script stays as `tsc --noEmit`.

### 5.2 Version single-source-of-truth
`server/version.ts` currently hardcodes `SERVER_VERSION = "0.1.0"`; this is the version reported in the MCP `initialize` handshake. Make **package.json `version`** authoritative: the bundle step injects it (esbuild `define`, e.g. `define: { __MCP_SERVER_VERSION__: JSON.stringify(pkg.version) }`, with `version.ts` referencing the define). Prevents the handshake version drifting from the published version.

### 5.3 Version guard — `scripts/check-mcp-release-version.sh`
Sibling of `scripts/check-release-version.sh`, but:
- strips the **`mcp-v`** prefix (not just `v`), and
- **does NOT strip the prerelease suffix** — compares the full remainder (`0.1.0-rc.1`) to package.json `.version`, because npm versions are immutable and each tag maps to a unique published version (D9). Reads `.version` via `jq` from `apps/model-editor-mcp/package.json`.
```
base="${tag#mcp-v}"            # mcp-v0.1.0-rc.1 -> 0.1.0-rc.1   (suffix kept)
base="${base%%+*}"             # drop +build metadata only
[[ "$base" == "$(jq -r .version "$pkg")" ]] || fail
```
A dedicated sibling (not a generalization of the desktop script) keeps the release-critical desktop guard untouched.

---

## 6. Auth & provenance (D6/D7)

Mirrors `cyoda-workflow-editor` exactly so the two npm publishers are consistent:
- Secret **`NPM_TOKEN`** (granular, `@cyoda`-scoped, read+write) in the **cyoda-dev-console** repo.
- Consumed as **`NODE_AUTH_TOKEN`** on the publish step; `actions/setup-node` with `registry-url: https://registry.npmjs.org` writes the `.npmrc` that reads it.
- Provenance from `publishConfig.provenance: true` + job `permissions: id-token: write` — no CLI flag. Consumer-visible as npm's "built and signed on GitHub Actions" panel linking commit + workflow run.
- **pnpm-publish caveat:** if `pnpm publish` mis-emits provenance, fall back to `npm publish` for this single package (the tarball is already built; `npm publish dist-tarball` from the package dir). pnpm 10 is expected to support it, so start with `pnpm publish`.

Provisioning steps for `NPM_TOKEN` are the operator runbook in §9.

---

## 7. Consumer install UX + docs

External consumer `.mcp.json`:
```jsonc
{ "mcpServers": { "model-editor": {
  "command": "npx",
  "args": ["-y", "@cyoda/model-editor-mcp", "--project", ".",
           "--workflow-globs", "models/workflow/**/*.json",
           "--entity-globs",   "models/schema/**/*.json"] } } }
```
or `claude mcp add model-editor -- npx -y @cyoda/model-editor-mcp --project . …`.

Doc updates:
- `apps/model-editor-mcp/README.md` "Register with Claude Code": lead with the `npx` (consumer) form; keep the local `node dist/index.js` form clearly labelled **contributor / monorepo dev**.
- `.mcp.json.example`: add the published (`npx`) variant alongside the existing local one (or split into `.mcp.json.example` = consumer, and a contributor note).
- `RELEASE.md`: add a "model-editor-mcp (npm)" section mirroring the desktop one — the `mcp-v*` flow, the rehearsal ladder (§3.3), and the coordinated-release procedure (§3.4).

---

## 8. Deliverables / work breakdown

| # | Deliverable | Gated on infra? |
|---|---|---|
| T1 | `apps/model-editor-mcp/package.json`: rename to `@cyoda/model-editor-mcp`, drop `private`, add `version`/`bin`/`files`/`engines`/`publishConfig`; empty runtime `dependencies`, move deps to `devDependencies`, add `esbuild` (§4). | no |
| T2 | `apps/model-editor-mcp/scripts/bundle-server.mjs` (app-local; esbuild, shebang, chmod) + rewrite the `build` script to `tsc --noEmit && node scripts/bundle-server.mjs && vite build`; version-inject via `define` (§5.1–5.2). | no |
| T3 | `--filter` ripple sweep: update all `pnpm --filter model-editor-mcp` → `@cyoda/model-editor-mcp` across scripts, README, `AGENTS.md`, workflows, docs (§4). | no |
| T4 | `scripts/check-mcp-release-version.sh` (repo-root, sibling of `check-release-version.sh`; mcp-v prefix, suffix-preserving, reads the MCP package.json — §5.3). | no |
| T5 | `.github/workflows/release-mcp.yml`: `mcp-v*.*.*` + `workflow_dispatch`; `guard` → `publish`/`pack`; `id-token: write`; `NODE_AUTH_TOKEN`; `--tag next` for prereleases; concurrency group (§3.2). | publish step needs T-INFRA |
| T6 | `workflow_dispatch` rehearsal assertions: pack + verify shebang / `web/dist` / empty deps / no `workspace:` specifiers (§3.3.1). | no |
| T7 | Extend `smoke.yml` with MCP build + `npm pack` (no publish) on `staging` (§3.3.2). | no |
| T8 | Docs: README register section, `.mcp.json.example` consumer variant, `RELEASE.md` MCP + coordinated-release sections (§7, §3.4). | no |
| T-INFRA | One-time provisioning by the operator: create + store `NPM_TOKEN` (§9). Desktop half of a coordinated release additionally needs the Apple secrets + Homebrew tap (§9). | — (manual) |

### 8.1 Sequencing — code first, infra gates only the real publish
T1–T8 are independent of T-INFRA and are **fully validatable via `workflow_dispatch` rehearsal + `npm pack`** (no token, no version consumed). Only the real `publish` step needs `NPM_TOKEN`. Recommended order: T1–T4 (package + bundle + guard) → T5–T7 (workflow + rehearsal + smoke, dry-run green) → T8 (docs) → T-INFRA (token) → optional `mcp-v*-rc.1` publish to `next` → real `mcp-v*`. The coordinated first public release waits only on the desktop's Apple creds; the MCP can go independently.

---

## 9. Prerequisites / one-time provisioning (operator actions)

### 9.1 `NPM_TOKEN` (MCP — required to publish)
1. Confirm your npm account can publish to `@cyoda` (you already publish `@cyoda/workflow-*`). ✅
2. npmjs.com → Access Tokens → **Generate New Token → Granular Access Token**: name `cyoda-dev-console-ci`; set an expiration (e.g. 90 days — this is the temporary bootstrap before OIDC); **Packages and scopes: Read and write, scoped to the `@cyoda` scope** (scope-level, because the package does not exist yet — this lets the first publish create it). Automation/granular tokens bypass interactive 2FA in CI.
3. cyoda-dev-console repo → Settings → Secrets and variables → Actions → New repository secret: **`NPM_TOKEN`** = the `npm_…` value. (Repo secret = smallest blast radius; an org secret scoped to selected repos is the alternative if one token is preferred.)

### 9.2 Apple credentials (desktop — required for the macOS half of a coordinated release)
Already enumerated in `RELEASE.md` §Prerequisites: Developer ID Application cert + app-specific password → repo secrets `APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`, `APPLE_SIGNING_IDENTITY`, `APPLE_ID`, `APPLE_PASSWORD`, `APPLE_TEAM_ID`. Until these exist, `build-macos` in `release.yml` cannot sign/notarize, so a coordinated release's desktop half is blocked (the MCP half is unaffected). *(Separate work thread; happy to walk through Apple Developer ID + app-specific-password setup.)*

### 9.3 Homebrew tap (desktop — per prior spec T10)
`cyoda/homebrew-cyoda` + the release-bot GitHub App + `vars.HOMEBREW_TAP_APP_ID`/`secrets.HOMEBREW_TAP_APP_KEY`, per `docs/release-infra-runbook.md`. Gates only the desktop `publish-cask` job. Not an MCP concern.

---

## 10. Testing / verification

- **Rehearsal (pre-publish):** `workflow_dispatch` green — tarball assertions pass (T6). This is the primary gate, since npm publishes are irreversible.
- **`staging` smoke:** MCP build + pack stays green between releases (T7); Playwright render e2e stays green.
- **Post-publish smoke (manual checklist in `RELEASE.md`):** in a clean temp dir with no `@cyoda` workspace present, `npx -y @cyoda/model-editor-mcp@<version> --project .` boots, prints `http://127.0.0.1:<port>/?token=…` on stderr, and the URL serves the live editor; a `list_workflows` tool call round-trips. Confirms the bundle is genuinely self-contained (no reliance on unpublished workspace deps).
- **Provenance:** the published package page shows the "built and signed on GitHub Actions" panel linking the commit + run.
- **Coordinated release:** pushing both `vX.Y.Z` and `mcp-vA.B.C` fires exactly two independent runs; each produces its artifact; a forced failure in one does not affect the other.

---

## 11. Open risks / future

- **pnpm provenance emission** — start with `pnpm publish`; fall back to `npm publish` for this one package if provenance misbehaves (§6). Low risk on pnpm 10.
- **OIDC trusted publishing (future hardening, D7):** removes the long-lived `NPM_TOKEN`, matching cyoda-go's keyless (cosign/OIDC) posture. Deferred because (a) trusted publishing needs the package to already exist (chicken-and-egg with the first publish), (b) it wants a recent `npm` CLI, and (c) pnpm's OIDC support is nascent, likely forcing `npm publish` for this package. Natural follow-up once `@cyoda/model-editor-mcp` exists.
- **One-click coordinated orchestrator (future convenience):** a `workflow_dispatch` that takes both version inputs and pushes both tags, so "release both" is one action instead of two `git push`es. Deferred — the two-tag push is trivial and keeps the triggers cleanly independent.
- **No cross-artifact transactionality (accepted):** a coordinated release is two independent pipelines; a partial failure (e.g. npm succeeds, cask fails) leaves a mixed state that is reconciled by re-running the failed side. Documented in `RELEASE.md`.
- **Tag-prefix asymmetry (accepted):** desktop stays `v*`, MCP is `mcp-v*` (rather than renaming both to `desktop-v*`/`mcp-v*`) to avoid churning the working, widely-referenced desktop trigger. Symmetrize later only if it causes confusion.
