import { addManualEvent, toggleExcluded } from './chat.js';
import { EXTENSION_FOLDER } from './identity.js';
import { compactStateSummary } from './prompt.js';
import { addProfile, getSettings, removeProfile, saveSettings } from './settings.js';

function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[character]);
}

function extensionVersion(ctx) {
    const version = ctx?.getExtensionManifest?.(EXTENSION_FOLDER)?.version;
    return version ? `v${version}` : '';
}

export function analyzerProfileStatusText(profile, settings) {
    if (!profile) return settings.analyzerProfileId ? 'Selected profile is unavailable.' : 'Select a profile before analyzing chat state.';
    const name = profile.name || 'Unnamed profile';
    const model = profile.model || 'provider default';
    const preset = profile.preset || 'none';
    const presetState = settings.analyzerUseProfilePreset ? 'inherited' : 'not inherited';
    return `Profile: ${name} · Model: ${model} · Preset: ${preset} (${presetState})`;
}

export function bindAnalyzerProfileDropdown({ connectionService, settings, renderStatus, save, onChanged }) {
    const selectAnalyzerProfile = profile => {
        settings.analyzerProfileId = profile?.id ?? '';
        renderStatus(profile);
        save();
        onChanged();
    };
    connectionService.handleDropdown(
        '#sst-analyzer-profile',
        settings.analyzerProfileId,
        selectAnalyzerProfile,
        () => {},
        (oldProfile, newProfile) => {
            if (settings.analyzerProfileId === oldProfile.id) renderStatus(newProfile);
        },
        profile => {
            if (settings.analyzerProfileId === profile.id) selectAnalyzerProfile(undefined);
        },
    );
}

const DRAWER_TABS = Object.freeze([
    ['overview', 'Overview'],
    ['npcs', 'NPCs'],
    ['activity', 'Activity'],
    ['ledger', 'Ledger'],
]);

function titleCase(value) {
    const text = String(value ?? 'idle');
    return text ? `${text[0].toUpperCase()}${text.slice(1)}` : 'Idle';
}

function rounded(value) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.round(number) : 0;
}

function stateControl(entity, field, label, value, max = 100, status = '') {
    return `<label class="sst-control"><span>${esc(label)}</span><input class="text_pole" data-entity="${esc(entity.id)}" data-field="${esc(field)}" type="number" min="0" max="${esc(max)}" step="1" value="${esc(rounded(value))}"><small>${esc(status || entity.condition || '')}</small></label>`;
}

function succubusCard(entity) {
    return `<article class="sst-entity-card" data-condition="${esc(entity.condition)}">
        <span class="sst-condition-rail" aria-hidden="true"></span>
        <header><div><small>Succubus</small><h4>${esc(entity.name)}</h4></div><strong>${esc(titleCase(entity.condition))}</strong></header>
        <div class="sst-control-grid">
            ${stateControl(entity, 'hunger', 'Hunger', entity.hunger)}
            ${stateControl(entity, 'exposure', 'Exposure', entity.exposure)}
            ${stateControl(entity, 'soulsConsumed', 'Souls consumed', entity.soulsConsumed, 1000000, 'Cumulative total')}
            ${stateControl(entity, 'storyHours', 'Story hours', entity.storyHours, 1000000, 'Tracked narrative time')}
        </div>
        <dl class="sst-readouts"><div><dt>Last feed</dt><dd>${esc(entity.lastFeed || 'No feeding recorded')}</dd></div><div><dt>At story hour</dt><dd>${entity.lastFeedStoryHour == null ? '—' : esc(entity.lastFeedStoryHour)}</dd></div></dl>
    </article>`;
}

function participantCard(entity) {
    return `<article class="sst-entity-card" data-condition="${esc(entity.condition)}">
        <span class="sst-condition-rail" aria-hidden="true"></span>
        <header><div><small>${entity.kind === 'npc' ? 'NPC' : 'Participant'}</small><h4>${esc(entity.name)}</h4></div><strong>${esc(titleCase(entity.condition))}</strong></header>
        <div class="sst-control-grid">${stateControl(entity, 'soul', 'Soul', entity.soul)}</div>
    </article>`;
}

function warningList(state) {
    const warnings = state.warnings ?? [];
    if (!warnings.length) return '<p class="text_muted">No state warnings.</p>';
    return `<ul class="sst-warning-list">${warnings.map(warning => `<li><strong>${esc(warning.id || 'Warning')}</strong><span>${esc(warning.message)}</span></li>`).join('')}</ul>`;
}

