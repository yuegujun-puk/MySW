/**
 * learn-tutor.js —— 学习辅导（拍题讲解 + 错题本）· 实验室
 * · 设置 → 实验室 面板（入口 / 科目自定义 / 学段 / 错题本）
 * · 全屏学习界面：科目学段切换 + 讲解区 + 三种讲解模式 + 输入区
 * · 错题本：IndexedDB 本地存储（含图片），支持筛选 / 搜索 / 导出 / 复习
 * · 会话恢复：讲解中途退出或刷新，下次进来可以继续
 * 模型：走「设置 → AI 配置 → 专用模型」的 learn 槽位（feature-models.js），
 * 留空沿用当前站点；全部请求都发到用户自己的 API 配置，无任何后端。
 */
(function () {
    'use strict';

    /* ================= 常量与存储键 ================= */

    var SET_KEY = 'learnTutorSettings_v1';
    var IDX_KEY = 'learnMistakesIndex_v1';
    var DB_NAME = 'MySW_LearnTutor';
    var STORE_MISTAKES = 'mistakes';
    var STORE_SESSION = 'session';
    var STORE_PROFILE = 'profile';      // 【学习档案】跨会话学习记录
    var PROFILE_KEY = 'current';
    var SESSION_KEY = 'current';

    var DEFAULT_SUBJECTS = ['数学', '物理', '化学', '生物', '语文', '英语', '历史', '地理', '政治', '其他'];
    var GRADES = ['小学', '初中', '高中', '大学', '其他'];
    /* 【年级细化】学段下再分具体年级：讲解深度按具体年级微调，
       旧版本只有学段一级，gradeDetail 为空时自动回退学段粒度。 */
    var GRADE_DETAIL = {
        '小学': ['一年级', '二年级', '三年级', '四年级', '五年级', '六年级'],
        '初中': ['初一', '初二', '初三'],
        '高中': ['高一', '高二', '高三'],
        '大学': ['大一', '大二', '大三', '大四', '研究生'],
        '其他': []
    };

    var MODE_GUIDE = 'guide';    // 引导式（默认，不给答案）
    var MODE_STEPS = 'steps';    // 分步讲解（3~6 步，逐步揭示）
    var MODE_FULL = 'full';      // 完整讲解（一次给全）
    var MODES = [
        { id: MODE_GUIDE, name: '引导式', icon: 'ri-lightbulb-line' },
        { id: MODE_STEPS, name: '分步讲解', icon: 'ri-list-ordered' },
        { id: MODE_FULL, name: '完整讲解', icon: 'ri-file-text-line' }
    ];

    /* 【AI 老师人格化】内置人设 + 自定义。prompt 会拼进 system prompt 头部；
       教学铁律（引导式不给答案等）永远优先于人设语气。 */
    var TUTOR_PERSONAS = [
        { id: 'default', name: '默认辅导老师', icon: 'ri-teacher-line',
          prompt: '', desc: '标准耐心辅导老师，中性语气' },
        { id: 'gentle', name: '温柔大姐姐', icon: 'ri-heart-line',
          prompt: '你是一位温柔亲切的大姐姐老师，说话柔和、多鼓励，学生答对时真诚夸奖，答错时先安慰再引导，从不说重话。', desc: '柔和鼓励型，适合容易紧张的学生' },
        { id: 'strict', name: '严格班主任', icon: 'ri-user-star-line',
          prompt: '你是一位严格但负责的老班主任，言简意赅、直击要害，学生会的不重复啰嗦，发现偷懒或马虎会直接点出来要求改正，但批评永远对事不对人。', desc: '高标准严要求，治拖延和马虎' },
        { id: 'funny', name: '幽默段子手', icon: 'ri-emotion-laugh-line',
          prompt: '你是一位爱开玩笑的老师，擅长用段子、梗和生活化的比喻讲知识，课堂气氛轻松，但每个知识点本身必须讲得准确严谨——玩梗是佐料，知识是主菜。', desc: '轻松愉快型，用梗讲知识' },
        { id: 'cat', name: '猫娘老师', icon: 'ri-cat-smile-line',
          prompt: '你是一位猫娘老师：语气软萌可爱，句尾偶尔（不要每句都）带「喵」，喜欢用小鱼干、毛线球打比方。铁律：教学内容必须严谨准确，人设绝不能牺牲教学质量——该不给答案时一样不给。', desc: '软萌但教学严谨，喵' },
        { id: 'custom', name: '自定义人设…', icon: 'ri-quill-pen-line',
          prompt: '', desc: '自己写名字和风格' }
    ];

    var settings = (function () {
        try { return JSON.parse(localStorage.getItem(SET_KEY) || '{}') || {}; } catch (e) { return {}; }
    })();
    if (!Array.isArray(settings.subjects) || !settings.subjects.length) settings.subjects = DEFAULT_SUBJECTS.slice();
    if (!settings.subject) settings.subject = '数学';
    if (!settings.mode) settings.mode = MODE_GUIDE;
    if (!settings.reviewN) settings.reviewN = 5;
    /* 【年级细化迁移】旧版 settings.grade 是学段（如「初中」），新结构拆成
       gradeStage（学段）+ gradeDetail（具体年级）。旧数据自动搬家，不丢。 */
    if (!settings.gradeStage) {
        settings.gradeStage = GRADES.indexOf(settings.grade) >= 0 ? settings.grade : '初中';
    }
    if (!settings.gradeDetail || GRADE_DETAIL[settings.gradeStage].indexOf(settings.gradeDetail) < 0) {
        settings.gradeDetail = '';
    }
    if (!settings.personaId) settings.personaId = 'default';
    if (typeof settings.useWorldbook !== 'boolean') settings.useWorldbook = false;

    function saveSettings() {
        try { localStorage.setItem(SET_KEY, JSON.stringify(settings)); } catch (e) { /* 配额异常不阻断 */ }
    }

    /* ================= IndexedDB 微缩版（错题本 + 会话） ================= */

    var idb = null;
    var DB_VERSION = 2;   // v2：新增「学习档案」store。老用户从 v1 升级会触发 onupgradeneeded 补建
    function getIdb() {
        if (idb) return idb;
        if (!('indexedDB' in window)) return null;
        var dbp = null;
        function openDb() {
            if (!dbp) {
                dbp = new Promise(function (resolve, reject) {
                    var rq = indexedDB.open(DB_NAME, DB_VERSION);
                    rq.onupgradeneeded = function () {
                        var db = rq.result;
                        if (!db.objectStoreNames.contains(STORE_MISTAKES)) db.createObjectStore(STORE_MISTAKES, { keyPath: 'id' });
                        if (!db.objectStoreNames.contains(STORE_SESSION)) db.createObjectStore(STORE_SESSION, { keyPath: 'key' });
                        if (!db.objectStoreNames.contains(STORE_PROFILE)) db.createObjectStore(STORE_PROFILE, { keyPath: 'key' });
                    };
                    rq.onsuccess = function () { resolve(rq.result); };
                    rq.onerror = function () { reject(rq.error); };
                });
            }
            return dbp;
        }
        idb = {
            put: function (store, value) {
                return openDb().then(function (db) {
                    return new Promise(function (resolve, reject) {
                        var tx = db.transaction(store, 'readwrite');
                        tx.objectStore(store).put(value);
                        tx.oncomplete = function () { resolve(true); };
                        tx.onerror = function () { reject(tx.error); };
                    });
                });
            },
            get: function (store, key) {
                return openDb().then(function (db) {
                    return new Promise(function (resolve, reject) {
                        var rq = db.transaction(store, 'readonly').objectStore(store).get(key);
                        rq.onsuccess = function () { resolve(rq.result || null); };
                        rq.onerror = function () { reject(rq.error); };
                    });
                });
            },
            getAll: function (store) {
                return openDb().then(function (db) {
                    return new Promise(function (resolve, reject) {
                        var rq = db.transaction(store, 'readonly').objectStore(store).getAll();
                        rq.onsuccess = function () { resolve(rq.result || []); };
                        rq.onerror = function () { reject(rq.error); };
                    });
                });
            },
            del: function (store, key) {
                return openDb().then(function (db) {
                    return new Promise(function (resolve, reject) {
                        var tx = db.transaction(store, 'readwrite');
                        tx.objectStore(store).delete(key);
                        tx.oncomplete = function () { resolve(true); };
                        tx.onerror = function () { reject(tx.error); };
                    });
                });
            }
        };
        return idb;
    }

    /** 错题索引（localStorage 轻量缓存，不含图片正文，列表秒开） */
    function refreshIndex(list) {
        try {
            var slim = (list || []).map(function (m) {
                return {
                    id: m.id, subject: m.subject, grade: m.grade,
                    questionText: (m.questionText || '').slice(0, 120),
                    createdAt: m.createdAt, tags: m.tags || [], starred: !!m.starred,
                    hasImage: !!m.questionImage
                };
            });
            localStorage.setItem(IDX_KEY, JSON.stringify(slim));
        } catch (e) { /* 忽略 */ }
    }

    /* ================= API 配置（全部走用户自己的配置） ================= */

    function resolveApi() {
        var base = null;
        try {
            if (window.EndpointStore && typeof window.EndpointStore.getEffectiveApiSettings === 'function') {
                var eff = window.EndpointStore.getEffectiveApiSettings();
                if (eff && eff.apiUrl && eff.apiKey) base = eff;
            }
        } catch (e) { /* 回退 */ }
        if (!base) {
            try { base = JSON.parse(localStorage.getItem('aiChatSettings') || '{}') || {}; } catch (e) { base = {}; }
        }
        // 功能专用模型：learn 槽位（留空沿用当前站点），内部自带 singleSite 保护
        try {
            if (window.FeatureModels && typeof window.FeatureModels.resolve === 'function') {
                return window.FeatureModels.resolve('learn', base);
            }
        } catch (e) { /* 解析失败按主配置走 */ }
        return base;
    }

    function hasApi(api) { return !!(api && api.apiUrl && api.apiKey); }

    /* ================= 错误分类（提示要具体、给出路） ================= */

    function isVisionOn() {
        try { return JSON.parse(localStorage.getItem('visionSettings') || '{}').enabled === true; }
        catch (e) { return false; }
    }

    /** 把 fetch / API 错误翻译成用户能懂、知道下一步怎么做的提示 */
    function explainError(err, hasImage) {
        var msg = String((err && err.message) || err || '');
        if (err && err.name === 'AbortError') return { title: '已停止', msg: '本次讲解已停止。' };
        if (msg.indexOf('Failed to fetch') >= 0 || msg.indexOf('NetworkError') >= 0 || msg.indexOf('ERR_NAME') >= 0)
            return { title: '连不上 API', msg: '请求没能发出去：检查网络，以及「设置 → AI 配置」里的调用地址是否正确、该地址是否可达。' };
        if (msg.indexOf('API Error: 401') >= 0 || msg.indexOf('API Error: 403') >= 0)
            return { title: '鉴权失败', msg: 'API Key 无效或没有权限。请到「设置 → AI 配置」检查 Key 是否正确、是否过期。' };
        if (msg.indexOf('API Error: 413') >= 0)
            return { title: '图片太大', msg: '这道题的图片超过了接口允许的大小。重拍一张更近、更清楚的局部照再试。' };
        if (msg.indexOf('API Error: 400') >= 0 || msg.indexOf('API Error: 422') >= 0) {
            if (hasImage) return {
                title: '模型可能不支持识图',
                msg: '接口返回 400/422：当前模型很可能不支持图片输入。可换用支持视觉的模型（如带 vision 的模型），或把题目手动打成文字发给我。'
            };
            return { title: '请求被拒绝', msg: '接口返回 400/422：' + msg.slice(0, 160) + '。请检查「设置 → AI 配置」的模型名称是否拼写正确。' };
        }
        if (msg.indexOf('API Error: 429') >= 0)
            return { title: '请求太频繁', msg: '触发了接口限流（429），稍等几秒再试。' };
        if (msg.toLowerCase().indexOf('timeout') >= 0)
            return { title: '请求超时', msg: '接口长时间没有响应。可以到「设置 → AI 配置」调大超时秒数后重试。' };
        return { title: '讲解失败', msg: msg.slice(0, 200) || '未知错误，请重试。' };
    }

    /* ================= 提示词（身份 / 学段 / 科目 / 模式） ================= */

    var GRADE_STYLE = {
        '小学': '用生活化的比喻和大白话讲，少用符号，多用图景和例子；运算过程一步步写清楚。',
        '初中': '从直观现象或基础运算入手，公式与图形结合，推理过程写全。',
        '高中': '可以直接使用公式与严谨推导，讲清每一步的依据（定义 / 定理 / 公式）。',
        '大学': '允许引用教材级概念与术语，给出严谨的推导与适用条件。',
        '其他': '按学生描述的起点灵活调整深度，宁可讲细一点。'
    };

    /** 当前生效的年级描述：优先具体年级（初二），退回学段（初中） */
    function effectiveGrade() {
        return settings.gradeDetail || settings.gradeStage || '初中';
    }

    /** 具体年级下拉（依赖当前 session/settings 的学段），buildStage 与
        会话恢复共用，所以放在模块级。刚创建尚未入 DOM 时可显式传 sel。 */
    function fillDetailSel(selOverride) {
        var detailSel = selOverride || document.getElementById('lt-grade-detail');
        if (!detailSel) return;
        var stage = session ? (session.grade || settings.gradeStage) : settings.gradeStage;
        var details = GRADE_DETAIL[stage] || [];
        if (!details.length) { detailSel.style.display = 'none'; return; }
        detailSel.style.display = '';
        var cur = session ? (session.gradeDetail || '') : settings.gradeDetail;
        if (!cur || details.indexOf(cur) < 0) cur = '';
        detailSel.innerHTML = '<option value="">年级</option>' + details.map(function (s) {
            return '<option value="' + esc(s) + '"' + (s === cur ? ' selected' : '') + '>' + esc(s) + '</option>';
        }).join('');
    }

    /** 站内角色列表（内置 + 自定义，口径与论坛一致）：
        让用户拿已有的角色当辅导老师（名字 + 人设性格注入教学 prompt）。 */
    function allSiteCharacters() {
        var custom = {};
        try { custom = JSON.parse(localStorage.getItem('customFriendsData') || '{}'); } catch (e) { }
        var merged = {};
        try { Object.assign(merged, window.defaultFriendsData || {}); } catch (e) { }
        try { Object.assign(merged, custom); } catch (e) { }
        return Object.keys(merged).map(function (id) {
            var c = merged[id] || {};
            /* 内置角色的人设不在 characters.js 索引里（按需分片下载），
               必须经 CharacterPacks.getPrompt 回填，否则全部显示「没写人设」。 */
            var pr = String(c.systemPrompt || c.persona || c.description || '').trim();
            if (!pr && window.CharacterPacks && typeof window.CharacterPacks.getPrompt === 'function') {
                try { pr = String(window.CharacterPacks.getPrompt(id) || '').trim(); } catch (e) { }
            }
            return {
                id: id,
                name: c.name || '未知角色',
                avatar: c.avatar || '',
                prompt: pr
            };
        });
    }
    function findSiteCharacter(id) {
        if (!id) return null;
        var list = allSiteCharacters();
        for (var i = 0; i < list.length; i++) { if (list[i].id === id) return list[i]; }
        return null;
    }

    /** 人设片段（内置 or 自定义 or 站内角色），未命中返回 '' */
    function personaPrompt() {
        if (settings.personaId === 'char') {
            var c = findSiteCharacter(settings.personaCharId);
            if (!c) return '';
            var pr = c.prompt;
            if (pr.length > 1200) pr = pr.slice(0, 1200) + '…';
            return '你的教学人设：扮演「' + c.name + '」，用这个角色的性格和说话风格来辅导。但不要使用角色扮演式的动作/旁白描写(如「*歪头*」「(叹气)」),输出必须是清楚的讲解正文,保留教学结构(步骤、公式、提示)。' +
                '下面是该角色的人设描述（只取语气与性格，教学铁律永远优先于人设，与学科事实冲突时以学科事实为准）：\n' + pr;
        }
        var p = null;
        for (var i = 0; i < TUTOR_PERSONAS.length; i++) {
            if (TUTOR_PERSONAS[i].id === settings.personaId) { p = TUTOR_PERSONAS[i]; break; }
        }
        if (!p) return '';
        if (p.id === 'custom') {
            var name = (settings.personaName || '').trim();
            var desc = (settings.personaDesc || '').trim();
            if (!name && !desc) return '';
            return '你的教学人设：' + (name ? '「' + name + '」' : '') + (desc ? '。风格要求：' + desc : '') + '。';
        }
        return p.prompt ? ('你的教学人设：' + p.prompt) : '';
    }

    /** 世界书注入：只取「全局」作用域且启用的书，复用 WorldBook.buildContext
        的关键词/蓝灯激活逻辑；learning 场景没有聊天目标，角色/聊天/人设作用域的书天然不激活。 */
    function worldbookContext(questionText) {
        if (!settings.useWorldbook) return '';
        // 世界书注入同样限长,避免学习场景的 system prompt 过长
        try {
            if (!window.WorldBook || typeof window.WorldBook.buildContext !== 'function') return '';
            var ctx = window.WorldBook.buildContext({
                history: [],
                userMessage: String(questionText || '') + ' ' + collectProfileDigest().digest
            });
            var text = String((ctx && ctx.before) || '') + String((ctx && ctx.after) || '');
            if (!text.trim()) return '';
            if (text.length > 3000) text = text.slice(0, 3000) + '\n（世界书内容过长，已截断）';
            return '\n【老师的世界观背景（世界书，仅供参考氛围，与题目事实冲突时以学科事实为准）】\n' + text;
        } catch (e) { return ''; }
    }

    /* ================= 学习档案（跨会话记忆） ================= */

    var profile = null;   // { key, note, entries:[{ts,subject,stage,title,brief}], updatedAt }

    function getProfile() {
        if (profile) return Promise.resolve(profile);
        var db = getIdb();
        if (!db) return Promise.resolve({ key: PROFILE_KEY, note: '', entries: [] });
        return db.get(STORE_PROFILE, PROFILE_KEY).then(function (rec) {
            profile = rec || { key: PROFILE_KEY, note: '', entries: [] };
            if (!Array.isArray(profile.entries)) profile.entries = [];
            return profile;
        }).catch(function () {
            profile = { key: PROFILE_KEY, note: '', entries: [] };
            return profile;
        });
    }

    function saveProfile() {
        if (!profile) return;
        profile.updatedAt = Date.now();
        var db = getIdb();
        if (db) { try { db.put(STORE_PROFILE, JSON.parse(JSON.stringify(profile))).catch(function () { }); } catch (e) { } }
    }

    /** 讲完一题 / 生成知识点后自动记一笔（本地完成，不额外消耗 API） */
    function appendProfileEntry(title, brief) {
        getProfile().then(function (p) {
            p.entries.push({
                ts: Date.now(),
                subject: settings.subject || '',
                stage: effectiveGrade(),
                title: String(title || '').slice(0, 80),
                brief: String(brief || '').slice(0, 200)
            });
            if (p.entries.length > 200) p.entries = p.entries.slice(-200);
            saveProfile();
        }).catch(function () { });
    }

    /** 给 system prompt 用的档案摘要：最近 6 条 + 学生自述目标 */
    function collectProfileDigest() {
        var out = { text: '', digest: '' };
        if (!profile || !profile.entries.length) return out;
        var recent = profile.entries.slice(-6);
        var lines = recent.map(function (e) {
            var d = new Date(e.ts);
            return '- ' + (d.getMonth() + 1) + '月' + d.getDate() + '日 [' + (e.subject || '?') + '·' + (e.stage || '?') + '] ' + (e.title || '');
        });
        out.digest = lines.join('；');
        out.text = '【学习档案（跨会话记忆，供你参考）】\n' +
            '学生最近学过的题目：\n' + lines.join('\n') +
            (profile.note ? '\n学生自己写的目标/弱点：' + String(profile.note).slice(0, 300) : '') +
            '\n请自然利用这些信息：学生再次问到相近知识时主动联系「上次我们讲过…」；同一类题反复出现时着重强调易错点。';
        return out;
    }

    function buildSystemPrompt(mode) {
        var subject = settings.subject || '数学';
        var grade = effectiveGrade();
        var stage = settings.gradeStage || '初中';
        var persona = personaPrompt();
        var p = [
            '你是一名耐心的「辅导老师」，正在辅导一名学生。当前科目：' + subject + '；学生年级：' + grade + '。',
            '',
            '【身份与原则】',
            '1. 你是辅导老师，不是答题机器。目标永远是让学生自己想明白，而不是替他做完。',
            '2. 讲题先讲方法：先点明这类题的通用思路（它属于什么题型、套路是什么），再落到这一道题。',
            '3. 遇到不确定的题目，明确说「这题我不确定」，并说明不确定在哪，绝不编造答案。',
            '4. 如果题目用到了明显超出「' + stage + '」的知识点，先用一句话提示「这题用到了更高学段的知识（xxx）」，再继续讲解。',
            '5. 不代写作文与整篇作业；如果学生说明自己正在考试中，拒绝讲解并劝导考后再来学习。',
            '6. 数学 / 物理 / 化学的公式一律用 KaTeX 书写：行内用 $...$，独立成行用 $$...$$。化学方程式放进 $$\\begin{aligned}...\\end{aligned}$$ 中、用 & 在等号处对齐。',
            '6b. 【画图】当题目涉及几何关系、函数变化、受力分析、电路、流程、集合关系、时间线等「看图更清楚」的内容时,可以输出一段 ```mermaid 代码块(流程用 flowchart TD,时间线用 timeline,关系用 graph LR)。图只用于辅助理解,节点文字用中文且不含未转义的双引号、括号与冒号(需要时用引号包裹节点文字)。图要简洁,节点不超过 12 个;无法用 Mermaid 表达的图形,用文字描述即可,不要编造坐标。',
            '7. 讲解风格适配「' + grade + '」:' + (GRADE_STYLE[stage] || GRADE_STYLE['其他']),
            '8. 你的回复会直接展示给学生：只输出讲解正文，不要夹带任何英文思考、自我检查（如 Potential issue / Need / Let\'s / Double-check）、提纲或与讲解无关的过程性文字。',
            ''
        ];
        if (persona) p.push('【教师人设】', persona,
            '人设只影响语气、称呼和比喻方式；上方所有教学原则（尤其是不给答案的铁律）永远优先于人设。', '');
        var digest = collectProfileDigest();
        if (digest.text) p.push(digest.text.length > 1200 ? digest.text.slice(0, 1200) + '\n(档案过长,已截断)' : digest.text, '');
        var wb = worldbookContext(session && (session.qText || ''));
        if (wb) p.push(wb, '');
        p.push('【当前模式：' + (mode === MODE_GUIDE ? '引导式' : mode === MODE_STEPS ? '分步讲解' : '完整讲解') + '】');
        if (mode === MODE_GUIDE) {
            p.push(
                '- 绝不直接给出最终答案、关键数值或关键结论。',
                '- 开头先用一两句确认学生卡在哪：请学生说说自己的思路或卡住的那一步。',
                '- 学生每次回复后，只给下一级提示：一次只给一个提示，由浅入深（先方向 → 再关键步骤 → 再公式）。',
                '- 只有学生连续三次仍卡在同一个地方，才可以给出「当前这一小步」的结论，但整题答案仍然不给。'
            );
        } else if (mode === MODE_STEPS) {
            p.push(
                '- 把解题过程拆成 3～6 步。每一步单独一段，第一行严格按「【第N步】这一步的小标题」格式书写（N 从 1 开始），随后用 2～4 句话讲清这一步怎么来的。',
                '- 最后一步之后，单独一行写「【答案】」并在其后给出最终答案。',
                '- 除上述标记外不要输出任何开场白或客套话。'
            );
        } else {
            p.push(
                '- 一次性完整讲解：先思路（这类题怎么想）→ 再完整过程（每步给出依据）→ 最后答案与易错点。',
                '- 不要分步标记，直接写成连贯的完整讲解。'
            );
        }
        // AI 英文模式：辅导也用英文讲解（固定标记【第N步】【答案】等原样保留，见 english-mode.js）
        var finalPrompt = p.join('\n');
        try { if (window.EnglishMode) finalPrompt = window.EnglishMode.applyToSystem(finalPrompt, 'tutor'); } catch (e) { /* 注入失败保持原样 */ }
        return finalPrompt;
    }

    /* ================= 渲染：Markdown + KaTeX + 安全过滤 ================= */

    function renderRich(text) {
        var out = String(text == null ? '' : text);
        try { if (window.renderMathAndDiagrams) out = window.renderMathAndDiagrams(out); } catch (e) { /* 无 KaTeX 就原样 */ }
        try { if (window.marked) out = window.marked.parse(out); } catch (e) { /* 保持纯文本 */ }
        // 安全兜底：DOMPurify（CDN 被拦截 / 加载失败）缺失时，上面的产物是「未经净化的 HTML」，
        // 绝不能直接写进 innerHTML；这里降级为纯文本（& < > 转义），与主站 sanitizeMessage 的策略一致。
        if (!window.DOMPurify) {
            return out.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        }
        try { if (window.DOMPurify) out = DOMPurify.sanitize(out, { ADD_TAGS: ['svg', 'g', 'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'text', 'tspan', 'defs', 'marker'], ADD_ATTR: ['style', 'viewBox', 'd', 'fill', 'stroke', 'stroke-width', 'x', 'y', 'x1', 'y1', 'x2', 'y2', 'cx', 'cy', 'r', 'rx', 'ry', 'points', 'transform', 'marker-end', 'id', 'class', 'text-anchor', 'font-size', 'dominant-baseline', 'width', 'height', 'refX', 'refY', 'orient', 'markerWidth', 'markerHeight'] }); } catch (e) { /* 忽略 */ }
        return out;
    }

    /* ================= Mermaid 画图(学习辅导自带加载,不依赖 optimizations.js 开关) ================= */

    var mermaidPromise = null;
    var mermaidSeq = 0;
    function ensureMermaid() {
        if (window.mermaid && window.mermaid.render) return Promise.resolve(window.mermaid);
        if (mermaidPromise) return mermaidPromise;
        mermaidPromise = new Promise(function (resolve, reject) {
            var s = document.createElement('script');
            s.src = 'https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js';
            s.onload = function () {
                try {
                    window.mermaid.initialize({
                        startOnLoad: false, theme: 'dark', securityLevel: 'strict',
                        themeVariables: { primaryColor: '#e6c78a', primaryTextColor: '#222', primaryBorderColor: '#c9a85f', lineColor: '#9aa0ad', textColor: '#eee', mainBkg: '#2a2d3a', nodeBorder: '#e6c78a', clusterBkg: '#1f2128', clusterBorder: '#555' }
                    });
                    resolve(window.mermaid);
                } catch (e) { reject(e); }
            };
            s.onerror = function () { mermaidPromise = null; reject(new Error('Mermaid 加载失败(检查网络或 CDN)')); };
            document.head.appendChild(s);
        });
        return mermaidPromise;
    }

    /** 把讲解区里的 ```mermaid 代码块替换为 SVG 图。失败时保留原代码块并给出提示。 */
    function renderDiagramsIn(container) {
        if (!container || !container.querySelectorAll) return;
        var blocks = container.querySelectorAll('pre code.language-mermaid, code.language-mermaid');
        if (!blocks.length) return;
        ensureMermaid().then(function (mm) {
            blocks.forEach(function (codeEl) {
                var pre = codeEl.closest('pre') || codeEl;
                var src = codeEl.textContent || '';
                var id = 'lt-mmd-' + (++mermaidSeq);
                mm.render(id, src).then(function (out) {
                    var wrap = el('div', 'lt-diagram');
                    wrap.innerHTML = out.svg;
                    if (pre.parentNode) pre.parentNode.replaceChild(wrap, pre);
                }).catch(function () {
                    var tip = el('div', 'lt-diagram-err', icon('ri-error-warning-line') + ' 图示语法有误,已保留原始代码');
                    pre.parentNode && pre.parentNode.insertBefore(tip, pre);
                });
            });
        }).catch(function () { /* 网络不通:保留代码块 */ });
    }

    function el(tag, cls, html) {
        var e = document.createElement(tag);
        if (cls) e.className = cls;
        if (html != null) e.innerHTML = html;
        return e;
    }
    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }
    function icon(name) { return '<i class="' + name + '"></i>'; }

    /* ================= 流式请求（SSE）+ 非流式降级 ================= */

    var ctl = null;   // 当前 AbortController

    /** 流式：逐段回调 onDelta(piece, full)。成功 resolve 全文；失败 reject（外层可降级）。 */
    /** 剥离思考过程：推理模型常把思维链混进回复 ——
        1) 独立的 reasoning_content 字段（streamChat 里单独收集，不进正文）；
        2) 正文里的 <think>/<thinking> 成对块（含误用成对分隔的写法）与未闭合尾块。
        「举一反三 / 追问」等所有模式都走 runStream → streamChat，一处修全修。 */
    function stripThinkBlocks(text) {
        var t = String(text || '');
        t = t.replace(/<(think|thinking)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '');  // 严格成对块
        t = t.replace(/<(think|thinking)\b[^>]*>[\s\S]*$/gi, '');           // 未闭合尾块（流式中思考未结束）
        t = t.replace(/<\/(think|thinking)\s*>/gi, '');                     // 误嵌套残留的孤立闭合标签
        return t.trim();
    }

    function streamChat(api, messages, onDelta, maxTokens) {
        ctl = new AbortController();
        var url = window.ApiModule && window.ApiModule.buildChatUrl
            ? window.ApiModule.buildChatUrl(api.apiUrl)
            : api.apiUrl;
        var body = {
            model: api.modelName || '',
            messages: messages,
            stream: true,
            temperature: 0.4,
            max_tokens: maxTokens || 2000
        };
        return fetch(url, {
            method: 'POST',
            signal: ctl.signal,
            headers: (window.ApiModule && window.ApiModule.authHeaders)
                ? window.ApiModule.authHeaders(api.apiKey)
                : { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + api.apiKey },
            body: JSON.stringify(body)
        }).then(function (resp) {
            if (!resp.ok) throw new Error('API Error: ' + resp.status);
            var reader = resp.body.getReader();
            var dec = new TextDecoder();
            var buf = '', full = '', reasoning = '';
            var displayOf = function (raw) { return stripThinkBlocks(raw); };
            function pump() {
                return reader.read().then(function (chunk) {
                    if (chunk.done) {
                        /* 兜底：个别端点把全部输出都放 reasoning_content，正文一个字没有 ——
                           此时用思考内容顶上，避免误报「空回复」。 */
                        if (!full.trim() && reasoning.trim()) full = reasoning;
                        if (!full) throw new Error('API Error: 空回复');
                        return displayOf(full);
                    }
                    buf += dec.decode(chunk.value, { stream: true });
                    var lines = buf.split('\n');
                    buf = lines.pop();
                    lines.forEach(function (line) {
                        var t = line.trim();
                        if (!t || t.indexOf('data:') !== 0) return;
                        var payload = t.slice(5).trim();
                        if (payload === '[DONE]') return;
                        try {
                            var j = JSON.parse(payload);
                            var ch = j.choices && j.choices[0];
                            var d = ch && (ch.delta || ch.message);
                            /* 关键修复：reasoning_content 是「思考过程」，不是正文 ——
                               之前 `d.content || d.reasoning_content` 把它直接拼进回复，
                               学生就会看到一大段英文思维链。这里单独收集，不进正文。 */
                            var r = d ? d.reasoning_content : '';
                            var c = d ? d.content : '';
                            if (typeof r === 'string' && r) reasoning += r;
                            if (typeof c === 'string' && c) {
                                full += c;
                                onDelta(c, displayOf(full));
                            }
                        } catch (e) { /* 忽略无法解析的心跳片段 */ }
                    });
                    return pump();
                });
            }
            return pump();
        });
    }

    /** 非流式降级（复用 api.js 的多站点降级 + 自动重试能力） */
    function plainChat(api, messages, maxTokens) {
        return window.ApiModule.chatCompletion(api, messages, {
            temperature: 0.4, max_tokens: maxTokens || 2000, stream: false
        });
    }

    /** 统一入口：先试流式，失败（非中断）自动降级非流式重试一次 */
    function askAI(messages, onDelta, maxTokens) {
        var api = resolveApi();
        if (!hasApi(api)) {
            return Promise.reject(Object.assign(new Error('还没配置 API'), { code: 'noApi' }));
        }
        return streamChat(api, messages, onDelta, maxTokens).catch(function (err) {
            if (err && err.name === 'AbortError') throw err;
            // 流式不被端点支持（HTTP 错误 / 空回复）→ 降级非流式
            return plainChat(api, messages, maxTokens).then(function (txt) {
                return stripThinkBlocks(txt);
            });
        });
    }

    /* ================= 会话状态（刷新 / 退出后可继续） ================= */

    var session = null;      // { subject, grade, mode, qText, qImage, steps:[{title,body,isAnswer}], revealed, msgs:[{role:'a', htmlSrc|text, kind}], pending }
    var stage = null;        // 全屏界面根节点
    var busy = false;        // 正在生成

    function newSession() {
        return {
            key: SESSION_KEY,
            subject: settings.subject, grade: settings.gradeStage, gradeDetail: settings.gradeDetail, mode: settings.mode,
            qText: '', qImage: '',
            steps: [], revealed: 0,
            msgs: []            // { kind:'explain'|'follow'|'drill'|'user', mode, text, followOf }
        };
    }

    function saveSession() {
        if (!session) return;
        var db = getIdb();
        if (!db) return;
        try { db.put(STORE_SESSION, JSON.parse(JSON.stringify(session))).catch(function () { /* 存不进就算了 */ }); } catch (e) { /* 忽略 */ }
    }

    function clearSession() {
        session = null;
        var db = getIdb();
        if (db) { try { db.del(STORE_SESSION, SESSION_KEY).catch(function () { }); } catch (e) { } }
    }

    /* ================= 全屏学习界面 ================= */

    function isOpen() { return !!(stage && stage.parentNode); }

    function ensureStyle() {
        /* 样式已并入 mysw-core.css（随主包统一加载），不再动态注入 */
    }

    function buildStage() {
        ensureStyle();
        stage = el('div', 'lt-stage');

        /* ---- 顶栏 ---- */
        var top = el('div', 'lt-top');
        var backBtn = el('button', 'lt-icon-btn', icon('ri-arrow-left-line'));
        backBtn.title = '返回聊天（进度会保存）';
        backBtn.addEventListener('click', close);

        var subjSel = el('select', 'lt-sel'); subjSel.id = 'lt-subject';
        var stageSel = el('select', 'lt-sel'); stageSel.id = 'lt-grade';
        var detailSel = el('select', 'lt-sel'); detailSel.id = 'lt-grade-detail';
        detailSel.title = '具体年级';
        function fillSel(sel, arr, cur) {
            sel.innerHTML = arr.map(function (s) {
                return '<option value="' + esc(s) + '"' + (s === cur ? ' selected' : '') + '>' + esc(s) + '</option>';
            }).join('');
        }
        function curStage() { return session ? (session.grade || settings.gradeStage) : settings.gradeStage; }
        function curDetail() { return session ? (session.gradeDetail || '') : settings.gradeDetail; }
        fillSel(subjSel, settings.subjects, session ? session.subject : settings.subject);
        fillSel(stageSel, GRADES, curStage());
        fillDetailSel(detailSel);
        subjSel.addEventListener('change', function () {
            settings.subject = subjSel.value; saveSettings();
            if (session) { session.subject = subjSel.value; saveSession(); }
        });
        stageSel.addEventListener('change', function () {
            settings.gradeStage = stageSel.value;
            /* 学段换了，旧的具体年级必然不属于新学段，必须一起清掉——
               否则「高中 + 初二」这种矛盾组合会被存下来并注入 prompt。 */
            settings.gradeDetail = ''; saveSettings();
            if (session) { session.grade = stageSel.value; session.gradeDetail = ''; saveSession(); }
            fillDetailSel();
        });
        detailSel.addEventListener('change', function () {
            settings.gradeDetail = detailSel.value; saveSettings();
            if (session) { session.gradeDetail = detailSel.value; saveSession(); }
        });

        var bookBtn = el('button', 'lt-icon-btn', icon('ri-booklet-line'));
        bookBtn.title = '错题本';
        bookBtn.addEventListener('click', function () { openMistakes(); });
        var profileBtn = el('button', 'lt-icon-btn', icon('ri-file-user-line'));
        profileBtn.title = '学习档案（老师会记住你学过什么）';
        profileBtn.addEventListener('click', function () { openProfile(); });
        var personaBtn = el('button', 'lt-icon-btn', icon('ri-user-heart-line'));
        personaBtn.title = '老师人设';
        personaBtn.addEventListener('click', function () { openPersonaPicker(); });
        var voiceBtn = el('button', 'lt-icon-btn', icon('ri-phone-line'));
        voiceBtn.title = '给老师打语音电话（可以边看题边听讲；没配语音转文字也能打字聊）';
        voiceBtn.addEventListener('click', function () { startTutorCall(false); });
        var videoBtn = el('button', 'lt-icon-btn', icon('ri-vidicon-line'));
        videoBtn.title = '视频通话：打开摄像头让老师「看见」你的题目（同样可以打字聊）';
        videoBtn.addEventListener('click', function () { startTutorCall(true); });
        var newQBtn = el('button', 'lt-icon-btn', icon('ri-add-circle-line'));
        newQBtn.title = '提新问题：清掉当前题目，开始新的（已加入错题本的题不受影响）';
        newQBtn.addEventListener('click', function () { startNewQuestion(); });
        var previewBtn = el('button', 'lt-icon-btn', icon('ri-book-open-line'));
        previewBtn.title = '预习新课:输入课题,生成预习提纲与前置自测';
        previewBtn.addEventListener('click', function () { doPreview(); });

        /* 【顶栏分组】图标按钮统一收进 .lt-top-icons：桌面上与选择器同一行，
           手机端整组换到第二行均分——旧版 3 个选择器 + 7 个图标挤一条，
           窄屏上直接糊成一坨（样式见 learn-tutor.css 窄屏段）。 */
        var iconBar = el('div', 'lt-top-icons');
        iconBar.appendChild(previewBtn);
        iconBar.appendChild(newQBtn);
        iconBar.appendChild(voiceBtn);
        iconBar.appendChild(videoBtn);
        iconBar.appendChild(bookBtn);
        iconBar.appendChild(profileBtn);
        iconBar.appendChild(personaBtn);

        top.appendChild(backBtn);
        top.appendChild(subjSel);
        top.appendChild(stageSel);
        top.appendChild(detailSel);
        top.appendChild(el('div', 'lt-spacer'));
        top.appendChild(iconBar);

        /* ---- 模式切换 ---- */
        var modes = el('div', 'lt-modes');
        var curMode = session ? session.mode : settings.mode;
        MODES.forEach(function (m) {
            var b = el('button', 'lt-mode-pill' + (m.id === curMode ? ' active' : ''),
                icon(m.icon) + ' ' + m.name);
            b.dataset.mode = m.id;
            b.addEventListener('click', function () {
                if (busy) { toast('等这一轮讲完再换模式'); return; }
                modes.querySelectorAll('.lt-mode-pill').forEach(function (x) { x.classList.remove('active'); });
                b.classList.add('active');
                settings.mode = m.id; saveSettings();
                if (session) { session.mode = m.id; saveSession(); }
            });
            modes.appendChild(b);
        });

        /* ---- 讲解区 ---- */
        var flow = el('div', 'lt-flow'); flow.id = 'lt-flow';
        /* 【回到底部】长讲解流式输出时往上翻看历史，流仍在自动滚——
           手动滚离底部 240px 以上就浮出按钮，点击回到最新；滚回底部自动隐藏。 */
        var jumpBtn = el('button', 'lt-jump-btn', icon('ri-arrow-down-line') + ' 回到底部');
        jumpBtn.type = 'button';
        jumpBtn.addEventListener('click', function () {
            flow.scrollTo({ top: flow.scrollHeight, behavior: 'smooth' });
        });
        var userScrolled = false;
        flow.addEventListener('scroll', function () {
            var away = flow.scrollHeight - flow.scrollTop - flow.clientHeight > 240;
            jumpBtn.classList.toggle('show', away);
            /* 用户主动向上滚动时暂停「流式自动跟随」——否则一边看历史一边被
               拽回底部，根本没法看。重新滚回底部附近恢复自动跟随。 */
            userScrolled = away;
        });

        /* ---- 分步控制条 ---- */
        var stepbar = el('div', 'lt-stepbar');
        var prevBtn = el('button', 'lt-btn ghost', icon('ri-arrow-up-line') + ' 上一步');
        var posEl = el('div', 'lt-step-pos', '');
        var nextBtn = el('button', 'lt-btn primary', '下一步 ' + icon('ri-arrow-down-line'));
        var gotBtn = el('button', 'lt-btn', icon('ri-thumb-up-line') + ' 懂了');
        prevBtn.addEventListener('click', function () { if (session && session.revealed > 1) { session.revealed--; renderSteps(); saveSession(); } });
        nextBtn.addEventListener('click', function () {
            if (!session) return;
            if (session.revealed < session.steps.length) { session.revealed++; renderSteps(); saveSession(); }
        });
        gotBtn.addEventListener('click', function () {
            if (!session) return;
            session.revealed = session.steps.length; renderSteps(); saveSession();
        });
        stepbar.appendChild(prevBtn); stepbar.appendChild(posEl); stepbar.appendChild(gotBtn); stepbar.appendChild(nextBtn);

        /* ---- 输入区 ---- */
        var inputWrap = el('div', 'lt-input-wrap');
        var imgPrev = el('div', 'lt-img-prev');
        imgPrev.innerHTML = '<img alt=""><button class="lt-img-x" type="button">' + icon('ri-close-line') + '</button><span class="lt-img-note"></span>';
        var ta = el('textarea', 'lt-textarea');
        ta.id = 'lt-input'; ta.rows = 1;
        ta.placeholder = '输入题目，或先拍照 / 从错题本调题…（Ctrl+V 可直接粘贴题目图片）';
        var camBtn = el('button', 'lt-icon-btn', icon('ri-camera-line'));
        camBtn.title = '拍照 / 相册（手机可直接调起摄像头）';
        var sendBtn = el('button', 'lt-btn primary lt-send', icon('ri-send-plane-fill'));
        sendBtn.title = '发送';

        var fileInput = el('input');
        fileInput.type = 'file'; fileInput.accept = 'image/*';
        fileInput.setAttribute('capture', 'environment');   // 手机端优先调起后置摄像头
        fileInput.style.display = 'none';
        camBtn.addEventListener('click', function () { fileInput.click(); });
        fileInput.addEventListener('change', function () {
            var f = fileInput.files && fileInput.files[0];
            fileInput.value = '';
            if (f) pickImage(f);
        });

        imgPrev.querySelector('.lt-img-x').addEventListener('click', function () {
            pendingImage = '';
            imgPrev.classList.remove('show');
        });

        ta.addEventListener('input', function () {
            ta.style.height = 'auto';
            ta.style.height = Math.min(132, ta.scrollHeight) + 'px';
        });
        ta.addEventListener('keydown', function (ev) {
            if (ev.key === 'Enter' && !ev.shiftKey && !ev.isComposing) { ev.preventDefault(); doSend(); }
        });
        // 软键盘弹出时保证输入区可见（移动端必备）
        ta.addEventListener('focus', function () {
            setTimeout(function () { if (stage && stage.parentNode) flow.scrollTop = flow.scrollHeight; }, 350);
        });
        // 支持直接粘贴题目截图
        stage.addEventListener('paste', function (ev) {
            try {
                var items = (ev.clipboardData || {}).items || [];
                for (var i = 0; i < items.length; i++) {
                    if (items[i].type && items[i].type.indexOf('image') === 0) {
                        var f = items[i].getAsFile();
                        if (f) { ev.preventDefault(); pickImage(f); }
                        break;
                    }
                }
            } catch (e) { /* 忽略 */ }
        });

        sendBtn.addEventListener('click', doSend);

        inputWrap.appendChild(imgPrev);
        var row = el('div', 'lt-input-row');
        row.appendChild(camBtn); row.appendChild(ta); row.appendChild(sendBtn);
        inputWrap.appendChild(row);
        inputWrap.appendChild(fileInput);

        stage.appendChild(top);
        stage.appendChild(modes);
        stage.appendChild(flow);
        stage.appendChild(jumpBtn);
        stage.appendChild(stepbar);
        stage.appendChild(inputWrap);

        stage._refs = { flow: flow, ta: ta, sendBtn: sendBtn, camBtn: camBtn, imgPrev: imgPrev, stepbar: stepbar, posEl: posEl, nextBtn: nextBtn, gotBtn: gotBtn, prevBtn: prevBtn, jumpBtn: jumpBtn, isAutoScrollBlocked: function () { return userScrolled; } };
        return stage;
    }

    function toast(msg) {
        try {
            if (typeof window.showToast === 'function') window.showToast(msg, 'ri-graduation-cap-line');
            else console.log('[学习辅导]', msg);
        } catch (e) { /* 忽略 */ }
    }

    /** 滚动讲解区到底部。用户已手动上翻（离底 >240px）时不强拽，
        除非 force（发送新消息、恢复会话等「该看了」的场景）。 */
    function scrollFlowBottom(force) {
        if (!stage || !stage._refs) return;
        var flow = stage._refs.flow;
        if (!force && stage._refs.isAutoScrollBlocked && stage._refs.isAutoScrollBlocked()) return;
        flow.scrollTop = flow.scrollHeight;
    }

    /* ---- 图片选择：压缩 → 预览（只有点发送才上传识别） ---- */

    var pendingImage = '';

    function pickImage(file) {
        if (!window.ImageTools || typeof window.ImageTools.compress !== 'function') {
            toast('图片组件未加载，无法处理图片');
            return;
        }
        // ImageTools.compress 内部已尊重「设置 → 界面外观 → 不压缩图片」开关
        Promise.resolve(window.ImageTools.compress(file, 1600, 0.82)).then(function (dataUrl) {
            if (!dataUrl) { toast('图片读取失败'); return; }
            pendingImage = dataUrl;
            var prev = stage._refs.imgPrev;
            prev.querySelector('img').src = dataUrl;
            prev.querySelector('.lt-img-note').textContent =
                '已压缩到长边 1600px 内，点「发送」才会发给 AI 识别';
            prev.classList.add('show');
        }).catch(function () { toast('图片处理失败，换一张试试'); });
    }

    /* ---- 发送 / 讲解主流程 ---- */

    function setBusy(b) {
        busy = b;
        var r = stage._refs;
        r.sendBtn.classList.toggle('stop', b);
        r.sendBtn.innerHTML = b ? icon('ri-stop-line') : icon('ri-send-plane-fill');
        r.sendBtn.title = b ? '停止生成' : '发送';
        r.ta.disabled = b;
        r.camBtn.disabled = b;
    }

    function doSend() {
        if (!stage) return;
        var r = stage._refs;
        if (busy) { if (ctl) ctl.abort(); return; }   // 生成中点发送 = 停止
        var text = (r.ta.value || '').trim();
        var img = pendingImage;
        if (!text && !img) { toast('先输入题目或拍一张照片'); return; }
        r.ta.value = ''; r.ta.style.height = 'auto';
        pendingImage = ''; r.imgPrev.classList.remove('show');

        /* 【聊天式多轮】已有题目上下文（讲过题 / 有对话记录）时，输入框
           就是聊天：消息带着完整上下文继续聊，不再清空重来。
           想换新题用题目卡上的 ×（行为不变，带确认）。 */
        var hasTopic = !!(session && (session.qText || session.qImage || (session.msgs && session.msgs.length)));
        /* 【换题快捷通道】但学生打出「新题：…」「第二道题：…」这类明确
           标记时，几乎不可能是想「追问一道还没讲过的题」——按新题处理，
           行为与旧版一致；其余输入全部视为追问。 */
        var looksNewQ = !!text && /^(新题|换题|下一题|再来一题|再来一道|另外一道|另一道|第[二三四五六七八九十]+\s*[道题]{1,2})\s*[:：、，,]/.test(text);

        // 带图但没开视觉：明确提示 + 一键跳转，绝不静默失败
        if (img && !isVisionOn()) {
            var body = el('div');
            body.innerHTML = '<p style="margin:0 0 10px;">拍照识题需要先开启<b>「多模态视觉」</b>，否则图片发过去模型也看不懂。</p>';
            var goBtn = el('button', 'lt-btn primary', icon('ri-settings-3-line') + ' 去开启多模态视觉');
            goBtn.addEventListener('click', function () {
                openVisionSettings();
                overlayRemove(goOverlay);
            });
            var goOverlay = el('div');
            goOverlay.style.cssText = 'position:fixed;inset:0;z-index:9000;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;padding:20px;';
            var card = el('div');
            card.style.cssText = 'background:#20222b;border:1px solid #3c3f4b;border-radius:14px;padding:18px;max-width:420px;width:100%;color:#e8e8ee;';
            card.appendChild(body); card.appendChild(goBtn);
            var closeX = el('button', 'lt-btn ghost', '先不用');
            closeX.style.marginLeft = '8px';
            closeX.addEventListener('click', function () { overlayRemove(goOverlay); });
            goBtn.parentNode.appendChild(closeX);
            goOverlay.appendChild(card);
            document.body.appendChild(goOverlay);
            // 文本仍可作为纯文字发送（若用户输了文字）
            if (text) { hasTopic ? chatReply(text, '') : submitQuestion(text, ''); }
            return;
        }
        if (hasTopic && !looksNewQ) chatReply(text, img);
        else submitQuestion(text, img);
    }

    function overlayRemove(ov) { if (ov && ov.parentNode) ov.parentNode.removeChild(ov); }

    /** 打开 AI 设置并滚到「多模态视觉」开关 */
    function openVisionSettings() {
        var modal = document.getElementById('ai-settings-modal');
        if (modal && !modal.classList.contains('show')) modal.classList.add('show');
        var cb = document.getElementById('enable-multimodal-vision');
        if (cb) {
            cb.scrollIntoView({ behavior: 'smooth', block: 'center' });
            var box = cb.closest('.form-group') || cb;
            var old = box.style.boxShadow;
            box.style.transition = 'box-shadow .4s';
            box.style.boxShadow = '0 0 0 2px #e6c78a';
            setTimeout(function () { box.style.boxShadow = old || ''; }, 2400);
        }
    }

    /* ================= 聊天式多轮对话 ================= */

    /** 学生消息气泡（右侧、金色、保留换行原样显示——学生输入的是
        纯文本，走 marked 反而会把下划线、星号之类变成奇怪格式） */
    function addUserMsg(text, image) {
        var m = el('div', 'lt-msg mine');
        var body = el('div', 'lt-msg-body');
        if (image) {
            var im = el('img'); im.src = image; im.alt = '学生发送的图片';
            body.appendChild(im);
        }
        if (text) body.appendChild(el('div', 'lt-mine-text', esc(text)));
        m.appendChild(body);
        stage._refs.flow.appendChild(m);
        scrollFlowBottom(true);
        return m;
    }

    /** 组聊天上下文：system + 题目 + 讲解（步骤卡或对话流）+ 本次消息。
        历史 user/assistant 交替来自 session.msgs；分步讲解的步骤不在
        msgs 里，单独拼成一条 assistant。 */
    function buildChatMessages(newText, newImage) {
        var sys = buildSystemPrompt(session.mode) +
            '\n\n【当前是聊天场景】学生直接在对话框里和你交流——可能是追问细节、说出自己的思路让你确认、回答你的引导提示，或聊和这道题有关的问题。像真人老师一样自然地接话，保持多轮连贯，别重复已经说过的大段内容。如果学生明显发来了一道全新的题目（比如直接给题干、或以「新题」「第二道题」开头），就把它当作新题按当前讲解模式开始讲，不用提醒换题按钮。';
        var messages = [{ role: 'system', content: sys }];
        var first = session.qText || '（这是一道图片题，图片见第一条消息）';
        var visionOk = isVisionOn();
        if (session.qImage && visionOk) {
            messages.push({ role: 'user', content: buildUserContent(session.qText, session.qImage) });
        } else {
            messages.push({ role: 'user', content: first.slice(0, 2400) });
        }
        if (session.steps && session.steps.length) {
            var stText = session.steps.map(function (s, i) {
                return '【第' + (i + 1) + '步】' + (s.title || '') + '\n' + (s.body || '');
            }).join('\n\n');
            messages.push({ role: 'assistant', content: stText.slice(0, 3000) });
        }
        (session.msgs || []).forEach(function (m) {
            if (m.kind === 'user') {
                if (m.text) messages.push({ role: 'user', content: String(m.text).slice(0, 2400) });
            } else if (m.text) {
                messages.push({ role: 'assistant', content: String(m.text).slice(0, 2400) });
            }
        });
        messages.push({ role: 'user', content: newImage ? buildUserContent(newText, newImage) : newText });
        /* 上下文保险丝：保留 system + 题目两条 + 最近 20 条，防止长对话撑爆 token */
        if (messages.length > 23) {
            var head = messages.slice(0, 3);
            var tail = messages.slice(-20);
            messages = head.concat(tail);
        }
        return messages;
    }

    /** 聊天回复主流程：记用户消息 → 带上下文流式回复 → 记 AI 消息 */
    function chatReply(text, image) {
        session.msgs.push({ kind: 'user', text: text, hasImage: !!image });
        addUserMsg(text, image);
        saveSession();

        var view = addMsg('follow', '对话');
        var messages = buildChatMessages(text, image);
        runStream(messages, view, { hasImage: !!image || !!session.qImage, maxTokens: 1400 }).then(function (full) {
            session.msgs.push({ kind: 'follow', text: full, followOf: -1, q: '对话' });
            saveSession();
        }).catch(function () { /* 错误已显示在气泡里 */ });
    }

    function submitQuestion(text, image) {
        session = newSession();
        session.qText = text; session.qImage = image || '';
        session.subject = settings.subject;
        session.grade = settings.gradeStage; session.gradeDetail = settings.gradeDetail;
        session.mode = settings.mode;
        saveSession();

        var flow = stage._refs.flow;
        flow.innerHTML = '';
        flow.appendChild(buildQuestionCard());

        runExplain();
    }

    function buildQuestionCard() {
        var card = el('div', 'lt-qcard');
        card.appendChild(el('span', 'lt-qtag', esc(session.subject || settings.subject) + ' · ' + esc(session.gradeDetail || session.grade || settings.gradeStage)));
        var del = el('button', 'lt-q-del', icon('ri-close-line'));
        del.title = '换一道题';
        del.addEventListener('click', function () {
            try {
                window.Dlg.confirm({
                    title: '换一道题', message: '当前题目和讲解会清空（错题本里已收藏的不受影响）。确定换新题？',
                    okText: '换新题'
                }).then(function (yes) {
                    if (!yes) return;
                    clearSession();
                    session = newSession(); saveSession();
                    renderEmpty();
                });
            } catch (e) {
                clearSession(); session = newSession(); saveSession(); renderEmpty();
            }
        });
        card.appendChild(del);
        if (session.qText) card.appendChild(el('div', 'lt-q-text', renderRich(session.qText)));
        if (session.qImage) {
            var im = el('img'); im.src = session.qImage; im.alt = '题目图片';
            card.appendChild(im);
        }
        return card;
    }

    function renderEmpty() {
        var flow = stage._refs.flow;
        flow.innerHTML = '';
        var hint = session.qText || session.qImage ? '' :
            '<i class="ri-camera-lens-line"></i>拍一张题目照片，或直接输入文字<br>默认「引导式」：我不会直接给答案，先聊聊你卡在哪';
        if (hint) flow.appendChild(el('div', 'lt-empty', hint));
        if (session.qText || session.qImage) flow.appendChild(buildQuestionCard());
    }

    /** 讲解消息气泡（kind: explain | follow | drill） */
    function addMsg(kind, followTag) {
        var m = el('div', 'lt-msg streaming');
        var head = el('div', 'lt-msg-head',
            icon(kind === 'drill' ? 'ri-file-list-3-line' : kind === 'follow' ? 'ri-chat-3-line' : 'ri-teacher-line')
            + ' ' + (kind === 'drill' ? '举一反三' : kind === 'follow' ? '<span class="lt-follow-tag">追问 · ' + esc(followTag || '') + '</span>' : '讲解'));
        var body = el('div', 'lt-msg-body', '<span class="lt-caret"></span>');
        m.appendChild(head); m.appendChild(body);
        stage._refs.flow.appendChild(m);
        scrollFlowBottom(false);
        return { root: m, body: body };
    }

    /** 通用：跑一轮流式讲解并渲染（rawMessages 由调用方按模式构造） */
    function runStream(messages, msgView, opts) {
        opts = opts || {};
        setBusy(true);
        var streamed = '';
        return askAI(messages, function (piece, full) {
            streamed = full;
            msgView.body.innerHTML = renderRich(full) + '<span class="lt-caret"></span>';
            if (opts.autoScroll !== false) scrollFlowBottom(false);
        }, opts.maxTokens).then(function (full) {
            msgView.root.classList.remove('streaming');
            msgView.body.innerHTML = renderRich(full);
            renderDiagramsIn(msgView.body);
            setBusy(false);
            return full;
        }).catch(function (err) {
            setBusy(false);
            msgView.root.classList.remove('streaming');
            if (err && err.name === 'AbortError') {
                msgView.body.innerHTML = renderRich(streamed || '（已停止）');
                if (streamed && opts.onDone) opts.onDone(streamed);
                return streamed;
            }
            var e = explainError(err, opts.hasImage);
            if (err && err.code === 'noApi') e = { title: '还没有配 API', msg: '请先到「设置 → AI 配置」填写调用地址与 Key，也可以在「专用模型 → 学习辅导」里单独配一个讲解模型。' };
            msgView.body.innerHTML = '<b style="color:#e0a0a0;">' + esc(e.title) + '：</b>' + esc(e.msg);
            throw err;
        });
    }

    /** 主讲解：按当前模式发起 */
    function runExplain() {
        var mode = session.mode;
        var userContent = buildUserContent(session.qText, session.qImage);
        var messages = [{ role: 'system', content: buildSystemPrompt(mode) + (session.preview ? PREVIEW_PROMPT : '') }];
        if (userContent) messages.push({ role: 'user', content: userContent });

        var msgView = addMsg('explain');
        if (mode === MODE_STEPS) {
            runStream(messages, msgView, { hasImage: !!session.qImage, maxTokens: 2600 }).then(function (full) {
                session.steps = parseSteps(full);
                session.revealed = Math.min(1, session.steps.length);
                msgView.root.style.display = 'none';   // 原始长文隐藏，用步骤卡片呈现
                renderSteps(true);
                addAfterActions();
                saveSession();
                /* 学习档案：讲完一题自动记一笔（title 取题干前 40 字） */
                appendProfileEntry((session.qText || '图片题').slice(0, 40), full.replace(/[#*`$\\]|\n+/g, ' ').slice(0, 160));
            }).catch(function () { /* 错误已写入气泡 */ });
        } else {
            runStream(messages, msgView, { hasImage: !!session.qImage, maxTokens: 2400 }).then(function (full) {
                /* 只 push 这一次：原始 markdown 是唯一可信的会话记录。
                   之前这里还会再调 attachGuideInput 把「渲染后的 DOM 文本」
                   重复存一条 —— KaTeX 渲染后的 textContent 带公式重复垃圾，
                   恢复会话时会整段重放，界面直接糊成一团。 */
                session.msgs.push({ kind: 'explain', mode: mode, text: full });
                addAfterActions();
                saveSession();
                appendProfileEntry((session.qText || '图片题').slice(0, 40), full.replace(/[#*`$\\]|\n+/g, ' ').slice(0, 160));
            }).catch(function () { /* 错误已写入气泡 */ });
        }
    }

    function buildUserContent(text, image) {
        if (!image) return text || '';
        var parts = [];
        if (text) parts.push({ type: 'text', text: text });
        else parts.push({ type: 'text', text: '请看这道题' });
        parts.push({ type: 'image_url', image_url: { url: image } });
        return parts;
    }

    /** 解析分步格式：【第N步】标题\n正文… / 【答案】… */
    function parseSteps(raw) {
        var text = String(raw || '').replace(/\r/g, '');
        var steps = [];
        var re = /【第\s*(\d+)\s*步】\s*([^\n]*)\n?([\s\S]*?)(?=【第\s*\d+\s*步】|【答案】|$)/g;
        var m;
        while ((m = re.exec(text)) !== null) {
            steps.push({ title: m[2].trim(), body: (m[3] || '').trim(), isAnswer: false });
        }
        var ai = text.indexOf('【答案】');
        if (ai >= 0) {
            var ansBody = text.slice(ai + 4).trim();
            steps.push({ title: '最终答案', body: ansBody, isAnswer: true });
        }
        if (!steps.length) steps.push({ title: '讲解', body: text, isAnswer: false });
        return steps;
    }

    /** 步骤卡片渲染（revealed 之前的全部展开，之后的半透明锁定） */
    function renderSteps(announce) {
        var flow = stage._refs.flow;
        flow.querySelectorAll('.lt-step').forEach(function (n) { n.remove(); });
        flow.querySelectorAll('.lt-after').forEach(function (n) { n.remove(); });
        if (!session || !session.steps.length) return;
        var anchor = flow.querySelector('.lt-msg:last-of-type') || flow.lastChild;
        var ref = anchor && anchor.nextSibling ? anchor.nextSibling : null;

        session.steps.forEach(function (st, i) {
            var revealed = i < session.revealed;
            var card = el('div', 'lt-step' + (revealed ? '' : ' pending') + (st.isAnswer ? ' lt-step-answer' : ''));
            var head = el('div', 'lt-step-head');
            head.appendChild(el('span', 'lt-step-no', String(i + 1)));
            head.appendChild(el('span', null, esc(st.title) + (st.isAnswer ? ' <span class="lt-ans-tag">' + icon('ri-check-double-line') + '答案</span>' : '')));
            card.appendChild(head);
            if (revealed) {
                var stepBody = el('div', 'lt-step-body', renderRich(st.body));
                card.appendChild(stepBody);
                renderDiagramsIn(stepBody);
                if (!st.isAnswer) {
                    var ask = el('button', 'lt-step-ask', icon('ri-question-line') + ' 这一步怎么来的？');
                    ask.addEventListener('click', function () { followStep(i); });
                    head.appendChild(ask);
                }
            } else {
                card.appendChild(el('div', 'lt-step-body', '（还没讲到，点「下一步」继续）'));
            }
            flow.insertBefore(card, ref);
        });

        var sb = stage._refs.stepbar;
        if (session.revealed < session.steps.length) {
            sb.classList.add('show');
            stage._refs.posEl.textContent = '第 ' + session.revealed + ' / ' + session.steps.length + ' 步';
        } else {
            sb.classList.remove('show');
            /* 「懂了」/ 翻完所有步骤后步骤条隐藏，但 renderSteps 开头清掉了
               「举一反三 / 加入错题本」操作行 —— 必须补回来，否则全展开后
               这两个按钮永久消失，只能重新讲一遍才能保存错题。 */
            if (!flow.querySelector('.lt-after')) addAfterActions();
        }
        if (announce) flow.scrollTop = flow.scrollHeight;
    }

    /** 选中某一步追问：只带这一步的上下文，不重发整题 */
    function followStep(idx) {
        if (busy || !session || !session.steps[idx]) return;
        var st = session.steps[idx];
        try {
            window.Dlg.prompt({
                title: '追问 · 第' + (idx + 1) + '步',
                message: '关于「' + (st.title || '这一步') + '」想问什么？（只带这一步的上下文，不重发整题）',
                placeholder: '例如：这一步为什么要移项？/ 这个公式是哪里来的？',
                okText: '问'
            }).then(function (q) {
                if (!q || !q.trim()) return;
                doFollow(idx, q.trim());
            });
        } catch (e) {
            var q = window.prompt('关于「' + (st.title || '这一步') + '」想问什么？');
            if (q && q.trim()) doFollow(idx, q.trim());
        }
    }

    function doFollow(idx, q) {
        var st = session.steps[idx];
        var sys = buildSystemPrompt(session.mode === MODE_STEPS ? MODE_FULL : session.mode)
            + '\n\n【当前是追问场景】学生正在看解题的第' + (idx + 1) + '步，只针对这一步答疑，简短清楚，不要再讲整道题。';
        var stepText = '【第' + (idx + 1) + '步】' + (st.title || '') + '\n' + (st.body || '');
        var messages = [
            { role: 'system', content: sys },
            { role: 'user', content: '题目背景（仅参考，不需要重讲）：' + (session.qText || '（图片题，内容如步骤所述）') },
            { role: 'user', content: '当前步骤：\n' + stepText },
            { role: 'user', content: '我的问题：' + q }
        ];
        var view = addMsg('follow', '第' + (idx + 1) + '步 · ' + (st.title || ''));
        runStream(messages, view, { maxTokens: 900 }).then(function (full) {
            session.msgs.push({ kind: 'follow', text: full, followOf: idx, q: q });
            saveSession();
        }).catch(function () { /* 错误已显示 */ });
    }

    /* （attachGuideInput 已删除：它会把渲染后的 DOM 文本重复存进 session.msgs，
        造成「同一段讲解恢复后显示两遍 + 内容被 KaTeX 污染」。
        引导式的讲解由 runExplain 统一 push 原始 markdown，一轮只记一条。） */

    /** 【提新问题】结束当前这题，回到拍题/输入新题的初始状态。
        以前只能退出重开（还会弹「继续上次的题」），想换道题非常绕。
        当前讲解内容已看过、该记的错题/档案都已落库，这里清会话是安全的。 */
    function startNewQuestion() {
        if (!stage) return;
        if (busy) { toast('等当前内容生成完，或先点发送键停止'); return; }
        var doNew = function () {
            clearSession();
            session = newSession(); saveSession();
            pendingImage = '';
            var r = stage._refs;
            if (r) {
                r.imgPrev.classList.remove('show');
                r.ta.value = ''; r.ta.style.height = 'auto';
            }
            renderEmpty();
            scrollFlowBottom(false);
            toast('已切到新问题，拍张照或直接输入题目');
        };
        var hasContent = session && (session.qText || session.qImage || (session.msgs || []).length);
        if (!hasContent) { doNew(); return; }
        try {
            window.Dlg.confirm({ title: '提新问题', message: '当前这道题的讲解过程会被清掉（已加入错题本 / 学习档案的记录不受影响）。直接开始新问题吗？', okText: '开始新问题' })
                .then(function (yes) { if (yes) doNew(); });
        } catch (e) { doNew(); }
    }

    /** 讲完一题后的操作行：知识点&套路 / 举一反三 / 加入错题本 */
    function addAfterActions() {
        var flow = stage._refs.flow;
        /* 幂等：讲解完成、翻完步骤、恢复会话三条路径都会走到这里，
           先清掉已有的操作行再补 —— 否则退出重开会多出一排按钮。 */
        flow.querySelectorAll('.lt-after').forEach(function (n) { n.remove(); });
        var bar = el('div', 'lt-after');
        var drill = el('button', 'lt-btn', icon('ri-magic-line') + ' 举一反三');
        var kpBtn = el('button', 'lt-btn', icon('ri-lightbulb-flash-line') + ' 知识点&套路');
        kpBtn.title = '总结这道题考的知识点和题型套路（不重复解题）';
        var save = el('button', 'lt-btn', icon('ri-bookmark-line') + ' 加入错题本');
        var newQBtn = el('button', 'lt-btn', icon('ri-add-circle-line') + ' 提新问题');
        newQBtn.title = '清掉当前题目，开始讲下一道';
        drill.addEventListener('click', doDrill);
        kpBtn.addEventListener('click', doKnowledgePoint);
        save.addEventListener('click', saveToMistakes);
        newQBtn.addEventListener('click', startNewQuestion);
        bar.appendChild(drill); bar.appendChild(kpBtn); bar.appendChild(save); bar.appendChild(newQBtn);
        flow.appendChild(bar);
        scrollFlowBottom(false);
    }

    /** 【知识点&套路】总结本题知识点 / 题型套路 / 易错点，不重复解题。
        结果自动记入学习档案（跨会话记忆），也会随「加入错题本」一起存。 */
    function doKnowledgePoint() {
        if (busy) { toast('等当前内容生成完'); return; }
        if (!session) return;
        var view = addMsg('follow', '知识点&套路');
        var sys = buildSystemPrompt(session.mode) +
            '\n\n【当前任务：知识点&套路总结】基于刚才讲解的这道题，输出一份复习卡片，严格按以下三段格式，不要重新解题：' +
            '\n【知识点】这道题用到的知识点清单（每个一行，写清名称，必要时一句话点出它在题里的作用）' +
            '\n【题型套路】这类题的通用解题套路（第 1 步…第 2 步…，让学生下次看到同类题就知道往哪想）' +
            '\n【易错点】这道题最容易踩的 1~3 个坑。' +
            '\n除这三个标记外不要输出任何开场白或客套话。';
        var messages = [
            { role: 'system', content: sys },
            { role: 'user', content: '刚才讲解的题目与内容：\n' + collectExplainText().slice(0, 2400) }
        ];
        runStream(messages, view, { maxTokens: 1000 }).then(function (full) {
            session.msgs.push({ kind: 'follow', text: full, followOf: -1, q: '知识点&套路' });
            saveSession();
            appendProfileEntry('【知识卡】' + (session.qText || '图片题').slice(0, 40), full.replace(/[#*`$\\]|\n+/g, ' ').slice(0, 160));
        }).catch(function () { });
    }

    /** 举一反三：生成 1~3 道同类型练习题，不出答案 */
    function doDrill() {
        if (busy) { toast('等当前内容生成完'); return; }
        var view = addMsg('drill');
        var sys = buildSystemPrompt(session.mode) +
            '\n\n【当前任务：举一反三】基于刚才讲解的题目，出 1～3 道同类型、同难度的练习题（可略有梯度）。' +
            '只出题，绝不出答案，也不要给解题过程。每道题单独一段，用「练习1」「练习2」开头。学生做完后会把答案发给你批改。';
        var history = collectExplainText().slice(0, 2400);
        var messages = [
            { role: 'system', content: sys },
            { role: 'user', content: '刚才讲解的题目与内容：\n' + history }
        ];
        runStream(messages, view, { maxTokens: 1200 }).then(function (full) {
            session.msgs.push({ kind: 'drill', text: full });
            // 追加「对答案」入口：学生做完直接把答案打进来
            var ansBtn = el('button', 'lt-btn', icon('ri-checkbox-multiple-line') + ' 我做完了，对答案');
            ansBtn.addEventListener('click', function () {
                try {
                    window.Dlg.prompt({
                        title: '提交我的答案', message: '把你的解答（或最终答案）发给我，我来逐题批改。',
                        placeholder: '练习1：…  练习2：…', okText: '批改'
                    }).then(function (val) {
                        if (!val || !val.trim()) return;
                        gradeDrill(val.trim());
                    });
                } catch (e) {
                    var v = window.prompt('把你的解答发给我批改：');
                    if (v && v.trim()) gradeDrill(v.trim());
                }
            });
            view.root.appendChild(ansBtn);
            saveSession();
        }).catch(function () { });
    }

    /** 批改练习答案 */
    function gradeDrill(answer) {
        var view = addMsg('follow', '批改练习');
        var sys = buildSystemPrompt(MODE_FULL) +
            '\n\n【当前任务：批改】这是学生在「举一反三」练习里提交的解答。逐题批改：对的说对；错的说清错在哪一步、为什么；最后给出正确答案（这里可以给，因为是批改环节）。语气鼓励但不放水。';
        var messages = [
            { role: 'system', content: sys },
            { role: 'user', content: '练习题：\n' + collectExplainText().slice(-1400) },
            { role: 'user', content: '我的解答：\n' + answer }
        ];
        runStream(messages, view, { maxTokens: 1400 }).then(function (full) {
            session.msgs.push({ kind: 'follow', text: full, followOf: -1, q: '批改练习' });
            saveSession();
        }).catch(function () { });
    }

    function collectExplainText() {
        var out = [];
        if (session.qText) out.push('题目：' + session.qText);
        if (session.mode === MODE_STEPS && session.steps.length) {
            session.steps.forEach(function (s, i) {
                if (i < session.revealed) out.push('【第' + (i + 1) + '步】' + s.title + '\n' + s.body);
            });
        }
        (session.msgs || []).forEach(function (m) { if (m.text) out.push(m.text); });
        return out.join('\n\n');
    }

    /* ================= 预习新课 ================= */

    var PREVIEW_PROMPT = [
        '',
        '【当前任务:预习新课】学生还没有学这节课。请忽略上面关于「完整讲解」的格式要求,输出一份预习提纲,按以下结构用 Markdown 小标题书写:',
        '### 一、本节要点(3~5 条,每条一句话)',
        '### 二、前置知识自测(2~3 道小题,只出题,不给答案)',
        '### 三、核心概念(用通俗语言解释,必要时给一个生活中的例子)',
        '### 四、带着问题去听课(2 个预习时可以思考的问题)',
        '如果内容适合用图帮助理解(如函数图像关系、流程、结构、因果链),可以附一段 ```mermaid 代码块作为示意图。不要替学生做前置自测题,也不要做整题讲解。'
    ].join('\n');

    function doPreview() {
        if (busy) { toast('等当前内容生成完'); return; }
        if (!stage) return;
        var go = function (topic) {
            var t = String(topic || '').trim();
            if (!t) return;
            session = newSession();
            session.qText = '【预习新课】' + t;
            session.mode = MODE_FULL;
            session.preview = true;
            saveSession();
            var flow = stage._refs.flow;
            flow.innerHTML = '';
            flow.appendChild(buildQuestionCard());
            runExplain();
        };
        try {
            window.Dlg.prompt({
                title: '预习新课',
                message: '输入即将学的课题或章节(如:勾股定理、细胞呼吸、牛顿第二定律)。老师会给出预习提纲、前置知识自测和预习问题。',
                placeholder: '课题名称', okText: '开始预习'
            }).then(go);
        } catch (e) { go(window.prompt('输入即将学的课题')); }
    }

    /* ================= 错题本 ================= */

    function makeMistake() {
        return {
            id: Date.now() + '_' + Math.random().toString(36).slice(2, 8),
            subject: settings.subject,
            grade: session.gradeDetail || settings.gradeDetail || settings.gradeStage || '其他',
            questionText: session.qText || '',
            questionImage: session.qImage || '',
            userAnswer: '',
            aiExplanation: collectExplainText(),
            createdAt: Date.now(),
            tags: [], starred: false
        };
    }

    function saveToMistakes() {
        if (!session || (!session.qText && !session.qImage)) { toast('还没有题目可收藏'); return; }
        var db = getIdb();
        var rec = makeMistake();
        var finish = function () {
            toast('已加入错题本');
            /* 入库成功立刻同步 localStorage 索引：不能等用户在下面的
               「记录答案」可选流程里填了东西才刷新，否则正常保存
               （点取消/直接关掉）时索引与 IndexedDB 脱节。 */
            refreshIndexFromDb();
            if (window.Dlg) {
                window.Dlg.confirm({ title: '顺便记录一下？', message: '要把你自己的答案 / 卡点也记进这条错题吗？', okText: '记一下' })
                    .then(function (yes) {
                        if (!yes) return;
                        window.Dlg.prompt({ title: '我的答案 / 卡点', message: '写你当时的答案或卡住的地方（复习时会先盖住讲解）', okText: '保存' })
                            .then(function (v) {
                                if (!v) return;
                                rec.userAnswer = v;
                                db.put(STORE_MISTAKES, rec).then(function () { refreshIndexFromDb(); });
                            });
                    });
            }
        };
        if (!db) { toast('浏览器不支持本地数据库，无法保存'); return; }
        db.put(STORE_MISTAKES, rec).then(finish).catch(function () { toast('保存失败：本地存储不可用'); });
    }

    function refreshIndexFromDb() {
        var db = getIdb();
        if (!db) return;
        db.getAll(STORE_MISTAKES).then(function (list) {
            list.sort(function (a, b) { return (b.createdAt || 0) - (a.createdAt || 0); });
            refreshIndex(list);
        }).catch(function () { });
    }

    /** 错题本主界面（全屏 overlay） */
    function openMistakes() {
        ensureStyle();
        var db = getIdb();
        if (!db) { toast('浏览器不支持 IndexedDB'); return; }
        db.getAll(STORE_MISTAKES).then(function (all) {
            all.sort(function (a, b) { return (b.createdAt || 0) - (a.createdAt || 0); });
            renderMistakeBook(all);
        }).catch(function () { toast('错题本读取失败'); });
    }

    function renderMistakeBook(all) {
        var root = el('div', 'lt-book');
        root.id = 'lt-book-root';

        var top = el('div', 'lt-book-top');
        var back = el('button', 'lt-icon-btn', icon('ri-arrow-left-line'));
        back.addEventListener('click', function () { overlayRemove(root); });
        top.appendChild(back);
        top.appendChild(el('h3', null, icon('ri-booklet-line') + ' 错题本（' + all.length + '）'));
        top.appendChild(el('div', 'lt-spacer'));
        var reviewBtn = el('button', 'lt-btn primary', icon('ri-refresh-line') + ' 复习模式');
        reviewBtn.addEventListener('click', function () { startReview(all); });
        top.appendChild(reviewBtn);

        var tools = el('div', 'lt-book-tools');
        var subjSel = el('select', 'lt-sel');
        var subjects = ['全部'].concat(settings.subjects);
        subjSel.innerHTML = subjects.map(function (s) { return '<option value="' + esc(s) + '">' + esc(s) + '</option>'; }).join('');
        var search = el('input', 'lt-search'); search.placeholder = '搜题干 / 标签…';
        var sortSel = el('select', 'lt-sel');
        sortSel.innerHTML = '<option value="new">最新在前</option><option value="old">最早在前</option><option value="star">重点优先</option>';
        var expBtn = el('button', 'lt-btn', icon('ri-download-2-line') + ' 导出');
        var impBtn = el('button', 'lt-btn', icon('ri-upload-2-line') + ' 导入');
        var impFile = el('input'); impFile.type = 'file'; impFile.accept = '.json,application/json'; impFile.style.display = 'none';
        tools.appendChild(subjSel); tools.appendChild(sortSel); tools.appendChild(search);
        tools.appendChild(expBtn); tools.appendChild(impBtn); tools.appendChild(impFile);

        var list = el('div', 'lt-book-list');

        function applyFilter() {
            var kw = (search.value || '').trim().toLowerCase();
            var sub = subjSel.value;
            var arr = all.filter(function (m) {
                if (sub !== '全部' && m.subject !== sub) return false;
                if (!kw) return true;
                var hay = ((m.questionText || '') + ' ' + (m.tags || []).join(' ')).toLowerCase();
                return hay.indexOf(kw) >= 0;
            });
            if (sortSel.value === 'old') arr.sort(function (a, b) { return (a.createdAt || 0) - (b.createdAt || 0); });
            else if (sortSel.value === 'star') arr.sort(function (a, b) { return (b.starred ? 1 : 0) - (a.starred ? 1 : 0) || (b.createdAt || 0) - (a.createdAt || 0); });
            renderList(arr);
        }

        function renderList(arr) {
            list.innerHTML = '';
            if (!arr.length) {
                list.appendChild(el('div', 'lt-book-empty', icon('ri-inbox-line') + '<br>还没有错题。讲完一道题后点「加入错题本」就能存到这里。'));
                return;
            }
            arr.forEach(function (m) { list.appendChild(buildMistakeCard(root, m, applyFilter)); });
        }

        subjSel.addEventListener('change', applyFilter);
        sortSel.addEventListener('change', applyFilter);
        search.addEventListener('input', applyFilter);

        expBtn.addEventListener('click', function () {
            var payload = { app: 'MySW-LearnTutor', version: 1, exportedAt: Date.now(), mistakes: all };
            var blob = new Blob([JSON.stringify(payload, null, 1)], { type: 'application/json' });
            var a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = 'learn-mistakes-' + new Date().toISOString().slice(0, 10) + '.json';
            document.body.appendChild(a); a.click();
            setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 800);
        });
        impBtn.addEventListener('click', function () { impFile.click(); });
        impFile.addEventListener('change', function () {
            var f = impFile.files && impFile.files[0];
            impFile.value = '';
            if (!f) return;
            var fr = new FileReader();
            fr.onload = function () {
                var data = null;
                try { data = JSON.parse(String(fr.result || '')); } catch (e) { toast('文件不是有效的 JSON'); return; }
                var items = data && Array.isArray(data.mistakes) ? data.mistakes : (Array.isArray(data) ? data : null);
                if (!items) { toast('文件里没有错题数据'); return; }
                try {
                    window.Dlg.choice({
                        title: '导入错题（' + items.length + ' 条）',
                        message: '选择导入方式：合并（相同 id 保留本机版本）或覆盖（导入的完全替换本机全部）。',
                        buttons: [
                            { label: '合并导入', value: 'merge' },
                            { label: '覆盖导入', value: 'replace', danger: true }
                        ]
                    }).then(function (v) {
                        if (!v) return;
                        /* 注意：这里必须用 getIdb() 现取连接 —— renderMistakeBook
                           的参数只有 all，openMistakes 里的局部 db 拿不到，
                           直接引用会 ReferenceError 导致导入永远失败。 */
                        var idb = getIdb();
                        if (!idb) { toast('本地存储不可用'); return; }
                        var job = Promise.resolve();
                        if (v === 'replace') {
                            job = idb.getAll(STORE_MISTAKES).then(function (old) {
                                return Promise.all(old.map(function (m) { return idb.del(STORE_MISTAKES, m.id); }));
                            });
                        }
                        job.then(function () {
                            return Promise.all(items.map(function (m) {
                                if (!m || !m.id) return null;
                                return idb.put(STORE_MISTAKES, {
                                    id: String(m.id), subject: m.subject || '其他', grade: m.grade || '其他',
                                    questionText: m.questionText || '', questionImage: m.questionImage || '',
                                    userAnswer: m.userAnswer || '', aiExplanation: m.aiExplanation || '',
                                    createdAt: m.createdAt || Date.now(), tags: Array.isArray(m.tags) ? m.tags : [],
                                    starred: !!m.starred
                                });
                            }));
                        }).then(function () {
                            toast('导入完成');
                            overlayRemove(root);
                            openMistakes();
                        }).catch(function () { toast('导入失败：本地存储不可用'); });
                    });
                } catch (e) {
                    // AppDialogs 不可用时的兜底
                    if (window.confirm('合并导入这些错题？')) {
                        var idb2 = getIdb();
                        if (!idb2) { toast('本地存储不可用'); return; }
                        Promise.all(items.map(function (m) { return m && m.id ? idb2.put(STORE_MISTAKES, m) : null; }))
                            .then(function () { overlayRemove(root); openMistakes(); });
                    }
                }
            };
            fr.readAsText(f);
        });

        root.appendChild(top); root.appendChild(tools); root.appendChild(list);
        document.body.appendChild(root);
        applyFilter();
    }

    function buildMistakeCard(bookRoot, m, onChange) {
        var card = el('div', 'lt-mistake');
        var head = el('div', 'lt-m-head');
        head.appendChild(el('span', 'lt-m-meta', esc(m.subject) + ' · ' + esc(m.grade) + ' · ' + fmtTime(m.createdAt)));
        head.appendChild(el('div', 'lt-spacer'));
        var star = el('button', 'lt-m-star' + (m.starred ? ' on' : ''), icon(m.starred ? 'ri-star-fill' : 'ri-star-line'));
        star.title = '标记重点';
        star.addEventListener('click', function () {
            m.starred = !m.starred;
            getIdb().put(STORE_MISTAKES, m).then(function () { onChange(); refreshIndexFromDb(); });
        });
        head.appendChild(star);
        card.appendChild(head);

        var q = el('div', 'lt-m-q', renderRich(m.questionText || '（图片题）'));
        card.appendChild(q);
        if (m.questionImage) {
            var imgWrap = el('div');
            var im = el('img'); im.src = m.questionImage; im.alt = '题目图';
            imgWrap.appendChild(im);
            var imgDel = el('button', 'lt-btn danger', icon('ri-image-off-line') + ' 只删除这张图');
            imgDel.style.marginTop = '4px';
            imgDel.addEventListener('click', function () {
                try {
                    window.Dlg.confirm({ title: '只删除图片', message: '题干与讲解都保留，只删掉这张图？', okText: '只删图', danger: true })
                        .then(function (yes) {
                            if (!yes) return;
                            m.questionImage = '';
                            getIdb().put(STORE_MISTAKES, m).then(function () { onChange(); refreshIndexFromDb(); });
                        });
                } catch (e) { m.questionImage = ''; getIdb().put(STORE_MISTAKES, m).then(function () { onChange(); }); }
            });
            imgWrap.appendChild(imgDel);
            card.appendChild(imgWrap);
        }
        if (m.userAnswer) {
            card.appendChild(el('div', 'lt-m-meta', '我的答案 / 卡点：' + esc(m.userAnswer)));
        }
        if (m.aiExplanation) {
            var det = el('details');
            det.appendChild(el('summary', null, icon('ri-lightbulb-flash-line') + ' 展开讲解'));
            det.appendChild(el('div', 'lt-m-exp', renderRich(m.aiExplanation)));
            card.appendChild(det);
        }

        var ops = el('div', 'lt-m-ops');
        var addTag = el('button', 'lt-btn', icon('ri-price-tag-3-line') + ' 标签');
        addTag.addEventListener('click', function () {
            try {
                window.Dlg.prompt({ title: '标签', message: '给这道题加个标签（如：二次函数 / 惯性 / 时态），多个用逗号隔开', okText: '保存' })
                    .then(function (v) {
                        if (v == null) return;
                        m.tags = String(v).split(/[,，]/).map(function (s) { return s.trim(); }).filter(Boolean);
                        getIdb().put(STORE_MISTAKES, m).then(function () { onChange(); refreshIndexFromDb(); });
                    });
            } catch (e) { /* 忽略 */ }
        });
        var delOne = el('button', 'lt-btn danger', icon('ri-delete-bin-line') + ' 删除');
        delOne.addEventListener('click', function () {
            try {
                window.Dlg.confirm({ title: '删除这条错题', message: '只删这一条（题目、图片、讲解一起），其他不受影响。确定删？', okText: '删除', danger: true })
                    .then(function (yes) {
                        if (!yes) return;
                        getIdb().del(STORE_MISTAKES, m.id).then(function () {
                            onChange(); refreshIndexFromDb();
                            if (!card.parentNode) return;
                            card.remove();
                        });
                    });
            } catch (e) {
                getIdb().del(STORE_MISTAKES, m.id).then(function () { onChange(); card.remove(); });
            }
        });
        ops.appendChild(addTag); ops.appendChild(delOne);
        card.appendChild(ops);
        return card;
    }

    function fmtTime(ts) {
        try {
            var d = new Date(ts);
            return (d.getMonth() + 1) + '月' + d.getDate() + '日 ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
        } catch (e) { return ''; }
    }

    /* ---- 复习模式：随机抽 N 道，先自己想，想不出再看讲解 ---- */

    function startReview(all) {
        if (!all.length) { toast('错题本是空的，先去刷几道题'); return; }
        try {
            window.Dlg.prompt({
                title: '复习模式', message: '随机抽几道错题来复习？（只显示题干，先自己想，再展开看讲解）',
                placeholder: '默认 5', okText: '开始复习'
            }).then(function (v) {
                var n = parseInt(v, 10);
                if (!isFinite(n) || n <= 0) n = settings.reviewN || 5;
                n = Math.min(n, all.length);
                var pool = all.slice();
                var picked = [];
                while (picked.length < n && pool.length) {
                    picked.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
                }
                renderReview(picked);
            });
        } catch (e) {
            renderReview(all.slice(0, Math.min(5, all.length)));
        }
    }

    function renderReview(picked) {
        var bookRoot = document.getElementById('lt-book-root');
        var list = bookRoot && bookRoot.querySelector('.lt-book-list');
        if (!list) return;
        list.innerHTML = '';
        var head = el('div', 'lt-review-q');
        head.innerHTML = '<b>' + icon('ri-brain-line') + ' 复习模式</b>　随机抽了 ' + picked.length + ' 道。先遮住讲解自己想，实在想不出再展开。';
        /* 复习模式会替换掉列表，必须给一个「退出复习」的出路，
           否则想回列表只能关掉整个错题本再重开。 */
        var exitBtn = el('button', 'lt-btn', icon('ri-arrow-left-line') + ' 退出复习');
        exitBtn.style.marginLeft = '10px';
        exitBtn.addEventListener('click', function () {
            overlayRemove(bookRoot);
            openMistakes();
        });
        head.appendChild(exitBtn);
        list.appendChild(head);
        picked.forEach(function (m) {
            var card = el('div', 'lt-mistake');
            card.appendChild(el('div', 'lt-m-meta', esc(m.subject) + ' · ' + esc(m.grade) + ' · ' + fmtTime(m.createdAt)));
            card.appendChild(el('div', 'lt-m-q', renderRich(m.questionText || '（图片题）')));
            if (m.questionImage) {
                var im = el('img'); im.src = m.questionImage; card.appendChild(im);
            }
            if (m.userAnswer) card.appendChild(el('div', 'lt-m-meta', '当时的卡点：' + esc(m.userAnswer)));
            var det = el('details');
            det.appendChild(el('summary', null, icon('ri-eye-line') + ' 想好了 / 想不出，看讲解'));
            det.appendChild(el('div', 'lt-m-exp', renderRich(m.aiExplanation || '（这条没有讲解内容）')));
            card.appendChild(det);
            list.appendChild(card);
        });
        list.scrollTop = 0;
    }

    /* ================= 老师人设选择 ================= */

    function openPersonaPicker() {
        ensureStyle();
        var old = document.getElementById('lt-persona-root');
        if (old) old.remove();
        var root = el('div', 'lt-persona');
        root.id = 'lt-persona-root';

        var top = el('div', 'lt-book-top');
        var back = el('button', 'lt-icon-btn', icon('ri-arrow-left-line'));
        back.addEventListener('click', function () { overlayRemove(root); });
        top.appendChild(back);
        top.appendChild(el('h3', null, icon('ri-user-heart-line') + ' 老师人设'));
        root.appendChild(top);

        var list = el('div', 'lt-persona-list');
        TUTOR_PERSONAS.forEach(function (p) {
            var card = el('div', 'lt-persona-card' + (p.id === settings.personaId ? ' active' : ''));
            var head = el('div', 'lt-persona-head',
                '<i class="' + (p.icon || 'ri-user-line') + '"></i> <b>' + esc(p.name) + '</b>' +
                (p.id === settings.personaId ? ' <span class="lt-persona-on">' + icon('ri-check-line') + ' 当前</span>' : ''));
            card.appendChild(head);
            if (p.desc) card.appendChild(el('div', 'lt-persona-desc', esc(p.desc)));
            if (p.id === 'custom') card.appendChild(el('div', 'lt-persona-desc', settings.personaName ? ('当前：' + esc(settings.personaName) + (settings.personaDesc ? ' —— ' + esc(settings.personaDesc).slice(0, 60) : '')) : '还没写过，点下面直接编一个'));
            card.addEventListener('click', function () {
                settings.personaId = p.id; saveSettings();
                if (p.id === 'custom') {
                    editCustomPersona(function () { overlayRemove(root); });
                } else {
                    overlayRemove(root);
                    toast('人设已切换：' + p.name + '（下一轮回复生效）');
                }
            });
            list.appendChild(card);
        });
        root.appendChild(list);

        /* 站内角色：拿已有的角色（内置 + 自定义，和论坛同一份名单）当老师。
           选谁，老师就用谁的名字和性格讲课；教学铁律仍然优先于人设。 */
        var chars = allSiteCharacters();
        if (chars.length) {
            var charHead = el('div', 'lt-persona-sec-head', icon('ri-robot-2-line') + ' 用站内角色当老师（和论坛一样，自定义角色也可以）');
            root.appendChild(charHead);
            var charList = el('div', 'lt-persona-list');
            chars.forEach(function (c) {
                var active = settings.personaId === 'char' && settings.personaCharId === c.id;
                var card = el('div', 'lt-persona-card' + (active ? ' active' : ''));
                var headHtml = '<b>' + esc(c.name) + '</b>' + (active ? ' <span class="lt-persona-on">' + icon('ri-check-line') + ' 当前</span>' : '');
                if (c.avatar) {
                    var av = el('img', 'lt-persona-avatar'); av.src = c.avatar; av.alt = '';
                    var wrap = el('div', 'lt-persona-head');
                    wrap.appendChild(av);
                    var txt = el('span'); txt.innerHTML = headHtml;
                    wrap.appendChild(txt);
                    card.appendChild(wrap);
                } else {
                    card.appendChild(el('div', 'lt-persona-head', '<i class="ri-user-smile-line"></i> ' + headHtml));
                }
                if (!c.prompt) card.appendChild(el('div', 'lt-persona-desc', '这个角色没写人设描述，当老师时只会用它的名字'));
                card.addEventListener('click', function () {
                    settings.personaId = 'char';
                    settings.personaCharId = c.id;
                    saveSettings();
                    overlayRemove(root);
                    toast('老师人设已切换：「' + c.name + '」（下一轮回复生效）');
                });
                charList.appendChild(card);
            });
            root.appendChild(charList);

            /* 分片预加载：内置角色的人设按需下载，第一次打开选人面板时分片多半还没加载
               （显示「没写人设描述」是假象）。这里异步把分片拉回来并就地重画列表。 */
            if (window.CharacterPacks && typeof window.CharacterPacks.ensure === 'function') {
                var pending = chars.filter(function (c) {
                    return !c.prompt && window.CharacterPacks.packOf && window.CharacterPacks.packOf(c.id);
                });
                pending.slice(0, 12).forEach(function (c) {
                    window.CharacterPacks.ensure(c.id).then(function () {
                        var fresh = findSiteCharacter(c.id);
                        if (!fresh || !fresh.prompt) return;
                        var live = document.getElementById('lt-persona-root');
                        if (!live) return;   // 面板已关掉就不折腾
                        openPersonaPicker(); // 重画（会读到已回填的 prompt）
                    }).catch(function () { });
                });
            }
        }

        /* 世界书注入开关（人格化的一部分：给老师一套世界观背景） */
        var wbRow = el('div', 'lt-persona-wb');
        var wbCb = el('input'); wbCb.type = 'checkbox'; wbCb.id = 'lt-wb-cb';
        wbCb.checked = !!settings.useWorldbook;
        var wbLabel = el('label', null, '');
        wbLabel.appendChild(wbCb);
        wbLabel.appendChild(document.createTextNode(' 注入「全局」世界书（老师的世界观背景；只在命中关键词或蓝灯常驻时生效，最多 3000 字）'));
        wbRow.appendChild(wbLabel);
        wbCb.addEventListener('change', function () {
            settings.useWorldbook = wbCb.checked; saveSettings();
            toast(wbCb.checked ? '世界书已启用（下一轮讲解生效）' : '世界书已关闭');
        });
        root.appendChild(wbRow);

        document.body.appendChild(root);
    }

    function editCustomPersona(after) {
        var old = document.getElementById('lt-persona-edit');
        if (old) old.remove();
        var ed = el('div', 'lt-persona-edit');
        ed.id = 'lt-persona-edit';
        ed.innerHTML =
            '<h4>' + icon('ri-quill-pen-line') + ' 自定义老师人设</h4>' +
            '<input id="lt-persona-name" type="text" maxlength="30" placeholder="老师的名字（如：王老师 / 星星学姐）">' +
            '<textarea id="lt-persona-desc" maxlength="500" placeholder="说话风格、称呼、口头禅…（如：说话带点四川口音，爱叫我「同学」，喜欢用火锅打比方）"></textarea>' +
            '<div class="lt-persona-edit-btns">' +
            '<button class="lt-btn" id="lt-persona-cancel" type="button">取消</button>' +
            '<button class="lt-btn primary" id="lt-persona-save" type="button">保存</button>' +
            '</div>';
        document.body.appendChild(ed);
        var nameInput = ed.querySelector('#lt-persona-name');
        var descInput = ed.querySelector('#lt-persona-desc');
        nameInput.value = settings.personaName || '';
        descInput.value = settings.personaDesc || '';
        ed.querySelector('#lt-persona-cancel').addEventListener('click', function () { overlayRemove(ed); });
        ed.querySelector('#lt-persona-save').addEventListener('click', function () {
            settings.personaName = nameInput.value.trim();
            settings.personaDesc = descInput.value.trim();
            if (!settings.personaName && !settings.personaDesc) { toast('名字和风格至少写一个'); return; }
            settings.personaId = 'custom'; saveSettings();
            overlayRemove(ed);
            if (typeof after === 'function') after();
            else toast('自定义人设已保存（下一轮回复生效）');
        });
    }

    /* ================= 学习档案界面 ================= */

    function openProfile() {
        ensureStyle();
        var db = getIdb();
        if (!db) { toast('浏览器不支持 IndexedDB'); return; }
        getProfile().then(function (p) { renderProfile(p); });
    }

    function renderProfile(p) {
        var root = el('div', 'lt-book');
        root.id = 'lt-profile-root';

        var top = el('div', 'lt-book-top');
        var back = el('button', 'lt-icon-btn', icon('ri-arrow-left-line'));
        back.addEventListener('click', function () { overlayRemove(root); });
        top.appendChild(back);
        top.appendChild(el('h3', null, icon('ri-file-user-line') + ' 学习档案'));
        top.appendChild(el('div', 'lt-spacer'));
        if (p.entries.length) {
            var clrBtn = el('button', 'lt-btn danger', icon('ri-delete-bin-line') + ' 清空记录');
            clrBtn.addEventListener('click', function () {
                try {
                    window.Dlg.confirm({ title: '清空学习档案', message: '全部学习记录会被删掉（错题本不受影响），老师的「记忆」也会归零。确定清空？', okText: '清空', danger: true })
                        .then(function (yes) {
                            if (!yes) return;
                            p.entries = []; saveProfile();
                            overlayRemove(root); openProfile();
                        });
                } catch (e) {
                    p.entries = []; saveProfile(); overlayRemove(root); openProfile();
                }
            });
            top.appendChild(clrBtn);
        }
        root.appendChild(top);

        var wrap = el('div', 'lt-profile-body');
        wrap.appendChild(el('div', 'lt-panel-hint',
            '老师会记住你讲过的每一道题（本机存储，不上传）。下次讲解时自动带上这些记忆——再遇到相近的题，老师会主动联系「上次我们讲过什么」。下面这一栏是你自己写的目标 / 弱点，老师每次都会看到。'));

        var noteLabel = el('div', 'lt-profile-note-label', icon('ri-edit-2-line') + ' 我的目标 / 弱点（老师每次讲解都会参考）');
        var noteTa = el('textarea', 'lt-profile-note');
        noteTa.rows = 3;
        noteTa.placeholder = '例如：这学期目标是数学上 110；一元二次方程总是忘记检验；英语听力弱…';
        noteTa.value = p.note || '';
        var saveNote = el('button', 'lt-btn primary', icon('ri-save-line') + ' 保存备注');
        saveNote.addEventListener('click', function () {
            p.note = noteTa.value.trim();
            saveProfile();
            toast('已保存，下一轮讲解开始生效');
        });
        wrap.appendChild(noteLabel);
        wrap.appendChild(noteTa);
        wrap.appendChild(saveNote);

        var listTitle = el('div', 'lt-profile-note-label', icon('ri-history-line') + ' 学习记录（' + p.entries.length + '，最新在前）');
        wrap.appendChild(listTitle);
        var list = el('div', 'lt-profile-list');
        if (!p.entries.length) {
            list.appendChild(el('div', 'lt-book-empty', icon('ri-inbox-line') + '<br>还没有记录。讲完一道题后这里会自动多一笔。'));
        } else {
            p.entries.slice().reverse().forEach(function (e) {
                var item = el('div', 'lt-profile-item');
                item.appendChild(el('div', 'lt-m-meta', esc(e.subject || '?') + ' · ' + esc(e.stage || '?') + ' · ' + fmtTime(e.ts)));
                item.appendChild(el('div', 'lt-profile-title', esc(e.title || '')));
                if (e.brief) item.appendChild(el('div', 'lt-profile-brief', esc(e.brief)));
                list.appendChild(item);
            });
        }
        wrap.appendChild(list);

        root.appendChild(wrap);
        document.body.appendChild(root);
    }

    /* ================= 打开 / 关闭 ================= */

    function open() {
        if (isOpen()) return;
        ensureStyle();
        getProfile();   // 学习档案预热：讲解完成写入 / system prompt 注入都依赖它
        if (!session) {
            var db = getIdb();
            session = newSession();
            if (db) {
                // 先渲染，再异步尝试恢复上次会话
                stage = buildStage();
                document.body.appendChild(stage);
                renderEmpty();
                db.get(STORE_SESSION, SESSION_KEY).then(function (saved) {
                    if (!saved || isOpenRestoreCandidate(saved) === false) return;
                    try {
                        window.Dlg.confirm({
                            title: '继续上次的题？',
                            message: '检测到一次没讲完的辅导（' + esc(saved.subject) + ' · ' + esc(saved.grade) + '）。要接着上次继续吗？',
                            okText: '继续'
                        }).then(function (yes) {
                            if (!yes) { clearSession(); session = newSession(); saveSession(); renderEmpty(); return; }
                            session = saved;
                            var s = document.getElementById('lt-subject');
                            var g = document.getElementById('lt-grade');
                            if (s) s.value = session.subject;
                            if (g) g.value = session.grade || settings.gradeStage;
                            fillDetailSel();
                            restoreSessionUI();
                        });
                    } catch (e) { /* 恢复失败按新会话 */ }
                }).catch(function () { });
                return;
            }
        }
        stage = buildStage();
        document.body.appendChild(stage);
        restoreSessionUI();
    }

    function isOpenRestoreCandidate(saved) {
        return !!(saved && (saved.qText || saved.qImage || (saved.msgs && saved.msgs.length)));
    }

    function restoreSessionUI() {
        var flow = stage._refs.flow;
        flow.innerHTML = '';
        if (!session) { session = newSession(); }
        if (!session.qText && !session.qImage && !(session.msgs || []).length && !(session.steps || []).length) {
            renderEmpty();
            return;
        }
        flow.appendChild(buildQuestionCard());
        function replayMsgs(skipStepExplain) {
            (session.msgs || []).forEach(function (m) {
                /* 分步讲解的原始长文只是步骤卡的「草稿」，正常界面里是
                   隐藏的（runExplain 中 display='none'）——恢复时同样跳过，
                   否则用户会看到一整段模型原文 + 下面又一份步骤卡。
                   完整 / 引导式的历史回复不受影响，照常显示。 */
                if (skipStepExplain && m.kind === 'explain' && m.mode === 'steps') return;
                /* 聊天消息：学生发的话恢复成右侧金色气泡，跟直播时一致 */
                if (m.kind === 'user') { addUserMsg(m.text || '', ''); return; }
                var v = addMsg(m.kind === 'drill' ? 'drill' : m.kind === 'follow' ? 'follow' : 'explain', m.followOf >= 0 ? '第' + (m.followOf + 1) + '步' : (m.q || ''));
                v.root.classList.remove('streaming');
                v.body.innerHTML = renderRich(m.text || '');
                renderDiagramsIn(v.body);
            });
        }
        if (session.steps && session.steps.length) {
            /* 先步骤卡，再追问 / 举一反三消息，最后操作行 —— 和原始交互顺序一致。
               addAfterActions 自带幂等清理，renderSteps 全展开时补的那份会被清掉，
               恢复后永远只有一排按钮。 */
            renderSteps(false);
            replayMsgs(true);
            addAfterActions();
        } else {
            replayMsgs(false);
            /* 完整 / 引导式会话恢复后同样要有「举一反三 / 加入错题本」：
               有题目、有讲解历史就补上操作行 —— 否则用户想存错题时
               找不到入口（和分步恢复路径保持一致）。 */
            if ((session.qText || session.qImage) && (session.msgs || []).length) addAfterActions();
        }
        flow.scrollTop = flow.scrollHeight;
    }

    /* ================= 语音 / 视频通话（复用声音工坊 VoiceLab） ================= */

    /** 老师的显示名 / 头像（按当前人设：站内角色 → 自定义 → 内置） */
    function tutorPersonaInfo() {
        if (settings.personaId === 'char') {
            var c = findSiteCharacter(settings.personaCharId);
            if (c) return { name: c.name, avatar: c.avatar || '' };
        }
        if (settings.personaId === 'custom') {
            var n = (settings.personaName || '').trim();
            if (n) return { name: n, avatar: '' };
        }
        for (var i = 0; i < TUTOR_PERSONAS.length; i++) {
            if (TUTOR_PERSONAS[i].id === settings.personaId) {
                return { name: TUTOR_PERSONAS[i].name || '老师', avatar: '' };
            }
        }
        return { name: '老师', avatar: '' };
    }

    /** 通话期间挂桥：人设用「老师」，聊天内容写回辅导对话流。
        通话结束 / 离开辅导界面时摘掉，普通聊天的通话不受影响。 */
    function installTutorCallBridge() {
        if (!window.VoiceLabBridge) window.VoiceLabBridge = {};
        var info = tutorPersonaInfo();
        var mode = session ? session.mode : settings.mode;
        window.VoiceLabBridge.getCallFriend = function () {
            return {
                id: '__tutor__',
                name: info.name,
                avatar: info.avatar,
                systemPrompt: buildSystemPrompt(mode) +
                    '\n\n【当前是通话场景】你们正在打电话（可能开了视频）。像真人老师一样口语化地说，一段只讲一个点，别一次灌完整个解题过程——说完就停下来听学生接话。开视频时学生会把摄像头对着题目，你可以直接点评看到的画面。'
            };
        };
        window.VoiceLabBridge.appendCallMessage = function (role, content) {
            try {
                if (!stage || !stage._refs) return;
                var text = String(content || '');
                if (!text.trim()) return;
                if (role === 'mine') {
                    addUserMsg(text, '');
                } else {
                    var m = el('div', 'lt-msg');
                    m.appendChild(el('div', 'lt-msg-head', icon('ri-phone-fill') + ' 通话'));
                    m.appendChild(el('div', 'lt-msg-body', renderRich(text)));
                    stage._refs.flow.appendChild(m);
                    scrollFlowBottom(true);
                }
                if (session) {
                    session.msgs.push({ kind: role === 'mine' ? 'user' : 'explain', text: text, fromCall: true });
                    saveSession();
                }
            } catch (e) { /* 写回失败不影响通话 */ }
        };
        window.VoiceLabBridge.recentCallMessages = function (count) {
            var out = [];
            try {
                if (session && Array.isArray(session.msgs)) {
                    session.msgs.slice(-(Math.max(1, parseInt(count, 10) || 6))).forEach(function (m) {
                        if (m && m.text) out.push({ role: m.kind === 'user' ? 'mine' : 'other', content: m.text });
                    });
                }
            } catch (e) { /* 忽略 */ }
            return out;
        };
    }
    function uninstallTutorCallBridge() {
        try {
            if (window.VoiceLabBridge) {
                delete window.VoiceLabBridge.getCallFriend;
                delete window.VoiceLabBridge.appendCallMessage;
                delete window.VoiceLabBridge.recentCallMessages;
            }
        } catch (e) { /* 忽略 */ }
    }

    function startTutorCall(video) {
        if (!window.VoiceLab || typeof window.VoiceLab.open !== 'function') {
            toast('通话模块（声音工坊）没有加载，去「设置 → 实验室」看看它是否被关掉了');
            return;
        }
        if (window.VoiceLab.isActive && window.VoiceLab.isActive()) {
            toast('已经在通话中了'); return;
        }
        installTutorCallBridge();
        var p = window.VoiceLab.open(video ? { video: true } : {});
        if (p && typeof p.catch === 'function') {
            p.catch(function () { uninstallTutorCallBridge(); });
        }
    }

    function close() {
        if (stage && stage.parentNode) stage.parentNode.removeChild(stage);
        stage = null;
        if (ctl) { try { ctl.abort(); } catch (e) { } }
        // 通话还开着就不摘桥：挂断后写回仍能落进辅导记录；下次打开辅导界面会重挂
        if (!(window.VoiceLab && window.VoiceLab.isActive && window.VoiceLab.isActive())) {
            uninstallTutorCallBridge();
        }
        // 会话保留在 IndexedDB：下次打开会提示继续
    }

    /* ================= 实验室面板（设置 → 实验室） ================= */

    function mountPanel() {
        var tab = document.getElementById('tab-laboratory');
        if (!tab || document.getElementById('lt-call-panel')) return false;
        var p = document.createElement('div');
        p.className = 'form-group laboratory-panel';
        p.id = 'lt-call-panel';
        p.innerHTML = [
            '<h3 style="margin-bottom:10px;color:#e6c78a;">' + icon('ri-graduation-cap-line') + ' 学习辅导</h3>',
            '<p class="lt-panel-hint">拍题讲解的「辅导老师」：默认<b>引导式</b>（不给答案，先问你卡在哪），另有分步讲解与完整讲解。讲题过程可以直接在输入框<b>继续追问</b>（聊天式多轮对话）；讲完可一键总结<b>知识点&套路</b>、做过的题收进<b>错题本</b>。老师的人设可换（还有猫娘老师喵），讲过的题会自动记进<b>学习档案</b>，越用越懂你。只存本机，可导出 JSON 备份。</p>',
            '<div class="lt-panel-btns">',
                '<button class="btn btn-primary" type="button" id="lt-open-btn"><i class="ri-play-circle-line"></i> 打开学习辅导</button>',
                '<button class="btn btn-outline" type="button" id="lt-book-btn"><i class="ri-booklet-line"></i> 错题本</button>',
                '<button class="btn btn-outline" type="button" id="lt-profile-btn"><i class="ri-file-user-line"></i> 学习档案</button>',
                '<button class="btn btn-outline" type="button" id="lt-persona-btn"><i class="ri-user-heart-line"></i> 老师人设</button>',
            '</div>',
            '<div class="lt-subj-manage">',
                '<label class="lt-subj-label">我的科目（点 × 删除，回车添加；学段与具体年级在界面顶部切换）</label>',
                '<div class="lt-subj-chips" id="lt-subject-chips"></div>',
                '<input type="text" class="lt-subj-add" id="lt-subject-add" placeholder="添加科目，回车确认">',
            '</div>'
        ].join('');
        tab.appendChild(p);

        function renderChips() {
            var box = p.querySelector('#lt-subject-chips');
            box.innerHTML = settings.subjects.map(function (s, i) {
                return '<button type="button" class="lt-chip' + (s === settings.subject ? ' active' : '') + '" data-i="' + i + '">' + esc(s) +
                    '<span class="lt-chip-x" data-del="' + i + '" title="删除该科目">×</span></button>';
            }).join('');
            box.querySelectorAll('.lt-chip').forEach(function (chip) {
                chip.addEventListener('click', function (ev) {
                    var delIdx = ev.target && ev.target.dataset ? ev.target.dataset.del : null;
                    if (delIdx != null && ev.target.classList.contains('lt-chip-x')) {
                        var i = parseInt(delIdx, 10);
                        var name = settings.subjects[i];
                        try {
                            window.Dlg.confirm({ title: '删除科目', message: '删除「' + name + '」？（只影响选择列表，不影响已存错题）', okText: '删除' })
                                .then(function (yes) {
                                    if (!yes) return;
                                    settings.subjects.splice(i, 1);
                                    if (settings.subject === name) settings.subject = settings.subjects[0] || '其他';
                                    saveSettings(); renderChips();
                                });
                        } catch (e) {
                            settings.subjects.splice(i, 1); saveSettings(); renderChips();
                        }
                        return;
                    }
                    settings.subject = settings.subjects[parseInt(chip.dataset.i, 10)];
                    saveSettings(); renderChips();
                });
            });
        }
        renderChips();

        p.querySelector('#lt-subject-add').addEventListener('keydown', function (ev) {
            if (ev.key !== 'Enter') return;
            var v = (ev.target.value || '').trim();
            if (!v) return;
            if (settings.subjects.indexOf(v) >= 0) { toast('已有这个科目'); return; }
            settings.subjects.push(v);
            saveSettings();
            ev.target.value = '';
            renderChips();
        });

        p.querySelector('#lt-open-btn').addEventListener('click', function () { open(); });
        p.querySelector('#lt-book-btn').addEventListener('click', function () { openMistakes(); });
        p.querySelector('#lt-profile-btn').addEventListener('click', function () { openProfile(); });
        p.querySelector('#lt-persona-btn').addEventListener('click', function () { openPersonaPicker(); });
        return true;
    }

    /* ================= 启动挂载 ================= */

    function tryMount(times) {
        if (mountPanel()) return;
        if (times > 40) return;
        setTimeout(function () { tryMount(times + 1); }, 500);
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { tryMount(1); });
    else tryMount(1);

    /* ================= 对外接口 ================= */

    window.LearnTutor = {
        open: open,
        close: close,
        isOpen: isOpen,
        mountPanel: mountPanel,
        openMistakes: openMistakes,
        openProfile: openProfile,
        openPersonaPicker: openPersonaPicker,
        getSettings: function () { return settings; },
        getSession: function () { return session }
    };
})();
