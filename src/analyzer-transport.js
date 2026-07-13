export class AnalyzerTransportError extends Error {
    constructor(message, {
        category = 'transport', profileId = '', profileName = '', model = '', presetName = '',
        useProfilePreset = false, maxTokens = null, temperature = null,
        content = '', reasoning = '', finishReason = '',
    } = {}) {
        super(message);
        this.name = 'AnalyzerTransportError';
        Object.assign(this, {
            category, profileId, profileName, model, presetName,
            useProfilePreset, maxTokens, temperature,
            content, reasoning, finishReason,
        });
    }
}

function textContent(value) {
    if (typeof value === 'string') return value;
    if (Array.isArray(value)) return value.map(part => typeof part === 'string' ? part : part?.text ?? '').join('');
    if (value && typeof value === 'object') return JSON.stringify(value);
    return '';
}

function configurationError(message, diagnostics = {}) {
    return new AnalyzerTransportError(message, { ...diagnostics, category: 'configuration' });
}

function validateAnalyzerOptions({ responseLength, temperature, useProfilePreset }, profileId) {
    const diagnostics = {
        profileId,
        useProfilePreset: Boolean(useProfilePreset),
        maxTokens: responseLength,
        temperature: useProfilePreset ? null : temperature,
    };
    if (!Number.isInteger(responseLength) || responseLength < 100 || responseLength > 16384) {
        throw configurationError('Analyzer maximum output tokens must be an integer between 100 and 16384.', diagnostics);
    }
    if (!useProfilePreset && (!Number.isFinite(temperature) || temperature < 0 || temperature > 2)) {
        throw configurationError('Analyzer temperature must be between 0 and 2.', diagnostics);
    }
}

export async function analyzeWithProfile({
    service, profileId, prompt, jsonSchema,
    responseLength = 1000, temperature = 0, useProfilePreset = false,
}) {
    validateAnalyzerOptions({ responseLength, temperature, useProfilePreset }, profileId);
    if (!profileId) throw configurationError('Select an Analyzer Connection Profile first.', { maxTokens: responseLength, temperature: useProfilePreset ? null : temperature, useProfilePreset });

    let profile;
    try {
        profile = service.getSupportedProfiles().find(item => item.id === profileId);
    } catch (error) {
        throw configurationError(`Analyzer Connection Profile is unavailable: ${error.message}`, { profileId, maxTokens: responseLength, temperature: useProfilePreset ? null : temperature, useProfilePreset });
    }
    if (!profile) throw configurationError('Selected Analyzer Connection Profile is unavailable.', { profileId, maxTokens: responseLength, temperature: useProfilePreset ? null : temperature, useProfilePreset });

    const diagnostics = {
        profileId,
        profileName: String(profile.name ?? ''),
        model: String(profile.model ?? ''),
        presetName: useProfilePreset ? String(profile.preset ?? '') : '',
        useProfilePreset: Boolean(useProfilePreset),
        maxTokens: responseLength,
        temperature: useProfilePreset ? null : temperature,
    };
    const overridePayload = {
        enable_web_search: false,
        tools: [],
        tool_choice: undefined,
        custom_prompt_post_processing: '',
        model: profile.model,
        json_schema: jsonSchema,
    };
    if (!useProfilePreset) overridePayload.temperature = temperature;

    try {
        const raw = await service.sendRequest(
            profileId,
            prompt,
            responseLength,
            { stream: false, extractData: false, includePreset: useProfilePreset, includeInstruct: false },
            overridePayload,
        );
        const choice = raw?.choices?.[0] ?? {};
        const content = textContent(choice.message?.content);
        const reasoning = textContent(choice.message?.reasoning ?? choice.message?.reasoning_content);
        const finishReason = String(choice.finish_reason ?? '');
        const result = { ...diagnostics, content, reasoning, finishReason };
        if (finishReason === 'length') throw new AnalyzerTransportError('Analyzer response was truncated', { ...result, category: 'truncated' });
        if (!content.trim()) throw new AnalyzerTransportError('Analyzer returned empty content', { ...result, category: 'empty' });
        return result;
    } catch (error) {
        if (error instanceof AnalyzerTransportError) throw error;
        throw new AnalyzerTransportError(`Analyzer request failed: ${error.message}`, { ...diagnostics, category: 'transport' });
    }
}
