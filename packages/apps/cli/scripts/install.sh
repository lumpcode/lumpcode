#!/usr/bin/env bash
# lumpcode install.sh — POSIX (Linux + macOS)
set -euo pipefail
PREFIX="${HOME}/.local"
COMMAND_NAME="${LUMPCODE_COMMAND_NAME:-lumpcode}"
VERSION="${LUMPCODE_VERSION:-latest}"
REPO="${LUMPCODE_INSTALL_REPO:-YOUR_ORG/Lumpcode}"
LOCAL_BIN_DIR=""
usage() {
  cat <<'EOF'
Usage: install.sh [options]
  --local <path>   Install from a built bin/ dir (dev/test; skips download)
  --prefix <dir>   Install root (default: ~/.local)
  --name <command> Symlink name in bin/ (default: lumpcode; e.g. lumpcode-beta)
  --version <tag>  Release tag, e.g. v1.0.0 (default: latest)
  -h, --help       Show this help
Examples:
  curl -fsSL https://lumpcode.com/install.sh | bash
  ./install.sh --local /path/to/Lumpcode/packages/apps/cli/bin
  ./install.sh --local /path/to/bin --name lumpcode-beta
EOF
}
while [[ $# -gt 0 ]]; do
  case "$1" in
    --local) LOCAL_BIN_DIR="${2:?missing path}"; shift 2 ;;
    --prefix) PREFIX="${2:?}"; shift 2 ;;
    --name) COMMAND_NAME="${2:?missing command name}"; shift 2 ;;
    --version) VERSION="${2:?}"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown option: $1" >&2; usage; exit 1 ;;
  esac
done
resolve_install_paths() {
  if [[ ! "$COMMAND_NAME" =~ ^[a-zA-Z0-9_-]+$ ]]; then
    echo "Invalid command name: $COMMAND_NAME (use letters, digits, _, -)" >&2
    exit 1
  fi
  LIB_DIR="${PREFIX}/lib/${COMMAND_NAME}"
  BIN_DIR="${PREFIX}/bin"
  BIN_LINK="${BIN_DIR}/${COMMAND_NAME}"
}
detect_platform_arch() {
  local platform arch_name
  platform="$(uname -s | tr '[:upper:]' '[:lower:]')"
  arch="$(uname -m)"
  case "$arch" in
    x86_64) arch_name=x64 ;;
    arm64|aarch64) arch_name=arm64 ;;
    *) echo "Unsupported architecture: $arch" >&2; exit 1 ;;
  esac
  case "$platform" in
    linux|darwin) ;;
    *) echo "Unsupported OS: $platform (use install.ps1 on Windows)" >&2; exit 1 ;;
  esac
  PLATFORM="$platform"
  ARCH_NAME="$arch_name"
  ASSET_BASE="lumpcode-${PLATFORM}-${ARCH_NAME}"
}
install_from_dir() {
  local src="$1"
  local binary="${src}/${ASSET_BASE}"
  if [[ ! -f "$binary" ]]; then
    echo "Expected binary not found: $binary" >&2
    echo "Contents of $src:" >&2
    ls -la "$src" >&2 || true
    exit 1
  fi
  if [[ ! -d "${src}/schemas" || ! -d "${src}/presets" ]]; then
    echo "Missing schemas/ or presets/ next to binary under $src" >&2
    exit 1
  fi
  mkdir -p "$LIB_DIR" "$BIN_DIR"
  install -m 755 "$binary" "${LIB_DIR}/lumpcode"
  rm -rf "${LIB_DIR}/schemas" "${LIB_DIR}/presets"
  cp -R "${src}/schemas" "${LIB_DIR}/schemas"
  cp -R "${src}/presets" "${LIB_DIR}/presets"
  ln -sf "${LIB_DIR}/lumpcode" "${BIN_LINK}"
  echo "Installed to ${LIB_DIR}"
  echo "  ${COMMAND_NAME} -> ${BIN_LINK}"
}
reinstall_global_presets() {
  "${LIB_DIR}/lumpcode" reset-presets
}
install_from_release() {
  local url checksum_url tmp
  tmp="$(mktemp -d)"
  trap 'rm -rf "$tmp"' EXIT
  if [[ "$VERSION" == "latest" ]]; then
    url="https://github.com/${REPO}/releases/latest/download/${ASSET_BASE}.tar.gz"
    checksum_url="https://github.com/${REPO}/releases/latest/download/${ASSET_BASE}.tar.gz.sha256"
  else
    url="https://github.com/${REPO}/releases/download/${VERSION}/${ASSET_BASE}.tar.gz"
    checksum_url="https://github.com/${REPO}/releases/download/${VERSION}/${ASSET_BASE}.tar.gz.sha256"
  fi
  curl -fsSL "$url" -o "${tmp}/archive.tar.gz"
  if curl -fsSL "$checksum_url" -o "${tmp}/archive.tar.gz.sha256" 2>/dev/null; then
    (cd "$tmp" && sha256sum -c archive.tar.gz.sha256)
  fi
  tar -xzf "${tmp}/archive.tar.gz" -C "$tmp"
  # Tarball layout: lumpcode + schemas/ + presets/ at top level
  install_from_dir "$tmp"
}
main() {
  resolve_install_paths
  detect_platform_arch
  if [[ -n "$LOCAL_BIN_DIR" ]]; then
    LOCAL_BIN_DIR="$(cd "$LOCAL_BIN_DIR" && pwd)"
    install_from_dir "$LOCAL_BIN_DIR"
  else
    install_from_release
  fi
  if ! command -v "$COMMAND_NAME" >/dev/null 2>&1; then
    echo ""
    echo "Add to PATH (e.g. in ~/.bashrc or ~/.zshrc):"
    echo "  export PATH=\"${BIN_DIR}:\$PATH\""
  fi
  "${LIB_DIR}/lumpcode" --help >/dev/null
  reinstall_global_presets
  echo "OK: $( "${LIB_DIR}/lumpcode" --version 2>/dev/null || echo "${COMMAND_NAME} runs" )"
}
main