function overviewView(state) {
    const warnings = state.warnings ?? [];
    const activity = state.activity ?? [];
    const warningLabel = `${warnings.length} warning${warnings.length === 1 ? '' : 's'}`;
    const succubi = Object.values(state.succubi ?? {});
    const participants = Object.values(state.participants ?? {});
    return `<div class="sst-overview-status" aria-label="Current tracker status">
            <div><span>Analysis</span><strong>${esc(titleCase(state.analysisStatus))}</strong></div>
            <div><span>Warnings</span><strong>${warningLabel}</strong></div>
            <div><span>Events</span><strong>${esc((state.events ?? []).length)}</strong></div>
        </div>
        <p class="sst-summary">${esc(compactStateSummary(state))}</p>
        <div class="sst-actions sst-operational-actions">
            <button class="menu_button" id="sst-rebuild" type="button">Rebuild</button>
            <button class="menu_button" id="sst-analyze-missing" type="button"${activity.some(item => item.status === 'missing') ? '' : ' disabled'}>Analyze missing</button>
            <button class="menu_button" id="sst-retry-analysis" type="button"${activity.some(item => item.status === 'failed') ? '' : ' disabled'}>Retry all failed</button>
            <button class="menu_button" id="sst-cancel-analysis" type="button"${state.analysisStatus === 'analyzing' ? '' : ' disabled'}>Cancel analysis</button>
            <button class="menu_button" id="sst-reanalyze" type="button">Re-analyze full chat…</button>
            <button class="menu_button redWarningBG" id="sst-reset" type="button">Reset chat state…</button>
        </div>
        <section class="sst-overview-section" aria-labelledby="sst-succubi-heading"><h3 id="sst-succubi-heading">Succubi</h3><div class="sst-entity-list">${succubi.map(succubusCard).join('') || '<p class="text_muted">No tracked succubi are present. Enable a profile in Extensions settings.</p>'}</div></section>
        <section class="sst-overview-section" aria-labelledby="sst-participants-heading"><h3 id="sst-participants-heading">Participants</h3><div class="sst-entity-list">${participants.map(participantCard).join('') || '<p class="text_muted">No participants are present in this chat.</p>'}</div></section>
        <section class="sst-overview-section" aria-labelledby="sst-warnings-heading"><h3 id="sst-warnings-heading">Warnings</h3>${warningList(state)}</section>`;
}

export function ledgerRows(state, metadata) {
    const excluded = new Set(metadata.excludedIds ?? []);
    const events = [...(state.events ?? [])].reverse().map(event => `<article class="sst-ledger-card${excluded.has(event.id) ? ' sst-excluded' : ''}">
        <header><strong>${esc(event.type || 'event')}</strong><small>${esc(event.id)}</small></header>
        <p>${esc(event.note || 'No event note recorded.')}</p>
        <dl class="sst-readouts"><div><dt>Time hunger</dt><dd>${event.timeHungerGain == null ? '—' : esc(event.timeHungerGain)}</dd></div><div><dt>Event hunger</dt><dd>${event.eventHungerChange == null ? '—' : esc(event.eventHungerChange)}</dd></div><div><dt>Soul drain</dt><dd>${event.soulDrain == null ? '—' : esc(event.soulDrain)}</dd></div></dl>
        <button class="menu_button sst-toggle-event" data-event="${esc(event.id)}" type="button">${excluded.has(event.id) ? 'Restore' : 'Exclude'}</button>
    </article>`).join('');
    return events || '<p class="text_muted">No events recorded yet. Rebuild after the chat advances to populate the ledger.</p>';
}

