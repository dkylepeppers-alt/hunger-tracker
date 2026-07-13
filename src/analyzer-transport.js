export class AnalyzerTransportError extends Error {
    constructor(message, { category = 'transport', profileId = '', profileName = '', content = '', reasoning = '', finishReason = '' } = {}) {
        super(message);
        this.name = 'AnalyzerTransportError';
        this.category = category;
        this.profileId = profileId;
        this.profileName = profileName;
        this.content = content;
        this.reasoning = reasoning;
        this.finishReason = finishReason;
    }
}

function textContent(value) {
    if (typeof value === 'string') return value;
    if (Array.isArray(value)) return value.map(part => typeof part === 'string' ? part : part?.text ?? '').join('');
    if (value && typeof value === 'object') return JSON.stringify(value);
    return '';
}

function configurationError(message, profileId = '', profileName = '') {
    return new AnalyzerTransportError(message, { category: 'configuration', profileId, profileName });
}

export async function analyzeWithProfile({ service, profileId, prompt, jsonSchema, responseLength }) {
    if (!profileId) throw configurationError('Select an Analyzer Connection Profile first.');

    let profile;
    try {
        profile = service.getSupportedProfiles().find(item => item.id === profileId);
    } catch (error) {
        throw configurationError(`Analyzer Connection Profile is unavailable: ${error.message}`, profileId);
    }
    if (!profile) throw configurationError('Selected Analyzer Connection Profile is unavailable.', profileId);

    try {
        const raw = await service.sendRequest(
            profileId,
            prompt,
            responseLength,
            { stream: false, extractData: false, includePreset: false, includeInstruct: false },
            {
                enable_web_search: false,
                tools: [],
                tool_choice: undefined,
                custom_prompt_post_processing: '',
                temperature: 0,
                json_schema: jsonSchema,
            },
        );
        const choice = raw?.choices?.[0] ?? {};
        const content = textContent(choice.message?.content);
        const reasoning = textContent(choice.message?.reasoning ?? choice.message?.reasoning_content);
        const finishReason = String(choice.finish_reason ?? '');
        const diagnostics = { profileId, profileName: profile.name, content, reasoning, finishReason };
        if (finishReason === 'length') throw new AnalyzerTransportError('Analyzer response was truncated', { ...diagnostics, category: 'truncated' });
        if (!content.trim()) throw new AnalyzerTransportError('Analyzer returned empty content', { ...diagnostics, category: 'empty' });
        return diagnostics;
    } catch (error) {
        if (error instanceof AnalyzerTransportError) throw error;
        throw new AnalyzerTransportError(`Analyzer request failed: ${error.message}`, {
            category: 'transport', profileId, profileName: profile.name,
        });
    }
}
