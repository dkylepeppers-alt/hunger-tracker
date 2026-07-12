import { user_avatar } from '../../../personas.js';
import { activeRoster, analysisKey, ensureMetadata, META_KEY, precedingUserText, rebuildChatState, shouldInitializeImmediately } from './src/chat.js';
import { ANALYZER_VERSION, analyzerResultToEvents, buildAnalyzerRequest, parseAnalyzerResult } from './src/analyzer.js';
import { AnalysisQueue } from './src/queue.js';
import { compactStateSummary, buildStatePrompt } from './src/prompt.js';
import { hasRecognizedTracker, stripRecognizedTrackers } from './src/protocol.js';
import { legacyElenaEntity } from './src/profiles.js';
import { addProfile, getSettings } from './src/settings.js';
import { mountSettingsPanel, openStateDrawer, renderStatusStrip } from './src/ui.js';

const PROMPT_KEY = 'succubus_state_tracker';
const MODULE = 'succubus-state-tracker';
let initialized = false;
let rebuildTimer = null;
let observer = null;
let currentState = null;
let currentRoster = null;
const sessionKeys = new Set();
const analysisQueue = new AnalysisQueue(processAnalysisJob);

function context() {
    return SillyTavern.getContext();
}

function activePersonaAvatar() {
    return user_avatar || '';
}

function stableStateForSave(state) {
    return JSON.stringify(state);
}

async function rebuild() {
    const ctx = context();
    const settings = getSettings();
    currentRoster = activeRoster(ctx, settings, activePersonaAvatar());
    if (!settings.enabled || currentRoster.succubi.length === 0) {
        currentState = null;
        ctx.setExtensionPrompt(PROMPT_KEY, '', 1, 2, false, 0);
        renderStatusStrip(null, settings, showDrawer);
        hideTrackers(document.querySelector('#chat'));
        return null;
    }

    const prior = stableStateForSave(ctx.chatMetadata?.[META_KEY]?.state);
    const result = rebuildChatState(ctx, currentRoster, settings, sessionKeys);
    currentState = result.state;
    const prompt = buildStatePrompt(currentState);
    ctx.setExtensionPrompt(PROMPT_KEY, prompt.text, 1, 1, false, 0);
    renderStatusStrip(currentState, settings, showDrawer);
    hideTrackers(document.querySelector('#chat'));
    if (prior !== stableStateForSave(currentState)) ctx.saveMetadataDebounced();
    return currentState;
}

async function processAnalysisJob(job) {
    const ctx = context();
    sessionKeys.add(job.key);
    if (String(ctx.chatId ?? '') === job.chatId) await rebuild();
    let raw;
    try {
        const request = buildAnalyzerRequest(job);
        raw = await ctx.generateRaw(request);
        if (!analysisQueue.isCurrent(job) || String(context().chatId ?? '') !== job.chatId || analysisKey(context().chat, job.messageIndex, job.roster) !== job.key) return;
        const result = parseAnalyzerResult(raw);
        const events = result.events.flatMap((item, index) => {
            const succubus = job.roster.succubi.find(entity => entity.id === item.succubusId);
            if (!succubus) throw new Error(`Unknown succubus: ${item.succubusId}`);
            return analyzerResultToEvents({ events: [item] }, job.roster, succubus.rules, `analysis:${job.key}:${index}`);
        });
        job.metadata.records[job.key] = { status: 'complete', fingerprint: job.key, messageIndex: job.messageIndex, swipeId: job.swipeId, analyzerVersion: ANALYZER_VERSION, analyzedAt: new Date().toISOString(), classifications: result.events, events };
        ctx.saveMetadataDebounced();
    } catch (error) {
        if (analysisQueue.isCurrent(job) && String(context().chatId ?? '') === job.chatId) {
            job.metadata.records[job.key] = { status: 'failed', fingerprint: job.key, messageIndex: job.messageIndex, swipeId: job.swipeId, analyzerVersion: ANALYZER_VERSION, analyzedAt: new Date().toISOString(), error: { code: error.name || 'AnalysisError', message: error.message, responseType: typeof raw, preview: typeof raw === 'string' ? raw.slice(0, 300) : '' } };
            ctx.saveMetadataDebounced();
        }
    } finally {
        sessionKeys.delete(job.key);
        if (String(context().chatId ?? '') === job.chatId) await rebuild();
    }
}

