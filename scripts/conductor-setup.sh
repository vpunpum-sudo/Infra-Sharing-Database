#!/usr/bin/env bash

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

npm ci
npm --prefix functions ci

mkdir -p .context
for template in docs/agent-templates/*.md; do
  destination=".context/$(basename "$template")"
  if [[ ! -e "$destination" ]]; then
    cp "$template" "$destination"
  fi
done

echo "Workspace dependencies and agent handoff files are ready."
