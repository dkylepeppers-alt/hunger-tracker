# Automatic NPC Approval Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automatically approve chat-local NPC candidates and safely apply a first-seen NPC feeding event in the same analyzer result using a locally generated ID.

**Architecture:** Metadata version 7 makes approved the default candidate status and migrates legacy pending records while preserving ignored opt-outs. A new pure analyzer-preparation boundary merges candidates, resolves only exact same-result feeding names to approved local IDs, and supplies an effective roster to the existing strict validator. The drawer becomes an audit and opt-out surface with Ignore and Restore actions.

**Tech Stack:** Browser ES modules, SillyTavern chat metadata and extension UI, Node.js built-in test runner.

## Global Constraints

- Perform exactly one analyzer call for a response; automatic approval and target recovery are local operations.
- Never accept a model-generated NPC ID.
- Never substitute a character or persona for an unresolved NPC target.
- Resolve only an empty-ID `untracked_npc` whose normalized target name has exactly one feeding-involved candidate and exactly one approved registry record in the same analyzer result.
- Preserve explicitly ignored NPCs during migration and rediscovery.
- Keep existing terminal failed records terminal until the user explicitly retries or reanalyzes them.
- Release `manifest.json` and `package.json` together at version `5.4.0`.

---

### Task 1: Metadata v7 and Automatic Registry Status

**Files:**
- Modify: `src/store.js:1-24`
- Modify: `src/npcs.js:1-37`
- Test: `tests/store.test.js`
- Test: `tests/npcs.test.js`

**Interfaces:**
- Produces: `METADATA_VERSION = 7`.
- Produces: `migrateMetadata(old, messageCount)` promotes legacy `pending` NPCs to `approved` and preserves `approved` and `ignored`.
- Produces: `mergeNpcCandidates(metadata, candidates, messageIndex, uuid)` creates new records with `approved` status and never changes an existing ignored status.
- Produces: `setNpcStatus(metadata, npcId, status)` accepts only `approved` and `ignored` for runtime actions.

- [ ] **Step 1: Write failing metadata migration tests**

Change the existing version assertions in `tests/store.test.js` from `6` to `7`, then add:

```js
test('migrates v6 pending NPCs to approved while preserving explicit statuses', () => {
    const old = {
        version: 6,
        baseline: { entities: {} }, analysisBoundary: 0, records: {}, manualEvents: [], excludedIds: [], archive: {},
        npcs: {
            'npc:pending': { id: 'npc:pending', name: 'Pending', normalizedName: 'pending', status: 'pending' },
            'npc:approved': { id: 'npc:approved', name: 'Approved', normalizedName: 'approved', status: 'approved' },
            'npc:ignored': { id: 'npc:ignored', name: 'Ignored', normalizedName: 'ignored', status: 'ignored' },
        },
    };
    const migrated = migrateMetadata(old, 0);
    assert.equal(migrated.version, 7);
    assert.equal(migrated.npcs['npc:pending'].status, 'approved');
    assert.equal(migrated.npcs['npc:approved'].status, 'approved');
    assert.equal(migrated.npcs['npc:ignored'].status, 'ignored');
    assert.notStrictEqual(migrated.npcs, old.npcs);
});
```

- [ ] **Step 2: Write failing automatic-status registry tests**

Replace the second test in `tests/npcs.test.js` with assertions that a new valid candidate is immediately exposed, ignored rediscovery remains ignored, restore returns to approved, and `pending` is rejected as a runtime action:

