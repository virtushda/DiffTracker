import assert from 'node:assert/strict';
import { parseDiffFromFile } from '@pierre/diffs';

function toPositiveInt(value) {
    const num = Number(value);
    if (!Number.isFinite(num)) {
        return undefined;
    }
    const int = Math.trunc(num);
    return int > 0 ? int : undefined;
}

function uniqueSortedPositiveNumbers(values) {
    if (!Array.isArray(values)) {
        return [];
    }
    const unique = new Set();
    values.forEach(value => {
        const int = toPositiveInt(value);
        if (int !== undefined) {
            unique.add(int);
        }
    });
    return [...unique].sort((a, b) => a - b);
}

function clampLineNumber(lineNumber, totalLines) {
    if (totalLines <= 0) {
        return 1;
    }
    const normalized = toPositiveInt(lineNumber) ?? 1;
    return Math.max(1, Math.min(normalized, totalLines));
}

function getSideLineCount(diffMeta, side) {
    const lines = side === 'additions' ? diffMeta?.newLines : diffMeta?.oldLines;
    return Array.isArray(lines) ? lines.length : 0;
}

function getHunkSideRange(hunk, side, sideLineCount) {
    if (!hunk || sideLineCount <= 0) {
        return undefined;
    }
    const start = toPositiveInt(side === 'additions' ? hunk.additionStart : hunk.deletionStart);
    const count = toPositiveInt(side === 'additions' ? hunk.additionCount : hunk.deletionCount);
    if (start === undefined || count === undefined) {
        return undefined;
    }
    const end = start + count - 1;
    if (end < 1 || start > sideLineCount) {
        return undefined;
    }
    return {
        start: clampLineNumber(start, sideLineCount),
        end: clampLineNumber(end, sideLineCount)
    };
}

function findHunkForBlock(block, diffMeta, side) {
    if (!diffMeta || !Array.isArray(diffMeta.hunks) || diffMeta.hunks.length === 0) {
        return undefined;
    }

    const rangeStart = toPositiveInt(
        side === 'additions'
            ? block.startLine
            : (block.originalStartLine ?? block.originalEndLine)
    );
    const rangeEnd = toPositiveInt(
        side === 'additions'
            ? block.endLine
            : (block.originalEndLine ?? block.originalStartLine)
    ) ?? rangeStart;

    if (rangeStart === undefined || rangeEnd === undefined) {
        return undefined;
    }

    return diffMeta.hunks.find(hunk => {
        const start = toPositiveInt(side === 'additions' ? hunk.additionStart : hunk.deletionStart);
        const count = toPositiveInt(side === 'additions' ? hunk.additionCount : hunk.deletionCount);
        if (start === undefined || count === undefined) {
            return false;
        }
        const end = start + count - 1;
        return rangeStart <= end && rangeEnd >= start;
    });
}

function resolveBlockAnnotation(block, diffMeta) {
    if (!block || typeof block.blockId !== 'string') {
        return undefined;
    }

    const side = block.type === 'deleted' ? 'deletions' : 'additions';
    const currentLineNumbers = uniqueSortedPositiveNumbers(block.currentLineNumbers);
    const originalLineNumbers = uniqueSortedPositiveNumbers(block.originalLineNumbers);

    if (side === 'additions') {
        if (currentLineNumbers.length > 0) {
            return {
                side,
                lineNumber: currentLineNumbers[currentLineNumbers.length - 1],
                strategy: 'block.currentLineNumbers.last'
            };
        }

        const fallbackLine = toPositiveInt(block.endLine) ?? toPositiveInt(block.startLine) ?? 1;
        return {
            side,
            lineNumber: fallbackLine,
            strategy: 'block.endLine'
        };
    }

    if (originalLineNumbers.length > 0) {
        return {
            side,
            lineNumber: originalLineNumbers[originalLineNumbers.length - 1],
            strategy: 'block.originalLineNumbers.last'
        };
    }

    const fallbackLine = toPositiveInt(block.originalEndLine)
        ?? toPositiveInt(block.originalStartLine)
        ?? 1;
    return {
        side,
        lineNumber: fallbackLine,
        strategy: 'block.originalEndLine'
    };
}

function validateAnnotationTarget(annotation, block, diffMeta) {
    if (!annotation) {
        return undefined;
    }

    const sideLineCount = getSideLineCount(diffMeta, annotation.side);
    if (sideLineCount <= 0) {
        return undefined;
    }

    const target = toPositiveInt(annotation.lineNumber);
    if (target !== undefined && target <= sideLineCount) {
        return {
            ...annotation,
            lineNumber: target,
            strategy: annotation.strategy + ' -> direct'
        };
    }

    const hunk = findHunkForBlock(block, diffMeta, annotation.side);
    const hunkRange = getHunkSideRange(hunk, annotation.side, sideLineCount);
    if (hunkRange) {
        const base = target ?? hunkRange.end;
        const lineNumber = Math.max(hunkRange.start, Math.min(base, hunkRange.end));
        return {
            ...annotation,
            lineNumber,
            strategy: annotation.strategy + ' -> hunk-range'
        };
    }

    const candidates = annotation.side === 'additions'
        ? uniqueSortedPositiveNumbers(block.currentLineNumbers)
        : uniqueSortedPositiveNumbers(block.originalLineNumbers);
    const inRangeCandidates = candidates.filter(line => line >= 1 && line <= sideLineCount);
    if (inRangeCandidates.length > 0) {
        return {
            ...annotation,
            lineNumber: inRangeCandidates[inRangeCandidates.length - 1],
            strategy: annotation.strategy + ' -> block-candidate'
        };
    }

    return {
        ...annotation,
        lineNumber: clampLineNumber(target ?? 1, sideLineCount),
        strategy: annotation.strategy + ' -> global-clamp'
    };
}

