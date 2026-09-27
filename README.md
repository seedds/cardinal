<div align="center">
  <img src="cardinal/mac-icon_1024x1024.png" alt="Cardinal icon" width="120" height="120">
  <h1>Cardinal</h1>
  <p>Fastest and most accurate file search app for macOS.</p>
  <p>
    <a href="#using-cardinal">Using Cardinal</a> ·
    <a href="#building-cardinal">Building Cardinal</a>
  </p>
  <img src="doc/pub/UI.gif" alt="Cardinal UI preview" width="720">
</div>

---

[English](README.md) · [Español](doc/pub/README.es-ES.md) · [한국어](doc/pub/README.ko-KR.md) · [Русский](doc/pub/README.ru-RU.md) · [简体中文](doc/pub/README.zh-CN.md) · [繁體中文](doc/pub/README.zh-TW.md) · [Português](doc/pub/README.pt-BR.md) · [Italiano](doc/pub/README.it-IT.md) · [日本語](doc/pub/README.ja-JP.md) · [Français](doc/pub/README.fr-FR.md) · [Deutsch](doc/pub/README.de-DE.md) · [Українська](doc/pub/README.uk-UA.md) · [العربية](doc/pub/README.ar-SA.md) · [हिन्दी](doc/pub/README.hi-IN.md) · [Türkçe](doc/pub/README.tr-TR.md)

## Using Cardinal

### Download

Install this fork with Homebrew:

```bash
brew install --cask seedds/tap/cardinal
```

Fork builds are available from [seedds/cardinal Releases](https://github.com/seedds/cardinal/releases/).
The current fork release is **0.1.27**. See the [changelog](CHANGELOG.md)
for search responsiveness, Trash, selection, and icon stability fixes.

For the upstream Cardinal distribution:

```bash
brew install --cask cardinal-search
```

You can also grab the latest packaged builds from [GitHub Releases](https://github.com/cardisoft/cardinal/releases/).

### i18n support

Need a different language? Click the ⚙️ button in the status bar to switch instantly.

### Search basics

Cardinal now speaks an Everything-compatible syntax layer on top of the classic substring/prefix tricks:

- `report draft` – space acts as `AND`, so you only see files whose names contain both tokens.
- `*.pdf briefing` – filter to PDF results whose names include “briefing”.
- `*.zip size:>100MB` – search for ZIP files larger than 100MB.
- `in:/Users demo !.psd` – restrict the search root to `/Users`, then search for files whose names contain `demo` but exclude `.psd`.
- `tag:ProjectA;ProjectB` – match Finder tags (macOS); `;` acts as `OR`.
- `*.md content:"Bearer "` – filter to Markdown files containing the string `Bearer `.
- `"Application Support"` – quote exact phrases.
- `brary/Applicat` – use `/` as a path separator for sub-path searching, matching directories like `Library/Application Support`.
- `/report` · `draft/` · `/report/` – wrap tokens with leading and/or trailing slashes to force **prefix**, **suffix**, or **exact** name matches when you need whole-word control beyond Everything syntax.
- `~/**/.DS_Store` – globstar (`**`) dives through every subfolder under your home directory to find stray `.DS_Store` files anywhere in the tree.

For the supported operator catalog—including boolean grouping, folder scoping, extension filters, regex usage, and more examples—see [`doc/pub/search-syntax.md`](doc/pub/search-syntax.md).

### Keyboard shortcuts & previews

- `Cmd+Shift+Space` – toggle the Cardinal window globally via the quick-launch hotkey.
- `Cmd+,` – open Preferences.
- `Esc` – hide the Cardinal window.
- `ArrowUp`/`ArrowDown` – move the selection.
- `Shift+ArrowUp`/`Shift+ArrowDown` – extend the selection.
- `Space` – Quick Look the currently selected row without leaving Cardinal.
- `Cmd+O` – open the highlighted result.
- `Cmd+R` – reveal the highlighted result in Finder.
- `Cmd+C` – copy the selected files to the clipboard.
- `Cmd+Shift+C` – copy the selected paths to the clipboard.
- `Cmd+F` – jump focus back to the search bar.
- `F2` – rename one selected file without overwriting an existing destination.
- `F8` – move selected files to Trash.
- `F9` – open a terminal in the focused selected file’s directory, or inside the selected folder. With multiple selections, only the focused selected row is used.
- `ArrowUp`/`ArrowDown` (in search bar) – cycle search history.

Set **Preferences → Terminal application** to an absolute application path such as `/Applications/iTerm.app` to change the terminal used by F9. The default is macOS Terminal; clearing the field or resetting preferences restores it. Custom terminals must support opening directories through macOS. F9 applies while Cardinal is active and no dialog or text field is focused; window/tab placement follows the terminal’s preferences.

The context menu also supports revealing the first selected file in Double Commander.

Happy searching!

---

## Building Cardinal

### Requirements

- macOS 12+
- Rust toolchain
- Node.js 18+ with npm
- Xcode command-line tools & Tauri prerequisites (<https://tauri.app/start/prerequisites/>)

### Development mode

From the repository root, run the optimized local app:

```bash
./run-cardinal-release.sh
```

The script installs frontend dependencies if needed and starts Tauri with Rust release
optimizations. It launches without a confirmation prompt. Quit an existing Cardinal
instance first; press `Ctrl+C` in the terminal to stop the development run.

For a debug run preceded by search and selection regression tests:

```bash
./test-cardinal.sh
```

See [TESTING.md](TESTING.md) for checks and desktop scenarios, and
[CONTEXT.md](CONTEXT.md) for the current implementation and release status.

The equivalent direct development command, with optional developer features, is:

```bash
cd cardinal
npm run tauri dev -- --release --features dev
```

### Production build

```bash
cd cardinal
npm run tauri build
```
