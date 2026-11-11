/**
 * werewolf.js —— 实验室 ·「狼人杀」
 * ------------------------------------------------------------------
 * 规则（标准 6~12 人局，按人数自动配身份）：
 *   狼人   夜里集体刀一个人。白天伪装成好人。
 *   预言家 夜里验一个人，知道他是狼还是好人。
 *   女巫   有一瓶解药一瓶毒药，各一次；同一夜只能用一瓶。
 *          解药知道当晚谁被杀，毒药可以毒死任何人。
 *   猎人   被狼刀或被投票处决时，可以开枪带走一个人（被毒死不能开枪）。
 *   村民   没有技能，靠推理和投票。
 *
 *   胜负：狼人全部出局 → 好人胜；活着的狼 ≥ 活着的好人 → 狼人胜。
 *
 * 这一版做的取舍：
 *   · 玩家 = 你 + AI 角色（当前群聊成员或自己挑），一共 6~12 人。
 *   · 你也会拿到身份，可能是狼。是狼就参与刀人，是预言家就验人，是女巫就决定救不救。
 *   · AI 的决策走本地启发式（可测、可复现），只有发言走模型；
 *     没配 API 也能整局跑完，只是台词变成模板。
 *   · 界面按视觉小说做：舞台 + 立绘 + 底部对话框 + 打字机 + 右上角身份牌。
 *   · 不进聊天记录，只在 localStorage 存一份快照，刷新/退出能接着玩。
 *   · 顶栏「结束」可以随时摊牌（和谁是卧底一致）。
 */
