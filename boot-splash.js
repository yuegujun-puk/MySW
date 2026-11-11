/**
 * boot-splash.js — 自定义加载界面（实验室 → 自定义加载界面）
 * 两部分职责：
 * A. 启动逻辑（脚本在 <body> 最前面，同步执行）：
 * 读取 localStorage 里的开关 → 去 IndexedDB 取用户素材 → 点亮 #boot-splash，
 */
(function () {
    'use strict';

    const SETTINGS_KEY = 'bootSplashSettings';
    const DB_NAME = 'mySWBootSplash';
    const STORE = 'media';
    const ASSET_ID = 'current';
    const MAX_FILE_BYTES = 25 * 1024 * 1024;   // 25MB 上限，防止把浏览器存储撑爆
    const BOOT_HARD_LIMIT_MS = 6000;           // 最长停留
    const BOOT_WATCHDOG_MS = 12000;            // 兜底强制清除

    /* ---------------- 设置读写 ---------------- */

    const CAPTION_POS = ['bottom', 'middle', 'top'];

    function readSettings() {
        let s = {};
        try { s = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}'); } catch (e) { s = {}; }
        return {
            enabled: s.enabled === true,
            caption: typeof s.caption === 'string' ? s.caption.slice(0, 60) : '',
            captionPos: CAPTION_POS.includes(s.captionPos) ? s.captionPos : 'bottom',
            fit: s.fit === 'contain' ? 'contain' : 'cover',
            minMs: clampInt(s.minMs, 0, 6000, 1000),
            dim: s.dim === true,
            kind: s.kind === 'video' ? 'video' : (s.kind === 'url' ? 'url' : (s.kind === 'image' ? 'image' : '')),
            url: typeof s.url === 'string' ? s.url.slice(0, 2000) : '',
            hasAsset: s.hasAsset === true,
            fileName: typeof s.fileName === 'string' ? s.fileName.slice(0, 120) : '',
            bytes: Number(s.bytes) || 0
        };
    }

    function writeSettings(patch) {
        const next = { ...readSettings(), ...(patch || {}) };
        try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(next)); } catch (e) {}
        return next;
    }

    function clampInt(value, min, max, fallback) {
        const n = parseInt(value, 10);
        if (!Number.isFinite(n)) return fallback;
        return Math.min(max, Math.max(min, n));
    }

    /* ---------------- IndexedDB（素材本体） ---------------- */

    function openDB() {
        return new Promise((resolve, reject) => {
            if (!window.indexedDB) { reject(new Error('当前浏览器不支持 IndexedDB')); return; }
            const req = indexedDB.open(DB_NAME, 1);
            req.onupgradeneeded = () => {
                const db = req.result;
                if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
            };
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error || new Error('打开加载界面数据库失败'));
        });
    }

    async function idbPut(record) {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE, 'readwrite');
            tx.objectStore(STORE).put(record);
            tx.oncomplete = () => { db.close(); resolve(); };
            tx.onerror = () => { db.close(); reject(tx.error || new Error('写入加载界面素材失败')); };
        });
    }

    async function idbGet() {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE, 'readonly');
            const req = tx.objectStore(STORE).get(ASSET_ID);
            req.onsuccess = () => resolve(req.result || null);
            req.onerror = () => reject(req.error || new Error('读取加载界面素材失败'));
            tx.oncomplete = () => db.close();
        });
    }

    async function idbDelete() {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE, 'readwrite');
            tx.objectStore(STORE).delete(ASSET_ID);
            tx.oncomplete = () => { db.close(); resolve(); };
            tx.onerror = () => { db.close(); reject(tx.error || new Error('删除加载界面素材失败')); };
        });
    }

    /* ---------------- A. 启动显示 ---------------- */

    const splashEl = document.getElementById('boot-splash');
    let dismissed = !splashEl;
    let objectUrl = null;
    const startAt = Date.now();

    function forceRemove() {
        if (!splashEl) return;
        dismissed = true;
        splashEl.classList.remove('boot-show');
        splashEl.style.display = 'none';
        revokeObjectUrl();
    }

    function revokeObjectUrl() {
        if (objectUrl) {
            try { URL.revokeObjectURL(objectUrl); } catch (e) {}
            objectUrl = null;
        }
    }

    function hideSplash() {
        if (dismissed) return;
        dismissed = true;
        const waited = Date.now() - startAt;
        const settings = readSettings();
        const remain = Math.max(0, settings.minMs - waited);
        setTimeout(() => {
            if (!splashEl) return;
            splashEl.classList.remove('boot-show');
            setTimeout(() => { if (splashEl) splashEl.style.display = 'none'; revokeObjectUrl(); }, 420);
        }, remain);
    }

    function applyCaptionPos(pos) {
        if (!splashEl) return;
        const safe = CAPTION_POS.includes(pos) ? pos : 'bottom';
        splashEl.setAttribute('data-caption-pos', safe);
        // 同时把位置写成行内样式：过去只靠 CSS 属性选择器 + var(--boot-bars-bottom)，
        // 一旦浏览器命中旧缓存的样式表（没有这条变量定义），calc() 在计算值阶段失效，
        // top/bottom 双双 auto，绝对定位元素退回 flex 的居中静态位置 ——
        // 这就是「副标题选了显示在下方却出现在画面中间」的根因。
        // 行内样式不依赖任何变量，旧缓存下也能落到正确位置。
        const capEl = document.getElementById('boot-caption');
        if (!capEl) return;
        const BARS = 'clamp(26px, 8vh, 72px)';
        // 连 position / left / 宽度一起写行内：万一命中的是「副标题还是 flex item」
        // 的老缓存样式，行内值也会直接赢过它，位置仍然正确。
        capEl.style.position = 'absolute';
        capEl.style.left = '50%';
        capEl.style.width = 'min(92%, 760px)';
        capEl.style.textAlign = 'center';
        capEl.style.zIndex = '2';
        if (safe === 'middle') {
            capEl.style.top = '50%';
            capEl.style.bottom = 'auto';
            capEl.style.transform = 'translate(-50%, -50%)';
        } else if (safe === 'top') {
            capEl.style.top = 'calc(' + BARS + ' - 6px)';
            capEl.style.bottom = 'auto';
            capEl.style.transform = 'translateX(-50%)';
        } else {
            capEl.style.top = 'auto';
            capEl.style.bottom = 'calc(' + BARS + ' + 18px)';
            capEl.style.transform = 'translateX(-50%)';
        }
    }

    function buildMedia(kind, src, fit, caption, dim, captionPos) {
        const slot = document.getElementById('boot-slot');
        if (!slot) return null;
        slot.innerHTML = '';
        const el = document.createElement(kind === 'video' ? 'video' : 'img');
        el.className = 'boot-media' + (fit === 'contain' ? ' contain' : '');
        if (kind === 'video') {
            el.muted = true;
            el.autoplay = true;
            el.loop = true;
            el.playsInline = true;
            el.setAttribute('muted', '');
            el.setAttribute('autoplay', '');
            el.setAttribute('loop', '');
            el.setAttribute('playsinline', '');
            el.preload = 'auto';
            // 自动播放被拦（或解码失败）时不要留一块黑屏：直接淡出加载界面
            el.addEventListener('error', hideSplash);
        } else {
            el.alt = '';
            el.decoding = 'async';
            el.addEventListener('error', hideSplash);
        }
        el.src = src;
        slot.appendChild(el);
        if (kind === 'video') {
            const p = el.play();
            if (p && typeof p.catch === 'function') {
                p.catch(() => { /* 静音自动播放一般不会被拦；被拦时靠 watchdog 兜底 */ });
            }
        }
        const capEl = document.getElementById('boot-caption');
        if (capEl) {
            const text = String(caption || '').trim();
            capEl.textContent = text;
            capEl.hidden = !text;
        }
        applyCaptionPos(captionPos);
        const dimEl = document.getElementById('boot-dim');
        if (dimEl) dimEl.hidden = !dim;
        return el;
    }

    function showSplash() {
        if (!splashEl || dismissed) return;
        splashEl.style.display = '';
        // 必须等一帧再挂 class，否则同一帧内 add/remove 会被浏览器合并成无过渡
        requestAnimationFrame(() => {
            if (splashEl) {
                splashEl.classList.add('boot-show');
                splashEl.setAttribute('aria-hidden', 'false');
            }
        });
    }

    function armExitTimers() {
        if (document.readyState === 'complete') {
            setTimeout(hideSplash, 120);
        } else {
            window.addEventListener('load', () => setTimeout(hideSplash, 120), { once: true });
        }
        // 主线程被大脚本压住时 load 可能迟迟不来：按上限强制收工
        setTimeout(hideSplash, BOOT_HARD_LIMIT_MS);
        document.addEventListener('DOMContentLoaded', () => setTimeout(hideSplash, Math.max(BOOT_HARD_LIMIT_MS - (Date.now() - startAt), 600)));
        // 看门狗：任何异常都不允许把网站卡在加载界面上
        setTimeout(forceRemove, BOOT_WATCHDOG_MS);
        document.getElementById('boot-skip')?.addEventListener('click', hideSplash);
    }

    async function boot() {
        if (!splashEl) return;
        const settings = readSettings();
        if (!settings.enabled) { forceRemove(); return; }

        const hasUrl = settings.kind === 'url' && !!settings.url;
        const hasLocal = settings.hasAsset;
        if (!hasUrl && !hasLocal) { forceRemove(); return; }

        // 先把界面亮起来再取素材：characters.js 体积很大（约 900KB），
        // 等 IndexedDB 回来再显示的话，用户会先被卡在白屏/黑屏上好几秒。
        showSplash();
        armExitTimers();
        applyCaptionPos(settings.captionPos);

        try {
            if (hasUrl) {
                buildMedia(detectKind(settings.url), settings.url, settings.fit, settings.caption, settings.dim, settings.captionPos);
                return;
            }
            const record = await idbGet();
            if (!record || !record.blob) {
                // 素材丢了（清了 IndexedDB / 换浏览器）但设置还在：
                // 没有画面可显示就直接收工，并关掉开关，免得下次还闪一下空屏
                writeSettings({ enabled: false, hasAsset: false });
                forceRemove();
                return;
            }
            const type = String(record.type || '');
            const kind = type.startsWith('video/') ? 'video' : 'image';
            objectUrl = URL.createObjectURL(record.blob);
            buildMedia(kind, objectUrl, settings.fit, settings.caption, settings.dim, settings.captionPos);
        } catch (error) {
            console.warn('[BootSplash] 加载界面初始化失败，已跳过:', error);
            forceRemove();
        }
    }

    /* ---------------- B. 实验室设置面板 ---------------- */

    const get = id => document.getElementById(id);

    function detectKind(mimeOrExt) {
        const v = String(mimeOrExt || '').toLowerCase();
        if (v.startsWith('video/') || /\.(mp4|webm|mov|m4v|ogv)$/.test(v)) return 'video';
        return 'image';
    }

    function renderPreview(source, kind, fit) {
        const box = get('boot-preview');
        if (!box) return;
        box.innerHTML = '';
        box.classList.toggle('cover', fit !== 'contain');
        box.classList.toggle('is-video', kind === 'video');
        if (!source) {
            box.innerHTML = '<span class="boot-empty">尚未设置素材</span>';
            return;
        }
        const el = document.createElement(kind === 'video' ? 'video' : 'img');
        if (kind === 'video') { el.muted = true; el.autoplay = true; el.loop = true; el.playsInline = true; }
        el.src = source;
        el.addEventListener('error', () => {
            box.innerHTML = '<span class="boot-empty">素材无法显示，请检查链接或换一张</span>';
        });
        box.appendChild(el);
    }

    let draft = null;   // { kind: 'local'|'url', url, blob, type, fileName, bytes }

    /** dataURL → Blob（IndexedDB 存的是 Blob，裁切对话框返回的是 dataURL） */
    function dataUrlToBlob(dataUrl) {
        return new Promise(resolve => {
            try {
                const match = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(String(dataUrl || ''));
                if (!match) { resolve(null); return; }
                const mime = match[1] || 'image/png';
                const isBase64 = !!match[2];
                const body = match[3] || '';
                if (isBase64) {
                    const binary = atob(body);
                    const bytes = new Uint8Array(binary.length);
                    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
                    resolve(new Blob([bytes], { type: mime }));
                    return;
                }
                resolve(new Blob([decodeURIComponent(body)], { type: mime }));
            } catch (e) {
                console.warn('[BootSplash] dataURL 转 Blob 失败:', e);
                resolve(null);
            }
        });
    }

    /** 裁切按钮的可用状态：有可裁的图片素材才点亮 */
    function syncCropButton() {
        const btn = get('boot-crop-btn');
        if (!btn) return;
        const s = readSettings();
        const hasDraftImage = Boolean(draft && draft.kind === 'image' && (draft.url || draft.blob));
        const hasUrlImage = Boolean(!draft && s.kind === 'url' && s.url && !/\.(mp4|webm|mov|m4v|ogv)(\?|#|$)/i.test(s.url));
        const hasSavedImage = Boolean(!draft && s.hasAsset && s.kind !== 'video');
        btn.disabled = !(hasDraftImage || hasUrlImage || hasSavedImage);
        btn.title = btn.disabled ? '先选好一张图片，再裁切需要的部分' : '裁切这张图片（视频不支持）';
    }

    function paintPanel() {
        const s = readSettings();
        const enabledEl = get('boot-splash-enabled');
        if (enabledEl) enabledEl.checked = s.enabled;
        const opts = get('boot-splash-options');
        if (opts) opts.hidden = s.enabled !== true;
        const capEl = get('boot-caption-input'); if (capEl) capEl.value = s.caption || '';
        const posEl = get('boot-caption-pos-select'); if (posEl) posEl.value = s.captionPos || 'bottom';
        const fitEl = get('boot-fit-select'); if (fitEl) fitEl.value = s.fit || 'cover';
        const minEl = get('boot-min-ms-input'); if (minEl) minEl.value = s.minMs ?? 1000;
        const dimEl = get('boot-dim-check'); if (dimEl) dimEl.checked = !!s.dim;

        const fit = (draft && draft.fit) || s.fit || 'cover';
        if (draft) {
            renderPreview(draft.url, draft.kind, fit);
        } else if (s.enabled || s.hasAsset || s.url) {
            renderPreview(s.kind === 'url' ? s.url : null, s.kind === 'url' ? detectKind(s.url) : (s.kind || 'image'), fit);
        } else {
            renderPreview(null);
        }
        const status = get('boot-status');
        if (status) {
            const parts = [];
            if (draft) parts.push(`待保存素材：${draft.fileName || draft.url}${draft.bytes ? '（' + (draft.bytes / 1024 / 1024).toFixed(2) + ' MB）' : ''}`);
            else if (s.kind === 'url' && s.url) parts.push(`当前素材：网络直链 ${s.url.slice(0, 46)}${s.url.length > 46 ? '…' : ''}`);
            else if (s.hasAsset) parts.push(`当前素材：${s.fileName || '本地文件'}${s.bytes ? '（' + (s.bytes / 1024 / 1024).toFixed(2) + ' MB）' : ''}`);
            else parts.push('尚未设置素材');
            parts.push(s.enabled ? '开关：已启用' : '开关：未启用');
            status.textContent = parts.join(' · ');
        }
        syncCropButton();
    }

    function bindPanel() {
        const enabledEl = get('boot-splash-enabled');
        if (!enabledEl || document.body.dataset.bootPanelBound === '1') {
            if (enabledEl) paintPanel();
            return;
        }
        document.body.dataset.bootPanelBound = '1';

        enabledEl.addEventListener('change', () => {
            writeSettings({ enabled: enabledEl.checked });
            paintPanel();
        });

        get('boot-splash-options')?.querySelectorAll('input, select').forEach(el => {
            el.addEventListener('change', () => {
                const patch = {
                    caption: get('boot-caption-input')?.value || '',
                    captionPos: CAPTION_POS.includes(get('boot-caption-pos-select')?.value) ? get('boot-caption-pos-select').value : 'bottom',
                    fit: get('boot-fit-select')?.value || 'cover',
                    minMs: clampInt(get('boot-min-ms-input')?.value, 0, 6000, 1000),
                    dim: get('boot-dim-check')?.checked === true
                };
                writeSettings(patch);
                if (draft) draft.fit = patch.fit;
                // 改完位置立刻作用到当前开屏元素上，这样「预览」之前就能看到文字落在哪
                applyCaptionPos(patch.captionPos);
                paintPanel();
            });
        });

        get('boot-file-btn')?.addEventListener('click', () => get('boot-file-upload')?.click());

        get('boot-file-upload')?.addEventListener('change', async e => {
            const file = e.target.files && e.target.files[0];
            e.target.value = '';
            if (!file) return;
            // 换素材时回收上一次临时 object URL，避免预览多次把内存里的 Blob 挂住
            if (draft && draft.localUrl) { try { URL.revokeObjectURL(draft.localUrl); } catch (e) {} }
            if (file.size > MAX_FILE_BYTES) {
                Dlg.alert({ title: '文件太大', message: `这个文件有 ${(file.size / 1024 / 1024).toFixed(1)} MB。加载界面素材请控制在 ${MAX_FILE_BYTES / 1024 / 1024} MB 以内，或改用网络直链。` });
                return;
            }
            if (!/^(image|video)\//.test(file.type || '')) {
                Dlg.alert({ title: '格式不支持', message: '只能选择图片或视频文件（支持 GIF / WebP / APNG / MP4 / WebM 等）。' });
                return;
            }
            const temp = URL.createObjectURL(file);
            draft = {
                kind: detectKind(file.type),
                blob: file,
                url: temp,
                localUrl: temp,
                fileName: file.name,
                bytes: file.size,
                fit: readSettings().fit
            };
            paintPanel();
        });

        /* ------------------------------------------------------------
           裁切画面（问题：自定义加载界面也需要像头像那样裁剪）
           和头像用的是同一个 ImageTools.cropImage 对话框：拖拽取景 + 缩放 +
           比例切换（16:9 / 9:16 / 原图比例…），确认后把裁切结果转成 Blob
           放回 draft，走原本的「保存加载界面」流程写进 IndexedDB。
           注意：canvas 只能取静态帧，所以 GIF 裁切后会变成第一帧的静态图 ——
           这是浏览器的硬限制，界面上已经写明提示。
 */
        get('boot-crop-btn')?.addEventListener('click', async () => {
            if (!window.ImageTools?.cropImage) {
                Dlg.alert({ title: '功能未加载', message: '图片工具没有加载成功（可能被脚本开关关掉了），无法裁切。' });
                return;
            }
            let src = draft && !draft.remote ? draft.url : '';
            let needRevoke = false;
            if (!src && draft && draft.remote) src = draft.url;
            if (!src) {
                // 没有待保存素材时，退回裁切「已保存」的那份
                try {
                    const record = await idbGet();
                    if (record && record.blob && String(record.type || '').startsWith('image/')) {
                        src = URL.createObjectURL(record.blob);
                        needRevoke = true;
                    }
                } catch (e) { /* 读不到就没有可裁的素材 */ }
            }
            if (!src) {
                Dlg.alert({ title: '还没有可裁切的图片', message: '请先本地上传一张图片（或填好图片直链），再点「裁切画面」。视频不支持裁切。' });
                return;
            }
            const btn = get('boot-crop-btn');
            if (btn) btn.disabled = true;
            try {
                const out = await window.ImageTools.cropImage(src, {
                    title: '裁切加载界面',
                    aspects: [
                        { label: '16:9（横屏）', value: 16 / 9 },
                        { label: '9:16（竖屏）', value: 9 / 16 },
                        { label: '4:3', value: 4 / 3 },
                        { label: '3:4', value: 3 / 4 },
                        { label: '1:1', value: 1 },
                        { label: '21:9（带鱼屏）', value: 21 / 9 },
                        { label: '原图比例', natural: true }
                    ]
                });
                if (!out || out === src) { if (typeof showToast === 'function') showToast('没有改动，继续使用原图', 'ri-information-line'); return; }
                const blob = await dataUrlToBlob(out);
                if (!blob) {
                    if (typeof showToast === 'function') showToast('裁切结果无法写入，请换一张图片', 'ri-error-warning-line');
                    return;
                }
                if (draft && draft.localUrl) { try { URL.revokeObjectURL(draft.localUrl); } catch (e) {} }
                const temp = URL.createObjectURL(blob);
                draft = {
                    kind: 'image',
                    blob,
                    url: temp,
                    localUrl: temp,
                    fileName: (draft && draft.fileName ? draft.fileName.replace(/\.[^.]+$/, '') : '加载界面') + '-裁切.png',
                    bytes: blob.size,
                    fit: readSettings().fit,
                    cropped: true
                };
                paintPanel();
                if (typeof showToast === 'function') showToast('已裁切，点「保存加载界面」生效', 'ri-crop-2-line');
            } catch (error) {
                console.warn('[BootSplash] 裁切失败:', error);
                Dlg.alert({ title: '裁切失败', message: String(error?.message || error) });
            } finally {
                if (needRevoke) { try { URL.revokeObjectURL(src); } catch (e) {} }
                syncCropButton();
            }
        });

        get('boot-url-btn')?.addEventListener('click', () => {
            const url = String(get('boot-url-input')?.value || '').trim();
            if (!url) return;
            if (!/^https?:\/\//i.test(url)) {
                Dlg.alert({ title: '链接无效', message: '请填写 http:// 或 https:// 开头的直链。' });
                return;
            }
            draft = { kind: detectKind(url), url, fileName: url.split('/').pop().slice(0, 60), bytes: 0, fit: readSettings().fit, remote: true };
            paintPanel();
        });

        get('boot-preview-play')?.addEventListener('click', () => {
            const s = readSettings();
            const src = draft ? draft.url : (s.kind === 'url' ? s.url : null);
            if (!src && !s.hasAsset) { Dlg.alert({ title: '暂无素材', message: '还没有可预览的素材：先选择本地文件或填写网络直链。' }); return; }
            if (!src && s.hasAsset) {
                idbGet().then(record => {
                    if (!record || !record.blob) { Dlg.alert({ title: '读取失败', message: '素材读取失败，请重新上传一次。' }); return; }
                    const temp = URL.createObjectURL(record.blob);
                    livePreview(temp, String(record.type || '').startsWith('video/') ? 'video' : 'image', s, temp);
                }).catch(() => Dlg.alert({ title: '读取失败', message: '素材读取失败，请重新上传一次。' }));
                return;
            }
            livePreview(src, draft ? draft.kind : detectKind(src), s);
        });

        get('boot-save-btn')?.addEventListener('click', saveAll);
        get('boot-clear-btn')?.addEventListener('click', async () => {
            if (!await Dlg.confirm({ title: '清除素材', message: '确定清除已保存的加载界面素材吗？清除后需要重新上传。', okText: '清除', danger: true })) return;
            try { await idbDelete(); } catch (e) { console.warn('[BootSplash] 清除素材失败:', e); }
            writeSettings({ kind: '', url: '', hasAsset: false, fileName: '', bytes: 0, enabled: false });
            draft = null;
            const input = get('boot-url-input'); if (input) input.value = '';
            paintPanel();
            if (typeof showToast === 'function') showToast('加载界面素材已清除', 'ri-delete-bin-line');
        });

        paintPanel();
    }

    /**
     * 临时把加载界面「演」一遍给用户看。
     * revoke 只在传入临时 object URL 时需要（本地素材预览用 blob:）；
     * 网络直链与已保存素材（走 objectUrl 变量的那条）都不在这里回收。
     */
    function livePreview(src, kind, s, revoke) {
        if (!splashEl) return;
        dismissed = false;
        buildMedia(kind, src, s.fit, s.caption || '预览效果', s.dim, s.captionPos);
        splashEl.style.display = '';
        requestAnimationFrame(() => splashEl.classList.add('boot-show'));
        setTimeout(() => {
            dismissed = true;
            splashEl.classList.remove('boot-show');
            setTimeout(() => { if (splashEl) splashEl.style.display = 'none'; }, 420);
            if (revoke) { try { URL.revokeObjectURL(revoke); } catch (e) {} }
        }, Math.max(1400, (s.minMs || 1000) + 1200));
    }

    async function saveAll() {
        const s = readSettings();
        if (!draft) {
            if (!s.hasAsset && !(s.kind === 'url' && s.url)) {
                if (typeof showToast === 'function') showToast('请先选择本地文件或填写直链', 'ri-information-line');
                return;
            }
            writeSettings({ enabled: true });
            paintPanel();
            if (typeof showToast === 'function') showToast('已保存', 'ri-check-line');
            return;
        }
        const btn = get('boot-save-btn');
        const old = btn ? btn.innerHTML : '';
        if (btn) { btn.disabled = true; btn.innerHTML = '<i class="ri-loader-4-line ri-spin"></i> 保存中…'; }
        try {
            if (draft.remote) {
                writeSettings({
                    kind: 'url',
                    url: draft.url,
                    hasAsset: false,
                    fileName: draft.fileName,
                    bytes: 0,
                    enabled: true
                });
            } else {
                await idbPut({ id: ASSET_ID, blob: draft.blob, type: draft.blob.type || 'image/png', name: draft.fileName, savedAt: new Date().toISOString() });
                writeSettings({
                    kind: draft.kind,
                    url: '',
                    hasAsset: true,
                    fileName: draft.fileName,
                    bytes: draft.bytes,
                    enabled: true
                });
            }
            draft = null;
            const input = get('boot-url-input'); if (input) input.value = '';
            paintPanel();
            if (typeof showToast === 'function') showToast('加载界面已保存，刷新网站即可看到', 'ri-check-double-line');
        } catch (error) {
            console.error('[BootSplash] 保存失败:', error);
            if (typeof showToast === 'function') showToast(`保存失败：${error?.message || error}`, 'ri-error-warning-line');
        } finally {
            if (btn) { btn.disabled = false; btn.innerHTML = old; }
        }
    }

    /* ---------------- 对外接口 ---------------- */

    window.BootSplash = {
        readSettings,
        writeSettings,
        initPanel: bindPanel,
        dismiss: hideSplash,
        forceHide: forceRemove,
        idbDelete,
        idbGet,
        // 供「导入/恢复默认」等流程在删掉设置后同步清库
        async resetAll() {
            try { await idbDelete(); } catch (e) {}
            try { localStorage.removeItem(SETTINGS_KEY); } catch (e) {}
        }
    };

    boot();

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bindPanel);
    } else {
        bindPanel();
    }
})();
