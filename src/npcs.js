const STATUSES = new Set(['approved', 'ignored']);
const MAX_NAME_LENGTH = 100;

export function normalizeNpcName(name) {
    return String(name ?? '').trim().replace(/\s+/g, ' ').toLocaleLowerCase();
}

function validatedName(name) {
    const displayName = String(name ?? '').trim().replace(/\s+/g, ' ');
    if (!displayName) throw new Error('NPC name is required');
    if (displayName.length > MAX_NAME_LENGTH) throw new Error(`NPC name must be ${MAX_NAME_LENGTH} characters or fewer`);
    return { name: displayName, normalizedName: normalizeNpcName(displayName) };
}

function cloneMetadata(metadata) {
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) throw new Error('NPC metadata is required');
    return structuredClone(metadata);
}

function commitFields(metadata, draft, fields) {
    for (const field of fields) metadata[field] = draft[field];
}

export function addNpc(metadata, name, { uuid = () => crypto.randomUUID() } = {}) {
    const validated = validatedName(name);
    const draft = cloneMetadata(metadata);
    draft.npcs ??= {};
    draft.suppressedNpcNames ??= [];
    if (Object.values(draft.npcs).some(record => record.normalizedName === validated.normalizedName)) {
        throw new Error(`NPC already exists: ${validated.name}`);
    }
    const id = `npc:${uuid()}`;
    if (draft.npcs[id]) throw new Error(`NPC id already exists: ${id}`);
    draft.npcs[id] = {
        id,
        ...validated,
        status: 'approved',
        evidence: '',
        firstSourceMessageIndex: null,
        lastSourceMessageIndex: null,
        involvedInFeeding: false,
        manual: true,
    };
    draft.suppressedNpcNames = draft.suppressedNpcNames.filter(item => normalizeNpcName(item) !== validated.normalizedName);
    commitFields(metadata, draft, ['npcs', 'suppressedNpcNames']);
    return metadata.npcs[id];
}

export function restoreSuppressedNpc(metadata, normalizedName) {
    const target = normalizeNpcName(normalizedName);
    if (!target) throw new Error('Suppressed NPC name is required');
    const draft = cloneMetadata(metadata);
    draft.suppressedNpcNames ??= [];
    const restored = draft.suppressedNpcNames.some(item => normalizeNpcName(item) === target);
    if (!restored) return false;
    draft.suppressedNpcNames = draft.suppressedNpcNames.filter(item => normalizeNpcName(item) !== target);
    commitFields(metadata, draft, ['suppressedNpcNames']);
    return true;
}

function standardRosterEntities(metadata) {
    const entities = [
        ...Object.values(metadata.state?.succubi ?? {}),
        ...Object.values(metadata.state?.participants ?? {}),
    ];
    return entities.filter(entity => entity && !metadata.npcs?.[entity.id]);
}

function rewriteDisplayNameSnapshots(value, npcId, name) {
    if (!value || typeof value !== 'object') return;
    if (value.id === npcId && Object.hasOwn(value, 'name')) value.name = name;
    if (value.entityId === npcId && Object.hasOwn(value, 'entityName')) value.entityName = name;
    if (value.targetId === npcId && Object.hasOwn(value, 'targetName')) value.targetName = name;
    for (const nested of Object.values(value)) rewriteDisplayNameSnapshots(nested, npcId, name);
}

export function renameNpc(metadata, npcId, name) {
    const validated = validatedName(name);
    const draft = cloneMetadata(metadata);
    const record = draft.npcs?.[npcId];
    if (!record) throw new Error(`Unknown NPC: ${npcId}`);
    const npcCollision = Object.values(draft.npcs).find(item => (
        item.id !== npcId && item.normalizedName === validated.normalizedName
    ));
    if (npcCollision) throw new Error(`NPC name collides with ${npcCollision.id}: ${npcCollision.name}`);
    const rosterCollision = standardRosterEntities(draft).find(entity => (
        normalizeNpcName(entity.name) === validated.normalizedName
    ));
    if (rosterCollision) throw new Error(`NPC name collides with standard roster entry: ${rosterCollision.name}`);

    record.name = validated.name;
    record.normalizedName = validated.normalizedName;
    if (draft.baseline?.entities?.[npcId] && Object.hasOwn(draft.baseline.entities[npcId], 'name')) {
        draft.baseline.entities[npcId].name = validated.name;
    }
    rewriteDisplayNameSnapshots(draft, npcId, validated.name);
    commitFields(metadata, draft, ['npcs', 'baseline', 'manualEvents', 'records', 'state']);
    return metadata.npcs[npcId];
}

