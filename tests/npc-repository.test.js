import test from 'node:test';
import assert from 'node:assert/strict';

import { addNpc, mergeNpcs, removeNpc, renameNpc, restoreSuppressedNpc } from '../src/npcs.js';
import { createDefaultMetadata } from '../src/store.js';

test('adds a validated manual NPC with a stable local id and approved status', () => {
    const metadata = createDefaultMetadata();
    metadata.suppressedNpcNames = ['dr. vale', 'someone else'];

    const created = addNpc(metadata, '  Dr.   Vale  ', { uuid: () => 'manual-id' });

    assert.equal(created, metadata.npcs['npc:manual-id']);
    assert.deepEqual(created, {
        id: 'npc:manual-id',
        name: 'Dr. Vale',
        normalizedName: 'dr. vale',
        status: 'approved',
        evidence: '',
        firstSourceMessageIndex: null,
        lastSourceMessageIndex: null,
        involvedInFeeding: false,
        manual: true,
    });
    assert.deepEqual(metadata.suppressedNpcNames, ['someone else']);
});

test('rejects empty, overlong, and duplicate manual NPC names without partial mutation', () => {
    const metadata = createDefaultMetadata();
    addNpc(metadata, 'Mara', { uuid: () => 'mara' });
    const before = structuredClone(metadata);

    assert.throws(() => addNpc(metadata, '   ', { uuid: () => 'empty' }), /name/i);
    assert.deepEqual(metadata, before);
    assert.throws(() => addNpc(metadata, 'x'.repeat(101), { uuid: () => 'long' }), /100/);
    assert.deepEqual(metadata, before);
    assert.throws(() => addNpc(metadata, '  MARA ', { uuid: () => 'duplicate' }), /already exists/i);
    assert.deepEqual(metadata, before);
});

test('restores exactly one normalized suppressed NPC name transactionally', () => {
    const metadata = createDefaultMetadata();
    metadata.suppressedNpcNames = ['mara', 'marabelle'];

    assert.equal(restoreSuppressedNpc(metadata, '  MARA '), true);
    assert.deepEqual(metadata.suppressedNpcNames, ['marabelle']);
    assert.equal(restoreSuppressedNpc(metadata, 'mara'), false);
});

test('renames an NPC without changing identity and rewrites persisted display-name snapshots', () => {
    const metadata = createDefaultMetadata();
    const npc = addNpc(metadata, 'Mara', { uuid: () => 'mara' });
    metadata.baseline.entities[npc.id] = { name: 'Mara', soul: 72 };
    metadata.manualEvents.push({ id: 'manual:1', type: 'manual', entityId: npc.id, entityName: 'Mara', field: 'soul', value: 80 });
    metadata.records.scene = {
        classifications: [{ targetId: npc.id, targetName: 'Mara', targetKind: 'npc' }],
        events: [{ id: 'analysis:scene:0', type: 'feeding', targetId: npc.id, targetName: 'Mara' }],
    };
    metadata.state = {
        succubi: {},
        participants: { [npc.id]: { id: npc.id, name: 'Mara', kind: 'npc', soul: 72 } },
        events: [{ id: 'analysis:scene:0', targetId: npc.id, targetName: 'Mara' }],
    };

    const renamed = renameNpc(metadata, npc.id, '  Lady   Mara ');

    assert.equal(renamed.id, npc.id);
    assert.equal(metadata.npcs[npc.id].name, 'Lady Mara');
    assert.equal(metadata.npcs[npc.id].normalizedName, 'lady mara');
    assert.equal(metadata.baseline.entities[npc.id].name, 'Lady Mara');
    assert.equal(metadata.manualEvents[0].entityName, 'Lady Mara');
    assert.equal(metadata.records.scene.classifications[0].targetName, 'Lady Mara');
    assert.equal(metadata.records.scene.events[0].targetName, 'Lady Mara');
    assert.equal(metadata.state.participants[npc.id].name, 'Lady Mara');
    assert.equal(metadata.state.events[0].targetName, 'Lady Mara');
});

test('rejects rename when the standard roster snapshot has not been rebuilt without changing metadata', () => {
    const metadata = createDefaultMetadata();
    const npc = addNpc(metadata, 'Mara', { uuid: () => 'mara' });
    const before = structuredClone(metadata);

    assert.throws(() => renameNpc(metadata, npc.id, 'Lady Mara'), /roster.*rebuild|rebuild.*roster/i);
    assert.deepEqual(metadata, before);
});

