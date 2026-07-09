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
