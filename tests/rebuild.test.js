import test from 'node:test';
import assert from 'node:assert/strict';

import { reconstructFromMessages } from '../src/rebuild.js';
import { analysisKey, rebuildChatState, shouldInitializeImmediately } from '../src/chat.js';
import { analysisFingerprint } from '../src/analyzer.js';
import { METADATA_KEY } from '../src/identity.js';
import { METADATA_VERSION } from '../src/store.js';

const succubus = { id: 'character:lilith.png', name: 'Lilith', kind: 'character' };
const target = { id: 'character:sam.png', name: 'Sam', kind: 'character' };

test('does not initialize from persona settings before character cards finish loading', () => {
    assert.equal(shouldInitializeImmediately({ characters: [], powerUserSettings: { personas: { 'user.png': 'User' } } }), false);
    assert.equal(shouldInitializeImmediately({ characters: [{ avatar: 'sam.png' }], powerUserSettings: { personas: {} } }), true);
});

test('reconstructs only the active swipe and preserves parse warnings', () => {
    const messages = [{
        is_user: false,
        mes: 'unused',
        swipe_id: 1,
        swipes: [
            '[SUCCUBUS_EVENT v=3; s=s1; hours=10; exposure=0; note=old][/SUCCUBUS_EVENT]',
            '[SUCCUBUS_EVENT v=3; s=s1; hours=2; exposure=0; note=active][/SUCCUBUS_EVENT]',
        ],
    }, {
        is_user: false,
        mes: '[SUCCUBUS_EVENT v=3; s=s1; hours=bad; exposure=0; note=bad][/SUCCUBUS_EVENT]',
    }];

    const state = reconstructFromMessages({ messages, succubi: [succubus], participants: [target] });
    assert.equal(state.succubi[succubus.id].storyHours, 2);
    assert.equal(state.warnings.length, 1);
    assert.equal(state.events[0].id, '0:1:0');
});

test('manual events and exclusions are replayed after message events', () => {
    const messages = [{
        is_user: false,
        mes: '[SUCCUBUS_EVENT v=3; s=s1; hours=3; exposure=0; note=skip][/SUCCUBUS_EVENT]',
    }];
    const state = reconstructFromMessages({
        messages, succubi: [succubus], participants: [target], excludedIds: ['0:0:0'],
        manualEvents: [{ id: 'manual:1', type: 'manual', entityId: succubus.id, field: 'hunger', value: 77, note: 'set' }],
    });
    assert.equal(state.succubi[succubus.id].storyHours, 0);
    assert.equal(state.succubi[succubus.id].hunger, 77);
});

test('v2 analyzer records no longer contribute to v3 reconstructed state', () => {
    const chat = [{ is_user: true, mes: 'wait' }, { is_user: false, mes: 'scene', swipe_id: 0, swipes: ['scene'] }];
    const roster = { succubi: [succubus], participants: [target], all: [succubus, target] };
    const oldKey = analysisFingerprint({ version: 2, assistantText: 'scene', userText: 'wait', rosterIds: [succubus.id, target.id].sort() });
    const ctx = {
        chat, chatMetadata: { [METADATA_KEY]: {
            version: METADATA_VERSION, baseline: { source: 'test', messageBoundary: 0, entities: {} }, analysisBoundary: 0,
            records: { [oldKey]: { status: 'complete', events: [{ id: 'old-feed', type: 'feeding', succubusId: succubus.id, targetId: target.id, intensity: 'trace', feedingTiers: [{ min: 0, max: 100, drainMin: 10, drainMax: 10, reliefPerSoul: 1 }] }] } },
            manualEvents: [], excludedIds: [], archive: {}, npcs: {}, suppressedNpcNames: [],
        } },
    };
    const result = rebuildChatState(ctx, roster, {}, new Set());
    assert.equal(result.state.participants[target.id].soul, 100);
    assert.equal(result.state.activity[0].status, 'missing');
});

test('approving a chat-local NPC does not invalidate unrelated analysis fingerprints', () => {
    const messages = [{ is_user: true, mes: 'wait' }, { is_user: false, mes: 'scene', swipe_id: 0, swipes: ['scene'] }];
    const baseRoster = { succubi: [succubus], participants: [target] };
    const npcRoster = { succubi: [succubus], participants: [target, { id: 'npc:vale', name: 'Dr. Vale', kind: 'npc' }] };
    assert.equal(analysisKey(messages, 1, baseRoster), analysisKey(messages, 1, npcRoster));
});
