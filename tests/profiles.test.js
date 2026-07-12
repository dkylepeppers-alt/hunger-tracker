import test from 'node:test';
import assert from 'node:assert/strict';

import { buildEntities, legacyElenaEntity, migrateLegacyMetadata, shortIdMap } from '../src/profiles.js';
import { migrateProfilesToV5 } from '../src/settings.js';

test('builds selectable character and persona entities with stable ids', () => {
    const entities = buildEntities({
        characters: [{ name: 'Lilith', avatar: 'lilith.png' }],
        personas: { 'alex.png': 'Alex' },
    });
    assert.deepEqual(entities, [
        { id: 'character:lilith.png', kind: 'character', name: 'Lilith', avatar: 'lilith.png' },
        { id: 'persona:alex.png', kind: 'persona', name: 'Alex', avatar: 'alex.png' },
    ]);
});

test('short ids resolve duplicate display names without ambiguity', () => {
    const map = shortIdMap([
        { id: 'character:a.png', name: 'Alex' },
        { id: 'persona:b.png', name: 'Alex' },
    ]);
    assert.deepEqual(map, { s1: 'character:a.png', s2: 'persona:b.png' });
});

test('migrates legacy Elena state into a selected avatar profile', () => {
    const result = migrateLegacyMetadata({
        version: 2, hunger: 61, exposure: 9, souls: 2, storyHours: 4,
        lastFeedStoryHour: 3, lastFeed: 'night feeding', events: [],
    }, { id: 'character:elena.png', name: 'Elena Thompson (Succubus)', kind: 'character' });
    assert.equal(result.baselines['character:elena.png'].hunger, 61);
    assert.equal(result.baselines['character:elena.png'].soulsConsumed, 2);
    assert.equal(result.migrated, true);
});

test('finds the legacy Elena card by name for automatic profile migration', () => {
    const entity = legacyElenaEntity([
        { id: 'character:other.png', name: 'Other', kind: 'character' },
        { id: 'character:elena.png', name: 'Elena Thompson (Succubus)', kind: 'character' },
    ]);
    assert.equal(entity.id, 'character:elena.png');
});

test('copies current global rules into each profile during v5 migration', () => {
    const settings = { settingsVersion: 3, hungerPerStoryHour: 15, eventRules: { hunger: { none: 0 }, exposure: { none: 0 } }, hungerTiers: [{ id: 'x' }], soulTiers: [{ id: 'y' }], profiles: [{ id: 'p', entityId: 'character:a.png', name: 'A', enabled: true }] };
    migrateProfilesToV5(settings);
    assert.equal(settings.settingsVersion, 5);
    assert.equal(settings.profiles[0].rules.hungerPerStoryHour, 15);
    assert.notEqual(settings.profiles[0].rules.hungerTiers, settings.hungerTiers);
});
