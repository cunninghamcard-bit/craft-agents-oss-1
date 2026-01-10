#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ELECTRON_DIR="$(dirname "$SCRIPT_DIR")"
ROOT_DIR="$(dirname "$(dirname "$ELECTRON_DIR")")"

# Load environment variables from .env
if [ -f "$ROOT_DIR/.env" ]; then
    set -a
    source "$ROOT_DIR/.env"
    set +a
fi

# Parse arguments
ARCH="arm64"
UPLOAD=false
UPLOAD_LATEST=false
UPLOAD_SCRIPT=false

while [[ $# -gt 0 ]]; do
    case $1 in
        arm64|x64)
            ARCH="$1"
            shift
            ;;
        --upload)
            UPLOAD=true
            shift
            ;;
        --latest)
            UPLOAD_LATEST=true
            shift
            ;;
        --script)
            UPLOAD_SCRIPT=true
            shift
            ;;
        -h|--help)
            echo "Usage: build-dmg.sh [arm64|x64] [--upload] [--latest] [--script]"
            echo ""
            echo "Arguments:"
            echo "  arm64|x64    Target architecture (default: arm64)"
            echo "  --upload     Upload DMG to S3 after building"
            echo "  --latest     Also update electron/latest (requires --upload)"
            echo "  --script     Also upload install-app.sh (requires --upload)"
            echo ""
            echo "Environment variables (from .env or environment):"
            echo "  APPLE_SIGNING_IDENTITY    - Code signing identity"
            echo "  APPLE_ID                  - Apple ID for notarization"
            echo "  APPLE_TEAM_ID             - Apple Team ID"
            echo "  APPLE_APP_SPECIFIC_PASSWORD - App-specific password"
            echo "  S3_VERSIONS_BUCKET_*      - S3 credentials (for --upload)"
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            echo "Run with --help for usage"
            exit 1
            ;;
    esac
done

# Configuration
BUN_VERSION="bun-v1.3.5"  # Pinned version for reproducible builds

# Code signing configuration (from .env)
SIGN_APP="${APPLE_SIGNING_IDENTITY:-}"

echo "=== Building Craft Agent DMG (${ARCH}) ==="
if [ "$UPLOAD" = true ]; then
    echo "Will upload to S3 after build"
fi

# 1. Clean previous build artifacts
echo "Cleaning previous builds..."
rm -rf "$ELECTRON_DIR/vendor"
rm -rf "$ELECTRON_DIR/node_modules/@anthropic-ai"
rm -rf "$ELECTRON_DIR/packages"
rm -rf "$ELECTRON_DIR/release"

# 2. Install dependencies
echo "Installing dependencies..."
cd "$ROOT_DIR"
bun install

# 3. Download Bun binary with checksum verification
echo "Downloading Bun ${BUN_VERSION} for darwin-${ARCH}..."
mkdir -p "$ELECTRON_DIR/vendor/bun"
if [ "$ARCH" = "arm64" ]; then
    BUN_DOWNLOAD="bun-darwin-aarch64"
else
    BUN_DOWNLOAD="bun-darwin-x64"
fi

# Create temp directory to avoid race conditions
TEMP_DIR=$(mktemp -d)
trap "rm -rf $TEMP_DIR" EXIT

# Download binary and checksums
curl -fSL "https://github.com/oven-sh/bun/releases/download/${BUN_VERSION}/${BUN_DOWNLOAD}.zip" -o "$TEMP_DIR/${BUN_DOWNLOAD}.zip"
curl -fSL "https://github.com/oven-sh/bun/releases/download/${BUN_VERSION}/SHASUMS256.txt" -o "$TEMP_DIR/SHASUMS256.txt"

# Verify checksum
echo "Verifying checksum..."
cd "$TEMP_DIR"
grep "${BUN_DOWNLOAD}.zip" SHASUMS256.txt | shasum -a 256 -c -
cd - > /dev/null

# Extract and install
unzip -o "$TEMP_DIR/${BUN_DOWNLOAD}.zip" -d "$TEMP_DIR"
cp "$TEMP_DIR/${BUN_DOWNLOAD}/bun" "$ELECTRON_DIR/vendor/bun/"
chmod +x "$ELECTRON_DIR/vendor/bun/bun"

