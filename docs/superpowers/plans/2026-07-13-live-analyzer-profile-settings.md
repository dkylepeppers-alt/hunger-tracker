# Live Analyzer Profile Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every analyzer request use the bound Connection Manager profile's current model while exposing safe analyzer-specific generation controls and verifiable effective-model diagnostics.

**Architecture:** Connection Manager remains the only owner of provider and model data. The tracker stores only the bound profile ID and analyzer-specific options, resolves both immediately before each queued request, uses SillyTavern's reactive profile selector, and records the effective model/options on every terminal analysis record.

**Tech Stack:** Browser ES modules, SillyTavern `ConnectionManagerRequestService`, native DOM/jQuery used by SillyTavern settings panels, Node.js built-in test runner, JSON extension settings.

## Global Constraints

- Keep the analyzer bound to an explicit analyzer profile; do not follow the globally active roleplay profile.
- Store no provider model string, credentials, URL, proxy, or API key in tracker settings.
- Default maximum output tokens to `1000`, allow integers from `100` through `16384`.
- Default temperature to `0`, allow finite numbers from `0` through `2` when preset inheritance is off.
- Default **Use connection profile preset** to off.
- Always force non-streaming output, the analyzer JSON schema, no tools, and disabled web search.
- Always exclude instruct templates.
- Make exactly one provider request per analysis job; add no retry, fallback, or automatic reanalysis.
- Configuration changes affect the next job to begin, including queued jobs that have not started; in-flight requests continue unchanged.
- Preserve all succubus profiles, rules, chat metadata, completed records, and failed records during migration.

---

## File Map

- `src/settings.js`: owns settings version 7, defaults, and migration.
- `src/analyzer-transport.js`: validates analyzer request options, resolves the live profile, constructs the isolated payload, and returns effective diagnostics.
- `src/ui.js`: owns the reactive analyzer profile selector, advanced analyzer controls, and Activity diagnostics.
- `settings.html`: declares the advanced analyzer controls.
- `index.js`: reads live configuration at job execution time and persists effective diagnostics.
- `tests/profiles.test.js`: covers settings migration and preservation.
- `tests/analyzer-transport.test.js`: covers request-time model resolution, analyzer options, isolation, validation, and diagnostics.
- `tests/architecture.test.js`: guards the reactive UI/controller wiring and required settings controls.
- `README.md`: documents how model and preset changes flow into analyzer calls.
- `manifest.json` and `package.json`: release version `5.3.0`.

---

### Task 1: Settings version 7 and analyzer defaults

**Files:**
- Modify: `tests/profiles.test.js:5,53-58`
- Modify: `src/settings.js:3-44`

**Interfaces:**
- Produces: `SETTINGS_VERSION === 7`.
- Produces: `ANALYZER_DEFAULTS` with `analyzerMaxTokens`, `analyzerTemperature`, and `analyzerUseProfilePreset`.
- Produces: `migrateSettings(settings)` that preserves `analyzerProfileId` while adding missing analyzer controls.

- [ ] **Step 1: Write failing migration tests**

Change the settings import and replace the existing v6 migration test in `tests/profiles.test.js` with:

```js
import { ANALYZER_DEFAULTS, migrateProfilesToV5, migrateSettings, SETTINGS_VERSION } from '../src/settings.js';

test('migrates legacy settings through analyzer settings version 7', () => {
    const settings = { settingsVersion: 5, profiles: [] };
    migrateSettings(settings);
    assert.equal(SETTINGS_VERSION, 7);
    assert.equal(settings.settingsVersion, 7);
    assert.equal(settings.analyzerProfileId, '');
    assert.equal(settings.analyzerMaxTokens, ANALYZER_DEFAULTS.analyzerMaxTokens);
    assert.equal(settings.analyzerTemperature, ANALYZER_DEFAULTS.analyzerTemperature);
    assert.equal(settings.analyzerUseProfilePreset, ANALYZER_DEFAULTS.analyzerUseProfilePreset);
});

test('v7 migration preserves the bound analyzer profile and existing tracker data', () => {
    const profiles = [{ id: 'succubus-1', rules: { initial: { hunger: 12 } } }];
    const settings = { settingsVersion: 6, analyzerProfileId: 'analyzer-1', profiles };
    migrateSettings(settings);
    assert.equal(settings.settingsVersion, 7);
    assert.equal(settings.analyzerProfileId, 'analyzer-1');
    assert.equal(settings.profiles, profiles);
    assert.deepEqual(settings.profiles[0].rules, { initial: { hunger: 12 } });
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
node --test tests/profiles.test.js
```

