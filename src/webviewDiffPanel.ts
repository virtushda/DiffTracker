import * as vscode from 'vscode';
import { DiffTracker } from './diffTracker';

/**
 * Manages a WebviewPanel for displaying diffs using @pierre/diffs library
 */
export class WebviewDiffPanel {
    public static currentPanel: WebviewDiffPanel | undefined;
    private readonly panel: vscode.WebviewPanel;
    private readonly extensionUri: vscode.Uri;
    private disposables: vscode.Disposable[] = [];
    private filePath: string = '';
    private currentStyle: 'split' | 'unified' = 'unified';
    private currentWrap: boolean = false;
    private currentExpandAll: boolean = false;
    private isInitialized: boolean = false;

    private constructor(
        panel: vscode.WebviewPanel,
        extensionUri: vscode.Uri,
        private diffTracker: DiffTracker
    ) {
        this.panel = panel;
        this.extensionUri = extensionUri;

        // Listen for panel disposal
        this.panel.onDidDispose(() => this.dispose(), null, this.disposables);

        // Listen for theme changes
        this.disposables.push(
            vscode.window.onDidChangeActiveColorTheme(() => {
                this.updateTheme();
            })
        );

        // Listen for messages from webview
        this.panel.webview.onDidReceiveMessage(
            message => this.handleMessage(message),
            null,
            this.disposables
        );

        // Auto-refresh when diff changes (file edited, saved, etc.)
        this.disposables.push(
            this.diffTracker.onDidTrackChanges(() => {
                if (this.filePath) {
                    this.update(this.filePath);
                }
            })
        );
    }

    public static createOrShow(
        extensionUri: vscode.Uri,
        diffTracker: DiffTracker,
        filePath: string
    ): WebviewDiffPanel {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        // If panel exists and showing the same file, reveal it
        if (WebviewDiffPanel.currentPanel && WebviewDiffPanel.currentPanel.filePath === filePath) {
            WebviewDiffPanel.currentPanel.panel.reveal(column);
            return WebviewDiffPanel.currentPanel;
        }

        // If panel exists but for a different file, update it
        if (WebviewDiffPanel.currentPanel) {
            WebviewDiffPanel.currentPanel.update(filePath);
            WebviewDiffPanel.currentPanel.panel.reveal(column);
            return WebviewDiffPanel.currentPanel;
        }

        // Create a new panel
        const panel = vscode.window.createWebviewPanel(
            'diffTrackerWebview',
            'Diff View',
            vscode.ViewColumn.Beside,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [
                    vscode.Uri.joinPath(extensionUri, 'out'),
                    vscode.Uri.joinPath(extensionUri, 'resources'),
                    vscode.Uri.joinPath(extensionUri, 'webview')
                ]
            }
        );

