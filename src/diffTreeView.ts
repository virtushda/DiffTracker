import * as vscode from 'vscode';
import * as path from 'path';
import { DiffTracker, FileDiff } from './diffTracker';

interface DirNode {
    name: string;
    childrenDirs: Map<string, DirNode>;
    files: FileDiff[];
}

export class DiffTreeDataProvider implements vscode.TreeDataProvider<TreeItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<TreeItem | undefined | null | void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    constructor(private diffTracker: DiffTracker) { }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: TreeItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: TreeItem): Thenable<TreeItem[]> {
        const items: TreeItem[] = [];

        // Root level - show files
        if (!element) {
            const changes = this.diffTracker.getTrackedChanges();

            if (changes.length === 0) {
                const emptyItem = new TreeItem('No changes tracked', vscode.TreeItemCollapsibleState.None);
                emptyItem.description = this.diffTracker.getIsRecording() ? 'Make some edits...' : 'Start recording to track changes';
                return Promise.resolve([emptyItem]);
            }

            // Add "Revert All Changes" button at top
            const revertButton = new TreeItem('Revert All Changes', vscode.TreeItemCollapsibleState.None);
            revertButton.command = {
                command: 'diffTracker.revertAllChanges',
                title: 'Revert All Changes'
            };
            revertButton.iconPath = new vscode.ThemeIcon('discard');
            revertButton.tooltip = `Restore all ${changes.length} file(s) to original state`;
            revertButton.description = `${changes.length} file(s)`;
            items.push(revertButton);

            const rootNode: DirNode = {
                name: '',
                childrenDirs: new Map<string, DirNode>(),
                files: []
            };

            for (const change of changes) {
                const relativePath = this.toWorkspaceRelative(change.filePath);
                this.insertFileIntoTree(rootNode, relativePath, change);
            }

            items.push(...this.buildTreeItemsFromNode(rootNode, true));
        } else if (element.children) {
            return Promise.resolve(element.children);
        }

        return Promise.resolve(items);
    }

    private createFileItem(fileDiff: FileDiff): TreeItem {
        const displayName = fileDiff.isDeleted ? `${fileDiff.fileName} [Deleted]` : fileDiff.fileName;
        const item = new TreeItem(displayName, vscode.TreeItemCollapsibleState.None);
        item.filePath = fileDiff.filePath;
        item.isDeleted = fileDiff.isDeleted;
        item.iconPath = this.getFileIcon(fileDiff.fileName);
        item.tooltip = fileDiff.isDeleted
            ? `${fileDiff.filePath}\nDeleted from disk`
            : fileDiff.filePath;

        // Open with configured default mode
        item.command = {
            command: 'diffTracker.openDiffDefault',
            title: 'Open Diff',
            arguments: [item]
        };

        // Add side-by-side button in context menu
        item.contextValue = 'changedFile';

        return item;
    }

    private toWorkspaceRelative(filePath: string): string {
        const uri = vscode.Uri.file(filePath);
        const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);
        if (!workspaceFolder) {
            return path.basename(filePath);
        }

        const relativePath = path.relative(workspaceFolder.uri.fsPath, filePath);
        const normalizedRelative = relativePath.split(path.sep).join('/');

        // Avoid collisions across workspace folders in multi-root workspaces.
        const workspaceFolders = vscode.workspace.workspaceFolders ?? [];
        if (workspaceFolders.length > 1) {
            return `${workspaceFolder.name}/${normalizedRelative}`;
        }

        return normalizedRelative;
    }

    private insertFileIntoTree(rootNode: DirNode, relativePath: string, fileDiff: FileDiff): void {
        const normalized = relativePath.replace(/\\/g, '/');
        const parts = normalized.split('/').filter(Boolean);
        if (parts.length === 0) {
            rootNode.files.push(fileDiff);
            return;
        }

        let current = rootNode;
        for (let i = 0; i < parts.length - 1; i++) {
            const dirName = parts[i];
            let next = current.childrenDirs.get(dirName);
            if (!next) {
                next = {
                    name: dirName,
                    childrenDirs: new Map<string, DirNode>(),
                    files: []
                };
                current.childrenDirs.set(dirName, next);
            }
            current = next;
        }

        current.files.push(fileDiff);
    }

    private buildTreeItemsFromNode(node: DirNode, isRoot = false): TreeItem[] {
        const items: TreeItem[] = [];

        const sortedDirNames = [...node.childrenDirs.keys()].sort((a, b) => a.localeCompare(b));
        for (const dirName of sortedDirNames) {
            const childNode = node.childrenDirs.get(dirName);
            if (!childNode) {
                continue;
            }

            const dirItem = new TreeItem(childNode.name, vscode.TreeItemCollapsibleState.Expanded);
            dirItem.iconPath = new vscode.ThemeIcon('folder');
            dirItem.children = this.buildTreeItemsFromNode(childNode);
            dirItem.description = `${this.countFilesInNode(childNode)} file(s)`;
            items.push(dirItem);
        }

        const sortedFiles = [...node.files].sort((a, b) =>
            a.fileName.localeCompare(b.fileName) || a.filePath.localeCompare(b.filePath)
        );
        for (const file of sortedFiles) {
            items.push(this.createFileItem(file));
        }

        if (isRoot) {
            return items;
        }

        return items;
    }

    private countFilesInNode(node: DirNode): number {
        let count = node.files.length;
        for (const childNode of node.childrenDirs.values()) {
            count += this.countFilesInNode(childNode);
        }
        return count;
    }

    private getFileIcon(fileName: string): vscode.ThemeIcon {
        const ext = fileName.split('.').pop()?.toLowerCase() || '';

        // Map file extensions to VS Code icons
        const iconMap: { [key: string]: string } = {
            // Programming languages
            'ts': 'symbol-class',
            'tsx': 'symbol-class',
            'js': 'symbol-method',
            'jsx': 'symbol-method',
            'py': 'symbol-namespace',
            'java': 'symbol-interface',
            'c': 'symbol-struct',
            'cpp': 'symbol-struct',
            'h': 'symbol-struct',
            'cs': 'symbol-class',
            'go': 'symbol-method',
            'rs': 'symbol-module',
            'rb': 'ruby',
            'php': 'symbol-method',
            'swift': 'symbol-class',
            'kt': 'symbol-class',

            // Web
            'html': 'code',
            'css': 'symbol-color',
            'scss': 'symbol-color',
            'sass': 'symbol-color',
            'less': 'symbol-color',
            'vue': 'symbol-misc',

            // Config/Data
            'json': 'json',
            'yaml': 'symbol-key',
            'yml': 'symbol-key',
            'xml': 'symbol-key',
            'toml': 'symbol-key',
            'ini': 'gear',
            'env': 'gear',

            // Docs
            'md': 'book',
            'txt': 'file-text',
            'pdf': 'file-pdf',

            // Others
            'sql': 'database',
            'sh': 'terminal',
            'bash': 'terminal',
            'zsh': 'terminal',
            'dockerfile': 'package'
        };

        const iconName = iconMap[ext] || 'file-code';
        return new vscode.ThemeIcon(iconName);
    }
}

class TreeItem extends vscode.TreeItem {
    public children?: TreeItem[];
    public filePath?: string;
    public isDeleted?: boolean;

    constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState
    ) {
        super(label, collapsibleState);
    }
}
