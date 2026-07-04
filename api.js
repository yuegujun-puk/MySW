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

    // 统一的 API 错误处理函数
    function handleApiError(error, context = 'API 请求') {
        console.error(`${context}失败:`, error);
        const errorMsg = error.message || String(error);
        // 区分常见错误类型并提供友好提示
        if (errorMsg.includes('401') || errorMsg.toLowerCase().includes('unauthorized') || errorMsg.toLowerCase().includes('api key')) {
            return '❌ API Key 无效或已过期，请检查设置';
        } else if (errorMsg.includes('429')) {
            return '⚠️ 请求过于频繁，请稍后再试';
        } else if (errorMsg.includes('503') || errorMsg.includes('502')) {
            return '⚠️ 服务暂时不可用，请稍后重试';
        } else if (errorMsg.includes('timeout') || errorMsg.includes('ETIMEDOUT') || errorMsg.includes('network')) {
            return '⚠️ 网络连接超时，请检查网络设置';
        } else if (errorMsg.includes('model') && errorMsg.toLowerCase().includes('not found')) {
            return '❌ 模型不存在或不可用，请检查模型名称设置';
        } else {
            return `❌ ${context}失败：${errorMsg}`;
        }
    }

    window.ApiModule = {
        authHeaders,
        buildChatUrl,
        buildEmbeddingsUrl,
        requestJson,
        createChatFetchOptions,
        chatCompletion,
        handleApiError
    };
})();
