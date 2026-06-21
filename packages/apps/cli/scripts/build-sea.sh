#!/bin/bash
set -e

# Detect platform and architecture
PLATFORM=$(uname -s | tr '[:upper:]' '[:lower:]')
ARCH=$(uname -m)

# Normalize architecture name
if [[ "$ARCH" = "arm64" || "$ARCH" = "aarch64" ]]; then
    ARCH_NAME="arm64"
elif [[ "$ARCH" = "x86_64" ]]; then
    ARCH_NAME="x64"
else
    ARCH_NAME="$ARCH"
fi

# Handle Windows (MINGW/MSYS)
if [[ "$PLATFORM" = "mingw"* || "$PLATFORM" = "msys"* || "$PLATFORM" = "cygwin"* ]]; then
    PLATFORM="windows"
fi

OUTPUT_NAME="lumpcode-${PLATFORM}-${ARCH_NAME}"
BIN_DIR="bin"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_DIR"

echo "🔨 Building SEA binary for $PLATFORM-$ARCH_NAME..."

# Generate SEA blob
echo "📦 Generating SEA blob..."
node --experimental-sea-config sea-config.json

# Create bin directory
mkdir -p "$BIN_DIR"

# Copy and prepare node binary
echo "📋 Copying Node.js binary..."
if [[ "$PLATFORM" = "windows" ]]; then
    cp "$(command -v node)" "$BIN_DIR/$OUTPUT_NAME.exe"
    
    echo "💉 Injecting SEA blob..."
    npx postject "$BIN_DIR/$OUTPUT_NAME.exe" NODE_SEA_BLOB dist/sea-prep.blob \
        --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2
else
    cp "$(command -v node)" "$BIN_DIR/$OUTPUT_NAME"
    
    # Remove signature on macOS (required before modifying binary)
    if [[ "$PLATFORM" = "darwin" ]]; then
        echo "🔓 Removing existing code signature..."
        codesign --remove-signature "$BIN_DIR/$OUTPUT_NAME"
    fi
    
    # Inject the SEA blob
    echo "💉 Injecting SEA blob..."
    if [[ "$PLATFORM" = "darwin" ]]; then
        npx postject "$BIN_DIR/$OUTPUT_NAME" NODE_SEA_BLOB dist/sea-prep.blob \
            --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2 \
            --macho-segment-name NODE_SEA
        
        # Re-sign on macOS
        echo "🔐 Re-signing binary..."
        codesign --sign - "$BIN_DIR/$OUTPUT_NAME"
    else
        npx postject "$BIN_DIR/$OUTPUT_NAME" NODE_SEA_BLOB dist/sea-prep.blob \
            --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2
    fi
fi

# JSON schemas for SEA (validateLumpJsonConfig resolves next to execPath)
mkdir -p "$BIN_DIR/schemas"
cp -f src/schemas/*.json "$BIN_DIR/schemas/"

# Preset command modules (ensurePresetCommandsInstalled copies from bundle source)
mkdir -p "$BIN_DIR/presets/commands/utils"
cp -f src/presets/commands/*.js "$BIN_DIR/presets/commands/"
cp -f src/presets/commands/utils/*.js "$BIN_DIR/presets/commands/utils/"

# esbuild native binary for TypeScript transpile in SEA
ESBUILD_PKG="@esbuild/${PLATFORM}-${ARCH_NAME}"
if [[ "$PLATFORM" = "windows" ]]; then
    ESBUILD_PKG="@esbuild/win32-${ARCH_NAME}"
fi
ESBUILD_SRC=""
for NODE_MODULES_ROOT in "$PROJECT_DIR" "$PROJECT_DIR/../../.."; do
    CAND="$(cd "$NODE_MODULES_ROOT" && pwd)/node_modules/${ESBUILD_PKG}/bin/esbuild"
    if [[ "$PLATFORM" = "windows" ]]; then
        CAND="${CAND}.exe"
    fi
    if [[ -f "$CAND" ]]; then
        ESBUILD_SRC="$CAND"
        break
    fi
done
if [[ -z "$ESBUILD_SRC" ]]; then
    echo "❌ esbuild platform binary not found for ${ESBUILD_PKG}" >&2
    exit 1
fi
if [[ "$PLATFORM" = "windows" ]]; then
    cp -f "$ESBUILD_SRC" "$BIN_DIR/esbuild.exe"
else
    cp -f "$ESBUILD_SRC" "$BIN_DIR/esbuild"
fi

# Make executable
chmod +x "$BIN_DIR/$OUTPUT_NAME"* 2>/dev/null || true

echo ""
echo "✅ Binary created: $BIN_DIR/$OUTPUT_NAME"
echo "   Run it with: ./$BIN_DIR/$OUTPUT_NAME"

