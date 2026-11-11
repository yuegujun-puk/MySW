/**
 * undercover.js —— 实验室 ·「谁是卧底」
 * ------------------------------------------------------------------
 * 玩法（线下那套，一字不改搬进来）：
 *   1. 每人发一张词牌。绝大多数人拿到的是同一个词（平民），
 *      有 1~2 个人拿到的是另一个近义词（卧底），但没人知道自己是哪一种。
 *   2. 每轮按随机顺序，每人用一句话描述自己的词 —— 不能说出词里的字，
 *      太直白会被卧底抄走，太含糊会被当成卧底投出去。
 *   3. 一轮说完投票，票最多的人出局，身份当场公开。
 *   4. 卧底全部出局 → 平民胜；卧底活到「剩下的平民不比卧底多」→ 卧底胜。
 *
 * 这里做的取舍：
 *   · 玩家 = 你 + AI 角色（可以是当前群聊的成员，也可以自己挑人）。
 *   · 发牌有翻牌动画，牌固定贴在右上角，随时点一下可以再看一眼。
 *   · 界面按视觉小说（VN）的规矩来：舞台 + 立绘位 + 底部对话框 + 打字机。
 *   · AI 只知道自己那个词，不知道自己是平民还是卧底 —— 和真人局一样，
 *     所以它会真的按词去描述，卧底会露馅也会蒙混。
 *   · 一条消息都不进聊天记录：这是独立的一个小游戏，只在 localStorage
 *     存一份对局快照，刷新/退出还能接着玩。
 *   · API 挂了也能玩：发言与投票都有本地兜底，不会卡在「正在思考」。
 */
