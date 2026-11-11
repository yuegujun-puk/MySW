/**
 * ai-attributes.js —— AI 属性调节器（设置 → AI 配置）
 *
 * 干什么：给角色定义一组「可调属性」（智商、傲娇程度、猫耳大小……），
 * 每个属性一个数值，数值高低决定提示词里给模型的那句描述。
 * 比如把三月七的智商从 100 拉到 165，注入的就从「普通水平，偶尔犯迷糊」
 * 变成「非常聪明，能拆穿话里的漏洞」，模型演出来自然就不一样了。
 *
 * 三条边界，写在最前面，免得后来人当成 bug：
 *   1. 属性是**文字描述**，不是模型参数。同一组数值换模型效果可能完全不同，
 *      面板里写得很清楚 —— 这里不承诺「数值 200 就一定变天才」。
 *   2. 只注入提示词，不改动 temperature / top_p 之类的采样参数。
 *      那些在「生成参数」里，两者互不影响。
 *   3. 数据全在本机（localStorage），不上传，也不进聊天记录。
 *
 * 两种「自动」：
 *   · 自动调节：每轮回复前，在范围内小幅随机波动（无 token 开销），
 *     模拟「猫耳会抖、心情会变」；同时带一点回中趋势，免得一路漂到边界卡死。
 *   · AI 调节：允许模型在回复末尾写一行 [[attr:智商=+10]]，系统解析后
 *     从正文里摘掉（用户看不到），并把数值落到属性上。单次幅度按范围百分比封顶。
 *
 * 作用范围：默认一套「全局默认」，也可以给单个角色单独一套（继承全局的副本，
 * 改完只影响这个角色）。群聊里按各自成员取自己的那一套。
 *
 * 存储：localStorage['myswAiAttrsV1']，面板改动即时生效，不参与「保存设置」。
 */