(function () {
    'use strict';

    if (window.Werewolf) return;

    function moduleEnabled() {
        try {
            if (window.ScriptLoader && typeof ScriptLoader.isEnabled === 'function') {
                return ScriptLoader.isEnabled('werewolf.js');
            }
            var raw = localStorage.getItem('scriptLoadSettings');
            var s = raw ? JSON.parse(raw) : {};
            return !(s && s['werewolf.js'] === false);
        } catch (e) { return true; }
    }
    if (!moduleEnabled()) return;

    var SAVE_KEY = 'myswWerewolf_v1';
    var MAX_AI = 11;          // 你 + 11 = 12 人上限
    var MIN_AI = 5;           // 你 + 5 = 6 人下限

    /* ================= 身份配置 =================
       人数 → 各阵营人数。狼太少没压力，狼太多好人没法玩，按线下常见配比来。 */
    function setupFor(total) {
        var table = {
            6:  { wolf: 2, seer: 1, witch: 1, hunter: 0, villager: 2 },
            7:  { wolf: 2, seer: 1, witch: 1, hunter: 1, villager: 2 },
            8:  { wolf: 2, seer: 1, witch: 1, hunter: 1, villager: 3 },
            9:  { wolf: 3, seer: 1, witch: 1, hunter: 1, villager: 3 },
            10: { wolf: 3, seer: 1, witch: 1, hunter: 1, villager: 4 },
            11: { wolf: 3, seer: 1, witch: 1, hunter: 1, villager: 5 },
            12: { wolf: 4, seer: 1, witch: 1, hunter: 1, villager: 5 }
        };
        return table[Math.max(6, Math.min(12, total))] || table[9];
    }

    var ROLE_META = {
        wolf:     { label: '狼人',   en: 'Werewolf',  side: 'wolf', icon: 'ri-skull-2-line',     desc: '夜里和同伴一起刀人，白天装好人。' },
        seer:     { label: '预言家', en: 'Seer',      side: 'good', icon: 'ri-eye-line',         desc: '每夜验一个人的阵营。' },
        witch:    { label: '女巫',   en: 'Witch',     side: 'good', icon: 'ri-flask-line',       desc: '一瓶解药、一瓶毒药，各一次。' },
        hunter:   { label: '猎人',   en: 'Hunter',    side: 'good', icon: 'ri-crosshair-2-line', desc: '被刀或被投出时开枪带走一个人。' },
        villager: { label: '村民',   en: 'Villager',  side: 'good', icon: 'ri-user-line',        desc: '没有技能，靠推理和投票。' }
    };

    /* ================= 工具 ================= */
    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
            return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
        });
    }
    function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
    function pick(arr, rnd) { return arr[Math.floor((rnd || Math.random)() * arr.length)]; }
    function shuffle(arr) {
        var a = arr.slice();
        for (var i = a.length - 1; i > 0; i--) {
            var j = Math.floor(Math.random() * (i + 1));
            var t = a[i]; a[i] = a[j]; a[j] = t;
        }
        return a;
    }
    function toast(msg, icon) {
        try { if (typeof showToast === 'function') showToast(msg, icon || 'ri-information-line'); } catch (e) { }
    }
    function roleLabel(p) { return ROLE_META[p.role] ? ROLE_META[p.role].label : p.role; }

    /* 主站是构建脚本拼出来的单文件，顶层 let 不挂 window；
       统一用 typeof 兜底，取不到就返回空。 */
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
        try { return JSON.parse(localStorage.getItem('aiChatSettings') || '{}') || {}; } catch (e) { return {}; }
    }
    function hasApi() {
        var s = apiSettings();
        return Boolean(s && s.apiUrl && s.apiKey);
    }
    function askAi(system, user, maxTokens) {
        var s = apiSettings();
        if (!s || !s.apiUrl || !window.ApiModule || typeof ApiModule.requestSmallTask !== 'function') {
            return Promise.resolve('');
        }
        var task = ApiModule.requestSmallTask(s, system, user, {
            maxTokens: maxTokens || 120,
            temperature: 0.95,
            label: '狼人杀'
        }).catch(function () { return ''; });
        var timeout = new Promise(function (r) { setTimeout(function () { r(''); }, 26000); });
        return Promise.race([task, timeout]).then(function (v) {
            return String(v == null ? '' : v).trim();
        });
    }

    /* ================= 状态 ================= */
    var state = null;
    var lobbySel = [];
    var runToken = 0;
    var pendingChoice = null;      // 等待玩家点选目标的 resolver

    /* ================= 样式 ================= */
    var STYLE_ID = 'mysw-werewolf-style';
    function injectStyle() {
        if (document.getElementById(STYLE_ID)) return;
        var css = [
            '.ww-root{position:fixed;inset:0;z-index:9400;display:flex;flex-direction:column;background:#07080c;color:#e8eaf0;font-family:inherit;overflow:hidden;opacity:0;transition:opacity .22s ease;}',
            '.ww-root.show{opacity:1;}',
            '.ww-bg{position:absolute;inset:0;background:radial-gradient(120% 90% at 50% 0%,#1a2036 0%,#0a0c14 55%,#05060a 100%);}',
            '.ww-root.is-night .ww-bg{background:radial-gradient(120% 90% at 50% 0%,#101a35 0%,#05070f 55%,#020306 100%);}',
            '.ww-root.is-day .ww-bg{background:radial-gradient(120% 90% at 50% 0%,#2a2438 0%,#120f18 55%,#08060c 100%);}',
            '.ww-vignette{position:absolute;inset:0;pointer-events:none;background:radial-gradient(120% 80% at 50% 45%,transparent 40%,rgba(0,0,0,.62) 100%);}',
            '.ww-top{position:relative;z-index:9;display:flex;align-items:center;gap:10px;padding:14px 20px;flex:0 0 auto;}',
            '.ww-title{display:flex;align-items:center;gap:8px;font-weight:700;letter-spacing:.02em;color:#e6c78a;font-size:1rem;}',
            '.ww-title i{font-size:1.15rem;}',
            '.ww-round{font-size:.74rem;padding:2px 10px;border-radius:99px;border:1px solid rgba(230,199,138,.3);background:rgba(230,199,138,.1);color:#e6c78a;white-space:nowrap;}',
            '.ww-spacer{flex:1 1 auto;}',
            '.ww-btn{height:34px;padding:0 13px;border-radius:9px;border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.06);color:#e8eaf0;font-size:.82rem;display:inline-flex;align-items:center;gap:6px;cursor:pointer;transition:all .16s ease;font-family:inherit;}',
            '.ww-btn:hover{background:rgba(255,255,255,.12);border-color:rgba(230,199,138,.4);}',
            '.ww-btn.primary{background:linear-gradient(150deg,#f0d9a9,#d7b273);color:#241c0d;border-color:transparent;font-weight:600;}',
            '.ww-btn.primary:hover{filter:brightness(1.06);}',
            '.ww-btn.ghost{background:transparent;}',
            '.ww-btn:disabled{opacity:.4;cursor:not-allowed;}',
            /* 身份牌：右上角，和卧底的牌位一致 */
            '.ww-cards{position:absolute;top:58px;right:20px;z-index:8;display:flex;gap:10px;}',
            '.ww-card{width:82px;height:114px;perspective:900px;cursor:pointer;opacity:0;transform:translateX(24px) rotate(-6deg);transition:opacity .3s ease,transform .3s ease;}',
            '.ww-card.in{opacity:1;transform:none;}',
            '.ww-card .ww-inner{position:relative;width:100%;height:100%;transform-style:preserve-3d;transition:transform .72s cubic-bezier(.25,.8,.25,1);}',
            '.ww-card.flipped .ww-inner{transform:rotateY(180deg);}',
            '.ww-face{position:absolute;inset:0;border-radius:12px;backface-visibility:hidden;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:7px;box-shadow:0 10px 26px rgba(0,0,0,.5);border:1px solid rgba(255,255,255,.14);}',
            '.ww-face.front{background:linear-gradient(160deg,#20242f,#141821);color:#6f7686;}',
            '.ww-face.front i{font-size:1.5rem;}',
            '.ww-face.front span{font-size:.6rem;letter-spacing:.18em;}',
            '.ww-face.back{transform:rotateY(180deg);background:linear-gradient(160deg,#f3ddb0,#d5ac68);color:#241c0d;}',
            '.ww-face.back.wolf{background:linear-gradient(160deg,#e08a8a,#a84141);color:#2a0d0d;}',
            '.ww-k{font-size:.6rem;opacity:.72;letter-spacing:.05em;}',
            '.ww-v{font-size:.98rem;font-weight:700;line-height:1.15;text-align:center;padding:0 4px;}',
            /* 舞台 */
            '.ww-stage{position:relative;z-index:4;flex:1 1 auto;min-height:0;display:flex;align-items:center;justify-content:center;padding:0 18px 10px;}',
            '.ww-cast{display:flex;align-items:flex-end;justify-content:center;gap:14px;flex-wrap:wrap;max-width:1120px;position:relative;}',
            '.ww-p{width:104px;display:flex;flex-direction:column;align-items:center;gap:6px;transition:transform .3s ease,opacity .3s ease;position:relative;}',
            '.ww-p .av{width:84px;height:84px;border-radius:50%;object-fit:cover;border:2px solid rgba(255,255,255,.14);background:#20242d;box-shadow:0 10px 26px rgba(0,0,0,.5);}',
            '.ww-p .nm{font-size:.78rem;color:#cdd3df;text-align:center;line-height:1.3;}',
            '.ww-p.dead{opacity:.42;filter:grayscale(1);}',
            '.ww-p.dead .av{border-color:rgba(200,80,80,.5);}',
            '.ww-p.speaking{transform:translateY(-8px);}',
            '.ww-p.speaking .av{border-color:#e6c78a;box-shadow:0 0 0 3px rgba(230,199,138,.24),0 12px 28px rgba(0,0,0,.55);}',
            '.ww-p.selectable{cursor:pointer;}',
            '.ww-p.selectable:hover{transform:translateY(-6px);}',
            '.ww-p.selectable:hover .av{border-color:#f0a878;}',
            '.ww-p .tag{position:absolute;top:-6px;right:12px;font-size:.6rem;padding:1px 6px;border-radius:99px;font-weight:600;}',
            '.ww-p .tag.wolf{background:#a84141;color:#ffe8e8;}',
            '.ww-p .tag.good{background:#3f7a56;color:#e6fff0;}',
            '.ww-p .tag.vote{background:#e6c78a;color:#241c0d;}',
            '.ww-p .tag.myvote{background:#7f8cff;color:#0d0f24;}',
            /* 对话框 */
            '.ww-dialog{position:relative;z-index:6;flex:0 0 auto;margin:0 22px;padding:14px 20px 16px;border-radius:14px;background:rgba(14,16,22,.9);border:1px solid rgba(255,255,255,.1);box-shadow:0 18px 40px rgba(0,0,0,.5);backdrop-filter:blur(8px);}',
            '.ww-who{display:flex;align-items:center;gap:8px;font-size:.82rem;color:#e6c78a;margin-bottom:6px;}',
            '.ww-who img{width:22px;height:22px;border-radius:50%;object-fit:cover;}',
            '.ww-role{font-size:.72rem;color:#8b93a3;}',
            '.ww-text{font-size:.94rem;line-height:1.7;color:#e2e6ee;min-height:2.6em;white-space:pre-wrap;}',
            '.ww-text .caret{display:inline-block;width:7px;height:1em;background:#e6c78a;vertical-align:-2px;animation:wwBlink .9s steps(1) infinite;margin-left:1px;}',
            '@keyframes wwBlink{50%{opacity:0}}',
            '.ww-actions{position:relative;z-index:7;flex:0 0 auto;display:flex;flex-wrap:wrap;gap:8px;justify-content:center;padding:10px 22px 18px;}',
            '.ww-hintline{font-size:.8rem;color:#8b93a3;display:inline-flex;align-items:center;gap:6px;}',
            '.ww-input{display:flex;gap:8px;width:min(760px,92vw);}',
            '.ww-input textarea{flex:1 1 auto;min-height:44px;max-height:110px;resize:none;border-radius:10px;border:1px solid rgba(255,255,255,.16);background:rgba(255,255,255,.05);color:#e8eaf0;padding:11px 12px;font-family:inherit;font-size:.9rem;line-height:1.5;}',
            '.ww-input textarea:focus{outline:none;border-color:rgba(230,199,138,.5);}',
            /* 夜晚遮罩 */
            '.ww-nightveil{position:absolute;inset:0;z-index:5;pointer-events:none;background:linear-gradient(180deg,rgba(4,8,20,.55),rgba(2,3,8,.72));opacity:0;transition:opacity .5s ease;}',
            '.ww-root.is-night .ww-nightveil{opacity:1;}',
            /* 大厅 */
            '.ww-lobby{position:relative;z-index:6;flex:1 1 auto;overflow-y:auto;padding:8px 24px 30px;}',
            '.ww-lobby-in{max-width:900px;margin:0 auto;display:flex;flex-direction:column;gap:14px;}',
            '.ww-hero h2{font-size:1.02rem;color:#e6c78a;margin-bottom:8px;display:flex;align-items:center;gap:8px;}',
            '.ww-hero p{font-size:.86rem;line-height:1.8;color:#aab2c0;}',
            '.ww-sec-title{font-size:.86rem;color:#dfe4ec;font-weight:600;display:flex;align-items:center;gap:8px;margin-bottom:8px;}',
            '.ww-sec-title small{font-weight:400;color:#7d8493;font-size:.76rem;}',
            '.ww-picker{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px;}',
            '.ww-chip{display:flex;align-items:center;gap:8px;padding:7px 10px;border-radius:10px;border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.03);cursor:pointer;transition:all .16s ease;font-size:.84rem;color:#c8cedb;}',
            '.ww-chip img{width:26px;height:26px;border-radius:50%;object-fit:cover;}',
            '.ww-chip.on{border-color:rgba(230,199,138,.55);background:rgba(230,199,138,.12);color:#f0e3c6;}',
            '.ww-chip .tick{opacity:0;color:#e6c78a;margin-left:auto;}',
            '.ww-chip.on .tick{opacity:1;}',
            '.ww-row{display:flex;gap:10px;align-items:center;flex-wrap:wrap;}',
            '.ww-hintline{font-size:.78rem;color:#7d8493;}',
            /* 结算 */
            '.ww-over{max-width:720px;margin:0 auto;text-align:center;padding:10px 0;}',
            '.ww-over h2{font-size:1.4rem;color:#e6c78a;display:flex;align-items:center;justify-content:center;gap:10px;margin-bottom:8px;}',
            '.ww-sub{font-size:.84rem;color:#98a0b0;margin-bottom:16px;line-height:1.7;}',
            '.ww-reveal{display:flex;flex-direction:column;gap:6px;text-align:left;}',
            '.ww-rrow{display:flex;align-items:center;gap:10px;padding:7px 10px;border-radius:9px;background:rgba(255,255,255,.04);font-size:.84rem;}',
            '.ww-rrow img{width:26px;height:26px;border-radius:50%;object-fit:cover;}',
            '.ww-rrow .who{flex:1 1 auto;color:#dfe4ec;}',
            '.ww-rrow .rl{font-size:.72rem;padding:1px 8px;border-radius:99px;}',
            '.ww-rrow .rl.wolf{background:rgba(200,80,80,.22);color:#ffb4b4;}',
            '.ww-rrow .rl.good{background:rgba(80,180,120,.18);color:#a8eec4;}',
            '.ww-rrow.dead{opacity:.55;}',
            /* 记录 */
            '.ww-logbox{position:absolute;top:58px;right:20px;width:min(360px,80vw);max-height:60vh;overflow-y:auto;z-index:12;background:rgba(12,14,20,.97);border:1px solid rgba(255,255,255,.12);border-radius:12px;padding:12px 14px;font-size:.82rem;line-height:1.7;box-shadow:0 20px 44px rgba(0,0,0,.6);}',
            '.ww-lg{color:#e6c78a;font-weight:600;margin:10px 0 4px;}',
            '.ww-lg:first-child{margin-top:0;}',
            '.ww-li{display:flex;gap:8px;color:#aab2c0;}',
            '.ww-li b{color:#dfe4ec;font-weight:600;flex:0 0 auto;}',
            '@media (max-width:640px){',
            '.ww-top{padding:10px 12px;gap:6px;flex-wrap:nowrap;}',
            '.ww-title{font-size:.9rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0;}',
            '.ww-round{font-size:.68rem;padding:1px 7px;}',
            '.ww-top .ww-btn{height:30px;padding:0 9px;font-size:.76rem;}',
            '.ww-cards{top:54px;right:10px;}',
            '.ww-card{width:64px;height:90px;}',
            '.ww-p{width:76px;}',
            '.ww-p .av{width:58px;height:58px;}',
            '.ww-p .nm{font-size:.68rem;}',
            '.ww-cast{gap:8px;}',
            '.ww-dialog{margin:0 10px;padding:11px 13px 13px;}',
            '.ww-text{font-size:.86rem;}',
            '.ww-lobby{padding:6px 14px 24px;}',
            '.ww-picker{grid-template-columns:repeat(auto-fill,minmax(120px,1fr));}',
            '}'
        ].join('\n');
        var el = document.createElement('style');
        el.id = STYLE_ID;
        el.textContent = css;
        document.head.appendChild(el);
    }

    /* ================= DOM ================= */
    var root = null;
    var els = {};

    function ensureRoot() {
        injectStyle();
        var r = document.getElementById('ww-root');
        if (r && r.isConnected) { root = r; els.root = r; return; }
        root = document.createElement('div');
        root.className = 'ww-root';
        root.id = 'ww-root';
        document.body.appendChild(root);
        els.root = root;
    }

    /* ================= 大厅 ================= */
    function allCharacters() {
        var out = [];
        try {
            var data = friendsMap();
            Object.keys(data).forEach(function (id) {
                var f = data[id];
                if (!f || f.isGroup) return;
                out.push({ id: String(id), name: String(f.name || id), avatar: String(f.avatar || '') });
            });
        } catch (e) { }
        return out;
    }
    function groupMembers() {
        try {
            var gid = currentFriend();
            var g = groupsMap()[gid];
            if (!g || !Array.isArray(g.memberIds)) return [];
            return g.memberIds.map(function (id) {
                var f = friendsMap()[id];
                return f && !f.isGroup ? { id: String(id), name: String(f.name || id), avatar: String(f.avatar || '') } : null;
            }).filter(Boolean);
        } catch (e) { return []; }
    }

    function renderLobby() {
        var chars = allCharacters();
        var group = groupMembers();
        if (!lobbySel.length && group.length) lobbySel = group.slice(0, MAX_AI).map(function (p) { return p.id; });

        var saved = loadSave();
        var chips = chars.map(function (c) {
            var on = lobbySel.indexOf(c.id) >= 0;
            return '<div class="ww-chip' + (on ? ' on' : '') + '" data-pick="' + esc(c.id) + '">' +
                '<img src="' + esc(c.avatar) + '" alt="">' +
                '<span>' + esc(c.name) + '</span>' +
                '<i class="ri-check-line tick"></i>' +
                '</div>';
        }).join('') || '<p class="ww-hintline">还没有角色，先去添加或导入角色卡。</p>';

        var total = lobbySel.length + 1;
        var cfg = setupFor(total);

        els.root.innerHTML = [
            '<div class="ww-bg"></div><div class="ww-vignette"></div>',
            '<div class="ww-top">',
            '  <div class="ww-title"><i class="ri-moon-clear-line"></i> 狼人杀</div>',
            '  <div class="ww-spacer"></div>',
            '  <button class="ww-btn ghost" data-act="close"><i class="ri-close-line"></i> 退出</button>',
            '</div>',
            '<div class="ww-lobby"><div class="ww-lobby-in">',
            '  <div class="ww-hero">',
            '    <h2><i class="ri-question-answer-line"></i> 规则（和线下一样）</h2>',
            '    <p>好人里有<b>预言家</b>（每夜验一人）、<b>女巫</b>（一瓶解药一瓶毒药）、<b>猎人</b>（被刀或被投出时开枪带走一人），其余是<b>村民</b>。' +
            '<b>狼人</b>夜里集体刀一个人，白天装作好人。<br>天亮公布死者 → 依次发言 → 全员投票处决 → 再入夜。' +
            '狼人全部出局好人赢；活着的狼不比好人少，狼人赢。</p>',
            '  </div>',
            saved && saved.phase !== 'over'
                ? '  <div class="ww-row"><button class="ww-btn primary" data-act="resume"><i class="ri-history-line"></i> 继续上一局（第 ' + (saved.day || 1) + ' 天）</button>' +
                  '<span class="ww-hintline">上一局还没打完，选人开局会覆盖它。</span></div>'
                : '',
            '  <div>',
            '    <div class="ww-sec-title"><i class="ri-group-line"></i> 选谁陪你玩 <small>' +
            (total - 1 < MIN_AI
                ? '（还要再选 ' + (MIN_AI - (total - 1)) + ' 个角色，至少 6 人才能开局）'
                : '（你自己也算一个，共 ' + total + ' 人：' + cfg.wolf + ' 狼 / ' + (total - cfg.wolf) + ' 好人）') +
            '</small></div>',
            group.length
                ? '    <div class="ww-row" style="margin-bottom:8px;"><button class="ww-btn" data-act="use-group"><i class="ri-group-2-line"></i> 用当前群聊的 ' + group.length + ' 位成员</button>' +
                  '<button class="ww-btn" data-act="clear">清空</button></div>'
                : '    <div class="ww-row" style="margin-bottom:8px;"><button class="ww-btn" data-act="clear">清空</button></div>',
            '    <div class="ww-picker">' + chips + '</div>',
            '  </div>',
            '  <div class="ww-row">',
            '    <button class="ww-btn primary" data-act="start"' + (lobbySel.length < MIN_AI ? ' disabled' : '') + '>' +
            '      <i class="ri-play-fill"></i> 开始（' + total + ' 人）',
            '    </button>',
            '    <span class="ww-hintline">至少 6 人（你 + 5 个角色），最多 12 人。身份随机分配。</span>',
            '  </div>',
            '</div></div>'
        ].join('');

        els.root.querySelectorAll('[data-pick]').forEach(function (c) {
            c.addEventListener('click', function () {
                var id = c.getAttribute('data-pick');
                var i = lobbySel.indexOf(id);
                if (i >= 0) lobbySel.splice(i, 1);
                else if (lobbySel.length < MAX_AI) lobbySel.push(id);
                else toast('最多 12 人', 'ri-information-line');
                renderLobby();
            });
        });
        els.root.querySelector('[data-act="close"]')?.addEventListener('click', close);
        els.root.querySelector('[data-act="clear"]')?.addEventListener('click', function () { lobbySel = []; renderLobby(); });
        els.root.querySelector('[data-act="use-group"]')?.addEventListener('click', function () {
            lobbySel = group.slice(0, MAX_AI).map(function (p) { return p.id; });
            renderLobby();
        });
        els.root.querySelector('[data-act="resume"]')?.addEventListener('click', resumeSaved);
        els.root.querySelector('[data-act="start"]')?.addEventListener('click', function () {
            if (lobbySel.length < MIN_AI) return;
            startGame();
        });
    }

    /* ================= 开局 ================= */
    function myProfile() {
        var name = '你';
        var avatar = '';
        try {
            var n = myNameSafe().trim();
            if (n) name = n;
            var el = document.getElementById('input-avatar');
            if (el && el.src) avatar = el.src;
        } catch (e) { }
        return { name: name, avatar: avatar };
    }

    function startGame() {
        var chars = allCharacters().filter(function (c) { return lobbySel.indexOf(c.id) >= 0; });
        if (chars.length < MIN_AI) { toast('至少选 5 个角色', 'ri-information-line'); return; }
        var me = myProfile();
        var players = [{ id: 'me', name: me.name, avatar: me.avatar, isMe: true }].concat(
            chars.map(function (c) { return { id: c.id, name: c.name, avatar: c.avatar, isMe: false }; })
        );
        var total = players.length;
        var cfg = setupFor(total);

        // 身份池
        var pool = [];
        ['wolf', 'seer', 'witch', 'hunter', 'villager'].forEach(function (r) {
            var n = cfg[r] || 0;
            for (var i = 0; i < n; i++) pool.push(r);
        });
        while (pool.length < total) pool.push('villager');
        pool = shuffle(pool).slice(0, total);

        players.forEach(function (p, i) {
            p.role = pool[i];
            p.alive = true;
            p.index = i;
        });

        state = {
            v: 1,
            phase: 'night',
            day: 1,
            players: players,
            order: players.map(function (p) { return p.id; }),
            witchHeal: true,
            witchPoison: true,
            lastNight: null,          // { killed, saved, poisoned, deathIds:[] }
            votes: {},                // 投票阶段
            voteDetail: [],
            log: [],                  // [{ day, items:[{name, text}] }]
            history: [],              // 每夜/每天一句话的摘要，供 AI 参考
            showRole: true,
            startedAt: Date.now()
        };
        runToken += 1;
        renderStage();
        playReveal(runToken);
        saveState();
    }

    function playReveal(token) {
        var me = state.players.find(function (p) { return p.isMe; });
        var cards = els.root.querySelectorAll('.ww-card');
        cards.forEach(function (c, i) {
            setTimeout(function () { c.classList.add('in'); }, 160 + i * 110);
        });
        setTimeout(function () {
            if (token !== runToken) return;
            cards[0] && cards[0].classList.add('flipped');
        }, 700);
        var meta = ROLE_META[me.role];
        setDialog(me.name, '你的身份是「' + meta.label + '」。' + meta.desc, true);
        setTimeout(function () {
            if (token !== runToken) return;
            beginNight();
        }, 2100);
    }

    /* ================= 舞台 ================= */
    function cardHtml(me) {
        var meta = ROLE_META[me.role];
        return [
            '<div class="ww-cards">',
            '  <div class="ww-card" data-card="role" title="点一下看你的身份">',
            '    <div class="ww-inner">',
            '      <div class="ww-face front"><i class="ri-question-mark"></i><span>ROLE</span></div>',
            '      <div class="ww-face back ' + (meta.side === 'wolf' ? 'wolf' : '') + '">',
            '        <div class="ww-k">你的身份</div><div class="ww-v">' + esc(meta.label) + '</div>',
            '      </div>',
            '    </div>',
            '  </div>',
            '</div>'
        ].join('');
    }

    function castHtml() {
        return state.players.map(function (p) {
            var cls = 'ww-p' + (p.isMe ? ' me' : '') + (p.alive ? '' : ' dead');
            var tag = '';
            // 死了就公开身份（线下也是翻牌）
            if (!p.alive) {
                var side = ROLE_META[p.role].side;
                tag = '<span class="tag ' + (side === 'wolf' ? 'wolf' : 'good') + '">' + roleLabel(p) + '</span>';
            } else if (p.isMe) {
                var ms = ROLE_META[p.role].side;
                tag = '<span class="tag ' + (ms === 'wolf' ? 'wolf' : 'good') + '">' + roleLabel(p) + '</span>';
            }
            var vt = '';
            if (p.alive && state.phase === 'vote' && state.votes && state.votes[p.id]) {
                vt = '<span class="tag myvote" style="top:auto;bottom:-4px;right:8px;">→</span>';
            }
            return '<div class="' + cls + '" data-pid="' + esc(p.id) + '">' +
                '<img class="av" src="' + esc(p.avatar) + '" alt="">' +
                '<div class="nm">' + esc(p.isMe ? (p.name + '（你）') : p.name) + '</div>' +
                tag + vt +
                '</div>';
        }).join('');
    }

    function renderCast() {
        if (!els.cast) return;
        els.cast.innerHTML = castHtml();
    }

    function renderStage() {
        var me = state.players.find(function (p) { return p.isMe; }) || state.players[0];
        els.root.className = 'ww-root show ' + (state.phase === 'night' ? 'is-night' : 'is-day');
        els.root.innerHTML = [
            '<div class="ww-bg"></div><div class="ww-nightveil"></div><div class="ww-vignette"></div>',
            cardHtml(me),
            '<div class="ww-top">',
            '  <div class="ww-title"><i class="ri-moon-clear-line"></i> 狼人杀</div>',
            '  <div class="ww-round" id="ww-round">第 1 天</div>',
            '  <div class="ww-spacer"></div>',
            '  <button class="ww-btn ghost" data-act="log" title="每天谁说了什么"><i class="ri-file-list-3-line"></i> 记录</button>',
            '  <button class="ww-btn ghost" data-act="end" title="不看胜负条件，直接摊牌" aria-label="结束本局"><i class="ri-flag-line"></i> 结束</button>',
            '  <button class="ww-btn ghost" data-act="quit"><i class="ri-logout-box-r-line"></i> 退出</button>',
            '</div>',
            '<div class="ww-stage"><div class="ww-cast" id="ww-cast">' + castHtml() + '</div></div>',
            '<div class="ww-dialog">',
            '  <div class="ww-who"><img id="ww-who-av" src="" alt=""><span id="ww-who-name">游戏开始</span><span class="ww-role" id="ww-who-role"></span></div>',
            '  <div class="ww-text" id="ww-text"></div>',
            '</div>',
            '<div class="ww-actions" id="ww-actions"></div>',
            '<div class="ww-logbox" id="ww-logbox" hidden></div>'
        ].join('');

        els.cast = els.root.querySelector('#ww-cast');
        els.dialogText = els.root.querySelector('#ww-text');
        els.whoName = els.root.querySelector('#ww-who-name');
        els.whoRole = els.root.querySelector('#ww-who-role');
        els.whoAv = els.root.querySelector('#ww-who-av');
        els.actions = els.root.querySelector('#ww-actions');
        els.roundTag = els.root.querySelector('#ww-round');
        els.logbox = els.root.querySelector('#ww-logbox');

        els.root.querySelectorAll('.ww-card').forEach(function (c) {
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

        if (els.roundTag) els.roundTag.textContent = '第 ' + state.day + ' 天';
    }

    /* 续局：把身份牌直接摆正（和卧底同样的坑：卡片默认透明+未翻） */
    function revealCardsInstantly() {
        if (!els.root || !state) return;
        var cards = els.root.querySelectorAll('.ww-card');
        if (!cards.length) return;
        requestAnimationFrame(function () {
            Array.prototype.forEach.call(cards, function (c) {
                c.classList.add('in');
                c.setAttribute('data-ready', '1');
            });
            if (cards[0] && state.showRole) cards[0].classList.add('flipped');
        });
    }

    function highlightSpeaker(pid) {
        if (!els.cast) return;
        els.cast.querySelectorAll('.ww-p').forEach(function (el) {
            el.classList.toggle('speaking', el.getAttribute('data-pid') === pid);
        });
    }

    function markSelectable(ids) {
        if (!els.cast) return;
        var set = {};
        (ids || []).forEach(function (id) { set[id] = true; });
        els.cast.querySelectorAll('.ww-p').forEach(function (el) {
            el.classList.toggle('selectable', !!set[el.getAttribute('data-pid')]);
        });
    }

    var dialogTimer = null;
    function setDialog(name, text, instant) {
        if (!els.dialogText) return;
        if (dialogTimer) { clearInterval(dialogTimer); dialogTimer = null; }
        var p = state && state.players.find(function (x) { return x.name === name; });
        if (els.whoName) els.whoName.textContent = name || '';
        if (els.whoAv) {
            var av = (p && p.avatar) || '';
            els.whoAv.src = av;
            els.whoAv.style.display = av ? '' : 'none';
        }
        if (els.whoRole) els.whoRole.textContent = p && p.isMe ? '（你）' : '';
        if (instant) { els.dialogText.textContent = text; return; }
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
        }, 26);
        dialogTimer = timer;
    }

    function toggleLog() {
        if (!els.logbox) return;
        els.logbox.hidden = !els.logbox.hidden;
        if (els.logbox.hidden) return;
        els.logbox.innerHTML = state.log.map(function (g) {
            return '<div class="ww-lg">第 ' + g.day + ' 天</div>' + g.items.map(function (it) {
                return '<div class="ww-li"><b>' + esc(it.name) + '</b><span>' + esc(it.text) + '</span></div>';
            }).join('');
        }).join('') || '<div class="ww-lg">还没有记录</div>';
    }

    function logLine(name, text) {
        var last = state.log[state.log.length - 1];
        if (!last || last.day !== state.day) { last = { day: state.day, items: [] }; state.log.push(last); }
        last.items.push({ name: name, text: text });
    }

    /* ================= 玩家选择 ================= */
    function waitForPick(candidates, promptText) {
        return new Promise(function (resolve) {
            pendingChoice = resolve;
            markSelectable(candidates.map(function (p) { return p.id; }));
            var handler = function (ev) {
                var el = ev.target && ev.target.closest ? ev.target.closest('.ww-p.selectable') : null;
                if (!el) return;
                var pid = el.getAttribute('data-pid');
                if (candidates.every(function (p) { return p.id !== pid; })) return;
                cleanup();
                resolve(pid);
            };
            var cleanup = function () {
                els.cast.removeEventListener('click', handler);
                markSelectable([]);
                pendingChoice = null;
            };
            els.cast.addEventListener('click', handler);
            // 也允许通过底部按钮取消（例如女巫选择不用药）
            pendingChoiceCleanup = cleanup;
        });
    }
    var pendingChoiceCleanup = null;

    function clearPending() {
        if (pendingChoiceCleanup) { try { pendingChoiceCleanup(); } catch (e) { } pendingChoiceCleanup = null; }
        if (pendingChoice) { var r = pendingChoice; pendingChoice = null; r(null); }
    }

    function alivePlayers() { return state.players.filter(function (p) { return p.alive; }); }
    function byId(id) { return state.players.find(function (p) { return p.id === id; }); }
    function wolvesAlive() { return alivePlayers().filter(function (p) { return p.role === 'wolf'; }); }
    function goodsAlive() { return alivePlayers().filter(function (p) { return ROLE_META[p.role].side === 'good'; }); }

    function checkOver() {
        var w = wolvesAlive().length;
        var g = goodsAlive().length;
        if (w === 0) return { winner: 'good', reason: '狼人全部出局，好人获胜。' };
        if (w >= g) return { winner: 'wolf', reason: '活着的狼已经不少于好人，狼人获胜。' };
        return null;
    }

    /* ================= 夜晚 ================= */
    function beginNight() {
        if (!state) return;
        votingNow = false;
        state.phase = 'night';
        state.votes = {};
        state.lastNight = null;
        /* 每夜都整页重建会把右上角的身份牌重置回「未翻面 + 透明」，
           续局时看起来就像牌丢了。舞台已经在场时只切状态、重画立绘。 */
        if (els.root && els.root.querySelector('#ww-cast')) {
            els.root.className = 'ww-root show is-night';
            if (els.roundTag) els.roundTag.textContent = '第 ' + state.day + ' 天';
            var endBtn = els.root.querySelector('[data-act="end"]');
            if (endBtn) endBtn.hidden = false;
            renderCast();
        } else {
            renderStage();
        }
        runToken += 1;
        nightFlow(runToken);
    }

    async function nightFlow(token) {
        var me = state.players.find(function (p) { return p.isMe; });
        els.root.classList.add('is-night');
        highlightSpeaker('');
        setDialog('天黑请闭眼', '第 ' + state.day + ' 夜。所有人闭眼。', true);
        await sleep(900);
        if (token !== runToken) return;

        /* ---- 狼人 ---- */
        var wolves = wolvesAlive();
        var wolfTargetId = null;
        var meIsWolf = me.alive && me.role === 'wolf';
        var candidatesForWolf = alivePlayers().filter(function (p) { return p.role !== 'wolf' || !p.isMe; })
            .filter(function (p) { return ROLE_META[p.role].side === 'good'; });

        if (meIsWolf) {
            var mates = wolves.filter(function (p) { return !p.isMe; });
            setDialog('狼人请睁眼', '你是狼人。' + (mates.length ? '同伴：' + mates.map(function (m) { return m.name; }).join('、') + '。' : '（你是唯一的狼。）') + '选一个今晚要刀的人。', true);
            if (mates.length) {
                var matePick = wolfPickAi(candidatesForWolf);
                els.actions.innerHTML = '<span class="ww-hintline"><i class="ri-information-line"></i> 同伴倾向刀「' + esc(byId(matePick) ? byId(matePick).name : '随机') + '」，你可以改。</span>';
            }
            var pickId = await waitForPick(candidatesForWolf, '选一个今晚要刀的人');
            if (token !== runToken) return;
            wolfTargetId = pickId || (candidatesForWolf.length ? pick(candidatesForWolf).id : null);
            els.actions.innerHTML = '';
            logLine('狼人', '今夜刀了 ' + (byId(wolfTargetId) ? byId(wolfTargetId).name : '（空）'));
        } else {
            // AI 狼集体决策
            setDialog('狼人请睁眼', '狼人正在交换眼神…', true);
            await sleep(1100);
            if (token !== runToken) return;
            var aiWolves = wolves.filter(function (p) { return !p.isMe; });
            if (aiWolves.length) {
                wolfTargetId = wolfPickAi(candidatesForWolf);
                logLine('狼人', '今夜刀了 ' + (byId(wolfTargetId) ? byId(wolfTargetId).name : '（空）'));
            }
        }

        /* ---- 预言家 ---- */
        await sleep(500);
        if (token !== runToken) return;
        var seer = state.players.find(function (p) { return p.role === 'seer' && p.alive; });
        var seerResult = null;
        if (seer) {
            if (seer.isMe) {
                var seerPool = alivePlayers().filter(function (p) { return !p.isMe; });
                setDialog('预言家请睁眼', '你是预言家。选一个人查验他的阵营。', true);
                var sPick = await waitForPick(seerPool, '选一个人查验');
                if (token !== runToken) return;
                var target = byId(sPick) || pick(seerPool);
                seerResult = { targetId: target.id, targetName: target.name, isWolf: target.role === 'wolf' };
                els.actions.innerHTML = '';
                setDialog('预言家请睁眼', '「' + target.name + '」是' + (seerResult.isWolf ? '狼人' : '好人') + '。', true);
                logLine('预言家（你）', '验了 ' + target.name + '：' + (seerResult.isWolf ? '狼人' : '好人'));
                await sleep(1500);
            } else {
                setDialog('预言家请睁眼', '预言家正在查验…', true);
                await sleep(900);
                if (token !== runToken) return;
            }
        }

        /* ---- 女巫 ---- */
        await sleep(400);
        if (token !== runToken) return;
        var witch = state.players.find(function (p) { return p.role === 'witch' && p.alive; });
        var healed = false;
        var poisonedId = null;

        if (witch) {
            if (witch.isMe) {
                var victim = byId(wolfTargetId);
                var canHeal = state.witchHeal && victim && !healed;
                var msg = '你是女巫。';
                msg += victim ? '今晚被刀的是「' + victim.name + '」。' : '今晚没人被刀。';
                setDialog('女巫请睁眼', msg, true);
                await sleep(600);
                if (token !== runToken) return;

                els.actions.innerHTML = '';
                var wantHeal = false;
                var wantPoison = false;
                if (canHeal) {
                    var healBtn = document.createElement('button');
                    healBtn.className = 'ww-btn primary';
                    healBtn.innerHTML = '<i class="ri-heart-add-line"></i> 用解药救 ' + esc(victim.name);
                    healBtn.addEventListener('click', function () { wantHeal = true; els.actions.innerHTML = ''; finishWitch(); });
                    els.actions.appendChild(healBtn);
                }
                if (state.witchPoison) {
                    var poisonBtn = document.createElement('button');
                    poisonBtn.className = 'ww-btn';
                    poisonBtn.innerHTML = '<i class="ri-flask-line"></i> 用毒药';
                    poisonBtn.addEventListener('click', function () {
                        wantPoison = true;
                        els.actions.innerHTML = '<span class="ww-hintline">点一个人下毒</span>';
                        (async function () {
                            var pool = alivePlayers().filter(function (p) { return !p.isMe; });
                            var pid = await waitForPick(pool, '选一个人下毒');
                            if (pid) { poisonedId = pid; finishWitch(); }
                        })();
                    });
                    els.actions.appendChild(poisonBtn);
                }
                var skipBtn = document.createElement('button');
                skipBtn.className = 'ww-btn ghost';
                skipBtn.innerHTML = '<i class="ri-close-line"></i> 不用药';
                skipBtn.addEventListener('click', function () { els.actions.innerHTML = ''; finishWitch(); });
                els.actions.appendChild(skipBtn);

                var finishWitch = function () { if (witchResolve) witchResolve(); };
                await new Promise(function (resolve) {
                    witchResolve = function () {
                        if (wantHeal) { healed = true; state.witchHeal = false; }
                        if (poisonedId) { state.witchPoison = false; }
                        resolve();
                    };
                });
                if (token !== runToken) return;
                if (healed) logLine('女巫（你）', '用解药救了 ' + (victim ? victim.name : ''));
                if (poisonedId) logLine('女巫（你）', '用毒药毒了 ' + (byId(poisonedId) ? byId(poisonedId).name : ''));
                if (!healed && !poisonedId) logLine('女巫（你）', '没有用药');
            } else {
                setDialog('女巫请睁眼', '女巫正在考虑要不要用药…', true);
                await sleep(900);
                if (token !== runToken) return;
                // AI 女巫：第一夜大概率救；被刀的是自己必救
                if (state.witchHeal && wolfTargetId) {
                    var chance = state.day === 1 ? 0.78 : 0.42;
                    var isSelf = wolfTargetId === witch.id;
                    if (Math.random() < (isSelf ? 1 : chance)) {
                        healed = true;
                        state.witchHeal = false;
                        logLine('女巫', '用了解药');
                    }
                }
                // 毒药：第 3 天以后、且场上还有狼时，小概率毒一个可疑的
                if (!healed && state.witchPoison && state.day >= 3 && Math.random() < 0.28) {
                    var pool = alivePlayers().filter(function (p) { return !p.isMe && p.id !== witch.id; });
                    if (pool.length) {
                        poisonedId = pick(pool).id;
                        state.witchPoison = false;
                        logLine('女巫', '用毒药毒了 ' + byId(poisonedId).name);
                    }
                }
            }
        }

        /* ---- 结算 ---- */
        await sleep(500);
        if (token !== runToken) return;
        var dead = [];
        var victimP = byId(wolfTargetId);
        if (victimP && !healed) dead.push(victimP.id);
        if (poisonedId && poisonById(poisonedId) && dead.indexOf(poisonedId) < 0) dead.push(poisonedId);
        function poisonById(id) { return byId(id); }

        state.lastNight = {
            day: state.day,
            killedId: wolfTargetId,
            saved: healed,
            poisonedId: poisonedId,
            deadIds: dead.slice()
        };

        // 猎人被刀 → 可以开枪
        for (var i = 0; i < dead.length; i++) {
            var dp = byId(dead[i]);
            if (dp && dp.role === 'hunter' && dp.id !== poisonedId) {
                dead = dead.concat(await hunterShot(dp, token));
                if (token !== runToken) return;
            }
        }

        dead.forEach(function (id) { var p = byId(id); if (p) p.alive = false; });
        renderCast();
        saveState();

        await dawn(dead, token);
    }

    var witchResolve = null;

    function wolfPickAi(pool) {
        if (!pool || !pool.length) return null;
        // 优先刀"信息位"：已知的预言家/女巫 > 普通好人；这里没有公开信息，就随机偏向话多的
        var weighted = pool.slice();
        // 简单启发：稍微偏向名字靠后的人（避免每次都刀第一个），但保持随机
        return pick(weighted).id;
    }

    async function hunterShot(hunter, token) {
        var pool = alivePlayers().filter(function (p) { return p.id !== hunter.id && p.alive; });
        if (!pool.length) return [];
        if (hunter.isMe) {
            setDialog('猎人开枪', '你被刀了。开枪带走一个人——或者放弃。', true);
            var pid = await waitForPick(pool, '选一个人开枪');
            if (token !== runToken) return [];
            els.actions.innerHTML = '';
            if (!pid) { logLine('猎人（你）', '没有开枪'); return []; }
            var t = byId(pid);
            logLine('猎人（你）', '开枪带走了 ' + t.name);
            setDialog('猎人开枪', '你带走了「' + t.name + '」。', true);
            await sleep(1200);
            return [pid];
        }
        // AI 猎人：带走一个"最可疑"的（此处用随机+偏好非狼，制造一点戏剧性）
        var target = pick(pool);
        logLine('猎人', '开枪带走了 ' + target.name);
        return [target.id];
    }

    async function dawn(dead, token) {
        state.phase = 'dawn';
        els.root.classList.remove('is-night');
        els.root.classList.add('is-day');
        highlightSpeaker('');
        if (els.roundTag) els.roundTag.textContent = '第 ' + state.day + ' 天';

        var names = dead.map(function (id) { var p = byId(id); return p ? p.name : ''; }).filter(Boolean);
        var txt = names.length
            ? '天亮了。昨夜死亡：' + names.join('、') + '。'
            : '天亮了。昨夜是平安夜，没有人死亡。';
        setDialog('第 ' + state.day + ' 天', txt, true);
        logLine('主持人', txt);
        state.history.push({ day: state.day, text: txt });
        saveState();
        await sleep(1400);
        if (token !== runToken) return;

        var over = checkOver();
        if (over) { showOver(over); return; }

        await discuss(token);
    }

    /* ================= 白天发言 ================= */
    async function discuss(token) {
        state.phase = 'discuss';
        renderCast();
        var alive = alivePlayers();
        // 随机顺序（从死者下家开始的正规做法这里简化成随机）
        var order = shuffle(alive.map(function (p) { return p.id; }));

        for (var i = 0; i < order.length; i++) {
            if (token !== runToken) return;
            var p = byId(order[i]);
            if (!p || !p.alive) continue;
            highlightSpeaker(p.id);
            if (p.isMe) {
                setDialog(p.name, '轮到你发言。说说你的判断，或者替自己辩解。', true);
                var line = await waitForMyLine(token);
                if (token !== runToken) return;
                if (!line) line = '我先过。';
                logLine(p.name, line);
                setDialog(p.name, line, false);
                await sleep(Math.min(2800, 600 + line.length * 32));
            } else {
                setDialog(p.name, '……', true);
                var aiLine = await aiSpeak(p);
                if (token !== runToken) return;
                logLine(p.name, aiLine);
                setDialog(p.name, aiLine, false);
                await sleep(Math.min(4200, 800 + aiLine.length * 40));
            }
        }

        if (token !== runToken) return;
        highlightSpeaker('');
        startVote();
    }

    function waitForMyLine(token) {
        return new Promise(function (resolve) {
            els.actions.innerHTML = [
                '<div class="ww-input">',
                '  <textarea id="ww-my-line" rows="2" placeholder="说点什么…（Enter 发送）"></textarea>',
                '  <button class="ww-btn primary" id="ww-send"><i class="ri-send-plane-fill"></i> 说</button>',
                '</div>'
            ].join('');
            var ta = els.root.querySelector('#ww-my-line');
            var btn = els.root.querySelector('#ww-send');
            var done = false;
            var finish = function () {
                if (done) return;
                var v = String(ta.value || '').trim();
                if (!v) return;
                done = true;
                els.actions.innerHTML = '';
                resolve(v);
            };
            btn.addEventListener('click', finish);
            ta.addEventListener('keydown', function (e) {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); finish(); }
            });
            setTimeout(function () { ta.focus(); }, 60);
            pendingLineCleanup = function () { done = true; els.actions.innerHTML = ''; resolve(''); };
        });
    }
    var pendingLineCleanup = null;

    /* AI 发言：给它自己的身份 + 已知信息，让它说人话 */
    async function aiSpeak(p) {
        var meta = ROLE_META[p.role];
        var known = [];
        if (p.role === 'wolf') {
            var mates = wolvesAlive().filter(function (m) { return m.id !== p.id; });
            if (mates.length) known.push('你的狼同伴：' + mates.map(function (m) { return m.name; }).join('、'));
        }
        if (p.role === 'seer') {
            state.log.forEach(function (g) {
                g.items.forEach(function (it) {
                    if (it.name.indexOf('预言家') === 0 && it.text.indexOf('验了') === 0) known.push(it.text);
                });
            });
        }
        var deadNames = state.players.filter(function (x) { return !x.alive; }).map(function (x) { return x.name; });
        var aliveNames = alivePlayers().map(function (x) { return x.name; });

        var sys = [
            '你在玩狼人杀。你是「' + p.name + '」，身份是' + meta.label + '（' + (meta.side === 'wolf' ? '狼人阵营' : '好人阵营') + '）。',
            '规则：白天所有人依次发言，然后投票处决一人。狼人全部出局好人赢；狼人数量不少于好人时狼人赢。',
            '你的目标是让自己阵营获胜。' + (meta.side === 'wolf' ? '你要伪装成好人，可以撒谎、带节奏，但不要暴露自己是狼。' : '你要找出狼人，但也不能乱咬人。'),
            known.length ? '你已知：' + known.join('；') : '',
            '存活：' + aliveNames.join('、') + '。已死亡：' + (deadNames.join('、') || '无') + '。',
            '只说一两句口语化的发言，像真人玩家一样，不要旁白、不要括号动作、不要提到"AI""模型""提示词"。'
        ].filter(Boolean).join('\n');

        var user = '第 ' + state.day + ' 天，轮到你发言。说一两句话。';
        var raw = await askAi(sys, user, 120);
        var line = cleanSay(raw);
        if (!line) line = fallbackSay(p);
        return line;
    }

    function cleanSay(raw) {
        var t = String(raw || '').trim();
        if (!t) return '';
        t = t.replace(/^```[\s\S]*?```$/g, '').trim();
        t = t.replace(/^(发言|我说|回答)[:：]\s*/, '');
        t = t.replace(/^["“「]|["”」]$/g, '').trim();
        t = t.split('\n').filter(Boolean)[0] || '';
        if (t.length > 90) t = t.slice(0, 90) + '…';
        return t;
    }

    function fallbackSay(p) {
        var pool = p.role === 'wolf'
            ? ['我好人啊，别投我。', '昨晚挺安静的，我没什么信息。', '我觉得得看谁在带节奏。', '我先过，听听后面怎么说。']
            : ['我是好人，昨晚什么都没看到。', '我怀疑刚才说话含糊的那个。', '再听听吧，现在下结论太早。', '我票投给最像狼的那个。'];
        return pick(pool);
    }

    /* ================= 投票 ================= */
    function startVote() {
        state.phase = 'vote';
        state.votes = {};
        state.voteDetail = [];
        renderCast();
        var alive = alivePlayers();
        var me = alive.find(function (p) { return p.isMe; });

        if (!me) {
            setDialog('投票', '你已经出局了，看他们投。', true);
            els.actions.innerHTML = '<span class="ww-hintline"><i class="ri-loader-4-line"></i> 剩下的人正在投票…</span>';
            setTimeout(function () { collectAiVotes(null); }, 1200);
            return;
        }

        setDialog('投票', '谁最像狼？点一个人投票。', true);
        var pool = alive.filter(function (p) { return !p.isMe; });
        markSelectable(pool.map(function (p) { return p.id; }));
        els.actions.innerHTML = '<span class="ww-hintline">点头像投票，或</span>' +
            '<button class="ww-btn ghost" data-act="abstain"><i class="ri-close-line"></i> 弃票</button>';

        var handler = function (ev) {
            var el = ev.target && ev.target.closest ? ev.target.closest('.ww-p.selectable') : null;
            if (!el) return;
            var pid = el.getAttribute('data-pid');
            els.cast.removeEventListener('click', handler);
            markSelectable([]);
            collectAiVotes(pid);
        };
        els.cast.addEventListener('click', handler);
        els.root.querySelector('[data-act="abstain"]')?.addEventListener('click', function () {
            els.cast.removeEventListener('click', handler);
            markSelectable([]);
            collectAiVotes(null);
        });
    }

    var votingNow = false;   // 一次投票只算一次：平票后按钮若还在，重复点击会重复计票

    function collectAiVotes(myVoteId) {
        if (votingNow) return;
        votingNow = true;
        if (els.actions) els.actions.innerHTML = '';
        markSelectable([]);
        var alive = alivePlayers();
        var votes = {};
        if (myVoteId) votes['me'] = myVoteId;

        alive.forEach(function (p) {
            if (p.isMe) return;
            var pool = alive.filter(function (x) { return x.id !== p.id; });
            if (!pool.length) return;
            var chosen = voteAi(p, pool);
            if (chosen) votes[p.id] = chosen;
        });

        state.votes = votes;
        state.voteDetail = Object.keys(votes).map(function (vid) {
            return { voter: vid, target: votes[vid] };
        });
        renderCast();

        // 计票
        var tally = {};
        Object.keys(votes).forEach(function (k) { tally[votes[k]] = (tally[votes[k]] || 0) + 1; });
        var max = 0;
        Object.keys(tally).forEach(function (k) { if (tally[k] > max) max = tally[k]; });
        var top = Object.keys(tally).filter(function (k) { return tally[k] === max; });

        var desc = Object.keys(votes).map(function (vid) {
            var v = byId(vid), t = byId(votes[vid]);
            return (v ? v.name : '?') + '→' + (t ? t.name : '?');
        }).join('，');
        logLine('投票', desc || '无人投票');

        if (!top.length) {
            setDialog('投票结果', '没有人投票，本轮跳过。', true);
            setTimeout(function () { nextDay(null); }, 1200);
            return;
        }
        if (top.length > 1) {
            var names = top.map(function (id) { var p = byId(id); return p ? p.name : ''; }).join('、');
            setDialog('投票结果', '平票（' + names + '），本轮无人出局。', true);
            logLine('主持人', '平票，无人出局');
            setTimeout(function () { nextDay(null); }, 1500);
            return;
        }

        var out = byId(top[0]);
        if (!out) { setTimeout(function () { nextDay(null); }, 800); return; }
        out.alive = false;
        renderCast();
        var txt = '「' + out.name + '」以 ' + max + ' 票被处决，身份是' + roleLabel(out) + '。';
        setDialog('投票结果', txt, true);
        logLine('主持人', txt);
        state.history.push({ day: state.day, text: txt });

        // 猎人在投票环节被处决 → 也能开枪
        var afterVote = function () { nextDay(out); };
        if (out.role === 'hunter') {
            (async function () {
                var dead = await hunterShotOnVote(out);
                dead.forEach(function (id) { var p = byId(id); if (p) p.alive = false; });
                renderCast();
                saveState();
                afterVote();
            })();
        } else {
            saveState();
            setTimeout(afterVote, 1500);
        }
    }

    async function hunterShotOnVote(hunter) {
        var pool = alivePlayers().filter(function (p) { return p.id !== hunter.id && p.alive; });
        if (!pool.length) return [];
        if (hunter.isMe) {
            setDialog('猎人开枪', '你被投出去了。开枪带走一个人——或者放弃。', true);
            var pid = await waitForPick(pool, '选一个人开枪');
            els.actions.innerHTML = '';
            if (!pid) { logLine('猎人（你）', '没有开枪'); return []; }
            var t = byId(pid);
            logLine('猎人（你）', '开枪带走了 ' + t.name);
            await sleep(1000);
            return [pid];
        }
        var target = pick(pool);
        logLine('猎人', '开枪带走了 ' + target.name);
        return [target.id];
    }

    /* AI 投票：狼不投狼；好人用「谁像狼」的弱启发 + 噪声 */
    function voteAi(p, pool) {
        var isWolf = p.role === 'wolf';
        var options = pool.filter(function (x) {
            if (isWolf) return ROLE_META[x.role].side === 'good';   // 狼只投好人
            return true;
        });
        if (!options.length) options = pool;
        // 好人：优先投「话少 / 刚才被点名」的，制造一点可读性
        if (!isWolf) {
            var scored = options.map(function (x) {
                var s = Math.random();
                var words = 0;
                state.log.forEach(function (g) {
                    g.items.forEach(function (it) { if (it.name === x.name) words += (it.text || '').length; });
                });
                s += Math.max(0, 0.3 - words / 400);   // 话越少越可疑
                return { id: x.id, s: s };
            });
            scored.sort(function (a, b) { return b.s - a.s; });
            return scored[0].id;
        }
        return pick(options).id;
    }

    function nextDay(executed) {
        votingNow = false;
        var over = checkOver();
        if (over) { showOver(over); return; }
        state.day += 1;
        state.phase = 'night';
        saveState();
        renderCast();
        var txt = executed ? '「' + executed.name + '」出局了，剩下 ' + alivePlayers().length + ' 人。' : '进入下一天。';
        setDialog('入夜', txt, true);
        setTimeout(function () { beginNight(); }, 1200);
    }

    /* ================= 结算 ================= */
    function showOver(res) {
        votingNow = false;
        state.phase = 'over';
        saveState();
        var me = state.players.find(function (p) { return p.isMe; });
        var ended = res.winner === 'ended';
        var mySide = me ? ROLE_META[me.role].side : 'good';
        var iWin = !ended && me && me.alive !== false && ((res.winner === 'wolf' && mySide === 'wolf') || (res.winner === 'good' && mySide === 'good'));
        highlightSpeaker('');

        var rows = state.players.map(function (p) {
            var side = ROLE_META[p.role].side;
            return '<div class="ww-rrow' + (p.alive ? '' : ' dead') + '">' +
                '<img src="' + esc(p.avatar) + '" alt="">' +
                '<span class="who">' + esc(p.isMe ? p.name + '（你）' : p.name) + '</span>' +
                '<span class="rl ' + (side === 'wolf' ? 'wolf' : 'good') + '">' + roleLabel(p) + (p.alive ? '' : ' · 已出局') + '</span>' +
                '</div>';
        }).join('');

        els.root.querySelector('.ww-stage').innerHTML = [
            '<div class="ww-over">',
            '  <h2><i class="' + (ended ? 'ri-flag-2-line' : (iWin ? 'ri-trophy-line' : 'ri-emotion-sad-line')) + '"></i> ' +
            (ended ? '本局已结束' : (res.winner === 'wolf' ? '狼人胜利' : '好人胜利')) + '</h2>',
            '  <div class="ww-sub">' + esc(res.reason) + '　·　共 ' + state.day + ' 天</div>',
            '  <div class="ww-reveal">' + rows + '</div>',
            '  <div class="ww-row" style="justify-content:center;margin-top:16px;">',
            '    <button class="ww-btn primary" data-act="again"><i class="ri-refresh-line"></i> 再来一局</button>',
            '    <button class="ww-btn" data-act="lobby"><i class="ri-group-line"></i> 重新选人</button>',
            '    <button class="ww-btn ghost" data-act="close2"><i class="ri-close-line"></i> 退出</button>',
            '  </div>',
            '</div>'
        ].join('');
        els.actions.innerHTML = '';
        var endBtn = els.root.querySelector('[data-act="end"]');
        if (endBtn) endBtn.hidden = true;
        setDialog('结算', ended ? '你在第 ' + state.day + ' 天结束了这一局，下面是所有人的身份。'
            : ((iWin ? '这局你赢了。' : '这局你输了。') + res.reason), true);

        els.root.querySelector('[data-act="again"]')?.addEventListener('click', startGame);
        els.root.querySelector('[data-act="lobby"]')?.addEventListener('click', renderLobby);
        els.root.querySelector('[data-act="close2"]')?.addEventListener('click', close);
    }

    /* ================= 强制结束 ================= */
    function forceEnd() {
        if (!state || state.phase === 'over') return;
        var go = function () {
            runToken += 1;
            clearPending();
            if (pendingLineCleanup) { try { pendingLineCleanup(); } catch (e) { } pendingLineCleanup = null; }
            if (witchResolve) { try { witchResolve(); } catch (e) { } witchResolve = null; }
            if (els.actions) els.actions.innerHTML = '';
            showOver({ winner: 'ended', reason: '你在第 ' + state.day + ' 天手动结束了这一局。' });
        };
        if (window.Dlg && Dlg.confirm) {
            Dlg.confirm({
                title: '现在就结束这一局？',
                message: '会立刻公开所有人的身份，这一局不能再继续。',
                okText: '结束并摊牌',
                cancelText: '接着玩'
            }).then(function (ok) { if (ok) go(); });
        } else { go(); }
    }

    /* ================= 存档 ================= */
    function saveState() {
        try {
            if (!state) return;
            localStorage.setItem(SAVE_KEY, JSON.stringify(state));
        } catch (e) { }
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
    function clearSave() { try { localStorage.removeItem(SAVE_KEY); } catch (e) { } }

    function resumeSaved() {
        var s = loadSave();
        if (!s || s.phase === 'over') { toast('没有可继续的对局', 'ri-information-line'); renderLobby(); return; }
        state = s;
        runToken += 1;
        renderStage();
        revealCardsInstantly();
        // 续局回到「当前阶段」的开头，不重播夜间的半截流程
        setTimeout(function () {
            if (state.phase === 'night' || state.phase === 'dawn') { beginNight(); }
            else if (state.phase === 'vote') { startVote(); }
            else { discuss(runToken); }
        }, 300);
    }

    /* ================= 进出 ================= */
    function close() {
        runToken += 1;
        clearPending();
        if (pendingLineCleanup) { try { pendingLineCleanup(); } catch (e) { } pendingLineCleanup = null; }
        if (witchResolve) { try { witchResolve(); } catch (e) { } witchResolve = null; }
        if (els.root) els.root.classList.remove('show');
        document.body.classList.remove('ww-open');
        setTimeout(function () {
            if (els.root && els.root.isConnected) els.root.remove();
            root = null; els = {};
        }, 240);
    }

    function open() {
        var modal = document.getElementById('ai-settings-modal');
        if (modal) modal.classList.remove('show');
        ensureRoot();
        els.root.classList.add('show');
        if (state && state.phase !== 'over') {
            renderStage();
            revealCardsInstantly();
            setTimeout(function () {
                if (state.phase === 'night' || state.phase === 'dawn') { beginNight(); }
                else if (state.phase === 'vote') { startVote(); }
                else { discuss(runToken); }
            }, 300);
            return;
        }
        renderLobby();
    }

    /* ================= 入口 ================= */
    function bindEntry() {
        var btn = document.getElementById('open-werewolf-btn');
        if (!btn || btn.dataset.wwBound === '1') return;
        btn.dataset.wwBound = '1';
        btn.addEventListener('click', function () { open(); });
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bindEntry);
    else bindEntry();
    setTimeout(bindEntry, 1200);

    window.Werewolf = {
        open: open,
        close: close,
        isRunning: function () { return Boolean(state && state.phase !== 'over'); },
        clearSave: clearSave,
        _debug: function () { return state; }
    };
})();