export function activityRows(state) {
    return (state.activity ?? []).map(source => {
        const record = source.record;
        const message = record?.error?.message ?? record?.classifications?.map(item => item.note).join('; ') ?? '—';
        const error = record?.error;
        const profileId = record?.analyzerProfileId ?? error?.profileId;
        const profileName = record?.analyzerProfileName ?? error?.profileName;
        const model = record?.analyzerModel ?? error?.model;
        const presetName = record?.analyzerPresetName ?? error?.presetName;
        const maxTokens = record?.analyzerMaxTokens ?? error?.maxTokens;
        const temperature = record?.analyzerTemperature ?? error?.temperature;
        const diagnostic = [
            message,
            profileName && `Profile: ${profileName}`,
            profileId && `Profile ID: ${profileId}`,
            model && `Model: ${model}`,
            presetName && `Preset: ${presetName}`,
            maxTokens != null && `Maximum output tokens: ${maxTokens}`,
            temperature != null && `Temperature: ${temperature}`,
            error?.category && `Category: ${error.category}`,
            error?.finishReason && `Finish reason: ${error.finishReason}`,
            error?.preview && `Raw response: ${error.preview}`,
            error?.reasoningPreview && `Reasoning: ${error.reasoningPreview}`,
        ].filter(Boolean).join('\n');
        const status = ['complete', 'failed', 'missing', 'analyzing'].includes(source.status) ? source.status : 'unknown';
        return `<article class="sst-activity-card" data-status="${status}"><header><strong>Message ${esc(source.messageIndex)}</strong><span>${esc(titleCase(source.status))}</span></header><pre>${esc(diagnostic)}</pre>${source.status === 'failed' ? `<button class="menu_button sst-retry-row" data-message-index="${esc(source.messageIndex)}" type="button">Retry</button>` : ''}</article>`;
    }).join('') || '<p class="text_muted">No messages require analysis. New assistant messages will appear here.</p>';
}

export function npcCandidateRows(metadata) {
    const candidates = Object.values(metadata.npcs ?? {}).sort((left, right) => (left.firstSourceMessageIndex ?? Number.MAX_SAFE_INTEGER) - (right.firstSourceMessageIndex ?? Number.MAX_SAFE_INTEGER));
    if (!candidates.length) return '<p class="text_muted">No chat-local NPCs have been detected.</p>';
    return candidates.map(candidate => {
        const action = candidate.status === 'ignored'
            ? `<button class="menu_button" type="button" data-npc-id="${esc(candidate.id)}" data-npc-status="approved">Restore</button>`
            : `<button class="menu_button" type="button" data-npc-id="${esc(candidate.id)}" data-npc-status="ignored">Ignore</button>`;
        const source = candidate.lastSourceMessageIndex == null ? 'manual entry' : `source message ${candidate.lastSourceMessageIndex}`;
        return `<article class="sst-npc-row" data-npc-record="${esc(candidate.id)}"><span class="sst-condition-rail" aria-hidden="true"></span><div><strong>${esc(candidate.name)}</strong> <small>${esc(candidate.status)} · ${esc(source)} · involved in feeding: ${candidate.involvedInFeeding ? 'yes' : 'no'}</small></div><p>${esc(candidate.evidence || 'No evidence excerpt supplied.')}</p>
            <form class="sst-edit-npc-form sst-inline-form" data-npc-id="${esc(candidate.id)}"><label>Display name<input class="text_pole" name="name" maxlength="100" required value="${esc(candidate.name)}"></label><button class="menu_button" type="submit">Save name</button></form>
            <div class="sst-actions">${action}<button class="menu_button redWarningBG" type="button" data-npc-delete="${esc(candidate.id)}">Delete…</button></div></article>`;
    }).join('');
}

function mergeOptions(npcs) {
    return npcs.map(npc => `<option value="${esc(npc.id)}">${esc(npc.name)}</option>`).join('');
}

function plural(count, singular, pluralValue = `${singular}s`) {
    return `${count} ${count === 1 ? singular : pluralValue}`;
}

export function npcRemovalImpact(metadata, npcId) {
    const manualEvents = (metadata.manualEvents ?? []).filter(event => event?.entityId === npcId);
    const manualIds = new Set(manualEvents.map(event => event.id));
    let classifications = 0;
    let events = 0;
    for (const record of Object.values(metadata.records ?? {})) {
        classifications += (record?.classifications ?? []).filter(item => item?.targetId === npcId).length;
        events += (record?.events ?? []).filter(item => item?.targetId === npcId).length;
    }
    return {
        baselines: metadata.baseline?.entities && Object.hasOwn(metadata.baseline.entities, npcId) ? 1 : 0,
        manualEvents: manualEvents.length,
        classifications,
        events,
        exclusions: (metadata.excludedIds ?? []).filter(id => id === npcId || manualIds.has(id)).length,
    };
}

export function mergeNpcConfirmation(metadata, retainedId, removedId) {
    if (retainedId === removedId) throw new Error('Choose two different NPCs to merge.');
    const retained = metadata.npcs?.[retainedId];
    const removed = metadata.npcs?.[removedId];
    if (!retained || !removed) throw new Error('Both NPCs must still be available before merging.');
    return `Keep “${esc(retained.name)}”. Merge all references from “${esc(removed.name)}” into it, then remove “${esc(removed.name)}”. This merge cannot be undone.`;
}