function enqueueAnalysis(messageIndex, { force = false } = {}) {
    const ctx = context();
    const settings = getSettings();
    const roster = activeRoster(ctx, settings, activePersonaAvatar());
    if (!settings.enabled || roster.succubi.length === 0) return false;
    const metadata = ensureMetadata(ctx, roster);
    if (!Number.isInteger(messageIndex) || messageIndex < metadata.analysisBoundary) return false;
    const message = ctx.chat[messageIndex];
    const key = analysisKey(ctx.chat, messageIndex, roster);
    if (!key) return false;
    if (force) delete metadata.records[key];
    if (metadata.records[key]) return false;
    const swipeId = Number.isInteger(Number(message.swipe_id)) ? Number(message.swipe_id) : 0;
    const assistantText = Array.isArray(message.swipes) && message.swipes[swipeId] != null ? String(message.swipes[swipeId]) : String(message.mes ?? '');
    return analysisQueue.enqueue({ key, chatId: String(ctx.chatId ?? ''), messageIndex, swipeId, roster, metadata, userText: precedingUserText(ctx.chat, messageIndex), assistantText });
}

function scheduleRebuild() {
    clearTimeout(rebuildTimer);
    rebuildTimer = setTimeout(() => rebuild().catch(error => console.error(`[${MODULE}] rebuild failed`, error)), 100);
}

async function resetChatState() {
    const ctx = context();
    const confirmed = await ctx.callGenericPopup('Reset all succubus tracker baselines, manual changes, exclusions, and cached state for this chat? Message tracker events will be reconstructed.', ctx.POPUP_TYPE.CONFIRM, '', { okButton: 'Reset state', cancelButton: 'Cancel' });
    if (!confirmed) return;
    ctx.chatMetadata[META_KEY] = { version: 5, baseline: { source: 'reset', messageBoundary: ctx.chat.length, entities: {} }, analysisBoundary: ctx.chat.length, records: {}, manualEvents: [], excludedIds: [], archive: {} };
    ctx.saveMetadataDebounced();
    await rebuild();
    toastr.success('Chat tracker state reset');
}

async function showDrawer() {
    const ctx = context();
    const state = currentState ?? await rebuild();
    if (!state) return toastr.info('No enabled succubus profile is present in this chat. Add one in Extensions settings.');
    const metadata = ensureMetadata(ctx, currentRoster);
    await openStateDrawer({ ctx, state, metadata, rebuild, reset: resetChatState, retryAnalysis, analyzeMissing, cancelAnalysis, reanalyzeChat });
}

async function retryAnalysis(messageIndex) {
    const sources = Number.isInteger(messageIndex) ? currentState?.activity?.filter(item => item.messageIndex === messageIndex && item.status === 'failed') : currentState?.activity?.filter(item => item.status === 'failed');
    for (const source of sources ?? []) enqueueAnalysis(source.messageIndex, { force: true });
}

async function analyzeMissing() {
    for (const source of currentState?.activity?.filter(item => item.status === 'missing') ?? []) enqueueAnalysis(source.messageIndex);
}

async function cancelAnalysis() {
    analysisQueue.cancel();
    sessionKeys.clear();
    await rebuild();
    toastr.info('State analysis cancelled; any in-flight result will be discarded.');
}

async function reanalyzeChat() {
    const ctx = context();
    const count = ctx.chat.filter(message => message && !message.is_user && !message.is_system).length;
    const confirmed = await ctx.callGenericPopup(`Re-analyze ${count} assistant responses? This can make up to ${count} background model calls and replaces the current reconstructed baseline.`, ctx.POPUP_TYPE.CONFIRM, '', { okButton: 'Re-analyze', cancelButton: 'Cancel' });
    if (!confirmed) return;
    const metadata = ensureMetadata(ctx, currentRoster);
    metadata.analysisBoundary = 0;
    metadata.records = {};
    metadata.baseline = { source: 'full-reanalysis', messageBoundary: 0, entities: {} };
    metadata.manualEvents = [];
    ctx.saveMetadataDebounced();
    await rebuild();
    for (let index = 0; index < ctx.chat.length; index++) enqueueAnalysis(index);
    toastr.info(`Queued ${count} responses for silent state analysis`);
}

function hideTrackers(root) {
    if (!root) return;
    const messageRoots = root.matches?.('.mes_text') ? [root] : root.querySelectorAll?.('.mes_text') ?? [];
    for (const messageRoot of messageRoots) {
        const walker = document.createTreeWalker(messageRoot, NodeFilter.SHOW_TEXT);
        const nodes = [];
        while (walker.nextNode()) nodes.push(walker.currentNode);
        for (const node of nodes) {
            if (!hasRecognizedTracker(node.nodeValue)) continue;
            node.nodeValue = stripRecognizedTrackers(node.nodeValue);
        }
        messageRoot.querySelectorAll('p').forEach(element => {
            if (!element.textContent.trim() && !element.children.length) element.remove();
        });
    }
}

