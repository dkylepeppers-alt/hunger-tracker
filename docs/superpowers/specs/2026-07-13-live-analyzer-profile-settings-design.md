# Live Analyzer Profile Settings Design

## Objective

Make the analyzer follow the current configuration of its bound SillyTavern Connection Manager profile. Editing that profile's model must affect the next analyzer request without reselecting the profile, reloading SillyTavern, or changing extension-owned data. The extension will also expose a small set of analyzer-specific generation controls without duplicating Connection Manager.

## Confirmed Problem

The tracker stores an analyzer connection profile ID and builds its settings dropdown from one snapshot of `getSupportedProfiles()`. The dropdown does not subscribe to Connection Manager profile-created, profile-updated, or profile-deleted events, so its displayed profile details can become stale.

The transport resolves the stored profile ID when it starts a request, but the effective model is not shown or persisted in analyzer diagnostics. This makes it difficult to distinguish a stale profile binding from a provider-side model substitution. The transport also hardcodes temperature and output length and deliberately excludes the profile preset, leaving no extension UI for changing those analyzer settings.

## User-Visible Behavior

The tracker will keep a dedicated **Analyzer Connection Profile** selection. The selected profile ID is the binding; the extension will not copy or cache the profile's model.

The settings panel will display the selected profile's current:

- profile name;
- model;
- completion preset, when one is configured; and
- availability state.

The display will update when Connection Manager creates, updates, or deletes a profile. Editing the bound profile's model will therefore be visible immediately and will affect the next analyzer request.

An **Advanced analyzer settings** drawer will provide:

- **Maximum output tokens**, an integer from 100 through 16,384, defaulting to 1,000;
- **Temperature**, a number from 0 through 2, defaulting to 0; and
- **Use connection profile preset**, defaulting to off.

When profile-preset inheritance is off, the analyzer will send the configured temperature and exclude completion presets, preserving today's isolated deterministic behavior. When inheritance is on, the selected profile's current completion preset will be included and the extension will omit its temperature override so the preset can supply sampler settings. Maximum output tokens remains an analyzer-owned bound in both modes.

The extension will continue to force the invariants required by the classifier: non-streaming output, the analyzer JSON schema, no tools, and disabled web search. It will continue to exclude instruct templates because the analyzer already supplies a complete system/user chat prompt.

## Configuration and Migration

Extension settings will advance from version 6 to version 7 and add:

```js
{
    analyzerMaxTokens: 1000,
    analyzerTemperature: 0,
    analyzerUseProfilePreset: false,
}
```

Migration will preserve `analyzerProfileId`, succubus profiles, rules, and all chat-local metadata. Missing or invalid values will fall back to the defaults at request time and will be corrected through the settings UI when the user edits them.

No model string will be stored in tracker settings. Connection Manager remains the sole source of truth for the bound profile's provider and model.

## Architecture

### Reactive profile selector

`src/ui.js` will use `ConnectionManagerRequestService.handleDropdown()` instead of manually building a static list. Its callbacks will:

- persist a newly selected analyzer profile ID;
- refresh the effective profile name, model, preset, and status after an update;
- clear the binding and show a configuration warning if the bound profile is deleted or becomes unsupported; and
- schedule the normal tracker rebuild so warnings and controls stay current.

The UI will not switch Connection Manager's globally selected roleplay profile. The analyzer binding remains independent.

### Request-time configuration

The queued job will not contain a copied model. Immediately before each request, the controller will read the latest extension analyzer settings and the transport will resolve the bound profile from Connection Manager.

The transport will construct the request from that live profile and the current analyzer options. The effective profile model will be passed explicitly in the request override payload as well as being supplied by Connection Manager's profile resolution. This makes the intended model unambiguous and directly testable.

Changing a profile or analyzer option affects future requests, including queued jobs that have not started. An already in-flight request continues with the configuration it began with.

### Diagnostics

The normalized transport result will include:

- profile ID and name;
- effective model;
- effective preset name, or an empty value;
- whether preset inheritance was enabled;
- requested maximum output tokens;
- requested temperature when the extension supplied one;
- response content, reasoning, and finish reason.

Successful and failed analysis records will persist the effective profile identity and model. The Activity view will show these values so the actual configuration used for a request can be verified later. No credentials, URLs, proxy secrets, or API keys will be recorded.

## Request Flow

1. A chat event enqueues one analysis job.
2. When that job reaches the front of the serialized queue, the controller reads the current analyzer profile ID and advanced settings.
3. The transport resolves the current bound profile from Connection Manager.
4. The transport sends one request using the profile's current model and the current analyzer settings.
5. The controller persists the validated events together with effective analyzer diagnostics.
6. A profile or settings edit affects the next job to begin; it does not trigger requests by itself.

Completed historical records will not be reanalyzed automatically after a model or settings change. A manual retry or full-chat reanalysis uses the current configuration.

## Validation and Error Handling

The extension will reject an analyzer request before transport when:

- no analyzer profile is selected;
- the selected profile was deleted or is unsupported;
- maximum output tokens is outside its allowed integer range; or
- temperature is not finite or is outside its allowed range while profile-preset inheritance is off.

UI controls will validate and normalize values before saving. Transport-level validation remains necessary because existing or externally edited settings may be malformed.

Provider model substitution cannot be detected universally from the response, but the extension will record and display the exact model it requested. Existing single-request behavior remains unchanged: no automatic retry, fallback model, or silent profile switch will be introduced.

## Testing

Automated tests will cover:

- migration from settings version 6 to 7 without changing the bound profile ID or tracker rules;
- the reactive profile selector using Connection Manager's supported dropdown API;
- profile update callbacks refreshing the displayed model and preset;
- profile deletion clearing the unavailable binding;
- request-time resolution of the bound profile's latest model;
- a model edit affecting the next request without changing the profile ID;
- explicit effective-model propagation in the request payload;
- isolated defaults: no preset, temperature 0, 1,000 maximum output tokens;
- preset inheritance: include the current profile preset and omit the temperature override;
- configurable maximum output tokens and temperature;
- continued enforcement of non-streaming JSON-schema output with tools and web search disabled;
- effective model and analyzer options in success and failure diagnostics;
- no automatic reanalysis after configuration changes; and
- malformed analyzer settings producing a configuration error without a provider request.

## Non-Goals

- Duplicating Connection Manager's provider credentials, URL, proxy, or model catalog in the tracker.
- Following the globally active roleplay profile instead of the explicitly bound analyzer profile.
- Editing Connection Manager profiles from inside the tracker.
- Applying instruct templates or roleplay prompt formatting to classifier messages.
- Automatically retrying, falling back, or reanalyzing completed records when configuration changes.
