import test from 'node:test';
import assert from 'node:assert/strict';
import { migrateToV5, sourceRecordStatus } from '../src/store.js';

test('migrates displayed v4 state into an immutable baseline and archives old diagnostics', () => {
    const old = { version: 3, state: { succubi: { a: { hunger: 52, exposure: 4, soulsConsumed: 3, storyHours: 9 } }, participants: { b: { soul: 80 } } }, analysisCache: { bad: { status: 'failed' } }, analysisWarnings: [{ message: 'old' }] };
    const migrated = migrateToV5(old, 7);
    assert.equal(migrated.version, 5);
    assert.equal(migrated.baseline.entities.a.hunger, 52);
    assert.equal(migrated.baseline.entities.b.soul, 80);
    assert.equal(migrated.analysisBoundary, 7);
    assert.deepEqual(migrated.records, {});
    assert.equal(migrated.archive.v4.analysisWarnings[0].message, 'old');
});

test('record status is derived without persisted pending records', () => {
    assert.equal(sourceRecordStatus(undefined, false), 'missing');
    assert.equal(sourceRecordStatus(undefined, true), 'analyzing');
    assert.equal(sourceRecordStatus({ status: 'complete' }, false), 'complete');
    assert.equal(sourceRecordStatus({ status: 'failed' }, false), 'failed');
});