function resolveAndValidate(block, oldContents, newContents) {
    const diffMeta = parseDiffFromFile(
        { name: 'sample.txt', contents: oldContents },
        { name: 'sample.txt', contents: newContents }
    );
    const resolved = resolveBlockAnnotation(block, diffMeta);
    return validateAnnotationTarget(resolved, block, diffMeta);
}

function runCase(name, fn) {
    try {
        fn();
        console.log(`PASS ${name}`);
    } catch (error) {
        console.error(`FAIL ${name}`);
        console.error(error);
        process.exitCode = 1;
    }
}

runCase('middle blank-line insertion anchors exact added line', () => {
    const oldContents = 'use std::io;\n\nfn main() {}\n';
    const newContents = 'use std::io;\n\n\nfn main() {}\n';
    const block = {
        blockId: 'b1',
        blockIndex: 0,
        type: 'added',
        startLine: 3,
        endLine: 3,
        originalStartLine: 0,
        originalEndLine: 0,
        currentLineNumbers: [3],
        originalLineNumbers: []
    };

    const annotation = resolveAndValidate(block, oldContents, newContents);
    assert.equal(annotation?.side, 'additions');
    assert.equal(annotation?.lineNumber, 3);
});

runCase('tail blank-line insertion remains visible and anchors EOF added line', () => {
    const oldContents = 'a\nb\n';
    const newContents = 'a\nb\n\n';
    const block = {
        blockId: 'b2',
        blockIndex: 0,
        type: 'added',
        startLine: 3,
        endLine: 3,
        originalStartLine: 0,
        originalEndLine: 0,
        currentLineNumbers: [3],
        originalLineNumbers: []
    };

    const annotation = resolveAndValidate(block, oldContents, newContents);
    assert.equal(annotation?.side, 'additions');
    assert.equal(annotation?.lineNumber, 3);
});

runCase('modified line anchors on additions side', () => {
    const oldContents = 'a\nold\nb\n';
    const newContents = 'a\nnew\nb\n';
    const block = {
        blockId: 'b3',
        blockIndex: 0,
        type: 'modified',
        startLine: 2,
        endLine: 2,
        originalStartLine: 2,
        originalEndLine: 2,
        currentLineNumbers: [2],
        originalLineNumbers: [2]
    };

    const annotation = resolveAndValidate(block, oldContents, newContents);
    assert.equal(annotation?.side, 'additions');
    assert.equal(annotation?.lineNumber, 2);
});

runCase('deleted line anchors on deletions side original line', () => {
    const oldContents = 'a\nremoved\nb\n';
    const newContents = 'a\nb\n';
    const block = {
        blockId: 'b4',
        blockIndex: 0,
        type: 'deleted',
        startLine: 2,
        endLine: 2,
        originalStartLine: 2,
        originalEndLine: 2,
        currentLineNumbers: [2],
        originalLineNumbers: [2]
    };

    const annotation = resolveAndValidate(block, oldContents, newContents);
    assert.equal(annotation?.side, 'deletions');
    assert.equal(annotation?.lineNumber, 2);
});

runCase('CRLF tail blank-line insertion keeps stable anchor', () => {
    const oldContents = 'a\r\nb\r\n';
    const newContents = 'a\r\nb\r\n\r\n';
    const block = {
        blockId: 'b5',
        blockIndex: 0,
        type: 'added',
        startLine: 3,
        endLine: 3,
        originalStartLine: 0,
        originalEndLine: 0,
        currentLineNumbers: [3],
        originalLineNumbers: []
    };

    const annotation = resolveAndValidate(block, oldContents, newContents);
    assert.equal(annotation?.side, 'additions');
    assert.equal(annotation?.lineNumber, 3);
});

runCase('out-of-range line falls back deterministically', () => {
    const oldContents = 'a\nb\n';
    const newContents = 'a\nb\n\n';
    const block = {
        blockId: 'b6',
        blockIndex: 0,
        type: 'added',
        startLine: 999,
        endLine: 999,
        originalStartLine: 0,
        originalEndLine: 0,
        currentLineNumbers: [999],
        originalLineNumbers: []
    };

    const annotation1 = resolveAndValidate(block, oldContents, newContents);
    const annotation2 = resolveAndValidate(block, oldContents, newContents);

    assert.equal(annotation1?.side, 'additions');
    assert.equal(annotation1?.lineNumber, 3);
    assert.deepEqual(annotation1, annotation2);
});
