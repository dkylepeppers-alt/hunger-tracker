import { user_avatar } from '../../../personas.js';
import { activeRoster, analysisKey, ensureMetadata, META_KEY, precedingUserText, rebuildChatState, shouldInitializeImmediately } from './src/chat.js';
import { ANALYZER_SCHEMA, analyzerResultToEvents, buildAnalyzerPrompt, parseAnalyzerResult } from './src/analyzer.js';
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
let analysisChain = Promise.resolve();

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
    const result = rebuildChatState(ctx, currentRoster, settings);
    currentState = result.state;
    const prompt = buildStatePrompt(currentState);
    ctx.setExtensionPrompt(PROMPT_KEY, prompt.text, 1, 1, false, 0);
    renderStatusStrip(currentState, settings, showDrawer);
    hideTrackers(document.querySelector('#chat'));
    if (prior !== stableStateForSave(currentState)) ctx.saveMetadataDebounced();
    return currentState;
}

async function analyzePending() {
    const ctx = context();
    const settings = getSettings();
    const roster = activeRoster(ctx, settings, activePersonaAvatar());
    if (!settings.enabled || roster.succubi.length === 0) return;
    const metadata = ensureMetadata(ctx, roster);
    const originChat = String(ctx.chatId ?? '');
    for (let index = metadata.analysisBoundary; index < ctx.chat.length; index++) {
        const message = ctx.chat[index];
        const key = analysisKey(ctx.chat, index, roster);
        if (!key || metadata.analysisCache[key]?.status === 'complete' || metadata.analysisCache[key]?.status === 'pending') continue;
        const swipeId = Number.isInteger(Number(message.swipe_id)) ? Number(message.swipe_id) : 0;
        const assistantText = Array.isArray(message.swipes) && message.swipes[swipeId] != null ? String(message.swipes[swipeId]) : String(message.mes ?? '');
        metadata.analysisCache[key] = { status: 'pending', events: [] };
        await rebuild();
        let lastError;
        for (let attempt = 1; attempt <= 2; attempt++) {
            try {
                const quietPrompt = buildAnalyzerPrompt({ roster, userText: precedingUserText(ctx.chat, index), assistantText });
                const raw = await ctx.generateQuietPrompt({ quietPrompt, skipWIAN: true, removeReasoning: true, responseLength: 400, jsonSchema: ANALYZER_SCHEMA });
                if (String(context().chatId ?? '') !== originChat || analysisKey(context().chat, index, roster) !== key) return;
                const events = analyzerResultToEvents(parseAnalyzerResult(raw), roster, settings.eventRules, `analysis:${key}`);
                metadata.analysisCache[key] = { status: 'complete', events, messageIndex: index, swipeId };
                metadata.analysisWarnings = metadata.analysisWarnings.filter(item => item.key !== key);
                ctx.saveMetadataDebounced();
                await rebuild();
                lastError = null;
                break;
            } catch (error) { lastError = error; }
        }
        if (lastError) {
            metadata.analysisCache[key] = { status: 'failed', events: [], messageIndex: index, swipeId };
            metadata.analysisWarnings = metadata.analysisWarnings.filter(item => item.key !== key);
            metadata.analysisWarnings.push({ id: `analysis:${key}`, key, message: `Silent analysis failed: ${lastError.message}` });
            ctx.saveMetadataDebounced();
            await rebuild();
        }
    }
}

function scheduleAnalysis() {
    analysisChain = analysisChain.then(analyzePending).catch(error => console.error(`[${MODULE}] analyzer failed`, error));
}

function scheduleRebuild() {
    clearTimeout(rebuildTimer);
    rebuildTimer = setTimeout(() => rebuild().catch(error => console.error(`[${MODULE}] rebuild failed`, error)), 100);
}

async function resetChatState() {
    const ctx = context();
    const confirmed = await ctx.callGenericPopup('Reset all succubus tracker baselines, manual changes, exclusions, and cached state for this chat? Message tracker events will be reconstructed.', ctx.POPUP_TYPE.CONFIRM, '', { okButton: 'Reset state', cancelButton: 'Cancel' });
    if (!confirmed) return;
    ctx.chatMetadata[META_KEY] = { version: 3, baselines: {}, manualEvents: [], excludedIds: [], state: null };
    ctx.saveMetadataDebounced();
    await rebuild();
    toastr.success('Chat tracker state reset');
}

async function showDrawer() {
    const ctx = context();
    const state = currentState ?? await rebuild();
    if (!state) return toastr.info('No enabled succubus profile is present in this chat. Add one in Extensions settings.');
    const metadata = ensureMetadata(ctx, currentRoster);
    await openStateDrawer({ ctx, state, metadata, rebuild, reset: resetChatState, retryAnalysis, reanalyzeChat });
}

async function retryAnalysis() {
    const ctx = context();
    const metadata = ensureMetadata(ctx, currentRoster);
    for (const [key, record] of Object.entries(metadata.analysisCache)) if (record.status === 'failed') delete metadata.analysisCache[key];
    metadata.analysisWarnings = [];
    ctx.saveMetadataDebounced();
    scheduleAnalysis();
    toastr.info('Retrying failed state analysis');
}

async function reanalyzeChat() {
    const ctx = context();
    const count = ctx.chat.filter(message => message && !message.is_user && !message.is_system).length;
    const confirmed = await ctx.callGenericPopup(`Re-analyze ${count} assistant responses? This can make up to ${count} background model calls and replaces the current reconstructed baseline.`, ctx.POPUP_TYPE.CONFIRM, '', { okButton: 'Re-analyze', cancelButton: 'Cancel' });
    if (!confirmed) return;
    const metadata = ensureMetadata(ctx, currentRoster);
    metadata.analysisBoundary = 0;
    metadata.analysisCache = {};
    metadata.analysisWarnings = [];
    metadata.baselines = {};
    metadata.manualEvents = [];
    ctx.saveMetadataDebounced();
    await rebuild();
    scheduleAnalysis();
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
        'CHARACTER_EDITED', 'GENERATION_ENDED',
    ];
    for (const name of names) if (eventTypes[name]) eventSource.on(eventTypes[name], scheduleRebuild);
    for (const name of ['MESSAGE_RECEIVED', 'MESSAGE_EDITED', 'MESSAGE_UPDATED', 'MESSAGE_SWIPED', 'GENERATION_ENDED']) {
        if (eventTypes[name]) eventSource.on(eventTypes[name], scheduleAnalysis);
    }
    for (const name of ['CHARACTER_MESSAGE_RENDERED', 'MORE_MESSAGES_LOADED']) {
        if (eventTypes[name]) eventSource.on(eventTypes[name], () => hideTrackers(document.querySelector('#chat')));
    }
}

async function init() {
    if (initialized) return;
    initialized = true;
    watchRenderedMessages();
    await mountSettings();
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
