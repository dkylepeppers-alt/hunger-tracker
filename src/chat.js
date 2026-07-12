import { buildEntities, legacyElenaEntity, migrateLegacyMetadata } from './profiles.js';
import { reconstructFromMessages } from './rebuild.js';
import { ANALYZER_VERSION, analysisFingerprint } from './analyzer.js';

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
    const activeIds = new Set(settings.profiles.filter(profile => profile.enabled).map(profile => profile.entityId));
    const succubi = present.filter(entity => activeIds.has(entity.id));
    const participants = present.filter(entity => !activeIds.has(entity.id));
    return { all, present, succubi, participants };
}

export function ensureMetadata(ctx, roster) {
    const metadata = ctx.chatMetadata[META_KEY] ?? {
        version: 3, baselines: {}, manualEvents: [], excludedIds: [], state: null,
    };
    if (!ctx.chatMetadata[META_KEY]) ctx.chatMetadata[META_KEY] = metadata;
    if (!metadata.analysisCache) metadata.analysisCache = {};
    if (!Array.isArray(metadata.analysisWarnings)) metadata.analysisWarnings = [];
    if (!Number.isInteger(metadata.analysisBoundary)) metadata.analysisBoundary = ctx.chat.length;
    metadata.analyzerVersion = ANALYZER_VERSION;

    const legacy = ctx.chatMetadata[LEGACY_META_KEY];
    if (legacy && !metadata.legacyMigrated) {
        const elena = legacyElenaEntity(roster.all);
        const migrated = migrateLegacyMetadata(legacy, elena);
        Object.assign(metadata.baselines, migrated.baselines);
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
    return analysisFingerprint({ version: ANALYZER_VERSION, assistantText, userText: precedingUserText(messages, index), rosterIds: [...roster.succubi, ...roster.participants].map(item => item.id).sort() });
}

export function rebuildChatState(ctx, roster, settings) {
    const metadata = ensureMetadata(ctx, roster);
    const analyzedEvents = [];
    for (let index = metadata.analysisBoundary; index < ctx.chat.length; index++) {
        const key = analysisKey(ctx.chat, index, roster);
        const record = key && metadata.analysisCache[key];
        if (record?.status === 'complete') analyzedEvents.push(...record.events);
    }
    const state = reconstructFromMessages({
        messages: ctx.chat,
        succubi: roster.succubi,
        participants: roster.participants,
        baselines: metadata.baselines,
        manualEvents: metadata.manualEvents,
        analyzedEvents,
        excludedIds: metadata.excludedIds,
        legacyEndIndex: metadata.analysisBoundary,
        rules: { hungerPerStoryHour: settings.hungerPerStoryHour, eventRules: settings.eventRules, hungerTiers: settings.hungerTiers, soulTiers: settings.soulTiers },
    });
    state.warnings.push(...metadata.analysisWarnings);
    state.analysisStatus = Object.values(metadata.analysisCache).some(item => item.status === 'pending') ? 'analyzing' : 'idle';
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
