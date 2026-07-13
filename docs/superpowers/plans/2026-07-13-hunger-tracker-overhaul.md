# Hunger Tracker Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the fragile Succubus State Tracker with a standalone, mobile-first Hunger Tracker repository that has deterministic state management, safe NPC CRUD, supported SillyTavern integration, and verified deployment/rollback.

**Architecture:** `/home/dev/hunger_tracker` is the sole editable repository. A pure domain layer owns schema-v8 settings, chat state, analysis records, and NPC transactions; a thin adapter owns SillyTavern/browser APIs; the drawer renders operational chat state. Releases are allowlisted copies deployed atomically into `data/default-user/extensions/hunger_tracker`.

**Tech Stack:** Plain browser ES modules, SillyTavern `getContext()` API, native Node test runner, shell release scripts, no runtime dependencies and no build step.

## Global Constraints

- Repository and installed folder: `hunger_tracker`; display name: `Hunger Tracker`; release version: `6.0.0`.
- Settings namespace and prompt key: `hunger_tracker`; chat metadata key: `hungerTracker`; schema version: `8`.
- The old v7 state is intentionally not imported. First activation creates clean v8 settings and per-chat metadata.
- Elena remains a bundled preset; `elena-state` and `elenaState` remain compatibility aliases.
- Analyzer-discovered NPCs auto-approve unless their normalized name is suppressed.
- No persistent tracker UI may be inserted above or around `#send_form`; all chat operations live in the main drawer.
- Global profiles and analyzer configuration remain in Extensions settings.
- Mobile behavior must work at 360px, use native SillyTavern theme variables/classes, 44px touch targets, keyboard focus, and reduced-motion support.
- Use only supported `SillyTavern.getContext()` integration; no deep relative imports into SillyTavern internals.
- Production extension code is plain ES modules with no runtime dependencies or required build step.
- Every behavior change follows red-green-refactor and must retain a focused regression test.

---

### Task 1: Repository Identity and Clean V8 Foundation

**Files:**
- Modify: `manifest.json`, `package.json`, `.gitignore`, `src/settings.js`, `src/store.js`, `src/chat.js`
- Create: `src/identity.js`, `tests/identity.test.js`
- Modify tests: `tests/profiles.test.js`, `tests/store.test.js`, `tests/architecture.test.js`

**Interfaces:**
- Produces constants `EXTENSION_FOLDER`, `DISPLAY_NAME`, `VERSION`, `SETTINGS_KEY`, `METADATA_KEY`, `PROMPT_KEY`.
- Produces `createDefaultSettings()` and `createDefaultMetadata(messageCount)` returning new schema-v8 objects.
- `getSettings()` must replace non-v8 settings with fresh v8 defaults rather than migrate values.
- `ensureMetadata()` must replace non-v8 metadata with fresh v8 metadata rather than import old state.

- [ ] Add tests that assert the Hunger Tracker identifiers, version 6.0.0 manifest/package alignment, and absence of the legacy managed marker in release inputs.
- [ ] Run the focused tests and confirm failures name the old identifiers/version.
- [ ] Add the identity module and update package/manifest/settings/store/chat code to use it.
- [ ] Add tests proving v7 settings and metadata values are ignored while fresh v8 objects contain empty records, NPCs, suppressions, manual events, and exclusions.
- [ ] Run focused and full tests, refactor duplicated constants, and commit.

### Task 2: Transactional NPC Repository

**Files:**
- Replace: `src/npcs.js`
- Modify: `src/npc-analysis.js`, `src/chat.js`
- Create: `tests/npc-repository.test.js`
- Modify tests: `tests/npcs.test.js`, `tests/npc-analysis.test.js`, `tests/rebuild.test.js`

**Interfaces:**
- `addNpc(metadata, name, options)` creates an approved manual record and clears matching suppression.
- `renameNpc(metadata, npcId, name)` preserves the ID and rewrites stored display-name snapshots.
- `mergeNpcs(metadata, retainedId, removedId)` rewrites all baseline, manual-event, classification, event, and exclusion references before deleting the duplicate.
- `removeNpc(metadata, npcId)` returns an impact summary, hard-deletes the record/references, preserves unrelated time/hunger/exposure effects, and suppresses the normalized name.
- `restoreSuppressedNpc(metadata, normalizedName)` removes one suppression.
- All mutations are transactional: validate/transform a clone, then replace metadata fields only on success.

- [ ] Add failing tests for validated manual creation, stable IDs, default approval, suppression override, and name length/empty-name rejection.
- [ ] Implement the minimum creation/suppression behavior and verify green.
- [ ] Add failing rename tests for stable identity, snapshot rewriting, standard-roster collision rejection, and normalized NPC collision reporting.
- [ ] Implement rename and verify green.
- [ ] Add failing merge tests covering baselines, manual events, analyzer classifications/events, exclusions, and combined evidence/source bounds.
- [ ] Implement explicit merge and verify green.
- [ ] Add failing removal tests covering impact counts, target-effect sanitization, unrelated-effect retention, manual/baseline cleanup, exact suppression, and rollback on invalid input.
- [ ] Implement hard deletion and analyzer suppression, then run focused/full tests and commit.

### Task 3: Mobile Operational Drawer and NPC Management

**Files:**
- Replace: `src/ui.js`, `style.css`
- Modify: `settings.html`, `tests/ui.test.js`, `tests/architecture.test.js`
- Create: `tests/ui-contract.test.js`

