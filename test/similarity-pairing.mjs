import assert from 'node:assert/strict';

function tokenizeForSimilarity(input) {
    const normalized = (input ?? '').trim().replace(/\s+/g, ' ');
    if (!normalized) {
        return [];
    }

    const tokens = normalized.match(/[A-Za-z0-9_]+/g);
    if (tokens && tokens.length > 0) {
        return tokens;
    }

    return [...normalized.replace(/\s+/g, '')];
}

function calculateSetSimilarity(str1, str2) {
    const tokens1 = tokenizeForSimilarity(str1);
    const tokens2 = tokenizeForSimilarity(str2);

    if (tokens1.length === 0 && tokens2.length === 0) {
        return 1;
    }

    const counts1 = new Map();
    const counts2 = new Map();
    for (const token of tokens1) {
        counts1.set(token, (counts1.get(token) ?? 0) + 1);
    }
    for (const token of tokens2) {
        counts2.set(token, (counts2.get(token) ?? 0) + 1);
    }

    let overlap = 0;
    for (const [token, count1] of counts1.entries()) {
        overlap += Math.min(count1, counts2.get(token) ?? 0);
    }

    const total = tokens1.length + tokens2.length;
    return total > 0 ? (2 * overlap) / total : 0;
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

runCase('anagram-like reordered chars should not look highly similar', () => {
    const score = calculateSetSimilarity('abc', 'cba');
    assert.ok(score < 0.3, `expected < 0.3, got ${score}`);
});

runCase('same words with whitespace/comment prefix should stay highly similar', () => {
    const score = calculateSetSimilarity('// TODO fix parser', 'TODO   fix parser');
    assert.ok(score >= 0.85, `expected >= 0.85, got ${score}`);
});

runCase('shared keywords with small additions should stay similar', () => {
    const score = calculateSetSimilarity('const retryCount = 3', 'const retryCount = 5 // hotfix');
    assert.ok(score >= 0.55, `expected >= 0.55, got ${score}`);
});

runCase('different semantics should remain low similarity', () => {
    const score = calculateSetSimilarity('renderUserCard(profile)', 'deleteCacheEntry(key)');
    assert.ok(score < 0.3, `expected < 0.3, got ${score}`);
});

runCase('symbol-dominant lines should be stable and not throw', () => {
    const score = calculateSetSimilarity('------', '====');
    assert.equal(Number.isFinite(score), true);
    assert.equal(score, 0);
});
