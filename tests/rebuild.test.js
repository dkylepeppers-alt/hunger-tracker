import test from 'node:test';
import assert from 'node:assert/strict';

import { reconstructFromMessages } from '../src/rebuild.js';
import { recoverOrphanedAnalyses, shouldInitializeImmediately } from '../src/chat.js';

const succubus = { id: 'character:lilith.png', name: 'Lilith', kind: 'character' };
const target = { id: 'character:sam.png', name: 'Sam', kind: 'character' };

test('does not initialize from persona settings before character cards finish loading', () => {
    assert.equal(shouldInitializeImmediately({ characters: [], powerUserSettings: { personas: { 'user.png': 'User' } } }), false);
    assert.equal(shouldInitializeImmediately({ characters: [{ avatar: 'sam.png' }], powerUserSettings: { personas: {} } }), true);
});

test('recovers persisted pending analyses as retryable failures on startup', () => {
    const metadata = { analysisCache: { abc: { status: 'pending', events: [] } }, analysisWarnings: [] };
    recoverOrphanedAnalyses(metadata);
    assert.equal(metadata.analysisCache.abc.status, 'failed');
    assert.match(metadata.analysisWarnings[0].message, /interrupted/i);
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
