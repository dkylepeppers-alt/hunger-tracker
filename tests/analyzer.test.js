import test from 'node:test';
import assert from 'node:assert/strict';

import { analysisFingerprint, analyzerResultToEvents, parseAnalyzerResult, shouldAnalyzeRecord } from '../src/analyzer.js';
import { DEFAULT_EVENT_RULES } from '../src/state.js';

const roster = {
    succubi: [{ id: 'character:lilith.png', name: 'Lilith', kind: 'character' }],
    participants: [{ id: 'persona:alex.png', name: 'Alex', kind: 'persona' }],
};

test('maps analyzer classifications to deterministic numeric events', () => {
    const result = {
        events: [{ succubusId: 'character:lilith.png', elapsedHours: 2, hungerPressure: 'strain_moderate', exposure: 'suspicion', feeding: null, note: 'Difficult concealment' }],
    };
    const events = analyzerResultToEvents(result, roster, DEFAULT_EVENT_RULES, 'analysis:abc');
    assert.equal(events[0].hungerDelta, 7);
    assert.equal(events[0].exposureDelta, 5);
    assert.equal(events[0].hungerPressure, 'strain_moderate');
});

test('rejects unknown entities and classifications', () => {
    assert.throws(() => analyzerResultToEvents({ events: [{ succubusId: 'missing', elapsedHours: 0, hungerPressure: 'none', exposure: 'none', feeding: null, note: '' }] }, roster, DEFAULT_EVENT_RULES, 'x'), /succubus/i);
    assert.throws(() => analyzerResultToEvents({ events: [{ succubusId: roster.succubi[0].id, elapsedHours: 0, hungerPressure: 'invented', exposure: 'none', feeding: null, note: '' }] }, roster, DEFAULT_EVENT_RULES, 'x'), /hunger/i);
});

test('parses schema JSON without accepting prose wrappers', () => {
    assert.deepEqual(parseAnalyzerResult('{"events":[]}'), { events: [] });
    assert.deepEqual(parseAnalyzerResult('[]'), { events: [] });
    assert.throws(() => parseAnalyzerResult('Here you go: {"events":[]}'), /JSON/i);
});

test('failed and pending records are terminal until explicitly cleared', () => {
    assert.equal(shouldAnalyzeRecord(undefined), true);
    assert.equal(shouldAnalyzeRecord({ status: 'complete' }), false);
    assert.equal(shouldAnalyzeRecord({ status: 'pending' }), false);
    assert.equal(shouldAnalyzeRecord({ status: 'failed' }), false);
});

test('fingerprint changes with swipe text, preceding user text, roster, or analyzer version', () => {
    const base = { assistantText: 'A', userText: 'U', rosterIds: ['a', 'b'], version: 1 };
    const first = analysisFingerprint(base);
    assert.equal(first, analysisFingerprint(base));
    assert.notEqual(first, analysisFingerprint({ ...base, assistantText: 'B' }));
    assert.notEqual(first, analysisFingerprint({ ...base, version: 2 }));
});