Expected: FAIL because `ANALYZER_DEFAULTS` is not exported and `SETTINGS_VERSION` is still `6`.

- [ ] **Step 3: Implement settings version 7**

In `src/settings.js`, replace the module/version declarations and `migrateSettings` with:

```js
export const MODULE = 'succubus_state_tracker';
export const SETTINGS_VERSION = 7;
export const ANALYZER_DEFAULTS = Object.freeze({
    analyzerMaxTokens: 1000,
    analyzerTemperature: 0,
    analyzerUseProfilePreset: false,
});

export function migrateSettings(settings) {
    migrateProfilesToV5(settings);
    if ((settings.settingsVersion ?? 0) < 6) {
        settings.analyzerProfileId ??= '';
        settings.settingsVersion = 6;
    }
    if ((settings.settingsVersion ?? 0) < 7) {
        for (const [key, value] of Object.entries(ANALYZER_DEFAULTS)) settings[key] ??= value;
        settings.settingsVersion = 7;
    }
    return settings;
}
```

Add the analyzer defaults to `DEFAULTS` immediately after `analyzerProfileId`:

```js
const DEFAULTS = Object.freeze({
    settingsVersion: SETTINGS_VERSION,
    analyzerProfileId: '',
    ...ANALYZER_DEFAULTS,
    enabled: true,
```

- [ ] **Step 4: Run the focused test and verify GREEN**

Run:

```bash
node --test tests/profiles.test.js
```

Expected: all profile/settings tests PASS with no warnings.

- [ ] **Step 5: Commit the migration**

```bash
git add src/settings.js tests/profiles.test.js
git commit -m "feat: add analyzer generation settings"
```

---

### Task 2: Live model resolution and transport options

**Files:**
- Modify: `tests/analyzer-transport.test.js:6-67`
- Modify: `src/analyzer-transport.js:1-67`

**Interfaces:**
- Consumes: `profileId`, `responseLength`, `temperature`, and `useProfilePreset` supplied at request start.
- Produces: `analyzeWithProfile({ service, profileId, prompt, jsonSchema, responseLength, temperature, useProfilePreset })`.
- Produces: successful transport diagnostics `{ profileId, profileName, model, presetName, useProfilePreset, maxTokens, temperature, content, reasoning, finishReason }`.
- Produces: `AnalyzerTransportError` carrying the same non-content configuration diagnostics when available.

- [ ] **Step 1: Refactor the fake service and write failing live-model tests**

Replace the shared profile and `fakeService` setup at the top of `tests/analyzer-transport.test.js` with:

```js
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
```

Update the isolated-request test to assert the full effective configuration:

```js
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
```

Add these tests below it:

```js
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
    ]) {
        const service = fakeService();
        await assert.rejects(
            () => analyzeWithProfile({ service, profileId: service.profile.id, prompt, jsonSchema, ...options }),
            error => error instanceof AnalyzerTransportError && error.category === 'configuration',
        );
        assert.equal(service.calls.length, 0);
    }
});
```

Replace the remaining profile/error tests with these complete versions:

```js
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
```

- [ ] **Step 2: Run transport tests and verify RED**

Run:

```bash
node --test tests/analyzer-transport.test.js
```