(function () {
    'use strict';

    if (window.Undercover) return;   // 重复引入直接退出

    /* 功能开关：被关掉时连样式都不注入 */
    function moduleEnabled() {
        try {
            if (window.ScriptLoader && typeof ScriptLoader.isEnabled === 'function') {
                return ScriptLoader.isEnabled('undercover.js');
            }
            var raw = localStorage.getItem('scriptLoadSettings');
            var s = raw ? JSON.parse(raw) : {};
            return !(s && s['undercover.js'] === false);
        } catch (e) { return true; }
    }
    if (!moduleEnabled()) return;

    /* ================= 词库 =================
       每对都是「意思贴近、又不能互相替换」的两个词。
       每次开局随机决定哪个当平民词、哪个当卧底词，不写死。 */
    /* 每对词都带一个类别标签：AI 掉线时用的兜底台词要按类别挑，
       否则五个人可能说出五句一模一样的废话，这一局就没法推理了。 */
    var WORD_PAIRS = [
        ['豆浆', '豆奶', 'drink'], ['可乐', '雪碧', 'drink'], ['咖啡', '奶茶', 'drink'],
        ['牛奶', '酸奶', 'drink'],
        ['包子', '馒头', 'food'], ['饺子', '馄饨', 'food'], ['面条', '米粉', 'food'],
        ['米饭', '稀粥', 'food'], ['火锅', '烧烤', 'food'], ['蛋糕', '面包', 'food'],
        ['薯条', '薯片', 'food'], ['冰淇淋', '雪糕', 'food'], ['巧克力', '糖果', 'food'],
        ['鸡蛋', '鸭蛋', 'food'], ['油条', '麻花', 'food'], ['汤圆', '元宵', 'food'],
        ['汉堡', '三明治', 'food'], ['饼干', '威化', 'food'],
        ['西瓜', '哈密瓜', 'fruit'], ['草莓', '樱桃', 'fruit'], ['香蕉', '芒果', 'fruit'],
        ['番茄', '柿子', 'veg'], ['土豆', '红薯', 'veg'], ['白菜', '生菜', 'veg'],
        ['铅笔', '钢笔', 'stationery'], ['橡皮', '涂改液', 'stationery'],
        ['书包', '背包', 'apparel'], ['眼镜', '墨镜', 'apparel'], ['手表', '手环', 'apparel'],
        ['拖鞋', '凉鞋', 'apparel'], ['围巾', '披肩', 'apparel'], ['帽子', '头盔', 'apparel'],
        ['沙发', '床垫', 'home'], ['枕头', '抱枕', 'home'], ['被子', '毛毯', 'home'],
        ['窗帘', '百叶窗', 'home'], ['地毯', '地垫', 'home'], ['台灯', '吊灯', 'home'],
        ['镜子', '玻璃', 'home'], ['花瓶', '鱼缸', 'home'], ['冰箱', '冰柜', 'home'],
        ['微波炉', '烤箱', 'home'], ['电风扇', '空调', 'home'], ['洗衣机', '洗碗机', 'home'],
        ['阳台', '窗户', 'home'], ['院子', '天台', 'home'],
        ['剪刀', '菜刀', 'tool'],
        ['梳子', '刷子', 'daily'], ['毛巾', '浴巾', 'daily'], ['香皂', '沐浴露', 'daily'],
        ['牙膏', '牙刷', 'daily'], ['雨伞', '雨衣', 'daily'],
        ['手机', '平板', 'digital'], ['耳机', '音响', 'digital'], ['键盘', '鼠标', 'digital'],
        ['微信', 'QQ', 'app'], ['抖音', '快手', 'app'], ['淘宝', '京东', 'app'],
        ['外卖', '快递', 'service'],
        ['地铁', '公交', 'transport'], ['自行车', '电动车', 'transport'],
        ['飞机', '高铁', 'transport'], ['轮船', '帆船', 'transport'], ['电梯', '楼梯', 'transport'],
        ['电影院', '剧院', 'place'], ['图书馆', '书店', 'place'], ['医院', '药店', 'place'],
        ['学校', '幼儿园', 'place'], ['理发店', '美容院', 'place'], ['健身房', '游泳馆', 'place'],
        ['超市', '便利店', 'place'], ['银行', '邮局', 'place'],
        ['警察', '保安', 'job'], ['医生', '护士', 'job'], ['老师', '教授', 'job'],
        ['歌手', '演员', 'job'], ['画家', '摄影师', 'job'], ['程序员', '设计师', 'job'],
        ['主播', '网红', 'job'], ['记者', '编辑', 'job'],
        ['猫', '老虎', 'animal'], ['狗', '狼', 'animal'], ['兔子', '仓鼠', 'animal'],
        ['蝴蝶', '蜜蜂', 'animal'], ['金鱼', '锦鲤', 'animal'], ['大象', '犀牛', 'animal'],
        ['长颈鹿', '斑马', 'animal'], ['企鹅', '海豹', 'animal'],
        ['篮球', '足球', 'sport'], ['羽毛球', '乒乓球', 'sport'], ['象棋', '围棋', 'sport'],
        ['麻将', '扑克', 'sport'], ['跑步', '散步', 'sport'], ['游泳', '潜水', 'sport'],
        ['滑雪', '滑冰', 'sport'], ['登山', '徒步', 'sport'],
        ['小说', '漫画', 'media'], ['电视剧', '电影', 'media'], ['动画片', '纪录片', 'media'],
        ['话剧', '相声', 'media'], ['演唱会', '音乐节', 'media'],
        ['红包', '礼物', 'custom'], ['春节', '中秋', 'custom'], ['生日', '纪念日', 'custom']
    ];

    var SAVE_KEY = 'myswUndercover_v1';
    var MIN_AI = 3;                 // 除你之外至少 3 个 AI（4 人才能玩）
    var MAX_AI = 9;                 // 上限 10 人，再多舞台放不下
    var TALK_DELAY = 1100;          // 每个 AI 说完到下一个发言的间隔
    var TYPE_SPEED = 26;            // 打字机每字毫秒

    var state = null;               // 当前对局
    var runToken = 0;               // 换局/退出时作废进行中的异步流程
    var root = null;                // 根节点
    var els = {};                   // 常用节点缓存
    var pendingLine = null;         // 轮到我发言时的 resolve
    var pendingVote = null;         // 轮到我投票时的 resolve

    /* ================= 小工具 ================= */
    function esc(v) {
        return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }
    function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
    function shuffle(arr) {
        var a = arr.slice();
        for (var i = a.length - 1; i > 0; i--) {
            var j = Math.floor(Math.random() * (i + 1));
            var t = a[i]; a[i] = a[j]; a[j] = t;
        }
        return a;
    }
    function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
    function toast(msg, icon) {
        if (typeof window.showToast === 'function') window.showToast(msg, icon || 'ri-information-line');
    }
    /* 主站里的 friendsData / groupManager / myUserName 是顶层 let（不是 window 属性），
       只能用裸标识符 + typeof 兜底访问；写成 window.friendsData 会永远是 undefined。 */
    function friendsMap() {
        try { return (typeof friendsData !== 'undefined' && friendsData) ? friendsData : {}; }
        catch (e) { return {}; }
    }
    function groupsMap() {
        try { return (typeof groupManager !== 'undefined' && groupManager) ? groupManager : {}; }
        catch (e) { return {}; }
    }
    function currentFriend() {
        try { return (typeof currentFriendId !== 'undefined' && currentFriendId) ? String(currentFriendId) : ''; }
        catch (e) { return ''; }
    }
    function myNameSafe() {
        try { return (typeof myUserName !== 'undefined' && myUserName) ? String(myUserName) : ''; }
        catch (e) { return ''; }
    }

    function apiSettings() {
        try {
            if (typeof window.getMainApiSettings === 'function') return window.getMainApiSettings();
        } catch (e) { }
        try { return JSON.parse(localStorage.getItem('aiChatSettings') || '{}') || {}; }
        catch (e) { return {}; }
    }
    function hasApi() {
        var s = apiSettings();
        return Boolean(s && s.apiUrl && s.apiKey);
    }

    /* 一次小任务调用：超时/失败都返回空串，调用方自己兜底。
       不让任何一个 AI 的请求把整局卡死。 */
    /* 连续失败计数：接到一个坏端点时，若每个 AI 都老老实实等 16 秒
       再退兜底，一轮就能拖掉一分半钟 —— 体感就是「卡死」。
       连续三次拿不到东西，这一局后面直接走本地台词，不再白等。 */
    var aiFailStreak = 0;
    var toldOffline = false;

    function askAi(system, user, maxTokens) {
        var s = apiSettings();
        if (!s || !s.apiUrl || !window.ApiModule || typeof ApiModule.requestSmallTask !== 'function') {
            return Promise.resolve('');
        }
        if (aiFailStreak >= 3) return Promise.resolve('');
        var task = ApiModule.requestSmallTask(s, system, user, {
            maxTokens: maxTokens || 200,
            temperature: 0.85,
            label: '谁是卧底'
        }).catch(function () { return ''; });
        var timeout = new Promise(function (r) { setTimeout(function () { r(''); }, 16000); });
        return Promise.race([task, timeout]).then(function (v) {
            var out = String(v == null ? '' : v).trim();
            if (out) {
                aiFailStreak = 0;
                toldOffline = false;
            } else {
                aiFailStreak += 1;
                if (aiFailStreak >= 3 && !toldOffline) {
                    toldOffline = true;
                    toast('模型一直没接上，这局先用本地台词顶着', 'ri-wifi-off-line');
                }
            }
            return out;
        });
    }

    /* ================= 样式 ================= */
    var STYLE_ID = 'mysw-undercover-style';
    function injectStyle() {
        if (document.getElementById(STYLE_ID)) return;
        var css = [
/* ---------- 舞台骨架 ---------- */
'.uc-root{position:fixed;inset:0;z-index:9400;display:flex;flex-direction:column;background:#0b0d12;color:#e8eaf0;font-family:inherit;overflow:hidden;opacity:0;transition:opacity .22s ease;}',
'.uc-root.show{opacity:1;}',
'.uc-bg{position:absolute;inset:0;background-image:radial-gradient(1000px 640px at 50% 8%,rgba(230,199,138,.13),transparent 62%),radial-gradient(760px 520px at 12% 96%,rgba(120,160,255,.09),transparent 68%),radial-gradient(700px 480px at 88% 88%,rgba(255,140,120,.07),transparent 70%);pointer-events:none;}',
'.uc-vignette{position:absolute;inset:0;background:radial-gradient(ellipse at 50% 40%,transparent 40%,rgba(0,0,0,.55) 100%);pointer-events:none;}',
'.uc-top{position:relative;z-index:5;display:flex;align-items:center;gap:10px;padding:14px 18px;}',
'.uc-top .uc-title{font-weight:700;letter-spacing:.02em;display:flex;align-items:center;gap:8px;font-size:1rem;flex:0 0 auto;white-space:nowrap;}',
'.uc-top .uc-title i{color:#e6c78a;}',
'.uc-round{margin-left:4px;font-size:.82rem;color:#9aa1ad;border:1px solid rgba(255,255,255,.12);border-radius:20px;padding:2px 10px;}',
'.uc-spacer{flex:1 1 auto;}',
'.uc-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;height:34px;padding:0 14px;border-radius:10px;border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.05);color:#dfe3ea;font:inherit;font-size:.86rem;cursor:pointer;transition:background .16s ease,border-color .16s ease,transform .12s ease;}',
'.uc-btn:hover{background:rgba(255,255,255,.1);}',
'.uc-btn:active{transform:scale(.97);}',
'.uc-btn.primary{background:linear-gradient(160deg,#f2ddb2,#d9b673);border-color:transparent;color:#241c0d;font-weight:700;}',
'.uc-btn.primary:hover{filter:brightness(1.06);}',
'.uc-btn.ghost{background:transparent;}',
'.uc-btn[disabled]{opacity:.45;cursor:not-allowed;}',
/* ---------- 右上角牌 ---------- */
'.uc-cards{position:absolute;top:52px;right:18px;z-index:8;display:flex;gap:10px;}',
'.uc-card{width:82px;height:114px;perspective:900px;cursor:pointer;opacity:0;transform:translateX(24px) rotate(-6deg);transition:opacity .3s ease,transform .3s ease;}',
'.uc-card.in{opacity:1;transform:none;}',
'.uc-card .uc-inner{position:relative;width:100%;height:100%;transform-style:preserve-3d;transition:transform .72s cubic-bezier(.25,.8,.25,1);}',
'.uc-card.flipped .uc-inner{transform:rotateY(180deg);}',
'.uc-face{position:absolute;inset:0;backface-visibility:hidden;-webkit-backface-visibility:hidden;border-radius:11px;display:flex;flex-direction:column;align-items:center;justify-content:center;box-shadow:0 10px 26px rgba(0,0,0,.45);}',
'.uc-face.front{background:linear-gradient(150deg,#2b2f3c,#171a21);border:1px solid rgba(230,199,138,.35);color:#e6c78a;}',
'.uc-face.front i{font-size:1.5rem;opacity:.85;}',
'.uc-face.front span{margin-top:6px;font-size:.7rem;letter-spacing:.16em;color:rgba(230,199,138,.7);}',
'.uc-face.back{transform:rotateY(180deg);background:linear-gradient(150deg,#f6ecd6,#e3c793);border:1px solid rgba(255,255,255,.5);color:#2a2113;padding:6px;}',
'.uc-face.back .uc-k{font-size:.62rem;letter-spacing:.1em;opacity:.65;}',
'.uc-face.back .uc-v{font-size:1.02rem;font-weight:800;line-height:1.2;margin-top:3px;text-align:center;word-break:break-all;}',
'.uc-face.back.under{background:linear-gradient(150deg,#ffd9d2,#e9a99e);}',
'.uc-face.back.civil{background:linear-gradient(150deg,#dff1e6,#a9d8bd);}',
/* ---------- 舞台 ---------- */
'.uc-stage{position:relative;z-index:4;flex:1 1 auto;min-height:0;display:flex;align-items:center;justify-content:center;padding:0 18px 16px;}',
'.uc-cast{display:flex;align-items:flex-end;justify-content:center;gap:16px;flex-wrap:wrap;max-width:1100px;position:relative;padding-bottom:6px;}',
'.uc-cast::before{content:"";position:absolute;left:50%;top:48%;transform:translate(-50%,-50%);width:min(760px,86vw);height:300px;border-radius:50%;background:radial-gradient(ellipse at center,rgba(230,199,138,.13),rgba(230,199,138,.04) 45%,transparent 72%);pointer-events:none;z-index:-1;}',
'.uc-p{width:108px;display:flex;flex-direction:column;align-items:center;gap:7px;transition:transform .28s ease,opacity .28s ease,filter .28s ease;opacity:.62;filter:grayscale(.35);}',
'.uc-p .av{width:88px;height:88px;border-radius:50%;object-fit:cover;border:2px solid rgba(255,255,255,.16);background:#20242d;box-shadow:0 10px 26px rgba(0,0,0,.5);}',
'.uc-p .nm{font-size:.8rem;color:#b8bfca;text-align:center;max-width:96px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
'.uc-p.speaking{opacity:1;filter:none;transform:translateY(-10px) scale(1.06);}',
'.uc-p.speaking .av{border-color:#e6c78a;box-shadow:0 0 0 3px rgba(230,199,138,.22),0 12px 26px rgba(0,0,0,.5);}',
'.uc-p.speaking .nm{color:#f4e7ca;font-weight:700;}',
'.uc-p.me .nm{color:#e6c78a;}',
'.uc-p.dead{opacity:.28;filter:grayscale(1);}',
'.uc-p.dead .av{border-color:rgba(255,255,255,.1);}',
'.uc-p .tag{font-size:.62rem;padding:1px 6px;border-radius:20px;border:1px solid rgba(255,255,255,.16);color:#9aa1ad;}',
'.uc-p .tag.under{color:#ff9d8c;border-color:rgba(255,157,140,.45);background:rgba(255,157,140,.1);}',
'.uc-p .tag.civil{color:#8fd3ad;border-color:rgba(143,211,173,.45);background:rgba(143,211,173,.1);}',
/* ---------- 对话框 ---------- */
'.uc-dialog{position:relative;z-index:5;width:min(920px,94vw);margin:0 auto 14px;background:linear-gradient(180deg,rgba(16,19,25,.94),rgba(12,14,19,.97));border:1px solid rgba(230,199,138,.28);border-radius:16px;box-shadow:0 18px 46px rgba(0,0,0,.6),inset 0 1px 0 rgba(255,255,255,.06);padding:16px 20px 18px;min-height:126px;display:flex;flex-direction:column;gap:8px;}',
'.uc-dialog .uc-who{display:flex;align-items:center;gap:9px;font-weight:700;color:#e6c78a;font-size:.9rem;}',
'.uc-dialog .uc-who img{width:26px;height:26px;border-radius:50%;object-fit:cover;}',
'.uc-dialog .uc-who .uc-role{font-weight:400;font-size:.74rem;color:#8e95a1;}',
'.uc-dialog .uc-text{font-size:1rem;line-height:1.8;color:#e6e9ef;min-height:2.6em;white-space:pre-wrap;word-break:break-word;}',
'.uc-dialog .uc-text .caret{display:inline-block;width:.5em;height:1.05em;background:#e6c78a;vertical-align:-2px;animation:ucCaret .9s steps(1) infinite;margin-left:2px;}',
'@keyframes ucCaret{0%,49%{opacity:1}50%,100%{opacity:0}}',
/* ---------- 操作区 ---------- */
'.uc-actions{position:relative;z-index:5;width:min(920px,94vw);margin:0 auto 16px;display:flex;gap:10px;align-items:center;flex-wrap:wrap;}',
'.uc-actions .uc-input{flex:1 1 320px;min-width:0;display:flex;gap:8px;}',
'.uc-actions input[type=text]{flex:1 1 auto;min-width:0;height:42px;border-radius:11px;border:1px solid rgba(255,255,255,.16);background:rgba(255,255,255,.06);color:#eef1f6;padding:0 14px;font:inherit;font-size:.92rem;outline:none;}',
'.uc-actions input[type=text]:focus{border-color:rgba(230,199,138,.55);box-shadow:0 0 0 3px rgba(230,199,138,.12);}',
'.uc-hintline{font-size:.76rem;color:#8b929e;}',
/* ---------- 投票 ---------- */
'.uc-vote{display:flex;gap:8px;flex-wrap:wrap;}',
'.uc-vote button{display:flex;align-items:center;gap:7px;height:38px;padding:0 12px;border-radius:10px;border:1px solid rgba(255,255,255,.15);background:rgba(255,255,255,.05);color:#dfe3ea;font:inherit;font-size:.85rem;cursor:pointer;transition:all .15s ease;}',
'.uc-vote button img{width:22px;height:22px;border-radius:50%;object-fit:cover;}',
'.uc-vote button:hover{border-color:rgba(230,199,138,.5);background:rgba(230,199,138,.12);color:#f6e9cd;}',
'.uc-vote button[disabled]{opacity:.4;cursor:not-allowed;}',
'.uc-vote button .cnt{font-size:.72rem;color:#e6c78a;}',
/* 投票页第二行：弃票 + 追问输入框。追问是「自由」的入口 —— 想说就多说两句 */
'.uc-vote-foot{display:flex;gap:8px;align-items:center;flex:1 1 auto;min-width:0;flex-wrap:wrap;}',
'.uc-ask{display:flex;gap:6px;flex:1 1 240px;min-width:0;}',
'.uc-actions .uc-ask input[type=text]{height:34px;font-size:.84rem;padding:0 10px;}',
'.uc-ask .uc-btn{height:34px;padding:0 10px;font-size:.8rem;flex:0 0 auto;}',
'.uc-abstain{height:34px;font-size:.8rem;flex:0 0 auto;}',
/* 记录面板里的投票明细 */
'.uc-lv-head{margin:9px 0 4px;color:#8b929e;font-size:.76rem;}',
'.uc-lv{display:flex;gap:8px;align-items:baseline;margin-bottom:5px;flex-wrap:wrap;}',
'.uc-lv .who{color:#e6c78a;font-weight:600;flex:0 0 auto;}',
'.uc-lv .ar{color:#b8bfca;flex:0 0 auto;}',
'.uc-lv .why{color:#8b929e;flex:1 1 140px;min-width:0;}',
'.uc-logbox .uc-disc b{color:#9fb4d8;}',
'.uc-logbox .uc-disc span{color:#9aa1ad;}',
/* ---------- 大厅 ---------- */
'.uc-lobby{position:relative;z-index:5;flex:1 1 auto;min-height:0;overflow-y:auto;padding:8px 18px 20px;display:flex;justify-content:center;}',
'.uc-lobby-in{width:min(920px,94vw);display:flex;flex-direction:column;gap:14px;}',
'.uc-hero{background:linear-gradient(160deg,rgba(230,199,138,.1),rgba(255,255,255,.02));border:1px solid rgba(230,199,138,.22);border-radius:16px;padding:16px 18px;}',
'.uc-hero h2{margin:0 0 6px;font-size:1.16rem;letter-spacing:.02em;display:flex;align-items:center;gap:8px;}',
'.uc-hero h2 i{color:#e6c78a;}',
'.uc-hero p{margin:0;color:#a9b0bc;font-size:.86rem;line-height:1.75;}',
'.uc-hero p + p{margin-top:8px;padding-top:8px;border-top:1px dashed rgba(255,255,255,.1);color:#8f96a2;}',
'.uc-hero-note strong{color:#e6c78a;font-weight:600;}',
'.uc-sec-title{display:flex;align-items:center;gap:8px;font-size:.86rem;color:#cfd5df;font-weight:700;margin:2px 0 2px;}',
'.uc-sec-title small{font-weight:400;color:#8b929e;}',
'.uc-picker{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px;max-height:280px;overflow-y:auto;padding:2px;}',
'.uc-chip{display:flex;align-items:center;gap:8px;padding:7px 9px;border-radius:11px;border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.03);cursor:pointer;transition:all .15s ease;}',
'.uc-chip:hover{border-color:rgba(230,199,138,.4);}',
'.uc-chip.on{border-color:rgba(230,199,138,.65);background:rgba(230,199,138,.13);}',
'.uc-chip img{width:30px;height:30px;border-radius:50%;object-fit:cover;flex:0 0 auto;background:#20242d;}',
'.uc-chip span{font-size:.82rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
'.uc-chip .uc-tick{margin-left:auto;color:#e6c78a;opacity:0;font-size:.9rem;}',
'.uc-chip.on .uc-tick{opacity:1;}',
'.uc-row{display:flex;gap:10px;flex-wrap:wrap;align-items:center;}',
'.uc-sel{height:38px;border-radius:10px;border:1px solid rgba(255,255,255,.16);background:rgba(20,23,30,.9);color:#e6e9ef;padding:0 10px;font:inherit;font-size:.86rem;}',
'.uc-check{display:flex;align-items:center;gap:8px;font-size:.84rem;color:#b8bfca;cursor:pointer;}',
/* ---------- 结算 ---------- */
'.uc-over{position:relative;z-index:6;width:min(860px,94vw);margin:auto;background:linear-gradient(180deg,rgba(18,21,28,.97),rgba(12,14,19,.99));border:1px solid rgba(230,199,138,.3);border-radius:18px;padding:22px 22px 18px;box-shadow:0 24px 60px rgba(0,0,0,.65);}',
'.uc-over h2{margin:0 0 4px;font-size:1.3rem;display:flex;align-items:center;gap:9px;}',
'.uc-over .uc-sub{color:#9aa1ad;font-size:.86rem;margin-bottom:14px;}',
'.uc-over .uc-reveal{display:flex;flex-direction:column;gap:6px;margin-bottom:16px;max-height:44vh;overflow-y:auto;}',
'.uc-over .uc-rrow{display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:10px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.07);}',
'.uc-over .uc-rrow img{width:28px;height:28px;border-radius:50%;object-fit:cover;}',
'.uc-over .uc-rrow .who{font-size:.88rem;min-width:80px;}',
'.uc-over .uc-rrow .wd{font-size:.84rem;color:#cfd5df;}',
'.uc-over .uc-rrow .rl{margin-left:auto;font-size:.76rem;padding:2px 9px;border-radius:20px;}',
'.uc-over .uc-rrow .rl.under{color:#ff9d8c;border:1px solid rgba(255,157,140,.45);background:rgba(255,157,140,.1);}',
'.uc-over .uc-rrow .rl.civil{color:#8fd3ad;border:1px solid rgba(143,211,173,.45);background:rgba(143,211,173,.1);}',
/* ---------- 记录浮层 ---------- */
'.uc-logbox{position:absolute;z-index:9;right:18px;top:180px;width:min(380px,86vw);max-height:56vh;overflow-y:auto;background:rgba(14,16,22,.96);border:1px solid rgba(255,255,255,.12);border-radius:14px;padding:12px 14px;box-shadow:0 18px 46px rgba(0,0,0,.6);font-size:.84rem;line-height:1.7;}',
'.uc-logbox[hidden]{display:none;}',
'.uc-logbox .uc-lg{color:#8b929e;font-size:.76rem;margin:8px 0 4px;}',
'.uc-logbox .uc-li{display:flex;gap:8px;margin-bottom:6px;}',
'.uc-logbox .uc-li b{color:#e6c78a;font-weight:600;flex:0 0 auto;}',
/* ---------- 移动端 ---------- */
'@media (max-width:640px){',
'.uc-top{padding:10px 12px;gap:6px;flex-wrap:nowrap;align-items:center;}',
'.uc-top .uc-title{font-size:.9rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0;}',
'.uc-top .uc-title i{font-size:1rem;}',
'.uc-round{font-size:.7rem;padding:1px 8px;white-space:nowrap;flex:0 0 auto;}',
'.uc-top .uc-btn{height:30px;padding:0 9px;font-size:.76rem;flex:0 0 auto;}',
// 小屏顶栏塞不下三个带字按钮：「记录」「结束」都只留图标，把宽度让给标题
'.uc-end-label,.uc-log-label{display:none;}',
'.uc-end-btn,.uc-log-btn{padding:0 8px !important;}',
// 轮次标签也收一档，否则「谁是卧底」四个字会被压掉最后一笔
'.uc-round{font-size:.66rem;padding:1px 6px;}',
// 320 下「第 1 轮 · 发言 5/5」会把标题挤成「谁」，进度让位
'.uc-turn{display:none;}',
'.uc-cards{top:56px;right:10px;}',
'.uc-card{width:64px;height:90px;}',
'.uc-face.back .uc-v{font-size:.86rem;}',
'.uc-cast{gap:8px;}',
'.uc-p{width:64px;}',
'.uc-p .av{width:50px;height:50px;}',
'.uc-p .nm{font-size:.68rem;max-width:64px;}',
'.uc-dialog{padding:12px 14px 14px;min-height:112px;border-radius:14px;}',
'.uc-dialog .uc-text{font-size:.92rem;line-height:1.7;}',
'.uc-actions{gap:8px;}',
'.uc-lobby{padding:6px 12px 16px;}',
'.uc-logbox{top:150px;right:8px;}',
'}'
        ].join('\n');
        var style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = css;
        document.head.appendChild(style);
    }

    /* ================= 玩家来源 ================= */
    function allCharacters() {
        var out = [];
        try {
            var data = friendsMap();
            Object.keys(data).forEach(function (id) {
                var f = data[id];
                if (!f || f.isGroup) return;
                out.push({
                    id: String(id),
                    name: (typeof window.getFriendDisplayName === 'function' ? window.getFriendDisplayName(id) : '') || f.name || id,
                    avatar: f.avatar || '',
                    persona: String(f.systemPrompt || '')
                });
            });
        } catch (e) { /* 角色还没加载完就返回空，下次打开重试 */ }
        return out;
    }

    function groupMembers() {
        try {
            var gid = currentFriend();
            var g = groupsMap()[gid];
            if (!g || !Array.isArray(g.memberIds)) return [];
            return g.memberIds.map(function (id) {
                var f = friendsMap()[id];
                if (!f || f.isGroup) return null;
                return {
                    id: String(id),
                    name: (typeof window.getFriendDisplayName === 'function' ? window.getFriendDisplayName(id) : '') || f.name || id,
                    avatar: f.avatar || '',
                    persona: String(f.systemPrompt || '')
                };
            }).filter(Boolean);
        } catch (e) { return []; }
    }

    function myProfile() {
        var name = '你';
        var avatar = '';
        try {
            var n = myNameSafe().trim();
            if (n) name = n;
            var el = document.getElementById('input-avatar');
            if (el && el.src) avatar = el.src;
        } catch (e) { }
        return { id: '__me__', name: name, avatar: avatar, isMe: true, persona: '' };
    }

    /* ================= 大厅 ================= */
    var lobbySel = [];      // 已选中的角色 id
    var lobbyShowRole = true;

    function openLobby() {
        ensureRoot();
        els.root.classList.add('show');
        document.body.classList.add('uc-open');
        renderLobby();
    }

    function renderLobby() {
        var chars = allCharacters();
        var group = groupMembers();
        if (!lobbySel.length) {
            // 首次进来：当前是群聊就默认带上群成员，否则空着等用户挑
            lobbySel = group.slice(0, MAX_AI).map(function (p) { return p.id; });
        }
        var saved = loadSave();

        var chips = chars.map(function (c) {
            var on = lobbySel.indexOf(c.id) >= 0;
            return '<div class="uc-chip' + (on ? ' on' : '') + '" data-pick="' + esc(c.id) + '">' +
                '<img src="' + esc(c.avatar) + '" alt="">' +
                '<span>' + esc(c.name) + '</span>' +
                '<i class="ri-check-line uc-tick"></i>' +
                '</div>';
        }).join('');
        if (!chips) chips = '<p class="uc-hintline">还没有角色。先去「添加好友」建一个，或者导入角色卡。</p>';

        var count = lobbySel.length;
        var pCount = count + 1;
        var maxUnder = pCount >= 7 ? 2 : 1;

        els.root.innerHTML = [
            '<div class="uc-bg"></div><div class="uc-vignette"></div>',
            '<div class="uc-top">',
            '  <div class="uc-title"><i class="ri-user-search-line"></i> 谁是卧底</div>',
            '  <div class="uc-spacer"></div>',
            '  <button class="uc-btn ghost" data-act="close"><i class="ri-close-line"></i> 退出</button>',
            '</div>',
            '<div class="uc-lobby"><div class="uc-lobby-in">',
            '  <div class="uc-hero">',
            '    <h2><i class="ri-question-answer-line"></i> 规则（和你线下玩的一样）</h2>',
            '    <p>每人一张词牌，' + (maxUnder > 1 ? '有 ' + maxUnder + ' 个人' : '有 1 个人') + '拿到的词和大家不一样，那个人就是<strong>卧底</strong>，但没人知道自己是哪一种。' +
            '每轮按随机顺序各说一句话描述自己的词（不能说出词本身），一轮说完一起投票，票最多的出局、身份当场公开。' +
            '<br>卧底全部出局 → 平民赢；卧底活到「剩下的平民不比卧底多」→ 卧底赢。</p>' +
            '    <p class="uc-hero-note">不想被流程推着走也行：轮到你时可以说，也可以<strong>跳过</strong>；' +
            '投票前能<strong>追问任何人一句</strong>（他们会回你），也可以<strong>弃票</strong>。' +
            '每个人的投票理由都会写进「记录」，AI 投票时会参考前面每一轮的发言和已经出局的人是什么身份。</p>',
            '  </div>',
            saved && saved.phase !== 'over'
                ? '  <div class="uc-row"><button class="uc-btn primary" data-act="resume"><i class="ri-history-line"></i> 继续上一局（第 ' + (saved.round || 1) + ' 轮）</button>' +
                  '<span class="uc-hintline">上一局还没打完，点这里接着来；选人开局会覆盖它。</span></div>'
                : '',
            '  <div>',
            '    <div class="uc-sec-title"><i class="ri-group-line"></i> 选谁陪你玩 <small>（你自己也算一个，总共 ' + pCount + ' 人）</small></div>',
            group.length
                ? '    <div class="uc-row" style="margin-bottom:8px;"><button class="uc-btn" data-act="use-group"><i class="ri-group-2-line"></i> 用当前群聊的 ' + group.length + ' 位成员</button>' +
                  '<button class="uc-btn" data-act="clear">清空</button></div>'
                : '    <div class="uc-row" style="margin-bottom:8px;"><button class="uc-btn" data-act="clear">清空</button></div>',
            '    <div class="uc-picker">' + chips + '</div>',
            '  </div>',
            '  <div class="uc-row">',
            '    <label class="uc-check"><input type="checkbox" id="uc-show-role" ' + (lobbyShowRole ? 'checked' : '') + '> 明牌模式（发牌时告诉你自己是平民还是卧底）</label>',
            '  </div>',
            '  <div class="uc-row">',
            '    <button class="uc-btn primary" data-act="start" ' + (count < MIN_AI ? 'disabled' : '') + '><i class="ri-play-fill"></i> 开始发牌（' + pCount + ' 人）</button>',
            '    <span class="uc-hintline">' + (count < MIN_AI
                    ? '至少还要再选 ' + (MIN_AI - count) + ' 个角色，否则一轮就结束了。'
                    : '卧底人数：' + maxUnder + ' 人。' + (hasApi() ? '' : '当前没配 API，AI 会用本地兜底台词（也能玩，就是嘴笨点）。')) + '</span>',
            '  </div>',
            '</div></div>'
        ].join('');

        bindLobby();
    }

    function bindLobby() {
        els.root.querySelectorAll('[data-pick]').forEach(function (chip) {
            chip.addEventListener('click', function () {
                var id = chip.getAttribute('data-pick');
                var i = lobbySel.indexOf(id);
                if (i >= 0) lobbySel.splice(i, 1);
                else {
                    if (lobbySel.length >= MAX_AI) { toast('最多 ' + MAX_AI + ' 个 AI，再多舞台站不下了', 'ri-error-warning-line'); return; }
                    lobbySel.push(id);
                }
                renderLobby();
            });
        });
        var cb = els.root.querySelector('#uc-show-role');
        if (cb) cb.addEventListener('change', function () { lobbyShowRole = cb.checked; });

        els.root.querySelector('[data-act="close"]')?.addEventListener('click', close);
        els.root.querySelector('[data-act="clear"]')?.addEventListener('click', function () { lobbySel = []; renderLobby(); });
        els.root.querySelector('[data-act="use-group"]')?.addEventListener('click', function () {
            var g = groupMembers().slice(0, MAX_AI);
            if (!g.length) { toast('当前不在群聊里', 'ri-information-line'); return; }
            lobbySel = g.map(function (p) { return p.id; });
            renderLobby();
        });
        els.root.querySelector('[data-act="start"]')?.addEventListener('click', function () { startGame(); });
        els.root.querySelector('[data-act="resume"]')?.addEventListener('click', function () { resumeSaved(); });
    }

    /* ================= 开局 ================= */
    function startGame() {
        var chars = allCharacters().filter(function (c) { return lobbySel.indexOf(c.id) >= 0; });
        if (chars.length < MIN_AI) { toast('至少选 ' + MIN_AI + ' 个角色', 'ri-error-warning-line'); return; }

        var pair = pick(WORD_PAIRS);
        var civilWord = pair[0];
        var underWord = pair[1];
        if (Math.random() < 0.5) { civilWord = pair[1]; underWord = pair[0]; }
        // 类别只用来挑兜底台词，不参与胜负判定
        var wordCat = pair[2] || '';

        var me = myProfile();
        var list = [{ id: me.id, name: me.name, avatar: me.avatar, isMe: true, persona: '' }]
            .concat(chars.map(function (c) { return { id: c.id, name: c.name, avatar: c.avatar, isMe: false, persona: c.persona }; }));

        var underCount = list.length >= 7 ? 2 : 1;
        var indexes = shuffle(list.map(function (_, i) { return i; })).slice(0, underCount);

        state = {
            v: 1,
            startedAt: Date.now(),
            phase: 'deal',
            round: 1,
            turn: 0,
            order: [],
            players: list.map(function (p, i) {
                var isUnder = indexes.indexOf(i) >= 0;
                return {
                    id: p.id, name: p.name, avatar: p.avatar, isMe: !!p.isMe, persona: p.persona,
                    word: isUnder ? underWord : civilWord,
                    role: isUnder ? 'under' : 'civil',
                    alive: true, vote: null
                };
            }),
            civilWord: civilWord,
            underWord: underWord,
            cat: wordCat,
            showRole: lobbyShowRole,
            saidThisRound: [],
            eliminated: [],
            log: []
        };
        saveState();
        runToken += 1;
        aiFailStreak = 0;
        toldOffline = false;
        renderStage();
        playDealAnimation(runToken);
    }

    /* ============================================================
       把右上角的牌直接摆到位
       ------------------------------------------------------------
       卡片的默认状态是 opacity:0 + 正面朝上，只有发牌动画才会给它们加
       .in 和 .flipped。从存档恢复时 DOM 是新建的，没人补这一步，
       于是右上角一片空白 —— 看起来就像「牌没了」。
       ============================================================ */
    function revealCardsInstantly() {
        if (!els.root || !state) return;
        var cards = els.root.querySelectorAll('.uc-card');
        if (!cards.length) return;
        // 下一帧再加 class，过渡才有起点，不会「啪」地跳出来
        requestAnimationFrame(function () {
            Array.prototype.forEach.call(cards, function (c) {
                c.classList.add('in');
                // 补上「可以点击翻面」的标记：否则第一次点击只会打标记、不翻牌
                c.setAttribute('data-ready', '1');
            });
            if (cards[0]) cards[0].classList.add('flipped');
            if (cards[1] && state.showRole) cards[1].classList.add('flipped');
        });
    }

    function resumeSaved() {
        var s = loadSave();
        if (!s || s.phase === 'over') { toast('没有可继续的对局', 'ri-information-line'); renderLobby(); return; }
        state = s;
        runToken += 1;
        renderStage();
        revealCardsInstantly();
        // 续局不再播发牌动画，直接回到当前阶段
        setTimeout(function () { enterPhase(state.phase); }, 260);
    }

    /* ================= 发牌动画 ================= */
    function playDealAnimation(token) {
        var me = state.players.find(function (p) { return p.isMe; });
        var cards = els.root.querySelectorAll('.uc-card');
        cards.forEach(function (c, i) {
            setTimeout(function () { c.classList.add('in'); }, 180 + i * 120);
        });
        // 先翻词牌，再翻身份牌
        setTimeout(function () {
            if (token !== runToken) return;
            cards[0] && cards[0].classList.add('flipped');
        }, 780);
        setTimeout(function () {
            if (token !== runToken) return;
            if (cards[1] && state.showRole) cards[1].classList.add('flipped');
        }, 1500);
        setDialog(me.name, '你的词是「' + me.word + '」。' + (state.showRole
            ? '你的身份是' + (me.role === 'under' ? '卧底' : '平民') + '。'
            : '安心，没人知道自己是哪一种。') + '记住它，别念出来。', true);
        setTimeout(function () {
            if (token !== runToken) return;
            state.phase = 'describe';
            beginRound();
        }, 2600);
    }

    /* ================= 舞台 ================= */
    function ensureRoot() {
        if (root && root.isConnected) { els.root = root; return; }
        injectStyle();
        root = document.createElement('div');
        root.className = 'uc-root';
        root.id = 'uc-root';
        document.body.appendChild(root);
        els.root = root;
    }

    function cardHtml(me) {
        return [
            '<div class="uc-cards">',
            '  <div class="uc-card" data-card="word" title="点一下看你的词">',
            '    <div class="uc-inner">',
            '      <div class="uc-face front"><i class="ri-question-mark"></i><span>WORD</span></div>',
            '      <div class="uc-face back"><div class="uc-k">你的词</div><div class="uc-v">' + esc(me.word) + '</div></div>',
            '    </div>',
            '  </div>',
            '  <div class="uc-card" data-card="role" title="点一下看你的身份">',
            '    <div class="uc-inner">',
            '      <div class="uc-face front"><i class="ri-shield-keyhole-line"></i><span>ROLE</span></div>',
            '      <div class="uc-face back ' + (me.role === 'under' ? 'under' : 'civil') + '"><div class="uc-k">你的身份</div><div class="uc-v">' + (me.role === 'under' ? '卧底' : '平民') + '</div></div>',
            '    </div>',
            '  </div>',
            '</div>'
        ].join('');
    }

    function castHtml() {
        return state.players.map(function (p) {
            var cls = 'uc-p' + (p.isMe ? ' me' : '') + (p.alive ? '' : ' dead');
            var tag = '';
            // 死掉的人直接公开身份（规则如此）
            if (!p.alive) tag = '<span class="tag ' + (p.role === 'under' ? 'under' : 'civil') + '">' + (p.role === 'under' ? '卧底' : '平民') + '</span>';
            else if (p.isMe && state.showRole) tag = '<span class="tag ' + (p.role === 'under' ? 'under' : 'civil') + '">' + (p.role === 'under' ? '卧底' : '平民') + '</span>';
            return '<div class="' + cls + '" data-pid="' + esc(p.id) + '">' +
                '<img class="av" src="' + esc(p.avatar) + '" alt="">' +
                '<div class="nm">' + esc(p.isMe ? (p.name + '（你）') : p.name) + '</div>' +
                tag +
                '</div>';
        }).join('');
    }

    /* 只重画立绘区：整页重建会把右上角的牌翻回去、把对话框清空，
       每淘汰一个人闪一次太难看。 */
    function renderCast() {
        if (!els.cast) return;
        els.cast.innerHTML = castHtml();
    }

    function renderStage() {
        var me = state.players.find(function (p) { return p.isMe; }) || state.players[0];
        els.root.innerHTML = [
            '<div class="uc-bg"></div><div class="uc-vignette"></div>',
            cardHtml(me),
            '<div class="uc-top">',
            '  <div class="uc-title"><i class="ri-user-search-line"></i> 谁是卧底</div>',
            '  <div class="uc-round" id="uc-round">第 1 轮</div>',
            '  <div class="uc-spacer"></div>',
            '  <button class="uc-btn ghost uc-log-btn" data-act="log" title="每一轮谁说了什么"><i class="ri-file-list-3-line"></i><span class="uc-log-label"> 记录</span></button>',
            '  <button class="uc-btn ghost uc-end-btn" data-act="end" title="不看胜负条件，直接公开所有人的牌" aria-label="结束本局"><i class="ri-flag-line"></i><span class="uc-end-label"> 结束</span></button>',
            '  <button class="uc-btn ghost" data-act="quit"><i class="ri-logout-box-r-line"></i> 退出</button>',
            '</div>',
            '<div class="uc-stage"><div class="uc-cast" id="uc-cast">' + castHtml() + '</div></div>',
            '<div class="uc-dialog">',
            '  <div class="uc-who"><img id="uc-who-av" src="" alt=""><span id="uc-who-name">游戏开始</span><span class="uc-role" id="uc-who-role"></span></div>',
            '  <div class="uc-text" id="uc-text"></div>',
            '</div>',
            '<div class="uc-actions" id="uc-actions"></div>',
            '<div class="uc-logbox" id="uc-logbox" hidden></div>'
        ].join('');

        els.cast = els.root.querySelector('#uc-cast');
        els.dialogText = els.root.querySelector('#uc-text');
        els.whoName = els.root.querySelector('#uc-who-name');
        els.whoRole = els.root.querySelector('#uc-who-role');
        els.whoAv = els.root.querySelector('#uc-who-av');
        els.actions = els.root.querySelector('#uc-actions');
        els.roundTag = els.root.querySelector('#uc-round');
        els.logbox = els.root.querySelector('#uc-logbox');

        // 卡片：点一下翻回去看一眼
        els.root.querySelectorAll('.uc-card').forEach(function (c) {
            c.addEventListener('click', function () {
                if (!c.hasAttribute('data-ready')) { c.setAttribute('data-ready', '1'); return; }
                c.classList.toggle('flipped');
            });
        });

        els.root.querySelector('[data-act="end"]')?.addEventListener('click', forceEnd);
        els.root.querySelector('[data-act="quit"]')?.addEventListener('click', function () {
            (window.Dlg && Dlg.confirm ? Dlg.confirm({ title: '退出这一局？', message: '当前进度会保存，下次打开还能继续。', okText: '退出', cancelText: '继续玩' }) : Promise.resolve(true))
                .then(function (ok) { if (ok) close(); });
        });
        els.root.querySelector('[data-act="log"]')?.addEventListener('click', toggleLog);
    }

    function highlightSpeaker(pid) {
        if (!els.cast) return;
        els.cast.querySelectorAll('.uc-p').forEach(function (el) {
            el.classList.toggle('speaking', el.getAttribute('data-pid') === pid);
        });
    }

    /* 打字机定时器。以前它是 setDialog 里的局部变量，没人清，
       于是上一条台词会在新内容写完之后继续往回写 —— 结算页被 AI 台词盖掉就是这么来的。 */
    var dialogTimer = null;

    function setDialog(name, text, instant) {
        if (!els.dialogText) return;
        if (dialogTimer) { clearInterval(dialogTimer); dialogTimer = null; }
        var p = state && state.players.find(function (x) { return x.name === name; });
        if (els.whoName) els.whoName.textContent = name || '';
        if (els.whoAv) {
            var av = (p && p.avatar) || '';
            els.whoAv.src = av;
            els.whoAv.style.display = av ? '' : 'none';   // 没有头像时不要露出破图标
        }
        if (els.whoRole) {
            els.whoRole.textContent = p && p.isMe ? '（你）' : '';
        }
        if (instant) { els.dialogText.textContent = text; return; }
        // 打字机
        els.dialogText.textContent = '';
        var i = 0;
        var caret = document.createElement('span');
        caret.className = 'caret';
        els.dialogText.appendChild(caret);
        var timer = setInterval(function () {
            if (!els.dialogText || !els.dialogText.isConnected) { clearInterval(timer); if (dialogTimer === timer) dialogTimer = null; return; }
            if (i >= text.length) {
                clearInterval(timer);
                if (dialogTimer === timer) dialogTimer = null;
                caret.remove();
                return;
            }
            i += 1;
            els.dialogText.textContent = text.slice(0, i);
            els.dialogText.appendChild(caret);
        }, TYPE_SPEED);
        dialogTimer = timer;
    }

    function toggleLog() {
        if (!els.logbox) return;
        els.logbox.hidden = !els.logbox.hidden;
        if (!els.logbox.hidden) {
            /* 发言 → 自由讨论 → 投票（带理由）。以前只记发言，
               投票是一片空白，用户自然会觉得「投得没逻辑」。 */
            var html = state.log.map(function (g) {
                var said = (g.items || []).filter(function (it) { return it.name !== '投票'; }).map(function (it) {
                    return '<div class="uc-li"><b>' + esc(it.name) + '</b><span>' + esc(it.text) + '</span></div>';
                }).join('');
                var talk = (g.discuss || []).map(function (it) {
                    return '<div class="uc-li uc-disc"><b>' + esc(it.name) + '</b><span>' + esc(it.text) + '</span></div>';
                }).join('');
                var votes = (g.votes || []).map(function (r) {
                    return '<div class="uc-lv"><span class="who">' + esc(r.name) + '</span>' +
                        '<span class="ar"><i class="ri-arrow-right-line"></i> ' + esc(r.target) + '</span>' +
                        (r.reason ? '<span class="why">' + esc(r.reason) + '</span>' : '') + '</div>';
                }).join('');
                var first = (g.votesFirst || []).map(function (r) {
                    return '<div class="uc-lv"><span class="who">' + esc(r.name) + '</span>' +
                        '<span class="ar"><i class="ri-arrow-right-line"></i> ' + esc(r.target) + '</span>' +
                        (r.reason ? '<span class="why">' + esc(r.reason) + '</span>' : '') + '</div>';
                }).join('');
                var voteBlock = (first ? '<div class="uc-lv-head">投票（平票，加投前）</div>' + first : '') +
                    (votes ? '<div class="uc-lv-head">投票</div>' + votes : '');
                return '<div class="uc-lg">第 ' + g.round + ' 轮</div>' + said + talk + voteBlock;
            }).join('');
            els.logbox.innerHTML = html || '<div class="uc-lg">还没有发言</div>';
        }
    }

    /* ================= 回合驱动 ================= */
    function beginRound() {
        if (els.actions) els.actions.innerHTML = '';   // 清掉上一轮的「继续」按钮
        var alive = state.players.filter(function (p) { return p.alive; });
        state.order = shuffle(alive.map(function (p) { return p.id; }));
        state.turn = 0;
        state.saidThisRound = [];
        state.runoff = null;
        state.players.forEach(function (p) { p.vote = null; });
        var lastLog = state.log[state.log.length - 1];
        if (!lastLog || lastLog.round !== state.round) state.log.push({ round: state.round, items: [] });
        if (els.roundTag) els.roundTag.textContent = '第 ' + state.round + ' 轮';
        runLoop(runToken);
    }

    async function runLoop(token) {
        while (state && state.phase === 'describe') {
            var pid = state.order[state.turn];
            var p = state.players.find(function (x) { return x.id === pid; });
            if (!p || !p.alive) { state.turn += 1; continue; }

            highlightSpeaker(pid);
            if (els.roundTag) {
                var aliveCount = state.players.filter(function (x) { return x.alive; }).length;
                els.roundTag.innerHTML = '第 ' + state.round + ' 轮<span class="uc-turn"> · 发言 ' + Math.min(state.turn + 1, aliveCount) + '/' + aliveCount + '</span>';
            }
            if (p.isMe) {
                setDialog(p.name, '轮到你了 —— 用一句话描述你的词「' + p.word + '」，别把词说出来。', true);
                renderMyTurnUI();
                var line = await waitForMyLine(token);
                if (token !== runToken) return;
                // null = 局被关掉/结束；'#skip' = 玩家自己选的这轮不说
                if (line === null) return;
                if (!line || line === '#skip') {
                    recordSay(p, '（这轮没说话）', true);
                    setDialog(p.name, '（这轮没说话）', true);
                    await sleep(500);
                } else {
                    recordSay(p, line);
                    setDialog(p.name, line, false);
                    await sleep(Math.min(2600, 500 + line.length * 34));
                }
            } else {
                setDialog(p.name, '……', true);
                var aiLine = await aiDescribe(p);
                if (token !== runToken) return;
                recordSay(p, aiLine);
                setDialog(p.name, aiLine, false);
                await sleep(Math.min(4200, 700 + aiLine.length * 40) + 260);
            }
            if (token !== runToken) return;
            state.turn += 1;
            saveState();
            if (state.turn >= state.order.length) {
                state.phase = 'vote';
                break;
            }
        }
        if (token !== runToken) return;
        if (state && state.phase === 'vote') startVote(runToken);
    }

    function recordSay(p, text, skipped) {
        state.saidThisRound.push({ pid: p.id, name: p.name, text: text, skipped: !!skipped });
        var g = state.log[state.log.length - 1];
        if (g) g.items.push({ name: p.name, text: text });
        saveState();
    }

    function waitForMyLine(token) {
        return new Promise(function (resolve) {
            if (token !== runToken) { resolve(''); return; }
            pendingLine = resolve;
        });
    }

    function renderMyTurnUI() {
        els.actions.innerHTML = [
            '<div class="uc-input">',
            '  <input type="text" id="uc-my-line" maxlength="80" placeholder="一句话描述你的词，不要说出词本身…" autocomplete="off">',
            '  <button class="uc-btn primary" id="uc-send"><i class="ri-send-plane-fill"></i> 说</button>',
            '  <button class="uc-btn ghost" id="uc-skip" title="这轮不说，直接过 —— 但别人会记住你没说话"><i class="ri-skip-forward-line"></i> 跳过</button>',
            '</div>',
            '<span class="uc-hintline">说太直白会被卧底抄，太含糊会被投出去。不想说也可以跳过，只是别人会记得。</span>'
        ].join('');
        var input = els.actions.querySelector('#uc-my-line');
        var send = els.actions.querySelector('#uc-send');
        var skip = els.actions.querySelector('#uc-skip');
        input.focus();
        var finish = function (val) {
            if (!pendingLine) return;
            var r = pendingLine; pendingLine = null; els.actions.innerHTML = ''; r(val);
        };
        var submit = function () {
            var v = input.value.trim();
            if (!v) return;
            var me = state.players.find(function (p) { return p.isMe; });
            if (me && v.indexOf(me.word) >= 0) {
                toast('不能说词本身，换个说法', 'ri-error-warning-line');
                return;
            }
            finish(v);
        };
        send.addEventListener('click', submit);
        skip.addEventListener('click', function () { finish('#skip'); });
        input.addEventListener('keydown', function (e) { if (e.key === 'Enter') submit(); });
    }

    /* ================= AI 发言 ================= */
    function personaBrief(p) {
        var s = String(p.persona || '').replace(/\s+/g, ' ').trim();
        return s.length > 320 ? s.slice(0, 320) + '…' : s;
    }

    /* 前两轮的发言：让 AI 能顺着上一轮的话往下接，而不是每轮从零开始。
       这是「第二轮开始才有的信息量」—— 真人玩卧底就是这么推理的。 */
    function earlierRoundsText() {
        if (!state || !Array.isArray(state.log)) return '';
        var groups = state.log.filter(function (g) { return g && g.items && g.items.length; });
        var past = groups.slice(0, -1).slice(-2);
        return past.map(function (g) {
            return '【第 ' + g.round + ' 轮】' + g.items.map(function (it) {
                return it.name + '：' + it.text;
            }).join('｜');
        }).join('\n');
    }

    async function aiDescribe(p) {
        var alive = state.players.filter(function (x) { return x.alive; });
        var history = state.saidThisRound.map(function (s) {
            return '- ' + s.name + '：' + s.text;
        }).join('\n') || '（你是第一个说的）';
        var past = earlierRoundsText();
        var sys = [
            '你在玩桌游「谁是卧底」，现在轮到你发言。',
            '规则：',
            '- 场上 ' + alive.length + ' 人。大多数人拿到的词一样（平民），只有极少数人拿到的是另一个近义词（卧底）。',
            '- 你不知道自己是不是卧底，也不要猜；你只知道自己的词。',
            '- 每轮每人说一句话描述自己的词：不能说出词里的任何字，不能太直白（等于把词送人），也不能太含糊（会被当成卧底投出去）。',
            '- 只输出你要说的那一句话，20~40 字，不要引号、不要解释、不要写「我说完了」。',
            '- 必须是完整的一句话。不要用「而」「但」「因为」这种词收尾（那是没说完）。',
            '- 如果前面有人说过，就接着他们的话往下说，别重复他们用过的说法。',
            '',
            '你的名字：' + p.name,
            p.persona ? '你的角色人设（只借用说话方式与口癖，不要跑题）：' + personaBrief(p) : '',
            '你的词：' + p.word,
            past ? '\n前面几轮说过的话：\n' + past : '',
            '',
            '本轮已经说过的人：',
            history
        ].filter(Boolean).join('\n');

        var user = '请说出你这一轮的那句话。';
        var raw = await askAi(sys, user, 220);
        var line = cleanSay(raw);
        if (!line) line = fallbackSay(state.cat);
        return sanitizeLine(line, p.word, state.cat);
    }

    /* 模型经常在前面加一句「我的描述：」、用 ** 加粗、或者一句话被换行切两段。
       这里统一收拾掉；收拾完还是半句的，宁可判空走兜底，也不要往场上丢半句话。 */
    function cleanSay(raw) {
        var t = String(raw || '').replace(/\*\*|__|`/g, '').trim();
        if (!t) return '';
        var lines = t.split('\n').map(function (x) {
            return x.replace(/^[-*·\s]+/, '').trim();
        }).filter(Boolean);
        t = lines[0] || '';
        // 换成两行的同一句话：接回去
        if (t && !/[。！？…~～」』"”]$/.test(t) && lines[1] && !/^[「『"'“（(]/.test(lines[1])) {
            var joined = t.replace(/[，,、]$/, '') + lines[1];
            if (joined.length <= 68) t = joined;
        }
        t = t.replace(/^["'“”‘’「」『』\s]+|["'“”‘’「」『』\s]+$/g, '');
        t = t.replace(/^(我说|回答|这句话是|台词|描述)[:：]\s*/, '');
        t = t.replace(/[（(][^）)]{0,16}[）)]\s*$/, '');   // 去掉句尾的小括号注
        if (t.length > 70) t = t.slice(0, 70);
        t = t.trim();
        // 半句（以逗号或连词收尾）直接判废
        if (t && /[，,、；;：:]$/.test(t)) return '';
        if (t && /(而|但|因为|所以|然后|接着)$/.test(t)) return '';
        return t;
    }

    /* 没网 / API 挂了 / 被限流时的兜底台词。
       关键改动：按词的类别分池，并且排除本轮已经说过的句子。
       以前只有一个五句的通用池，五个人能说出三句一模一样的废话，
       整局就完全没有可推理的信息了 —— 那才是「玩不了一点」的真正原因。 */
    var FALLBACK_BY_CAT = {
        drink: ['渴了才想得起来，但也不是只为了解渴。', '冷的热的都有人喝，看季节。', '早上来一份的人挺多的。',
            '饭桌上常见，一个人喝的时候也有。', '包装上写的配料比想象的复杂。', '小孩喜欢，大人也不见得戒得掉。'],
        food: ['得看场合，饿的时候才想起来。', '家里常备着，但不是天天都想吃。', '口味很个人，有人天天要，有人碰都不碰。',
            '买现成的省事，自己做要费点功夫。', '热的时候比凉的时候受欢迎。', '端上桌的时候，大家的反应不太一样。'],
        fruit: ['应季的时候便宜，反季就贵了。', '剥皮还是直接啃，看个人习惯。', '夏天卖得最好，切开颜色挺好看。',
            '摆在果盘里比单独放着好看。', '买的时候要挑，挑不好会很难吃。', '带皮和不带皮，两种吃法。'],
        veg: ['菜市场天天有，价格起伏不大。', '生吃熟吃都行，看怎么做。', '厨房里的基础款，缺了还得现买。',
            '放冰箱能撑几天，但撑不了太久。', '切开之后就不太好留了。', '有人特别爱吃，有人一口都不碰。'],
        stationery: ['上学那阵天天用，现在少见了。', '文具店里一整排，挑起来挺费时间。', '考试前最容易发现它不见了。',
            '用完就换，很少有人会用到底。', '借出去之后基本就回不来了。', '用得顺手和用得不顺手，差得挺远。'],
        apparel: ['出门前会想起来看一眼。', '尺寸比样式重要，买错了很难受。', '换季的时候才想起它放哪了。',
            '有的人有好几个，有的人一个都没有。', '下大雨或者大太阳的时候最有用。', '不是天天用，但缺了会很不方便。'],
        home: ['搬家的时候最头疼的就是它。', '摆在那儿不显眼，少了又觉得空。', '买之前得量尺寸，量错了很麻烦。',
            '擦一擦就干净，但得定期擦。', '租房的人一般不愿意自己买。', '客人来了才会特意收拾一下。'],
        tool: ['顺手的时候完全想不起它。', '家里有一把就够，多买也是放着。', '用之前得先确认是不是干净的。',
            '钝了要磨，磨不好就废了。', '放的位置很固定，但每次都要找一下。'],
        daily: ['洗完澡那会儿最常用。', '用完了要补货，不然第二天很尴尬。', '摆在那儿，平时不太留意。',
            '出差的时候一定会带。', '有人讲究牌子，有人随便买。'],
        digital: ['隔两年就想换新的。', '买之前都要比半天参数。', '离开它一会儿就有点不自在。',
            '充电这事经常被忘。', '坏了修不如换，这大概是所有人的共识。', '平时不觉得贵，看账单的时候才觉得。'],
        app: ['手机上装着，用得比想象中多。', '年轻人几乎都有，长辈不一定。', '没事就点开刷两下。',
            '占的地方不大，吃的时间不少。', '更新之后界面总会变一遍。'],
        service: ['忙的时候离不开，闲下来就想不起。', '手机上点两下，就有人上门。', '等的那段时间最难受。',
            '赶上节假日就会变慢。', '出了问题只能反复看那个进度。'],
        transport: ['赶时间才想起它的好。', '高峰时段挤得没法站。', '路线熟的人能省不少时间。',
            '票价最近这些年涨过好几回。', '坐着和站着，是两种体验。', '下雨天最难等。'],
        place: ['平时不一定去，需要的时候才找。', '门口通常有人排队。', '进去了就不太想马上出来。',
            '周末比工作日热闹得多。', '有的免费，有的要提前约。', '第一次去容易找错门。'],
        job: ['外人看着轻松，做起来才知道累。', '熬夜是家常便饭。', '要靠这个吃饭，得练很久。',
            '做得好的和做得一般的，一眼就能看出来。', '逢年过节反而更忙。', '干久了会有点职业病。'],
        animal: ['见过的人多，养过的人少。', '大小差得挺多，脾气也差得挺多。', '看着可爱，真接触要小心。',
            '动起来比静止的时候好看。', '有人怕，有人特别喜欢。', '养它要花不少心思和钱。'],
        sport: ['看的人比玩的人多。', '上手不难，玩好很难。', '场地不好找，约人也要凑时间。',
            '夏天玩起来会出很多汗。', '一个人也能练，但两个人更有意思。'],
        media: ['看完会想跟人聊两句。', '有的能反复看，一遍就够的也有。', '什么时机看，感受差很多。',
            '一个人看和一群人看，完全不一样。', '看完之后会有一阵子走不出来。', '开头慢，但熬过去就好了。'],
        custom: ['一年就那么几次，但每次都挺重视。', '准备的过程比当天还累。', '有人特别在意，有人完全无所谓。',
            '小时候比长大后更期待。', '要花不少钱，但花得心甘情愿。']
    };
    var FALLBACK_ANY = [
        '这东西挺常见的，日常生活里应该都用过。',
        '我说不好，反正见得挺多，各人有各人的习惯吧。',
        '嗯……一个挺日常的东西，说多了就等于告诉你了。',
        '你们先说你们的，我听着呢——我先卖个关子。',
        '我觉得它算不上稀罕物件，家家都可能有。',
        '见过不少次，但真要我形容，还挺难的。',
        '反正不是那种一年用不上一回的东西。',
        '我要是说得再细一点，就等于把答案念出来了。'
    ];
    function fallbackSay(cat) {
        var pool = (FALLBACK_BY_CAT[cat] || FALLBACK_ANY).slice();
        var used = (state && state.saidThisRound ? state.saidThisRound : []).map(function (s) { return s.text; });
        var free = pool.filter(function (x) { return used.indexOf(x) < 0; });
        if (!free.length) {
            pool = FALLBACK_ANY.slice();
            free = pool.filter(function (x) { return used.indexOf(x) < 0; });
        }
        return pick(free.length ? free : pool);
    }

    // 兜底台词不能把词说漏：真漏了就直接换一句
    function sanitizeLine(line, word, cat) {
        if (!line) return line;
        if (word && line.indexOf(word) >= 0) return fallbackSay(cat);
        return line;
    }

    /* ================= 投票 ================= */
    /* 每人投完票要留一句理由：以前只记「谁投了谁」，用户看到的是一堆
       莫名其妙的箭头，自然觉得「投得没逻辑」。理由既给用户看，
       也会一起喂给后面投票的 AI —— 它是可以传染的，跟真人局一样。 */
    function voteLineOf(p) {
        var hit = (state.saidThisRound || []).find(function (x) { return x.pid === p.id; });
        return (hit && !hit.skipped) ? hit.text : '';
    }

    /* 已出局的人是公开信息：身份、第几轮出局的。这是推理里最有价值的锚点。 */
    function deadBrief() {
        var dead = state.players.filter(function (p) { return !p.alive; });
        if (!dead.length) return '（还没有人出局）';
        return dead.map(function (p) {
            return p.name + '（' + (p.role === 'under' ? '卧底' : '平民') + '，第 ' + (p.outRound || '?') + ' 轮出局）';
        }).join('、');
    }

    function allRoundsBrief() {
        var groups = (state.log || []).filter(function (g) { return g && g.items && g.items.length; });
        return groups.map(function (g) {
            return '【第 ' + g.round + ' 轮】' + g.items.map(function (it) {
                return it.name + '：' + it.text;
            }).join('｜');
        }).join('\n') || '（这一轮还没有人说话）';
    }

    /* 这一轮「可以被投」的人：加投时只剩并列的那几个。 */
    function voteCandidates() {
        var alive = state.players.filter(function (p) { return p.alive; });
        if (!state.runoff || !state.runoff.length) return alive;
        var set = {};
        state.runoff.forEach(function (id) { set[id] = 1; });
        var list = alive.filter(function (p) { return set[p.id]; });
        return list.length > 1 ? list : alive;
    }

    function startVote() {
        var alive = state.players.filter(function (p) { return p.alive; });
        var me = alive.find(function (p) { return p.isMe; });
        var cands = voteCandidates();
        var runoff = cands.length < alive.length;
        highlightSpeaker('');
        state.phase = 'vote';
        saveState();
        // 自己已经出局：不能投票，看别人投就行（否则会等一个永远等不到的点击）
        if (!me) {
            setDialog('投票', '你已经出局了，站着看他们投。', true);
            els.actions.innerHTML = '<span class="uc-hintline"><i class="ri-loader-4-line ri-spin"></i> 剩下的人正在投票…</span>';
            setTimeout(function () { collectAiVotes(null, true); }, 1400);
            return;
        }
        setDialog('投票', runoff
            ? '平票了，只在「' + cands.map(function (p) { return p.name; }).join('、') + '」之间再投一次。'
            : '一轮说完了。谁最像卧底？点一个人投票 —— 也可以先追问一句，或者弃票。', true);
        renderVotePanel();
        pendingVote = null;
        waitForMyVote(runToken).then(function (target) {
            if (!target) return;
            collectAiVotes(target === '#abstain' ? null : target, target === '#abstain');
        });
    }

    function renderVotePanel() {
        var alive = voteCandidates();
        els.actions.innerHTML = [
            '<div class="uc-vote" id="uc-vote">' + alive.map(function (p) {
                if (p.isMe) return '';
                return '<button data-vote="' + esc(p.id) + '"><img src="' + esc(p.avatar) + '" alt="">' + esc(p.name) + '</button>';
            }).join('') + '</div>',
            '<div class="uc-vote-foot">',
            '  <button class="uc-btn ghost uc-abstain" id="uc-abstain" title="这轮不投，直接算弃权"><i class="ri-checkbox-blank-circle-line"></i> 弃票</button>',
            '  <div class="uc-ask">',
            '    <input type="text" id="uc-ask-input" maxlength="70" placeholder="想追问谁一句？（可选，回车发送）" autocomplete="off">',
            '    <button class="uc-btn" id="uc-ask-send"><i class="ri-question-line"></i> 问</button>',
            '  </div>',
            '</div>',
            '<span class="uc-hintline">投票时 AI 会看前面每一轮的发言和出局者的身份，投完会写下理由（点「记录」可回看）。</span>'
        ].join('');

        var finish = function (val) {
            if (!pendingVote) return;
            els.actions.querySelectorAll('[data-vote]').forEach(function (b) { b.disabled = true; });
            var r = pendingVote; pendingVote = null; r(val);
        };

        els.actions.querySelectorAll('[data-vote]').forEach(function (btn) {
            btn.addEventListener('click', function () {
                btn.style.borderColor = '#e6c78a';
                btn.style.background = 'rgba(230,199,138,.16)';
                finish(btn.getAttribute('data-vote'));
            });
        });
        els.actions.querySelector('#uc-abstain')?.addEventListener('click', function () { finish('#abstain'); });
        bindAsk();
    }

    /* 投票阶段的自由发言：想问谁就问谁，AI 会顺着答一句。
       以前这里只有一个冷冰冰的投票面板，想追问都没地方打字。 */
    /* 追问时把「你问的 + 他们回的」攒成一段多行对话：
       以前是一次次覆盖式 setDialog，用户只看得见最后一句回答，
       不知道自己问的问题怎么就没了。 */
    function renderTalk(lines) {
        if (!els.dialogText) return;
        if (dialogTimer) { clearInterval(dialogTimer); dialogTimer = null; }
        if (els.whoName) els.whoName.textContent = '自由讨论';
        if (els.whoAv) els.whoAv.style.display = 'none';
        if (els.whoRole) els.whoRole.textContent = '';
        els.dialogText.textContent = lines.join('\n');
    }

    function bindAsk() {
        var input = els.actions.querySelector('#uc-ask-input');
        var send = els.actions.querySelector('#uc-ask-send');
        if (!input || !send) return;
        var busy = false;
        var submit = async function () {
            var v = String(input.value || '').trim();
            if (!v || busy) return;
            var me = state.players.find(function (p) { return p.isMe; });
            if (me && me.word && v.indexOf(me.word) >= 0) {
                toast('别把自己的词说出来', 'ri-error-warning-line');
                return;
            }
            busy = true;
            input.value = '';
            input.placeholder = '等他们回…';
            var meName = (me ? me.name : '你') + '（你）';
            pushTalk(me ? me.name : '你', v);
            var lines = [meName + '：' + v];
            renderTalk(lines);
            await sleep(320);
            var alive = state.players.filter(function (p) { return p.alive && !p.isMe; });
            var askers = shuffle(alive).slice(0, 2);   // 最多两个人接话，别把节奏拖住
            for (var i = 0; i < askers.length; i++) {
                var ans = await aiReplyTo(askers[i], v);
                if (!state || state.phase !== 'vote') return;
                pushTalk(askers[i].name, ans);
                lines.push(askers[i].name + '：' + ans);
                renderTalk(lines);
                await sleep(Math.min(2400, 600 + ans.length * 34));
            }
            busy = false;
            if (input.isConnected) input.placeholder = '想追问谁一句？（可选，回车发送）';
        };
        send.addEventListener('click', submit);
        input.addEventListener('keydown', function (e) { if (e.key === 'Enter') submit(); });
    }

    async function aiReplyTo(p, question) {
        var sys = [
            '你在玩桌游「谁是卧底」，现在是投票前的自由讨论。有人在追问你。',
            '你只知道自己的词，不知道自己是不是卧底。',
            '规则：',
            '- 绝对不能说出自己的词，也不能说出词里的任何一个字。',
            '- 不要明确宣称「我是平民」或「我是卧底」，也不要编造别人的身份。',
            '- 可以为自己辩护、可以反问、可以顺势怀疑别人，一句话，20~40 字。',
            '- 只输出这句话本身，不要引号、不要解释。',
            '',
            '你的名字：' + p.name,
            p.persona ? '说话方式参考：' + personaBrief(p) : '',
            '你的词：' + p.word,
            '你刚才的描述：' + (voteLineOf(p) || '（这轮还没说）'),
            '',
            '这一轮大家说过的话：',
            (state.saidThisRound || []).map(function (x) { return x.name + '：' + x.text; }).join('\n') || '（空）'
        ].filter(Boolean).join('\n');
        var raw = await askAi(sys, question, 200);
        var line = cleanSay(raw);
        if (!line) line = pick([
            '我该说的都说了，信不信由你。',
            '你这么问，我反倒觉得你有点急。',
            '行，那我再补一句：我说的都是我自己看到的。'
        ]);
        return sanitizeLine(line, p.word, state.cat);
    }

    function pushTalk(name, text) {
        var g = state.log[state.log.length - 1];
        if (!g) { g = { round: state.round, items: [] }; state.log.push(g); }
        g.discuss = g.discuss || [];
        g.discuss.push({ name: name, text: text });
        saveState();
    }

    function waitForMyVote(token) {
        return new Promise(function (resolve) {
            if (token !== runToken) { resolve(null); return; }
            pendingVote = resolve;
        });
    }

    /* ---------- 票数兜底：字面相似度 ----------
       模型挂掉的时候不能纯随机投 —— 那才是「投得没逻辑」。这里用 2-gram
       重叠算「这个人的描述和场上其他人是不是一路的」，投最不合群的那个。
       粗糙，但它有一个说得出口的理由，而且比掷骰子稳定得多。 */
    function gramsOf(t) {
        var s = String(t || '').replace(/[，。！？、；：""''「」『』（）《》…—\s,.!?;:'"()\[\]~～-]/g, '');
        var out = {};
        if (s.length === 1) { out[s] = 1; return out; }
        for (var i = 0; i < s.length - 1; i++) out[s.substr(i, 2)] = 1;
        return out;
    }
    function simOf(a, b) {
        var A = gramsOf(a), B = gramsOf(b);
        var ka = Object.keys(A), kb = Object.keys(B);
        if (!ka.length || !kb.length) return 0;
        var inter = 0;
        for (var i = 0; i < ka.length; i++) if (B[ka[i]]) inter++;
        return inter / (ka.length + kb.length - inter);
    }

    /* 引一句对方这轮的原话进理由里：两条理由因此不可能一字不差，
       而且用户点开记录能对上「他到底说了什么」。 */
    function clipSay(line, max) {
        var s = String(line || '').replace(/[，。！？、；：""''「」『』（）《》…—\s,.!?;:'"()\[\]~～-]/g, '');
        var m = max || 9;
        return s.length > m ? s.slice(0, m) + '…' : s;
    }

    var VOTE_TPL = [
        function (q) { return '他这句「' + q + '」跟场上别人不是一个路子'; },
        function (q) { return '「' + q + '」太笼统了，听着像在绕'; },
        function (q) { return '别人都在抠细节，他只说「' + q + '」'; },
        function (q) { return '他那句「' + q + '」跟我的词对不上'; },
        function (q) { return '我记得他说「' + q + '」，方向不太对'; }
    ];

    /** 单个目标最多能吃掉多少票：5 人局 2 票、7 人局 3 票。
        不做这个限制，所有人都按「谁最不合群」排序，票会全砸同一个人。 */
    function voteCap(alive) {
        return Math.max(2, Math.round(alive.length * 0.5));
    }

    /* pool：这一轮「可以被投」的人（平时是全部存活者，加投时只有并列的那几个）；
       all：全部存活者，只用来算相似度和票数上限。 */
    function heuristicVote(p, pool, tally) {
        var all = state.players.filter(function (x) { return x.alive; });
        var others = (pool || all).filter(function (x) { return x.id !== p.id; });
        var cap = voteCap(all);
        var ranked = others.map(function (c) {
            var line = voteLineOf(c);
            var sum = 0, n = 0;
            all.forEach(function (o) {
                if (o.id === c.id) return;
                sum += simOf(line, voteLineOf(o));
                n++;
            });
            var avg = n ? sum / n : 0;
            /* 一句没说的人天然更可疑，但不能是「必定被投」：
               否则一局里只要有一个人跳过发言，其余所有人的票都会砸在他头上，
               看着就像「投票没逻辑」（实测 6 票全指向同一个没说话的人）。
               这里给他一个轻微劣势 + 随机扰动，让票分散开。 */
            var base = line.length === 0 ? -0.05 : avg;
            return { p: c, score: base + (Math.random() - 0.5) * 0.5, len: line.length, line: line };
        });
        ranked.sort(function (a, b) { return a.score - b.score; });
        var t = ranked[0];
        if (!t) return { target: null, reason: '' };
        /* 票已经够集中了：换下一个还可疑的人。真人也会这样——
           有人跟票，也有人坚持自己的判断，而不是五个人排得整整齐齐。 */
        var free = ranked.filter(function (x) { return !tally || (tally[x.p.id] || 0) < cap; });
        if (free.length && free[0] !== t) t = free[0];
        var reason;
        if (t.len === 0) {
            reason = '这轮他一句都没说，先请他解释';
        } else {
            var idx = 0;
            var nm = String(p.name || '');
            for (var i = 0; i < nm.length; i++) idx = (idx + nm.charCodeAt(i)) % VOTE_TPL.length;
            reason = VOTE_TPL[idx](clipSay(t.line, 11));
            if (reason.length > 34) reason = reason.slice(0, 33) + '…';
        }
        return { target: t.p, reason: reason };
    }

    function parseVote(raw, alive, self) {
        var t = String(raw || '').trim();
        if (!t) return null;
        var m = t.match(/(\d{1,2})\s*[|｜,，:：、.。]\s*([\s\S]*)/);
        var idx = m ? parseInt(m[1], 10) : parseInt((t.match(/\d{1,2}/) || [''])[0], 10);
        var reason = m ? m[2].trim() : '';
        reason = reason.replace(/[。.\s]+$/, '').replace(/^["'“”「」\s]+|["'“”「」\s]+$/g, '');
        if (reason.length > 30) reason = reason.slice(0, 30);
        // 编号对不上就按名字找
        var target = (idx >= 1 && idx <= alive.length) ? alive[idx - 1] : null;
        if (!target || target.id === self.id) {
            var hit = alive.find(function (x) { return x.id !== self.id && t.indexOf(x.name) >= 0; });
            target = hit || null;
        }
        if (!target || target.id === self.id) return null;
        return { target: target, reason: reason };
    }

    async function collectAiVotes(myTarget, abstained) {
        var token = runToken;
        var alive = state.players.filter(function (p) { return p.alive; });
        var me = alive.find(function (p) { return p.isMe; });
        var meVote = state.players.find(function (p) { return p.id === myTarget; });
        if (me) { me.vote = abstained ? '#abstain' : myTarget; me.voteReason = abstained ? '弃票' : ''; }
        els.actions.innerHTML = '<span class="uc-hintline"><i class="ri-loader-4-line ri-spin"></i> 其他人正在投票…</span>';

        var voters = alive.filter(function (p) { return !p.isMe; });
        var cands = voteCandidates();
        var dead = deadBrief();
        var rounds = allRoundsBrief();
        /* 边投边记账：后面投的人知道前面已经投给谁了。
           这是「票全砸一个人」的第二道闸（第一道是 heuristicVote 里的 cap）。 */
        var tally = {};
        alive.forEach(function (p) { tally[p.id] = 0; });
        alive.forEach(function (p) { if (p.vote && tally[p.vote] !== undefined) tally[p.vote] += 1; });
        var cap = voteCap(alive);

        /* 两个一批：同时打 8 个请求最容易撞上端点限流，
           而限流的结果就是一片兜底台词 —— 看起来像 AI 集体变傻。 */
        for (var i = 0; i < voters.length; i += 2) {
            var batch = voters.slice(i, i + 2);
            await Promise.all(batch.map(async function (p, k) {
                var candidates = cands.map(function (x, n) {
                    return (n + 1) + '. ' + x.name + (x.isMe ? '（提问的人）' : '');
                }).join('\n');
                var sys = [
                    '你在玩桌游「谁是卧底」，现在要投票。',
                    '规则：绝大多数人拿到的词相同（平民），极少数人拿到的是另一个近义词（卧底）。刚才每人用一句话描述了自己的词。',
                    '你要挑出最像卧底的那个人。',
                    '',
                    '你的名字：' + p.name,
                    '你的词：' + p.word,
                    '你自己刚才说的：' + (voteLineOf(p) || '（这轮还没说）'),
                    p.persona ? '你的性格（只影响判断倾向，不用说出来）：' + personaBrief(p) : '',
                    '',
                    '已经出局的人（身份已经公开，这是全场都知道的信息）：' + dead,
                    '',
                    '从第一轮到现在所有人说过的话：',
                    rounds,
                    '',
                    '候选（编号. 名字）：',
                    candidates,
                    '',
                    '判断参考：',
                    '- 描述和你自己的词对得上、能和你互相印证的，更像同伴；',
                    '- 什么都说不出来、或者明显在绕开具体特征的，更可疑；',
                    '- 已经出局的平民怀疑过谁，可以作为参考，但不要盲从。',
                    '',
                    '你不能投自己，也不能投已经出局的人。',
                    '只输出一行，格式：编号|一句理由（理由 20 字以内，说人话）。',
                    '例：3|他说的跟别人完全不是一回事'
                ].filter(Boolean).join('\n');

                var raw = await askAi(sys, '只输出「编号|理由」这一行。', 120);
                var got = parseVote(raw, cands, p);
                if (!got) {
                    // 模型没给出可用答案：走可解释的相似度兜底，不掷骰子
                    got = heuristicVote(p, cands, tally);
                } else if (got.target && (tally[got.target.id] || 0) >= cap) {
                    // 模型也想投他，但票已经够集中了：换成自己的第二判断，
                    // 免得整局变成「五个人排队投同一个」。
                    var alt = heuristicVote(p, cands, tally);
                    if (alt && alt.target) got = alt;
                }
                p.vote = got && got.target ? got.target.id : null;
                p.voteReason = got && got.reason ? got.reason : '';
                if (p.vote && tally[p.vote] !== undefined) tally[p.vote] += 1;
            }));
            if (token !== runToken) return;
        }
        if (token !== runToken) return;
        settleVote();
    }

    function settleVote() {
        var alive = state.players.filter(function (p) { return p.alive; });
        var tally = {};
        alive.forEach(function (p) { tally[p.id] = 0; });
        alive.forEach(function (p) { if (p.vote && tally[p.vote] !== undefined) tally[p.vote] += 1; });

        var max = 0;
        Object.keys(tally).forEach(function (id) { if (tally[id] > max) max = tally[id]; });
        var top = Object.keys(tally).filter(function (id) { return tally[id] === max; });

        /* 明细写成「A 投 B：理由」：用户抱怨「投得没逻辑」，一半原因是他
           根本看不到别人为什么投。这条明细同时进记录面板，可回看。 */
        var rows = alive.map(function (p) {
            var t = state.players.find(function (x) { return x.id === p.vote; });
            var txt = p.vote === '#abstain' ? '弃票' : (t ? t.name : '弃票');
            // 自己那一票也标一下：不然明细里只有他一票没有理由，看着像漏了
            var why = p.vote === '#abstain' ? '' : (p.voteReason || (p.isMe ? '你投的' : ''));
            return { name: p.name, target: txt, reason: why };
        });
        var lines = rows.map(function (r) {
            return r.name + ' → ' + r.target + (r.reason ? '（' + r.reason + '）' : '');
        }).join('\n');

        var g = state.log[state.log.length - 1];
        var voteRow = { name: '投票', text: rows.map(function (r) { return r.name + '→' + r.target; }).join('，') };
        if (g) { g.votes = rows; g.items.push(voteRow); }
        saveState();

        var abstained = alive.filter(function (p) { return p.vote === '#abstain'; }).length;
        // 票都投完了，底部还挂着「其他人正在投票…」会让人以为卡住了
        if (els.actions) els.actions.innerHTML = '';

        if (top.length !== 1 || max === 0) {
            var tieNames = top.map(function (id) {
                var p = state.players.find(function (x) { return x.id === id; });
                return p ? p.name : id;
            }).join('、');

            /* 平票不能就这么过去：票一分散就会「无人出局 → 下一轮 → 又平票」，
               实测能空转到第 11 轮还没结束，玩起来就是「卡住了」。
               先加投一轮（只在并列者之间），还分不开再按可疑度定。 */
            if (max > 0 && top.length > 1 && !state.runoff) {
                state.runoff = top.slice();
                if (g) g.votesFirst = rows;
                saveState();
                setDialog('投票结果', '平票：' + tieNames + ' 各得 ' + max + ' 票，谁也没过半数。' +
                    '\n' + lines + '\n加投一轮，只在' + tieNames + '之间选。', true);
                setTimeout(function () {
                    if (state && state.phase === 'vote') startVote();
                }, 2200);
                return;
            }
            if (max > 0 && top.length > 1 && state.runoff) {
                var pool = top.map(function (id) {
                    return state.players.find(function (x) { return x.id === id; });
                }).filter(Boolean);
                var allAlive = state.players.filter(function (x) { return x.alive; });
                var weakest = null, weakScore = 9;
                pool.forEach(function (c) {
                    var line = voteLineOf(c);
                    var sum = 0, n = 0;
                    allAlive.forEach(function (o) {
                        if (o.id === c.id) return;
                        sum += simOf(line, voteLineOf(o));
                        n++;
                    });
                    var sc = line.length ? (n ? sum / n : 0) : -1;
                    if (sc < weakScore) { weakScore = sc; weakest = c; }
                });
                if (weakest) {
                    weakest.alive = false;
                    weakest.outRound = state.round;
                    state.eliminated.push({ id: weakest.id, name: weakest.name, role: weakest.role, round: state.round, word: weakest.word });
                    renderCast();
                    state.runoff = null;
                    saveState();
                    setDialog('投票结果', '加投还是平票（' + tieNames + ' 各 ' + max + ' 票），按这轮谁说得最含糊定了「'
                        + weakest.name + '」——' + (weakest.role === 'under' ? '他是卧底！' : '很遗憾，他是平民。')
                        + '\n' + lines, true);
                    setTimeout(function () { finishRound(weakest); }, 2600);
                    return;
                }
            }

            setDialog('投票结果', (max === 0
                ? '全都没投出个结果（' + abstained + ' 张弃票），本轮无人出局。'
                : '平票：' + tieNames + ' 各得 ' + max + ' 票，本轮无人出局。')
                + '\n' + lines, true);
            finishRound(null);
            return;
        }

        var out = state.players.find(function (p) { return p.id === top[0]; });
        state.runoff = null;
        out.alive = false;
        out.outRound = state.round;
        state.eliminated.push({ id: out.id, name: out.name, role: out.role, round: state.round, word: out.word });
        renderCast();
        setDialog('投票结果', '得票最多的是「' + out.name + '」——' + (out.role === 'under' ? '他是卧底！' : '很遗憾，他是平民。') +
            '\n' + lines, true);
        saveState();
        setTimeout(function () { finishRound(out); }, 2400);
    }

    function finishRound(out) {
        state.runoff = null;
        var res = checkOver();
        if (res) { showOver(res); return; }
        state.round += 1;
        state.phase = 'describe';
        saveState();
        var advanced = false;
        var next = function () {
            // 手动点「继续」和 2.6 秒自动继续可能同时到，这里加闸避免一局跳两轮
            if (advanced) return;
            advanced = true;
            setDialog('第 ' + state.round + ' 轮', out
                ? '「' + out.name + '」出局了，剩下 ' + state.players.filter(function (p) { return p.alive; }).length + ' 人。'
                : '本轮没人出局，继续。', true);
            setTimeout(function () { beginRound(); }, 900);
        };
        els.actions.innerHTML = '<button class="uc-btn primary" data-act="next">继续第 ' + state.round + ' 轮 <i class="ri-arrow-right-line"></i></button>';
        els.actions.querySelector('[data-act="next"]').addEventListener('click', next);
        setTimeout(next, 2800);
    }

    function checkOver() {
        var alive = state.players.filter(function (p) { return p.alive; });
        var under = alive.filter(function (p) { return p.role === 'under'; });
        var civil = alive.filter(function (p) { return p.role === 'civil'; });
        if (!under.length) return { winner: 'civil', reason: '卧底全部出局，平民获胜。' };
        if (under.length >= civil.length) return { winner: 'under', reason: '卧底活到最后，平民已经压不过他们了。' };
        if (state.round >= 12) return { winner: 'under', reason: '拖了 12 轮还没抓出卧底，算卧底赢。' };
        return null;
    }

    /* ================= 结算 ================= */
    function showOver(res) {
        state.phase = 'over';
        saveState();
        var me = state.players.find(function (p) { return p.isMe; });
        // ended = 用户自己按的「结束」，不算胜负，只摊牌
        var ended = res.winner === 'ended';
        var iWin = !ended && me && ((res.winner === 'under' && me.role === 'under') || (res.winner === 'civil' && me.role === 'civil'));
        highlightSpeaker('');
        var rows = state.players.map(function (p) {
            return '<div class="uc-rrow"><img src="' + esc(p.avatar) + '" alt="">' +
                '<span class="who">' + esc(p.isMe ? p.name + '（你）' : p.name) + '</span>' +
                '<span class="wd">「' + esc(p.word) + '」</span>' +
                '<span class="rl ' + (p.role === 'under' ? 'under' : 'civil') + '">' + (p.role === 'under' ? '卧底' : '平民') + (p.alive ? '' : ' · 已出局') + '</span>' +
                '</div>';
        }).join('');

        els.root.querySelector('.uc-stage').innerHTML = [
            '<div class="uc-over">',
            '  <h2><i class="' + (ended ? 'ri-flag-2-line' : (iWin ? 'ri-trophy-line' : 'ri-emotion-sad-line')) + '"></i> ' + (ended ? '本局已结束' : (res.winner === 'under' ? '卧底赢了' : '平民赢了')) + '</h2>',
            '  <div class="uc-sub">' + esc(res.reason) + '　·　平民词「' + esc(state.civilWord) + '」／卧底词「' + esc(state.underWord) + '」</div>',
            '  <div class="uc-reveal">' + rows + '</div>',
            '  <div class="uc-row">',
            '    <button class="uc-btn primary" data-act="again"><i class="ri-refresh-line"></i> 再来一局</button>',
            '    <button class="uc-btn" data-act="lobby"><i class="ri-group-line"></i> 重新选人</button>',
            '    <button class="uc-btn ghost" data-act="close2"><i class="ri-close-line"></i> 退出</button>',
            '  </div>',
            '</div>'
        ].join('');
        els.actions.innerHTML = '';
        var endBtn = els.root.querySelector('[data-act="end"]');
        if (endBtn) endBtn.hidden = true;
        setDialog('结算', ended ? '你在第 ' + state.round + ' 轮结束了这一局，下面是所有人的底牌。' : ((iWin ? '这局你赢了。' : '这局你输了。') + res.reason), true);
        handleOverButtons();
    }

    function handleOverButtons() {
        var again = els.root.querySelector('[data-act="again"]');
        if (again) again.addEventListener('click', function () { startGame(); });
        var lobbyBtn = els.root.querySelector('[data-act="lobby"]');
        if (lobbyBtn) lobbyBtn.addEventListener('click', function () { renderLobby(); });
        var c2 = els.root.querySelector('[data-act="close2"]');
        if (c2) c2.addEventListener('click', close);
    }

    /* ================= 存档 ================= */
    function saveState() {
        try {
            if (!state) return;
            localStorage.setItem(SAVE_KEY, JSON.stringify(state));
        } catch (e) { /* 存不下就算了，不影响本局 */ }
    }
    function loadSave() {
        try {
            var raw = localStorage.getItem(SAVE_KEY);
            if (!raw) return null;
            var s = JSON.parse(raw);
            if (!s || !Array.isArray(s.players) || !s.players.length) return null;
            return s;
        } catch (e) { return null; }
    }
    function clearSave() {
        try { localStorage.removeItem(SAVE_KEY); } catch (e) { }
    }

    /* ============================================================
       强制结束
       ------------------------------------------------------------
       不看胜负条件，直接把所有人的词和身份摊开。
       等待中的三种状态都要先解开，否则 runLoop 会挂在 await 上：
         · 等我发言 → pendingLine
         · 等我投票 → pendingVote
         · 等 AI 回复 → 靠 runToken 失效，回来时自己 return
       ============================================================ */
    function forceEnd() {
        if (!state || state.phase === 'over') return;
        var go = function () {
            runToken += 1;
            if (pendingLine) { var l = pendingLine; pendingLine = null; l(''); }
            if (pendingVote) { var v = pendingVote; pendingVote = null; v(null); }
            if (els.actions) els.actions.innerHTML = '';
            showOver({ winner: 'ended', reason: '你在第 ' + state.round + ' 轮手动结束了这一局。' });
        };
        if (window.Dlg && Dlg.confirm) {
            Dlg.confirm({
                title: '现在就结束这一局？',
                message: '会立刻公开所有人的词和身份，这一局不能再继续。已经出局的人也照常列出来。',
                okText: '结束并摊牌',
                cancelText: '接着玩'
            }).then(function (ok) { if (ok) go(); });
        } else {
            go();
        }
    }

    /* ================= 进出 ================= */
    function enterPhase(phase) {
        if (!state) return;
        if (phase === 'describe') { beginRound(); return; }
        if (phase === 'vote') { startVote(); return; }
        if (phase === 'over') { showOver(checkOver() || { winner: 'civil', reason: '对局已结束。' }); return; }
        beginRound();
    }

    function close() {
        runToken += 1;
        // 有正在等待的「我发言 / 我投票」：先解开 promise，否则 runLoop 会永远挂着
        if (pendingLine) { var l = pendingLine; pendingLine = null; l(''); }
        if (pendingVote) { var v = pendingVote; pendingVote = null; v(null); }
        if (els.root) els.root.classList.remove('show');
        document.body.classList.remove('uc-open');
        setTimeout(function () {
            if (els.root && els.root.isConnected) els.root.remove();
            root = null; els = {};
        }, 240);
    }

    function open() {
        // 打开设置弹窗时点进来：先把设置关掉，别盖在游戏上面
        var modal = document.getElementById('ai-settings-modal');
        if (modal) modal.classList.remove('show');
        ensureRoot();
        if (state && state.phase !== 'over') {
            // 已经有一局在进行：直接回舞台上
            els.root.classList.add('show');
            document.body.classList.add('uc-open');
            renderStage();
            revealCardsInstantly();
            setTimeout(function () { enterPhase(state.phase); }, 260);
            return;
        }
        openLobby();
    }

    /* ================= 入口绑定 ================= */
    function bindEntry() {
        var btn = document.getElementById('open-undercover-btn');
        if (!btn || btn.dataset.ucBound === '1') return;
        btn.dataset.ucBound = '1';
        btn.addEventListener('click', function () { open(); });
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bindEntry);
    } else {
        bindEntry();
    }
    // 设置面板是后来才打开的，按钮早就在 DOM 里；这里再兜一次，防止脚本晚于 DOM 就绪
    setTimeout(bindEntry, 1200);

    window.Undercover = {
        open: open,
        close: close,
        isRunning: function () { return Boolean(state && state.phase !== 'over'); },
        clearSave: clearSave
    };
})();
