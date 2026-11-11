/**
 * ad-lab.js —— 实验室 ·「广告跳跳乐」
 * · 自包含、无依赖：主站 / 论坛 / 文档 / 角色市场各页 <script defer>
 * 引一份即可；不加载时零开销。
 * · 配置存 localStorage（mySWLabAdsConfig），图片/视频 Blob 存
 * IndexedDB（myswLabAds / media）。配置里只存媒体 id 引用。
 * · 关闭按钮任意尺寸 / 播放顺序（随机·轮播）/ 弹窗间隔均可调。
 * · 每条广告各自勾选「适用于哪些广告形式」，同一条素材可以同时
 * 出现在开屏和 banner 里。
 * · 「流氓设置」：迷惑 ×、越点越推的不感兴趣、可关的广告标识、
 * 评论区 + 纯脚本水军。全部可选，默认关，开了才知道某些 App 多能折腾。
 */
(function () {
    'use strict';

    /* 功能开关：被关掉时连初始化都不做。
       论坛 / 文档 / 市场页没引 script-loader，所以这里直接读同一份
       localStorage，语义和主站保持一致。 */
    function moduleEnabled() {
        try {
            if (window.ScriptLoader && typeof ScriptLoader.isEnabled === 'function') {
                return ScriptLoader.isEnabled('ad-lab.js');
            }
            var raw = localStorage.getItem('scriptLoadSettings');
            var s = raw ? JSON.parse(raw) : {};
            return !(s && s['ad-lab.js'] === false);
        } catch (e) { return true; }
    }
    if (!moduleEnabled()) return;

    var CONFIG_KEY = 'mySWLabAdsConfig';
    var DB_NAME = 'myswLabAds';
    var STORE = 'media';

    var AD_TYPES = [
        { key: 'splash', label: '开屏', hint: '打开页面时来一下' },
        { key: 'shake',  label: '摇一摇', hint: '手机摇一摇触发（桌面可手动测试）' },
        { key: 'popup',  label: '弹窗', hint: '进页面一会儿后弹一下' },
        { key: 'banner', label: 'banner', hint: '页面顶部横幅' },
        { key: 'float',  label: '浮标', hint: '右下角小悬浮标，点开展开' },
        { key: 'inline', label: '内容广告', hint: '混进内容流：论坛帖子之间 / 聊天消息之间 / 文档段落之间 / 插件列表之间' }
    ];
    /* 站点可能部署在子目录、也可能开了「无 .html 后缀」的干净链接，
       所以一律按文件名（去掉扩展名）判断，避免整页判定失败后什么都不显示。 */
    function pageName() {
        var name = location.pathname.split('/').pop() || 'index';
        name = name.replace(/\.html?$/i, '');
        return name || 'index';
    }

    var SCENES = [
        { key: 'main',   label: '主站（聊天 / 实验室 / 学习辅导）', match: function () { return pageName() === 'index'; } },
        { key: 'forum',  label: '论坛', match: function () { return pageName() === 'forum'; } },
        { key: 'docs',   label: '文档', match: function () { return pageName() === 'docs'; } },
        { key: 'market', label: '角色市场 / 插件市场', match: function () { return pageName() === 'character' || pageName() === 'plugin-marketplace' || pageName() === 'market'; } }
    ];
    var CLOSE_SIZES = { small: 18, medium: 26, large: 38 };
    var MAX_IMAGE_BYTES = 5 * 1024 * 1024;
    var MAX_VIDEO_BYTES = 30 * 1024 * 1024;
    var NOTE_TEXT = '实验室模拟广告 · 你自己开的 · 不是 MySW 在圈钱';

    /* 流氓设置默认值：一律关闭。默认仍是「干净模拟」，想要国软那味儿自己开。 */
    function defaultRogue() {
        return {
            closePx: null,                                                  // 自定义 × 尺寸，null 用预设
            decoy: { enabled: false, count: 3, tinyReal: true, action: 'retry' },
            nope: { enabled: false, effect: 'more' },                       // more = 越点越推
            badge: { enabled: true, size: 10, text: '广告' },
            /* 假头发丝：全屏常驻，鼠标划过去能拨开、松手弹回，但擦不掉 */
            lint: { enabled: false, count: 3, strength: 'medium' },
            /* 跳转套娃：点掉一个立刻弹下一个 */
            nest: { enabled: false, count: 4, endless: false }
        };
    }

    /* 假 × 的落点，越靠前越分散。底部那一条留给「不感兴趣」真 × 和底部小字，别去盖。 */
    var DECOY_SLOTS_TINY = [
        { top: 8, right: 8 }, { top: 8, right: 54 }, { top: 56, right: 8 },
        { top: 56, right: 54 }, { top: 8, left: 54 }, { top: 56, left: 8 }
    ];
    var DECOY_SLOTS_NORMAL = [
        { top: 8, right: 54 }, { top: 56, right: 8 }, { top: 56, right: 54 },
        { top: 8, left: 54 }, { top: 56, left: 8 }, { top: 8, left: 8 }
    ];

    /* ---------------- 配置 ---------------- */

    function defaultConfig() {
        return {
            enabled: false,
            types: { splash: false, shake: false, popup: false, banner: false, float: false, inline: false },
            /* 默认四个页面全开。原先只开主站，用户在论坛 / 插件市场里
               「明明开了广告却什么都没有」，看着像功能坏了。 */
            scenes: { main: true, forum: true, docs: true, market: true },
            closeSize: 'medium',
            order: 'random',
            popupDelaySec: 30,
            seqCounter: 0,
            rogue: defaultRogue(),
            ads: []
        };
    }

    function loadConfig() {
        try {
            var saved = JSON.parse(localStorage.getItem(CONFIG_KEY) || '{}');
            var base = defaultConfig();
            var scenes = Object.assign(base.scenes, saved.scenes || {});
            // 没有 __v 的是旧配置（当时只有主站默认开启）：升级时把其余页面也打开，
            // 否则改完默认值对老用户不生效，仍然是「论坛看不到广告」。
            if (saved.__v === undefined) {
                Object.keys(scenes).forEach(function (k) { scenes[k] = true; });
            }
            return Object.assign(base, saved, {
                __v: 3,
                types: Object.assign(base.types, saved.types || {}),
                scenes: scenes,
                rogue: Object.assign(defaultRogue(), saved.rogue || {}),
                ads: Array.isArray(saved.ads) ? saved.ads : []
            });
        } catch (e) { return defaultConfig(); }
    }

    function saveConfig(config) {
        try { localStorage.setItem(CONFIG_KEY, JSON.stringify(config)); }
        catch (e) { console.warn('[广告跳跳乐] 配置保存失败：', e); }
    }

    /* ---------------- 素材库（IndexedDB） ---------------- */

    function withMediaDb(mode, run) {
        return new Promise(function (resolve, reject) {
            if (typeof indexedDB === 'undefined') { reject(new Error('当前环境不支持 IndexedDB')); return; }
            var req = indexedDB.open(DB_NAME, 1);
            req.onupgradeneeded = function () {
                var db = req.result;
                if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
            };
            req.onerror = function () { reject(req.error || new Error('打开素材库失败')); };
            req.onsuccess = function () {
                var db = req.result;
                var out;
                try {
                    var tx = db.transaction(STORE, mode);
                    out = run(tx.objectStore(STORE));
                    tx.oncomplete = function () { db.close(); resolve(out ? out.result : undefined); };
                    tx.onerror = function () { db.close(); reject(tx.error || new Error('素材读写失败')); };
                } catch (e) { try { db.close(); } catch (e2) {} reject(e); }
            };
        });
    }

    function mediaPut(record) { return withMediaDb('readwrite', function (s) { return s.put(record); }); }
    function mediaGet(id) { return withMediaDb('readonly', function (s) { return s.get(id); }); }
    function mediaDelete(id) { return withMediaDb('readwrite', function (s) { return s.delete(id); }); }
    function mediaAllKeys() { return withMediaDb('readonly', function (s) { return s.getAllKeys(); }); }

    /* ---------------- 工具 ---------------- */

    function currentSceneKey() {
        for (var i = 0; i < SCENES.length; i++) {
            if (SCENES[i].match()) return SCENES[i].key;
        }
        return null;
    }

    function rogueOf(config) {
        var d = defaultRogue();
        var r = (config && config.rogue) || {};
        return {
            closePx: r.closePx == null ? null : (Number(r.closePx) || null),
            decoy: Object.assign(d.decoy, r.decoy || {}),
            nope: Object.assign(d.nope, r.nope || {}),
            badge: Object.assign(d.badge, r.badge || {}),
            lint: Object.assign(d.lint, r.lint || {}),
            nest: Object.assign(d.nest, r.nest || {})
        };
    }

    /* 被点过几次「不感兴趣」。effect=more 时权重反而变高，这就是 B 站。 */
    function adWeight(ad, rogue) {
        var n = Number(ad.notInterested) || 0;
        if (!rogue.nope.enabled || !n) return 1;
        return rogue.nope.effect === 'less' ? 1 / (1 + n) : 1 + n * 4;
    }

    /** 选一条适用于 adType 的广告；random 按权重抽，sequential 按列表轮播 */
    function pickAd(config, adType) {
        var pool = (config.ads || []).filter(function (ad) {
            return ad.enabled !== false
                && Array.isArray(ad.types) && ad.types.indexOf(adType) >= 0
                && (!ad.scenes || !ad.scenes.length || ad.scenes.indexOf(currentSceneKey()) >= 0);
        });
        if (!pool.length) return null;
        if (config.order === 'sequential') {
            var idx = config.seqCounter || 0;
            config.seqCounter = (idx + 1) % pool.length;
            saveConfig(config);
            return pool[idx % pool.length];
        }
        var rogue = rogueOf(config);
        var weights = pool.map(function (ad) { return adWeight(ad, rogue); });
        var total = weights.reduce(function (a, b) { return a + b; }, 0);
        var r = Math.random() * total;
        for (var i = 0; i < pool.length; i++) {
            r -= weights[i];
            if (r <= 0) return pool[i];
        }
        return pool[pool.length - 1];
    }

    function typeAds(config, adType) {
        return (config.ads || []).filter(function (ad) {
            return ad.enabled !== false && Array.isArray(ad.types) && ad.types.indexOf(adType) >= 0;
        });
    }

    /** 某个形式在当前场景下有几条可用广告（诊断和面板提示都用它） */
    function countAds(config, adType) {
        var scene = currentSceneKey();
        return typeAds(config, adType).filter(function (ad) {
            return !ad.scenes || !ad.scenes.length || ad.scenes.indexOf(scene) >= 0;
        }).length;
    }

    function closeSizePx(config) {
        var custom = rogueOf(config).closePx;
        if (custom) return Math.min(Math.max(custom, 6), 180);
        return CLOSE_SIZES[config.closeSize] || CLOSE_SIZES.medium;
    }

    function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;'); }

    function toast(msg, icon) {
        if (window.showToast) { window.showToast(msg, icon || 'ri-information-line'); return; }
        var el = document.createElement('div');
        el.className = 'adlab-toast';
        el.textContent = msg;
        document.body.appendChild(el);
        setTimeout(function () { el.remove(); }, 2400);
    }


    function buildMedia(ad) {
        // 返回 Promise<HTMLElement|null>：图片 <img> / 视频 <video>
        if (!ad.mediaId) return Promise.resolve(null);
        return mediaGet(ad.mediaId).then(function (rec) {
            if (!rec || !rec.blob) return null;
            var url = URL.createObjectURL(rec.blob);
            if (rec.kind === 'video') {
                var v = document.createElement('video');
                v.src = url; v.muted = true; v.loop = true; v.autoplay = true;
                v.playsInline = true; v.setAttribute('playsinline', ''); v.controls = true;
                v.className = 'adlab-media';
                return v;
            }
            var img = document.createElement('img');
            img.src = url; img.className = 'adlab-media'; img.alt = ad.title || '模拟广告素材';
            return img;
        }).catch(function () { return null; });
    }

    function makeNote() {
        var note = document.createElement('div');
        note.className = 'adlab-note';
        note.textContent = NOTE_TEXT;
        return note;
    }

    function makeClose(config, onClick, opts) {
        opts = opts || {};
        var size = opts.size || closeSizePx(config);
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'adlab-close';
        btn.innerHTML = opts.label || '&times;';
        btn.style.width = size + 'px';
        btn.style.height = size + 'px';
        btn.style.fontSize = Math.round(size * 0.62) + 'px';
        if (opts.title) btn.title = opts.title;
        btn.addEventListener('click', onClick);
        return btn;
    }

    /* 广告标识：可关，可改字号和文字 */
    function makeBadge(rogue) {
        var badge = document.createElement('span');
        badge.className = 'adlab-badge';
        badge.textContent = rogue.badge.text || '广告';
        badge.style.fontSize = (Number(rogue.badge.size) || 10) + 'px';
        return badge;
    }

    /* 假 ×：点了关不掉。retry 提示"关闭失败"，empty 毫无反应，more 再推一条 */
    function makeDecoy(config, rogue, slot, index) {
        var size = closeSizePx(config) + 4;
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'adlab-close adlab-decoy';
        btn.innerHTML = '&times;';
        btn.style.width = size + 'px';
        btn.style.height = size + 'px';
        btn.style.fontSize = Math.round(size * 0.6) + 'px';
        btn.style.opacity = String(Math.max(0.55, 0.98 - index * 0.08));
        btn.style.top = slot.top != null ? slot.top + 'px' : 'auto';
        btn.style.bottom = slot.bottom != null ? slot.bottom + 'px' : 'auto';
        btn.style.right = slot.right != null ? slot.right + 'px' : 'auto';
        btn.style.left = slot.left != null ? slot.left + 'px' : 'auto';
        btn.addEventListener('click', function (e) {
            e.stopPropagation();
            var action = rogue.decoy.action || 'retry';
            if (action === 'empty') return;
            if (action === 'more') { toast('已记录你的偏好，将为你推荐更多此类广告', 'ri-thumb-up-line'); return; }
            btn.classList.remove('adlab-decoy--shake');
            void btn.offsetWidth;
            btn.classList.add('adlab-decoy--shake');
            toast('关闭失败，请稍后再试', 'ri-error-warning-line');
        });
        return btn;
    }

    /* 一次装齐：广告标识 + 真 × + 迷惑 × */
    function decorate(host, config, opts) {
        opts = opts || {};
        var rogue = rogueOf(config);
        var onClose = opts.onClose || function () {};
        if (rogue.badge.enabled && opts.badge !== false) host.appendChild(makeBadge(rogue));

        var tiny = rogue.decoy.enabled && rogue.decoy.tinyReal;
        /* 缩成一粒灰：取配置尺寸和 14px 里小的那个，自定义填了 6px 也不会被放大 */
        var real = makeClose(config, onClose, {
            size: tiny ? Math.min(closeSizePx(config), 14) : (opts.closeSize || 0),
            title: tiny ? '关闭（这个是真的）' : '关闭'
        });
        if (opts.staticClose) {
            real.style.position = 'static';
            real.style.flexShrink = '0';
        } else if (tiny) {
            /* 真 × 缩成一粒灰，缩在右下角 */
            real.style.top = 'auto';
            real.style.right = '8px';
            real.style.bottom = '8px';
            real.style.border = 'none';
            real.style.background = 'rgba(120,120,130,.18)';
            real.style.color = 'rgba(220,221,227,.4)';
        }
        host.appendChild(real);

        if (rogue.decoy.enabled) {
            var slots = tiny ? DECOY_SLOTS_TINY : DECOY_SLOTS_NORMAL;
            /* banner 只有 80 来像素高，堆多了会溢出，最多两个 */
            var max = opts.staticClose ? 2 : slots.length;
            var n = Math.min(Math.max(Number(rogue.decoy.count) || 1, 1), max);
            for (var i = 0; i < n; i++) host.appendChild(makeDecoy(config, rogue, slots[i], i));
        }
        return real;
    }

    function ensureStyle() {
        if (document.getElementById('adlab-style')) return;
        var style = document.createElement('style');
        style.id = 'adlab-style';
        style.textContent = [
            '.adlab-note{font-size:11px;opacity:.66;letter-spacing:.02em;text-align:center;margin-top:8px;}',
            '.adlab-media{max-width:100%;max-height:46vh;border-radius:10px;display:block;margin:0 auto;object-fit:contain;}',
            '.adlab-close{position:absolute;top:10px;right:10px;display:flex;align-items:center;justify-content:center;border-radius:50%;',
            '  border:1px solid rgba(150,150,160,.5);background:rgba(20,22,30,.75);color:#dcdde3;cursor:pointer;line-height:1;padding:0;}',
            '.adlab-close:hover{background:rgba(60,64,78,.9);}',
            '.adlab-badge{position:absolute;top:8px;left:8px;z-index:2;padding:1px 6px;border-radius:3px;pointer-events:none;',
            '  font-weight:700;letter-spacing:.06em;line-height:1.5;background:rgba(120,124,136,.35);color:rgba(255,255,255,.88);}',
            '.adlab-decoy--shake{animation:adlab-decoy-shake .32s ease-in-out;}',
            '@keyframes adlab-decoy-shake{0%,100%{transform:translateX(0)}25%{transform:translateX(-3px)}75%{transform:translateX(3px)}}',
            '.adlab-nope{align-self:flex-start;margin-top:6px;padding:0;border:0;background:none;cursor:pointer;',
            '  color:rgba(200,202,212,.55);font:inherit;font-size:11px;text-decoration:underline dotted;}',
            '.adlab-nope:hover{color:rgba(230,199,138,.95);}',
            '.adlab-cmt{margin-top:10px;padding:8px 0 2px;max-height:30vh;overflow:auto;border-top:1px solid rgba(150,150,160,.25);}',
            '.adlab-cmt-head{font-size:11px;font-weight:700;opacity:.75;margin-bottom:6px;}',
            '.adlab-cmt-row{display:flex;gap:8px;margin-bottom:8px;}',
            '.adlab-cmt-av{width:22px;height:22px;flex:0 0 22px;border-radius:50%;display:flex;align-items:center;',
            '  justify-content:center;font-size:11px;font-weight:700;color:#fff;}',
            '.adlab-cmt-body{flex:1;min-width:0;}',
            '.adlab-cmt-name{font-size:11px;opacity:.7;margin-bottom:1px;}',
            '.adlab-cmt-text{font-size:12px;line-height:1.5;word-break:break-word;}',
            '.adlab-cmt-meta{font-size:10px;opacity:.45;margin-top:1px;}',
            '.adlab-cmt-empty{font-size:12px;opacity:.5;padding:4px 0;}',
            '.adlab-cmt-foot{display:flex;align-items:center;gap:8px;margin-top:4px;font-size:10px;opacity:.5;}',
            '.adlab-cmt-refresh{padding:2px 8px;border-radius:6px;border:1px solid rgba(150,150,160,.45);',
            '  background:none;color:inherit;font:inherit;font-size:10px;cursor:pointer;}',
            '.adlab-toast{position:fixed;left:50%;bottom:32px;transform:translateX(-50%);z-index:9999;padding:9px 16px;',
            '  border-radius:999px;background:rgba(20,22,30,.94);color:#e6e7ec;font-size:.85em;box-shadow:0 8px 24px rgba(0,0,0,.4);}',
            '.adlab-splash .adlab-splash-title,.adlab-popup-card .adlab-splash-title,.adlab-float-card .adlab-splash-title{padding-right:44px;}',
            '.adlab-splash{position:fixed;inset:0;z-index:9998;background:rgba(8,9,14,.9);backdrop-filter:blur(6px);',
            '  display:flex;align-items:center;justify-content:center;animation:adlab-in .25s ease-out;}',
            '.adlab-splash-card{position:relative;width:min(560px,92vw);max-height:88vh;overflow:auto;padding:22px;',
            '  border-radius:0 26px 0 0;background:var(--bg-secondary,#2d303a);border:1px solid rgba(150,150,160,.35);',
            '  box-shadow:0 18px 50px rgba(0,0,0,.55);color:var(--text-primary,#e8eaf0);}',
            '.adlab-splash-title{font-weight:800;font-size:1.1em;margin-bottom:10px;}',
            '.adlab-splash-text{font-size:.92em;line-height:1.6;opacity:.92;white-space:pre-wrap;}',
            '.adlab-popup-mask{position:fixed;inset:0;z-index:9997;background:rgba(0,0,0,.45);',
            '  display:flex;align-items:center;justify-content:center;animation:adlab-in .2s ease-out;}',
            '.adlab-popup-card{position:relative;width:min(420px,92vw);max-height:80vh;overflow:auto;padding:18px;',
            '  border-radius:12px;background:var(--bg-secondary,#2d303a);border:1px solid rgba(150,150,160,.35);',
            '  box-shadow:0 14px 40px rgba(0,0,0,.5);color:var(--text-primary,#e8eaf0);animation:adlab-pop .22s ease-out;}',
            '.adlab-banner{position:relative;z-index:60;display:flex;align-items:center;flex-wrap:wrap;gap:10px;padding:8px 14px;',
            '  margin:10px 10px 0;border-radius:10px;background:var(--bg-secondary,#2d303a);flex:0 0 auto;',
            '  border:1px solid rgba(150,150,160,.3);box-shadow:0 6px 18px rgba(0,0,0,.25);',
            '  color:var(--text-primary,#e8eaf0);animation:adlab-in .3s ease-out;}',
            '.adlab-banner .adlab-media{max-height:56px;max-width:110px;border-radius:6px;}',
            '.adlab-banner .adlab-badge{position:static;order:-1;flex:0 0 auto;}',
            '.adlab-banner .adlab-note{padding-right:18px;}',
            '.adlab-banner-textwrap{flex:1 1 150px;min-width:0;}',
            '.adlab-banner-title{font-weight:700;font-size:.9em;}',
            '.adlab-banner-text{font-size:.8em;opacity:.85;white-space:pre-wrap;}',
            /* 内容广告：故意用虚线边，一眼能看出「这不是真内容」 */
            '.adlab-inline{position:relative;display:flex;align-items:flex-start;gap:12px;padding:12px 14px 12px;',
            '  margin:10px 0;border-radius:12px;background:var(--bg-secondary,#2d303a);',
            '  border:1px dashed rgba(150,150,160,.5);color:var(--text-primary,#e8eaf0);animation:adlab-in .3s ease-out;}',
            /* 标识做成行内小药丸，不再挂在边框上：内容广告可能插在滚动容器第一个，
               top:-8px 的绝对定位会被容器裁掉一半。 */
            '.adlab-inline-tag{align-self:flex-start;padding:1px 7px;border-radius:999px;line-height:1.6;',
            '  font-weight:700;letter-spacing:.08em;background:var(--accent-gold,#e6c78a);color:#1a1c22;}',
            '.adlab-inline-body{flex:1;min-width:0;display:flex;flex-direction:column;gap:6px;padding-right:26px;}',
            '.adlab-inline-media{max-height:130px;max-width:220px;border-radius:8px;object-fit:contain;align-self:flex-start;}',
            '.adlab-inline-title{font-weight:700;font-size:.95em;}',
            '.adlab-inline-text{font-size:.86em;line-height:1.6;opacity:.9;white-space:pre-wrap;}',
            '.adlab-inline .adlab-close{position:absolute;top:8px;right:8px;}',
            '.adlab-inline--message{margin:8px 0;border-radius:14px;}',
            '.adlab-inline--post{margin:0 0 12px;}',
            '.adlab-inline--section{margin:16px 0;}',
            '.adlab-inline--card{margin:0;height:100%;}',
            '.adlab-float{position:fixed;right:18px;bottom:88px;z-index:9996;width:46px;height:46px;border-radius:50%;',
            '  border:1px solid rgba(150,150,160,.45);background:var(--bg-secondary,#2d303a);color:var(--text-primary,#e8eaf0);',
            '  font-weight:800;font-size:15px;cursor:pointer;box-shadow:0 6px 18px rgba(0,0,0,.35);display:flex;',
            '  align-items:center;justify-content:center;}',
            '.adlab-float:hover{transform:scale(1.06);}',
            '.adlab-float-card{position:fixed;right:18px;bottom:142px;z-index:9996;width:min(320px,88vw);max-height:60vh;',
            '  overflow:auto;padding:16px;border-radius:12px;background:var(--bg-secondary,#2d303a);',
            '  border:1px solid rgba(150,150,160,.35);box-shadow:0 12px 32px rgba(0,0,0,.45);',
            '  color:var(--text-primary,#e8eaf0);animation:adlab-pop .2s ease-out;}',
            '.adlab-shake-hint{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:9996;',
            '  padding:8px 16px;border-radius:999px;background:rgba(20,22,30,.9);color:#dcdde3;font-size:.8em;}',
            /* 假头发丝：压在最上层、全层不吃指针事件，所以只脏画面不挡操作 */
            '.adlab-lint{position:fixed;inset:0;z-index:9999;pointer-events:none;overflow:hidden;}',
            '.adlab-lint-hair{position:absolute;pointer-events:none;display:block;',
            '  transform:translate3d(var(--lx,0px),var(--ly,0px),0) rotate(var(--rot,0deg));',
            '  transition:transform .62s cubic-bezier(.22,1.08,.36,1);will-change:transform;}',
            '.adlab-lint-hair>svg{display:block;width:100%;height:auto;filter:blur(.25px);',
            '  animation:adlab-lint-drift 11s ease-in-out infinite alternate;}',
            '.adlab-nest{animation:adlab-nest-in .2s ease-out;}',
            '@keyframes adlab-lint-drift{from{transform:translate(0,0)}to{transform:translate(3px,-4px)}}',
            '@keyframes adlab-nest-in{from{opacity:.35;transform:scale(.96)}to{opacity:1;transform:none}}',
            '@keyframes adlab-in{from{opacity:0}to{opacity:1}}',
            '@keyframes adlab-pop{from{opacity:0;transform:translateY(14px) scale(.97)}to{opacity:1;transform:none}}'
        ].join('');
        document.head.appendChild(style);
    }

    /* ---------------- 评论区 / 水军 ----------------
       水军是纯字符串随机拼装：昵称两段词根组合，正文从话术池里抽。
       不调用任何模型，不花 token —— 毕竟没人想边被折磨边烧钱。 */

    var SHILL_HEAD = ['夜', '风', '海', '雪', '小', '阿', '老', '甜', '孤', '晚', '南', '北', '木', '想吃', '爱睡', '一只'];
    var SHILL_TAIL = ['行者', '旅人', '达人', '君', '酱', '同学', '不困', '的猫', '一刀', '了', '酱紫', '的兔子', '_233', '2019', '不吃香菜'];
    var SHILL_LINES = [
        '已经买了，孩子很喜欢',
        '蹲个链接',
        '在哪里买？在线等，挺急的',
        '第三次回购了，闭眼冲',
        '我妈用了都说好',
        '这不比隔壁强？',
        '只有我一个人觉得有点贵吗',
        '刚下单，坐等到货',
        '我朋友用了三个月，确实可以',
        '评论区都是托吧',
        '楼上说得对',
        '楼主好人一生平安',
        '求链接 +1',
        '笑死，这广告我居然看完了',
        '用过才知道，真香',
        '已转发到家族群'
    ];
    var SHILL_TIMES = ['刚刚', '2 分钟前', '8 分钟前', '21 分钟前', '1 小时前', '3 小时前', '昨天', '前天'];

    function rand(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

    function cmtOf(ad) {
        var d = { enabled: false, count: 4, shills: false, pool: '' };
        var c = ad.cmt || {};
        return {
            enabled: !!c.enabled,
            count: Math.min(Math.max(Number(c.count) || 4, 1), 12),
            shills: !!c.shills,
            pool: c.pool || d.pool
        };
    }

    function shillPoolOf(cmt) {
        var custom = String(cmt.pool || '').split('\n').map(function (s) { return s.trim(); })
            .filter(function (s) { return s.length; });
        return custom.length ? custom : SHILL_LINES;
    }

    function makeShillRow(pool) {
        var name = rand(SHILL_HEAD) + rand(SHILL_TAIL)
            + (Math.random() < 0.35 ? String(Math.floor(Math.random() * 99)) : '');
        var row = document.createElement('div');
        row.className = 'adlab-cmt-row';

        var av = document.createElement('div');
        av.className = 'adlab-cmt-av';
        av.textContent = name.slice(0, 1);
        av.style.background = 'hsl(' + Math.floor(Math.random() * 360) + ',38%,42%)';
        row.appendChild(av);

        var body = document.createElement('div');
        body.className = 'adlab-cmt-body';
        var nm = document.createElement('div');
        nm.className = 'adlab-cmt-name';
        nm.textContent = name;
        var tx = document.createElement('div');
        tx.className = 'adlab-cmt-text';
        tx.textContent = rand(pool);
        var meta = document.createElement('div');
        meta.className = 'adlab-cmt-meta';
        meta.textContent = rand(SHILL_TIMES) + ' · 赞 ' + Math.floor(Math.random() * 900);
        body.appendChild(nm); body.appendChild(tx); body.appendChild(meta);
        row.appendChild(body);
        return row;
    }

    function buildComments(config, ad) {
        var cmt = cmtOf(ad);
        if (!cmt.enabled) return null;
        var box = document.createElement('div');
        box.className = 'adlab-cmt';
        var head = document.createElement('div');
        head.className = 'adlab-cmt-head';
        box.appendChild(head);
        var list = document.createElement('div');
        list.className = 'adlab-cmt-list';
        box.appendChild(list);

        function fill() {
            list.innerHTML = '';
            if (!cmt.shills) {
                head.textContent = '评论 0';
                var empty = document.createElement('div');
                empty.className = 'adlab-cmt-empty';
                empty.textContent = '还没有评论，来抢沙发';
                list.appendChild(empty);
                return;
            }
            head.textContent = '评论 ' + (26 + Math.floor(Math.random() * 2400));
            var pool = shillPoolOf(cmt);
            for (var i = 0; i < cmt.count; i++) list.appendChild(makeShillRow(pool));
        }
        fill();

        var foot = document.createElement('div');
        foot.className = 'adlab-cmt-foot';
        var refresh = document.createElement('button');
        refresh.type = 'button';
        refresh.className = 'adlab-cmt-refresh';
        refresh.textContent = '换一批';
        refresh.addEventListener('click', function (e) { e.stopPropagation(); fill(); });
        foot.appendChild(refresh);
        var tip = document.createElement('span');
        tip.textContent = '水军是本地脚本随机拼的，没花一个 token';
        foot.appendChild(tip);
        box.appendChild(foot);
        return box;
    }

    /* ---------------- 不感兴趣 ----------------
       effect=more 时：记录次数（权重 ×5）、关掉、2.6 秒后自己弹回来。 */

    function makeNope(config, ad, adType, onHide) {
        var rogue = rogueOf(config);
        if (!rogue.nope.enabled) return null;
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'adlab-nope';
        btn.textContent = '不感兴趣';
        btn.addEventListener('click', function (e) {
            e.stopPropagation();
            var more = rogue.nope.effect !== 'less';
            ad.notInterested = (Number(ad.notInterested) || 0) + 1;
            bumpNope(ad.id);
            if (more) toast('已记录，我们会为你推荐更多此类内容', 'ri-thumb-up-line');
            else toast('将减少此类内容', 'ri-thumb-down-line');
            onHide();
            if (!more || !adType) return;
            setTimeout(function () {
                var cfg = loadConfig();
                var again = pickAd(cfg, adType) || ad;
                var fn = SHOWERS[adType];
                if (fn) fn(cfg, again);
            }, 2600);
        });
        return btn;
    }

    function bumpNope(id) {
        if (!id) return;
        var config = loadConfig();
        var ad = (config.ads || []).filter(function (a) { return a.id === id; })[0];
        if (!ad) return;
        ad.notInterested = (Number(ad.notInterested) || 0) + 1;
        saveConfig(config);
    }

    /* ---------------- 跳转套娃 ----------------
       点掉一个弹窗，70ms 后在同一层再弹一个；× 每层小 3px、卡片位置随机偏一点。
       「真的无限」时不设上限，但第 12 层强制放行 —— 实验归实验，不能真把人锁死。
       任何时候按 Esc 一次性关干净。 */

    var nestRunId = 0;

    /* 用户一条广告都没配时，套娃也得有东西可套。这几条是照着国产信息流广告写的。 */
    var NEST_FAKE = [
        { title: '手机内存不足 98%', text: '检测到 3 个应用正在后台偷跑流量，立即清理可提速 2.3 倍。' },
        { title: '恭喜获得一次抽奖机会', text: '你是今天第 128,441 位访客，点击领取 88 元现金红包。' },
        { title: 'WiFi 已连接，但无法上网？', text: '网络诊断显示你的路由器存在 4 处安全隐患。' },
        { title: '本地 3 公里有 1 位用户想认识你', text: '对方刚刚查看了你的主页，回复即可查看是谁。' },
        { title: '电池温度偏高', text: '当前 41.6°C，建议开启省电模式并关闭 7 个后台应用。' },
        { title: '你已连续使用 2 小时', text: '眼科医生建议每 40 分钟远眺一次，点击领取护眼模式。' }
    ];

    function nestFakeAd(depth) {
        var f = NEST_FAKE[(depth - 1) % NEST_FAKE.length];
        return { id: 'nest-fake', title: f.title, text: f.text, types: ['popup'], scenes: [], enabled: true };
    }

    function scheduleNest(config, state) {
        if (!state || state.runId !== nestRunId) return;
        var rogue = rogueOf(config);
        if (!rogue.nest.enabled) return;

        var depth = (state.depth || 0) + 1;
        var max = rogue.nest.endless ? 99 : Math.min(Math.max(Number(rogue.nest.count) || 4, 1), 9);
        if (depth > max) return;                       // 层数到了，这次是真的关掉了
        if (depth > 12) {                              // 无限模式下的硬闸
            toast('关到第 12 层了，系统都不好意思再拦你', 'ri-emotion-laugh-line');
            return;
        }

        /* 优先复用你配的弹窗广告；一条都没有就用内置的那几句 */
        var next = pickAd(config, 'popup') || pickAd(config, 'splash') || nestFakeAd(depth);

        setTimeout(function () {
            if (state.runId !== nestRunId) return;
            showCard(config, next, 'popup', { depth: depth, runId: state.runId });
        }, 70);
    }

    function abortNest() {
        nestRunId++;
        var masks = document.querySelectorAll('.adlab-popup-mask,.adlab-splash');
        if (!masks.length) return;
        Array.prototype.forEach.call(masks, function (m) { m.remove(); });
    }

    /* ---------------- 五种广告形式 ---------------- */

    function showCard(config, ad, type, nest) {
        ensureStyle();
        var splash = type === 'splash';
        var mask = document.createElement('div');
        mask.className = splash ? 'adlab-splash' : 'adlab-popup-mask';
        var card = document.createElement('div');
        card.className = splash ? 'adlab-splash-card' : 'adlab-popup-card';
        var nestOn = !!(nest && rogueOf(config).nest.enabled);
        if (nestOn && nest.depth) card.classList.add('adlab-nest');
        var close = function () {
            mask.remove();
            if (nestOn) scheduleNest(config, nest);
        };

        /* 越往后 × 越小 —— 现实里就是这么一点点把人逼疯的 */
        var closePx = (nest && nest.depth) ? Math.max(12, closeSizePx(config) - nest.depth * 3) : 0;
        decorate(card, config, { onClose: close, closeSize: closePx });
        if (nest && nest.depth) {
            /* 每层错开一点位置，看起来像「又从别处挤出来一个」 */
            card.style.margin = Math.round(Math.random() * 44 - 22) + 'px '
                + Math.round(Math.random() * 64 - 32) + 'px';
        }
        if (ad.title) {
            var t = document.createElement('div');
            t.className = 'adlab-splash-title';
            t.textContent = ad.title;
            card.appendChild(t);
        }
        /* 占位再异步塞素材，保证图文顺序不乱 */
        var slot = document.createElement('div');
        card.appendChild(slot);
        buildMedia(ad).then(function (media) { if (media) slot.appendChild(media); });
        if (ad.text) {
            var p = document.createElement('div');
            p.className = 'adlab-splash-text';
            p.textContent = ad.text;
            card.appendChild(p);
        }
        var cmt = buildComments(config, ad);
        if (cmt) card.appendChild(cmt);
        var nope = makeNope(config, ad, type, close);
        if (nope) card.appendChild(nope);
        card.appendChild(makeNote());

        mask.appendChild(card);
        /* 点遮罩也算关闭：真实垃圾广告里，点哪儿都是「再来一个」 */
        mask.addEventListener('click', function (e) { if (e.target === mask) close(); });
        document.body.appendChild(mask);
    }

    function showSplash(config, ad) { showCard(config, ad, 'splash'); }
    function showPopup(config, ad) { showCard(config, ad, 'popup', { depth: 0, runId: nestRunId }); }

    function showBanner(config, ad) {
        ensureStyle();
        if (document.querySelector('.adlab-banner')) return;
        var bar = document.createElement('div');
        bar.className = 'adlab-banner';
        var remove = function () { bar.remove(); };
        var textWrap = document.createElement('div');
        textWrap.className = 'adlab-banner-textwrap';
        if (ad.title) {
            var t = document.createElement('div');
            t.className = 'adlab-banner-title';
            t.textContent = ad.title;
            textWrap.appendChild(t);
        }
        if (ad.text) {
            var p = document.createElement('div');
            p.className = 'adlab-banner-text';
            p.textContent = ad.text;
            textWrap.appendChild(p);
        }
        bar.appendChild(textWrap);
        buildMedia(ad).then(function (media) { if (media) bar.insertBefore(media, bar.firstChild); });
        decorate(bar, config, { onClose: remove, staticClose: true });

        var nope = makeNope(config, ad, 'banner', remove);
        if (nope) { nope.style.marginTop = '0'; nope.style.flexShrink = '0'; bar.appendChild(nope); }
        var note = makeNote();
        note.style.marginTop = '0';
        note.style.flexShrink = '0';
        bar.appendChild(note);
        // 主站插在聊天区顶部，论坛插在品牌区，其它页面插到 body 开头
        var host = document.querySelector('.chat-area')
            || (document.querySelector('.forum-brand') && document.querySelector('.forum-brand').parentElement)
            || document.body;
        host.insertBefore(bar, host.firstChild);
    }

    function openFloatCard(config) {
        var existing = document.querySelector('.adlab-float-card');
        if (existing) { existing.remove(); return; }
        var ad = pickAd(config, 'float');
        var card = document.createElement('div');
        card.className = 'adlab-float-card';
        var remove = function () { card.remove(); };
        decorate(card, config, { onClose: remove });
        if (!ad) {
            var empty = document.createElement('div');
            empty.className = 'adlab-splash-text';
            empty.textContent = '还没配置适用于「浮标」的广告，或当前场景没有启用的广告。';
            card.appendChild(empty);
        } else {
            if (ad.title) {
                var t = document.createElement('div');
                t.className = 'adlab-splash-title';
                t.textContent = ad.title;
                card.appendChild(t);
            }
            var slot = document.createElement('div');
            card.appendChild(slot);
            buildMedia(ad).then(function (media) { if (media) slot.appendChild(media); });
            if (ad.text) {
                var p = document.createElement('div');
                p.className = 'adlab-splash-text';
                p.textContent = ad.text;
                card.appendChild(p);
            }
            var cmt = buildComments(config, ad);
            if (cmt) card.appendChild(cmt);
            var nope = makeNope(config, ad, 'float', remove);
            if (nope) card.appendChild(nope);
        }
        card.appendChild(makeNote());
        document.body.appendChild(card);
    }

    function showFloat(config) {
        ensureStyle();
        if (document.querySelector('.adlab-float')) return;
        var fab = document.createElement('button');
        fab.type = 'button';
        fab.className = 'adlab-float';
        fab.title = '广告跳跳乐（实验室模拟）';
        fab.textContent = 'AD';
        fab.addEventListener('click', function () { openFloatCard(loadConfig()); });
        document.body.appendChild(fab);
    }

    /* ---------------- 假头发丝：屏幕脏了的错觉 ----------------
       画在固定层上、pointer-events 全关，所以不挡任何点击。
       「擦」用 document 级 pointermove 算指针到发丝中心的距离：
       近了就把发丝往反方向推开（跟手），130ms 没有新的移动就松手弹回原位。
       因为它永远弹回、也永远不消失，所以怎么擦都擦不掉。 */

    /* 每根发丝的主丝 + 分叉，viewBox 160×80。真实头发不会是单根直线，
       都会在半路分出一两根更细的岔。 */
    var LINT_SHAPES = [
        { w: 1.4, d: ['M4 62 C 30 28, 52 76, 78 44 S 128 24, 156 40',
                       'M78 44 C 88 34, 100 30, 112 22'] },
        { w: 1.3, d: ['M6 24 C 34 52, 58 18, 84 42 S 132 66, 158 52',
                       'M84 42 C 94 52, 104 58, 116 66'] },
        { w: 1.5, d: ['M2 40 C 26 12, 48 66, 74 38 S 126 10, 158 30'] },
        { w: 1.25, d: ['M8 70 C 28 46, 50 82, 76 50 S 124 34, 152 48',
                       'M76 50 C 88 44, 98 46, 108 40'] },
        { w: 1.45, d: ['M4 16 C 32 34, 54 8, 80 30 S 130 54, 160 44',
                       'M30 30 C 38 40, 44 48, 50 58'] }
    ];

    var LINT_ZONES = [
        { left: 2,  top: 6 },  { left: 66, top: 4 },  { left: 4,  top: 64 },
        { left: 68, top: 60 }, { left: 28, top: 2 },  { left: 56, top: 74 },
        { left: 12, top: 36 }, { left: 74, top: 32 }
    ];

    var LINT_ALPHA = { light: 0.12, medium: 0.17, strong: 0.25 };

    function spawnLint(config) {
        var rogue = rogueOf(config);
        if (!rogue.lint || !rogue.lint.enabled) return;
        if (document.querySelector('.adlab-lint')) return;
        ensureStyle();

        var layer = document.createElement('div');
        layer.className = 'adlab-lint';
        layer.setAttribute('aria-hidden', 'true');

        var n = Math.min(Math.max(Number(rogue.lint.count) || 3, 1), 6);
        var alpha = LINT_ALPHA[rogue.lint.strength] || LINT_ALPHA.medium;
        var zones = LINT_ZONES.slice();
        /* 洗牌，保证根数少的时候不会全挤在同一侧 */
        for (var z = zones.length - 1; z > 0; z--) {
            var j = Math.floor(Math.random() * (z + 1));
            var tmp = zones[z]; zones[z] = zones[j]; zones[j] = tmp;
        }

        for (var i = 0; i < n; i++) {
            layer.appendChild(makeLintHair(LINT_SHAPES[i % LINT_SHAPES.length], zones[i % zones.length], alpha, i));
        }

        document.body.appendChild(layer);
        bindLint(layer);
    }

    function makeLintHair(shape, zone, alpha, index) {
        var NS = 'http://www.w3.org/2000/svg';
        var wrap = document.createElement('div');
        wrap.className = 'adlab-lint-hair';
        wrap.style.left = (zone.left + (Math.random() * 8 - 4)) + '%';
        wrap.style.top = (zone.top + (Math.random() * 10 - 5)) + '%';
        wrap.style.width = Math.round(96 + Math.random() * 92) + 'px';
        wrap.style.setProperty('--rot', (Math.random() * 54 - 27).toFixed(1) + 'deg');
        /* 每根错开一点，别让它们同步呼吸 */
        wrap.style.animationDelay = (-index * 1.7).toFixed(1) + 's';

        var svg = document.createElementNS(NS, 'svg');
        svg.setAttribute('viewBox', '0 0 160 80');
        svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');

        shape.d.forEach(function (d) {
            /* 两层描边：先画一道更宽的黑影，再画白丝。
               黑影让它在浅色背景上「陷」下去，白丝让它在深色背景上「浮」起来，
               所以换主题都像贴在玻璃表面的一点脏东西，而不是画在页面里的装饰线。 */
            var back = document.createElementNS(NS, 'path');
            back.setAttribute('d', d);
            back.setAttribute('fill', 'none');
            back.setAttribute('stroke', 'rgba(0,0,0,' + (alpha * 0.5).toFixed(3) + ')');
            back.setAttribute('stroke-width', (shape.w + 2.3).toFixed(2));
            back.setAttribute('stroke-linecap', 'round');
            back.setAttribute('transform', 'translate(.9 1.3)');
            svg.appendChild(back);

            var front = document.createElementNS(NS, 'path');
            front.setAttribute('d', d);
            front.setAttribute('fill', 'none');
            front.setAttribute('stroke', 'rgba(255,252,244,' + alpha.toFixed(3) + ')');
            front.setAttribute('stroke-width', shape.w.toFixed(2));
            front.setAttribute('stroke-linecap', 'round');
            svg.appendChild(front);
        });

        wrap.appendChild(svg);
        return wrap;
    }

    function bindLint(layer) {
        var hairs = Array.prototype.slice.call(layer.querySelectorAll('.adlab-lint-hair'));
        var meta = hairs.map(function (el) { return { el: el, cx: 0, cy: 0, timer: 0 }; });

        /* 用 offsetLeft/Top 而不是 getBoundingClientRect：
           rect 会被 transform 带跑，推开之后中心点跟着漂，推一下就会越推越远。 */
        function measure() {
            meta.forEach(function (m) {
                m.cx = m.el.offsetLeft + m.el.offsetWidth / 2;
                m.cy = m.el.offsetTop + m.el.offsetHeight / 2;
            });
        }
        measure();
        window.addEventListener('resize', measure);

        var pending = false, last = null;
        document.addEventListener('pointermove', function (e) {
            last = e;
            if (pending) return;
            pending = true;
            requestAnimationFrame(function () {
                pending = false;
                if (!last) return;
                var R = 118;
                meta.forEach(function (m) {
                    var dx = last.clientX - m.cx;
                    var dy = last.clientY - m.cy;
                    var d = Math.sqrt(dx * dx + dy * dy) || 1;
                    if (d >= R) return;
                    var p = 1 - d / R;                  // 越靠近，推得越开
                    var push = p * p * 34;
                    m.el.style.transition = 'none';
                    m.el.style.setProperty('--lx', (-dx / d * push).toFixed(1) + 'px');
                    m.el.style.setProperty('--ly', (-dy / d * push).toFixed(1) + 'px');
                    clearTimeout(m.timer);
                    m.timer = setTimeout(function () {
                        /* 松手：把 transition 装回去再归零，于是有弹回的手感 */
                        m.el.style.transition = '';
                        m.el.style.setProperty('--lx', '0px');
                        m.el.style.setProperty('--ly', '0px');
                    }, 130);
                });
            });
        }, { passive: true });
    }

    function clearLint() {
        var layer = document.querySelector('.adlab-lint');
        if (layer) layer.remove();
    }

    var SHOWERS = { splash: showSplash, popup: showPopup, banner: showBanner, float: openFloatCard, inline: showInline };


    /* ---- 摇一摇 ---- */
    var lastShakeAt = 0;

    function triggerShake() {
        var now = Date.now();
        if (now - lastShakeAt < 8000) return;   // 节流：8 秒最多来一次
        lastShakeAt = now;
        var config = loadConfig();
        if (!config.enabled || !config.types.shake) return;
        var ad = pickAd(config, 'shake');
        ensureStyle();
        if (!ad) {
            var hint = document.createElement('div');
            hint.className = 'adlab-shake-hint';
            hint.textContent = '摇到了！但还没有适用于「摇一摇」的广告';
            document.body.appendChild(hint);
            setTimeout(function () { hint.remove(); }, 2200);
            return;
        }
        showPopup(config, ad);
    }

    function bindShake() {
        if (typeof DeviceMotionEvent === 'undefined') return;
        var prev = null;
        window.addEventListener('devicemotion', function (event) {
            var acc = event.accelerationIncludingGravity;
            if (!acc || acc.x == null) return;
            var mag = Math.sqrt(acc.x * acc.x + acc.y * acc.y + acc.z * acc.z);
            if (prev !== null && Math.abs(mag - prev) > 26) triggerShake();
            prev = mag;
        }, { passive: true });
    }

    /* ---------------- 引擎启动 ---------------- */

    var started = false;

    /* ---------------- 内容广告（混进内容流） ----------------
       开屏 / 弹窗 / banner 都是浮在页面之上；在论坛、插件市场这种列表页里，
       浮层要么盖住内容、要么被当成弹窗直接关掉。
       内容广告反过来做：长得就像一个列表项，插在真实条目之间。
       每个页面各取一处插入点，一页只插一条。 */
    var INLINE_SLOTS = {
        main:   { host: '.chat-messages', items: '.message',      after: 0, kind: 'message' },
        forum:  { host: '#forum-content', items: '.post-card',    after: 1, kind: 'post' },
        docs:   { host: '.docs-main',     items: 'h2',            after: 1, kind: 'section' },
        market: { host: '.plugin-grid',   items: '.plugin-card',  after: 2, kind: 'card' }
    };

    function buildInline(config, ad, kind) {
        var wrap = document.createElement('div');
        wrap.className = 'adlab-inline adlab-inline--' + kind;
        var rogue = rogueOf(config);

        var body = document.createElement('div');
        body.className = 'adlab-inline-body';
        if (rogue.badge.enabled) {
            var tag = document.createElement('span');
            tag.className = 'adlab-inline-tag';
            tag.textContent = rogue.badge.text || '广告';
            tag.style.fontSize = (Number(rogue.badge.size) || 10) + 'px';
            body.appendChild(tag);
        }
        if (ad.title) {
            var t = document.createElement('div');
            t.className = 'adlab-inline-title';
            t.textContent = ad.title;
            body.appendChild(t);
        }
        if (ad.text) {
            var p = document.createElement('div');
            p.className = 'adlab-inline-text';
            p.textContent = ad.text;
            body.appendChild(p);
        }
        wrap.appendChild(body);

        buildMedia(ad).then(function (media) {
            if (!media) return;
            media.classList.add('adlab-inline-media');
            body.insertBefore(media, body.firstChild);
        });

        /* 内容广告也能带评论区 —— 一个帖子底下 3000 条"我妈用了都说好" */
        var cmt = buildComments(config, ad);
        if (cmt) body.appendChild(cmt);
        var closeInline = function () { inlineState.closed = true; wrap.remove(); };
        var nope = makeNope(config, ad, 'inline', closeInline);
        if (nope) body.appendChild(nope);

        decorate(wrap, config, { onClose: closeInline, badge: false });
        return wrap;
    }

    function showInline(config, ad, fallback) {
        var slot = INLINE_SLOTS[currentSceneKey()];
        if (!slot) return false;
        var host = document.querySelector(slot.host);
        if (!host) return false;
        if (host.querySelector('.adlab-inline')) return true;   // 一页只插一条
        var items = host.querySelectorAll(slot.items);
        if (!items.length && !fallback) return false;           // 先等列表渲染出来
        ensureStyle();
        var el = buildInline(config, ad, slot.kind);
        if (!items.length) {
            /* 列表一直是空的（新会话 / 空论坛 / 被筛选空了）：插最前面，
               总比开了却什么都没有强 */
            host.insertBefore(el, host.firstChild);
        } else {
            /* 插到「锚点自己的父容器」里，而不是 host：文档的 h2 常常嵌在
               .docs-section 这类子容器中，直接拿 nextSibling 插到 host 会抛
               insertBefore 的 Not a child 错误。 */
            var idx = Math.min(slot.after, items.length - 1);
            var anchor = items[idx];
            anchor.parentNode.insertBefore(el, anchor.nextSibling);
        }
        inlineState.closed = false;
        return true;
    }

    // 论坛 / 插件市场的列表是 JS 渲染的，启动时容器还不存在 —— 轮询等它出现
    function waitForInline(config, ad, tries) {
        tries = tries || 0;
        if (showInline(config, ad, tries >= 8)) { keepInline(); return; }
        if (tries > 150) return;    // 大约 8 分钟还没等到就放弃
        /* 前 20 秒查得勤一点，之后慢速守着（切到聊天页 / 帖子列表才渲染出来的容器） */
        var wait = tries < 50 ? 400 : 3000;
        setTimeout(function () { waitForInline(config, ad, tries + 1); }, wait);
    }

    /* 论坛切分类、插件市场换筛选时会把列表 innerHTML 整个重刷，
       插进去的那条广告也就跟着没了。盯着宿主节点，没了就补一条回来。
       用户自己点 × 关掉的（closed=true）不补，最多补 12 次防死循环。 */
    var inlineState = { closed: false, observer: null, attempts: 0, timer: null };

    function keepInline() {
        if (inlineState.observer || typeof MutationObserver === 'undefined') return;
        var slot = INLINE_SLOTS[currentSceneKey()];
        if (!slot) return;
        var host = document.querySelector(slot.host);
        if (!host) return;
        inlineState.observer = new MutationObserver(function () {
            if (inlineState.closed || inlineState.attempts >= 12) return;
            if (document.querySelector('.adlab-inline')) return;
            clearTimeout(inlineState.timer);
            inlineState.timer = setTimeout(function () {
                if (inlineState.closed || document.querySelector('.adlab-inline')) return;
                var cfg = loadConfig();
                if (!cfg.enabled || !cfg.types.inline) return;
                var ad = pickAd(cfg, 'inline');
                if (!ad) return;
                inlineState.attempts++;
                showInline(cfg, ad);
            }, 350);
        });
        inlineState.observer.observe(host, { childList: true, subtree: true });
    }

    function start() {
        var config = loadConfig();
        if (started) return;
        if (!config.enabled) return;
        var scene = currentSceneKey();
        if (!scene || !config.scenes[scene]) return;
        started = true;
        ensureStyle();
        bindShake();
        if (config.types.splash) {
            var splashAd = pickAd(config, 'splash');
            if (splashAd) setTimeout(function () { showSplash(config, splashAd); }, 600);
        }
        if (config.types.banner) {
            var bannerAd = pickAd(config, 'banner');
            if (bannerAd) setTimeout(function () { showBanner(config, bannerAd); }, 1200);
        }
        if (config.types.popup) {
            // 每个会话只自动弹一次；间隔可配
            var mark = 'adlab-popup-' + scene;
            var delay = Math.max(5, Number(config.popupDelaySec) || 30);
            try {
                if (!sessionStorage.getItem(mark)) {
                    sessionStorage.setItem(mark, '1');
                    setTimeout(function () {
                        var ad = pickAd(loadConfig(), 'popup');
                        if (ad) showPopup(loadConfig(), ad);
                    }, delay * 1000);
                }
            } catch (e) { /* 隐私模式没有 sessionStorage，就每次都弹 */ }
        }
        if (config.types.float) showFloat(config);
        /* 头发丝晚一点再出现：先让你看两秒干净屏幕，再慢慢觉得「咦怎么有根头发」 */
        if (rogueOf(config).lint.enabled) setTimeout(function () { spawnLint(loadConfig()); }, 1500);
        if (config.types.inline) {
            var inlineAd = pickAd(config, 'inline');
            if (inlineAd) setTimeout(function () { waitForInline(loadConfig(), inlineAd); }, 900);
        }
    }

    /* ---------------- 管理界面 ---------------- */

    var MANAGE_CSS = [
        '.adlab-mg{font-size:.9em;}',
        '.adlab-mg h4{margin:14px 0 8px;color:var(--accent-gold,#e6c78a);}',
        '.adlab-mg .adlab-chips{display:flex;flex-wrap:wrap;gap:8px;}',
        '.adlab-mg .adlab-chip{display:flex;align-items:center;gap:6px;padding:5px 10px;border:1px solid rgba(150,150,160,.45);',
        '  border-radius:999px;cursor:pointer;font-size:.85em;}',
        '.adlab-mg .adlab-chip input{width:auto;margin:0;}',
        '.adlab-mg .adlab-ad{border:1px solid rgba(150,150,160,.4);border-radius:10px;padding:12px;margin-bottom:10px;}',
        '.adlab-mg .adlab-ad-head{display:flex;align-items:center;gap:8px;margin-bottom:8px;}',
        '.adlab-mg .adlab-ad-head b{flex:1;}',
        '.adlab-mg .adlab-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:6px 0;}',
        '.adlab-mg input[type=text],.adlab-mg textarea{background:var(--ui-field-bg,#383b45);color:var(--ui-field-text,#eee);',
        '  border:1px solid var(--ui-field-border,#454a57);border-radius:8px;padding:7px 10px;}',
        '.adlab-mg textarea{width:100%;min-height:52px;resize:vertical;}',
        '.adlab-mg .adlab-thumb{max-height:52px;max-width:90px;border-radius:6px;}',
        '.adlab-mg .adlab-mini{padding:4px 8px;font-size:.78em;border-radius:7px;border:1px solid rgba(150,150,160,.45);',
        '  background:transparent;color:inherit;cursor:pointer;}',
        '.adlab-mg .adlab-mini:hover{border-color:var(--accent-gold,#e6c78a);}',
        '.adlab-mg .adlab-typecheck{display:flex;flex-wrap:wrap;gap:6px;margin:6px 0;}',
        '.adlab-mg .adlab-rogue{padding:10px 12px;margin:4px 0 6px;border:1px dashed rgba(150,150,160,.45);border-radius:10px;}',
        '.adlab-mg .adlab-rogue-row{gap:10px;align-items:center;}',
        '.adlab-mg .adlab-rogue-row>b{min-width:66px;font-size:.85em;}',
        '.adlab-mg .adlab-rogue-row input[type=number]{width:62px;padding:5px 7px;}',
        '.adlab-mg .adlab-tip{margin:2px 0 10px;font-size:.78em;line-height:1.55;opacity:.6;}',
        '.adlab-mg .adlab-warn{margin:8px 0 0;font-size:.82em;line-height:1.6;color:#e0a24a;}',
        '.adlab-mg .adlab-warn b{color:#f0b45c;}',
        '.adlab-mg .adlab-diagbox{margin:12px 0 0;padding:10px 12px;border-radius:10px;white-space:pre-wrap;',
        '  background:rgba(0,0,0,.28);font-family:ui-monospace,Menlo,Consolas,monospace;font-size:.78em;line-height:1.7;}',
        '.adlab-mg details{border-top:1px dashed rgba(150,150,160,.35);margin-top:8px;padding-top:6px;}',
        '.adlab-mg summary{cursor:pointer;font-size:.82em;opacity:.75;}',
        '.adlab-mg summary:hover{opacity:1;}'
    ].join('');

    function ensureManageStyle() {
        if (document.getElementById('adlab-manage-style')) return;
        var style = document.createElement('style');
        style.id = 'adlab-manage-style';
        style.textContent = MANAGE_CSS;
        document.head.appendChild(style);
    }

    function chip(label, checked, attr) {
        return '<label class="adlab-chip"><input type="checkbox" ' + attr + (checked ? ' checked' : '') + '>' + label + '</label>';
    }

    function cmtSummary(cmt) {
        if (!cmt.enabled) return '评论区 / 水军（关）';
        return '评论区 / 水军（' + (cmt.shills ? '水军 ' + cmt.count + ' 条' : '开 · 无水军') + '）';
    }

    function roguePx(config) {
        var px = rogueOf(config).closePx;
        return px ? px : '';
    }

    /* 开了某个形式却没有广告勾它 —— 这是「看不到广告」最常见的原因，直接摆在面板上 */
    function missingTypesHint(config) {
        var missing = AD_TYPES.filter(function (t) {
            return config.types[t.key] && countAds(config, t.key) === 0;
        });
        if (!missing.length) return '';
        return '<p class="adlab-warn"><i class="ri-error-warning-line"></i> 这些形式已经开了，但没有任何一条广告勾选它们，等于什么都不会出现：'
            + missing.map(function (t) { return '<b>' + t.label + '</b>'; }).join('、')
            + '。到下面每条广告的「会出现在」里勾上。</p>';
    }

    /* 「开了却看不到」的原因基本就那几个：场景没勾、广告没勾这个形式、
       锚点还没渲染出来。把判断过程直接摊开，省得靠猜。 */
    function diagnose(config) {
        var scene = currentSceneKey();
        var ok = function (v) { return v ? '√' : '×'; };
        var out = [];
        out.push('页面　　：' + location.pathname + '　（' + pageName() + '）');
        out.push('识别场景：' + (scene
            ? SCENES.filter(function (s) { return s.key === scene; })[0].label
            : '未识别 —— 这个页面不投放任何广告'));
        out.push('总开关　：' + ok(config.enabled) + (config.enabled ? '' : '　先去实验室把「广告跳跳乐」打开'));
        if (!scene) return out.join('\n');

        out.push('本页勾选：' + ok(config.scenes[scene]) + (config.scenes[scene] ? '' : '　到「生效场景」里把这一页勾上'));
        out.push('');
        AD_TYPES.forEach(function (t) {
            var n = countAds(config, t.key);
            var raw = typeAds(config, t.key).length;
            var on = !!config.types[t.key];
            var note = '';
            if (on && !n) note = raw ? '　← ' + raw + ' 条被「生效场景」挡掉了' : '　← 没有广告勾选它';
            out.push('　' + t.label + '：形式 ' + ok(on) + '　可用广告 ' + n + ' 条' + note);
        });
        var slot = INLINE_SLOTS[scene];
        if (slot) {
            var host = document.querySelector(slot.host);
            var items = host ? host.querySelectorAll(slot.items) : [];
            out.push('');
            out.push('内容广告锚点：' + slot.host + '　' + ok(!!host)
                + (host ? '　' + slot.items + ' × ' + items.length : '　（容器还没渲染）'));
            out.push('已插入　：' + ok(!!document.querySelector('.adlab-inline')));
        }
        return out.join('\n');
    }

    function openManage() {
        ensureStyle();
        ensureManageStyle();
        var config = loadConfig();
        config.rogue = rogueOf(config);   // 补齐缺字段，避免旧配置里半截对象让面板显示和行为对不上
        var overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.style.zIndex = '3000';
        var box = document.createElement('div');
        box.className = 'modal-content adlab-mg';
        box.style.cssText = 'width:min(680px,94vw);max-height:86vh;';

        function render() {
            /* 注意：config 是本次管理会话的内存对象，只有点「保存」才落盘；
              这里绝不能 loadConfig 回读，否则编辑中的改动会被冲掉 */
            var adsHtml = (config.ads || []).map(function (ad, index) {
                var typeChecks = AD_TYPES.map(function (t) {
                    return chip(t.label, (ad.types || []).indexOf(t.key) >= 0,
                        'data-adlab-ad-type="' + index + '" value="' + t.key + '"');
                }).join('');
                var sceneChecks = SCENES.map(function (s) {
                    return chip(s.label.split('（')[0], (ad.scenes || []).indexOf(s.key) >= 0,
                        'data-adlab-ad-scene="' + index + '" value="' + s.key + '"');
                }).join('');
                var cmt = cmtOf(ad);
                var nopeCount = Number(ad.notInterested) || 0;
                return '<div class="adlab-ad" data-adlab-ad="' + index + '">'
                    + '<div class="adlab-ad-head">'
                    + '<input type="checkbox" data-adlab-ad-enabled="' + index + '"' + (ad.enabled !== false ? ' checked' : '') + ' title="启用">'
                    + '<b>' + (index + 1) + '. ' + (ad.title || '（未命名广告）') + '</b>'
                    + (nopeCount ? '<small style="opacity:.6;" title="被点不感兴趣的次数">👎' + nopeCount + '</small>' : '')
                    + '<button type="button" class="adlab-mini" data-adlab-up="' + index + '">↑</button>'
                    + '<button type="button" class="adlab-mini" data-adlab-down="' + index + '">↓</button>'
                    + '<button type="button" class="adlab-mini" data-adlab-del="' + index + '">删除</button>'
                    + '</div>'
                    + '<div class="adlab-row"><input type="text" data-adlab-ad-title="' + index + '" placeholder="标题" value="' + (ad.title || '').replace(/"/g, '&quot;') + '" style="flex:1;min-width:140px;"></div>'
                    + '<textarea data-adlab-ad-text="' + index + '" placeholder="广告文字（可留空）">' + (ad.text || '') + '</textarea>'
                    + '<div class="adlab-row">'
                    + '<button type="button" class="adlab-mini" data-adlab-img="' + index + '"><i class="ri-image-line"></i> 上传图片</button>'
                    + '<button type="button" class="adlab-mini" data-adlab-video="' + index + '"><i class="ri-video-line"></i> 上传视频</button>'
                    + (ad.mediaId ? '<button type="button" class="adlab-mini" data-adlab-media-clear="' + index + '">移除素材(' + (ad.mediaKind === 'video' ? '视频' : '图片') + ')</button>' : '')
                    + '<span data-adlab-media-info="' + index + '" style="font-size:.78em;opacity:.7;">' + (ad.mediaId ? '已附带' + (ad.mediaKind === 'video' ? '视频' : '图片') : '未附素材（纯文字）') + '</span>'
                    + '</div>'
                    + '<div class="adlab-typecheck"><small style="opacity:.65;width:100%;">会出现在：</small>' + typeChecks + '</div>'
                    + '<div class="adlab-typecheck"><small style="opacity:.65;width:100%;">生效场景：</small>' + sceneChecks + '</div>'
                    + '<details data-adlab-cmt-box="' + index + '"><summary data-adlab-cmt-sum="' + index + '">' + cmtSummary(cmt) + '</summary>'
                    + '<div class="adlab-row">'
                    + '<label class="adlab-chip"><input type="checkbox" data-adlab-cmt="' + index + '"' + (cmt.enabled ? ' checked' : '') + '> 开启评论区</label>'
                    + '<label class="adlab-chip"><input type="checkbox" data-adlab-shill="' + index + '"' + (cmt.shills ? ' checked' : '') + '> 放水军</label>'
                    + '<label style="display:flex;align-items:center;gap:6px;">条数 <input type="number" data-adlab-shill-count="' + index + '" min="1" max="12" value="' + cmt.count + '"></label>'
                    + '</div>'
                    + '<textarea data-adlab-shill-pool="' + index + '" placeholder="水军话术，每行一条。留空用内置那套：已经买了孩子很喜欢 / 蹲个链接 / 我妈用了都说好 ……">' + esc(cmt.pool) + '</textarea>'
                    + '<p class="adlab-tip">水军是纯前端随机拼的，不调模型、不耗 token；「换一批」就是重新抽一遍。</p>'
                    + '</details>'
                    + '</div>';
            }).join('');

            box.innerHTML = ''
                + '<div class="modal-header"><h2 style="font-size:1.15em;">广告跳跳乐</h2></div>'
                + '<div class="modal-body" style="padding:14px 20px;">'
                + '<p class="laboratory-hint" style="margin-top:0;">这是<b>实验室模拟功能</b>：广告全部是你自己配的，只存本机，'
                + '任何模拟广告上都会带小字标注「' + NOTE_TEXT + '」。不接广告联盟、不上报数据。</p>'
                + '<h4>生效的广告形式</h4>'
                + '<div class="adlab-chips">'
                + AD_TYPES.map(function (t) { return chip(t.label + '（' + t.hint + '）', config.types[t.key], 'data-adlab-type="' + t.key + '"'); }).join('')
                + '</div>'
                + missingTypesHint(config)
                + '<h4>生效场景</h4>'
                + (Object.keys(config.scenes).every(function (k) { return k === 'main' || !config.scenes[k]; })
                    ? '<p style="margin:0 0 8px;font-size:.85em;color:#e0a24a;"><i class="ri-error-warning-line"></i> <b>目前只在主站生效</b> —— 论坛 / 文档 / 角色市场都不会出现任何广告，想在那些页面看到就把下面的场景勾上。</p>'
                    : '')
                + '<div class="adlab-chips">'
                + SCENES.map(function (s) { return chip(s.label, config.scenes[s.key], 'data-adlab-scene="' + s.key + '"'); }).join('')
                + '</div>'
                + '<p class="laboratory-hint" style="margin-top:6px;">每条广告还可以在它自己的「生效场景」里单独限定；不勾（留空）= 该广告全场景出现。两层勾选都要通过才会显示。</p>'
                + '<h4>播放设置</h4>'
                + '<div class="adlab-row">'
                + '<label style="display:flex;align-items:center;gap:6px;">顺序 <select data-adlab-order>'
                + '<option value="random"' + (config.order !== 'sequential' ? ' selected' : '') + '>随机</option>'
                + '<option value="sequential"' + (config.order === 'sequential' ? ' selected' : '') + '>按列表依次轮播</option>'
                + '</select></label>'
                + '<label style="display:flex;align-items:center;gap:6px;">弹窗间隔 <input type="number" data-adlab-delay min="5" max="3600" value="' + (config.popupDelaySec || 30) + '" style="width:70px;"> 秒</label>'
                + '</div>'
                + '<h4>流氓设置（阴阳国软）</h4>'
                + '<p class="laboratory-hint" style="margin-top:0;">照着某些国产 App 的祖传手艺抄的。只在本机、只作用于你自己配的广告，勾上就能体验一下被恶心是什么感觉。</p>'
                + '<div class="adlab-rogue">'
                /* 关闭按钮尺寸 */
                + '<div class="adlab-row adlab-rogue-row"><b>关闭按钮</b>'
                + '<label style="display:flex;align-items:center;gap:6px;">预设 <select data-adlab-close>'
                + '<option value="small"' + (config.closeSize === 'small' ? ' selected' : '') + '>小 18px</option>'
                + '<option value="medium"' + (config.closeSize === 'medium' || !config.closeSize ? ' selected' : '') + '>中 26px</option>'
                + '<option value="large"' + (config.closeSize === 'large' ? ' selected' : '') + '>大 38px</option>'
                + '</select></label>'
                + '<label style="display:flex;align-items:center;gap:6px;">自定义 <input type="number" data-adlab-close-px min="6" max="180" step="1" value="' + (roguePx(config)) + '" placeholder="px"> px</label>'
                + '</div>'
                + '<p class="adlab-tip">填了就盖过预设，范围 6–180px。写 6 是个位数像素 —— 现实里很多 App 就喜欢这么干。</p>'
                /* 迷惑 × */
                + '<div class="adlab-row adlab-rogue-row"><b>迷惑 ×</b>'
                + chip('开启', config.rogue.decoy.enabled, 'data-adlab-decoy')
                + '<label style="display:flex;align-items:center;gap:6px;">假 × <input type="number" data-adlab-decoy-count min="1" max="6" value="' + (Number(config.rogue.decoy.count) || 3) + '"> 个</label>'
                + chip('真 × 缩成一粒灰', config.rogue.decoy.tinyReal, 'data-adlab-decoy-tiny')
                + '<label style="display:flex;align-items:center;gap:6px;">点假 × <select data-adlab-decoy-action>'
                + '<option value="retry"' + (config.rogue.decoy.action !== 'empty' && config.rogue.decoy.action !== 'more' ? ' selected' : '') + '>提示「关闭失败」</option>'
                + '<option value="empty"' + (config.rogue.decoy.action === 'empty' ? ' selected' : '') + '>毫无反应</option>'
                + '<option value="more"' + (config.rogue.decoy.action === 'more' ? ' selected' : '') + '>再给你推一条</option>'
                + '</select></label></div>'
                + '<p class="adlab-tip">开了以后广告角上会多出好几个大 ×，全是假的；真的那个开「缩成一粒灰」后最多 14px（填了自定义就取更小的），还半透明。</p>'
                /* 不感兴趣 */
                + '<div class="adlab-row adlab-rogue-row"><b>不感兴趣</b>'
                + chip('显示按钮', config.rogue.nope.enabled, 'data-adlab-nope')
                + '<label style="display:flex;align-items:center;gap:6px;">点完之后 <select data-adlab-nope-effect>'
                + '<option value="more"' + (config.rogue.nope.effect !== 'less' ? ' selected' : '') + '>推荐更多这类</option>'
                + '<option value="less"' + (config.rogue.nope.effect === 'less' ? ' selected' : '') + '>减少这类（正常人）</option>'
                + '</select></label></div>'
                + '<p class="adlab-tip">「推荐更多这类」每点一次，这条广告被抽中的权重 ×5，而且关掉 2.6 秒后自己弹回来 —— 越点越推，B 站同款。</p>'
                /* 广告标识 */
                + '<div class="adlab-row adlab-rogue-row"><b>广告标识</b>'
                + chip('显示', config.rogue.badge.enabled, 'data-adlab-badge')
                + '<label style="display:flex;align-items:center;gap:6px;">字号 <input type="number" data-adlab-badge-size min="8" max="24" value="' + (Number(config.rogue.badge.size) || 10) + '"> px</label>'
                + '<label style="display:flex;align-items:center;gap:6px;">文字 <input type="text" data-adlab-badge-text value="' + esc(config.rogue.badge.text || '广告') + '" style="width:72px;"></label>'
                + '</div>'
                + '<p class="adlab-tip">关掉以后广告上就没有「广告」两个字了。底部那行「' + NOTE_TEXT + '」不受影响，永远在。</p>'
                /* 假头发丝 */
                + '<div class="adlab-row adlab-rogue-row"><b>假头发丝</b>'
                + chip('屏幕上撒几根', config.rogue.lint.enabled, 'data-adlab-lint')
                + '<label style="display:flex;align-items:center;gap:6px;">根数 <input type="number" data-adlab-lint-count min="1" max="6" value="' + (Number(config.rogue.lint.count) || 3) + '"></label>'
                + '<label style="display:flex;align-items:center;gap:6px;">浓度 <select data-adlab-lint-strength>'
                + '<option value="light"' + (config.rogue.lint.strength === 'light' ? ' selected' : '') + '>淡</option>'
                + '<option value="medium"' + (config.rogue.lint.strength === 'medium' || !config.rogue.lint.strength ? ' selected' : '') + '>中</option>'
                + '<option value="strong"' + (config.rogue.lint.strength === 'strong' ? ' selected' : '') + '>浓</option>'
                + '</select></label></div>'
                + '<p class="adlab-tip">全屏常驻的几根半透明发丝。鼠标从旁边划过去，它会被拨开、松手再弹回原位，但永远擦不掉 —— 你就是会忍不住去擦。</p>'
                /* 跳转套娃 */
                + '<div class="adlab-row adlab-rogue-row"><b>跳转套娃</b>'
                + chip('点关闭再弹一个', config.rogue.nest.enabled, 'data-adlab-nest')
                + '<label style="display:flex;align-items:center;gap:6px;">层数 <input type="number" data-adlab-nest-count min="1" max="9" value="' + (Number(config.rogue.nest.count) || 4) + '"></label>'
                + chip('真的无限', config.rogue.nest.endless, 'data-adlab-nest-endless')
                + '</div>'
                + '<p class="adlab-tip">关掉一个，70 毫秒后原地又冒一个，× 每层小 3px、位置还乱偏。默认第 4 层放行；勾「真的无限」会一直套到第 12 层。<b>任何时刻按 Esc 一次全关掉。</b></p>'
                + '</div>'
                + '<h4>广告内容（' + (config.ads || []).length + ' 条）</h4>'
                + (config.ads && config.ads.length ? adsHtml : '<p class="laboratory-hint">还没有广告，点下面「添加一条广告」。</p>')
                + '<button type="button" class="adlab-mini" id="adlab-add"><i class="ri-add-line"></i> 添加一条广告</button>'
                + '<div class="adlab-diagbox" id="adlab-diag" hidden></div>'
                + '</div>'
                + '<div class="modal-footer" style="display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap;padding:14px 20px;">'
                + '<button type="button" class="btn btn-outline btn-sm" id="adlab-diag-btn" title="查一下为什么看不到广告">诊断</button>'
                + '<button type="button" class="btn btn-outline btn-sm" id="adlab-test-shake"><i class="ri-smartphone-line"></i> 立即摇一摇</button>'
                + '<button type="button" class="btn btn-outline btn-sm" id="adlab-test-popup"><i class="ri-window-line"></i> 测试弹窗</button>'
                + '<button type="button" class="btn btn-outline btn-sm" id="adlab-test-inline"><i class="ri-article-line"></i> 测试内容广告</button>'
                + '<button type="button" class="btn btn-outline btn-sm" id="adlab-test-banner"><i class="ri-layout-top-2-line"></i> 测试 banner</button>'
                + '<button type="button" class="btn btn-outline btn-sm" id="adlab-test-splash"><i class="ri-fullscreen-line"></i> 测试开屏</button>'
                + '<button type="button" class="btn btn-primary btn-sm" id="adlab-save"><i class="ri-save-line"></i> 保存</button>'
                + '</div>';

            /* ---- 事件绑定 ---- */
            box.querySelectorAll('[data-adlab-type]').forEach(function (input) {
                input.addEventListener('change', function () { config.types[input.dataset.adlabType] = input.checked; });
            });
            box.querySelectorAll('[data-adlab-scene]').forEach(function (input) {
                input.addEventListener('change', function () {
                    config.scenes[input.dataset.adlabScene] = input.checked;
                    render();   // 场景提示条要跟着变
                });
            });
            var orderSel = box.querySelector('[data-adlab-order]');
            orderSel.addEventListener('change', function () { config.order = orderSel.value; });
            var closeSel = box.querySelector('[data-adlab-close]');
            closeSel.addEventListener('change', function () { config.closeSize = closeSel.value; });
            var delayInput = box.querySelector('[data-adlab-delay]');
            delayInput.addEventListener('change', function () { config.popupDelaySec = Math.max(5, Number(delayInput.value) || 30); });

            /* ---- 流氓设置 ---- */
            var closePxInput = box.querySelector('[data-adlab-close-px]');
            closePxInput.addEventListener('change', function () {
                var v = Number(closePxInput.value);
                config.rogue.closePx = v > 0 ? Math.min(Math.max(Math.round(v), 6), 180) : null;
                closePxInput.value = roguePx(config);
            });
            function bindRogueCheck(attr, apply) {
                box.querySelectorAll('[data-adlab-' + attr + ']').forEach(function (input) {
                    input.addEventListener('change', function () { apply(input.checked); });
                });
            }
            bindRogueCheck('decoy', function (v) { config.rogue.decoy.enabled = v; });
            bindRogueCheck('decoy-tiny', function (v) { config.rogue.decoy.tinyReal = v; });
            bindRogueCheck('nope', function (v) { config.rogue.nope.enabled = v; });
            bindRogueCheck('badge', function (v) { config.rogue.badge.enabled = v; });
            var decoyCount = box.querySelector('[data-adlab-decoy-count]');
            decoyCount.addEventListener('change', function () {
                config.rogue.decoy.count = Math.min(Math.max(Number(decoyCount.value) || 3, 1), 6);
                decoyCount.value = config.rogue.decoy.count;
            });
            var decoyAction = box.querySelector('[data-adlab-decoy-action]');
            decoyAction.addEventListener('change', function () { config.rogue.decoy.action = decoyAction.value; });
            var nopeEffect = box.querySelector('[data-adlab-nope-effect]');
            nopeEffect.addEventListener('change', function () { config.rogue.nope.effect = nopeEffect.value; });
            var badgeSize = box.querySelector('[data-adlab-badge-size]');
            badgeSize.addEventListener('change', function () {
                config.rogue.badge.size = Math.min(Math.max(Number(badgeSize.value) || 10, 8), 24);
                badgeSize.value = config.rogue.badge.size;
            });
            var badgeText = box.querySelector('[data-adlab-badge-text]');
            badgeText.addEventListener('change', function () { config.rogue.badge.text = badgeText.value || '广告'; });

            /* 假头发丝：改完立刻重画，不用等保存 */
            bindRogueCheck('lint', function (v) {
                config.rogue.lint.enabled = v;
                clearLint();
                if (v) spawnLint(config);
            });
            var lintCount = box.querySelector('[data-adlab-lint-count]');
            lintCount.addEventListener('change', function () {
                config.rogue.lint.count = Math.min(Math.max(Number(lintCount.value) || 3, 1), 6);
                lintCount.value = config.rogue.lint.count;
                clearLint();
                if (config.rogue.lint.enabled) spawnLint(config);
            });
            var lintStrength = box.querySelector('[data-adlab-lint-strength]');
            lintStrength.addEventListener('change', function () {
                config.rogue.lint.strength = lintStrength.value;
                clearLint();
                if (config.rogue.lint.enabled) spawnLint(config);
            });

            /* 跳转套娃 */
            bindRogueCheck('nest', function (v) { config.rogue.nest.enabled = v; });
            bindRogueCheck('nest-endless', function (v) { config.rogue.nest.endless = v; });
            var nestCount = box.querySelector('[data-adlab-nest-count]');
            nestCount.addEventListener('change', function () {
                config.rogue.nest.count = Math.min(Math.max(Number(nestCount.value) || 4, 1), 9);
                nestCount.value = config.rogue.nest.count;
            });

            /* ---- 单条广告的评论区 / 水军 ---- */
            box.querySelectorAll('[data-adlab-cmt]').forEach(function (input) {
                input.addEventListener('change', function () {
                    var ad = config.ads[Number(input.dataset.adlabCmt)];
                    ad.cmt = cmtOf(ad); ad.cmt.enabled = input.checked;
                    refreshCmtSummary(input, ad);
                });
            });
            box.querySelectorAll('[data-adlab-shill]').forEach(function (input) {
                input.addEventListener('change', function () {
                    var ad = config.ads[Number(input.dataset.adlabShill)];
                    ad.cmt = cmtOf(ad); ad.cmt.shills = input.checked;
                    refreshCmtSummary(input, ad);
                });
            });
            box.querySelectorAll('[data-adlab-shill-count]').forEach(function (input) {
                input.addEventListener('change', function () {
                    var ad = config.ads[Number(input.dataset.adlabShillCount)];
                    ad.cmt = cmtOf(ad);
                    ad.cmt.count = Math.min(Math.max(Number(input.value) || 4, 1), 12);
                    input.value = ad.cmt.count;
                    refreshCmtSummary(input, ad);
                });
            });
            box.querySelectorAll('[data-adlab-shill-pool]').forEach(function (ta) {
                ta.addEventListener('change', function () {
                    var ad = config.ads[Number(ta.dataset.adlabShillPool)];
                    ad.cmt = cmtOf(ad); ad.cmt.pool = ta.value;
                });
            });
            function refreshCmtSummary(el, ad) {
                var index = el.dataset.adlabCmt || el.dataset.adlabShill || el.dataset.adlabShillCount;
                var sum = box.querySelector('[data-adlab-cmt-sum="' + index + '"]');
                if (sum) sum.textContent = cmtSummary(cmtOf(ad));
            }

            box.querySelector('#adlab-add')?.addEventListener('click', function () {
                config.ads.push({
                    id: 'ad-' + Date.now().toString(36), title: '', text: '',
                    mediaId: null, mediaKind: null, types: ['banner'], scenes: [], enabled: true,
                    cmt: { enabled: false, count: 4, shills: false, pool: '' }, notInterested: 0
                });
                render();
            });
            box.querySelectorAll('[data-adlab-del]').forEach(function (btn) {
                btn.addEventListener('click', function () {
                    var index = Number(btn.dataset.adlabDel);
                    var ad = config.ads[index];
                    if (ad.mediaId) mediaDelete(ad.mediaId).catch(function () {});
                    config.ads.splice(index, 1);
                    render();
                });
            });
            box.querySelectorAll('[data-adlab-up]').forEach(function (btn) {
                btn.addEventListener('click', function () {
                    var index = Number(btn.dataset.adlabUp);
                    if (index <= 0) return;
                    var ads = config.ads;
                    var tmp = ads[index - 1]; ads[index - 1] = ads[index]; ads[index] = tmp;
                    render();
                });
            });
            box.querySelectorAll('[data-adlab-down]').forEach(function (btn) {
                btn.addEventListener('click', function () {
                    var index = Number(btn.dataset.adlabDown);
                    var ads = config.ads;
                    if (index >= ads.length - 1) return;
                    var tmp = ads[index + 1]; ads[index + 1] = ads[index]; ads[index] = tmp;
                    render();
                });
            });
            box.querySelectorAll('[data-adlab-ad-title]').forEach(function (input) {
                input.addEventListener('change', function () { config.ads[Number(input.dataset.adlabAdTitle)].title = input.value; });
            });
            box.querySelectorAll('[data-adlab-ad-text]').forEach(function (ta) {
                ta.addEventListener('change', function () { config.ads[Number(ta.dataset.adlabAdText)].text = ta.value; });
            });
            box.querySelectorAll('[data-adlab-ad-enabled]').forEach(function (input) {
                input.addEventListener('change', function () { config.ads[Number(input.dataset.adlabAdEnabled)].enabled = input.checked; });
            });
            box.querySelectorAll('[data-adlab-ad-type]').forEach(function (input) {
                input.addEventListener('change', function () {
                    var ad = config.ads[Number(input.dataset.adlabAdType)];
                    ad.types = ad.types || [];
                    if (input.checked) { if (ad.types.indexOf(input.value) < 0) ad.types.push(input.value); }
                    else ad.types = ad.types.filter(function (t) { return t !== input.value; });
                });
            });
            box.querySelectorAll('[data-adlab-ad-scene]').forEach(function (input) {
                input.addEventListener('change', function () {
                    var ad = config.ads[Number(input.dataset.adlabAdScene)];
                    ad.scenes = ad.scenes || [];
                    if (input.checked) { if (ad.scenes.indexOf(input.value) < 0) ad.scenes.push(input.value); }
                    else ad.scenes = ad.scenes.filter(function (s) { return s !== input.value; });
                });
            });
            box.querySelectorAll('[data-adlab-img],[data-adlab-video]').forEach(function (btn) {
                btn.addEventListener('click', function () {
                    var index = Number(btn.dataset.adlabImg !== undefined ? btn.dataset.adlabImg : btn.dataset.adlabVideo);
                    var isVideo = btn.dataset.adlabVideo !== undefined;
                    var input = document.createElement('input');
                    input.type = 'file';
                    input.accept = isVideo ? 'video/*' : 'image/*';
                    input.addEventListener('change', function () {
                        var file = input.files && input.files[0];
                        if (!file) return;
                        var limit = isVideo ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;
                        if (file.size > limit) {
                            if (window.Dlg?.alert) Dlg.alert({ title: '素材太大', message: '上限 ' + Math.round(limit / 1024 / 1024) + 'MB，当前 ' + (file.size / 1024 / 1024).toFixed(1) + 'MB' });
                            return;
                        }
                        var ad = config.ads[index];
                        if (ad.mediaId) mediaDelete(ad.mediaId).catch(function () {});
                        ad.mediaId = 'media-' + Date.now().toString(36);
                        ad.mediaKind = isVideo ? 'video' : 'image';
                        mediaPut({ id: ad.mediaId, kind: ad.mediaKind, name: file.name, blob: file, createdAt: Date.now() })
                            .then(function () { render(); })
                            .catch(function (e) { console.warn('[广告跳跳乐] 素材保存失败：', e); });
                    });
                    input.click();
                });
            });
            box.querySelectorAll('[data-adlab-media-clear]').forEach(function (btn) {
                btn.addEventListener('click', function () {
                    var index = Number(btn.dataset.adlabMediaClear);
                    var ad = config.ads[index];
                    if (ad.mediaId) mediaDelete(ad.mediaId).catch(function () {});
                    ad.mediaId = null; ad.mediaKind = null;
                    render();
                });
            });

            function testType(type, shower) {
                var ad = pickAd(config, type);
                if (ad) shower(loadConfig(), ad);
                else if (window.showToast) window.showToast('没有适用于「' + type + '」的广告：先给某条广告勾上这种形式', 'ri-information-line');
            }
            box.querySelector('#adlab-test-splash')?.addEventListener('click', function () { testType('splash', showSplash); });
            box.querySelector('#adlab-test-popup')?.addEventListener('click', function () { testType('popup', showPopup); });
            box.querySelector('#adlab-test-inline')?.addEventListener('click', function () { testType('inline', showInline); });
            box.querySelector('#adlab-test-banner')?.addEventListener('click', function () { testType('banner', showBanner); });
            box.querySelector('#adlab-test-shake')?.addEventListener('click', function () {
                lastShakeAt = 0;
                triggerShake();
            });

            var diagBtn = box.querySelector('#adlab-diag-btn');
            diagBtn.addEventListener('click', function () {
                var out = box.querySelector('#adlab-diag');
                var text = diagnose(config);
                if (!out.hidden) { out.hidden = true; return; }   // 再点一次收起
                out.textContent = text;
                out.hidden = false;
                out.scrollIntoView({ block: 'nearest' });
            });

            box.querySelector('#adlab-save')?.addEventListener('click', function () {
                saveConfig(config);
                if (window.showToast) window.showToast('广告跳跳乐已保存', 'ri-flask-line');
                // 立即应用（关掉的浮标/横幅要撤掉）
                document.querySelectorAll('.adlab-float,.adlab-banner,.adlab-float-card').forEach(function (el) { el.remove(); });
                clearLint();
                started = false;
                start();
                cleanup();
            });
        }

        var closed = false;
        function cleanup() {
            if (closed) return;
            closed = true;
            overlay.classList.remove('show');
            setTimeout(function () { overlay.remove(); }, 200);
        }
        overlay.addEventListener('click', function (e) { if (e.target === overlay) cleanup(); });
        overlay.appendChild(box);
        document.body.appendChild(overlay);
        requestAnimationFrame(function () { overlay.classList.add('show'); });
        render();
    }

    /* ---------------- 开关与入口绑定 ---------------- */

    function bindLabPanel() {
        var toggle = document.getElementById('enable-ad-lab');
        var options = document.getElementById('ad-lab-options');
        var manageBtn = document.getElementById('ad-lab-manage-btn');
        if (!toggle) return;
        toggle.checked = loadConfig().enabled === true;
        options.hidden = !toggle.checked;
        toggle.addEventListener('change', function () {
            var config = loadConfig();
            config.enabled = toggle.checked;
            saveConfig(config);
            options.hidden = !toggle.checked;
            if (!toggle.checked) {
                // 关闭时立刻撤掉所有在跑的模拟广告
                document.querySelectorAll('.adlab-splash,.adlab-popup-mask,.adlab-banner,.adlab-float,.adlab-float-card,.adlab-shake-hint')
                    .forEach(function (el) { el.remove(); });
                clearLint();
                abortNest();
            } else {
                started = false;
                start();
            }
        });
        manageBtn?.addEventListener('click', openManage);
    }

    function boot() {
        bindLabPanel();
        start();
        /* Esc 是套娃的唯一逃生口：只在这一层有弹窗时才接管，不干扰别的快捷键 */
        document.addEventListener('keydown', function (e) {
            if (e.key !== 'Escape' && e.key !== 'Esc') return;
            if (!document.querySelector('.adlab-popup-mask,.adlab-splash')) return;
            abortNest();
        });
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
})();