Expected: FAIL because the payload has no explicit model, preset inheritance is unsupported, invalid options are accepted, and diagnostics omit effective configuration.

- [ ] **Step 3: Expand transport diagnostics and validation**

Replace the error class constructor and `configurationError` in `src/analyzer-transport.js` with:

```js
export class AnalyzerTransportError extends Error {
    constructor(message, {
        category = 'transport', profileId = '', profileName = '', model = '', presetName = '',
        useProfilePreset = false, maxTokens = null, temperature = null,
        content = '', reasoning = '', finishReason = '',
    } = {}) {
        super(message);
        this.name = 'AnalyzerTransportError';
        Object.assign(this, {
            category, profileId, profileName, model, presetName,
            useProfilePreset, maxTokens, temperature,
            content, reasoning, finishReason,
        });
    }
}

function configurationError(message, diagnostics = {}) {
    return new AnalyzerTransportError(message, { ...diagnostics, category: 'configuration' });
}

function validateAnalyzerOptions({ responseLength, temperature, useProfilePreset }, profileId) {
    const diagnostics = {
        profileId,
        useProfilePreset: Boolean(useProfilePreset),
        maxTokens: responseLength,
        temperature: useProfilePreset ? null : temperature,
    };
    if (!Number.isInteger(responseLength) || responseLength < 100 || responseLength > 16384) {
        throw configurationError('Analyzer maximum output tokens must be an integer between 100 and 16384.', diagnostics);
    }
    if (!useProfilePreset && (!Number.isFinite(temperature) || temperature < 0 || temperature > 2)) {
        throw configurationError('Analyzer temperature must be between 0 and 2.', diagnostics);
    }
}
```

- [ ] **Step 4: Implement live profile payload construction**

Replace `analyzeWithProfile` with:

```js
export async function analyzeWithProfile({
    service, profileId, prompt, jsonSchema,
    responseLength = 1000, temperature = 0, useProfilePreset = false,
}) {
    validateAnalyzerOptions({ responseLength, temperature, useProfilePreset }, profileId);
    if (!profileId) throw configurationError('Select an Analyzer Connection Profile first.', { maxTokens: responseLength, temperature: useProfilePreset ? null : temperature, useProfilePreset });

    let profile;
    try {
        profile = service.getSupportedProfiles().find(item => item.id === profileId);
    } catch (error) {
        throw configurationError(`Analyzer Connection Profile is unavailable: ${error.message}`, { profileId, maxTokens: responseLength, temperature: useProfilePreset ? null : temperature, useProfilePreset });
    }
    if (!profile) throw configurationError('Selected Analyzer Connection Profile is unavailable.', { profileId, maxTokens: responseLength, temperature: useProfilePreset ? null : temperature, useProfilePreset });

    const diagnostics = {
        profileId,
        profileName: String(profile.name ?? ''),
        model: String(profile.model ?? ''),
        presetName: useProfilePreset ? String(profile.preset ?? '') : '',
        useProfilePreset: Boolean(useProfilePreset),
        maxTokens: responseLength,
        temperature: useProfilePreset ? null : temperature,
    };
    const overridePayload = {
        enable_web_search: false,
        tools: [],
        tool_choice: undefined,
        custom_prompt_post_processing: '',
        model: profile.model,
        json_schema: jsonSchema,
    };
    if (!useProfilePreset) overridePayload.temperature = temperature;

    try {
        const raw = await service.sendRequest(
            profileId,
            prompt,
            responseLength,
            { stream: false, extractData: false, includePreset: useProfilePreset, includeInstruct: false },
            overridePayload,
        );
        const choice = raw?.choices?.[0] ?? {};
        const content = textContent(choice.message?.content);
        const reasoning = textContent(choice.message?.reasoning ?? choice.message?.reasoning_content);
        const finishReason = String(choice.finish_reason ?? '');
        const result = { ...diagnostics, content, reasoning, finishReason };
        if (finishReason === 'length') throw new AnalyzerTransportError('Analyzer response was truncated', { ...result, category: 'truncated' });
        if (!content.trim()) throw new AnalyzerTransportError('Analyzer returned empty content', { ...result, category: 'empty' });
        return result;
    } catch (error) {
        if (error instanceof AnalyzerTransportError) throw error;
        throw new AnalyzerTransportError(`Analyzer request failed: ${error.message}`, { ...diagnostics, category: 'transport' });
    }
}
```