```js
test('auto-approves valid candidates while preserving ignored opt-outs', () => {
    const metadata = { npcs: {} };
    assert.deepEqual(mergeNpcCandidates(metadata, [{ name: '   ', evidence: '', involvedInFeeding: false }], 1, () => 'bad'), []);
    mergeNpcCandidates(metadata, [{ name: 'Mara', evidence: 'Spoke', involvedInFeeding: false }], 1, () => 'mara');
    assert.deepEqual(approvedNpcEntities(metadata), [{ id: 'npc:mara', name: 'Mara', kind: 'npc' }]);
    assert.equal(setNpcStatus(metadata, 'npc:mara', 'ignored'), true);
    mergeNpcCandidates(metadata, [{ name: 'mara', evidence: 'Returned', involvedInFeeding: true }], 2, () => 'unused');
    assert.equal(metadata.npcs['npc:mara'].status, 'ignored');
    assert.deepEqual(approvedNpcEntities(metadata), []);
    assert.equal(setNpcStatus(metadata, 'npc:mara', 'approved'), true);
    assert.throws(() => setNpcStatus(metadata, 'npc:mara', 'pending'), /status/i);
    assert.throws(() => setNpcStatus(metadata, 'npc:mara', 'invalid'), /status/i);
});
```

- [ ] **Step 3: Run focused tests and verify RED**

Run: `node --test tests/store.test.js tests/npcs.test.js`

Expected: FAIL because metadata remains version 6, pending records are not promoted, new candidates are pending, and runtime status still accepts pending.

- [ ] **Step 4: Implement metadata v7 migration**

In `src/store.js`, set the version to 7, add an NPC clone-and-promotion helper, and migrate both v5 and v6 through it:

```js
export const METADATA_VERSION = 7;

function migrateNpcs(npcs = {}) {
    const migrated = structuredClone(npcs);
    for (const record of Object.values(migrated)) {
        if (record?.status === 'pending') record.status = 'approved';
    }
    return migrated;
}

export function migrateMetadata(old = {}, messageCount = 0) {
    if (old.version === METADATA_VERSION) {
        old.npcs ??= {};
        for (const record of Object.values(old.npcs)) {
            if (record?.status === 'pending') record.status = 'approved';
        }
        return old;
    }
    if (old.version === 5 || old.version === 6) {
        return { ...old, version: METADATA_VERSION, npcs: migrateNpcs(old.npcs ?? {}) };
    }
    return {
        version: METADATA_VERSION,
        baseline: { source: 'v4-migration', messageBoundary: messageCount, entities: baselineEntities(old.state) },
        analysisBoundary: messageCount,
        records: {}, manualEvents: [], excludedIds: [], npcs: {},
        archive: { v4: { analysisCache: structuredClone(old.analysisCache ?? {}), analysisWarnings: structuredClone(old.analysisWarnings ?? []), legacyState: structuredClone(old.state ?? null), manualEvents: structuredClone(old.manualEvents ?? []), excludedIds: structuredClone(old.excludedIds ?? []) } },
    };
}
```

- [ ] **Step 5: Implement automatic registry status**

In `src/npcs.js`, change the accepted runtime statuses and the initial record status:

```js
const STATUSES = new Set(['approved', 'ignored']);
```

```js
record = metadata.npcs[id] = {
    id, name, normalizedName, status: 'approved', evidence: '',
    firstSourceMessageIndex: messageIndex, lastSourceMessageIndex: messageIndex,
    involvedInFeeding: false,
};
```

Do not assign `record.status` anywhere in the existing-record branch; this preserves ignored opt-outs during rediscovery.

- [ ] **Step 6: Run focused and full tests**

Run: `node --test tests/store.test.js tests/npcs.test.js && npm test`

Expected: all focused tests and the full suite PASS.

- [ ] **Step 7: Commit**

```bash
git add src/store.js src/npcs.js tests/store.test.js tests/npcs.test.js
git commit -m "feat: auto-approve chat-local NPCs"
```

### Task 2: Deterministic Same-Result NPC Target Preparation

**Files:**
- Create: `src/npc-analysis.js`
- Create: `tests/npc-analysis.test.js`

**Interfaces:**
- Consumes: `mergeNpcCandidates(metadata, candidates, messageIndex, uuid)` and `normalizeNpcName(name)` from `src/npcs.js`.
- Produces: `prepareNpcAnalysisResult({ result, metadata, roster, messageIndex, uuid })` returning `{ result, roster, discovered, hasUnapprovedCandidates }`.
- The returned `result` and `roster` are new shallow structures; input result events and roster participants are not mutated.

