import { buildEntities, legacyElenaEntity, migrateLegacyMetadata } from './profiles.js';
import { reconstructFromMessages } from './rebuild.js';
import { ANALYZER_VERSION, analysisFingerprint } from './analyzer.js';
import { migrateToV5, sourceRecordStatus } from './store.js';

export const META_KEY = 'succubusStateTracker';
export const LEGACY_META_KEY = 'elenaSuccubusTracker';

export function shouldInitializeImmediately(ctx) {
    return Array.isArray(ctx?.characters) && ctx.characters.length > 0;
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
    const present = presentEntities(ctx, all, activePersonaAvatar);
    const profiles = new Map(settings.profiles.filter(profile => profile.enabled).map(profile => [profile.entityId, profile]));
    const succubi = present.filter(entity => profiles.has(entity.id)).map(entity => ({ ...entity, profileId: profiles.get(entity.id).id, ruleRevision: profiles.get(entity.id).ruleRevision ?? 1, rules: profiles.get(entity.id).rules }));
    const participants = present.filter(entity => !profiles.has(entity.id));
    return { all, present, succubi, participants };
}

export function ensureMetadata(ctx, roster) {
    const existing = ctx.chatMetadata[META_KEY] ?? {
        version: 3, baselines: {}, manualEvents: [], excludedIds: [], state: null,
    };
    const metadata = migrateToV5(existing, ctx.chat.length);
    ctx.chatMetadata[META_KEY] = metadata;

    const legacy = ctx.chatMetadata[LEGACY_META_KEY];
    if (legacy && !metadata.legacyMigrated) {
        const elena = legacyElenaEntity(roster.all);
        const migrated = migrateLegacyMetadata(legacy, elena);
        Object.assign(metadata.baseline.entities, migrated.baselines);
        metadata.legacyMigrated = migrated.migrated;
        metadata.migrationWarning = migrated.migrated ? '' : 'Legacy Elena state found, but its character card could not be resolved.';
    }
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
    return analysisFingerprint({ version: ANALYZER_VERSION, assistantText, userText: precedingUserText(messages, index), rosterIds: [...roster.succubi.map(item => item.id), ...roster.participants.map(item => item.id)].sort() });
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
