import test from 'node:test';
import assert from 'node:assert/strict';

import { parseTrackerEvents, stripRecognizedTrackers } from '../src/protocol.js';

test('parses a versioned keyed feeding event', () => {
    const text = 'Narrative\n[SUCCUBUS_EVENT v=3; s=c1; t=p1; hours=0.5; intensity=deep; exposure=4; note=Kitchen feeding][/SUCCUBUS_EVENT]';
    const parsed = parseTrackerEvents(text, { c1: 'character:lilith.png', p1: 'persona:alex.png' }, '8:1');
    assert.equal(parsed.events.length, 1);
    assert.deepEqual(parsed.events[0], {
        id: '8:1:0',
        type: 'feeding',
        succubusId: 'character:lilith.png',
        targetId: 'persona:alex.png',
        elapsedHours: 0.5,
        hungerDelta: 0,
        intensity: 'deep',
        exposureDelta: 4,
        note: 'Kitchen feeding',
    });
    assert.deepEqual(parsed.warnings, []);
});

test('reports malformed and ambiguous events without coercing bad numbers', () => {
    const malformed = '[SUCCUBUS_EVENT v=3; s=c1; t=p1; hours=later; intensity=deep; exposure=0; note=x][/SUCCUBUS_EVENT]';
    const parsed = parseTrackerEvents(malformed, { c1: 'character:lilith.png', p1: 'persona:alex.png' }, '2:0');
    assert.equal(parsed.events.length, 0);
    assert.equal(parsed.warnings.length, 1);
    assert.match(parsed.warnings[0].message, /hours/i);
});

test('accepts a harmless malformed closing variation and strips only recognized trackers', () => {
    const validish = 'Story [SUCCUBUS_EVENT v=3; s=c1; hours=2; exposure=-1; note=rest][SUCCUBUS_EVENT]';
    const parsed = parseTrackerEvents(validish, { c1: 'character:lilith.png' }, '3:0');
    assert.equal(parsed.events.length, 1);
    assert.equal(parsed.events[0].type, 'time');
    assert.equal(stripRecognizedTrackers(validish), 'Story');

    const unknown = 'Keep [SUCCUBUS_EVENT this is not valid] visible';
    assert.equal(stripRecognizedTrackers(unknown), unknown);
});

test('parses multiple events and gives each a stable source-derived id', () => {
    const text = [
        '[SUCCUBUS_EVENT v=3; s=c1; hours=1; exposure=0; note=wait][/SUCCUBUS_EVENT]',
        '[SUCCUBUS_EVENT v=3; s=c1; t=p1; hours=0; intensity=trace; exposure=2; note=feed][/SUCCUBUS_EVENT]',
    ].join('\n');
    const parsed = parseTrackerEvents(text, { c1: 'character:lilith.png', p1: 'persona:alex.png' }, '9:2');
    assert.deepEqual(parsed.events.map(event => event.id), ['9:2:0', '9:2:1']);
});

test('hides legacy Elena trackers after migration, including the known malformed closing', () => {
    assert.equal(stripRecognizedTrackers('Story\n[ELENA_DELTA|0|none|0|0|none][/ELENA_DELTA]'), 'Story');
    assert.equal(stripRecognizedTrackers('Story\n[ELENA_DELTA|0.2|none|0|0|Kitchen|/ELENA_DELTA]'), 'Story');
});

test('parses an event-based hunger change and defaults older v3 events to zero', () => {
    const withEvent = parseTrackerEvents('[SUCCUBUS_EVENT v=3; s=c1; hours=1; hunger=9; exposure=0; note=magic][/SUCCUBUS_EVENT]', { c1: 'character:lilith.png' }, '1:0');
    assert.equal(withEvent.events[0].hungerDelta, 9);
    const compatible = parseTrackerEvents('[SUCCUBUS_EVENT v=3; s=c1; hours=1; exposure=0; note=rest][/SUCCUBUS_EVENT]', { c1: 'character:lilith.png' }, '2:0');
    assert.equal(compatible.events[0].hungerDelta, 0);
});