- [ ] **Step 1: Write the exact-resolution failing test**

Create `tests/npc-analysis.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareNpcAnalysisResult } from '../src/npc-analysis.js';

const roster = {
    succubi: [{ id: 'character:elena.png', name: 'Elena', kind: 'character' }],
    participants: [{ id: 'persona:kyle.png', name: 'Kyle', kind: 'persona' }],
};

function untrackedEvent(name = 'Billy') {
    return {
        succubusId: 'character:elena.png', elapsedHours: 0, hungerPressure: 'none', exposure: 'none',
        contactMode: 'direct', feedingIntensity: 'moderate', targetId: '', targetName: name,
        targetKind: 'untracked_npc', note: 'Direct feeding',
    };
}

test('resolves an exact feeding-involved candidate to a locally generated NPC id', () => {
    const metadata = { npcs: {} };
    const result = {
        events: [untrackedEvent('  BILLY ')],
        npcCandidates: [{ name: 'Billy', evidence: 'Present and fed upon', involvedInFeeding: true }],
    };
    const prepared = prepareNpcAnalysisResult({ result, metadata, roster, messageIndex: 15, uuid: () => 'billy' });
    assert.deepEqual(prepared.result.events[0], { ...untrackedEvent('  BILLY '), targetId: 'npc:billy', targetName: 'Billy', targetKind: 'npc' });
    assert.deepEqual(prepared.roster.participants.at(-1), { id: 'npc:billy', name: 'Billy', kind: 'npc' });
    assert.equal(prepared.discovered[0].status, 'approved');
    assert.equal(prepared.hasUnapprovedCandidates, false);
    assert.equal(roster.participants.length, 1);
    assert.equal(result.events[0].targetKind, 'untracked_npc');
});
```

- [ ] **Step 2: Write failing non-resolution tests**

Append cases proving the resolver keeps the event unchanged for a non-feeding candidate, ignored record, fuzzy name, duplicate candidates, and duplicate approved registry records:

```js
test('does not resolve non-feeding, ignored, fuzzy, or ambiguous matches', () => {
    const cases = [
        {
            name: 'non-feeding', metadata: { npcs: {} }, target: 'Billy',
            candidates: [{ name: 'Billy', evidence: 'Mentioned', involvedInFeeding: false }],
        },
        {
            name: 'ignored',
            metadata: { npcs: { 'npc:billy': { id: 'npc:billy', name: 'Billy', normalizedName: 'billy', status: 'ignored' } } },
            target: 'Billy', candidates: [{ name: 'Billy', evidence: 'Present', involvedInFeeding: true }],
        },
        {
            name: 'fuzzy', metadata: { npcs: {} }, target: 'Bill',
            candidates: [{ name: 'Billy', evidence: 'Present', involvedInFeeding: true }],
        },
        {
            name: 'duplicate candidates', metadata: { npcs: {} }, target: 'Billy',
            candidates: [
                { name: 'Billy', evidence: 'One', involvedInFeeding: true },
                { name: ' billy ', evidence: 'Two', involvedInFeeding: true },
            ],
        },
        {
            name: 'duplicate registry',
            metadata: { npcs: {
                'npc:one': { id: 'npc:one', name: 'Billy', normalizedName: 'billy', status: 'approved' },
                'npc:two': { id: 'npc:two', name: 'BILLY', normalizedName: 'billy', status: 'approved' },
            } },
            target: 'Billy', candidates: [{ name: 'Billy', evidence: 'Present', involvedInFeeding: true }],
        },
    ];
    for (const item of cases) {
        const result = { events: [untrackedEvent(item.target)], npcCandidates: item.candidates };
        const prepared = prepareNpcAnalysisResult({ result, metadata: item.metadata, roster, messageIndex: 1, uuid: () => item.name });
        assert.equal(prepared.result.events[0].targetKind, 'untracked_npc', item.name);
        assert.equal(prepared.result.events[0].targetId, '', item.name);
    }
});
```

- [ ] **Step 3: Run the focused test and verify RED**

