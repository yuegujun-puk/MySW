// 从 main.js 拆分出的功能模块，保持全局函数声明以兼容现有非模块脚本架构。

        function loadChatSettings() {
            let settings;
            try {
                settings = JSON.parse(localStorage.getItem('chatSettings'));
            } catch (e) {
                settings = null;
            }
            if (settings) {
                maxContextRoundsInput.value = settings.maxContextRounds !== undefined ? settings.maxContextRounds : 0;
                maxTokensInput.value = settings.maxTokens !== undefined ? settings.maxTokens : 1024;
                enableLongTermMemoryCheckbox.checked = settings.enableLongTermMemory !== undefined ? settings.enableLongTermMemory : true;
                enableProactiveCareCheckbox.checked = settings.enableProactiveCare !== undefined ? settings.enableProactiveCare : false;
                messageDebounceInput.value = settings.messageDebounce !== undefined ? settings.messageDebounce : 30;
                enableLazyModeCheckbox.checked = settings.enableLazyMode !== undefined ? settings.enableLazyMode : false;
                showRegenerateBtnCheckbox.checked = settings.showRegenerateBtn !== undefined ? settings.showRegenerateBtn : true;
                enableRealTimeCheckbox.checked = settings.enableRealTime !== undefined ? settings.enableRealTime : false;
                enableStreamingInputCheckbox.checked = settings.enableStreamingInput !== undefined ? settings.enableStreamingInput : true;
                bubbleWidthPercentInput.value = settings.bubbleWidthPercent !== undefined ? settings.bubbleWidthPercent : 85;
                bubbleWidthSlider.value = settings.bubbleWidthPercent !== undefined ? settings.bubbleWidthPercent : 85;
                enableMessageSegmentationCheckbox.checked = settings.enableMessageSegmentation !== undefined ? settings.enableMessageSegmentation : false;
                enableDisplayLimitCheckbox.checked = settings.enableDisplayLimit !== undefined ? settings.enableDisplayLimit : false;
                displayLimitRoundsInput.value = settings.displayLimitRounds !== undefined ? settings.displayLimitRounds : 20;
                const toggles = { ...getDefaultFeatureToggles(), ...(settings.featureToggles || {}) };
                Object.entries(featureToggleInputs).forEach(([key, input]) => { if (input) input.checked = toggles[key]; });
                currentBubbleStyle = settings.bubbleStyle || 'default';
                currentBubbleImage = settings.bubbleImage || null;
                currentBubbleTextStyle = settings.bubbleTextStyle || {
                    color: '#ffffff',
                    fontSize: 14,
                    strokeColor: '#000000',
                    strokeWidth: 1,
                    enableStroke: true
                };
                updateBubbleStyleUI();
                applyBubbleBackground();
                updateBubbleTextInputs();


                const root = document.documentElement;
                root.style.setProperty('--bubble-max-width', (settings.bubbleWidthPercent || 85) + '%');
            } else {
                const toggles = getDefaultFeatureToggles();
                Object.entries(featureToggleInputs).forEach(([key, input]) => { if (input) input.checked = toggles[key]; });
            }
            applyFeatureToggles();
            renderContextEditList();
        }


        function parseNonNegativeIntegerInput(input, fallback = 0) {
            const value = parseInt(input?.value, 10);
            return Number.isNaN(value) ? fallback : Math.max(0, value);
        }

        function parsePositiveIntegerInput(input, fallback = 1) {
            const value = parseInt(input?.value, 10);
            return Number.isNaN(value) ? fallback : Math.max(1, value);
        }

        function saveChatSettings() {
            const settings = {
                maxContextRounds: parseNonNegativeIntegerInput(maxContextRoundsInput, 0),
                maxTokens: parseInt(maxTokensInput.value) || 1024,
                enableLongTermMemory: enableLongTermMemoryCheckbox.checked,
                enableProactiveCare: enableProactiveCareCheckbox.checked,
                messageDebounce: Number.isNaN(parseInt(messageDebounceInput.value, 10)) ? 30 : Math.max(0, parseInt(messageDebounceInput.value, 10)),
                enableLazyMode: enableLazyModeCheckbox.checked,
                showRegenerateBtn: showRegenerateBtnCheckbox.checked,
                enableRealTime: enableRealTimeCheckbox.checked,
                enableStreamingInput: enableStreamingInputCheckbox.checked,
                bubbleWidthPercent: parseInt(bubbleWidthPercentInput.value) || 85,
                enableMessageSegmentation: enableMessageSegmentationCheckbox.checked,
                bubbleStyle: currentBubbleStyle,
                bubbleImage: currentBubbleImage,
                bubbleTextStyle: currentBubbleTextStyle,
                enableDisplayLimit: enableDisplayLimitCheckbox.checked,
                displayLimitRounds: parsePositiveIntegerInput(displayLimitRoundsInput, 20),
                featureToggles: Object.fromEntries(
                    Object.entries(featureToggleInputs).map(([key, input]) => [key, input ? input.checked : true])
                )
            };
            setLocalStorageSafely('chatSettings', JSON.stringify(settings), '聊天设置');


            const root = document.documentElement;
            root.style.setProperty('--bubble-max-width', settings.bubbleWidthPercent + '%');

            return settings;
        }

        function getChatSettings() {
            let settings;
            try {
                settings = JSON.parse(localStorage.getItem('chatSettings'));
            } catch (e) {
                settings = null;
            }
            return settings || {
                maxContextRounds: 0,
                maxTokens: 1024,
                enableLongTermMemory: true,
                enableProactiveCare: false,
                messageDebounce: 30,
                enableLazyMode: false,
                showRegenerateBtn: true,
                enableRealTime: false,
                bubbleWidthPercent: 85,
                enableMessageSegmentation: false,
                bubbleStyle: 'default',
                bubbleImage: null,
                enableDisplayLimit: false,
                displayLimitRounds: 20,
                featureToggles: getDefaultFeatureToggles(),
                bubbleTextStyle: {
                    color: '#ffffff',
                    fontSize: 14,
                    strokeColor: '#000000',
                    strokeWidth: 1,
                    enableStroke: true
                }
            };
        }

        function loadApiSettings() {
            let s;
            try {
                s = JSON.parse(localStorage.getItem('aiChatSettings'));
            } catch (e) {
                s = null;
            }
            if (s) {
                apiUrlInput.value = s.apiUrl||'';
                apiKeyInput.value = s.apiKey||'';
                modelNameInput.value = s.modelName||'';
                if (apiTemperatureInput) apiTemperatureInput.value = s.temperature ?? '';
                if (apiTopPInput) apiTopPInput.value = s.topP ?? 0.9;
                if (apiPresencePenaltyInput) apiPresencePenaltyInput.value = s.presencePenalty ?? 0.5;
                if (apiFrequencyPenaltyInput) apiFrequencyPenaltyInput.value = s.frequencyPenalty ?? 0.3;
                if (apiStopSequencesInput) apiStopSequencesInput.value = Array.isArray(s.stopSequences) ? s.stopSequences.join('\n') : '';
                if (apiSeedInput) apiSeedInput.value = Number.isInteger(s.seed) ? s.seed : '';
                if (apiTimeoutSecondsInput) apiTimeoutSecondsInput.value = s.timeoutSeconds ?? 60;
                if (apiMaxAutoRetriesInput) apiMaxAutoRetriesInput.value = s.maxAutoRetries ?? 0;
            }

            let vision;
            try {
                vision = JSON.parse(localStorage.getItem('visionSettings')) || {};
            } catch (e) {
                vision = {};
            }
            if (enableMultimodalVisionCheckbox) enableMultimodalVisionCheckbox.checked = vision.enabled === true;
            if (imageCompressionMaxWidthInput) imageCompressionMaxWidthInput.value = vision.maxWidth || 1280;
            if (imageCompressionQualityInput) imageCompressionQualityInput.value = vision.quality || 0.82;

            let tts;
            try {
                tts = JSON.parse(localStorage.getItem('ttsSettings')) || {};
            } catch (e) {
                tts = {};
            }
            if (ttsApiUrlInput) ttsApiUrlInput.value = tts.apiUrl || '';
            if (ttsApiKeyInput) ttsApiKeyInput.value = tts.apiKey || '';
            if (ttsVoiceInput) ttsVoiceInput.value = tts.voice || 'alloy';
            if (ttsSpeedInput) ttsSpeedInput.value = tts.speed || 1;
            if (ttsModelInput) ttsModelInput.value = tts.model || '';
            if (ttsAutoReadCheckbox) ttsAutoReadCheckbox.checked = tts.autoRead === true;

            let ltm;
            try {
                ltm = JSON.parse(localStorage.getItem('longTermMemorySettings')) || {};
            } catch (e) {
                ltm = {};
            }
            const ltmApiUrlInput = document.getElementById('ltm-api-url');
            const ltmApiKeyInput = document.getElementById('ltm-api-key');
            const ltmEmbeddingModelInput = document.getElementById('ltm-embedding-model');
            const ltmRerankModelInput = document.getElementById('ltm-rerank-model');
            const enableLongTermMemoryCheckboxEl = document.getElementById('enable-long-term-memory');
            if (ltmApiUrlInput) ltmApiUrlInput.value = ltm.apiUrl || '';
            if (ltmApiKeyInput) ltmApiKeyInput.value = ltm.apiKey || '';
            if (ltmEmbeddingModelInput) ltmEmbeddingModelInput.value = ltm.embeddingModel || 'text-embedding-3-small';
            if (ltmRerankModelInput) ltmRerankModelInput.value = ltm.rerankModel || '';
            if (enableLongTermMemoryCheckboxEl) enableLongTermMemoryCheckboxEl.checked = ltm.enabled !== undefined ? ltm.enabled : true;
        }

        function saveApiSettings() {
            const rawUrl = apiUrlInput.value.trim();
            const normalizedUrl = normalizeApiUrl(rawUrl);
            apiUrlInput.value = normalizedUrl;
            const numberOrDefault = (input, fallback) => {
                const value = Number(input?.value);
                return Number.isFinite(value) ? value : fallback;
            };
            const s = {
                apiUrl: normalizedUrl,
                apiKey: apiKeyInput.value.trim(),
                modelName: modelNameInput.value.trim(),
                temperature: apiTemperatureInput?.value === '' ? undefined : numberOrDefault(apiTemperatureInput, undefined),
                topP: numberOrDefault(apiTopPInput, 0.9),
                presencePenalty: numberOrDefault(apiPresencePenaltyInput, 0.5),
                frequencyPenalty: numberOrDefault(apiFrequencyPenaltyInput, 0.3),
                stopSequences: (apiStopSequencesInput?.value || '').split(/\r?\n/).map(v => v.trim()).filter(Boolean),
                seed: apiSeedInput?.value ? parseInt(apiSeedInput.value, 10) : undefined,
                timeoutSeconds: numberOrDefault(apiTimeoutSecondsInput, 60),
                maxAutoRetries: Math.min(5, Math.max(0, parseInt(apiMaxAutoRetriesInput?.value, 10) || 0))
            };
            setLocalStorageSafely('aiChatSettings', JSON.stringify(s), 'API设置');

            setLocalStorageSafely('visionSettings', JSON.stringify({
                enabled: enableMultimodalVisionCheckbox?.checked === true,
                maxWidth: parseInt(imageCompressionMaxWidthInput?.value, 10) || 1280,
                quality: Number(imageCompressionQualityInput?.value) || 0.82
            }), '视觉设置');
            setLocalStorageSafely('ttsSettings', JSON.stringify({
                apiUrl: ttsApiUrlInput?.value.trim() || '',
                apiKey: ttsApiKeyInput?.value.trim() || '',
                voice: ttsVoiceInput?.value.trim() || 'alloy',
                speed: Number(ttsSpeedInput?.value) || 1,
                model: ttsModelInput?.value.trim() || '',
                autoRead: ttsAutoReadCheckbox?.checked === true
            }), 'TTS设置');

            const ltmApiUrlInputEl = document.getElementById('ltm-api-url');
            const ltmApiKeyInputEl = document.getElementById('ltm-api-key');
            const ltmEmbeddingModelInputEl = document.getElementById('ltm-embedding-model');
            const ltmRerankModelInputEl = document.getElementById('ltm-rerank-model');
            const enableLongTermMemoryCheckboxEl2 = document.getElementById('enable-long-term-memory');
            const ltmRawUrl = ltmApiUrlInputEl?.value?.trim() || '';
            const ltmSettings = {
                apiUrl: normalizeApiUrl(ltmRawUrl) || '',
                apiKey: ltmApiKeyInputEl?.value?.trim() || '',
                embeddingModel: ltmEmbeddingModelInputEl?.value?.trim() || '',
                rerankModel: ltmRerankModelInputEl?.value?.trim() || '',
                enabled: enableLongTermMemoryCheckboxEl2?.checked === true
            };
            setLocalStorageSafely('longTermMemorySettings', JSON.stringify(ltmSettings), '长期记忆设置');

            return s;
        }

        function loadAutoBackupSettings() {
            const enabled = localStorage.getItem('autoBackupEnabled') === 'true';
            autoBackupEnabledCheckbox.checked = enabled;
        }

        function saveAutoBackupSettings() {
            setLocalStorageSafely('autoBackupEnabled', autoBackupEnabledCheckbox.checked.toString(), '自动备份设置');
        }

        function saveKnowledgeSettings() {
            let currentFiles;
            try {
                currentFiles = JSON.parse(localStorage.getItem('knowledgeSettings'))?.files || [];
            } catch (e) {
                currentFiles = [];
            }
            const s = {
                apiUrl: kbApiUrlInput.value.trim(),
                apiKey: kbApiKeyInput.value.trim(),
                embeddingModel: kbEmbeddingModelInput.value.trim(),
                rerankModel: kbRerankModelInput.value.trim(),
                enabled: kbEnabledCheckbox.checked,
                files: currentFiles
            };
            setLocalStorageSafely('knowledgeSettings', JSON.stringify(s), '知识库设置');
            return s;
        }


        function saveMemorySettings() {
            const ltmApiUrlInputEl = document.getElementById('ltm-api-url');
            const ltmApiKeyInputEl = document.getElementById('ltm-api-key');
            const ltmEmbeddingModelInputEl = document.getElementById('ltm-embedding-model');
            const ltmRerankModelInputEl = document.getElementById('ltm-rerank-model');
            const enableLongTermMemoryCheckboxEl = document.getElementById('enable-long-term-memory');
            const ltmRawUrl = ltmApiUrlInputEl?.value?.trim() || '';
            const ltmSettings = {
                apiUrl: normalizeApiUrl(ltmRawUrl) || '',
                apiKey: ltmApiKeyInputEl?.value?.trim() || '',
                embeddingModel: ltmEmbeddingModelInputEl?.value?.trim() || '',
                rerankModel: ltmRerankModelInputEl?.value?.trim() || '',
                enabled: enableLongTermMemoryCheckboxEl?.checked === true
            };
            setLocalStorageSafely('longTermMemorySettings', JSON.stringify(ltmSettings), '长期记忆设置');
            return ltmSettings;
        }

