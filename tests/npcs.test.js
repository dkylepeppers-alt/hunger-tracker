import test from 'node:test';
import assert from 'node:assert/strict';

import { approvedNpcEntities, mergeNpcCandidates, normalizeNpcName, setNpcStatus } from '../src/npcs.js';

test('normalizes and deduplicates chat-local NPC candidates', () => {
    const metadata = { npcs: {} };
    const ids = ['one', 'unused'];
    const created = mergeNpcCandidates(metadata, [{ name: '  Dr. Vale ', evidence: 'Entered the room', involvedInFeeding: false }], 3, () => ids.shift());
    const updated = mergeNpcCandidates(metadata, [{ name: 'dr.   vale', evidence: 'Was approached', involvedInFeeding: true }], 8, () => ids.shift());
    assert.equal(normalizeNpcName(' Dr.   VALE '), 'dr. vale');
    assert.equal(Object.keys(metadata.npcs).length, 1);
    assert.equal(created[0].id, 'npc:one');
    assert.equal(updated[0].id, 'npc:one');
    assert.equal(updated[0].firstSourceMessageIndex, 3);
    assert.equal(updated[0].lastSourceMessageIndex, 8);
    assert.equal(updated[0].involvedInFeeding, true);
    assert.equal(updated[0].evidence, 'Was approached');
});

test('ignores invalid candidate names and exposes only approved NPC entities', () => {
    const metadata = { npcs: {} };
    assert.deepEqual(mergeNpcCandidates(metadata, [{ name: '   ', evidence: '', involvedInFeeding: false }], 1, () => 'bad'), []);
    mergeNpcCandidates(metadata, [{ name: 'Mara', evidence: 'Spoke', involvedInFeeding: false }], 1, () => 'mara');
    assert.deepEqual(approvedNpcEntities(metadata), []);
    assert.equal(setNpcStatus(metadata, 'npc:mara', 'approved'), true);
    assert.deepEqual(approvedNpcEntities(metadata), [{ id: 'npc:mara', name: 'Mara', kind: 'npc' }]);
    assert.equal(setNpcStatus(metadata, 'npc:mara', 'ignored'), true);
    assert.deepEqual(approvedNpcEntities(metadata), []);
    assert.throws(() => setNpcStatus(metadata, 'npc:mara', 'invalid'), /status/i);
});