Run: `node --test tests/npc-analysis.test.js`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` because `src/npc-analysis.js` does not exist.

- [ ] **Step 4: Implement the preparation boundary**

Create `src/npc-analysis.js`:

```js
import { mergeNpcCandidates, normalizeNpcName } from './npcs.js';

export function prepareNpcAnalysisResult({ result, metadata, roster, messageIndex, uuid }) {
    const discovered = mergeNpcCandidates(metadata, result.npcCandidates, messageIndex, uuid);
    const participants = new Map(roster.participants.map(entity => [entity.id, entity]));
    const events = result.events.map(event => {
        if (event.targetKind !== 'untracked_npc' || event.targetId !== '') return event;
        const normalizedTarget = normalizeNpcName(event.targetName);
        const candidateMatches = result.npcCandidates.filter(candidate => (
            candidate.involvedInFeeding === true && normalizeNpcName(candidate.name) === normalizedTarget
        ));
        const recordMatches = Object.values(metadata.npcs ?? {}).filter(record => (
            record.status === 'approved' && record.normalizedName === normalizedTarget
        ));
        if (candidateMatches.length !== 1 || recordMatches.length !== 1) return event;
        const record = recordMatches[0];
        const entity = { id: record.id, name: record.name, kind: 'npc' };
        participants.set(entity.id, entity);
        return { ...event, targetId: entity.id, targetName: entity.name, targetKind: entity.kind };
    });
    return {
        result: { ...result, events },
        roster: { ...roster, participants: [...participants.values()] },
        discovered,
        hasUnapprovedCandidates: discovered.some(record => record.status !== 'approved'),
    };
}
```

- [ ] **Step 5: Run focused and full tests**

Run: `node --test tests/npc-analysis.test.js && npm test`

Expected: the new resolver tests and the full suite PASS.

- [ ] **Step 6: Commit**

```bash
git add src/npc-analysis.js tests/npc-analysis.test.js
git commit -m "feat: resolve auto-approved NPC targets"
```

### Task 3: Wire Prepared NPC Results into the Analysis Controller

**Files:**
- Modify: `index.js:1-14,72-131,157-162`
- Modify: `tests/architecture.test.js:60-69`

**Interfaces:**
- Consumes: `prepareNpcAnalysisResult({ result, metadata, roster, messageIndex, uuid })` from Task 2.
- Consumes: `METADATA_VERSION` from `src/store.js`.
- Produces: completed analysis records whose `classifications` contain the resolved local NPC identity and whose numeric events were validated against the effective roster.

- [ ] **Step 1: Write the failing controller-wiring assertions**

Replace the NPC controller test in `tests/architecture.test.js` with:

```js
test('controller validates and persists the prepared auto-approved NPC result', () => {
    assert.match(entry, /prepareNpcAnalysisResult/);
    assert.match(entry, /const prepared\s*=\s*prepareNpcAnalysisResult/);
    assert.match(entry, /prepared\.roster/);
    assert.match(entry, /classifications:\s*prepared\.result\.events/);
    assert.match(entry, /version:\s*METADATA_VERSION/);
    assert.doesNotMatch(entry, /mergeNpcCandidates/);
});
```

- [ ] **Step 2: Run the controller test and verify RED**

Run: `node --test tests/architecture.test.js`

Expected: FAIL because `index.js` still calls `mergeNpcCandidates` directly, validates the raw result against `job.roster`, and hard-codes metadata version 6 during reset.

- [ ] **Step 3: Wire the preparation boundary into `processAnalysisJob`**

Replace the NPC import with:

```js
import { prepareNpcAnalysisResult } from './src/npc-analysis.js';
import { setNpcStatus } from './src/npcs.js';
import { METADATA_VERSION } from './src/store.js';
```

Replace the parse/validation block with:

```js
const result = parseAnalyzerResult(raw);
const prepared = prepareNpcAnalysisResult({
    result,
    metadata: job.metadata,
    roster: job.roster,
    messageIndex: job.messageIndex,
    uuid: () => crypto.randomUUID(),
});
if (prepared.discovered.length) ctx.saveMetadataDebounced();
stage = 'validation';
const events = prepared.result.events.flatMap((item, index) => {
    const succubus = prepared.roster.succubi.find(entity => entity.id === item.succubusId);
    if (!succubus) throw new Error(`Unknown succubus: ${item.succubusId}`);
    return analyzerResultToEvents(
        { events: [item] },
        prepared.roster,
        succubus.rules,
        `analysis:${job.key}:${index}`,
        { hasUnapprovedCandidates: prepared.hasUnapprovedCandidates },
    );
});
```

Change the complete-record field to:

```js
classifications: prepared.result.events,
```

Change reset metadata to:

```js
ctx.chatMetadata[META_KEY] = { version: METADATA_VERSION, baseline: { source: 'reset', messageBoundary: ctx.chat.length, entities: {} }, analysisBoundary: ctx.chat.length, records: {}, manualEvents: [], excludedIds: [], archive: {}, npcs: {} };
```

- [ ] **Step 4: Run controller, resolver, and full tests**

Run: `node --test tests/architecture.test.js tests/npc-analysis.test.js tests/analyzer.test.js && npm test && npm run check`

Expected: all tests and syntax checks PASS.

- [ ] **Step 5: Commit**

```bash
git add index.js tests/architecture.test.js
git commit -m "feat: wire automatic NPC target preparation"
```

### Task 4: Replace Manual Approval UI with Ignore and Restore

**Files:**
- Modify: `src/ui.js:135-150,197-208`
- Modify: `tests/ui.test.js`
- Modify: `tests/architecture.test.js:60-69`

**Interfaces:**
- Produces: exported `npcCandidateRows(metadata): string` for deterministic markup tests.
- The drawer calls `setNpcStatusAndRebuild(id, 'ignored')` for Ignore and `setNpcStatusAndRebuild(id, 'approved')` for Restore.
- General activity retry buttons remain unchanged.

- [ ] **Step 1: Write failing drawer markup tests**

Add `npcCandidateRows` to the import in `tests/ui.test.js`, then append:

```js
test('NPC rows expose ignore and restore without manual approval or retry guidance', () => {
    const html = npcCandidateRows({ npcs: {
        'npc:tracked': {
            id: 'npc:tracked', name: 'Tracked', status: 'approved', evidence: 'Present',
            firstSourceMessageIndex: 2, lastSourceMessageIndex: 4, involvedInFeeding: true,
        },
        'npc:ignored': {
            id: 'npc:ignored', name: 'Ignored', status: 'ignored', evidence: 'Mentioned',
            firstSourceMessageIndex: 3, lastSourceMessageIndex: 3, involvedInFeeding: false,
        },
    } });
    assert.match(html, /data-npc-id="npc:tracked" data-npc-status="ignored">Ignore</);
    assert.match(html, /data-npc-id="npc:ignored" data-npc-status="approved">Restore</);
    assert.doesNotMatch(html, />Approve</);
    assert.doesNotMatch(html, /Untrack|Approve, then retry|sst-retry-npc/);
});
```

Update the NPC architecture assertions to require `Ignore` and `Restore` and reject approval guidance:

```js
assert.match(ui, />Ignore</);
assert.match(ui, />Restore</);
assert.doesNotMatch(ui, /Approve, then retry|sst-retry-npc/);
```

- [ ] **Step 2: Run UI tests and verify RED**

Run: `node --test tests/ui.test.js tests/architecture.test.js`

Expected: FAIL because `npcCandidateRows` is not exported and current rows still render Approve, Untrack, and NPC-specific retry guidance.

- [ ] **Step 3: Implement the automatic-approval drawer rows**

Export and replace `npcCandidateRows` in `src/ui.js` with:

```js
export function npcCandidateRows(metadata) {
    const candidates = Object.values(metadata.npcs ?? {}).sort((left, right) => left.firstSourceMessageIndex - right.firstSourceMessageIndex);
    if (!candidates.length) return '<p class="text_muted">No chat-local NPCs have been detected.</p>';
    return candidates.map(candidate => {
        const action = candidate.status === 'ignored'
            ? `<button class="menu_button" type="button" data-npc-id="${esc(candidate.id)}" data-npc-status="approved">Restore</button>`
            : `<button class="menu_button" type="button" data-npc-id="${esc(candidate.id)}" data-npc-status="ignored">Ignore</button>`;
        return `<article class="sst-npc-row" data-npc-record="${esc(candidate.id)}"><div><strong>${esc(candidate.name)}</strong> <small>${esc(candidate.status)} · source message ${candidate.lastSourceMessageIndex} · involved in feeding: ${candidate.involvedInFeeding ? 'yes' : 'no'}</small></div><p>${esc(candidate.evidence || 'No evidence excerpt supplied.')}</p><div class="sst-actions">${action}</div></article>`;
    }).join('');
}
```

Remove the `.sst-retry-npc` binding from `bindNpcActions`. Replace the success toast with:

```js
toastr.success(button.dataset.npcStatus === 'approved'
    ? 'NPC restored to automatic tracking for this chat.'
    : 'NPC ignored for this chat.');
