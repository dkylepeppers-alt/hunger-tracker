import test from 'node:test';
import assert from 'node:assert/strict';

import { buildCompleteAnalysisRecord, buildFailedAnalysisRecord } from '../src/analyzer-records.js';

const job = { key: 'analysis-key', messageIndex: 7, swipeId: 2 };
const analyzedAt = '2026-07-13T12:00:00.000Z';

test('complete analysis records persist the effective profile model and analyzer settings', () => {
    const record = buildCompleteAnalysisRecord({
        job,
        analyzerVersion: 4,
        analyzedAt,
        classifications: [{ note: 'No state change' }],
        events: [{ id: 'event-1' }],
        transport: {
            profileId: 'profile-live',
            profileName: 'Live Analyzer',
            model: 'model-live',
            presetName: 'Preset Live',
            useProfilePreset: true,
            maxTokens: 1400,
            temperature: null,
        },
    });

    assert.deepEqual(record, {
        status: 'complete',
        fingerprint: 'analysis-key',
        messageIndex: 7,
        swipeId: 2,
        analyzerVersion: 4,
        analyzerProfileId: 'profile-live',
        analyzerProfileName: 'Live Analyzer',
        analyzerModel: 'model-live',
        analyzerPresetName: 'Preset Live',
        analyzerUseProfilePreset: true,
        analyzerMaxTokens: 1400,
        analyzerTemperature: null,
        analyzedAt,
        classifications: [{ note: 'No state change' }],
        events: [{ id: 'event-1' }],
    });
});

test('failed analysis records retain effective diagnostics and safe configured fallbacks', () => {
    const record = buildFailedAnalysisRecord({
        job,
        analyzerVersion: 4,
        analyzedAt,
        stage: 'parse',
        error: Object.assign(new Error('Invalid JSON'), {
            name: 'AnalyzerParseError',
            profileName: 'Live Analyzer',
            model: 'model-live',
            content: '{"events":',
            reasoning: 'partial reasoning',
            finishReason: 'length',
        }),
        transport: { profileId: 'profile-live', maxTokens: 1400 },
        analyzerSettings: {
            analyzerProfileId: 'profile-configured',
            analyzerUseProfilePreset: false,
            analyzerMaxTokens: 1000,
            analyzerTemperature: 0.25,
        },
    });

    assert.deepEqual(record, {
        status: 'failed',
        fingerprint: 'analysis-key',
        messageIndex: 7,
        swipeId: 2,
        analyzerVersion: 4,
        analyzedAt,
        error: {
            code: 'AnalyzerParseError',
            category: 'parse',
            message: 'Invalid JSON',
            profileId: 'profile-live',
            profileName: 'Live Analyzer',
            model: 'model-live',
            presetName: '',
            useProfilePreset: false,
            maxTokens: 1400,
            temperature: 0.25,
            responseType: 'string',
            preview: '{"events":',
            reasoningPreview: 'partial reasoning',
            finishReason: 'length',
        },
    });
});
