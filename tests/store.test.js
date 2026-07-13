import test from 'node:test';
import assert from 'node:assert/strict';
import * as storeModule from '../src/store.js';
import { ensureMetadata } from '../src/chat.js';
import { METADATA_KEY } from '../src/identity.js';

test('creates independent schema-v8 metadata with clean mutable collections', () => {
    assert.equal(typeof storeModule.createDefaultMetadata, 'function');
    const first = storeModule.createDefaultMetadata(12);
    const second = storeModule.createDefaultMetadata(12);

    assert.equal(storeModule.METADATA_VERSION, 8);
    assert.equal(first.version, 8);
    assert.equal(first.baseline.messageBoundary, 12);
    assert.equal(first.analysisBoundary, 12);
    assert.deepEqual(first.baseline.entities, {});
    assert.deepEqual(first.records, {});
    assert.deepEqual(first.npcs, {});
    assert.deepEqual(first.suppressedNpcNames, []);
    assert.deepEqual(first.manualEvents, []);
    assert.deepEqual(first.excludedIds, []);
    assert.notStrictEqual(first.records, second.records);
    assert.notStrictEqual(first.suppressedNpcNames, second.suppressedNpcNames);
});

test('replaces v7 metadata without importing tracker state', () => {
    const legacy = {
        version: 7,
        baseline: { source: 'legacy', messageBoundary: 0, entities: { legacy: { hunger: 90 } } },
        analysisBoundary: 0,
        records: { legacy: { status: 'complete' } },
        npcs: { 'npc:legacy': { id: 'npc:legacy', name: 'Legacy' } },
        suppressedNpcNames: ['legacy'],
        manualEvents: [{ id: 'manual:legacy' }],
        excludedIds: ['legacy:event'],
    };

    const metadata = storeModule.migrateMetadata(legacy, 9);

    assert.equal(metadata.version, 8);
    assert.equal(metadata.baseline.messageBoundary, 9);
    assert.equal(metadata.analysisBoundary, 9);
    assert.deepEqual(metadata.baseline.entities, {});
    assert.deepEqual(metadata.records, {});
    assert.deepEqual(metadata.npcs, {});
    assert.deepEqual(metadata.suppressedNpcNames, []);
    assert.deepEqual(metadata.manualEvents, []);
    assert.deepEqual(metadata.excludedIds, []);
});

test('ensureMetadata installs clean v8 metadata under the Hunger Tracker key', () => {
    const ctx = {
        chat: [{ is_user: true }, { is_user: false }],
        chatMetadata: {
            [METADATA_KEY]: {
                version: 7,
                records: { legacy: { status: 'complete' } },
                npcs: { 'npc:legacy': { id: 'npc:legacy', name: 'Legacy' } },
                suppressedNpcNames: ['legacy'],
                manualEvents: [{ id: 'manual:legacy' }],
                excludedIds: ['legacy:event'],
            },
        },
    };

    const metadata = ensureMetadata(ctx, { all: [] });

    assert.equal(ctx.chatMetadata[METADATA_KEY], metadata);
    assert.equal(metadata.version, 8);
    assert.equal(metadata.analysisBoundary, 2);
    assert.deepEqual(metadata.records, {});
    assert.deepEqual(metadata.npcs, {});
    assert.deepEqual(metadata.suppressedNpcNames, []);
    assert.deepEqual(metadata.manualEvents, []);
    assert.deepEqual(metadata.excludedIds, []);
});

test('record status is derived without persisted pending records', () => {
    assert.equal(storeModule.sourceRecordStatus(undefined, false), 'missing');
    assert.equal(storeModule.sourceRecordStatus(undefined, true), 'analyzing');
    assert.equal(storeModule.sourceRecordStatus({ status: 'complete' }, false), 'complete');
    assert.equal(storeModule.sourceRecordStatus({ status: 'failed' }, false), 'failed');
});