function combinedEvidence(...values) {
    return [...new Set(values.map(value => String(value ?? '').trim()).filter(Boolean))].join('\n');
}

function sourceBound(values, select) {
    const indexes = values.filter(value => Number.isInteger(value) && value >= 0);
    return indexes.length ? select(...indexes) : null;
}

function rewriteIdentityReferences(value, removedId, retainedId, retainedName) {
    if (!value || typeof value !== 'object') return;
    if (value.id === removedId) {
        value.id = retainedId;
        if (Object.hasOwn(value, 'name')) value.name = retainedName;
    }
    if (value.entityId === removedId) {
        value.entityId = retainedId;
        if (Object.hasOwn(value, 'entityName')) value.entityName = retainedName;
    }
    if (value.targetId === removedId) {
        value.targetId = retainedId;
        if (Object.hasOwn(value, 'targetName')) value.targetName = retainedName;
    }
    for (const nested of Object.values(value)) {
        rewriteIdentityReferences(nested, removedId, retainedId, retainedName);
    }
}

export function mergeNpcs(metadata, retainedId, removedId) {
    const draft = cloneMetadata(metadata);
    if (retainedId === removedId) throw new Error('Merge requires two different NPCs');
    const retained = draft.npcs?.[retainedId];
    const removed = draft.npcs?.[removedId];
    if (!retained) throw new Error(`Unknown NPC: ${retainedId}`);
    if (!removed) throw new Error(`Unknown NPC: ${removedId}`);

    retained.evidence = combinedEvidence(retained.evidence, removed.evidence);
    retained.firstSourceMessageIndex = sourceBound(
        [retained.firstSourceMessageIndex, removed.firstSourceMessageIndex],
        Math.min,
    );
    retained.lastSourceMessageIndex = sourceBound(
        [retained.lastSourceMessageIndex, removed.lastSourceMessageIndex],
        Math.max,
    );
    retained.involvedInFeeding = retained.involvedInFeeding === true || removed.involvedInFeeding === true;
    retained.manual = retained.manual === true || removed.manual === true;
    delete draft.npcs[removedId];

    const baselines = draft.baseline?.entities;
    if (baselines?.[removedId]) {
        baselines[retainedId] = { ...baselines[removedId], ...baselines[retainedId] };
        if (Object.hasOwn(baselines[retainedId], 'name')) baselines[retainedId].name = retained.name;
        delete baselines[removedId];
    }

    const participants = draft.state?.participants;
    if (participants?.[removedId]) {
        participants[retainedId] = {
            ...participants[removedId],
            ...participants[retainedId],
            id: retainedId,
            name: retained.name,
        };
        delete participants[removedId];
    }

    draft.excludedIds ??= [];
    draft.excludedIds = draft.excludedIds.map(id => id === removedId ? retainedId : id);
    rewriteIdentityReferences(draft, removedId, retainedId, retained.name);
    commitFields(metadata, draft, ['npcs', 'baseline', 'manualEvents', 'records', 'excludedIds', 'state']);
    return metadata.npcs[retainedId];
}

function sanitizeClassificationTarget(classification, npcId) {
    if (!classification || classification.targetId !== npcId) return false;
    classification.contactMode = 'none';
    classification.feedingIntensity = 'none';
    classification.targetId = '';
    classification.targetName = '';
    classification.targetKind = 'none';
    return true;
}