- [ ] **Step 5: Run transport tests and verify GREEN**

Run:

```bash
node --test tests/analyzer-transport.test.js
```

Expected: all transport tests PASS; each test records at most one `sendRequest` call.

- [ ] **Step 6: Commit the transport behavior**

```bash
git add src/analyzer-transport.js tests/analyzer-transport.test.js
git commit -m "feat: resolve live analyzer profile model"
```

---

### Task 3: Reactive controls, request-time controller settings, and diagnostics

**Files:**
- Modify: `tests/architecture.test.js:17-35`
- Modify: `settings.html:14-17`
- Modify: `src/ui.js:56-82,179-207`
- Modify: `index.js:71-142`

**Interfaces:**
- Consumes: settings version 7 fields and the expanded transport result from Tasks 1 and 2.
- Produces: a profile selector registered through `connectionService.handleDropdown(selector, initialId, onChange, onCreate, onUpdate, onDelete)`.
- Produces: DOM controls `#sst-analyzer-max-tokens`, `#sst-analyzer-temperature`, and `#sst-analyzer-use-preset`.
- Produces: terminal record fields `analyzerModel`, `analyzerPresetName`, `analyzerUseProfilePreset`, `analyzerMaxTokens`, and `analyzerTemperature`.

- [ ] **Step 1: Write failing architecture tests**

Extend `tests/architecture.test.js` with:

```js
test('analyzer settings react to Connection Manager updates and expose safe overrides', () => {
    assert.match(ui, /connectionService\.handleDropdown\s*\(/);
    assert.doesNotMatch(ui, /let analyzerProfiles\s*=\s*\[\]/);
    assert.match(settingsTemplate, /id="sst-analyzer-max-tokens"/);
    assert.match(settingsTemplate, /id="sst-analyzer-temperature"/);
    assert.match(settingsTemplate, /id="sst-analyzer-use-preset"/);
    assert.match(ui, /profile\.model/);
    assert.match(ui, /profile\.preset/);
    assert.match(ui, /renderAnalyzerStatus\(newProfile\)/);
    assert.match(ui, /selectAnalyzerProfile\(undefined\)/);
});

test('controller resolves analyzer configuration when a queued job starts', () => {
    assert.match(entry, /const analyzerSettings\s*=\s*getSettings\(\)/);
    assert.match(entry, /analyzerMaxTokens/);
    assert.match(entry, /analyzerTemperature/);
    assert.match(entry, /analyzerUseProfilePreset/);
    assert.doesNotMatch(entry, /analyzerProfileId:\s*settings\.analyzerProfileId/);
    assert.match(entry, /analyzerModel/);
    assert.match(entry, /analyzerPresetName/);
});
```

- [ ] **Step 2: Run architecture tests and verify RED**

Run:

```bash
node --test tests/architecture.test.js
```

Expected: FAIL because the UI uses a static profile array, advanced controls are absent, and jobs capture `analyzerProfileId` when enqueued.

- [ ] **Step 3: Add advanced analyzer controls to the template**

In `settings.html`, insert this block after `#sst-analyzer-profile-status` and before the first `<hr>`:

