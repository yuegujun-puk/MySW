/* ========================================================================
   GAL 工作室 · 剧本转 GAL
   —— 把一段剧本 / 大纲交给用户自己配置的模型，换回可直接跑的节点序列。
   —— 这里只做四件事：读配置、拼提示词、发请求、把结果校准成引擎认识的形状。
      界面与「要不要真的写进作品」由 gal.js 决定。
   —— 复用 api-protocol.js 的三协议适配：OpenAI 兼容 / Claude / Gemini。
   ======================================================================== */
(function () {
    'use strict';

    var EMO = ['default', 'happy', 'sad', 'angry', 'shy', 'surprised',
        'neutral', 'love', 'excited', 'thinking', 'laugh', 'cry'];
    var POS = ['left', 'center', 'right', 'farleft', 'farright'];
    var KINDS = ['good', 'normal', 'bad', 'true', 'hidden'];

    // ---------------------------------------------------------------- 配置
    function parse(raw, fb) {
        try { var v = JSON.parse(raw); return v && typeof v === 'object' ? v : fb; } catch (e) { return fb; }
    }

    /* 和主站共用同一份 API 配置。
       先看「多站点」里的当前站点（主站设置里配的那套），没有再退回旧的单站点字段。 */
    function readConfig() {
        var ep = parse(localStorage.getItem('apiEndpoints') || '', null);
        var main = parse(localStorage.getItem('aiChatSettings') || '', {});
        var site = null;

        if (ep && Array.isArray(ep.sites) && ep.sites.length) {
            var enabled = ep.sites.filter(function (s) { return s && s.enabled !== false && s.url; });
            site = enabled.filter(function (s) { return s.id === ep.activeSiteId; })[0] || enabled[0] || null;
        }

        var url = (site && site.url) || main.apiUrl || '';
        var key = (site && (site.key || site.apiKey)) || main.apiKey || '';
        var model = (site && (site.model || (site.backupModels || [])[0])) || main.modelName || '';
        var protocol = 'openai';
        try {
            if (window.ApiProtocol) protocol = window.ApiProtocol.detect(url, main.apiProtocol);
        } catch (e) { protocol = 'openai'; }

        return {
            url: String(url || '').trim(),
            key: String(key || '').trim(),
            model: String(model || '').trim(),
            protocol: protocol,
            siteName: (site && site.name) || '默认站点',
            ok: !!(url && model)
        };
    }

    function configHint() {
        var c = readConfig();
        if (!c.url) return '还没配 API。去主站「设置 → API」填一个地址和模型，再回来。';
        if (!c.model) return 'API 地址有了，但没填模型名。去「设置 → API」补上。';
        return '';
    }

    // ---------------------------------------------------------------- 提示词
    function assetDigest(assets) {
        if (!assets || !assets.length) return '（素材库是空的，所有画面用 place 文字描述，不要写 lib 字段）';
        var lines = assets.map(function (a) {
            var bits = ['id=' + a.id, 'name=' + a.name];
            bits.push(a.kind === 'audio' ? '音频' : '图片');
            if (a.w && a.h) bits.push(a.w + 'x' + a.h);
            if (a.tags && a.tags.length) bits.push('标签:' + a.tags.join('/'));
            return '- ' + bits.join(' | ');
        });
        return lines.join('\n');
    }

    function systemPrompt(opts, assets, chars) {
        var span = opts.span || 'medium';
        var count = span === 'short' ? '25~40' : (span === 'long' ? '90~140' : '45~70');
        var useAssets = !!(assets && assets.length) && opts.useAssets !== false;

        var p = [];
        p.push('你是视觉小说（GAL）的分镜师，不是编剧。故事是用户写的，台词是用户写的——你的工作是把它原样拆成能直接在引擎里播放的节点序列，不是重写、不是润色、不是扩写。');
        p.push('');
        p.push('三条底线：用户写了的台词，一个字都不要改（错别字也照抄，用户自己会改）；用户没写的剧情，不要自己编（宁可少一个节点，也不要凭空加一段转折）；用户给的顺序，就是节点顺序。');
        p.push('');
        p.push('【输出要求】');
        p.push('只输出一个 JSON 对象。不要 Markdown 代码块，不要任何解释、前言、注释、结尾寒暄。第一个字符必须是 {。');
        p.push('');
        p.push('JSON 结构：');
        p.push('{');
        p.push('  "title": "作品名（不超过 16 字）",');
        p.push('  "subtitle": "副标题（可空）",');
        p.push('  "chars": [{"key":"c1","name":"角色名","color":"#e6c78a"}],');
        p.push('  "vars": [{"name":"好感","value":0}],');
        p.push('  "nodes": [ 节点, 节点, ... ]');
        p.push('}');
        p.push('');
        p.push('节点只有这几种，字段不要增减、不要嵌套别的结构：');
        p.push('{"type":"narrate","text":"旁白"}');
        p.push('{"type":"bg","place":"地点名","lib":"素材id"}');
        p.push('{"type":"show","char":"c1","emo":"default","pos":"center"}');
        p.push('{"type":"hide","char":"c1"}');
        p.push('{"type":"say","char":"c1","emo":"happy","text":"台词"}');
        p.push('{"type":"choice","prompt":"要怎么做？","choices":[{"text":"选项文字","to":"标签名"}]}');
        p.push('{"type":"label","name":"标签名","chapter":"第一章 · 雨夜"}');
        p.push('{"type":"jump","to":"标签名"}');
        p.push('{"type":"end","kind":"good","title":"结局名","text":"结局的一句话"}');
        p.push('');
        p.push('emo 只能取：' + EMO.join(' / '));
        p.push('pos 只能取：' + POS.join(' / '));
        p.push('end 的 kind 只能取：' + KINDS.join(' / '));
        p.push('');
        p.push('【硬性规则】');
        p.push('1. 每条 say 的 text 不超过 80 字，每段 narrate 不超过 120 字。长段落必须拆成多条，不要出现大段独白。');
        p.push('2. 分支用 label 做锚点。choice 的 to、jump 的 to 必须等于某个 label 的 name，一字不差。禁止跳到不存在的标签。');
        p.push('3. 每条支线的最后都要有 end。不要有走不出去的死路。');
        p.push('4. 前 5 个节点内必须出现第一个画面（bg 或 show），不要连续超过 6 条纯对话。');
        p.push('5. 只有真正说话的角色才列进 chars。旁白不给 char。');
        p.push('6. 同一场景里，角色出场用 show，离开用 hide，不要重复 show 同一个人。');
        p.push('7. 台词要有具体的动作、物件、停顿，不要写成「她感到很难过」这种总结。');
        p.push('8. 不要出现「作为一个 AI」「以下是」这类元叙述。');
        p.push('9. lib 字段只能填下面清单里出现过的 id，不许自己编。清单里没有合适的时候，把 lib 整个省略。');
        p.push('');
        p.push('【篇幅】约 ' + count + ' 个节点。' + (opts.branch === false ? '不要做分支，写成一条完整直线。' : '做 2~3 个有意义的分支，至少两个不同结局。'));
        p.push('【语气】' + (opts.tone || '跟着原剧本的调子走，不要擅自加旁白式说教。'));
        if (useAssets) {
            p.push('');
            p.push('【可用素材】只允许在 bg 和 sound 节点里用 lib 引用，写法 "lib":"<id>"。');
            p.push(assetDigest(assets));
            p.push('如果清单里有合适的背景，优先用它；没有就只写 place，让引擎走默认底图。');
        } else {
            p.push('');
            p.push('【素材】这一轮不用素材库，所有 bg 只写 place，不要出现 lib 字段。');
        }
        if (chars && chars.length) {
            p.push('');
            p.push('【已有角色】可以复用，也可以新增。已有：' + chars.map(function (c) { return c.name; }).join('、'));
        }
        return p.join('\n');
    }

    // ---------------------------------------------------------------- 请求
    function buildRequest(cfg, messages, opts) {
        var protocol = cfg.protocol;
        var settings = {
            apiUrl: cfg.url,
            apiKey: cfg.key,
            modelName: cfg.model,
            apiProtocol: protocol,
            temperature: 0.82,
            maxTokens: opts.maxTokens || 8000
        };
        var headers = { 'Content-Type': 'application/json' };
        try {
            if (window.ApiProtocol) headers = window.ApiProtocol.buildHeaders(protocol, cfg.key);
        } catch (e) {
            if (cfg.key) headers['Authorization'] = 'Bearer ' + cfg.key;
        }

        var body = null;
        try {
            if (window.ApiProtocol && protocol !== 'openai') {
                body = window.ApiProtocol.buildBody(settings, messages, {
                    stream: false,
                    temperature: 0.82,
                    max_tokens: opts.maxTokens || 8000
                }, protocol);
            }
        } catch (e) { body = null; }

        if (!body) {
            body = {
                model: cfg.model,
                messages: messages,
                temperature: 0.82,
                max_tokens: opts.maxTokens || 8000,
                stream: false
            };
        }

        var url = cfg.url;
        try {
            if (window.ApiProtocol) {
                url = window.ApiProtocol.buildUrl(cfg.url, { protocol: protocol, model: cfg.model, stream: false });
            }
        } catch (e) { /* 用原地址 */ }

        return { url: url, headers: headers, body: body, protocol: protocol };
    }

    async function callModel(cfg, messages, opts) {
        var req = buildRequest(cfg, messages, opts || {});
        var controller = new AbortController();
        var timer = setTimeout(function () { controller.abort(); }, (opts && opts.timeout) || 240000);
        try {
            var resp = await fetch(req.url, {
                method: 'POST',
                headers: req.headers,
                body: JSON.stringify(req.body),
                signal: controller.signal
            });
            var text = await resp.text();
            if (!resp.ok) {
                var detail = '';
                try {
                    var err = JSON.parse(text);
                    detail = (err.error && (err.error.message || err.error)) || err.message || '';
                } catch (e) { detail = text.slice(0, 200); }
                throw new Error('接口返回 ' + resp.status + (detail ? '：' + detail : ''));
            }
            var data;
            try { data = JSON.parse(text); } catch (e) {
                throw new Error('接口返回的不是 JSON（可能被网关拦了）');
            }
            try {
                if (window.ApiProtocol) data = window.ApiProtocol.normalizeResponse(req.protocol, data);
            } catch (e) { /* 保持原样 */ }

            var content = '';
            if (data && data.choices && data.choices[0]) {
                var msg = data.choices[0].message || {};
                content = msg.content || data.choices[0].text || '';
                if (Array.isArray(content)) {
                    content = content.map(function (x) { return typeof x === 'string' ? x : (x && x.text) || ''; }).join('');
                }
            }
            if (!content && data && data.error) {
                throw new Error(data.error.message || '模型返回错误');
            }
            if (!content) throw new Error('模型没有返回内容（可能是 max_tokens 太小，或这条模型不支持非流式）');
            return String(content);
        } finally {
            clearTimeout(timer);
        }
    }

    // ---------------------------------------------------------------- 解析
    function stripFence(text) {
        var s = String(text || '').trim();
        s = s.replace(/^```(?:json|JSON)?\s*/, '').replace(/```\s*$/, '').trim();
        return s;
    }

    function extractJson(text) {
        var s = stripFence(text);
        var start = s.indexOf('{');
        var end = s.lastIndexOf('}');
        if (start < 0 || end <= start) throw new Error('返回里找不到 JSON');
        var body = s.slice(start, end + 1);
        try {
            return JSON.parse(body);
        } catch (e) {
            // 常见小毛病：尾逗号、中文引号。修一遍再试。
            var fixed = body
                .replace(/,\s*([}\]])/g, '$1')
                .replace(/[\u201c\u201d]/g, '"')
                .replace(/[\u2018\u2019]/g, "'");
            try { return JSON.parse(fixed); } catch (e2) {
                throw new Error('JSON 解析失败：' + (e2.message || '格式不对'));
            }
        }
    }

    // ---------------------------------------------------------------- 校准
    function str(v, max) {
        if (v == null) return '';
        var s = String(v).replace(/\r/g, '').trim();
        if (max && s.length > max) s = s.slice(0, max);
        return s;
    }

    /* 把 AI 的「理想结构」翻译成引擎的「能跑结构」：
       · 角色从 key 映射成真正的 id
       · 跳转从标签名映射成节点 id
       · 素材 id 要真的存在，否则清空（留着会让导出变空图）
       · 类型/枚举不认识就降级，不让一个错字段毁掉整篇 */
    function normalize(raw, ctx) {
        var warnings = [];
        var assets = ctx.assets || [];
        var assetMap = {};
        assets.forEach(function (a) { assetMap[a.id] = a; });

        var out = {
            title: str(raw.title, 40) || ctx.fallbackTitle || 'AI 生成的作品',
            subtitle: str(raw.subtitle, 60),
            chars: [],
            vars: [],
            nodes: [],
            warnings: warnings
        };

        var charMap = {};
        (Array.isArray(raw.chars) ? raw.chars : []).slice(0, 12).forEach(function (c, i) {
            var name = str(c && (c.name || c.char), 24);
            if (!name) return;
            var key = str(c.key, 24) || ('c' + (i + 1));
            var id = 'c' + (i + 1) + '_' + Math.random().toString(36).slice(2, 6);
            charMap[key] = id;
            out.chars.push({
                id: id,
                name: name,
                color: /^#[0-9a-f]{3,8}$/i.test(String(c.color || '')) ? String(c.color) : '#e6c78a',
                desc: str(c.desc, 120)
            });
        });

        (Array.isArray(raw.vars) ? raw.vars : []).slice(0, 20).forEach(function (v) {
            var name = str(v && v.name, 20);
            if (!name) return;
            out.vars.push({ name: name, value: v.value == null ? 0 : v.value });
        });

        var nodes = Array.isArray(raw.nodes) ? raw.nodes : [];
        if (!nodes.length) throw new Error('模型没给出任何节点');

        var labelIndex = {};
        nodes.forEach(function (n, i) {
            if (n && String(n.type).toLowerCase() === 'label') {
                var nm = str(n.name, 30);
                if (nm) labelIndex[nm] = i;
            }
        });

        var idAt = [];
        nodes.forEach(function (n, i) {
            idAt[i] = 'n' + (i + 1) + '_' + Math.random().toString(36).slice(2, 6);
        });

        function resolveTarget(name) {
            var t = str(name, 30);
            if (!t) return '';
            if (labelIndex[t] != null) return idAt[labelIndex[t]];
            var alt = t.replace(/^#/, '').trim();
            if (labelIndex[alt] != null) return idAt[labelIndex[alt]];
            warnings.push('跳转目标「' + t + '」不存在，已断开');
            return '';
        }

        function resolveLib(v) {
            var id = str(v, 40);
            if (!id) return '';
            if (assetMap[id]) return 'lib:' + id;
            warnings.push('素材「' + id + '」不在素材库里，已留空');
            return '';
        }

        var dropped = 0;
        var built = [];

        nodes.forEach(function (n, i) {
            if (!n || typeof n !== 'object') { dropped++; return; }
            var type = String(n.type || '').toLowerCase();
            var node = { id: idAt[i], type: type };

            if (type === 'say') {
                var cid = charMap[str(n.char, 24)] || charMap[str(n.key, 24)] || '';
                if (!cid) {
                    node.type = 'narrate';
                    node.text = str(n.text, 600);
                    if (node.text) built.push(node);
                    return;
                }
                node.char = cid;
                node.emo = EMO.indexOf(String(n.emo)) >= 0 ? String(n.emo) : 'default';
                node.text = str(n.text, 400);
                node.voice = '';
                if (node.text) built.push(node);
                return;
            }
            if (type === 'narrate') {
                node.text = str(n.text, 600);
                if (node.text) built.push(node);
                return;
            }
            if (type === 'bg') {
                node.src = resolveLib(n.lib);
                node.place = str(n.place, 40);
                node.transition = 'fade';
                node.kenBurns = true;
                built.push(node);
                return;
            }
            if (type === 'show') {
                var sc = charMap[str(n.char, 24)];
                if (!sc) { dropped++; return; }
                node.char = sc;
                node.emo = EMO.indexOf(String(n.emo)) >= 0 ? String(n.emo) : 'default';
                node.pos = POS.indexOf(String(n.pos)) >= 0 ? String(n.pos) : 'center';
                node.anim = 'fade';
                built.push(node);
                return;
            }
            if (type === 'hide') {
                var hc = str(n.char, 24);
                node.char = (hc === 'all' || !hc) ? 'all' : (charMap[hc] || 'all');
                node.anim = 'fade';
                built.push(node);
                return;
            }
            if (type === 'choice') {
                var opts = (Array.isArray(n.choices) ? n.choices : []).slice(0, 6).map(function (c) {
                    return {
                        text: str(c && c.text, 60),
                        target: resolveTarget(c && (c.to || c.target)),
                        cond: '',
                        effects: []
                    };
                }).filter(function (c) { return c.text; });
                if (!opts.length) { dropped++; return; }
                node.prompt = str(n.prompt, 80);
                node.choices = opts;
                node.hideLocked = false;
                built.push(node);
                return;
            }
            if (type === 'label') {
                node.name = str(n.name, 30) || ('标签' + (i + 1));
                node.chapter = str(n.chapter, 40);
                built.push(node);
                return;
            }
            if (type === 'jump') {
                node.target = resolveTarget(n.to || n.target);
                built.push(node);
                return;
            }
            if (type === 'end') {
                var k = String(n.kind || 'normal');
                node.kind = KINDS.indexOf(k) >= 0 ? k : 'normal';
                node.title = str(n.title, 30) || '完';
                node.text = str(n.text, 200);
                built.push(node);
                return;
            }
            if (type === 'sound') {
                node.action = str(n.action, 10) || 'play';
                node.channel = /^(bgm|se|voice)$/.test(String(n.channel)) ? String(n.channel) : 'bgm';
                node.src = resolveLib(n.src || n.lib);
                node.loop = n.loop !== false;
                node.volume = Math.max(0, Math.min(100, Number(n.volume) || 70));
                built.push(node);
                return;
            }
            if (type === 'wait') {
                node.ms = Math.max(0, Math.min(8000, Number(n.ms) || 800));
                built.push(node);
                return;
            }
            dropped++;
        });

        if (dropped) warnings.push('丢弃了 ' + dropped + ' 个无法识别的节点');
        if (!built.length) throw new Error('校准之后一个节点都不剩，可能是模型没按格式输出');

        // 没有任何结局就补一个，免得上线后走到底没反应
        var hasEnd = built.some(function (n) { return n.type === 'end'; });
        if (!hasEnd) {
            built.push({ id: 'n_end_' + Math.random().toString(36).slice(2, 6), type: 'end', kind: 'normal', title: '完', text: '' });
            warnings.push('原文没有结局，已补一个普通结局');
        }

        out.nodes = built;
        out.stats = {
            nodes: built.length,
            says: built.filter(function (n) { return n.type === 'say'; }).length,
            labels: built.filter(function (n) { return n.type === 'label'; }).length,
            ends: built.filter(function (n) { return n.type === 'end'; }).length,
            libs: built.filter(function (n) { return /^lib:/.test(n.src || ''); }).length
        };
        return out;
    }

    window.GalAI = {
        readConfig: readConfig,
        configHint: configHint,
        systemPrompt: systemPrompt,
        callModel: callModel,
        extractJson: extractJson,
        normalize: normalize,
        EMO: EMO,
        POS: POS,
        KINDS: KINDS
    };
})();
