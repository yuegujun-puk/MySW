/**
 * 角色卡市场（character.html）—— 页面逻辑
 * 做两件事：
 * A. 管理「已经加进主站的角色」：批量改分组、开启群聊、移出主站、彻底删除；
 * B. 挑「想加的角色卡」：预置角色卡 + 站内内置角色，点一下才加进主站。
 * customFriendsData        自定义角色
 * friendSettings           备注 / 置顶 / 分组（主站分组优先读这里）
 * customFriendGroups       自建空分组清单
 * installedPresetCards     已经从市场添加的预置角色卡
 * presetPackLinks          预置角色 id → 提示词分片 的映射
 * removedBuiltInFriends    已移出/删除的内置角色
 * groupManager_v1          群聊
 */
(function () {
    'use strict';

    var KEY_CUSTOM = 'customFriendsData';
    var KEY_FRIEND_SETTINGS = 'friendSettings';
    var KEY_THREADS = 'threadManager_v2';
    var KEY_GROUPS = 'customFriendGroups';
    var KEY_REMOVED = 'removedBuiltInFriends';
    var KEY_ORDER = 'friendListManualOrder_v1';
    var KEY_INSTALLED = 'installedPresetCards';
    var KEY_PACK_OF = 'presetPackLinks';
    var KEY_GROUP_MANAGER = 'groupManager_v1';

    var DEFAULT_GROUP = '默认';
    var CATALOG_FILE = 'character-market-data.js';

    // 头像加载失败时的占位图（内联 SVG，不走网络）
    var FALLBACK_AVATAR = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="%23262833"/><circle cx="32" cy="24" r="11" fill="%23a9acb5"/><path d="M11 61c3-14 11-20 21-20s18 6 21 20z" fill="%23a9acb5"/></svg>';

    var state = {
        tab: 'mine',
        builtIn: window.defaultFriendsData || {},
        catalog: [],
        catalogLoaded: false,
        catalogFailed: false,
        selection: {},
        mineGroup: ''
    };

    /* ---------------- 基础工具 ---------------- */

    function $(id) { return document.getElementById(id); }

    function readJson(key, fallback) {
        try {
            var raw = localStorage.getItem(key);
            if (!raw) return fallback;
            var parsed = JSON.parse(raw);
            return parsed === null || parsed === undefined ? fallback : parsed;
        } catch (e) { return fallback; }
    }

    /* ---------------- 读取缓存（性能关键） ----------------
       这一页每次渲染都会反复读同一批 localStorage 键：
       一屏 70+ 张卡，每张卡都要问一次「它在不在我的角色里」，
       而按「最近活跃」排序时 lastActiveOf 更是**每张卡都整份 JSON.parse 一次聊天记录**
       （聊天记录是本页最大的键，几百 KB 起步）。这些都是主线程同步解析，
       累加起来就是「打开角色卡市场卡十几秒」。
       这里做一层短 TTL 的读取缓存 + 一次构建的「id → 最近活跃」索引，
       把解析次数从「每张卡一次」压到「每次渲染一次」。 */
    var readCache = {};
    var readCacheAt = 0;
    var READ_CACHE_TTL = 1500;   // ms：跨渲染复用一会儿，写完立即失效
    var threadActiveIndex = null;
    var mineIdSetCache = null;

    function resetReadCache() {
        readCache = {};
        readCacheAt = Date.now();
        threadActiveIndex = null;
        mineIdSetCache = null;
    }

    function cached(key, fallback) {
        if (Date.now() - readCacheAt > READ_CACHE_TTL) resetReadCache();
        if (Object.prototype.hasOwnProperty.call(readCache, key)) return readCache[key];
        var value = readJson(key, fallback);
        readCache[key] = value;
        return value;
    }

    function writeJson(key, value) {
        try {
            localStorage.setItem(key, JSON.stringify(value));
            // 写过的键立刻从缓存里剔除，避免「切了分组却还是旧的分组」这种脏读
            if (Object.prototype.hasOwnProperty.call(readCache, key)) delete readCache[key];
            if (key === KEY_THREADS) threadActiveIndex = null;
            mineIdSetCache = null;
            return true;
        } catch (e) {
            toast('保存失败：浏览器存储空间不足，可以先清理图片或知识库');
            return false;
        }
    }

    function esc(value) {
        return String(value === undefined || value === null ? '' : value)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    var toastTimer = null;
    function toast(message) {
        var el = $('market-toast');
        if (!el) return;
        el.textContent = String(message || '');
        el.classList.add('show');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(function () { el.classList.remove('show'); }, 2600);
    }

    function injectScript(src) {
        return new Promise(function (resolve, reject) {
            var el = document.createElement('script');
            el.src = src;
            el.async = true;
            el.onload = function () { resolve(true); };
            el.onerror = function () { reject(new Error('无法加载 ' + src)); };
            document.head.appendChild(el);
        });
    }

    /* ---------------- 数据访问 ---------------- */

    function customData() { var d = cached(KEY_CUSTOM, {}); return d && typeof d === 'object' ? d : {}; }
    function friendSettings() { var d = cached(KEY_FRIEND_SETTINGS, {}); return d && typeof d === 'object' ? d : {}; }
    function installedCards() { var d = cached(KEY_INSTALLED, {}); return d && typeof d === 'object' ? d : {}; }
    function removedIds() { var l = cached(KEY_REMOVED, []); return Array.isArray(l) ? l.map(String) : []; }

    function customGroups() {
        var list = cached(KEY_GROUPS, []);
        if (!Array.isArray(list)) return [];
        var out = [];
        list.forEach(function (name) {
            var n = String(name || '').trim();
            if (n && out.indexOf(n) < 0) out.push(n);
        });
        return out;
    }

    /** 角色当前所在分组：与主站 getFriendGroup 同一套优先级 */
    function groupOf(friendId) {
        var settings = friendSettings()[friendId];
        if (settings && settings.group) return String(settings.group);
        var builtIn = state.builtIn[friendId];
        if (builtIn && builtIn.group) return String(builtIn.group);
        var custom = customData()[friendId];
        if (custom && custom.group) return String(custom.group);
        return DEFAULT_GROUP;
    }

    /** 最近活跃时间：只读时间戳与末条时间，不读消息正文 */
    function lastActiveOf(friendId) {
        // 索引只建一次：旧实现把这个「整份聊天记录 JSON.parse + 逆历所有线程」
        // 的过程放在了每张卡里，排序时更是 O(n log n) 次，直接拖死开页。
        if (!threadActiveIndex) {
            threadActiveIndex = {};
            var data = cached(KEY_THREADS, {});
            Object.keys(data || {}).forEach(function (id) {
                var entry = data[id];
                var latest = 0;
                ((entry && entry.threads) || []).forEach(function (thread) {
                    latest = Math.max(latest, Number(thread && thread.lastActive) || 0);
                    var messages = thread && thread.messages;
                    if (Array.isArray(messages) && messages.length) {
                        var last = messages[messages.length - 1];
                        latest = Math.max(latest, Number(last && last.timestamp) || 0);
                    }
                });
                threadActiveIndex[id] = latest;
            });
        }
        return threadActiveIndex[friendId] || 0;
    }

    /**
     * 「我的角色」= 未被移出的内置角色 + 自定义角色 + 已添加的预置角色卡。
     * 同 id 时以自定义为准（与主站 loadAllFriendsData 的合并顺序一致）。
     */
    function mineRoles() {
        var custom = customData();
        var installed = installedCards();
        var removed = removedIds();
        var out = [];
        var seen = {};

        Object.keys(state.builtIn).forEach(function (id) {
            if (custom[id] || removed.indexOf(id) >= 0 || seen[id]) return;
            var data = state.builtIn[id] || {};
            seen[id] = true;
            out.push({ id: id, name: data.name || id, avatar: data.avatar || '', origin: '内置' });
        });

        Object.keys(custom).forEach(function (id) {
            if (seen[id]) return;
            var data = custom[id] || {};
            seen[id] = true;
            out.push({ id: id, name: data.name || id, avatar: data.avatar || '', origin: '自定义', isCustom: true });
        });

        Object.keys(installed).forEach(function (id) {
            var card = installed[id];
            if (!card || card.removed || seen[id]) return;
            seen[id] = true;
            out.push({ id: id, name: card.name || id, avatar: card.avatar || '', origin: '预置卡', isPreset: true });
        });

        out.forEach(function (role) { role.group = groupOf(role.id); });
        return out;
    }

    /** 「我的角色」id 集合（一个渲染批次里只算一次） */
    function mineRoleIds() {
        if (!mineIdSetCache) {
            mineIdSetCache = {};
            mineRoles().forEach(function (role) { mineIdSetCache[role.id] = true; });
        }
        return mineIdSetCache;
    }

    function setGroup(friendId, groupName) {
        var name = String(groupName || '').trim() || DEFAULT_GROUP;
        var custom = customData();        if (custom[friendId]) {
            custom[friendId].group = name;
            writeJson(KEY_CUSTOM, custom);
        }
        var installed = installedCards();
        if (installed[friendId]) {
            installed[friendId].group = name;
            writeJson(KEY_INSTALLED, installed);
        }
        var settings = friendSettings();
        if (!settings[friendId]) settings[friendId] = {};
        settings[friendId].group = name;
        writeJson(KEY_FRIEND_SETTINGS, settings);
    }

    /* ---------------- 目录与预置卡正文 ---------------- */

    function ensureCatalog() {
        if (state.catalogLoaded) return Promise.resolve(state.catalog);
        return injectScript(CATALOG_FILE).catch(function () { return null; }).then(function () {
            var box = window.__MY_SW_MARKET_CATALOG;
            state.catalog = box && Array.isArray(box.characters) ? box.characters.slice() : [];
            // 目录文件没加载成功（网络慢/404）时记住这件事：
            // 否则「预置角色卡」货架会静默消失，用户只会觉得「卡不见了」（例如瓦尔特·杨）。
            state.catalogFailed = !box;
            state.catalogLoaded = true;
            fillWorkOptions();
            return state.catalog;
        });
    }

    /** 作品下拉：从货架目录里现收现填，新上架一个作品就自动多一项，不用改 HTML */
    function fillWorkOptions() {
        var sel = $('market-work');
        if (!sel) return;
        var current = sel.value || 'all';
        var seen = {};
        state.catalog.forEach(function (card) { if (card && card.work) seen[card.work] = 1; });
        var names = Object.keys(seen).sort(function (a, b) { return String(a).localeCompare(String(b), 'zh-CN'); });
        sel.innerHTML = '';
        sel.add(new Option('全部作品', 'all'));
        names.forEach(function (name) { sel.add(new Option(name, name)); });
        sel.value = names.indexOf(current) >= 0 ? current : 'all';
    }

    /** 预置角色卡的正文分片：只在这一页看设定 / 添加时才下载 */
    function loadCatalogPack(packName) {
        var name = packName || 'market';
        // 已经在内存里就不用再插一次 script：用户在「查看设定」之后紧接着点「添加」，
        // 这张卡的正文其实已经下来了，重复下载只是浪费一次请求。
        var store = window.__MY_SW_CHAR_PACKS || {};
        if (store[name]) return Promise.resolve(store[name]);
        // 【防陈旧缓存】给分片 URL 带上货架目录的版本号（?v=N）。
        // 目录更新（新卡上架）必然升 version，正文分片 URL 随之变化，
        // 浏览器就不会把旧分片（没有新卡）从缓存里端出来——
        // 否则会出现「货架上有新卡、查看设定却读不到正文」的诡异现象。
        var ver = (window.__MY_SW_MARKET_CATALOG && window.__MY_SW_MARKET_CATALOG.version) || '';
        if (window.CharacterPacks && window.CharacterPacks.loadPack) return window.CharacterPacks.loadPack(name, ver);
        return injectScript('character-packs/' + name + '.js' + (ver ? '?v=' + ver : '')).catch(function () { return null; });
    }

    function presetBody(id) {
        var box = window.__MY_SW_CHAR_PACKS || {};
        var keys = Object.keys(box);
        for (var i = 0; i < keys.length; i++) {
            var entry = box[keys[i]] && box[keys[i]][id];
            if (entry) return entry;
        }
        return null;
    }

    /**
     * 从「市场分片」里取正文，而不是从本机快照里取。
     *
     * presetBody() 会遍历所有分片，而 ensurePresetPack() 建了一张名为 market-data
     * 的分片，里面装的是**本机已安装卡的快照**。它通常排在前面，于是 presetBody 先命中它。
     * 「添加」时无所谓（本机还没这张卡），但「更新」时就是致命问题：
     * 更新读到的永远是自己存的旧正文，比新版短一大截，最后被当成脏数据拒掉。
     */
    function marketBodyOf(id) {
        var card = cardOf(id);
        if (!card) return null;
        var box = window.__MY_SW_CHAR_PACKS || {};
        var pack = box[card.pack || 'market'];
        if (pack && pack[id]) return pack[id];
        // 目录声明的分片名与实际不一致时兜底扫一遍，但跳过本机快照
        var keys = Object.keys(box);
        for (var i = 0; i < keys.length; i++) {
            if (keys[i] === 'market-data') continue;
            var entry = box[keys[i]] && box[keys[i]][id];
            if (entry && String(entry.systemPrompt || '').trim()) return entry;
        }
        return null;
    }

    function cardOf(id) {
        for (var i = 0; i < state.catalog.length; i++) {
            if (state.catalog[i].id === id) return state.catalog[i];
        }
        return null;
    }

    /* ---------------- 操作：增 / 移出 / 删 ---------------- */

    function ensureThreadEntry(friendId, name) {
        var threads = readJson(KEY_THREADS, {});
        if (!threads || typeof threads !== 'object') threads = {};
        if (threads[friendId]) return;
        threads[friendId] = {
            threads: [{ id: 1, name: name || '初始对话', messages: [] }],
            currentThreadId: 1,
            longTermMemory: []
        };
        writeJson(KEY_THREADS, threads);
    }

    /** 把一张预置卡添加到主站 */
    function addPresetCard(id) {
        var card = cardOf(id) || {};
        var packName = card.pack || 'market';
        return loadCatalogPack(packName).then(function () {
            // 先取市场分片里的正文。移出过的卡在 market-data 快照里还留着旧内容，
            // 直接 presetBody 会把它重新装回来（用户明明装的是「重加即最新」）。
            var body = marketBodyOf(id) || presetBody(id);
            if (!body) {
                toast('角色卡正文读取失败，请检查网络后重试');
                return false;
            }
            var installed = installedCards();
            installed[id] = {
                id: id,
                name: body.name || card.name || id,
                avatar: body.avatar || card.avatar || '',
                systemPrompt: String(body.systemPrompt || ''),
                welcomeMessage: String(body.welcomeMessage || ''),
                group: card.group || '游戏角色',
                work: card.work || '',
                pack: packName,
                version: card.version || '1.0',
                contentVersion: cardRevOf(card),   // 安装时快照，之后靠它判断有没有新版
                addedAt: Date.now()
            };
            if (!writeJson(KEY_INSTALLED, installed)) return false;
            var links = readJson(KEY_PACK_OF, {});
            if (!links || typeof links !== 'object') links = {};
            links[id] = packName;
            writeJson(KEY_PACK_OF, links);
            ensureThreadEntry(id, '初始对话');
            toast('已添加「' + (installed[id].name) + '」——回到短信即可开始对话');
            renderTabCounts();
            renderMine();
            renderMarket();
            return true;
        });
    }

    /**
     * 移出主站：内置角色记进 removedBuiltInFriends，预置卡标记 removed。
     * 两者都不删聊天记录 —— 与主站的「删除角色（保留聊天记录）」同一套语义。
     */
    function removeRole(friendId) {
        if (state.builtIn[friendId] && !customData()[friendId]) {
            var removed = removedIds();
            if (removed.indexOf(friendId) < 0) removed.push(friendId);
            writeJson(KEY_REMOVED, removed);
            return true;
        }
        var installed = installedCards();
        if (installed[friendId]) {
            installed[friendId].removed = true;
            return writeJson(KEY_INSTALLED, installed);
        }
        return false;
    }

    /** 彻底删除：角色数据 + 聊天记录 + 分组内记录，全部清掉 */
    function deleteRole(friendId) {
        var custom = customData();
        if (custom[friendId]) { delete custom[friendId]; writeJson(KEY_CUSTOM, custom); }
        var installed = installedCards();
        if (installed[friendId]) { delete installed[friendId]; writeJson(KEY_INSTALLED, installed); }
        if (state.builtIn[friendId]) {
            var removed = removedIds();
            if (removed.indexOf(friendId) < 0) removed.push(friendId);
            writeJson(KEY_REMOVED, removed);
        }
        var settings = friendSettings();
        if (settings[friendId]) { delete settings[friendId]; writeJson(KEY_FRIEND_SETTINGS, settings); }
        var threads = readJson(KEY_THREADS, {});
        if (threads && threads[friendId]) { delete threads[friendId]; writeJson(KEY_THREADS, threads); }
        var order = readJson(KEY_ORDER, []);
        if (Array.isArray(order) && order.indexOf(friendId) >= 0) {
            writeJson(KEY_ORDER, order.filter(function (id) { return id !== friendId; }));
        }
        var groups = readJson(KEY_GROUP_MANAGER, {});
        if (groups && groups[friendId]) { delete groups[friendId]; writeJson(KEY_GROUP_MANAGER, groups); }
        return true;
    }

    /** 开启群聊：写入主站同款 groupManager_v1 结构 */
    function createGroupChat(memberIds) {
        var ids = (memberIds || []).filter(function (id, index, arr) {
            return id && arr.indexOf(id) === index && (state.builtIn[id] || customData()[id] || installedCards()[id]);
        });
        if (ids.length < 2) { toast('群聊至少需要 2 个角色'); return Promise.resolve(false); }
        var names = ids.map(function (id) { return nameOf(id); });
        return askText('开启 AI 群聊', '群聊名称', names.join('、').slice(0, 40), '例如：星穹列车茶话会').then(function (groupName) {
            if (groupName === null) return false;
            var groupId = 'group_' + Date.now();
            var groups = readJson(KEY_GROUP_MANAGER, {});
            if (!groups || typeof groups !== 'object') groups = {};
            var activity = {};
            ids.forEach(function (id) { activity[id] = 0.5; });
            groups[groupId] = {
                id: groupId,
                name: String(groupName || '').trim() || '多角色群聊',
                memberIds: ids,
                isGroup: true,
                memberThreads: {},
                speakOrder: 'round-robin',
                allowMentions: true,
                allowProactive: true,
                activeMemberIndex: 0,
                adminIds: [],
                mutedUntil: {},
                memberTitles: {},
                memberActivity: activity
            };
            if (!writeJson(KEY_GROUP_MANAGER, groups)) return false;
            ensureThreadEntry(groupId, '群聊');
            // 群里的角色设定同样按需：进群聊时才会读到它们
            ids.forEach(function (id) {
                try { window.CharacterPacks && window.CharacterPacks.ensure && window.CharacterPacks.ensure(id); } catch (e) {}
            });
            toast('已创建群聊「' + groups[groupId].name + '」（' + ids.length + ' 人）');
            renderMine();
            return true;
        });
    }

    function nameOf(friendId) {
        var settings = friendSettings()[friendId];
        if (settings && settings.remark) return String(settings.remark);
        if (state.builtIn[friendId] && state.builtIn[friendId].name) return String(state.builtIn[friendId].name);
        var custom = customData()[friendId];
        if (custom && custom.name) return String(custom.name);
        var installed = installedCards()[friendId];
        if (installed && installed.name) return String(installed.name);
        return String(friendId);
    }

    function avatarOf(role) {
        return role.avatar || FALLBACK_AVATAR;
    }

    /* ---------------- 弹窗 ---------------- */

    function openModal(title, bodyHtml) {
        // 每次弹窗都换一份全新的 body 容器：旧容器上可能还挂着上一个弹窗的按钮监听，
        // 不清掉的话后开的弹窗会同时触发前几次的处理器（点一下弹两次）。
        var old = $('market-modal-body');
        var fresh = old.cloneNode(false);
        old.parentNode.replaceChild(fresh, old);
        fresh.innerHTML = bodyHtml;
        $('market-modal-title').textContent = title;
        $('market-modal').hidden = false;
    }

    function closeModal() {
        var modal = $('market-modal');
        if (modal) modal.hidden = true;
    }

    function closeModalOnBackdrop(event) {
        if (event.target === $('market-modal')) closeModal();
    }

    /** 让用户选一个分组：既列出现有分组，也允许直接输入新名字 */
    function askGroupName(currentName) {
        var options = allGroupNames().map(function (name) {
            return '<option value="' + esc(name) + '"' + (name === currentName ? ' selected' : '') + '>' + esc(name) + '</option>';
        }).join('');
        return new Promise(function (resolve) {
            openModal('移动到分组', ''
                + '<div class="market-field"><label for="mk-group-pick">选择已有分组</label>'
                + '<select id="mk-group-pick">' + options + '</select></div>'
                + '<div class="market-field"><label for="mk-group-name">或者输入一个新分组名</label>'
                + '<input type="text" id="mk-group-name" maxlength="24" placeholder="例如：星穹铁道 / 白月光"></div>'
                + '<p class="market-hint">分组与主站共用，改完回到短信就能看到。</p>'
                + '<div class="market-dialog-actions">'
                + '<button class="market-ghost" type="button" data-mk="cancel">取消</button>'
                + '<button class="market-ghost primary" type="button" data-mk="ok">确定</button></div>');
            function finish(value) { closeModal(); resolve(value); }
            $('market-modal-body').addEventListener('click', function (event) {
                var act = event.target && event.target.dataset ? event.target.dataset.mk : '';
                if (act === 'cancel') finish(null);
                if (act === 'ok') {
                    var typed = String($('mk-group-name').value || '').trim();
                    finish(typed || String($('mk-group-pick').value || '').trim() || null);
                }
            });
        });
    }

    /** 让用户输入一段文本 */
    function askText(title, label, initial, placeholder) {
        return new Promise(function (resolve) {
            openModal(title, ''
                + '<div class="market-field"><label for="mk-text">' + esc(label) + '</label>'
                + '<input type="text" id="mk-text" maxlength="40" value="' + esc(initial || '') + '" placeholder="' + esc(placeholder || '') + '"></div>'
                + '<div class="market-dialog-actions">'
                + '<button class="market-ghost" type="button" data-mk="cancel">取消</button>'
                + '<button class="market-ghost primary" type="button" data-mk="ok">确定</button></div>');
            var input = $('mk-text');
            input.focus();
            input.select();
            function finish(value) { closeModal(); resolve(value); }
            $('market-modal-body').addEventListener('click', function (event) {
                var act = event.target && event.target.dataset ? event.target.dataset.mk : '';
                if (act === 'cancel') finish(null);
                if (act === 'ok') finish(String($('mk-text').value || '').trim());
            });
            input.addEventListener('keydown', function (event) {
                if (event.key === 'Enter') { event.preventDefault(); finish(String(input.value || '').trim()); }
            });
        });
    }

    /* ---------------- 渲染：我的角色 ---------------- */

    function cardHtml(role, opts) {
        var options = opts || {};
        var checked = state.selection[role.id] ? ' selected' : '';
        var actions = '';
        if (options.mode === 'mine') {
            actions = ''
                + '<div class="mk-actions">'
                + '<button type="button" data-act="chat" data-id="' + esc(role.id) + '"><i class="ri-chat-3-line"></i> 去聊天</button>'
                + '<button type="button" data-act="group" data-id="' + esc(role.id) + '"><i class="ri-folder-transfer-line"></i> 改分组</button>'
                + '<button type="button" data-act="remove" data-id="' + esc(role.id) + '">移出</button>'
                + '<button type="button" class="danger" data-act="delete" data-id="' + esc(role.id) + '">删除</button>'
                + '</div>';
        } else if (options.mode === 'market-preset') {
            if (isInstalled(role.id)) {
                actions = '<div class="mk-actions">'
                    + (needsUpdate(role.id)
                        ? '<button type="button" class="primary" data-act="update" data-id="' + esc(role.id) + '"><i class="ri-refresh-line"></i> 更新</button>'
                        : '')
                    + '<button type="button" data-act="detail" data-id="' + esc(role.id) + '"><i class="ri-file-text-line"></i> 查看设定</button>'
                    + '<button type="button" data-act="remove" data-id="' + esc(role.id) + '">移出主站</button></div>';
            } else {
                actions = '<div class="mk-actions"><button type="button" class="primary" data-act="add" data-id="' + esc(role.id) + '"><i class="ri-add-line"></i> 添加到主站</button>'
                    + '<button type="button" data-act="detail" data-id="' + esc(role.id) + '">查看设定</button></div>';
            }
        } else {
            // 这里原来是「每张卡都跑一次 mineRoles()」——70 张卡就是 70 次
            // localStorage 读取 + 全量遍历，这是打开市场卡顿的另一半原因。
            var inRoster = Boolean(mineRoleIds()[role.id]);
            actions = inRoster
                ? '<div class="mk-actions"><span class="market-tag gold">已在主站</span></div>'
                : '<div class="mk-actions"><button type="button" class="primary" data-act="add-builtin" data-id="' + esc(role.id) + '"><i class="ri-add-line"></i> 添加到主站</button></div>';
        }
        var tags = '<div class="market-tags">'
            + '<span class="market-tag gold">' + esc(role.origin || role.work || '角色') + '</span>'
            + (role.group ? '<span class="market-tag">' + esc(role.group) + '</span>' : '')
            + (options.badges || '')
            + '</div>';
        return ''
            + '<article class="market-card' + checked + '" role="listitem" data-id="' + esc(role.id) + '" data-mode="' + esc(options.mode) + '">'
            + '<span class="mk-check"><i class="ri-check-line"></i></span>'
            + '<img class="mk-avatar" src="' + esc(avatarOf(role)) + '" alt="" loading="lazy">'
            + '<div class="mk-body">'
            + '<div class="mk-name" title="' + esc(role.name) + '">' + esc(role.name) + '</div>'
            + '<div class="mk-sub">' + esc(role.intro || role.work || role.origin || '') + '</div>'
            + tags
            + actions
            + '</div></article>';
    }

    function renderMine() {
        var grid = $('mine-grid');
        if (!grid) return;
        var keyword = String(($('mine-search') && $('mine-search').value) || '').trim().toLowerCase();
        var groupFilter = state.mineGroup;
        var sort = ($('mine-sort') && $('mine-sort').value) || 'recent';

        var list = mineRoles();
        if (groupFilter) list = list.filter(function (r) { return r.group === groupFilter; });
        if (keyword) {
            list = list.filter(function (r) {
                var remark = (friendSettings()[r.id] || {}).remark || '';
                return (r.name + ' ' + remark + ' ' + r.group + ' ' + r.origin).toLowerCase().indexOf(keyword) >= 0;
            });
        }
        if (sort === 'name') {
            list.sort(function (a, b) { return String(a.name).localeCompare(String(b.name), 'zh-CN'); });
        } else if (sort === 'group') {
            list.sort(function (a, b) {
                var d = String(a.group).localeCompare(String(b.group), 'zh-CN');
                return d || String(a.name).localeCompare(String(b.name), 'zh-CN');
            });
        } else if (sort === 'added') {
            // 添加顺序：自定义/预置卡按记录时间，内置角色保持索引顺序
            var installed = installedCards();
            list.sort(function (a, b) {
                var ta = Number((installed[a.id] || {}).addedAt) || 0;
                var tb = Number((installed[b.id] || {}).addedAt) || 0;
                return ta - tb;
            });
        } else {
            list.sort(function (a, b) { return lastActiveOf(b.id) - lastActiveOf(a.id); });
        }

        var groups = {};
        list.forEach(function (role) { groups[role.group] = true; });
        var groupNames = Object.keys(groups).sort(function (a, b) {
            if (a === DEFAULT_GROUP) return -1;
            if (b === DEFAULT_GROUP) return 1;
            return a.localeCompare(b, 'zh-CN');
        });

        if (!list.length) {
            grid.innerHTML = '<p class="market-empty">这里还没有角色。<br>到「角色卡市场」标签页挑一个，或者回短信页自己创建角色卡。</p>';
            updateBatchBar();
            updateRestoreEntry();
            return;
        }

        var html = '';
        groupNames.forEach(function (name) {
            var members = list.filter(function (r) { return r.group === name; });
            html += '<h3 class="market-section-title"><i class="ri-folder-line"></i> ' + esc(name)
                + ' <small>' + members.length + ' 个角色</small></h3>';
            members.forEach(function (role) {
                var badges = '';
                if (role.origin === '预置卡') badges += '<span class="market-tag warn">市场</span>';
                if (role.origin === '自定义') badges += '<span class="market-tag warn">自制</span>';
                html += cardHtml(role, { mode: 'mine', badges: badges });
            });
        });
        grid.innerHTML = html;
        renderGroupFilter();
        updateBatchBar();
        updateRestoreEntry();
    }

    function renderGroupFilter() {
        var select = $('mine-group');
        if (!select) return;
        var names = [''].concat(Object.keys(mineRoles().reduce(function (acc, role) {
            acc[role.group] = true;
            return acc;
        }, {})));
        // 上面把分组名收集起来，排序后生成选项
        var list = names.slice(1).sort(function (a, b) {
            if (a === DEFAULT_GROUP) return -1;
            if (b === DEFAULT_GROUP) return 1;
            return a.localeCompare(b, 'zh-CN');
        });
        var html = '<option value="">全部分组</option>';
        list.forEach(function (name) {
            html += '<option value="' + esc(name) + '"' + (name === state.mineGroup ? ' selected' : '') + '>' + esc(name) + '</option>';
        });
        select.innerHTML = html;
    }

    function selectedIds() {
        return Object.keys(state.selection).filter(function (id) { return state.selection[id]; });
    }

    function updateBatchBar() {
        var ids = selectedIds();
        var bar = $('mine-batchbar');
        if (bar) bar.hidden = ids.length === 0;
        var count = $('mine-sel-count');
        if (count) count.textContent = String(ids.length);
        var clear = $('mine-clear-sel');
        if (clear) clear.hidden = ids.length === 0;
        // 空方块勾选框平时是隐形的（见 character-market.css），
        // 一旦有选中项就整体露出来，让用户看得见「还能继续点多选」。
        document.body.classList.toggle('mk-has-selection', ids.length > 0);
        var grid = $('mine-grid');
        if (grid) {
            Array.prototype.forEach.call(grid.querySelectorAll('.market-card'), function (card) {
                card.classList.toggle('selected', Boolean(state.selection[card.dataset.id]));
            });
        }
    }

    /* ---------------- 渲染：市场 ---------------- */

    function renderMarket() {
        var grid = $('market-grid');
        if (!grid) return;
        grid.dataset.rendered = '1';
        var keyword = String(($('market-search') && $('market-search').value) || '').trim().toLowerCase();
        var source = ($('market-source') && $('market-source').value) || 'all';
        var sort = ($('market-sort') && $('market-sort').value) || 'hot';
        var work = ($('market-work') && $('market-work').value) || 'all';

        var presets = state.catalog.map(function (card) {
            return {
                id: card.id, name: card.name, avatar: card.avatar, origin: '预置角色卡',
                work: card.work, intro: card.intro, tags: card.tags || [], pack: card.pack,
                group: card.group || '', notes: card.notes || '',
                // promptLength 以前没带过来，导致「按角色卡大小」排序一直恒等于原顺序
                promptLength: card.promptLength,
                contentVersion: card.contentVersion
            };
        });
        var builtins = Object.keys(state.builtIn).map(function (id) {
            var data = state.builtIn[id] || {};
            return { id: id, name: data.name || id, avatar: data.avatar || '', origin: '站内内置', work: data.group || '' };
        });

        var list = [];
        if (source !== 'builtin') list = list.concat(presets);
        if (source !== 'preset') list = list.concat(builtins);

        if (work !== 'all') {
            // 选具体作品时只留预置卡：站内内置角色的 work 是分组名，不属于任何作品
            list = list.filter(function (role) { return String(role.work || '') === work; });
        }
        if (keyword) {
            list = list.filter(function (role) {
                var hay = (role.name + ' ' + (role.work || '') + ' ' + (role.intro || '') + ' ' + (role.tags || []).join(' ')).toLowerCase();
                return hay.indexOf(keyword) >= 0;
            });
        }
        if (sort === 'name') list.sort(function (a, b) { return String(a.name).localeCompare(String(b.name), 'zh-CN'); });
        if (sort === 'size') list.sort(function (a, b) { return (Number(b.promptLength) || 0) - (Number(a.promptLength) || 0); });

        var html = '';
        var presetPart = list.filter(function (r) { return r.origin === '预置角色卡'; });
        var builtinPart = list.filter(function (r) { return r.origin === '站内内置'; });

        if (presetPart.length) {
            html += '<h3 class="market-section-title"><i class="ri-store-2-line"></i> 预置角色卡 <small>点「添加到主站」才会把它加进来</small></h3>';
            presetPart.forEach(function (role) {
                var badge;
                if (!isInstalled(role.id)) badge = '<span class="market-tag">未添加</span>';
                else if (needsUpdate(role.id)) {
                    badge = '<span class="market-tag warn">有更新 v' + installedRevOf(installedCards()[role.id])
                        + ' → v' + cardRevOf(cardOf(role.id)) + '</span>';
                } else badge = '<span class="market-tag gold">已添加</span>';
                html += cardHtml(role, { mode: 'market-preset', badges: badge });
            });
        } else if (state.catalogFailed) {
            // 目录文件没加载出来时不静默：明确告诉用户预置卡为什么没了、怎么恢复
            html += '<p class="market-empty"><i class="ri-wifi-off-line"></i> 货架目录（character-market-data.js）没加载出来，预置角色卡暂时看不到。' +
                '内置角色不受影响；等网络恢复后<strong>刷新页面</strong>即可。</p>';
        }
        if (builtinPart.length) {
            html += '<h3 class="market-section-title"><i class="ri-database-2-line"></i> 站内内置角色 <small>' + builtinPart.length + ' 个</small></h3>';
            builtinPart.forEach(function (role) { html += cardHtml(role, { mode: 'market-builtin' }); });
        }
        if (!html) html = '<p class="market-empty">没有匹配的角色卡。试试换个关键词，或者清空搜索。</p>';
        grid.innerHTML = html;
        renderTabCounts();
        updateUpdateBadge();
    }

    /* ---------------- 渲染：分组管理 ---------------- */

    function renderGroups() {
        var host = $('group-list');
        if (!host) return;
        var names = (function () {
            var list = [];
            function push(name) { if (name && list.indexOf(name) < 0) list.push(name); }
            push(DEFAULT_GROUP);
            mineRoles().forEach(function (r) { push(r.group); });
            customGroups().forEach(push);
            return list;
        })();
        var html = '';
        names.forEach(function (name) {
            var count = groupMemberCount(name);
            var isDefault = name === DEFAULT_GROUP;
            html += '<div class="market-group-row" data-group="' + esc(name) + '">'
                + '<span class="mk-group-name"><i class="ri-folder-line"></i> ' + esc(name)
                + ' <span class="mk-group-count">' + count + ' 个角色</span></span>'
                + '<span class="mk-group-acts">'
                + '<button class="market-ghost" type="button" data-act="rename" data-group="' + esc(name) + '"><i class="ri-edit-line"></i> 重命名</button>'
                + (isDefault
                    ? ''
                    : '<button class="market-ghost danger" type="button" data-act="delgroup" data-group="' + esc(name) + '"><i class="ri-delete-bin-line"></i> 删除分组</button>')
                + '</span></div>';
        });
        host.innerHTML = html;
    }

    /* ---------------- 事件 ---------------- */

    function confirmDialog(options) {
        if (window.Dlg && typeof window.Dlg.confirm === 'function') return window.Dlg.confirm(options);
        return Promise.resolve(window.confirm(String(options.message || '')));
    }

    async function batchApply(act) {
        var ids = selectedIds();
        if (!ids.length) { toast('先选几个角色'); return; }
        if (act === 'group' || act === 'newgroup') {
            var name = act === 'newgroup'
                ? await askText('新建分组并移入', '新分组名称', '', '例如：星穹列车')
                : await askGroupName(ids.length === 1 ? groupOf(ids[0]) : '');
            if (!name) return;
            if (act === 'newgroup') {
                var merged = customGroups().concat([name]);
                writeJson(KEY_GROUPS, merged.filter(function (n, i, arr) { return arr.indexOf(n) === i; }));
            }
            ids.forEach(function (id) { setGroup(id, name); });
            toast('已把 ' + ids.length + ' 个角色移动到「' + name + '」');
        } else if (act === 'groupchat') {
            await createGroupChat(ids);
        } else if (act === 'remove') {
            var ok = await confirmDialog({
                title: '移出主站',
                message: '把这 ' + ids.length + ' 个角色从主站移出？\n\n聊天记录与角色卡数据都会保留，之后可以随时再添加回来。',
                okText: '移出',
                danger: true
            });
            if (!ok) return;
            ids.forEach(function (id) { removeRole(id); });
            toast('已移出 ' + ids.length + ' 个角色');
        } else if (act === 'delete') {
            var sure = await confirmDialog({
                title: '彻底删除',
                message: '彻底删除这 ' + ids.length + ' 个角色？\n\n角色设定与它们的全部聊天记录都会被清空，不可恢复。',
                okText: '确认删除',
                danger: true
            });
            if (!sure) return;
            ids.forEach(function (id) { deleteRole(id); });
            toast('已删除 ' + ids.length + ' 个角色');
        }
        state.selection = {};
        renderMine();
    }

    async function singleRemove(id) {
        var ok = await confirmDialog({
            title: '移出主站',
            message: '把「' + nameOf(id) + '」从主站移出？\n\n聊天记录与角色卡数据都会保留，之后可以随时再添加回来。',
            okText: '移出',
            danger: true
        });
        if (!ok) return;
        removeRole(id);
        toast('已移出「' + nameOf(id) + '」');
        renderMine();
    }

    async function singleDelete(id) {
        var ok = await confirmDialog({
            title: '彻底删除',
            message: '彻底删除「' + nameOf(id) + '」？\n\n角色设定与它的全部聊天记录都会被清空，不可恢复。',
            okText: '确认删除',
            danger: true
        });
        if (!ok) return;
        deleteRole(id);
        toast('已删除「' + nameOf(id) + '」');
        renderMine();
        renderTabCounts();
    }

    function openSiteCreate() {
        // 自制角色卡只存在主站的编辑器里：这里只给出提示并跳转，不重复造第二套编辑器，
        // 避免「市场里改的」和「主站里改的」两套写法不一致。
        toast('自制角色卡请在主站点「添加好友」里创建，一行都不会两套标准');
        setTimeout(function () { location.href = 'index.html'; }, 900);
    }

    function showPresetDetail(id) {
        var card = cardOf(id) || {};
        openModal('查看设定 · ' + (card.name || id), '<p class="market-loading"><i class="ri-loader-4-line"></i> 正在读取角色卡…</p>');
        loadCatalogPack(card.pack || 'market').then(function () {
            var body = presetBody(id);
            if (!body) {
                $('market-modal-body').innerHTML = '<p class="market-empty">角色卡正文（character-packs/' + esc(card.pack || 'market')
                    + '.js）没读到。请先确认部署里存在这个文件；文件在却读不到时，多半是浏览器缓存了旧版本——按 Ctrl+Shift+R 强制刷新，或清除本站缓存后重试。</p>';
                return;
            }
            var tags = (card.tags || []).map(function (t) { return '<span class="market-tag">' + esc(t) + '</span>'; }).join('');
            $('market-modal-body').innerHTML = ''
                + '<dl class="market-kv">'
                + '<dt>角色名</dt><dd>' + esc(body.name || card.name || id) + '</dd>'
                + '<dt>作品</dt><dd>' + esc(card.work || '—') + '</dd>'
                + '<dt>标签</dt><dd><div class="market-tags">' + (tags || '—') + '</div></dd>'
                + '<dt>提示词</dt><dd>约 ' + String(String(body.systemPrompt || '').length) + ' 字</dd>'
                + '<dt>说明</dt><dd>' + esc(card.notes || '—') + '</dd>'
                + '</dl>'
                + '<p class="market-hint">下面是角色卡的完整人设提示词（只读）。添加到主站后，只有你进入它的聊天时才会被真正用上。</p>'
                + '<div class="market-preview">' + esc(body.systemPrompt || '') + '</div>'
                + '<p class="market-hint" style="margin-top:14px">开场白</p>'
                + '<div class="market-preview">' + esc(body.welcomeMessage || '') + '</div>'
                + '<div id="si18n-card-box"></div>';
            if (window.SiteI18n) SiteI18n.attachCardTranslate('si18n-card-box', { id: id, name: body.name || card.name || id, systemPrompt: body.systemPrompt || '', welcomeMessage: body.welcomeMessage || '' });
        });
    }

    function addBuiltIn(id) {
        writeJson(KEY_REMOVED, removedIds().filter(function (x) { return x !== id; }));
        ensureThreadEntry(id, '初始对话');
        toast('已把「' + nameOf(id) + '」加回主站');
        renderTabCounts();
        renderMarket();
        renderMine();
    }

    /* ---------------- 恢复：把移出主站的角色加回来 ----------------
       「移出主站」只是打了个标记，什么都没删：
         · 内置角色 → removedBuiltInFriends 里多一个 id
         · 预置角色卡 → installedPresetCards[id].removed = true
       所以「恢复」就是把这两处标记撤掉。以前只能在主站的角色列表里操作，
       这里补上集中入口，不用来回切页面。                      */

    /** 被移出主站的角色清单（内置 + 预置卡，按名称排序） */
    function removedRoleList() {
        var out = [];
        var custom = customData();
        removedIds().forEach(function (id) {
            if (!state.builtIn[id]) return;
            // 同 id 已经有自定义角色时，主站里其实还在（自定义数据会把它重新加回去）
            if (custom[id]) return;
            var data = state.builtIn[id] || {};
            out.push({ id: id, name: data.name || id, avatar: data.avatar || '', origin: '内置角色' });
        });
        var installed = installedCards();
        Object.keys(installed).forEach(function (id) {
            var card = installed[id];
            if (!card || !card.removed) return;
            if (out.some(function (r) { return r.id === id; })) return;
            out.push({ id: id, name: card.name || id, avatar: card.avatar || '', origin: '预置角色卡' });
        });
        return out.sort(function (a, b) { return String(a.name).localeCompare(String(b.name), 'zh-CN'); });
    }

    /** 恢复单个角色：返回是否真的改变了什么 */
    function restoreRole(id) {
        var done = false;
        if (state.builtIn[id] && removedIds().indexOf(id) >= 0) {
            writeJson(KEY_REMOVED, removedIds().filter(function (x) { return x !== id; }));
            done = true;
        }
        var installed = installedCards();
        if (installed[id] && installed[id].removed) {
            delete installed[id].removed;
            writeJson(KEY_INSTALLED, installed);
            // 预置卡的「id → 分片」归属要重新登记，否则主站认不出它的提示词
            try { ensurePresetPack(); } catch (e) {}
            done = true;
        }
        // 会话容器补回来（用户之前可能连这个角色的聊天记录一起清过）
        if (done) ensureThreadEntry(id, '初始对话');
        return done;
    }

    /** 刷新「恢复移出」入口按钮的可见性与计数 */
    function updateRestoreEntry() {
        var btn = $('mine-restore-btn');
        if (!btn) return;
        var n = removedRoleList().length;
        var em = $('mine-restore-count');
        if (em) em.textContent = String(n);
        btn.hidden = n === 0;
        btn.title = n ? '把移出主站的角色加回来' : '当前没有被移出的角色';
    }

    function applyRestore(ids) {
        if (!ids || !ids.length) return;
        var done = 0;
        var firstId = ids[0];
        ids.forEach(function (id) { if (restoreRole(id)) done++; });
        if (!done) { toast('没有可恢复的角色'); return; }
        toast(done === 1 ? '已把「' + nameOf(firstId) + '」恢复回主站' : '已恢复 ' + done + ' 个角色');
        // 三个视图都要刷：我的角色列表、市场的「已在主站」状态、标签页计数
        renderTabCounts();
        renderMine();
        renderMarket();
        if (removedRoleList().length) openRestoreDialog();
        else closeModal();
    }

    function openRestoreDialog() {
        var list = removedRoleList();
        if (!list.length) { toast('没有被移出主站的角色'); updateRestoreEntry(); return; }
        var html = ''
            + '<p class="market-hint">这些角色被「移出主站」了。聊天记录与角色卡数据都完整保留着，'
            + '点「恢复」就会重新出现在短信的角色列表里，不用再回主站操作。</p>'
            + '<div class="market-restore-list">'
            + list.map(function (r) {
                return '<div class="market-restore-row" data-id="' + esc(r.id) + '">'
                    + '<img src="' + esc(avatarOf(r)) + '" alt="" loading="lazy">'
                    + '<span class="mk-restore-name">' + esc(r.name) + '<em>' + esc(r.origin) + '</em></span>'
                    + '<button class="market-ghost" type="button" data-restore="' + esc(r.id) + '"><i class="ri-arrow-go-back-line"></i> 恢复</button>'
                    + '</div>';
            }).join('')
            + '</div>'
            + '<div class="market-dialog-actions">'
            + '<button class="market-ghost" type="button" id="restore-all"><i class="ri-refresh-line"></i> 全部恢复（' + list.length + '）</button>'
            + '</div>';
        openModal('恢复移出主站的角色（' + list.length + '）', html);

        // openModal 每次都会换一份全新的 body 容器，这里绑的监听不会重复叠加
        var body = $('market-modal-body');
        if (!body) return;
        body.addEventListener('click', function (event) {
            var target = event.target;
            var one = target.closest ? target.closest('button[data-restore]') : null;
            if (one) { applyRestore([one.dataset.restore]); return; }
            var all = target.closest ? target.closest('#restore-all') : null;
            if (all) applyRestore(removedRoleList().map(function (r) { return r.id; }));
        });
    }

    /* ---------------- 绑定 ---------------- */

    function bindMine() {
        var search = $('mine-search');
        if (search) search.addEventListener('input', renderMine);
        var group = $('mine-group');
        if (group) group.addEventListener('change', function () { state.mineGroup = group.value; renderMine(); });
        var sort = $('mine-sort');
        if (sort) sort.addEventListener('change', renderMine);

        // 「恢复移出主站」：集中把被移出的角色加回来，不用再回主站
        var restoreBtn = $('mine-restore-btn');
        if (restoreBtn) restoreBtn.addEventListener('click', openRestoreDialog);

        var selectAll = $('mine-select-all');
        if (selectAll) selectAll.addEventListener('click', function () {
            var ids = mineRoles().map(function (r) { return r.id; });
            var allSelected = ids.length > 0 && ids.every(function (id) { return state.selection[id]; });
            state.selection = {};
            if (!allSelected) ids.forEach(function (id) { state.selection[id] = true; });
            updateBatchBar();
            toast(allSelected ? '已取消全选' : '已选中 ' + ids.length + ' 个角色');
        });
        var clear = $('mine-clear-sel');
        if (clear) clear.addEventListener('click', function () { state.selection = {}; updateBatchBar(); });

        var bar = $('mine-batchbar');
        if (bar) bar.addEventListener('click', function (event) {
            var btn = event.target.closest ? event.target.closest('button[data-batch]') : null;
            if (btn) batchApply(btn.dataset.batch);
        });

        var grid = $('mine-grid');
        if (grid) grid.addEventListener('click', function (event) {
            var btn = event.target.closest ? event.target.closest('button[data-act]') : null;
            if (btn) {
                var id = btn.dataset.id;
                if (btn.dataset.act === 'chat') location.href = 'index.html?friend=' + encodeURIComponent(id);
                else if (btn.dataset.act === 'group') askGroupName(groupOf(id)).then(function (name) {
                    if (!name) return;
                    setGroup(id, name);
                    toast('已把「' + nameOf(id) + '」移动到「' + name + '」');
                    renderMine();
                });
                else if (btn.dataset.act === 'remove') singleRemove(id);
                else if (btn.dataset.act === 'delete') singleDelete(id);
                return;
            }
            var card = event.target.closest ? event.target.closest('.market-card') : null;
            if (card) {
                var cardId = card.dataset.id;
                if (state.selection[cardId]) delete state.selection[cardId];
                else state.selection[cardId] = true;
                updateBatchBar();
            }
        });
    }

    function bindMarket() {
        var search = $('market-search');
        if (search) search.addEventListener('input', renderMarket);
        var source = $('market-source');
        if (source) source.addEventListener('change', renderMarket);
        var work = $('market-work');
        if (work) work.addEventListener('change', renderMarket);
        var sort = $('market-sort');
        if (sort) sort.addEventListener('change', renderMarket);
        var openSite = $('market-open-site');
        if (openSite) openSite.addEventListener('click', openSiteCreate);
        var checkUpdates = $('market-check-updates');
        if (checkUpdates) checkUpdates.addEventListener('click', openUpdateDialog);
        var grid = $('market-grid');
        if (grid) grid.addEventListener('click', function (event) {
            var btn = event.target.closest ? event.target.closest('button[data-act]') : null;
            if (!btn) return;
            var id = btn.dataset.id;
            var act = btn.dataset.act;
            if (act === 'detail') showPresetDetail(id);
            else if (act === 'add') addPresetCard(id);
            else if (act === 'update') singleUpdate(id);
            else if (act === 'add-builtin') addBuiltIn(id);
            else if (act === 'remove') singleRemove(id);
        });
    }

    function bindGroups() {
        var add = $('group-add');
        if (add) add.addEventListener('click', function () {
            askText('新建分组', '分组名称', '', '例如：星穹列车').then(function (name) {
                if (!name) return;
                if (allGroupNames().indexOf(name) >= 0) { toast('已经有同名分组了'); return; }
                var merged = customGroups().concat([name]);
                writeJson(KEY_GROUPS, merged.filter(function (n, i, arr) { return arr.indexOf(n) === i; }));
                toast('已新建分组「' + name + '」');
                renderGroups();
                renderMine();
            });
        });
        var list = $('group-list');
        if (list) list.addEventListener('click', function (event) {
            var btn = event.target.closest ? event.target.closest('button[data-act]') : null;
            if (!btn) return;
            var name = btn.dataset.group;
            if (btn.dataset.act === 'rename') {
                askText('重命名分组', '新名称', name, '').then(function (next) {
                    if (!next || next === name) return;
                    if (allGroupNames().indexOf(next) >= 0) { toast('已经有同名分组了'); return; }
                    var groups = customGroups().map(function (n) { return n === name ? next : n; });
                    if (groups.indexOf(next) < 0 && customGroups().indexOf(name) >= 0) groups.push(next);
                    writeJson(KEY_GROUPS, groups.filter(function (n, i, arr) { return arr.indexOf(n) === i; }));
                    mineRoles().forEach(function (role) { if (role.group === name) setGroup(role.id, next); });
                    toast('分组已重命名为「' + next + '」');
                    renderGroups();
                    renderMine();
                });
            } else if (btn.dataset.act === 'delgroup') {
                var count = groupMemberCount(name);
                confirmDialog({
                    title: '删除分组',
                    message: '删除分组「' + name + '」？' + (count
                        ? '\n\n组内 ' + count + ' 个角色会回到「' + DEFAULT_GROUP + '」，角色与聊天记录都不会被删除。'
                        : ''),
                    okText: '删除分组',
                    danger: true
                }).then(function (ok) {
                    if (!ok) return;
                    writeJson(KEY_GROUPS, customGroups().filter(function (n) { return n !== name; }));
                    mineRoles().forEach(function (role) { if (role.group === name) setGroup(role.id, DEFAULT_GROUP); });
                    toast('已删除分组「' + name + '」');
                    renderGroups();
                    renderMine();
                });
            }
        });
    }

    function bindTheme() {
        var btn = $('market-theme-btn');
        if (!btn) return;
        // 与主站同一套存储：themeMode = 'light' | 'dark' | 'sr' | 'sr-dark' | 'zzz'
        // 市场页只分深浅两档渲染：星铁浅 / 浅色 → 浅色；星铁深 / 绝区零 / 深色 → 深色。
        // 绝区零皮肤由 zzz-theme.css 里的 body.market-page.zzz-theme 提供（只换色不改版式）。
        function mode() { return localStorage.getItem('themeMode') || 'dark'; }
        function isLight() {
            var m = mode();
            if (m === 'light' || m === 'sr') return true;
            return false;
        }
        function apply(light) {
            document.body.classList.toggle('light-theme', light);
            // 切到浅色时把绝区零皮肤摘掉，否则两套色会打架
            if (light) document.body.classList.remove('zzz-theme');
            else document.body.classList.toggle('zzz-theme', mode() === 'zzz');
            var icon = btn.querySelector('i');
            if (icon) icon.className = light ? 'ri-moon-line' : 'ri-sun-line';
            btn.title = light ? '当前：浅色（点击切深色）' : '当前：深色（点击切浅色）';
        }
        apply(isLight());
        btn.addEventListener('click', function () {
            var next = !isLight();
            try { localStorage.setItem('themeMode', next ? 'light' : 'dark'); } catch (e) { toast('主题保存失败：存储空间不足'); }
            apply(next);
        });
    }

    function init() {
        state.builtIn = window.defaultFriendsData || {};
        Array.prototype.forEach.call(document.querySelectorAll('.market-tab'), function (btn) {
            btn.addEventListener('click', function () { switchTab(btn.dataset.tab); });
        });
        var closeBtn = $('market-modal-close');
        if (closeBtn) closeBtn.addEventListener('click', closeModal);
        var modal = $('market-modal');
        if (modal) modal.addEventListener('click', closeModalOnBackdrop);
        document.addEventListener('keydown', function (event) {
            if (event.key === 'Escape') closeModal();
        });
        // 头像加载失败时换成占位图。用捕获阶段的委托而不是内联 onerror：
        // 占位图是内联 SVG（含双引号），塞进 HTML 属性会把属性提前关掉。
        document.addEventListener('error', function (event) {
            var img = event.target;
            if (img && img.tagName === 'IMG' && img.classList && img.classList.contains('mk-avatar') && img.dataset.fb !== '1') {
                img.dataset.fb = '1';
                img.src = FALLBACK_AVATAR;
            }
        }, true);

        bindMine();
        bindMarket();
        bindGroups();
        bindTheme();

        renderTabCounts();
        renderMine();
        // 目录只带元信息（几 KB），打开页面就读它，让「角色卡市场」的计数立刻准确；
        // 同时也把「预置角色 id → 分片」的对应关系登记一次（只写两个小键，不下载正文）。
        ensureCatalog().then(function () { ensurePresetPack(); renderTabCounts(); });
        if (location.hash === '#market') switchTab('market');
    }

    /* ---------------- 标签页与状态 ---------------- */

    function switchTab(tab) {
        state.tab = tab;
        Array.prototype.forEach.call(document.querySelectorAll('.market-tab'), function (btn) {
            btn.classList.toggle('active', btn.dataset.tab === tab);
        });
        Array.prototype.forEach.call(document.querySelectorAll('.market-panel'), function (panel) {
            panel.hidden = panel.dataset.panel !== tab;
        });
        if (tab === 'market') {
            ensurePresetPack();
            renderMarket();
        } else if (tab === 'groups') renderGroups();
        else renderMine();
        renderTabCounts();
    }

    function renderTabCounts() {
        var mine = $('tab-count-mine');
        if (mine) mine.textContent = String(mineRoles().length);
        var market = $('tab-count-market');
        if (market) market.textContent = String(state.catalog.length || 0);
        // 顺手刷新「恢复移出」入口（幂等、开销极小）
        updateRestoreEntry();
    }

    function isInstalled(id) {
        var card = installedCards()[id];
        return Boolean(card && !card.removed);
    }

    /* ---------------- 预置卡内容更新 ----------------
       目录里的 catalog.version 只用来穿透缓存（分片 URL 的 ?v=N），
       一次发版会让所有分片换 URL，不能拿它判断「这张卡有没有新版」——
       否则 92 张每次都会被标成有更新。单卡用独立的 contentVersion 比较。
    */

    /** 目录里这张卡的内容修订号；早期目录没有该字段，按 1 处理 */
    function cardRevOf(card) {
        if (!card) return 1;
        var raw = card.contentVersion;
        if (raw === undefined || raw === null || raw === '') return 1;
        var n = Number(raw);
        return isFinite(n) ? n : 1;
    }

    /** 本机安装记录的内容修订号；老记录没有该字段，同样按 1 处理 */
    function installedRevOf(rec) {
        if (!rec) return 1;
        var raw = rec.contentVersion;
        // 不能写 Number(raw) || 1：0 是合法修订号，会被 || 吞成 1，
        // 那样「本机 v0 对目录 v1」就永远判不出有新版。
        if (raw === undefined || raw === null || raw === '') return 1;
        var n = Number(raw);
        return isFinite(n) ? n : 1;
    }

    /**
     * 有没有新版：只比两个整数，不下载正文。
     * 92 张卡打开页面就能一次算完，不会因为逐张读分片把页面卡死。
     * 移出主站的卡不算（用户明确不要它了，别在工具栏里追着提醒）。
     */
    function needsUpdate(id) {
        var rec = installedCards()[id];
        if (!rec || rec.removed) return false;
        var card = cardOf(id);
        if (!card) return false;
        return installedRevOf(rec) < cardRevOf(card);
    }

    /** 有新版且还在主站里的卡 */
    function pendingUpdates() {
        return scanUpdates().filter(function (row) { return row.status === 'update'; });
    }

    /**
     * 把一张已安装的卡刷成市场当前版本。
     * 只覆盖正文相关的四个字段 + 版本号；
     * addedAt / group / removed / friendSettings / 聊天线程 / 用户改写的提示词一概不碰。
     */
    function updatePresetCard(id, options) {
        var opts = options || {};
        var card = cardOf(id);
        if (!card) return Promise.resolve({ ok: false, reason: 'missing' });
        if (!installedCards()[id]) return Promise.resolve({ ok: false, reason: 'not-installed' });
        return loadCatalogPack(card.pack || 'market').then(function () {
            var body = marketBodyOf(id);
            if (!body || String(body.systemPrompt || '').trim().length < 400) {
                // 分片没下来 / 下来的是残桩：一个字节都不改，让用户重试
                return { ok: false, reason: 'pack-failed' };
            }
            var installed = installedCards();
            var rec = installed[id];
            if (!rec) return { ok: false, reason: 'not-installed' };
            var nextPrompt = String(body.systemPrompt || '');
            var prevLen = String(rec.systemPrompt || '').length;
            // 新版比旧版短掉一半以上，多半是读到了占位内容。
            // 这种情况下宁可停在旧版，也别让用户手里的人设凭空瘦一半。
            if (prevLen && nextPrompt.length < prevLen * 0.5 && !opts.force) {
                return { ok: false, reason: 'shrunk', prevLen: prevLen, nextLen: nextPrompt.length };
            }
            var from = installedRevOf(rec);
            rec.name = body.name || rec.name || id;      // 只改展示名，id 是主键不能动
            rec.avatar = body.avatar || rec.avatar || '';
            rec.systemPrompt = nextPrompt;
            rec.welcomeMessage = String(body.welcomeMessage || rec.welcomeMessage || '');
            rec.version = card.version || rec.version || '1.0';
            rec.contentVersion = cardRevOf(card);
            rec.updatedAt = Date.now();
            if (!writeJson(KEY_INSTALLED, installed)) return { ok: false, reason: 'quota' };
            return { ok: true, from: from, to: rec.contentVersion };
        }).catch(function () {
            return { ok: false, reason: 'pack-failed' };
        });
    }

    /** 逐张比对已安装卡与目录版本，给「检查更新」弹窗用 */
    function scanUpdates() {
        var installed = installedCards();
        var rows = [];
        Object.keys(installed).forEach(function (id) {
            var rec = installed[id];
            if (!rec) return;
            var card = cardOf(id);
            var row = {
                id: id,
                name: (card && card.name) || rec.name || id,
                avatar: (card && card.avatar) || rec.avatar || '',
                from: installedRevOf(rec),
                to: cardRevOf(card),
                status: 'latest'
            };
            if (!card) row.status = 'missing';
            else if (rec.removed) row.status = 'removed';
            else if (installedRevOf(rec) < cardRevOf(card)) row.status = 'update';
            rows.push(row);
        });
        rows.sort(function (a, b) {
            var rank = { update: 0, missing: 1, removed: 2, latest: 3 };
            return (rank[a.status] - rank[b.status]) || String(a.name).localeCompare(String(b.name), 'zh-CN');
        });
        return rows;
    }

    /** 单卡更新：给市场卡片上的「更新」按钮用 */
    function singleUpdate(id) {
        var card = cardOf(id);
        var name = (card && card.name) || id;
        toast('正在更新「' + name + '」…');
        updatePresetCard(id).then(function (result) {
            if (result.ok) {
                toast('「' + name + '」已更新到 v' + result.to + '——回短信页刷新后生效');
                refreshAfterUpdate();
                return;
            }
            if (result.reason === 'shrunk') {
                confirmDialog({
                    title: '新版反而更短',
                    message: '「' + name + '」的新版正文比现在本机的短了 '
                        + Math.round((1 - result.nextLen / result.prevLen) * 100) + '%（'
                        + result.prevLen + ' → ' + result.nextLen + ' 字）。\n\n'
                        + '通常这说明分片没加载完整。确认要覆盖成短的那一版吗？',
                    okText: '仍然更新',
                    danger: true
                }).then(function (ok) {
                    if (!ok) return;
                    updatePresetCard(id, { force: true }).then(function (second) {
                        if (second.ok) { toast('「' + name + '」已更新'); refreshAfterUpdate(); }
                        else toast('更新失败：' + reasonText(second.reason));
                    });
                });
                return;
            }
            toast('更新失败：' + reasonText(result.reason));
        });
    }

    /** 批量更新：同一分片只下载一次，单张失败不影响其余 */
    async function bulkUpdatePresetCards(ids) {
        var list = (ids || []).filter(function (id) { return cardOf(id); });
        var done = 0;
        var failed = 0;
        var packs = {};
        list.forEach(function (id) {
            var pack = (cardOf(id) || {}).pack || 'market';
            (packs[pack] = packs[pack] || []).push(id);
        });
        for (var key of Object.keys(packs)) {
            await loadCatalogPack(key);
            for (var id of packs[key]) {
                var result = await updatePresetCard(id);
                if (result.ok) done++;
                else failed++;
            }
        }
        return { done: done, failed: failed };
    }

    function reasonText(reason) {
        if (reason === 'pack-failed') return '角色卡正文没下载下来，请检查网络后重试';
        if (reason === 'quota') return '本机存储空间满了，先清理一些角色卡';
        if (reason === 'missing') return '市场里已经没有这张卡了';
        if (reason === 'not-installed') return '这张卡不在主站里';
        if (reason === 'shrunk') return '新版比旧版短太多，已取消';
        return '未知原因';
    }

    function refreshAfterUpdate() {
        renderMarket();
        renderMine();
        renderTabCounts();
        updateUpdateBadge();
    }

    /** 工具栏上的「检查更新」角标 */
    function updateUpdateBadge() {
        var btn = $('market-check-updates');
        var count = $('market-update-count');
        if (!btn) return;
        var n = pendingUpdates().length;
        if (count) {
            count.textContent = String(n);
            count.hidden = !n;
        }
        btn.classList.toggle('has-update', n > 0);
    }

    /** 「检查更新」弹窗：列出可更新的卡，支持一键全更 */
    function openUpdateDialog() {
        var rows = scanUpdates();
        var pending = rows.filter(function (row) { return row.status === 'update'; });
        var label = { latest: '已是最新', removed: '已移出主站', missing: '市场已下架' };
        var html = '';
        if (!rows.length) {
            html = '<p class="market-hint">主站里还没有从市场添加的角色卡。</p>';
        } else {
            html += '<p class="market-hint">共 ' + rows.length + ' 张已安装的卡，' + pending.length + ' 张有新版。'
                + '更新只替换人设与开场白，你的分组、备注、聊天记录都不会动。</p>';
            html += '<div class="market-update-list">';
            rows.forEach(function (row) {
                html += '<div class="market-update-row" data-update-id="' + esc(row.id) + '">'
                    + '<img class="mk-avatar" src="' + esc(row.avatar || FALLBACK_AVATAR) + '" alt="" loading="lazy">'
                    + '<div class="mk-body"><div class="mk-name">' + esc(row.name) + '</div>'
                    + '<div class="mk-sub">'
                    + (row.status === 'update'
                        ? 'v' + row.from + ' → v' + row.to
                        : (label[row.status] || ''))
                    + '</div></div>'
                    + (row.status === 'update'
                        ? '<button class="market-ghost primary" type="button" data-update-one="' + esc(row.id) + '">更新</button>'
                        : '')
                    + '</div>';
            });
            html += '</div>';
            if (!pending.length) html += '<p class="market-hint">全部都是最新的。</p>';
        }
        html += '<div class="market-dialog-actions">'
            + '<button class="market-ghost" type="button" data-mk="close">关闭</button>'
            + (pending.length
                ? '<button class="market-ghost primary" type="button" data-mk="all">全部更新（' + pending.length + '）</button>'
                : '')
            + '</div>';
        openModal('检查更新', html);

        var body = $('market-modal-body');
        body.addEventListener('click', function (event) {
            var target = event.target.closest ? event.target.closest('button') : null;
            if (!target) return;
            var oneId = target.dataset ? target.dataset.updateOne : '';
            var act = target.dataset ? target.dataset.mk : '';
            if (act === 'close') { closeModal(); return; }
            if (oneId) {
                target.disabled = true;
                updatePresetCard(oneId).then(function (result) {
                    if (result.ok) {
                        toast('已更新');
                        refreshAfterUpdate();
                        openUpdateDialog();   // 重画列表，让这一行变成「已是最新」
                    } else {
                        target.disabled = false;
                        toast('更新失败：' + reasonText(result.reason));
                    }
                });
                return;
            }
            if (act === 'all') {
                var ids = pendingUpdates().map(function (row) { return row.id; });
                if (!ids.length) { closeModal(); return; }
                target.disabled = true;
                target.textContent = '正在更新…';
                bulkUpdatePresetCards(ids).then(function (result) {
                    refreshAfterUpdate();
                    closeModal();
                    toast('更新完成：成功 ' + result.done + ' 张'
                        + (result.failed ? '，失败 ' + result.failed + ' 张' : '')
                        + '。回短信页刷新后生效');
                });
            }
        });
    }

    /**
     * 预置角色卡在「这一页」的内存分片：让 CharacterPacks 认得出这些 id，
     * 页内「查看设定」与「去聊天」都能取到正文。
     * 主站不需要它 —— 主站重建角色时直接用本机的 installedPresetCards。
     */
    function ensurePresetPack() {
        var name = 'market-data';
        window.__MY_SW_CHAR_PACKS = window.__MY_SW_CHAR_PACKS || {};
        window.__MY_SW_PRESET_PACK_OF = window.__MY_SW_PRESET_PACK_OF || {};
        var links = readJson(KEY_PACK_OF, {});
        if (!links || typeof links !== 'object') links = {};
        var store = {};
        state.catalog.forEach(function (card) {
            window.__MY_SW_PRESET_PACK_OF[card.id] = name;
            links[card.id] = name;
        });
        Object.keys(installedCards()).forEach(function (id) {
            var card = installedCards()[id];
            window.__MY_SW_PRESET_PACK_OF[id] = name;
            links[id] = String((card && card.pack) || name);
            store[id] = {
                id: id,
                name: (card && card.name) || id,
                avatar: (card && card.avatar) || '',
                systemPrompt: String((card && card.systemPrompt) || ''),
                welcomeMessage: String((card && card.welcomeMessage) || ''),
                isCustom: false
            };
        });
        window.__MY_SW_CHAR_PACKS[name] = store;
        // 登记 id → 分片，主站才能知道这些角色的提示词归属，
        // 否则 CharacterPacks 认不出从市场加进来的角色。
        // 只在内容真的变了才写：这个函数每次切到「角色卡市场」标签都会跑，
        // 旧实现无条件写一遍 localStorage（stringify + 同步落盘），
        // 什么都没变也要付一次完整序列化成本，是开页卡顿的一部分。
        var serialized = JSON.stringify(links);
        if (localStorage.getItem(KEY_PACK_OF) !== serialized) writeJson(KEY_PACK_OF, links);
    }

/* ---------------- 分组数据层 ---------------- */

    /** 全部分组：默认分组永远在最前，其余按中文排序 */
    function allGroupNames() {
        var list = [];
        function push(name) {
            var n = String(name || '').trim();
            if (n && list.indexOf(n) < 0) list.push(n);
        }
        push(DEFAULT_GROUP);
        mineRoles().forEach(function (role) { push(role.group); });
        customGroups().forEach(push);
        return list.sort(function (a, b) {
            if (a === DEFAULT_GROUP) return -1;
            if (b === DEFAULT_GROUP) return 1;
            return a.localeCompare(b, 'zh-CN');
        });
    }

    function groupMemberCount(groupName) {
        return mineRoles().filter(function (role) { return role.group === groupName; }).length;
    }

    function addGroup(name) {
        var target = String(name || '').trim();
        if (!target || allGroupNames().indexOf(target) >= 0) return false;
        var merged = customGroups().concat([target]);
        writeJson(KEY_GROUPS, merged.filter(function (n, i, arr) { return arr.indexOf(n) === i; }));
        return true;
    }

    function renameGroup(oldName, newName) {
        var target = String(newName || '').trim();
        if (!target || target === oldName) return false;
        if (allGroupNames().indexOf(target) >= 0) return false;
        var merged = customGroups().map(function (n) { return n === oldName ? target : n; });
        if (customGroups().indexOf(oldName) >= 0) merged.push(target);
        writeJson(KEY_GROUPS, merged.filter(function (n, i, arr) { return arr.indexOf(n) === i; }));
        mineRoles().forEach(function (role) { if (role.group === oldName) setGroup(role.id, target); });
        return true;
    }

    function deleteGroup(name) {
        var target = String(name || '').trim();
        if (!target || target === DEFAULT_GROUP) return false;
        writeJson(KEY_GROUPS, customGroups().filter(function (n) { return n !== target; }));
        mineRoles().forEach(function (role) { if (role.group === target) setGroup(role.id, DEFAULT_GROUP); });
        return true;
    }

    // 页面自身的受控入口：只做本机数据操作，不涉及任何网络请求。
    // 保留它是为了「同一套逻辑」可被自检脚本与将来的其它页面直接复用，
    // 而不是各写一份改分组的代码。
    window.CharacterMarket = {
        refresh: function () { renderTabCounts(); renderMine(); renderGroups(); },
        roles: mineRoles,
        groups: allGroupNames,
        groupOf: groupOf,
        setGroup: setGroup,
        addGroup: addGroup,
        renameGroup: renameGroup,
        deleteGroup: deleteGroup,
        removeRole: removeRole,
        deleteRole: deleteRole,
        addPreset: addPresetCard,
        createGroupChat: createGroupChat,
        switchTab: switchTab,
        addBuiltIn: addBuiltIn,
        state: state
    };

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();

/* —— 角色卡市场弹窗拉板：底部拉杆调高、右下角调宽+高，双击恢复，大小记住 —— */
enableModalResize(document.getElementById('market-modal'), {
    key: 'market-dialog',
    barStyle: {
        position: 'sticky',
        bottom: '-22px',
        margin: '0 -22px -22px',
        padding: '0 22px',
        background: '#292d38',
        borderRadius: '0 0 13px 13px',
        borderTop: '1px solid #515664'
    }
});
