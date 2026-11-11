/* ========================================================================
   GAL 工作室 · 编辑器
   —— 节点式剧本编辑 + 静态舞台预览 + 单文件 HTML 导出
   —— 播放器引擎不在这里：它在 gal.html 的 #gv-player-js（text/plain），
      导出时整段内嵌，所以「编辑器里看到的」和「导出后玩到的」是同一套代码。
   ======================================================================== */
(function () {
    'use strict';

    if (!document.getElementById('gal-nodes')) return;

    /* ------------------------------------------------------------------
       0. 常量
       ------------------------------------------------------------------ */
    var LS_CUR = 'galStudio:current';
    var LS_INDEX = 'galStudio:index';
    var LS_PROJ = 'galStudio:proj:';
    var HISTORY_MAX = 40;

    var NODE_TYPES = [
        { t: 'say', label: '对话', icon: 'ri-chat-3-line', desc: '某个角色说一句话' },
        { t: 'narrate', label: '旁白', icon: 'ri-file-text-line', desc: '没有名字的叙述文字' },
        { t: 'bg', label: '背景', icon: 'ri-image-line', desc: '换背景图 / 显示地点名' },
        { t: 'show', label: '立绘出场', icon: 'ri-user-3-line', desc: '让角色出现在舞台上' },
        { t: 'hide', label: '立绘退场', icon: 'ri-user-unfollow-line', desc: '让角色离开舞台' },
        { t: 'choice', label: '选项', icon: 'ri-git-branch-line', desc: '让玩家做选择，走不同分支' },
        { t: 'label', label: '章节标签', icon: 'ri-bookmark-3-line', desc: '给跳转用的锚点，也可当章节标题' },
        { t: 'jump', label: '跳转', icon: 'ri-arrow-right-up-line', desc: '直接跳到某个标签' },
        { t: 'if', label: '条件判断', icon: 'ri-question-line', desc: '按变量走两条不同的路' },
        { t: 'set', label: '变量', icon: 'ri-calculator-line', desc: '给变量赋值 / 加减' },
        { t: 'sound', label: '音乐音效', icon: 'ri-music-2-line', desc: '播放 BGM、音效或停止' },
        { t: 'fx', label: '屏幕特效', icon: 'ri-flashlight-line', desc: '震动、闪白、淡入淡出' },
        { t: 'wait', label: '等待', icon: 'ri-timer-line', desc: '停顿一会儿再继续' },
        { t: 'end', label: '结局', icon: 'ri-flag-2-line', desc: '结束并显示结局画面' }
    ];
    var TYPE_MAP = {};
    NODE_TYPES.forEach(function (t) { TYPE_MAP[t.t] = t; });

    var EMO_LIST = ['default', 'happy', 'sad', 'angry', 'shy', 'surprised',
        'neutral', 'love', 'excited', 'thinking', 'laugh', 'cry'];
    var EMO_ZH = {
        default: '常规', happy: '开心', sad: '难过', angry: '生气', shy: '害羞',
        surprised: '惊讶', neutral: '平静', love: '爱意', excited: '激动',
        thinking: '思考', laugh: '大笑', cry: '哭泣'
    };
    var POS_LIST = [['left', '左'], ['center', '中'], ['right', '右'], ['farleft', '最左'], ['farright', '最右']];
    var OP_LIST = [['set', '设为 ='], ['add', '加 +='], ['sub', '减 -='], ['mul', '乘 *='], ['append', '拼接'], ['toggle', '取反']];
    var SKIN_LIST = [['classic', '经典渐隐'], ['box', '圆角方框'], ['glass', '毛玻璃'], ['minimal', '极简细线']];

    /* ------------------------------------------------------------------
       1. 小工具
       ------------------------------------------------------------------ */
    function $(id) { return document.getElementById(id); }
    function el(tag, cls, text) {
        var e = document.createElement(tag);
        if (cls) e.className = cls;
        if (text != null) e.textContent = text;
        return e;
    }
    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }
    function uid(prefix) {
        return (prefix || 'n') + Date.now().toString(36).slice(-4) +
            Math.random().toString(36).slice(2, 6);
    }
    function debounce(fn, ms) {
        var t = null;
        return function () {
            var args = arguments, self = this;
            clearTimeout(t);
            t = setTimeout(function () { fn.apply(self, args); }, ms);
        };
    }
    function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
    function fmtSize(n) {
        if (n < 1024) return n + ' B';
        if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
        return (n / 1024 / 1024).toFixed(2) + ' MB';
    }
    function toast(msg) {
        var box = $('gal-toast');
        box.textContent = msg;
        box.hidden = false;
        requestAnimationFrame(function () { box.classList.add('on'); });
        clearTimeout(toast._t);
        toast._t = setTimeout(function () {
            box.classList.remove('on');
            setTimeout(function () { box.hidden = true; }, 240);
        }, 2000);
    }

    /* ------------------------------------------------------------------
       2. 存储
       ------------------------------------------------------------------ */
    function readJSON(key, fallback) {
        try {
            var raw = localStorage.getItem(key);
            return raw ? JSON.parse(raw) : fallback;
        } catch (e) { return fallback; }
    }
    function writeJSON(key, val) {
        try { localStorage.setItem(key, JSON.stringify(val)); return true; }
        catch (e) { toast('保存失败：浏览器存储空间可能已满'); return false; }
    }
    function readIndex() {
        var idx = readJSON(LS_INDEX, null);
        return Array.isArray(idx) ? idx : [];
    }
    function writeIndex(idx) { writeJSON(LS_INDEX, idx); }
    function loadProject(id) { return readJSON(LS_PROJ + id, null); }
    /* localStorage 的配额按「字符」算，Chromium/Firefox 约 5M 字符、Safari 约 2.5M。
       工程 JSON 里最大的是 base64 素材，先量一遍再写，别等 setItem 抛异常才报错——
       那时用户已经不知道是哪张图把空间吃完了。留 0.6M 给索引、当前作品指针和别的模块。 */
    var LS_BUDGET = 4.4 * 1024 * 1024;

    function biggestAsset(p) {
        var assets = (p && p.assets) || {};
        var bestId = '', bestLen = 0;
        Object.keys(assets).forEach(function (k) {
            var len = String(assets[k] || '').length;
            if (len > bestLen) { bestLen = len; bestId = k; }
        });
        if (!bestLen) return '';
        var name = (p.assetNames || {})[bestId] || ('本地图片 ' + bestId.slice(-3));
        return name + '（' + (bestLen / 1048576).toFixed(1) + 'MB）';
    }

    function saveProject(p) {
        p.updated = Date.now();
        var size = 0;
        try { size = JSON.stringify(p).length; } catch (e) {
            toast('保存失败：工程数据无法序列化');
            return false;
        }
        if (size > LS_BUDGET) {
            var over = (size / 1048576).toFixed(1);
            var big = biggestAsset(p);
            setSaveState('error');
            toast('存不下了：工程 ' + over + 'MB，浏览器上限约 4.4MB。' +
                (big ? '最占地方的是 ' + big : '') +
                '。先「导出工程 JSON」备份，再删掉用不到的素材');
            return false;
        }
        var ok = writeJSON(LS_PROJ + p.id, p);
        if (ok) {
            var idx = readIndex();
            var hit = null;
            idx.forEach(function (it) { if (it.id === p.id) hit = it; });
            var meta = {
                id: p.id,
                title: p.title || '未命名作品',
                updated: p.updated,
                cover: p.settings && p.settings.cover ? p.settings.cover : '',
                nodes: (p.nodes || []).length,
                chars: (p.chars || []).length
            };
            if (hit) { Object.keys(meta).forEach(function (k) { hit[k] = meta[k]; }); }
            else idx.unshift(meta);
            writeIndex(idx);
        }
        return ok;
    }

    /* ------------------------------------------------------------------
       3. 工程模型
       ------------------------------------------------------------------ */
    function blankProject(withDemo) {
        var p = {
            v: 1,
            id: uid('p'),
            title: withDemo ? '无名之夜' : '未命名作品',
            author: '',
            updated: Date.now(),
            settings: {
                subtitle: withDemo ? 'A SHORT NIGHT' : '',
                cover: '',
                font: '',
                fontSize: 18,
                accent: '#e6c78a',
                skin: 'classic',
                dim: 15,
                speed: 32,
                autoDelay: 1600,
                kenBurns: true,
                startLabel: ''
            },
            chars: [],
            assets: {},
            vars: [],
            nodes: []
        };
        if (!withDemo) {
            p.nodes.push(mkNode('say', { char: '', text: '从这一句开始写吧。' }));
            return p;
        }

        var girlId = uid('c');
        p.chars.push({
            id: girlId,
            name: '少女',
            color: '#e6c78a',
            avatar: '',
            sprites: {}
        });
        p.vars.push({ name: '好感', value: 0 });

        var ns = [];
        function push(type, fields) {
            var n = mkNode(type, fields);
            ns.push(n);
            return n;
        }

        push('label', { name: '开场', chapter: '第一章 · 雨夜' });
        push('narrate', { text: '雨从傍晚下到现在，没有要停的意思。' });
        push('bg', { src: '', place: '旧公寓 · 三楼走廊', transition: 'fade' });
        push('show', { char: girlId, emo: 'default', pos: 'center' });
        push('say', { char: girlId, emo: 'default', text: '你终于来了。\n我还以为……你不会来。' });
        push('say', { char: girlId, emo: 'sad', text: '伞都湿透了。站过来一点吧，走廊会漏雨。' });
        push('set', { name: '好感', op: 'add', value: '1' });

        var c1 = push('choice', {
            prompt: '要怎么回答？',
            choices: [
                { text: '「抱歉，路上耽搁了。」', target: '', cond: '', effects: [{ name: '好感', op: 'add', value: '1' }] },
                { text: '「你一直在等我？」', target: '', cond: '', effects: [{ name: '好感', op: 'add', value: '2' }] }
            ]
        });
        var a1 = push('say', { char: girlId, emo: 'surprised', text: '……才没有。只是刚好在门口而已。' });
        var j1 = push('jump', { target: '' });
        var a2 = push('say', { char: girlId, emo: 'shy', text: '……嗯。进来吧，我泡了茶。' });
        var j2 = push('jump', { target: '' });

        push('label', { name: '尾声', chapter: '' });
        push('fx', { kind: 'flash', duration: 500, intensity: 1 });
        push('bg', { src: '', place: '次日清晨', transition: 'fade' });
        push('narrate', { text: '雨停了。\n窗台上留着一只没洗的杯子。' });

        var iff = push('if', { cond: '好感 >= 3', then: '', else: '' });
        var good = push('say', { char: girlId, emo: 'love', text: '下次……还来吗？' });
        var endGood = push('end', { kind: 'good', title: '雨夜之后', text: '有些话没说出口，但门已经开了。' });
        var bad = push('narrate', { text: '她没再说话，只是把门轻轻带上。\n走廊的灯闪了两下，灭了。' });
        var endNormal = push('end', { kind: 'normal', title: '门关上了', text: '有些雨，只能一个人淋。' });

        // 回填跳转（节点 id 只有建完之后才有）
        c1.choices[0].target = a1.id;
        c1.choices[1].target = a2.id;
        j1.target = ns[12].id;     // 尾声 label
        j2.target = ns[12].id;
        iff.then = good.id;
        iff.else = bad.id;

        p.nodes = ns;
        return p;
    }

    function mkNode(type, fields) {
        var n = { id: uid('n'), type: type };
        var defs = {
            say: { char: '', emo: '', text: '', voice: '' },
            narrate: { text: '' },
            bg: { src: '', place: '', transition: 'fade', kenBurns: true },
            show: { char: '', emo: 'default', pos: 'center', anim: 'fade' },
            hide: { char: 'all', anim: 'fade' },
            choice: { prompt: '', choices: [], hideLocked: false },
            label: { name: '', chapter: '' },
            jump: { target: '' },
            if: { cond: '', then: '', else: '' },
            set: { name: '', op: 'set', value: '' },
            sound: { action: 'play', channel: 'bgm', src: '', loop: true, volume: 70 },
            fx: { kind: 'shake', duration: 420, intensity: 1 },
            wait: { ms: 800 },
            end: { kind: 'normal', title: '完', text: '' }
        };
        var base = defs[type] || {};
        Object.keys(base).forEach(function (k) { n[k] = base[k]; });
        if (fields) Object.keys(fields).forEach(function (k) { n[k] = fields[k]; });
        return n;
    }

    function ensureProject(p) {
        if (!p || typeof p !== 'object') return blankProject(false);
        p.settings = p.settings || {};
        var d = blankProject(false).settings;
        Object.keys(d).forEach(function (k) { if (p.settings[k] == null) p.settings[k] = d[k]; });
        p.chars = Array.isArray(p.chars) ? p.chars : [];
        p.vars = Array.isArray(p.vars) ? p.vars : [];
        p.nodes = Array.isArray(p.nodes) ? p.nodes : [];
        p.assets = p.assets && typeof p.assets === 'object' ? p.assets : {};
        p.chars.forEach(function (c) {
            c.id = c.id || uid('c');
            c.sprites = c.sprites || {};
        });
        p.nodes.forEach(function (n) {
            if (!n.id) n.id = uid('n');
            if (!n.type || !TYPE_MAP[n.type]) n.type = 'narrate';
            var base = mkNode(n.type);
            Object.keys(base).forEach(function (k) { if (n[k] == null) n[k] = base[k]; });
            if (n.type === 'choice' && !Array.isArray(n.choices)) n.choices = [];
        });
        return p;
    }

    /* ------------------------------------------------------------------
       4. 状态
       ------------------------------------------------------------------ */
    var P = null;                 // 当前工程
    var sel = 0;                  // 当前选中节点索引
    var history = [];             // 撤销栈
    var histPos = -1;
    var dirty = false;
    var saveState = 'saved';

    function setSaveState(s) {
        saveState = s;
        var box = $('gal-status-save');
        if (!box) return;
        box.className = 'gal-status-dot ' + s;
        var map = {
            saving: ['保存中…', 'timer-line'],
            dirty: ['有未保存修改', 'timer-line'],
            error: ['存不下 · 空间不足', 'error-warning-line'],
            saved: ['已保存', 'shield-check-line']
        };
        var it = map[s] || map.saved;
        box.innerHTML = '<i class="ri-' + it[1] + '"></i> ' + it[0];
    }

    var doSave = debounce(function () {
        if (!P) return;
        setSaveState('saving');
        if (saveProject(P)) {
            dirty = false;
            setSaveState('saved');
        } else if (saveState !== 'error') {
            // 空间不足时 saveProject 已经置成 error，别被这里覆盖回「有未保存修改」
            setSaveState('dirty');
        }
        renderStatus();
    }, 700);

    function markDirty() {
        dirty = true;
        setSaveState('dirty');
        doSave();
    }

    /* 撤销栈：整份工程快照（含素材引用，不含 dataURL 副本本身，因为 assets 是共享的） */
    function snapshotForHistory() {
        try {
            return JSON.stringify({ nodes: P.nodes, chars: P.chars, vars: P.vars, settings: P.settings });
        } catch (e) { return null; }
    }
    function pushHistory() {
        var s = snapshotForHistory();
        if (!s) return;
        if (history[histPos] === s) return;
        history = history.slice(0, histPos + 1);
        history.push(s);
        if (history.length > HISTORY_MAX) history.shift();
        histPos = history.length - 1;
        syncUndoButtons();
    }
    function syncUndoButtons() {
        var u = $('gal-undo'), r = $('gal-redo');
        if (u) u.disabled = histPos <= 0;
        if (r) r.disabled = histPos >= history.length - 1;
    }
    function undo() {
        if (histPos <= 0) { toast('没有可撤销的操作'); return; }
        histPos--;
        applyHistory(history[histPos]);
        toast('已撤销');
    }
    function redo() {
        if (histPos >= history.length - 1) { toast('没有可重做的操作'); return; }
        histPos++;
        applyHistory(history[histPos]);
        toast('已重做');
    }
    function applyHistory(s) {
        try {
            var o = JSON.parse(s);
            P.nodes = o.nodes;
            P.chars = o.chars;
            P.vars = o.vars;
            P.settings = o.settings;
            sel = clamp(sel, 0, Math.max(0, P.nodes.length - 1));
            renderAll();
            markDirty();
            syncUndoButtons();
        } catch (e) { /* 忽略 */ }
    }

    /* ------------------------------------------------------------------
       5. 素材
       ------------------------------------------------------------------ */
    function assetIdOf(dataUrl) {
        var h = 5381;
        var s = dataUrl.length + '|' + dataUrl.slice(0, 256) + dataUrl.slice(-256);
        for (var i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
        return 'a' + h.toString(36);
    }
    function addAsset(dataUrl) {
        var id = assetIdOf(dataUrl);
        if (!P.assets[id]) {
            // 加进去之前先算账：素材是工程 JSON 的一部分，等 setItem 抛异常就晚了，
            // 用户会看到图在面板里、刷新后却没了。
            if (/^data:/i.test(dataUrl)) {
                var cur = 0;
                try { cur = JSON.stringify(P).length; } catch (e) { cur = 0; }
                if (cur + dataUrl.length + 1024 > LS_BUDGET) {
                    setSaveState('error');
                    toast('素材库满了（上限约 4.4MB）。先删掉用不到的素材，或导出工程 JSON 备份后另开一个作品');
                    return null;
                }
            }
            P.assets[id] = dataUrl;
            markDirty();
        }
        return 'asset:' + id;
    }
    function resolveSrc(v) {
        if (!v) return '';
        v = String(v);
        if (v.indexOf('asset:') === 0) return P.assets[v.slice(6)] || '';
        /* lib: 指向跨作品的素材库。库里存的是 Blob，这里拿的是它对应的
           objectURL —— 同步读，因为界面渲染不能等 await。素材库在进页面时
           已经预载过一轮，没命中就说明这条素材被删了，返回空让界面走占位。 */
        if (v.indexOf('lib:') === 0) {
            return (window.GalLib && window.GalLib.url(v.slice(4))) || '';
        }
        return v;
    }

    function isLibRef(v) {
        return typeof v === 'string' && v.indexOf('lib:') === 0;
    }
    function assetName(v) {
        if (!v) return '（无）';
        if (v.indexOf('asset:') === 0) {
            var id = v.slice(6);
            var hit = (P.assetNames || {})[id];
            return hit || ('本地图片 ' + id.slice(-3));
        }
        var tail = v.split('?')[0].split('/').pop();
        return tail || v;
    }
    function usedAssets() {
        var used = {};
        function scan(v) {
            if (typeof v === 'string' && v.indexOf('asset:') === 0) used[v.slice(6)] = 1;
        }
        P.nodes.forEach(function (n) { Object.keys(n).forEach(function (k) { scan(n[k]); }); });
        P.chars.forEach(function (c) {
            scan(c.avatar);
            Object.keys(c.sprites || {}).forEach(function (k) { scan(c.sprites[k]); });
        });
        scan(P.settings.cover);
        return used;
    }
    function totalAssetBytes() {
        var n = 0;
        Object.keys(P.assets).forEach(function (k) { n += P.assets[k].length; });
        return n;
    }

    /* 上传即压缩：工程是存进 localStorage 的，原图转 base64 会膨胀 1.33 倍，
       手机拍的一张 4MB 背景就能把 5M 字符的配额吃掉一半。舞台最高 1080p，
       长边 1920 完全够用，先把图缩到这个尺寸再存。 */
    var IMG_MAX_EDGE = 1920;
    function shrinkImage(dataUrl, cb) {
        var m = /^data:([^;,]+)/.exec(dataUrl || '');
        var mime = m ? m[1].toLowerCase() : '';
        // GIF 会掉帧、SVG 是矢量，都不动；小图也不必重绘（重绘只会掉画质）
        if (mime === 'image/gif' || mime === 'image/svg+xml' || dataUrl.length < 700000) {
            cb(dataUrl); return;
        }
        var img = new Image();
        var done = false;
        function finish(out) { if (done) return; done = true; cb(out || dataUrl); }
        img.onload = function () {
            try {
                var w = img.naturalWidth, h = img.naturalHeight;
                if (!w || !h) { finish(dataUrl); return; }
                var scale = Math.min(1, IMG_MAX_EDGE / Math.max(w, h));
                var cw = Math.max(1, Math.round(w * scale));
                var ch = Math.max(1, Math.round(h * scale));
                var cv = document.createElement('canvas');
                cv.width = cw; cv.height = ch;
                var ctx = cv.getContext('2d');
                ctx.imageSmoothingEnabled = true;
                ctx.imageSmoothingQuality = 'high';
                ctx.drawImage(img, 0, 0, cw, ch);
                var alpha = (mime === 'image/png' || mime === 'image/webp');
                var out;
                if (alpha) {
                    out = cv.toDataURL('image/webp', 0.9);
                    // 浏览器不支持 WebP 编码时会退回 PNG；千万别退到 JPEG，透明会变黑底
                    if (out.indexOf('data:image/webp') !== 0) out = cv.toDataURL('image/png');
                } else {
                    out = cv.toDataURL('image/jpeg', 0.86);
                }
                finish(out.length < dataUrl.length ? out : dataUrl);
            } catch (e) { finish(dataUrl); }
        };
        img.onerror = function () { finish(dataUrl); };
        img.src = dataUrl;
    }

    /* 读文件 → dataURL（大图自动缩到长边 1920） */
    function pickFile(accept, cb) {
        var inp = $('gal-file');
        inp.accept = accept || 'image/*';
        inp.value = '';
        inp.onchange = function () {
            var f = inp.files && inp.files[0];
            if (!f) return;
            if (f.size > 12 * 1024 * 1024) { toast('图片太大了（上限 12MB）'); return; }
            var r = new FileReader();
            r.onload = function () {
                var raw = String(r.result);
                var before = raw.length;
                shrinkImage(raw, function (out) {
                    if (out.length < before * 0.72) {
                        toast('已压缩：' + (before / 1048576).toFixed(1) + 'MB → ' +
                            (out.length / 1048576).toFixed(1) + 'MB');
                    }
                    cb(out, f);
                });
            };
            r.readAsDataURL(f);
        };
        inp.click();
    }
    function pickAudio(cb) {
        var inp = $('gal-file');
        inp.accept = 'audio/*';
        inp.value = '';
        inp.onchange = function () {
            var f = inp.files && inp.files[0];
            if (!f) return;
            // 音频转 base64 会再涨 1/3，而整个工程只有约 4.4MB 的额度，
            // 6MB 的文件根本存不下，不如提前把话说明白
            if (f.size > 3 * 1024 * 1024) { toast('音频太大了（上限 3MB，浏览器存储总共约 4.4MB）'); return; }
            var r = new FileReader();
            r.onload = function () { cb(String(r.result), f); };
            r.readAsDataURL(f);
        };
        inp.click();
    }

    /* 素材库用：多选，直接给 File 对象（内容进 IndexedDB，不转 base64） */
    function pickFiles(accept, cb) {
        var inp = $('gal-file');
        inp.accept = accept || 'image/*,audio/*';
        inp.value = '';
        inp.multiple = true;
        inp.onchange = function () {
            var files = Array.prototype.slice.call(inp.files || []);
            inp.multiple = false;
            if (files.length) cb(files);
        };
        inp.click();
    }

    function refreshLib(cb) {
        LIB.loaded = false;
        loadLib(cb);
    }

    function uploadToLib(files) {
        if (!window.GalLib) { toast('素材库模块没加载，刷新页面再试'); return; }
        var ok = 0, fails = [];
        var chain = Promise.resolve();
        files.forEach(function (f) {
            chain = chain.then(function () {
                if (f.size > 40 * 1024 * 1024) { fails.push(f.name + '：超过 40MB'); return; }
                return window.GalLib.add(f).then(function () { ok++; })
                    .catch(function (e) { fails.push(f.name + '：' + ((e && e.message) || '失败')); });
            });
        });
        chain.then(function () {
            refreshLib(renderAssets);
            if (ok) toast('已加入素材库 ' + ok + ' 个' + (fails.length ? '，' + fails.length + ' 个失败' : ''));
            if (fails.length) {
                showModal('这些没能加进来', '<div class="gal-field-hint" style="line-height:1.9">' +
                    fails.map(function (x) { return '· ' + esc(x); }).join('<br>') +
                    '<br><br>素材库支持常见图片（jpg / png / webp / gif）和音频（mp3 / ogg / wav / m4a）。' +
                    'HEIC 这类浏览器不认识的格式先转一下再传。</div>',
                    [{ label: '知道了', cls: 'gal-btn', cb: closeModal }], true);
            }
        });
    }

    function deleteLibItem(id, name) {
        if (!window.GalLib) return;
        if (!confirm('从素材库删除「' + (name || id) + '」？\n\n用到它的作品会变成空背景，文件本身不会被改。')) return;
        window.GalLib.remove(id).then(function () {
            refreshLib(renderAssets);
            renderStage();
            toast('已删除');
        }).catch(function (e) {
            toast('删除失败：' + ((e && e.message) || '未知错误'));
        });
    }

    function renameLibItem(id, oldName) {
        var name = prompt('给这个素材起个名字（AI 拆分剧本时会看到这个名字）：', oldName || '');
        if (name == null) return;
        name = name.trim().slice(0, 40);
        if (!name) return;
        window.GalLib.update(id, { name: name }).then(function () {
            refreshLib(renderAssets);
            toast('改好了');
        });
    }

    function openLibManager() {
        var html = '<div class="gal-field-hint" style="margin-bottom:10px">' +
            '这里删的是素材库里的原件，所有作品共用同一份。删之前先看一眼右边的「用了 N 处」。</div>';
        html += '<div id="gal-lib-mg-list">正在读取…</div>';
        showModal('素材库管理', html, [
            { label: '全部清空', cls: 'gal-btn danger', cb: function () { clearLibAll(); } },
            { label: '关闭', cls: 'gal-btn', cb: function () { closeModal(); refreshLib(renderAssets); } }
        ], true);

        window.GalLib.list().then(function (items) {
            var used = libUsedIds();
            var box = $('gal-lib-mg-list');
            if (!box) return;
            if (!items.length) { box.innerHTML = '<div class="gal-hint-empty">素材库是空的。</div>'; return; }
            var total = items.reduce(function (s, x) { return s + (x.size || 0); }, 0);
            var h = '<div class="gal-field-hint" style="margin-bottom:8px">共 <b>' + items.length +
                '</b> 个，占用 <b>' + fmtSize(total) + '</b></div>';
            h += '<div class="gal-lib-mg">';
            items.forEach(function (it) {
                h += '<div class="gal-lib-mg-row">' +
                    '<div class="gal-lib-mg-thumb" style="background-image:url(&quot;' + esc(window.GalLib.thumb(it.id)) + '&quot;)">' +
                    (it.kind === 'audio' ? '<i class="ri-music-2-line"></i>' : '') + '</div>' +
                    '<div class="gal-lib-mg-info"><b>' + esc(it.name) + '</b>' +
                    '<span>' + (it.kind === 'audio' ? '音频' : '图片') + ' · ' + fmtSize(it.size) +
                    ' · ' + (used[it.id] ? '本作品用了 ' + used[it.id] + ' 处' : '本作品未使用') + '</span></div>' +
                    '<button type="button" class="gal-mini" data-mgrn="' + esc(it.id) + '">改名</button>' +
                    '<button type="button" class="gal-mini danger" data-mgdel="' + esc(it.id) + '">删除</button>' +
                    '</div>';
            });
            h += '</div>';
            box.innerHTML = h;
            box.addEventListener('click', function (ev) {
                var rn = ev.target.closest('[data-mgrn]');
                if (rn) {
                    var id = rn.getAttribute('data-mgrn');
                    var it = items.filter(function (x) { return x.id === id; })[0];
                    renameLibItem(id, it ? it.name : '');
                    setTimeout(openLibManager, 60);
                    return;
                }
                var del = ev.target.closest('[data-mgdel]');
                if (del) {
                    var did = del.getAttribute('data-mgdel');
                    var dit = items.filter(function (x) { return x.id === did; })[0];
                    window.GalLib.remove(did).then(function () {
                        refreshLib(function () { renderAssets(); });
                        openLibManager();
                        toast('已删除');
                    });
                }
            });
        });
    }

    function clearLibAll() {
        if (!confirm('清空整个素材库？所有作品里引用它的地方都会变成空。\n\n建议先导出一次工程 JSON 备份。')) return;
        if (!confirm('真的清空？这一步没有「撤销」。')) return;
        window.GalLib.clear().then(function () {
            refreshLib(renderAssets);
            renderStage();
            openLibManager();
            toast('素材库已清空');
        });
    }

    /* ------------------------------------------------------------------
       6. 渲染：节点列表
       ------------------------------------------------------------------ */
    function nodeSummary(n) {
        switch (n.type) {
            case 'say': {
                var who = charName(n.char);
                var t = String(n.text || '').replace(/\n/g, ' ');
                return (who ? who + '：' : '') + (t || '（还没写台词）');
            }
            case 'narrate': {
                var t2 = String(n.text || '').replace(/\n/g, ' ');
                return t2 || '（还没写旁白）';
            }
            case 'bg': return (assetName(n.src)) + (n.place ? ' · ' + n.place : '');
            case 'show': return charName(n.char) + ' · ' + (EMO_ZH[n.emo] || n.emo || '默认') + ' · ' + posZh(n.pos);
            case 'hide': return n.char === 'all' || !n.char ? '全部退场' : charName(n.char) + ' 退场';
            case 'choice': {
                var cs = n.choices || [];
                return cs.length ? cs.length + ' 个选项 · ' + String(cs[0].text || '').slice(0, 20) : '（没有选项）';
            }
            case 'label': return n.name || '（未命名标签）';
            case 'jump': return '→ ' + targetName(n.target);
            case 'if': return (n.cond || '（空条件，恒真）');
            case 'set': return (n.name || '（未选变量）') + ' ' + opZh(n.op) + ' ' + (n.value === '' ? '""' : n.value);
            case 'sound': return (n.action === 'stop' ? '停止 ' : '播放 ') + (n.channel === 'se' ? '音效' : 'BGM') + ' · ' + (assetName(n.src));
            case 'fx': return fxZh(n.kind) + ' · ' + (n.duration || 420) + 'ms';
            case 'wait': return (n.ms || 0) + ' 毫秒';
            case 'end': return (n.title || '完') + ' · ' + endKindZh(n.kind);
            default: return '';
        }
    }
    function charName(id) {
        if (!id) return '';
        for (var i = 0; i < P.chars.length; i++) if (P.chars[i].id === id) return P.chars[i].name || '未命名角色';
        return '';
    }
    function charById(id) {
        for (var i = 0; i < P.chars.length; i++) if (P.chars[i].id === id) return P.chars[i];
        return null;
    }
    function posZh(p) {
        for (var i = 0; i < POS_LIST.length; i++) if (POS_LIST[i][0] === p) return POS_LIST[i][1];
        return '中';
    }
    function opZh(op) {
        var m = { set: '设为', add: '加', sub: '减', mul: '乘', append: '拼接', toggle: '取反' };
        return m[op] || '设为';
    }
    function fxZh(k) {
        var m = { shake: '震动', flash: '闪白', fadeout: '淡出黑场', fadein: '从黑场淡入' };
        return m[k] || '震动';
    }
    function endKindZh(k) {
        var m = { good: '好结局', bad: '坏结局', normal: '普通结局', true: '真结局', any: '结局' };
        return m[k] || '普通结局';
    }
    function targetName(t) {
        if (!t) return '（未选择）';
        var n = P.nodes.filter(function (x) { return x.id === t; })[0];
        if (!n) {
            var byLabel = P.nodes.filter(function (x) { return x.type === 'label' && x.name === t; })[0];
            return byLabel ? ('#' + (P.nodes.indexOf(byLabel) + 1) + ' ' + byLabel.name) : ('（找不到 ' + t + '）');
        }
        var i = P.nodes.indexOf(n);
        return '#' + (i + 1) + ' ' + (n.type === 'label' ? (n.name || '标签') : TYPE_MAP[n.type].label);
    }

    function renderNodeList() {
        var host = $('gal-nodes');
        var frag = document.createDocumentFragment();
        P.nodes.forEach(function (n, i) {
            var type = TYPE_MAP[n.type] || TYPE_MAP.narrate;
            var row = el('div', 'gal-node ' + n.type + (i === sel ? ' on' : ''));
            row.dataset.index = String(i);
            row.dataset.type = n.type;
            row.draggable = true;
            row.setAttribute('role', 'option');
            row.setAttribute('aria-selected', i === sel ? 'true' : 'false');

            row.appendChild(el('span', 'gal-node-idx', String(i + 1)));
            var ico = el('span', 'gal-node-ico');
            ico.innerHTML = '<i class="' + type.icon + '"></i>';
            row.appendChild(ico);

            var body = el('div', 'gal-node-body');
            body.appendChild(el('div', 'gal-node-t', nodeSummary(n)));
            if (n.type === 'branch-note') body.appendChild(el('div', 'gal-node-sub', ''));
            row.appendChild(body);

            var ops = el('div', 'gal-node-ops');
            [
                { a: 'up', i: 'ri-arrow-up-line', t: '上移' },
                { a: 'down', i: 'ri-arrow-down-line', t: '下移' },
                { a: 'copy', i: 'ri-file-copy-line', t: '复制' },
                { a: 'del', i: 'ri-delete-bin-line', t: '删除', cls: 'del' }
            ].forEach(function (o) {
                var b = el('button', o.cls || '');
                b.type = 'button';
                b.title = o.t;
                b.dataset.op = o.a;
                b.innerHTML = '<i class="' + o.i + '"></i>';
                ops.appendChild(b);
            });
            row.appendChild(ops);
            frag.appendChild(row);
        });
        host.innerHTML = '';
        host.appendChild(frag);
        $('gal-node-count').textContent = String(P.nodes.length);
        renderStatus();
        scrollSelIntoView();
    }

    function scrollSelIntoView() {
        var host = $('gal-nodes');
        var cur = host.querySelector('.gal-node.on');
        if (!cur) return;
        var top = cur.offsetTop, h = cur.offsetHeight;
        if (top < host.scrollTop) host.scrollTop = top - 8;
        else if (top + h > host.scrollTop + host.clientHeight) host.scrollTop = top + h - host.clientHeight + 8;
    }

    function renderStatus() {
        var chars = 0;
        var lines = 0;
        P.nodes.forEach(function (n) {
            if (n.type === 'say' || n.type === 'narrate') {
                chars += String(n.text || '').length;
                lines++;
            }
        });
        var st = $('gal-status-stat');
        if (st) st.textContent = P.nodes.length + ' 节点 / ' + chars + ' 字';
        var sz = $('gal-status-size');
        if (sz) sz.textContent = fmtSize(JSON.stringify(P).length + totalAssetBytes());
        var hint = $('gal-status-hint');
        if (hint) hint.textContent = P.nodes[sel] ? (TYPE_MAP[P.nodes[sel].type] || {}).label + ' · 第 ' + (sel + 1) + ' 个节点' : '选中节点后在这里编辑';
        var tag = $('gal-stage-tag');
        if (tag) tag.innerHTML = '<i class="ri-eye-line"></i> 预览 · 第 ' + (sel + 1) + ' 个节点';
        var tt = $('gal-project-title');
        if (tt && tt.value !== (P.title || '')) tt.value = P.title || '';
    }

    /* ------------------------------------------------------------------
       7. 渲染：检查器
       ------------------------------------------------------------------ */
    function fieldText(label, key, n, opts) {
        opts = opts || {};
        var v = n[key] == null ? '' : n[key];
        var html = '<div class="gal-field"><label>' + esc(label) + '</label>';
        if (opts.textarea) {
            html += '<textarea class="gal-textarea' + (opts.tall ? ' tall' : '') + '" data-k="' + key + '" placeholder="' +
                esc(opts.placeholder || '') + '">' + esc(v) + '</textarea>';
        } else {
            html += '<input class="gal-input" data-k="' + key + '" value="' + esc(v) + '" placeholder="' +
                esc(opts.placeholder || '') + '">';
        }
        if (opts.hint) html += '<div class="gal-field-hint">' + opts.hint + '</div>';
        return html + '</div>';
    }

    function fieldSelect(label, key, n, options, opts) {
        opts = opts || {};
        var v = n[key];
        var html = '<div class="gal-field"><label>' + esc(label) + '</label><select data-k="' + key + '">';
        if (opts.empty) html += '<option value="">' + esc(opts.empty) + '</option>';
        options.forEach(function (o) {
            var val = Array.isArray(o) ? o[0] : o;
            var lb = Array.isArray(o) ? o[1] : o;
            html += '<option value="' + esc(val) + '"' + (String(v) === String(val) ? ' selected' : '') + '>' + esc(lb) + '</option>';
        });
        html += '</select>';
        if (opts.hint) html += '<div class="gal-field-hint">' + opts.hint + '</div>';
        return html + '</div>';
    }

    function fieldNumber(label, key, n, opts) {
        opts = opts || {};
        return '<div class="gal-field"><label>' + esc(label) + '</label>' +
            '<input class="gal-input" type="number" data-k="' + key + '" value="' + esc(n[key]) + '"' +
            (opts.min != null ? ' min="' + opts.min + '"' : '') +
            (opts.max != null ? ' max="' + opts.max + '"' : '') +
            (opts.step != null ? ' step="' + opts.step + '"' : '') + '>' +
            (opts.hint ? '<div class="gal-field-hint">' + opts.hint + '</div>' : '') + '</div>';
    }

    function fieldImage(label, key, n, opts) {
        opts = opts || {};
        var v = n[key] || '';
        var src = resolveSrc(v);
        var html = '<div class="gal-field"><label>' + esc(label) + '</label>';
        html += '<div class="gal-thumb" data-thumb="' + key + '" style="' +
            (src ? 'background-image:url(&quot;' + esc(src).slice(0, 200000) + '&quot;)' : '') + '">' +
            (src ? '' : '未选择图片') + '</div>';
        html += '<div class="gal-row">';
        html += '<input class="gal-input gal-grow" data-k="' + key + '" value="' + esc(v) + '" placeholder="图片 URL，或点右边上传">';
        html += '<button type="button" class="gal-mini" data-upload="' + key + '"><i class="ri-upload-2-line"></i> 上传</button>';
        html += '</div>';
        if (opts.assets) {
            html += '<div class="gal-row" style="margin-top:6px"><select class="gal-select" data-pickasset="' + key + '" style="flex:1">';
            html += '<option value="">从素材里选…</option>';
            if (LIB.items.length) {
                html += '<optgroup label="素材库（所有作品共用）">';
                LIB.items.forEach(function (it) {
                    if (it.kind !== 'image') return;
                    var val = 'lib:' + it.id;
                    html += '<option value="' + esc(val) + '"' + (v === val ? ' selected' : '') + '>' +
                        esc(it.name) + '</option>';
                });
                html += '</optgroup>';
            }
            if (Object.keys(P.assets).length) {
                html += '<optgroup label="本作品素材">';
                Object.keys(P.assets).forEach(function (aid) {
                    var val2 = 'asset:' + aid;
                    html += '<option value="' + esc(val2) + '"' + (v === val2 ? ' selected' : '') + '>' +
                        esc((P.assetNames || {})[aid] || ('本地图片 ' + aid.slice(-3))) + '</option>';
                });
                html += '</optgroup>';
            }
            html += '</select></div>';
        }
        if (opts.hint) html += '<div class="gal-field-hint">' + opts.hint + '</div>';
        return html + '</div>';
    }

    function charOptions(emptyLabel) {
        var arr = [];
        if (emptyLabel) arr.push(['', emptyLabel]);
        P.chars.forEach(function (c) { arr.push([c.id, c.name || '未命名角色']); });
        return arr;
    }

    function targetOptions(emptyLabel) {
        var arr = [];
        if (emptyLabel) arr.push(['', emptyLabel]);
        P.nodes.forEach(function (n, i) {
            if (n.type === 'label' && n.name) arr.push([n.id, '#' + (i + 1) + ' ' + n.name + (n.chapter ? '（' + n.chapter + '）' : '')]);
        });
        P.nodes.forEach(function (n, i) {
            if (n.type === 'label') return;
            arr.push([n.id, '#' + (i + 1) + ' ' + TYPE_MAP[n.type].label + ' · ' + nodeSummary(n).slice(0, 18)]);
        });
        return arr;
    }

    function renderInspector() {
        var host = $('gal-inspector');
        var n = P.nodes[sel];
        if (!n) {
            host.innerHTML = '<div class="gal-insp-empty"><i class="ri-file-list-3-line"></i>' +
                '<div>左边还没有节点。<br>点「添加节点」写第一句吧。</div></div>';
            return;
        }
        var type = TYPE_MAP[n.type] || TYPE_MAP.narrate;
        var html = '<div class="gal-insp-head">' +
            '<span class="gal-type-badge"><i class="' + type.icon + '"></i> ' + type.label + '</span>' +
            '<span class="gal-nodeidx">#' + (sel + 1) + '</span>' +
            '<span class="gal-flex"></span>' +
            '<button type="button" class="gal-mini" data-act="playhere"><i class="ri-play-mini-line"></i> 从这里试玩</button>' +
            '</div>';

        switch (n.type) {
            case 'say':
                html += fieldSelect('说话人', 'char', n, charOptions('（旁白 / 不署名）'), {
                    hint: '没有角色？去右边「角色」面板新建一个。'
                });
                html += fieldSelect('表情', 'emo', n, EMO_LIST.map(function (e) { return [e, EMO_ZH[e] || e]; }), {
                    empty: '（沿用当前立绘表情）'
                });
                html += fieldText('台词', 'text', n, { textarea: true, tall: true, placeholder: '这一句要说的话…\n支持换行' });
                html += fieldText('语音 URL（可选）', 'voice', n, { placeholder: 'https://… 或留空' });
                html += '<div class="gal-field-hint">切换说话人时，如果该角色在舞台上，会自动换成对应表情。</div>';
                break;

            case 'narrate':
                html += fieldText('旁白文字', 'text', n, { textarea: true, tall: true, placeholder: '雨从傍晚下到现在…' });
                html += '<div class="gal-field-hint">旁白不显示名字框，文字稍微亮一点。换行会原样保留。</div>';
                break;

            case 'bg':
                html += fieldImage('背景图', 'src', n, { assets: true, hint: '留空 = 用内置的深色渐变底。' });
                html += fieldText('地点名（可选）', 'place', n, { placeholder: '旧公寓 · 三楼走廊' });
                html += fieldSelect('切换方式', 'transition', n, [['fade', '淡入'], ['cut', '直接切换']], {});
                html += '<label class="gal-inline-check"><input type="checkbox" data-k="kenBurns" data-bool="1"' +
                    (n.kenBurns ? ' checked' : '') + '> 背景缓慢推移（Ken Burns）</label>';
                break;

            case 'show':
                html += fieldSelect('角色', 'char', n, charOptions('（选择角色）'), {});
                html += fieldSelect('表情', 'emo', n, EMO_LIST.map(function (e) { return [e, EMO_ZH[e] || e]; }), {});
                html += fieldSelect('站位', 'pos', n, POS_LIST, {});
                html += '<div class="gal-field"><label>该角色的立绘</label>' +
                    '<div class="gal-field-hint">立绘在右边「角色」面板里，按表情一张张配。没配的表情会退回 default，再没有就用头像。</div>' +
                    '<button type="button" class="gal-mini" data-act="goto-char"><i class="ri-user-settings-line"></i> 去打角色面板</button></div>';
                break;

            case 'hide':
                html += fieldSelect('谁退场', 'char', n, charOptions('').concat([]), {});
                html += '<div class="gal-field"><label>说明</label><div class="gal-field-hint">选「全部退场」会清空整个舞台的立绘。</div></div>';
                break;

            case 'choice': {
                html += fieldText('提示语（可选）', 'prompt', n, { placeholder: '要怎么回答？', hint: '会显示在选项上方。' });
                html += '<label class="gal-inline-check"><input type="checkbox" data-k="hideLocked" data-bool="1"' +
                    (n.hideLocked ? ' checked' : '') + '> 条件不满足的选项直接隐藏（不勾 = 显示但变灰不可点）</label>';
                html += '<div class="gal-field"><label>选项（从上到下）</label>';
                (n.choices || []).forEach(function (c, ci) {
                    html += '<div class="gal-choice-item" data-ci="' + ci + '">';
                    html += '<div class="gal-choice-head"><b>选项 ' + (ci + 1) + '</b><span class="gal-flex"></span>' +
                        '<button type="button" class="gal-iconbtn" data-cop="up" data-ci="' + ci + '" title="上移"><i class="ri-arrow-up-line"></i></button>' +
                        '<button type="button" class="gal-iconbtn" data-cop="down" data-ci="' + ci + '" title="下移"><i class="ri-arrow-down-line"></i></button>' +
                        '<button type="button" class="gal-iconbtn danger" data-cop="del" data-ci="' + ci + '" title="删除"><i class="ri-delete-bin-line"></i></button>' +
                        '</div>';
                    html += '<input class="gal-input sm" data-ck="text" data-ci="' + ci + '" value="' + esc(c.text || '') + '" placeholder="选项文字">';
                    html += '<div class="gal-row" style="margin-top:5px">' +
                        '<select class="gal-select" data-ck="target" data-ci="' + ci + '" style="flex:1">' +
                        '<option value=""' + (!c.target ? ' selected' : '') + '>跳转：下一个节点</option>';
                    targetOptions('').forEach(function (t) {
                        if (!t[0]) return;
                        html += '<option value="' + esc(t[0]) + '"' + (c.target === t[0] ? ' selected' : '') + '>' + esc(t[1]) + '</option>';
                    });
                    html += '</select></div>';
                    // 条件
                    html += '<div class="gal-row" style="margin-top:5px"><input class="gal-input sm" data-ck="cond" data-ci="' + ci +
                        '" value="' + esc(c.cond || '') + '" placeholder="出现条件，如 好感 &gt;= 3（留空=总是出现）"></div>';
                    // 效果
                    var eff = c.effects && c.effects[0] ? c.effects[0] : null;
                    html += '<div class="gal-row" style="margin-top:5px">' +
                        '<select class="gal-select" data-ck="efname" data-ci="' + ci + '" style="flex:1">' +
                        '<option value="">（不改变量）</option>';
                    P.vars.forEach(function (v) {
                        html += '<option value="' + esc(v.name) + '"' + (eff && eff.name === v.name ? ' selected' : '') + '>' + esc(v.name) + '</option>';
                    });
                    html += '</select>';
                    html += '<select class="gal-select" data-ck="efop" data-ci="' + ci + '" style="width:78px">';
                    OP_LIST.forEach(function (o) {
                        html += '<option value="' + o[0] + '"' + (eff && (eff.op || 'set') === o[0] ? ' selected' : '') + '>' + o[1] + '</option>';
                    });
                    html += '</select>';
                    html += '<input class="gal-input sm" style="width:64px" data-ck="efval" data-ci="' + ci +
                        '" value="' + esc(eff ? eff.value : '') + '" placeholder="值">';
                    html += '</div>';
                    html += '</div>';
                });
                html += '<button type="button" class="gal-add-sub" data-cop="add"><i class="ri-add-line"></i> 添加一个选项</button>';
                html += '<div class="gal-field-hint">选项的「跳转」不选 = 顺着往下走。想回到主线，就在分支末尾放一个「跳转」节点。</div></div>';
                break;
            }

            case 'label':
                html += fieldText('标签名', 'name', n, {
                    placeholder: 'chapter1',
                    hint: '给跳转当目标用。名字建议用英文或数字，别带空格。'
                });
                html += fieldText('章节标题（可选）', 'chapter', n, {
                    placeholder: '第一章 · 雨夜',
                    hint: '只用于存档里显示「你在第几章」，以及编辑器的提示。'
                });
                break;

            case 'jump':
                html += fieldSelect('跳到', 'target', n, targetOptions('（选择目标）'), {
                    hint: '跳转是「无条件」的。想按条件走不同路，用「条件判断」节点。'
                });
                break;

            case 'if':
                html += fieldText('条件', 'cond', n, {
                    placeholder: '好感 >= 3 && 看过信 == true',
                    hint: '写法：<code>变量 运算符 值</code>，运算符有 <code>&gt;= &lt;= &gt; &lt; == != ~=</code>（<code>~=</code> 是包含）。' +
                        '多个条件用 <code>&&</code>（并且）或 <code>||</code>（或者）连起来。值不加引号时按数字/布尔解析。'
                });
                html += fieldSelect('条件成立 → 跳到', 'then', n, targetOptions('（不跳，继续往下）'), {});
                html += fieldSelect('条件不成立 → 跳到', 'else', n, targetOptions('（不跳，继续往下）'), {});
                break;

            case 'set':
                html += fieldSelect('变量', 'name', n, P.vars.map(function (v) { return [v.name, v.name + '（初始 ' + v.value + '）']; }), {
                    empty: '（选择变量）', hint: '没有想要的？去右边「变量」面板加一个。'
                });
                html += fieldSelect('操作', 'op', n, OP_LIST, {});
                html += fieldText('值', 'value', n, { placeholder: '数字、true / false 或文字' });
                break;

            case 'sound':
                html += fieldSelect('动作', 'action', n, [['play', '播放'], ['stop', '停止']], {});
                html += fieldSelect('声道', 'channel', n, [['bgm', '背景音乐（同时只放一首）'], ['se', '音效（可叠加）']], {});
                html += fieldImage('音频', 'src', n, { hint: '也可以直接填 mp3 / ogg 的网址。上传的音频会一起打包进 HTML。' });
                html += '<label class="gal-inline-check"><input type="checkbox" data-k="loop" data-bool="1"' +
                    (n.loop ? ' checked' : '') + '> 循环播放</label>';
                html += fieldNumber('音量 %', 'volume', n, { min: 0, max: 100 });
                break;

            case 'fx':
                html += fieldSelect('特效', 'kind', n, [
                    ['shake', '震动'], ['flash', '闪白'], ['fadeout', '淡出到黑'], ['fadein', '从黑淡入']
                ], {});
                html += fieldNumber('时长 ms', 'duration', n, { min: 80, max: 5000, step: 20 });
                html += fieldNumber('强度（震动幅度）', 'intensity', n, { min: 0.2, max: 4, step: 0.2 });
                break;

            case 'wait':
                html += fieldNumber('等待毫秒', 'ms', n, { min: 0, max: 20000, step: 100, hint: '1000 = 1 秒。常用于「淡出之后停一下再换场景」。' });
                break;

            case 'end':
                html += fieldSelect('结局类型', 'kind', n, [
                    ['good', 'GOOD END'], ['normal', 'NORMAL END'], ['bad', 'BAD END'], ['true', 'TRUE END']
                ], {});
                html += fieldText('标题', 'title', n, { placeholder: '雨夜之后' });
                html += fieldText('正文（可选）', 'text', n, { textarea: true, placeholder: '写两句收尾的话…' });
                break;
            default:
                html += '<div class="gal-hint-empty">未知节点类型：' + esc(n.type) + '</div>';
        }

        // 通用：节点 id 与前后关系
        html += '<div class="gal-field" style="margin-top:16px;opacity:.62">' +
            '<label>节点 ID</label>' +
            '<input class="gal-input sm" value="' + esc(n.id) + '" readonly>' +
            '<div class="gal-field-hint">跳转、选项都记这个 ID，改文字不会断链。</div></div>';

        host.innerHTML = html;
    }

    /* 检查器里的输入事件（委托） */
    function bindInspector() {
        var host = $('gal-inspector');

        host.addEventListener('input', function (ev) {
            var t = ev.target;
            if (!t) return;
            var k = t.getAttribute && t.getAttribute('data-k');
            var ck = t.getAttribute && t.getAttribute('data-ck');
            var n = P.nodes[sel];
            if (!n) return;

            if (k) {
                var v;
                if (t.type === 'checkbox') v = t.checked;
                else if (t.type === 'number') v = t.value === '' ? 0 : Number(t.value);
                else v = t.value;
                n[k] = v;
                afterEdit(k === 'text' || k === 'src' || k === 'place');
                return;
            }
            if (ck) {
                var ci = Number(t.getAttribute('data-ci'));
                var c = (n.choices || [])[ci];
                if (!c) return;
                if (ck === 'text') c.text = t.value;
                else if (ck === 'target') c.target = t.value;
                else if (ck === 'cond') c.cond = t.value;
                else if (ck === 'efname') {
                    if (!t.value) c.effects = [];
                    else {
                        c.effects = c.effects && c.effects.length ? c.effects : [{}];
                        c.effects[0].name = t.value;
                        if (!c.effects[0].op) c.effects[0].op = 'add';
                        if (c.effects[0].value == null) c.effects[0].value = 1;
                    }
                } else if (ck === 'efop') {
                    if (!c.effects || !c.effects.length) c.effects = [{ name: (P.vars[0] || {}).name || '' }];
                    c.effects[0].op = t.value;
                } else if (ck === 'efval') {
                    if (!c.effects || !c.effects.length) c.effects = [{ name: (P.vars[0] || {}).name || '' }];
                    c.effects[0].value = t.value;
                }
                afterEdit(ck === 'text');
                return;
            }
        });

        host.addEventListener('change', function (ev) {
            var t = ev.target;
            if (!t) return;
            var pick = t.getAttribute && t.getAttribute('data-pickasset');
            if (pick) {
                var n = P.nodes[sel];
                if (n) { n[pick] = t.value; renderInspector(); renderStage(); markDirty(); renderNodeList(); }
                return;
            }
        });

        host.addEventListener('click', function (ev) {
            var t = ev.target.closest ? ev.target : null;
            if (!t) return;
            var up = ev.target.closest('[data-upload]');
            if (up) {
                var key = up.getAttribute('data-upload');
                var n0 = P.nodes[sel];
                if (!n0) return;
                if (key === 'src' && n0.type === 'sound') {
                    pickAudio(function (dataUrl, f) {
                        var a0 = addAsset(dataUrl);
                        if (!a0) return;
                        n0.src = a0;
                        (P.assetNames = P.assetNames || {})[a0.slice(6)] = f.name.replace(/\.[^.]+$/, '');
                        renderInspector(); markDirty(); renderNodeList();
                    });
                } else {
                    pickFile('image/*', function (dataUrl, f) {
                        var a1 = addAsset(dataUrl);
                        if (!a1) return;
                        n0[key] = a1;
                        (P.assetNames = P.assetNames || {})[a1.slice(6)] = f.name.replace(/\.[^.]+$/, '');
                        renderInspector(); renderStage(); markDirty(); renderNodeList();
                    });
                }
                return;
            }
            var cop = ev.target.closest('[data-cop]');
            if (cop) {
                var act = cop.getAttribute('data-cop');
                var ci = Number(cop.getAttribute('data-ci'));
                var n1 = P.nodes[sel];
                if (!n1 || n1.type !== 'choice') return;
                if (act === 'add') n1.choices.push({ text: '', target: '', cond: '', effects: [] });
                else if (act === 'del') n1.choices.splice(ci, 1);
                else if (act === 'up' && ci > 0) {
                    var tmp = n1.choices[ci - 1]; n1.choices[ci - 1] = n1.choices[ci]; n1.choices[ci] = tmp;
                } else if (act === 'down' && ci < n1.choices.length - 1) {
                    var tmp2 = n1.choices[ci + 1]; n1.choices[ci + 1] = n1.choices[ci]; n1.choices[ci] = tmp2;
                }
                pushHistory();
                renderInspector(); renderNodeList(); markDirty();
                return;
            }
            var act2 = ev.target.closest('[data-act]');
            if (act2) {
                var a = act2.getAttribute('data-act');
                if (a === 'playhere') playFrom(sel);
                if (a === 'goto-char') switchTab('chars', true);
            }
        });
    }

    var afterEditDebounced = debounce(function (full) {
        renderStage();
        renderStatus();
    }, 120);
    function afterEdit(full) {
        markDirty();
        // 左侧摘要跟着变
        var row = $('gal-nodes').querySelector('.gal-node[data-index="' + sel + '"] .gal-node-t');
        var n = P.nodes[sel];
        if (row && n) row.textContent = nodeSummary(n);
        afterEditDebounced(full);
    }

    /* ------------------------------------------------------------------
       8. 舞台快照
       ------------------------------------------------------------------ */
    function computeStateAt(index) {
        var state = { bg: '', sprites: {}, say: null, vars: {}, place: '' };
        (P.vars || []).forEach(function (v) { if (v.name) state.vars[v.name] = parseValEditor(v.value); });
        var pc = 0;
        var guard = 0;
        var lastSay = null;
        while (pc <= index && pc < P.nodes.length && guard++ < 4000) {
            var n = P.nodes[pc];
            if (!n) { pc++; continue; }
            if (n.type === 'bg') {
                state.bg = n.src || '';
                state.place = n.place || '';
            } else if (n.type === 'show') {
                if (n.char) state.sprites[n.char] = { emo: n.emo || 'default', pos: n.pos || 'center' };
            } else if (n.type === 'hide') {
                if (n.char === 'all' || !n.char) state.sprites = {};
                else delete state.sprites[n.char];
            } else if (n.type === 'set') {
                applySetEditor(state.vars, n.name, n.op || 'set', n.value);
            } else if (n.type === 'say') {
                if (n.char && n.emo && state.sprites[n.char]) state.sprites[n.char].emo = n.emo;
                lastSay = { name: charName(n.char), color: (charById(n.char) || {}).color || '', text: n.text || '', narr: false };
                if (pc === index) state.place = state.place;
            } else if (n.type === 'narrate') {
                lastSay = { name: '', color: '', text: n.text || '', narr: true };
            } else if (n.type === 'choice' && pc === index) {
                lastSay = { name: '', color: '', text: '（选项）' + (n.prompt || ''), narr: true };
            } else if (n.type === 'end' && pc === index) {
                lastSay = { name: '', color: '', text: '（结局）' + (n.title || ''), narr: true };
            }
            pc++;
        }
        state.say = lastSay;
        return state;
    }
    function parseValEditor(raw) {
        if (raw == null) return '';
        var s = String(raw).trim();
        if (s === 'true') return true;
        if (s === 'false') return false;
        if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s);
        return s;
    }
    function applySetEditor(vars, name, op, raw) {
        if (!name) return;
        var v = parseValEditor(raw);
        var cur = vars[name];
        if (op === 'add') vars[name] = Number(cur || 0) + Number(v || 0);
        else if (op === 'sub') vars[name] = Number(cur || 0) - Number(v || 0);
        else if (op === 'mul') vars[name] = Number(cur || 0) * Number(v || 1);
        else if (op === 'append') vars[name] = String(cur == null ? '' : cur) + String(v);
        else if (op === 'toggle') vars[name] = !vars[name];
        else vars[name] = v;
    }

    function spriteSrcOf(cid, emo) {
        var c = charById(cid);
        if (!c) return '';
        var sp = c.sprites || {};
        if (emo && sp[emo]) return resolveSrc(sp[emo]);
        if (sp.default) return resolveSrc(sp.default);
        var keys = Object.keys(sp);
        for (var i = 0; i < keys.length; i++) if (sp[keys[i]]) return resolveSrc(sp[keys[i]]);
        return resolveSrc(c.avatar);
    }

    function renderStage() {
        var host = $('gal-stage');
        if (!host) return;
        var s = computeStateAt(sel);
        var skin = P.settings.skin || 'classic';
        var appCls = 'gv-app' + (skin !== 'classic' ? ' gv-skin-' + skin : '');
        var dim = (P.settings.dim == null ? 20 : P.settings.dim) / 100;
        var accent = P.settings.accent || '#e6c78a';
        var fs = (P.settings.fontSize || 17) + 'px';

        var html = '<div class="' + appCls + '" style="--gv-accent:' + esc(accent) + ';--gv-fs:' + esc(fs) +
            ';--gv-dim:' + dim + ';' + (P.settings.font ? '--gv-font:' + esc(P.settings.font) + ';' : '') + '">';
        html += '<div class="gv-bgs"><div class="gv-bg ' + (s.bg ? 'on' : 'on blank') + '" style="' +
            (s.bg ? 'background-image:url(&quot;' + esc(resolveSrc(s.bg)) + '&quot;)' : '') + '"></div></div>';
        html += '<div class="gv-dim"></div><div class="gv-vignette"></div><div class="gv-mood"></div>';
        html += '<div class="gv-sprites">';
        Object.keys(s.sprites).forEach(function (cid) {
            var sp = s.sprites[cid];
            var src = spriteSrcOf(cid, sp.emo);
            var posMap = { left: 18, center: 50, right: 82, farleft: 8, farright: 92 };
            var left = posMap[sp.pos] != null ? posMap[sp.pos] : 50;
            var dimCls = Object.keys(s.sprites).length > 1 && s.say && s.say.name && s.say.name !== charName(cid) ? ' dim' : '';
            html += '<div class="gv-sprite on' + dimCls + '" style="left:' + left + '%">';
            if (src) html += '<img src="' + esc(src) + '" alt="">';
            else html += '<div class="gal-sprite-ph"><i class="ri-user-line"></i><span>未配立绘</span></div>';
            html += '</div>';
        });
        html += '</div>';
        if (s.place) html += '<div class="gv-place on">' + esc(s.place) + '</div>';
        html += '<div class="gv-ui"><div class="gv-textbox on">';
        if (s.say && s.say.name) {
            html += '<div class="gv-name" style="color:' + esc(s.say.color || accent) + '">' + esc(s.say.name) + '</div>';
        } else {
            html += '<div class="gv-name"></div>';
        }
        if (s.say) {
            html += '<div class="gv-text' + (s.say.narr ? ' narration' : '') + '">' + esc(s.say.text) + '</div>';
            html += '<div class="gv-next on">▼</div>';
        } else {
            html += '<div class="gv-text gal-stage-prompt">（这个节点之前还没有台词，点左边任意一句看看）</div>';
        }
        html += '</div></div>';
        html += '</div>';

        host.innerHTML = html;
        fitStageScale();
        // 没有立绘时给个提示
        if (!Object.keys(s.sprites).length) {
            var tip = el('div', 'gal-stage-tip', '舞台上暂时没有立绘 · 用「立绘出场」节点放一个');
            tip.style.cssText = 'position:absolute;left:50%;bottom:34%;transform:translateX(-50%);font-size:11px;color:#5c6578;' +
                'background:rgba(0,0,0,.4);padding:3px 10px;border-radius:99px;pointer-events:none;z-index:3';
            host.appendChild(tip);
        }
    }

    function fitStageScale() {
        var box = $('gal-stage-box');
        var app = $('gal-stage').querySelector('.gv-app');
        if (!box || !app) return;
        var w = box.clientWidth || 800;
        var s = clamp(w / 1080, 0.72, 1.5);
        app.style.setProperty('--gv-scale', s.toFixed(3));
    }

    /* ------------------------------------------------------------------
       9. 右栏
       ------------------------------------------------------------------ */
    function switchTab(name, focusPane) {
        document.querySelectorAll('.gal-tabs button').forEach(function (b) {
            b.classList.toggle('on', b.getAttribute('data-tab') === name);
        });
        document.querySelectorAll('.gal-pane').forEach(function (p) {
            p.classList.toggle('on', p.getAttribute('data-pane') === name);
        });
        // 手机端：只有用户主动切栏时才跳过去，renderAll 的静默调用不能改视图
        if (focusPane && document.body.getAttribute('data-mtab') !== 'props') {
            document.body.setAttribute('data-mtab', 'props');
            document.querySelectorAll('.gal-mtab button').forEach(function (b) {
                b.classList.toggle('on', b.getAttribute('data-mtab') === 'props');
            });
        }
        if (name === 'chars') renderChars();
        if (name === 'assets') renderAssets();
        if (name === 'vars') renderVars();
        if (name === 'proj') renderProjPane();
    }

    function renderProjPane() {
        var host = $('gal-pane-proj');
        var s = P.settings;
        var html = '<div class="gal-pane-title">作品信息</div>';
        html += '<div class="gal-field"><label>标题</label><input class="gal-input" data-p="title" value="' + esc(P.title) + '"></div>';
        html += '<div class="gal-field"><label>副标题</label><input class="gal-input" data-p="settings.subtitle" value="' + esc(s.subtitle || '') + '" placeholder="A SHORT NIGHT"></div>';
        html += '<div class="gal-field"><label>作者</label><input class="gal-input" data-p="author" value="' + esc(P.author || '') + '"></div>';
        html += '<div class="gal-field"><label>封面 / 标题背景</label>' +
            '<div class="gal-thumb" style="' + (s.cover ? 'background-image:url(&quot;' + esc(resolveSrc(s.cover)) + '&quot;)' : '') + '">' +
            (s.cover ? '' : '未选择封面') + '</div>' +
            '<div class="gal-row"><input class="gal-input gal-grow" data-p="settings.cover" value="' + esc(s.cover) + '" placeholder="图片 URL">' +
            '<button type="button" class="gal-mini" data-pup="settings.cover"><i class="ri-upload-2-line"></i></button></div></div>';

        html += '<div class="gal-pane-title">画面</div>';
        html += '<div class="gal-field"><label>对话框样式</label><select data-p="settings.skin">';
        SKIN_LIST.forEach(function (o) {
            html += '<option value="' + o[0] + '"' + (s.skin === o[0] ? ' selected' : '') + '>' + o[1] + '</option>';
        });
        html += '</select></div>';
        html += '<div class="gal-field"><label>主题色</label><div class="gal-row">' +
            '<input type="color" class="gal-input" style="width:52px;padding:2px;height:34px" data-p="settings.accent" value="' + esc(s.accent) + '">' +
            '<input class="gal-input gal-grow" data-p="settings.accent" value="' + esc(s.accent) + '"></div></div>';
        html += '<div class="gal-field"><label>正文字号 <b id="gal-fs-val">' + s.fontSize + 'px</b></label>' +
            '<input type="range" min="13" max="26" step="1" data-p="settings.fontSize" value="' + s.fontSize + '" style="width:100%;accent-color:#e6c78a"></div>';
        html += '<div class="gal-field"><label>背景压暗 <b id="gal-dim-val">' + (s.dim || 0) + '%</b></label>' +
            '<input type="range" min="0" max="80" step="2" data-p="settings.dim" value="' + (s.dim || 0) + '" style="width:100%;accent-color:#e6c78a"></div>';
        html += '<div class="gal-field"><label>字体（CSS font-family，可留空）</label><input class="gal-input" data-p="settings.font" value="' + esc(s.font || '') + '" placeholder="例如 &quot;Songti SC&quot;, serif"></div>';
        html += '<label class="gal-inline-check"><input type="checkbox" data-p="settings.kenBurns" data-bool="1"' + (s.kenBurns ? ' checked' : '') + '> 背景缓慢推移（Ken Burns）</label>';

        html += '<div class="gal-pane-title">文字与节奏</div>';
        html += '<div class="gal-field"><label>默认文字速度 <b id="gal-spd-val">' + s.speed + '</b></label>' +
            '<input type="range" min="0" max="100" step="2" data-p="settings.speed" value="' + s.speed + '" style="width:100%;accent-color:#e6c78a">' +
            '<div class="gal-field-hint">玩家在游戏里还能自己再调，这里只是初始值。</div></div>';
        html += '<div class="gal-field"><label>自动播放间隔 <b id="gal-ad-val">' + ((s.autoDelay || 1600) / 1000).toFixed(1) + 's</b></label>' +
            '<input type="range" min="500" max="5000" step="100" data-p="settings.autoDelay" value="' + (s.autoDelay || 1600) + '" style="width:100%;accent-color:#e6c78a"></div>';

        html += '<div class="gal-pane-title">开场</div>';
        html += '<div class="gal-field"><label>从哪个标签开始</label><select data-p="settings.startLabel"><option value="">（从头开始）</option>';
        P.nodes.forEach(function (n, i) {
            if (n.type === 'label' && n.name) {
                html += '<option value="' + esc(n.name) + '"' + (s.startLabel === n.name ? ' selected' : '') + '>' +
                    esc(n.name) + (n.chapter ? '（' + esc(n.chapter) + '）' : '') + '</option>';
            }
        });
        html += '</select></div>';

        html += '<div class="gal-pane-title">体积</div>';
        html += '<div class="gal-stat-grid">' +
            '<div class="gal-stat-cell"><b>' + fmtSize(JSON.stringify(P).length) + '</b><span>剧本文本</span></div>' +
            '<div class="gal-stat-cell"><b>' + fmtSize(totalAssetBytes()) + '</b><span>内嵌素材</span></div>' +
            '</div>';
        html += '<div class="gal-field-hint">素材越大，导出的 HTML 越大。上传的图片会被压进文件里，所以尽量别放超大原图。</div>';

        host.innerHTML = html;
    }

    function renderChars() {
        var host = $('gal-pane-chars');
        var html = '<div class="gal-pane-title">角色 (' + P.chars.length + ')</div>';
        if (!P.chars.length) {
            html += '<div class="gal-hint-empty">还没有角色。<br>点下面的按钮加一个，才能写「谁在说话」。</div>';
        }
        P.chars.forEach(function (c, ci) {
            var av = resolveSrc(c.avatar);
            var nSp = Object.keys(c.sprites || {}).filter(function (k) { return c.sprites[k]; }).length;
            html += '<div class="gal-char" data-ci="' + ci + '">';
            html += '<div class="gal-char-head">' +
                '<div class="gal-char-av" style="' + (av ? 'background-image:url(&quot;' + esc(av) + '&quot;)' : '') + '">' +
                (av ? '' : '<i class="ri-user-line"></i>') + '</div>' +
                '<div><div class="gal-char-name">' + esc(c.name || '未命名角色') + '</div>' +
                '<div class="gal-char-sub">' + (nSp ? nSp + ' 张立绘' : '还没有立绘') + '</div></div>' +
                '<span class="gal-flex"></span>' +
                '<button type="button" class="gal-iconbtn" data-cact="del" data-ci="' + ci + '" title="删除角色"><i class="ri-delete-bin-line"></i></button>' +
                '<button type="button" class="gal-iconbtn" data-cact="toggle" data-ci="' + ci + '" title="展开"><i class="ri-arrow-down-s-line"></i></button>' +
                '</div>';
            html += '<div class="gal-char-body">';
            html += '<div class="gal-field"><label>名字</label><input class="gal-input sm" data-cf="name" data-ci="' + ci + '" value="' + esc(c.name || '') + '"></div>';
            html += '<div class="gal-field"><label>名字颜色</label><div class="gal-row">' +
                '<input type="color" class="gal-input sm" style="width:44px;padding:1px;height:28px" data-cf="color" data-ci="' + ci + '" value="' + esc(c.color || '#e6c78a') + '">' +
                '<input class="gal-input sm gal-grow" data-cf="color" data-ci="' + ci + '" value="' + esc(c.color || '#e6c78a') + '"></div></div>';
            html += '<div class="gal-field"><label>头像</label><div class="gal-row">' +
                '<input class="gal-input sm gal-grow" data-cf="avatar" data-ci="' + ci + '" value="' + esc(c.avatar || '') + '" placeholder="URL 或上传">' +
                '<button type="button" class="gal-mini" data-cup="avatar" data-ci="' + ci + '"><i class="ri-upload-2-line"></i></button></div></div>';
            html += '<div class="gal-field"><label>立绘（按表情）</label>';
            EMO_LIST.forEach(function (emo) {
                var v = (c.sprites || {})[emo] || '';
                var prev = resolveSrc(v);
                html += '<div class="gal-sprite-row">' +
                    '<span class="gal-emo">' + (EMO_ZH[emo] || emo) + '</span>' +
                    '<input class="gal-input sm" data-cs="' + emo + '" data-ci="' + ci + '" value="' + esc(v) + '" placeholder="留空">' +
                    '<div class="gal-sprite-prev" style="' + (prev ? 'background-image:url(&quot;' + esc(prev) + '&quot;)' : '') + '"></div>' +
                    '<button type="button" class="gal-iconbtn" data-cup="sprite" data-cs="' + emo + '" data-ci="' + ci + '"><i class="ri-upload-2-line"></i></button>' +
                    '</div>';
            });
            html += '</div></div></div>';
        });
        html += '<button type="button" class="gal-add-sub" data-cact="add"><i class="ri-add-line"></i> 新建角色</button>';
        html += '<div class="gal-field-hint" style="margin-top:10px">立绘建议用<b>透明背景的 PNG</b>，人物脚底贴着画布下沿，这样站在舞台上才不会悬空或切头。</div>';
        host.innerHTML = html;
    }

    /* ---------------- 跨作品素材库（IndexedDB） ----------------
       和下面「本作品素材」是两回事：
         · 本作品素材（P.assets）跟着工程 JSON 走，存在 localStorage，容量有限；
         · 素材库（GalLib）存在 IndexedDB，所有作品共用，放几十张背景也没事。
       引用写法不同：本作品是 asset:<id>，素材库是 lib:<id>。 */
    var LIB = { loaded: false, loading: false, items: [], err: '' };

    function loadLib(cb) {
        if (!window.GalLib) { LIB.err = '素材库模块没加载'; cb && cb(); return; }
        if (LIB.loaded) { cb && cb(); return; }
        if (LIB.loading) return;
        LIB.loading = true;
        window.GalLib.preload()
            .then(function () { return window.GalLib.list(); })
            .then(function (items) {
                LIB.items = items || [];
                LIB.loaded = true;
                LIB.err = '';
            })
            .catch(function (e) {
                LIB.err = (e && e.message) || '素材库打不开';
            })
            .then(function () {
                LIB.loading = false;
                cb && cb();
            });
    }

    function libUsedIds() {
        var used = {};
        function scan(v) { if (isLibRef(v)) used[v.slice(4)] = (used[v.slice(4)] || 0) + 1; }
        P.nodes.forEach(function (n) { Object.keys(n).forEach(function (k) { scan(n[k]); }); });
        P.chars.forEach(function (c) {
            scan(c.avatar);
            Object.keys(c.sprites || {}).forEach(function (k) { scan(c.sprites[k]); });
        });
        scan(P.settings.cover);
        return used;
    }

    function renderLibBlock() {
        var html = '<div class="gal-pane-title gal-lib-title">' +
            '<i class="ri-archive-2-line"></i> 素材库 <span class="gal-chip" id="gal-lib-count">' +
            (LIB.loaded ? LIB.items.length : '…') + '</span></div>';
        html += '<div class="gal-lib-sub">所有作品共用，存在浏览器本地，不占剧本的存储额度。</div>';

        if (LIB.err) {
            html += '<div class="gal-hint-empty">素材库读不出来：' + esc(LIB.err) + '<br>' +
                '可能是浏览器禁用了本地存储，换个窗口（或退出无痕模式）再试。</div>';
            return html;
        }
        if (!LIB.loaded) {
            html += '<div class="gal-hint-empty">正在读取素材库…</div>';
            return html;
        }

        html += '<div class="gal-row" style="margin-bottom:8px">' +
            '<button type="button" class="gal-add-sub" style="flex:1" data-libact="upload">' +
            '<i class="ri-upload-cloud-2-line"></i> 上传素材</button>' +
            '<button type="button" class="gal-add-sub" style="flex:0 0 auto;width:auto;padding:6px 9px" data-libact="manage" title="批量管理">' +
            '管理</button></div>';

        if (!LIB.items.length) {
            html += '<div class="gal-hint-empty">素材库还是空的。<br>' +
                '把背景图、立绘、BGM 传进来，以后每个作品都能直接用 —— 也包括让 AI 拆分剧本时挑图。</div>';
            return html;
        }

        var usedLib = libUsedIds();
        html += '<div class="gal-lib-grid">';
        LIB.items.forEach(function (it) {
            var t = window.GalLib ? window.GalLib.thumb(it.id) : '';
            var n = usedLib[it.id] || 0;
            html += '<div class="gal-lib-item" draggable="false" data-libid="' + esc(it.id) + '" ' +
                'title="' + esc(it.name + (n ? '（本作品用了 ' + n + ' 处）' : '（本作品未使用）')) + '">';
            html += '<div class="gal-lib-thumb" style="' + (t ? 'background-image:url(&quot;' + esc(t) + '&quot;)' : '') + '">' +
                (it.kind === 'audio' ? '<i class="ri-music-2-line"></i>' : (t ? '' : '<i class="ri-image-line"></i>')) +
                (n ? '<span class="gal-lib-use">' + n + '</span>' : '') + '</div>';
            html += '<div class="gal-lib-meta"><b>' + esc(it.name) + '</b>' +
                '<span>' + (it.kind === 'audio' ? '音频' : (it.w ? it.w + '×' + it.h : '图片')) +
                ' · ' + fmtSize(it.size) + '</span></div>';
            html += '<div class="gal-lib-ops">' +
                '<button type="button" data-librn="' + esc(it.id) + '" title="重命名"><i class="ri-edit-line"></i></button>' +
                '<button type="button" data-libdel="' + esc(it.id) + '" title="删除"><i class="ri-delete-bin-line"></i></button>' +
                '</div>';
            html += '</div>';
        });
        html += '</div>';
        html += '<div class="gal-field-hint">点一张 = 设为当前节点的背景（音频则设为当前音效节点的音源）。' +
            '右上角 × 删除，铅笔改名。这里的增删不影响任何已有作品的文件，只是引用会变空。</div>';
        return html;
    }

    /* 点素材库里的一张图：优先填当前节点；当前节点不合适就顺手插一个能用的节点，
       别让人点了没反应。 */
    function applyLibToNode(id, meta) {
        if (!meta) return;
        var n = P.nodes[sel];
        if (meta.kind === 'audio') {
            if (n && n.type === 'sound') {
                pushHistory();
                n.src = 'lib:' + id;
                renderInspector(); renderStage(); markDirty();
                toast('已设为当前节点的音源');
                return;
            }
            var s = mkNode('sound', { src: 'lib:' + id, channel: 'bgm', action: 'play' });
            var at = n ? sel + 1 : P.nodes.length;
            P.nodes.splice(at, 0, s);
            sel = at;
            pushHistory(); renderAll(); markDirty();
            toast('已插入一个「音乐音效」节点');
            return;
        }
        if (n && n.type === 'bg') {
            pushHistory();
            n.src = 'lib:' + id;
            renderInspector(); renderStage(); renderAssets(); markDirty();
            toast('已设为当前节点的背景');
            return;
        }
        var b = mkNode('bg', { src: 'lib:' + id, transition: 'fade' });
        var at2 = n ? sel + 1 : P.nodes.length;
        P.nodes.splice(at2, 0, b);
        sel = at2;
        pushHistory(); renderAll(); markDirty();
        toast('已插入一个「背景」节点');
    }

    /* ------------------------------------------------------------------
       剧本转 GAL
       —— 把一段剧本交给用户自己配的模型，换回节点。调用与解析在 gal-ai.js，
          这里只管界面、出错时怎么说话、以及「写进哪个作品」。
       ------------------------------------------------------------------ */
    var AI_BUSY = false;
    var AI_RESULT = null;

    function aiModelLine() {
        if (!window.GalAI) return 'AI 模块没加载';
        var cfg = GalAI.readConfig();
        if (!cfg.ok) return '还没配置 API';
        var proto = { openai: 'OpenAI 兼容', anthropic: 'Claude', gemini: 'Gemini' }[cfg.protocol] || cfg.protocol;
        return cfg.siteName + ' · ' + cfg.model + ' · ' + proto;
    }

    /* 素材库读取的最长等待：超过就直接开弹窗，不能让用户对着一个没反应的按钮发呆。 */
    var AI_LIB_WAIT = 1200;

    function openAIDialog() {
        if (!window.GalAI) { toast('AI 模块没加载，刷新页面再试'); return; }

        /* 【曾经的坑】原来这里 return 在 GalLib.list() 的 then 里面：素材库读不出来
           （IndexedDB 被别的标签页占住、隐私模式、库太大读盘卡住）时那个 Promise
           可能永远不结算 —— 弹窗压根不开，也不报错不提示，用户看到的就是「点了没反应」。
           现在：先用缓存里的素材立刻把弹窗画出来，再把新鲜列表补进去。
           任何异常都只影响「能不能配图」，绝不影响弹窗。 */
        var opened = false;
        function open() {
            if (opened) return;
            opened = true;
            try { renderAIDialog(); } catch (e) {
                showModal('剧本转 GAL', '<div class="gal-ai-warn">弹窗渲染出错了：' + esc((e && e.message) || e) + '</div>',
                    [{ label: '知道了', cls: 'gal-btn', cb: closeModal }], true);
            }
        }

        var timer = setTimeout(open, AI_LIB_WAIT);
        var p = null;
        try {
            if (window.GalLib && typeof window.GalLib.list === 'function') p = window.GalLib.list();
        } catch (e) {
            LIB.err = (e && e.message) || '素材库读不出来';
        }

        if (!p || typeof p.then !== 'function') {
            if (!LIB.loaded && !LIB.err) LIB.err = '素材库模块没加载';
            clearTimeout(timer);
            open();
            return;
        }

        p.then(function (items) {
            LIB.items = items || [];
            LIB.loaded = true;
            LIB.err = '';
        }, function (e) {
            LIB.err = (e && e.message) || '素材库打不开';
        }).then(function () {
            clearTimeout(timer);
            if (!opened) { open(); return; }
            /* 弹窗已经开着了：只补素材数，不重画——重画会把用户刚粘进去的剧本清掉。 */
            refreshAILibCounts();
        });
    }

    /* 弹窗开着的时候素材库才读完：只更新「库里 N 图 / M 音频」那一行和勾选框状态。 */
    function refreshAILibCounts() {
        var imgs = LIB.items.filter(function (x) { return x.kind === 'image'; }).length;
        var auds = LIB.items.filter(function (x) { return x.kind === 'audio'; }).length;
        var note = $('gal-ai-assets-note');
        if (note) note.textContent = '（库里 ' + imgs + ' 图 / ' + auds + ' 音频）';
        var cb = $('gal-ai-assets');
        if (cb) {
            if (imgs || auds) { cb.disabled = false; cb.checked = true; }
            else { cb.disabled = true; cb.checked = false; }
        }
        var errBox = $('gal-ai-lib-err');
        if (errBox) {
            errBox.innerHTML = LIB.err
                ? '<div class="gal-field-hint" style="margin-top:6px;color:#c9925a">' +
                  '<i class="ri-image-off-line"></i> 素材库这次没读出来（' + esc(LIB.err) +
                  '），这一轮不给你配图，剧情照常拆。</div>'
                : '';
        }
    }

    function renderAIDialog() {
        var cfg = GalAI.readConfig();
        var hint = GalAI.configHint();
        var imgs = LIB.items.filter(function (x) { return x.kind === 'image'; }).length;
        var auds = LIB.items.filter(function (x) { return x.kind === 'audio'; }).length;

        var html = '';
        html += '<div class="gal-ai-bar"><i class="ri-cpu-line"></i><span id="gal-ai-model">' +
            esc(aiModelLine()) + '</span><button type="button" class="gal-btn" id="gal-ai-go-config" style="height:26px;padding:0 9px;font-size:11.5px">改配置</button></div>';
        if (hint) html += '<div class="gal-ai-warn"><i class="ri-error-warning-line"></i> ' + esc(hint) + '</div>';

        html += '<div class="gal-field"><label>剧本 / 大纲</label>' +
            '<textarea id="gal-ai-outline" class="gal-input gal-ai-textarea" placeholder="' +
            esc('在这里贴：小说片段、剧情大纲、几句对白、人物设定，都可以。\n\n例子：\n雨夜，便利店的灯坏了一半。值夜班的店员认识这个每周三凌晨来买同一款饭团的女人，但从来没说过话。今天她没买饭团，只是站在门口，看着雨。') +
            '"></textarea></div>';

        html += '<div class="gal-row" style="gap:10px">';
        html += '<div class="gal-field" style="flex:1;margin:0"><label>节点数</label>' +
            '<select class="gal-select" id="gal-ai-span" style="width:100%">' +
            '<option value="short">短篇 · 25~40 节点</option>' +
            '<option value="medium" selected>中篇 · 45~70 节点</option>' +
            '<option value="long">长篇 · 90~140 节点</option>' +
            '</select></div>';
        html += '<div class="gal-field" style="flex:1;margin:0"><label>分支</label>' +
            '<select class="gal-select" id="gal-ai-branch" style="width:100%">' +
            '<option value="yes" selected>要分支 + 多结局</option>' +
            '<option value="none">一条直线走到底</option>' +
            '</select></div>';
        html += '</div>';

        html += '<label class="gal-inline-check" style="margin-top:8px">' +
            '<input type="checkbox" id="gal-ai-assets"' + (imgs || auds ? ' checked' : ' disabled') + '>' +
            ' 让 AI 从素材库里挑背景' +
            '<span id="gal-ai-assets-note" style="color:#7d8496">（库里 ' + imgs + ' 图 / ' + auds + ' 音频）</span></label>';

        /* 素材库读不出来不该影响「拆剧本」，但要说清楚为什么没有图可选。 */
        html += '<div id="gal-ai-lib-err"></div>';

        html += '<div class="gal-field-hint" style="margin-top:6px">' +
            'AI 只会写台词、旁白、出场、分支这些<b>文字层</b>的东西。图片和音乐用素材库里你传的，' +
            '它按名字和标签挑；挑不到就留空，不会瞎编文件名。</div>';
        html += '<div class="gal-ai-tip" id="gal-ai-tip">拆完会先给你看统计，确认了才写进作品。</div>';

        showModal('剧本转 GAL', html, [
            { label: '取消', cls: 'gal-btn', cb: closeModal },
            { label: '开始拆分', cls: 'gal-btn primary', cb: function () { aiGenerate(); } }
        ], true);

        refreshAILibCounts();

        var cfgBtn = $('gal-ai-go-config');
        if (cfgBtn) {
            cfgBtn.addEventListener('click', function () {
                window.open('index.html', '_blank');
                toast('在主站「设置 → API」里配好，回这个页面刷新即可');
            });
        }
    }

    async function aiGenerate() {
        if (AI_BUSY) return;
        var ta = $('gal-ai-outline');
        var outline = ta ? String(ta.value || '').trim() : '';
        if (outline.length < 8) { toast('先写几句，AI 才有东西可拆'); if (ta) ta.focus(); return; }

        var cfg = GalAI.readConfig();
        var hint = GalAI.configHint();
        if (hint) {
            toast(hint);
            return;
        }

        var span = ($('gal-ai-span') || {}).value || 'medium';
        var branch = (($('gal-ai-branch') || {}).value || 'yes') !== 'none';
        var wantAssets = !!($('gal-ai-assets') && $('gal-ai-assets').checked);
        var assets = wantAssets ? LIB.items.slice(0, 60) : [];

        AI_BUSY = true;
        var t0 = Date.now();
        var tip = $('gal-ai-tip');
        var btn = null;
        var foot = $('gal-modal-foot');
        if (foot) {
            btn = foot.querySelector('button.primary');
            if (btn) { btn.disabled = true; btn.textContent = '正在写…'; }
        }
        if (tip) { tip.className = 'gal-ai-tip busy'; tip.textContent = '模型正在写…'; }
        var tick = setInterval(function () {
            if (!tip) return;
            tip.textContent = '模型正在写…已等 ' + Math.round((Date.now() - t0) / 1000) + ' 秒。长剧本要 1~3 分钟，别关页面。';
        }, 900);

        try {
            var messages = [
                { role: 'system', content: GalAI.systemPrompt({ span: span, branch: branch, useAssets: assets.length > 0 }, assets, P.chars) },
                { role: 'user', content: outline }
            ];
            var text = await GalAI.callModel(cfg, messages);
            var raw = null;
            try {
                raw = GalAI.extractJson(text);
            } catch (e1) {
                /* 模型偶尔会先在 JSON 前面寒暄两句。给它一次机会，明确要求只输出 JSON。 */
                messages.push({ role: 'assistant', content: String(text).slice(0, 3000) });
                messages.push({ role: 'user', content: '上面这段不是合法 JSON。请重新输出：只给那一个 JSON 对象，第一个字符必须是 {，不要任何解释。' });
                text = await GalAI.callModel(cfg, messages);
                raw = GalAI.extractJson(text);
            }

            var res = GalAI.normalize(raw, {
                assets: assets,
                fallbackTitle: (outline.split('\n')[0] || '').replace(/[#*「」]/g, '').slice(0, 18)
            });
            AI_RESULT = res;
            showAIResult(res);
        } catch (err) {
            showAIError(err);
        } finally {
            clearInterval(tick);
            AI_BUSY = false;
            if (btn) { btn.disabled = false; btn.textContent = '开始拆分'; }
        }
    }

    function showAIError(err) {
        var msg = (err && err.message) || '未知错误';
        var friendly = msg;
        if (/abort/i.test(msg)) friendly = '等太久了，请求被浏览器掐断。剧本短一点，或者换个快一点的模型。';
        else if (/Failed to fetch|NetworkError|Load failed/i.test(msg)) {
            friendly = '请求发不出去。多半是接口不允许浏览器直连（CORS），或者地址填错了。\n本地跑的服务要带跨域头；中转站要确认支持网页调用。';
        }
        var body = $('gal-modal-body');
        if (!body) return;
        body.innerHTML = '<div class="gal-ai-fail"><i class="ri-emotion-sad-line"></i>' +
            '<div><b>这次没成</b><div class="gal-ai-fail-msg">' + esc(friendly) + '</div>' +
            '<div class="gal-field-hint" style="margin-top:8px">原始信息：' + esc(msg) + '</div></div></div>';
        var tip = $('gal-ai-tip');
        if (tip) { tip.className = 'gal-ai-tip'; tip.textContent = '可以改改剧本再试一次。'; }
        var foot = $('gal-modal-foot');
        if (foot) {
            foot.innerHTML = '';
            var back = el('button', 'gal-btn', '返回修改');
            back.type = 'button';
            back.onclick = function () { openAIDialog(); };
            var close = el('button', 'gal-btn primary', '知道了');
            close.type = 'button';
            close.onclick = closeModal;
            foot.appendChild(back);
            foot.appendChild(close);
        }
    }

    function showAIResult(res) {
        var s = res.stats || {};
        var body = $('gal-modal-body');
        if (!body) return;

        var html = '<div class="gal-ai-done">';
        html += '<div class="gal-ai-done-title"><i class="ri-checkbox-circle-line"></i> 写好了：' +
            esc(res.title) + '</div>';
        html += '<div class="gal-ai-stats">' +
            '<span><b>' + (s.nodes || 0) + '</b> 节点</span>' +
            '<span><b>' + (s.says || 0) + '</b> 台词</span>' +
            '<span><b>' + (s.labels || 0) + '</b> 标签</span>' +
            '<span><b>' + (s.ends || 0) + '</b> 结局</span>' +
            '<span><b>' + (s.libs || 0) + '</b> 处用图</span>' +
            '</div>';

        if (res.chars.length) {
            html += '<div class="gal-ai-chars">' + res.chars.map(function (c) {
                return '<span><i style="background:' + esc(c.color) + '"></i>' + esc(c.name) + '</span>';
            }).join('') + '</div>';
        }

        if (res.warnings.length) {
            html += '<div class="gal-ai-warnbox"><b>有几处我替你处理了：</b><ul>' +
                res.warnings.slice(0, 8).map(function (w) { return '<li>' + esc(w) + '</li>'; }).join('') +
                (res.warnings.length > 8 ? '<li>……还有 ' + (res.warnings.length - 8) + ' 条</li>' : '') +
                '</ul></div>';
        }

        html += '<div class="gal-ai-preview"><b>开头几句</b><div class="gal-ai-lines">';
        var shown = 0;
        res.nodes.forEach(function (n) {
            if (shown >= 6) return;
            if (n.type === 'say') {
                var c = res.chars.filter(function (x) { return x.id === n.char; })[0];
                html += '<p><em>' + esc(c ? c.name : '？') + '</em>' + esc(n.text) + '</p>';
                shown++;
            } else if (n.type === 'narrate') {
                html += '<p class="n">' + esc(n.text) + '</p>';
                shown++;
            } else if (n.type === 'bg') {
                html += '<p class="d">［场景' + (n.place ? '：' + esc(n.place) : '') + '］</p>';
                shown++;
            }
        });
        html += '</div></div>';
        html += '<div class="gal-field-hint">写进作品之后，节点和台词都能照常改。AI 只是把骨架搭出来。</div>';
        html += '</div>';

        body.innerHTML = html;

        var foot = $('gal-modal-foot');
        foot.innerHTML = '';

        var play = el('button', 'gal-btn', '新建并试玩');
        play.type = 'button';
        play.onclick = function () { applyAI(res, 'new', true); };

        var asNew = el('button', 'gal-btn primary', '建成新作品');
        asNew.type = 'button';
        asNew.onclick = function () { applyAI(res, 'new', false); };

        var append = el('button', 'gal-btn', '接到当前作品末尾');
        append.type = 'button';
        append.title = '保留现在写的内容，把 AI 的节点接在后面';
        append.onclick = function () { applyAI(res, 'append', false); };

        var again = el('button', 'gal-btn', '再写一版');
        again.type = 'button';
        again.onclick = function () { openAIDialog(); };

        foot.appendChild(again);
        foot.appendChild(append);
        foot.appendChild(asNew);
        foot.appendChild(play);
    }

    function applyAI(res, mode, autoPlay) {
        if (!res || !res.nodes.length) { toast('没有可用的节点'); return; }

        if (mode === 'append') {
            if (!confirm('把 ' + res.nodes.length + ' 个节点接到当前作品末尾？\n\n原来的内容不会动，但两段之间的剧情衔接要你自己顺一下。')) return;
            pushHistory();
            var start = P.nodes.length;
            res.nodes.forEach(function (n) { P.nodes.push(n); });
            res.chars.forEach(function (c) {
                if (!P.chars.some(function (x) { return x.name === c.name; })) {
                    P.chars.push({ id: c.id, name: c.name, color: c.color, avatar: '', sprites: {} });
                }
            });
            res.vars.forEach(function (v) {
                if (!P.vars.some(function (x) { return x.name === v.name; })) P.vars.push({ name: v.name, value: v.value });
            });
            sel = start;
            markDirty();
            renderAll();
            closeModal();
            toast('已接到末尾（' + res.nodes.length + ' 个节点，可撤销）');
            return;
        }

        var p = blankProject(false);
        p.title = res.title || 'AI 生成的作品';
        p.settings.subtitle = res.subtitle || '';
        p.chars = res.chars.map(function (c) {
            return { id: c.id, name: c.name, color: c.color, avatar: '', sprites: {} };
        });
        p.vars = res.vars.map(function (v) { return { name: v.name, value: v.value }; });
        p.nodes = res.nodes;

        if (!saveProject(p)) {
            toast('存不下：浏览器存储可能满了。先去主站清理一下，或删掉几个旧作品。');
            return;
        }
        try { localStorage.setItem(LS_CUR, p.id); } catch (e) { /* 忽略 */ }
        P = ensureProject(p);
        sel = 0;
        history = [];
        histPos = -1;
        pushHistory();
        setSaveState('saved');
        $('gal-project-title').value = P.title;
        renderAll();
        closeModal();
        toast('已建成《' + P.title + '》，' + P.nodes.length + ' 个节点');
        if (autoPlay) setTimeout(function () { playFrom(0); }, 260);
    }

    function renderAssets() {
        var host = $('gal-pane-assets');
        var ids = Object.keys(P.assets);
        var html = renderLibBlock();

        html += '<div class="gal-pane-title gal-lib-title" style="margin-top:18px">' +
            '<i class="ri-folder-image-line"></i> 本作品素材 (' + ids.length + ')</div>';
        html += '<div class="gal-lib-sub">跟着这个作品走，会一起导出进 HTML、也会占用剧本的存储额度。</div>';
        html += '<div class="gal-row" style="margin-bottom:8px">' +
            '<button type="button" class="gal-add-sub" style="flex:1" data-aact="upload"><i class="ri-upload-2-line"></i> 上传图片</button>' +
            '<button type="button" class="gal-add-sub" style="flex:1" data-aact="url"><i class="ri-link"></i> 从网址添加</button></div>';
        if (!ids.length) {
            html += '<div class="gal-hint-empty">这个作品还没单独存图。<br>不填背景时用内置的深色渐变，一样能读。</div>';
        } else {
            var used = usedAssets();
            html += '<div class="gal-asset-grid">';
            ids.forEach(function (id) {
                html += '<div class="gal-asset" data-aid="' + esc(id) + '" style="background-image:url(&quot;' +
                    esc(P.assets[id]) + '&quot;)" title="点击设为当前节点背景">' +
                    '<button type="button" class="gal-asset-del" data-adel="' + esc(id) + '"><i class="ri-close-line"></i></button>' +
                    '<div class="gal-asset-name">' + esc((P.assetNames || {})[id] || ('图片 ' + id.slice(-3))) +
                    (used[id] ? '' : ' · 未使用') + '</div></div>';
            });
            html += '</div>';
            html += '<div class="gal-field-hint">点一张图 = 把它设成当前节点的背景；右上角 × 删除（删除不会自动清理引用，会变成空背景）。</div>';
        }
        host.innerHTML = html;
    }

    function renderVars() {
        var host = $('gal-pane-vars');
        var html = '<div class="gal-pane-title">变量 (' + P.vars.length + ')</div>';
        if (!P.vars.length) {
            html += '<div class="gal-hint-empty">还没有变量。<br>变量用来记「好感度」「是否看过信」这类状态，配合「条件判断」和选项的条件就能做分支。</div>';
        }
        P.vars.forEach(function (v, i) {
            html += '<div class="gal-var-row">' +
                '<input class="gal-input sm" data-vf="name" data-vi="' + i + '" value="' + esc(v.name) + '" placeholder="变量名">' +
                '<input class="gal-input sm" data-vf="value" data-vi="' + i + '" value="' + esc(v.value) + '" placeholder="初始值">' +
                '<button type="button" class="gal-iconbtn danger" data-vdel="' + i + '"><i class="ri-delete-bin-line"></i></button>' +
                '</div>';
        });
        html += '<button type="button" class="gal-add-sub" data-vadd="1"><i class="ri-add-line"></i> 新建变量</button>';
        html += '<div class="gal-pane-title">条件语法</div>';
        html += '<div class="gal-field-hint" style="line-height:2">' +
            '写法：<code>变量 运算符 值</code><br>' +
            '运算符：<code>&gt;=</code> <code>&lt;=</code> <code>&gt;</code> <code>&lt;</code> <code>==</code> <code>!=</code> <code>~=</code>（包含文字）<br>' +
            '多个条件：<code>&amp;&amp;</code> 并且、<code>||</code> 或者<br>' +
            '例子：<code>好感 &gt;= 3 &amp;&amp; 看过信 == true</code><br>' +
            '单个变量名可以直接写，非 0 / 非空 / 非 false 就算成立。<br>' +
            '值不加引号时按数字或布尔解析，加引号按文字。</div>';

        var hasVars = P.vars.length;
        if (hasVars) {
            html += '<div class="gal-pane-title">当前默认值</div>';
            html += '<div class="gal-field-hint">' + P.vars.map(function (v) {
                return '<code>' + esc(v.name) + '</code> = ' + esc(v.value);
            }).join('　') + '</div>';
        }
        host.innerHTML = html;
    }

    /* ------------------------------------------------------------------
       10. 节点操作
       ------------------------------------------------------------------ */
    function selectNode(i, noRender) {
        if (i < 0 || i >= P.nodes.length) return;
        if (i === sel && !noRender) { renderInspector(); return; }
        sel = i;
        document.querySelectorAll('.gal-node').forEach(function (r) {
            var on = Number(r.dataset.index) === i;
            r.classList.toggle('on', on);
            r.setAttribute('aria-selected', on ? 'true' : 'false');
        });
        scrollSelIntoView();
        renderInspector();
        renderStage();
        renderStatus();
    }

    function addNode(type, at) {
        if (!P.nodes.length && !at) at = 0;
        if (at == null) at = sel + 1 > P.nodes.length ? P.nodes.length : sel + 1;
        var n = mkNode(type);
        if (type === 'choice') n.choices = [{ text: '', target: '', cond: '', effects: [] }, { text: '', target: '', cond: '', effects: [] }];
        if (type === 'show' && P.chars[0]) n.char = P.chars[0].id;
        if (type === 'say' && P.chars[0]) n.char = P.chars[0].id;
        if (type === 'set' && P.vars[0]) n.name = P.vars[0].name;
        P.nodes.splice(at, 0, n);
        sel = at;
        pushHistory();          // 记录「改动之后」的状态，撤销才能回到上一步
        renderAll();
        markDirty();
        var host = $('gal-nodes');
        setTimeout(function () {
            var row = host.querySelector('.gal-node[data-index="' + at + '"]');
            if (row) host.scrollTop = row.offsetTop - host.clientHeight / 2 + row.offsetHeight;
        }, 0);
    }

    function deleteNode(i) {
        if (!P.nodes[i]) return;
        P.nodes.splice(i, 1);
        sel = clamp(i, 0, Math.max(0, P.nodes.length - 1));
        pushHistory();
        renderAll();
        markDirty();
    }

    function moveNode(from, to) {
        if (from === to || from < 0 || to < 0 || from >= P.nodes.length) return;
        var n = P.nodes.splice(from, 1)[0];
        if (to > from) to--;
        P.nodes.splice(clamp(to, 0, P.nodes.length), 0, n);
        sel = P.nodes.indexOf(n);
        pushHistory();
        renderAll();
        markDirty();
    }

    function duplicateNode(i) {
        var src = P.nodes[i];
        if (!src) return;
        var copy = JSON.parse(JSON.stringify(src));
        copy.id = uid('n');
        P.nodes.splice(i + 1, 0, copy);
        sel = i + 1;
        pushHistory();
        renderAll();
        markDirty();
    }

    function renderAll() {
        renderNodeList();
        renderInspector();
        renderStage();
        renderStatus();
        var active = document.querySelector('.gal-tabs button.on');
        switchTab(active ? active.getAttribute('data-tab') : 'proj');
    }

    /* ------------------------------------------------------------------
       11. 工程操作
       ------------------------------------------------------------------ */
    function newProject(withDemo) {
        var p = blankProject(withDemo);
        saveProject(p);
        try { localStorage.setItem(LS_CUR, p.id); } catch (e) { /* 忽略 */ }
        P = p;
        sel = 0;
        history = [];
        histPos = -1;
        pushHistory();
        setSaveState('saved');
        renderAll();
        toast(withDemo ? '已创建示例作品' : '已新建空作品');
    }

    function openProject(id) {
        var p = loadProject(id);
        if (!p) { toast('找不到这个作品'); return; }
        P = ensureProject(p);
        sel = 0;
        history = [];
        histPos = -1;
        pushHistory();
        try { localStorage.setItem(LS_CUR, P.id); } catch (e) { /* 忽略 */ }
        setSaveState('saved');
        renderAll();
        closeModal();
        toast('已打开《' + (P.title || '未命名作品') + '》');
    }

    var pendingImport = null;
    function importProjectJSON() {
        pickFile('.json,application/json', function (text, file) {
            var obj = null;
            try { obj = JSON.parse(text); } catch (e) { obj = null; }
            if (!obj || !Array.isArray(obj.nodes)) { toast('这不是有效的工程文件'); return; }
            if (obj.projects) { toast('这是「全部作品」备份，请用菜单里的导入'); return; }
            var p = ensureProject(obj);
            p.id = uid('p');
            p.title = (p.title || '导入的作品') + '';
            saveProject(p);
            try { localStorage.setItem(LS_CUR, p.id); } catch (e) { /* 忽略 */ }
            P = p; sel = 0; history = []; histPos = -1; pushHistory();
            setSaveState('saved');
            renderAll();
            closeModal();
            toast('已导入《' + p.title + '》，共 ' + p.nodes.length + ' 个节点');
        });
    }

    function download(filename, content, mime) {
        var blob = new Blob([content], { type: mime || 'text/plain;charset=utf-8' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        setTimeout(function () {
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }, 1500);
    }

    function safeFileName(s) {
        return String(s || '未命名作品').replace(/[\\/:*?"<>|\n\r\t]/g, '_').slice(0, 60);
    }

    function exportProjectJSON() {
        download(safeFileName(P.title) + '.gal.json', JSON.stringify(P, null, 2), 'application/json');
        toast('工程 JSON 已导出');
    }
    function exportAllProjects() {
        var all = [];
        var idx = readIndex();
        idx.forEach(function (meta) {
            var p = loadProject(meta.id);
            if (p) all.push(p);
        });
        if (!all.length) { toast('没有可导出的作品'); return; }
        download('GAL作品备份-' + new Date().toISOString().slice(0, 10) + '.json',
            JSON.stringify({ type: 'gal-backup', v: 1, projects: all }, null, 2), 'application/json');
        toast('已导出 ' + all.length + ' 个作品');
    }

    function openProjectList() {
        var idx = readIndex();
        var html = '<div class="gal-proj-list">';
        if (!idx.length) html += '<div class="gal-hint-empty">还没有保存过的作品。</div>';
        idx.forEach(function (m) {
            var cur = P && m.id === P.id;
            html += '<div class="gal-proj-item' + (cur ? ' cur' : '') + '" data-pid="' + esc(m.id) + '" style="cursor:pointer">' +
                '<div class="gal-proj-ico" style="' + (m.cover ? 'background-image:url(&quot;' + esc(resolveSrc(m.cover)).slice(0, 200000) + '&quot;)' : '') + '">' +
                (m.cover ? '' : '<i class="ri-book-2-line"></i>') + '</div>' +
                '<div><div class="gal-proj-name">' + esc(m.title || '未命名作品') + (cur ? ' · 当前' : '') + '</div>' +
                '<div class="gal-proj-sub">' + (m.nodes || 0) + ' 节点 · ' + (m.chars || 0) + ' 角色 · ' +
                new Date(m.updated || Date.now()).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) +
                '</div></div>' +
                '<button type="button" class="gal-iconbtn danger" data-pdel="' + esc(m.id) + '" title="删除"><i class="ri-delete-bin-line"></i></button>' +
                '</div>';
        });
        html += '</div>';
        showModal('打开作品', html, [
            { label: '新建空作品', cls: 'gal-btn', cb: function () { closeModal(); newProject(false); } },
            { label: '新建带示例', cls: 'gal-btn', cb: function () { closeModal(); newProject(true); } }
        ], true);

        $('gal-modal-body').addEventListener('click', function (ev) {
            var item = ev.target.closest('[data-pid]');
            var del = ev.target.closest('[data-pdel]');
            if (del) {
                ev.stopPropagation();
                var id = del.getAttribute('data-pdel');
                if (!confirm('删掉这个作品？删了就找不回来了（建议先导出 JSON 备份）。')) return;
                try { localStorage.removeItem(LS_PROJ + id); } catch (e) { /* 忽略 */ }
                var list = readIndex().filter(function (m) { return m.id !== id; });
                writeIndex(list);
                if (P && P.id === id) {
                    if (list.length) openProject(list[0].id);
                    else newProject(true);
                }
                closeModal();
                toast('已删除');
                return;
            }
            if (item) {
                var pid = item.getAttribute('data-pid');
                if (P && pid === P.id) { closeModal(); return; }
                openProject(pid);
            }
        }, { once: true });
    }

    /* ------------------------------------------------------------------
       12. 导出
       ------------------------------------------------------------------ */
    function buildExportData() {
        var clone = {
            v: 1,
            id: P.id,
            title: P.title || '未命名作品',
            author: P.author || '',
            settings: JSON.parse(JSON.stringify(P.settings || {})),
            chars: JSON.parse(JSON.stringify(P.chars || [])),
            vars: JSON.parse(JSON.stringify(P.vars || [])),
            nodes: JSON.parse(JSON.stringify(P.nodes || [])),
            assets: {}
        };
        Object.keys(P.assets || {}).forEach(function (k) { clone.assets[k] = P.assets[k]; });
        return clone;
    }

    function htmlEscape(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function buildHtml(data) {
        var cssEl = document.getElementById('gv-player-css');
        var jsEl = document.getElementById('gv-player-js');
        var css = cssEl ? cssEl.textContent : '';
        var js = jsEl ? jsEl.textContent : '';
        if (!js || js.indexOf('__PLAYER_JS__') >= 0) {
            throw new Error('播放器引擎缺失，无法导出');
        }
        var json = JSON.stringify(data)
            .replace(/</g, '\\u003c')
            .replace(/\u2028/g, '\\u2028')
            .replace(/\u2029/g, '\\u2029');

        var title = htmlEscape(data.title || '未命名作品');
        var desc = htmlEscape((data.settings && data.settings.subtitle) || '');
        var head = [
            '<!DOCTYPE html>',
            '<html lang="zh-CN">',
            '<head>',
            '<meta charset="UTF-8">',
            '<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">',
            '<meta name="theme-color" content="#07080b">',
            '<title>' + title + '</title>',
            '<meta name="description" content="' + desc + '">',
            '<meta name="generator" content="My SW GAL Studio">',
            '<style>',
            'html,body{margin:0;padding:0;background:#07080b;height:100%;overflow:hidden}',
            css,
            '</style>',
            '</head>',
            '<body>',
            '<div id="gv-host"></div>',
            '<script id="gv-data" type="application/json">' + json + '<\/script>',
            '<script>',
            js,
            '<\/script>',
            '</body>',
            '</html>'
        ].join('\n');
        return head;
    }

    function optimizeImage(dataUrl, maxW, quality) {
        return new Promise(function (resolve) {
            if (!/^data:image\//.test(dataUrl)) return resolve(dataUrl);
            if (/^data:image\/svg/.test(dataUrl)) return resolve(dataUrl);
            var img = new Image();
            img.onload = function () {
                try {
                    var w = img.width, h = img.height;
                    var scale = Math.min(1, maxW / w);
                    if (scale >= 1 && quality >= 1) return resolve(dataUrl);
                    var cw = Math.max(1, Math.round(w * scale));
                    var ch = Math.max(1, Math.round(h * scale));
                    var c = document.createElement('canvas');
                    c.width = cw; c.height = ch;
                    var ctx = c.getContext('2d');
                    ctx.drawImage(img, 0, 0, cw, ch);
                    // 带透明通道的图（透明背景立绘）不能走 JPEG：透明会变成黑底。
                    // 有 WebP 编码就用 WebP，没有就退回 PNG。
                    var hasAlpha = /^data:image\/(png|webp)/.test(dataUrl);
                    var out;
                    if (hasAlpha) {
                        out = c.toDataURL('image/webp', quality);
                        if (out.indexOf('data:image/webp') !== 0) out = c.toDataURL('image/png');
                    } else {
                        out = c.toDataURL('image/jpeg', quality);
                    }
                    // 压完反而更大就别换了
                    resolve(out.length < dataUrl.length ? out : dataUrl);
                } catch (e) { resolve(dataUrl); }
            };
            img.onerror = function () { resolve(dataUrl); };
            img.src = dataUrl;
        });
    }

    /* 导出前把 lib: 引用换成真正的 dataURL。
       单文件 HTML 里没有 IndexedDB，objectURL 也活不过一次刷新，
       所以素材库里的图必须在导出这一刻「复制」进工程。 */
    async function inlineLibRefs(data) {
        var missing = [];
        if (!window.GalLib) return missing;

        var refs = {};
        function scan(v) {
            if (typeof v === 'string' && v.indexOf('lib:') === 0) refs[v.slice(4)] = 1;
        }
        (data.nodes || []).forEach(function (n) {
            Object.keys(n).forEach(function (k) { scan(n[k]); });
        });
        (data.chars || []).forEach(function (c) {
            scan(c.avatar);
            Object.keys(c.sprites || {}).forEach(function (k) { scan(c.sprites[k]); });
        });
        if (data.settings) scan(data.settings.cover);

        var ids = Object.keys(refs);
        if (!ids.length) return missing;

        var map = {};
        for (var i = 0; i < ids.length; i++) {
            var id = ids[i];
            var durl = '';
            try { durl = await window.GalLib.dataUrl(id); } catch (e) { durl = ''; }
            if (!durl) { missing.push(id); continue; }
            var aid = assetIdOf(durl);
            data.assets = data.assets || {};
            data.assets[aid] = durl;
            map[id] = 'asset:' + aid;
        }

        function fix(v) {
            if (typeof v !== 'string' || v.indexOf('lib:') !== 0) return v;
            var m = map[v.slice(4)];
            return m || '';
        }
        (data.nodes || []).forEach(function (n) {
            Object.keys(n).forEach(function (k) { if (typeof n[k] === 'string') n[k] = fix(n[k]); });
        });
        (data.chars || []).forEach(function (c) {
            c.avatar = fix(c.avatar);
            Object.keys(c.sprites || {}).forEach(function (k) { c.sprites[k] = fix(c.sprites[k]); });
        });
        if (data.settings && data.settings.cover) data.settings.cover = fix(data.settings.cover);
        return missing;
    }

    async function prepareData(level) {
        var data = buildExportData();
        var missing = await inlineLibRefs(data);
        if (missing.length) {
            try {
                toast('有 ' + missing.length + ' 个素材已从素材库删除，导出时会留空');
            } catch (e) { /* 忽略 */ }
        }
        if (!level || level === 'none') return data;
        var maxW = level === 'hard' ? 1080 : 1600;
        var q = level === 'hard' ? 0.72 : 0.86;
        var ids = Object.keys(data.assets);
        for (var i = 0; i < ids.length; i++) {
            data.assets[ids[i]] = await optimizeImage(data.assets[ids[i]], maxW, q);
        }
        return data;
    }

    function openExportDialog() {
        var html = '<div class="gal-field"><label>文件名</label><input class="gal-input" id="gal-ex-name" value="' +
            esc(safeFileName(P.title || '未命名作品')) + '.html"></div>';
        html += '<div class="gal-field"><label>图片压缩</label><select class="gal-select" id="gal-ex-q" style="width:100%">' +
            '<option value="std" selected>标准 —— 长边压到 1600px，肉眼基本无差</option>' +
            '<option value="none">不压缩 —— 原图打包，文件最大</option>' +
            '<option value="hard">严格 —— 长边 1080px，文件最小，适合发群里</option>' +
            '</select></div>';
        html += '<div class="gal-field"><label>预计体积</label><div id="gal-ex-size" class="gal-field-hint">正在计算…</div></div>';
        html += '<div class="gal-field-hint">导出的 HTML 是<b>完全独立</b>的：不联网也能玩，双击就能打开，' +
            '可以直接发给朋友或者丢到网盘。存档只存在玩的人自己的浏览器里。</div>';
        showModal('导出 HTML', html, [
            { label: '试玩一下', cls: 'gal-btn', cb: function () { playFrom(sel); } },
            { label: '导出', cls: 'gal-btn primary', cb: function () { runExport(); } }
        ]);

        var qSel = $('gal-ex-q');
        var sizeBox = $('gal-ex-size');
        var updateSize = async function () {
            var lvl = qSel.value;
            sizeBox.textContent = '正在计算…';
            var data = await prepareData(lvl);
            var bytes = new Blob([buildHtml(data)]).size;
            /* 素材体积要算 data.assets —— 素材库里的图是导出这一刻才内联进来的，
               用工程自己的 totalAssetBytes() 会一直显示 0。 */
            var assetLen = 0;
            Object.keys(data.assets || {}).forEach(function (k) { assetLen += data.assets[k].length; });
            sizeBox.innerHTML = '<b style="color:#e6c78a">' + fmtSize(bytes) + '</b>' +
                '　（剧本 ' + fmtSize(JSON.stringify(data).length) + '，素材 ' + fmtSize(assetLen) + '）';
        };
        qSel.addEventListener('change', updateSize);
        updateSize();
    }

    async function runExport() {
        var nameInput = $('gal-ex-name');
        var qSel = $('gal-ex-q');
        var name = safeFileName((nameInput && nameInput.value) || P.title || '未命名作品').replace(/\.html?$/i, '') + '.html';
        var lvl = qSel ? qSel.value : 'std';
        toast('正在打包…');
        try {
            var data = await prepareData(lvl);
            var html = buildHtml(data);
            download(name, html, 'text/html;charset=utf-8');
            closeModal();
            toast('已导出 ' + name + '（' + fmtSize(new Blob([html]).size) + '）');
        } catch (e) {
            console.error(e);
            toast('导出失败：' + (e && e.message ? e.message : '未知错误'));
        }
    }

    function playFrom(index) {
        try {
            var data = buildExportData();
            var n = P.nodes[index];
            if (n && n.id) data.settings.startAt = n.id;
            if (!(P.nodes || []).length) { toast('还没有节点，先写一句'); return; }
            var html = buildHtml(data);
            var blob = new Blob([html], { type: 'text/html' });
            var url = URL.createObjectURL(blob);
            var win = window.open(url, '_blank');
            if (!win) toast('浏览器拦了新窗口，允许弹出窗口后再试');
            setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
        } catch (e) {
            console.error(e);
            toast('打不开试玩：' + (e && e.message ? e.message : '未知错误'));
        }
    }

    /* ------------------------------------------------------------------
       13. 弹窗
       ------------------------------------------------------------------ */
    function showModal(title, bodyHTML, buttons, wide) {
        var box = $('gal-modal');
        var dlg = box.querySelector('.gal-modal-box');
        dlg.classList.toggle('wide', !!wide);
        $('gal-modal-title').textContent = title;
        var body = $('gal-modal-body');
        body.innerHTML = bodyHTML;
        var foot = $('gal-modal-foot');
        foot.innerHTML = '';
        (buttons || []).forEach(function (b) {
            var btn = el('button', b.cls || 'gal-btn', b.label);
            btn.type = 'button';
            btn.onclick = function () { if (b.cb) b.cb(); };
            foot.appendChild(btn);
        });
        box.hidden = false;
        body.scrollTop = 0;
    }
    function closeModal() {
        var box = $('gal-modal');
        if (box) box.hidden = true;
    }

    function showStats() {
        var counts = {};
        var chars = 0;
        var choices = 0;
        var ends = 0;
        P.nodes.forEach(function (n) {
            counts[n.type] = (counts[n.type] || 0) + 1;
            if (n.type === 'say' || n.type === 'narrate') chars += String(n.text || '').length;
            if (n.type === 'choice') choices += (n.choices || []).length;
            if (n.type === 'end') ends++;
        });
        var html = '<div class="gal-stat-grid">' +
            '<div class="gal-stat-cell"><b>' + P.nodes.length + '</b><span>节点</span></div>' +
            '<div class="gal-stat-cell"><b>' + chars + '</b><span>文本字数</span></div>' +
            '<div class="gal-stat-cell"><b>' + P.chars.length + '</b><span>角色</span></div>' +
            '<div class="gal-stat-cell"><b>' + P.vars.length + '</b><span>变量</span></div>' +
            '<div class="gal-stat-cell"><b>' + choices + '</b><span>选项</span></div>' +
            '<div class="gal-stat-cell"><b>' + ends + '</b><span>结局</span></div>' +
            '</div>';
        html += '<h4>节点分布</h4><ul>';
        NODE_TYPES.forEach(function (t) {
            if (counts[t.t]) html += '<li>' + t.label + '：<b>' + counts[t.t] + '</b></li>';
        });
        html += '</ul>';
        // 断链检查
        var ids = {};
        P.nodes.forEach(function (n) { ids[n.id] = 1; });
        var labels = {};
        P.nodes.forEach(function (n) { if (n.type === 'label' && n.name) labels[n.name] = 1; });
        var broken = [];
        P.nodes.forEach(function (n, i) {
            function chk(t, what) {
                if (!t) return;
                if (!ids[t] && !labels[t]) broken.push('第 ' + (i + 1) + ' 个节点的' + what + '指向了不存在的目标');
            }
            if (n.type === 'jump') chk(n.target, '跳转');
            if (n.type === 'if') { chk(n.then, '成立分支'); chk(n.else, '不成立分支'); }
            if (n.type === 'choice') (n.choices || []).forEach(function (c) { chk(c.target, '选项跳转'); });
        });
        if (broken.length) {
            html += '<h4 style="color:#e2705f">发现断链</h4><ul>' + broken.map(function (b) { return '<li>' + esc(b) + '</li>'; }).join('') + '</ul>';
        } else {
            html += '<h4>断链检查</h4><p style="color:#6fc08a">没有发现问题，所有跳转都能落地。</p>';
        }
        html += '<h4>体积</h4><p>剧本 ' + fmtSize(JSON.stringify(P).length) + '，素材 ' + fmtSize(totalAssetBytes()) + '。</p>';
        showModal('作品统计', html, [{ label: '知道了', cls: 'gal-btn', cb: closeModal }]);
    }

    function showKeys() {
        var html = '<h4>编辑器快捷键</h4><ul>' +
            '<li><kbd>Ctrl</kbd> + <kbd>S</kbd> 立即保存</li>' +
            '<li><kbd>Ctrl</kbd> + <kbd>Z</kbd> 撤销　<kbd>Ctrl</kbd> + <kbd>Y</kbd> 重做</li>' +
            '<li><kbd>Ctrl</kbd> + <kbd>Enter</kbd> 试玩</li>' +
            '<li><kbd>Ctrl</kbd> + <kbd>D</kbd> 复制当前节点</li>' +
            '<li><kbd>↑</kbd> / <kbd>↓</kbd> 切换节点（在输入框里不触发）</li>' +
            '<li><kbd>Delete</kbd> 删除当前节点</li>' +
            '<li><kbd>Esc</kbd> 关闭弹窗</li>' +
            '</ul>';
        html += '<h4>节点怎么连</h4><ul>' +
            '<li>按顺序往下走，不需要连线的概念。</li>' +
            '<li>「跳转」= 无条件跳到某个标签或节点。</li>' +
            '<li>「条件判断」= 变量满足就跳 A，不满足就跳 B（也可以只跳一边）。</li>' +
            '<li>选项的「跳转」留空 = 继续往下走；不填目标的分支会自然汇回主线。</li>' +
            '<li>记得给分支的终点放一个「跳转」，否则会一路往下穿过别的剧情。</li>' +
            '</ul>';
        html += '<h4>条件语法</h4><ul>' +
            '<li><code>好感 &gt;= 3</code>　<code>看过信 == true</code>　<code>名字 ~= "雨"</code></li>' +
            '<li>组合：<code>好感 &gt;= 3 &amp;&amp; 看过信</code>、<code>好感 &gt; 5 || 结局 == "good"</code></li>' +
            '<li><code>~=</code> 是「包含这段文字」，只对文字变量有意义。</li>' +
            '</ul>';
        html += '<h4>做一张立绘的建议</h4><ul>' +
            '<li>PNG，透明背景，人物脚底贴着画布下沿。</li>' +
            '<li>同一角色的所有表情用<b>同样的画布尺寸和站位</b>，切换时才不会跳。</li>' +
            '<li>没有立绘也能写，先跑通剧情再补图。</li>' +
            '</ul>';
        showModal('快捷键与语法', html, [{ label: '知道了', cls: 'gal-btn', cb: closeModal }], true);
    }

    /* ------------------------------------------------------------------
       14. 事件
       ------------------------------------------------------------------ */
    /* 「剧本转 GAL」的点击绑定单独拎出来，原因有两个：
       1) 它要读 IndexedDB，是最容易慢/卡的一个入口，不该跟别的按钮挤在同一条
          bindTop() 里——上面任何一行抛错都会让它一起哑掉；
       2) 用事件委托挂在 document 上，按钮以后被挪位置、被重渲染也不会失联。
       boot() 里第一件事就调它。 */
    var aiBtnBound = false;
    function bindAIBtn() {
        if (aiBtnBound) return;
        aiBtnBound = true;
        document.addEventListener('click', function (ev) {
            var t = ev.target;
            var btn = t && t.closest ? t.closest('#gal-ai-btn') : null;
            if (!btn) return;
            ev.preventDefault();
            openAIDialog();
        });
    }

    function bindTop() {
        $('gal-project-title').addEventListener('input', function () {
            P.title = this.value;
            markDirty();
            renderStatus();
        });
        $('gal-undo').addEventListener('click', undo);
        $('gal-redo').addEventListener('click', redo);
        $('gal-preview').addEventListener('click', function () { playFrom(sel); });
        $('gal-export').addEventListener('click', function () {
            if (!P.nodes.length) { toast('先写点内容再导出'); return; }
            openExportDialog();
        });

        var menu = $('gal-menu');
        $('gal-menu-btn').addEventListener('click', function (ev) {
            ev.stopPropagation();
            menu.hidden = !menu.hidden;
        });
        document.addEventListener('click', function (ev) {
            if (!menu.hidden && !menu.contains(ev.target) && ev.target !== $('gal-menu-btn')) menu.hidden = true;
        });

        menu.addEventListener('click', function (ev) {
            var b = ev.target.closest('button[data-cmd]');
            if (!b) return;
            menu.hidden = true;
            var cmd = b.getAttribute('data-cmd');
            if (cmd === 'save') {
                if (saveProject(P)) { setSaveState('saved'); dirty = false; toast('已保存到浏览器'); }
            } else if (cmd === 'new') {
                if (dirty && !confirm('当前作品有未保存的修改，先保存吗？点「取消」= 不保存直接新建。')) {
                    /* 用户选取消 -> 仍然新建，因为已经自动保存过了 */
                }
                newProject(false);
            } else if (cmd === 'open') openProjectList();
            else if (cmd === 'duplicate') {
                var copy = JSON.parse(JSON.stringify(P));
                copy.id = uid('p');
                copy.title = (P.title || '未命名作品') + ' 副本';
                saveProject(copy);
                openProject(copy.id);
            } else if (cmd === 'import') importProjectJSON();
            else if (cmd === 'export-json') exportProjectJSON();
            else if (cmd === 'export-all') exportAllProjects();
            else if (cmd === 'stats') showStats();
            else if (cmd === 'keys') showKeys();
            else if (cmd === 'docs') window.open('docs.html#gal', '_blank');
            else if (cmd === 'clear') {
                if (!confirm('清空当前作品的所有节点？角色、素材、变量会保留。')) return;
                P.nodes = [];
                sel = 0;
                pushHistory();
                renderAll();
                markDirty();
                toast('剧本已清空（可撤销）');
            }
        });
    }

    function bindNodeList() {
        var host = $('gal-nodes');
        var dragIdx = -1;

        host.addEventListener('click', function (ev) {
            var row = ev.target.closest('.gal-node');
            if (!row) return;
            var idx = Number(row.dataset.index);
            var op = ev.target.closest('[data-op]');
            if (op) {
                ev.stopPropagation();
                var a = op.getAttribute('data-op');
                if (a === 'up') { if (idx > 0) { moveNode(idx, idx - 1); } }
                else if (a === 'down') { if (idx < P.nodes.length - 1) moveNode(idx, idx + 2); }
                else if (a === 'copy') duplicateNode(idx);
                else if (a === 'del') deleteNode(idx);
                return;
            }
            selectNode(idx);
        });

        host.addEventListener('dragstart', function (ev) {
            var row = ev.target.closest('.gal-node');
            if (!row) return;
            dragIdx = Number(row.dataset.index);
            row.classList.add('dragging');
            try {
                ev.dataTransfer.effectAllowed = 'move';
                ev.dataTransfer.setData('text/plain', String(dragIdx));
            } catch (e) { /* 忽略 */ }
        });
        host.addEventListener('dragend', function () {
            host.querySelectorAll('.gal-node').forEach(function (r) {
                r.classList.remove('dragging', 'drop-before', 'drop-after');
            });
        });
        host.addEventListener('dragover', function (ev) {
            ev.preventDefault();
            var row = ev.target.closest('.gal-node');
            if (!row) return;
            host.querySelectorAll('.gal-node').forEach(function (r) { r.classList.remove('drop-before', 'drop-after'); });
            var rect = row.getBoundingClientRect();
            var before = (ev.clientY - rect.top) < rect.height / 2;
            row.classList.add(before ? 'drop-before' : 'drop-after');
        });
        host.addEventListener('drop', function (ev) {
            ev.preventDefault();
            var row = ev.target.closest('.gal-node');
            if (!row || dragIdx < 0) return;
            var to = Number(row.dataset.index);
            var rect = row.getBoundingClientRect();
            var before = (ev.clientY - rect.top) < rect.height / 2;
            if (!before) to = to + 1;
            if (dragIdx < to) to = to - 1;
            if (to !== dragIdx) moveNode(dragIdx, to + (to > dragIdx ? 1 : 0));
            else renderAll();
            dragIdx = -1;
        });
    }

    function bindAddBar() {
        var grid = $('gal-add-grid');
        var btn = $('gal-add-btn');
        NODE_TYPES.forEach(function (t) {
            var b = el('button');
            b.type = 'button';
            b.dataset.add = t.t;
            b.title = t.desc;
            b.innerHTML = '<i class="' + t.icon + '"></i> ' + t.label;
            grid.appendChild(b);
        });
        btn.addEventListener('click', function (ev) {
            ev.stopPropagation();
            grid.hidden = !grid.hidden;
        });
        document.addEventListener('click', function (ev) {
            if (!grid.hidden && !grid.contains(ev.target) && ev.target !== btn && !btn.contains(ev.target)) grid.hidden = true;
        });
        grid.addEventListener('click', function (ev) {
            var b = ev.target.closest('button[data-add]');
            if (!b) return;
            grid.hidden = true;
            addNode(b.getAttribute('data-add'));
        });
    }

    function bindRight() {
        document.querySelectorAll('.gal-tabs button').forEach(function (b) {
            b.addEventListener('click', function () { switchTab(b.getAttribute('data-tab'), true); });
        });

        var panes = document.querySelectorAll('.gal-pane');
        panes.forEach(function (pane) {
            pane.addEventListener('input', function (ev) {
                var t = ev.target;
                if (!t) return;
                var pKey = t.getAttribute('data-p');
                if (pKey) {
                    var v = t.type === 'checkbox' ? t.checked : (t.type === 'range' || t.type === 'number' ? Number(t.value) : t.value);
                    if (t.type === 'range') {
                        var lab = t.parentNode.querySelector('b');
                        if (lab) {
                            if (pKey === 'settings.fontSize') lab.textContent = v + 'px';
                            else if (pKey === 'settings.dim') lab.textContent = v + '%';
                            else if (pKey === 'settings.speed') lab.textContent = v;
                            else if (pKey === 'settings.autoDelay') lab.textContent = (v / 1000).toFixed(1) + 's';
                        }
                    }
                    if (pKey.indexOf('settings.') === 0) P.settings[pKey.slice(9)] = v;
                    else P[pKey] = v;
                    markDirty();
                    renderStage();
                    if (pKey === 'title') renderStatus();
                    if (pKey === 'settings.accent') {
                        var txt = pane.querySelector('input.gal-grow[data-p="settings.accent"]');
                        if (txt && txt !== t) txt.value = v;
                    }
                    return;
                }
                var cf = t.getAttribute('data-cf');
                if (cf) {
                    var c = P.chars[Number(t.getAttribute('data-ci'))];
                    if (!c) return;
                    c[cf] = t.value;
                    markDirty();
                    if (cf === 'name' || cf === 'color') {
                        renderStage();
                        // 名字变了，左侧摘要要跟着变
                        renderNodeList();
                    }
                    return;
                }
                var cs = t.getAttribute('data-cs');
                if (cs) {
                    var c2 = P.chars[Number(t.getAttribute('data-ci'))];
                    if (!c2) return;
                    c2.sprites = c2.sprites || {};
                    c2.sprites[cs] = t.value;
                    markDirty();
                    renderStage();
                    return;
                }
                var vf = t.getAttribute('data-vf');
                if (vf) {
                    var vv = P.vars[Number(t.getAttribute('data-vi'))];
                    if (!vv) return;
                    vv[vf] = t.value;
                    markDirty();
                    return;
                }
            });

            pane.addEventListener('change', function (ev) {
                var t = ev.target;
                var pKey = t.getAttribute && t.getAttribute('data-p');
                if (pKey && (t.tagName === 'SELECT' || t.type === 'checkbox')) {
                    var v = t.type === 'checkbox' ? t.checked : t.value;
                    if (pKey.indexOf('settings.') === 0) P.settings[pKey.slice(9)] = v;
                    else P[pKey] = v;
                    markDirty();
                    renderStage();
                    if (pKey === 'settings.skin') renderStage();
                }
            });

            pane.addEventListener('click', function (ev) {
                var up = ev.target.closest('[data-pup]');
                if (up) {
                    var key = up.getAttribute('data-pup');
                    pickFile('image/*', function (dataUrl, f) {
                        var v = addAsset(dataUrl);
                        if (!v) return;
                        (P.assetNames = P.assetNames || {})[v.slice(6)] = f.name.replace(/\.[^.]+$/, '');
                        if (key.indexOf('settings.') === 0) P.settings[key.slice(9)] = v;
                        else P[key] = v;
                        renderProjPane(); renderStage(); markDirty();
                    });
                    return;
                }
                var cup = ev.target.closest('[data-cup]');
                if (cup) {
                    var ci = Number(cup.getAttribute('data-ci'));
                    var c = P.chars[ci];
                    if (!c) return;
                    var kind = cup.getAttribute('data-cup');
                    pickFile('image/*', function (dataUrl, f) {
                        var v = addAsset(dataUrl);
                        if (!v) return;
                        (P.assetNames = P.assetNames || {})[v.slice(6)] = f.name.replace(/\.[^.]+$/, '');
                        if (kind === 'avatar') c.avatar = v;
                        else {
                            c.sprites = c.sprites || {};
                            c.sprites[cup.getAttribute('data-cs')] = v;
                        }
                        renderChars(); renderStage(); markDirty();
                    });
                    return;
                }
                var cact = ev.target.closest('[data-cact]');
                if (cact) {
                    var a = cact.getAttribute('data-cact');
                    if (a === 'add') {
                        var nc = { id: uid('c'), name: '新角色', color: '#e6c78a', avatar: '', sprites: {} };
                        P.chars.push(nc);
                        pushHistory();
                        renderChars(); markDirty();
                        setTimeout(function () {
                            var box = document.querySelector('.gal-char:last-of-type');
                            if (box) { box.classList.add('open'); box.scrollIntoView({ block: 'nearest' }); }
                        }, 30);
                    } else if (a === 'del') {
                        var ci2 = Number(cact.getAttribute('data-ci'));
                        var ch = P.chars[ci2];
                        if (!ch) return;
                        if (!confirm('删掉角色「' + (ch.name || '未命名') + '」？\n引用它的台词会变成旁白，但文字不会丢。')) return;
                        P.chars.splice(ci2, 1);
                        pushHistory();
                        renderChars(); renderNodeList(); renderStage(); markDirty();
                    } else if (a === 'toggle') {
                        var ci3 = Number(cact.getAttribute('data-ci'));
                        var box = document.querySelector('.gal-char[data-ci="' + ci3 + '"]');
                        if (box) box.classList.toggle('open');
                    }
                    return;
                }
                var vadd = ev.target.closest('[data-vadd]');
                if (vadd) {
                    P.vars.push({ name: '变量' + (P.vars.length + 1), value: 0 });
                    pushHistory();
                    renderVars(); markDirty();
                    return;
                }
                var vdel = ev.target.closest('[data-vdel]');
                if (vdel) {
                    P.vars.splice(Number(vdel.getAttribute('data-vdel')), 1);
                    pushHistory();
                    renderVars(); markDirty();
                    return;
                }
                var libact = ev.target.closest('[data-libact]');
                if (libact) {
                    ev.stopPropagation();
                    var lact = libact.getAttribute('data-libact');
                    if (lact === 'upload') pickFiles('image/*,audio/*', uploadToLib);
                    else if (lact === 'manage') openLibManager();
                    return;
                }
                var librn = ev.target.closest('[data-librn]');
                if (librn) {
                    ev.stopPropagation();
                    var lid = librn.getAttribute('data-librn');
                    var lit = LIB.items.filter(function (x) { return x.id === lid; })[0];
                    renameLibItem(lid, lit ? lit.name : '');
                    return;
                }
                var libdel = ev.target.closest('[data-libdel]');
                if (libdel) {
                    ev.stopPropagation();
                    var did = libdel.getAttribute('data-libdel');
                    var dit = LIB.items.filter(function (x) { return x.id === did; })[0];
                    deleteLibItem(did, dit ? dit.name : '');
                    return;
                }
                var libitem = ev.target.closest('.gal-lib-item');
                if (libitem) {
                    var pid = libitem.getAttribute('data-libid');
                    var meta = LIB.items.filter(function (x) { return x.id === pid; })[0];
                    applyLibToNode(pid, meta);
                    return;
                }
                var aact = ev.target.closest('[data-aact]');
                if (aact) {
                    var act = aact.getAttribute('data-aact');
                    if (act === 'upload') {
                        pickFile('image/*', function (dataUrl, f) {
                            var v = addAsset(dataUrl);
                            if (!v) return;
                            (P.assetNames = P.assetNames || {})[v.slice(6)] = f.name.replace(/\.[^.]+$/, '');
                            renderAssets(); markDirty();
                            toast('已加入素材库');
                        });
                    } else if (act === 'url') {
                        var u = prompt('图片网址（https://…）');
                        if (!u) return;
                        var v2 = addAsset(u);
                        if (!v2) return;
                        renderAssets(); markDirty();
                    }
                    return;
                }
                var adel = ev.target.closest('[data-adel]');
                if (adel) {
                    ev.stopPropagation();
                    var id = adel.getAttribute('data-adel');
                    if (!confirm('删掉这张素材？引用它的地方会变成空背景。')) return;
                    delete P.assets[id];
                    renderAssets(); renderStage(); markDirty();
                    return;
                }
                var aset = ev.target.closest('.gal-asset');
                if (aset) {
                    var aid = aset.getAttribute('data-aid');
                    var n = P.nodes[sel];
                    if (!n) { toast('先选一个节点'); return; }
                    pushHistory();
                    if (n.type === 'bg') n.src = 'asset:' + aid;
                    else if (n.type === 'sound') n.src = 'asset:' + aid;
                    else if (n.type === 'show' || n.type === 'say') { toast('这个节点不显示图片，先选一个「背景」节点'); return; }
                    else n.src = 'asset:' + aid;
                    renderInspector(); renderStage(); markDirty();
                    toast('已设为当前节点的背景');
                }
            });
        });
    }

    function bindStageTools() {
        $('gal-stage-ratio').addEventListener('change', function () {
            var box = $('gal-stage-box');
            if (box) {
                var parts = String(this.value).split('/');
                box.style.setProperty('--ar-w', parts[0]);
                box.style.setProperty('--ar-h', parts[1]);
            }
            setTimeout(fitStageScale, 30);
        });
        $('gal-stage-restart').addEventListener('click', function () { selectNode(0); });
        $('gal-stage-play').addEventListener('click', function () { playFrom(sel); });
        window.addEventListener('resize', debounce(fitStageScale, 120));
    }

    function bindMobileTabs() {
        document.querySelectorAll('.gal-mtab button').forEach(function (b) {
            b.addEventListener('click', function () {
                var t = b.getAttribute('data-mtab');
                document.body.setAttribute('data-mtab', t);
                document.querySelectorAll('.gal-mtab button').forEach(function (x) {
                    x.classList.toggle('on', x === b);
                });
                if (t === 'stage') setTimeout(fitStageScale, 60);
            });
        });
    }

    function bindKeys() {
        document.addEventListener('keydown', function (ev) {
            var tag = (ev.target.tagName || '').toLowerCase();
            var typing = tag === 'input' || tag === 'textarea' || tag === 'select' || ev.target.isContentEditable;

            if (ev.key === 'Escape') {
                if (!$('gal-modal').hidden) { closeModal(); ev.preventDefault(); }
                return;
            }
            var meta = ev.ctrlKey || ev.metaKey;
            if (meta && ev.key.toLowerCase() === 's') { ev.preventDefault(); saveProject(P); setSaveState('saved'); dirty = false; toast('已保存'); return; }
            if (meta && ev.key.toLowerCase() === 'z' && !ev.shiftKey) { ev.preventDefault(); undo(); return; }
            if (meta && (ev.key.toLowerCase() === 'y' || (ev.key.toLowerCase() === 'z' && ev.shiftKey))) { ev.preventDefault(); redo(); return; }
            if (meta && ev.key === 'Enter') { ev.preventDefault(); playFrom(sel); return; }
            if (meta && ev.key.toLowerCase() === 'd') { ev.preventDefault(); duplicateNode(sel); return; }
            if (typing) return;
            if (ev.key === 'ArrowUp') { ev.preventDefault(); selectNode(Math.max(0, sel - 1)); }
            else if (ev.key === 'ArrowDown') { ev.preventDefault(); selectNode(Math.min(P.nodes.length - 1, sel + 1)); }
            else if (ev.key === 'Delete' || ev.key === 'Backspace') { ev.preventDefault(); deleteNode(sel); }
        });
    }

    /* ------------------------------------------------------------------
       15. 启动
       ------------------------------------------------------------------ */
    function boot() {
        /* 最先绑 AI 按钮：它不依赖工程数据，也不该被下面任何一步的异常连坐。 */
        try { bindAIBtn(); } catch (e) { /* 绑定失败也继续启动页面 */ }

        var curId = null;
        try { curId = localStorage.getItem(LS_CUR); } catch (e) { /* 忽略 */ }
        var p = curId ? loadProject(curId) : null;
        if (!p) {
            var idx = readIndex();
            if (idx.length) p = loadProject(idx[0].id);
        }
        if (!p) {
            p = blankProject(true);
            saveProject(p);
            try { localStorage.setItem(LS_CUR, p.id); } catch (e) { /* 忽略 */ }
        }
        P = ensureProject(p);
        $('gal-project-title').value = P.title || '';

        bindTop();
        bindNodeList();
        bindAddBar();
        bindInspector();
        bindRight();
        bindStageTools();
        bindMobileTabs();
        bindKeys();

        $('gal-modal-x').addEventListener('click', closeModal);
        $('gal-modal').addEventListener('click', function (ev) {
            if (ev.target === this) closeModal();
        });

        history = [];
        histPos = -1;
        pushHistory();
        setSaveState('saved');
        renderAll();
        /* 素材库是 IndexedDB，读盘比 localStorage 慢一点：先渲染出界面，
           读到之后再补一遍素材面板，避免打开页面卡一拍。 */
        loadLib(function () { renderAssets(); });
        fitStageScale();
        setTimeout(fitStageScale, 200);
        setTimeout(function () {
            if (!P.nodes.length) $('gal-add-grid').hidden = false;
        }, 400);

        window.addEventListener('beforeunload', function () {
            if (dirty && P) saveProject(P);
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }

    /* 调试入口（不影响正常使用） */
    window.__GAL = {
        get project() { return P; },
        get state() { return { sel: sel, history: histPos }; },
        render: renderAll
    };

})();
