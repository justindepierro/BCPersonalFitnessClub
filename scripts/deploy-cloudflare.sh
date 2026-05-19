#!/usr/bin/env bash
# Deploy only the public app assets plus Pages Functions.
set -euo pipefail

cd "$(dirname "$0")/.."

npm run build

tmpdir="$(mktemp -d)"
cleanup() {
  rm -rf "$tmpdir"
}
trap cleanup EXIT

mkdir -p "$tmpdir/public"
rsync -a index.html manifest.json sw.js _routes.json css js data "$tmpdir/public/"

printf 'Not available\n' > "$tmpdir/public/.dev.vars"
printf 'Not available\n' > "$tmpdir/public/wrangler.toml"

commit_hash="$(git rev-parse HEAD 2>/dev/null || printf 'local')"
commit_message="$(git log -1 --pretty=%s 2>/dev/null || printf 'local deploy')"

npx wrangler pages deploy "$tmpdir/public" \
  --project-name lifting-club \
  --branch main \
  --commit-dirty=true \
  --commit-hash "$commit_hash" \
  --commit-message "$commit_message"
