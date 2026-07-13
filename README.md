# Succubus State Tracker

A local SillyTavern extension for assigning configurable succubus state profiles to character cards or user personas. It supports solo and group chats, participant soul reserves, deterministic feeding rules, editable behavior tiers, and per-chat event ledgers.

Roleplay responses receive qualitative behavioral guidance only. After a response completes, a single-worker queue sends that exact message revision through an isolated raw JSON classifier, then stores a terminal complete or failed record. Exact state values stay in the extension UI and are never requested in character dialogue.

## Installation

Place this repository at `data/<user>/extensions/elena-succubus-tracker`, reload SillyTavern, then open **Extensions → Succubus State Tracker**. Choose any character or persona in **Assign the succubus role**.

## Analyzer configuration

Select a dedicated **Analyzer Connection Profile** in the extension settings. The tracker resolves that bound profile when each queued analysis begins, so changing the profile's model in Connection Manager changes the next analyzer request without reselecting it.

The status below the selector shows the current effective model and preset. **Advanced analyzer settings** controls maximum output tokens, deterministic temperature, and optional connection-preset inheritance. Preset inheritance never enables streaming, web search, tools, or instruct formatting for analyzer requests.

Model or settings changes affect future requests and manual retries. Existing completed analysis records are not silently reanalyzed.

## Development

```bash
npm test
npm run check
```

State is stored per chat. Global profiles and rule mappings are stored in SillyTavern extension settings. The `.tavernkeeper-managed.json` file is intentionally local-only.

The first load after upgrading preserves the current reconstructed state as a v5 baseline and analyzes new responses going forward. Activity rows expose missing, analyzing, complete, and failed revisions; each failed row owns its Retry action.
