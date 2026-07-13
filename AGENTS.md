# Hunger Tracker Agent Guide

## Project shape

- This is a SillyTavern extension built from plain browser ES modules. It has no runtime dependencies, package installation, transpilation, or build step.
- `index.js` coordinates the extension. Domain behavior lives in focused modules under `src/`; `settings.html` and `style.css` provide the extension UI; tests use Node's native test runner.
- Use only supported `SillyTavern.getContext()` integration. Do not add deep relative imports into SillyTavern internals.

## Stable contracts

- Keep the canonical identity in `src/identity.js`: install folder `hunger-tracker`, prompt and settings key `hunger_tracker`, metadata key `hungerTracker`, display name `Hunger Tracker`, and release version `6.0.0`.
- Settings and chat metadata use schema version 8. Do not silently migrate pre-v8 state; the current behavior intentionally creates clean v8 defaults.
- Keep analyzer requests isolated, non-streaming raw JSON requests. Never enable tools, web search, instruct formatting, or roleplay-context leakage for analysis.
- Persist only terminal analyzer records. State reconstruction must remain deterministic and must ignore stale job results.
- NPC mutations must validate a clone and commit atomically. Preserve stable NPC IDs across renames and rewrite every affected stored reference during merge or removal.
- Never expose numeric state, internal IDs, analyzer records, or tracker protocol syntax in roleplay guidance.

## Change discipline

- Follow red-green-refactor for every behavior change: add a focused failing test, verify the expected failure, implement the smallest change, then run the focused and full suites.
- Keep production code dependency-free and compatible with browser ES modules.
- Escape all user-controlled HTML. Preserve keyboard operation, visible focus, reduced-motion support, SillyTavern theme variables, 44px touch targets, and the 360px single-column drawer contract.
- Avoid unrelated refactors. Update identity/version assertions whenever a release identifier changes.

## Validation

Run both commands before committing or opening a pull request:

```bash
npm test
npm run check
```
