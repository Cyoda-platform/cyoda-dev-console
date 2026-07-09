# model-editor-mcp npm release — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish `apps/model-editor-mcp` to public npm as `@cyoda/model-editor-mcp` — a single self-contained package installable via `npx` in any AI CLI — triggered by `mcp-v*` git tags, authed with `NPM_TOKEN` + provenance, without touching the existing desktop release.

**Architecture:** esbuild bundles the Node MCP server (which uses a hand-rolled MCP protocol over stdio) into one ESM file that inlines the unpublished `@cyoda/*` workspace deps; Vite's pre-built `web/dist` ships alongside as static assets; the published package has empty runtime `dependencies`. A new `release-mcp.yml` guards the tag/version match and runs `pnpm publish` on tag push (or a `pnpm pack` rehearsal on manual dispatch).

**Tech Stack:** Node 22, pnpm 9.15.4 (pinned), TypeScript, esbuild (new), Vite, GitHub Actions, npm registry.

**Design spec:** `docs/superpowers/specs/2026-07-06-model-editor-mcp-npm-release-design.md` (read it — this plan implements it, including its §12 adversarial-review fixes).

## Global Constraints

Every task's requirements implicitly include these (exact values from the spec):

- **Node** `>=22`; **pnpm** `9.15.4` (repo `packageManager`; `pnpm/action-setup@v6` resolves it — do NOT assume pnpm 10).
- **Package name:** `@cyoda/model-editor-mcp` (scoped). **Bin/CLI command:** `model-editor-mcp` (short). **Server-identity name** in the MCP handshake stays the string `model-editor-mcp` (unchanged — it is not the npm name).
- **License:** `MIT` (the repo root `LICENSE`).
- **Published package is self-contained:** runtime `dependencies` is `{}`; the server is esbuild-bundled, the web UI is Vite-pre-built into `web/dist`. Nothing `@cyoda/*` is published except this one package.
- **Provenance** via `"publishConfig": { "access": "public", "provenance": true }` + job `id-token: write`. Requires the repo stay **public** (`Cyoda/cyoda-dev-console` currently is).
- **Rehearse/pack with `pnpm` only, never `npm`** — only pnpm rewrites the `workspace:`/`catalog:` protocol specifiers this manifest uses.
- **First real publish must be a stable `0.1.0`** (so a `latest` dist-tag exists). Prerelease versions carry the suffix in `package.json` (`0.1.0-rc.1`) and publish to the `next` dist-tag.
- **Do NOT modify** the desktop `.github/workflows/release.yml`, `scripts/check-release-version.sh`, or any historical plan under `docs/superpowers/plans/` (those are records).
- **web/dist resolution is `../web/dist` relative to the running file** (`server/index.ts:178`) — it must keep working bundled; `files` ships both `dist/` and `web/dist/` at the package root, so do not change it.

---

## File structure

| Path | Action | Responsibility |
|---|---|---|
| `apps/model-editor-mcp/package.json` | modify | Publish-shaped manifest (name, version, bin, files, publishConfig, empty runtime deps) |
| `apps/model-editor-mcp/LICENSE` | create | MIT license shipped in the package (copy of root `LICENSE`) |
| `apps/model-editor-mcp/scripts/bundle-server.mjs` | create | esbuild single-file server bundle (shebang, chmod, clean) |
| `apps/model-editor-mcp/server/version.ts` | modify | Read `SERVER_VERSION` from `package.json` at runtime |
| `apps/model-editor-mcp/server/__tests__/version.test.ts` | modify | Allow a prerelease suffix in the semver assertion |
| `apps/model-editor-mcp/tsconfig.build.json` | delete | No longer used (esbuild replaces the tsc emit) |
| `scripts/check-mcp-release-version.sh` | create | Guard: `mcp-v*` tag == `package.json` version (suffix-preserving) |
| `scripts/check-mcp-pack.sh` | create | Rehearsal: `pnpm pack` + assert tarball shape |
| `.github/workflows/release-mcp.yml` | create | `mcp-v*` → guard → publish (or dispatch → pack rehearsal) |
| `.github/workflows/ci.yml` | modify | Rename the 3 name-based `--filter` refs to the scoped name |
| `.github/workflows/smoke.yml` | modify | Add an `mcp` job: build + pack assertions on `staging` |
| `apps/model-editor-mcp/README.md` | modify | `npx` consumer register section; scoped `--filter` in Develop |
| `RELEASE.md` | modify | Add the `model-editor-mcp (npm)` release + coordinated-release section |

