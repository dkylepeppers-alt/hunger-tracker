# Isolated Analyzer Profile Design

## Objective

Make state analysis independent of the active roleplay model and preset. Each assistant message receives at most one bounded analyzer request. The request either produces validated events or a visible terminal failure; it never silently retries, falls back, or loops.

## Evidence Behind the Redesign

The existing `generateRaw` path inherits roleplay settings. In the observed NanoGPT configuration this enabled web search and changed the requested model from `zai-org/glm-5.2:thinking` to `zai-org/glm-5.2:thinking:online`. That route inconsistently honored structured output. Responses alternated between valid schema JSON, empty content after reasoning exhausted the token limit, and fenced JSON with invented fields. Increasing the token limit improved success frequency but did not isolate the request.

## Architecture

The tracker will use SillyTavern's `ConnectionManagerRequestService` with a user-selected connection profile stored as `analyzerProfileId`. It will not call `generateRaw` for state analysis.

The tracker settings panel will provide an **Analyzer Connection Profile** dropdown populated from `ConnectionManagerRequestService.getSupportedProfiles()`. The selected analyzer profile is independent of the currently active roleplay connection profile.

For every analyzer call, the tracker will:

- use the selected profile directly;
- request a non-streaming response;
- exclude completion presets and instruct templates;
- send only the system classifier instruction, stable roster identities, the preceding user message, and the active assistant swipe;
- override inherited request features that do not belong in classification, including web search and tools;
- request deterministic sampling where the provider accepts it;
- request the existing structured event schema;
- make exactly one provider request.

No global chat-completion setting will be temporarily mutated.

## Components

### Analyzer request builder

`src/analyzer.js` remains responsible for constructing minimal evidence, the schema envelope, parsing, normalization, and semantic validation inputs. The request description will be provider-neutral and will not contain profile rules or current numeric state.

### Analyzer transport

A dedicated transport module will resolve the configured connection profile and call `ConnectionManagerRequestService.sendRequest()`. It will provide explicit request overrides for structured output, non-streaming behavior, disabled web search, no tools, and deterministic sampling. It will return a normalized transport result containing content, reasoning, profile identity, and provider metadata available from SillyTavern.

### Controller and queue

The existing serialized `AnalysisQueue` remains the sole scheduler. A job makes one transport call. The controller validates that the chat, message, swipe, and fingerprint are still current before saving the result.

### Settings and recovery UI

The settings panel will expose the dedicated analyzer profile selector. Missing or deleted profiles will produce a configuration warning and will not make a request. The existing current-chat controls and per-row retry actions remain available.

## Parsing and Validation

The parser will accept either:

- one pure JSON object containing `events`; or
- one complete fenced JSON object with no non-whitespace text outside the fence.

It will not scrape arbitrary prose for braces. A documented alias normalizer may convert known transport-level naming variants such as snake_case to the canonical schema, but it may not invent missing classifications or entities.

After normalization, every event must pass semantic validation:

- `succubusId` must identify a configured succubus present in the active roster;
- `targetId`, when feeding occurs, must identify a present non-succubus participant;
- hunger, exposure, and feeding classifications must be members of their canonical enums;
- numeric values must be finite and within schema bounds;
- required fields must be present.

Invalid, incomplete, empty, or truncated output is a terminal failure.

## State Lifecycle

- Existing completed analysis records remain valid.
- Existing failed records remain retryable.
- Migration adds `analyzerProfileId` to extension settings without changing chat metadata, baselines, hunger, exposure, souls, events, or manual adjustments.
- New automatic analysis is unavailable until a supported analyzer profile is selected.
- Changing the analyzer profile affects only future requests and records explicitly retried by the user.
- Pending work remains session-only.
- Each message fingerprint has one terminal persisted record: `complete` or `failed`.
- Manual retry removes only the selected failed record and queues one new request.

## Failure Handling and Diagnostics

There is no automatic retry and no fallback profile.

A failed record will include:

- failure category: configuration, transport, empty, parse, or validation;
- human-readable message;
- analyzer profile ID and display name;
- timestamp;
- raw content preview;
- reasoning preview when available;
- provider metadata such as finish reason when exposed by the request service.

The Activity view will display these diagnostics and the manual Retry action. Configuration failures will also be visible in the status/state controls without creating repeated requests.

## Testing

Automated tests will cover:

- selection and persistence of an analyzer connection profile;
- supported-profile dropdown population;
- request isolation: no preset, no instruct template, no stream, no web search, no tools;
- exactly one transport call per queued job;
- pure and fenced canonical JSON;
- documented snake_case alias normalization;
- rejection of surrounding prose, missing fields, unknown IDs, invalid enums, empty content, and truncated JSON;
- missing, deleted, disabled, and unsupported connection profiles;
- terminal failure diagnostics, including content and reasoning previews;
- manual retry behavior without automatic retry;
- preservation of existing completed records and chat state during settings migration.

## Non-goals

- Automatically choosing or creating a connection profile.
- Retrying with another model or profile.
- Mutating the active roleplay connection.
- Inferring events locally when the analyzer fails.
- Reanalyzing successful historical records solely because the analyzer profile changes.
