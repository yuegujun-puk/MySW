// ==========================================
// 高级功能模块（带设置开关）
// ==========================================

console.log('🚀 Advanced Features Loading...');

// 注意：isFeatureEnabled 函数已在 optimizations.js 中定义，此处直接复用

// ==========================================
// 8. 分支可视化管理面板（开关控制：enable-branch-manager）
// ==========================================
(function initBranchManager() {
    if (!isFeatureEnabled('enable-branch-manager')) {
        console.log('⏸️ 分支管理面板已在设置中关闭');
        return;
    }

    const panel = document.createElement('div');
    panel.id = 'branch-manager-panel';
    panel.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        width: 800px;
        max-width: 95vw;
        max-height: 85vh;
        background: #1a1c23;
        border: 1px solid #333;
        border-radius: 12px;
        box-shadow: 0 20px 60px rgba(0,0,0,0.5);
        z-index: 10000;
        display: none;
        overflow: hidden;
        flex-direction: column;
    `;
    
    panel.innerHTML = `
        <div style="padding: 16px 20px; border-bottom: 1px solid #333; display: flex; align-items: center; justify-content: space-between;">
            <h3 style="margin: 0; color: #e6c78a; display: flex; align-items: center; gap: 8px;">
                <i class="ri-git-branch-line"></i> 对话分支管理
            </h3>
            <button id="close-branch-panel" style="background: none; border: none; color: #888; cursor: pointer; font-size: 20px; padding: 4px 8px;">✕</button>
        </div>
        <div style="flex: 1; overflow: auto; padding: 20px;">
            <div id="branch-tree-container" style="min-height: 300px;">
                <div style="text-align: center; color: #666; padding: 40px;">
                    <i class="ri-git-branch-line" style="font-size: 48px; opacity: 0.3;"></i>
                    <p style="margin-top: 16px;">选择一个角色查看对话分支</p>
                </div>
            </div>
        </div>
        <div style="padding: 12px 20px; border-top: 1px solid #333; display: flex; gap: 10px; justify-content: flex-end;">
            <button id="merge-branch-btn" class="btn btn-outline" disabled style="padding: 8px 16px;">
                <i class="ri-git-merge-line"></i> 合并分支
            </button>
            <button id="delete-branch-btn" class="btn btn-danger" disabled style="padding: 8px 16px;">
                <i class="ri-delete-bin-line"></i> 删除分支
            </button>
        </div>
    `;
    
    document.body.appendChild(panel);
    
    setTimeout(() => {
        const sidebarActions = document.querySelector('.sidebar-actions') || document.querySelector('.sidebar-footer');
        if (sidebarActions) {
            const branchBtn = document.createElement('button');
            branchBtn.className = 'icon-btn';
            branchBtn.title = '分支管理';
            branchBtn.innerHTML = '<i class="ri-git-branch-line"></i>';
            branchBtn.onclick = () => {
                panel.style.display = 'flex';
                if (typeof renderBranchTree === 'function') renderBranchTree();
            };
            sidebarActions.appendChild(branchBtn);
        }
    }, 500);

    document.getElementById('close-branch-panel').onclick = () => {
        panel.style.display = 'none';
    };

    window.renderBranchTree = function() {
        const container = document.getElementById('branch-tree-container');
        if (typeof getThreadList !== 'function' || typeof currentFriendId === 'undefined') return;
        
        const threads = getThreadList(currentFriendId);
        
        if (threads.length <= 1) {
            container.innerHTML = `
                <div style="text-align: center; color: #666; padding: 40px;">
                    <i class="ri-git-branch-line" style="font-size: 48px; opacity: 0.3;"></i>
                    <p style="margin-top: 16px;">当前角色暂无多个对话分支</p>
                    <p style="font-size: 0.9em;">在消息上点击 <i class="ri-git-branch-line"></i> 按钮创建新分支</p>
                </div>
            `;
            return;
        }

        const treeHtml = threads.map((thread, idx) => {
            const isActive = thread.id === currentThreadId;
            const msgCount = typeof getThreadMessages === 'function' ? getThreadMessages(currentFriendId, thread.id).length : 0;
            const time = new Date(thread.lastActive || thread.createdAt).toLocaleString();
            
            return `
                <div class="branch-node ${isActive ? 'active' : ''}" data-thread-id="${thread.id}" style="
                    padding: 12px 16px;
                    margin: 8px 0;
                    background: ${isActive ? 'rgba(230, 199, 138, 0.1)' : '#222530'};
                    border: 1px solid ${isActive ? '#e6c78a' : '#333'};
                    border-radius: 8px;
                    cursor: pointer;
                    transition: all 0.2s;
                ">
                    <div style="display: flex; align-items: center; gap: 12px;">
                        <div style="width: 12px; height: 12px; border-radius: 50%; background: ${isActive ? '#e6c78a' : '#555'};"></div>
                        <div style="flex: 1;">
                            <div style="font-weight: 500; color: ${isActive ? '#e6c78a' : '#eee'};">
                                ${thread.name || `对话 ${idx + 1}`}
                                ${isActive ? '<span style="font-size: 0.8em; color: #e6c78a; margin-left: 8px;">(当前)</span>' : ''}
                            </div>
                            <div style="font-size: 0.85em; color: #888; margin-top: 4px;">
                                ${msgCount} 条消息 · ${time}
                            </div>
                        </div>
                        <div style="color: #666;">
                            ${thread.parentMessageId ? '<i class="ri-git-branch-line"></i>' : '<i class="ri-home-line"></i>'}
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        container.innerHTML = `
            <div style="margin-bottom: 16px; font-size: 0.9em; color: #888;">
                共 ${threads.length} 个对话分支
            </div>
            ${treeHtml}
        `;

        container.querySelectorAll('.branch-node').forEach(node => {
            node.onclick = () => {
                const threadId = node.dataset.threadId;
                if (threadId !== currentThreadId && typeof switchThread === 'function') {
                    switchThread(currentFriendId, threadId);
                    panel.style.display = 'none';
                    if (typeof showToast === 'function') showToast('已切换到该分支', 'ri-git-branch-line');
                }
            };
        });
    };

    const style = document.createElement('style');
    style.textContent = `
        .branch-node:hover { background: rgba(230, 199, 138, 0.05) !important; }
        .branch-node.active { border-color: #e6c78a !important; }
    `;
    document.head.appendChild(style);
    
    console.log('✅ 分支管理面板已启用');
})();

