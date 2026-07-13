import test from 'node:test';
import assert from 'node:assert/strict';

import { AnalyzerTransportError, analyzeWithProfile } from '../src/analyzer-transport.js';

const DEFAULT_RAW = { choices: [{ message: { content: '{"events":[]}', reasoning: 'brief' }, finish_reason: 'stop' }] };
const jsonSchema = { name: 'events', value: { type: 'object' } };
const prompt = [{ role: 'system', content: 'classify' }, { role: 'user', content: 'scene' }];

function fakeService(raw = DEFAULT_RAW, selectedProfile = { id: 'profile-1', name: 'Analyzer', api: 'nanogpt', model: 'model-a', preset: 'Analyzer Preset' }) {
    const calls = [];
    return {
        calls,
        profile: selectedProfile,
        getSupportedProfiles: () => [selectedProfile],
        getProfile: id => id === selectedProfile.id ? selectedProfile : null,
        sendRequest: async (...args) => { calls.push(args); return raw; },
    };
}

test('sends one isolated raw request with explicit live model diagnostics', async () => {
    const service = fakeService();
    const result = await analyzeWithProfile({
        service,
        profileId: service.profile.id,
        prompt,
        jsonSchema,
        responseLength: 900,
        temperature: 0.25,
        useProfilePreset: false,
    });
    assert.equal(service.calls.length, 1);
    const [calledProfile, calledPrompt, maxTokens, custom, overridePayload] = service.calls[0];
    assert.equal(calledProfile, service.profile.id);
    assert.equal(calledPrompt, prompt);
    assert.equal(maxTokens, 900);
    assert.deepEqual(custom, { stream: false, extractData: false, includePreset: false, includeInstruct: false });
    assert.equal(overridePayload.model, 'model-a');
    assert.equal(overridePayload.enable_web_search, false);
    assert.deepEqual(overridePayload.tools, []);
    assert.equal(overridePayload.custom_prompt_post_processing, '');
    assert.equal(overridePayload.temperature, 0.25);
    assert.equal(overridePayload.json_schema, jsonSchema);
    assert.deepEqual(result, {
        content: '{"events":[]}', reasoning: 'brief', finishReason: 'stop',
        profileId: service.profile.id, profileName: service.profile.name,
        model: 'model-a', presetName: '', useProfilePreset: false,
        maxTokens: 900, temperature: 0.25,
    });
});

test('uses isolated analyzer defaults when advanced options are omitted', async () => {
    const service = fakeService();
    const result = await analyzeWithProfile({ service, profileId: service.profile.id, prompt, jsonSchema });
    const [, , maxTokens, custom, overridePayload] = service.calls[0];
    assert.equal(maxTokens, 1000);
    assert.equal(custom.includePreset, false);
    assert.equal(custom.includeInstruct, false);
    assert.equal(overridePayload.temperature, 0);
    assert.equal(result.maxTokens, 1000);
    assert.equal(result.temperature, 0);
    assert.equal(result.presetName, '');
});

test('resolves the bound profile model again for every request', async () => {
    const selectedProfile = { id: 'profile-1', name: 'Analyzer', api: 'nanogpt', model: 'model-a', preset: 'Preset A' };
    const service = fakeService(DEFAULT_RAW, selectedProfile);
    await analyzeWithProfile({ service, profileId: selectedProfile.id, prompt, jsonSchema, responseLength: 1000, temperature: 0, useProfilePreset: false });
    selectedProfile.model = 'model-b';
    selectedProfile.preset = 'Preset B';
    const result = await analyzeWithProfile({ service, profileId: selectedProfile.id, prompt, jsonSchema, responseLength: 1000, temperature: 0, useProfilePreset: false });
    assert.equal(service.calls[0][4].model, 'model-a');
    assert.equal(service.calls[1][4].model, 'model-b');
    assert.equal(result.model, 'model-b');
    assert.equal(result.profileId, selectedProfile.id);
});

test('inherits the current profile preset without overriding its temperature', async () => {
    const service = fakeService();
    const result = await analyzeWithProfile({ service, profileId: service.profile.id, prompt, jsonSchema, responseLength: 1200, temperature: 1.5, useProfilePreset: true });
    const [, , maxTokens, custom, overridePayload] = service.calls[0];
    assert.equal(maxTokens, 1200);
    assert.equal(custom.includePreset, true);
    assert.equal(custom.includeInstruct, false);
    assert.equal(Object.hasOwn(overridePayload, 'temperature'), false);
    assert.equal(result.presetName, 'Analyzer Preset');
    assert.equal(result.useProfilePreset, true);
    assert.equal(result.temperature, null);
});

test('rejects invalid analyzer options before making a provider request', async () => {
    for (const options of [
        { responseLength: 99, temperature: 0, useProfilePreset: false },
        { responseLength: 16385, temperature: 0, useProfilePreset: false },
        { responseLength: 1000.5, temperature: 0, useProfilePreset: false },
        { responseLength: 1000, temperature: -0.1, useProfilePreset: false },
        { responseLength: 1000, temperature: 2.1, useProfilePreset: false },
        { responseLength: 1000, temperature: 0, useProfilePreset: 'false' },
        { responseLength: 1000, temperature: 0, useProfilePreset: null },
    ]) {
        const service = fakeService();
        await assert.rejects(
            () => analyzeWithProfile({ service, profileId: service.profile.id, prompt, jsonSchema, ...options }),
            error => error instanceof AnalyzerTransportError && error.category === 'configuration',
        );
        assert.equal(service.calls.length, 0);
    }
});

test('rejects missing and unsupported profiles without making a request', async () => {
    const service = fakeService();
    await assert.rejects(
        () => analyzeWithProfile({ service, profileId: '', prompt, jsonSchema, responseLength: 900 }),
        error => error instanceof AnalyzerTransportError && error.category === 'configuration',
    );
    await assert.rejects(
        () => analyzeWithProfile({ service, profileId: 'deleted', prompt, jsonSchema, responseLength: 900 }),
        error => error instanceof AnalyzerTransportError && error.category === 'configuration',
    );
    assert.equal(service.calls.length, 0);
});

test('preserves empty and truncated response diagnostics without retrying', async () => {
    for (const [raw, category] of [
        [{ choices: [{ message: { content: '', reasoning: 'thinking only' }, finish_reason: 'stop' }] }, 'empty'],
        [{ choices: [{ message: { content: '{"events":', reasoning: 'too long' }, finish_reason: 'length' }] }, 'truncated'],
    ]) {
        const service = fakeService(raw);
        await assert.rejects(
            () => analyzeWithProfile({ service, profileId: service.profile.id, prompt, jsonSchema, responseLength: 900 }),
            error => {
                assert.equal(error.category, category);
                assert.equal(error.profileId, service.profile.id);
                assert.equal(error.profileName, service.profile.name);
                assert.equal(error.model, service.profile.model);
                assert.equal(error.reasoning, raw.choices[0].message.reasoning);
                assert.equal(error.finishReason, raw.choices[0].finish_reason);
                return true;
            },
        );
        assert.equal(service.calls.length, 1);
    }
});

test('wraps a provider exception after exactly one request', async () => {
    const service = fakeService();
    service.sendRequest = async (...args) => { service.calls.push(args); throw new Error('upstream 502'); };
    await assert.rejects(
        () => analyzeWithProfile({ service, profileId: service.profile.id, prompt, jsonSchema, responseLength: 900 }),
        error => error.category === 'transport' && error.model === service.profile.model && /502/.test(error.message),
    );
    assert.equal(service.calls.length, 1);
});