test('rejects rename collisions with standard roster snapshots and reports NPC collisions atomically', () => {
    const metadata = createDefaultMetadata();
    const mara = addNpc(metadata, 'Mara', { uuid: () => 'mara' });
    const vale = addNpc(metadata, 'Dr. Vale', { uuid: () => 'vale' });
    metadata.state = {
        succubi: { 'character:elena.png': { id: 'character:elena.png', name: 'Elena', kind: 'character' } },
        participants: {
            'persona:alex.png': { id: 'persona:alex.png', name: 'Alex', kind: 'persona' },
            [mara.id]: { id: mara.id, name: mara.name, kind: 'npc' },
            [vale.id]: { id: vale.id, name: vale.name, kind: 'npc' },
        },
    };
    const before = structuredClone(metadata);

    assert.throws(() => renameNpc(metadata, mara.id, '  elENA '), /standard roster/i);
    assert.deepEqual(metadata, before);
    assert.throws(() => renameNpc(metadata, mara.id, ' dr.   VALE '), /npc:vale/i);
    assert.deepEqual(metadata, before);
});

test('merges duplicate NPC references into the retained stable identity', () => {
    const metadata = createDefaultMetadata();
    const retained = addNpc(metadata, 'Dr. Vale', { uuid: () => 'vale' });
    const removed = addNpc(metadata, 'The Doctor', { uuid: () => 'doctor' });
    Object.assign(metadata.npcs[retained.id], {
        evidence: 'Introduced at the clinic', firstSourceMessageIndex: 8,
        lastSourceMessageIndex: 12, involvedInFeeding: false,
    });
    Object.assign(metadata.npcs[removed.id], {
        evidence: 'Fed during the storm', firstSourceMessageIndex: 3,
        lastSourceMessageIndex: 20, involvedInFeeding: true,
    });
    metadata.baseline.entities[removed.id] = { name: removed.name, soul: 61 };
    metadata.manualEvents = [{
        id: 'manual:doctor', type: 'manual', entityId: removed.id,
        entityName: removed.name, field: 'soul', value: 70,
    }];
    metadata.records.scene = {
        classifications: [{ targetId: removed.id, targetName: removed.name, targetKind: 'npc' }],
        events: [{ id: 'analysis:scene:0', type: 'feeding', targetId: removed.id, targetName: removed.name }],
    };
    metadata.excludedIds = [removed.id, 'analysis:scene:0'];
    metadata.state = {
        succubi: {},
        participants: {
            [retained.id]: { id: retained.id, name: retained.name, kind: 'npc', soul: 88 },
            [removed.id]: { id: removed.id, name: removed.name, kind: 'npc', soul: 61 },
        },
        events: [{ id: 'analysis:scene:0', targetId: removed.id, targetName: removed.name }],
    };

    const merged = mergeNpcs(metadata, retained.id, removed.id);

    assert.equal(merged.id, retained.id);
    assert.equal(metadata.npcs[removed.id], undefined);
    assert.equal(metadata.npcs[retained.id].evidence, 'Introduced at the clinic\nFed during the storm');
    assert.equal(metadata.npcs[retained.id].firstSourceMessageIndex, 3);
    assert.equal(metadata.npcs[retained.id].lastSourceMessageIndex, 20);
    assert.equal(metadata.npcs[retained.id].involvedInFeeding, true);
    assert.deepEqual(metadata.baseline.entities[retained.id], { name: retained.name, soul: 61 });
    assert.equal(metadata.baseline.entities[removed.id], undefined);
    assert.equal(metadata.manualEvents[0].entityId, retained.id);
    assert.equal(metadata.manualEvents[0].entityName, retained.name);
    assert.equal(metadata.records.scene.classifications[0].targetId, retained.id);
    assert.equal(metadata.records.scene.classifications[0].targetName, retained.name);
    assert.equal(metadata.records.scene.events[0].targetId, retained.id);
    assert.equal(metadata.records.scene.events[0].targetName, retained.name);
    assert.deepEqual(metadata.excludedIds, [retained.id, 'analysis:scene:0']);
    assert.equal(metadata.state.participants[removed.id], undefined);
    assert.equal(metadata.state.events[0].targetId, retained.id);
    assert.equal(metadata.state.events[0].targetName, retained.name);
});

