import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const readJson = relativePath => JSON.parse(fs.readFileSync(new URL(relativePath, import.meta.url), 'utf8'));

test('declares the Hunger Tracker repository identity at version 6.0.1', () => {
    const manifest = readJson('../manifest.json');
    const packageJson = readJson('../package.json');

    assert.equal(manifest.display_name, 'Hunger Tracker');
    assert.equal(packageJson.name, 'hunger-tracker');
    assert.equal(manifest.version, '6.0.1');
    assert.equal(packageJson.version, manifest.version);
    assert.equal(manifest.auto_update, true);
});

test('exports one canonical set of Hunger Tracker runtime identifiers', async () => {
    const identity = await import('../src/identity.js');

    assert.deepEqual({
        EXTENSION_FOLDER: identity.EXTENSION_FOLDER,
        DISPLAY_NAME: identity.DISPLAY_NAME,
        VERSION: identity.VERSION,
        SETTINGS_KEY: identity.SETTINGS_KEY,
        METADATA_KEY: identity.METADATA_KEY,
        PROMPT_KEY: identity.PROMPT_KEY,
    }, {
        EXTENSION_FOLDER: 'hunger-tracker',
        DISPLAY_NAME: 'Hunger Tracker',
        VERSION: '6.0.1',
        SETTINGS_KEY: 'hunger_tracker',
        METADATA_KEY: 'hungerTracker',
        PROMPT_KEY: 'hunger_tracker',
    });
});

test('release inputs do not retain the legacy Tavernkeeper managed marker', () => {
    const gitignore = fs.readFileSync(new URL('../.gitignore', import.meta.url), 'utf8');
    assert.doesNotMatch(gitignore, /^\.tavernkeeper-managed\.json$/m);
});
