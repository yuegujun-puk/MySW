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

    function getFiniteNumber(value, fallback) {
        const numericValue = Number(value);
        return Number.isFinite(numericValue) ? numericValue : fallback;
    }

    function getGenerationParameters(apiSettings = {}) {
        const params = {
            ...(apiSettings.temperature === undefined || apiSettings.temperature === null || apiSettings.temperature === '' ? {} : { temperature: getFiniteNumber(apiSettings.temperature, 0.85) }),
            top_p: getFiniteNumber(apiSettings.topP, 0.9),
            presence_penalty: getFiniteNumber(apiSettings.presencePenalty, 0.5),
            frequency_penalty: getFiniteNumber(apiSettings.frequencyPenalty, 0.3)
        };
        if (Array.isArray(apiSettings.stopSequences) && apiSettings.stopSequences.length > 0) {
            params.stop = apiSettings.stopSequences;
        }
        if (Number.isInteger(apiSettings.seed)) {
            params.seed = apiSettings.seed;
        }
        return params;
    }

    function createChatFetchOptions(apiSettings, messages, overrides = {}) {
        return {
            method: 'POST',
            headers: authHeaders(apiSettings.apiKey),
            body: JSON.stringify({
                model: apiSettings.modelName,
                messages,
                ...getGenerationParameters(apiSettings),
                ...overrides
            })
        };
    }

    function isRetryableError(error) {
        const message = String(error?.message || error || '').toLowerCase();
        if (error?.name === 'AbortError') return true;
        if (/\b(400|401|403|404)\b/.test(message)) return false;
        if (message.includes('api key') || message.includes('unauthorized') || message.includes('model') && message.includes('not found')) return false;
        return /\b(408|409|425|429|500|502|503|504)\b/.test(message) || message.includes('timeout') || message.includes('network') || message.includes('failed to fetch');
    }

    async function withAutoRetry(apiSettings, operation) {
        const maxRetries = Math.min(5, Math.max(0, parseInt(apiSettings?.maxAutoRetries, 10) || 0));
        let lastError;
        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            try {
                return await operation(attempt);
            } catch (error) {
                lastError = error;
                if (attempt >= maxRetries || !isRetryableError(error)) break;
                await new Promise(resolve => setTimeout(resolve, Math.min(4000, 500 * (2 ** attempt))));
            }
        }
        throw lastError;
    }

    async function fetchChat(apiSettings, messages, overrides = {}) {
        return withAutoRetry(apiSettings, async () => {
            const controller = new AbortController();
            const timeoutSeconds = getFiniteNumber(apiSettings.timeoutSeconds, 60);
            const timeoutId = setTimeout(() => controller.abort(), Math.max(1, timeoutSeconds) * 1000);
            try {
                const response = await fetch(buildChatUrl(apiSettings.apiUrl), {
                    ...createChatFetchOptions(apiSettings, messages, overrides),
                    signal: controller.signal
                });
                if (!response.ok && isRetryableError(new Error(`API Error: ${response.status}`))) {
                    try { await response.clone().json(); } catch (e) {}
                    throw new Error(`API Error: ${response.status}`);
                }
                return response;
            } finally {
                clearTimeout(timeoutId);
            }
        });
    }

    async function chatCompletion(apiSettings, messages, overrides = {}) {
        const data = await withAutoRetry(apiSettings, () => requestJson(buildChatUrl(apiSettings.apiUrl), createChatFetchOptions(apiSettings, messages, overrides)));
        return data.choices?.[0]?.message?.content || '';
    }

    // 统一的 API 错误处理函数
    function handleApiError(error, context = 'API 请求') {
        console.error(`${context}失败:`, error);
        const errorMsg = error.message || String(error);
        // 区分常见错误类型并提供友好提示
        if (error?.name === 'AbortError') {
            return '⚠️ 请求超时，请检查网络或调大 AI 配置中的超时秒数';
        } else if (errorMsg.includes('401') || errorMsg.toLowerCase().includes('unauthorized') || errorMsg.toLowerCase().includes('api key')) {
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
        getGenerationParameters,
        createChatFetchOptions,
        fetchChat,
        chatCompletion,
        isRetryableError,
        withAutoRetry,
        handleApiError
    };
})();
