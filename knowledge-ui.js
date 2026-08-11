// 从 main.js 拆分出的功能模块，保持全局函数声明以兼容现有非模块脚本架构。

        async function loadKnowledgeSettings() {
            const s = JSON.parse(localStorage.getItem('knowledgeSettings')) || {};
            kbApiUrlInput.value = s.apiUrl || '';
            kbApiKeyInput.value = s.apiKey || '';
            kbEmbeddingModelInput.value = s.embeddingModel || '';
            kbRerankModelInput.value = s.rerankModel || '';
            kbEnabledCheckbox.checked = s.enabled || false;
            renderKnowledgeFileList(await getKnowledgeSourceList(s));
        }

        async function getKnowledgeSourceList(settings = null) {
            try {
                if (window.KnowledgeModule?.listKnowledgeSources) {
                    const indexedSources = await KnowledgeModule.listKnowledgeSources();
                    if (indexedSources.length > 0) return indexedSources;
                }
            } catch (error) {
                console.warn('读取 IndexedDB 知识库列表失败，降级显示旧配置:', error);
            }
            const s = settings || JSON.parse(localStorage.getItem('knowledgeSettings')) || {};
            return s.files || [];
        }

        function renderKnowledgeFileList(files) {
            if (!files || files.length === 0) {
                kbFileListDiv.innerHTML = '<p style="color: #666; font-size: 0.9em; text-align: center;">暂无上传的文档</p>';
                return;
            }
            kbFileListDiv.innerHTML = files.map(f => `
                <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px; background: rgba(255,255,255,0.05); border-radius: 6px; margin-bottom: 6px;">
                    <div style="display: flex; align-items: center; gap: 8px; overflow: hidden;">
                        <i class="ri-file-text-line" style="color: #e6c78a;"></i>
                        <span style="font-size: 0.9em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(f.name)}</span>
                        ${f.chunkTotal > 1 ? `<span style="font-size:0.75em;color:#888;">${f.chunkTotal} chunks</span>` : ''}
                        ${f.embeddingModel ? '<span style="font-size:0.75em;color:#72d572;">已向量化</span>' : '<span style="font-size:0.75em;color:#d9a441;">关键词</span>'}
                    </div>
                    <button class="btn btn-danger btn-sm" onclick="removeKnowledgeFile('${f.id}')" style="padding: 4px 8px; font-size: 0.8em;">
                        <i class="ri-delete-bin-line"></i>
                    </button>
                </div>
            `).join('');
        }

        window.removeKnowledgeFile = async function(fileId) {
            let s;
            try {
                s = JSON.parse(localStorage.getItem('knowledgeSettings')) || {};
            } catch (e) {
                s = {};
            }
            s.files = (s.files || []).filter(f => f.id !== fileId && f.sourceId !== fileId);
            try {
                if (window.KnowledgeModule?.deleteKnowledgeBySource) await KnowledgeModule.deleteKnowledgeBySource(fileId);
            } catch (error) {
                console.warn('删除 IndexedDB 知识库文档失败:', error);
            }
            setLocalStorageSafely('knowledgeSettings', JSON.stringify(s), '知识库设置');
            renderKnowledgeFileList(await getKnowledgeSourceList(s));
        };

