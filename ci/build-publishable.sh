#!/bin/sh
set -eu
REPO_DIR="$(dirname "$0")/.."

mkdir -p "$1"

tsc --project "$REPO_DIR/tsconfig-es6-artifact.json"
mv "$REPO_DIR/dist/es6" "$1/es6"
jq --arg VER "$2" '. + {"version": $VER}' "$REPO_DIR/package.json" > "$1/package.json"
