# Isolated Analyzer Profile Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace inherited `generateRaw` analysis with one isolated request through a user-selected SillyTavern Connection Manager profile.

**Architecture:** A focused transport module resolves the configured connection profile, sends one non-streaming raw request with explicit isolation overrides, and returns content plus diagnostics. The existing analyzer module parses and validates canonical or documented alias JSON, while the controller persists one terminal record and never retries automatically.

**Tech Stack:** Browser ES modules, SillyTavern `ConnectionManagerRequestService`, Node.js built-in test runner, HTML/CSS using native SillyTavern classes.

## Global Constraints

- Make exactly one provider request per queued analysis job.
- Never mutate the active roleplay connection or global chat-completion settings.
- Disable presets, instruct templates, streaming, web search, tools, and prompt post-processing for analysis.
- Do not automatically retry, select a fallback profile, or infer events locally after failure.
- Preserve existing completed records, baselines, hunger, exposure, soul state, and manual events.
- Treat empty, truncated, malformed, or semantically invalid output as a visible terminal failure.

---

## File Structure

- Create `src/analyzer-transport.js`: profile resolution, isolated Connection Manager request, raw response extraction, and typed transport errors.
- Create `tests/analyzer-transport.test.js`: request-boundary and diagnostic tests using a fake request service.
- Modify `src/analyzer.js`: fenced JSON parsing and documented alias normalization.
- Modify `tests/analyzer.test.js`: parser acceptance and rejection cases.
- Modify `src/settings.js`: settings version 6 and `analyzerProfileId` migration.
- Modify `tests/profiles.test.js`: migration coverage.
- Modify `settings.html`: analyzer profile selector and configuration status.
- Modify `src/ui.js`: populate and persist supported profiles.
- Modify `index.js`: use the transport, block unconfigured analysis, and persist richer diagnostics.
- Modify `tests/architecture.test.js`: enforce Connection Manager usage and absence of `generateRaw`.
- Modify `manifest.json` and `package.json`: release version bump.

### Task 1: Strict Parser With Documented Compatibility

**Files:**
- Modify: `src/analyzer.js`
- Modify: `tests/analyzer.test.js`

**Interfaces:**
- Consumes: analyzer output as `string | object`.
- Produces: `parseAnalyzerResult(value): { events: CanonicalAnalyzerEvent[] }`.
- Produces: `normalizeAnalyzerEvent(value): CanonicalAnalyzerEvent`, accepting only the documented camelCase fields and snake_case aliases.

- [ ] **Step 1: Write failing parser tests**

Add tests proving that a single complete `json` fence is accepted, snake_case aliases map to canonical fields, and prose outside a fence or missing classifications is rejected:

```js
test('accepts one complete JSON fence and documented aliases', () => {
    const parsed = parseAnalyzerResult('```json\n{"events":[{"succubus_id":"character:lilith.png","elapsed_hours":1,"hunger_pressure":"strain_light","exposure":"none","feeding_intensity":"none","target_id":"","note":"Time passes"}]}\n```');
    assert.deepEqual(parsed.events[0], {
        succubusId: 'character:lilith.png', elapsedHours: 1,
        hungerPressure: 'strain_light', exposure: 'none',
        feedingIntensity: 'none', targetId: '', note: 'Time passes',
    });
});

test('rejects prose wrappers and incomplete alias objects', () => {
    assert.throws(() => parseAnalyzerResult('Result: {"events":[]}'), /pure JSON/i);
    assert.throws(() => parseAnalyzerResult('```json\n{"events":[{"succubus_id":"x"}]}\n```'), /missing/i);
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --test tests/analyzer.test.js`

Expected: FAIL because fenced JSON and alias normalization are not implemented.

- [ ] **Step 3: Implement strict fence extraction and alias normalization**

Add a fence extractor that accepts only `^```(?:json)?\s*([\s\S]*?)\s*```$`, parse the resulting JSON, and normalize these exact aliases:

```js
const EVENT_ALIASES = {
    succubusId: ['succubusId', 'succubus_id'],
    elapsedHours: ['elapsedHours', 'elapsed_hours', 'elapsed_narrative_hours'],
    hungerPressure: ['hungerPressure', 'hunger_pressure'],
    exposure: ['exposure'],
    feedingIntensity: ['feedingIntensity', 'feeding_intensity'],
    targetId: ['targetId', 'target_id'],
    note: ['note', 'notes'],
};
```

Require all seven canonical values after normalization. Do not translate booleans, event-type prose, display names, or missing classifications.

