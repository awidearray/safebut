#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMP_DIR="$(mktemp -d)"
WORKTREE_DIR="$TMP_DIR/rollback-drill"

cleanup() {
  git -C "$ROOT_DIR" worktree remove --force "$WORKTREE_DIR" >/dev/null 2>&1 || true
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

echo "Preparing rollback drill worktree..."
git -C "$ROOT_DIR" worktree add "$WORKTREE_DIR" HEAD >/dev/null

cd "$WORKTREE_DIR"

if git rev-parse HEAD~1 >/dev/null 2>&1; then
  echo "Applying non-committing revert of HEAD..."
  git revert --no-commit HEAD
else
  echo "Repository has no prior commit to revert against."
  exit 1
fi

echo "Installing dependencies for rollback verification..."
npm ci

echo "Running verification on simulated rollback..."
if node -e "const p=require('./package.json'); process.exit(p?.scripts?.test ? 0 : 1)"; then
  npm test
else
  echo "No npm test script found in rollback state; running syntax checks instead."
  node --check server.js
  node --check server-production.js
  node --check server-premium.js
fi

echo "Rollback drill passed."
