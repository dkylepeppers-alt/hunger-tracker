export const METADATA_VERSION = 8;

export function createDefaultMetadata(messageCount = 0) {
    const messageBoundary = Math.max(0, Number(messageCount) || 0);
    return {
        version: METADATA_VERSION,
        baseline: { source: 'v8-default', messageBoundary, entities: {} },
        analysisBoundary: messageBoundary,
        records: {},
        manualEvents: [],
        excludedIds: [],
        npcs: {},
        suppressedNpcNames: [],
        archive: {},
        state: null,
    };
}

export function migrateMetadata(metadata = {}, messageCount = 0) {
    if (metadata?.version !== METADATA_VERSION) return createDefaultMetadata(messageCount);

    for (const [key, value] of Object.entries(createDefaultMetadata(messageCount))) {
        if (metadata[key] === undefined) {
            metadata[key] = value;
        }
    }
    return metadata;
}

export function sourceRecordStatus(record, analyzing) {
    if (analyzing) return 'analyzing';
    return record?.status ?? 'missing';
}
