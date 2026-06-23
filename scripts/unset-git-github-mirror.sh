#!/usr/bin/env bash
# Remove global GitHub mirror url rewrites.
set -euo pipefail

git config --global --unset-all url.https://ghfast.top/https://github.com/.insteadOf 2>/dev/null || true

# Remove any other mirror prefix the operator may have set manually.
while IFS= read -r key; do
  [[ -n "$key" ]] && git config --global --unset-all "$key" 2>/dev/null || true
done < <(git config --global --get-regexp '^url\..*\.insteadOf$' 2>/dev/null | cut -d' ' -f1 || true)

echo "GitHub mirror rules cleared."
git config --global --get-regexp '^url\..*\.insteadOf$' 2>/dev/null || echo "(none)"