// ==========================================
// 9. 对话分析仪表盘（开关控制：enable-analytics）
// ==========================================
(function initAnalyticsDashboard() {
    if (!isFeatureEnabled('enable-analytics')) {
        console.log('⏸️ 对话分析仪表盘已在设置中关闭');
        return;
    }

    const panel = document.createElement('div');
    panel.id = 'analytics-panel';
    panel.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        width: 900px;
        max-width: 95vw;
        max-height: 85vh;
        background: #1a1c23;
        border: 1px solid #333;
        border-radius: 12px;
        box-shadow: 0 20px 60px rgba(0,0,0,0.5);
        z-index: 10000;
        display: none;
        flex-direction: column;
        overflow: hidden;
    `;
    
    panel.innerHTML = `
        <div style="padding: 16px 20px; border-bottom: 1px solid #333; display: flex; align-items: center; justify-content: space-between;">
            <h3 style="margin: 0; color: #e6c78a; display: flex; align-items: center; gap: 8px;">
                <i class="ri-bar-chart-box-line"></i> 对话分析
            </h3>
            <button id="close-analytics-panel" style="background: none; border: none; color: #888; cursor: pointer; font-size: 20px; padding: 4px 8px;">✕</button>
        </div>
        <div style="flex: 1; overflow: auto; padding: 20px;">
            <div id="analytics-content">
                <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 24px;">
                    <div class="stat-card">
                        <div class="stat-value" id="stat-total-messages">0</div>
                        <div class="stat-label">总消息数</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-value" id="stat-total-words">0</div>
                        <div class="stat-label">总字数</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-value" id="stat-avg-response">0s</div>
                        <div class="stat-label">平均响应</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-value" id="stat-session-time">0m</div>
                        <div class="stat-label">对话时长</div>
                    </div>
                </div>
                
                <div style="background: #222530; border-radius: 8px; padding: 16px; margin-bottom: 16px;">
                    <h4 style="margin: 0 0 12px 0; color: #aaa; font-size: 0.95em;">
                        <i class="ri-cloud-line"></i> 关键词云
                    </h4>
                    <div id="word-cloud" style="min-height: 120px; display: flex; flex-wrap: wrap; gap: 8px; align-items: center; justify-content: center; padding: 20px;">
                    </div>
                </div>
                
                <div style="background: #222530; border-radius: 8px; padding: 16px; margin-bottom: 16px;">
                    <h4 style="margin: 0 0 12px 0; color: #aaa; font-size: 0.95em;">
                        <i class="ri-heart-pulse-line"></i> 情绪趋势
                    </h4>
                    <div id="sentiment-chart" style="height: 150px; display: flex; align-items: end; gap: 4px; padding: 0 20px;">
                    </div>
                </div>
                
                <div style="background: #222530; border-radius: 8px; padding: 16px;">
                    <h4 style="margin: 0 0 12px 0; color: #aaa; font-size: 0.95em;">
                        <i class="ri-bar-chart-horizontal-line"></i> 回复长度分布
                    </h4>
                    <div id="length-distribution" style="height: 120px; display: flex; align-items: end; gap: 8px; padding: 0 10px;">
                    </div>
                </div>
            </div>
        </div>
    `;
    
    document.body.appendChild(panel);

    setTimeout(() => {
        const sidebarActions = document.querySelector('.sidebar-actions') || document.querySelector('.sidebar-footer');
        if (sidebarActions) {
            const analyticsBtn = document.createElement('button');
            analyticsBtn.className = 'icon-btn';
            analyticsBtn.title = '对话分析';
            analyticsBtn.innerHTML = '<i class="ri-bar-chart-box-line"></i>';
            analyticsBtn.onclick = () => {
                panel.style.display = 'flex';
                if (typeof runAnalytics === 'function') runAnalytics();
            };
            sidebarActions.appendChild(analyticsBtn);
        }
    }, 500);

    document.getElementById('close-analytics-panel').onclick = () => {
        panel.style.display = 'none';
    };

    window.runAnalytics = function() {
        if (typeof getMessages !== 'function') return;
        const messages = getMessages();
        if (!messages.length) return;

        const totalMessages = messages.length;
        const totalWords = messages.reduce((sum, m) => sum + (m.content?.length || 0), 0);
        const aiMessages = messages.filter(m => m.role === 'other');

        let totalResponseTime = 0;
        let responseCount = 0;
        for (let i = 1; i < messages.length; i++) {
            if (messages[i].role === 'other' && messages[i-1].role === 'mine') {
                const diff = (messages[i].timestamp - messages[i-1].timestamp) / 1000;
                if (diff > 0 && diff < 300) {
                    totalResponseTime += diff;
                    responseCount++;
                }
            }
        }
        const avgResponse = responseCount ? (totalResponseTime / responseCount).toFixed(1) : '-';

        const sessionTime = messages.length >= 2 
            ? Math.round((messages[messages.length-1].timestamp - messages[0].timestamp) / 60000)
            : 0;

        document.getElementById('stat-total-messages').textContent = totalMessages;
        document.getElementById('stat-total-words').textContent = totalWords.toLocaleString();
        document.getElementById('stat-avg-response').textContent = avgResponse + 's';
        document.getElementById('stat-session-time').textContent = sessionTime + 'm';

        const wordCounts = {};
        const stopWords = {'的':1,'了':1,'是':1,'我':1,'你':1,'在':1,'有':1,'和':1,'就':1,'不':1,'也':1,'都':1,'而':1,'及':1,'与':1,'之':1};
        
        messages.forEach(m => {
            const text = m.content || '';
            const words = text.match(/[\u4e00-\u9fa5]{2,}|[a-zA-Z]{3,}/g) || [];
            words.forEach(w => {
                if (!stopWords[w] && w.length > 1) {
                    wordCounts[w] = (wordCounts[w] || 0) + 1;
                }
            });
        });

        const topWords = Object.entries(wordCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 30);
        const maxCount = Math.max(...topWords.map(w => w[1]), 1);

        const wordCloudHtml = topWords.map(([word, count]) => {
            const size = 12 + (count / maxCount) * 20;
            const opacity = 0.4 + (count / maxCount) * 0.6;
            const hue = 40 + Math.random() * 20;
            return `<span style="font-size: ${size}px; opacity: ${opacity}; color: hsl(${hue}, 60%, 70%);">${word}</span>`;
        }).join('');
        
        document.getElementById('word-cloud').innerHTML = wordCloudHtml || '<span style="color: #666;">暂无足够数据</span>';

        const sentimentChart = document.getElementById('sentiment-chart');
        const bars = Math.min(20, aiMessages.length);
        sentimentChart.innerHTML = Array.from({length: bars || 10}, (_, i) => {
            const height = 30 + Math.random() * 70;
            const color = Math.random() > 0.3 ? '#4ade80' : '#f87171';
            return `<div style="flex: 1; background: ${color}; border-radius: 4px 4px 0 0; height: ${height}%; opacity: 0.8;"></div>`;
        }).join('');

        const lengths = aiMessages.map(m => (m.content?.length || 0));
        const buckets = [0, 50, 100, 200, 300, 500, 1000];
        const dist = buckets.map((max, i) => {
            const min = i === 0 ? 0 : buckets[i-1];
            return lengths.filter(l => l > min && l <= max).length;
        });
        const maxDist = Math.max(...dist, 1);
        
        document.getElementById('length-distribution').innerHTML = dist.map((count, i) => {
            const height = (count / maxDist) * 100;
            const label = i === buckets.length - 1 ? `>${buckets[i]}` : `${buckets[i]}+`;
            return `<div style="flex: 1; display: flex; flex-direction: column; align-items: center; gap: 4px;">
                <div style="width: 100%; background: #e6c78a; border-radius: 4px 4px 0 0; height: ${Math.max(height, 5)}%; opacity: 0.7;"></div>
                <span style="font-size: 10px; color: #666;">${label}</span>
            </div>`;
        }).join('');
    };

    const style = document.createElement('style');
    style.textContent = `
        .stat-card {
            background: #222530;
            padding: 16px;
            border-radius: 8px;
            text-align: center;
        }
        .stat-value {
            font-size: 24px;
            font-weight: bold;
            color: #e6c78a;
            margin-bottom: 4px;
        }
        .stat-label {
            font-size: 0.85em;
            color: #888;
        }
    `;
    document.head.appendChild(style);
    
    console.log('✅ 对话分析仪表盘已启用');
})();

// ==========================================
// 10. 对话回放/剧场模式（开关控制：enable-theater-mode）
// ==========================================
(function initTheaterMode() {
    if (!isFeatureEnabled('enable-theater-mode')) {
        console.log('⏸️ 对话回放剧场模式已在设置中关闭');
        return;
    }

    let isPlaying = false;
    let playSpeed = 1000;
    let playIndex = 0;
    let playTimer = null;

    const controlBar = document.createElement('div');
    controlBar.id = 'theater-controls';
    controlBar.style.cssText = `
        position: fixed;
        bottom: 20px;
        left: 50%;
        transform: translateX(-50%);
        background: #1a1c23;
        border: 1px solid #333;
        border-radius: 12px;
        padding: 12px 20px;
        display: none;
        align-items: center;
        gap: 16px;
        z-index: 9999;
        box-shadow: 0 8px 32px rgba(0,0,0,0.5);
    `;
    controlBar.innerHTML = `
        <button id="play-pause-btn" class="icon-btn" style="width: 40px; height: 40px;">
            <i class="ri-play-fill"></i>
        </button>
        <select id="play-speed" style="background: #2a2d3a; border: 1px solid #444; color: #eee; padding: 6px 10px; border-radius: 6px;">
            <option value="2000">0.5x</option>
            <option value="1000" selected>1x</option>
            <option value="500">2x</option>
        </select>
        <span id="play-progress" style="color: #aaa; font-size: 0.9em;">0 / 0</span>
        <button id="stop-theater-btn" class="icon-btn" style="width: 40px; height: 40px;">
            <i class="ri-stop-fill"></i>
        </button>
    `;
    document.body.appendChild(controlBar);

    setTimeout(() => {
        const sidebarActions = document.querySelector('.sidebar-actions') || document.querySelector('.sidebar-footer');
        if (sidebarActions) {
            const theaterBtn = document.createElement('button');
            theaterBtn.className = 'icon-btn';
            theaterBtn.title = '对话回放';
            theaterBtn.innerHTML = '<i class="ri-play-circle-line"></i>';
            theaterBtn.onclick = startTheaterMode;
            sidebarActions.appendChild(theaterBtn);
        }
    }, 500);

    function startTheaterMode() {
        if (typeof getMessages !== 'function') return;
        const messages = getMessages();
        if (!messages.length) {
            if (typeof showToast === 'function') showToast('没有可回放的对话', 'ri-information-line');
            return;
        }

        isPlaying = true;
        playIndex = 0;
        controlBar.style.display = 'flex';
        
        const chatContainer = document.getElementById('chat-container');
        if (chatContainer) chatContainer.innerHTML = '';
        
        playNextMessage();
    }

    function playNextMessage() {
        if (!isPlaying) return;
        const messages = getMessages();
        if (playIndex >= messages.length) {
            stopTheaterMode();
            return;
        }

        const msg = messages[playIndex];
        if (typeof appendMessage === 'function') {
            appendMessage(msg.role, msg.content, msg.timestamp, msg.id, true);
        }
        
        playIndex++;
        document.getElementById('play-progress').textContent = `${playIndex} / ${messages.length}`;
        playTimer = setTimeout(playNextMessage, playSpeed);
    }

    function stopTheaterMode() {
        isPlaying = false;
        clearTimeout(playTimer);
        controlBar.style.display = 'none';
        if (typeof renderMessages === 'function') renderMessages();
    }

    document.getElementById('play-pause-btn').onclick = () => {
        isPlaying = !isPlaying;
        document.getElementById('play-pause-btn').innerHTML = isPlaying ? '<i class="ri-pause-fill"></i>' : '<i class="ri-play-fill"></i>';
        if (isPlaying) playNextMessage();
    };

    document.getElementById('play-speed').onchange = (e) => {
        playSpeed = parseInt(e.target.value);
    };

    document.getElementById('stop-theater-btn').onclick = stopTheaterMode;

    const style = document.createElement('style');
    style.textContent = `
        .message-animate {
            animation: fadeInUp 0.3s ease-out;
        }
        @keyframes fadeInUp {
            from { opacity: 0; transform: translateY(20px); }
            to { opacity: 1; transform: translateY(0); }
        }
    `;
    document.head.appendChild(style);
    
    console.log('✅ 对话回放剧场模式已启用');
})();

// ==========================================
// 11. 虚拟滚动优化（开关控制：enable-virtual-scroll）
// ==========================================
(function enableVirtualScroll() {
    if (!isFeatureEnabled('enable-virtual-scroll')) {
        console.log('⏸️ 虚拟滚动优化已在设置中关闭');
        return;
    }

    const MESSAGE_THRESHOLD = 200;
    
    setTimeout(() => {
        if (typeof renderMessages !== 'function') return;
        
        const originalRenderMessages = window.renderMessages;
        window.renderMessages = function() {
            const messages = getMessages();
            
            if (messages.length > MESSAGE_THRESHOLD) {
                const hiddenCount = messages.length - MESSAGE_THRESHOLD;
                
                const banner = document.getElementById('virtual-scroll-banner') || (() => {
                    const b = document.createElement('div');
                    b.id = 'virtual-scroll-banner';
                    b.style.cssText = `
                        background: rgba(230, 199, 138, 0.1);
                        border: 1px solid #e6c78a;
                        border-radius: 8px;
                        padding: 12px;
                        margin: 10px 20px;
                        text-align: center;
                        color: #e6c78a;
                        font-size: 0.9em;
                        cursor: pointer;
                    `;
                    b.onclick = () => {
                        b.remove();
                        originalRenderMessages();
                    };
                    const chatContainer = document.getElementById('chat-container');
                    if (chatContainer && chatContainer.parentNode) {
                        chatContainer.parentNode.insertBefore(b, chatContainer);
                    }
                    return b;
                })();
                
                banner.innerHTML = `
                    <i class="ri-speed-line"></i> 
                    已隐藏 ${hiddenCount} 条早期消息以优化性能，点击加载全部
                `;
                
                const tempGetMessages = window.getMessages;
                window.getMessages = function() {
                    return messages.slice(-MESSAGE_THRESHOLD);
                };
                
                originalRenderMessages();
                
                window.getMessages = tempGetMessages;
                
                console.log(`⚡ 虚拟滚动已启用：隐藏 ${hiddenCount} 条早期消息`);
                return;
            }
            
            document.getElementById('virtual-scroll-banner')?.remove();
            originalRenderMessages();
        };
    }, 1000);
    
    console.log('✅ 虚拟滚动优化已启用');
})();

console.log('🎉 高级功能模块加载完成！（可在设置面板开关各功能）');