```html
            <div class="inline-drawer">
                <div class="inline-drawer-toggle inline-drawer-header">
                    <b>Advanced analyzer settings</b>
                    <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
                </div>
                <div class="inline-drawer-content">
                    <label for="sst-analyzer-max-tokens">Maximum output tokens</label>
                    <input id="sst-analyzer-max-tokens" class="text_pole" type="number" min="100" max="16384" step="1">
                    <label for="sst-analyzer-temperature">Temperature</label>
                    <input id="sst-analyzer-temperature" class="text_pole" type="number" min="0" max="2" step="0.05">
                    <label class="checkbox_label"><input id="sst-analyzer-use-preset" type="checkbox"> Use connection profile preset</label>
                    <small>Preset inheritance uses the bound profile's sampler settings. Structured JSON, non-streaming output, disabled web search, and no tools remain enforced.</small>
                </div>
            </div>
```

- [ ] **Step 4: Replace the static analyzer selector with the reactive API**

In `src/ui.js`, replace lines 188-206 with:

```js
    const analyzerProfileStatus = document.getElementById('sst-analyzer-profile-status');
    const analyzerMaxTokens = document.getElementById('sst-analyzer-max-tokens');
    const analyzerTemperature = document.getElementById('sst-analyzer-temperature');
    const analyzerUsePreset = document.getElementById('sst-analyzer-use-preset');

    const findAnalyzerProfile = () => connectionService.getSupportedProfiles().find(profile => profile.id === settings.analyzerProfileId);
    const renderAnalyzerStatus = profile => {
        if (!profile) {
            analyzerProfileStatus.textContent = settings.analyzerProfileId ? 'Selected profile is unavailable.' : 'Select a profile before analyzing chat state.';
            return;
        }
        const model = profile.model || 'provider default';
        const preset = settings.analyzerUseProfilePreset ? (profile.preset || 'provider defaults') : 'isolated analyzer settings';
        analyzerProfileStatus.textContent = `Current model: ${model} · Preset: ${preset}`;
    };
    const selectAnalyzerProfile = profile => {
        settings.analyzerProfileId = profile?.id ?? '';
        renderAnalyzerStatus(profile);
        saveSettings();
        onChanged();
    };
    try {
        if (!connectionService?.handleDropdown) throw new Error('Connection Manager profile controls are unavailable.');
        connectionService.handleDropdown(
            '#sst-analyzer-profile',
            settings.analyzerProfileId,
            selectAnalyzerProfile,
            () => {},
            (oldProfile, newProfile) => {
                if (settings.analyzerProfileId === oldProfile.id) renderAnalyzerStatus(newProfile);
            },
            profile => {
                if (settings.analyzerProfileId === profile.id) selectAnalyzerProfile(undefined);
            },
        );
        renderAnalyzerStatus(findAnalyzerProfile());
    } catch (error) {
        analyzerProfileStatus.textContent = `Connection Manager unavailable: ${error.message}`;
    }
```

This uses the standard API's profile-created, profile-updated, and profile-deleted subscriptions. The update callback refreshes the visible model immediately; the API's subsequent change event keeps the bound ID persisted.

- [ ] **Step 5: Bind and validate advanced controls**

Immediately after the reactive profile block in `src/ui.js`, add:

```js
    analyzerMaxTokens.value = settings.analyzerMaxTokens;
    analyzerTemperature.value = settings.analyzerTemperature;
    analyzerUsePreset.checked = settings.analyzerUseProfilePreset;
    const renderAnalyzerOptionState = () => {
        analyzerTemperature.disabled = analyzerUsePreset.checked;
        try {
            renderAnalyzerStatus(findAnalyzerProfile());
        } catch {
            renderAnalyzerStatus(undefined);
        }
    };
    analyzerMaxTokens.addEventListener('change', () => {
        const value = Number(analyzerMaxTokens.value);
        if (!Number.isInteger(value) || value < 100 || value > 16384) {
            analyzerMaxTokens.value = settings.analyzerMaxTokens;
            return toastr.error('Analyzer maximum output tokens must be an integer between 100 and 16384.');
        }
        settings.analyzerMaxTokens = value;
        saveSettings();
        onChanged();
    });
    analyzerTemperature.addEventListener('change', () => {
        const value = Number(analyzerTemperature.value);
        if (!Number.isFinite(value) || value < 0 || value > 2) {
            analyzerTemperature.value = settings.analyzerTemperature;
            return toastr.error('Analyzer temperature must be between 0 and 2.');
        }
        settings.analyzerTemperature = value;
        saveSettings();
        onChanged();
    });
    analyzerUsePreset.addEventListener('change', () => {
        settings.analyzerUseProfilePreset = analyzerUsePreset.checked;
        renderAnalyzerOptionState();
        saveSettings();
        onChanged();
    });
    renderAnalyzerOptionState();
```

