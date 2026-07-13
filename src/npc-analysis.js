import { mergeNpcCandidates, normalizeNpcName } from './npcs.js';

export function prepareNpcAnalysisResult({ result, metadata, roster, messageIndex, uuid }) {
    const discovered = mergeNpcCandidates(metadata, result.npcCandidates, messageIndex, uuid);
    const approvedNames = new Set(Object.values(metadata.npcs ?? {})
        .filter(record => record.status === 'approved')
        .map(record => record.normalizedName));
    const participants = new Map(roster.participants.map(entity => [entity.id, entity]));
    const events = result.events.map(event => {
        if (event.targetKind !== 'untracked_npc' || event.targetId !== '') return event;
        const normalizedTarget = normalizeNpcName(event.targetName);
        const candidateMatches = result.npcCandidates.filter(candidate => (
            candidate.involvedInFeeding === true && normalizeNpcName(candidate.name) === normalizedTarget
        ));
        const recordMatches = Object.values(metadata.npcs ?? {}).filter(record => (
            record.status === 'approved' && record.normalizedName === normalizedTarget
        ));
        if (candidateMatches.length !== 1 || recordMatches.length !== 1) return event;
        const record = recordMatches[0];
        const entity = { id: record.id, name: record.name, kind: 'npc' };
        participants.set(entity.id, entity);
        return { ...event, targetId: entity.id, targetName: entity.name, targetKind: entity.kind };
    });
    return {
        result: { ...result, events },
        roster: { ...roster, participants: [...participants.values()] },
        discovered,
        hasUnapprovedCandidates: result.npcCandidates.some(candidate => {
            const normalizedName = normalizeNpcName(candidate?.name);
            return normalizedName && !approvedNames.has(normalizedName);
        }),
    };
}
