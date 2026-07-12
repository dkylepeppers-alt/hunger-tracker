import { addManualEvent, toggleExcluded } from './chat.js';
import { compactStateSummary } from './prompt.js';
import { addProfile, getSettings, removeProfile, saveSettings } from './settings.js';

function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[character]);
}

export function ensureStatusStrip(onOpen) {
    let strip = document.getElementById('succubus-tracker-strip');
    if (strip) return strip;
    strip = document.createElement('button');
    strip.id = 'succubus-tracker-strip';
    strip.type = 'button';
    strip.className = 'menu_button';
    strip.hidden = true;
    strip.title = 'Open succubus state controls';
    strip.addEventListener('click', onOpen);
    const sendForm = document.querySelector('#send_form');
    if (sendForm?.parentNode) sendForm.parentNode.insertBefore(strip, sendForm);
    return strip;
}

export function renderStatusStrip(state, settings, onOpen) {
    const strip = ensureStatusStrip(onOpen);
    if (!settings.showStatusStrip || !state || Object.keys(state.succubi).length === 0) {
        strip.hidden = true;
        return;
    }
    strip.hidden = false;
    strip.replaceChildren();
    for (const item of Object.values(state.succubi)) {
        const chip = document.createElement('span');
        chip.className = `sst-chip sst-${item.condition}`;
        chip.textContent = `${item.name}: Hunger ${Math.round(item.hunger)} · ${item.condition}`;
        strip.append(chip);
    }
    for (const item of Object.values(state.participants)) {
        const chip = document.createElement('span');
        chip.className = `sst-chip sst-${item.condition}`;
        chip.textContent = `${item.name}: Soul ${Math.round(item.soul)} · ${item.condition}`;
        strip.append(chip);
    }
    if (state.warnings.length) {
        const warning = document.createElement('span');
        warning.className = 'sst-chip sst-warning';
        warning.textContent = `${state.warnings.length} warning${state.warnings.length === 1 ? '' : 's'}`;
        strip.append(warning);
    }
    if (state.analysisStatus === 'analyzing') {
        const analyzing = document.createElement('span');
        analyzing.className = 'sst-chip';
        analyzing.textContent = 'Analyzing state…';
        strip.append(analyzing);
    }
}

function stateControl(entity, field, label, value, max = 100, status = '') {
    return `<label class="sst-control"><span>${esc(label)}</span><input class="text_pole" type="number" min="0" max="${max}" step="1" data-entity="${esc(entity.id)}" data-field="${field}" value="${esc(Math.round(value))}"><small>${esc(status || entity.condition || '')}</small></label>`;
}

function ledgerRows(state, metadata) {
    const excluded = new Set(metadata.excludedIds);
    const events = [...state.events].reverse().map(event => `<tr class="${excluded.has(event.id) ? 'sst-excluded' : ''}">
        <td>${esc(event.id)}</td><td>${esc(event.type)}</td><td>${esc(event.note)}</td>
        <td>${event.timeHungerGain == null ? '—' : esc(event.timeHungerGain)} / ${event.eventHungerChange == null ? '—' : esc(event.eventHungerChange)}</td><td>${event.soulDrain == null ? '—' : esc(event.soulDrain)}</td>
        <td><button class="menu_button sst-toggle-event" data-event="${esc(event.id)}" type="button">${excluded.has(event.id) ? 'Restore' : 'Exclude'}</button></td></tr>`).join('');
    const warnings = state.warnings.map(warning => `<tr class="sst-warning-row"><td>${esc(warning.id)}</td><td>warning</td><td colspan="4">${esc(warning.message)}</td></tr>`).join('');
    return events + warnings || '<tr><td colspan="6">No events recorded yet.</td></tr>';
}

function activityRows(state) {
    return (state.activity ?? []).map(source => {
        const message = source.record?.error?.message ?? source.record?.classifications?.map(item => item.note).join('; ') ?? '—';
        const preview = source.record?.error?.preview;
        const diagnostic = preview ? `${message}\nRaw response: ${preview}` : message;
        return `<tr class="sst-${source.status}"><td>${source.messageIndex}</td><td>${esc(source.status)}</td><td><pre>${esc(diagnostic)}</pre></td><td>${source.status === 'failed' ? `<button class="menu_button sst-retry-row" data-message-index="${source.messageIndex}" type="button">Retry</button>` : '—'}</td></tr>`;
    }).join('') || '<tr><td colspan="4">No messages require analysis.</td></tr>';
}

