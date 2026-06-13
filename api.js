(function () {
    'use strict';

    function normalizeBaseUrl(apiUrl) {
        let url = (apiUrl || '').trim().replace(/\/+$/, '');
        if (url.endsWith('/v1')) url = url.slice(0, -3);
        return url;
    }

    function buildChatUrl(apiUrl) {
        const baseUrl = normalizeBaseUrl(apiUrl);
        if (!baseUrl) return '';
        return baseUrl.endsWith('/v1/chat/completions') ? baseUrl : `${baseUrl}/v1/chat/completions`;
    }

    function buildEmbeddingsUrl(apiUrl) {
        const baseUrl = normalizeBaseUrl(apiUrl);
        if (!baseUrl) return '';
        return baseUrl.endsWith('/v1/embeddings') ? baseUrl : `${baseUrl}/v1/embeddings`;
    }

    function authHeaders(apiKey) {
        return {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        };
    }

    async function requestJson(url, options) {
        const response = await fetch(url, options);
        if (!response.ok) {
            let message = `API Error: ${response.status}`;
            try {
                const errData = await response.json();
                message = errData.error?.message || message;
            } catch (e) {
                message = response.statusText || message;
            }
            throw new Error(message);
        }
        return response.json();
    }

    function createChatFetchOptions(apiSettings, messages, overrides = {}) {
        return {
            method: 'POST',
            headers: authHeaders(apiSettings.apiKey),
            body: JSON.stringify({
                model: apiSettings.modelName,
                messages,
                ...overrides
            })
        };
    }

    async function chatCompletion(apiSettings, messages, overrides = {}) {
        const data = await requestJson(buildChatUrl(apiSettings.apiUrl), createChatFetchOptions(apiSettings, messages, overrides));
        return data.choices?.[0]?.message?.content || '';
    }

    window.ApiModule = {
        authHeaders,
        buildChatUrl,
        buildEmbeddingsUrl,
        requestJson,
        createChatFetchOptions,
        chatCompletion
    };
})();
