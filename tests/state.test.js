import test from 'node:test';
import assert from 'node:assert/strict';

import {
    DEFAULT_HUNGER_TIERS,
    applyEvent,
    createChatState,
    drainForIntensity,
    rebuildState,
} from '../src/state.js';

const succubus = { id: 'character:lilith.png', name: 'Lilith', kind: 'character' };
const target = { id: 'persona:alex.png', name: 'Alex', kind: 'persona' };

test('critical full feeding can drain a complete soul and updates both parties atomically', () => {
    const state = createChatState([succubus], [target]);
    state.succubi[succubus.id].hunger = 95;

    const result = applyEvent(state, {
        id: '2:0',
        type: 'feeding',
        succubusId: succubus.id,
        targetId: target.id,
        elapsedHours: 0,
        intensity: 'full',
        exposureDelta: 4,
        note: 'all-out feeding',
    });

    assert.equal(result.ok, true);
    assert.equal(state.participants[target.id].soul, 0);
    assert.equal(state.participants[target.id].condition, 'depleted');
    assert.equal(state.succubi[succubus.id].soulsConsumed, 100);
    assert.equal(state.succubi[succubus.id].hunger, 0);
    assert.equal(state.succubi[succubus.id].exposure, 4);
    assert.equal(state.events[0].soulDrain, 100);
});

test('feeding intensity deterministically interpolates across the active hunger tier', () => {
    const critical = DEFAULT_HUNGER_TIERS.at(-1);
    assert.equal(drainForIntensity(critical, 'trace'), 25);
    assert.equal(drainForIntensity(critical, 'moderate'), 50);
    assert.equal(drainForIntensity(critical, 'deep'), 75);
    assert.equal(drainForIntensity(critical, 'full'), 100);
});

test('feeding is capped by the target soul and cannot drain a depleted target', () => {
    const state = createChatState([succubus], [target]);
    state.succubi[succubus.id].hunger = 95;
    state.participants[target.id].soul = 12;

    assert.equal(applyEvent(state, {
        id: '3:0', type: 'feeding', succubusId: succubus.id, targetId: target.id,
        elapsedHours: 0, intensity: 'full', exposureDelta: 0, note: 'feed',
    }).ok, true);
    assert.equal(state.succubi[succubus.id].soulsConsumed, 12);
    assert.equal(state.participants[target.id].soul, 0);

    const second = applyEvent(state, {
        id: '4:0', type: 'feeding', succubusId: succubus.id, targetId: target.id,
        elapsedHours: 4, intensity: 'trace', exposureDelta: 7, note: 'again',
    });
    assert.equal(second.ok, false);
    assert.match(second.error, /depleted/i);
    assert.equal(state.succubi[succubus.id].storyHours, 0);
    assert.equal(state.succubi[succubus.id].exposure, 0);
});

test('rebuild applies manual changes and excludes selected source events', () => {
    const events = [
        { id: '2:0', type: 'time', succubusId: succubus.id, elapsedHours: 5, exposureDelta: 0, note: 'travel' },
        { id: 'manual:1', type: 'manual', entityId: succubus.id, field: 'hunger', value: 80, note: 'correction' },
    ];
    const state = rebuildState({ succubi: [succubus], participants: [target], events, excludedIds: ['2:0'] });
    assert.equal(state.succubi[succubus.id].hunger, 80);
    assert.equal(state.succubi[succubus.id].storyHours, 0);
    assert.equal(state.events.length, 1);
});

test('hunger combines a configurable story-time rate with event-based changes', () => {
    const state = createChatState([succubus], [target], {}, { hungerPerStoryHour: 0.5 });
    const result = applyEvent(state, {
        id: '5:0', type: 'time', succubusId: succubus.id,
        elapsedHours: 6, hungerDelta: 12, exposureDelta: 0, note: 'intense spellcasting',
    });
    assert.equal(result.ok, true);
    assert.equal(state.succubi[succubus.id].hunger, 50);
    assert.equal(state.events[0].timeHungerGain, 3);
    assert.equal(state.events[0].eventHungerChange, 12);
});
