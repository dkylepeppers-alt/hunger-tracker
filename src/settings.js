import { SETTINGS_KEY } from './identity.js';
import { DEFAULT_EVENT_RULES, DEFAULT_HUNGER_TIERS, DEFAULT_SOUL_TIERS } from './state.js';

export const SETTINGS_VERSION = 8;
export const ANALYZER_DEFAULTS = Object.freeze({
    analyzerMaxTokens: 1000,
    analyzerTemperature: 0,
    analyzerUseProfilePreset: false,
});

export function defaultProfileRules(source = {}) {
    return {
        initial: { hunger: 35, exposure: 0, soul: 100, ...(source.initial ?? {}) },
        hungerPerStoryHour: source.hungerPerStoryHour ?? 2,
        eventRules: structuredClone(source.eventRules ?? DEFAULT_EVENT_RULES),
        hungerTiers: structuredClone(source.hungerTiers ?? DEFAULT_HUNGER_TIERS),
        soulTiers: structuredClone(source.soulTiers ?? DEFAULT_SOUL_TIERS),
    };
}

export function createDefaultSettings() {
    return {
        settingsVersion: SETTINGS_VERSION,
        analyzerProfileId: '',
        ...ANALYZER_DEFAULTS,
        enabled: true,
        profiles: [],
        hungerPerStoryHour: 2,
        eventRules: structuredClone(DEFAULT_EVENT_RULES),
        hungerTiers: structuredClone(DEFAULT_HUNGER_TIERS),
        soulTiers: structuredClone(DEFAULT_SOUL_TIERS),
        showStatusStrip: true,
    };
}

export function getSettings() {
    const ctx = SillyTavern.getContext();
    let settings = ctx.extensionSettings[SETTINGS_KEY];
    if (settings?.settingsVersion !== SETTINGS_VERSION) {
        settings = createDefaultSettings();
        ctx.extensionSettings[SETTINGS_KEY] = settings;
        ctx.saveSettingsDebounced();
        return settings;
    }

    let changed = false;
    for (const [key, value] of Object.entries(createDefaultSettings())) {
        if (settings[key] === undefined) {
            settings[key] = value;
            changed = true;
        }
    }
    if (changed) ctx.saveSettingsDebounced();
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