export function removeNpcConfirmation(metadata, npcId) {
    const npc = metadata.npcs?.[npcId];
    if (!npc) throw new Error('That NPC is no longer available.');
    const impact = npcRemovalImpact(metadata, npcId);
    return `Permanently delete “${esc(npc.name)}”? This hard delete removes ${plural(impact.baselines, 'baseline')}, ${plural(impact.manualEvents, 'manual adjustment')}, sanitizes ${plural(impact.classifications, 'classification')} and ${plural(impact.events, 'analyzed event')}, clears ${plural(impact.exclusions, 'exclusion')}, and suppresses the name from automatic rediscovery. This cannot be undone.`;
}

export function npcManagementView(metadata, error = '') {
    const npcs = Object.values(metadata.npcs ?? {});
    const suppressed = metadata.suppressedNpcNames ?? [];
    const merge = npcs.length >= 2
        ? `<form id="sst-merge-npcs-form" class="sst-form-card"><div class="sst-form-grid"><label>Keep this NPC<select class="text_pole" data-merge-retained>${mergeOptions(npcs)}</select></label><label>Merge and remove this NPC<select class="text_pole" data-merge-removed>${mergeOptions([...npcs].reverse())}</select></label></div><p class="text_muted">The kept identity receives all references from the removed identity.</p><button class="menu_button" type="submit">Merge NPCs…</button></form>`
        : '<p class="text_muted">Add at least two NPCs before merging.</p>';
    const suppressedNames = suppressed.length
        ? `<div class="sst-suppressed-list">${suppressed.map(name => `<div><code>${esc(name)}</code><button class="menu_button" type="button" data-suppressed-name="${esc(name)}">Allow detection</button></div>`).join('')}</div>`
        : '<p class="text_muted">No suppressed names. Deleted names will appear here.</p>';
    return `<header class="sst-panel-heading"><div><h3>NPCs</h3><p>Manage chat-local names and automatic tracking.</p></div></header>
        ${error ? `<p class="sst-inline-error" role="alert">${esc(error)}</p>` : ''}
        <section aria-labelledby="sst-add-npc-heading"><h4 id="sst-add-npc-heading">Add NPC</h4><form id="sst-add-npc-form" class="sst-inline-form"><label for="sst-add-npc-name">Display name<input id="sst-add-npc-name" class="text_pole" name="name" maxlength="100" required autocomplete="off"></label><button class="menu_button" type="submit">Add NPC</button></form></section>
        <section aria-labelledby="sst-npc-list-heading"><h4 id="sst-npc-list-heading">Tracked names</h4><div data-npc-list>${npcs.length ? npcCandidateRows(metadata) : '<p class="text_muted">No NPCs are tracked yet. Add one above or let the analyzer detect a name.</p>'}</div></section>
        <section aria-labelledby="sst-merge-npc-heading"><h4 id="sst-merge-npc-heading">Merge duplicate names</h4>${merge}</section>
        <section aria-labelledby="sst-suppressed-npc-heading"><h4 id="sst-suppressed-npc-heading">Suppressed names</h4><p class="text_muted">Allowing detection lets a future analysis create the name again.</p>${suppressedNames}</section>`;
}

function tabButton([id, label], activeTab) {
    const selected = id === activeTab;
    return `<button class="menu_button${selected ? ' active' : ''}" id="sst-tab-${id}" role="tab" aria-selected="${selected}" aria-controls="sst-panel-${id}" tabindex="${selected ? 0 : -1}" data-tab="${id}" type="button">${label}</button>`;
}

function tabPanel(id, activeTab, content) {
    return `<section id="sst-panel-${id}" role="tabpanel" aria-labelledby="sst-tab-${id}" data-panel="${id}"${id === activeTab ? '' : ' hidden'}>${content}</section>`;
}

