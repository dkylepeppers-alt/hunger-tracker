# Chat-Local NPC Tracking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Detect chat NPC candidates, let users approve chat-local NPC soul tracking, and prevent unknown NPC feeding from draining the user persona.

**Architecture:** Versioned chat metadata owns candidate identity and approval status. The existing analyzer call returns candidates plus strict target identity, the controller stores candidates before validating events, and the reducer accepts feeding only for an exact approved roster target.

**Tech Stack:** Browser ES modules, SillyTavern chat metadata and popup UI, JSON Schema, Node.js built-in test runner.

## Global Constraints

- Make no additional model calls for NPC discovery.
- Never accept model-generated NPC IDs.
- Keep NPC identity and soul state local to one chat.
- Never fall back from an unknown or ambiguous target to the user persona.
- Preserve baselines, manual events, exclusions, and existing extension settings.
- Require explicit approval before an NPC joins the participant roster.

---

### Task 1: Versioned Chat-Local NPC Registry

**Files:**
- Modify: `src/store.js`
- Create: `src/npcs.js`
- Modify: `tests/store.test.js`
- Create: `tests/npcs.test.js`

**Interfaces:**
- Metadata version changes from 5 to 6 and always contains `npcs: { [id]: NpcRecord }`.
- `normalizeNpcName(name): string` lowercases and collapses whitespace.
- `mergeNpcCandidates(metadata, candidates, messageIndex, uuid): NpcRecord[]` deduplicates by normalized name and generates `npc:<uuid>` locally.
- `setNpcStatus(metadata, npcId, status)` accepts `pending`, `approved`, or `ignored`.
- `approvedNpcEntities(metadata): Entity[]` returns `{ id, name, kind: 'npc' }`.

- [ ] **Step 1: Write failing migration and registry tests**

Assert v5 metadata migrates without losing records and gains `npcs: {}`. Test that `"  Dr. Vale "` and `"dr.   vale"` merge into one locally generated record, evidence/source indexes update, invalid names are ignored, statuses change explicitly, and only approved records become entities.

- [ ] **Step 2: Run tests and verify RED**

Run: `node --test tests/store.test.js tests/npcs.test.js`

Expected: FAIL because metadata v6 and `src/npcs.js` do not exist.

- [ ] **Step 3: Implement migration and registry**

Migrate v5 by cloning existing metadata, setting `version: 6`, and initializing `npcs`. Generate IDs only through the injected `uuid` callback so tests are deterministic. Preserve first source index and update last source index/evidence/feeding flag.

- [ ] **Step 4: Run focused and full tests**

Run: `node --test tests/store.test.js tests/npcs.test.js && npm test`

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/store.js src/npcs.js tests/store.test.js tests/npcs.test.js
git commit -m "feat: add chat-local NPC candidate registry"
```

### Task 2: Analyzer Candidate and Target Identity Contract

**Files:**
- Modify: `src/analyzer.js`
- Modify: `tests/analyzer.test.js`

**Interfaces:**
- Parsed result is `{ events, npcCandidates }`.
- Candidate shape is `{ name, evidence, involvedInFeeding }`.
- Canonical event adds `targetName` and `targetKind`.
- `analyzerResultToEvents(result, roster, rules, sourceKey, options)` consumes `options.hasUnapprovedCandidates`.

- [ ] **Step 1: Write failing schema and validation tests**

Require `npcCandidates`, `targetName`, and `targetKind` in the strict schema. Add tests for canonical candidate parsing; exact ID/name/kind matching; untracked NPC target rejection; and persona direct-feeding rejection when unapproved candidates exist.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `node --test tests/analyzer.test.js`

Expected: FAIL because the candidate and target identity contract is absent.

- [ ] **Step 3: Implement contract and guard**

Normalize only documented snake_case aliases. For direct feeding, resolve `targetId` in `roster.participants`, then require exact `targetName === entity.name` and `targetKind === entity.kind`. Reject `untracked_npc`. If candidates exist and the resolved target kind is `persona`, throw `Target is ambiguous while unapproved NPC candidates are present`.

- [ ] **Step 4: Set analyzer version 3 and update request instruction**

Require the model to report new named NPCs as candidates, use `untracked_npc` rather than a persona fallback, and return events only against matching target identity.

- [ ] **Step 5: Run focused and full tests**

Run: `node --test tests/analyzer.test.js && npm test`

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/analyzer.js tests/analyzer.test.js
git commit -m "feat: add strict NPC discovery and target identity"
```

