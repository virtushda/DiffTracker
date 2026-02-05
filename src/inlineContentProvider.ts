import * as vscode from 'vscode';
import { DiffTracker } from './diffTracker';
import { createInlineDiffUri, toTrackedFilePath } from './utils/inlineDiffUri';

export class InlineContentProvider implements vscode.TextDocumentContentProvider {
    private _onDidChange = new vscode.EventEmitter<vscode.Uri>();
    readonly onDidChange = this._onDidChange.event;

    constructor(private diffTracker: DiffTracker) {
        this.diffTracker.onDidTrackChanges(() => {
            const firedUris = new Set<string>();
            vscode.workspace.textDocuments
                .filter(doc => doc.uri.scheme === 'diff-tracker-inline')
                .forEach(doc => {
                    const key = doc.uri.toString();
                    if (firedUris.has(key)) {
                        return;
                    }
                    firedUris.add(key);
                    this._onDidChange.fire(doc.uri);
                });

            const changes = this.diffTracker.getTrackedChanges();
            changes.forEach(change => {
                const uri = createInlineDiffUri(change.filePath);
                const key = uri.toString();
                if (firedUris.has(key)) {
                    return;
                }
                firedUris.add(key);
                this._onDidChange.fire(uri);
            });
        });
    }

    provideTextDocumentContent(uri: vscode.Uri): string {
        const filePath = toTrackedFilePath(uri.fsPath);
        const content = this.diffTracker.getInlineContent(filePath);

        if (content !== undefined) {
            return content;
        }

        return '// Inline diff not available for: ' + filePath;
    }

    public dispose() {
        this._onDidChange.dispose();
    }
}
