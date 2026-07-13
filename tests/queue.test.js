import test from 'node:test';
import assert from 'node:assert/strict';
import { AnalysisQueue } from '../src/queue.js';

test('runs one job at a time and deduplicates keys', async () => {
    const order = [];
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    const queue = new AnalysisQueue(async job => { order.push(`start:${job.key}`); if (job.key === 'a') await gate; order.push(`end:${job.key}`); });
    assert.equal(queue.enqueue({ key: 'a' }), true);
    assert.equal(queue.enqueue({ key: 'a' }), false);
    assert.equal(queue.enqueue({ key: 'b' }), true);
    await Promise.resolve();
    assert.deepEqual(order, ['start:a']);
    release();
    await queue.idle();
    assert.deepEqual(order, ['start:a', 'end:a', 'start:b', 'end:b']);
});

test('cancel invalidates queued and running job generations', async () => {
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    const seen = [];
    const queue = new AnalysisQueue(async job => { await gate; seen.push(queue.isCurrent(job)); });
    queue.enqueue({ key: 'a' });
    await Promise.resolve();
    queue.cancel();
    release();
    await queue.idle();
    assert.deepEqual(seen, [false]);
});

test('a running job keeps its starting settings while a queued job reads updated settings', async () => {
    const settings = { model: 'model-a' };
    const seen = [];
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    const queue = new AnalysisQueue(async job => {
        const model = settings.model;
        seen.push(`start:${job.key}:${model}`);
        if (job.key === 'a') await gate;
        seen.push(`end:${job.key}:${model}`);
    });

    queue.enqueue({ key: 'a' });
    queue.enqueue({ key: 'b' });
    await Promise.resolve();
    settings.model = 'model-b';
    release();
    await queue.idle();

    assert.deepEqual(seen, [
        'start:a:model-a',
        'end:a:model-a',
        'start:b:model-b',
        'end:b:model-b',
    ]);
});
