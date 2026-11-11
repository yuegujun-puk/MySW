/**
 * chat-vars.js —— 变量、宏替换与状态栏（跑团向）
 * · 三层作用域：global（所有角色共享）/ friend（跟着角色走，默认写入层）/
 * thread（只属于当前这条对话）。读取时按 thread → friend → global 顺序覆盖，
 * 所以「同一个角色换条对话想把 HP 重置」只要在 thread 层写同名变量即可。
 * · 变量名允许中文（跑团里基本都是中文键），所以不用 \w 限制。
 * · 宏是「宽松解析」：不认识的宏原样保留，避免和其它插件抢同名标记。
 * · AI 输出里的写指令（{{setvar::X::1}}、[var: HP-5]）在入库前就被摘掉，
 * 并且从显示文本里移除 —— 否则用户会在气泡里看到一串指令。
 * · 状态栏只显示「变量定义」里列过的变量，没定义的不显示（否则聊两句就满屏）。
 */
(function () {
    'use strict';

    var STORE_KEY = 'chatVars_v1';
    var MAX_VALUE_LEN = 200;

    function blankState() {
        return {
            values: { global: {}, byFriend: {}, byThread: {} },
            defs: [],               // [{ key, label, icon, color, max, bar, order }]
            barEnabled: true,
            autoExtract: true,
            injectHint: true,
            writeScope: 'friend'    // global | friend | thread
        };
    }

    function load() {
        var raw = null;
        try { raw = JSON.parse(localStorage.getItem(STORE_KEY) || 'null'); } catch (e) { raw = null; }
        var st = blankState();
        if (!raw || typeof raw !== 'object') return st;
        if (raw.values && typeof raw.values === 'object') {
            st.values = {
                global: (raw.values.global && typeof raw.values.global === 'object') ? raw.values.global : {},
                byFriend: (raw.values.byFriend && typeof raw.values.byFriend === 'object') ? raw.values.byFriend : {},
                byThread: (raw.values.byThread && typeof raw.values.byThread === 'object') ? raw.values.byThread : {}
            };
        }
        if (Array.isArray(raw.defs)) st.defs = raw.defs.filter(function (d) { return d && d.key; });
        st.barEnabled = raw.barEnabled !== false;
        st.autoExtract = raw.autoExtract !== false;
        st.injectHint = raw.injectHint !== false;
        st.writeScope = ['global', 'friend', 'thread'].indexOf(raw.writeScope) >= 0 ? raw.writeScope : 'friend';
        return st;
    }

    function save(st) {
        try { localStorage.setItem(STORE_KEY, JSON.stringify(st)); return true; }
        catch (e) { console.warn('[ChatVars] 保存失败（配额可能满了）:', e); return false; }
    }

    /* 「设置 → 聊天 → 增强功能开关 → 变量与状态栏」。
       关掉后：宏不展开、AI 的变量指令不执行、状态栏与顶栏入口都隐藏；
       数据（变量数值、定义）原样保留，重新打开立刻恢复。 */
    function varsOn() {
        try { return !window.FeatureFlags || window.FeatureFlags.get('chatVars') !== false; }
        catch (e) { return true; }
    }

    function currentCtx() {
        var fid = '';
        try { fid = window.getCurrentFriendId ? window.getCurrentFriendId() : ''; } catch (e) { fid = ''; }
        var tid = '';
        try {
            var th = window.getCurrentThread ? window.getCurrentThread() : null;
            tid = th && th.id != null ? String(th.id) : '';
        } catch (e) { tid = ''; }
        return { friendId: fid || '', threadId: tid };
    }

    function threadKey(ctx) { return String(ctx.friendId || '') + '::' + String(ctx.threadId || ''); }

    /* 三层合并：后写覆盖前写 */
    function mergedValues(ctx) {
        var st = load();
        var out = {};
        var g = st.values.global, f = st.values.byFriend[String(ctx.friendId || '')], t = st.values.byThread[threadKey(ctx)];
        [g, f, t].forEach(function (layer) {
            if (!layer || typeof layer !== 'object') return;
            Object.keys(layer).forEach(function (k) { out[k] = layer[k]; });
        });
        return out;
    }

    function layerOf(st, scope, ctx) {
        if (scope === 'global') return st.values.global;
        if (scope === 'thread') {
            var k = threadKey(ctx);
            if (!st.values.byThread[k] || typeof st.values.byThread[k] !== 'object') st.values.byThread[k] = {};
            return st.values.byThread[k];
        }
        var fid = String(ctx.friendId || '');
        if (!st.values.byFriend[fid] || typeof st.values.byFriend[fid] !== 'object') st.values.byFriend[fid] = {};
        return st.values.byFriend[fid];
    }

    function coerce(v) {
        if (typeof v === 'number') return v;
        var s = String(v == null ? '' : v).trim();
        if (s === '') return '';
        if (s.length > MAX_VALUE_LEN) s = s.slice(0, MAX_VALUE_LEN);
        // 纯数字（含负数/小数）就存成数字，方便 {{addvar}} 和进度条直接用
        if (/^-?\d+(\.\d+)?$/.test(s)) {
            var n = Number(s);
            return Number.isFinite(n) ? n : s;
        }
        return s;
    }

    function getVar(name, ctx) {
        if (!name) return undefined;
        var all = mergedValues(ctx || currentCtx());
        return all[String(name)];
    }

    function setVar(name, value, scope, ctx) {
        name = String(name || '').trim();
        if (!name) return false;
        ctx = ctx || currentCtx();
        var st = load();
        layerOf(st, scope || st.writeScope, ctx)[name] = coerce(value);
        save(st);
        return true;
    }

    function addVar(name, delta, scope, ctx) {
        name = String(name || '').trim();
        if (!name) return false;
        ctx = ctx || currentCtx();
        var cur = getVar(name, ctx);
        var base = Number(cur);
        if (!Number.isFinite(base)) base = 0;
        var d = Number(delta);
        if (!Number.isFinite(d)) d = 0;
        return setVar(name, base + d, scope, ctx);
    }

    function unsetVar(name, ctx) {
        name = String(name || '').trim();
        ctx = ctx || currentCtx();
        var st = load();
        [st.values.global, st.values.byFriend[String(ctx.friendId || '')], st.values.byThread[threadKey(ctx)]]
            .forEach(function (layer) { if (layer && layer[name] !== undefined) delete layer[name]; });
        save(st);
    }

    /* ---------------- 显示名 ---------------- */
    function userName() {
        var el = document.getElementById('my-display-name');
        var t = el ? String(el.textContent || '').trim() : '';
        return t || '用户';
    }
    function charName() {
        var el = document.getElementById('current-friend-name');
        var t = el ? String(el.textContent || '').trim() : '';
        if (t && t !== '加载中...') return t;
        try {
            var fid = window.getCurrentFriendId ? window.getCurrentFriendId() : '';
            var f = (window.getFriends ? window.getFriends() : {})[fid];
            return (f && f.name) || '角色';
        } catch (e) { return '角色'; }
    }

    /* ---------------- 宏展开 ---------------- */
    function pad2(n) { return n < 10 ? '0' + n : String(n); }
    function fmtTime(d) { return pad2(d.getHours()) + ':' + pad2(d.getMinutes()); }
    function fmtDate(d) { return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }
    function weekdayName(d) { return ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][d.getDay()]; }

    /* 骰子：2d6 / 1d20 / d20+3 / 3d8-1 */
    function rollDice(expr) {
        var s = String(expr || '').trim().toLowerCase().replace(/\s+/g, '');
        var m = /^(\d*)d(\d+)([+-]\d+)?$/.exec(s);
        if (!m) {
            var n = Number(s);
            return Number.isFinite(n) ? n : 0;
        }
        var count = Math.max(1, Math.min(100, parseInt(m[1] || '1', 10)));
        var faces = Math.max(2, Math.min(1000, parseInt(m[2], 10)));
        var bonus = m[3] ? parseInt(m[3], 10) : 0;
        var total = 0;
        for (var i = 0; i < count; i++) total += 1 + Math.floor(Math.random() * faces);
        return total + bonus;
    }

    var MACRO_RE = /\{\{([^{}]*)\}\}/g;

    function expandText(text, ctx) {
        if (typeof text !== 'string' || text.indexOf('{{') < 0) return text;
        if (!varsOn()) return text;   // 总开关关掉：宏一律原样保留（含展开接口的直接调用）
        ctx = ctx || currentCtx();
        var now = new Date();
        return text.replace(MACRO_RE, function (whole, inner) {
            var parts = String(inner).split('::');
            var cmd = String(parts[0] || '').trim().toLowerCase();
            switch (cmd) {
                case 'user': return userName();
                case 'char': return charName();
                case 'time': return fmtTime(now);
                case 'date': return fmtDate(now);
                case 'weekday': return weekdayName(now);
                case 'random': {
                    var pool = parts.slice(1);
                    if (!pool.length) return String(Math.floor(Math.random() * 100));
                    return pool[Math.floor(Math.random() * pool.length)].trim();
                }
                case 'pick': {
                    var p2 = parts.slice(1);
                    if (!p2.length) return '';
                    return p2[Math.floor(Math.random() * p2.length)].trim();
                }
                case 'roll': return String(rollDice(parts[1]));
                case 'getvar': case 'var': {
                    var v = getVar(parts[1], ctx);
                    return v === undefined || v === null ? '' : String(v);
                }
                case 'setvar': {
                    setVar(parts[1], parts.slice(2).join('::'), undefined, ctx);
                    return '';
                }
                case 'addvar': {
                    addVar(parts[1], parts.slice(2).join('::'), undefined, ctx);
                    return '';
                }
                default:
                    return whole;   // 不认识的宏原样保留，别抢别人的标记
            }
        });
    }

    /* 把一条消息的 content（可能是字符串，也可能是多段数组）整体展开 */
    function expandContent(content, ctx) {
        if (typeof content === 'string') return expandText(content, ctx);
        if (Array.isArray(content)) {
            return content.map(function (part) {
                if (!part || typeof part !== 'object') return part;
                if (typeof part.text === 'string') return Object.assign({}, part, { text: expandText(part.text, ctx) });
                return part;
            });
        }
        return content;
    }

    function hintText(ctx) {
        var vals = mergedValues(ctx || currentCtx());
        var keys = Object.keys(vals).slice(0, 40);
        if (!keys.length) {
            return '【变量】当前没有已记录的变量。需要维护状态（血量、金币、好感度等）时，'
                + '在回复里写 {{setvar::变量名::值}} 或 {{addvar::变量名::增减}}，系统会自动记录并显示在状态栏，'
                + '用户看不到这些指令本身。';
        }
        var lines = keys.map(function (k) { return k + ' = ' + String(vals[k]); });
        return '【变量（状态栏）】当前数值：\n' + lines.join('\n')
            + '\n修改方式：{{setvar::变量名::值}} 直接设值，{{addvar::变量名::增减}} 在当前值上加减（可为负）。'
            + '这些指令会被系统自动处理并从回复里移除，用户看不到，所以不要在正文里解释它们。';
    }

    /* 供 mysw-core 在发请求前调用：展开宏 + 追加状态栏提示 */
    function expandMessages(list, ctx) {
        if (!Array.isArray(list)) return list;
        if (!varsOn()) return list;
        ctx = ctx || currentCtx();
        var st = load();
        var out = list.map(function (m) {
            if (!m || typeof m !== 'object') return m;
            if (typeof m.content !== 'string' && !Array.isArray(m.content)) return m;
            return Object.assign({}, m, { content: expandContent(m.content, ctx) });
        });
        if (st.injectHint) {
            // 挂在第一条 system 的末尾：既保证模型能看到，又不新增 system 条数
            //（千问兼容模式要求 system 只有一条，多插一条会被拒）。
            var firstSystem = -1;
            for (var i = 0; i < out.length; i++) {
                if (out[i] && out[i].role === 'system' && typeof out[i].content === 'string') { firstSystem = i; break; }
            }
            if (firstSystem >= 0) {
                out[firstSystem] = Object.assign({}, out[firstSystem], {
                    content: out[firstSystem].content + '\n\n' + hintText(ctx)
                });
            }
        }
        return out;
    }

    /* ---------------- AI 输出里的写指令 ---------------- */
    var DIR_MACRO_RE = /\{\{\s*(setvar|addvar)\s*::([^{}]+?)\}\}/gi;
    var DIR_BRACKET_RE = /\[\[\s*var\s*:\s*([^\]|]+?)\s*(?:(\+|-|\(\+|\(-\)|=)\s*([^\]|]*))?\s*\]\]|\[\s*var\s*:\s*([^\]|]+?)\s*(?:(\+|-|\(\+|\(-\)|=)\s*([^\]|]*))?\s*\]/gi;

    /**
     * 从 AI 文本里抽走变量指令并落地。
     * 返回 { text, changes: [{ name, from, to }] }
     */
    function applyDirectives(text, ctx, scope) {
        if (typeof text !== 'string' || !text) return { text: text, changes: [] };
        if (!varsOn()) return { text: text, changes: [] };
        var st = load();
        if (!st.autoExtract) return { text: text, changes: [] };
        ctx = ctx || currentCtx();
        var changes = [];
        var before = mergedValues(ctx);

        var out = text.replace(DIR_MACRO_RE, function (whole, cmd, body) {
            var parts = String(body).split('::');
            var name = String(parts[0] || '').trim();
            var val = parts.slice(1).join('::');
            if (!name) return '';
            if (String(cmd).toLowerCase() === 'addvar') addVar(name, val, scope, ctx);
            else setVar(name, val, scope, ctx);
            return '';
        });

        out = out.replace(DIR_BRACKET_RE, function (whole, n1, op1, v1, n2, op2, v2) {
            var name = String(n1 || n2 || '').trim();
            var op = op1 || op2 || '';
            var raw = v1 != null ? v1 : (v2 != null ? v2 : '');
            if (!name) return '';
            if (!op) { addVar(name, raw === '' ? 1 : raw, scope, ctx); return ''; }
            if (op === '=') setVar(name, raw, scope, ctx);
            else if (op === '+' || op === '(+') addVar(name, Math.abs(Number(raw) || 0), scope, ctx);
            else addVar(name, -Math.abs(Number(raw) || 0), scope, ctx);
            return '';
        });

        // 整理空白：指令被摘掉后常在行尾留下空行
        out = out.replace(/[ \t]+$/gm, '').replace(/\n{3,}/g, '\n\n').trim();

        var after = mergedValues(ctx);
        Object.keys(after).forEach(function (k) {
            if (before[k] !== after[k]) changes.push({ name: k, from: before[k], to: after[k] });
        });
        if (changes.length) {
            save(load());
            renderBar();
            flashChanges(changes);
        }
        return { text: out, changes: changes };
    }

    /* ---------------- 状态栏 ---------------- */
    var flashTimer = null;
    function flashChanges(changes) {
        var bar = document.getElementById('cv-bar');
        if (!bar || !changes.length) return;
        var tip = document.getElementById('cv-flash');
        if (!tip) return;
        tip.textContent = changes.map(function (c) {
            var delta = Number(c.to) - Number(c.from);
            if (Number.isFinite(delta) && delta !== 0 && c.from !== undefined && c.from !== null) {
                return c.name + ' ' + (delta > 0 ? '+' : '') + delta;
            }
            return c.name + ' → ' + c.to;
        }).join(' · ');
        tip.classList.add('on');
        clearTimeout(flashTimer);
        flashTimer = setTimeout(function () { tip.classList.remove('on'); }, 2600);
    }

    function defFor(key, st) {
        for (var i = 0; i < st.defs.length; i++) if (st.defs[i].key === key) return st.defs[i];
        return null;
    }

    function ensureBarStyle() {
        if (document.getElementById('cv-style')) return;
        var css = document.createElement('style');
        css.id = 'cv-style';
        css.textContent = [
            '.cv-bar{display:flex;align-items:center;gap:6px;flex-wrap:wrap;padding:5px 14px;border-bottom:1px solid rgba(255,255,255,.06);background:rgba(255,255,255,.02);font-size:.76rem;line-height:1.5;min-height:0}',
            '.cv-bar[hidden]{display:none}',
            '.cv-chip{display:inline-flex;align-items:center;gap:6px;padding:3px 10px;border-radius:20px;border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.04);color:#c9cdd6;cursor:pointer;white-space:nowrap;transition:border-color .15s,background .15s}',
            '.cv-chip:hover{background:rgba(255,255,255,.09)}',
            '.cv-chip i{font-size:.9em;opacity:.9}',
            '.cv-chip b{font-weight:600;opacity:.75;font-size:.94em}',
            '.cv-chip .cv-val{font-weight:700;color:inherit;font-variant-numeric:tabular-nums;margin-left:1px}',
            '.cv-chip .cv-num{opacity:.55;font-size:.9em}',
            '.cv-progress{position:relative;width:40px;height:4px;border-radius:3px;background:rgba(255,255,255,.16);overflow:hidden;flex:0 0 auto}',
            '.cv-progress>i{position:absolute;left:0;top:0;bottom:0;border-radius:3px;background:currentColor;opacity:.85}',
            '.cv-flash{margin-left:4px;font-size:.72rem;color:#8fd08f;opacity:0;transition:opacity .25s;white-space:nowrap}',
            '.cv-flash.on{opacity:1}',
            '.cv-spacer{flex:1}',
            '.cv-open{border:0;background:transparent;color:#8b90a0;font-size:.72rem;cursor:pointer;padding:2px 6px;border-radius:6px}',
            '.cv-open:hover{color:#e6c78a;background:rgba(230,199,138,.12)}',
            '.cv-ovl{position:fixed;inset:0;z-index:9400;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(8,10,14,.62);backdrop-filter:blur(2px)}',
            '.cv-ovl[hidden]{display:none}',
            '.cv-box{width:min(680px,100%);max-height:min(84vh,760px);display:flex;flex-direction:column;background:#22252d;border:1px solid rgba(255,255,255,.1);border-radius:14px;box-shadow:0 24px 60px rgba(0,0,0,.5);overflow:hidden;color:#e9ecf4}',
            '.cv-head{display:flex;align-items:center;gap:8px;padding:12px 16px;border-bottom:1px solid rgba(255,255,255,.08)}',
            '.cv-head h3{margin:0;font-size:.98rem;font-weight:600;flex:1}',
            '.cv-head button{border:0;background:transparent;color:#a9afbd;font-size:1.1rem;cursor:pointer;padding:2px 6px;border-radius:8px}',
            '.cv-head button:hover{background:rgba(255,255,255,.08);color:#fff}',
            '.cv-body{padding:14px 16px;overflow:auto;flex:1}',
            '.cv-sec{margin-bottom:16px}',
            '.cv-sec:last-child{margin-bottom:0}',
            '.cv-sec>h4{margin:0 0 8px;font-size:.82rem;color:#e6c78a;font-weight:600;display:flex;align-items:center;gap:6px}',
            '.cv-tip{font-size:.74rem;color:#8b90a0;line-height:1.7;margin:0 0 8px}',
            '.cv-row{display:grid;grid-template-columns:1.2fr 1.2fr .8fr .8fr auto auto;gap:6px;align-items:center;margin-bottom:6px}',
            '.cv-row input[type=text],.cv-row input[type=number]{width:100%;padding:4px 8px;border-radius:7px;border:1px solid #41455220;border-color:rgba(255,255,255,.12);background:#2b2f38;color:#e9ecf4;font-size:.78rem}',
            '.cv-row input[type=color]{width:100%;height:26px;padding:0;border:1px solid rgba(255,255,255,.12);border-radius:7px;background:#2b2f38}',
            '.cv-row label{display:flex;align-items:center;gap:4px;font-size:.72rem;color:#a9afbd;white-space:nowrap}',
            '.cv-del{border:0;background:transparent;color:#c96a6a;cursor:pointer;font-size:.95rem;padding:2px 5px;border-radius:6px}',
            '.cv-del:hover{background:rgba(201,106,106,.16)}',
            '.cv-btn{padding:5px 12px;border-radius:8px;border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.05);color:#d5d9e2;font-size:.78rem;cursor:pointer}',
            '.cv-btn:hover{background:rgba(255,255,255,.1)}',
            '.cv-btn.primary{background:rgba(230,199,138,.18);border-color:rgba(230,199,138,.45);color:#f0d9a8}',
            '.cv-btn.danger{color:#e08d8d;border-color:rgba(224,141,141,.35)}',
            '.cv-foot{display:flex;gap:8px;align-items:center;padding:10px 16px;border-top:1px solid rgba(255,255,255,.08)}',
            '.cv-foot .sp{flex:1}',
            '.cv-kv{display:flex;flex-wrap:wrap;gap:6px}',
            '.cv-kv .cv-kvi{display:inline-flex;align-items:center;gap:5px;padding:3px 9px;border-radius:8px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.08);font-size:.75rem}',
            '.cv-kv .cv-kvi em{font-style:normal;color:#8b90a0}',
            '.cv-kv .cv-kvi b{color:#e6c78a}',
            '.cv-kv .cv-kvi span{cursor:pointer;opacity:.5;font-size:.9em}',
            '.cv-kv .cv-kvi span:hover{opacity:1;color:#e08d8d}',
            '.cv-inline{display:flex;align-items:center;gap:8px;font-size:.78rem;color:#c1c6d1;margin-bottom:8px}',
            '.cv-inline input[type=checkbox]{width:15px;height:15px;accent-color:#e6c78a}',
            '.cv-inline select{padding:3px 7px;border-radius:7px;border:1px solid rgba(255,255,255,.14);background:#2b2f38;color:#e9ecf4;font-size:.76rem}',
            '.cv-code{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:.74rem;background:rgba(255,255,255,.06);padding:1px 5px;border-radius:5px}'
        ].join('\n');
        document.head.appendChild(css);
    }

    function mountBar() {
        ensureBarStyle();
        if (document.getElementById('cv-bar')) return;
        var anchor = document.getElementById('chat-messages');
        if (!anchor || !anchor.parentNode) return;
        var bar = document.createElement('div');
        bar.id = 'cv-bar';
        bar.className = 'cv-bar';
        bar.hidden = true;
        anchor.parentNode.insertBefore(bar, anchor);
        renderBar();
    }

    function renderBar() {
        var bar = document.getElementById('cv-bar');
        if (!bar) return;
        var st = load();
        var ctx = currentCtx();
        if (!varsOn() || !st.barEnabled || !st.defs.length || !ctx.friendId) {
            bar.hidden = true;
            bar.innerHTML = '';
            return;
        }
        var vals = mergedValues(ctx);
        var defs = st.defs.slice().sort(function (a, b) { return (Number(a.order) || 0) - (Number(b.order) || 0); });
        var chips = defs.map(function (d) {
            var raw = vals[d.key];
            var has = raw !== undefined && raw !== null && raw !== '';
            var num = Number(raw);
            var max = Number(d.max);
            var showBar = d.bar !== false && Number.isFinite(num) && Number.isFinite(max) && max > 0;
            var pct = showBar ? Math.max(0, Math.min(100, (num / max) * 100)) : 0;
            var color = d.color || '#e6c78a';
            var valHtml = has
                ? '<span class="cv-val">' + escapeHtml(String(raw)) + '</span>'
                    + (showBar ? '<span class="cv-num">/' + escapeHtml(String(max)) + '</span>' : '')
                : '<span class="cv-val" style="opacity:.4">—</span>';
            // 顺序：图标 → 名字 → 进度条 → 数值/上限。进度条在数值左边，
            // 扫一眼是「HP ▬▬ 75/100」，比「HP 75/100 ▬▬」更像状态栏。
            return '<span class="cv-chip" data-cv-edit="' + escapeAttr(d.key) + '" title="点击修改「' + escapeAttr(d.label || d.key) + '」" style="color:' + escapeAttr(color) + '">'
                + (d.icon ? '<i class="' + escapeAttr(d.icon) + '"></i>' : '')
                + '<b>' + escapeHtml(d.label || d.key) + '</b>'
                + (showBar ? '<span class="cv-progress"><i style="width:' + pct.toFixed(1) + '%"></i></span>' : '')
                + valHtml
                + '</span>';
        }).join('');
        bar.innerHTML = chips
            + '<span class="cv-flash" id="cv-flash"></span>'
            + '<span class="cv-spacer"></span>'
            + '<button type="button" class="cv-open" id="cv-open-btn" title="变量与状态栏设置">变量</button>';
        bar.hidden = false;

        bar.querySelectorAll('[data-cv-edit]').forEach(function (chip) {
            chip.addEventListener('click', function () {
                var key = chip.getAttribute('data-cv-edit');
                var cur = mergedValues(currentCtx())[key];
                var next = window.prompt('「' + key + '」的新值：', cur === undefined ? '' : String(cur));
                if (next === null) return;
                setVar(key, next, undefined, currentCtx());
                renderBar();
            });
        });
        var openBtn = bar.querySelector('#cv-open-btn');
        if (openBtn) openBtn.addEventListener('click', openPanel);
    }

    function escapeHtml(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }
    function escapeAttr(s) { return escapeHtml(s); }

    /* ---------------- 设置面板 ---------------- */
    var panelEl = null;

    function openPanel() {
        ensureBarStyle();
        if (panelEl) { panelEl.remove(); panelEl = null; }
        var st = load();
        var ctx = currentCtx();
        var vals = mergedValues(ctx);

        var defRows = st.defs.map(function (d, i) {
            return '<div class="cv-row" data-def-row="' + i + '">'
                + '<input type="text" data-f="key" value="' + escapeAttr(d.key) + '" placeholder="变量名" title="变量名（宏里用的名字，可用中文）">'
                + '<input type="text" data-f="label" value="' + escapeAttr(d.label || '') + '" placeholder="显示名（可留空）">'
                + '<input type="text" data-f="icon" value="' + escapeAttr(d.icon || '') + '" placeholder="图标类名" title="Remix Icon 类名，如 ri-heart-3-line（可留空）">'
                + '<input type="color" data-f="color" value="' + escapeAttr(d.color || '#e6c78a') + '" title="颜色">'
                + '<label title="进度条上限，填 0 表示不显示进度条" style="justify-content:flex-end">上限 <input type="number" data-f="max" value="' + (Number(d.max) || 0) + '" style="width:56px"></label>'
                + '<button type="button" class="cv-del" data-def-del="' + i + '" title="删除这个变量">✕</button>'
                + '</div>';
        }).join('') || '<p class="cv-tip">还没有定义要显示的变量。点下面的「添加变量」，再在聊天里让 AI 修改它（或用宏 {{setvar::HP::100}}），状态栏就会出现。</p>';

        var kv = Object.keys(vals).map(function (k) {
            return '<span class="cv-kvi"><em>' + escapeHtml(k) + '</em><b>' + escapeHtml(String(vals[k])) + '</b>'
                + '<span data-kv-del="' + escapeAttr(k) + '" title="删除这个变量">✕</span></span>';
        }).join('') || '<span class="cv-tip" style="margin:0">当前作用域还没有变量。</span>';

        var overlay = document.createElement('div');
        overlay.className = 'cv-ovl';
        overlay.id = 'cv-panel';
        overlay.innerHTML = ''
            + '<div class="cv-box" role="dialog" aria-modal="true" aria-label="变量与状态栏">'
            + '  <div class="cv-head"><h3><i class="ri-database-2-line"></i> 变量与状态栏</h3>'
            + '    <button type="button" data-close aria-label="关闭">✕</button></div>'
            + '  <div class="cv-body">'
            + '    <div class="cv-sec">'
            + '      <h4><i class="ri-bar-chart-box-line"></i> 状态栏显示哪些变量</h4>'
            + '      <p class="cv-tip">这里列出的变量会以胶囊形式常驻在聊天区顶部；点状态栏上的胶囊可以直接改值。'
            + '「上限」大于 0 且值是数字时，会多一条进度条（HP / 体力这类很好用）。</p>'
            + '      <div id="cv-defs">' + defRows + '</div>'
            + '      <button type="button" class="cv-btn" id="cv-add-def"><i class="ri-add-line"></i> 添加变量</button>'
            + '    </div>'
            + '    <div class="cv-sec">'
            + '      <h4><i class="ri-list-check-2"></i> 当前值 <span style="font-weight:400;color:#8b90a0;font-size:.9em">（' + escapeHtml(scopeLabel(st.writeScope)) + '）</span></h4>'
            + '      <div class="cv-kv" id="cv-kv">' + kv + '</div>'
            + '    </div>'
            + '    <div class="cv-sec">'
            + '      <h4><i class="ri-settings-3-line"></i> 设置</h4>'
            + '      <label class="cv-inline"><input type="checkbox" id="cv-opt-bar"' + (st.barEnabled ? ' checked' : '') + '> 在聊天区顶部显示状态栏</label>'
            + '      <label class="cv-inline"><input type="checkbox" id="cv-opt-extract"' + (st.autoExtract ? ' checked' : '') + '> 自动执行 AI 回复里的变量指令（并从正文里移除）</label>'
            + '      <label class="cv-inline"><input type="checkbox" id="cv-opt-hint"' + (st.injectHint ? ' checked' : '') + '> 把当前变量值告诉模型（推荐开启，否则 AI 不知道 HP 是多少）</label>'
            + '      <label class="cv-inline">写入哪一层：'
            + '        <select id="cv-opt-scope">'
            + '          <option value="friend"' + (st.writeScope === 'friend' ? ' selected' : '') + '>这个角色（默认）</option>'
            + '          <option value="thread"' + (st.writeScope === 'thread' ? ' selected' : '') + '>这条对话</option>'
            + '          <option value="global"' + (st.writeScope === 'global' ? ' selected' : '') + '>全局共享</option>'
            + '        </select></label>'
            + '      <p class="cv-tip">读取时按「这条对话 → 这个角色 → 全局」覆盖：想给某条对话单独一套数值，就在这条对话里写同名变量。</p>'
            + '    </div>'
            + '    <div class="cv-sec">'
            + '      <h4><i class="ri-code-line"></i> 可用宏</h4>'
            + '      <p class="cv-tip" style="line-height:1.9">'
            + '        <code class="cv-code">{{user}}</code> 用户名字 · <code class="cv-code">{{char}}</code> 角色名字 · '
            + '        <code class="cv-code">{{time}}</code> 时间 · <code class="cv-code">{{date}}</code> 日期 · <code class="cv-code">{{weekday}}</code> 星期<br>'
            + '        <code class="cv-code">{{getvar::HP}}</code> 读变量 · <code class="cv-code">{{setvar::HP::100}}</code> 写变量 · '
            + '        <code class="cv-code">{{addvar::HP::-5}}</code> 加减<br>'
            + '        <code class="cv-code">{{random::甲::乙::丙}}</code> 随机取一个 · <code class="cv-code">{{roll::2d6}}</code> 掷骰'
            + '      </p>'
            + '      <p class="cv-tip">AI 也可以直接在回复里写 <code class="cv-code">{{setvar::金币::320}}</code>、'
            + '        <code class="cv-code">[var: 金币-20]</code>、<code class="cv-code">[var: HP=87]</code>，'
            + '        系统会记录数值并从气泡里清掉这些指令。</p>'
            + '    </div>'
            + '  </div>'
            + '  <div class="cv-foot"><button type="button" class="cv-btn danger" id="cv-reset-all">清空全部变量</button>'
            + '    <span class="sp"></span>'
            + '    <button type="button" class="cv-btn primary" data-close>完成</button></div>'
            + '</div>';
        document.body.appendChild(overlay);
        panelEl = overlay;

        var close = function () { overlay.remove(); panelEl = null; renderBar(); };
        overlay.addEventListener('click', function (e) {
            if (e.target === overlay || e.target.closest('[data-close]')) close();
        });

        var collectDefs = function () {
            var rows = overlay.querySelectorAll('[data-def-row]');
            var out = [];
            rows.forEach(function (row) {
                var key = row.querySelector('[data-f="key"]').value.trim();
                if (!key) return;
                out.push({
                    key: key,
                    label: row.querySelector('[data-f="label"]').value.trim(),
                    icon: row.querySelector('[data-f="icon"]').value.trim(),
                    color: row.querySelector('[data-f="color"]').value,
                    max: Number(row.querySelector('[data-f="max"]').value) || 0,
                    bar: true,
                    order: out.length
                });
            });
            return out;
        };
        var commit = function () {
            var s2 = load();
            s2.defs = collectDefs();
            save(s2);
            renderBar();
        };

        overlay.querySelectorAll('[data-f]').forEach(function (inp) {
            inp.addEventListener('change', commit);
        });
        overlay.querySelector('#cv-add-def').addEventListener('click', function () {
            var s2 = load();
            s2.defs = collectDefs();
            var base = '变量' + (s2.defs.length + 1);
            s2.defs.push({ key: base, label: '', icon: '', color: '#e6c78a', max: 100, bar: true, order: s2.defs.length });
            save(s2);
            close();
            openPanel();
        });
        overlay.querySelectorAll('[data-def-del]').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var s2 = load();
                s2.defs = collectDefs();
                s2.defs.splice(Number(btn.getAttribute('data-def-del')), 1);
                save(s2);
                close();
                openPanel();
            });
        });
        overlay.querySelectorAll('[data-kv-del]').forEach(function (btn) {
            btn.addEventListener('click', function () {
                unsetVar(btn.getAttribute('data-kv-del'), currentCtx());
                close();
                openPanel();
            });
        });
        overlay.querySelector('#cv-opt-bar').addEventListener('change', function (e) {
            var s2 = load(); s2.barEnabled = e.target.checked; save(s2); renderBar();
        });
        overlay.querySelector('#cv-opt-extract').addEventListener('change', function (e) {
            var s2 = load(); s2.autoExtract = e.target.checked; save(s2);
        });
        overlay.querySelector('#cv-opt-hint').addEventListener('change', function (e) {
            var s2 = load(); s2.injectHint = e.target.checked; save(s2);
        });
        overlay.querySelector('#cv-opt-scope').addEventListener('change', function (e) {
            var s2 = load(); s2.writeScope = e.target.value; save(s2);
        });
        overlay.querySelector('#cv-reset-all').addEventListener('click', function () {
            if (!window.confirm('清空全部变量（含全局层）？这个操作不可撤销。')) return;
            var s2 = load();
            s2.values = { global: {}, byFriend: {}, byThread: {} };
            save(s2);
            close();
            openPanel();
        });
    }

    function scopeLabel(v) {
        return v === 'global' ? '全局共享' : (v === 'thread' ? '这条对话' : '这个角色');
    }

    /* 聊天顶栏的入口按钮：状态栏只在「有变量定义」时才出现，
       新用户没有定义就完全看不到入口，所以顶栏这里必须常驻一个。 */
    function mountHeaderButton() {
        if (document.getElementById('chat-vars-btn')) return;
        var host = document.querySelector('#chat-header > div');
        if (!host) return;
        var btn = document.createElement('button');
        btn.className = 'icon-btn';
        btn.id = 'chat-vars-btn';
        if (!varsOn()) btn.style.display = 'none';
        btn.style.cssText = 'width:30px;height:30px;font-size:.8em;';
        btn.title = '变量与状态栏（{{getvar}} 等宏 / 跑团状态）';
        btn.setAttribute('aria-label', '变量与状态栏');
        btn.innerHTML = '<i class="ri-database-2-line"></i>';
        btn.addEventListener('click', openPanel);
        host.insertBefore(btn, host.firstChild);
    }

    /* ---------------- 初始化 ---------------- */
    function init() {
        ensureBarStyle();
        mountHeaderButton();
        renderBar();
        // 聊天区可能还没渲染出来（脚本比 DOM 晚），用一次重试兜底
        if (!document.getElementById('cv-bar')) setTimeout(mountBar, 600);
        // 切换角色 / 对话、重绘消息时状态栏要跟着换一套数值
        var lastKey = threadKey(currentCtx());
        setInterval(function () {
            var k = threadKey(currentCtx());
            if (k !== lastKey) { lastKey = k; renderBar(); }
            else if (!document.getElementById('cv-bar')) mountBar();
            if (!document.getElementById('chat-vars-btn')) mountHeaderButton();
        }, 1200);
    }

    /* 开关变化后同步界面：顶栏入口与状态栏一起显隐 */
    function applyVisibility() {
        var btn = document.getElementById('chat-vars-btn');
        if (btn) btn.style.display = varsOn() ? '' : 'none';
        if (!varsOn()) {
            var bar = document.getElementById('cv-bar');
            if (bar) { bar.hidden = true; bar.innerHTML = ''; }
            var panel = document.getElementById('cv-panel');
            if (panel) panel.remove();
            return;
        }
        renderBar();
    }

    window.ChatVars = {
        applyVisibility: applyVisibility,
        isEnabled: varsOn,
        load: load,
        save: save,
        currentCtx: currentCtx,
        mergedValues: mergedValues,
        get: getVar,
        set: setVar,
        add: addVar,
        unset: unsetVar,
        expandText: expandText,
        expandMessages: expandMessages,
        applyDirectives: applyDirectives,
        renderBar: renderBar,
        openPanel: openPanel,
        init: init
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () { setTimeout(init, 400); });
    } else {
        setTimeout(init, 400);
    }
})();