export async function openStateDrawer({ ctx, state, metadata, rebuild, reset, retryAnalysis, analyzeMissing, cancelAnalysis, reanalyzeChat }) {
    if (!state) return;
    const root = document.createElement('div');
    root.className = 'sst-drawer';
    root.innerHTML = `<h3>Succubus state controls</h3><p>${esc(compactStateSummary(state))}</p>
        <div class="sst-tabs" role="tablist">
            <button class="menu_button active" data-tab="state" type="button">Current state</button>
            <button class="menu_button" data-tab="activity" type="button">Activity</button>
            <button class="menu_button" data-tab="ledger" type="button">Event ledger</button>
        </div>
        <section data-panel="state"><div class="sst-control-grid">
            ${Object.values(state.succubi).flatMap(item => [
                stateControl(item, 'hunger', `${item.name} hunger`, item.hunger),
                stateControl(item, 'exposure', `${item.name} exposure`, item.exposure),
                stateControl(item, 'soulsConsumed', `${item.name} souls consumed`, item.soulsConsumed, 1000000, 'Cumulative total'),
                stateControl(item, 'storyHours', `${item.name} story hours`, item.storyHours, 1000000, 'Tracked narrative time'),
            ]).join('')}
            ${Object.values(state.participants).map(item => stateControl(item, 'soul', `${item.name} soul`, item.soul)).join('')}
        </div><div class="sst-actions"><button class="menu_button" id="sst-rebuild" type="button">Rebuild</button>${state.activity?.some(item => item.status === 'missing') ? '<button class="menu_button" id="sst-analyze-missing" type="button">Analyze missing</button>' : ''}${state.activity?.some(item => item.status === 'failed') ? '<button class="menu_button" id="sst-retry-analysis" type="button">Retry all failed</button>' : ''}${state.analysisStatus === 'analyzing' ? '<button class="menu_button" id="sst-cancel-analysis" type="button">Cancel analysis</button>' : ''}<button class="menu_button" id="sst-reanalyze" type="button">Re-analyze full chat…</button><button class="menu_button redWarningBG" id="sst-reset" type="button">Reset chat state…</button></div></section>
        <section data-panel="activity" hidden><div class="sst-ledger-wrap"><table><thead><tr><th>Message</th><th>Status</th><th>Result / diagnostic</th><th>Action</th></tr></thead><tbody>${activityRows(state)}</tbody></table></div></section>
        <section data-panel="ledger" hidden><div class="sst-ledger-wrap"><table><thead><tr><th>Source</th><th>Type</th><th>Note/status</th><th>Time / event hunger</th><th>Drain</th><th>Action</th></tr></thead><tbody>${ledgerRows(state, metadata)}</tbody></table></div></section>`;

    root.querySelectorAll('[data-tab]').forEach(button => button.addEventListener('click', () => {
        root.querySelectorAll('[data-tab]').forEach(item => item.classList.toggle('active', item === button));
        root.querySelectorAll('[data-panel]').forEach(panel => { panel.hidden = panel.dataset.panel !== button.dataset.tab; });
    }));
    root.querySelectorAll('input[data-entity]').forEach(input => input.addEventListener('change', async () => {
        addManualEvent(metadata, input.dataset.entity, input.dataset.field, input.value);
        ctx.saveMetadataDebounced();
        await rebuild();
        toastr.success('State adjustment recorded');
    }));
    root.querySelectorAll('.sst-toggle-event').forEach(button => button.addEventListener('click', async () => {
        toggleExcluded(metadata, button.dataset.event);
        ctx.saveMetadataDebounced();
        await rebuild();
        button.textContent = metadata.excludedIds.includes(button.dataset.event) ? 'Restore' : 'Exclude';
        button.closest('tr').classList.toggle('sst-excluded', metadata.excludedIds.includes(button.dataset.event));
    }));
    root.querySelector('#sst-rebuild').addEventListener('click', async () => { await rebuild(); toastr.success('State rebuilt from chat history'); });
    root.querySelector('#sst-retry-analysis')?.addEventListener('click', () => retryAnalysis());
    root.querySelector('#sst-analyze-missing')?.addEventListener('click', analyzeMissing);
    root.querySelector('#sst-cancel-analysis')?.addEventListener('click', cancelAnalysis);
    root.querySelectorAll('.sst-retry-row').forEach(button => button.addEventListener('click', () => retryAnalysis(Number(button.dataset.messageIndex))));
    root.querySelector('#sst-reanalyze').addEventListener('click', reanalyzeChat);
    root.querySelector('#sst-reset').addEventListener('click', reset);
    const popup = new ctx.Popup(root, ctx.POPUP_TYPE.TEXT, '', { wide: true, large: true });
    await popup.show();
}

