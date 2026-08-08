// 简易插件系统：插件可注册参数、启停状态，并把效果挂载到聊天界面。
(function () {
    const STORAGE_KEY = 'mySWPlugins';
    const DEFAULT_PLUGIN_ID = 'thunder-chat-window';

    const defaultPlugins = [{
        id: DEFAULT_PLUGIN_ID,
        name: '聊天有个雷霆小窗口',
        description: '在聊天界面显示一个悬浮网页窗口。',
        enabled: false,
        builtIn: true,
        params: [
            { key: 'width', label: '宽', type: 'number', value: 320, min: 120, max: 1200, unit: 'px' },
            { key: 'height', label: '长', type: 'number', value: 420, min: 120, max: 1200, unit: 'px' },
            { key: 'url', label: '网址', type: 'url', value: 'https://example.com' }
        ],
        activate(params) {
            const chatArea = document.getElementById('chat-area');
            if (!chatArea || document.getElementById('thunder-chat-plugin-window')) return;
            const width = Math.max(120, Number(params.width) || 320);
            const height = Math.max(120, Number(params.height) || 420);
            const url = String(params.url || 'https://example.com').trim();
            const panel = document.createElement('div');
            panel.id = 'thunder-chat-plugin-window';
            panel.className = 'chat-plugin-window';
            panel.style.width = `${width}px`;
            panel.style.height = `${height}px`;
            panel.innerHTML = `
                <div class="chat-plugin-window-header">
                    <span><i class="ri-flashlight-line"></i> 雷霆小窗口</span>
                    <button type="button" class="chat-plugin-window-close" aria-label="关闭雷霆小窗口"><i class="ri-close-line"></i></button>
                </div>
                <iframe title="雷霆小窗口网页" src="${escapeAttr(url)}" loading="lazy" referrerpolicy="no-referrer"></iframe>
            `;
            makeDraggable(panel, panel.querySelector('.chat-plugin-window-header'));
            panel.querySelector('.chat-plugin-window-close')?.addEventListener('click', () => {
                updatePlugin(DEFAULT_PLUGIN_ID, { enabled: false });
                renderPluginSettings();
                applyPlugins();
            });
            chatArea.appendChild(panel);
        },
        deactivate() {
            document.getElementById('thunder-chat-plugin-window')?.remove();
        }
    }];

    const runtimePlugins = new Map(defaultPlugins.map(plugin => [plugin.id, plugin]));
    let importingPluginCode = '';

    function makeDraggable(panel, handle) {
        if (!panel || !handle) return;
        let dragging = false;
        let startX = 0;
        let startY = 0;
        let startLeft = 0;
        let startTop = 0;

        const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
        const onPointerMove = event => {
            if (!dragging) return;
            const parentRect = panel.parentElement.getBoundingClientRect();
            const nextLeft = clamp(startLeft + event.clientX - startX, 0, parentRect.width - panel.offsetWidth);
            const nextTop = clamp(startTop + event.clientY - startY, 0, parentRect.height - panel.offsetHeight);
            panel.style.left = `${nextLeft}px`;
            panel.style.top = `${nextTop}px`;
            panel.style.right = 'auto';
            panel.style.bottom = 'auto';
        };
        const stopDragging = () => {
            if (!dragging) return;
            dragging = false;
            panel.classList.remove('dragging');
            window.removeEventListener('pointermove', onPointerMove);
            window.removeEventListener('pointerup', stopDragging);
            window.removeEventListener('pointercancel', stopDragging);
        };
        handle.addEventListener('pointerdown', event => {
            if (event.target.closest('button')) return;
            const rect = panel.getBoundingClientRect();
            const parentRect = panel.parentElement.getBoundingClientRect();
            dragging = true;
            startX = event.clientX;
            startY = event.clientY;
            startLeft = rect.left - parentRect.left;
            startTop = rect.top - parentRect.top;
            panel.style.left = `${startLeft}px`;
            panel.style.top = `${startTop}px`;
            panel.style.right = 'auto';
            panel.style.bottom = 'auto';
            panel.classList.add('dragging');
            event.preventDefault();
            window.addEventListener('pointermove', onPointerMove);
            window.addEventListener('pointerup', stopDragging);
            window.addEventListener('pointercancel', stopDragging);
        });
    }

    function escapeHtml(value) {
        return String(value ?? '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
    }

    function escapeAttr(value) {
        return escapeHtml(value).replace(/`/g, '&#96;');
    }

    function readSavedPlugins() {
        try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch (e) { return []; }
    }

    function savePlugins(list) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    }

    function getPlugins() {
        const saved = readSavedPlugins();
        const merged = defaultPlugins.map(defaultPlugin => {
            const savedPlugin = saved.find(plugin => plugin.id === defaultPlugin.id) || {};
            return mergePlugin(defaultPlugin, savedPlugin);
        });
        saved.filter(plugin => !defaultPlugins.some(defaultPlugin => defaultPlugin.id === plugin.id)).forEach(plugin => merged.push(plugin));
        return merged;
    }

    function mergePlugin(base, saved) {
        const savedParams = saved.params || [];
        return {
            ...base,
            ...saved,
            params: (base.params || []).map(param => ({ ...param, ...(savedParams.find(item => item.key === param.key) || {}) }))
        };
    }

    function updatePlugin(id, patch) {
        const list = getPlugins().map(plugin => plugin.id === id ? { ...plugin, ...patch } : plugin);
        savePlugins(list.map(serializePlugin));
    }

    function serializePlugin(plugin) {
        const { activate, deactivate, ...serializable } = plugin;
        return serializable;
    }

    function applyPlugins() {
        getPlugins().forEach(plugin => {
            const runtime = runtimePlugins.get(plugin.id);
            if (!runtime) return;
            const params = Object.fromEntries((plugin.params || []).map(param => [param.key, param.value]));
            if (plugin.enabled) runtime.activate?.(params, plugin);
            else runtime.deactivate?.(params, plugin);
        });
    }

    function renderPluginSettings() {
        const listEl = document.getElementById('plugin-settings-list');
        if (!listEl) return;
        const plugins = getPlugins();
        listEl.innerHTML = plugins.map(plugin => `
            <div class="plugin-card" data-plugin-id="${escapeAttr(plugin.id)}">
                <div class="plugin-card-header">
                    <div>
                        <strong>${escapeHtml(plugin.name)}</strong>
                        <p>${escapeHtml(plugin.description || '无描述')}</p>
                    </div>
                    <label class="plugin-switch"><input type="checkbox" data-plugin-action="toggle" ${plugin.enabled ? 'checked' : ''}> 启用</label>
                </div>
                <div class="plugin-params">
                    ${(plugin.params || []).map(param => `
                        <label>${escapeHtml(param.label || param.key)}
                            <input data-plugin-param="${escapeAttr(param.key)}" type="${param.type === 'number' ? 'number' : 'text'}" value="${escapeAttr(param.value)}" ${param.min !== undefined ? `min="${escapeAttr(param.min)}"` : ''} ${param.max !== undefined ? `max="${escapeAttr(param.max)}"` : ''}>
                        </label>
                    `).join('')}
                </div>
                <div class="plugin-actions">
                    <button type="button" class="btn btn-outline btn-sm" data-plugin-action="save"><i class="ri-save-line"></i> 保存参数</button>
                    ${plugin.builtIn ? '<span class="plugin-builtin-badge">默认插件</span>' : '<button type="button" class="btn btn-danger btn-sm" data-plugin-action="delete"><i class="ri-delete-bin-line"></i> 删除</button>'}
                </div>
            </div>
        `).join('') || '<p style="color:#888;text-align:center;padding:20px;">暂无插件</p>';
    }

    function bindPluginSettings() {
        document.getElementById('plugin-settings-list')?.addEventListener('click', event => {
            const action = event.target.closest('[data-plugin-action]')?.dataset.pluginAction;
            const card = event.target.closest('.plugin-card');
            if (!action || !card) return;
            const id = card.dataset.pluginId;
            if (action === 'toggle') updatePlugin(id, { enabled: card.querySelector('[data-plugin-action="toggle"]').checked });
            if (action === 'save') {
                const plugin = getPlugins().find(item => item.id === id);
                const params = (plugin.params || []).map(param => ({ ...param, value: card.querySelector(`[data-plugin-param="${CSS.escape(param.key)}"]`)?.value ?? param.value }));
                updatePlugin(id, { params });
                toast('插件参数已保存');
            }
            if (action === 'delete' && confirm('确定删除这个插件吗？')) {
                runtimePlugins.get(id)?.deactivate?.();
                savePlugins(getPlugins().filter(plugin => plugin.id !== id).map(serializePlugin));
            }
            renderPluginSettings();
            applyPlugins();
        });

        document.getElementById('plugin-import-input')?.addEventListener('change', event => {
            const file = event.target.files?.[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = () => {
                try {
                    importingPluginCode = String(reader.result);
                    new Function('MySWPlugins', importingPluginCode)(window.MySWPlugins);
                    importingPluginCode = '';
                    toast('插件导入成功');
                    renderPluginSettings();
                    applyPlugins();
                } catch (error) {
                    importingPluginCode = '';
                    alert(`插件导入失败：${error.message}`);
                }
            };
            reader.readAsText(file);
            event.target.value = '';
        });
    }

    function register(plugin) {
        if (!plugin?.id || !plugin?.name) throw new Error('插件必须包含 id 和 name');
        runtimePlugins.set(plugin.id, plugin);
        const exists = getPlugins().some(item => item.id === plugin.id);
        if (!exists) savePlugins([...getPlugins(), serializePlugin({ enabled: false, params: [], code: importingPluginCode, ...plugin })].map(serializePlugin));
    }

    function toast(message) {
        if (typeof window.showToast === 'function') window.showToast(message, 'ri-plug-line');
        else console.log(message);
    }

    function loadImportedPluginCode() {
        getPlugins().filter(plugin => !plugin.builtIn && plugin.code).forEach(plugin => {
            try { new Function('MySWPlugins', plugin.code)(window.MySWPlugins); }
            catch (error) { console.warn(`插件 ${plugin.name || plugin.id} 加载失败:`, error); }
        });
    }

    window.MySWPlugins = { register, renderPluginSettings, applyPlugins };
    document.addEventListener('DOMContentLoaded', () => {
        loadImportedPluginCode();
        bindPluginSettings();
        renderPluginSettings();
        applyPlugins();
    });
})();
