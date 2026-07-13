# Direct-Contact Soul Drain Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Require direct physical contact before analyzer events may drain a participant's soul, and show the installed extension version in the UI.

**Architecture:** Extend the structured analyzer contract with a required `contactMode`, validate contact/intensity consistency before event conversion, and allow only direct contact to produce a feeding reducer event. Increase the analyzer fingerprint version so old ambiguous analyses stop contributing, while the UI reads its version from SillyTavern's loaded manifest.

**Tech Stack:** Browser ES modules, JSON Schema, SillyTavern extension context, Node.js built-in test runner.

## Global Constraints

- Only `contactMode: direct` with non-`none` feeding intensity may reduce soul.
- Indirect contact may affect hunger pressure or exposure but never soul, hunger relief from soul, or `soulsConsumed`.
- Reject inconsistent contact/intensity combinations; do not infer or coerce them.
- Analyzer v1 records become inactive through fingerprint version 2; do not mutate chat files.
- Source UI version exclusively from the loaded extension manifest.

---

### Task 1: Contact Classification Contract

**Files:**
- Modify: `src/analyzer.js`
- Modify: `tests/analyzer.test.js`

**Interfaces:**
- `ANALYZER_SCHEMA.properties.events.items.properties.contactMode` is enum `['none', 'indirect', 'direct']` and required.
- `normalizeAnalyzerEvent(item)` produces canonical `contactMode` from `contactMode` or `contact_mode`.

- [ ] **Step 1: Write failing schema and normalization tests**

Update existing analyzer fixtures to include `contactMode`. Assert the request schema requires it and normalizes `contact_mode: 'indirect'`. Add rejection tests for a missing mode, `none` with `trace`, and `direct` with `none`.

```js
assert.deepEqual(event.properties.contactMode.enum, ['none', 'indirect', 'direct']);
assert.equal(event.required.includes('contactMode'), true);
assert.equal(parseAnalyzerResult(fencedAlias).events[0].contactMode, 'indirect');
assert.throws(() => analyzerResultToEvents(inconsistentNone, roster, rules, 'x'), /contact/i);
assert.throws(() => analyzerResultToEvents(inconsistentDirect, roster, rules, 'x'), /contact/i);
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --test tests/analyzer.test.js`

Expected: FAIL because `contactMode` is absent from schema, normalization, and validation.

- [ ] **Step 3: Implement schema, alias, and consistency validation**

Add `contactMode` to required schema fields and `EVENT_ALIASES`. In `analyzerResultToEvents`, reject unknown modes and inconsistent pairs:

```js
if (!['none', 'indirect', 'direct'].includes(item.contactMode)) throw new Error('Unknown contact mode');
if (item.contactMode === 'none' && intensity !== 'none') throw new Error('Feeding intensity requires contact');
if (item.contactMode === 'direct' && intensity === 'none') throw new Error('Direct feeding requires an intensity');
```

Return a feeding event only for `contactMode === 'direct'`; return the existing time/state event for `none` and `indirect`.

- [ ] **Step 4: Run focused and full tests**

Run: `node --test tests/analyzer.test.js && npm test`

Expected: all focused and full-suite tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/analyzer.js tests/analyzer.test.js
git commit -m "fix: require direct contact for soul drain"
```

### Task 2: Invalidate Ambiguous v1 Analyzer Records

**Files:**
- Modify: `src/analyzer.js`
- Modify: `tests/analyzer.test.js`
- Modify: `tests/rebuild.test.js`

**Interfaces:**
- `ANALYZER_VERSION` changes from `1` to `2`.
- `analysisKey()` naturally derives new v2 fingerprints; old records remain stored but are not active sources.

- [ ] **Step 1: Write failing version tests**

Assert `ANALYZER_VERSION === 2` and add a rebuild/source test with a stored v1 record proving the current v2 source is `missing` and its old feeding event is not replayed.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `node --test tests/analyzer.test.js tests/rebuild.test.js`

Expected: FAIL because the analyzer version remains 1.

- [ ] **Step 3: Set analyzer version 2**

Change only `export const ANALYZER_VERSION = 2;`. Do not delete or rewrite stored records.

- [ ] **Step 4: Run focused and full tests**

Run: `node --test tests/analyzer.test.js tests/rebuild.test.js && npm test`

Expected: all tests pass and old ambiguous records are ignored by current active sources.

- [ ] **Step 5: Commit**

```bash
git add src/analyzer.js tests/analyzer.test.js tests/rebuild.test.js
git commit -m "fix: invalidate ambiguous analyzer v1 records"
```

### Task 3: Visible Manifest Version

**Files:**
- Modify: `settings.html`
- Modify: `src/ui.js`
- Modify: `tests/architecture.test.js`

**Interfaces:**
- Settings contains `#sst-extension-version`.
- `mountSettingsPanel` and `openStateDrawer` read `ctx.getExtensionManifest('elena-succubus-tracker')?.version` through the supplied context/action and render it as `v<version>`.

- [ ] **Step 1: Write failing UI structure tests**

Require `id="sst-extension-version"`, `getExtensionManifest`, and version markup in both settings and state controls.

- [ ] **Step 2: Run architecture test and verify RED**

Run: `node --test tests/architecture.test.js`

Expected: FAIL because the version label is absent.

- [ ] **Step 3: Implement manifest-backed version labels**

Add `<small id="sst-extension-version"></small>` beside the settings title. Pass `ctx` to `mountSettingsPanel` actions, set the label to `v${version}`, and add the same escaped label after `Succubus state controls` in `openStateDrawer`. Use an empty string if the manifest is unavailable.

- [ ] **Step 4: Run focused and full checks**

Run: `node --test tests/architecture.test.js && npm test && npm run check && git diff --check`

Expected: all tests and static checks pass.

- [ ] **Step 5: Commit**

```bash
git add settings.html src/ui.js index.js tests/architecture.test.js
git commit -m "feat: show extension version in tracker controls"
```

### Task 4: Release and Runtime Verification

**Files:**
- Modify: `manifest.json`
- Modify: `package.json`

**Interfaces:**
- Release version is `5.1.1`.

- [ ] **Step 1: Set both release files to 5.1.1**

- [ ] **Step 2: Run fresh verification**

Run: `npm test && npm run check && git diff --check`

Expected: all tests pass and checks exit zero.

- [ ] **Step 3: Commit release**

```bash
git add manifest.json package.json
git commit -m "chore: release direct-contact soul drain fix 5.1.1"
```

- [ ] **Step 4: Restart and verify served assets**

Restart `node server.js`, then verify the served manifest is `5.1.1`, served analyzer schema contains `contactMode`, and settings contain `sst-extension-version`.
