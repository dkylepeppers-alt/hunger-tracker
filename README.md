# Hunger Tracker

A local SillyTavern extension for assigning configurable succubus state profiles to character cards or user personas. It supports solo and group chats, participant soul reserves, deterministic feeding rules, editable behavior tiers, and per-chat event ledgers.

Roleplay responses receive qualitative behavioral guidance only. After a response completes, a single-worker queue sends that exact message revision through an isolated raw JSON classifier, then stores a terminal complete or failed record. Exact state values stay in the extension UI and are never requested in character dialogue.

## Installation

In SillyTavern, open **Extensions → Install extension**, paste:

```text
https://github.com/dkylepeppers-alt/hunger-tracker
```

Install for the current user, reload SillyTavern, then open **Extensions → Hunger Tracker**. SillyTavern clones the repository into `data/<user>/extensions/hunger-tracker` and can pull future updates through the Extensions UI. Automatic update checks are enabled by the manifest and still respect SillyTavern's global extension-update settings.

If **Succubus State Tracker** is already installed, disable or delete it in the Extensions UI before enabling Hunger Tracker. Do not load both extensions together.

## Analyzer configuration

Select a dedicated **Analyzer Connection Profile** in the extension settings. The tracker resolves that bound profile when each queued analysis begins, so changing the profile's model in Connection Manager changes the next analyzer request without reselecting it.

The status below the selector shows the current effective model and preset. **Advanced analyzer settings** controls maximum output tokens, deterministic temperature, and optional connection-preset inheritance. Preset inheritance never enables streaming, web search, tools, or instruct formatting for analyzer requests.

Model or settings changes affect future requests and manual retries. Existing completed analysis records are not silently reanalyzed.

## Chat-local NPC tracking

Valid NPCs discovered by the analyzer are approved automatically for the current chat. A first-seen feeding target is resolved immediately only when its normalized name exactly matches one feeding-involved candidate and one locally generated approved NPC record; unknown targets never fall back to the user persona.

Open the current-chat state drawer to audit tracked names. **Ignore** opts a name out of tracking and **Restore** adds it back. Historical failed analyses remain unchanged until explicitly retried or reanalyzed.

## Development

```bash
npm test
npm run check
```

State is stored per chat. Global profiles and rule mappings are stored in SillyTavern extension settings.

Version 6.0.0 uses schema version 8. Older tracker settings and chat metadata are intentionally replaced with clean v8 state. Activity rows expose missing, analyzing, complete, and failed revisions; each failed row owns its Retry action.
