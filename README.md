# Diff Tracker

[中文说明](./README_CN.md)


Diff Tracker is a VS Code extension that records file changes and provides three review modes:
- Inline readonly diff document
- VS Code side-by-side diff
- Cursor-like WebView diff with floating Undo/Keep actions

**Fork From [wizyoung/DiffTracker](https://github.com/wizyoung/DiffTracker)**


## Screenshots

💥 **Highlights in 0.6.0: Auto-start recording, persistent review sessions, automation-only tracking, and more flexible WebView opening behavior.**

| Cursor like WebView Unified | Cursor like WebView Split |
|:---------------:|:--------------:|
| ![Word diff](./resources/webview1.png) | ![Settings](./resources/webview2.png) |

|               Editor Inline View                |    Editor Inline View (hover effect)    |
| :---------------------------------------------: | :-------------------------------------: |
| ![Editor highlighting](./resources/inline1.png) | ![Inline diff](./resources/inline2.png) |

| Inline View 2 | Side-by-side diff |
|:---------------:|:--------------:|
| ![Word diff](./resources/diff2.png) | ![Settings](./resources/diff3.png) |


## Features
- [New 🚀] Pending, unaccepted changes survive VS Code restarts and are restored from the saved baseline
- [New 🚀] Automation-only tracking mode for AI/agent or extension-driven edits
- [New 🚀] Configurable WebView opening position (`current group` or `beside`)
- [New 🚀] Automatically start recording file changes after the extension is activated
- Activity Bar **Change Recording** tree with file grouping
- Recording mode (start/stop) with workspace baseline snapshot
- Workspace-wide file watching (including external file changes)
- Inline readonly diff view with line and word-level highlights
- Side-by-side diff (`Original ↔ Current`) via built-in VS Code diff
- Cursor-like WebView diff (Split/Unified, Wrap, Expand, Keep All, Reject All)
- Block-wise actions: Undo/Keep per change block
- File-level actions: Revert file, Revert all files, Keep all changes in file
- Deleted-line badge, CodeLens actions, and hover details
- Settings panel + Watch Ignore editor (`.gitignore` style patterns)

## Usage

1. Open **Diff Tracker** from the Activity Bar.
2. Recording starts automatically after the extension activates.
3. Edit files in your workspace.
4. In **Change Recording**, click a changed file to open inline diff.
5. Use context menu or editor title buttons to open:
   - Inline Diff (active file)
   - Side-by-Side Diff
   - WebView Diff
6. In WebView Diff, use block-level **Undo/Keep** or file-level **Keep All/Reject All**.
7. Use **Revert File** / **Revert All Changes** as needed.
8. Stop recording when done.

## How It Works

When recording starts, Diff Tracker:
1. Captures baseline snapshots for workspace files (batched)
2. Tracks file/document changes and rebuilds line/block diffs
3. Serves virtual inline/original documents
4. Restores pending changes after restart until they are accepted/reverted or the baseline is cleared
5. Keeps tree, decorations, CodeLens, and WebView in sync

## Installation

### Build a `.vsix` package from source

Use these commands from the repository root:

1. Install **Node.js 20+**.
2. Clone the repository and open it in a terminal.
3. Install dependencies:

   ```bash
   npm ci
   ```

4. Compile the extension:

   ```bash
   npm run compile
   ```

   This runs the TypeScript build and bundles the WebView assets into the `out/` and `webview/` folders.

5. Create the VSIX package:

   ```bash
   npm run package
   ```

   This uses `vsce package` and automatically runs `npm run compile` again through the `vscode:prepublish` script, so your packaged extension is rebuilt before the `.vsix` file is created.

6. After the command finishes, the VSIX file is written to the repository root. The filename matches the extension version in `package.json`, for example:

   ```text
   ./diff-tracker-0.6.0.vsix
   ```

#### Quick command summary

```bash
npm ci
npm run compile
npm run package
```

> Note: use `npm run compile`, not `npm compile`. The `run` keyword is required because `compile` is a custom script defined in `package.json`.

#### Test before packaging (recommended)

If you want to verify the extension before creating the VSIX:

```bash
npm run test:webview-anchors
npm run test:similarity-pairing
```

#### Try the extension in development mode

If you want to launch it without packaging first:

1. Open the repository in VS Code.
2. Run `npm ci`.
3. Run `npm run compile`.
4. Press `F5` to start an **Extension Development Host** window.

### Install from VSIX
1. Build or download the `.vsix` file.
2. Open VS Code.
3. Open Extensions (`Cmd+Shift+X` on macOS, `Ctrl+Shift+X` on Windows/Linux).
4. Click `...` in the Extensions view.
5. Choose **Install from VSIX...**
6. Select the generated `.vsix` file.

### Troubleshooting packaging

- If `npm run package` fails because dependencies are missing, run `npm ci` first.
- If you only want to rebuild the extension output without packaging, run `npm run compile`.
- If you update the extension version in `package.json`, the generated VSIX filename changes to match that version.

## Requirements

- VS Code ^1.80.0

## Extension Settings

This extension provides the following settings:

| Setting | Default | Description |
|---------|---------|-------------|
| `diffTracker.showDeletedLinesBadge` | `true` | Show a badge indicating deleted lines |
| `diffTracker.showCodeLens` | `true` | Show CodeLens actions (Revert/Keep) above change blocks |
| `diffTracker.highlightAddedLines` | `true` | Highlight added lines with green background |
| `diffTracker.highlightModifiedLines` | `true` | Highlight modified lines with blue background |
| `diffTracker.highlightWordChanges` | `true` | Highlight word-level changes within modified lines |
| `diffTracker.openWebviewBeside` | `false` | Open Webview diff in a side editor group instead of the current editor group |
| `diffTracker.useGitIgnoreExcludes` | `true` | Apply ignore rules from `.gitignore` files and `.git/info/exclude` |
| `diffTracker.useBuiltInExcludes` | `true` | Apply built-in ignore rules for common folders like `.git`, `node_modules`, `dist`, and `coverage` |
| `diffTracker.useVSCodeExcludes` | `true` | Apply VS Code exclude settings from `files.watcherExclude`, `search.exclude`, and `files.exclude` |
| `diffTracker.watchExclude` | `[]` | Additional watch ignore patterns (`.gitignore` style) |
| `diffTracker.onlyTrackAutomatedChanges` | `false` | Ignore manual typing in VS Code. External CLI/tool edits are still tracked, and VS Code extension edits can be tracked when they open an automation session first |

You can toggle display/highlight/ignore settings in the sidebar **Settings** panel, and edit watch ignore patterns via **Edit Watch Ignores**.

When `diffTracker.openWebviewBeside` is enabled, Webview diff opens in a side editor group. By default it opens in the current editor group.

When `diffTracker.onlyTrackAutomatedChanges` is enabled:
- Manual typing in the editor is ignored
- External tools/CLI that modify files on disk are still tracked through file watchers
- VS Code extensions should call `diffTracker.beginAutomationSession` before applying edits, and `diffTracker.endAutomationSession` after they finish

Example integration from another VS Code extension:

```ts
const sessionId = await vscode.commands.executeCommand<string>(
  'diffTracker.beginAutomationSession',
  { allFiles: true, ttlMs: 30000 }
);

try {
  // apply WorkspaceEdit or editor edits here
} finally {
  await vscode.commands.executeCommand('diffTracker.endAutomationSession', sessionId);
}
```

## Known Issues

- Pure line-ending-style changes (CRLF/LF only) are currently treated as no logical content change.
- If you find a reproducible diff/render edge case, please open an issue with a minimal file sample.

## Release Notes

### 0.1.0

- Activity Bar entry
- Recording mode for change tracking
- Inline diff highlighting
- Side-by-side diff
- Multi-file tracking with timestamps
- Revert file and revert all
- Clear diffs

### 0.2.0
- Change from LCS-based diff to Patience Diff algorithm for more intuitive diff display

### 0.3.0
- Add Partial Revert/Keep buttons, just like cursor
- Add go-to-original-file button in left panel

### 0.3.1
- Add file-level "Revert All" / "Keep All" buttons (CodeLens at file top)
- Add settings panel in sidebar to toggle display options
- Fix block-wise keep/revert affecting all blocks instead of just one
- Fix hover showing "unknown" for deleted empty lines

### 0.3.2
- Tiny bug fix

### 0.3.3
- Add word-level diff highlighting for modified lines
- Add "Highlight Word Changes" setting to toggle word-level highlighting

### 0.4.0
- Cursor-like WebView diff: floating Undo/Keep, unified view default, wrap/expand, and Keep All/Reject All in the toolbar
- Offline WebView rendering (bundled @pierre/diffs)
- Workspace-wide file watching (no longer limited to open files)
- New Watch Ignore panel with `.gitignore` support
- Faster tracking in large workspaces (debounced changes + optimized watchers)
- Smoother recording start on big repos (baseline builds in batches, large files skipped)

### 0.4.1
- Refactor diff pipeline to use a unified logical-line model
- Stabilize block grouping for large paste/delete and EOF scenarios
- Fix WebView empty-file rendering fallback that could hide block actions after full deletion
- Unify inline virtual URI mapping and refresh flow to prevent stale inline readonly content
- Improve mixed newline handling (LF/CRLF/CR) in Keep/Revert block operations

### 0.5.0
- Add Explorer file context action for Diff Tracker while recording, with the final label: **Open with Diff Tracker**
- Add configurable default open mode for changed files (WebView / Inline / Side-by-side / Original / Split Original+WebView)
- Add `Open split view` mode (left original file + right WebView diff)
- Add global recording toggle shortcut: `Shift+Alt+D`
- Improve changes tree to workspace-relative nested directory grouping
- Use VS Code native file icons in the changes tree
- Show changed-file count badge on the Diff Tracker activity icon
- Add and streamline global file actions in changes view workflows (Keep All / Revert All)
- Add `Clear Diffs` baseline reset to current workspace state
- lots of optimizations & fixes

### 0.5.1
- Improve recording controls in Change Recording with inline start entry, starting status, and title start/stop actions

### 0.5.2
- Fix watch ignore rules not refreshing in some recording states
- Reuse snapshot filtering in watcher updates to avoid tracking binary/oversized files
- Clear pre-seeded empty baseline for non-trackable created files in watcher flow

### 0.6.0
- Persist recording session state and workspace baselines so pending diffs can be restored after restarting VS Code
- Add `diffTracker.onlyTrackAutomatedChanges` plus `diffTracker.beginAutomationSession` / `diffTracker.endAutomationSession` for automation-aware tracking workflows
- Add `diffTracker.openWebviewBeside`, expose the new recording/display toggles in the settings tree, and make WebView diff open behavior more configurable
- Start recording automatically after activation and restore decorations/tree state when a previous session is resumed

## License

MIT

## Acknowledge
[![LinuxDO](https://img.shields.io/badge/Community-Linux.do-blue?style=flat-square)](https://linux.do/)

Discuss, free ai, and get help at [linux.do](https://linux.do/).
