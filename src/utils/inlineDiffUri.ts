import * as path from 'path';
import * as vscode from 'vscode';

const INLINE_PREFIX = '(Diff) ';

export function toInlineVirtualPath(filePath: string): string {
    const dir = path.dirname(filePath);
    const fileName = path.basename(filePath);
    return path.join(dir, `${INLINE_PREFIX}${fileName}`);
}

export function createInlineDiffUri(filePath: string): vscode.Uri {
    return vscode.Uri.file(toInlineVirtualPath(filePath)).with({ scheme: 'diff-tracker-inline' });
}

export function toTrackedFilePath(inlinePathOrFilePath: string): string {
    const dir = path.dirname(inlinePathOrFilePath);
    const fileName = path.basename(inlinePathOrFilePath);
    if (fileName.startsWith(INLINE_PREFIX)) {
        return path.join(dir, fileName.substring(INLINE_PREFIX.length));
    }
    return inlinePathOrFilePath;
}
