import test from 'node:test';
import assert from 'node:assert/strict';

import { approvedNpcEntities, mergeNpcCandidates, normalizeNpcName, restoreSuppressedNpc, setNpcStatus } from '../src/npcs.js';

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

test('auto-approves valid candidates while preserving ignored opt-outs', () => {
    const metadata = { npcs: {} };
    assert.deepEqual(mergeNpcCandidates(metadata, [{ name: '   ', evidence: '', involvedInFeeding: false }], 1, () => 'bad'), []);
    mergeNpcCandidates(metadata, [{ name: 'Mara', evidence: 'Spoke', involvedInFeeding: false }], 1, () => 'mara');
    assert.deepEqual(approvedNpcEntities(metadata), [{ id: 'npc:mara', name: 'Mara', kind: 'npc' }]);
    assert.equal(setNpcStatus(metadata, 'npc:mara', 'ignored'), true);
    mergeNpcCandidates(metadata, [{ name: 'mara', evidence: 'Returned', involvedInFeeding: true }], 2, () => 'unused');
    assert.equal(metadata.npcs['npc:mara'].status, 'ignored');
    assert.deepEqual(approvedNpcEntities(metadata), []);
    assert.equal(setNpcStatus(metadata, 'npc:mara', 'approved'), true);
    assert.throws(() => setNpcStatus(metadata, 'npc:mara', 'pending'), /status/i);
    assert.throws(() => setNpcStatus(metadata, 'npc:mara', 'invalid'), /status/i);
});

test('skips suppressed analyzer candidates until their exact normalized name is restored', () => {
    const metadata = { npcs: {}, suppressedNpcNames: ['mara', 'marabelle'] };

    assert.deepEqual(mergeNpcCandidates(metadata, [
        { name: ' MARA ', evidence: 'Returned', involvedInFeeding: true },
    ], 4, () => 'suppressed'), []);
    assert.deepEqual(metadata.npcs, {});
    assert.equal(restoreSuppressedNpc(metadata, 'mara'), true);
    const discovered = mergeNpcCandidates(metadata, [
        { name: 'Mara', evidence: 'Returned', involvedInFeeding: true },
    ], 5, () => 'restored');
    assert.equal(discovered[0].id, 'npc:restored');
    assert.deepEqual(metadata.suppressedNpcNames, ['marabelle']);
});

test('candidate batches roll back if local id generation fails partway through', () => {
    const metadata = { npcs: {}, suppressedNpcNames: [] };
    let calls = 0;

    assert.throws(() => mergeNpcCandidates(metadata, [
        { name: 'Mara', evidence: 'First', involvedInFeeding: false },
        { name: 'Vale', evidence: 'Second', involvedInFeeding: false },
    ], 6, () => {
        if (++calls === 2) throw new Error('uuid failed');
        return 'mara';
    }), /uuid failed/);
    assert.deepEqual(metadata.npcs, {});
});
