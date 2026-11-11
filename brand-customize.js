/**
 * brand-customize.js —— 站点标识定制（文字 + 图标）
 *
 * 位置：设置 → 界面外观 → 站点标识。
 * 目标：侧边栏顶部那一条「图标 + 短信」。
 *
 * 三件事，都在本机完成：
 *   1. 名称文字：留空 = 跟随界面语言（中文「短信」/ 英文 Messages），
 *      填了就用你填的，且不会被子短语表改回英文（打 data-no-i18n）。
 *   2. 图标：内置 Remix 图标 / 网络图片地址 / 本地上传，三选一。
 *      · 图片画在 <i> 的背景上（background-size:contain），不插 <img>：
 *        侧边栏那一行的 flex 布局和各主题对 .sidebar-header > i 的覆盖都不用动；
 *        contain 保证原比例，非正方形的图不会被拉变形。
 *      · 本地上传：位图先等比缩到长边 192px 再转 WebP/PNG 的 data URL
 *        （透明底保留），一张通常 3–30KB，localStorage 装得下；
 *        SVG 按矢量原样存（超过 400KB 会拒绝，免得撑爆存储）。
 *   3. 图标大小：0 = 自动（跟随字号），可手动 14–48px。
 *
 * 存储：localStorage['myswBrandV1']。改一下立刻生效，不需要点保存。
 */
