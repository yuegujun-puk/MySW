// 从 main.js 拆分出的功能模块，保持全局函数声明以兼容现有非模块脚本架构。

        function getLongTermMemory() {
            return threadManager[currentFriendId]?.longTermMemory || [];
        }

        function updateLongTermMemory(newMemories, friendId = currentFriendId) {
            if (!enableLongTermMemoryCheckbox.checked) return;

            const friendData = threadManager[friendId];
            if (!friendData) return;
            if (!Array.isArray(friendData.longTermMemory)) friendData.longTermMemory = [];

            let memoryChanged = false;
            const normalizeMemoryKey = key => String(key || '').trim().replace(/\s+/g, ' ').toLowerCase();
            const seenKeys = new Set();
            newMemories.forEach(newMem => {
                const normalizedKey = normalizeMemoryKey(newMem?.key);
                const value = String(newMem?.value || '').trim();
                if (!normalizedKey || !value || seenKeys.has(normalizedKey)) return;
                seenKeys.add(normalizedKey);

                const sanitizedMemory = normalizeMemoryRecord({ key: String(newMem.key).trim(), value, tags: newMem.tags || [], importance: newMem.importance || 1, permanent: newMem.permanent || false });
                const existingIndex = friendData.longTermMemory.findIndex(m => normalizeMemoryKey(m.key) === normalizedKey);
                if (existingIndex >= 0) {
                    if (friendData.longTermMemory[existingIndex].value !== sanitizedMemory.value) {
                        friendData.longTermMemory[existingIndex] = { ...friendData.longTermMemory[existingIndex], ...sanitizedMemory };
                        memoryChanged = true;
                    }
                } else {
                    friendData.longTermMemory.push(sanitizedMemory);
                    memoryChanged = true;
                }
            });

            if (memoryChanged) {
                saveThreadManager();
            }
        }

        // 渲染记忆档案列表
        function renderMemoryProfileList() {
            const container = document.getElementById('memory-profile-list');
            if (!container) return;

            const memories = getFilteredMemoriesWithIndexes();

            if (!memories || memories.length === 0) {
                container.innerHTML = '<p style="color: #888; font-style: italic; text-align: center; padding: 20px;">暂无记忆档案</p>';
                return;
            }

            container.innerHTML = memories.map(({ mem, index }) => `
                <div class="memory-item" style="display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; background-color: #383b45; border-radius: 8px; border: 1px solid transparent; transition: all 0.2s;" onmouseenter="this.style.borderColor='#e6c78a'" onmouseleave="this.style.borderColor='transparent'">
                    <div style="flex: 1; min-width: 0;">
                        <div style="font-weight: 600; color: #e6c78a; margin-bottom: 4px; font-size: 0.95em;">${escapeHtml(mem.key)}</div>
                        <div style="color: #ccc; font-size: 0.9em; word-break: break-word;">${escapeHtml(mem.value)}</div>
                        <div style="margin-top:6px; color:#999; font-size:0.78em;">${mem.permanent ? '📌 永久 · ' : ''}权重 ${escapeHtml(mem.importance || 1)} · ${(mem.tags || []).map(t => `<span class="memory-tag">#${escapeHtml(t)}</span>`).join(' ')} · ${escapeHtml((mem.updatedAt || mem.createdAt || '').slice(0,10))}</div>
                    </div>
                    <div style="display: flex; gap: 8px; margin-left: 12px; flex-shrink: 0;">
                        <button class="btn btn-sm btn-outline" onclick="editMemoryItem(${index})" title="编辑" style="padding: 6px 10px; font-size: 0.85em;">
                            <i class="ri-edit-line"></i>
                        </button>
                        <button class="btn btn-sm btn-danger" onclick="deleteMemoryItem(${index})" title="删除" style="padding: 6px 10px; font-size: 0.85em; background-color: #f44336; color: white; border: none;">
                            <i class="ri-delete-bin-line"></i>
                        </button>
                    </div>
                </div>
            `).join('');
        }

        // 编辑记忆项
        function editMemoryItem(index) {
            const memories = getLongTermMemory();
            if (!memories || index < 0 || index >= memories.length) return;

            const memory = memories[index];
            const newKey = prompt('编辑记忆键名:', memory.key);
            if (newKey === null) return;
            if (!newKey.trim()) {
                showToast('记忆键名不能为空', 'ri-error-warning-line');
                return;
            }

            const newValue = prompt('编辑记忆内容:', memory.value);
            if (newValue === null) return;
            if (!newValue.trim()) {
                showToast('记忆内容不能为空', 'ri-error-warning-line');
                return;
            }

            const friendData = threadManager[currentFriendId];
            if (!friendData) return;

            // 检查键名是否重复（排除当前项）
            const duplicateIndex = friendData.longTermMemory.findIndex((m, i) => i !== index && m.key === newKey.trim());
            if (duplicateIndex >= 0) {
                showToast('记忆键名已存在', 'ri-error-warning-line');
                return;
            }

            friendData.longTermMemory[index] = { 
                ...friendData.longTermMemory[index],
                key: newKey.trim(), 
                value: newValue.trim(),
                updatedAt: new Date().toISOString()
            };
            saveThreadManager();
            renderMemoryProfileList();
            showToast('记忆已更新', 'ri-check-line');
        }

        // 删除记忆项
        function deleteMemoryItem(index) {
            const memories = getLongTermMemory();
            if (!memories || index < 0 || index >= memories.length) return;

            const memory = memories[index];
            if (!confirm(`确定要删除这条记忆吗？\n\n"${memory.key}: ${memory.value}"`)) return;

            const friendData = threadManager[currentFriendId];
            if (!friendData) return;

            friendData.longTermMemory.splice(index, 1);
            saveThreadManager();
            renderMemoryProfileList();
            showToast('记忆已删除', 'ri-check-line');
        }


        function normalizeMemoryRecord(mem) {
            const now = new Date().toISOString();
            return {
                ...mem,
                tags: Array.isArray(mem.tags) ? mem.tags : String(mem.tags || '').split(',').map(t => t.trim()).filter(Boolean),
                importance: Number(mem.importance || 1),
                permanent: Boolean(mem.permanent),
                createdAt: mem.createdAt || now,
                updatedAt: mem.updatedAt || now
            };
        }

        function getFilteredMemoriesWithIndexes() {
            const keyword = (document.getElementById('memory-filter-input')?.value || '').trim().toLowerCase();
            const timeFilter = document.getElementById('memory-time-filter')?.value || 'all';
            const now = Date.now();
            return getLongTermMemory().map((mem, index) => ({ mem: normalizeMemoryRecord(mem), index })).filter(({ mem }) => {
                const haystack = `${mem.key} ${mem.value} ${(mem.tags || []).join(' ')}`.toLowerCase();
                if (keyword && !haystack.includes(keyword)) return false;
                if (timeFilter === 'permanent') return mem.permanent;
                if (timeFilter === '7d' || timeFilter === '30d') {
                    const days = timeFilter === '7d' ? 7 : 30;
                    const date = Date.parse(mem.updatedAt || mem.createdAt || 0);
                    return Number.isFinite(date) && now - date <= days * 86400000;
                }
                return true;
            });
        }

        function addPermanentMemoryItem() {
            const key = prompt('记忆标题/标签：');
            if (!key?.trim()) return;
            const value = prompt('记忆内容：');
            if (!value?.trim()) return;
            const tags = prompt('标签（逗号分隔，可选）：', key.trim()) || '';
            const importance = Number(prompt('重要性权重（1-5）：', '3') || 3);
            const friendData = threadManager[currentFriendId];
            if (!friendData) return;
            if (!Array.isArray(friendData.longTermMemory)) friendData.longTermMemory = [];
            friendData.longTermMemory.push(normalizeMemoryRecord({ key: key.trim(), value: value.trim(), tags, importance: Math.min(5, Math.max(1, importance)), permanent: true }));
            saveThreadManager();
            renderMemoryProfileList();
            showToast('已添加永久记忆', 'ri-brain-line');
        }

        function mergeSimilarMemoryItems() {
            const friendData = threadManager[currentFriendId];
            if (!friendData?.longTermMemory?.length) return;
            const groups = new Map();
            friendData.longTermMemory.map(normalizeMemoryRecord).forEach(mem => {
                const key = String(mem.key || '').trim().replace(/[：:（(].*$/, '').toLowerCase();
                if (!groups.has(key)) groups.set(key, []);
                groups.get(key).push(mem);
            });
            const merged = [];
            let mergeCount = 0;
            groups.forEach(items => {
                if (items.length === 1) { merged.push(items[0]); return; }
                mergeCount += items.length - 1;
                const first = items[0];
                merged.push(normalizeMemoryRecord({
                    ...first,
                    value: [...new Set(items.map(i => i.value).filter(Boolean))].join('；'),
                    tags: [...new Set(items.flatMap(i => i.tags || []))],
                    importance: Math.max(...items.map(i => Number(i.importance || 1))),
                    permanent: items.some(i => i.permanent),
                    updatedAt: new Date().toISOString()
                }));
            });
            friendData.longTermMemory = merged;
            saveThreadManager();
            renderMemoryProfileList();
            showToast(mergeCount ? `已融合 ${mergeCount} 条相似记忆` : '没有发现可融合的相似记忆', 'ri-git-merge-line');
        }