**Task order:** 1 → 2 → 3 → 4 → 5 → 6 → 7 (later tasks depend on earlier: 4 needs the bundle from 2; 5 uses the scripts from 3+4).

---

### Task 1: Make the package publish-shaped + fix the live `--filter` ripple

Renames the package to the scoped name and gives it a publishable manifest. Because the rename breaks name-based `pnpm --filter model-editor-mcp` references, this task also fixes the two **live** ones (CI + README) in the same commit so the repo is never left in a broken state. The build script itself is untouched here (that's Task 2) — the old `tsc`-emit build still works after this task.

**Files:**
- Modify: `apps/model-editor-mcp/package.json`
- Create: `apps/model-editor-mcp/LICENSE`
- Modify: `.github/workflows/ci.yml:22-24`
- Modify: `apps/model-editor-mcp/README.md` (Develop section filters)

**Interfaces:**
- Produces: package name `@cyoda/model-editor-mcp`; version `0.1.0`; `bin.model-editor-mcp = ./dist/index.js`; `files = ["dist","web/dist","README.md","LICENSE"]`; empty runtime `dependencies`. Later tasks filter with `--filter @cyoda/model-editor-mcp`.

- [ ] **Step 1: Confirm the live name-based filter references (baseline)**

Run: `grep -rn "filter model-editor-mcp" .github/ apps/model-editor-mcp/README.md`
Expected: hits in `.github/workflows/ci.yml` (3) and `apps/model-editor-mcp/README.md` (4). (Hits under `docs/superpowers/plans/` are historical — do NOT touch them.)

- [ ] **Step 2: Copy the MIT license into the package**

Run: `cp LICENSE apps/model-editor-mcp/LICENSE`
Expected: `apps/model-editor-mcp/LICENSE` exists and begins `MIT License`.

- [ ] **Step 3: Rewrite `apps/model-editor-mcp/package.json`**

Replace the whole file with:

```json
{
  "name": "@cyoda/model-editor-mcp",
  "version": "0.1.0",
  "description": "MCP server for a live, browser-rendered Cyoda model (workflow) editor — driven by an AI CLI via .mcp.json.",
  "license": "MIT",
  "type": "module",
  "bin": { "model-editor-mcp": "./dist/index.js" },
  "files": ["dist", "web/dist", "README.md", "LICENSE"],
  "engines": { "node": ">=22" },
  "publishConfig": { "access": "public", "provenance": true },
  "scripts": {
    "build": "tsc -p tsconfig.build.json && vite build --config web/vite.config.ts",
    "typecheck": "tsc --noEmit",
    "test": "vitest run --passWithNoTests",
    "test:e2e": "playwright test"
  },
  "dependencies": {},
  "devDependencies": {
    "@cyoda/agent-bridge-contract": "workspace:*",
    "@cyoda/console-design-system": "workspace:*",
    "@cyoda/workflow-core": "0.4.0",
    "@cyoda/workflow-editor-host": "workspace:*",
    "@cyoda/workflow-file-indexer": "workspace:*",
    "@cyoda/workflow-graph": "0.2.2",
    "@cyoda/workflow-layout": "0.1.3",
    "@cyoda/workflow-react": "0.4.1",
    "@playwright/test": "catalog:",
    "@testing-library/jest-dom": "^6.9.1",
    "@testing-library/react": "catalog:",
    "@types/node": "catalog:",
    "@types/react": "catalog:",
    "@types/react-dom": "catalog:",
    "@vitejs/plugin-react": "catalog:",
    "happy-dom": "^20.10.6",
    "lucide-react": "^1.23.0",
    "monaco-editor": "catalog:",
    "react": "catalog:",
    "react-dom": "catalog:",
    "reactflow": "catalog:",
    "typescript": "catalog:",
    "uuid": "catalog:",
    "vite": "catalog:",
    "vitest": "catalog:",
    "zod": "catalog:"
  }
}
```

(Every former `dependency` moved into `devDependencies`; `esbuild` is added in Task 2 where it's used.)

- [ ] **Step 4: Rename the 3 filters in `.github/workflows/ci.yml`**

Change lines 22-24 from `pnpm --filter model-editor-mcp …` to the scoped name:

```yaml
      - run: pnpm --filter @cyoda/model-editor-mcp build
      - run: pnpm --filter @cyoda/model-editor-mcp exec playwright install --with-deps chromium
      - run: pnpm --filter @cyoda/model-editor-mcp test:e2e
```

- [ ] **Step 5: Rename the filters in the README Develop section**

In `apps/model-editor-mcp/README.md`, replace each `pnpm --filter model-editor-mcp` with `pnpm --filter @cyoda/model-editor-mcp` (the `build`/`test`/`test:e2e` bullets near the end; the `pnpm --filter model-editor-mcp build` in the Register section is rewritten in Task 7).

- [ ] **Step 6: Update the lockfile (the rename changes it)**

Run: `pnpm install`
Expected: succeeds; `pnpm-lock.yaml` updates the importer key to `@cyoda/model-editor-mcp`. (`--frozen-lockfile` would fail here — that's expected; use plain `pnpm install`.)

- [ ] **Step 7: Verify no live name-based filter and that typecheck + old build still pass**

Run: `grep -rn "filter model-editor-mcp" .github/ apps/model-editor-mcp/README.md; echo "---"; pnpm --filter @cyoda/model-editor-mcp typecheck`
Expected: the grep prints nothing before `---`; typecheck exits 0.

- [ ] **Step 8: Commit**

```bash
git add apps/model-editor-mcp/package.json apps/model-editor-mcp/LICENSE \
        .github/workflows/ci.yml apps/model-editor-mcp/README.md pnpm-lock.yaml
git commit -m "chore(model-editor-mcp): make package publishable as @cyoda/model-editor-mcp

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: esbuild bundle + runtime version + build script

Replaces the per-file `tsc` emit with a single-file esbuild bundle (shebang, executable) and makes `SERVER_VERSION` read from `package.json` at runtime so it is correct both bundled and under vitest.

**Files:**
- Create: `apps/model-editor-mcp/scripts/bundle-server.mjs`
- Modify: `apps/model-editor-mcp/server/version.ts`
- Modify: `apps/model-editor-mcp/server/__tests__/version.test.ts`
- Modify: `apps/model-editor-mcp/package.json` (add `esbuild` devDep; rewrite `build`; add `prepack`)
- Delete: `apps/model-editor-mcp/tsconfig.build.json`

**Interfaces:**
- Consumes: package name/`files`/`bin` from Task 1.
- Produces: `pnpm --filter @cyoda/model-editor-mcp build` emits exactly `dist/index.js` (ESM, first line `#!/usr/bin/env node`, executable) + `dist/index.js.map` + `web/dist/**`; `dist/index.js` inlines all `@cyoda/*` + `zod` (no import of them survives).

- [ ] **Step 1: Add `esbuild` as a devDependency**

In `apps/model-editor-mcp/package.json` `devDependencies`, add:

```json
    "esbuild": "^0.28.0",
```

Then run `pnpm install` (updates the lockfile).

- [ ] **Step 2: Create the bundle script**

Create `apps/model-editor-mcp/scripts/bundle-server.mjs`:

```js
// Bundle the MCP server into one self-contained ESM file so the published npm
// package needs no @cyoda/* workspace deps at runtime. `import.meta.url` and the
// entry-module guard both survive because format:esm is preserved.
import { build } from "esbuild";
import { rmSync, chmodSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const appDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const outfile = join(appDir, "dist", "index.js");

// Wipe stale output from the previous (per-file tsc) build so nothing extra ships.
rmSync(join(appDir, "dist"), { recursive: true, force: true });

await build({
  entryPoints: [join(appDir, "server", "index.ts")],
  outfile,
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  sourcemap: true,
  banner: { js: "#!/usr/bin/env node" },
  logLevel: "info",
});

// A shebang alone isn't runnable via `npx`/bin without the executable bit.
chmodSync(outfile, 0o755);
console.log(`bundled -> ${outfile}`);
```

- [ ] **Step 3: Make `SERVER_VERSION` read from `package.json` at runtime**

Replace `apps/model-editor-mcp/server/version.ts` with:

```ts
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// The MCP handshake identity name — stable, independent of the npm package name.
export const SERVER_NAME = "model-editor-mcp";

// Single source of truth = package.json `version`. Read at runtime so it is
// correct whether this runs bundled (dist/index.js -> ../package.json = the
// published package root, always shipped) or unbundled under vitest
// (server/version.ts -> ../package.json = the app manifest). We deliberately do
// NOT use an esbuild `define`: that would leave SERVER_VERSION undefined in
// every non-bundled execution path (vitest, tsx).
const pkgPath = join(dirname(fileURLToPath(import.meta.url)), "..", "package.json");
export const SERVER_VERSION: string = JSON.parse(readFileSync(pkgPath, "utf8")).version;
```

- [ ] **Step 4: Relax the version test to allow a prerelease suffix**

In `apps/model-editor-mcp/server/__tests__/version.test.ts`, change the regex so prerelease versions (`0.1.0-rc.1`) pass:

```ts
    expect(SERVER_VERSION).toMatch(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/);
```

- [ ] **Step 5: Rewrite the build script + add `prepack`; delete the stale tsconfig**

In `apps/model-editor-mcp/package.json`, replace the `build` script and add `prepack`:

```json
    "build": "tsc --noEmit && node scripts/bundle-server.mjs && vite build --config web/vite.config.ts",
    "prepack": "pnpm run build",
```

Then delete the now-unused per-file emit config:

Run: `git rm apps/model-editor-mcp/tsconfig.build.json`

(`typecheck` stays `tsc --noEmit`, driven by `tsconfig.json`.)

- [ ] **Step 6: Build the server bundle and assert it is self-contained**

Run:
```bash
pnpm --filter './packages/*' build          # workspace deps must be built for esbuild to inline them
node apps/model-editor-mcp/scripts/bundle-server.mjs
head -n1 apps/model-editor-mcp/dist/index.js
grep -cE "from *[\"']@cyoda/|from *[\"']zod[\"']" apps/model-editor-mcp/dist/index.js
```
Expected: the `head` line is `#!/usr/bin/env node`; the `grep -c` prints `0` (every `@cyoda/*` and `zod` import inlined). The durable CI guard for this is `scripts/check-mcp-pack.sh` (Task 4), run by `smoke.yml` (Task 6).

- [ ] **Step 7: Verify the full build + existing suites are green**

Run: `pnpm --filter @cyoda/model-editor-mcp build && pnpm --filter @cyoda/model-editor-mcp typecheck && pnpm --filter @cyoda/model-editor-mcp test`
Expected: build emits `dist/index.js` + `web/dist/index.html`; typecheck exits 0; vitest passes (incl. `version.test.ts`).

- [ ] **Step 8: Verify the bundle actually boots and serves (manual smoke)**

Run:
```bash
d=$(mktemp -d); node apps/model-editor-mcp/dist/index.js --project "$d" 2>&1 & pid=$!; sleep 2; kill $pid
```
Expected: stderr shows a line like `model-editor-mcp: http://127.0.0.1:<port>/?token=<hex>` before it's killed (proves the self-contained bundle runs with no `@cyoda` workspace on the path).

- [ ] **Step 9: Commit**

```bash
git add apps/model-editor-mcp/package.json apps/model-editor-mcp/scripts/bundle-server.mjs \
        apps/model-editor-mcp/server/version.ts \
        apps/model-editor-mcp/server/__tests__/version.test.ts pnpm-lock.yaml
git rm apps/model-editor-mcp/tsconfig.build.json
git commit -m "build(model-editor-mcp): esbuild single-file server bundle + runtime version

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: `mcp-v*` version guard script

A repo-root sibling of the desktop `check-release-version.sh`, but it strips the `mcp-v` prefix and **keeps** the prerelease suffix (npm versions are immutable, so `mcp-v0.1.0-rc.1` must map to `package.json` version `0.1.0-rc.1`).

**Files:**
- Create: `scripts/check-mcp-release-version.sh`
- Create: `scripts/check-mcp-release-version.test.sh` (a self-contained shell test — the repo has no bats)

**Interfaces:**
- Produces: `scripts/check-mcp-release-version.sh <tag> <package.json>` → exit 0 + `version-ok: <v>` on match, exit 1 + `::error::…` on mismatch. Consumed by `release-mcp.yml` (Task 5).

- [ ] **Step 1: Write the failing test (a self-contained shell assertion)**

Create `scripts/check-mcp-release-version.test.sh`:

```bash
#!/usr/bin/env bash
# Exercises scripts/check-mcp-release-version.sh against a fixture package.json.
set -uo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
guard="$here/check-mcp-release-version.sh"
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
pkg="$tmp/package.json"

expect() { # <desc> <expected-exit> <tag> <version>
  echo "{\"version\":\"$4\"}" > "$pkg"
  "$guard" "$3" "$pkg" >/dev/null 2>&1; local got=$?
  if [[ "$got" != "$2" ]]; then echo "FAIL: $1 (exit $got, wanted $2)"; exit 1; fi
  echo "ok: $1"
}

expect "stable match"            0 mcp-v0.1.0        0.1.0
expect "prerelease match (kept)" 0 mcp-v0.1.0-rc.1  0.1.0-rc.1
expect "prerelease vs stable"    1 mcp-v0.1.0-rc.1  0.1.0
expect "version mismatch"        1 mcp-v0.2.0        0.1.0
expect "build-metadata stripped" 0 mcp-v0.1.0+ci    0.1.0
echo "ALL PASS"
```

- [ ] **Step 2: Run it to verify it fails**

Run: `bash scripts/check-mcp-release-version.test.sh`
Expected: FAIL — `check-mcp-release-version.sh` does not exist (first `expect` errors non-zero).

- [ ] **Step 3: Create the guard script**

Create `scripts/check-mcp-release-version.sh`:

```bash
#!/usr/bin/env bash
# Assert an mcp-v* release tag's version matches apps/model-editor-mcp/package.json.
# Unlike the desktop guard, the prerelease suffix is KEPT: npm versions are
# immutable, so mcp-v0.1.0-rc.1 must map to package.json version 0.1.0-rc.1.
# Usage: check-mcp-release-version.sh <tag> <path-to-package.json>
set -euo pipefail

tag="${1:?tag required}"
pkg="${2:?package.json path required}"

base="${tag#mcp-v}"    # strip the mcp-v prefix (keep any -rc.N suffix)
base="${base%%+*}"     # drop +build metadata only

pkg_version="$(jq -r '.version' "$pkg")"

if [[ "$base" != "$pkg_version" ]]; then
  echo "::error::tag '${tag}' (version '${base}') != package.json version '${pkg_version}'" >&2
  exit 1
fi
echo "version-ok: ${base}"
```

Run: `chmod +x scripts/check-mcp-release-version.sh`

- [ ] **Step 4: Run the test to verify it passes**

Run: `bash scripts/check-mcp-release-version.test.sh`
Expected: `ALL PASS`.

- [ ] **Step 5: Commit**

```bash
git add scripts/check-mcp-release-version.sh scripts/check-mcp-release-version.test.sh
git commit -m "ci(release): add mcp-v* version guard (suffix-preserving)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: `pnpm pack` shape-assertion script (rehearsal gate)

The irreversible-publish safety net. Packs with **pnpm** (so `workspace:`/`catalog:` are rewritten) and asserts the tarball is a correct, self-contained publish.

**Files:**
- Create: `scripts/check-mcp-pack.sh`

**Interfaces:**
- Consumes: a completed `pnpm --filter @cyoda/model-editor-mcp build` (Task 2).
- Produces: `scripts/check-mcp-pack.sh` → exit 0 + `pack-ok: <name>@<version>` when the tarball is correct; exit 1 + `::error::…` otherwise. Consumed by `release-mcp.yml` (Task 5) and `smoke.yml` (Task 6).

- [ ] **Step 1: Create the assertion script**

Create `scripts/check-mcp-pack.sh`:

```bash
#!/usr/bin/env bash
# Rehearsal gate: pnpm-pack the MCP package and assert the tarball is a correct,
# self-contained publish. MUST use pnpm (not npm) pack — only pnpm rewrites the
# workspace:/catalog: protocol specifiers this manifest uses. Assumes the package
# is already built (dist/ + web/dist/).
set -euo pipefail

app="apps/model-editor-mcp"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

( cd "$app" && pnpm pack --pack-destination "$work" >/dev/null )
tgz="$(ls "$work"/*.tgz | head -n1)"
echo "packed: $tgz"

tar -xzf "$tgz" -C "$work"          # extracts to $work/package/
pkgdir="$work/package"

fail() { echo "::error::pack check: $1" >&2; exit 1; }

# 1. Required files present.
[[ -f "$pkgdir/dist/index.js" ]]       || fail "dist/index.js missing"
[[ -f "$pkgdir/web/dist/index.html" ]] || fail "web/dist/index.html missing"
[[ -f "$pkgdir/README.md" ]]           || fail "README.md missing"
[[ -f "$pkgdir/LICENSE" ]]             || fail "LICENSE missing"

# 2. Server entry is an executable ESM bin with a shebang.
head -n1 "$pkgdir/dist/index.js" | grep -q '^#!/usr/bin/env node' \
  || fail "dist/index.js is missing the #!/usr/bin/env node shebang"

# 3. No unresolved pnpm protocol specifiers survive anywhere in the manifest.
for proto in 'workspace:' 'catalog:' 'link:' 'file:'; do
  grep -q "$proto" "$pkgdir/package.json" && fail "published package.json still contains a '${proto}' specifier"
done

# 4. Runtime dependencies are empty (everything is bundled or pre-built).
deps="$(jq -r '.dependencies // {} | keys | length' "$pkgdir/package.json")"
[[ "$deps" == "0" ]] || fail "runtime dependencies is non-empty (${deps} entries)"

# 5. The bin is wired to the bundle.
[[ "$(jq -r '.bin["model-editor-mcp"] // empty' "$pkgdir/package.json")" == "./dist/index.js" ]] \
  || fail "bin.model-editor-mcp is not ./dist/index.js"

echo "pack-ok: $(jq -r '.name + "@" + .version' "$pkgdir/package.json")"
```

Run: `chmod +x scripts/check-mcp-pack.sh`

- [ ] **Step 2: Run it against a fresh build — verify it passes**

Run: `pnpm --filter './packages/*' build && pnpm --filter @cyoda/model-editor-mcp build && ./scripts/check-mcp-pack.sh`
Expected: `pack-ok: @cyoda/model-editor-mcp@0.1.0`. (`check-mcp-pack.sh` re-runs the build via `prepack`, so it's always packing a fresh tree.)

- [ ] **Step 3: Prove the assertions have teeth (temporary break → expect FAIL)**

Temporarily add a real runtime dependency — a normal semver packs verbatim (not rewritten), so it exercises the empty-deps assertion — then confirm the script rejects it:

```bash
node -e "const f='apps/model-editor-mcp/package.json';const p=require('./'+f);p.dependencies={'left-pad':'^1.3.0'};require('fs').writeFileSync(f,JSON.stringify(p,null,2)+'\n')"
./scripts/check-mcp-pack.sh; echo "exit=$?"
```
Expected: `::error::pack check: runtime dependencies is non-empty (1 entries)` and `exit=1`.

- [ ] **Step 4: Revert the temporary break**

Run: `git checkout apps/model-editor-mcp/package.json && pnpm install`
Expected: manifest restored to empty `dependencies`; `pnpm install` clean.

- [ ] **Step 5: Commit**

```bash
git add scripts/check-mcp-pack.sh
git commit -m "ci(release): add pnpm-pack shape assertions for the mcp package

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: `release-mcp.yml` workflow

Ties it together: `mcp-v*` tag → guard → build → publish; manual dispatch → build → pack rehearsal (never publishes).

**Files:**
- Create: `.github/workflows/release-mcp.yml`

**Interfaces:**
- Consumes: `scripts/check-mcp-release-version.sh` (Task 3), `scripts/check-mcp-pack.sh` (Task 4), the build (Task 2). Secret `NPM_TOKEN` (operator-provisioned; not needed for the dispatch rehearsal).

- [ ] **Step 1: Create the workflow**

Create `.github/workflows/release-mcp.yml`:

```yaml
name: Release MCP
on:
  push:
    tags: ["mcp-v*.*.*"]
  workflow_dispatch: {}   # build + pack rehearsal; never publishes

concurrency:
  group: release-mcp-${{ github.ref }}
  cancel-in-progress: false

permissions:
  contents: read
  id-token: write         # lets npm mint the provenance attestation

jobs:
  guard:
    if: ${{ github.event_name == 'push' }}
    runs-on: ubuntu-22.04
    steps:
      - uses: actions/checkout@v7
      - run: ./scripts/check-mcp-release-version.sh "${{ github.ref_name }}" apps/model-editor-mcp/package.json

  build-and-publish:
    needs: [guard]
    if: ${{ always() && (github.event_name == 'workflow_dispatch' || needs.guard.result == 'success') }}
    runs-on: ubuntu-22.04
    steps:
      - uses: actions/checkout@v7
      - uses: pnpm/action-setup@v6
      - uses: actions/setup-node@v6
        with:
          node-version: 22
          cache: pnpm
          registry-url: https://registry.npmjs.org   # writes the .npmrc that reads NODE_AUTH_TOKEN
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter './packages/*' build        # workspace deps first — esbuild resolves their dist/
      - run: pnpm --filter @cyoda/model-editor-mcp build

      - name: Rehearse (pack + assert) — dispatch only, never publishes
        if: ${{ github.event_name == 'workflow_dispatch' }}
        run: ./scripts/check-mcp-pack.sh

      - name: Publish to npm — tag push only
        if: ${{ github.event_name == 'push' }}
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
        run: |
          version="$(jq -r .version apps/model-editor-mcp/package.json)"
          case "$version" in
            *-*) dist_tag=next ;;    # prerelease -> next
            *)   dist_tag=latest ;;  # stable -> latest
          esac
          echo "publishing ${version} to dist-tag '${dist_tag}'"
          pnpm --filter @cyoda/model-editor-mcp publish --no-git-checks --tag "$dist_tag"
```

- [ ] **Step 2: Lint the workflow YAML**

Run: `actionlint .github/workflows/release-mcp.yml` *(if `actionlint` is unavailable, run `python3 -c "import yaml,sys; yaml.safe_load(open('.github/workflows/release-mcp.yml'))" && echo yaml-ok` instead)*.
Expected: no errors (or `yaml-ok`).

- [ ] **Step 3: Sanity-check the guard wiring locally (no publish)**

Run: `./scripts/check-mcp-release-version.sh mcp-v0.1.0 apps/model-editor-mcp/package.json`
Expected: `version-ok: 0.1.0` (the same invocation the `guard` job runs).

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/release-mcp.yml
git commit -m "ci(release): add release-mcp.yml (mcp-v* -> npm publish with provenance)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

> **Runtime verification (post-merge, no version consumed):** trigger the workflow via **Actions → Release MCP → Run workflow** on this branch. It builds and runs the pack rehearsal, publishing nothing. This is the real gate for the workflow's correctness (a workflow can't be fully exercised locally).

---

### Task 6: Extend `smoke.yml` with an MCP pack job

Surfaces packaging breakage on every push to `staging`, between releases.

**Files:**
- Modify: `.github/workflows/smoke.yml`

- [ ] **Step 1: Add the `mcp` job**

Append this job to `.github/workflows/smoke.yml` (a sibling of the existing `macos`/`linux` jobs, under `jobs:`):

```yaml
  mcp:
    runs-on: ubuntu-22.04
    steps:
      - uses: actions/checkout@v7
      - uses: pnpm/action-setup@v6
      - uses: actions/setup-node@v6
        with: { node-version: 22, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter './packages/*' build
      - run: pnpm --filter @cyoda/model-editor-mcp build
      - run: ./scripts/check-mcp-pack.sh
```

- [ ] **Step 2: Lint the workflow YAML**

Run: `actionlint .github/workflows/smoke.yml` *(or the `python3 -c "import yaml…"` fallback from Task 5 Step 2)*.
Expected: no errors.

- [ ] **Step 3: Verify the job's commands run green locally**

Run: `pnpm --filter './packages/*' build && pnpm --filter @cyoda/model-editor-mcp build && ./scripts/check-mcp-pack.sh`
Expected: `pack-ok: @cyoda/model-editor-mcp@0.1.0`.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/smoke.yml
git commit -m "ci(smoke): pack the mcp package on staging pushes

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 7: Docs — `npx` install, MCP release flow, coordinated release, rollback

**Files:**
- Modify: `apps/model-editor-mcp/README.md` ("Register with Claude Code")
- Modify: `RELEASE.md` (new MCP section)

- [ ] **Step 1: Rewrite the README "Register with Claude Code" section**

In `apps/model-editor-mcp/README.md`, replace the "## Register with Claude Code" section body with a consumer-first version. The current body builds locally and copies `.mcp.json.example`; replace it with:

```markdown
## Register with Claude Code

**Consumers** — no clone, no build. Add this to `.mcp.json` at your project root
(or run `claude mcp add model-editor -- npx -y @cyoda/model-editor-mcp --project . --workflow-globs "models/workflow/**/*.json" --entity-globs "models/schema/**/*.json"`):

```json
{
  "mcpServers": {
    "model-editor": {
      "command": "npx",
      "args": ["-y", "@cyoda/model-editor-mcp", "--project", ".",
               "--workflow-globs", "models/workflow/**/*.json",
               "--entity-globs", "models/schema/**/*.json"]
    }
  }
}
```

Claude Code starts it over stdio the next time you run it there. Watch stderr for
`model-editor-mcp: http://127.0.0.1:<port>/?token=<hex>` and open that URL to see
the live editor.

**Contributors (monorepo dev)** — run the local build instead of the published
package, using `.mcp.json.example` (which points `node` at `dist/index.js`):

```bash
pnpm --filter @cyoda/model-editor-mcp build
cp apps/model-editor-mcp/.mcp.json.example .mcp.json
```
```

- [ ] **Step 2: Verify the README's consumer JSON is valid**

Run: `node -e "JSON.parse(process.argv[1])" '{"mcpServers":{"model-editor":{"command":"npx","args":["-y","@cyoda/model-editor-mcp","--project",".","--workflow-globs","models/workflow/**/*.json","--entity-globs","models/schema/**/*.json"]}}}' && echo json-ok`
Expected: `json-ok`.

- [ ] **Step 3: Add the MCP release section to `RELEASE.md`**

Append to `RELEASE.md`:

```markdown
---

## model-editor-mcp (npm)

The `@cyoda/model-editor-mcp` MCP server ships to public npm independently of the
desktop app, on its own `mcp-v*` tags via `.github/workflows/release-mcp.yml`.

### How an MCP release flows
1. Bump `version` in `apps/model-editor-mcp/package.json` (SemVer; a prerelease
   carries the suffix literally, e.g. `0.1.0-rc.1`), commit.
2. Push a tag `mcp-vX.Y.Z` (or `mcp-vX.Y.Z-rc.N`).
3. `release-mcp.yml` runs: `guard` (tag == package.json version, suffix included)
   → build workspace deps → esbuild-bundle the server + Vite-build `web/dist`
   → `pnpm publish` with provenance. A stable version publishes to the `latest`
   dist-tag; a prerelease publishes to `next`.

### Rehearsing without publishing
Trigger it manually (**Actions → Release MCP → Run workflow**) on any branch: it
builds and runs `scripts/check-mcp-pack.sh` (pack + shape assertions) and
**publishes nothing, consumes no version**. This is the primary gate — npm
versions are immutable.

### Prerequisites (one-time)
- **`NPM_TOKEN`** repo secret: a granular npm access token with **read+write on the
  `@cyoda` scope** (scope-level so the first publish can create the package). If
  npm rejects the very first publish of the brand-new name, use a classic
  Automation token for that one publish, then switch back. Provenance additionally
  requires this repo stay **public**.

### First release
The **first-ever** publish must be a stable `0.1.0` (not an rc), so a `latest`
dist-tag exists — otherwise a bare `npx @cyoda/model-editor-mcp` has nothing to
resolve. Use rc→`next` only for later versions.

### Bad-publish recovery
npm versions can't be overwritten and `unpublish` is restricted (72h window;
blocked once anything depends on it). Recover with
`npm deprecate @cyoda/model-editor-mcp@x.y.z "reason"` **plus a patch release** —
never rely on unpublish.

## Coordinated release (desktop + MCP together)

A "release" is an event, not one trigger. To cut both artifacts:
1. Bump `apps/dev-console/src-tauri/tauri.conf.json` `.version` **and**
   `apps/model-editor-mcp/package.json` `.version` (independent SemVers), commit.
2. Push both tags: `git push origin vX.Y.Z mcp-vA.B.C`.
3. `release.yml` and `release-mcp.yml` run independently and in parallel; neither
   gates the other. A failure in one does not roll back the other — re-run the
   failed side (the two are not a single transaction). The desktop half needs the
   Apple secrets provisioned (see Prerequisites above); the MCP half does not.
```

- [ ] **Step 4: Verify the docs render and cross-references resolve**

Run: `grep -n "release-mcp.yml\|check-mcp-pack.sh\|npm deprecate" RELEASE.md && grep -n "npx -y @cyoda/model-editor-mcp" apps/model-editor-mcp/README.md`
Expected: matching lines in both files (the new sections landed).

- [ ] **Step 5: Commit**

```bash
git add apps/model-editor-mcp/README.md RELEASE.md
git commit -m "docs(release): npx install + mcp release/coordinated-release/rollback docs

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Operator action (manual, outside this plan — not code)

Before the first real publish, the operator provisions the `NPM_TOKEN` secret per
`RELEASE.md` → "model-editor-mcp (npm)" → Prerequisites (granular token, `@cyoda`
scope, read+write; stored as repo secret `NPM_TOKEN`). All of Tasks 1–7 are
validatable without it via the `workflow_dispatch` rehearsal. The Apple
credentials + Homebrew tap for the desktop half are tracked separately in the
existing `RELEASE.md` Prerequisites and `docs/release-infra-runbook.md`.

## Post-implementation gate (whole plan)

1. `pnpm install --frozen-lockfile && pnpm -r build && pnpm typecheck && pnpm -r test` — repo green.
2. `./scripts/check-mcp-pack.sh` → `pack-ok: @cyoda/model-editor-mcp@0.1.0`.
3. Push the branch; run **Release MCP** via `workflow_dispatch` → green, nothing published.
4. Only then: provision `NPM_TOKEN`, and cut the first real `mcp-v0.1.0` (stable).
