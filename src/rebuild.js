import { parseTrackerEvents } from './protocol.js';
import { rebuildState } from './state.js';
import { shortIdMap } from './profiles.js';

export function activeMessageText(message) {
    if (!message) return '';
    const swipeId = Number(message.swipe_id);
    if (Array.isArray(message.swipes) && Number.isInteger(swipeId) && message.swipes[swipeId] != null) {
        return String(message.swipes[swipeId]);
    }
    return String(message.mes ?? '');
}

export function reconstructFromMessages({
    messages = [], succubi = [], participants = [], baselines = {}, rules = {},
    manualEvents = [], excludedIds = [],
}) {
    const idMap = shortIdMap([...succubi, ...participants]);
    const events = [];
    const warnings = [];
    for (let index = 0; index < messages.length; index++) {
        const message = messages[index];
        if (!message || message.is_user || message.is_system) continue;
        const swipeId = Number.isInteger(Number(message.swipe_id)) ? Number(message.swipe_id) : 0;
        const parsed = parseTrackerEvents(activeMessageText(message), idMap, `${index}:${swipeId}`);
        events.push(...parsed.events);
        warnings.push(...parsed.warnings);
    }
    events.push(...manualEvents);
    return rebuildState({ succubi, participants, events, excludedIds, baselines, rules, warnings });
}

