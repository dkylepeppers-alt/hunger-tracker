# Direct-Contact Soul Drain Design

## Objective

Prevent a participant's soul from decreasing unless the narrative establishes physical contact between that participant and the succubus during feeding. Indirect residue, clothing, scent, fantasy, proximity, and an absent target must never drain the participant.

## Classification Contract

Every analyzer event will include a required `contactMode` field:

- `none`: no feeding contact occurred;
- `indirect`: the succubus interacted with residue, clothing, an object, scent, fantasy, or another indirect trace while the target was not physically contacted;
- `direct`: the succubus physically contacted the target while feeding.

The JSON schema will require `contactMode` and restrict it to these three values. The parser will accept the canonical `contactMode` field and the documented `contact_mode` alias only.

## Reducer Boundary

Soul drain is authorized only when both conditions are true:

1. `contactMode` is `direct`;
2. `feedingIntensity` is one of `trace`, `moderate`, `deep`, or `full`.

All `none` and `indirect` events become non-feeding state events. They may still apply elapsed-time hunger and the separately classified hunger-pressure or exposure mappings, but they cannot reduce participant soul, relieve hunger through soul consumption, or increase `soulsConsumed`.

Inconsistent analyzer output is rejected rather than coerced. `contactMode: none` with non-`none` feeding intensity and `contactMode: direct` with `feedingIntensity: none` are validation failures. `indirect` may carry a non-`none` intensity as descriptive evidence, but the reducer will not treat it as soul transfer.

## Existing Analysis Records

The analyzer fingerprint version will increase from 1 to 2. Existing v1 records will no longer contribute reconstructed analyzer events and will appear as missing. This immediately removes historical indirect drains without guessing which old feeding records were legitimate. The user can run **Analyze missing** to reconstruct those messages with the new required contact classification.

Baselines, manual changes, exclusions, and legacy tracker events are unchanged.

## Visible Version

The settings header and current-chat state dialog will show the installed extension version. The UI will read this from SillyTavern's loaded extension manifest through `getExtensionManifest('elena-succubus-tracker')`; it will not duplicate a hard-coded version string in JavaScript.

## Failure Handling

Missing, unknown, or inconsistent `contactMode` values produce a terminal validation failure with the existing raw-response diagnostics and manual Retry action. There is no fallback inference and no automatic retry.

## Testing

Tests will prove that:

- the schema requires the contact mode enum;
- canonical and snake_case contact modes normalize correctly;
- inconsistent contact/intensity combinations are rejected;
- indirect residue never produces a feeding event or soul drain;
- direct feeding still produces deterministic soul drain;
- analyzer version 2 invalidates v1 message fingerprints;
- settings and state controls render the manifest version;
- existing baselines and manual events remain unchanged.
