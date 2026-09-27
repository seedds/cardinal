# Current project context

Updated: 2026-09-27.

## Distribution and work state

- Fork: <https://github.com/seedds/cardinal>.
- Upstream: <https://github.com/cardisoft/cardinal>.
- Homebrew tap: <https://github.com/seedds/homebrew-tap>.
- Current fork release: **0.1.26**, including search, selection, Trash, icon, and
  hover stability fixes. The preceding release was 0.1.25, commit `b64e5d1`.
- Check `git status` before editing to distinguish committed release code from
  subsequent local work.
- [CHANGELOG.md](CHANGELOG.md) tracks released and unreleased work;
  [TESTING.md](TESTING.md) contains runnable checks and desktop verification steps.

## Relevant implementation

### Search and refresh

`cardinal/src/hooks/useFileSearch.ts` owns query parameters, result versions,
loading state, request deduplication, and refresh scheduling. Background searches
use the latest input, coalesce while another search or typing debounce is pending,
and wait one second after a background completion before another refresh.

The native event loop in `cardinal/src-tauri/src/background.rs` emits
`index_changed` after a batch touches indexed data or a cache rebuild completes.
The frontend subscribes through `cardinal/src/runtime/tauriEventRuntime.ts`.
Status counters alone no longer trigger a search. This is index-level invalidation,
not query-specific invalidation: changes to indexed files outside the current
matches may still cause a refresh.

`SearchCache::handle_fs_events` in `search-cache/src/cache.rs` returns a change
boolean. Ignored/history/no-op events can advance the event checkpoint without
refreshing results; removals of indexed nodes still signal a change.

### Results, selection, and icons

- `resultsVersion` invalidates hydrated row metadata.
- `displayedResultsVersion` additionally tracks visible ordering changes.
- `selectionVersion` increments for foreground search completions, allowing
  background refreshes to preserve selection instead of resetting the list.
- `useSelection.ts` currently remaps by **slab index**, not path/inode identity.
  Slab reuse or node reconstruction remains an important live-verification case.
- `useDataLoader.ts` requests row text with `includeIcons: false` and rejects
  metadata responses from older result versions.
- Its separate icon cache holds up to 512 entries, keyed by path plus metadata
  type, size, modification time, and creation time. It survives row-cache resets
  for the lifetime of the mounted hook.
- Native `icon_update` payloads include slab index, path, metadata, request ID,
  thumbnail flag, and image data. Older responses for cached identities are
  rejected, and ordinary icons cannot downgrade cached thumbnails.
- `VirtualList.tsx` and `useFrozenViewport.ts` keep the previous viewport visible
  while replacement row details load. Cached icons reattach before fresh rows
  replace that viewport.

### File actions

`useFileActions.tsx`, `useAppHotkeys.ts`, and `useContextMenu.ts` connect the UI to
  native commands in `cardinal/src-tauri/src/commands.rs`:

- **F8:** recoverable Move to Trash. Version 0.1.26 uses `NSFileManager` instead of
  the Finder AppleScript shipped in 0.1.25.
- **F2:** rename a single item; preselect the name without its extension and use
  `renamex_np` with `RENAME_EXCL` to refuse replacement of another file.
- **Double Commander reveal:** use `open -n -a "Double Commander" --args --client -T`
  with the first selected path.

## Verification and remaining work

Frontend regression coverage includes repeated Enter, input during events,
selection remapping, and rendered icons during delayed background refreshes.
Native Trash fixtures have been verified against the real macOS Trash. Workspace
tests, native tests, typechecking, Clippy, and optimized builds have passed during
this work; rerun the checks relevant to further changes.

Still requiring desktop confirmation:

- Stable selection and icons under sustained filesystem activity.
- Enter-to-visible-results latency in the optimized app; saved-index matching
  timings alone do not measure the full interaction.
- Prompt result-list reconciliation after Trash/rename. Trash can succeed before
  the list catches up, and there is no success notification yet.
- Discovery of files in the live index/scope, rather than only a saved snapshot.

The backend still shares one event loop for search, filesystem updates, and row
expansion. Interactive-work prioritization has not been implemented. Icon jobs
can still be generated on viewport refresh; the new cache stabilizes display but
does not eliminate native icon extraction work.

## Release notes for the next maintainer

Version fields are in `cardinal/src-tauri/Cargo.toml`, its `Cargo.lock`, and
`cardinal/src-tauri/tauri.conf.json`. The frontend package version is not the
desktop release version. The tap cask lives in the separate `homebrew-tap`
repository at `Casks/cardinal.rb`.

After desktop verification and a release decision, update versions, build the DMG,
publish its GitHub release asset, and update the cask URL/version/SHA256 together.
The existing fork distribution is Apple Silicon, macOS 12+, and ad-hoc signed.