export function drawerView({ ctx, state, metadata = {}, activeTab = 'overview', npcError = '' }) {
    const selectedTab = DRAWER_TABS.some(([id]) => id === activeTab) ? activeTab : 'overview';
    return `<header class="sst-drawer-heading"><div><h2>Hunger Tracker</h2><p>Current chat operations</p></div><small id="sst-state-version">${esc(extensionVersion(ctx))}</small></header>
        <div class="sst-tabs" role="tablist" aria-label="Hunger Tracker sections">${DRAWER_TABS.map(tab => tabButton(tab, selectedTab)).join('')}</div>
        ${tabPanel('overview', selectedTab, overviewView(state))}
        ${tabPanel('npcs', selectedTab, npcManagementView(metadata, npcError))}
        ${tabPanel('activity', selectedTab, `<header class="sst-panel-heading"><div><h3>Activity</h3><p>Analyzer status and diagnostics by message.</p></div></header><div class="sst-activity-list">${activityRows(state)}</div>`)}
        ${tabPanel('ledger', selectedTab, `<header class="sst-panel-heading"><div><h3>Ledger</h3><p>Reconstructed and manual state events.</p></div></header><div class="sst-ledger-list">${ledgerRows(state, metadata)}</div>`)}`;
}

export async function openStateDrawer({
    ctx, state, metadata, rebuild, reset, retryAnalysis, analyzeMissing, cancelAnalysis,
    reanalyzeChat, setNpcStatusAndRebuild, addNpcAndRebuild, renameNpcAndRebuild,
    mergeNpcsAndRebuild, removeNpcAndRebuild, restoreSuppressedNpcAndRebuild,
}) {
    if (!state) return;
    const root = document.createElement('div');
    root.className = 'sst-drawer';
    let drawerState = state;
    let drawerMetadata = metadata;
    let activeTab = 'overview';
    let npcError = '';

    const applyRefresh = refresh => {
        if (refresh?.state) drawerState = refresh.state;
        else if (refresh?.succubi) drawerState = refresh;
        if (refresh?.metadata) drawerMetadata = refresh.metadata;
        return refresh?.result ?? refresh;
    };
    const showNpcError = error => {
        npcError = error instanceof Error ? error.message : String(error || 'NPC action failed.');
        activeTab = 'npcs';
        render();
    };
    const runNpcAction = async (operation, success) => {
        try {
            const result = applyRefresh(await operation());
            if (result === false) throw new Error('That NPC record is no longer available.');
            npcError = '';
            activeTab = 'npcs';
            render();
            if (success) toastr.success(success);
        } catch (error) {
            showNpcError(error);
        }
    };
    const rebuildDrawer = async success => {
        try {
            applyRefresh(await rebuild());
            render();
            if (success) toastr.success(success);
        } catch (error) {
            toastr.error(error.message || 'Unable to rebuild Hunger Tracker state.');
        }
    };
    const activateTab = (tab, focus = false) => {
        activeTab = tab;
        root.querySelectorAll('[role="tab"]').forEach(button => {
            const selected = button.dataset.tab === tab;
            button.classList.toggle('active', selected);
            button.setAttribute('aria-selected', String(selected));
            button.tabIndex = selected ? 0 : -1;
            if (selected && focus) button.focus();
        });
        root.querySelectorAll('[role="tabpanel"]').forEach(panel => { panel.hidden = panel.dataset.panel !== tab; });
    };
    const bindTabs = () => {
        root.querySelectorAll('[role="tab"]').forEach(button => {
            button.addEventListener('click', () => activateTab(button.dataset.tab));
            button.addEventListener('keydown', event => {
                const tabs = [...root.querySelectorAll('[role="tab"]')];
                const index = tabs.indexOf(button);
                let target = index;
                if (event.key === 'ArrowLeft') target = (index - 1 + tabs.length) % tabs.length;
                else if (event.key === 'ArrowRight') target = (index + 1) % tabs.length;
                else if (event.key === 'Home') target = 0;
                else if (event.key === 'End') target = tabs.length - 1;
                else return;
                event.preventDefault();
                activateTab(tabs[target].dataset.tab, true);
            });
        });
    };
    const bindNpcActions = () => {
        root.querySelector('#sst-add-npc-form')?.addEventListener('submit', event => {
            event.preventDefault();
            const name = event.currentTarget.querySelector('[name="name"]').value;
            runNpcAction(() => addNpcAndRebuild(name), 'NPC added to this chat.');
        });
        root.querySelectorAll('.sst-edit-npc-form').forEach(form => form.addEventListener('submit', event => {
            event.preventDefault();
            const name = form.querySelector('[name="name"]').value;
            runNpcAction(() => renameNpcAndRebuild(form.dataset.npcId, name), 'NPC name updated.');
        }));
        root.querySelector('#sst-merge-npcs-form')?.addEventListener('submit', async event => {
            event.preventDefault();
            const retainedId = event.currentTarget.querySelector('[data-merge-retained]').value;
            const removedId = event.currentTarget.querySelector('[data-merge-removed]').value;
            let message;
            try {
                message = mergeNpcConfirmation(drawerMetadata, retainedId, removedId);
            } catch (error) {
                return showNpcError(error);
            }
            const confirmed = await ctx.callGenericPopup(message, ctx.POPUP_TYPE.CONFIRM, '', { okButton: 'Merge NPCs', cancelButton: 'Cancel' });
            if (confirmed) runNpcAction(() => mergeNpcsAndRebuild(retainedId, removedId), 'NPC records merged.');
        });
        root.querySelectorAll('[data-npc-delete]').forEach(button => button.addEventListener('click', async () => {
            let message;
            try {
                message = removeNpcConfirmation(drawerMetadata, button.dataset.npcDelete);
            } catch (error) {
                return showNpcError(error);
            }
            const confirmed = await ctx.callGenericPopup(message, ctx.POPUP_TYPE.CONFIRM, '', { okButton: 'Delete NPC', cancelButton: 'Cancel' });
            if (confirmed) runNpcAction(() => removeNpcAndRebuild(button.dataset.npcDelete), 'NPC permanently deleted.');
        }));
        root.querySelectorAll('[data-suppressed-name]').forEach(button => button.addEventListener('click', () => {
            runNpcAction(() => restoreSuppressedNpcAndRebuild(button.dataset.suppressedName), 'Automatic detection allowed for that name.');
        }));
        root.querySelectorAll('[data-npc-status]').forEach(button => button.addEventListener('click', () => {
            const success = button.dataset.npcStatus === 'approved'
                ? 'NPC restored to automatic tracking for this chat.'
                : 'NPC ignored for this chat.';
            runNpcAction(() => setNpcStatusAndRebuild(button.dataset.npcId, button.dataset.npcStatus), success);
        }));
    };
    const bindDrawer = () => {
        bindTabs();
        bindNpcActions();
        root.querySelectorAll('input[data-entity]').forEach(input => input.addEventListener('change', async () => {
            addManualEvent(drawerMetadata, input.dataset.entity, input.dataset.field, input.value);
            ctx.saveMetadataDebounced();
            await rebuildDrawer('State adjustment recorded.');
        }));
        root.querySelectorAll('.sst-toggle-event').forEach(button => button.addEventListener('click', async () => {
            toggleExcluded(drawerMetadata, button.dataset.event);
            ctx.saveMetadataDebounced();
            await rebuildDrawer();
        }));
        root.querySelector('#sst-rebuild')?.addEventListener('click', () => rebuildDrawer('State rebuilt from chat history.'));
        root.querySelector('#sst-retry-analysis')?.addEventListener('click', () => retryAnalysis());
        root.querySelector('#sst-analyze-missing')?.addEventListener('click', analyzeMissing);
        root.querySelector('#sst-cancel-analysis')?.addEventListener('click', cancelAnalysis);
        root.querySelectorAll('.sst-retry-row').forEach(button => button.addEventListener('click', () => retryAnalysis(Number(button.dataset.messageIndex))));
        root.querySelector('#sst-reanalyze')?.addEventListener('click', reanalyzeChat);
        root.querySelector('#sst-reset')?.addEventListener('click', reset);
    };
    function render() {
        root.innerHTML = drawerView({ ctx, state: drawerState, metadata: drawerMetadata, activeTab, npcError });
        bindDrawer();
    }
    render();
    const popup = new ctx.Popup(root, ctx.POPUP_TYPE.TEXT, '', { wide: true, large: true, allowVerticalScrolling: true });
    await popup.show();
}

