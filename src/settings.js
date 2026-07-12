import { DEFAULT_EVENT_RULES, DEFAULT_HUNGER_TIERS, DEFAULT_SOUL_TIERS } from './state.js';

export const MODULE = 'succubus_state_tracker';
export const SETTINGS_VERSION = 5;

export function defaultProfileRules(source = {}) {
    return {
        initial: { hunger: 35, exposure: 0, soul: 100, ...(source.initial ?? {}) },
        hungerPerStoryHour: source.hungerPerStoryHour ?? 2,
        eventRules: structuredClone(source.eventRules ?? DEFAULT_EVENT_RULES),
        hungerTiers: structuredClone(source.hungerTiers ?? DEFAULT_HUNGER_TIERS),
        soulTiers: structuredClone(source.soulTiers ?? DEFAULT_SOUL_TIERS),
    };
}

export function migrateProfilesToV5(settings) {
    if ((settings.settingsVersion ?? 0) >= 5) return settings;
    const legacyRules = defaultProfileRules(settings);
    settings.profiles ??= [];
    for (const profile of settings.profiles) profile.rules ??= structuredClone(legacyRules);
    settings.settingsVersion = 5;
    return settings;
}

const DEFAULTS = Object.freeze({
    settingsVersion: SETTINGS_VERSION,
    enabled: true,
    profiles: [],
    hungerPerStoryHour: 2,
    eventRules: DEFAULT_EVENT_RULES,
    hungerTiers: DEFAULT_HUNGER_TIERS,
    soulTiers: DEFAULT_SOUL_TIERS,
    showStatusStrip: true,
});

export function getSettings() {
    const ctx = SillyTavern.getContext();
    if (!ctx.extensionSettings[MODULE]) ctx.extensionSettings[MODULE] = structuredClone(DEFAULTS);
    const settings = ctx.extensionSettings[MODULE];
    const previousVersion = settings.settingsVersion ?? 0;
    migrateProfilesToV5(settings);
    for (const [key, value] of Object.entries(DEFAULTS)) {
        if (settings[key] === undefined) settings[key] = structuredClone(value);
    }
    if (previousVersion < SETTINGS_VERSION) {
        ctx.saveSettingsDebounced();
    }
    return settings;
}

export function saveSettings() {
    SillyTavern.getContext().saveSettingsDebounced();
}

export function addProfile(entity) {
    const settings = getSettings();
    if (!settings.profiles.some(profile => profile.entityId === entity.id)) {
        settings.profiles.push({ id: crypto.randomUUID(), entityId: entity.id, name: entity.name, enabled: true, ruleRevision: 1, rules: defaultProfileRules() });
        saveSettings();
    }
}

export function removeProfile(profileId) {
    const settings = getSettings();
    settings.profiles = settings.profiles.filter(profile => profile.id !== profileId);
    saveSettings();
}
