// 从 main.js 拆分出的功能模块，保持全局函数声明以兼容现有非模块脚本架构。

        function loadKnowledgeSettings() {
            const s = JSON.parse(localStorage.getItem('knowledgeSettings')) || {};
            kbApiUrlInput.value = s.apiUrl || '';
            kbApiKeyInput.value = s.apiKey || '';
            kbEmbeddingModelInput.value = s.embeddingModel || '';
            kbRerankModelInput.value = s.rerankModel || '';
            kbEnabledCheckbox.checked = s.enabled || false;
            renderKnowledgeFileList(s.files || []);
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
                    </div>
                    <button class="btn btn-danger btn-sm" onclick="removeKnowledgeFile('${f.id}')" style="padding: 4px 8px; font-size: 0.8em;">
                        <i class="ri-delete-bin-line"></i>
                    </button>
                </div>
            `).join('');
        }

        window.removeKnowledgeFile = function(fileId) {
            let s;
            try {
                s = JSON.parse(localStorage.getItem('knowledgeSettings')) || {};
            } catch (e) {
                s = {};
            }
            s.files = (s.files || []).filter(f => f.id !== fileId);
            setLocalStorageSafely('knowledgeSettings', JSON.stringify(s), '知识库设置');
            renderKnowledgeFileList(s.files);
        };

