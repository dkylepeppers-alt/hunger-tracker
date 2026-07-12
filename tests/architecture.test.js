import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const entry = fs.readFileSync(new URL('../index.js', import.meta.url), 'utf8');

test('controller uses isolated raw generation without generation-ended analysis hooks', () => {
    assert.match(entry, /generateRaw/);
    assert.doesNotMatch(entry, /generateQuietPrompt/);
    assert.doesNotMatch(entry, /GENERATION_ENDED/);
});

test('controller never persists pending analysis records', () => {
    assert.doesNotMatch(entry, /status:\s*['"]pending['"]/);
});