test('rejects invalid merge identities without changing metadata', () => {
    const metadata = createDefaultMetadata();
    const npc = addNpc(metadata, 'Mara', { uuid: () => 'mara' });
    const before = structuredClone(metadata);

    assert.throws(() => mergeNpcs(metadata, npc.id, npc.id), /different/i);
    assert.deepEqual(metadata, before);
    assert.throws(() => mergeNpcs(metadata, npc.id, 'npc:missing'), /unknown npc/i);
    assert.deepEqual(metadata, before);
});

test('hard-removes an NPC with impact counts while sanitizing only target effects', () => {
    const metadata = createDefaultMetadata();
    const npc = addNpc(metadata, '  Dr. Vale ', { uuid: () => 'vale' });
    metadata.baseline.entities[npc.id] = { soul: 64 };
    metadata.manualEvents = [
        { id: 'manual:vale', type: 'manual', entityId: npc.id, field: 'soul', value: 70 },
        { id: 'manual:elena', type: 'manual', entityId: 'character:elena.png', field: 'hunger', value: 48 },
    ];
    metadata.records.scene = {
        classifications: [{
            succubusId: 'character:elena.png', elapsedHours: 2,
            hungerPressure: 'strain_moderate', exposure: 'suspicion',
            contactMode: 'direct', feedingIntensity: 'moderate',
            targetId: npc.id, targetName: npc.name, targetKind: 'npc', note: 'Fed from Vale',
        }],
        events: [{
            id: 'analysis:scene:0', type: 'feeding', succubusId: 'character:elena.png',
            targetId: npc.id, intensity: 'moderate', feedingTiers: [{ min: 0, max: 100 }],
            elapsedHours: 2, timeHungerGain: 4, hungerDelta: 7, exposureDelta: 5,
            contactMode: 'direct', note: 'Fed from Vale',
        }],
    };
    metadata.excludedIds = ['manual:vale', 'analysis:scene:0', npc.id, 'unrelated'];
    metadata.state = {
        succubi: {}, participants: { [npc.id]: { id: npc.id, name: npc.name, kind: 'npc', soul: 64 } },
        events: [{ id: 'analysis:scene:0', type: 'feeding', targetId: npc.id, soulDrain: 10 }],
    };

    const impact = removeNpc(metadata, npc.id);

    assert.deepEqual(impact, {
        npcId: npc.id,
        name: 'Dr. Vale',
        baselinesRemoved: 1,
        manualEventsRemoved: 1,
        classificationsSanitized: 1,
        eventsSanitized: 1,
        exclusionsRemoved: 2,
    });
    assert.equal(metadata.npcs[npc.id], undefined);
    assert.equal(metadata.baseline.entities[npc.id], undefined);
    assert.deepEqual(metadata.manualEvents.map(event => event.id), ['manual:elena']);
    assert.deepEqual(metadata.records.scene.classifications[0], {
        succubusId: 'character:elena.png', elapsedHours: 2,
        hungerPressure: 'strain_moderate', exposure: 'suspicion',
        contactMode: 'none', feedingIntensity: 'none',
        targetId: '', targetName: '', targetKind: 'none', note: 'Fed from Vale',
    });
    assert.deepEqual(metadata.records.scene.events[0], {
        id: 'analysis:scene:0', type: 'time', succubusId: 'character:elena.png',
        elapsedHours: 2, timeHungerGain: 4, hungerDelta: 7, exposureDelta: 5,
        contactMode: 'none', note: 'Fed from Vale',
    });
    assert.deepEqual(metadata.excludedIds, ['analysis:scene:0', 'unrelated']);
    assert.equal(metadata.state, null);
    assert.deepEqual(metadata.suppressedNpcNames, ['dr. vale']);
});

test('removal suppression is exact and invalid removal rolls back every metadata field', () => {
    const metadata = createDefaultMetadata();
    const mara = addNpc(metadata, 'Mara', { uuid: () => 'mara' });
    addNpc(metadata, 'Marabelle', { uuid: () => 'marabelle' });
    metadata.suppressedNpcNames = ['existing'];
    const before = structuredClone(metadata);

    assert.throws(() => removeNpc(metadata, 'npc:missing'), /unknown npc/i);
    assert.deepEqual(metadata, before);

    removeNpc(metadata, mara.id);
    assert.deepEqual(metadata.suppressedNpcNames, ['existing', 'mara']);
    assert.equal(metadata.npcs['npc:marabelle'].name, 'Marabelle');
});