# 4. Copy SDK from root node_modules (monorepo hoisting)
# Note: The SDK is hoisted to root node_modules by the package manager.
# We copy it here because electron-packager only sees apps/electron/.
SDK_SOURCE="$ROOT_DIR/node_modules/@anthropic-ai/claude-agent-sdk"
if [ ! -d "$SDK_SOURCE" ]; then
    echo "ERROR: SDK not found at $SDK_SOURCE"
    echo "Run 'bun install' from the repository root first."
    exit 1
fi
echo "Copying SDK..."
mkdir -p "$ELECTRON_DIR/node_modules/@anthropic-ai"
cp -r "$SDK_SOURCE" "$ELECTRON_DIR/node_modules/@anthropic-ai/"

# 5. Copy interceptor
INTERCEPTOR_SOURCE="$ROOT_DIR/packages/shared/src/cache-ttl-interceptor.ts"
if [ ! -f "$INTERCEPTOR_SOURCE" ]; then
    echo "ERROR: Interceptor not found at $INTERCEPTOR_SOURCE"
    echo "Ensure packages/shared/src/cache-ttl-interceptor.ts exists."
    exit 1
fi
echo "Copying interceptor..."
mkdir -p "$ELECTRON_DIR/packages/shared/src"
cp "$INTERCEPTOR_SOURCE" "$ELECTRON_DIR/packages/shared/src/"

# 6. Build Electron app
echo "Building Electron app..."
cd "$ROOT_DIR"
bun run electron:build

# 7. Package with electron-packager (no ASAR for subprocess compatibility)
echo "Packaging app..."
cd "$ELECTRON_DIR"
npx electron-packager . "Craft Agent" \
    --platform=darwin \
    --arch="$ARCH" \
    --out=release \
    --overwrite \
    --icon=resources/icon.icns \
    --app-bundle-id=com.lukilabs.craft-agent \
    --no-prune \
    --ignore="node_modules/@types" \
    --ignore="node_modules/typescript" \
    --ignore="node_modules/eslint" \
    --ignore="node_modules/@eslint" \
    --ignore="node_modules/prettier" \
    --ignore="node_modules/@typescript-eslint" \
    --ignore="node_modules/vite" \
    --ignore="node_modules/@vitejs" \
    --ignore="node_modules/esbuild" \
    --ignore="node_modules/tailwindcss" \
    --ignore="node_modules/postcss" \
    --ignore="node_modules/autoprefixer" \
    --ignore="\.map$" \
    --ignore="node_modules/.*\.ts$" \
    --ignore="node_modules/.*\.tsx$" \
    --ignore="\.md$" \
    --ignore="LICENSE" \
    --ignore="CHANGELOG" \
    --ignore="README" \
    --ignore="__tests__" \
    --ignore="test" \
    --ignore="tests" \
    --ignore="\.test\." \
    --ignore="\.spec\." \
    --no-asar

# 8. Code sign the app
APP_PATH="release/Craft Agent-darwin-${ARCH}/Craft Agent.app"
if [ -n "$SIGN_APP" ]; then
    echo "Signing app with Developer ID..."

    # Sign all nested binaries first (deepest first)
    echo "Signing nested binaries (.node, .dylib, rg)..."
    find "$APP_PATH" -type f \( -name "*.node" -o -name "*.dylib" -o -name "rg" \) | while read -r binary; do
        echo "  Signing: $binary"
        codesign --force --options runtime --timestamp --sign "$SIGN_APP" "$binary"
    done

    # Sign executables in framework Helpers and Resources
    echo "Signing framework executables..."
    for exe in "$APP_PATH/Contents/Frameworks/Electron Framework.framework/Versions/A/Helpers/chrome_crashpad_handler" \
               "$APP_PATH/Contents/Frameworks/Squirrel.framework/Versions/A/Resources/ShipIt"; do
        if [ -f "$exe" ]; then
            echo "  Signing: $exe"
            codesign --force --options runtime --timestamp --sign "$SIGN_APP" "$exe"
        fi
    done

    # Sign frameworks
    echo "Signing frameworks..."
    find "$APP_PATH/Contents/Frameworks" -type d -name "*.framework" | while read -r framework; do
        echo "  Signing: $framework"
        codesign --force --options runtime --timestamp --sign "$SIGN_APP" "$framework"
    done

    # Sign helper apps
    echo "Signing helper apps..."
    find "$APP_PATH/Contents/Frameworks" -type d -name "*.app" | while read -r helper; do
        echo "  Signing: $helper"
        codesign --force --options runtime --timestamp --sign "$SIGN_APP" "$helper"
    done

    # Sign the main app
    echo "Signing main app..."
    codesign --force --options runtime --timestamp --sign "$SIGN_APP" "$APP_PATH"
