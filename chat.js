// 从 main.js 拆分出的功能模块，保持全局函数声明以兼容现有非模块脚本架构。

// ========== 常量定义 ==========
const STREAM_RENDER_INTERVAL_MS = 80; // 流式渲染最小间隔（毫秒）
const MAX_CONTEXT_ROUNDS_DEFAULT = 50; // 默认最大上下文轮数
const MEMORY_SEARCH_LIMIT = 5; // 长期记忆检索数量
const KNOWLEDGE_SEARCH_LIMIT = 3; // 知识库检索数量
const QUICK_REPLY_COUNT = 2; // 快捷回复生成数量
const QUICK_REPLY_MAX_LENGTH = 20; // 快捷回复最大长度
const SUMMARY_RECENT_MESSAGES = 30; // 摘要最近消息数
const SUMMARY_MAX_LENGTH = 500; // 摘要最大字数
const LONG_PRESS_DELAY_MS = 650; // 长按延迟（毫秒）
const DRAFT_SAVE_DELAY_MS = 300; // 草稿保存延迟（毫秒）
const PROACTIVE_CARE_CHECK_INTERVAL_MS = 60000; // 主动关怀检查间隔（毫秒）

// ========== 内存缓存层 ==========
const LocalStorageCache = {
    _cache: new Map(),
    _timestamps: new Map(),
    _TTL: 5000, // 5 秒缓存有效期

    get(key) {
        const timestamp = this._timestamps.get(key);
        if (timestamp && Date.now() - timestamp < this._TTL) {
            return this._cache.get(key);
        }
        // 缓存过期或不存在，从 localStorage 读取
        const value = localStorage.getItem(key);
        if (value !== null) {
            this.set(key, value);
        }
        return value;
    },

    set(key, value) {
        this._cache.set(key, value);
        this._timestamps.set(key, Date.now());
    },

    clear() {
        this._cache.clear();
        this._timestamps.clear();
    },
    // 清除指定 key 的缓存，用于数据变更时保持同步
    invalidate(key) {
        this._cache.delete(key);
        this._timestamps.delete(key);
    },

    parseJSON(key, defaultValue = null) {
        const cached = this.get(key);
        if (cached === null || cached === undefined) return defaultValue;
        try {
            return JSON.parse(cached);
        } catch (e) {
            console.warn('LocalStorageCache: JSON 解析失败', key, e);
            return defaultValue;
        }
    }
};

        function buildAIMessageContent(message) {
            const text = message.content || '';
            
            // 图片消息
            if (message.type === 'image') {
                const vision = LocalStorageCache.parseJSON('visionSettings', {});
                if (vision.enabled !== true) return `[图片] ${text}`;
                return [
                    { type: 'text', text: text.startsWith('data:image') ? '请描述这张图片，并结合上下文回复。' : `请查看这张图片：${text}` },
                    { type: 'image_url', image_url: { url: text } }
                ];
            }
            
            // 视频消息
            if (message.type === 'video') {
                const vision = LocalStorageCache.parseJSON('visionSettings', {});
                if (vision.enabled !== true) return `[视频文件]`;
                // 注意：OpenAI 格式目前不直接支持视频，这里转为文本提示
                // 实际视频识别需要模型支持（如 GPT-4o video）
                return `[视频文件已发送，请分析视频内容并回复]`;
            }
            
            return text;
        }

        async function callAI(userMessage, options = {}) {
            const friend = friendsData[currentFriendId];
            if (!friend) {
                console.error('当前好友数据不存在:', currentFriendId);
                return;
            }

            if (options.imageUrl && JSON.parse(localStorage.getItem('visionSettings') || '{}').enabled !== true) {
                appendMessageToDOM('other', '⚠️ 图片识别未启用。请在「AI 配置 → 多模态视觉」中开启，并确认后端模型支持视觉。', 'text', friend.avatar, getFriendDisplayName(currentFriendId));
                return;
            }

            if (!navigator.onLine) {
                if (!options.skipOfflineQueue) queueOfflineMessage(userMessage);
                appendMessageToDOM('other', '⚠️ 当前处于离线模式，已保存你的消息；联网后会自动重试。', 'text', friend.avatar, getFriendDisplayName(currentFriendId));
                return;
            }

            const apiSettings = LocalStorageCache.parseJSON('aiChatSettings');
            const chatSettings = getChatSettings();
            const aiRequestStart = performance.now();

            if (!apiSettings || !apiSettings.apiUrl || !apiSettings.apiKey) {
                appendMessageToDOM('other', "❌ 请先在设置中配置 API 地址和 Key！", 'text', friend.avatar, getFriendDisplayName(currentFriendId));
                return;
            }

            const systemPrompt = friend.systemPrompt;

            const loadingId = 'loading-' + Date.now();
            const loadingDiv = document.createElement('div');
            loadingDiv.id = loadingId;
            loadingDiv.classList.add('message', 'other');
            loadingDiv.innerHTML = `
                <img src="${friend.avatar}" class="avatar">
                <div class="message-content">
                    <span class="nickname">${getFriendDisplayName(currentFriendId)}</span>
                    <div class="bubble">
                        <div class="thinking-dots">
                            <span></span>
                            <span></span>
                            <span></span>
                        </div>
                    </div>
                </div>
            `;
            chatMessages.appendChild(loadingDiv);
            scrollToBottom();

            let history = getMessages().slice();

            // 多媒体消息处理：仅在未开启视觉功能时过滤图片/视频，开启则保留
            const vision = LocalStorageCache.parseJSON('visionSettings', {});
            if (vision.enabled !== true) {
                history = history.filter(msg => msg.type !== 'image' && msg.type !== 'video');
            }

            const rounds = chatSettings.maxContextRounds;
            // 0 表示无限制，保留完整历史；大于 0 则限制轮数
            if (rounds > 0 && history.length > rounds * 2) {
                history = history.slice(-rounds * 2);
            }


            let memoryContext = "";
            let knowledgeContext = "";

            if (chatSettings.enableLongTermMemory) {
                try {
                    const relevantMemories = await searchMemoriesByVector(userMessage, MEMORY_SEARCH_LIMIT);
                    if (relevantMemories.length > 0) {
                        memoryContext = "\n\n[长期记忆 - 相关检索]\n以下是与当前话题相关的记忆，请在回复中自然地体现出来：\n";
                        relevantMemories.forEach(m => {
                            memoryContext += `- ${m.key}: ${m.value} (相关度：${(m.score * 100).toFixed(0)}%)\n`;
                        });
                    }
                } catch (e) {
                    console.warn('长期记忆检索失败:', e);
                }
            }


            const kbSettings = LocalStorageCache.parseJSON('knowledgeSettings', {});
            if (kbSettings.enabled) {
                try {
                    const kbResults = await queryKnowledgeBase(userMessage, KNOWLEDGE_SEARCH_LIMIT);
                    if (kbResults.length > 0) {
                        knowledgeContext = "\n\n[背景信息]\n以下是与当前话题相关的背景信息，请在回复中自然地融入这些内容，不要提及信息来源：\n";
                        kbResults.forEach((r, i) => {
                            knowledgeContext += `- ${r.content}\n`;
                        });
                    }
                } catch (e) {
                    console.warn('知识库检索失败:', e);
                }
            }


            // 感知现实时间：让 AI 自己决定如何使用时间信息
            let realTimeContext = "";
            if (chatSettings.enableRealTime) {
                const now = new Date();
                const year = now.getFullYear();
                const month = String(now.getMonth() + 1).padStart(2, '0');
                const day = String(now.getDate()).padStart(2, '0');
                const hours = String(now.getHours()).padStart(2, '0');
                const minutes = String(now.getMinutes()).padStart(2, '0');
                const seconds = String(now.getSeconds()).padStart(2, '0');
                const weekdays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
                const weekday = weekdays[now.getDay()];

                const holidayName = getHolidayName(year, month, day);

                // 提供完整的时间信息，但让 AI 根据情境自然选择使用哪些部分
                let timeInfo = `当前完整时间信息：${year}年${month}月${day}日 ${hours}:${minutes} ${weekday}`;
                if (holidayName) {
                    timeInfo += ` 今日节日：${holidayName}`;
                }
                realTimeContext = `\n\n[时间参考]${timeInfo}。\n请根据对话情境自然地决定是否提及时间及提及的详细程度（如只说"今天早上"、"今天"、"这个周末"等），避免机械地重复完整日期时间。`;
            }

            const fullSystemPrompt = systemPrompt + memoryContext + knowledgeContext + realTimeContext;

            // 角色设定：自然融入对话
            const enhancedSystemInstruction = `请以上述角色的身份与用户进行对话。

对话时请注意：
- 保持角色的性格特点和说话方式
- 结合角色的背景故事与人设进行回应
- 自然地与用户交流，就像真实人物一样`;

            const messagesContext = [
                { role: "system", content: enhancedSystemInstruction },
                { role: "system", content: fullSystemPrompt },
                { role: "system", content: `当前与我对话的用户名字是：${myUserName}。请在回复中自然地使用这个名字称呼对方。` },
                ...history.map(h => ({ role: h.role === 'mine' ? 'user' : 'assistant', content: buildAIMessageContent(h) }))
            ];

            try {
                if (chatSettings.enableStreamingInput !== false) {
                    // 流式响应模式
                    const response = await ApiModule.fetchChat(apiSettings, messagesContext, {
                        max_tokens: chatSettings.maxTokens,
                        stream: chatSettings.enableStreamingInput !== false
                    });

                    if (!response.ok) {
                        const errData = await response.json();
                        throw new Error(errData.error?.message || `API Error: ${response.status}`);
                    }

                    document.getElementById(loadingId)?.remove();

                    // 使用与保存后一致的消息 ID，确保重新生成、引用、开新对话等功能正常工作
                    const tempMsgId = String(getNextMessageId());
                    const reader = response.body.getReader();
                    const decoder = new TextDecoder('utf-8');
                    let accumulatedContent = '';
                    let lastValidContent = '';
                    let chunkCount = 0;
                    let hasReceivedDone = false;
                    let streamBuffer = '';
                    let pendingStreamRender = false;
                    let lastStreamRenderAt = 0;
                    let streamRenderFinalized = false;

                    const scheduleStreamTextRender = () => {
                        const now = performance.now();
                        if (pendingStreamRender && now - lastStreamRenderAt < STREAM_RENDER_INTERVAL_MS) return;
                        pendingStreamRender = true;
                        requestAnimationFrame(() => {
                            if (streamRenderFinalized) { pendingStreamRender = false; return; }
                            pendingStreamRender = false;
                            lastStreamRenderAt = performance.now();
                            bubbleElement.textContent = accumulatedContent;
                            scrollToBottom();
                        });
                    };

                    const processStreamLine = (line) => {
                        line = line.trimEnd();
                        if (!line.startsWith('data:')) return;
                        const dataStr = line.slice(5).trim();
                        if (!dataStr) return;
                        if (dataStr === '[DONE]') {
                            hasReceivedDone = true;
                            return;
                        }
                        try {
                            const data = JSON.parse(dataStr);
                            const delta = data.choices[0]?.delta?.content || '';
                            if (delta) {
                                accumulatedContent += delta;
                                lastValidContent = accumulatedContent;
                                scheduleStreamTextRender();
                            }
                        } catch (e) {
                            console.warn('JSON 解析错误:', e, '原始数据:', line);
                        }
                    };

                    // 创建消息元素（使用临时 ID，待保存后更新为真实 ID）
                    const messageDiv = document.createElement('div');
                    messageDiv.classList.add('message', 'other');
                    messageDiv.dataset.messageId = tempMsgId;
                    messageDiv.innerHTML = `
                        <img src="${friend.avatar}" class="avatar">
                        <div class="message-content">
                            <span class="nickname">${getFriendDisplayName(currentFriendId)}</span>
                            <div class="bubble"></div>
                        </div>
                    `;
                    chatMessages.appendChild(messageDiv);
                    const bubbleElement = messageDiv.querySelector('.bubble');

                    try {
                        while (true) {
                            const { done, value } = await reader.read();

                            // 处理接收到的数据块
                            if (value) {
                                chunkCount++;
                                streamBuffer += decoder.decode(value, { stream: true });
                                const lines = streamBuffer.split(/\r?\n/);
                                streamBuffer = lines.pop() || '';
                                lines.forEach(processStreamLine);
                            }

                            // 正常结束
                            if (done) {
                                const tail = streamBuffer + decoder.decode();
                                if (tail.trim()) tail.split(/\r?\n/).forEach(processStreamLine);
                                break;
                            }
                        }
                    } catch (readError) {
                        console.warn('流式读取过程中出错:', readError);
                        // 即使出错，也保留已接收到的内容
                    } finally {
                        reader.releaseLock();
                    }

                    // 【关键修复】强制刷新缓冲区：确保所有已接收的内容都被保存
                    // 如果 accumulatedContent 为空但 lastValidContent 有值，使用 lastValidContent
                    if (!accumulatedContent && lastValidContent) {
                        accumulatedContent = lastValidContent;
                    }

                    // 如果收到数据但没有收到 [DONE] 标记，说明连接可能意外中断
                    if (chunkCount > 0 && !hasReceivedDone) {
                        console.warn('检测到非正常结束：接收到', chunkCount, '个数据块但未收到 [DONE] 标记');
                        // 在内容末尾添加提示，但不阻止保存
                        if (accumulatedContent) {
                            // 不修改内容，直接保存已有内容
                        }
                    }

                    // 最终确认：仅在完全没有内容时显示失败；缺少 [DONE] 不再污染已收到的正文。
                    const finalContent = accumulatedContent || lastValidContent || '⚠️ 回答生成失败，请尝试重新发送';

                    // 最终再执行一次 Markdown 解析，避免流式阶段高频解析阻塞 UI
                    streamRenderFinalized = true;
                    bubbleElement.innerHTML = sanitizeMessage(marked.parse(finalContent));
                    enhanceCodeBlocks(bubbleElement);

                    const elapsedMs = Math.round(performance.now() - aiRequestStart);
                    const savedAiMessage = addMessageToThread('other', finalContent, 'text');
                    if (savedAiMessage) {
                        savedAiMessage.elapsedMs = elapsedMs;
                        saveThreadManager();
                    }
                    if (savedAiMessage?.id) messageDiv.dataset.messageId = savedAiMessage.id;
                    const metaDiv = document.createElement('div');
                    metaDiv.className = 'message-meta';
                    metaDiv.textContent = `回复耗时 ${(elapsedMs / 1000).toFixed(1)}s`;
                    messageDiv.querySelector('.message-content')?.appendChild(metaDiv);

                    if (chatSettings.enableLongTermMemory) {
                        extractMemories(userMessage, finalContent);
                    }

                    if (chatSettings.enableProactiveCare) {
                        triggerProactiveCare(userMessage, finalContent);
                    }

                    if (chatSettings.enableLazyMode) {
                        generateQuickReplies(userMessage, finalContent);
                    }

                    maybeAutoReadAiReply(finalContent);

                    // 流式响应模式下手动添加消息操作按钮
                    {
                        const actionsDiv = document.createElement('div');
                        actionsDiv.className = 'message-actions';
                        // 使用保存后的真实消息 ID，确保重新生成、引用、开新对话等功能正常工作
                        const finalMsgId = savedAiMessage?.id || tempMsgId;

                        if (showRegenerateBtnCheckbox.checked) {
                            const regenerateBtn = document.createElement('div');
                            regenerateBtn.className = 'regenerate-btn';
                            regenerateBtn.innerHTML = '<i class="ri-refresh-line"></i>';
                            regenerateBtn.title = '重新回答';
                            regenerateBtn.addEventListener('click', () => {
                                console.log('重新回答按钮点击，messageId:', finalMsgId);
                                regenerateAIResponse(finalMsgId);
                            });
                            actionsDiv.appendChild(regenerateBtn);
                        }
                        if (getFeatureToggles().showMessageTts) {
                            const ttsBtn = document.createElement('div');
                            ttsBtn.className = 'regenerate-btn';
                            ttsBtn.innerHTML = '<i class="ri-volume-up-line"></i>';
                            ttsBtn.title = '朗读消息';
                            ttsBtn.addEventListener('click', () => speakMessageText(finalContent));
                            actionsDiv.appendChild(ttsBtn);
                        }
                        if (getFeatureToggles().showMessageQuote) {
                            const quoteBtn = document.createElement('div');
                            quoteBtn.className = 'regenerate-btn';
                            quoteBtn.innerHTML = '<i class="ri-double-quotes-l"></i>';
                            quoteBtn.title = '引用回复';
                            quoteBtn.addEventListener('click', () => quoteMessageForReply({ id: finalMsgId, role: 'other', content: finalContent, name: getFriendDisplayName(currentFriendId) }));
                            actionsDiv.appendChild(quoteBtn);
                        }
                        if (getFeatureToggles().showBranchButtons) {
                            const branchBtn = document.createElement('div');
                            branchBtn.className = 'regenerate-btn';
                            branchBtn.innerHTML = '<i class="ri-git-branch-line"></i>';
                            branchBtn.title = '从此处开新对话';
                            branchBtn.addEventListener('click', () => createBranchFromMessage(finalMsgId));
                            actionsDiv.appendChild(branchBtn);
                        }
                        if (actionsDiv.children.length > 0) messageDiv.querySelector(".message-content").appendChild(actionsDiv);
                    }
                } else {
                    // 非流式响应模式
                    const response = await ApiModule.fetchChat(apiSettings, messagesContext, {
                        max_tokens: chatSettings.maxTokens,
                        stream: false
                    });

                    if (!response.ok) {
                        const errData = await response.json();
                        throw new Error(errData.error?.message || `API Error: ${response.status}`);
                    }

                    const data = await response.json();
                    const aiResponse = data.choices[0].message.content;

                    document.getElementById(loadingId)?.remove();

                    const elapsedMs = Math.round(performance.now() - aiRequestStart);
                    const savedAiMessage = addMessageToThread('other', aiResponse, 'text');
                    if (savedAiMessage) {
                        savedAiMessage.elapsedMs = elapsedMs;
                        saveThreadManager();
                    }
                    const msgId = savedAiMessage?.id || Date.now().toString();
                    appendMessageToDOM('other', aiResponse, 'text', friend.avatar, getFriendDisplayName(currentFriendId), false, msgId, { elapsedMs });
                    scrollToBottom();

                    if (chatSettings.enableLongTermMemory) {
                        extractMemories(userMessage, aiResponse);
                    }

                    if (chatSettings.enableProactiveCare) {
                        triggerProactiveCare(userMessage, aiResponse);
                    }

                    if (chatSettings.enableLazyMode) {
                        generateQuickReplies(userMessage, aiResponse);
                    }

                    maybeAutoReadAiReply(aiResponse);
                }

            } catch (error) {
                console.error(error);
                document.getElementById(loadingId)?.remove();
                // 使用统一的错误处理函数提供友好的错误提示
                const friendlyError = ApiModule.handleApiError(error, 'AI 请求');
                const savedErrorMessage = addMessageToThread('other', friendlyError, 'text', false, { failed: true });
                appendMessageToDOM('other', friendlyError, 'text', friend.avatar, getFriendDisplayName(currentFriendId), false, savedErrorMessage?.id || Date.now().toString(), { failed: true });

                // 请求出错时，保留带消息 ID 的 AI 错误回复，方便点击重新回答。
                cleanupFailedContext();
            }
        }

        // 清理失败的上下文：仅删除最后一条 AI 错误消息，保留用户消息

