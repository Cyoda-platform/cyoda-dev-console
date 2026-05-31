# Release Process

This document covers the end-to-end release process for Cyoda Dev Console: cutting a GitHub release with signed and notarized macOS DMG artifacts, and publishing the Homebrew cask.

---

## Prerequisites

Before cutting the first release, complete these one-time setup steps.

### 1. Apple Developer account

You need an Apple Developer account enrolled in the Apple Developer Program (paid, required for Developer ID signing and notarization).

### 2. Code-signing certificate

1. In Xcode → Settings → Accounts, select your team and click **Manage Certificates**.
2. Create a **Developer ID Application** certificate if one does not already exist.
3. Export the certificate from Keychain Access as a `.p12` file and note the password you set.
4. Base64-encode the file:

   ```bash
   base64 -i DeveloperID.p12 | pbcopy
   ```

### 3. App-specific password for notarization

1. Go to [appleid.apple.com](https://appleid.apple.com) → Sign-In and Security → App-Specific Passwords.
2. Generate a password labelled `cyoda-dev-console-ci`.

### 4. GitHub repository secrets

Add the following secrets to **Cyoda-platform/cyoda-dev-console** → Settings → Secrets and variables → Actions:

| Secret | Value |
|---|---|
| `APPLE_CERTIFICATE` | Base64-encoded `.p12` certificate (from step 2) |
| `APPLE_CERTIFICATE_PASSWORD` | Password used when exporting the `.p12` |
| `APPLE_SIGNING_IDENTITY` | Certificate common name, e.g. `Developer ID Application: Cyoda Ltd (ABC123DEFG)` |
| `APPLE_ID` | Apple ID email address used for notarization |
| `APPLE_PASSWORD` | App-specific password from step 3 |
| `APPLE_TEAM_ID` | 10-character Apple Developer Team ID (visible in developer.apple.com → Account) |

---

## Cutting a release

### Step 1 — Update the version

In `apps/dev-console/src-tauri/tauri.conf.json`, increment `"version"` using [Semantic Versioning](https://semver.org):

```json
{
  "version": "0.2.0"
}
```

Commit the change:

```bash
git add apps/dev-console/src-tauri/tauri.conf.json
git commit -m "Bump version to 0.2.0"
```

### Step 2 — Push a version tag

The release workflow triggers on any tag matching `v*.*.*`.

```bash
git tag v0.2.0
git push origin v0.2.0
```

### Step 3 — Monitor the GitHub Actions run

Go to **Actions → Release** in the repository. The workflow runs two parallel jobs — one for Apple Silicon (`aarch64-apple-darwin`) and one for Intel (`x86_64-apple-darwin`). Each job:

1. Installs dependencies.
2. Imports the code-signing certificate into the runner keychain.
3. Builds the Tauri app, signs it with Developer ID, and submits it to Apple for notarization (handled automatically by the Tauri CLI when the `APPLE_*` environment variables are present).
4. Uploads the `.dmg` artifact to the GitHub release.

A successful run attaches two files to the release:

```
Cyoda-Dev-Console_0.2.0_aarch64.dmg
Cyoda-Dev-Console_0.2.0_x86_64.dmg
```

If either job fails, the most common causes are:

- **Certificate not found** — verify `APPLE_SIGNING_IDENTITY` exactly matches the certificate common name shown in Keychain Access.
- **Notarization rejected** — check the notarization log printed by the Tauri CLI for the specific rejection reason (usually a missing entitlement or hardened-runtime flag).
- **Stapling failed** — transient Apple notarization service issue; re-run the workflow job.

### Step 4 — Verify the release artifacts

Download both DMGs from the GitHub release page and verify they pass Gatekeeper on a clean macOS user account:

```bash
spctl --assess --type execute --verbose "Cyoda Dev Console.app"
# Expected: source=Notarized Developer ID
```

---

## Updating the Homebrew cask

The cask formula lives in `homebrew/cyoda-dev-console.rb`. After each release, update the version and SHA256 hashes.

### Step 1 — Download the release DMGs

```bash
gh release download v0.2.0 --repo Cyoda-platform/cyoda-dev-console --dir /tmp/release
```

### Step 2 — Compute SHA256 hashes

```bash
./scripts/update-cask-sha.sh \
  /tmp/release/Cyoda-Dev-Console_0.2.0_aarch64.dmg \
  /tmp/release/Cyoda-Dev-Console_0.2.0_x86_64.dmg
```

The script prints two lines ready to paste into the cask:

```
  sha256 arm:   "abc123...",
         intel: "def456..."
```

### Step 3 — Edit the cask formula

Open `homebrew/cyoda-dev-console.rb` and update `version` and `sha256`:

```ruby
cask "cyoda-dev-console" do
  version "0.2.0"
  sha256 arm:   "abc123...",
         intel: "def456..."
  ...
end
```

### Step 4 — Test the cask locally

```bash
brew install --cask ./homebrew/cyoda-dev-console.rb
open -a "Cyoda Dev Console"
brew uninstall --cask cyoda-dev-console
```

### Step 5 — Commit and publish to the tap

Commit the updated cask to this repository:

```bash
git add homebrew/cyoda-dev-console.rb
git commit -m "Homebrew cask: bump to v0.2.0"
git push
```

Then copy the updated file into the Cyoda Homebrew tap repository (`cyoda/homebrew-cyoda`) so users can install without a local checkout:

```bash
cp homebrew/cyoda-dev-console.rb path/to/homebrew-cyoda/Casks/cyoda-dev-console.rb
cd path/to/homebrew-cyoda && git add . && git commit -m "cyoda-dev-console 0.2.0" && git push
```

Once the tap is updated, users install with:

```bash
brew install --cask cyoda/cyoda/cyoda-dev-console
```

---

## Upgrade verification checklist

Run this on a clean macOS user account after every release:

- [ ] `brew install --cask cyoda/cyoda/cyoda-dev-console` completes without errors.
- [ ] App launches — no Gatekeeper "unidentified developer" warning.
- [ ] First-run wizard appears on a fresh install; skipped on upgrade.
- [ ] Select a project folder → scan, edit, and save a workflow file without errors.
- [ ] `brew upgrade --cask cyoda-dev-console` replaces the app and preserves `~/Library/Application Support/Cyoda Dev Console/`.
- [ ] `brew uninstall --cask cyoda-dev-console` removes the app; `brew uninstall --zap --cask cyoda-dev-console` also removes preferences and saved state.

---

## No in-app auto-update

In-app auto-update is intentionally disabled in this release. All updates are delivered via `brew upgrade`. See `docs/specs.md` §5.3 for the rationale.
