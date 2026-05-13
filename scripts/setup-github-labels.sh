#!/usr/bin/env bash
# Create core labels for the BuildingAgent project.
# Usage: ./scripts/setup-github-labels.sh [owner/repo]
# Requires: gh CLI authenticated, or set GH_REPO env var.

set -euo pipefail

REPO="${1:-${GH_REPO:-}}"
if [ -z "$REPO" ]; then
  echo "Usage: ./scripts/setup-github-labels.sh owner/repo"
  echo "Or set GH_REPO environment variable."
  exit 1
fi

# Color palette
# Milestone labels: cool tones
# Slice labels: warm tones
# Type labels: neutral tones (white text on dark bg)

declare -A LABELS=(
  # Milestones
  ["M001"]="Milestone 1 — dark-blue"
  ["M002"]="Milestone 2 — dark-blue"
  ["M003"]="Milestone 3 — dark-blue"

  # Slices
  ["slice-1"]="Slice 1 — dark-green"
  ["slice-2"]="Slice 2 — dark-green"
  ["slice-3"]="Slice 3 — dark-green"
  ["slice-4"]="Slice 4 — dark-green"
  ["slice-5"]="Slice 5 — dark-green"
  ["slice-6"]="Slice 6 — dark-green"
  ["slice-7"]="Slice 7 — dark-green"
  ["slice-8"]="Slice 8 — dark-green"
  ["slice-9"]="Slice 9 — dark-green"
  ["slice-10"]="Slice 10 — dark-green"

  # Types
  ["enhancement"]="New feature — teal"
  ["bug"]="Something is broken — dark-red"
  ["documentation"]="Documentation changes — purple"
  ["verification"]="Testing and validation — orange"
  ["refactor"]="Code improvement — light-blue"
  ["chore"]="Maintenance task — gray"
)

# Map descriptions to GitHub color hex values
declare -A COLORS=(
  ["dark-blue"]="0A2A5E"
  ["dark-green"]="0A5E2A"
  ["teal"]="0A5E5E"
  ["dark-red"]="5E0A0A"
  ["purple"]="3D0A5E"
  ["orange"]="5E3D0A"
  ["light-blue"]="0A3D5E"
  ["gray"]="3D3D3D"
)

echo "Setting up labels for repository: $REPO"
echo ""

for LABEL in "${!LABELS[@]}"; do
  DESC="${LABELS[$LABEL]}"
  COLOR_NAME="${DESC##*— }"
  COLOR="${COLORS[$COLOR_NAME]:-cccccc}"

  if gh label list --repo "$REPO" | grep -q "^${LABEL}[[:space:]]"; then
    echo "  Updating: $LABEL ($COLOR_NAME)"
    gh label edit "$LABEL" --repo "$REPO" --color "$COLOR" --description "$DESC" 2>/dev/null || true
  else
    echo "  Creating: $LABEL ($COLOR_NAME)"
    gh label create "$LABEL" --repo "$REPO" --color "$COLOR" --description "$DESC" 2>/dev/null || true
  fi
done

echo ""
echo "Done. Created/updated ${#LABELS[@]} labels."
