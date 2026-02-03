import * as vscode from 'vscode';
import { DiffTracker } from './diffTracker';

export class InlineContentProvider implements vscode.TextDocumentContentProvider {
    private _onDidChange = new vscode.EventEmitter<vscode.Uri>();
    readonly onDidChange = this._onDidChange.event;

    constructor(private diffTracker: DiffTracker) {
        this.diffTracker.onDidTrackChanges(() => {
            const changes = this.diffTracker.getTrackedChanges();
            changes.forEach(change => {
                const uri = vscode.Uri.file(change.filePath).with({ scheme: 'diff-tracker-inline' });
                this._onDidChange.fire(uri);
            });
        });
    }

    provideTextDocumentContent(uri: vscode.Uri): string {
        // Extract the original file path (remove the (Diff) prefix if present)
        let filePath = uri.fsPath;


        // Remove "(Diff) " prefix from filename if present
        const lastSlash = filePath.lastIndexOf('/');
        if (lastSlash !== -1) {
            const dir = filePath.substring(0, lastSlash);
            const fileName = filePath.substring(lastSlash + 1);
            if (fileName.startsWith('(Diff) ')) {
                filePath = dir + '/' + fileName.substring(7); // Remove "(Diff) " (7 chars)
            }
        }


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
