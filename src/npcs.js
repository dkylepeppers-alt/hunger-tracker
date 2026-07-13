const STATUSES = new Set(['pending', 'approved', 'ignored']);

export function normalizeNpcName(name) {
    return String(name ?? '').trim().replace(/\s+/g, ' ').toLocaleLowerCase();
}

export function mergeNpcCandidates(metadata, candidates, messageIndex, uuid = () => crypto.randomUUID()) {
    metadata.npcs ??= {};
    const merged = [];
    for (const candidate of candidates ?? []) {
        const name = String(candidate?.name ?? '').trim().replace(/\s+/g, ' ');
        const normalizedName = normalizeNpcName(name);
        if (!normalizedName || name.length > 100) continue;
        let record = Object.values(metadata.npcs).find(item => item.normalizedName === normalizedName);
        if (!record) {
            const id = `npc:${uuid()}`;
            record = metadata.npcs[id] = {
                id, name, normalizedName, status: 'pending', evidence: '',
                firstSourceMessageIndex: messageIndex, lastSourceMessageIndex: messageIndex,
                involvedInFeeding: false,
            };
        }
        const evidence = String(candidate.evidence ?? '').trim().slice(0, 240);
        if (evidence) record.evidence = evidence;
        record.lastSourceMessageIndex = messageIndex;
        record.involvedInFeeding ||= candidate.involvedInFeeding === true;
        merged.push(record);
    }
    return merged;
}

export function setNpcStatus(metadata, npcId, status) {
    if (!STATUSES.has(status)) throw new Error(`Unknown NPC status: ${status}`);
    const record = metadata.npcs?.[npcId];
    if (!record) return false;
    record.status = status;
    return true;
}

export function approvedNpcEntities(metadata) {
    return Object.values(metadata?.npcs ?? {})
        .filter(record => record.status === 'approved')
        .map(record => ({ id: record.id, name: record.name, kind: 'npc' }));
}
