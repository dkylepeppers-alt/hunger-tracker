import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareNpcAnalysisResult } from '../src/npc-analysis.js';

const roster = {
    succubi: [{ id: 'character:elena.png', name: 'Elena', kind: 'character' }],
    participants: [{ id: 'persona:kyle.png', name: 'Kyle', kind: 'persona' }],
};

function untrackedEvent(name = 'Billy') {
    return {
        succubusId: 'character:elena.png', elapsedHours: 0, hungerPressure: 'none', exposure: 'none',
        contactMode: 'direct', feedingIntensity: 'moderate', targetId: '', targetName: name,
        targetKind: 'untracked_npc', note: 'Direct feeding',
    };
}

test('resolves an exact feeding-involved candidate to a locally generated NPC id', () => {
    const metadata = { npcs: {} };
    const result = {
        events: [untrackedEvent('  BILLY ')],
        npcCandidates: [{ name: 'Billy', evidence: 'Present and fed upon', involvedInFeeding: true }],
    };
    const prepared = prepareNpcAnalysisResult({ result, metadata, roster, messageIndex: 15, uuid: () => 'billy' });
    assert.deepEqual(prepared.result.events[0], { ...untrackedEvent('  BILLY '), targetId: 'npc:billy', targetName: 'Billy', targetKind: 'npc' });
    assert.deepEqual(prepared.roster.participants.at(-1), { id: 'npc:billy', name: 'Billy', kind: 'npc' });
    assert.equal(prepared.discovered[0].status, 'approved');
    assert.equal(prepared.hasUnapprovedCandidates, false);
    assert.equal(roster.participants.length, 1);
    assert.equal(result.events[0].targetKind, 'untracked_npc');
});

test('does not resolve non-feeding, ignored, fuzzy, or ambiguous matches', () => {
    const cases = [
        {
            name: 'non-feeding', metadata: { npcs: {} }, target: 'Billy',
            candidates: [{ name: 'Billy', evidence: 'Mentioned', involvedInFeeding: false }],
        },
        {
            name: 'ignored',
            metadata: { npcs: { 'npc:billy': { id: 'npc:billy', name: 'Billy', normalizedName: 'billy', status: 'ignored' } } },
            target: 'Billy', candidates: [{ name: 'Billy', evidence: 'Present', involvedInFeeding: true }],
        },
        {
            name: 'fuzzy', metadata: { npcs: {} }, target: 'Bill',
            candidates: [{ name: 'Billy', evidence: 'Present', involvedInFeeding: true }],
        },
        {
            name: 'duplicate candidates', metadata: { npcs: {} }, target: 'Billy',
            candidates: [
                { name: 'Billy', evidence: 'One', involvedInFeeding: true },
                { name: ' billy ', evidence: 'Two', involvedInFeeding: true },
            ],
        },
        {
            name: 'duplicate registry',
            metadata: { npcs: {
                'npc:one': { id: 'npc:one', name: 'Billy', normalizedName: 'billy', status: 'approved' },
                'npc:two': { id: 'npc:two', name: 'BILLY', normalizedName: 'billy', status: 'approved' },
            } },
            target: 'Billy', candidates: [{ name: 'Billy', evidence: 'Present', involvedInFeeding: true }],
        },
    ];
    for (const item of cases) {
        const result = { events: [untrackedEvent(item.target)], npcCandidates: item.candidates };
        const prepared = prepareNpcAnalysisResult({ result, metadata: item.metadata, roster, messageIndex: 1, uuid: () => item.name });
        assert.equal(prepared.result.events[0].targetKind, 'untracked_npc', item.name);
        assert.equal(prepared.result.events[0].targetId, '', item.name);
    }
});

test('does not rediscover or resolve an analyzer target whose normalized name is suppressed', () => {
    const metadata = { npcs: {}, suppressedNpcNames: ['billy'] };
    const result = {
        events: [untrackedEvent('Billy')],
        npcCandidates: [{ name: '  BILLY ', evidence: 'Returned', involvedInFeeding: true }],
    };

    const prepared = prepareNpcAnalysisResult({ result, metadata, roster, messageIndex: 9, uuid: () => 'blocked' });

    assert.deepEqual(prepared.discovered, []);
    assert.deepEqual(metadata.npcs, {});
    assert.equal(prepared.result.events[0].targetKind, 'untracked_npc');
    assert.equal(prepared.result.events[0].targetId, '');
    assert.equal(prepared.hasUnapprovedCandidates, true);
});
