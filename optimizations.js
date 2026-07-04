// ==========================================
// My SW 优化与新功能增强补丁（带设置开关）
// ==========================================

console.log('🚀 My SW Optimizations Loading...');

// 获取功能开关状态
function isFeatureEnabled(featureId) {
    try {
        const settings = JSON.parse(localStorage.getItem('chatSettings') || '{}');
        const toggles = settings.featureToggles || {};
        // 默认全部关闭
        return toggles[featureId] === true;
    } catch(e) {
        return false;
    }
}

// ==========================================
// 1. Bug 修复：语音输入内存泄漏 + 单例模式（始终启用，因为是Bug修复）
// ==========================================
(function fixVoiceInputMemoryLeak() {
    let recognitionInstance = null;
    let mediaRecorderInstance = null;
    let audioStreamInstance = null;

    function cleanupVoiceInput() {
        if (recognitionInstance) {
            try { recognitionInstance.stop(); } catch(e) {}
            recognitionInstance = null;
        }
        if (mediaRecorderInstance && mediaRecorderInstance.state === 'recording') {
            try { mediaRecorderInstance.stop(); } catch(e) {}
        }
        if (audioStreamInstance) {
            audioStreamInstance.getTracks().forEach(t => {
                try { t.stop(); } catch(e) {}
            });
            audioStreamInstance = null;
        }
        mediaRecorderInstance = null;
        if (typeof voiceInputBtn !== 'undefined') {
            voiceInputBtn?.classList.remove('recording');
        }
    }

    window.addEventListener('beforeunload', cleanupVoiceInput);
    window.addEventListener('pagehide', cleanupVoiceInput);

    setTimeout(() => {
        if (typeof initVoiceInput !== 'function') return;
        
        const originalInitVoiceInput = window.initVoiceInput;
        window.initVoiceInput = function() {
            cleanupVoiceInput();
            
            if (!voiceInputBtn) return;

            if (navigator.mediaDevices?.getUserMedia && window.MediaRecorder) {
                voiceInputBtn.title = '录制语音消息';
                voiceInputBtn.onclick = async () => {
                    if (mediaRecorderInstance && mediaRecorderInstance.state === 'recording') {
                        mediaRecorderInstance.stop();
                        return;
                    }
                    try {
                        audioStreamInstance = await navigator.mediaDevices.getUserMedia({ audio: true });
                        voiceChunks = [];
                        mediaRecorderInstance = new MediaRecorder(audioStreamInstance);
                        
                        mediaRecorderInstance.ondataavailable = event => {
                            if (event.data && event.data.size > 0) voiceChunks.push(event.data);
                        };
                        mediaRecorderInstance.onstop = () => {
                            cleanupVoiceInput();
                            const blob = new Blob(voiceChunks, { type: mediaRecorderInstance.mimeType || 'audio/webm' });
                            if (!blob.size) return;
                            const reader = new FileReader();
                            reader.onload = event => sendMessage(event.target.result, 'audio');
                            reader.readAsDataURL(blob);
                        };
                        mediaRecorderInstance.start();
                        voiceInputBtn.classList.add('recording');
                        if (typeof showToast === 'function') {
                            showToast('正在录音，再次点击结束并发送', 'ri-mic-line');
                        }
                    } catch (error) {
                        cleanupVoiceInput();
                        if (typeof showToast === 'function') {
                            showToast(`无法录音：${error.message}`, 'ri-mic-off-line');
                        }
                    }
                };
                return;
            }

            const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
            if (!SpeechRecognition) {
                voiceInputBtn.title = '当前浏览器不支持语音录制或语音输入';
                voiceInputBtn.style.opacity = '0.45';
                return;
            }
            
            recognitionInstance = new SpeechRecognition();
            recognitionInstance.lang = 'zh-CN';
            recognitionInstance.interimResults = false;
            recognitionInstance.continuous = false;
            
            voiceInputBtn.onclick = () => {
                try {
                    voiceInputBtn.classList.add('recording');
                    recognitionInstance.start();
                } catch(e) {
                    cleanupVoiceInput();
                }
            };
            recognitionInstance.onresult = event => {
                const text = Array.from(event.results).map(result => result[0].transcript).join('').trim();
                if (text) {
                    messageInput.value = text;
                    if (typeof autoResizeMessageInput === 'function') autoResizeMessageInput();
                    messageInput.focus();
                    if (typeof saveMessageDraft === 'function') saveMessageDraft();
                }
            };
            recognitionInstance.onend = () => voiceInputBtn.classList.remove('recording');
            recognitionInstance.onerror = () => {
                cleanupVoiceInput();
                if (typeof showToast === 'function') {
                    showToast('语音输入失败，请重试', 'ri-mic-off-line');
                }
            };
        };
    }, 100);
    
    console.log('✅ 语音输入内存泄漏已修复');
})();

