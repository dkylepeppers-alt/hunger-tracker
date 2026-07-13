import test from 'node:test';
import assert from 'node:assert/strict';

import * as ui from '../src/ui.js';

const {
    activityRows, analyzerProfileStatusText, bindAnalyzerProfileDropdown, drawerView,
    mergeNpcConfirmation, npcCandidateRows, npcManagementView, removeNpcConfirmation,
} = ui;

function drawerState() {
    return {
        analysisStatus: 'analyzing',
        succubi: {
            'character:lilith': {
                id: 'character:lilith', name: 'Lilith <script>alert(1)</script>', kind: 'character',
                hunger: 72, exposure: 14, soulsConsumed: 33, storyHours: 9,
                condition: 'strained', lastFeed: 'Vale & Mara', lastFeedStoryHour: 7,
            },
        },
        participants: {
            'npc:vale': {
                id: 'npc:vale', name: 'Dr. "Vale"', kind: 'npc', soul: 64, condition: 'touched',
            },
        },
        events: [{
            id: 'event:<unsafe>', type: 'feeding', note: '<img src=x onerror=alert(1)>',
            timeHungerGain: 2, eventHungerChange: -8, soulDrain: 10,
        }],
        warnings: [{ id: 'warning:<unsafe>', message: 'Provider <failed> & stopped' }],
        activity: [],
    };
}

test('drawer view exposes exactly four accessible tabs and linked panels', () => {
    assert.equal(typeof drawerView, 'function');
    const html = drawerView({
        ctx: { getExtensionManifest: () => ({ version: '6.0.1' }) },
        state: drawerState(),
        metadata: { npcs: {}, suppressedNpcNames: [], excludedIds: [] },
    });

    assert.equal((html.match(/role="tab"/g) ?? []).length, 4);
    assert.deepEqual(
        [...html.matchAll(/role="tab"[^>]*>([^<]+)<\/button>/g)].map(match => match[1]),
        ['Overview', 'NPCs', 'Activity', 'Ledger'],
    );
    for (const tab of ['overview', 'npcs', 'activity', 'ledger']) {
        assert.match(html, new RegExp(`id="sst-tab-${tab}"[^>]*aria-controls="sst-panel-${tab}"`));
        assert.match(html, new RegExp(`id="sst-panel-${tab}"[^>]*role="tabpanel"[^>]*aria-labelledby="sst-tab-${tab}"`));
    }
    assert.match(html, /id="sst-tab-overview"[^>]*aria-selected="true"[^>]*tabindex="0"/);
    assert.match(html, /id="sst-tab-npcs"[^>]*aria-selected="false"[^>]*tabindex="-1"/);
});

test('overview presents complete state, warnings, and operational chat controls', () => {
    assert.equal(typeof drawerView, 'function');
    const html = drawerView({ state: drawerState(), metadata: { npcs: {}, excludedIds: [] } });

    for (const expected of [
        'Hunger Tracker', 'Analyzing', '1 warning', 'Lilith', 'Hunger', '72', 'Exposure', '14',
        'Souls consumed', '33', 'Story hours', '9', 'Last feed', 'Vale &amp; Mara',
        'Dr. &quot;Vale&quot;', 'Soul', '64', 'Provider &lt;failed&gt; &amp; stopped',
        'Rebuild', 'Analyze missing', 'Retry all failed', 'Cancel analysis',
        'Re-analyze full chat', 'Reset chat state',
    ]) assert.match(html, new RegExp(expected));
    assert.doesNotMatch(html, /<script>|<img src=x/);
    assert.match(html, /data-condition="strained"/);
    assert.match(html, /data-entity="character:lilith" data-field="hunger"/);
});

test('activity diagnostics identify the effective profile for complete and failed analyses', () => {
    const html = activityRows({
        activity: [
            {
                messageIndex: 4,
                status: 'complete',
                record: {
                    classifications: [{ note: 'No state change' }],
                    analyzerProfileId: 'profile-complete',
                    analyzerProfileName: 'Complete Analyzer',
                    analyzerModel: 'model-complete',
                    analyzerMaxTokens: 1000,
                    analyzerTemperature: 0,
                },
            },
            {
                messageIndex: 5,
                status: 'failed',
                record: {
                    error: {
                        message: 'Provider failed',
                        profileId: 'profile-failed',
                        profileName: 'Failed Analyzer',
                        model: 'model-failed',
                    },
                },
            },
        ],
    });

    assert.match(html, /Profile: Complete Analyzer/);
    assert.match(html, /Profile ID: profile-complete/);
    assert.match(html, /Model: model-complete/);
    assert.match(html, /Profile: Failed Analyzer/);
    assert.match(html, /Profile ID: profile-failed/);
    assert.match(html, /Model: model-failed/);
});

test('analyzer profile status always shows the configured model and preset inheritance state', () => {
    const profile = { id: 'profile-1', name: 'Analyzer', model: 'model-a', preset: 'Preset A' };
    assert.equal(
        analyzerProfileStatusText(profile, { analyzerUseProfilePreset: false }),
        'Profile: Analyzer · Model: model-a · Preset: Preset A (not inherited)',
    );
    assert.equal(
        analyzerProfileStatusText(profile, { analyzerUseProfilePreset: true }),
        'Profile: Analyzer · Model: model-a · Preset: Preset A (inherited)',
    );
});

