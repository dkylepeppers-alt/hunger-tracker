import test from 'node:test';
import assert from 'node:assert/strict';

import { createChatState } from '../src/state.js';
import { buildStatePrompt, compactStateSummary } from '../src/prompt.js';

test('compact summary is safe outside an active tracked chat', () => {
    assert.equal(compactStateSummary(null), 'No active succubus profiles in this chat.');
});

test('roleplay prompt injects behavior without numeric state, ids, or tracker syntax', () => {
    const succubus = { id: 'character:lilith.png', name: 'Lilith', kind: 'character' };
    const participant = { id: 'persona:alex.png', name: 'Alex', kind: 'persona' };
    const state = createChatState([succubus], [participant]);
    state.succubi[succubus.id].hunger = 82;
    state.succubi[succubus.id].condition = 'predatory';
    state.participants[participant.id].soul = 30;
    state.participants[participant.id].condition = 'weakened';

    const result = buildStatePrompt(state);
    assert.match(result.text, /AUTHORITATIVE/i);
    assert.doesNotMatch(result.text, /82|30|\/100|\[s1\]|SUCCUBUS_EVENT/);
    assert.match(result.text, /overtly predatory/i);
    assert.match(result.text, /clear weakness/i);
    assert.match(result.text, /never.*numeric|never.*numbers/i);
});

test('prompt does not dictate actions for a succubus persona', () => {
    const succubus = { id: 'persona:user.png', name: 'Morgan', kind: 'persona' };
    const participant = { id: 'character:victim.png', name: 'Sam', kind: 'character' };
    const state = createChatState([succubus], [participant]);
    const result = buildStatePrompt(state);
    assert.match(result.text, /user's succubus persona/i);
    assert.match(result.text, /never dictate/i);
    assert.doesNotMatch(result.text, /confirm.*event|tracker/i);
});

test('roleplay prompt does not expose configured rates or event fields', () => {
    const succubus = { id: 'character:lilith.png', name: 'Lilith', kind: 'character' };
    const state = createChatState([succubus], [], {}, { hungerPerStoryHour: 0.75 });
    const result = buildStatePrompt(state);
    assert.doesNotMatch(result.text, /0\.75|story hour|hunger=/i);
});
