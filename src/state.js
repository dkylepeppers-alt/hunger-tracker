export const DEFAULT_HUNGER_TIERS = Object.freeze([
    { id: 'satiated', label: 'Satiated', min: 0, max: 24, drainMin: 1, drainMax: 5, reliefPerSoul: 1, tendency: 'Low', instruction: 'Act composed and restrained. Feeding is optional and should be light.' },
    { id: 'controlled', label: 'Controlled', min: 25, max: 49, drainMin: 3, drainMax: 12, reliefPerSoul: 1, tendency: 'Moderate', instruction: 'Show a noticeable appetite while retaining judgment and restraint.' },
    { id: 'strained', label: 'Strained', min: 50, max: 74, drainMin: 8, drainMax: 25, reliefPerSoul: 1, tendency: 'High', instruction: 'Hunger strongly colors attention, patience, and attraction to available souls.' },
    { id: 'predatory', label: 'Predatory', min: 75, max: 89, drainMin: 15, drainMax: 50, reliefPerSoul: 1, tendency: 'Very high', instruction: 'Behave overtly predatory. Restraint is difficult and feeding becomes a leading priority.' },
    { id: 'critical', label: 'Critical', min: 90, max: 100, drainMin: 25, drainMax: 100, reliefPerSoul: 1, tendency: 'Compulsive', instruction: 'Hunger dominates behavior. Treat access to a soul as urgent and stopping as extremely difficult.' },
]);

export const DEFAULT_SOUL_TIERS = Object.freeze([
    { id: 'intact', label: 'Intact', min: 76, max: 100, instruction: 'The soul is healthy and behavior is largely unaffected.' },
    { id: 'touched', label: 'Touched', min: 51, max: 75, instruction: 'Show subtle fatigue, fascination, and increased sensitivity to the succubus.' },
    { id: 'weakened', label: 'Weakened', min: 26, max: 50, instruction: 'Show clear weakness, emotional vulnerability, and difficulty resisting further influence.' },
    { id: 'fractured', label: 'Fractured', min: 1, max: 25, instruction: 'Act profoundly drained, dependent, and spiritually unstable.' },
    { id: 'depleted', label: 'Depleted', min: 0, max: 0, instruction: 'The soul is depleted. Remain alive unless the narrative establishes otherwise, but act hollow, exhausted, and strongly altered.' },
]);

const INTENSITY_FRACTIONS = Object.freeze({ trace: 0, moderate: 1 / 3, deep: 2 / 3, full: 1 });

export function clamp(value, min, max) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : min;
}

export function tierFor(value, tiers) {
    const number = clamp(value, 0, 100);
    return tiers.find(tier => number >= tier.min && number <= tier.max) ?? tiers.at(-1);
}

export function drainForIntensity(tier, intensity) {
    const fraction = INTENSITY_FRACTIONS[intensity];
    if (fraction === undefined) throw new Error(`Unknown feeding intensity: ${intensity}`);
    return Math.round(tier.drainMin + (tier.drainMax - tier.drainMin) * fraction);
}

function succubusState(entity, baseline = {}) {
    const hunger = clamp(baseline.hunger ?? 35, 0, 100);
    return {
        id: entity.id, name: entity.name, kind: entity.kind,
        hunger, condition: tierFor(hunger, DEFAULT_HUNGER_TIERS).id,
        exposure: clamp(baseline.exposure ?? 0, 0, 100),
        soulsConsumed: Math.max(0, Number(baseline.soulsConsumed ?? 0) || 0),
        storyHours: Math.max(0, Number(baseline.storyHours ?? 0) || 0),
        lastFeedStoryHour: baseline.lastFeedStoryHour ?? null,
        lastFeed: baseline.lastFeed ?? 'before chat',
    };
}

function participantState(entity, baseline = {}) {
    const soul = clamp(baseline.soul ?? 100, 0, 100);
    return { id: entity.id, name: entity.name, kind: entity.kind, soul, condition: tierFor(soul, DEFAULT_SOUL_TIERS).id };
}

