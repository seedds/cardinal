# Development and testing

## Setup

Use macOS with Xcode command-line tools, Node.js/npm, and rustup. The current
`rust-toolchain.toml` pins `nightly-2025-12-11`; use that file as the source of truth.

```bash
rustup toolchain install nightly-2025-12-11 --component rustfmt --component clippy
cd cardinal
npm ci
```

## Launch locally

Run from the repository root after quitting any other Cardinal instance:

```bash
./run-cardinal-release.sh
```

This builds optimized Rust code and uses the Vite development frontend. It starts
without waiting for Enter. It is a development run, not a packaged DMG, and does
not run tests. The script sets `CARGO_PROFILE_RELEASE_STRIP=none` to avoid the
malformed proc-macro dylib/linker issue encountered on the development machine.

`./test-cardinal.sh` runs the App search-navigation, search-hook, selection, and
files-tab-effects regressions, then prompts before launching a debug build. It
does not run the full suite or the icon regressions. Use release mode when judging
search latency. Stop either development run with `Ctrl+C`.

## Automated checks

From `cardinal/`:

```bash
npm run typecheck
npm test
npm run build
npm run format:check
```

Focused refresh and icon checks:

```bash
npx vitest run src/__tests__/App.searchNavigation.test.tsx src/hooks/__tests__/useFileSearch.test.ts src/hooks/__tests__/useSelection.test.ts src/hooks/__tests__/useDataLoader.test.ts src/components/__tests__/VirtualList.icons.test.tsx
```

From the repository root:

```bash
export PATH="$HOME/.cargo/bin:$PATH"
export RUSTC="$HOME/.cargo/bin/rustc"
cargo test --workspace
cargo clippy --workspace --all-targets
cargo fmt --all --check
cargo test --manifest-path cardinal/src-tauri/Cargo.toml --lib
cargo clippy --manifest-path cardinal/src-tauri/Cargo.toml --all-targets
cargo fmt --manifest-path cardinal/src-tauri/Cargo.toml --check
bash -n run-cardinal-release.sh test-cardinal.sh
git diff --check
```

The Tauri crate is built separately from the root workspace. Run workspace tests
after shared-crate changes; frontend-only changes normally need the frontend checks.

### Native Trash integration test

The following opt-in test creates uniquely named disposable fixtures, moves them
to the real macOS Trash, verifies their contents, and removes only those fixtures:

```bash
cargo test --manifest-path cardinal/src-tauri/Cargo.toml --lib native_trash_moves_files_and_folders_and_reports_missing_paths -- --ignored --nocapture
```

It covers files, a folder with a child, spaces/quotes/Unicode, and a missing path.
Ordinary native test runs leave it ignored.

## Desktop regression scenarios

Use disposable files for file operations. Confirm the app was restarted after
native changes, especially changes to icon event payloads.

| Scenario | Expected behavior |
| --- | --- |
| Type, backspace, and clear while filesystem events arrive | Input never reverts to an older query. |
| Press Enter before typing debounce finishes, then press it again | Search starts immediately; an identical in-flight search is reused. |
| Wait through background refreshes | Existing results remain visible without a loading-screen flash. |
| Select one or several rows, then cause a refresh and press an arrow key | Retained selections and the active row follow surviving slab identities; navigation continues. |
| Load thumbnails, then trigger repeated background refreshes | Unchanged files keep their icons; thumbnails do not revert to ordinary icons or placeholders. |
| Hold the pointer over a row during refreshes, move between rows, then leave the list | Hover highlighting stays consistent on frozen and live rows, including selected rows, and clears on exit. |
| Scroll and change queries while icons are loading | Late responses do not give a different file the old file's icon. |
| F8 on a disposable result | File reaches Trash; check both the filesystem and eventual result-list update. |
| F2 on a disposable result | Rename succeeds; an existing destination is not overwritten. |
| Reveal in Double Commander | The first selected path is revealed in the installed application. |

Full native desktop interaction remains a manual check. Earlier AppleScript UI
automation was blocked by missing Accessibility access. Hook and DOM tests do not
prove end-to-end behavior in the macOS WebView.

## Performance measurement

Measure an optimized build and distinguish:

1. Input/Enter to request submission.
2. Backend queue wait and search execution.
3. Search completion to visible filenames.
4. Filename display to icon/thumbnail completion.

A read-only probe on 2026-09-27 against a saved index with 3,265,803 entries measured
seven searches per query: median `EE.en` 24.1 ms, `cardinal` 24.2 ms, and
`package.json` 22.7 ms. The temporary probe was removed. These numbers exclude
IPC, queueing, rendering, and icon extraction; they are not an end-to-end speedup
measurement or a guaranteed latency target.

## Package an optimized DMG

From `cardinal/`:

```bash
PATH="$HOME/.cargo/bin:$PATH" \
RUSTC="$HOME/.cargo/bin/rustc" \
CARGO_PROFILE_RELEASE_STRIP=none \
npm run tauri build -- --bundles dmg
```

DMGs are written under `cardinal/src-tauri/target/release/bundle/dmg/` relative to
the repository root. Building does not publish a GitHub release or update Homebrew.