(function () {
    'use strict';

    var KEY = 'myswAiAttrsV1';
    var LOG_LIMIT = 40;
    var NAME_MAX = 10;

    function $(id) { return document.getElementById(id); }

    function isEn() {
        try {
            return !!(window.SiteI18n && typeof SiteI18n.getLang === 'function' && SiteI18n.getLang() === 'en');
        } catch (e) { return false; }
    }

    function L(zh, en) { return isEn() ? en : zh; }

    function toast(msg, icon) {
        if (typeof window.showToast === 'function') window.showToast(msg, icon || 'ri-equalizer-2-line');
    }

    function clampNum(v, min, max) {
        var n = Number(v);
        if (!isFinite(n)) n = min;
        n = Math.round(n);
        if (n < min) n = min;
        if (n > max) n = max;
        return n;
    }

    function uid() {
        return 'u' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    }

    /* ============================================================
       内置属性
       bands 是「数值 → 描述」的分档表（升序，取最后一个 value >= 阈值的档）。
       中文和英文各一份：注入语言跟界面语言走。
       ============================================================ */
    var BUILTINS = [
        {
            id: 'cat-ears',
            zh: '猫耳大小', en: 'Cat ear size',
            min: 0, max: 100, value: 50,
            bands: {
                zh: [
                    [0, '几乎看不见，只有头顶两个小小的突起'],
                    [22, '小小的猫耳，会随情绪轻轻抖动'],
                    [45, '正常大小的猫耳，说话时会一抖一抖'],
                    [70, '明显的猫耳，被压下去还会自己弹回来'],
                    [88, '巨大的猫耳，几乎占满整个头顶，一动就晃']
                ],
                en: [
                    [0, 'barely visible, just two little bumps on top'],
                    [22, 'small ears that twitch with your mood'],
                    [45, 'normal-sized cat ears that flick when you talk'],
                    [70, 'obvious cat ears that spring back when pressed down'],
                    [88, 'huge cat ears covering most of your head, wobbling with every move']
                ]
            }
        },
        {
            id: 'cat-tail',
            zh: '猫尾巴长度', en: 'Cat tail length',
            min: 0, max: 100, value: 50,
            bands: {
                zh: [
                    [0, '没有尾巴，或者短到看不出来'],
                    [22, '短短一截，只能小幅度摆动'],
                    [45, '正常长度的猫尾巴，心情好时会慢慢摇'],
                    [70, '长长的尾巴，可以绕到身前来圈住自己'],
                    [88, '特别长的尾巴，稍不留神就扫到旁边的杯子和书']
                ],
                en: [
                    [0, 'no tail at all, or too short to notice'],
                    [22, 'a short stub that can only wag a little'],
                    [45, 'a normal cat tail that sways slowly when you are happy'],
                    [70, 'a long tail you can curl around yourself'],
                    [88, 'an absurdly long tail that keeps knocking things over']
                ]
            }
        },
        {
            id: 'tsundere',
            zh: '傲娇程度', en: 'Tsundere level',
            min: 0, max: 100, value: 55,
            bands: {
                zh: [
                    [0, '完全坦率，想什么就说什么，不会拐弯'],
                    [20, '偶尔嘴硬一下，很快就会自己找补'],
                    [45, '有点傲娇，嘴上不承认，行动上很诚实'],
                    [70, '明显傲娇，惯用「才、才不是为了你」这类说法'],
                    [88, '极度傲娇，越在意越凶，关心也要裹三层刺']
                ],
                en: [
                    [0, 'completely straightforward, says exactly what you think'],
                    [20, 'stubborn now and then, but quickly walks it back'],
                    [45, 'a bit tsundere: denies it out loud, acts otherwise'],
                    [70, 'clearly tsundere, always "i-it is not like I did it for you"'],
                    [88, 'extremely tsundere: the more you care, the sharper you get']
                ]
            }
        },
        {
            id: 'iq',
            zh: '智商', en: 'Intelligence',
            min: 40, max: 200, value: 100,
            bands: {
                zh: [
                    [40, '反应慢半拍，经常听不懂弦外之音'],
                    [70, '有点迟钝，会把玩笑话当成正事认真回答'],
                    [90, '普通水平，偶尔犯迷糊，需要人提醒'],
                    [110, '思路清楚，能抓住对方话里的重点'],
                    [130, '反应很快，逻辑严密，常能一针见血'],
                    [155, '非常聪明，能听出话里的漏洞，偶尔不动声色地炫技'],
                    [180, '近乎天才，随口一句就把复杂问题拆开讲明白']
                ],
                en: [
                    [40, 'slow on the uptake, often misses what is implied'],
                    [70, 'a bit dull, takes jokes at face value'],
                    [90, 'average: occasionally muddled, needs reminding'],
                    [110, 'clear-headed, catches the point quickly'],
                    [130, 'fast and rigorous, often cuts straight to the heart of it'],
                    [155, 'very sharp: spots the hole in an argument, sometimes shows off quietly'],
                    [180, 'near-genius: untangles complicated problems in one sentence']
                ]
            }
        },
        {
            id: 'eq',
            zh: '情商', en: 'Emotional intelligence',
            min: 0, max: 100, value: 50,
            bands: {
                zh: [
                    [0, '完全读不懂气氛，想到什么说什么'],
                    [25, '不太会看脸色，常常一句话把场面说冷'],
                    [50, '正常水平，能感觉到对方情绪的变化'],
                    [72, '很会察言观色，知道什么时候该闭嘴'],
                    [90, '共情力极高，一句话就能说到人心坎里']
                ],
                en: [
                    [0, 'cannot read the room at all, says whatever comes to mind'],
                    [25, 'poor at reading faces, often kills the mood'],
                    [50, 'normal: notices when the other person shifts mood'],
                    [72, 'very perceptive, knows when to stop talking'],
                    [90, 'deeply empathetic: one sentence lands right in the heart']
                ]
            }
        }
    ];

    function builtinById(id) {
        for (var i = 0; i < BUILTINS.length; i++) if (BUILTINS[i].id === id) return BUILTINS[i];
        return null;
    }

    function builtinName(id) {
        var b = builtinById(id);
        return b ? L(b.zh, b.en) : '';
    }

    /* 属性的显示名：用户改过就用用户的，内置的跟随界面语言 */
    function nameOf(it) {
        if (it && typeof it.name === 'string' && it.name.trim()) return it.name.trim();
        return builtinName(it && it.builtin) || L('未命名', 'Untitled');
    }

    /* 当前值落在哪一档，返回那一档的描述（自定义属性返回空串） */
    function bandOf(it) {
        var b = builtinById(it && it.builtin);
        if (!b || !b.bands) return '';
        var list = b.bands[isEn() ? 'en' : 'zh'] || [];
        var text = '';
        for (var i = 0; i < list.length; i++) {
            if (Number(it.value) >= list[i][0]) text = list[i][1];
        }
        return text;
    }

    function makeItem(src) {
        src = src || {};
        var min = Number(src.min);
        var max = Number(src.max);
        if (!isFinite(min)) min = 0;
        if (!isFinite(max)) max = 100;
        min = Math.round(min);
        max = Math.round(max);
        if (max <= min) max = min + 1;
        var value = Number(src.value);
        if (!isFinite(value)) value = Math.round((min + max) / 2);
        /* base = 用户（或 AI）设定的基准值，value = 这一轮实际生效的值。
           「自动调节」只在 base 附近抖动 value —— 若以范围中心为锚，
           聊久了数值会像随机游走一样漂走（实测 60 轮能从 50 漂到 32，
           看着就是「越聊越傻」）。没有 base 字段的老数据用 value 兜底。 */
        var base = Number(src.base);
        if (!isFinite(base)) base = value;
        return {
            id: typeof src.id === 'string' && src.id ? src.id : uid(),
            builtin: typeof src.builtin === 'string' ? src.builtin : '',
            name: typeof src.name === 'string' ? src.name.slice(0, NAME_MAX) : '',
            on: src.on === true,
            min: min,
            max: max,
            base: clampNum(base, min, max),
            value: clampNum(value, min, max),
            note: typeof src.note === 'string' ? src.note.slice(0, 80) : ''
        };
    }

    /* 内部用的 key：内置属性永远用它的 id，这样重命名也不会丢分档表 */
    function keyOf(it) {
        return it.builtin || it.id;
    }

    function defaultItems() {
        return BUILTINS.map(function (b) {
            return makeItem({ id: b.id, builtin: b.id, on: false, value: b.value, min: b.min, max: b.max });
        });
    }

    /* ============================================================
       存储
       ============================================================ */
    function normalizePreset(raw) {
        raw = raw && typeof raw === 'object' ? raw : {};
        var items = Array.isArray(raw.items) ? raw.items.map(makeItem) : defaultItems();
        return {
            enabled: raw.enabled === true,
            auto: raw.auto === true,
            /* 默认 8%：缺省时不能落到 0 —— 那样「自动调节」勾上了也一动不动，
               用户只会以为功能坏了。 */
            autoAmp: (function (v) {
                var n = Number(v);
                if (!isFinite(n)) return 8;
                return Math.max(0, Math.min(30, Math.round(n)));
            })(raw.autoAmp),
            aiTune: raw.aiTune === true,
            aiMax: Math.max(1, Math.min(100, Math.round(Number(raw.aiMax)) || 20)),
            items: items
        };
    }

    function normalizeConfig(raw) {
        raw = raw && typeof raw === 'object' ? raw : {};
        var cfg = {
            v: 1,
            scope: typeof raw.scope === 'string' && raw.scope ? raw.scope : 'global',
            global: normalizePreset(raw.global),
            chars: {},
            log: Array.isArray(raw.log) ? raw.log.slice(0, LOG_LIMIT) : []
        };
        if (raw.chars && typeof raw.chars === 'object') {
            Object.keys(raw.chars).forEach(function (id) {
                if (!id) return;
                cfg.chars[id] = normalizePreset(raw.chars[id]);
            });
        }
        /* 注意：不能因为「这个角色还没有自己的那一套」就把 scope 打回 global ——
           用户刚在下拉里选中某个角色、还没动手改，正是这个状态；
           一规范化就回退，会让第一次修改直接写进全局。这里只做兜底：
           scope 指向一个已经不存在的角色时，由 buildScopeSelect 负责回退。 */
        return cfg;
    }

    function read() {
        var raw = {};
        try { raw = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (e) { raw = {}; }
        return normalizeConfig(raw);
    }

    function write(cfg) {
        try {
            localStorage.setItem(KEY, JSON.stringify(cfg));
        } catch (e) {
            toast(L('属性设置存不下了（本机存储已满）', 'Could not save: local storage is full'), 'ri-alert-line');
        }
    }

    function clonePreset(p) {
        return normalizePreset(JSON.parse(JSON.stringify(p)));
    }

    /* 某个角色用哪一套：自己的优先，否则全局默认 */
    function pickPreset(cfg, friendId) {
        if (friendId && cfg.chars && cfg.chars[friendId]) return cfg.chars[friendId];
        return cfg.global;
    }

    /* ============================================================
       注入：把属性翻译成提示词
       ============================================================ */

    /* 自动调节：围绕「设定值 base」小幅随机抖动。
       每轮独立取随机数（不做累加），所以不会漂移 —— 关掉自动调节时数值
       也自然回到用户设定的那个数，不会留下一个跑偏的残值。 */
    function drift(p) {
        if (!p.auto) return;
        var amp = Math.max(0, Math.min(30, Number(p.autoAmp) || 0)) / 100;
        for (var i = 0; i < p.items.length; i++) {
            var it = p.items[i];
            if (!it.on) continue;
            var range = it.max - it.min;
            if (range <= 0) continue;
            var anchor = isFinite(Number(it.base)) ? Number(it.base) : it.value;
            var d = (Math.random() * 2 - 1) * range * amp;
            var next = clampNum(anchor + d, it.min, it.max);
            if (next !== it.value) it.value = next;
        }
    }

    /**
     * 生成要追加到系统提示词里的那段文字。
     * opts.dry = true：面板预览用，不触发自动波动、不改数据。
     */
    function buildPromptContext(friendId, opts) {
        var cfg = read();
        var p = pickPreset(cfg, friendId);
        if (!p || !p.enabled) return '';
        var items = p.items.filter(function (it) { return it.on; });
        if (!items.length) return '';

        if (p.auto && !(opts && opts.dry)) {
            drift(p);
            write(cfg);
        }

        var lines = ['', '', L('[角色属性]', '[Character attributes]')];
        lines.push(L(
            '以下是这个角色此刻的属性设定。请把它当作既成事实：在语气、用词、动作和判断里自然体现出来，'
            + '不要念出数值，也不要解释这套设定。',
            'The following are this character\'s current attributes. Treat them as established fact: '
            + 'let them show through tone, wording, actions and judgement. Do not recite the numbers or explain this block.'
        ));
        items.forEach(function (it) {
            var band = bandOf(it);
            var note = String(it.note || '').trim();
            var desc = band;
            if (note) desc = desc ? (desc + L('；', '; ') + note) : note;
            lines.push('- ' + nameOf(it) + '：' + it.value + L('（范围 ', ' (range ') + it.min + '–' + it.max + '）'
                + (desc ? L(' —— ', ' — ') + desc : ''));
        });

        if (p.aiTune) {
            var capPct = Math.max(1, Math.min(100, Number(p.aiMax) || 20));
            var names = items.map(function (it) {
                var cap = Math.max(1, Math.round((it.max - it.min) * capPct / 100));
                return nameOf(it) + L('（当前 ', ' (now ') + it.value + L('，单次最多 ±', ', max ±') + cap + '）';
            }).join(L('、', ', '));
            lines.push('');
            lines.push(L('[属性自主调节]', '[Attribute self-adjustment]'));
            lines.push(L(
                '如果剧情确实让你发生了变化（被打到、被夸奖、受惊、被说服、喝醉……），你可以修改自己的属性。'
                + '做法：在回复的**最末尾**单独另起一行，写 [[attr:属性名=新数值]]，'
                + '数值写成 +5 / -8 表示在当前值上增减，写成绝对数字表示直接设定；多个属性用分号隔开。',
                'If the scene genuinely changes you (hit on the head, praised, startled, persuaded, drunk...), you may adjust your own attributes. '
                + 'Put a single line at the very end of your reply: [[attr:Attribute name=new value]]. '
                + 'Use +5 / -8 to shift from the current value, or an absolute number to set it. Separate multiple attributes with semicolons.'
            ));
            lines.push(L('可调节：', 'Adjustable: ') + names);
            lines.push(L(
                '只在真的发生变化时才写这一行；没有变化就完全不要出现。不要解释、不要提及这行标记，它会被系统自动移除，用户看不到。',
                'Only write that line when something actually changed; otherwise omit it entirely. '
                + 'Never explain or mention the marker — the system removes it and the user never sees it.'
            ));
        }

        return lines.join('\n');
    }

    /* ============================================================
       AI 调节：解析 / 结算 / 剥离
       ============================================================ */
    var TAG_RE = /\[\[\s*attr\s*[:：]([^\[\]]*?)\]\]/gi;

    /** 文本里有没有「像我们标记」的片段（不依赖开关，用于兜底剥离） */
    function looksLikeAttrTag(s) {
        return /\[\[\s*attr\s*[:：]/i.test(String(s || ''));
    }

    /**
     * 摘掉标记后的收尾：标签两边常带着空格（模型写「正文 [[attr:…]]」），
     * 直接删会留下「正文  后面」这种双空格。这里把「空格 + 标签 + 空格」整体换成一个空格，
     * 再清掉行尾空格和连续空行 —— 只在标记确实存在时调用。
     */
    function cleanAfterStrip(raw) {
        var s = String(raw || '').replace(new RegExp('([ \\t]*)' + TAG_RE.source + '([ \\t]*)', 'gi'), ' ');
        return s
            .replace(/[ \t]+$/gm, '')
            .replace(/^(?:[ \t]*\r?\n)+/, '')
            .replace(/\n{3,}/g, '\n\n')
            .replace(/[\r\n\s]+$/, '');
    }

    function presetForTune(friendId) {
        var cfg = read();
        var own = !!(friendId && cfg.chars && cfg.chars[friendId]);
        var p = own ? cfg.chars[friendId] : cfg.global;
        if (!p || !p.enabled || !p.aiTune) return null;
        /* source 是「这次真正用的是哪一套」：角色没有单独设置时用的是全局，
           日志也应当记成全局，否则用户会以为改动只落在这个角色身上。 */
        return { cfg: cfg, preset: p, source: own ? friendId : 'global' };
    }

    function findItem(preset, rawName) {
        var want = String(rawName || '').trim().toLowerCase();
        if (!want) return null;
        var items = preset.items;
        // 先按显示名 / 内置名 / id 精确匹配，再退一步做「去空格后包含」
        for (var i = 0; i < items.length; i++) {
            var it = items[i];
            if (!it.on) continue;
            var candidates = [nameOf(it).toLowerCase(), builtinName(it.builtin).toLowerCase(), String(it.id).toLowerCase()];
            for (var j = 0; j < candidates.length; j++) {
                if (candidates[j] && candidates[j] === want) return it;
            }
        }
        for (var k = 0; k < items.length; k++) {
            var it2 = items[k];
            if (!it2.on) continue;
            var full = nameOf(it2).toLowerCase().replace(/\s+/g, '');
            if (full && (full.indexOf(want.replace(/\s+/g, '')) >= 0 || want.replace(/\s+/g, '').indexOf(full) >= 0)) return it2;
        }
        return null;
    }

    /**
     * 把一条 AI 回复里的 [[attr:…]] 全部吃掉，并落地数值。
     * 返回 { text, changes }：text 是给用户看的正文（永远不含标记）。
     * 功能没开时原样返回，零开销。
     */
    function consumeTags(friendId, text) {
        if (!text) return { text: text, changes: [] };
        var raw = String(text);
        if (raw.indexOf('[[') < 0) return { text: raw, changes: [] };
        var state = presetForTune(friendId);
        if (!state) {
            /* 功能没开（或关掉了）时不做结算，但「[[attr: …]]」这种形状的片段仍然要摘掉：
               用户可能刚关掉开关，而模型还记着上一轮的约定，把标记写到气泡里就没法看了。
               普通正文几乎不会出现这种片段，误伤风险可以忽略。 */
            if (!looksLikeAttrTag(raw)) return { text: raw, changes: [] };
            return { text: cleanAfterStrip(raw), changes: [] };
        }

        var changes = [];
        TAG_RE.lastIndex = 0;
        var m;
        while ((m = TAG_RE.exec(raw)) !== null) {
            var body = String(m[1] || '');
            body.split(/[;；,，]/).forEach(function (piece) {
                var seg = piece.trim();
                if (!seg) return;
                var mm = seg.match(/^(.+?)\s*[=＝]\s*([+\-＋－]?\s*\d+(?:\.\d+)?)$/);
                if (!mm) return;
                var it = findItem(state.preset, mm[1]);
                if (!it) return;
                var sign = /^[+\-＋－]/.test(mm[2].trim()) ? mm[2].trim().replace('＋', '+').replace('－', '-') : '';
                var num = Number(mm[2].replace(/[+\-＋－\s]/g, ''));
                if (!isFinite(num)) return;
                var before = it.value;
                var target = sign ? before + num : num;
                var cap = Math.max(1, Math.round((it.max - it.min) * Math.max(1, Math.min(100, Number(state.preset.aiMax) || 20)) / 100));
                var delta = Math.max(-cap, Math.min(cap, target - before));
                var next = clampNum(before + delta, it.min, it.max);
                if (next === before) return;
                it.value = next;
                /* AI 的改动成为新基准：否则下一轮自动调节会把它拉回原处，
                   用户会觉得「AI 改了但没生效」 */
                it.base = next;
                changes.push({ name: nameOf(it), from: before, to: next, id: keyOf(it) });
            });
        }

        if (!changes.length) {
            // 标签无效也要摘掉，绝不能漏到气泡里
            return { text: cleanAfterStrip(raw), changes: [] };
        }

        var stamp = Date.now();
        changes.forEach(function (c) {
            state.cfg.log.unshift({ t: stamp, scope: state.source, name: c.name, from: c.from, to: c.to });
        });
        state.cfg.log = state.cfg.log.slice(0, LOG_LIMIT);
        write(state.cfg);

        return { text: cleanAfterStrip(raw), changes: changes };
    }

    /* 只剥离标记，不结算（历史消息渲染、流式收尾用） */
    function stripTags(text) {
        if (!text) return text;
        var raw = String(text);
        if (raw.indexOf('[[') < 0) return raw;
        return cleanAfterStrip(raw);
    }

    /**
     * 流式阶段用：完整标签直接摘掉，末尾还没闭合的 [[attr:… 先切掉。
     * 不做数值结算 —— 最终内容会在 consumeTags 里统一处理。
     *
     * 刻意不读 localStorage：这个函数每秒会被调十几次（每帧渲染一次），
     * 而判断「要不要剥」根本不需要开关状态 —— 正文里出现 [[attr: 这种形状就该剥。
     * friendId 参数保留只是为了调用点写法统一。
     */
    function stripStream(text, friendId) {
        if (!text) return text;
        var raw = String(text);
        if (raw.indexOf('[[') < 0) return raw;
        var out = raw.replace(new RegExp(TAG_RE.source, 'gi'), '');
        var i = out.lastIndexOf('[[');
        if (i >= 0 && out.indexOf(']]', i) < 0) {
            // 只切「看起来像我们标记的开头」，别把用户自己的 [[ 一起吞了
            if (/^\[\[\s*(attr|属)\b/i.test(out.slice(i))) out = out.slice(0, i);
        }
        return out;
    }

    /* ============================================================
       面板
       ============================================================ */
    var panelReady = false;
    var saveTimer = 0;

    /* 把角色清单拼出来：内置索引 + 自定义角色，群聊容器跳过 */
    function friendList() {
        var map = {};
        try { Object.assign(map, window.defaultFriendsData || {}); } catch (e) { }
        try { Object.assign(map, JSON.parse(localStorage.getItem('customFriendsData')) || {}); } catch (e) { }
        var out = [];
        Object.keys(map).forEach(function (id) {
            var f = map[id];
            if (!f || !f.name) return;
            if (f.isGroup) return;
            out.push({ id: id, name: String(f.name) });
        });
        out.sort(function (a, b) {
            return a.name.localeCompare(b.name, 'zh-Hans-CN');
        });
        return out;
    }

    function scopeLabel() {
        var cfg = read();
        if (cfg.scope === 'global') return L('全局默认', 'Global default');
        var list = friendList();
        for (var i = 0; i < list.length; i++) if (list[i].id === cfg.scope) return list[i].name;
        return cfg.scope;
    }

    /* 当前正在编辑的那一套（不落盘） */
    function viewPreset(cfg) {
        if (cfg.scope !== 'global' && cfg.chars[cfg.scope]) return cfg.chars[cfg.scope];
        return cfg.global;
    }

    /* 改当前这一套：角色维度首次修改时自动复制全局的一份 */
    function mutate(fn) {
        var cfg = read();
        var scope = cfg.scope;
        var p;
        if (scope === 'global') {
            p = cfg.global;
        } else {
            // 角色维度第一次被改时，从全局复制一份（包括开关状态），
            // 之后这个角色的属性就与全局彻底独立
            if (!cfg.chars[scope]) cfg.chars[scope] = clonePreset(cfg.global);
            p = cfg.chars[scope];
        }
        fn(p, cfg);
        write(cfg);
        return p;
    }

    function schedulePreview() {
        clearTimeout(saveTimer);
        saveTimer = setTimeout(paintPreview, 120);
    }

    function itemEl(id) {
        var list = $('attr-list');
        if (!list) return null;
        var all = list.querySelectorAll('.attr-item');
        for (var i = 0; i < all.length; i++) if (all[i].dataset.id === id) return all[i];
        return null;
    }

    /* 只刷新单个卡片里的「值/档位/范围」，不重建 DOM（避免输入框失焦） */
    function paintItemValues(it) {
        var el = itemEl(keyOf(it));
        if (!el) return;
        var band = el.querySelector('[data-band]');
        if (band) {
            var desc = bandOf(it);
            var note = String(it.note || '').trim();
            var text = desc || '';
            if (note) text = text ? (text + L('；', '; ') + note) : note;
            band.textContent = text || L('自定义属性：只把数值写进提示词，可在上面补一句「该怎么表现」。',
                'Custom attribute: only the number is sent. Add a line above describing how it should show.');
            band.classList.toggle('is-empty', !text);
        }
        var rangeText = el.querySelector('[data-range-text]');
        if (rangeText) rangeText.textContent = it.min + '–' + it.max;
        var nameEl = el.querySelector('[data-act="name"]');
        if (nameEl && document.activeElement !== nameEl) nameEl.value = it.name || builtinName(it.builtin) || '';
        var num = el.querySelector('[data-act="num"]');
        if (num && document.activeElement !== num) num.value = it.value;
        var rng = el.querySelector('[data-act="range"]');
        if (rng) {
            rng.min = it.min; rng.max = it.max; rng.value = it.value;
        }
        var mn = el.querySelector('[data-act="min"]');
        if (mn && document.activeElement !== mn) mn.value = it.min;
        var mx = el.querySelector('[data-act="max"]');
        if (mx && document.activeElement !== mx) mx.value = it.max;
        var noteEl = el.querySelector('[data-act="note"]');
        if (noteEl && document.activeElement !== noteEl) noteEl.value = it.note || '';
    }

    function renderList() {
        var list = $('attr-list');
        if (!list) return;
        var cfg = read();
        var p = viewPreset(cfg);
        list.innerHTML = '';

        p.items.forEach(function (it) {
            var key = keyOf(it);
            var card = document.createElement('div');
            card.className = 'attr-item';
            card.dataset.id = key;
            if (!it.on) card.classList.add('is-off');
            card.innerHTML = [
                '<div class="attr-head">',
                '  <label class="attr-check" title="', L('是否启用这个属性', 'Enable this attribute'), '">',
                '    <input type="checkbox" data-act="on">',
                '  </label>',
                '  <input class="attr-name" data-act="name" maxlength="', NAME_MAX, '" autocomplete="off">',
                '  <span class="attr-builtin">', it.builtin ? L('内置', 'preset') : L('自定义', 'custom'), '</span>',
                '  <button type="button" class="attr-del" data-act="del" title="', L('删除这个属性', 'Delete this attribute'), '" aria-label="', L('删除', 'Delete'), '"><i class="ri-delete-bin-line"></i></button>',
                '</div>',
                '<div class="attr-bar">',
                '  <input type="range" data-act="range" aria-label="', L('数值', 'Value'), '">',
                '  <input type="number" class="attr-num" data-act="num" aria-label="', L('数值', 'Value'), '">',
                '  <span class="attr-range" data-range-text></span>',
                '</div>',
                '<div class="attr-meta">',
                '  <label><span>', L('最小', 'Min'), '</span><input type="number" data-act="min"></label>',
                '  <label><span>', L('最大', 'Max'), '</span><input type="number" data-act="max"></label>',
                '  <input class="attr-note" data-act="note" maxlength="80" placeholder="',
                L('补充一句：这个值该怎么表现（可留空）', 'Optional: how this value should show'), '">',
                '</div>',
                '<p class="attr-band" data-band></p>'
            ].join('');

            var on = card.querySelector('[data-act="on"]');
            on.checked = it.on === true;
            var nameEl = card.querySelector('[data-act="name"]');
            nameEl.value = it.name || builtinName(it.builtin) || '';
            var rng = card.querySelector('[data-act="range"]');
            rng.min = it.min; rng.max = it.max; rng.value = it.value;
            card.querySelector('[data-act="num"]').value = it.value;
            card.querySelector('[data-act="min"]').value = it.min;
            card.querySelector('[data-act="max"]').value = it.max;
            card.querySelector('[data-act="note"]').value = it.note || '';
            list.appendChild(card);
            paintItemValues(it);
        });

        var empty = $('attr-empty');
        if (empty) empty.hidden = p.items.length > 0;
        paintSwitches(p);
        paintPreview();
    }

    function paintSwitches(p) {
        var en = $('attr-enabled');
        if (en) en.checked = p.enabled === true;
        var auto = $('attr-auto');
        if (auto) auto.checked = p.auto === true;
        var amp = $('attr-auto-amp');
        if (amp) amp.value = p.autoAmp;
        var ampOut = $('attr-auto-amp-out');
        if (ampOut) ampOut.textContent = p.autoAmp + '%';
        var ai = $('attr-ai');
        if (ai) ai.checked = p.aiTune === true;
        var aiMax = $('attr-ai-max');
        if (aiMax) aiMax.value = p.aiMax;
        document.querySelectorAll('.attr-switch.is-dim').forEach(function (el) { el.classList.remove('is-dim'); });
        var autoBox = $('attr-auto') && $('attr-auto').closest('.attr-switch');
        if (autoBox) autoBox.classList.toggle('is-dim', p.auto !== true);
        var aiBox = $('attr-ai') && $('attr-ai').closest('.attr-switch');
        if (aiBox) aiBox.classList.toggle('is-dim', p.aiTune !== true);
        var drop = $('attr-drop-scope-btn');
        if (drop) drop.hidden = !(read().scope !== 'global');
        var count = $('attr-hint-count');
        if (count) {
            var n = p.items.filter(function (x) { return x.on; }).length;
            count.textContent = n
                ? L('已启用 ' + n + ' 项', n + ' enabled')
                : '';
            count.hidden = !n;
        }
    }

    function paintPreview() {
        var pre = $('attr-preview');
        if (!pre) return;
        var cfg = read();
        var scope = cfg.scope;
        var friendId = scope === 'global' ? '' : scope;
        var text = buildPromptContext(friendId, { dry: true });
        if (!text) {
            var p = viewPreset(cfg);
            if (!p.enabled) {
                pre.textContent = L('（「启用属性注入」没打开，这条提示词不会发出去。）',
                    '(Attribute injection is off — nothing is sent.)');
            } else if (!p.items.some(function (x) { return x.on; })) {
                pre.textContent = L('（一个属性都没启用，这条提示词不会发出去。）',
                    '(No attribute is enabled — nothing is sent.)');
            } else {
                pre.textContent = '';
            }
            pre.classList.add('is-empty');
            return;
        }
        pre.classList.remove('is-empty');
        pre.textContent = text.replace(/^\n+/, '');
    }

    function paintLog() {
        var box = $('attr-log');
        if (!box) return;
        var cfg = read();
        if (!cfg.log.length) {
            box.innerHTML = '<p class="attr-log-empty">' + L('还没有记录。开启「AI 调节」后，模型改动属性时会记在这里。',
                'Nothing yet. With AI adjustment on, changes made by the model show up here.') + '</p>';
            return;
        }
        var list = friendList();
        var nameMap = {};
        list.forEach(function (f) { nameMap[f.id] = f.name; });
        box.innerHTML = cfg.log.slice(0, 12).map(function (row) {
            var who = row.scope === 'global' ? L('全局', 'Global') : (nameMap[row.scope] || row.scope);
            var d = new Date(Number(row.t) || Date.now());
            var hh = ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2);
            var up = Number(row.to) > Number(row.from);
            return '<div class="attr-log-row"><span class="attr-log-time">' + hh + '</span>'
                + '<span class="attr-log-who">' + escapeHtml(who) + '</span>'
                + '<span class="attr-log-name">' + escapeHtml(row.name) + '</span>'
                + '<span class="attr-log-val ' + (up ? 'is-up' : 'is-down') + '">' + escapeHtml(String(row.from)) + ' → ' + escapeHtml(String(row.to)) + '</span>'
                + '</div>';
        }).join('');
    }

    function escapeHtml(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }

    function buildScopeSelect() {
        var sel = $('attr-scope');
        if (!sel) return;
        var cfg = read();
        var list = friendList();
        var html = ['<option value="global">' + L('全局默认（所有角色）', 'Global default (all characters)') + '</option>'];
        var exists = cfg.scope === 'global';
        list.forEach(function (f) {
            if (f.id === cfg.scope) exists = true;
            var own = cfg.chars[f.id] ? L(' · 已单独设置', ' · custom') : '';
            html.push('<option value="' + escapeHtml(f.id) + '">' + escapeHtml(f.name) + own + '</option>');
        });
        sel.innerHTML = html.join('');
        /* 存的角色被删了（导入覆盖、角色市场卸载）：回退到全局默认，并把存储一起修正，
           否则面板会停在一个空选项上，用户改什么都像没生效。 */
        if (!exists) {
            cfg.scope = 'global';
            write(cfg);
        }
        sel.value = cfg.scope;
    }

    function syncAll() {
        buildScopeSelect();
        renderList();
        paintLog();
    }

    /* 事件：属性列表（委托，卡片是动态生成的） */
    function onListInput(e) {
        var el = e.target;
        if (!el || !el.dataset || !el.dataset.act) return;
        var card = el.closest('.attr-item');
        if (!card) return;
        var key = card.dataset.id;
        var act = el.dataset.act;

        var p = mutate(function (p) {
            var it = null;
            for (var i = 0; i < p.items.length; i++) if (keyOf(p.items[i]) === key) { it = p.items[i]; break; }
            if (!it) return;

            if (act === 'name') {
                var v = String(el.value || '').trim();
                it.name = v === builtinName(it.builtin) ? '' : v.slice(0, NAME_MAX);
                return;
            }
            if (act === 'note') { it.note = String(el.value || '').slice(0, 80); return; }
            if (act === 'range' || act === 'num') {
                it.value = clampNum(el.value, it.min, it.max);
                /* 用户亲手拨到的位置就是新的基准：自动调节之后围着它抖，
                   而不是把用户刚拖到的数当成一次性偏移 */
                it.base = it.value;
                return;
            }
            if (act === 'min') {
                var mn = Math.round(Number(el.value));
                if (!isFinite(mn)) mn = it.min;
                it.min = Math.min(mn, it.max - 1);
                it.value = clampNum(it.value, it.min, it.max);
                it.base = clampNum(it.base, it.min, it.max);
                return;
            }
            if (act === 'max') {
                var mx = Math.round(Number(el.value));
                if (!isFinite(mx)) mx = it.max;
                it.max = Math.max(mx, it.min + 1);
                it.value = clampNum(it.value, it.min, it.max);
                it.base = clampNum(it.base, it.min, it.max);
                return;
            }
        });

        var it2 = null;
        for (var i = 0; i < p.items.length; i++) if (keyOf(p.items[i]) === key) { it2 = p.items[i]; break; }
        if (it2) paintItemValues(it2);
        schedulePreview();
    }

    function onListChange(e) {
        var el = e.target;
        if (!el || !el.dataset || !el.dataset.act) return;
        var card = el.closest('.attr-item');
        if (!card) return;
        if (el.dataset.act !== 'on') return;
        var key = card.dataset.id;
        mutate(function (p) {
            for (var i = 0; i < p.items.length; i++) {
                if (keyOf(p.items[i]) === key) { p.items[i].on = el.checked === true; break; }
            }
        });
        card.classList.toggle('is-off', !el.checked);
        paintSwitches(viewPreset(read()));
        schedulePreview();
    }

    function onListClick(e) {
        var btn = e.target && e.target.closest && e.target.closest('[data-act="del"]');
        if (!btn) return;
        var card = btn.closest('.attr-item');
        if (!card) return;
        var key = card.dataset.id;
        var cfg = read();
        var p = viewPreset(cfg);
        var target = null;
        for (var i = 0; i < p.items.length; i++) if (keyOf(p.items[i]) === key) target = p.items[i];
        if (target && !confirm(L('删除属性「', 'Delete attribute "') + nameOf(target) + L('」？', '"?'))) return;
        mutate(function (pp) {
            pp.items = pp.items.filter(function (x) { return keyOf(x) !== key; });
        });
        renderList();
        paintLog();
    }

    function bindPanel() {
        var list = $('attr-list');
        if (list && list.dataset.bound !== '1') {
            list.dataset.bound = '1';
            list.addEventListener('input', onListInput);
            list.addEventListener('change', onListChange);
            list.addEventListener('click', onListClick);
        }

        var scope = $('attr-scope');
        if (scope && scope.dataset.bound !== '1') {
            scope.dataset.bound = '1';
            scope.addEventListener('change', function () {
                var cfg = read();
                cfg.scope = scope.value || 'global';
                write(cfg);
                syncAll();
            });
        }

        var add = $('attr-add-btn');
        if (add && add.dataset.bound !== '1') {
            add.dataset.bound = '1';
            add.addEventListener('click', function () {
                var id = uid();
                mutate(function (p) {
                    p.items.push(makeItem({ id: id, name: L('新属性', 'New attribute'), on: true, value: 50, min: 0, max: 100 }));
                });
                renderList();
                var card = itemEl(id);
                if (card) {
                    var input = card.querySelector('[data-act="name"]');
                    if (input) { input.focus(); input.select(); }
                }
            });
        }

        var reset = $('attr-reset-btn');
        if (reset && reset.dataset.bound !== '1') {
            reset.dataset.bound = '1';
            reset.addEventListener('click', function () {
                var cfg = read();
                var p = viewPreset(cfg);
                if (!confirm(L('把「', 'Reset "') + scopeLabel() + L('」的属性恢复成内置五项（智商、情商、傲娇程度、猫耳大小、猫尾巴长度，全部不启用）？自定义属性会被删除。',
                    '" back to the five built-in attributes? Custom attributes will be removed.'))) return;
                mutate(function (pp) {
                    pp.items = defaultItems();
                });
                renderList();
                toast(L('属性已重置（记得勾选要启用的项）', 'Attributes reset — remember to enable the ones you want'), 'ri-restart-line');
            });
        }

        var drop = $('attr-drop-scope-btn');
        if (drop && drop.dataset.bound !== '1') {
            drop.dataset.bound = '1';
            drop.addEventListener('click', function () {
                var cfg = read();
                if (cfg.scope === 'global') return;
                delete cfg.chars[cfg.scope];
                cfg.scope = 'global';
                write(cfg);
                syncAll();
                toast(L('已取消该角色的单独设置，回到全局默认', 'Custom settings removed; back to global default'), 'ri-arrow-go-back-line');
            });
        }

        var en = $('attr-enabled');
        if (en && en.dataset.bound !== '1') {
            en.dataset.bound = '1';
            en.addEventListener('change', function () {
                mutate(function (p) { p.enabled = en.checked === true; });
                paintSwitches(viewPreset(read()));
                paintPreview();
            });
        }

        var auto = $('attr-auto');
        if (auto && auto.dataset.bound !== '1') {
            auto.dataset.bound = '1';
            auto.addEventListener('change', function () {
                mutate(function (p) { p.auto = auto.checked === true; });
                paintSwitches(viewPreset(read()));
                paintPreview();
            });
        }

        var amp = $('attr-auto-amp');
        if (amp && amp.dataset.bound !== '1') {
            amp.dataset.bound = '1';
            amp.addEventListener('input', function () {
                mutate(function (p) { p.autoAmp = Math.max(0, Math.min(30, Math.round(Number(amp.value) || 0))); });
                var out = $('attr-auto-amp-out');
                if (out) out.textContent = amp.value + '%';
            });
        }

        var ai = $('attr-ai');
        if (ai && ai.dataset.bound !== '1') {
            ai.dataset.bound = '1';
            ai.addEventListener('change', function () {
                mutate(function (p) { p.aiTune = ai.checked === true; });
                paintSwitches(viewPreset(read()));
                paintPreview();
            });
        }

        var aiMax = $('attr-ai-max');
        if (aiMax && aiMax.dataset.bound !== '1') {
            aiMax.dataset.bound = '1';
            aiMax.addEventListener('input', function () {
                mutate(function (p) { p.aiMax = Math.max(1, Math.min(100, Math.round(Number(aiMax.value) || 20))); });
                schedulePreview();
            });
        }

        panelReady = true;
    }

    function boot() {
        bindPanel();
        if ($('attr-list')) syncAll();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot, { once: true });
    } else {
        boot();
    }

    /* 切换语言：内置属性名与档位描述要跟着变，重建一次列表即可 */
    window.addEventListener('sitelangchange', function () {
        if (!panelReady) return;
        syncAll();
    });

    /* 设置面板被重建 / 切到 AI 配置 tab 时补一次挂载 */
    document.addEventListener('click', function (e) {
        var tab = e.target && e.target.closest && e.target.closest('[data-tab="api"]');
        if (tab) setTimeout(boot, 0);
    }, true);

    /* ============================================================
       对外接口
       ============================================================ */
    window.AiAttributes = {
        buildPromptContext: buildPromptContext,
        consumeTags: consumeTags,
        stripTags: stripTags,
        stripStream: stripStream,
        /* 调试 / 其他模块用 */
        list: function (friendId) {
            var cfg = read();
            var p = pickPreset(cfg, friendId);
            return p.items.map(function (it) {
                return { name: nameOf(it), value: it.value, base: it.base, min: it.min, max: it.max, on: it.on, builtin: it.builtin || '', band: bandOf(it) };
            });
        },
        defaults: function () { return defaultItems().map(function (it) { return nameOf(it); }); },
        /* 导入配置后重绘面板（存储被外部替换时调用） */
        refresh: function () { if (panelReady) syncAll(); },
        resetAll: function () {
            try { localStorage.removeItem(KEY); } catch (e) { }
            syncAll();
        },
        _read: read
    };
})();
