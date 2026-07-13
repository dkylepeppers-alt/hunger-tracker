import test from 'node:test';
import assert from 'node:assert/strict';
import { migrateMetadata, sourceRecordStatus } from '../src/store.js';

test('migrates displayed v4 state into an immutable baseline and archives old diagnostics', () => {
    const old = { version: 3, state: { succubi: { a: { hunger: 52, exposure: 4, soulsConsumed: 3, storyHours: 9 } }, participants: { b: { soul: 80 } } }, analysisCache: { bad: { status: 'failed' } }, analysisWarnings: [{ message: 'old' }] };
    const migrated = migrateMetadata(old, 7);
    assert.equal(migrated.version, 6);
    assert.equal(migrated.baseline.entities.a.hunger, 52);
    assert.equal(migrated.baseline.entities.b.soul, 80);
    assert.equal(migrated.analysisBoundary, 7);
    assert.deepEqual(migrated.records, {});
    assert.equal(migrated.archive.v4.analysisWarnings[0].message, 'old');
    assert.deepEqual(migrated.npcs, {});
});

test('migrates v5 metadata without losing current records', () => {
    const old = { version: 5, baseline: { entities: {} }, analysisBoundary: 2, records: { key: { status: 'complete' } }, manualEvents: [], excludedIds: [], archive: {} };
    const migrated = migrateMetadata(old, 9);
    assert.equal(migrated.version, 6);
    assert.equal(migrated.records.key.status, 'complete');
    assert.deepEqual(migrated.npcs, {});
});

test('record status is derived without persisted pending records', () => {
    assert.equal(sourceRecordStatus(undefined, false), 'missing');
    assert.equal(sourceRecordStatus(undefined, true), 'analyzing');
    assert.equal(sourceRecordStatus({ status: 'complete' }, false), 'complete');
    assert.equal(sourceRecordStatus({ status: 'failed' }, false), 'failed');
});
