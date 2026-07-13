# Chat-Local NPC Tracking Design

## Objective

Detect named NPCs in analyzed exchanges, let the user approve which NPCs receive tracked soul state, and prevent feeding on an NPC from ever being applied to the user persona through target guessing.

## Discovery Contract

The existing analyzer response gains a required `npcCandidates` array alongside `events`. Each candidate contains:

- `name`: the NPC's displayed narrative name;
- `evidence`: a short description of where the NPC appeared;
- `involvedInFeeding`: whether the exchange depicts the NPC as a possible feeding target.

Discovery is part of the existing single analyzer request. It does not add another provider call. The analyzer must not report configured succubi, character-card participants, the active persona, unnamed crowds, generic roles without a usable name, or purely hypothetical people as candidates.

## Chat-Local Identity and Storage

Chat metadata will migrate to version 6 and add an `npcs` map. Each entry contains:

- a locally generated stable ID in the form `npc:<uuid>`;
- display name and normalized name;
- status: `pending`, `approved`, or `ignored`;
- evidence;
- first and most recent source message indexes;
- whether any source exchange involved possible feeding.

Names are normalized case-insensitively with collapsed whitespace for deduplication. IDs are generated only by the extension and never by the model. NPC metadata belongs only to the current chat and is preserved in chat branches through normal SillyTavern metadata behavior.

Approved NPCs join the active roster as participants with `kind: npc` and independent soul state. Pending and ignored candidates never join the roster and cannot receive applied feeding events.

## Approval Lifecycle

The current-chat state controls gain an **NPC candidates** section:

- pending candidates show **Approve** and **Ignore**;
- ignored candidates can be restored to pending;
- approved NPCs show their tracked soul with the existing participant state control and can be removed from tracking by returning them to pending.

Approval does not retroactively apply a feeding event. If the NPC was involved in feeding on their first appearance, the UI identifies the source message so the user can manually retry that message after approval.

## Target Identity Contract

Every analyzer event gains required target identity fields:

- `targetId`;
- `targetName`;
- `targetKind`: `none`, `character`, `persona`, `npc`, or `untracked_npc`.

For any direct feeding event, the ID, name, and kind must match the same approved roster participant exactly. A target with `targetKind: untracked_npc` is never applied and must correspond to an NPC candidate.

The extension does not fall back from an unknown target to the user persona.

## Persona-Soul Ambiguity Guard

If an exchange reports one or more unapproved NPC candidates and also attempts direct soul drain against the user persona, the analysis is stored as a terminal target-ambiguity failure after the candidates are saved. No feeding event from that analysis is applied. The user may approve the correct NPC and retry the source message.

This deliberately favors no drain over draining the wrong entity. It may block a legitimate user feeding event when a new NPC is introduced in the same exchange, but it cannot silently charge an NPC feeding to the user.

## Analyzer and Record Versions

The analyzer contract version increases from 2 to 3. Existing v2 records become inactive and appear as missing because they lack the new candidate and target identity contract.

Approving an NPC must not invalidate unrelated analysis records. Message fingerprints will continue to include configured succubi and non-NPC present entities but exclude chat-local approved NPC IDs. Retrying a candidate's source message explicitly replaces only that message's current record.

## Data Flow

1. Build the roster from active card/persona entities plus approved chat-local NPCs.
2. Make one isolated analyzer request.
3. Parse and validate the candidate array and event fields.
4. Merge candidate discoveries into chat metadata before event conversion.
5. Apply the ambiguity guard and strict target identity validation.
6. Persist either validated events or one terminal diagnostic record.
7. Rebuild state from approved participants and current records.

## Failure Handling

Malformed candidate data, model-supplied NPC IDs, target identity mismatches, unknown targets, and persona ambiguity are terminal validation failures. Candidate discoveries that were valid before an event validation failure remain available for approval. There is no automatic approval, automatic retry, fallback target, or second analyzer call.

## Testing

Tests will cover:

- strict `npcCandidates` and target identity schema fields;
- candidate normalization, deduplication, and chat metadata migration;
- pending, approved, and ignored roster behavior;
- independent NPC and persona soul values;
- exact target ID/name/kind validation;
- untracked NPC feeding never reducing persona soul;
- persona ambiguity blocking all drain while preserving candidates;
- approval not invalidating unrelated message fingerprints;
- analyzer version 3 invalidating v2 records;
- approval, ignore, restore, and source-message retry UI wiring;
- preservation of existing baselines, manual events, exclusions, and approved NPC metadata.
