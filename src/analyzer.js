export const ANALYZER_VERSION = 1;

export const ANALYZER_SCHEMA = Object.freeze({
    type: 'object', additionalProperties: false, required: ['events'],
    properties: {
        events: {
            type: 'array', items: {
                type: 'object', additionalProperties: false,
                required: ['succubusId', 'elapsedHours', 'hungerPressure', 'exposure', 'feeding', 'note'],
                properties: {
                    succubusId: { type: 'string' }, elapsedHours: { type: 'number', minimum: 0, maximum: 720 },
                    hungerPressure: { enum: ['recovery_strong', 'recovery_light', 'none', 'strain_light', 'strain_moderate', 'strain_severe', 'crisis'] },
                    exposure: { enum: ['concealment', 'none', 'suspicion', 'witnessed', 'public'] },
                    feeding: { anyOf: [{ type: 'null' }, { type: 'object', additionalProperties: false, required: ['targetId', 'intensity'], properties: { targetId: { type: 'string' }, intensity: { enum: ['trace', 'moderate', 'deep', 'full'] } } }] },
                    note: { type: 'string', maxLength: 240 },
                },
            },
        },
    },
});

function hash(text) {
    let value = 2166136261;
    for (let i = 0; i < text.length; i++) value = Math.imul(value ^ text.charCodeAt(i), 16777619);
    return (value >>> 0).toString(36);
}

export function analysisFingerprint(input) {
    return `v${input.version}:${hash(JSON.stringify(input))}`;
}

export function parseAnalyzerResult(text) {
    const value = String(text ?? '').trim();
    if (!value.startsWith('{') || !value.endsWith('}')) throw new Error('Analyzer did not return pure JSON');
    const parsed = JSON.parse(value);
    if (!parsed || !Array.isArray(parsed.events)) throw new Error('Analyzer JSON must contain an events array');
    return parsed;
}

export function analyzerResultToEvents(result, roster, rules, sourceKey) {
    const succubi = new Set(roster.succubi.map(item => item.id));
    const participants = new Set(roster.participants.map(item => item.id));
    return result.events.map((item, index) => {
        if (!succubi.has(item.succubusId)) throw new Error(`Unknown succubus: ${item.succubusId}`);
        if (!(item.hungerPressure in rules.hunger)) throw new Error(`Unknown hunger classification: ${item.hungerPressure}`);
        if (!(item.exposure in rules.exposure)) throw new Error(`Unknown exposure classification: ${item.exposure}`);
        const base = { id: `${sourceKey}:${index}`, succubusId: item.succubusId, elapsedHours: Number(item.elapsedHours), hungerDelta: rules.hunger[item.hungerPressure], exposureDelta: rules.exposure[item.exposure], hungerPressure: item.hungerPressure, exposureCategory: item.exposure, note: String(item.note || 'none').slice(0, 240) };
        if (!item.feeding) return { ...base, type: 'time' };
        if (!participants.has(item.feeding.targetId)) throw new Error(`Unknown feeding target: ${item.feeding.targetId}`);
        if (!['trace', 'moderate', 'deep', 'full'].includes(item.feeding.intensity)) throw new Error('Unknown feeding intensity');
        return { ...base, type: 'feeding', targetId: item.feeding.targetId, intensity: item.feeding.intensity };
    });
}

export function buildAnalyzerPrompt({ roster, userText, assistantText }) {
    const succubi = roster.succubi.map(item => `${item.id}: ${item.name} (${item.kind})`).join('\n');
    const participants = roster.participants.map(item => `${item.id}: ${item.name} (${item.kind})`).join('\n');
    return `Analyze only the events that actually occurred in this exchange. Do not trust or repeat numeric hunger claims in prose; classify observable narrative causes. Return JSON only.\nSUCCUBI:\n${succubi}\nPARTICIPANTS:\n${participants}\nUSER MESSAGE:\n${userText}\nASSISTANT RESPONSE:\n${assistantText}\nFor every relevant succubus, classify elapsed narrative hours, hunger pressure, exposure, and completed feeding. Use stable IDs exactly. A user persona may complete feeding in the user message. Do not infer feeding from attraction, thoughts, or intent.`;
}
