import * as vscode from 'vscode';
import { DiffTracker } from './diffTracker';

/**
 * Provides CodeLens actions for change blocks
 */
export class DiffCodeLensProvider implements vscode.CodeLensProvider {
    private _onDidChangeCodeLenses = new vscode.EventEmitter<void>();
    public readonly onDidChangeCodeLenses = this._onDidChangeCodeLenses.event;
    private lensCache = new Map<string, vscode.CodeLens[]>();
    private prewarmTimer: NodeJS.Timeout | undefined;
    private disposed = false;
    private readonly prewarmDelayMs = 20;

    constructor(private diffTracker: DiffTracker) {
        // Refresh CodeLens when diff changes
        this.diffTracker.onDidTrackChanges(() => {
            this.clearLensCache();
            this._onDidChangeCodeLenses.fire();
            this.schedulePrewarmVisibleEditors();
        });
    }

    public refresh(): void {
        this._onDidChangeCodeLenses.fire();
    }

    public provideCodeLenses(
        document: vscode.TextDocument,
        _token: vscode.CancellationToken
    ): vscode.CodeLens[] | Thenable<vscode.CodeLens[]> {
        if (!this.diffTracker.getIsRecording()) {
            return [];
        }

        // Check if CodeLens is enabled in settings
        const config = vscode.workspace.getConfiguration('diffTracker');
        if (!config.get<boolean>('showCodeLens', true)) {
            return [];
        }

        if (document.uri.scheme !== 'file') {
            return [];
        }

        const cacheKey = this.getCacheKey(document);
        const cached = this.lensCache.get(cacheKey);
        if (cached) {
            return cached;
        }

        const filePath = document.uri.fsPath;
        const blocks = this.diffTracker.getChangeBlocks(filePath);

        if (blocks.length === 0) {
            this.lensCache.set(cacheKey, []);
            return [];
        }

        const codeLenses: vscode.CodeLens[] = [];

        // File-level actions at the very top (line 0)
        const topRange = new vscode.Range(0, 0, 0, 0);

        codeLenses.push(new vscode.CodeLens(topRange, {
            title: '↩ Revert All',
            command: 'diffTracker.revertAllBlocksInFile',
            arguments: [filePath],
            tooltip: 'Revert all changes in this file'
        }));

        codeLenses.push(new vscode.CodeLens(topRange, {
            title: '✓ Keep All',
            command: 'diffTracker.keepAllBlocksInFile',
            arguments: [filePath],
            tooltip: 'Accept all changes in this file'
        }));

        codeLenses.push(new vscode.CodeLens(topRange, {
            title: `${blocks.length} block${blocks.length > 1 ? 's' : ''}`,
            command: '',
            arguments: []
        }));

        // Block-level actions
        blocks.forEach((block, index) => {
            // Position CodeLens at the start of the block
            const line = Math.max(0, block.startLine - 1);
            const range = new vscode.Range(line, 0, line, 0);

            // "Revert" action
            codeLenses.push(new vscode.CodeLens(range, {
                title: '↩ Revert',
                command: 'diffTracker.revertBlock',
                arguments: [filePath, block.blockId],
                tooltip: 'Revert this block to original content'
            }));

            // "Keep" action
            codeLenses.push(new vscode.CodeLens(range, {
                title: '✓ Keep',
                command: 'diffTracker.keepBlock',
                arguments: [filePath, block.blockId],
                tooltip: 'Accept this change and remove from diff'
            }));

            // Block counter and navigation
            const totalBlocks = blocks.length;
            const blockNum = index + 1;

            if (totalBlocks > 1) {
                // Previous block
                if (index > 0) {
                    codeLenses.push(new vscode.CodeLens(range, {
                        title: '↑',
                        command: 'diffTracker.goToBlock',
                        arguments: [filePath, blocks[index - 1].blockId],
                        tooltip: 'Go to previous change block'
                    }));
                }

                // Block counter
                codeLenses.push(new vscode.CodeLens(range, {
                    title: `${blockNum} of ${totalBlocks}`,
                    command: '',
                    arguments: []
                }));

                // Next block
                if (index < totalBlocks - 1) {
                    codeLenses.push(new vscode.CodeLens(range, {
                        title: '↓',
                        command: 'diffTracker.goToBlock',
                        arguments: [filePath, blocks[index + 1].blockId],
                        tooltip: 'Go to next change block'
                    }));
                }
            }
        });

        this.lensCache.set(cacheKey, codeLenses);
        return codeLenses;
    }

    public dispose(): void {
        this.disposed = true;
        if (this.prewarmTimer) {
            clearTimeout(this.prewarmTimer);
            this.prewarmTimer = undefined;
        }
        this.clearLensCache();
        this._onDidChangeCodeLenses.dispose();
    }

    private getCacheKey(document: vscode.TextDocument): string {
        return `${document.uri.toString()}::${document.version}`;
    }

    private clearLensCache(): void {
        this.lensCache.clear();
    }

    private schedulePrewarmVisibleEditors(): void {
        if (this.disposed) {
            return;
        }
        if (this.prewarmTimer) {
            return;
        }

        this.prewarmTimer = setTimeout(() => {
            this.prewarmTimer = undefined;
            void this.prewarmVisibleEditors();
        }, this.prewarmDelayMs);
    }

    private async prewarmVisibleEditors(): Promise<void> {
        if (this.disposed || !this.diffTracker.getIsRecording()) {
            return;
        }

        const config = vscode.workspace.getConfiguration('diffTracker');
        if (!config.get<boolean>('showCodeLens', true)) {
            return;
        }

        const seen = new Set<string>();
        for (const editor of vscode.window.visibleTextEditors) {
            if (this.disposed) {
                return;
            }

            const document = editor.document;
            if (document.uri.scheme !== 'file') {
                continue;
            }

            const uriKey = document.uri.toString();
            if (seen.has(uriKey)) {
                continue;
            }
            seen.add(uriKey);

            const cacheKey = this.getCacheKey(document);
            if (this.lensCache.has(cacheKey)) {
                continue;
            }

            try {
                await vscode.commands.executeCommand<vscode.CodeLens[]>(
                    'vscode.executeCodeLensProvider',
                    document.uri
                );
            } catch {
                // Ignore prewarm failures and let normal pull-based rendering continue.
            }
        }
    }
}
