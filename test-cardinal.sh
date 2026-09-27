#!/bin/bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$PROJECT_DIR/cardinal"

export PATH="$HOME/.cargo/bin:$PATH"
export RUSTC="$HOME/.cargo/bin/rustc"

if [[ ! -d node_modules ]]; then
  npm ci
fi

echo "Running the search-input regression test..."
npx vitest run src/__tests__/App.searchNavigation.test.tsx src/hooks/__tests__/useFileSearch.test.ts src/hooks/__tests__/useSelection.test.ts src/hooks/__tests__/useFilesTabEffects.test.ts

echo
echo "Quit the installed Cardinal before continuing."
read -r -p "Press Enter to launch the local development app..."

npm run tauri dev