        WebviewDiffPanel.currentPanel = new WebviewDiffPanel(panel, extensionUri, diffTracker);
        WebviewDiffPanel.currentPanel.update(filePath);
        return WebviewDiffPanel.currentPanel;
    }

    public update(filePath: string): void {
        this.filePath = filePath;
        const fileName = filePath.split('/').pop() || filePath.split('\\').pop() || 'file';
        this.panel.title = `Diff: ${fileName}`;

        if (this.isInitialized) {
            // Send incremental update instead of regenerating HTML
            this.sendDataUpdate();
        } else {
            this.panel.webview.html = this.getHtmlContent();
            this.isInitialized = true;
        }
    }

    private sendDataUpdate(): void {
        const trackedChanges = this.diffTracker.getTrackedChanges();
        const fileChange = trackedChanges.find(c => c.filePath === this.filePath);
        const originalContent =
            fileChange?.originalContent ??
            this.diffTracker.getOriginalContent(this.filePath) ??
            '';
        // Try to get current content from: tracked changes > open document > original
        let currentContent = fileChange?.currentContent;
        if (currentContent === undefined) {
            const doc = vscode.workspace.textDocuments.find(d => d.uri.fsPath === this.filePath);
            currentContent = doc?.getText() ?? originalContent;
        }
        const changeBlocks = this.diffTracker.getChangeBlocks(this.filePath);
        const fileName = this.filePath.split('/').pop() || this.filePath.split('\\').pop() || 'file';
        const lang = this.getLangForFileName(fileName);

        this.panel.webview.postMessage({
            command: 'updateData',
            filePath: this.filePath,
            fileName,
            lang,
            oldContents: originalContent,
            newContents: currentContent,
            changeBlocks: changeBlocks.map(b => {
                const originalRange = this.getOriginalRangeForBlock(b);
                return {
                    originalStartLine: originalRange.startLine,
                    originalEndLine: originalRange.endLine,
                    blockId: b.blockId,
                    startLine: b.startLine,
                    endLine: b.endLine,
                    type: b.type,
                    blockIndex: b.blockIndex
                };
            }),
            style: this.currentStyle,
            wrap: this.currentWrap,
            expandAll: this.currentExpandAll
        });
    }

    private handleMessage(message: { command: string; filePath?: string; blockIndex?: number; lineNumber?: number; hunkIndex?: number; changeBlockIndex?: number; changeBlockId?: string; style?: string; wrap?: boolean; expandAll?: boolean }): void {
        switch (message.command) {
            case 'revertBlock':
                if (message.filePath && (message.changeBlockId !== undefined || message.changeBlockIndex !== undefined)) {
                    // executeCommand is async; onDidTrackChanges will trigger update() when done
                    vscode.commands.executeCommand(
                        'diffTracker.revertBlock',
                        message.filePath,
                        message.changeBlockId ?? message.changeBlockIndex
                    );
                }
                break;
            case 'keepBlock':
                if (message.filePath && (message.changeBlockId !== undefined || message.changeBlockIndex !== undefined)) {
                    // executeCommand is async; onDidTrackChanges will trigger update() when done
                    vscode.commands.executeCommand(
                        'diffTracker.keepBlock',
                        message.filePath,
                        message.changeBlockId ?? message.changeBlockIndex
                    );
                }
                break;
            case 'keepAll':
                if (message.filePath) {
                    // executeCommand is async; onDidTrackChanges will trigger update() when done
                    vscode.commands.executeCommand('diffTracker.keepAllBlocksInFile', message.filePath);
                }
                break;
            case 'revertAll':
                if (message.filePath) {
                    // executeCommand is async; onDidTrackChanges will trigger update() when done
                    vscode.commands.executeCommand('diffTracker.revertAllBlocksInFile', message.filePath);
                }
                break;
            case 'setStyle':
                if (message.style === 'split' || message.style === 'unified') {
                    this.currentStyle = message.style;
                }
                break;
            case 'setWrap':
                if (typeof message.wrap === 'boolean') {
                    this.currentWrap = message.wrap;
                }
                break;
            case 'setExpandAll':
                if (typeof message.expandAll === 'boolean') {
                    this.currentExpandAll = message.expandAll;
                }
                break;
        }
    }

    private findBlockIndex(filePath: string, blockIndex?: number, lineNumber?: number): number | undefined {
        // If blockIndex is directly provided, use it
        if (blockIndex !== undefined) {
            return blockIndex;
        }

        // Otherwise, find block by line number
        if (lineNumber !== undefined) {
            const blocks = this.diffTracker.getChangeBlocks(filePath);
            for (let i = 0; i < blocks.length; i++) {
                const block = blocks[i];
                if (lineNumber >= block.startLine && lineNumber <= block.endLine) {
                    return i;
                }
            }
            // If not found in range, find the closest block
            let closestIndex = 0;
            let closestDistance = Infinity;
            for (let i = 0; i < blocks.length; i++) {
                const block = blocks[i];
                const midPoint = (block.startLine + block.endLine) / 2;
                const distance = Math.abs(lineNumber - midPoint);
                if (distance < closestDistance) {
                    closestDistance = distance;
                    closestIndex = i;
                }
            }
            return blocks.length > 0 ? closestIndex : undefined;
        }

        return undefined;
    }

    private updateTheme(): void {
        const themeKind = vscode.window.activeColorTheme.kind;
        const themeType = themeKind === vscode.ColorThemeKind.Light ? 'light' : 'dark';
        this.panel.webview.postMessage({ command: 'setTheme', themeType });
    }

    private getLangForFileName(fileName: string): string {
        const ext = fileName.split('.').pop()?.toLowerCase() || '';
        const langMap: Record<string, string> = {
            'ts': 'typescript',
            'tsx': 'tsx',
            'js': 'javascript',
            'jsx': 'jsx',
            'py': 'python',
            'rs': 'rust',
            'go': 'go',
            'java': 'java',
            'cpp': 'cpp',
            'c': 'c',
            'h': 'c',
            'hpp': 'cpp',
            'css': 'css',
            'scss': 'scss',
            'html': 'html',
            'json': 'json',
            'md': 'markdown',
            'yaml': 'yaml',
            'yml': 'yaml',
            'xml': 'xml',
            'sql': 'sql',
            'sh': 'bash',
            'bash': 'bash',
            'zsh': 'bash',
            'zig': 'zig',
        };
        return langMap[ext] || 'plaintext';
    }

    private getHtmlContent(): string {
        const webview = this.panel.webview;
        const originalContent = this.diffTracker.getOriginalContent(this.filePath) || '';
        const trackedChanges = this.diffTracker.getTrackedChanges();
        const fileChange = trackedChanges.find(c => c.filePath === this.filePath);
        const currentContent = fileChange?.currentContent ?? originalContent;
        const fileName = this.filePath.split('/').pop() || this.filePath.split('\\').pop() || 'file';

        // Get change blocks from diffTracker - this is the source of truth for block indexing
        const changeBlocks = this.diffTracker.getChangeBlocks(this.filePath);
        const changeBlocksJson = JSON.stringify(changeBlocks.map(b => {
            const originalRange = this.getOriginalRangeForBlock(b);
            return {
                originalStartLine: originalRange.startLine,
                originalEndLine: originalRange.endLine,
                blockId: b.blockId,
                startLine: b.startLine,
                endLine: b.endLine,
                type: b.type,
                blockIndex: b.blockIndex
            };
        }));

        // Detect language from file extension
        const lang = this.getLangForFileName(fileName);

        // Determine initial theme
        const themeKind = vscode.window.activeColorTheme.kind;
        const initialThemeType = themeKind === vscode.ColorThemeKind.Light ? 'light' : 'dark';

        // Escape content for embedding in script
        const escapeForJs = (str: string) => {
            return str
                .replace(/\\/g, '\\\\')
                .replace(/`/g, '\\`')
                .replace(/\$/g, '\\$');
        };

        const escapedFilePath = this.filePath.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
        const diffsBundleUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this.extensionUri, 'webview', 'diffs-bundle.js')
        );
        const cspSource = webview.cspSource;

        return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline' ${cspSource}; script-src 'unsafe-inline' ${cspSource}; font-src ${cspSource};">
    <title>Diff View</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        body {
            font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif);
            background-color: var(--vscode-editor-background, #1e1e1e);
            color: var(--vscode-editor-foreground, #d4d4d4);
            overflow: hidden;
            height: 100vh;
            display: flex;
            flex-direction: column;
        }
        .toolbar {
            display: flex;
            gap: 8px;
            padding: 8px 12px;
            background: var(--vscode-editorGroupHeader-tabsBackground, #252526);
            border-bottom: 1px solid var(--vscode-editorGroup-border, #444);
            flex-shrink: 0;
        }
        .toolbar button {
            padding: 4px 12px;
            background: var(--vscode-button-background, #0e639c);
            color: var(--vscode-button-foreground, #fff);
            border: none;
            border-radius: 2px;
            cursor: pointer;
            font-size: 12px;
        }
        .toolbar button:hover {
            background: var(--vscode-button-hoverBackground, #1177bb);
        }
        .toolbar button.secondary {
            background: var(--vscode-button-secondaryBackground, #3a3d41);
            color: var(--vscode-button-secondaryForeground, #ccc);
        }
        .toolbar button.secondary:hover {
            background: var(--vscode-button-secondaryHoverBackground, #45494e);
        }
        .toolbar .btn-keep-all {
            background: #238636;
            color: #fff;
            border: 1px solid #238636;
        }
        .toolbar .btn-keep-all:hover {
            background: #2ea043;
        }
        .toolbar .btn-reject-all {
            background: var(--vscode-button-secondaryHoverBackground, #45494e);
            color: #fff;
            border: 1px solid var(--vscode-button-secondaryHoverBackground, #45494e);
        }
        .toolbar .btn-reject-all:hover {
            background: var(--vscode-button-secondaryHoverBackground, #4f5359);
        }
        .toolbar .spacer {
            flex: 1;
        }
        .toolbar .filename {
            font-size: 13px;
            font-weight: 500;
            color: var(--vscode-foreground, #ccc);
            align-self: center;
        }
        #diff-container {
            flex: 1;
            overflow: auto;
            padding: 0;
            padding-bottom: 28px;
        }
        .loading {
            display: flex;
            align-items: center;
            justify-content: center;
            height: 100%;
            color: var(--vscode-descriptionForeground, #888);
        }
        .no-changes {
            display: flex;
            align-items: center;
            justify-content: center;
            height: 100%;
            color: var(--vscode-descriptionForeground, #888);
            flex-direction: column;
            gap: 8px;
        }
        .no-changes svg {
            width: 48px;
            height: 48px;
            opacity: 0.5;
        }
        /* Floating action buttons (Cursor-style) - right side of change block */
        .hunk-actions {
            position: absolute;
            right: 8px;
            top: 0;
            display: flex;
            gap: 4px;
            z-index: 10;
        }
        .hunk-actions button {
            padding: 1px 6px;
            font-size: 11px;
            border: 1px solid rgba(255,255,255,0.3);
            border-radius: 3px;
            cursor: pointer;
            font-weight: 500;
            transition: all 0.15s;
            display: inline-flex;
            align-items: center;
            gap: 4px;
            line-height: 1.2;
            height: 18px;
        }
        .hunk-actions .btn-revert {
            background: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
            border-color: var(--vscode-button-secondaryBackground);
        }
        .hunk-actions .btn-revert:hover {
            background: var(--vscode-button-secondaryHoverBackground, var(--vscode-button-secondaryBackground));
            color: var(--vscode-button-secondaryForeground);
        }
        .hunk-actions .btn-keep {
            background: #238636;
            color: #fff;
            border-color: #238636;
        }
        .hunk-actions .btn-keep:hover {
            background: #2ea043;
        }
        .hunk-actions .shortcut {
            opacity: 0.7;
            font-size: 9px;
            padding-left: 2px;
        }
    </style>
</head>
<body>
    <div class="toolbar">
        <span class="filename">${this.escapeHtml(fileName)}</span>
        <div class="spacer"></div>
        <button id="btn-split" class="secondary">Split</button>
        <button id="btn-unified" class="secondary">Unified</button>
        <button id="btn-wrap" class="secondary">Wrap</button>
        <button id="btn-expand" class="secondary">Expand</button>
        <button id="btn-keep-all" class="btn-keep-all">Keep All</button>
        <button id="btn-reject-all" class="btn-reject-all">Reject All</button>
    </div>
    <div id="diff-container">
        <div class="loading">Loading diff...</div>
    </div>

    <script src="${diffsBundleUri}"></script>
    <script>
        const { FileDiff, parseDiffFromFile, diffAcceptRejectHunk } = window.PierreDiffs || {};
        if (!FileDiff || !parseDiffFromFile || !diffAcceptRejectHunk) {
            throw new Error('Failed to load local @pierre/diffs bundle.'); 
        }

        const vscode = acquireVsCodeApi();
        const container = document.getElementById('diff-container');
        const btnSplit = document.getElementById('btn-split');
        const btnUnified = document.getElementById('btn-unified');
        const btnWrap = document.getElementById('btn-wrap');
        const btnExpand = document.getElementById('btn-expand');
        const btnKeepAll = document.getElementById('btn-keep-all');
        const btnRejectAll = document.getElementById('btn-reject-all');

        let filePath = '${escapedFilePath}';

        const oldFile = {
            name: '${this.escapeHtml(fileName)}',
            contents: \`${escapeForJs(originalContent)}\`,
            lang: '${lang}'
        };

        const newFile = {
            name: '${this.escapeHtml(fileName)}',
            contents: \`${escapeForJs(currentContent)}\`,
            lang: '${lang}'
        };

        // Change blocks from diffTracker - source of truth for indexing
        let changeBlocks = ${changeBlocksJson};

        let currentStyle = 'unified';
        let currentWrap = false;
        let currentExpandAll = false;
        let fileDiffInstance = null;
        let fileDiffMeta = null;

        function clampLineNumber(lineNumber, totalLines) {
            if (totalLines <= 0) {
                return 1;
            }
            return Math.max(1, Math.min(lineNumber, totalLines));
        }

        function getAnnotationLineForBlock(block, totalLines, hasTrailingEmptyLine, newFileLines) {
            // Helper to find the last non-empty line starting from a given line
            function findLastNonEmptyLine(startLine) {
                for (let i = startLine; i >= 1; i--) {
                    if (newFileLines[i - 1] && newFileLines[i - 1].trim() !== '') {
                        return i;
                    }
                }
                // If all lines are empty, return line 1
                return 1;
            }

            // Helper to check if a line is empty or non-existent
            function isEmptyLine(lineNum) {
                if (lineNum < 1 || lineNum > totalLines) return true;
                return !newFileLines[lineNum - 1] || newFileLines[lineNum - 1].trim() === '';
            }

            if (block.type !== 'deleted') {
                let targetLine = clampLineNumber(block.endLine, totalLines);
                
                // If the block ends at or past EOF, or the target line is empty,
                // find the last non-empty line to anchor the annotation
                if (block.endLine >= totalLines || isEmptyLine(targetLine) || (hasTrailingEmptyLine && block.endLine === totalLines)) {
                    // Always use the last content line for EOF/empty line blocks
                    targetLine = findLastNonEmptyLine(totalLines);
                }
                
                return clampLineNumber(targetLine, totalLines);
            }

            // For deleted blocks, show on the line immediately after the deletion.
            // The current block endLine tends to be one line below the desired target,
            // so shift up by one.
            let targetLine = block.endLine - 1;

            // If deletion is at EOF or target is empty, place on the last non-empty line
            if (targetLine >= totalLines || isEmptyLine(targetLine)) {
                targetLine = findLastNonEmptyLine(totalLines);
            }

            return clampLineNumber(targetLine, totalLines);
        }

        // Create annotations based on diffTracker blocks, not diffs.com ChangeContent
        function getBlockAnnotations() {
            const annotations = [];
            const seenBlockIds = new Set();
            const newFileLines = newFile.contents.split('\\n');
            const totalNewLines = newFileLines.length;
            const hasTrailingEmptyLine = newFileLines[newFileLines.length - 1] === '';
            
            changeBlocks.forEach((block) => {
                if (!block || typeof block.blockId !== 'string' || seenBlockIds.has(block.blockId)) {
                    return;
                }
                seenBlockIds.add(block.blockId);

                let side = 'additions';
                let lineNumber = getAnnotationLineForBlock(block, totalNewLines, hasTrailingEmptyLine, newFileLines);

                if (block.type === 'deleted') {
                    // Deletion-only hunks should annotate the deletions side, especially when new file is empty.
                    side = 'deletions';
                    const endOnOriginal = typeof block.originalEndLine === 'number' && block.originalEndLine > 0
                        ? block.originalEndLine
                        : (typeof block.originalStartLine === 'number' && block.originalStartLine > 0 ? block.originalStartLine : 1);
                    lineNumber = Math.max(1, endOnOriginal);
                }
                
                annotations.push({
                    side: side,
                    lineNumber: lineNumber,
                    metadata: { 
                        blockId: block.blockId,
                        blockIndex: block.blockIndex
                    }
                });
            });
            
            return annotations;
        }

        function createHunkActionButtons(blockId, blockIndex) {
            const wrapper = document.createElement('div');
            wrapper.className = 'hunk-actions';
            
            const revertBtn = document.createElement('button');
            revertBtn.className = 'btn-revert';
            revertBtn.innerHTML = 'Undo <span class="shortcut">⌘N</span>';
            revertBtn.title = 'Revert this change (block ' + (blockIndex + 1) + ')';
            revertBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                vscode.postMessage({ 
                    command: 'revertBlock', 
                    filePath: filePath,
                    changeBlockId: blockId
                });
            });

            const keepBtn = document.createElement('button');
            keepBtn.className = 'btn-keep';
            keepBtn.innerHTML = 'Keep <span class="shortcut">⌘Y</span>';
            keepBtn.title = 'Accept this change (block ' + (blockIndex + 1) + ')';
            keepBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                vscode.postMessage({ 
                    command: 'keepBlock', 
                    filePath: filePath,
                    changeBlockId: blockId
                });
            });

            wrapper.appendChild(revertBtn);
            wrapper.appendChild(keepBtn);
            return wrapper;
        }

        function renderDiff(style) {
            currentStyle = style;
            container.innerHTML = '';

            // Check for no changes: both content identical AND no change blocks
            const hasContentDiff = oldFile.contents !== newFile.contents;
            const hasBlocks = changeBlocks.length > 0;
            
            if (!hasContentDiff && !hasBlocks) {
                container.innerHTML = '<div class="no-changes"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" /></svg><span>No changes detected</span></div>';
                return;
            }

            fileDiffMeta = parseDiffFromFile(oldFile, newFile);
            
            // Use diffTracker blocks for annotations
            const blockAnnotations = getBlockAnnotations();
            
            const annotationsToRender = blockAnnotations;

            fileDiffInstance = new FileDiff({
                theme: { dark: 'github-dark', light: 'github-light' },
                themeType: '${initialThemeType}',
                diffStyle: style,
                diffIndicators: 'bars',
                lineDiffType: 'word-alt',
                hunkSeparators: 'line-info',
                overflow: currentWrap ? 'wrap' : 'scroll',
                unsafeCSS: '[data-code]{ padding-bottom: calc(1lh + var(--diffs-gap-block, 8px)) !important; } [data-annotation-content]{ overflow: visible !important; } [data-line]{ position: relative; }',
                expandUnchanged: currentExpandAll,
                disableFileHeader: true,
                renderAnnotation(annotation) {
                    return createHunkActionButtons(annotation.metadata.blockId, annotation.metadata.blockIndex);
                }
            });

            fileDiffInstance.render({
                fileDiff: fileDiffMeta,
                lineAnnotations: annotationsToRender,
                containerWrapper: container,
            });

            btnSplit.classList.toggle('secondary', style !== 'split');
            btnUnified.classList.toggle('secondary', style !== 'unified');
            btnWrap.classList.toggle('secondary', !currentWrap);
            btnExpand.classList.toggle('secondary', !currentExpandAll);
        }

        btnSplit.addEventListener('click', () => {
            renderDiff('split');
            vscode.postMessage({ command: 'setStyle', style: 'split' });
        });
        btnUnified.addEventListener('click', () => {
            renderDiff('unified');
            vscode.postMessage({ command: 'setStyle', style: 'unified' });
        });
        btnWrap.addEventListener('click', () => {
            currentWrap = !currentWrap;
            renderDiff(currentStyle);
            vscode.postMessage({ command: 'setWrap', wrap: currentWrap });
        });
        btnExpand.addEventListener('click', () => {
            currentExpandAll = !currentExpandAll;
            renderDiff(currentStyle);
            vscode.postMessage({ command: 'setExpandAll', expandAll: currentExpandAll });
        });
        btnKeepAll.addEventListener('click', () => {
            vscode.postMessage({ command: 'keepAll', filePath: filePath });
        });
        btnRejectAll.addEventListener('click', () => {
            vscode.postMessage({ command: 'revertAll', filePath: filePath });
        });

        // Handle messages from extension
        window.addEventListener('message', event => {
            const message = event.data;
            if (message.command === 'setTheme' && fileDiffInstance) {
                fileDiffInstance.setThemeType(message.themeType);
            } else if (message.command === 'updateData') {
                // Update data and re-render with current style
                if (typeof message.filePath === 'string') {
                    filePath = message.filePath;
                }
                if (typeof message.fileName === 'string') {
                    oldFile.name = message.fileName;
                    newFile.name = message.fileName;
                }
                if (typeof message.lang === 'string') {
                    oldFile.lang = message.lang;
                    newFile.lang = message.lang;
                }
                oldFile.contents = message.oldContents;
                newFile.contents = message.newContents;
                // Replace array reference atomically to avoid race conditions
                changeBlocks = message.changeBlocks.slice();
                if (typeof message.wrap === 'boolean') {
                    currentWrap = message.wrap;
                }
                if (typeof message.expandAll === 'boolean') {
                    currentExpandAll = message.expandAll;
                }
                renderDiff(currentStyle);
            }
        });

        // Initial render
        renderDiff('unified');
    </script>
</body>
</html>`;
    }

    private escapeHtml(str: string): string {
        return str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    private getOriginalRangeForBlock(block: { changes: Array<{ originalLineNumber?: number }> }): { startLine: number; endLine: number } {
        const lines = block.changes
            .map(change => change.originalLineNumber)
            .filter((n): n is number => n !== undefined)
            .sort((a, b) => a - b);

        if (lines.length === 0) {
            return { startLine: 0, endLine: 0 };
        }

        return { startLine: lines[0], endLine: lines[lines.length - 1] };
    }

    public dispose(): void {
        WebviewDiffPanel.currentPanel = undefined;
        this.panel.dispose();
        while (this.disposables.length) {
            const disposable = this.disposables.pop();
            if (disposable) {
                disposable.dispose();
            }
        }
    }
}