**Interfaces:**
- `openStateDrawer(actions)` renders Overview, NPCs, Activity, and Ledger tabs.
- Drawer actions call injected `addNpcAndRebuild`, `renameNpcAndRebuild`, `mergeNpcsAndRebuild`, `removeNpcAndRebuild`, and `restoreSuppressedNpcAndRebuild` functions.
- Extensions settings retain global enablement, analyzer configuration, profiles, and the Open current chat state button.

- [ ] Add failing source/DOM-contract tests proving the status strip functions, `showStatusStrip`, and strip checkbox/CSS are absent.
- [ ] Remove the strip and all runtime/settings references; verify focused tests.
- [ ] Add failing drawer tests for four tabs, complete Overview status, operational actions, accessible tabs, and escaped content.
- [ ] Implement drawer view helpers and bindings; verify green.
- [ ] Add failing NPC UI tests for Add, Edit, explicit Merge confirmation, hard-delete impact confirmation, suppressed-name restore, validation errors, and empty states.
- [ ] Implement injected NPC action bindings and refresh behavior.
- [ ] Add mobile CSS contract tests for one-column controls, stacked activity/ledger cards, 44px touch targets, visible focus, and reduced motion; implement and verify full suite.
- [ ] Commit.

### Task 4: Supported SillyTavern Adapter and Runtime Lifecycle

**Files:**
- Create: `src/st-adapter.js`, `src/runtime.js`
- Replace: `index.js`
- Modify: `src/queue.js`, `tests/architecture.test.js`, `tests/queue.test.js`
- Create: `tests/runtime.test.js`, `tests/st-adapter.test.js`

**Interfaces:**
- `SillyTavernAdapter` wraps context retrieval, persona selection, events, settings/metadata saves, prompts, popup/drawer APIs, Connection Manager, macros, commands, DOM observation, and notifications.
- `HungerTrackerRuntime` exposes `start()`, `rebuild()`, `openDrawer()`, and `dispose()` with idempotent listener management.
- `AnalysisJob` identity includes chat, message, swipe, roster revision, analyzer version, and effective analyzer configuration.

- [ ] Add failing adapter tests showing no deep SillyTavern imports and all supported operations are wrapped.
- [ ] Implement the adapter and verify green.
- [ ] Add failing runtime tests for idempotent start/dispose, one listener per event, APP_READY startup, prompt clearing, save-after-mutation, and drawer commands.
- [ ] Implement the runtime coordinator and thin entrypoint.
- [ ] Add failing race tests for chat switches, edits, swipes, deletion, profile changes, stale analyzer results, and repeated initialization.
- [ ] Extend immutable job identity/cancellation until race tests pass.
- [ ] Preserve `hungerState`/`elenaState` macros and make `/hunger-state` plus `/elena-state` open the drawer without chat output.
- [ ] Run syntax/full tests and commit.

### Task 5: Repository Documentation and Release Tooling

**Files:**
- Replace: `README.md`
- Create: `CHANGELOG.md`, `docs/ARCHITECTURE.md`, `docs/AUDIT.md`, `scripts/verify.sh`, `scripts/release.sh`, `scripts/deploy.sh`, `scripts/rollback.sh`, `tests/release-tools.test.js`
- Modify: `package.json`, `.gitignore`

**Interfaces:**
- `npm run verify` runs tests, syntax checks, identity checks, and release validation.
- `npm run release` creates an allowlisted artifact without `.git`, tests, docs, scratch files, or Tavernkeeper metadata.
- `scripts/deploy.sh --sillytavern-root PATH [--user HANDLE]` verifies, stages, hashes, backs up, and atomically installs `hunger_tracker`.
- `scripts/rollback.sh --sillytavern-root PATH [--user HANDLE] --backup PATH` restores an explicit backup atomically.

- [ ] Add failing tests for the release allowlist, identity/version agreement, executable scripts, safe path validation, backup behavior, and dry-run output.
- [ ] Implement verification/release/deploy/rollback scripts and package commands until focused tests pass.
- [ ] Write the README with purpose, compatibility, installation, verified deployment, drawer/NPC usage, Elena preset, analyzer setup, storage/privacy, development, tests, troubleshooting, backup, rollback, and releases.
- [ ] Document current architectural faults and the replacement boundaries; add the 6.0.0 changelog.
- [ ] Run the full verification command and commit.

### Task 6: Final Review, Deployment, and Live Verification

**Files:**
- Runtime install: `/home/dev/SillyTavern/data/default-user/extensions/hunger_tracker`
- Backup/archive: timestamped paths produced by deployment tooling

- [ ] Run a whole-branch spec and code-quality review and resolve all Critical/Important findings.
- [ ] Run `npm run verify` from a clean working tree and assemble the release artifact twice, asserting identical file hashes.
- [ ] Back up the old `elena-succubus-tracker` installation and Tavernkeeper marker/registry data.
- [ ] Deploy `hunger_tracker`, detach the old project marker/registry ownership, and prevent both extensions from loading together.
- [ ] Restart SillyTavern, verify the served manifest/source hashes, and inspect server/browser-visible endpoints.
- [ ] Exercise a clean chat and copied Elena chat: drawer access, manual NPC add/edit/merge/remove/suppression, reload persistence, analyzer mock path, and mobile layout contract.
- [ ] Demonstrate rollback using the produced backup, then restore the verified Hunger Tracker release.
