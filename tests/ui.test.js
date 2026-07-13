import test from 'node:test';
import assert from 'node:assert/strict';

import { activityRows, analyzerProfileStatusText, bindAnalyzerProfileDropdown } from '../src/ui.js';

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
