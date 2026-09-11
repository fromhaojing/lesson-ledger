#!/bin/bash
# Usage: scripts/release-notes.sh <version>
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
if [ "${1:-}" = "--help" ] || [ "${1:-}" = "-h" ]; then
    echo "Usage: $0 <version>"
    exit 0
fi
if [ "$#" -ne 1 ] || [ -z "$1" ]; then
    echo "ERROR: usage: $0 <version>" >&2
    exit 1
fi
VERSION="$1"
awk -v ver="$VERSION" '
    /^## / { active = ($2 == ver); next }
    active { lines = lines $0 "\n"; if ($0 ~ /[^[:space:]]/) found = 1 }
    END {
        if (!found) exit 1
        printf "%s", lines
    }
' "$REPO_ROOT/CHANGELOG.md" || {
    echo "ERROR: CHANGELOG.md has no release notes for $VERSION" >&2
    exit 1
}
