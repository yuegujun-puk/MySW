/* ========================================================================
   GAL 播放器引擎（导出产物的运行时）
   【维护提醒】本文件是源文件；编辑器页面 gal.html 里内嵌了一份同样的代码
   （script 标签 id = gv-player-js，type=text/plain），导出时直接取那份文本。
   改完这里必须重新注入，否则编辑器和导出产物会不一致：

       i = h.index('<script id="gv-player-js" type="text/plain">')
       e = h.index('<' + '/script>', i)
       h = h[:i + 44] + j + h[e:]

   （h = gal.html 全文，j = 本文件全文。注意：本文件里绝对不能出现
     script 结束标签的字面量，否则会把 gal.html 的标签提前截断。）

   —— 这段代码会被整段内嵌进导出的 HTML，不依赖任何外部文件。
   —— 编辑器里的舞台预览也用同一份，保证「看到的 = 玩到的」。
   入口数据：id 为 gv-data 的 application/json 脚本块。
   ======================================================================== */
(function () {
    'use strict';

    var dataEl = document.getElementById('gv-data');
    if (!dataEl) return;
    var D = {};
    try { D = JSON.parse(dataEl.textContent || '{}'); } catch (e) { D = {}; }

    var NODES = Array.isArray(D.nodes) ? D.nodes : [];
    var CHARS = {};
    (D.chars || []).forEach(function (c) { if (c && c.id) CHARS[c.id] = c; });
    var ASSETS = D.assets || {};
    var CFG = D.settings || {};
    var PID = String(D.id || 'gal');

    var KEY = 'galGame:' + PID;
    var SAVE_PREFIX = KEY + ':save:';
    var CFG_KEY = KEY + ':cfg';
    var SEEN_KEY = KEY + ':seen';
    var SLOTS = 6;
    var AUTO_SLOT = 'auto';

    /* ---------------- 基础工具 ---------------- */
    function $(sel, root) { return (root || document).querySelector(sel); }
    function el(tag, cls, text) {
        var e = document.createElement(tag);
        if (cls) e.className = cls;
        if (text != null) e.textContent = text;
        return e;
    }
    function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

    /* 素材引用：asset:xxx → dataURL；其余按原样当 URL */
    function src(v) {
        if (!v) return '';
        v = String(v);
        if (v.indexOf('asset:') === 0) return ASSETS[v.slice(6)] || '';
        return v;
    }
    function cssUrl(v) {
        v = src(v);
        if (!v) return '';
        return 'url("' + v.replace(/"/g, '%22').replace(/\n/g, '') + '")';
    }
    function charName(id) {
        var c = CHARS[id];
        return c && c.name ? c.name : (id || '');
    }
    function charColor(id) {
        var c = CHARS[id];
        return (c && c.color) || CFG.accent || '#e6c78a';
    }

    /* 值解析：数字 / 布尔 / 字符串 */
    function parseVal(raw) {
        if (raw == null) return '';
        if (typeof raw === 'number' || typeof raw === 'boolean') return raw;
        var s = String(raw).trim();
        if ((s.charAt(0) === '"' && s.charAt(s.length - 1) === '"') ||
            (s.charAt(0) === "'" && s.charAt(s.length - 1) === "'")) {
            return s.slice(1, -1);
        }
        if (s === 'true') return true;
        if (s === 'false') return false;
        if (s === 'null' || s === '') return '';
        if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s);
        return s;
    }

    /* ---------------- 状态 ---------------- */
    var st = {
        pc: 0,
        vars: {},
        bg: '',
        bgNode: null,
        sprites: {},          // charId -> {emo, pos}
        history: [],
        typing: false,
        pages: [''],
        page: 0,
        typed: 0,
        pageText: '',
        auto: false,
        skip: false,
        ended: false,
        waiting: false,
        started: false,
        speaker: '',
        curNode: null,
        hideUI: false,
        cfg: {
            speed: 30,        // 0-100，越大越快
            autoDelay: 1600,
            volume: 70,
            skipUnread: false
        }
    };

    var seen = {};
    try { seen = JSON.parse(localStorage.getItem(SEEN_KEY) || '{}') || {}; } catch (e) { seen = {}; }
    var seenDirty = false;

    function loadCfg() {
        try {
            var raw = localStorage.getItem(CFG_KEY);
            if (raw) {
                var o = JSON.parse(raw);
                if (o && typeof o === 'object') {
                    ['speed', 'autoDelay', 'volume', 'skipUnread'].forEach(function (k) {
                        if (o[k] != null) st.cfg[k] = o[k];
                    });
                }
            }
        } catch (e) { /* 忽略 */ }
    }
    function saveCfg() {
        try { localStorage.setItem(CFG_KEY, JSON.stringify(st.cfg)); } catch (e) { /* 忽略 */ }
    }

    /* ---------------- 构建 DOM ---------------- */
    var root = el('div', 'gv-root');
    root.innerHTML = [
        '<div class="gv-app" id="gv-app">',
        '  <div class="gv-bgs"><div class="gv-bg blank" id="gv-bg0"></div><div class="gv-bg" id="gv-bg1"></div></div>',
        '  <div class="gv-dim"></div>',
        '  <div class="gv-mood" id="gv-mood"></div>',
        '  <div class="gv-vignette"></div>',
        '  <div class="gv-sprites" id="gv-sprites"></div>',
        '  <div class="gv-place" id="gv-place"></div>',
        '  <div class="gv-ui" id="gv-ui">',
        '    <div class="gv-textbox" id="gv-textbox">',
        '      <div class="gv-name" id="gv-name"></div>',
        '      <div class="gv-text" id="gv-text"></div>',
        '      <div class="gv-next" id="gv-next">▼</div>',
        '    </div>',
        '    <div class="gv-choices" id="gv-choices"></div>',
        '  </div>',
        '  <div class="gv-toolbar" id="gv-toolbar">',
        '    <button type="button" data-act="auto" title="自动播放（A）"><i>A</i></button>',
        '    <button type="button" data-act="skip" title="快进（按住 Ctrl）"><i>»</i></button>',
        '    <button type="button" data-act="log" title="回顾（L）"><i>≡</i></button>',
        '    <button type="button" data-act="save" title="存档"><i>↓</i></button>',
        '    <button type="button" data-act="load" title="读档"><i>↑</i></button>',
        '    <button type="button" data-act="config" title="设置"><i>⚙</i></button>',
        '    <button type="button" data-act="title" title="回到标题"><i>◼</i></button>',
        '    <button type="button" data-act="full" title="全屏"><i>⛶</i></button>',
        '  </div>',
        '  <div class="gv-fx" id="gv-fx"><div class="gv-fx-flash" id="gv-flash"></div><div class="gv-fx-fade" id="gv-fade"></div></div>',
        '  <div class="gv-title" id="gv-title"></div>',
        '  <div class="gv-end" id="gv-end"></div>',
        '  <div class="gv-modal" id="gv-modal"><div class="gv-modal-box">',
        '    <div class="gv-modal-head"><span id="gv-modal-title">标题</span><span class="gv-flex"></span>',
        '      <button type="button" class="gv-modal-x" data-act="close">✕</button></div>',
        '    <div class="gv-modal-body" id="gv-modal-body"></div>',
        '    <div class="gv-modal-foot" id="gv-modal-foot"></div>',
        '  </div></div>',
        '  <div class="gv-toast" id="gv-toast"></div>',
        '  <div class="gv-loading" id="gv-loading">载入中…</div>',
        '</div>'
    ].join('');

    var host = document.getElementById('gv-host') || document.body;
    host.appendChild(root);

    var app = $('#gv-app', root);
    var bgEls = [$('#gv-bg0', root), $('#gv-bg1', root)];
    var bgFront = 0;
    var spritesEl = $('#gv-sprites', root);
    var textbox = $('#gv-textbox', root);
    var nameEl = $('#gv-name', root);
    var textEl = $('#gv-text', root);
    var nextEl = $('#gv-next', root);
    var choicesEl = $('#gv-choices', root);
    var placeEl = $('#gv-place', root);
    var moodEl = $('#gv-mood', root);
    var toolbar = $('#gv-toolbar', root);
    var titleEl = $('#gv-title', root);
    var endEl = $('#gv-end', root);
    var modal = $('#gv-modal', root);
    var modalTitle = $('#gv-modal-title', root);
    var modalBody = $('#gv-modal-body', root);
    var modalFoot = $('#gv-modal-foot', root);
    var toastEl = $('#gv-toast', root);
    var flashEl = $('#gv-flash', root);
    var fadeEl = $('#gv-fade', root);

    var spriteEls = {};
    var spriteBox = {};

    /* ---------------- 主题注入 ---------------- */
    app.style.setProperty('--gv-accent', CFG.accent || '#e6c78a');
    app.style.setProperty('--gv-fs', (CFG.fontSize || 16) + 'px');
    app.style.setProperty('--gv-dim', String((CFG.dim == null ? 18 : CFG.dim) / 100));
    if (CFG.font) app.style.setProperty('--gv-font', CFG.font);
    var skin = CFG.skin || 'classic';
    if (skin !== 'classic') app.className = 'gv-app gv-skin-' + skin;

    function fitScale() {
        var w = app.clientWidth || window.innerWidth;
        var s = clamp(w / 1180, 0.86, 1.55);
        app.style.setProperty('--gv-scale', s.toFixed(3));
    }
    fitScale();

    /* ---------------- 提示 ---------------- */
    var toastTimer = null;
    function toast(msg) {
        toastEl.textContent = msg;
        toastEl.classList.add('on');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(function () { toastEl.classList.remove('on'); }, 1600);
    }

    /* ---------------- 背景 ---------------- */
    function setBg(v, transition, kenBurns) {
        st.bg = v || '';
        var img = cssUrl(v);
        var nextIdx = 1 - bgFront;
        var next = bgEls[nextIdx];
        var prev = bgEls[bgFront];
        var useFade = transition !== 'cut';
        if (!useFade) {
            next.style.transition = 'none';
            prev.style.transition = 'none';
        } else {
            next.style.transition = '';
            prev.style.transition = '';
        }
        next.style.backgroundImage = img;
        next.classList.toggle('blank', !img);
        next.classList.toggle('kb', !!kenBurns && !!img && CFG.kenBurns !== false);
        // 强制回流，避免同帧切换时 transition 不生效
        void next.offsetWidth;
        next.classList.add('on');
        prev.classList.remove('on');
        bgFront = nextIdx;
        if (!useFade) {
            requestAnimationFrame(function () {
                next.style.transition = '';
                prev.style.transition = '';
            });
        }
    }
    setBg('', 'cut', false);

    var placeTimer = null;
    function showPlace(text) {
        if (!text) return;
        placeEl.textContent = text;
        placeEl.classList.add('on');
        clearTimeout(placeTimer);
        placeTimer = setTimeout(function () { placeEl.classList.remove('on'); }, 2200);
    }

    var MOOD = {
        default: 'transparent',
        happy: 'radial-gradient(72% 56% at 50% 106%, rgba(255,214,107,.16) 0%, rgba(255,214,107,0) 72%)',
        sad: 'radial-gradient(76% 60% at 50% 104%, rgba(120,160,235,.18) 0%, rgba(120,160,235,0) 74%)',
        angry: 'radial-gradient(74% 58% at 50% 105%, rgba(255,96,96,.18) 0%, rgba(255,96,96,0) 72%)',
        shy: 'radial-gradient(70% 54% at 50% 106%, rgba(255,176,200,.18) 0%, rgba(255,176,200,0) 72%)',
        love: 'radial-gradient(72% 58% at 50% 106%, rgba(255,143,174,.2) 0%, rgba(255,143,174,0) 74%)',
        surprised: 'radial-gradient(70% 62% at 50% 100%, rgba(199,166,255,.16) 0%, rgba(199,166,255,0) 70%)',
        excited: 'radial-gradient(74% 58% at 50% 104%, rgba(255,178,107,.18) 0%, rgba(255,178,107,0) 74%)',
        thinking: 'radial-gradient(78% 56% at 50% 108%, rgba(159,232,216,.14) 0%, rgba(159,232,216,0) 72%)'
    };

    /* ---------------- 立绘 ---------------- */
    var POS = { left: 18, center: 50, right: 82, farleft: 8, farright: 92 };

    function spriteSrc(cid, emo) {
        var c = CHARS[cid];
        if (!c) return '';
        var sp = c.sprites || {};
        if (emo && sp[emo]) return sp[emo];
        if (sp.default) return sp.default;
        var keys = Object.keys(sp);
        for (var i = 0; i < keys.length; i++) if (sp[keys[i]]) return sp[keys[i]];
        return c.avatar || '';
    }

    function renderSprites(speakerId) {
        var ids = Object.keys(st.sprites);
        // 删除已经不在舞台上的
        Object.keys(spriteEls).forEach(function (cid) {
            if (ids.indexOf(cid) < 0) {
                var box = spriteEls[cid];
                box.classList.remove('on');
                (function (b) { setTimeout(function () { if (b && b.parentNode) b.parentNode.removeChild(b); }, 420); })(box);
                delete spriteEls[cid];
                delete spriteBox[cid];
            }
        });
        ids.forEach(function (cid) {
            var sp = st.sprites[cid];
            var s = spriteSrc(cid, sp.emo);
            var box = spriteEls[cid];
            if (!box) {
                box = el('div', 'gv-sprite');
                var img = el('img');
                img.alt = charName(cid);
                img.draggable = false;
                box.appendChild(img);
                box.dataset.char = cid;
                spritesEl.appendChild(box);
                spriteEls[cid] = box;
            }
            var imgEl = box.firstChild;
            if (s) {
                imgEl.style.display = '';
                if (imgEl.getAttribute('src') !== s) imgEl.src = s;
            } else {
                // 没有图就整个藏起来，否则浏览器会画出一个「破图」图标
                imgEl.style.display = 'none';
                imgEl.removeAttribute('src');
            }
            var pos = POS[sp.pos] != null ? POS[sp.pos] : 50;
            box.style.left = pos + '%';
            spriteBox[cid] = box;
            // 触发入场
            requestAnimationFrame(function () { box.classList.add('on'); });
            var dim = speakerId && speakerId !== cid && Object.keys(st.sprites).length > 1;
            box.classList.toggle('dim', !!dim);
        });
    }

    /* ---------------- 分页 ---------------- */
    function splitPages(text) {
        var maxLines = 3;
        var lh = parseFloat(getComputedStyle(textEl).lineHeight) || 30;
        textEl.style.height = (lh * maxLines) + 'px';
        textEl.style.overflow = 'hidden';
        var avail = textEl.clientHeight;
        if (!avail || !text) {
            textEl.style.height = '';
            textEl.style.overflow = '';
            return [text || ''];
        }
        var pages = [];
        var rest = String(text);
        var guard = 0;
        while (rest && guard++ < 80) {
            var lo = 1, hi = rest.length, best = 1;
            while (lo <= hi) {
                var mid = (lo + hi) >> 1;
                textEl.textContent = rest.slice(0, mid);
                if (textEl.scrollHeight <= avail + 1) { best = mid; lo = mid + 1; }
                else hi = mid - 1;
            }
            var cut = best;
            if (cut < rest.length) {
                // 回退到尽量近的标点/空格，避免把词切断
                for (var k = cut; k > Math.max(0, cut - 26); k--) {
                    if (/[。！？…；，、,.!?;:\s\n」』）】]/.test(rest.charAt(k - 1))) { cut = k; break; }
                }
            }
            pages.push(rest.slice(0, cut));
            rest = rest.slice(cut).replace(/^[\s\n]+/, '');
        }
        textEl.textContent = '';
        textEl.style.height = '';
        textEl.style.overflow = '';
        return pages.length ? pages : [''];
    }

    /* ---------------- 打字机 ---------------- */
    var typeTimer = null;
    var autoTimer = null;

    function speedMs() {
        var s = clamp(Number(st.cfg.speed) || 0, 0, 100);
        // 100 → 0ms（瞬间），0 → 60ms/字
        return Math.round((100 - s) * 0.6);
    }

    function typeStart() {
        clearInterval(typeTimer);
        if (st.cfg.speed >= 100) {
            textEl.textContent = st.pageText;
            st.typed = st.pageText.length;
            typeDone();
            return;
        }
        var ms = speedMs();
        var chunk = ms <= 8 ? 3 : (ms <= 20 ? 2 : 1);
        st.typing = true;
        nextEl.classList.remove('on');
        typeTimer = setInterval(function () {
            if (!st.typing) { clearInterval(typeTimer); return; }
            st.typed = Math.min(st.pageText.length, st.typed + chunk);
            textEl.textContent = st.pageText.slice(0, st.typed);
            if (st.typed >= st.pageText.length) {
                clearInterval(typeTimer);
                typeDone();
            }
            if (st.skip) {
                clearInterval(typeTimer);
                textEl.textContent = st.pageText;
                st.typed = st.pageText.length;
                typeDone();
            }
        }, Math.max(6, ms));
    }

    function typeDone() {
        st.typing = false;
        clearInterval(typeTimer);
        var isLast = st.page >= st.pages.length - 1;
        nextEl.classList.toggle('on', isLast);
        if (st.auto || st.skip) scheduleNext();
    }

    function scheduleNext() {
        clearTimeout(autoTimer);
        var delay = st.skip ? 70 : Math.max(400, Number(st.cfg.autoDelay) || 1600);
        if (st.page < st.pages.length - 1) delay = st.skip ? 60 : Math.min(delay, 1400);
        autoTimer = setTimeout(function () {
            if (!st.auto && !st.skip) return;
            advance();
        }, delay);
    }

    /* ---------------- 台词显示 ---------------- */
    function showLine(node, isNarr) {
        st.curNode = node;
        var raw = String(node.text == null ? '' : node.text);
        var speaker = isNarr ? '' : (node.char || '');
        st.speaker = speaker;

        textbox.classList.add('on');
        nameEl.textContent = speaker ? charName(speaker) : '';
        nameEl.style.color = speaker ? charColor(speaker) : '';
        textEl.classList.toggle('narration', !!isNarr);
        textbox.classList.toggle('narration', !!isNarr);

        if (speaker && st.sprites[speaker] && node.emo) {
            st.sprites[speaker].emo = node.emo;
            renderSprites(speaker);
        } else {
            renderSprites(speaker);
        }
        if (speaker && node.emo) {
            moodEl.style.background = MOOD[node.emo] || 'transparent';
        } else if (isNarr) {
            moodEl.style.background = 'transparent';
        }

        // 历史
        st.history.push({ name: speaker ? charName(speaker) : '', text: raw, narr: !!isNarr });
        if (st.history.length > 300) st.history.shift();

        // 已读标记
        if (node.id && !seen[node.id]) { seen[node.id] = 1; seenDirty = true; }

        st.pages = splitPages(raw);
        st.page = 0;
        st.pageText = st.pages[0] || '';
        st.typed = 0;
        textEl.textContent = '';
        if (node.voice) playSe(node.voice, 1);
        typeStart();
        autoSaveNow();
        persistSeen();
    }

    /* ---------------- 音频 ---------------- */
    var bgmAudio = null;
    function playBgm(v, loop, vol, fade) {
        if (bgmAudio) { try { bgmAudio.pause(); } catch (e) {} bgmAudio = null; }
        var s = src(v);
        if (!s) return;
        bgmAudio = new Audio(s);
        bgmAudio.loop = loop !== false;
        bgmAudio.volume = clamp((vol == null ? 70 : vol) / 100 * (st.cfg.volume / 100), 0, 1);
        bgmAudio.play().catch(function () { /* 浏览器可能拦截，等用户交互后再试 */ });
    }
    function playSe(v, vol) {
        var s = src(v);
        if (!s) return;
        try {
            var a = new Audio(s);
            a.volume = clamp((vol == null ? 80 : vol) / 100 * (st.cfg.volume / 100), 0, 1);
            a.play().catch(function () {});
        } catch (e) { /* 忽略 */ }
    }

    /* ---------------- 条件与变量 ---------------- */
    function cmpNum(a, b, op) {
        switch (op) {
            case '>': return a > b;
            case '<': return a < b;
            case '>=': return a >= b;
            case '<=': return a <= b;
            case '!=': return a !== b;
            default: return a === b;
        }
    }
    function evalTerm(term) {
        var t = String(term || '').trim();
        if (!t) return true;
        if (t === 'true') return true;
        if (t === 'false') return false;
        // 变量名允许中文（「好感」是最常见的写法），只排除运算符与空白
        var m = t.match(/^([^\s><=!~|&]+)\s*(>=|<=|~=|==|!=|>|<|=)\s*([\s\S]+)$/);
        if (!m) {
            var v = st.vars[t];
            return !(v === undefined || v === null || v === '' || v === 0 || v === '0' || v === false || v === 'false');
        }
        var lhs = st.vars[m[1]];
        var op = m[2] === '=' ? '==' : m[2];
        var rhsRaw = m[3].trim();
        var rhs = parseVal(rhsRaw);
        if (op === '~=') return String(lhs == null ? '' : lhs).indexOf(String(rhs)) >= 0;
        var ln = Number(lhs), rn = Number(rhs);
        if (lhs !== '' && lhs != null && rhs !== '' && !isNaN(ln) && !isNaN(rn)) {
            return cmpNum(ln, rn, op);
        }
        if (op === '==') return String(lhs == null ? '' : lhs) === String(rhs == null ? '' : rhs);
        if (op === '!=') return String(lhs == null ? '' : lhs) !== String(rhs == null ? '' : rhs);
        return cmpNum(String(lhs == null ? '' : lhs), String(rhs == null ? '' : rhs), op);
    }
    function evalCond(expr) {
        var s = String(expr == null ? '' : expr).trim();
        if (!s) return true;
        var ors = s.split('||');
        for (var i = 0; i < ors.length; i++) {
            var ands = ors[i].split('&&');
            var ok = true;
            for (var j = 0; j < ands.length; j++) {
                if (!evalTerm(ands[j])) { ok = false; break; }
            }
            if (ok) return true;
        }
        return false;
    }
    function applySet(name, op, rawVal) {
        if (!name) return;
        var v = parseVal(rawVal);
        var cur = st.vars[name];
        switch (op) {
            case 'add': st.vars[name] = Number(cur || 0) + Number(v || 0); break;
            case 'sub': st.vars[name] = Number(cur || 0) - Number(v || 0); break;
            case 'mul': st.vars[name] = Number(cur || 0) * Number(v || 1); break;
            case 'append': st.vars[name] = String(cur == null ? '' : cur) + String(v == null ? '' : v); break;
            case 'toggle': st.vars[name] = !st.vars[name]; break;
            default: st.vars[name] = v;
        }
    }

    /* ---------------- 索引 ---------------- */
    var idIndex = {};
    var labelIndex = {};
    NODES.forEach(function (n, i) {
        if (!n) return;
        if (n.id) idIndex[n.id] = i;
        if (n.type === 'label' && n.name) labelIndex[n.name] = i;
    });

    function resolveTarget(t) {
        if (t == null || t === '') return -1;
        if (typeof t === 'number') return t;
        if (idIndex[t] != null) return idIndex[t];
        if (labelIndex[t] != null) return labelIndex[t];
        return -1;
    }

    /* ---------------- 结局 ---------------- */
    var END_KIND = {
        good: 'GOOD END', bad: 'BAD END', true: 'TRUE END',
        normal: 'NORMAL END', any: 'END'
    };
    function showEnd(node) {
        st.ended = true;
        st.typing = false;
        clearInterval(typeTimer);
        clearTimeout(autoTimer);
        textbox.classList.remove('on');
        choicesEl.classList.remove('on');
        toolbar.style.display = 'none';
        endEl.innerHTML = '';
        var kind = el('div', 'gv-end-kind', END_KIND[node.kind] || 'END');
        var h = el('h2', null, node.title || '完');
        endEl.appendChild(kind);
        endEl.appendChild(h);
        if (node.text) endEl.appendChild(el('p', null, node.text));
        var menu = el('div', 'gv-end-menu');
        var b1 = el('button', null, '回到标题');
        b1.onclick = function () { endEl.classList.remove('on'); showTitle(); };
        var b2 = el('button', null, '读取存档');
        b2.onclick = function () { openLoad(); };
        menu.appendChild(b1);
        menu.appendChild(b2);
        endEl.appendChild(menu);
        endEl.classList.add('on');
    }

    /* ---------------- 主循环 ---------------- */
    function step() {
        if (st.pc < 0 || st.pc >= NODES.length) {
            showEnd({ title: '完', text: '', kind: 'any' });
            return;
        }
        var guard = 0;
        while (st.pc >= 0 && st.pc < NODES.length) {
            if (guard++ > 4000) { toast('剧本可能有死循环'); break; }
            var n = NODES[st.pc];
            if (!n) { st.pc++; continue; }
            var r = exec(n);
            if (r === 'stop') return;
            if (r === 'next') { st.pc++; continue; }
            if (r === 'moved') continue;
            break;
        }
        if (st.pc >= NODES.length) {
            showEnd({ title: '完', text: '', kind: 'any' });
        }
    }

    function exec(n) {
        switch (n.type) {
            case 'label':
                return 'next';
            case 'say':
                showLine(n, false);
                return 'stop';
            case 'narrate':
                showLine(n, true);
                return 'stop';
            case 'bg': {
                setBg(n.src, n.transition || 'fade', n.kenBurns !== false);
                if (n.place) showPlace(n.place);
                return 'next';
            }
            case 'show': {
                if (!n.char) return 'next';
                if (!st.sprites[n.char]) st.sprites[n.char] = { emo: n.emo || 'default', pos: n.pos || 'center' };
                else {
                    if (n.emo) st.sprites[n.char].emo = n.emo;
                    if (n.pos) st.sprites[n.char].pos = n.pos;
                }
                renderSprites(st.speaker);
                return 'next';
            }
            case 'hide': {
                if (n.char === 'all' || !n.char) {
                    Object.keys(st.sprites).forEach(function (cid) {
                        var b = spriteEls[cid];
                        if (b) { b.classList.remove('on'); (function (bb) { setTimeout(function () { if (bb && bb.parentNode) bb.parentNode.removeChild(bb); }, 420); })(b); }
                        delete spriteEls[cid]; delete spriteBox[cid];
                    });
                    st.sprites = {};
                } else {
                    delete st.sprites[n.char];
                    var box = spriteEls[n.char];
                    if (box) {
                        box.classList.remove('on');
                        (function (bb) { setTimeout(function () { if (bb && bb.parentNode) bb.parentNode.removeChild(bb); }, 420); })(box);
                        delete spriteEls[n.char];
                        delete spriteBox[n.char];
                    }
                    renderSprites(st.speaker);
                }
                return 'next';
            }
            case 'choice': {
                renderChoices(n);
                return 'stop';
            }
            case 'jump': {
                var ti = resolveTarget(n.target);
                // 目标没填 / 已被删：静默跳过，别在玩家面前弹错误（编辑器有断链检查）
                if (ti < 0) return 'next';
                st.pc = ti;
                return 'moved';
            }
            case 'if': {
                if (evalCond(n.cond)) {
                    var a = resolveTarget(n.then);
                    if (a >= 0) { st.pc = a; return 'moved'; }
                } else {
                    var b = resolveTarget(n.else);
                    if (b >= 0) { st.pc = b; return 'moved'; }
                }
                return 'next';
            }
            case 'set': {
                applySet(n.name, n.op || 'set', n.value);
                return 'next';
            }
            case 'sound': {
                if (n.channel === 'se') {
                    if (n.action !== 'stop') playSe(n.src, n.volume);
                } else {
                    if (n.action === 'stop') playBgm('', false, 0);
                    else playBgm(n.src, n.loop !== false, n.volume);
                }
                return 'next';
            }
            case 'fx': {
                doFx(n);
                return 'next';
            }
            case 'wait': {
                var ms = Math.max(0, Number(n.ms) || 600);
                setTimeout(function () { st.pc++; step(); }, ms);
                return 'stop';
            }
            case 'end':
                showEnd(n);
                return 'stop';
            default:
                return 'next';
        }
    }

    function doFx(n) {
        var kind = n.kind || 'shake';
        var dur = Math.max(80, Number(n.duration) || 420);
        var intensity = Number(n.intensity) || 1;
        if (kind === 'shake') {
            app.style.setProperty('--d', dur + 'ms');
            app.style.setProperty('--i', Math.round(6 * intensity) + 'px');
            app.classList.remove('shake');
            void app.offsetWidth;
            app.classList.add('shake');
            setTimeout(function () { app.classList.remove('shake'); }, dur + 60);
        } else if (kind === 'flash') {
            flashEl.style.setProperty('--d', dur + 'ms');
            flashEl.classList.remove('go');
            void flashEl.offsetWidth;
            flashEl.classList.add('go');
        } else if (kind === 'fadeout' || kind === 'fadein') {
            fadeEl.style.setProperty('--d', dur + 'ms');
            if (kind === 'fadeout') fadeEl.classList.add('go');
            else fadeEl.classList.remove('go');
        }
    }

    /* ---------------- 选项 ---------------- */
    function renderChoices(n) {
        st.curNode = n;
        choicesEl.innerHTML = '';
        var list = (n.choices || []).filter(function (c) { return c && c.text; });
        if (n.prompt) {
            var p = el('div', 'gv-choice-prompt');
            p.textContent = n.prompt;
            p.style.cssText = 'color:#e9dcc0;font-size:.92em;letter-spacing:.06em;margin-bottom:.4em;text-shadow:0 2px 10px #000';
            choicesEl.appendChild(p);
        }
        var shown = 0;
        var chose = 0;
        list.forEach(function (c, i) {
            var ok = evalCond(c.cond);
            if (!ok && n.hideLocked) return;
            chose++;
            var btn = el('button', 'gv-choice');
            btn.type = 'button';
            var num = el('span', 'gv-choice-num', String(shown + 1));
            btn.appendChild(num);
            btn.appendChild(document.createTextNode(c.text));
            if (!ok) {
                btn.classList.add('locked');
                btn.disabled = true;
            }
            btn.onclick = function () {
                if (!ok) return;
                (c.effects || []).forEach(function (e) { applySet(e.name, e.op || 'set', e.value); });
                var t = resolveTarget(c.target);
                if (t < 0) t = st.pc + 1;
                choicesEl.classList.remove('on');
                choicesEl.innerHTML = '';
                st.pc = t;
                st.ended = false;
                step();
            };
            choicesEl.appendChild(btn);
            shown++;
        });
        // 全部锁定 = 死局，给一个「继续」兜底，免得玩家卡在这里
        if (!chose) {
            var esc = el('button', 'gv-choice', '继续');
            esc.type = 'button';
            esc.onclick = function () {
                choicesEl.classList.remove('on');
                choicesEl.innerHTML = '';
                st.pc++;
                step();
            };
            choicesEl.appendChild(esc);
        }
        choicesEl.classList.add('on');
        if (st.auto) { st.auto = false; syncToolbar(); }
        if (st.skip) { st.skip = false; syncToolbar(); }
    }

    /* ---------------- 推进 ---------------- */
    function advance() {
        if (modal.classList.contains('on')) return;
        if (endEl.classList.contains('on')) return;
        if (choicesEl.classList.contains('on')) return;
        if (!st.started) return;
        if (st.typing) {
            // 立刻显示本页全文
            clearInterval(typeTimer);
            st.typed = st.pageText.length;
            textEl.textContent = st.pageText;
            st.typing = false;
            var isLast = st.page >= st.pages.length - 1;
            nextEl.classList.toggle('on', isLast);
            if (st.auto || st.skip) scheduleNext();
            return;
        }
        if (st.page < st.pages.length - 1) {
            st.page++;
            st.pageText = st.pages[st.page];
            st.typed = 0;
            textEl.textContent = '';
            typeStart();
            return;
        }
        clearTimeout(autoTimer);
        st.pc++;
        step();
    }

    /* ---------------- 存档 ---------------- */
    function snapshot() {
        return {
            pc: st.pc,
            vars: JSON.parse(JSON.stringify(st.vars)),
            bg: st.bg,
            sprites: JSON.parse(JSON.stringify(st.sprites)),
            history: st.history.slice(-120),
            speaker: st.speaker,
            text: (st.curNode && st.curNode.text) || '',
            name: st.curNode && st.curNode.char ? charName(st.curNode.char) : '',
            time: Date.now(),
            chapter: currentChapter()
        };
    }
    function currentChapter() {
        for (var i = Math.min(st.pc, NODES.length - 1); i >= 0; i--) {
            if (NODES[i] && NODES[i].type === 'label' && (NODES[i].chapter || NODES[i].name)) {
                return NODES[i].chapter || NODES[i].name;
            }
        }
        return D.title || '';
    }

    /* 自动存档 / 已读记录：都做防抖，避免每句都写一次 localStorage */
    var autoSaveTimer = null;
    function autoSaveNow() {
        clearTimeout(autoSaveTimer);
        autoSaveTimer = setTimeout(function () {
            if (st.started && !st.ended) {
                try { localStorage.setItem(SAVE_PREFIX + AUTO_SLOT, JSON.stringify(snapshot())); } catch (e) { /* 忽略 */ }
            }
        }, 400);
    }
    var seenTimer = null;
    function persistSeen() {
        if (!seenDirty) return;
        clearTimeout(seenTimer);
        seenTimer = setTimeout(function () {
            try { localStorage.setItem(SEEN_KEY, JSON.stringify(seen)); seenDirty = false; } catch (e) { /* 忽略 */ }
        }, 1200);
    }
    function doSave(slot) {
        try {
            localStorage.setItem(SAVE_PREFIX + slot, JSON.stringify(snapshot()));
            return true;
        } catch (e) {
            toast('存档失败：浏览器存储空间不足');
            return false;
        }
    }
    function readSave(slot) {
        try {
            var raw = localStorage.getItem(SAVE_PREFIX + slot);
            return raw ? JSON.parse(raw) : null;
        } catch (e) { return null; }
    }
    function restore(save) {
        if (!save) return;
        st.pc = save.pc || 0;
        st.vars = save.vars || {};
        st.sprites = save.sprites || {};
        st.history = save.history || [];
        st.ended = false;
        st.typing = false;
        st.auto = false;
        st.skip = false;
        clearInterval(typeTimer);
        clearTimeout(autoTimer);
        titleEl.classList.remove('on');
        endEl.classList.remove('on');
        modal.classList.remove('on');
        toolbar.style.display = '';
        choicesEl.classList.remove('on');
        choicesEl.innerHTML = '';
        spriteEls = {};
        spritesEl.innerHTML = '';
        setBg(save.bg || '', 'cut', false);
        st.started = true;
        // 重新执行当前节点：say / narrate 会重新显示这一句
        var n = NODES[st.pc];
        if (n && (n.type === 'say' || n.type === 'narrate')) {
            // 存的历史里已经含这一句，重放时会再 push 一次，先去掉末尾重复项
            var h = st.history[st.history.length - 1];
            if (h && h.text === String(n.text || '')) st.history.pop();
            renderSprites(n.char || '');
            showLine(n, n.type === 'narrate');
        } else {
            renderSprites('');
            step();
        }
        syncToolbar();
    }

    /* ---------------- 标题画面 ---------------- */
    function showTitle() {
        st.started = false;
        st.ended = false;
        st.typing = false;
        st.auto = false;
        st.skip = false;
        clearInterval(typeTimer);
        clearTimeout(autoTimer);
        textbox.classList.remove('on');
        choicesEl.classList.remove('on');
        choicesEl.innerHTML = '';
        endEl.classList.remove('on');
        modal.classList.remove('on');
        st.sprites = {};
        spritesEl.innerHTML = '';
        spriteEls = {};
        setBg(CFG.cover || '', 'cut', false);

        titleEl.innerHTML = '';
        if (CFG.cover) {
            var cover = el('div', 'gv-title-cover');
            cover.style.backgroundImage = cssUrl(CFG.cover);
            titleEl.appendChild(cover);
        }
        var h = el('h1', null, D.title || '未命名作品');
        titleEl.appendChild(h);
        if (CFG.subtitle) titleEl.appendChild(el('div', 'gv-sub', CFG.subtitle));

        var menu = el('div', 'gv-title-menu');
        var hasAuto = !!readSave(AUTO_SLOT);
        var bStart = el('button', 'primary', hasAuto ? '重新开始' : '开始游戏');
        bStart.onclick = function () { startNew(); };
        menu.appendChild(bStart);
        if (hasAuto) {
            var bCont = el('button', null, '继续游戏');
            bCont.onclick = function () { restore(readSave(AUTO_SLOT)); };
            menu.appendChild(bCont);
        }
        var bLoad = el('button', null, '读取存档');
        bLoad.onclick = function () { openLoad(); };
        var bCfg = el('button', null, '设置');
        bCfg.onclick = function () { openConfig(); };
        menu.appendChild(bLoad);
        menu.appendChild(bCfg);
        titleEl.appendChild(menu);
        titleEl.appendChild(el('div', 'gv-title-foot', (D.author ? D.author + ' · ' : '') + 'Powered by My SW GAL'));
        titleEl.classList.add('on');
        toolbar.style.display = 'none';
        syncToolbar();
    }

    function startNew() {
        st.pc = 0;
        st.vars = {};
        (D.vars || []).forEach(function (v) {
            if (v && v.name) st.vars[v.name] = parseVal(v.value);
        });
        st.history = [];
        st.sprites = {};
        st.bg = '';
        st.ended = false;
        st.started = true;
        spriteEls = {};
        spritesEl.innerHTML = '';
        titleEl.classList.remove('on');
        endEl.classList.remove('on');
        modal.classList.remove('on');
        toolbar.style.display = '';
        setBg('', 'cut', false);
        var start = CFG.startLabel ? resolveTarget(CFG.startLabel) : 0;
        if (start < 0) start = 0;
        st.pc = start;
        step();
        syncToolbar();
    }

    /* ---------------- 弹窗 ---------------- */
    function openModal(title) {
        modalTitle.textContent = title;
        modalBody.innerHTML = '';
        modalFoot.innerHTML = '';
        modal.classList.add('on');
    }
    function closeModal() { modal.classList.remove('on'); }

    function fmtTime(t) {
        if (!t) return '';
        var d = new Date(t);
        function p(n) { return n < 10 ? '0' + n : '' + n; }
        return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' +
            p(d.getHours()) + ':' + p(d.getMinutes());
    }

    function renderSaveGrid(mode) {
        // 每次重画都从干净的面板开始，否则点一次存档就会多出一组格子
        modalBody.innerHTML = '';
        var grid = el('div', 'gv-saves');
        for (var i = 1; i <= SLOTS; i++) {
            (function (i) {
                var sv = readSave(i);
                var cell = el('button', 'gv-save' + (sv ? '' : ' empty'));
                cell.type = 'button';
                var thumb = el('div', 'gv-save-thumb');
                if (sv && sv.bg) {
                    thumb.style.backgroundImage = cssUrl(sv.bg);
                } else if (sv) {
                    thumb.textContent = sv.chapter || D.title || '';
                    thumb.style.fontSize = '.74em';
                    thumb.style.color = '#7c8699';
                    thumb.style.letterSpacing = '.1em';
                } else {
                    thumb.textContent = '空';
                }
                cell.appendChild(thumb);
                var meta = el('div', 'gv-save-meta');
                var b = el('b', null, '存档 ' + i);
                meta.appendChild(b);
                if (sv) {
                    meta.appendChild(document.createTextNode((sv.chapter ? sv.chapter + ' · ' : '') + (sv.name ? sv.name + '：' : '')));
                    var t = el('small', null, (sv.text || '').slice(0, 26) + ((sv.text || '').length > 26 ? '…' : ''));
                    meta.appendChild(t);
                    var t2 = el('small', null, fmtTime(sv.time));
                    meta.appendChild(t2);
                } else {
                    meta.appendChild(el('small', null, mode === 'save' ? '点这里保存' : '没有记录'));
                }
                cell.appendChild(meta);
                cell.onclick = function () {
                    if (mode === 'save') {
                        if (!st.started) { toast('还没开始游戏'); return; }
                        if (doSave(i)) { toast('已存到存档 ' + i); renderSaveGrid('save'); }
                    } else {
                        if (!sv) return;
                        restore(sv);
                        toast('已读取存档 ' + i);
                    }
                };
                if (sv) {
                    var del = el('button', 'gv-save-del', '✕');
                    del.type = 'button';
                    del.onclick = function (ev) {
                        ev.stopPropagation();
                        try { localStorage.removeItem(SAVE_PREFIX + i); } catch (e) {}
                        renderSaveGrid(mode);
                    };
                    cell.appendChild(del);
                }
                grid.appendChild(cell);
            })(i);
        }
        modalBody.appendChild(grid);
    }

    function openSave() {
        openModal('存档');
        renderSaveGrid('save');
    }
    function openLoad() {
        openModal('读档');
        renderSaveGrid('load');
        var foot = modalFoot;
        var b = el('button', 'gv-modal-x', '关闭');
        b.style.width = 'auto';
        b.style.padding = '0 14px';
        b.onclick = closeModal;
        foot.appendChild(b);
    }

    function openLog() {
        openModal('回顾');
        var box = el('div', 'gv-log');
        if (!st.history.length) box.appendChild(el('div', 'gv-empty', '还没有已读的对话'));
        st.history.forEach(function (h) {
            var item = el('div', 'gv-log-item' + (h.narr ? ' narr' : ''));
            if (h.name) item.appendChild(el('div', 'gv-log-name', h.name));
            item.appendChild(el('div', 'gv-log-text', h.text));
            box.appendChild(item);
        });
        modalBody.appendChild(box);
        requestAnimationFrame(function () { box.scrollTop = box.scrollHeight; });
    }

    function openConfig() {
        openModal('设置');
        var body = modalBody;

        function rangeRow(label, hint, key, min, max, step, fmt) {
            var row = el('div', 'gv-row');
            var lab = el('div', 'gv-row-label');
            lab.appendChild(document.createTextNode(label));
            if (hint) lab.appendChild(el('small', null, hint));
            var val = el('span', 'gv-val', fmt(st.cfg[key]));
            var input = el('input');
            input.type = 'range';
            input.min = min; input.max = max; input.step = step || 1;
            input.value = st.cfg[key];
            input.oninput = function () {
                st.cfg[key] = Number(input.value);
                val.textContent = fmt(st.cfg[key]);
                saveCfg();
                if (key === 'volume' && bgmAudio) {
                    bgmAudio.volume = clamp((st.cfg.volume / 100), 0, 1);
                }
            };
            row.appendChild(lab); row.appendChild(input); row.appendChild(val);
            body.appendChild(row);
        }

        rangeRow('文字速度', '越大越快，100 为瞬间全出', 'speed', 0, 100, 1, function (v) { return v >= 100 ? '瞬间' : v + ''; });
        rangeRow('自动播放等待', '一句读完后停留的时间', 'autoDelay', 300, 5000, 100, function (v) { return (v / 1000).toFixed(1) + 's'; });
        rangeRow('音量', '背景音乐与音效', 'volume', 0, 100, 1, function (v) { return v + '%'; });

        function checkRow(label, hint, key, onChange) {
            var row = el('div', 'gv-row');
            var lab = el('div', 'gv-row-label');
            lab.appendChild(document.createTextNode(label));
            if (hint) lab.appendChild(el('small', null, hint));
            var sw = el('button', 'gv-switch' + (st.cfg[key] ? ' on' : ''));
            sw.type = 'button';
            sw.onclick = function () {
                st.cfg[key] = !st.cfg[key];
                sw.classList.toggle('on', !!st.cfg[key]);
                saveCfg();
                if (onChange) onChange(st.cfg[key]);
            };
            row.appendChild(lab); row.appendChild(sw);
            body.appendChild(row);
        }
        checkRow('快进时跳过未读', '关掉后只会跳过读过的句子', 'skipUnread');

        var actions = el('div', 'gv-row');
        var lab = el('div', 'gv-row-label');
        lab.appendChild(document.createTextNode('其他'));
        var btn = el('button', 'gv-modal-x', '清除已读记录');
        btn.style.width = 'auto'; btn.style.padding = '0 12px';
        btn.onclick = function () {
            try { localStorage.removeItem(SEEN_KEY); } catch (e) {}
            seen = {};
            toast('已清除');
        };
        actions.appendChild(lab); actions.appendChild(btn);
        body.appendChild(actions);

        var foot = modalFoot;
        var ok = el('button', 'gv-modal-x', '完成');
        ok.style.width = 'auto'; ok.style.padding = '0 16px';
        ok.onclick = closeModal;
        foot.appendChild(ok);
    }

    /* ---------------- 工具栏 ---------------- */
    function syncToolbar() {
        var autoBtn = toolbar.querySelector('[data-act="auto"]');
        var skipBtn = toolbar.querySelector('[data-act="skip"]');
        if (autoBtn) autoBtn.classList.toggle('active', st.auto);
        if (skipBtn) skipBtn.classList.toggle('active', st.skip);
    }

    toolbar.addEventListener('click', function (ev) {
        var b = ev.target.closest ? ev.target.closest('button') : null;
        if (!b) return;
        ev.stopPropagation();
        var act = b.getAttribute('data-act');
        if (act === 'auto') {
            st.auto = !st.auto;
            if (st.auto) { st.skip = false; if (!st.typing) scheduleNext(); }
            else clearTimeout(autoTimer);
            syncToolbar();
        } else if (act === 'skip') {
            st.skip = !st.skip;
            if (st.skip) { st.auto = false; if (!st.typing) scheduleNext(); }
            else clearTimeout(autoTimer);
            syncToolbar();
        } else if (act === 'log') openLog();
        else if (act === 'save') openSave();
        else if (act === 'load') openLoad();
        else if (act === 'config') openConfig();
        else if (act === 'title') showTitle();
        else if (act === 'full') toggleFull();
    });

    function toggleFull() {
        try {
            if (!document.fullscreenElement) {
                var p = document.documentElement.requestFullscreen();
                if (p && p.catch) p.catch(function () {});
            } else {
                document.exitFullscreen();
            }
        } catch (e) { toast('此浏览器不支持全屏'); }
    }

    /* ---------------- 事件 ---------------- */
    textbox.addEventListener('click', function (ev) {
        ev.stopPropagation();
        if (choicesEl.classList.contains('on')) return;
        advance();
    });
    app.addEventListener('click', function (ev) {
        if (ev.target.closest && ev.target.closest('.gv-toolbar')) return;
        if (ev.target.closest && ev.target.closest('.gv-modal')) return;
        if (ev.target.closest && ev.target.closest('.gv-title')) return;
        if (ev.target.closest && ev.target.closest('.gv-end')) return;
        if (ev.target.closest && (ev.target.closest('.gv-textbox') || ev.target.closest('.gv-choices'))) return;
        if (!st.started) return;
        advance();
    });

    modal.addEventListener('click', function (ev) {
        if (ev.target === modal) closeModal();
        var b = ev.target.closest ? ev.target.closest('[data-act="close"]') : null;
        if (b) closeModal();
    });

    document.addEventListener('keydown', function (ev) {
        var k = ev.key;
        if (k === 'Escape') {
            if (modal.classList.contains('on')) { closeModal(); ev.preventDefault(); return; }
            if (endEl.classList.contains('on')) { showTitle(); return; }
            openConfig();
            return;
        }
        if (k === ' ' || k === 'Enter' || k === 'ArrowRight' || k === 'PageDown') {
            if (modal.classList.contains('on')) return;
            ev.preventDefault();
            advance();
        } else if (k === 'ArrowDown') {
            if (modal.classList.contains('on')) return;
            ev.preventDefault();
            advance();
        } else if (k === 'a' || k === 'A') {
            st.auto = !st.auto; st.skip = false;
            if (st.auto && !st.typing) scheduleNext();
            syncToolbar();
        } else if (k === 'l' || k === 'L') {
            openLog();
        } else if (k === 'h' || k === 'H') {
            textbox.classList.toggle('hidden-ui');
        } else if (k === 'Control') {
            if (!st.skip) { st.skip = true; if (st.typing) { textEl.textContent = st.pageText; st.typed = st.pageText.length; clearInterval(typeTimer); st.typing = false; } scheduleNext(); syncToolbar(); }
        }
    });
    document.addEventListener('keyup', function (ev) {
        if (ev.key === 'Control' && st.skip) {
            st.skip = false;
            clearTimeout(autoTimer);
            syncToolbar();
        }
    });

    window.addEventListener('resize', fitScale);
    window.addEventListener('orientationchange', function () { setTimeout(fitScale, 120); });
    document.addEventListener('visibilitychange', function () {
        if (document.hidden) {
            clearTimeout(autoTimer);
            clearInterval(typeTimer);
        } else if (st.started && !st.typing && (st.auto || st.skip)) {
            scheduleNext();
        }
    });

    window.addEventListener('beforeunload', function () {
        if (seenDirty) {
            try { localStorage.setItem(SEEN_KEY, JSON.stringify(seen)); } catch (e) { /* 忽略 */ }
            seenDirty = false;
        }
    });

    /* ---------------- 启动 ---------------- */
    loadCfg();

    var qs = new URLSearchParams(location.search);
    // ?start=<节点id> 优先，其次是导出时写入 settings.startAt（试玩用，blob URL 读 query 不可靠）
    var startId = qs.get('start') || CFG.startAt || '';
    var noTitle = qs.get('notitle') === '1';

    if (startId) {
        st.vars = {};
        (D.vars || []).forEach(function (v) { if (v && v.name) st.vars[v.name] = parseVal(v.value); });
        var idx = resolveTarget(startId);
        st.started = true;
        st.pc = idx >= 0 ? idx : 0;
        // 先把 start 之前的背景/立绘状态跑一遍（不显示台词）
        fastForwardTo(st.pc);
        st.pc = idx >= 0 ? idx : 0;
        step();
    } else if (noTitle) {
        startNew();
    } else {
        showTitle();
    }

    /* 静默执行 start 之前的指令节点，让试玩时背景/立绘状态正确 */
    function fastForwardTo(target) {
        st.pc = 0;
        var guard = 0;
        while (st.pc < target && guard++ < 4000) {
            var n = NODES[st.pc];
            if (!n) { st.pc++; continue; }
            if (n.type === 'bg') { setBg(n.src, 'cut', false); st.pc++; continue; }
            if (n.type === 'show') {
                if (n.char) st.sprites[n.char] = { emo: n.emo || 'default', pos: n.pos || 'center' };
                st.pc++; continue;
            }
            if (n.type === 'hide') {
                if (n.char === 'all' || !n.char) st.sprites = {};
                else delete st.sprites[n.char];
                st.pc++; continue;
            }
            if (n.type === 'set') { applySet(n.name, n.op || 'set', n.value); st.pc++; continue; }
            if (n.type === 'say' || n.type === 'narrate') {
                if (n.char && n.emo && st.sprites[n.char]) st.sprites[n.char].emo = n.emo;
                st.pc++; continue;
            }
            if (n.type === 'jump') {
                var t = resolveTarget(n.target);
                if (t >= 0) {
                    if (t >= target) break;
                    st.pc = t; continue;
                }
                st.pc++; continue;
            }
            if (n.type === 'if') {
                var tt = resolveTarget(evalCond(n.cond) ? n.then : n.else);
                if (tt >= 0) {
                    if (tt >= target) break;
                    st.pc = tt; continue;
                }
                st.pc++; continue;
            }
            // 遇到选项无法预判玩家会选哪条，停在这里
            if (n.type === 'choice') break;
            st.pc++;
        }
        renderSprites('');
    }

    /* 让编辑器能读/写内存里的状态（仅调试用，不影响成品） */
    try {
        window.GalPlayer = {
            state: st,
            nodes: NODES,
            goto: function (i) { st.pc = i; step(); },
            startNew: startNew,
            showTitle: showTitle
        };
    } catch (e) {}
})();