export function createChatState(succubi, participants, baselines = {}, rules = {}) {
    const state = {
        version: 3,
        succubi: {}, participants: {}, events: [], warnings: [],
        rules: {
            hungerPerStoryHour: Number.isFinite(Number(rules.hungerPerStoryHour)) ? Number(rules.hungerPerStoryHour) : 2,
            hungerTiers: rules.hungerTiers ?? structuredClone(DEFAULT_HUNGER_TIERS),
            soulTiers: rules.soulTiers ?? structuredClone(DEFAULT_SOUL_TIERS),
        },
    };
    for (const entity of succubi) state.succubi[entity.id] = succubusState(entity, baselines[entity.id]);
    for (const entity of participants) state.participants[entity.id] = participantState(entity, baselines[entity.id]);
    return state;
}

function updateDerived(state, entityId) {
    if (state.succubi[entityId]) {
        state.succubi[entityId].condition = tierFor(state.succubi[entityId].hunger, state.rules.hungerTiers).id;
    }
    if (state.participants[entityId]) {
        state.participants[entityId].condition = tierFor(state.participants[entityId].soul, state.rules.soulTiers).id;
    }
}

export function applyEvent(state, event) {
    if (event.type === 'manual') {
        const entity = state.succubi[event.entityId] ?? state.participants[event.entityId];
        if (!entity || !(event.field in entity)) return { ok: false, error: 'Unknown entity or field' };
        const ranges = ['hunger', 'exposure', 'soul'].includes(event.field) ? [0, 100] : [0, Number.MAX_SAFE_INTEGER];
        entity[event.field] = clamp(event.value, ...ranges);
        updateDerived(state, event.entityId);
        state.events.push({ ...event });
        return { ok: true };
    }

    const succubus = state.succubi[event.succubusId];
    if (!succubus) return { ok: false, error: 'Unknown succubus' };
    const target = event.type === 'feeding' ? state.participants[event.targetId] : null;
    if (event.type === 'feeding' && !target) return { ok: false, error: 'Unknown feeding target' };
    if (event.type === 'feeding' && target.soul <= 0) return { ok: false, error: 'Target soul is already depleted' };
    const elapsedHours = clamp(event.elapsedHours, 0, 720);
    const timeHungerGain = elapsedHours * state.rules.hungerPerStoryHour;
    const eventHungerChange = clamp(event.hungerDelta ?? 0, -100, 100);
    succubus.storyHours += elapsedHours;
    succubus.hunger = clamp(succubus.hunger + timeHungerGain + eventHungerChange, 0, 100);
    succubus.exposure = clamp(succubus.exposure + Number(event.exposureDelta ?? 0), 0, 100);

    if (event.type === 'feeding') {
        const tier = tierFor(succubus.hunger, state.rules.hungerTiers);
        const requested = drainForIntensity(tier, event.intensity);
        const soulDrain = Math.min(target.soul, requested);
        target.soul = clamp(target.soul - soulDrain, 0, 100);
        succubus.soulsConsumed += soulDrain;
        succubus.hunger = clamp(succubus.hunger - soulDrain * tier.reliefPerSoul, 0, 100);
        succubus.lastFeedStoryHour = succubus.storyHours;
        succubus.lastFeed = event.note || `${event.intensity} feeding from ${target.name}`;
        updateDerived(state, target.id);
        updateDerived(state, succubus.id);
        state.events.push({ ...event, timeHungerGain, eventHungerChange, soulDrain, hungerRelief: soulDrain * tier.reliefPerSoul });
        return { ok: true };
    }

    updateDerived(state, succubus.id);
    state.events.push({ ...event, timeHungerGain, eventHungerChange });
    return { ok: true };
}

export function rebuildState({ succubi, participants, events = [], excludedIds = [], baselines = {}, rules = {}, warnings = [] }) {
    const state = createChatState(succubi, participants, baselines, rules);
    state.warnings = [...warnings];
    const excluded = new Set(excludedIds);
    for (const event of events) {
        if (excluded.has(event.id)) continue;
        const result = applyEvent(state, event);
        if (!result.ok) state.warnings.push({ id: event.id, message: result.error, source: event });
    }
    return state;
}
