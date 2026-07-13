import { METADATA_KEY } from './identity.js';
import { buildEntities } from './profiles.js';
import { reconstructFromMessages } from './rebuild.js';
import { ANALYZER_VERSION, analysisFingerprint } from './analyzer.js';
import { approvedNpcEntities } from './npcs.js';
import { migrateMetadata, sourceRecordStatus } from './store.js';

export function shouldInitializeImmediately(ctx) {
    return Array.isArray(ctx?.characters) && ctx.characters.length > 0;
}

export function resolveActivePersonaAvatar(ctx, eventAvatar = '') {
    const personas = ctx?.powerUserSettings?.personas ?? {};
    const exists = avatar => typeof avatar === 'string' && Object.hasOwn(personas, avatar);
    if (exists(eventAvatar)) return eventAvatar;
    if (exists(ctx?.chatMetadata?.persona)) return ctx.chatMetadata.persona;
    const nameMatches = Object.entries(personas).filter(([, name]) => name === ctx?.name1);
    if (nameMatches.length === 1) return nameMatches[0][0];
    const defaultPersona = ctx?.powerUserSettings?.default_persona;
    return exists(defaultPersona) ? defaultPersona : '';
}

export function availableEntities(ctx) {
    return buildEntities({ characters: ctx.characters ?? [], personas: ctx.powerUserSettings?.personas ?? {} });
}

export function presentEntities(ctx, allEntities, activePersonaAvatar) {
    const ids = new Set();
    if (ctx.groupId != null) {
        const group = ctx.groups?.find(item => String(item.id) === String(ctx.groupId));
        for (const avatar of group?.members ?? []) ids.add(`character:${avatar}`);
    } else {
        const character = ctx.characters?.[ctx.characterId];
        if (character?.avatar) ids.add(`character:${character.avatar}`);
    }
    if (activePersonaAvatar) ids.add(`persona:${activePersonaAvatar}`);
    return allEntities.filter(entity => ids.has(entity.id));
}

export function activeRoster(ctx, settings, activePersonaAvatar) {
    const all = availableEntities(ctx);
    const standardPresent = presentEntities(ctx, all, activePersonaAvatar);
    const npcs = approvedNpcEntities(ctx.chatMetadata?.[METADATA_KEY]);
    const present = [...standardPresent, ...npcs];
    const profiles = new Map(settings.profiles.filter(profile => profile.enabled).map(profile => [profile.entityId, profile]));
    const succubi = standardPresent.filter(entity => profiles.has(entity.id)).map(entity => ({ ...entity, profileId: profiles.get(entity.id).id, ruleRevision: profiles.get(entity.id).ruleRevision ?? 1, rules: profiles.get(entity.id).rules }));
    const participants = [...standardPresent.filter(entity => !profiles.has(entity.id)), ...npcs];
    return { all, present, succubi, participants };
}

export function ensureMetadata(ctx, roster) {
    const metadata = migrateMetadata(ctx.chatMetadata[METADATA_KEY], ctx.chat.length);
    ctx.chatMetadata[METADATA_KEY] = metadata;
    return metadata;
}

export function precedingUserText(messages, index) {
    for (let cursor = index - 1; cursor >= 0; cursor--) if (messages[cursor]?.is_user) return String(messages[cursor].mes ?? '');
    return '';
}

export function analysisKey(messages, index, roster) {
    const message = messages[index];
    if (!message || message.is_user || message.is_system) return null;
    const swipeId = Number.isInteger(Number(message.swipe_id)) ? Number(message.swipe_id) : 0;
    const assistantText = Array.isArray(message.swipes) && message.swipes[swipeId] != null ? String(message.swipes[swipeId]) : String(message.mes ?? '');
    return analysisFingerprint({ version: ANALYZER_VERSION, assistantText, userText: precedingUserText(messages, index), rosterIds: [...roster.succubi.map(item => item.id), ...roster.participants.filter(item => item.kind !== 'npc').map(item => item.id)].sort() });
}

export function activeSources(ctx, roster, metadata, sessionKeys = new Set()) {
    const sources = [];
    for (let index = metadata.analysisBoundary; index < ctx.chat.length; index++) {
        const key = analysisKey(ctx.chat, index, roster);
        if (!key) continue;
        sources.push({ key, messageIndex: index, status: sourceRecordStatus(metadata.records[key], sessionKeys.has(key)), record: metadata.records[key] });
    }
    return sources;
}

export function rebuildChatState(ctx, roster, settings, sessionKeys = new Set()) {
    const metadata = ensureMetadata(ctx, roster);
    const analyzedEvents = [];
    const activity = activeSources(ctx, roster, metadata, sessionKeys);
    for (const source of activity) {
        const record = source.record;
        if (record?.status === 'complete') analyzedEvents.push(...record.events);
    }
    const profileRules = Object.fromEntries(roster.succubi.map(item => [item.id, item.rules]));
    const state = reconstructFromMessages({
        messages: ctx.chat,
        succubi: roster.succubi,
        participants: roster.participants,
        baselines: metadata.baseline.entities,
        manualEvents: metadata.manualEvents,
        analyzedEvents,
        excludedIds: metadata.excludedIds,
        legacyEndIndex: 0,
        rules: { profileRules },
    });
    state.activity = activity;
    state.analysisStatus = sessionKeys.size ? 'analyzing' : 'idle';
    for (const source of activity.filter(item => item.status === 'failed')) state.warnings.push({ id: source.key, key: source.key, messageIndex: source.messageIndex, message: source.record.error.message });
    if (metadata.migrationWarning) state.warnings.unshift({ id: 'migration', message: metadata.migrationWarning });
    const before = JSON.stringify(metadata.state);
    const after = JSON.stringify(state);
    metadata.state = state;
    return { state, changed: before !== after, metadata };
}

export function addManualEvent(metadata, entityId, field, value, note = 'Manual adjustment') {
    metadata.manualEvents.push({
        id: `manual:${Date.now()}:${crypto.randomUUID().slice(0, 8)}`,
        type: 'manual', entityId, field, value: Number(value), note,
    });
}

export function toggleExcluded(metadata, eventId) {
    const excluded = new Set(metadata.excludedIds);
    excluded.has(eventId) ? excluded.delete(eventId) : excluded.add(eventId);
    metadata.excludedIds = [...excluded];
}
