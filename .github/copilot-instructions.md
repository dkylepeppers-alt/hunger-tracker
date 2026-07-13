# Copilot repository instructions

- Read and follow the root `AGENTS.md` before proposing or editing code; it is the canonical architecture and safety contract.
- Inspect the nearest focused tests and the relevant module before changing behavior.
- Use red-green-refactor. State which focused test should fail, make the smallest implementation change, then run `npm test` and `npm run check`.
- Keep changes narrow, dependency-free, and compatible with plain browser ES modules.
- Treat identity, schema-v8 reset behavior, analyzer isolation, deterministic reconstruction, atomic NPC changes, HTML escaping, and accessibility as hard invariants.
- In code review, prioritize correctness, stale-state races, partial persistence, unsafe HTML, unsupported SillyTavern APIs, and missing regression tests over style-only comments.
