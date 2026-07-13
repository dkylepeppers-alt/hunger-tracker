# Automatic NPC Approval Design

**Date:** 2026-07-13

**Status:** Approved

## Goal

Automatically add valid analyzer-discovered NPCs to the current chat's tracked participant roster while preserving strict target identity. A newly discovered feeding target must be usable in the same analysis result without a manual approval step, a second analyzer request, or any fallback to the user persona.

## Scope

This change applies only to chat-local NPC candidate approval and recovery. It does not change global character or persona profiles, analyzer connection settings, state rules, prompt placement, or the rule that NPC IDs are generated locally.

## Candidate Status Rules

- A valid newly discovered NPC is created with `approved` status.
- Metadata version 6 migrates to version 7. Every legacy `pending` NPC becomes `approved`.
- An explicitly `ignored` NPC remains ignored during migration and future detections.
- An approved NPC may be changed to `ignored` from the drawer. An ignored NPC may be restored directly to `approved`.
- The `pending` value remains accepted only while reading legacy metadata; normal version 7 behavior never creates or restores an NPC to `pending`.

These rules make automatic approval the default without removing the user's ability to opt out of tracking a particular name.

## Same-Result Target Resolution

The analyzer continues to report a first-seen feeding target as:

- an empty `targetId`;
- `targetKind: "untracked_npc"`; and
- a human-readable `targetName`.

After merging `npcCandidates`, the controller may resolve that target to a local NPC only when all of the following are true:

1. The event has `targetKind: "untracked_npc"` and an empty `targetId`.
2. The result's `npcCandidates` contains a feeding-involved candidate whose normalized name exactly matches the event target name.
3. The chat-local registry contains exactly one approved record with that normalized name.

Resolution replaces the event target fields with the locally owned record's ID, canonical name, and `npc` kind. It also adds that approved record to an effective validation roster for this result. The original job roster and its profile rules remain unchanged.

The controller must not resolve partial names, aliases, fuzzy matches, duplicate matches, ignored records, or targets absent from the same analyzer result. Unresolved `untracked_npc` events continue to fail validation. No path may substitute a character or persona ID.

## Data Flow

1. A queued assistant response is analyzed against its starting roster.
2. The controller parses the strict analyzer result.
3. Candidate records are merged into versioned chat metadata. New records are approved automatically.
4. The controller resolves eligible first-seen NPC targets to local IDs using the rules above.
5. Event validation runs against the effective roster.
6. A valid event is stored as a terminal complete record and immediately participates in state reconstruction.
7. Candidate and analysis record changes are saved through SillyTavern chat metadata.

This flow performs one analyzer call for the response. Approval and target recovery are deterministic local operations.

## Drawer Behavior

The chat-local NPC section remains visible for auditability.

- Approved rows show `Ignore`.
- Ignored rows show `Restore`.
- The manual `Approve`, `Untrack`, pending guidance, and approval-specific retry controls are removed.
- Status changes still save metadata and rebuild the current roster and state.

General failed-analysis retry controls remain available for unrelated transport, parse, or validation failures. Previously failed records are not silently rewritten during metadata migration.

## Error Handling

- Invalid candidate names remain discarded.
- Missing, ambiguous, or ignored name matches remain unresolved and fail under the existing strict target validator.
- An unavailable record during a drawer action produces the existing warning and no state change.
- Automatic approval never triggers an additional model request.
- Existing terminal failed records remain terminal until the user explicitly retries or reanalyzes them.

## Testing

Tests will prove the behavior rather than only search source text:

- New candidates default to approved while ignored candidates stay ignored when rediscovered.
- Version 6 migration promotes pending records and preserves approved and ignored records.
- Exact same-result feeding targets resolve to local NPC IDs.
- Missing, non-feeding, ignored, ambiguous, and fuzzy matches do not resolve.
- The effective roster accepts the resolved event without changing unrelated fingerprints.
- Drawer markup exposes Ignore and Restore without manual approval controls.
- The full test suite, syntax checks, and whitespace checks pass.

## Release and Live Verification

The manifest and package versions will advance together to `5.4.0`. Verification will confirm that SillyTavern serves the updated manifest and source files from `data/default-user/extensions/elena-succubus-tracker` byte-for-byte. A client reload will activate the new browser module and run metadata migration for the open chat.