function tierEditor(tier, index, type) {
    const thresholds = `<label>Range min<input class="text_pole" type="number" min="0" max="100" data-tier-type="${type}" data-index="${index}" data-key="min" value="${esc(tier.min)}"></label><label>Range max<input class="text_pole" type="number" min="0" max="100" data-tier-type="${type}" data-index="${index}" data-key="max" value="${esc(tier.max)}"></label>`;
    const drain = type === 'hunger' ? `<label>Drain min<input class="text_pole" type="number" min="0" max="100" data-tier-type="${type}" data-index="${index}" data-key="drainMin" value="${esc(tier.drainMin)}"></label><label>Drain max<input class="text_pole" type="number" min="0" max="100" data-tier-type="${type}" data-index="${index}" data-key="drainMax" value="${esc(tier.drainMax)}"></label><label>Relief / soul<input class="text_pole" type="number" min="0" max="10" step="0.1" data-tier-type="${type}" data-index="${index}" data-key="reliefPerSoul" value="${esc(tier.reliefPerSoul)}"></label><label>Tendency<input class="text_pole" data-tier-type="${type}" data-index="${index}" data-key="tendency" value="${esc(tier.tendency)}"></label>` : '';
    return `<div class="sst-tier"><b>${esc(tier.label)}</b><div class="sst-tier-grid">${thresholds}${drain}</div><label>Behavior instruction<textarea class="text_pole" rows="3" data-tier-type="${type}" data-index="${index}" data-key="instruction">${esc(tier.instruction)}</textarea></label></div>`;
}