function watchRenderedMessages() {
    observer?.disconnect();
    const chat = document.querySelector('#chat');
    if (!chat) return;
    observer = new MutationObserver(mutations => {
        for (const mutation of mutations) {
            if (mutation.type === 'characterData') hideTrackers(mutation.target.parentElement?.closest('.mes_text'));
            for (const node of mutation.addedNodes ?? []) {
                if (node.nodeType === Node.ELEMENT_NODE) hideTrackers(node.closest?.('.mes_text') ?? node);
            }
        }
    });
    observer.observe(chat, { childList: true, subtree: true, characterData: true });
}

async function mountSettings() {
    const ctx = context();
    const settings = getSettings();
    const initialRoster = activeRoster(ctx, settings, activePersonaAvatar());
    if (settings.profiles.length === 0) {
        const legacyElena = legacyElenaEntity(initialRoster.all);
        if (legacyElena) addProfile(legacyElena);
    }
    const html = await ctx.renderExtensionTemplateAsync('third-party/elena-succubus-tracker', 'settings').catch(async () => {
        const response = await fetch(new URL('settings.html', import.meta.url));
        return response.ok ? response.text() : '';
    });
    if (!html) return;
    mountSettingsPanel(html, activeRoster(ctx, getSettings(), activePersonaAvatar()).all, scheduleRebuild);
}

function registerMacro(name) {
    const { macros } = context();
    if (!macros?.register) return;
    try {
        macros.register(name, {
            category: macros.category.STATE,
            description: 'Current authoritative succubus and soul state for this chat.',
            returns: 'A compact state summary.',
            exampleUsage: [`{{${name}}}`],
            handler: () => compactStateSummary(currentState),
        });
    } catch (error) {
        console.debug(`[${MODULE}] macro ${name} registration skipped`, error);
    }
}

function registerCommand(name, aliases = []) {
    const ctx = context();
    if (!ctx.SlashCommandParser?.addCommandObject || !ctx.SlashCommand?.fromProps) return;
    try {
        ctx.SlashCommandParser.addCommandObject(ctx.SlashCommand.fromProps({
            name, aliases,
            returns: 'Current succubus and participant soul state',
            callback: async () => compactStateSummary(currentState ?? await rebuild()),
            helpString: '<div>Returns the current succubus tracker state through <code>{{pipe}}</code> without adding a chat message.</div>',
        }));
    } catch (error) {
        console.debug(`[${MODULE}] command ${name} registration skipped`, error);
    }
}

function bindEvents() {
    const { eventSource, eventTypes } = context();
    const names = [
        'MESSAGE_RECEIVED', 'MESSAGE_EDITED', 'MESSAGE_UPDATED', 'MESSAGE_DELETED',
        'MESSAGE_SWIPED', 'MESSAGE_SWIPE_DELETED', 'CHAT_CHANGED', 'GROUP_UPDATED',
        'PERSONA_CHANGED', 'PERSONA_UPDATED', 'PERSONA_RENAMED', 'PERSONA_DELETED',
        'CHARACTER_EDITED',
    ];
    for (const name of names) if (eventTypes[name]) eventSource.on(eventTypes[name], scheduleRebuild);
    if (eventTypes.MESSAGE_RECEIVED) eventSource.on(eventTypes.MESSAGE_RECEIVED, messageId => enqueueAnalysis(Number(messageId)));
    for (const name of ['MESSAGE_EDITED', 'MESSAGE_UPDATED', 'MESSAGE_SWIPED']) if (eventTypes[name]) eventSource.on(eventTypes[name], messageId => enqueueAnalysis(Number(messageId)));
    if (eventTypes.CHAT_CHANGED) eventSource.on(eventTypes.CHAT_CHANGED, () => { analysisQueue.cancel(); sessionKeys.clear(); scheduleRebuild(); });
    for (const name of ['CHARACTER_MESSAGE_RENDERED', 'MORE_MESSAGES_LOADED']) {
        if (eventTypes[name]) eventSource.on(eventTypes[name], () => hideTrackers(document.querySelector('#chat')));
    }
}

async function init() {
    if (initialized) return;
    initialized = true;
    watchRenderedMessages();
    await mountSettings();
    currentRoster = activeRoster(context(), getSettings(), activePersonaAvatar());
    ensureMetadata(context(), currentRoster);
    registerMacro('succubusState');
    registerMacro('elenaState');
    registerCommand('succubus-state', ['succubusstate']);
    registerCommand('elena-state', ['elenastate']);
    bindEvents();
    await rebuild();
}

const ctx = context();
if (ctx.eventTypes?.APP_READY) ctx.eventSource.on(ctx.eventTypes.APP_READY, init);
if (shouldInitializeImmediately(ctx)) init();
