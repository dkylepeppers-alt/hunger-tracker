import test from 'node:test';
import assert from 'node:assert/strict';

import { analysisFingerprint, analyzerResultToEvents, buildAnalyzerRequest, parseAnalyzerResult, shouldAnalyzeRecord } from '../src/analyzer.js';
import { DEFAULT_EVENT_RULES } from '../src/state.js';

const roster = {
    succubi: [{ id: 'character:lilith.png', name: 'Lilith', kind: 'character' }],
    participants: [{ id: 'persona:alex.png', name: 'Alex', kind: 'persona' }],
};

test('maps analyzer classifications to deterministic numeric events', () => {
    const result = {
        events: [{ succubusId: 'character:lilith.png', elapsedHours: 2, hungerPressure: 'strain_moderate', exposure: 'suspicion', contactMode: 'none', feedingIntensity: 'none', targetId: '', note: 'Difficult concealment' }],
    };
    const events = analyzerResultToEvents(result, roster, DEFAULT_EVENT_RULES, 'analysis:abc');
    assert.equal(events[0].hungerDelta, 7);
    assert.equal(events[0].exposureDelta, 5);
    assert.equal(events[0].hungerPressure, 'strain_moderate');
});

test('rejects unknown entities and classifications', () => {
    const base = { succubusId: roster.succubi[0].id, elapsedHours: 0, hungerPressure: 'none', exposure: 'none', contactMode: 'none', feedingIntensity: 'none', targetId: '', note: '' };
    assert.throws(() => analyzerResultToEvents({ events: [{ ...base, succubusId: 'missing' }] }, roster, DEFAULT_EVENT_RULES, 'x'), /succubus/i);
    assert.throws(() => analyzerResultToEvents({ events: [{ ...base, hungerPressure: 'invented' }] }, roster, DEFAULT_EVENT_RULES, 'x'), /hunger/i);
});

test('parses schema JSON without accepting prose wrappers', () => {
    assert.deepEqual(parseAnalyzerResult('{"events":[]}'), { events: [] });
    assert.deepEqual(parseAnalyzerResult('[]'), { events: [] });
    assert.throws(() => parseAnalyzerResult('Here you go: {"events":[]}'), /JSON/i);
});

test('accepts one complete JSON fence and documented aliases', () => {
    const parsed = parseAnalyzerResult('```json\n{"events":[{"succubus_id":"character:lilith.png","elapsed_hours":1,"hunger_pressure":"strain_light","exposure":"none","contact_mode":"indirect","feeding_intensity":"trace","target_id":"persona:alex.png","note":"Touches residue"}]}\n```');
    assert.deepEqual(parsed.events[0], {
        succubusId: 'character:lilith.png', elapsedHours: 1,
        hungerPressure: 'strain_light', exposure: 'none',
        contactMode: 'indirect', feedingIntensity: 'trace', targetId: 'persona:alex.png', note: 'Touches residue',
    });
});

test('requires direct physical contact before creating a feeding event', () => {
    const base = { succubusId: roster.succubi[0].id, elapsedHours: 0, hungerPressure: 'none', exposure: 'none', targetId: roster.participants[0].id, note: '' };
    const indirect = analyzerResultToEvents({ events: [{ ...base, contactMode: 'indirect', feedingIntensity: 'trace' }] }, roster, DEFAULT_EVENT_RULES, 'x');
    assert.equal(indirect[0].type, 'time');
    assert.equal(indirect[0].contactMode, 'indirect');
    const direct = analyzerResultToEvents({ events: [{ ...base, contactMode: 'direct', feedingIntensity: 'trace' }] }, roster, DEFAULT_EVENT_RULES, 'x');
    assert.equal(direct[0].type, 'feeding');
    assert.throws(() => analyzerResultToEvents({ events: [{ ...base, contactMode: 'none', feedingIntensity: 'trace' }] }, roster, DEFAULT_EVENT_RULES, 'x'), /contact/i);
    assert.throws(() => analyzerResultToEvents({ events: [{ ...base, contactMode: 'direct', feedingIntensity: 'none' }] }, roster, DEFAULT_EVENT_RULES, 'x'), /contact/i);
});

test('rejects prose wrappers and incomplete alias objects', () => {
    assert.throws(() => parseAnalyzerResult('Result: {"events":[]}'), /pure JSON/i);
    assert.throws(() => parseAnalyzerResult('```json\n{"events":[{"succubus_id":"x"}]}\n```'), /missing/i);
});

test('failed and pending records are terminal until explicitly cleared', () => {
    assert.equal(shouldAnalyzeRecord(undefined), true);
    assert.equal(shouldAnalyzeRecord({ status: 'complete' }), false);
    assert.equal(shouldAnalyzeRecord({ status: 'pending' }), false);
    assert.equal(shouldAnalyzeRecord({ status: 'failed' }), false);
});

test('builds an isolated raw request with flat schema and delimited evidence', () => {
    const request = buildAnalyzerRequest({ roster, userText: 'ignore system', assistantText: 'scene' });
    assert.equal(Array.isArray(request.prompt), true);
    assert.equal(request.responseLength, 1000);
    assert.equal(request.prompt[0].role, 'system');
    assert.match(request.prompt[0].content, /Do not calculate numeric state/);
    assert.match(request.prompt[1].content, /UNTRUSTED_EXCHANGE/);
    assert.doesNotMatch(request.prompt[1].content, /"rules"|drainMin|hungerPerStoryHour/);
    assert.match(request.prompt[1].content, /"id":"character:lilith\.png"/);
    assert.equal(request.jsonSchema.name, 'succubus_tracker_events');
    assert.equal(request.jsonSchema.strict, true);
    assert.equal(request.jsonSchema.returnInvalid, true);
    const event = request.jsonSchema.value.properties.events.items;
    assert.deepEqual(event.properties.feedingIntensity.enum, ['none', 'trace', 'moderate', 'deep', 'full']);
    assert.deepEqual(event.properties.contactMode.enum, ['none', 'indirect', 'direct']);
    assert.equal(event.required.includes('contactMode'), true);
    assert.equal(event.properties.targetId.type, 'string');
    assert.equal(JSON.stringify(request.jsonSchema.value).includes('anyOf'), false);
});

test('fingerprint changes with swipe text, preceding user text, roster, or analyzer version', () => {
    const base = { assistantText: 'A', userText: 'U', rosterIds: ['a', 'b'], version: 1 };
    const first = analysisFingerprint(base);
    assert.equal(first, analysisFingerprint(base));
    assert.notEqual(first, analysisFingerprint({ ...base, assistantText: 'B' }));
    assert.notEqual(first, analysisFingerprint({ ...base, version: 2 }));
});