else
    echo "Ad-hoc signing app (no APPLE_SIGNING_IDENTITY set)..."
    codesign --force --deep --sign - "$APP_PATH"
fi
echo "Verifying signature..."
codesign --verify --verbose "$APP_PATH"

# 9. Create DMG
echo "Creating DMG..."
DMG_NAME="Craft-Agent-${ARCH}.dmg"
hdiutil create \
    -volname "Craft Agent" \
    -srcfolder "release/Craft Agent-darwin-${ARCH}/Craft Agent.app" \
    -ov \
    -format UDZO \
    "release/${DMG_NAME}"

# 10. Sign the DMG
if [ -n "$SIGN_APP" ]; then
    echo "Signing DMG..."
    codesign --force --sign "$SIGN_APP" "release/${DMG_NAME}"
fi

# 11. Notarize (if credentials are available)
if [ -n "$SIGN_APP" ] && [ -n "$APPLE_ID" ] && [ -n "$APPLE_TEAM_ID" ] && [ -n "$APPLE_APP_SPECIFIC_PASSWORD" ]; then
    echo "Submitting for notarization..."
    if xcrun notarytool submit "release/${DMG_NAME}" \
        --apple-id "$APPLE_ID" \
        --team-id "$APPLE_TEAM_ID" \
        --password "$APPLE_APP_SPECIFIC_PASSWORD" \
        --wait; then
        echo "Stapling notarization ticket..."
        xcrun stapler staple "release/${DMG_NAME}"
    else
        echo "ERROR: Notarization failed. Check the log with:"
        echo "  xcrun notarytool log <submission-id> --apple-id \"$APPLE_ID\" --team-id \"$APPLE_TEAM_ID\" --password \"$APPLE_APP_SPECIFIC_PASSWORD\""
        exit 1
    fi
else
    echo "Skipping notarization (credentials not configured in .env)"
fi

echo ""
echo "=== Build Complete ==="
echo "DMG: $ELECTRON_DIR/release/${DMG_NAME}"
echo "Size: $(du -h "$ELECTRON_DIR/release/${DMG_NAME}" | cut -f1)"

# 12. Upload to S3 (if --upload flag is set)
if [ "$UPLOAD" = true ]; then
    echo ""
    echo "=== Uploading to S3 ==="

    # Check for S3 credentials
    if [ -z "$S3_VERSIONS_BUCKET_ENDPOINT" ] || [ -z "$S3_VERSIONS_BUCKET_ACCESS_KEY_ID" ] || [ -z "$S3_VERSIONS_BUCKET_SECRET_ACCESS_KEY" ]; then
        echo "ERROR: Missing S3 credentials. Set these environment variables:"
        echo "  S3_VERSIONS_BUCKET_ENDPOINT"
        echo "  S3_VERSIONS_BUCKET_ACCESS_KEY_ID"
        echo "  S3_VERSIONS_BUCKET_SECRET_ACCESS_KEY"
        echo ""
        echo "You can add them to .env or export them directly."
        exit 1
    fi

    # Build upload flags
    UPLOAD_FLAGS="--electron"
    if [ "$UPLOAD_LATEST" = true ]; then
        UPLOAD_FLAGS="$UPLOAD_FLAGS --latest"
    fi
    if [ "$UPLOAD_SCRIPT" = true ]; then
        UPLOAD_FLAGS="$UPLOAD_FLAGS --script"
    fi

    cd "$ROOT_DIR"
    bun run scripts/upload.ts $UPLOAD_FLAGS

    echo ""
    echo "=== Upload Complete ==="
fi
