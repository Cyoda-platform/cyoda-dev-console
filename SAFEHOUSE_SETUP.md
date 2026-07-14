# Safehouse Setup

A personal setup for running Claude Code (and other agents) inside the [`agent-safehouse`](https://github.com/eugene1g/agent-safehouse) sandbox on macOS, with Playwright available per-project on demand and Showboat enabled.

The setup is three pieces:

1. **`agent-safehouse`** — installed from Homebrew, pinned, manually reviewed at every upgrade. Provides the `safehouse` binary, the profile fragments under `profiles/`, and the policy renderer under `bin/lib/`.
2. **`~/.config/agent-safehouse/local-overrides.sb`** — a small machine-specific profile fragment with rules upstream doesn't provide.
3. **`~/.sandbox/safe-claude.sh`** — a shim around `safehouse` that fixes the permission posture (explicit allowlists, pinned binary, hash-trusted per-project files, TOCTOU-resistant token resolution).

Permission decisions are explicit on the command line. Per-project extensions exist but require an operator action (`safe-claude --trust-project`) to take effect. Nothing is auto-loaded from project files without that step.

---

## 1. Install dependencies

```bash
brew install eugene1g/safehouse/agent-safehouse
brew pin agent-safehouse                          # block unattended upgrades (see §7)
uv tool install showboat                          # markdown agent-log tool
```

Verify:

```bash
which safehouse showboat
# /opt/homebrew/bin/safehouse
# /Users/paul/.local/bin/showboat
```

## 2. File layout and permissions

The setup uses these paths. Create them with the documented permissions before any of the rest works.

```bash
mkdir -p ~/.sandbox            && chmod 0700 ~/.sandbox
mkdir -p ~/.config/agent-safehouse && chmod 0700 ~/.config/agent-safehouse
mkdir -p ~/.github_tokens      && chmod 0700 ~/.github_tokens
```

Expected ownership and mode:

| Path | Mode | Owner | Notes |
|---|---|---|---|
| `~/.sandbox/safe-claude.sh` | `0700` | `$USER` | the shim |
| `~/.config/agent-safehouse/` | `0700` | `$USER` | config root |
| `~/.config/agent-safehouse/local-overrides.sb` | `0600` | `$USER` | user-level append profile |
| `~/.config/agent-safehouse/local-overrides.sb.sha256` | `0600` | `$USER` | known-good hash baseline |
| `~/.config/agent-safehouse/trust` | `0600` | `$USER` | per-project hash trust |
| `~/.github_tokens/` | `0700` | `$USER` | per-project GH PATs |
| `~/.github_tokens/*.txt` | `0600` | `$USER` | one PAT per file |

The §9 smoke tests assert these.

## 3. Create the user override file

```bash
cat > ~/.config/agent-safehouse/local-overrides.sb <<'EOF'
;; ~/.config/agent-safehouse/local-overrides.sb
;; Recurring machine-specific exceptions.
;; Add a rule here only when no upstream profile covers it.

;; --- GPG signing ---------------------------------------------------------
;; Grant read on the public keyring, trust DB, and config files only.
;; Private keys live in ~/.gnupg/private-keys-v1.d and are explicitly denied
;; below — gpg-agent holds them on the host and signs via its socket.
(allow file-read*
    (home-subpath "/.gnupg"))
(deny file-read*
    (home-subpath "/.gnupg/private-keys-v1.d"))

;; --- showboat -------------------------------------------------------------
;; Exact-match grant on the launcher symlink (uv tool install showboat).
;; The venv it points at is covered by upstream 30-toolchains/python.sb.
(allow file-read*
    (home-literal "/.local/bin/showboat"))
EOF
chmod 0600 ~/.config/agent-safehouse/local-overrides.sb

# Baseline hash — the shim does not enforce this, but §9 smoke test 0
# diffs against it and warns on drift.
shasum -a 256 ~/.config/agent-safehouse/local-overrides.sb \
  > ~/.config/agent-safehouse/local-overrides.sb.sha256
chmod 0600 ~/.config/agent-safehouse/local-overrides.sb.sha256
```

The deny-after-allow ordering matters. SBPL evaluates rules in order; a later `(deny …)` overrides an earlier `(allow …)`. With this configuration, the sandboxed agent can read `pubring.kbx`, `trustdb.gpg`, `gpg.conf`, etc., but cannot read raw private key files under `private-keys-v1.d/`. Signing still works because `gpg` defers to `gpg-agent` over a socket; the agent holds the key.

After any edit to `local-overrides.sb`, refresh the baseline:

```bash
shasum -a 256 ~/.config/agent-safehouse/local-overrides.sb \
  > ~/.config/agent-safehouse/local-overrides.sb.sha256
```

## 4. The launcher shim

Write `~/.sandbox/safe-claude.sh` with the content below, then `chmod 0700 ~/.sandbox/safe-claude.sh`.

```bash
#!/usr/bin/env bash
# safe-claude.sh — wrapper over upstream `safehouse`.
# Permission posture: explicit allowlists; pinned safehouse binary; hash-trusted
# per-project files; TOCTOU-resistant GH_TOKEN resolution.
set -euo pipefail

# --- Pinned absolute paths (never resolved via $PATH). ----------------------
SAFEHOUSE_BIN="/opt/homebrew/bin/safehouse"
[[ -x "$SAFEHOUSE_BIN" && ! -L "$SAFEHOUSE_BIN" ]] \
  || { echo "missing or symlinked: $SAFEHOUSE_BIN" >&2; exit 127; }

TRUST_FILE="$HOME/.config/agent-safehouse/trust"
APPEND_OVERRIDES="$HOME/.config/agent-safehouse/local-overrides.sb"
PROJECT_PROFILE=".sandbox/profile.sb"
PROJECT_FLAGS=".sandbox/flags"

# --- Operator verbs consumed before forwarding to claude. -------------------
NO_PROJECT=0
TRUST_REGISTER=0
FORWARD=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    --trust-project)      TRUST_REGISTER=1; shift ;;
    --no-project-profile) NO_PROJECT=1;     shift ;;
    --)                   shift; FORWARD+=("$@"); break ;;
    *)                    FORWARD+=("$1");  shift ;;
  esac
done

# --- Reject project paths that have embedded tabs (would corrupt trust file).
case "$PWD" in *$'\t'*) echo "refusing tabbed PWD: $PWD" >&2; exit 2 ;; esac

# --- Deterministic project-file hash (path-included). -----------------------
hash_project_files() {
  {
    for f in "$PROJECT_PROFILE" "$PROJECT_FLAGS"; do
      if [[ -e "$f" ]]; then
        [[ -L "$f" ]] && { echo "refusing symlink: $f" >&2; exit 2; }
        /usr/bin/shasum -a 256 "$f"
      else
        printf '%s  %s\n' "absent" "$f"
      fi
    done
  } | /usr/bin/shasum -a 256 | awk '{print $1}'
}

# --- Trust registration. ---------------------------------------------------
if [[ "$TRUST_REGISTER" == 1 ]]; then
  [[ -e "$PROJECT_PROFILE" || -e "$PROJECT_FLAGS" ]] \
    || { echo "no .sandbox/profile.sb or .sandbox/flags here" >&2; exit 2; }
  HASH=$(hash_project_files)
  mkdir -p "$(dirname "$TRUST_FILE")"
  TMP="$(/usr/bin/mktemp "${TRUST_FILE}.XXXXXX")"
  if [[ -f "$TRUST_FILE" ]]; then
    awk -F'\t' -v p="$PWD" '$2 != p' "$TRUST_FILE" > "$TMP"
  fi
  printf '%s\t%s\n' "$HASH" "$PWD" >> "$TMP"
  chmod 0600 "$TMP"
  mv "$TMP" "$TRUST_FILE"
  echo "trusted $PWD at $HASH"
  exit 0
fi

# --- Verify trust on project files. ----------------------------------------
PROJECT_APPEND=()
PROJECT_FORWARD=()
if [[ "$NO_PROJECT" == 0 && ( -e "$PROJECT_PROFILE" || -e "$PROJECT_FLAGS" ) ]]; then
  EXPECTED=$(hash_project_files)
  RECORDED=""
  [[ -f "$TRUST_FILE" ]] && RECORDED=$(awk -F'\t' -v p="$PWD" '$2 == p {print $1}' "$TRUST_FILE")
  if [[ -z "$RECORDED" || "$EXPECTED" != "$RECORDED" ]]; then
    {
      echo "untrusted .sandbox/ at $PWD"
      echo "  expected: $EXPECTED"
      echo "  recorded: ${RECORDED:-<none>}"
      echo "  run:      safe-claude --trust-project"
    } >&2
    exit 2
  fi
  [[ -e "$PROJECT_PROFILE" ]] && PROJECT_APPEND+=(--append-profile="$PWD/$PROJECT_PROFILE")
  if [[ -e "$PROJECT_FLAGS" ]]; then
    while IFS= read -r line; do
      [[ -z "$line" || "$line" == \#* ]] && continue
      case "$line" in
        --add-dirs-ro=*|--add-dirs=*|--enable=*|--env-pass=*)
          PROJECT_FORWARD+=("$line") ;;
        *)
          echo "refusing disallowed flag in $PROJECT_FLAGS: $line" >&2
          exit 2 ;;
      esac
    done < "$PROJECT_FLAGS"
  fi
fi

# --- Resolve GH_TOKEN with TOCTOU safeguards. -------------------------------
if [[ -z "${GH_TOKEN:-}" ]]; then
  TOKEN_DIR="$HOME/.github_tokens"
  TOKEN_FILE="$TOKEN_DIR/$(basename "$PWD").txt"
  if [[ -e "$TOKEN_FILE" ]]; then
    if [[ -L "$TOKEN_FILE" ]]; then
      echo "warn: refusing $TOKEN_FILE — must not be a symlink" >&2
    else
      perm_owner=$(/usr/bin/stat -f '%Sp %Su' "$TOKEN_FILE")
      case "$perm_owner" in
        "-rw-------"\ "$USER")
          { IFS= read -r line; } < "$TOKEN_FILE"
          GH_TOKEN="${line%$'\r'}"
          export GH_TOKEN
          ;;
        *)
          echo "warn: refusing $TOKEN_FILE (have '$perm_owner'; want '-rw------- $USER')" >&2
          ;;
      esac
    fi
  fi
fi

# --- Compose append-profile flags. ------------------------------------------
APPEND_FLAGS=()
if [[ -e "$APPEND_OVERRIDES" ]]; then
  if [[ -L "$APPEND_OVERRIDES" ]]; then
    echo "refusing symlinked $APPEND_OVERRIDES" >&2; exit 2
  fi
  APPEND_FLAGS+=(--append-profile="$APPEND_OVERRIDES")
fi
APPEND_FLAGS+=("${PROJECT_APPEND[@]+"${PROJECT_APPEND[@]}"}")

# --- Launch. ----------------------------------------------------------------
exec "$SAFEHOUSE_BIN" \
  "${APPEND_FLAGS[@]+"${APPEND_FLAGS[@]}"}" \
  "${PROJECT_FORWARD[@]+"${PROJECT_FORWARD[@]}"}" \
  --env-pass=GH_TOKEN,ANTHROPIC_API_KEY,CYODA_USER,CYODA_SECRET,SHOWBOAT_REMOTE_URL \
  -- claude "${FORWARD[@]+"${FORWARD[@]}"}"
```

What the shim does and doesn't do:

| Behavior | Why |
|---|---|
| `SAFEHOUSE_BIN=/opt/homebrew/bin/safehouse` | Pinned absolute path — `$PATH` reordering or shadowing cannot redirect the renderer. |
| `local-overrides.sb` symlink-rejected and presence-included | Prevents a writeable-by-other-process file from being substituted via symlink. |
| `--trust-project` / `--no-project-profile` | Operator-explicit verbs; without them, `.sandbox/profile.sb` and `.sandbox/flags` are only consulted after hash verification. |
| Hash includes `$PWD` per record | Per-project hash record is path-bound; copying a `.sandbox/` directory to another project does not transfer trust. |
| `.sandbox/flags` allowlist: `--add-dirs-ro=`, `--add-dirs=`, `--enable=`, `--env-pass=` | `--append-profile=` is deliberately **not** in the allowlist — it would let a trusted-but-edited `flags` file pivot to an arbitrary profile path outside the hash. |
| Token file: regular-file + 0600 + owned by `$USER` + `read -r` first line | Closes the symlink-race and CRLF-injection paths; rejects files with wrong perms rather than silently consuming them. |
| `--env-pass=` allowlist | Whitelist of env vars forwarded to the sandboxed agent. Cloud-provider tokens, `AWS_*`, etc. are deliberately not listed. |
| **No** `--trust-workdir-config` | A project repo's `.safehouse` file would otherwise silently extend access at launch time. |
| **No** `--env` | Would inherit the full host env. Always use `--env-pass=`. |
| **No** `--enable=playwright-chrome` baked in | Chromium-full is a large surface and is opt-in per project via `.sandbox/flags` (§6). |

## 5. Shell aliases

```bash
# ~/.zshrc
alias safe-claude="$HOME/.sandbox/safe-claude.sh"
alias claude-yolo="$HOME/.sandbox/safe-claude.sh --dangerously-skip-permissions"
alias claude-api="$HOME/.sandbox/safe-claude.sh --dangerously-skip-permissions --use-api-key"
```

**`claude-api`** is `claude-yolo` plus `--use-api-key` (§6.1): same skip-permissions posture, but billed against the API key in `~/.config/anthropic-api-key.txt` instead of the subscription. The same untrusted-input caveat below applies.

**`claude-yolo` removes Claude Code's per-tool consent layer.** The `sandbox-exec` policy still applies, but inside the sandbox the agent can then read every path the sandbox permits and reach the entire internet without any further prompt. Use this only when:

- no untrusted input enters the session — no `WebFetch` on arbitrary URLs, no MCP servers from third parties, no opening of files from a freshly-cloned branch you haven't reviewed, and
- you're actively watching the run.

If you're not in both conditions, use `safe-claude` and answer the prompts.

## 6. Per-project conventions

Most projects need nothing.

When a project needs extra rules — peer-repo reads, an optional integration like `docker` or `playwright-chrome`, custom `(allow …)` lines — drop them in `./.sandbox/` under one or both of:

| File | Format | Used for |
|---|---|---|
| `.sandbox/profile.sb` | raw sandbox-exec `(allow …)` rules; appended via `--append-profile=` | custom `subpath`/`mach-lookup`/`iokit-open` rules, secret-store reads, anything safehouse profiles support |
| `.sandbox/flags` | one CLI flag per line; `#` comments allowed | `--enable=docker`, `--enable=playwright-chrome`, `--add-dirs-ro=$HOME/dev/peer`, `--env-pass=PROJECT_TOKEN` |

Both files are optional. Either may be present. Both are validated as regular files (not symlinks).

The shim fail-closes on file presence: a project with `.sandbox/profile.sb` or `.sandbox/flags` refuses to launch until you've registered the content's hash via `safe-claude --trust-project`. Edits to either file invalidate the hash and force a re-trust.

`.sandbox/flags` is parsed line-by-line through a strict allowlist (`--add-dirs-ro=`, `--add-dirs=`, `--enable=`, `--env-pass=`). Any other flag refuses the launch. `--append-profile=` is **not** in the allowlist — additional profiles go in `.sandbox/profile.sb`, which is hash-covered.

The trust gate protects against **tampering** of these files (drift after you've registered them), not against you having **accepted** them in the first place. Before running `safe-claude --trust-project`, read both files and treat these as the highest-risk lines:

- `--env-pass=<NAME>` in `.sandbox/flags` *extends* the shim's hardcoded env-pass whitelist. A line like `--env-pass=AWS_SECRET_ACCESS_KEY` is equivalent to handing the project's code whatever value is set in your host shell. Combined with the wide-open network egress (§7.3), accepting this line accepts a credential-exfiltration channel.
- `--add-dirs-ro=<path>` / `--add-dirs=<path>` in `.sandbox/flags` grant read or read-write on the named path. `--add-dirs-ro=$HOME` is one line and exposes the entire home directory.
- `(allow file-read* (subpath "..."))` or `(allow file-read* file-write* ...)` in `.sandbox/profile.sb` over anything inside `$HOME` other than the project root.

The shim cannot reason about flag semantics; only you can. The hash-trust gate buys you "this file hasn't changed since I looked at it" — not "this file is safe to use."

Example: a project that needs to read a sibling repo and run Playwright:

```bash
cd ~/dev/<project>
mkdir -p .sandbox

cat > .sandbox/profile.sb <<'EOF'
;; Read-only access to a peer repo this project depends on.
(allow file-read*
    (subpath "/Users/paul/dev/sibling-package"))
EOF

cat > .sandbox/flags <<'EOF'
# Enable Playwright (chromium-full + chromium-headless + MCP env).
--enable=playwright-chrome
# Extra env var this project needs.
--env-pass=PROJECT_TOKEN
EOF

echo '/.sandbox/' >> .gitignore        # personal env, not project policy

safe-claude --trust-project            # one-time; prints "trusted <path> at <sha>"
safe-claude                            # launches with the project rules applied
```

Verbs the shim recognises:

| Verb | Effect |
|---|---|
| `safe-claude --trust-project` | recompute hash of `.sandbox/profile.sb` + `.sandbox/flags`, write `<sha>\t<abs-path>` to `~/.config/agent-safehouse/trust`, exit. |
| `safe-claude --no-project-profile` | bypass the project sandbox config for one launch (still applies user-level overrides). |
| `safe-claude --use-api-key` | load an Anthropic API key from `~/.config/anthropic-api-key.txt` and export it as `ANTHROPIC_API_KEY` so the launch bills against the API instead of the subscription. `--use-api-key=/path` overrides the file. Fail-closed (see §6.1). |

**Trust file location:** `~/.config/agent-safehouse/trust`. Format: one record per project, tab-delimited `<sha256>\t<abs-path>`. Inspect or revoke trust by editing this file directly.

### 6.1 API-key billing (`--use-api-key`)

By default a launch uses your normal Claude subscription session. Pass `--use-api-key` to bill the run against an Anthropic API key instead:

```bash
printf '%s' 'sk-ant-...' > ~/.config/anthropic-api-key.txt
chmod 0600 ~/.config/anthropic-api-key.txt

safe-claude --use-api-key            # default key file
claude-yolo --use-api-key            # also works (alias adds --dangerously-skip-permissions)
safe-claude --use-api-key=/path/to/key.txt   # override the file
```

`ANTHROPIC_API_KEY` is already in the shim's `--env-pass=` allowlist, so once the verb exports it from the file it reaches the sandboxed agent and Claude Code uses it.

The key file is hardened exactly like the `~/.github_tokens/*.txt` files — it must be a **regular file** (not a symlink), mode **`0600`**, owned by **`$USER`**, and is read as a single CRLF-stripped first line. Unlike the GH-token block, `--use-api-key` is **fail-closed**: because you asked for API billing explicitly, any problem (missing file, wrong perms, symlink, empty) exits non-zero rather than silently launching on the subscription. Add `~/.config/anthropic-api-key.txt:0600` to the §9 file-mode invariants if you keep a key on disk.

## 7. Risk model

### What you delegate to upstream

`safehouse` runs **outside** the sandbox at your UID, before `sandbox-exec` is invoked. It is the privilege boundary for every agent launch. Whatever it composes, the agent inherits. Four things in particular flow from upstream into your launches:

1. **Profile-fragment content** — `(allow ...)` rules in `profiles/30-toolchains/*`, `profiles/55-integrations-optional/*`, `profiles/60-agents/*`. A future commit could broaden these (e.g., add `(allow file-read* (home-subpath "/.aws"))` to a fragment that auto-applies to claude-code).
2. **Transitive metadata** — `$$require=...$$` in agent profiles auto-pulls additional fragments. New `require` lines pull new fragments without you opting in.
3. **Env-default injection** — `$$exec-env-default=KEY=VAL$$` lines inject env vars into the sandboxed process. A weaponized fragment could set `HTTPS_PROXY`, `npm_config_registry`, `PIP_INDEX_URL`, or `GIT_PROXY_COMMAND`.
4. **Renderer code** — `~3–5 kLOC` of bash in `bin/lib/*.sh` runs at every launch with your UID. Compromise here is arbitrary code execution outside any jail.

`agent-safehouse` is single-maintainer (`eugene1g`) and distributed via Homebrew. Single account compromise = full pwn for users on the next `brew upgrade`.

### Why the chosen mitigations work

- **`brew pin agent-safehouse`** stops unattended upgrades. Combined with the §8 review checklist, you opt into upgrades only after diffing.
- **No `--trust-workdir-config`** removes the auto-load of project-level `.safehouse` files. `.safehouse` schema is restricted to `add-dirs-ro=` and `add-dirs=` (per `bin/lib/policy/request.sh`), so a malicious file can't add arbitrary `(allow …)` rules — but path grants still matter (`add-dirs-ro=~/.aws` would expose AWS creds). Requiring those grants via the trust-hashed `.sandbox/` convention keeps them visible.
- **`./.sandbox/profile.sb` + `./.sandbox/flags`** are content-hash-trusted. The shim refuses to launch when an untrusted or drifted file is detected. `safe-claude --trust-project` is the explicit operator action that imports a content hash; any subsequent edit forces a re-trust. The `flags` file is also passed through a strict allowlist (`--add-dirs-ro=`, `--add-dirs=`, `--enable=`, `--env-pass=`), so a compromised file can't pivot to `--append-profile=`, `--exec-host=`, or runtime-injection flags safehouse may add later.
- **Narrow `--env-pass=`** caps the env-borne blast radius if a profile fragment is compromised. It does **not** cap data-on-disk exfiltration — anything the sandbox can read can still be exfiltrated via the wide-open network. The env-pass narrowing is one of multiple controls, not a sufficient one.
- **Pinned `SAFEHOUSE_BIN`** prevents PATH manipulation from redirecting the renderer to an attacker-supplied binary at the user UID.
- **`--append-profile=` for local overrides** rather than editing system files keeps your own additions auditable and version-controllable separately from upstream.
- **Token-file permission and symlink checks** close the symlink-race path where a swap inside `~/.github_tokens/` could feed sensitive file contents into `GH_TOKEN` and out via `--env-pass`.
- **GnuPG private-key directory explicitly denied** keeps signing-key material unreadable to the agent even though the public keyring and trust DB are readable for `gpg --sign` to work via the host-side `gpg-agent` socket.

### Residual risk you accept

- A maintainer-account compromise between two of your reviewed upgrades can land malicious changes that you've already pulled.
- Network egress (`profiles/20-network.sb`) is wide-open and unconfigurable. Anything the sandbox can reach on disk can be sent over the wire.
- The shim itself is a file you maintain. A typo (e.g., `--env` instead of `--env-pass=`, or a missing branch in the trust-hash check) silently broadens exposure. Re-read it after each upgrade-rehearsal in §8.
- The agent (Claude Code) is itself a frequently-updated binary with its own auto-update mechanism, out of `safehouse`'s scope.
- `sandbox-exec` is marked deprecated by Apple (`man sandbox-exec`). Documented bypasses have existed historically. The boundary is best-effort, not formally verified.
- Project-loaded MCP servers (`.mcp.json`) and `CLAUDE.md` directives run inside the sandbox but extend the agent's tool surface. A freshly-cloned branch may carry attacker-supplied MCP configuration; review `.mcp.json` and `CLAUDE.md` along with the rest of a PR before launching against it.

## 8. Upgrade checks

Run these whenever you decide to take an upstream `safehouse` update.

### 8.1 Read what's changing before unpinning

```bash
# Robust version extraction: take any semver-shaped token from --version.
INSTALLED=$(safehouse --version | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1)
[[ -n "$INSTALLED" ]] || { echo "couldn't parse safehouse --version" >&2; exit 1; }
echo "installed: $INSTALLED"

brew log --oneline agent-safehouse | head -20

LATEST=$(gh api repos/eugene1g/agent-safehouse/releases/latest --jq .tag_name)
echo "latest: $LATEST"
gh api "repos/eugene1g/agent-safehouse/compare/v${INSTALLED}...${LATEST}" \
  --jq '.files[] | select(.filename | test("^(profiles/|bin/lib/)")) | "\(.status) \(.filename)"'
```

Skim the diff for additions to:

- `profiles/40-shared/agent-common.sb` (applied to every agent)
- `profiles/60-agents/claude-code.sb` (the agent you launch)
- `profiles/00-base.sb`, `10-system-runtime.sb`, `20-network.sb` (foundation)
- Any new `$$require=...$$` line in profiles you currently use
- Any new `$$exec-env-default=...$$` line
- Any `bin/lib/policy/*.sh` change (renderer logic)

If anything looks unfamiliar, hold the upgrade and read the linked PR/issue.

### 8.2 Audit the rendered policy before and after

```bash
# Before upgrade.
safehouse \
  --append-profile=$HOME/.config/agent-safehouse/local-overrides.sb \
  --stdout > /tmp/policy-before.sb

brew unpin agent-safehouse
brew upgrade agent-safehouse
brew pin agent-safehouse

# After upgrade.
safehouse \
  --append-profile=$HOME/.config/agent-safehouse/local-overrides.sb \
  --stdout > /tmp/policy-after.sb

diff -u /tmp/policy-before.sb /tmp/policy-after.sb | less
```

In the diff, look for:

- `(allow file-read*` or `(allow file-read* file-write*` over `home-subpath` containing `.aws`, `.ssh` (anything beyond the existing `config`/`known_hosts`), `.gnupg/private-keys-v1.d`, `.config/git/credentials`, `Library/Keychains`, `Library/Application Support/<provider>`.
- New `(allow network-outbound …)` rules.
- New `(allow process-exec)` or `mach-lookup` entries.
- Newly-added env defaults injected via the renderer.

### 8.3 Re-review your local overrides

Upstream-diff misses changes to your own files. Once per upgrade (or quarterly, whichever is sooner):

```bash
shasum -a 256 -c <<<"$(cat ~/.config/agent-safehouse/local-overrides.sb.sha256) ~/.config/agent-safehouse/local-overrides.sb"
# If this fails, open the file and review the change before refreshing the baseline.
```

### 8.4 Run §9 smoke tests after each upgrade

The smoke set in §9 is the minimum signal that nothing regressed.

### 8.5 Rollback

```bash
brew unpin agent-safehouse
brew uninstall agent-safehouse
brew install eugene1g/safehouse/agent-safehouse@<previous-version>
brew pin agent-safehouse
```

If no version-pin tap is available, restore from `~/Library/Caches/Homebrew/Cask/agent-safehouse--<version>.tar.gz` or reinstall from the GitHub release asset directly.

## 9. Smoke tests

Run from any project after setup, and after every upgrade.

```bash
# 0. File-mode and ownership invariants.
for f in \
  ~/.sandbox/safe-claude.sh:0700 \
  ~/.config/agent-safehouse:0700 \
  ~/.config/agent-safehouse/local-overrides.sb:0600 \
  ~/.config/agent-safehouse/local-overrides.sb.sha256:0600 \
  ~/.github_tokens:0700 ; do
  path="${f%:*}"; want="${f#*:}"
  have=$(stat -f '%Lp' "$path" 2>/dev/null || echo "MISSING")
  owner=$(stat -f '%Su' "$path" 2>/dev/null || echo "")
  [[ "$have" == "$want" && "$owner" == "$USER" ]] \
    || echo "FAIL: $path mode=$have owner=$owner (want $want $USER)"
done
shasum -a 256 -c <<<"$(cat ~/.config/agent-safehouse/local-overrides.sb.sha256)  $HOME/.config/agent-safehouse/local-overrides.sb"

# 1. PATH-pin: which `safehouse` agrees with the shim's pinned path.
[[ "$(which safehouse)" == "/opt/homebrew/bin/safehouse" ]] \
  || echo "FAIL: PATH safehouse != /opt/homebrew/bin/safehouse"

# 2. Override is appended to the rendered policy.
safehouse --append-profile=$HOME/.config/agent-safehouse/local-overrides.sb \
          --stdout | grep -qE 'gnupg|showboat' \
  && echo OK || echo "FAIL: overrides not in rendered policy"

# 3. Launch Claude inside the sandbox.
cd ~/dev/some-project
safe-claude /help    # claude should start without "permission denied"

# 4. Inside Claude, verify tooling is reachable:
#    - showboat --version             → version string
#    - gh auth status                  → authenticated (if token file exists)
#    - git log -1                      → reads workdir
#    - git commit --allow-empty -S -m smoke
#                                      → succeeds (gpg-agent signing works)
#    - cat ~/.gnupg/private-keys-v1.d/<keygrip>.key
#                                      → permission denied (deny rule effective)

# 5. Sensitive-path canaries. The shell exports a known canary; inside the
#    sandbox the var must be empty, proving --env-pass excludes it.
API_TOKEN=canary-must-not-leak \
AWS_SECRET_ACCESS_KEY=canary-must-not-leak \
HCLOUD_TOKEN=canary-must-not-leak \
  safe-claude /help
#    - Inside: echo "$API_TOKEN $AWS_SECRET_ACCESS_KEY $HCLOUD_TOKEN"
#                                      → three spaces, no canary

#    - cat ~/.aws/credentials          → permission denied
#    - ls ~/.ssh                       → only config + known_hosts; no id_*

# 6. Trust gate.
cd ~/dev/<project-with-.sandbox>
safe-claude /help                     # → launches, banner shows .sandbox/profile.sb applied
# Edit .sandbox/profile.sb (add a comment line).
safe-claude /help                     # → exits 2 with "untrusted .sandbox/"
safe-claude --trust-project           # → "trusted <path> at <sha>"
safe-claude /help                     # → launches again
# Drop a forbidden flag into .sandbox/flags.
echo '--append-profile=/tmp/evil.sb' >> .sandbox/flags
safe-claude --trust-project
safe-claude /help                     # → exits 2 "refusing disallowed flag"

# 7. Symlink rejection on the override file.
ln -sf /etc/passwd /tmp/overrides-poc.sb
SAFEHOUSE_BIN=/opt/homebrew/bin/safehouse \
  mv ~/.config/agent-safehouse/local-overrides.sb{,.real}
ln -sf /tmp/overrides-poc.sb ~/.config/agent-safehouse/local-overrides.sb
safe-claude /help                     # → exits 2 "refusing symlinked ..."
mv ~/.config/agent-safehouse/local-overrides.sb.real ~/.config/agent-safehouse/local-overrides.sb
rm /tmp/overrides-poc.sb
```

If any test fails, run `safehouse --stdout` (with the same `--append-profile` flags) and grep for the missing or surprising rule. Fix by adding `--enable=<feature>` (for upstream optional integrations), a narrow line in `local-overrides.sb` (for one-offs), or `.sandbox/flags` + `--trust-project` (for per-project grants).

### 9.1 Periodic drift check

Run the §9 set once a week, headless, via launchd. Notify on regression. The setup is unattended-pinned; without a scheduled run, drift in modes, hashes, or PATH ordering goes undetected indefinitely.