// ==========================================
// 2. IndexedDB 批量写入防抖优化（始终启用）
// ==========================================
(function optimizeIndexedDB() {
    setTimeout(() => {
        if (typeof setLocalStorageSafely !== 'function') return;
        
        const originalSetLocalStorageSafely = window.setLocalStorageSafely;
        const saveQueue = new Map();
        let saveTimer = null;
        const SAVE_DEBOUNCE_MS = 500;

        function flushSaveQueue() {
            saveQueue.forEach((value, key) => {
                if (typeof IndexedDBStorage !== 'undefined' && IndexedDBStorage.setItem) {
                    IndexedDBStorage.setItem(key, value).catch(() => {});
                }
            });
            saveQueue.clear();
            saveTimer = null;
        }

        window.setLocalStorageSafely = function(key, value, label = '数据') {
            saveQueue.set(key, value);
            clearTimeout(saveTimer);
            saveTimer = setTimeout(flushSaveQueue, SAVE_DEBOUNCE_MS);
            
            try {
                localStorage.setItem(key, value);
                return true;
            } catch (error) {
                console.error(`${label} 保存失败:`, error);
                const quotaExceeded = error?.name === 'QuotaExceededError' || error?.code === 22;
                const message = quotaExceeded
                    ? `${label} 保存失败：浏览器存储空间不足，请先导出备份并清理图片/知识库。`
                    : `${label} 保存失败：${error.message || error}`;
                if (typeof showToast === 'function') showToast(message, 'ri-database-2-line');
                return false;
            }
        };
        
        window.addEventListener('beforeunload', flushSaveQueue);
        console.log('✅ IndexedDB 批量写入优化已启用');
    }, 100);
})();

// ==========================================
// 4. 移动端长按事件修复（始终启用）
// ==========================================
(function fixLongPressEvents() {
    setTimeout(() => {
        if (typeof renderFriendList !== 'function') return;
        
        const originalRenderFriendList = window.renderFriendList;
        window.renderFriendList = function() {
            originalRenderFriendList.apply(this, arguments);
            
            document.querySelectorAll('.friend-item').forEach(item => {
                const avatar = item.querySelector('.avatar');
                if (avatar && !avatar._longPressFixed) {
                    avatar._longPressFixed = true;
                    let pressTimer;
                    
                    const clearTimer = () => {
                        clearTimeout(pressTimer);
                        pressTimer = null;
                    };
                    
                    avatar.addEventListener('touchstart', (e) => {
                        pressTimer = setTimeout(() => {
                            if (typeof showFriendContextMenu === 'function') {
                                showFriendContextMenu(e, item.dataset.friendId);
                            }
                        }, typeof LONG_PRESS_DELAY_MS !== 'undefined' ? LONG_PRESS_DELAY_MS : 650);
                    });
                    avatar.addEventListener('touchend', clearTimer);
                    avatar.addEventListener('touchmove', clearTimer);
                    avatar.addEventListener('touchcancel', clearTimer);
                }
            });
        };
        console.log('✅ 移动端长按事件已修复');
    }, 100);
})();

