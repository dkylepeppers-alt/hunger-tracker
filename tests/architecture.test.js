import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const entry = fs.readFileSync(new URL('../index.js', import.meta.url), 'utf8');
const settingsTemplate = fs.readFileSync(new URL('../settings.html', import.meta.url), 'utf8');
const ui = fs.readFileSync(new URL('../src/ui.js', import.meta.url), 'utf8');

test('controller uses the isolated connection profile transport without generation-ended analysis hooks', () => {
    assert.match(entry, /analyzeWithProfile/);
    assert.match(entry, /ConnectionManagerRequestService/);
    assert.doesNotMatch(entry, /generateRaw\s*\(/);
    assert.doesNotMatch(entry, /generateQuietPrompt/);
    assert.doesNotMatch(entry, /GENERATION_ENDED/);
});

test('controller never persists pending analysis records', () => {
    assert.doesNotMatch(entry, /status:\s*['"]pending['"]/);
    assert.match(entry, /reasoningPreview/);
    assert.match(entry, /finishReason/);
    assert.match(entry, /profileId/);
});

test('settings always expose current-chat analysis recovery controls', () => {
    assert.match(settingsTemplate, /id="sst-open-state"/);
    assert.match(settingsTemplate, /id="sst-retry-failed"/);
    assert.match(ui, /#sst-open-state/);
    assert.match(ui, /#sst-retry-failed/);
    assert.match(ui, /error\?\.preview/);
    assert.match(settingsTemplate, /id="sst-analyzer-profile"/);
    assert.match(settingsTemplate, /id="sst-analyzer-profile-status"/);
    assert.match(settingsTemplate, /id="sst-extension-version"/);
    assert.match(ui, /getExtensionManifest/);
    assert.match(ui, /sst-state-version/);
});

test('controller persists NPC candidates and the drawer exposes explicit chat-local approval controls', () => {
    assert.match(entry, /mergeNpcCandidates/);
    assert.match(entry, /setNpcStatus/);
    assert.match(entry, /hasUnapprovedCandidates/);
    assert.match(ui, /id="sst-npc-candidates"/);
    assert.match(ui, /data-npc-status/);
    assert.match(ui, /lastSourceMessageIndex/);
    assert.match(ui, /involvedInFeeding/);
    assert.match(ui, /Approve, then retry message/);
});