- [ ] **Step 6: Resolve settings when each queued job starts**

In `index.js`, add `let analyzerSettings;` next to `raw`, `transport`, and `stage`, then replace the transport call in `processAnalysisJob` with:

```js
        const request = buildAnalyzerRequest(job);
        analyzerSettings = getSettings();
        transport = await analyzeWithProfile({
            service: ctx.ConnectionManagerRequestService,
            profileId: analyzerSettings.analyzerProfileId,
            prompt: request.prompt,
            jsonSchema: request.jsonSchema,
            responseLength: analyzerSettings.analyzerMaxTokens,
            temperature: analyzerSettings.analyzerTemperature,
            useProfilePreset: analyzerSettings.analyzerUseProfilePreset,
        });
```

Replace the complete-record assignment with:

```js
        job.metadata.records[job.key] = {
            status: 'complete', fingerprint: job.key, messageIndex: job.messageIndex, swipeId: job.swipeId,
            analyzerVersion: ANALYZER_VERSION,
            analyzerProfileId: transport.profileId,
            analyzerProfileName: transport.profileName,
            analyzerModel: transport.model,
            analyzerPresetName: transport.presetName,
            analyzerUseProfilePreset: transport.useProfilePreset,
            analyzerMaxTokens: transport.maxTokens,
            analyzerTemperature: transport.temperature,
            analyzedAt: new Date().toISOString(), classifications: result.events, events,
        };
```

Extend the failed record's `error` object after `profileName` with:

```js
                    model: error.model ?? transport?.model ?? '',
                    presetName: error.presetName ?? transport?.presetName ?? '',
                    useProfilePreset: error.useProfilePreset ?? transport?.useProfilePreset ?? analyzerSettings?.analyzerUseProfilePreset ?? false,
                    maxTokens: error.maxTokens ?? transport?.maxTokens ?? analyzerSettings?.analyzerMaxTokens ?? null,
                    temperature: error.temperature ?? transport?.temperature ?? (analyzerSettings?.analyzerUseProfilePreset ? null : analyzerSettings?.analyzerTemperature ?? null),
```

Change the failed record's profile fallback to:

```js
                    profileId: error.profileId ?? transport?.profileId ?? analyzerSettings?.analyzerProfileId ?? '',
```

Finally, remove the copied analyzer profile from queued jobs by replacing the enqueue object with:

```js
    return analysisQueue.enqueue({ key, chatId: String(ctx.chatId ?? ''), messageIndex, swipeId, roster, metadata, userText: precedingUserText(ctx.chat, messageIndex), assistantText });
```

- [ ] **Step 7: Display effective configuration in Activity diagnostics**

In `src/ui.js`, replace the complete `activityRows` function with:

