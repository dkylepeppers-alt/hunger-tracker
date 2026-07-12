import { DEFAULT_EVENT_RULES, DEFAULT_HUNGER_TIERS, DEFAULT_SOUL_TIERS } from './state.js';

export const MODULE = 'succubus_state_tracker';
export const SETTINGS_VERSION = 3;

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
    for (const [key, value] of Object.entries(DEFAULTS)) {
        if (settings[key] === undefined) settings[key] = structuredClone(value);
    }
    if (settings.settingsVersion < SETTINGS_VERSION) {
        settings.settingsVersion = SETTINGS_VERSION;
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
        settings.profiles.push({ id: crypto.randomUUID(), entityId: entity.id, name: entity.name, enabled: true });
        saveSettings();
    }
}

export function removeProfile(profileId) {
    const settings = getSettings();
    settings.profiles = settings.profiles.filter(profile => profile.id !== profileId);
    saveSettings();
}
