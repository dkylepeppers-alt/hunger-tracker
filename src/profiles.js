export function buildEntities({ characters = [], personas = {} }) {
    const entities = characters
        .filter(character => character?.avatar)
        .map(character => ({ id: `character:${character.avatar}`, kind: 'character', name: character.name, avatar: character.avatar }));
    for (const [avatar, name] of Object.entries(personas)) {
        entities.push({ id: `persona:${avatar}`, kind: 'persona', name: name || '[Unnamed Persona]', avatar });
    }
    return entities;
}

export function shortIdMap(entities) {
    return Object.fromEntries(entities.map((entity, index) => [`s${index + 1}`, entity.id]));
}

export function reverseIdMap(map) {
    return Object.fromEntries(Object.entries(map).map(([short, stable]) => [stable, short]));
}

export function legacyElenaEntity(entities) {
    return entities.find(entity => entity.kind === 'character' && entity.name === 'Elena Thompson (Succubus)') ?? null;
}

export function migrateLegacyMetadata(legacy, entity) {
    if (!legacy || !entity) return { migrated: false, baselines: {} };
    return {
        migrated: true,
        baselines: {
            [entity.id]: {
                hunger: legacy.hunger,
                exposure: legacy.exposure,
                soulsConsumed: legacy.souls,
                storyHours: legacy.storyHours,
                lastFeedStoryHour: legacy.lastFeedStoryHour,
                lastFeed: legacy.lastFeed,
            },
        },
    };
}
