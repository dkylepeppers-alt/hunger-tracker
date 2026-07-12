import test from 'node:test';
import assert from 'node:assert/strict';

import { createChatState } from '../src/state.js';
import { buildStatePrompt, compactStateSummary } from '../src/prompt.js';

test('compact summary is safe outside an active tracked chat', () => {
    assert.equal(compactStateSummary(null), 'No active succubus profiles in this chat.');
});

test('prompt strongly injects active succubus and participant behavior tiers with stable ids', () => {
    const succubus = { id: 'character:lilith.png', name: 'Lilith', kind: 'character' };
    const participant = { id: 'persona:alex.png', name: 'Alex', kind: 'persona' };
    const state = createChatState([succubus], [participant]);
    state.succubi[succubus.id].hunger = 82;
    state.succubi[succubus.id].condition = 'predatory';
    state.participants[participant.id].soul = 30;
    state.participants[participant.id].condition = 'weakened';

    const result = buildStatePrompt(state);
    assert.match(result.text, /AUTHORITATIVE/i);
    assert.match(result.text, /Lilith \[s1\].*Hunger 82\/100.*Predatory/i);
    assert.match(result.text, /Alex \[s2\].*Soul 30\/100.*Weakened/i);
    assert.match(result.text, /overtly predatory/i);
    assert.match(result.text, /clear weakness/i);
    assert.deepEqual(result.idMap, { s1: succubus.id, s2: participant.id });
});

test('prompt tells the assistant to confirm feeding performed by a succubus persona', () => {
    const succubus = { id: 'persona:user.png', name: 'Morgan', kind: 'persona' };
    const participant = { id: 'character:victim.png', name: 'Sam', kind: 'character' };
    const state = createChatState([succubus], [participant]);
    const result = buildStatePrompt(state);
    assert.match(result.text, /user's succubus persona/i);
    assert.match(result.text, /confirm.*user message/i);
});

test('prompt exposes the configured time rate and event hunger field', () => {
    const succubus = { id: 'character:lilith.png', name: 'Lilith', kind: 'character' };
    const state = createChatState([succubus], [], {}, { hungerPerStoryHour: 0.75 });
    const result = buildStatePrompt(state);
    assert.match(result.text, /0\.75 hunger per story hour/i);
    assert.match(result.text, /hunger=-?100\.\.100/i);
    assert.match(result.text, /exertion.*magic.*stress/i);
});