(function () {
    'use strict';

    var KEY = 'myswBrandV1';
    var DEFAULT_TITLE = '短信';
    var DEFAULT_GLYPH = 'ri-message-3-fill';
    var DEFAULT_IMAGE_SIZE = 20;      // 图片模式下的「自动」尺寸
    var MAX_ICON_EDGE = 192;          // 位图长边上限
    var MAX_SVG_BYTES = 400 * 1024;   // SVG data URL 上限
    var MAX_FILE_BYTES = 8 * 1024 * 1024;

    /* 内置图标：只用 remixicon 3.5.0 里确实存在的名字（逐个核对过 CSS） */
    var PRESETS = [
        { glyph: 'ri-message-3-fill',   zh: '消息',   en: 'Message' },
        { glyph: 'ri-chat-3-fill',      zh: '对话',   en: 'Chat' },
        { glyph: 'ri-discuss-fill',     zh: '讨论',   en: 'Discuss' },
        { glyph: 'ri-chat-smile-2-fill', zh: '笑脸',  en: 'Smiley' },
        { glyph: 'ri-heart-3-fill',     zh: '爱心',   en: 'Heart' },
        { glyph: 'ri-star-fill',        zh: '星星',   en: 'Star' },
        { glyph: 'ri-moon-clear-fill',  zh: '月亮',   en: 'Moon' },
        { glyph: 'ri-sparkling-fill',   zh: '闪耀',   en: 'Sparkle' },
        { glyph: 'ri-fire-fill',        zh: '火焰',   en: 'Flame' },
        { glyph: 'ri-robot-2-fill',     zh: '机器人', en: 'Robot' }
    ];

    var DEFAULTS = { title: '', glyph: DEFAULT_GLYPH, mode: 'glyph', image: '', size: 0 };
    var settings = read();

    function $(id) { return document.getElementById(id); }

    function clampSize(v) {
        var n = Number(v);
        if (!isFinite(n) || n <= 0) return 0;
        return Math.min(48, Math.max(14, Math.round(n)));
    }

    function normalize(raw) {
        raw = raw && typeof raw === 'object' ? raw : {};
        var mode = raw.mode === 'image' ? 'image' : 'glyph';
        var image = typeof raw.image === 'string' ? raw.image : '';
        if (mode === 'image' && !image) mode = 'glyph';
        return {
            title: typeof raw.title === 'string' ? raw.title.slice(0, 16) : '',
            glyph: (typeof raw.glyph === 'string' && /^ri-[a-z0-9-]+$/.test(raw.glyph)) ? raw.glyph : DEFAULT_GLYPH,
            mode: mode,
            image: image,
            size: clampSize(raw.size)
        };
    }

    function read() {
        var raw = {};
        try { raw = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (e) { raw = {}; }
        return normalize(raw);
    }

    function save() {
        try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch (e) {
            /* 存不下（比如图片过大）时至少让本次生效，并提示一句 */
            toast(L('这张图太大了，浏览器存不下，刷新后会丢', 'This image is too large to save; it will be lost after a refresh'), 'ri-alert-line');
        }
    }

    /* ---------------- 小工具 ---------------- */

    function isEn() {
        try {
            return !!(window.SiteI18n && typeof SiteI18n.getLang === 'function' && SiteI18n.getLang() === 'en');
        } catch (e) { return false; }
    }

    function L(zh, en) { return isEn() ? en : zh; }

    /* 默认名字的中英文都在这里定，不依赖 i18n 的短语表改写我们自己写的节点 */
    function defaultTitle() { return L(DEFAULT_TITLE, 'Messages'); }

    function toast(msg, icon) {
        if (typeof window.showToast === 'function') window.showToast(msg, icon || 'ri-quill-pen-line');
    }

    function presetLabel(p) { return L(p.zh, p.en); }

    function presetByGlyph(glyph) {
        for (var i = 0; i < PRESETS.length; i++) if (PRESETS[i].glyph === glyph) return PRESETS[i];
        return null;
    }

    /* ---------------- 画到界面上 ---------------- */

    function setGlyphClass(el, glyph) {
        Array.prototype.slice.call(el.classList).forEach(function (c) {
            if (c.indexOf('ri-') === 0) el.classList.remove(c);
        });
        if (glyph) el.classList.add(glyph);
    }

    function paintIcon(el, s) {
        if (!el) return;
        if (s.mode === 'image' && s.image) {
            setGlyphClass(el, '');
            el.classList.add('brand-icon--image');
            el.style.backgroundImage = 'url("' + s.image.replace(/"/g, '%22') + '")';
            var px = s.size || DEFAULT_IMAGE_SIZE;
            el.style.width = px + 'px';
            el.style.height = px + 'px';
            el.style.fontSize = '';
        } else {
            el.classList.remove('brand-icon--image');
            el.style.backgroundImage = '';
            el.style.width = '';
            el.style.height = '';
            setGlyphClass(el, s.glyph);
            el.style.fontSize = s.size ? s.size + 'px' : '';
        }
    }

    function paintTitle(el, s) {
        if (!el) return;
        if (s.title) {
            el.textContent = s.title;
            /* 自己的名字不该被子短语表翻成英文（比如起名「聊天」） */
            el.setAttribute('data-no-i18n', '');
        } else {
            el.removeAttribute('data-no-i18n');
        }
    }

    /**
     * 应用到真实侧边栏。
     * opts.resetText = true 时，若没有自定义名字，把文字写回默认值
     * （当前语言下的「短信 / Messages」）——用户刚清空名字时需要这个。
     */
    function applyBrand(opts) {
        opts = opts || {};
        paintIcon($('sidebar-brand-icon'), settings);
        var title = $('sidebar-brand-title');
        paintTitle(title, settings);
        if (title && !settings.title && opts.resetText) title.textContent = defaultTitle();
        paintPreview();
    }

    function paintPreview() {
        var icon = $('bc-preview-icon');
        var title = $('bc-preview-title');
        if (icon) {
            /* 预览里的图标是独立的 <i>，图片模式下同样走背景画法 */
            paintIcon(icon, settings);
        }
        if (title) title.textContent = settings.title || defaultTitle();
    }

    /* ---------------- 面板 ---------------- */

    var panelReady = false;

    function buildGlyphGrid() {
        var box = $('bc-glyphs');
        if (!box || box.dataset.built === '1') return;
        box.dataset.built = '1';
        PRESETS.forEach(function (p) {
            var b = document.createElement('button');
            b.type = 'button';
            b.className = 'bc-glyph';
            b.dataset.glyph = p.glyph;
            b.setAttribute('role', 'radio');
            b.setAttribute('aria-checked', 'false');
            b.title = presetLabel(p);
            b.setAttribute('aria-label', presetLabel(p));
            var i = document.createElement('i');
            i.className = p.glyph;
            b.appendChild(i);
            b.addEventListener('click', function () {
                settings.mode = 'glyph';
                settings.glyph = p.glyph;
                save();
                syncPanel();
                applyBrand();
            });
            box.appendChild(b);
        });
    }

    function syncGlyphState() {
        var box = $('bc-glyphs');
        if (!box) return;
        Array.prototype.forEach.call(box.querySelectorAll('.bc-glyph'), function (b) {
            var on = settings.mode === 'glyph' && b.dataset.glyph === settings.glyph;
            b.classList.toggle('is-on', on);
            b.setAttribute('aria-checked', on ? 'true' : 'false');
            /* 语言变了，图标的 title / aria 也要跟着换 */
            var p = presetByGlyph(b.dataset.glyph);
            if (p) { b.title = presetLabel(p); b.setAttribute('aria-label', b.title); }
        });
    }

    function sizeText(s) {
        if (!s.size) return L('自动', 'Auto');
        return s.size + 'px';
    }

    function statusText() {
        if (settings.mode === 'image' && settings.image) {
            if (/^data:/.test(settings.image)) {
                var kb = Math.max(1, Math.round(settings.image.length / 1024));
                return L('当前：本地上传的图片（约 ' + kb + ' KB，只存在这台设备）',
                         'Current: uploaded image (about ' + kb + ' KB, stored on this device only)');
            }
            var short = settings.image.length > 52 ? settings.image.slice(0, 52) + '…' : settings.image;
            return L('当前：网络图片 ' + short, 'Current: image from URL ' + short);
        }
        var p = presetByGlyph(settings.glyph);
        var name = p ? presetLabel(p) : settings.glyph;
        return L('当前：内置图标 · ' + name, 'Current: built-in icon · ' + name);
    }

    function syncPanel() {
        if (!panelReady) return;
        var t = $('bc-title');
        if (t && document.activeElement !== t) t.value = settings.title;
        var url = $('bc-url');
        if (url && document.activeElement !== url) {
            url.value = (settings.mode === 'image' && settings.image && !/^data:/.test(settings.image)) ? settings.image : '';
        }
        var size = $('bc-size');
        if (size) size.value = String(settings.size);
        var out = $('bc-size-out');
        if (out) out.textContent = sizeText(settings);
        syncGlyphState();
        var st = $('bc-status');
        if (st) st.textContent = statusText();
        paintPreview();
    }

    function commit(patch, opts) {
        settings = normalize(Object.assign({}, settings, patch));
        save();
        syncPanel();
        applyBrand(opts);
    }

    /* ---------------- 图片：URL / 本地上传 ---------------- */

    function applyUrl() {
        var input = $('bc-url');
        if (!input) return;
        var v = (input.value || '').trim();
        if (!v) { toast(L('先填一个图片地址', 'Paste an image URL first'), 'ri-link'); return; }
        if (!/^(https?:\/\/|data:image\/)/i.test(v)) {
            toast(L('地址要以 http:// 或 https:// 开头', 'The URL must start with http:// or https://'), 'ri-error-warning-line');
            return;
        }
        var probe = new Image();
        probe.onload = function () {
            commit({ mode: 'image', image: v });
            toast(L('图标已换成这张网络图片', 'Icon replaced with that image'), 'ri-image-line');
        };
        probe.onerror = function () {
            toast(L('这张图加载不出来：地址不对、站点禁止外链，或者需要登录', 'That image failed to load: bad URL, hotlink blocked, or login required'), 'ri-error-warning-line');
        };
        probe.src = v;
    }

    function shrinkToDataUrl(img) {
        var w = img.naturalWidth || img.width;
        var h = img.naturalHeight || img.height;
        if (!w || !h) return '';
        var scale = Math.min(1, MAX_ICON_EDGE / Math.max(w, h));
        var cw = Math.max(1, Math.round(w * scale));
        var ch = Math.max(1, Math.round(h * scale));
        var cv = document.createElement('canvas');
        cv.width = cw;
        cv.height = ch;
        var ctx = cv.getContext('2d');
        if (!ctx) return '';
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, cw, ch);
        /* 先试 WebP（带透明、体积小），不支持时浏览器会退回 PNG 的字符串 */
        var out = cv.toDataURL('image/webp', 0.92);
        if (out.indexOf('data:image/webp') !== 0) out = cv.toDataURL('image/png');
        return out;
    }

    function handleFile(file) {
        if (!file) return;
        if (!/^image\//i.test(file.type)) {
            toast(L('请选图片文件（PNG / JPG / SVG / WebP）', 'Pick an image file (PNG / JPG / SVG / WebP)'), 'ri-image-line');
            return;
        }
        if (file.size > MAX_FILE_BYTES) {
            toast(L('图片太大了，请换一张 8 MB 以内的', 'That file is too large — please use one under 8 MB'), 'ri-alert-line');
            return;
        }
        var reader = new FileReader();
        reader.onerror = function () { toast(L('读不出这个文件', 'Could not read that file'), 'ri-error-warning-line'); };
        reader.onload = function () {
            var raw = String(reader.result || '');
            if (/svg/i.test(file.type)) {
                if (raw.length > MAX_SVG_BYTES) {
                    toast(L('这个 SVG 太大了（超过 400 KB），建议先精简，或换一张 128×128 的位图',
                            'This SVG is too large (over 400 KB) — simplify it or use a 128×128 bitmap'), 'ri-alert-line');
                    return;
                }
                commit({ mode: 'image', image: raw });
                toast(L('已换成你上传的 SVG 图标', 'Icon replaced with your SVG'), 'ri-checkbox-circle-line');
                return;
            }
            var img = new Image();
            img.onload = function () {
                var data = shrinkToDataUrl(img);
                if (!data) { toast(L('这张图读不出来，换一张试试', 'That image could not be loaded — try another'), 'ri-error-warning-line'); return; }
                commit({ mode: 'image', image: data });
                toast(L('已换成你上传的图标', 'Icon replaced with your upload'), 'ri-checkbox-circle-line');
            };
            img.onerror = function () { toast(L('这张图读不出来，换一张试试', 'That image could not be loaded — try another'), 'ri-error-warning-line'); };
            img.src = raw;
        };
        reader.readAsDataURL(file);
    }

    /* ---------------- 事件绑定 ---------------- */

    function initPanel() {
        if (panelReady || !$('brand-custom-settings')) return;
        panelReady = true;
        buildGlyphGrid();

        var t = $('bc-title');
        if (t) {
            t.addEventListener('input', function () {
                /* 边打边生效：长度截到 16 字，空白视作「没填」 */
                var v = t.value.slice(0, 16);
                commit({ title: v.trim() ? v : '' }, { resetText: !v.trim() });
            });
        }

        var size = $('bc-size');
        if (size) {
            size.addEventListener('input', function () {
                var v = Number(size.value);
                settings = normalize(Object.assign({}, settings, { size: v }));
                save();
                var out = $('bc-size-out');
                if (out) out.textContent = sizeText(settings);
                applyBrand();
            });
        }

        var apply = $('bc-apply-url');
        if (apply) apply.addEventListener('click', applyUrl);

        var url = $('bc-url');
        if (url) {
            url.addEventListener('keydown', function (e) {
                if (e.key === 'Enter') { e.preventDefault(); applyUrl(); }
            });
        }

        var upload = $('bc-upload-btn');
        var file = $('bc-file');
        if (upload && file) {
            upload.addEventListener('click', function () { file.click(); });
            file.addEventListener('change', function () {
                handleFile(file.files && file.files[0]);
                file.value = '';   // 同一张图连选两次也能触发
            });
        }

        var reset = $('bc-reset-btn');
        if (reset) {
            reset.addEventListener('click', function () {
                settings = normalize(DEFAULTS);
                try { localStorage.removeItem(KEY); } catch (e) {}
                syncPanel();
                applyBrand({ resetText: true });
                toast(L('已恢复默认图标与文字', 'Icon and name restored to defaults'), 'ri-restart-line');
            });
        }

        syncPanel();
    }

    function onLangChange() {
        if (!panelReady) return;
        syncGlyphState();
        var out = $('bc-size-out');
        if (out) out.textContent = sizeText(settings);
        var st = $('bc-status');
        if (st) st.textContent = statusText();
        /* 自定义名字不翻译；默认名字交给 i18n 处理，这里只管预览 */
        paintPreview();
    }

    function boot() {
        initPanel();
        applyBrand();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot, { once: true });
    } else {
        boot();
    }

    /* 设置面板可能被重建（折叠板 / 主题切换会重排），补一次挂载 */
    /* 事件在 window 上派发（i18n.js setLang 里 dispatchEvent(window)），
       挂在 document 上收不到。 */
    window.addEventListener('sitelangchange', onLangChange);
    document.addEventListener('click', function (e) {
        var tab = e.target && e.target.closest && e.target.closest('[data-tab="appearance"]');
        if (tab) setTimeout(boot, 0);
    }, true);

    window.MySWBrand = {
        apply: applyBrand,
        get: function () { return Object.assign({}, settings); },
        reset: function () {
            settings = normalize(DEFAULTS);
            try { localStorage.removeItem(KEY); } catch (e) {}
            syncPanel();
            applyBrand({ resetText: true });
        }
    };
})();
