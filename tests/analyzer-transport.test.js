import test from 'node:test';
import assert from 'node:assert/strict';

import { AnalyzerTransportError, analyzeWithProfile } from '../src/analyzer-transport.js';

const profile = { id: 'profile-1', name: 'Analyzer', api: 'nanogpt', model: 'model' };
const jsonSchema = { name: 'events', value: { type: 'object' } };
const prompt = [{ role: 'system', content: 'classify' }, { role: 'user', content: 'scene' }];

function fakeService(raw = { choices: [{ message: { content: '{"events":[]}', reasoning: 'brief' }, finish_reason: 'stop' }] }) {
    const calls = [];
    return {
        calls,
        getSupportedProfiles: () => [profile],
        getProfile: id => id === profile.id ? profile : null,
        sendRequest: async (...args) => { calls.push(args); return raw; },
    };
}

test('sends one isolated raw request through the selected profile', async () => {
    const service = fakeService();
    const result = await analyzeWithProfile({ service, profileId: profile.id, prompt, jsonSchema, responseLength: 900 });
    assert.equal(service.calls.length, 1);
    const [calledProfile, calledPrompt, maxTokens, custom, overridePayload] = service.calls[0];
    assert.equal(calledProfile, profile.id);
    assert.equal(calledPrompt, prompt);
    assert.equal(maxTokens, 900);
    assert.deepEqual(custom, { stream: false, extractData: false, includePreset: false, includeInstruct: false });
    assert.equal(overridePayload.enable_web_search, false);
    assert.deepEqual(overridePayload.tools, []);
    assert.equal(overridePayload.custom_prompt_post_processing, '');
    assert.equal(overridePayload.temperature, 0);
    assert.equal(overridePayload.json_schema, jsonSchema);
    assert.deepEqual(result, { content: '{"events":[]}', reasoning: 'brief', finishReason: 'stop', profileId: profile.id, profileName: profile.name });
});

test('rejects missing and unsupported profiles without making a request', async () => {
    const service = fakeService();
    await assert.rejects(() => analyzeWithProfile({ service, profileId: '', prompt, jsonSchema, responseLength: 900 }), error => error instanceof AnalyzerTransportError && error.category === 'configuration');
    await assert.rejects(() => analyzeWithProfile({ service, profileId: 'deleted', prompt, jsonSchema, responseLength: 900 }), error => error instanceof AnalyzerTransportError && error.category === 'configuration');
    assert.equal(service.calls.length, 0);
});

test('preserves empty and truncated response diagnostics without retrying', async () => {
    for (const [raw, category] of [
        [{ choices: [{ message: { content: '', reasoning: 'thinking only' }, finish_reason: 'stop' }] }, 'empty'],
        [{ choices: [{ message: { content: '{"events":', reasoning: 'too long' }, finish_reason: 'length' }] }, 'truncated'],
    ]) {
        const service = fakeService(raw);
        await assert.rejects(() => analyzeWithProfile({ service, profileId: profile.id, prompt, jsonSchema, responseLength: 900 }), error => {
            assert.equal(error.category, category);
            assert.equal(error.profileId, profile.id);
            assert.equal(error.profileName, profile.name);
            assert.equal(error.reasoning, raw.choices[0].message.reasoning);
            assert.equal(error.finishReason, raw.choices[0].finish_reason);
            return true;
        });
        assert.equal(service.calls.length, 1);
    }
});

test('wraps a provider exception after exactly one request', async () => {
    const service = fakeService();
    service.sendRequest = async (...args) => { service.calls.push(args); throw new Error('upstream 502'); };
    await assert.rejects(() => analyzeWithProfile({ service, profileId: profile.id, prompt, jsonSchema, responseLength: 900 }), error => error.category === 'transport' && /502/.test(error.message));
    assert.equal(service.calls.length, 1);
});
