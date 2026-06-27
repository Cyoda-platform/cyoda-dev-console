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