function sanitizeEventTarget(event, npcId) {
    if (!event || event.targetId !== npcId) return false;
    event.type = 'time';
    event.contactMode = 'none';
    delete event.targetId;
    delete event.targetName;
    delete event.targetKind;
    delete event.intensity;
    delete event.feedingIntensity;
    delete event.feedingTiers;
    delete event.soulDrain;
    delete event.hungerRelief;
    return true;
}

export function removeNpc(metadata, npcId) {
    const draft = cloneMetadata(metadata);
    const record = draft.npcs?.[npcId];
    if (!record) throw new Error(`Unknown NPC: ${npcId}`);
    const impact = {
        npcId,
        name: record.name,
        baselinesRemoved: 0,
        manualEventsRemoved: 0,
        classificationsSanitized: 0,
        eventsSanitized: 0,
        exclusionsRemoved: 0,
    };

    delete draft.npcs[npcId];
    if (draft.baseline?.entities && Object.hasOwn(draft.baseline.entities, npcId)) {
        delete draft.baseline.entities[npcId];
        impact.baselinesRemoved++;
    }

    draft.manualEvents ??= [];
    const removedManualIds = new Set();
    draft.manualEvents = draft.manualEvents.filter(event => {
        if (event?.entityId !== npcId) return true;
        removedManualIds.add(event.id);
        impact.manualEventsRemoved++;
        return false;
    });

    for (const analysis of Object.values(draft.records ?? {})) {
        for (const classification of analysis?.classifications ?? []) {
            if (sanitizeClassificationTarget(classification, npcId)) impact.classificationsSanitized++;
        }
        for (const event of analysis?.events ?? []) {
            if (sanitizeEventTarget(event, npcId)) impact.eventsSanitized++;
        }
    }

    draft.excludedIds ??= [];
    draft.excludedIds = draft.excludedIds.filter(id => {
        const removed = id === npcId || removedManualIds.has(id);
        if (removed) impact.exclusionsRemoved++;
        return !removed;
    });
    draft.suppressedNpcNames ??= [];
    if (!draft.suppressedNpcNames.some(name => normalizeNpcName(name) === record.normalizedName)) {
        draft.suppressedNpcNames.push(record.normalizedName);
    }
    draft.state = null;

    commitFields(metadata, draft, [
        'npcs', 'baseline', 'manualEvents', 'records', 'excludedIds', 'suppressedNpcNames', 'state',
    ]);
    return impact;
}

export function mergeNpcCandidates(metadata, candidates, messageIndex, uuid = () => crypto.randomUUID()) {
    const draft = cloneMetadata(metadata);
    draft.npcs ??= {};
    const suppressed = new Set((draft.suppressedNpcNames ?? []).map(normalizeNpcName));
    const merged = [];
    for (const candidate of candidates ?? []) {
        const name = String(candidate?.name ?? '').trim().replace(/\s+/g, ' ');
        const normalizedName = normalizeNpcName(name);
        if (!normalizedName || name.length > MAX_NAME_LENGTH || suppressed.has(normalizedName)) continue;
        let record = Object.values(draft.npcs).find(item => item.normalizedName === normalizedName);
        if (!record) {
            const id = `npc:${uuid()}`;
            if (draft.npcs[id]) throw new Error(`NPC id already exists: ${id}`);
            record = draft.npcs[id] = {
                id, name, normalizedName, status: 'approved', evidence: '',
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
    commitFields(metadata, draft, ['npcs']);
    return merged.map(record => metadata.npcs[record.id]);
}

export function setNpcStatus(metadata, npcId, status) {
    if (!STATUSES.has(status)) throw new Error(`Unknown NPC status: ${status}`);
    const draft = cloneMetadata(metadata);
    const record = draft.npcs?.[npcId];
    if (!record) return false;
    record.status = status;
    commitFields(metadata, draft, ['npcs']);
    return true;
}

export function approvedNpcEntities(metadata) {
    return Object.values(metadata?.npcs ?? {})
        .filter(record => record.status === 'approved')
        .map(record => ({ id: record.id, name: record.name, kind: 'npc' }));
}
