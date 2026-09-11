#!/bin/bash
# Stops the running app, rebuilds the bundle, and launches it again.
# Usage: scripts/compile_and_run.sh [debug|release] [--preview] (defaults to release)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
CONFIGURATION="${CONFIGURATION:-release}"
if [ "${1:-}" = "--help" ] || [ "${1:-}" = "-h" ]; then
    echo "Usage: $0 [debug|release] [--preview]"
    exit 0
fi
case "${1:-}" in
    debug|release) CONFIGURATION="$1"; shift ;;
esac
if { [ "$CONFIGURATION" != "debug" ] && [ "$CONFIGURATION" != "release" ]; } ||
   [ "$#" -gt 1 ] || { [ "$#" -eq 1 ] && [ "$1" != "--preview" ]; }; then
    echo "ERROR: usage: $0 [debug|release] [--preview]" >&2
    exit 1
fi

APP_BUNDLE="$PROJECT_DIR/build/钱来.app"
EXECUTABLE_NAME="LessonLedger"
if pgrep -x "$EXECUTABLE_NAME" >/dev/null 2>&1; then
    pkill -TERM -x "$EXECUTABLE_NAME"
    for ((attempt = 0; attempt < 25; attempt++)); do
        pgrep -x "$EXECUTABLE_NAME" >/dev/null 2>&1 || break
        sleep 0.2
    done
    if pgrep -x "$EXECUTABLE_NAME" >/dev/null 2>&1; then
        echo "ERROR: 钱来未退出，请手动退出后重试。" >&2
        exit 1
    fi
fi

"$SCRIPT_DIR/build-app.sh" "$CONFIGURATION"
open "$APP_BUNDLE" --args "$@"
for ((attempt = 0; attempt < 20; attempt++)); do
    sleep 0.2
    if pgrep -x "$EXECUTABLE_NAME" >/dev/null 2>&1; then
        echo "钱来 is running."
        exit 0
    fi
done
echo "ERROR: 钱来启动失败，请在 Console.app 中检查崩溃日志。" >&2
exit 1