```js
function activityRows(state) {
    return (state.activity ?? []).map(source => {
        const record = source.record;
        const message = record?.error?.message ?? record?.classifications?.map(item => item.note).join('; ') ?? '—';
        const error = record?.error;
        const model = record?.analyzerModel ?? error?.model;
        const presetName = record?.analyzerPresetName ?? error?.presetName;
        const maxTokens = record?.analyzerMaxTokens ?? error?.maxTokens;
        const temperature = record?.analyzerTemperature ?? error?.temperature;
        const diagnostic = [
            message,
            model && `Model: ${model}`,
            presetName && `Preset: ${presetName}`,
            maxTokens != null && `Maximum output tokens: ${maxTokens}`,
            temperature != null && `Temperature: ${temperature}`,
            error?.category && `Category: ${error.category}`,
            error?.profileName && `Profile: ${error.profileName}`,
            error?.finishReason && `Finish reason: ${error.finishReason}`,
            error?.preview && `Raw response: ${error.preview}`,
            error?.reasoningPreview && `Reasoning: ${error.reasoningPreview}`,
        ].filter(Boolean).join('\n');
        return `<tr class="sst-${source.status}"><td>${source.messageIndex}</td><td>${esc(source.status)}</td><td><pre>${esc(diagnostic)}</pre></td><td>${source.status === 'failed' ? `<button class="menu_button sst-retry-row" data-message-index="${source.messageIndex}" type="button">Retry</button>` : '—'}</td></tr>`;
    }).join('') || '<tr><td colspan="4">No messages require analysis.</td></tr>';
}
```

- [ ] **Step 8: Run focused tests and verify GREEN**

Run:

```bash
node --test tests/architecture.test.js tests/profiles.test.js tests/analyzer-transport.test.js
```

Expected: all focused tests PASS. The architecture test confirms no static `analyzerProfiles` snapshot or enqueue-time profile capture remains.

- [ ] **Step 9: Run syntax checks**

Run:

```bash
npm run check
```

Expected: `node --check` succeeds for `index.js` and every file in `src/`.

- [ ] **Step 10: Commit reactive UI and controller integration**

```bash
git add index.js settings.html src/ui.js tests/architecture.test.js
git commit -m "feat: react to analyzer profile updates"
```

---

### Task 4: Documentation, release metadata, and complete verification

**Files:**
- Modify: `README.md:7-20`
- Modify: `manifest.json:6`
- Modify: `package.json:3`

**Interfaces:**
- Consumes: the complete live-profile behavior from Tasks 1 through 3.
- Produces: documented user workflow and extension version `5.3.0`.

- [ ] **Step 1: Document analyzer configuration**

Insert this section in `README.md` between Installation and Development:

```md
## Analyzer configuration

Select a dedicated **Analyzer Connection Profile** in the extension settings. The tracker resolves that bound profile when each queued analysis begins, so changing the profile's model in Connection Manager changes the next analyzer request without reselecting it.

The status below the selector shows the current effective model and preset. **Advanced analyzer settings** controls maximum output tokens, deterministic temperature, and optional connection-preset inheritance. Preset inheritance never enables streaming, web search, tools, or instruct formatting for analyzer requests.

Model or settings changes affect future requests and manual retries. Existing completed analysis records are not silently reanalyzed.
```

- [ ] **Step 2: Bump extension metadata to 5.3.0**

Change `package.json` to:

```json
  "version": "5.3.0",
```

Change `manifest.json` to:

```json
  "version": "5.3.0",
```

Preserve every other manifest and package field.

- [ ] **Step 3: Run the full extension test suite**

Run:

```bash
npm test
```

Expected: every `tests/*.test.js` test PASS with zero failures.

- [ ] **Step 4: Run final syntax checks**

Run:

```bash
npm run check
```

Expected: all JavaScript syntax checks PASS.

- [ ] **Step 5: Check formatting and scope**

Run:

```bash
git diff --check
git status --short
```

Expected: `git diff --check` prints nothing. Status lists only `README.md`, `manifest.json`, and `package.json` before the release commit.

- [ ] **Step 6: Commit the release metadata and documentation**

```bash
git add README.md manifest.json package.json
git commit -m "chore: release live analyzer settings 5.3.0"
```

- [ ] **Step 7: Verify the committed repository**

Run:

```bash
npm test
npm run check
git status --short
git log -5 --oneline
```

Expected: all tests and checks PASS, `git status --short` is empty, and the latest commits are the release, reactive UI/controller, live transport, settings migration, and approved design/plan history.
