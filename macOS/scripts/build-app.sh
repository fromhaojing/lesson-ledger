#!/bin/bash
# Usage: scripts/build-app.sh [debug|release]
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
CONFIGURATION="${1:-${CONFIGURATION:-release}}"
if [ "$CONFIGURATION" = "--help" ] || [ "$CONFIGURATION" = "-h" ]; then
    echo "Usage: $0 [debug|release]"
    echo 'Environment: ARCHES="arm64 x86_64", MARKETING_VERSION=2.0.0, BUILD_NUMBER=1'
    exit 0
fi
if [ "$#" -gt 1 ] || { [ "$CONFIGURATION" != "debug" ] && [ "$CONFIGURATION" != "release" ]; }; then
    echo "ERROR: expected debug or release. Usage: $0 [debug|release]" >&2
    exit 1
fi
APP_PATH="$PROJECT_DIR/build/钱来.app"
export CLANG_MODULE_CACHE_PATH="$PROJECT_DIR/.build/ModuleCache"
export SWIFTPM_MODULECACHE_OVERRIDE="$PROJECT_DIR/.build/ModuleCache"

ARCH_FLAGS=()
for arch in ${ARCHES:-}; do
    case "$arch" in
        arm64|x86_64) ARCH_FLAGS+=(--arch "$arch") ;;
        *) echo "ERROR: unsupported architecture: $arch" >&2; exit 1 ;;
    esac
done
# Conditional expansion also works with macOS Bash 3.2 and set -u.
swift build --package-path "$PROJECT_DIR" --scratch-path "$PROJECT_DIR/.build" --cache-path "$PROJECT_DIR/.build/cache" --disable-sandbox -c "$CONFIGURATION" ${ARCH_FLAGS[@]+"${ARCH_FLAGS[@]}"} --product LessonLedger
BIN_DIR="$(swift build --package-path "$PROJECT_DIR" --scratch-path "$PROJECT_DIR/.build" --cache-path "$PROJECT_DIR/.build/cache" --disable-sandbox -c "$CONFIGURATION" ${ARCH_FLAGS[@]+"${ARCH_FLAGS[@]}"} --show-bin-path)"
mkdir -p "$APP_PATH/Contents/MacOS" "$APP_PATH/Contents/Resources"
cp "$BIN_DIR/LessonLedger" "$APP_PATH/Contents/MacOS/LessonLedger"
cp "$PROJECT_DIR/Info.plist" "$APP_PATH/Contents/Info.plist"
MARKETING_VERSION="${MARKETING_VERSION:-$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$PROJECT_DIR/Info.plist")}"
BUILD_NUMBER="${BUILD_NUMBER:-$(git -C "$PROJECT_DIR" rev-list --count HEAD)}"
/usr/libexec/PlistBuddy -c "Set :CFBundleShortVersionString $MARKETING_VERSION" "$APP_PATH/Contents/Info.plist"
/usr/libexec/PlistBuddy -c "Set :CFBundleVersion $BUILD_NUMBER" "$APP_PATH/Contents/Info.plist"
# Keep resources inside Contents so the app can be signed and moved independently of the checkout.
ditto "$BIN_DIR/LessonLedger_LessonLedger.bundle" "$APP_PATH/Contents/Resources/LessonLedger_LessonLedger.bundle"

ICONSET="$PROJECT_DIR/.build/AppIcon.iconset"
mkdir -p "$ICONSET"
for size in 16 32 128 256 512; do
    sips -z "$size" "$size" "$PROJECT_DIR/AppIcon.png" --out "$ICONSET/icon_${size}x${size}.png" >/dev/null
    retina=$((size * 2))
    sips -z "$retina" "$retina" "$PROJECT_DIR/AppIcon.png" --out "$ICONSET/icon_${size}x${size}@2x.png" >/dev/null
done
python3 "$PROJECT_DIR/scripts/make-icon.py" "$ICONSET" "$APP_PATH/Contents/Resources/AppIcon.icns"
codesign --force --deep --sign - "$APP_PATH"
codesign --verify --deep --strict "$APP_PATH"
for arch in ${ARCHES:-}; do
    lipo "$APP_PATH/Contents/MacOS/LessonLedger" -verify_arch "$arch"
done
echo "Built $APP_PATH ($CONFIGURATION, $MARKETING_VERSION, build $BUILD_NUMBER)"