// ==========================================
// 5. LaTeX + Mermaid 渲染支持（开关控制：enable-latex-mermaid）
// ==========================================
(function enableLatexMermaid() {
    if (!isFeatureEnabled('enable-latex-mermaid')) {
        console.log('⏸️ LaTeX/Mermaid 已在设置中关闭');
        return;
    }

    const katexCss = document.createElement('link');
    katexCss.rel = 'stylesheet';
    katexCss.href = 'https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css';
    document.head.appendChild(katexCss);

    function loadScript(url, callback) {
        const script = document.createElement('script');
        script.src = url;
        script.onload = callback;
        document.head.appendChild(script);
    }

    let katexLoaded = false;
    let mermaidLoaded = false;

    loadScript('https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js', () => {
        katexLoaded = true;
        console.log('✅ KaTeX 已加载');
    });

    loadScript('https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js', () => {
        if (window.mermaid) {
            mermaid.initialize({
                startOnLoad: false,
                theme: 'dark',
                themeVariables: {
                    primaryColor: '#e6c78a',
                    primaryTextColor: '#333',
                    primaryBorderColor: '#c9a85f',
                    lineColor: '#888',
                    textColor: '#eee',
                    mainBkg: '#2a2d3a',
                    nodeBkg: '#2a2d3a',
                    nodeBorder: '#e6c78a',
                    clusterBkg: '#1f2128',
                    clusterBorder: '#555'
                }
            });
            mermaidLoaded = true;
            console.log('✅ Mermaid 已加载');
        }
    });

    window.renderMathAndDiagrams = function(content) {
        if (!content) return content;
        
        content = content.replace(/\$([^\$\n]+)\$/g, (match, formula) => {
            if (katexLoaded && window.katex) {
                try {
                    return katex.renderToString(formula.trim(), {
                        throwOnError: false,
                        displayMode: false
                    });
                } catch(e) {
                    return match;
                }
            }
            return match;
        });

        content = content.replace(/\$\$([^\$]+)\$\$/g, (match, formula) => {
            if (katexLoaded && window.katex) {
                try {
                    return '<div class="katex-display">' + katex.renderToString(formula.trim(), {
                        throwOnError: false,
                        displayMode: true
                    }) + '</div>';
                } catch(e) {
                    return match;
                }
            }
            return match;
        });

        return content;
    };

    window.renderMermaidDiagrams = function(container) {
        if (!mermaidLoaded || !window.mermaid) return;
        
        container.querySelectorAll('pre code.language-mermaid, .mermaid-code').forEach(async (el) => {
            const diagramCode = el.textContent || el.innerText;
            const id = 'mermaid-' + Math.random().toString(36).substr(2, 9);
            
            try {
                const { svg } = await mermaid.render(id, diagramCode);
                const wrapper = document.createElement('div');
                wrapper.className = 'mermaid-diagram';
                wrapper.innerHTML = svg;
                el.parentNode.replaceChild(wrapper, el);
            } catch(e) {
                console.warn('Mermaid 渲染失败:', e);
            }
        });
    };

    const style = document.createElement('style');
    style.textContent = `
        .katex { font-size: 1.1em; }
        .katex-display { overflow-x: auto; overflow-y: hidden; padding: 10px 0; margin: 10px 0; }
        .mermaid-diagram { background: #1a1c23; padding: 16px; border-radius: 8px; margin: 12px 0; text-align: center; }
        .mermaid-diagram svg { max-width: 100%; height: auto; }
    `;
    document.head.appendChild(style);
    
    console.log('✅ LaTeX/Mermaid 支持已启用');
})();

