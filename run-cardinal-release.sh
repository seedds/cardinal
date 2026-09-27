#!/bin/bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$PROJECT_DIR/cardinal"

export PATH="$HOME/.cargo/bin:$PATH"
export RUSTC="$HOME/.cargo/bin/rustc"
# Avoid malformed proc-macro dylibs with the local macOS linker/toolchain.
export CARGO_PROFILE_RELEASE_STRIP=none

if [[ ! -d node_modules ]]; then
  npm ci
fi

echo "Quit any running Cardinal instance, including previous development runs."
echo "Building and launching Cardinal with Rust release optimizations..."

exec npm run tauri dev -- --release
