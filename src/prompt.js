function activeTier(tiers, id) {
    return tiers.find(tier => tier.id === id) ?? tiers[0];
}

export function buildStatePrompt(state) {
    const lines = [
        'AUTHORITATIVE QUALITATIVE SUCCUBUS CONTINUITY — the following behavior and sensations are binding.',
        'State numbers, thresholds, ranges, counters, and arithmetic are out-of-character design data. Never mention, quote, count, calculate, or allude to numeric state in dialogue, narration, or internal monologue. Express the effects only through natural behavior and sensation.',
    ];

    for (const succubus of Object.values(state.succubi)) {
        const tier = activeTier(state.profileRules[succubus.id]?.hungerTiers ?? state.rules.hungerTiers, succubus.condition);
        lines.push(`${succubus.name}: ${tier.instruction} Feeding tendency: ${tier.tendency}. This must materially affect choices, attention, restraint, sensations, and reactions without explicit state language.`);
        if (succubus.kind === 'persona') {
            lines.push(`${succubus.name} is the user's succubus persona. Never dictate the user's actions.`);
        }
    }
    for (const participant of Object.values(state.participants)) {
        const firstRules = state.profileRules[Object.keys(state.succubi)[0]];
        const tier = activeTier(firstRules?.soulTiers ?? state.rules.soulTiers, participant.condition);
        lines.push(`${participant.name}: ${tier.instruction}`);
    }
    return { text: lines.join('\n') };
}

export function compactStateSummary(state) {
    if (!state) return 'No active succubus profiles in this chat.';
    const succubi = Object.values(state.succubi).map(item => `${item.name}: hunger ${Math.round(item.hunger)}/100 (${item.condition}), exposure ${Math.round(item.exposure)}/100, souls consumed ${Math.round(item.soulsConsumed)}`);
    const participants = Object.values(state.participants).map(item => `${item.name}: soul ${Math.round(item.soul)}/100 (${item.condition})`);
    return [...succubi, ...participants].join('; ') || 'No active succubus profiles in this chat.';
}
