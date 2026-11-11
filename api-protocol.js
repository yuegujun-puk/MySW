/**
 * api-protocol.js —— 接口协议适配层
 *
 * 上层一律按 OpenAI 形状读写，这里吸收三套协议的差异：
 *   openai     /v1/chat/completions          Authorization: Bearer
 *   anthropic  /v1/messages                  x-api-key + anthropic-version + 浏览器直连头
 *   gemini     /v1beta/models/{m}:streamGenerateContent?alt=sse   x-goog-api-key
 *
 * 关键设计：输出侧统一归一化成 OpenAI 形状（decodeStreamChunk / normalizeResponse），
 * 上层十几处读 choices 的代码与流式主循环都不用区分协议。
 * 注意：Gemini 最后一个 chunk 是「正文 + finishReason」一起给的，必须先 decode 再
 * 判断结束，否则会丢字。
 *
 * 直连实测：Anthropic 必须带 anthropic-dangerous-direct-browser-access；中转站
 * （如 api4.gemai.cc）对两个路径都回 ACAO:*；Google 官方 CORS 存疑且国内不可达。
 */
(function () {
    'use strict';

    var ANTHROPIC_VERSION = '2023-06-01';
    var DEFAULT_ANTHROPIC_MAX_TOKENS = 4096;

    /* ------------------------------------------------------------------
       一、协议识别
       优先用用户手动指定的值；没指定就看地址特征推断。
       注意顺序：Gemini 的 OpenAI 兼容层（/v1beta/openai/chat/completions）
       含 /v1beta/ 但没有 :generateContent，所以不会误判成 gemini。
 */
    function detect(apiUrl, override) {
        var o = String(override || '').trim().toLowerCase();
        if (o === 'openai' || o === 'anthropic' || o === 'gemini') return o;

        var u = String(apiUrl || '').trim().toLowerCase();
        if (!u) return 'openai';

        // Claude：/v1/messages，或地址里带 anthropic / claude 字样
        if (/\/v1\/messages(\/|$|\?)/.test(u) || /(^|[^a-z])(anthropic|claude)([^a-z]|$)/.test(u)) {
            return 'anthropic';
        }
        // Gemini：动作后缀，或 /v1beta/models/、/v1/models/ 路径
        if (/:streamgeneratecontent|:generatecontent/.test(u)
            || /\/v1beta\/models\//.test(u)
            || /\/v1\/models\/[^/]+:/.test(u)) {
            return 'gemini';
        }
        return 'openai';
    }

    /* ------------------------------------------------------------------
       二、地址构造
 */
    function trimBase(apiUrl) {
        return String(apiUrl || '').trim().replace(/\/+$/, '');
    }

    // OpenAI 兼容：补到 /v1/chat/completions
    function buildOpenAIUrl(apiUrl) {
        var base = trimBase(apiUrl);
        if (!base) return '';
        if (/\/chat\/completions$/i.test(base)) return base;   // 已经是完整接口地址
        if (/\/v1$/i.test(base)) return base + '/chat/completions';
        return base + '/v1/chat/completions';
    }

    // Claude：补到 /v1/messages
    function buildAnthropicUrl(apiUrl) {
        var base = trimBase(apiUrl);
        if (!base) return '';
        if (/\/messages$/i.test(base)) return base;
        if (/\/v1$/i.test(base)) return base + '/messages';
        return base + '/v1/messages';
    }

    /* Gemini 的地址有三种填法，都要认：
         ① 中转站文档常见的带占位符：https://host/v1beta/models/{model}:generateContent
         ② 已经写到动作：https://host/v1beta/models/gemini-2.5-flash:generateContent
         ③ 只给根地址：https://host  或  https://host/v1beta
       流式必须带 ?alt=sse —— 不带的话 Gemini 返回的是一个 JSON 数组，
       而不是 SSE 事件流，前端按行解析会一个字都取不到。 */
    function buildGeminiUrl(apiUrl, model, stream) {
        var base = String(apiUrl || '').trim();
        if (!base) return '';
        var name = String(model || '').trim().replace(/^models\//i, '');
        var action = stream ? 'streamGenerateContent' : 'generateContent';

        if (/\{model\}/i.test(base)) {
            // ① 占位符替换（模型名要编码，但保留 models/ 前缀的处理已在上一步去掉）
            base = base.replace(/\{model\}/gi, encodeURIComponent(name));
            base = base.replace(/:(?:stream)?generateContent/i, ':' + action);
        } else if (/:(?:stream)?generateContent/i.test(base)) {
            // ② 已含动作：只按当前是否流式切换动作名
            base = base.replace(/:(?:stream)?generateContent/i, ':' + action);
        } else {
            // ③ 只给根地址：顺手剥掉末尾的 /v1 或 /v1beta
            //    （很多人按 OpenAI 习惯填到 /v1，不剥就会拼成 /v1/v1beta/... 直接 404）
            base = trimBase(base).replace(/\/v1(?:beta)?$/i, '');
            base = base + '/v1beta/models/' + encodeURIComponent(name) + ':' + action;
        }

        if (stream) {
            if (/[?&]alt=/i.test(base)) base = base.replace(/([?&])alt=[^&]*/i, '$1alt=sse');
            else base += (base.indexOf('?') >= 0 ? '&' : '?') + 'alt=sse';
        }
        return base;
    }

    // 统一入口：opts = { protocol, model, stream }
    function buildUrl(apiUrl, opts) {
        opts = opts || {};
        var protocol = opts.protocol || detect(apiUrl);
        if (protocol === 'anthropic') return buildAnthropicUrl(apiUrl);
        if (protocol === 'gemini') return buildGeminiUrl(apiUrl, opts.model, !!opts.stream);
        return buildOpenAIUrl(apiUrl);
    }

    /* ------------------------------------------------------------------
       三、请求头
 */
    function buildHeaders(protocol, apiKey) {
        var key = String(apiKey || '').trim();
        var headers = { 'Content-Type': 'application/json' };

        if (protocol === 'anthropic') {
            // anthropic-version 必填；dangerous 头是浏览器直连的开关，
            // 官方服务端会检查它，不带直接报 CORS 相关错误。
            headers['anthropic-version'] = ANTHROPIC_VERSION;
            headers['anthropic-dangerous-direct-browser-access'] = 'true';
            if (key) headers['x-api-key'] = key;
            return headers;
        }
        if (protocol === 'gemini') {
            if (key) headers['x-goog-api-key'] = key;
            return headers;
        }
        // OpenAI 兼容：本地服务（Ollama 等）不校验 Key，空 Key 时干脆不发
        // —— 个别网关会把空的 Bearer 当成畸形鉴权直接 400。
        if (key) headers['Authorization'] = 'Bearer ' + key;
        return headers;
    }

    /* ------------------------------------------------------------------
       四、消息体转换
 */

    // 把 content 里的纯文本抽出来（数组时拼接 text 段）
    function contentToText(content) {
        if (content == null) return '';
        if (typeof content === 'string') return content;
        if (Array.isArray(content)) {
            return content.map(function (p) {
                if (!p) return '';
                if (typeof p === 'string') return p;
                if (p.type === 'text' && p.text) return p.text;
                return '';
            }).filter(Boolean).join('\n');
        }
        return String(content);
    }

    // data:image/png;base64,xxxx → { mimeType, data }
    function parseDataUri(url) {
        var m = /^data:([^;,]+)?;base64,([\s\S]*)$/i.exec(String(url || ''));
        if (!m) return null;
        return { mimeType: m[1] || 'image/png', data: m[2] };
    }

    // 从 URL 猜 MIME（Gemini 的 fileData 必须带）
    function guessMime(url) {
        var u = String(url || '').toLowerCase();
        if (/\.png(\?|$)/.test(u)) return 'image/png';
        if (/\.(jpe?g)(\?|$)/.test(u)) return 'image/jpeg';
        if (/\.webp(\?|$)/.test(u)) return 'image/webp';
        if (/\.gif(\?|$)/.test(u)) return 'image/gif';
        return 'image/jpeg';
    }

    function imageUrlOf(part) {
        if (!part || part.type !== 'image_url') return '';
        var v = part.image_url;
        if (typeof v === 'string') return v;
        return (v && v.url) || '';
    }

    // 拆出 system 与会话（Anthropic / Gemini 都把 system 放顶层）
    function splitMessages(messages) {
        var systemParts = [];
        var convo = [];
        (Array.isArray(messages) ? messages : []).forEach(function (m) {
            if (!m || !m.role) return;
            var role = String(m.role);
            if (role === 'system' || role === 'developer') {
                var s = contentToText(m.content);
                if (s) systemParts.push(s);
                return;
            }
            convo.push({ role: role === 'assistant' ? 'assistant' : 'user', content: m.content });
        });
        return { system: systemParts.join('\n\n'), convo: convo };
    }

    // OpenAI 的 content → Anthropic 的 content blocks
    function toAnthropicContent(content) {
        if (typeof content === 'string') return content;          // 最常见，原样发
        if (!Array.isArray(content)) return contentToText(content);

        var blocks = [];
        content.forEach(function (p) {
            if (!p) return;
            if (typeof p === 'string') { blocks.push({ type: 'text', text: p }); return; }
            if (p.type === 'text') {
                if (p.text) blocks.push({ type: 'text', text: p.text });
                return;
            }
            var url = imageUrlOf(p);
            if (!url) return;
            var data = parseDataUri(url);
            if (data) {
                // 内联图：转 base64 源
                blocks.push({
                    type: 'image',
                    source: { type: 'base64', media_type: data.mimeType, data: data.data }
                });
            } else if (/^https?:/i.test(url)) {
                // 外链图：Claude 支持 url source，直接引用，不下载
                blocks.push({ type: 'image', source: { type: 'url', url: url } });
            }
        });

        // 空 blocks 会让 Anthropic 直接 400，退成一句占位文本更安全
        if (!blocks.length) return '[图片]';
        // 只有一段文本时压回字符串，省一层结构也少踩一次校验
        if (blocks.length === 1 && blocks[0].type === 'text') return blocks[0].text;
        return blocks;
    }

    // OpenAI 的 content → Gemini 的 parts
    function toGeminiParts(content) {
        if (typeof content === 'string') return [{ text: content }];
        if (!Array.isArray(content)) return [{ text: contentToText(content) }];

        var parts = [];
        content.forEach(function (p) {
            if (!p) return;
            if (typeof p === 'string') { parts.push({ text: p }); return; }
            if (p.type === 'text') {
                if (p.text) parts.push({ text: p.text });
                return;
            }
            var url = imageUrlOf(p);
            if (!url) return;
            var data = parseDataUri(url);
            if (data) {
                parts.push({ inlineData: { mimeType: data.mimeType, data: data.data } });
            } else if (/^https?:/i.test(url)) {
                parts.push({ fileData: { mimeType: guessMime(url), fileUri: url } });
            }
        });

        if (!parts.length) return [{ text: '[图片]' }];
        return parts;
    }

    function toNum(v) {
        var n = Number(v);
        return Number.isFinite(n) ? n : null;
    }

    /* ------------------------------------------------------------------
       思考强度（设置 → 生成参数里的「思考强度」下拉）
       UI 只给五个档位，三家接口的写法各不一样：
         OpenAI     reasoning_effort: 'low' / 'medium' / 'high'（由上层直接塞进 body，
                    走不到这里）
         Anthropic  thinking: { type:'enabled', budget_tokens: N }，而且开思考时
                    temperature 只能是 1、max_tokens 必须大于预算，否则 400
         Gemini     generationConfig.thinkingConfig.thinkingBudget: N（0 = 关）
       预算优先用用户填的数字，没填就按档位折算。只读 overrides，不读 apiSettings：
       后台小任务（摘要 / 记忆提取）不该被主对话的强度拖慢。
 */
    var EFFORT_BUDGET = { minimal: 1024, low: 2048, medium: 8192, high: 24576 };
    var EFFORT_NAMES = ['none', 'minimal', 'low', 'medium', 'high'];

    function resolveReasoning(overrides) {
        var effort = String((overrides && overrides.reasoning_effort) || '').trim().toLowerCase();
        if (EFFORT_NAMES.indexOf(effort) < 0) return null;
        if (effort === 'none') return { effort: effort, budget: 0 };
        var custom = toNum(overrides && overrides.reasoning_budget);
        var budget = (custom !== null && custom > 0)
            ? Math.round(custom)
            : EFFORT_BUDGET[effort];
        return { effort: effort, budget: budget };
    }

    /* Anthropic Messages 请求体。
       三处和 OpenAI 不一样、写错就 400 的地方：
         · max_tokens 必填（OpenAI 可以不给）
         · system 是顶层字段，不能留在 messages 里
         · 不认识 presence_penalty / frequency_penalty / seed / stream_options，
           带上会直接被拒，所以只能挑着传 */
    function toAnthropicBody(apiSettings, messages, overrides) {
        var split = splitMessages(messages);
        var maxTokens = toNum(overrides && overrides.max_tokens) || toNum(apiSettings.maxTokens) || DEFAULT_ANTHROPIC_MAX_TOKENS;

        var body = {
            model: apiSettings.modelName,
            max_tokens: maxTokens,
            messages: split.convo.map(function (m) {
                return { role: m.role, content: toAnthropicContent(m.content) };
            })
        };
        if (split.system) body.system = split.system;

        var temperature = toNum(overrides && overrides.temperature);
        if (temperature !== null) body.temperature = temperature;
        var topP = toNum(overrides && overrides.top_p);
        if (topP !== null) body.top_p = topP;

        // OpenAI 的 stop 在 Anthropic 叫 stop_sequences
        var stop = (overrides && overrides.stop) || null;
        if (Array.isArray(stop) && stop.length) body.stop_sequences = stop;

        /* 思考强度 → thinking。
           开思考时有两处硬约束，撞上就是 400：
             · temperature 只能取 1（所以干脆不发，让它用默认值）
             · max_tokens 必须大于 budget_tokens（抬到「预算 + 1024」留出正文额度） */
        var reasoning = resolveReasoning(overrides);
        if (reasoning) {
            if (reasoning.effort === 'none') {
                body.thinking = { type: 'disabled' };
            } else {
                var budget = Math.min(32000, Math.max(1024, reasoning.budget));
                body.thinking = { type: 'enabled', budget_tokens: budget };
                delete body.temperature;
                delete body.top_p;
                body.max_tokens = Math.max(body.max_tokens, budget + 1024);
            }
        }

        if (overrides && overrides.stream === true) body.stream = true;
        return body;
    }

    /* Gemini generateContent 请求体。
       和 OpenAI 的对应关系：
         messages            → contents（role: assistant 要改成 model）
         system              → systemInstruction
         max_tokens          → generationConfig.maxOutputTokens
         top_p / stop        → generationConfig.topP / stopSequences
       另外 Gemini 要求 contents 里相邻消息角色必须交替，连着两条 user 会 400，
       所以要把相邻同角色合并。 */
    function toGeminiBody(apiSettings, messages, overrides) {
        var split = splitMessages(messages);

        var contents = [];
        split.convo.forEach(function (m) {
            var role = m.role === 'assistant' ? 'model' : 'user';
            var parts = toGeminiParts(m.content);
            var last = contents[contents.length - 1];
            if (last && last.role === role) {
                // 合并相邻同角色，避免 "Please ensure that multiturn requests
                // alternate between user and model" 这条 400
                last.parts = last.parts.concat(parts);
            } else {
                contents.push({ role: role, parts: parts });
            }
        });

        var body = { contents: contents };
        if (split.system) body.systemInstruction = { parts: [{ text: split.system }] };

        var gc = {};
        var temperature = toNum(overrides && overrides.temperature);
        if (temperature !== null) gc.temperature = temperature;
        var topP = toNum(overrides && overrides.top_p);
        if (topP !== null) gc.topP = topP;
        var maxTokens = toNum(overrides && overrides.max_tokens);
        if (maxTokens !== null) gc.maxOutputTokens = maxTokens;
        var stop = (overrides && overrides.stop) || null;
        if (Array.isArray(stop) && stop.length) gc.stopSequences = stop;

        /* 思考强度 → thinkingConfig.thinkingBudget。
           0 = 关闭（2.5 Flash 认；2.5 Pro 不接受 0，会 400 —— 那时换「不设置」）。
           上限按 32k 兜住，超过模型允许的额度同样会被拒。 */
        var reasoning = resolveReasoning(overrides);
        if (reasoning) {
            gc.thinkingConfig = {
                thinkingBudget: reasoning.effort === 'none'
                    ? 0
                    : Math.min(32000, Math.max(0, reasoning.budget))
            };
        }
        if (Object.keys(gc).length) body.generationConfig = gc;

        return body;
    }

    // 统一入口：opts.protocol 缺省时按地址推断
    function buildBody(apiSettings, messages, overrides, protocol) {
        overrides = overrides || {};
        var p = protocol || detect(apiSettings && apiSettings.apiUrl, apiSettings && apiSettings.apiProtocol);
        if (p === 'anthropic') return toAnthropicBody(apiSettings, messages, overrides);
        if (p === 'gemini') return toGeminiBody(apiSettings, messages, overrides);
        return null;   // null = 调用方走原来的 OpenAI 组装逻辑，保证逐字节兼容
    }

    /* ------------------------------------------------------------------
       五、流式解析（把每行 SSE 归一化成 OpenAI 的 chunk 形状）
       Anthropic 的 usage 分两段到：input_tokens 在 message_start，
       output_tokens 在 message_delta。所以要攒一下再给出去，
       否则主程序那边（要求 prompt/completion 都有值）会全部丢掉。
 */
    var pendingUsage = { input: 0, output: 0, cacheRead: 0 };

    function resetPendingUsage() {
        pendingUsage = { input: 0, output: 0, cacheRead: 0 };
    }

    function usageChunk() {
        if (!pendingUsage.input && !pendingUsage.output) return null;
        // Anthropic 的 input_tokens 不含缓存命中/写入的那部分，而 OpenAI 的
        // prompt_tokens 是「含缓存的总输入」。要保持语义一致，得把缓存量加回来，
        // 否则长对话开了 prompt caching 之后，这里显示的输入量会明显偏小。
        var promptTotal = pendingUsage.input + pendingUsage.cacheRead;
        var u = {
            prompt_tokens: promptTotal,
            completion_tokens: pendingUsage.output,
            total_tokens: promptTotal + pendingUsage.output
        };
        if (pendingUsage.cacheRead) {
            // 主程序的缓存命中率统计读的是 OpenAI 这个字段
            u.prompt_tokens_details = { cached_tokens: pendingUsage.cacheRead };
        }
        return u;
    }

    // 流是否结束：OpenAI 用 [DONE]；Claude 用 message_stop；Gemini 用 finishReason
    //
    // ⚠️ 调用方必须先 decodeStreamChunk() 再调用本函数，不能反过来。
    //    Gemini 的最后一个 chunk 是「正文 + finishReason」一起给的，
    //    如果先判断结束就 return，那段正文会被直接丢掉（实测就是这样丢字的）。
    function isStreamDone(protocol, dataStr) {
        if (dataStr === '[DONE]') return true;
        if (protocol === 'openai') return false;
        try {
            var d = JSON.parse(dataStr);
            if (protocol === 'anthropic') return d && d.type === 'message_stop';
            if (protocol === 'gemini') {
                var c = d && d.candidates && d.candidates[0];
                return !!(c && c.finishReason);
            }
        } catch (e) { /* 不是 JSON 就当没结束 */ }
        return false;
    }

    /* 返回 null 表示这行没有内容可读；
       返回 { choices:[{delta:{...}}], usage?, __error? } 供调用方沿用原有逻辑。 */
    function decodeStreamChunk(protocol, dataStr) {
        var data;
        try {
            data = JSON.parse(dataStr);
        } catch (e) {
            return null;
        }
        if (!data) return null;

        if (protocol === 'openai') return data;   // 原样交给原逻辑

        if (protocol === 'anthropic') {
            var out = { choices: [{ delta: {} }] };
            var type = data.type;

            if (type === 'error') {
                out.__error = (data.error && data.error.message) || 'Claude 返回错误';
                return out;
            }
            if (type === 'message_start') {
                var mu = (data.message && data.message.usage) || {};
                pendingUsage.input = toNum(mu.input_tokens) || 0;
                pendingUsage.cacheRead = (toNum(mu.cache_read_input_tokens) || 0) + (toNum(mu.cache_creation_input_tokens) || 0);
            } else if (type === 'content_block_delta') {
                var d = data.delta || {};
                if (d.type === 'text_delta' && d.text) out.choices[0].delta.content = d.text;
                else if (d.type === 'thinking_delta' && d.thinking) out.choices[0].delta.reasoning_content = d.thinking;
            } else if (type === 'message_delta') {
                var du = data.usage || {};
                if (toNum(du.output_tokens) !== null) pendingUsage.output = toNum(du.output_tokens);
            }
            // message_stop / ping / content_block_start|stop 都没有正文，交给 usage 兜一下
            var u = usageChunk();
            if (u && (type === 'message_start' || type === 'message_delta' || type === 'message_stop')) {
                out.usage = u;
            }
            return out;
        }

        if (protocol === 'gemini') {
            var gout = { choices: [{ delta: {} }] };
            var cand = data.candidates && data.candidates[0];
            if (data.error) {
                gout.__error = data.error.message || 'Gemini 返回错误';
                return gout;
            }
            if (cand && cand.content && Array.isArray(cand.content.parts)) {
                var text = '', think = '';
                cand.content.parts.forEach(function (p) {
                    if (!p || typeof p.text !== 'string' || !p.text) return;
                    // Gemini 2.5+ 的思考内容带 thought:true，不能混进正文
                    if (p.thought) think += p.text; else text += p.text;
                });
                if (text) gout.choices[0].delta.content = text;
                if (think) gout.choices[0].delta.reasoning_content = think;
            }
            var gm = data.usageMetadata;
            if (gm) {
                gout.usage = {
                    prompt_tokens: toNum(gm.promptTokenCount) || 0,
                    completion_tokens: toNum(gm.candidatesTokenCount) || 0,
                    total_tokens: toNum(gm.totalTokenCount) || ((toNum(gm.promptTokenCount) || 0) + (toNum(gm.candidatesTokenCount) || 0))
                };
                if (toNum(gm.cachedContentTokenCount)) {
                    gout.usage.prompt_tokens_details = { cached_tokens: toNum(gm.cachedContentTokenCount) };
                }
            }
            return gout;
        }

        return data;
    }

    /* ------------------------------------------------------------------
       六、非流式响应归一化
       把 Claude / Gemini 的响应原地翻译成 OpenAI 形状，
       这样主程序里十几处 data.choices?.[0]?.message?.content 全都不用改。
 */
    function normalizeResponse(protocol, data) {
        if (!data || protocol === 'openai') return data;
        if (data.error && !data.choices) return data;   // 错误体原样交回，让上层读 message

        if (protocol === 'anthropic') {
            var text = '', thinking = '';
            (Array.isArray(data.content) ? data.content : []).forEach(function (b) {
                if (!b) return;
                if (b.type === 'text' && b.text) text += b.text;
                else if (b.type === 'thinking' && b.thinking) thinking += b.thinking;
            });
            var au = data.usage || {};
            return {
                id: data.id,
                model: data.model,
                choices: [{
                    index: 0,
                    message: { role: 'assistant', content: text, reasoning_content: thinking || undefined },
                    finish_reason: data.stop_reason || 'stop'
                }],
                usage: {
                    prompt_tokens: toNum(au.input_tokens) || 0,
                    completion_tokens: toNum(au.output_tokens) || 0,
                    total_tokens: (toNum(au.input_tokens) || 0) + (toNum(au.output_tokens) || 0)
                }
            };
        }

        if (protocol === 'gemini') {
            var cand = (data.candidates && data.candidates[0]) || null;
            var gtext = '', gthink = '';
            if (cand && cand.content && Array.isArray(cand.content.parts)) {
                cand.content.parts.forEach(function (p) {
                    if (!p || typeof p.text !== 'string' || !p.text) return;
                    if (p.thought) gthink += p.text; else gtext += p.text;
                });
            }
            var gm = data.usageMetadata || {};
            return {
                model: data.modelVersion,
                choices: [{
                    index: 0,
                    message: { role: 'assistant', content: gtext, reasoning_content: gthink || undefined },
                    finish_reason: (cand && cand.finishReason) || 'stop'
                }],
                usage: {
                    prompt_tokens: toNum(gm.promptTokenCount) || 0,
                    completion_tokens: toNum(gm.candidatesTokenCount) || 0,
                    total_tokens: toNum(gm.totalTokenCount) || 0
                }
            };
        }

        return data;
    }

    /* ------------------------------------------------------------------
       七、给界面的说明文案（设置页协议下拉用）
 */
    var LABELS = {
        auto: '自动识别（按地址判断）',
        openai: 'OpenAI 兼容（含 Ollama / 中转站）',
        anthropic: 'Claude（Anthropic Messages）',
        gemini: 'Gemini（Google generateContent）'
    };

    var HINTS = {
        openai: '补 /v1/chat/completions，用 Authorization: Bearer。绝大多数中转站、本地模型都选这个。',
        anthropic: '补 /v1/messages，用 x-api-key + anthropic-version。地址填到 https://xxx（或中转站给的 /v1/messages）即可。',
        gemini: '拼 /v1beta/models/{模型}:streamGenerateContent?alt=sse。若中转站给了带 {model} 占位符的完整地址，直接整条填进来即可。'
    };

    window.ApiProtocol = {
        version: '1.0.0',
        detect: detect,
        buildUrl: buildUrl,
        buildHeaders: buildHeaders,
        buildBody: buildBody,
        decodeStreamChunk: decodeStreamChunk,
        isStreamDone: isStreamDone,
        normalizeResponse: normalizeResponse,
        resetPendingUsage: resetPendingUsage,
        labels: LABELS,
        hints: HINTS,
        // 供调试/测试
        _internal: {
            buildOpenAIUrl: buildOpenAIUrl,
            buildAnthropicUrl: buildAnthropicUrl,
            buildGeminiUrl: buildGeminiUrl,
            splitMessages: splitMessages,
            toAnthropicBody: toAnthropicBody,
            toGeminiBody: toGeminiBody
        }
    };
})();
