import * as vscode from 'vscode';
import { DiffTracker, TrackChangesEvent } from './diffTracker';
import { createInlineDiffUri, toTrackedFilePath } from './utils/inlineDiffUri';

export class InlineContentProvider implements vscode.TextDocumentContentProvider {
    private _onDidChange = new vscode.EventEmitter<vscode.Uri>();
    readonly onDidChange = this._onDidChange.event;

    constructor(private diffTracker: DiffTracker) {
        this.diffTracker.onDidTrackChanges((event: TrackChangesEvent) => {
            const firedUris = new Set<string>();
            const fireUri = (uri: vscode.Uri): void => {
                const key = uri.toString();
                if (firedUris.has(key)) {
                    return;
                }
                firedUris.add(key);
                this._onDidChange.fire(uri);
            };

            if (event.fullRefresh) {
                vscode.workspace.textDocuments
                    .filter(doc => doc.uri.scheme === 'diff-tracker-inline')
                    .forEach(doc => {
                        fireUri(doc.uri);
                    });

                this.diffTracker.getTrackedChanges().forEach(change => {
                    fireUri(createInlineDiffUri(change.filePath));
                });
                return;
            }

            const affectedFiles = new Set<string>([
                ...event.changedFiles,
                ...event.removedFiles
            ]);
            if (affectedFiles.size === 0) {
                return;
            }

            vscode.workspace.textDocuments
                .filter(doc => doc.uri.scheme === 'diff-tracker-inline')
                .forEach(doc => {
                    const filePath = toTrackedFilePath(doc.uri.fsPath);
                    if (affectedFiles.has(filePath)) {
                        fireUri(doc.uri);
                    }
                });

            affectedFiles.forEach(filePath => {
                fireUri(createInlineDiffUri(filePath));
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