// ==========================================
// 6. 消息引用/回复功能（开关控制：enable-message-reply）
// ==========================================
(function enableMessageReply() {
    if (!isFeatureEnabled('enable-message-reply')) {
        console.log('⏸️ 消息引用功能已在设置中关闭');
        return;
    }

    let replyingToMessage = null;

    const replyBar = document.createElement('div');
    replyBar.id = 'reply-preview-bar';
    replyBar.style.cssText = `
        display: none;
        background: rgba(230, 199, 138, 0.1);
        border-left: 3px solid #e6c78a;
        padding: 8px 12px;
        margin-bottom: 8px;
        border-radius: 4px;
        font-size: 0.9em;
        color: #aaa;
    `;
    replyBar.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center;">
            <div>
                <span style="color: #e6c78a;">↩️ 回复</span>
                <span id="reply-preview-text" style="margin-left: 8px;"></span>
            </div>
            <button id="cancel-reply-btn" style="background:none; border:none; color:#888; cursor:pointer; padding:4px;">✕</button>
        </div>
    `;
    
    setTimeout(() => {
        const inputWrapper = document.querySelector('.input-wrapper')?.parentElement;
        if (inputWrapper) {
            inputWrapper.insertBefore(replyBar, inputWrapper.firstChild);
        }

        document.getElementById('cancel-reply-btn')?.addEventListener('click', () => {
            replyingToMessage = null;
            replyBar.style.display = 'none';
        });

        window.addReplyMenuItem = function(menu, msgId, content) {
            const replyItem = document.createElement('div');
            replyItem.className = 'friend-menu-item';
            replyItem.innerHTML = '<i class="ri-reply-line"></i> 回复此消息';
            replyItem.onclick = (e) => {
                e.stopPropagation();
                replyingToMessage = { id: msgId, content: content.substring(0, 50) + (content.length > 50 ? '...' : '') };
                document.getElementById('reply-preview-text').textContent = replyingToMessage.content;
                replyBar.style.display = 'block';
                document.getElementById('friend-context-menu').hidden = true;
                messageInput.focus();
            };
            menu.insertBefore(replyItem, menu.firstChild);
        };

        if (typeof sendMessage === 'function') {
            const originalSendMessage = window.sendMessage;
            window.sendMessage = function(content, type = 'text') {
                if (replyingToMessage && type === 'text') {
                    content = `> [回复消息 #${replyingToMessage.id}]\n> ${replyingToMessage.content}\n\n${content}`;
                }
                replyingToMessage = null;
                replyBar.style.display = 'none';
                return originalSendMessage ? originalSendMessage(content, type) : content;
            };
        }
    }, 500);

    const style = document.createElement('style');
    style.textContent = `
        .message-quote {
            border-left: 3px solid #e6c78a;
            padding-left: 10px;
            color: #888;
            font-size: 0.9em;
            margin-bottom: 8px;
            font-style: italic;
        }
    `;
    document.head.appendChild(style);
    
    console.log('✅ 消息引用功能已启用');
})();

// ==========================================
// 7. 跨标签页草稿同步（开关控制：enable-draft-sync）
// ==========================================
(function enableDraftSync() {
    if (!isFeatureEnabled('enable-draft-sync')) {
        console.log('⏸️ 跨标签页草稿同步已在设置中关闭');
        return;
    }

    if (!window.BroadcastChannel) {
        console.warn('⚠️ 浏览器不支持 BroadcastChannel');
        return;
    }
    
    const channel = new BroadcastChannel('mysw-draft-sync');
    
    channel.onmessage = (event) => {
        if (event.data.type === 'draft-update' && typeof currentFriendId !== 'undefined' && event.data.friendId === currentFriendId) {
            if (messageInput && messageInput.value !== event.data.content) {
                messageInput.value = event.data.content;
                if (typeof autoResizeMessageInput === 'function') autoResizeMessageInput();
            }
        }
    };

    setTimeout(() => {
        if (typeof saveMessageDraft === 'function') {
            const originalSaveMessageDraft = window.saveMessageDraft;
            window.saveMessageDraft = function() {
                if (originalSaveMessageDraft) originalSaveMessageDraft();
                
                channel.postMessage({
                    type: 'draft-update',
                    friendId: currentFriendId,
                    content: messageInput?.value || ''
                });
            };
        }
    }, 500);
    
    console.log('✅ 跨标签页草稿同步已启用');
})();

console.log('🎉 优化补丁加载完成！（可在设置面板开关各功能）');