```

Keep the button disable, missing-record warning, metadata rerender, and recursive event rebinding unchanged.

- [ ] **Step 4: Run UI and full verification**

Run: `node --test tests/ui.test.js tests/architecture.test.js && npm test && npm run check && git diff --check`

Expected: all tests and checks PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ui.js tests/ui.test.js tests/architecture.test.js
git commit -m "feat: make NPC tracking opt-out"
```

### Task 5: Release 5.4.0 and Verify Served Assets

**Files:**
- Modify: `README.md`
- Modify: `manifest.json`
- Modify: `package.json`

**Interfaces:**
- Produces: live extension version `5.4.0` in both version files.
- Documents automatic chat-local NPC tracking, Ignore/Restore, exact same-result resolution, and explicit retry behavior for historical failures.

- [ ] **Step 1: Document automatic NPC tracking**

Add this section after Analyzer configuration in `README.md`:

```markdown
## Chat-local NPC tracking

Valid NPCs discovered by the analyzer are approved automatically for the current chat. A first-seen feeding target is resolved immediately only when its normalized name exactly matches one feeding-involved candidate and one locally generated approved NPC record; unknown targets never fall back to the user persona.

Open the current-chat state drawer to audit tracked names. **Ignore** opts a name out of tracking and **Restore** adds it back. Historical failed analyses remain unchanged until explicitly retried or reanalyzed.
```

