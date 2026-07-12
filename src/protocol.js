const OPEN = '[SUCCUBUS_EVENT';
const CANDIDATE_RE = /\[SUCCUBUS_EVENT\s+([^\]\r\n]+)\](?:\[\/SUCCUBUS_EVENT\]|\[SUCCUBUS_EVENT\])/gi;
const LEGACY_RE = /\[ELENA_DELTA\|[^\r\n]*?(?:\]\[\/ELENA_DELTA\]|\|\/ELENA_DELTA\])/gi;
const STRICT_NUMERIC = /^-?(?:\d+\.?\d*|\.\d+)$/;

function fieldsFrom(body) {
    const fields = {};
    for (const part of body.split(';')) {
        const index = part.indexOf('=');
        if (index < 1) continue;
        fields[part.slice(0, index).trim().toLowerCase()] = part.slice(index + 1).trim();
    }
    return fields;
}

function numberField(fields, key, min, max) {
    if (!STRICT_NUMERIC.test(fields[key] ?? '')) throw new Error(`${key} must be a number`);
    const value = Number(fields[key]);
    if (value < min || value > max) throw new Error(`${key} must be between ${min} and ${max}`);
    return value;
}

export function parseTrackerEvents(text, idMap, sourceKey) {
    const events = [];
    const warnings = [];
    CANDIDATE_RE.lastIndex = 0;
    let match;
    let index = 0;
    while ((match = CANDIDATE_RE.exec(String(text ?? '')))) {
        try {
            const fields = fieldsFrom(match[1]);
            if (fields.v !== '3') throw new Error('v must be 3');
            const succubusId = idMap[fields.s];
            if (!succubusId) throw new Error('s does not resolve to an active succubus');
            const elapsedHours = numberField(fields, 'hours', 0, 720);
            const hungerDelta = fields.hunger == null || fields.hunger === '' ? 0 : numberField(fields, 'hunger', -100, 100);
            const exposureDelta = numberField(fields, 'exposure', -100, 100);
            const note = String(fields.note || 'none').replace(/[\r\n]/g, ' ').slice(0, 240);
            const base = { id: `${sourceKey}:${index}`, succubusId, elapsedHours, hungerDelta, exposureDelta, note };
            if (fields.t || fields.intensity) {
                const targetId = idMap[fields.t];
                if (!targetId) throw new Error('t does not resolve to an active participant');
                if (!['trace', 'moderate', 'deep', 'full'].includes(fields.intensity)) throw new Error('intensity is invalid');
                events.push({ ...base, type: 'feeding', targetId, intensity: fields.intensity });
            } else {
                events.push({ ...base, type: 'time' });
            }
        } catch (error) {
            warnings.push({ id: `${sourceKey}:${index}`, message: error.message, raw: match[0] });
        }
        index++;
    }
    if (String(text ?? '').includes(OPEN) && index === 0) {
        warnings.push({ id: `${sourceKey}:0`, message: 'Unrecognized or unclosed tracker event', raw: String(text) });
    }
    return { events, warnings };
}

export function stripRecognizedTrackers(text) {
    CANDIDATE_RE.lastIndex = 0;
    LEGACY_RE.lastIndex = 0;
    return String(text ?? '').replace(CANDIDATE_RE, '').replace(LEGACY_RE, '').replace(/[ \t]+\n/g, '\n').trim();
}

export function hasRecognizedTracker(text) {
    CANDIDATE_RE.lastIndex = 0;
    LEGACY_RE.lastIndex = 0;
    const value = String(text ?? '');
    return CANDIDATE_RE.test(value) || LEGACY_RE.test(value);
}