- [ ] **Step 4: Run focused and full tests**

Run: `node --test tests/analyzer.test.js && npm test`

Expected: all analyzer tests and the full suite pass.

- [ ] **Step 5: Commit the parser boundary**

```bash
git add src/analyzer.js tests/analyzer.test.js
git commit -m "fix: validate canonical and fenced analyzer JSON"
```

### Task 2: Isolated Connection Manager Transport

**Files:**
- Create: `src/analyzer-transport.js`
- Create: `tests/analyzer-transport.test.js`

**Interfaces:**
- Produces: `AnalyzerTransportError extends Error` with `category`, `profileId`, `profileName`, `content`, `reasoning`, and `finishReason`.
- Produces: `analyzeWithProfile({ service, profileId, prompt, jsonSchema, responseLength }): Promise<{ content, reasoning, finishReason, profileId, profileName }>`.
- The `service` dependency implements `getSupportedProfiles()`, `getProfile(id)`, and `sendRequest(profileId, prompt, maxTokens, custom, overridePayload)`.

- [ ] **Step 1: Write failing transport tests**

Use a fake service that records calls and returns a raw OpenAI-compatible response. Assert one call and exact isolation options:

```js
assert.deepEqual(call.custom, {
    stream: false, extractData: false, includePreset: false, includeInstruct: false,
});
assert.equal(call.overridePayload.enable_web_search, false);
assert.deepEqual(call.overridePayload.tools, []);
assert.equal(call.overridePayload.custom_prompt_post_processing, '');
assert.equal(call.overridePayload.temperature, 0);
assert.equal(call.overridePayload.json_schema, jsonSchema);
```