test('reactive analyzer profile callbacks refresh updates and clear deleted bindings', async () => {
    let callbacks;
    const connectionService = {
        handleDropdown: (...args) => { callbacks = args; },
    };
    const settings = { analyzerProfileId: 'profile-1' };
    const rendered = [];
    let saves = 0;
    let changes = 0;

    bindAnalyzerProfileDropdown({
        connectionService,
        settings,
        renderStatus: profile => rendered.push(profile),
        save: () => saves++,
        onChanged: () => changes++,
    });

    assert.equal(callbacks[0], '#sst-analyzer-profile');
    assert.equal(callbacks[1], 'profile-1');
    const [, , onChange, , onUpdate, onDelete] = callbacks;
    const updated = { id: 'profile-1', name: 'Updated', model: 'model-b' };
    await onUpdate({ id: 'profile-1' }, updated);
    assert.equal(rendered.at(-1), updated);
    await onDelete(updated);
    assert.equal(settings.analyzerProfileId, '');
    assert.equal(rendered.at(-1), undefined);
    assert.equal(saves, 1);
    assert.equal(changes, 1);

    const replacement = { id: 'profile-2', name: 'Replacement', model: 'model-c' };
    await onChange(replacement);
    assert.equal(settings.analyzerProfileId, 'profile-2');
    assert.equal(rendered.at(-1), replacement);
    assert.equal(saves, 2);
    assert.equal(changes, 2);
});

test('NPC rows expose ignore and restore without manual approval or retry guidance', () => {
    const html = npcCandidateRows({ npcs: {
        'npc:tracked': {
            id: 'npc:tracked', name: 'Tracked', status: 'approved', evidence: 'Present',
            firstSourceMessageIndex: 2, lastSourceMessageIndex: 4, involvedInFeeding: true,
        },
        'npc:ignored': {
            id: 'npc:ignored', name: 'Ignored', status: 'ignored', evidence: 'Mentioned',
            firstSourceMessageIndex: 3, lastSourceMessageIndex: 3, involvedInFeeding: false,
        },
    } });
    assert.match(html, /data-npc-id="npc:tracked" data-npc-status="ignored">Ignore</);
    assert.match(html, /data-npc-id="npc:ignored" data-npc-status="approved">Restore</);
    assert.doesNotMatch(html, />Approve</);
    assert.doesNotMatch(html, /Untrack|Approve, then retry|sst-retry-npc/);
});

function npcMetadata() {
    return {
        npcs: {
            'npc:vale': {
                id: 'npc:vale', name: 'Dr. <Vale>', normalizedName: 'dr. <vale>', status: 'approved',
                evidence: 'Introduced & tracked', firstSourceMessageIndex: 2,
                lastSourceMessageIndex: 7, involvedInFeeding: true,
            },
            'npc:doctor': {
                id: 'npc:doctor', name: 'The Doctor', normalizedName: 'the doctor', status: 'ignored',
                evidence: '', firstSourceMessageIndex: 4, lastSourceMessageIndex: 4,
                involvedInFeeding: false,
            },
        },
        suppressedNpcNames: ['mara <script>'],
        baseline: { entities: { 'npc:vale': { soul: 60 } } },
        manualEvents: [{ id: 'manual:vale', entityId: 'npc:vale' }],
        records: {
            scene: {
                classifications: [{ targetId: 'npc:vale' }],
                events: [{ id: 'event:vale', targetId: 'npc:vale' }],
            },
        },
        excludedIds: ['npc:vale', 'manual:vale', 'unrelated'],
    };
}

test('NPC management view provides add, edit, directional merge, delete, and suppressed-name restore controls', () => {
    assert.equal(typeof npcManagementView, 'function');
    const html = npcManagementView(npcMetadata());

    for (const expected of [
        'id="sst-add-npc-form"', 'id="sst-add-npc-name"', '>Add NPC<',
        'class="sst-edit-npc-form[^"]*"', '>Save name<', 'data-npc-delete="npc:vale"',
        'id="sst-merge-npcs-form"', 'data-merge-retained', 'data-merge-removed', '>Merge NPCs…<',
        'data-suppressed-name="mara &lt;script&gt;"', '>Allow detection<',
    ]) assert.match(html, new RegExp(expected));
    assert.match(html, /value="Dr\. &lt;Vale&gt;"/);
    assert.doesNotMatch(html, /<script>|Dr\. <Vale>/);
});

test('NPC management gives direct empty-state guidance and escapes inline validation errors', () => {
    assert.equal(typeof npcManagementView, 'function');
    const html = npcManagementView({ npcs: {}, suppressedNpcNames: [] }, '<Name> already exists');

    assert.match(html, /role="alert"/);
    assert.match(html, /&lt;Name&gt; already exists/);
    assert.match(html, /No NPCs are tracked yet\. Add one above/);
    assert.match(html, /Add at least two NPCs before merging/);
    assert.match(html, /No suppressed names\. Deleted names will appear here/);
});

test('merge confirmation states which NPC is retained and which identity is removed', () => {
    assert.equal(typeof mergeNpcConfirmation, 'function');
    const message = mergeNpcConfirmation(npcMetadata(), 'npc:vale', 'npc:doctor');

    assert.match(message, /Keep “Dr\. &lt;Vale&gt;”/);
    assert.match(message, /remove “The Doctor”/);
    assert.match(message, /cannot be undone/i);
    assert.doesNotMatch(message, /<Vale>/);
});

test('delete confirmation reports hard-delete impact before mutation', () => {
    assert.equal(typeof removeNpcConfirmation, 'function');
    const message = removeNpcConfirmation(npcMetadata(), 'npc:vale');

    assert.match(message, /Permanently delete “Dr\. &lt;Vale&gt;”/);
    assert.match(message, /1 baseline/);
    assert.match(message, /1 manual adjustment/);
    assert.match(message, /1 classification/);
    assert.match(message, /1 analyzed event/);
    assert.match(message, /2 exclusions/);
    assert.match(message, /suppress.*automatic rediscovery/i);
    assert.doesNotMatch(message, /<Vale>/);
});