### Task 3: Approved NPC Roster and Stable Fingerprints

**Files:**
- Modify: `src/chat.js`
- Modify: `tests/profiles.test.js`
- Modify: `tests/rebuild.test.js`

**Interfaces:**
- `activeRoster` appends `approvedNpcEntities(ctx.chatMetadata.succubusStateTracker)` to present participants.
- `analysisKey` excludes `kind: 'npc'` from the roster component while still including succubi and card/persona participants.

- [ ] **Step 1: Write failing roster and fingerprint tests**

Assert pending/ignored NPCs stay out of the roster, an approved NPC joins as an independent participant, and approving an NPC does not change the fingerprint of an unrelated message. Assert analyzer version 3 makes v2 records inactive.

- [ ] **Step 2: Run tests and verify RED**

Run: `node --test tests/profiles.test.js tests/rebuild.test.js`

Expected: FAIL because approved NPCs are not in the roster and fingerprints still include every participant.

- [ ] **Step 3: Implement roster and fingerprint rules**

Append approved NPC entities without adding them to global `all` character/persona choices. Keep their baseline under the NPC ID. Build fingerprint roster IDs from succubi plus non-NPC participants only.

- [ ] **Step 4: Run focused and full tests**

Run: `node --test tests/profiles.test.js tests/rebuild.test.js && npm test`

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/chat.js tests/profiles.test.js tests/rebuild.test.js
git commit -m "feat: add approved NPCs to chat-local roster"
```

### Task 4: Controller Persistence and Approval UI

**Files:**
- Modify: `index.js`
- Modify: `src/ui.js`
- Modify: `tests/architecture.test.js`

**Interfaces:**
- Controller merges candidates before event conversion and saves metadata even when target validation fails.
- `openStateDrawer` receives `setNpcStatusAndRebuild(npcId, status)` and `retryAnalysis(messageIndex)`.
- UI renders `#sst-npc-candidates` with approve, ignore, restore, and untrack actions.

- [ ] **Step 1: Write failing architecture tests**

Require controller use of `mergeNpcCandidates`, UI candidate section markup, and handlers for `data-npc-status`. Require candidate diagnostics to include the source message index and feeding flag.

- [ ] **Step 2: Run architecture tests and verify RED**

Run: `node --test tests/architecture.test.js`

Expected: FAIL because controller and UI do not support NPC candidates.

- [ ] **Step 3: Integrate candidate persistence before validation**

After parsing analyzer output, call `mergeNpcCandidates` with `crypto.randomUUID`. Save metadata immediately when candidates change. Then call event conversion with `hasUnapprovedCandidates` based on candidates reported by that result. Preserve existing terminal failure diagnostics.

- [ ] **Step 4: Add approval UI and actions**

Render pending, approved, and ignored chat-local records. Approval and status changes save metadata and rebuild. Pending candidates involved in feeding show `Approve, then retry message <index>`. Approved NPCs continue to appear in the participant soul controls.

- [ ] **Step 5: Run focused and full checks**

Run: `node --test tests/architecture.test.js && npm test && npm run check && git diff --check`

Expected: all tests and checks pass.

- [ ] **Step 6: Commit**

```bash
git add index.js src/ui.js tests/architecture.test.js
git commit -m "feat: add NPC approval and recovery controls"
```

### Task 5: Release and Runtime Verification

**Files:**
- Modify: `manifest.json`
- Modify: `package.json`

**Interfaces:**
- Release version is `5.2.0`.

- [ ] **Step 1: Set both release versions to 5.2.0**

- [ ] **Step 2: Run fresh verification**

Run: `npm test && npm run check && git diff --check`

Expected: all tests pass and checks exit zero.

- [ ] **Step 3: Commit release**

```bash
git add manifest.json package.json
git commit -m "chore: release chat-local NPC tracking 5.2.0"
```

- [ ] **Step 4: Restart and verify served assets**

Restart `node server.js`. Verify served version `5.2.0`, analyzer version 3, `npcCandidates` schema, and NPC candidate UI controls.