- [ ] **Step 2: Set both release versions to 5.4.0**

Change `manifest.json` and `package.json`:

```json
"version": "5.4.0"
```

- [ ] **Step 3: Run fresh release verification**

Run:

```bash
npm test
npm run check
git diff --check
node -e "const fs=require('fs'); const manifest=JSON.parse(fs.readFileSync('manifest.json')); const pkg=JSON.parse(fs.readFileSync('package.json')); if (manifest.version !== '5.4.0' || pkg.version !== manifest.version) process.exit(1); console.log(manifest.version)"
```

Expected: 69 or more tests PASS, syntax and whitespace checks exit zero, and the version command prints `5.4.0`.

- [ ] **Step 4: Commit the release**

```bash
git add README.md manifest.json package.json
git commit -m "chore: release automatic NPC approval 5.4.0"
```

- [ ] **Step 5: Verify the live server serves the committed extension**

Run from `/home/dev/SillyTavern`:

```bash
curl -fsS http://127.0.0.1:8000/scripts/extensions/third-party/elena-succubus-tracker/manifest.json
curl -fsS http://127.0.0.1:8000/scripts/extensions/third-party/elena-succubus-tracker/index.js | sha256sum
sha256sum data/default-user/extensions/elena-succubus-tracker/index.js
git -C data/default-user/extensions/elena-succubus-tracker status --short
```

Expected: the served manifest reports `5.4.0`, the two index hashes match, and the extension repository is clean. Reloading the SillyTavern client activates the new ES module and migrates open-chat metadata to version 7.
