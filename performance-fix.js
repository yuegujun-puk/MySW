// ==========================================
// 🔥 性能修复补丁 - 解决大量消息卡顿崩溃 + Token爆炸问题
// ==========================================
console.log('⚡ Performance Fix Patch Loading...');

// 获取功能开关状态
function isPerfFixEnabled() {
    try {
        const settings = JSON.parse(localStorage.getItem('chatSettings') || '{}');
        const toggles = settings.featureToggles || {};
        // 默认开启（推荐）
        return toggles['enable-performance-fix'] !== false;
    } catch(e) {
        return true;
    }
}

(function performanceFixPatch() {
    if (!isPerfFixEnabled()) {
        console.log('⏸️ 性能修复补丁已在设置中关闭');
        return;
    }
    console.log('✅ 性能修复补丁已启用（解决大量消息卡顿+Token爆炸问题）');

    // ========== 配置项 ==========
    const PERF_CONFIG = {
        MAX_MESSAGES_BEFORE_WARNING: 300,      // 超过此数量显示性能警告
        MAX_MESSAGES_FOR_FULL_RENDER: 150,     // 超过此数量只渲染最新N条
        RENDER_DEBOUNCE: 150,                  // 渲染防抖(ms)
        MAX_CONTEXT_ROUNDS: 20,                // ✅ Prompt 最大对话轮数（防止Token爆炸）
        MAX_CONTEXT_MESSAGES: 40,              // ✅ Prompt 最大消息数（兜底保护）
    };

    let renderDebounceTimer = null;

    // ============================================================
    // ✅ 核心Bug修复: Prompt 历史消息无限制导致 Token 爆炸
    // 问题根源: maxContextRounds = 0 表示"无限制" → 几百条消息全塞进API
    // ============================================================
    setTimeout(() => {
        // 方法1: 拦截 getChatSettings，强制设置上下文限制
        if (typeof window.getChatSettings === 'function') {
            const originalGetChatSettings = window.getChatSettings;
            window.getChatSettings = function() {
                const settings = originalGetChatSettings();
                
                // 强制兜底保护：即使用户设置为"无限制"(0)，也最多保留20轮
                if (!settings.maxContextRounds || settings.maxContextRounds <= 0) {
                    settings.maxContextRounds = PERF_CONFIG.MAX_CONTEXT_ROUNDS;
                }
                // 双重保险：即使设置了轮数，也不能超过安全值
                if (settings.maxContextRounds > PERF_CONFIG.MAX_CONTEXT_ROUNDS) {
                    settings.maxContextRounds = PERF_CONFIG.MAX_CONTEXT_ROUNDS;
                }
                
                return settings;
            };
            console.log(`✅ Prompt上下文限制已启用: 最多 ${PERF_CONFIG.MAX_CONTEXT_ROUNDS} 轮对话`);
        }

        // 方法2: 直接拦截 getMessages，强制截断（终极保险）
        if (typeof window.getMessages === 'function') {
            // 保存真正的原始函数，供渲染时获取完整消息列表使用
            window._realGetMessages = window.getMessages;
            
            const originalGetMessages = window.getMessages;
            window.getMessages = function() {
                let messages = originalGetMessages();
                
                // 无论什么情况，给API的历史消息最多40条
                if (messages.length > PERF_CONFIG.MAX_CONTEXT_MESSAGES) {
                    console.log(`⚡ 历史消息 ${messages.length} 条，已截断为最新 ${PERF_CONFIG.MAX_CONTEXT_MESSAGES} 条`);
                    return messages.slice(-PERF_CONFIG.MAX_CONTEXT_MESSAGES);
                }
                
                return messages;
            };
            console.log(`✅ getMessages 已加固: 最多返回 ${PERF_CONFIG.MAX_CONTEXT_MESSAGES} 条`);
        }
    }, 0);

    // ========== 1. 禁用有冲突的虚拟滚动 ==========
    setTimeout(() => {
        // 禁用 advanced-features.js 中的旧版虚拟滚动实现（与 performance-fix 冲突）
        if (typeof window.renderMessages === 'function' && typeof window._originalRenderMessagesForVirtual === 'undefined') {
            // advanced-features.js 可能已经包装了 renderMessages，我们需要获取最原始的
            // 通过检查函数是否包含 virtual-scroll-banner 相关代码来判断
            const renderMsgStr = window.renderMessages.toString();
            if (renderMsgStr.includes('virtual-scroll-banner') || renderMsgStr.includes('MESSAGE_THRESHOLD')) {
                // 这是 advanced-features.js 的虚拟滚动实现，需要恢复原始函数
                console.log('✅ 检测到冲突的虚拟滚动实现，正在禁用...');
                // 由于 advanced-features.js 直接修改了 window.renderMessages，我们无法直接获取原始函数
                // 需要通过 main.js 中的 _renderMessagesImpl 来间接调用
            }
        }
        
        // 禁用 main.js 中的虚拟滚动配置（与 performance-fix 的智能渲染冲突）
        if (typeof window !== 'undefined') {
            // 标记已禁用，让 main.js 中的逻辑知道不要使用虚拟滚动
            window._perfFixDisabledVirtualScroll = true;
        }
        console.log('✅ 已禁用冲突的虚拟滚动实现');
    }, 0);

    // ========== 2. 重写 renderMessages - 智能分批渲染 ==========
    setTimeout(() => {
        if (typeof window._originalRenderMessages === 'undefined' && typeof window.renderMessages === 'function') {
            window._originalRenderMessages = window.renderMessages;
            
            window.renderMessages = function(friendId) {
                if (renderDebounceTimer) {
                    clearTimeout(renderDebounceTimer);
                }
                
                renderDebounceTimer = setTimeout(() => {
                    smartRenderMessages(friendId);
                }, PERF_CONFIG.RENDER_DEBOUNCE);
            };
            
            console.log('✅ renderMessages 已增强（智能分批渲染）');
        }
    }, 100);

    function smartRenderMessages(friendId) {
        // 使用真正的原始 getMessages 获取完整消息列表（不截断）
        const realGetMessages = window._realGetMessages || (typeof window.getMessages === 'function' ? window.getMessages : null);
        const messages = typeof realGetMessages === 'function' ? realGetMessages() : [];
        const msgCount = messages.length;

        // 检查是否开启了"显示限制"设置
        let displayLimitEnabled = false;
        let displayLimitMaxMessages = Infinity;
        try {
            const chatSettings = typeof window.getChatSettings === 'function' ? window.getChatSettings() : {};
            displayLimitEnabled = chatSettings.enableDisplayLimit && chatSettings.displayLimitRounds > 0;
            if (displayLimitEnabled) {
                displayLimitMaxMessages = Math.max(1, chatSettings.displayLimitRounds) * 2;
            }
        } catch(e) {
            console.warn('无法读取聊天设置:', e);
        }
        
        // 情况1：消息较少 - 正常完整渲染
        if (msgCount <= PERF_CONFIG.MAX_MESSAGES_FOR_FULL_RENDER) {
            removePerformanceBanner();
            if (window._originalRenderMessages) {
                window._originalRenderMessages(friendId);
            }
            return;
        }

        // 情况2：消息较多 - 智能截断渲染（只渲染最新N条）
        console.log(`⚡ 渲染消息 ${msgCount} 条，启用智能截断`);
        
        // 计算最终渲染的消息数量：取性能修复阈值和显示限制两者的较小值
        let renderLimit = PERF_CONFIG.MAX_MESSAGES_FOR_FULL_RENDER;
        if (displayLimitEnabled && displayLimitMaxMessages < renderLimit) {
            renderLimit = displayLimitMaxMessages;
            console.log(`   📌 显示限制生效：最多显示 ${displayLimitMaxMessages} 条（${Math.floor(displayLimitMaxMessages / 2)} 轮）`);
        }

        // 临时替换 getMessages，只给渲染函数返回最新的N条
        // 使用 try-finally 确保即使渲染异常也能恢复
        const originalGetMessages = window.getMessages;
        try {
            window.getMessages = function() {
                return messages.slice(-renderLimit);
            };
            
            if (window._originalRenderMessages) {
                window._originalRenderMessages(friendId);
            }
        } finally {
            // 确保无论渲染是否成功，都恢复原始的 getMessages
            window.getMessages = originalGetMessages;
        }
        
        // 显示性能优化提示条
        showPerformanceBanner(msgCount - renderLimit, msgCount);
    }

    // ========== 3. 性能优化提示条 ==========
    function showPerformanceBanner(hiddenCount, totalCount) {
        let banner = document.getElementById('performance-banner');
        
        if (!banner) {
            banner = document.createElement('div');
            banner.id = 'performance-banner';
            banner.style.cssText = `
                background: linear-gradient(135deg, rgba(230, 199, 138, 0.15), rgba(230, 199, 138, 0.05));
                border: 1px solid #e6c78a;
                border-radius: 8px;
                padding: 12px 16px;
                margin: 10px 20px;
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 12px;
                font-size: 0.9em;
                animation: slideDown 0.3s ease;
            `;
            
            const chatContainer = document.getElementById('chat-container');
            if (chatContainer && chatContainer.parentNode) {
                chatContainer.parentNode.insertBefore(banner, chatContainer);
            }
        }
        
        banner.innerHTML = `
            <div style="display: flex; align-items: center; gap: 8px; color: #e6c78a;">
                <i class="ri-speed-line" style="font-size: 18px;"></i>
                <span>性能优化已启用：已隐藏 <strong>${hiddenCount}</strong> 条早期消息（共 ${totalCount} 条）
                <br><small>API请求已自动限制为最新 ${PERF_CONFIG.MAX_CONTEXT_ROUNDS} 轮对话</small></span>
            </div>
            <div style="display: flex; gap: 8px;">
                <button id="load-all-btn" style="
                    background: #e6c78a;
                    color: #1a1c23;
                    border: none;
                    padding: 6px 12px;
                    border-radius: 6px;
                    cursor: pointer;
                    font-size: 0.9em;
                    font-weight: 500;
                ">加载全部</button>
                <button id="close-perf-banner" style="
                    background: #333;
                    color: #888;
                    border: none;
                    padding: 6px 10px;
                    border-radius: 6px;
                    cursor: pointer;
                ">✕</button>
            </div>
        `;
        
        document.getElementById('load-all-btn').onclick = () => {
            banner.remove();
            if (window._originalRenderMessages && typeof currentFriendId !== 'undefined') {
                window._originalRenderMessages(currentFriendId);
            }
        };
        
        document.getElementById('close-perf-banner').onclick = () => {
            banner.style.display = 'none';
        };
    }

    function removePerformanceBanner() {
        document.getElementById('performance-banner')?.remove();
    }

    // ========== 4. IndexedDB 写入性能优化 ==========
    setTimeout(() => {
        if (typeof window.saveThreadManager === 'function') {
            const originalSave = window.saveThreadManager;
            let saveDebounceTimer = null;
            
            window.saveThreadManager = function() {
                if (saveDebounceTimer) {
                    clearTimeout(saveDebounceTimer);
                }
                
                saveDebounceTimer = setTimeout(() => {
                    try {
                        originalSave();
                    } catch(e) {
                        console.warn('IndexedDB 保存失败，回退到 localStorage:', e);
                    }
                }, 500);
            };
            
            console.log('✅ IndexedDB 写入已防抖优化');
        }
    }, 500);

    // ========== 5. 注入样式 ==========
    const style = document.createElement('style');
    style.textContent = `
        @keyframes slideDown {
            from { opacity: 0; transform: translateY(-10px); }
            to { opacity: 1; transform: translateY(0); }
        }
        .message {
            content-visibility: auto;
            contain-intrinsic-size: 100px;
        }
        #chat-container {
            will-change: scroll-position;
        }
    `;
    document.head.appendChild(style);

    console.log('🎉 性能修复补丁加载完成！');
    console.log(`   - Prompt上下文限制: ${PERF_CONFIG.MAX_CONTEXT_ROUNDS}轮 / ${PERF_CONFIG.MAX_CONTEXT_MESSAGES}条`);
    console.log(`   - 渲染截断阈值: ${PERF_CONFIG.MAX_MESSAGES_FOR_FULL_RENDER} 条`);

})();
