# Succubus State Tracker

A local SillyTavern extension for assigning configurable succubus state profiles to character cards or user personas. It supports solo and group chats, participant soul reserves, deterministic feeding rules, editable behavior tiers, and per-chat event ledgers.

## Installation

Place this repository at `data/<user>/extensions/elena-succubus-tracker`, reload SillyTavern, then open **Extensions → Succubus State Tracker**. Choose any character or persona in **Assign the succubus role**.

## Development

```bash
npm test
npm run check
```

State is stored per chat. Global profiles and rule mappings are stored in SillyTavern extension settings. The `.tavernkeeper-managed.json` file is intentionally local-only.
