---
applyTo: "tests/**/*.test.js"
---

# Test instructions

- Use `node:test` and `node:assert/strict`; do not introduce a separate test framework.
- Give each test a behavior-focused name and exercise real exported behavior where possible.
- Source-contract assertions are appropriate only for integration boundaries that cannot run outside SillyTavern; prefer value and state assertions for domain modules.
- Keep fixtures minimal and deterministic. Assert rollback and absence of partial mutation for rejected state changes.
- Run the focused test file first, then `npm test` and `npm run check`.
