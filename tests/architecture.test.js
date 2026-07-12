import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const entry = fs.readFileSync(new URL('../index.js', import.meta.url), 'utf8');
const settingsTemplate = fs.readFileSync(new URL('../settings.html', import.meta.url), 'utf8');
const ui = fs.readFileSync(new URL('../src/ui.js', import.meta.url), 'utf8');

test('controller uses isolated raw generation without generation-ended analysis hooks', () => {
    assert.match(entry, /generateRaw/);
    assert.doesNotMatch(entry, /generateQuietPrompt/);
    assert.doesNotMatch(entry, /GENERATION_ENDED/);
});

test('controller never persists pending analysis records', () => {
    assert.doesNotMatch(entry, /status:\s*['"]pending['"]/);
});

test('settings always expose current-chat analysis recovery controls', () => {
    assert.match(settingsTemplate, /id="sst-open-state"/);
    assert.match(settingsTemplate, /id="sst-retry-failed"/);
    assert.match(ui, /#sst-open-state/);
    assert.match(ui, /#sst-retry-failed/);
    assert.match(ui, /error\?\.preview/);
});
