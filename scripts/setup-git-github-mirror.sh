#!/usr/bin/env bash
# Apply a global GitHub HTTPS mirror for git clone/fetch on slow CN networks.
# Default mirror: ghfast.top (override with GITHUB_MIRROR_PREFIX).
set -euo pipefail

MIRROR_PREFIX="${GITHUB_MIRROR_PREFIX:-https://ghfast.top/https://github.com/}"

git config --global url."${MIRROR_PREFIX}".insteadOf "https://github.com/"

echo "GitHub mirror enabled:"
git config --global --get-regexp '^url\..*\.insteadOf$' || true
echo
echo "Test: git ls-remote https://github.com/nousresearch/hermes-agent.git HEAD"
