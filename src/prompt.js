import { reverseIdMap, shortIdMap } from './profiles.js';

function activeTier(tiers, id) {
    return tiers.find(tier => tier.id === id) ?? tiers[0];
}

export function buildStatePrompt(state) {
    const entities = [...Object.values(state.succubi), ...Object.values(state.participants)];
    const idMap = shortIdMap(entities);
    const shortByStable = reverseIdMap(idMap);
    const lines = [
        'AUTHORITATIVE SUCCUBUS STATE — treat these values and active behavior instructions as binding continuity facts.',
        `Passive hunger growth is ${state.rules.hungerPerStoryHour} hunger per story hour. Also report event hunger changes from exertion, magic use, stress, supernatural triggers, or recovery.`,
    ];

    for (const succubus of Object.values(state.succubi)) {
        const tier = activeTier(state.rules.hungerTiers, succubus.condition);
        lines.push(`${succubus.name} [${shortByStable[succubus.id]}], succubus: Hunger ${Math.round(succubus.hunger)}/100 (${tier.label}); Exposure ${Math.round(succubus.exposure)}/100; Souls consumed ${Math.round(succubus.soulsConsumed)}; Story time ${succubus.storyHours.toFixed(1)}h.`);
        lines.push(`ACTIVE BEHAVIOR for ${succubus.name}: ${tier.instruction} Feeding tendency: ${tier.tendency}. This must materially affect choices, attention, restraint, and reactions.`);
        if (succubus.kind === 'persona') {
            lines.push(`${succubus.name} is the user's succubus persona. Never dictate the user's actions. Confirm any feeding described in the user message as a completed event in your tracker.`);
        }
    }
    for (const participant of Object.values(state.participants)) {
        const tier = activeTier(state.rules.soulTiers, participant.condition);
        lines.push(`${participant.name} [${shortByStable[participant.id]}], soul-bearing participant: Soul ${Math.round(participant.soul)}/100 (${tier.label}).`);
        lines.push(`ACTIVE BEHAVIOR for ${participant.name}: ${tier.instruction}`);
    }

    lines.push('At the absolute end of every response, output one event per relevant succubus on its own line. Use stable IDs exactly as shown.');
    lines.push('No feeding: [SUCCUBUS_EVENT v=3; s=s1; hours=0; hunger=0; exposure=0; note=none][/SUCCUBUS_EVENT]');
    lines.push('Feeding: [SUCCUBUS_EVENT v=3; s=s1; t=s2; hours=0; hunger=0; intensity=trace|moderate|deep|full; exposure=0; note=brief note without semicolons][/SUCCUBUS_EVENT]');
    lines.push('The hunger=-100..100 field is the hunger change caused by story events only; do not include passive time gain or feeding relief because the engine calculates those. Report narrative time, not response count. Feeding intensity describes what occurred; the state engine calculates exact soul drain from current hunger. Do not discuss or explain tracker events.');
    return { text: lines.join('\n'), idMap };
}

export function compactStateSummary(state) {
    if (!state) return 'No active succubus profiles in this chat.';
    const succubi = Object.values(state.succubi).map(item => `${item.name}: hunger ${Math.round(item.hunger)}/100 (${item.condition}), exposure ${Math.round(item.exposure)}/100, souls consumed ${Math.round(item.soulsConsumed)}`);
    const participants = Object.values(state.participants).map(item => `${item.name}: soul ${Math.round(item.soul)}/100 (${item.condition})`);
    return [...succubi, ...participants].join('; ') || 'No active succubus profiles in this chat.';
}
