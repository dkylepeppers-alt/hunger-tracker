export const METADATA_VERSION = 6;

function baselineEntities(state) {
    const entities = {};
    for (const [key, item] of Object.entries(state?.succubi ?? {})) {
        entities[item.id ?? key] = { hunger: item.hunger, exposure: item.exposure, soulsConsumed: item.soulsConsumed, storyHours: item.storyHours, lastFeedStoryHour: item.lastFeedStoryHour, lastFeed: item.lastFeed };
    }
    for (const [key, item] of Object.entries(state?.participants ?? {})) entities[item.id ?? key] = { soul: item.soul };
    return entities;
}

export function migrateMetadata(old = {}, messageCount = 0) {
    if (old.version === METADATA_VERSION) {
        old.npcs ??= {};
        return old;
    }
    if (old.version === 5) return { ...old, version: METADATA_VERSION, npcs: structuredClone(old.npcs ?? {}) };
    return {
        version: METADATA_VERSION,
        baseline: { source: 'v4-migration', messageBoundary: messageCount, entities: baselineEntities(old.state) },
        analysisBoundary: messageCount,
        records: {}, manualEvents: [], excludedIds: [], npcs: {},
        archive: { v4: { analysisCache: structuredClone(old.analysisCache ?? {}), analysisWarnings: structuredClone(old.analysisWarnings ?? []), legacyState: structuredClone(old.state ?? null), manualEvents: structuredClone(old.manualEvents ?? []), excludedIds: structuredClone(old.excludedIds ?? []) } },
    };
}

export const migrateToV5 = migrateMetadata;

export function sourceRecordStatus(record, analyzing) {
    if (analyzing) return 'analyzing';
    return record?.status ?? 'missing';
}