Add cases for missing profile, unsupported profile, empty content with reasoning, `finish_reason: 'length'`, and a thrown provider error. Assert the fake service call count remains one in every request case and zero for configuration errors.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --test tests/analyzer-transport.test.js`

Expected: FAIL because `src/analyzer-transport.js` does not exist.

- [ ] **Step 3: Implement the transport**

Resolve the profile from `getSupportedProfiles()`, then call:

```js
const raw = await service.sendRequest(
    profileId,
    prompt,
    responseLength,
    { stream: false, extractData: false, includePreset: false, includeInstruct: false },
    {
        enable_web_search: false,
        tools: [],
        tool_choice: undefined,
        custom_prompt_post_processing: '',
        temperature: 0,
        json_schema: jsonSchema,
    },
);
```

Extract `choices[0].message.content`, `choices[0].message.reasoning`, and `choices[0].finish_reason`. Reject empty content and `finishReason === 'length'` with diagnostic fields preserved. Wrap transport exceptions once without sending another request.

- [ ] **Step 4: Run focused and full tests**

Run: `node --test tests/analyzer-transport.test.js && npm test`

Expected: all transport tests and the full suite pass.

- [ ] **Step 5: Commit the transport**

```bash
git add src/analyzer-transport.js tests/analyzer-transport.test.js
git commit -m "feat: add isolated analyzer connection transport"
```

### Task 3: Analyzer Profile Settings and Selector

**Files:**
- Modify: `src/settings.js`
- Modify: `tests/profiles.test.js`
- Modify: `settings.html`
- Modify: `src/ui.js`

**Interfaces:**
- Produces settings version `6` with `analyzerProfileId: string` defaulting to `''`.
- `mountSettingsPanel(html, entities, onChanged, actions)` consumes `actions.connectionService` and persists selection through `saveSettings()`.

- [ ] **Step 1: Write failing settings migration and UI structure tests**

Add a migration test:

```js
const settings = { settingsVersion: 5, profiles: [] };
migrateSettings(settings);
assert.equal(settings.settingsVersion, 6);
assert.equal(settings.analyzerProfileId, '');
```

Extend the architecture test to require `id="sst-analyzer-profile"` and a visible `id="sst-analyzer-profile-status"` in `settings.html`.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `node --test tests/profiles.test.js tests/architecture.test.js`

Expected: FAIL because version 6 migration and selector markup do not exist.

- [ ] **Step 3: Implement migration and selector**

Replace `migrateProfilesToV5` with an exported `migrateSettings` that preserves the v5 profile-rule migration and then initializes `analyzerProfileId` for v6. Add this settings markup near the current-chat controls:

```html
<label for="sst-analyzer-profile">Analyzer Connection Profile</label>
<select id="sst-analyzer-profile" class="text_pole"></select>
<small id="sst-analyzer-profile-status"></small>
```

Populate only `connectionService.getSupportedProfiles()`, prepend `Select an analyzer profile`, select the stored ID when still present, and show `Selected profile is unavailable` without silently choosing another profile. On change, persist the exact ID and call `onChanged()`.

- [ ] **Step 4: Run focused and full tests**

Run: `node --test tests/profiles.test.js tests/architecture.test.js && npm test`

Expected: all settings, architecture, and full-suite tests pass.

- [ ] **Step 5: Commit settings and UI**

```bash
git add src/settings.js tests/profiles.test.js settings.html src/ui.js tests/architecture.test.js
git commit -m "feat: select a dedicated analyzer connection profile"
```

### Task 4: Controller Integration and Terminal Diagnostics

**Files:**
- Modify: `index.js`
- Modify: `src/analyzer.js`
- Modify: `src/chat.js`
- Modify: `src/ui.js`
- Modify: `tests/architecture.test.js`

**Interfaces:**
- Consumes `analyzeWithProfile` from Task 2.
- Persists failed record diagnostics as `{ category, message, profileId, profileName, responseType, preview, reasoningPreview, finishReason }`.
- Keeps `retryAnalysis(messageIndex?)` manual-only.

- [ ] **Step 1: Write failing architecture tests**

Require the controller to import and call `analyzeWithProfile`, pass `context().ConnectionManagerRequestService`, and contain no `generateRaw(` call. Require the controller source to persist `reasoningPreview`, `finishReason`, and `profileId`.

- [ ] **Step 2: Run the architecture test and verify RED**

Run: `node --test tests/architecture.test.js`

Expected: FAIL because the controller still calls `generateRaw`.

- [ ] **Step 3: Integrate the transport**

Change `processAnalysisJob` to call the transport exactly once with the configured profile and the analyzer request's `prompt`, `jsonSchema`, and `responseLength`. Parse `transport.content`, then preserve the existing current-job/current-chat/current-swipe guards before saving events.

On error, persist the transport diagnostics. For parser and semantic-validation errors, attach the already returned content and profile identity. Do not enqueue another job.

In `enqueueAnalysis`, if `analyzerProfileId` is empty or unsupported, return `false` without making a request and expose a configuration warning through rebuilt state. In the settings recovery action, show `Select an Analyzer Connection Profile first` rather than `No failed state analysis` when unconfigured.

- [ ] **Step 4: Extend Activity diagnostics**

Display category, profile name, finish reason, raw preview, and reasoning preview in the Activity table. Escape every value through the existing `esc()` helper.

- [ ] **Step 5: Run focused and full verification**

Run: `node --test tests/architecture.test.js && npm test && npm run check && git diff --check`

Expected: all tests and static checks pass with no diff whitespace errors.

- [ ] **Step 6: Commit controller integration**

```bash
git add index.js src/analyzer.js src/chat.js src/ui.js tests/architecture.test.js
git commit -m "refactor: isolate tracker analysis from roleplay generation"
```

### Task 5: Release and Runtime Verification

**Files:**
- Modify: `manifest.json`
- Modify: `package.json`

**Interfaces:**
- Produces extension release version `5.1.0`.

- [ ] **Step 1: Bump both versions to 5.1.0**

Set `version` to `5.1.0` in `manifest.json` and `package.json`.

- [ ] **Step 2: Run fresh full verification**

Run: `npm test && npm run check && git diff --check`

Expected: all tests pass, syntax checks pass, and diff check exits zero.

- [ ] **Step 3: Commit the release**

```bash
git add manifest.json package.json
git commit -m "chore: release isolated analyzer profile 5.1.0"
```

- [ ] **Step 4: Restart SillyTavern and verify served assets**

Restart `node server.js`, then run:

```bash
curl -fsS http://127.0.0.1:8000/scripts/extensions/third-party/elena-succubus-tracker/manifest.json | jq -r .version
curl -fsS http://127.0.0.1:8000/scripts/extensions/third-party/elena-succubus-tracker/index.js | rg 'analyzeWithProfile'
curl -fsS http://127.0.0.1:8000/scripts/extensions/third-party/elena-succubus-tracker/settings.html | rg 'sst-analyzer-profile'
```

Expected: version `5.1.0`, controller transport import present, and analyzer profile selector markup present.

- [ ] **Step 5: Inspect repository state**

Run: `git status --short && git log -6 --oneline`

Expected: clean working tree and the task commits visible in order.
