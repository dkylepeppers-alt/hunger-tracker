export function buildCompleteAnalysisRecord({ job, analyzerVersion, analyzedAt, classifications, events, transport }) {
    return {
        status: 'complete',
        fingerprint: job.key,
        messageIndex: job.messageIndex,
        swipeId: job.swipeId,
        analyzerVersion,
        analyzerProfileId: transport.profileId,
        analyzerProfileName: transport.profileName,
        analyzerModel: transport.model,
        analyzerPresetName: transport.presetName,
        analyzerUseProfilePreset: transport.useProfilePreset,
        analyzerMaxTokens: transport.maxTokens,
        analyzerTemperature: transport.temperature,
        analyzedAt,
        classifications,
        events,
    };
}

export function buildFailedAnalysisRecord({ job, analyzerVersion, analyzedAt, stage, error, transport, analyzerSettings, raw = '' }) {
    const content = error.content ?? transport?.content ?? raw;
    const reasoning = error.reasoning ?? transport?.reasoning ?? '';
    return {
        status: 'failed',
        fingerprint: job.key,
        messageIndex: job.messageIndex,
        swipeId: job.swipeId,
        analyzerVersion,
        analyzedAt,
        error: {
            code: error.name || 'AnalysisError',
            category: error.category ?? stage,
            message: error.message,
            profileId: error.profileId ?? transport?.profileId ?? analyzerSettings?.analyzerProfileId ?? '',
            profileName: error.profileName ?? transport?.profileName ?? '',
            model: error.model ?? transport?.model ?? '',
            presetName: error.presetName ?? transport?.presetName ?? '',
            useProfilePreset: error.useProfilePreset ?? transport?.useProfilePreset ?? analyzerSettings?.analyzerUseProfilePreset ?? false,
            maxTokens: error.maxTokens ?? transport?.maxTokens ?? analyzerSettings?.analyzerMaxTokens ?? null,
            temperature: error.temperature ?? transport?.temperature ?? (analyzerSettings?.analyzerUseProfilePreset ? null : analyzerSettings?.analyzerTemperature ?? null),
            responseType: typeof content,
            preview: String(content).slice(0, 1000),
            reasoningPreview: String(reasoning).slice(0, 1000),
            finishReason: error.finishReason ?? transport?.finishReason ?? '',
        },
    };
}