function tierEditor(tier, index, type) {
    const thresholds = `<label>Range min<input class="text_pole" type="number" min="0" max="100" data-tier-type="${type}" data-index="${index}" data-key="min" value="${tier.min}"></label><label>Range max<input class="text_pole" type="number" min="0" max="100" data-tier-type="${type}" data-index="${index}" data-key="max" value="${tier.max}"></label>`;
    const drain = type === 'hunger' ? `<label>Drain min<input class="text_pole" type="number" min="0" max="100" data-tier-type="${type}" data-index="${index}" data-key="drainMin" value="${tier.drainMin}"></label><label>Drain max<input class="text_pole" type="number" min="0" max="100" data-tier-type="${type}" data-index="${index}" data-key="drainMax" value="${tier.drainMax}"></label><label>Relief / soul<input class="text_pole" type="number" min="0" max="10" step="0.1" data-tier-type="${type}" data-index="${index}" data-key="reliefPerSoul" value="${tier.reliefPerSoul}"></label><label>Tendency<input class="text_pole" data-tier-type="${type}" data-index="${index}" data-key="tendency" value="${esc(tier.tendency)}"></label>` : '';
    return `<div class="sst-tier"><b>${esc(tier.label)}</b><div class="sst-tier-grid">${thresholds}${drain}</div><label>Behavior instruction<textarea class="text_pole" rows="3" data-tier-type="${type}" data-index="${index}" data-key="instruction">${esc(tier.instruction)}</textarea></label></div>`;
}

export function mountSettingsPanel(html, entities, onChanged, { openState, retryFailed } = {}) {
    if (document.getElementById('succubus-tracker-settings')) return;
    document.querySelector('#extensions_settings2')?.insertAdjacentHTML('beforeend', html);
    const settings = getSettings();
    $('#sst-enabled').prop('checked', settings.enabled).on('change', function () { settings.enabled = this.checked; saveSettings(); onChanged(); });
    $('#sst-strip-enabled').prop('checked', settings.showStatusStrip).on('change', function () { settings.showStatusStrip = this.checked; saveSettings(); onChanged(); });
    $('#sst-open-state').on('click', () => openState?.());
    $('#sst-retry-failed').on('click', () => retryFailed?.());
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
            document.querySelector(selector).innerHTML = Object.entries(rules.eventRules[group]).map(([key, value]) => `<label>${esc(key.replaceAll('_', ' '))}<input class="text_pole" type="number" min="-100" max="100" data-event-group="${group}" data-event-key="${key}" value="${value}"></label>`).join('');
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
        document.getElementById('sst-profile-list').innerHTML = settings.profiles.map(profile => `<div class="sst-profile-row"><label class="checkbox_label"><input type="checkbox" data-profile-enabled="${profile.id}" ${profile.enabled ? 'checked' : ''}> ${esc(byId[profile.entityId]?.name ?? profile.name)} <small>${esc(profile.entityId)}</small></label><button class="menu_button" data-remove-profile="${profile.id}" type="button">Remove</button></div>`).join('') || '<p class="text_muted">No succubus profiles configured.</p>';
        document.querySelectorAll('[data-profile-enabled]').forEach(input => input.addEventListener('change', () => { const profile = settings.profiles.find(item => item.id === input.dataset.profileEnabled); profile.enabled = input.checked; saveSettings(); onChanged(); }));
        document.querySelectorAll('[data-remove-profile]').forEach(button => button.addEventListener('click', () => { removeProfile(button.dataset.removeProfile); renderProfiles(); onChanged(); }));
        const editor = document.getElementById('sst-edit-profile');
        const previous = editor.value;
        editor.innerHTML = settings.profiles.map(profile => `<option value="${profile.id}">${esc(profile.name)}</option>`).join('');
        if (settings.profiles.some(profile => profile.id === previous)) editor.value = previous;
        renderRuleEditor(editor.value);
    };
    document.getElementById('sst-add-profile').addEventListener('click', () => { const entity = entities.find(item => item.id === select.value); if (entity) addProfile(entity); renderProfiles(); onChanged(); });
    document.getElementById('sst-edit-profile').addEventListener('change', event => renderRuleEditor(event.target.value));
    renderProfiles();
}