export function mountSettingsPanel(html, entities, onChanged, { openState, retryFailed, connectionService, extensionContext } = {}) {
    if (document.getElementById('succubus-tracker-settings')) return;
    document.querySelector('#extensions_settings2')?.insertAdjacentHTML('beforeend', html);
    const settings = getSettings();
    document.getElementById('sst-extension-version').textContent = extensionVersion(extensionContext);
    $('#sst-enabled').prop('checked', settings.enabled).on('change', function () { settings.enabled = this.checked; saveSettings(); onChanged(); });
    $('#sst-open-state').on('click', () => openState?.());
    $('#sst-retry-failed').on('click', () => retryFailed?.());
    const analyzerProfileStatus = document.getElementById('sst-analyzer-profile-status');
    const analyzerMaxTokens = document.getElementById('sst-analyzer-max-tokens');
    const analyzerTemperature = document.getElementById('sst-analyzer-temperature');
    const analyzerUsePreset = document.getElementById('sst-analyzer-use-preset');

    const findAnalyzerProfile = () => connectionService.getSupportedProfiles().find(profile => profile.id === settings.analyzerProfileId);
    const renderAnalyzerStatus = profile => {
        analyzerProfileStatus.textContent = analyzerProfileStatusText(profile, settings);
    };
    try {
        if (!connectionService?.handleDropdown) throw new Error('Connection Manager profile controls are unavailable.');
        bindAnalyzerProfileDropdown({ connectionService, settings, renderStatus: renderAnalyzerStatus, save: saveSettings, onChanged });
        renderAnalyzerStatus(findAnalyzerProfile());
    } catch (error) {
        analyzerProfileStatus.textContent = `Connection Manager unavailable: ${error.message}`;
    }

    analyzerMaxTokens.value = settings.analyzerMaxTokens;
    analyzerTemperature.value = settings.analyzerTemperature;
    analyzerUsePreset.checked = settings.analyzerUseProfilePreset;
    const renderAnalyzerOptionState = () => {
        analyzerTemperature.disabled = analyzerUsePreset.checked;
        try {
            renderAnalyzerStatus(findAnalyzerProfile());
        } catch {
            renderAnalyzerStatus(undefined);
        }
    };
    analyzerMaxTokens.addEventListener('change', () => {
        const value = Number(analyzerMaxTokens.value);
        if (!Number.isInteger(value) || value < 100 || value > 16384) {
            analyzerMaxTokens.value = settings.analyzerMaxTokens;
            return toastr.error('Analyzer maximum output tokens must be an integer between 100 and 16384.');
        }
        settings.analyzerMaxTokens = value;
        saveSettings();
        onChanged();
    });
    analyzerTemperature.addEventListener('change', () => {
        const value = Number(analyzerTemperature.value);
        if (!Number.isFinite(value) || value < 0 || value > 2) {
            analyzerTemperature.value = settings.analyzerTemperature;
            return toastr.error('Analyzer temperature must be between 0 and 2.');
        }
        settings.analyzerTemperature = value;
        saveSettings();
        onChanged();
    });
    analyzerUsePreset.addEventListener('change', () => {
        settings.analyzerUseProfilePreset = analyzerUsePreset.checked;
        renderAnalyzerOptionState();
        saveSettings();
        onChanged();
    });
    renderAnalyzerOptionState();
    const select = document.getElementById('sst-profile-entity');
    select.innerHTML = entities.map(entity => `<option value="${esc(entity.id)}">${esc(entity.name)} — ${entity.kind === 'persona' ? 'Persona' : 'Character'}</option>`).join('');

    const renderRuleEditor = profileId => {
        const profile = settings.profiles.find(item => item.id === profileId);
        if (!profile) return;
        const rules = profile.rules;
        for (const [field, selector] of [['hunger', '#sst-initial-hunger'], ['exposure', '#sst-initial-exposure'], ['soul', '#sst-initial-soul']]) {
            $(selector).off('change').val(rules.initial[field]).on('change', function () { rules.initial[field] = Number(this.value); profile.ruleRevision = (profile.ruleRevision ?? 1) + 1; saveSettings(); onChanged(); });
        }
        $('#sst-hunger-rate').off('change').val(rules.hungerPerStoryHour).on('change', function () {
            const value = Number(this.value);
            if (!Number.isFinite(value) || value < 0 || value > 100) return toastr.error('Hunger rate must be between 0 and 100.');
            rules.hungerPerStoryHour = value; profile.ruleRevision = (profile.ruleRevision ?? 1) + 1; saveSettings(); onChanged();
        });
        document.getElementById('sst-hunger-tiers').innerHTML = rules.hungerTiers.map((tier, index) => tierEditor(tier, index, 'hunger')).join('');
        document.getElementById('sst-soul-tiers').innerHTML = rules.soulTiers.map((tier, index) => tierEditor(tier, index, 'soul')).join('');
        for (const [group, selector] of [['hunger', '#sst-hunger-events'], ['exposure', '#sst-exposure-events']]) {
            document.querySelector(selector).innerHTML = Object.entries(rules.eventRules[group]).map(([key, value]) => `<label>${esc(key.replaceAll('_', ' '))}<input class="text_pole" type="number" min="-100" max="100" data-event-group="${group}" data-event-key="${esc(key)}" value="${esc(value)}"></label>`).join('');
        }
        document.querySelectorAll('[data-tier-type]').forEach(input => input.addEventListener('change', () => {
            const tiers = input.dataset.tierType === 'hunger' ? rules.hungerTiers : rules.soulTiers;
            tiers[Number(input.dataset.index)][input.dataset.key] = input.type === 'number' ? Number(input.value) : input.value;
            profile.ruleRevision = (profile.ruleRevision ?? 1) + 1; saveSettings(); onChanged();
        }));
        document.querySelectorAll('[data-event-group]').forEach(input => input.addEventListener('change', () => {
            const value = Number(input.value);
            if (!Number.isFinite(value) || value < -100 || value > 100) return toastr.error('Event mapping must be between -100 and 100.');
            rules.eventRules[input.dataset.eventGroup][input.dataset.eventKey] = value;
            profile.ruleRevision = (profile.ruleRevision ?? 1) + 1; saveSettings(); onChanged();
        }));
    };

    const renderProfiles = () => {
        const byId = Object.fromEntries(entities.map(entity => [entity.id, entity]));
        document.getElementById('sst-profile-list').innerHTML = settings.profiles.map(profile => `<div class="sst-profile-row"><label class="checkbox_label"><input type="checkbox" data-profile-enabled="${esc(profile.id)}" ${profile.enabled ? 'checked' : ''}> ${esc(byId[profile.entityId]?.name ?? profile.name)} <small>${esc(profile.entityId)}</small></label><button class="menu_button" data-remove-profile="${esc(profile.id)}" type="button">Remove</button></div>`).join('') || '<p class="text_muted">No succubus profiles configured.</p>';
        document.querySelectorAll('[data-profile-enabled]').forEach(input => input.addEventListener('change', () => { const profile = settings.profiles.find(item => item.id === input.dataset.profileEnabled); profile.enabled = input.checked; saveSettings(); onChanged(); }));
        document.querySelectorAll('[data-remove-profile]').forEach(button => button.addEventListener('click', () => { removeProfile(button.dataset.removeProfile); renderProfiles(); onChanged(); }));
        const editor = document.getElementById('sst-edit-profile');
        const previous = editor.value;
        editor.innerHTML = settings.profiles.map(profile => `<option value="${esc(profile.id)}">${esc(profile.name)}</option>`).join('');
        if (settings.profiles.some(profile => profile.id === previous)) editor.value = previous;
        renderRuleEditor(editor.value);
    };
    document.getElementById('sst-add-profile').addEventListener('click', () => { const entity = entities.find(item => item.id === select.value); if (entity) addProfile(entity); renderProfiles(); onChanged(); });
    document.getElementById('sst-edit-profile').addEventListener('change', event => renderRuleEditor(event.target.value));
    renderProfiles();
}
