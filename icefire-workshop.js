/**
 * 实验室 · 森林冰火人创意工坊（icefire-workshop.js）
 * · 网格上点选放置部件（墙、湖、宝石、门、钮、石头、移台、出生点、出口）；
 * · 选中一个部件后改它的参数：颜色、移台行程/速度、门柱高度、
 * 以及「自己画」的外观（画在格子里，游戏中按原样贴上去）；
 * · 碰撞区自己框：墙 / 门默认整格挡路，画了外观后可以改成
 * 「不挡路」或「只挡下半格」（当单向踏板用）；
 * · 做好的关卡出现在游戏右侧「选关」条里（内置三关之后，虚线按钮）；
 * · 可以导出成一个 .js 文件发给朋友，朋友在工坊里「导入分享文件」即可玩。
 * 存储：localStorage['icefireWorkshop']，只存关卡数据（自绘是小画布的
 * dataURL，单格 32×32，体积可控）。
 */
(function () {
    'use strict';

    const STORE_KEY = 'icefireWorkshop';
    const MAX_LEVELS = 24;
    const COLS_MIN = 12, COLS_MAX = 40, ROWS_MIN = 8, ROWS_MAX = 24;

    /* 部件目录。ch 与 forest-icefire.js 的图例一一对应，
       这样导出的地图字符串可以直接被 parseLevel 吃掉。 */
    const TOOLS = [
        { id: 'wall', ch: '#', name: '墙', group: '地形' },
        { id: 'erase', ch: '.', name: '橡皮', group: '地形' },
        { id: 'fireLake', ch: 'F', name: '火湖', group: '地形' },
        { id: 'waterLake', ch: 'W', name: '水湖', group: '地形' },
        { id: 'goo', ch: 'G', name: '毒泥', group: '地形' },
        { id: 'fireStart', ch: 'P', name: '火出生', group: '角色' },
        { id: 'waterStart', ch: 'Q', name: '水出生', group: '角色' },
        { id: 'fireExit', ch: 'D', name: '火出口', group: '角色' },
        { id: 'waterExit', ch: 'E', name: '水出口', group: '角色' },
        { id: 'fireGem', ch: 'f', name: '火宝石', group: '收集' },
        { id: 'waterGem', ch: 'w', name: '水宝石', group: '收集' },
        { id: 'rock', ch: 'O', name: '石头', group: '机关' },
        { id: 'doorA', ch: '!', name: '门A', group: '机关' },
        { id: 'doorB', ch: '@', name: '门B', group: '机关' },
        { id: 'btnA', ch: '3', name: '钮A·火', group: '机关' },
        { id: 'btnB', ch: '4', name: '钮B·水', group: '机关' },
        { id: 'moverX', ch: 'h', name: '横移台', group: '机关' },
        { id: 'moverY', ch: 'v', name: '升降台', group: '机关' }
    ];
    const TOOL_BY_CH = {};
    TOOLS.forEach(t => { TOOL_BY_CH[t.ch] = t; });

    /* 这些部件一个关卡里只允许出现一次（出生点 / 出口） */
    const UNIQUE = { P: true, Q: true, D: true, E: true };

    const DEFAULT_COLORS = {
        '#': '#3d3325', F: '#ff5a28', W: '#3c96ff', G: '#78dc50',
        f: '#ffb03c', w: '#7fd8ff', O: '#8a8f98', '!': '#c9a24a', '@': '#7fbf6a',
        h: '#7a6a4a', v: '#7a6a4a', '3': '#ffb199', '4': '#b9dcff',
        D: '#ff7a3c', E: '#4fb7ff', P: '#ff7a3c', Q: '#4fb7ff'
    };

    function blankLevel() {
        const cols = 24, rows = 12;
        const map = [];
        for (let y = 0; y < rows; y++) {
            map.push(y >= rows - 2 ? '#'.repeat(cols) : '.'.repeat(cols));
        }
        map[rows - 3] = 'P' + '.'.repeat(cols - 4) + 'Q..';
        return { id: uid(), name: '未命名关卡', tip: '', map, props: {}, updatedAt: Date.now() };
    }

    function uid() {
        return 'lv_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    }

    /* ---------------- 存取 ---------------- */

    function readStore() {
        try {
            const raw = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
            if (raw && Array.isArray(raw.levels)) return raw;
        } catch (e) { /* 损坏就当没有 */ }
        return { levels: [] };
    }
    function writeStore(store) {
        try {
            localStorage.setItem(STORE_KEY, JSON.stringify(store));
            return true;
        } catch (e) {
            toast('存不下了：浏览器存储空间已满。删几关或清掉自绘再试。');
            return false;
        }
    }

    /** 转成 forest-icefire.js 能直接 parseLevel 的关卡定义 */
    function toPlayable(lv) {
        const props = {};
        const src = lv.props || {};
        Object.keys(src).forEach(k => {
            const p = src[k];
            if (!p) return;
            const out = {};
            if (p.color) out.color = p.color;
            if (p.art) out.art = p.art;
            if (p.hit && p.hit !== 'full') out.hit = p.hit;
            if (typeof p.travel === 'number') out.travel = p.travel;
            if (typeof p.speed === 'number') out.speed = p.speed;
            if (typeof p.span === 'number') out.span = p.span;
            if (Object.keys(out).length) props[k] = out;
        });
        return { name: lv.name || '自制关卡', tip: lv.tip || '', map: lv.map.slice(), props, workshop: true };
    }

    /* ---------------- 地图读写（保持每行等长） ---------------- */

    function setCell(lv, x, y, ch) {
        const row = lv.map[y];
        if (row == null || x < 0 || x >= row.length) return;
        if (UNIQUE[ch]) {
            // 必须改 lv.map 里的最新那一行：出生点在同一行挪位置时，
            // 循环开头缓存的 line 是旧字符串，写回去会把刚放下的格子盖掉。
            for (let yy = 0; yy < lv.map.length; yy++) {
                const line = lv.map[yy];
                for (let xx = 0; xx < line.length; xx++) {
                    if (line[xx] === ch && !(xx === x && yy === y)) {
                        lv.map[yy] = line.slice(0, xx) + '.' + line.slice(xx + 1);
                    }
                }
            }
        }
        const fresh = lv.map[y];
        lv.map[y] = fresh.slice(0, x) + ch + fresh.slice(x + 1);
        if (ch === '.') delete lv.props[x + ',' + y];
    }

    function resize(lv, cols, rows) {
        cols = clamp(cols, COLS_MIN, COLS_MAX);
        rows = clamp(rows, ROWS_MIN, ROWS_MAX);
        const next = [];
        for (let y = 0; y < rows; y++) {
            const old = lv.map[y] || '';
            next.push((old + '.'.repeat(cols)).slice(0, cols));
        }
        lv.map = next;
        const props = {};
        Object.keys(lv.props || {}).forEach(k => {
            const [x, y] = k.split(',').map(Number);
            if (x < cols && y < rows) props[k] = lv.props[k];
        });
        lv.props = props;
    }

    function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }

    /* ---------------- 界面 ---------------- */

    const ui = { tool: '#', levelId: null, painting: false, selected: null, batch: new Set(), batchPaint: null, batchColor: '' };

    function levels() { return readStore().levels; }

    function currentLevel() {
        const all = levels();
        let lv = all.find(l => l.id === ui.levelId);
        if (!lv && all.length) { ui.levelId = all[0].id; lv = all[0]; }
        return lv || null;
    }

    function saveCurrent(lv) {
        const store = readStore();
        const i = store.levels.findIndex(l => l.id === lv.id);
        lv.updatedAt = Date.now();
        if (i >= 0) store.levels[i] = lv; else store.levels.push(lv);
        if (writeStore(store)) window.ForestIcefire?.refreshLevelRow?.();
    }

    function toast(msg) {
        if (window.showToast) window.showToast(msg, 'ri-information-line');
        else console.log('[工坊] ' + msg);
    }

    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, c => (
            { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
        ));
    }

    /* ---- 面板骨架 ---- */

    let panel = null;

    function ensurePanel() {
        if (panel) return panel;
        panel = document.createElement('section');
        panel.id = 'fif-workshop';
        panel.hidden = true;
        panel.innerHTML = [
            '<header class="fifw-head">',
            '  <h3><i class="ri-brush-line"></i> 冰火人工坊</h3>',
            '  <button type="button" class="fifw-x" data-act="close" aria-label="关闭"><i class="ri-close-line"></i></button>',
            '</header>',
            '<div class="fifw-body">',
            '  <aside class="fifw-tools" id="fifw-tools"></aside>',
            '  <div class="fifw-stage">',
            '    <div class="fifw-stage-bar">',
            '      <label>关卡 <select id="fifw-level-select"></select></label>',
            '      <button type="button" data-act="new">新建</button>',
            '      <button type="button" data-act="dup">复制</button>',
            '      <button type="button" data-act="del">删除</button>',
            '      <label>宽 <input id="fifw-cols" type="number" min="12" max="40"></label>',
            '      <label>高 <input id="fifw-rows" type="number" min="8" max="24"></label>',
            '      <button type="button" data-act="resize">改尺寸</button>',
            '    </div>',
            '    <div id="fifw-batchbar" class="fifw-batchbar" hidden></div>',
            '    <div class="fifw-grid-scroll"><div id="fifw-grid" class="fifw-grid"></div></div>',
            '    <p class="fifw-legend">左键放置 / 拖动连续放置，右键擦除。点「选中」工具后再点格子，可改这个部件的颜色、行程和碰撞；点「批量选」可以框住多个格子一次性改。</p>',
            '  </div>',
            '  <aside class="fifw-side">',
            '    <label class="fifw-field">关卡名<input id="fifw-name" type="text" maxlength="24"></label>',
            '    <label class="fifw-field">进关提示<textarea id="fifw-tip" maxlength="160" rows="2"></textarea></label>',
            '    <div id="fifw-props" class="fifw-props"></div>',
            '    <div class="fifw-share">',
            '      <button type="button" data-act="export">导出 JS 分享</button>',
            '      <button type="button" data-act="import">导入分享文件</button>',
            '      <input id="fifw-file" type="file" accept=".js,application/javascript,text/javascript" hidden>',
            '    </div>',
            '    <div id="fifw-chars" class="fifw-chars"></div>',
            '    <p class="fifw-note">做好的关卡会出现在游戏右侧选关条（内置三关之后，虚线按钮）。导出的 .js 发给朋友，对方在这里导入就能玩。关卡只存在这台浏览器里。</p>',
            '  </aside>',
            '</div>'
        ].join('');
        document.body.appendChild(panel);
        buildTools();
        panel.addEventListener('click', onPanelClick);
        panel.addEventListener('change', onPanelChange);
        panel.addEventListener('input', onPanelInput);
        const grid = panel.querySelector('#fifw-grid');
        grid.addEventListener('pointerdown', onGridDown);
        // 绘制中的移动不能只听网格：手指按住后滑出格子，
        // 事件的目标不再是格子，连续画就会断。改听整块地图区。
        panel.querySelector('.fifw-grid-scroll').addEventListener('pointermove', onGridMove);
        grid.addEventListener('contextmenu', e => e.preventDefault());
        panel.querySelector('#fifw-file').addEventListener('change', onImportFile);
        return panel;
    }

    function buildTools() {
        const box = panel.querySelector('#fifw-tools');
        let html = '<button type="button" data-tool="select" class="fifw-tool">选中</button>' +
            '<button type="button" data-tool="batch" class="fifw-tool">批量选</button>';
        let group = '';
        TOOLS.forEach(t => {
            if (t.group !== group) { group = t.group; html += '<b>' + group + '</b>'; }
            html += '<button type="button" data-tool="' + t.ch + '" class="fifw-tool">' + t.name + '</button>';
        });
        box.innerHTML = html;
        markTool();
    }

    function markTool() {
        panel.querySelectorAll('.fifw-tool').forEach(b => {
            b.classList.toggle('on', b.dataset.tool === (ui.tool === 'select' ? 'select' : ui.tool));
        });
    }

    function open() {
        if (!window.ForestIcefire) {
            const msg = '创意工坊要和森林冰火人一起用。\n请先到「设置 → 导入导出 → 加载 JS 文件设置」勾选「森林冰火人」和「冰火人工坊」，刷新后再来。';
            if (window.Dlg?.alert) window.Dlg.alert({ title: '冰火人工坊', message: msg });
            else alert(msg);
            return;
        }
        ensurePanel();
        const store = readStore();
        if (!store.levels.length) {
            const lv = blankLevel();
            store.levels.push(lv);
            writeStore(store);
            ui.levelId = lv.id;
        }
        panel.hidden = false;
        document.body.classList.add('fifw-on');
        loadCharArtPanel();
        renderAll();
    }

    function close() {
        panel.hidden = true;
        document.body.classList.remove('fifw-on');
        window.ForestIcefire?.refreshLevelRow?.();
    }

    /* ---- 渲染 ---- */

    function renderAll() {
        renderLevelSelect();
        renderMeta();
        renderGrid();
        renderProps();
        renderCharArt();
        renderBatchBar();
    }

    function renderLevelSelect() {
        const sel = panel.querySelector('#fifw-level-select');
        const all = levels();
        // 安全：id 也是属性位置（存档可被导入 / 篡改），照常转义。
        sel.innerHTML = all.map(l => '<option value="' + esc(l.id) + '">' + esc(l.name || '未命名') + '</option>').join('');
        if (ui.levelId) sel.value = ui.levelId;
    }

    function renderMeta() {
        const lv = currentLevel();
        if (!lv) return;
        panel.querySelector('#fifw-name').value = lv.name || '';
        panel.querySelector('#fifw-tip').value = lv.tip || '';
        panel.querySelector('#fifw-cols').value = (lv.map[0] || '').length;
        panel.querySelector('#fifw-rows').value = lv.map.length;
    }

    function renderGrid() {
        const lv = currentLevel();
        const grid = panel.querySelector('#fifw-grid');
        if (!lv) { grid.innerHTML = ''; return; }
        const cols = (lv.map[0] || '').length;
        grid.style.gridTemplateColumns = 'repeat(' + cols + ', 26px)';
        let html = '';
        for (let y = 0; y < lv.map.length; y++) {
            const row = lv.map[y];
            for (let x = 0; x < row.length; x++) {
                const ch = row[x];
                const prop = (lv.props || {})[x + ',' + y] || {};
                const sel = ui.selected && ui.selected.x === x && ui.selected.y === y ? ' sel' : '';
                const bsel = ui.batch && ui.batch.size && ui.batch.has(x + ',' + y) ? ' bsel' : '';
                const style = cellStyle(ch, prop);
                // 安全：自绘素材虽由本页生成，但存档可被导入/篡改，
                // 插入 src 前照常转义（esc 会处理引号与尖括号）。
                const art = prop.art ? '<img alt="" src="' + esc(prop.art) + '">' : '';
                // 安全：title 也是属性位置（toolName 会回退成原始字符），必须转义。
                html += '<i data-x="' + x + '" data-y="' + y + '" class="c-' + chCode(ch) + sel + bsel + '" style="' + style + '" title="' + x + ',' + y + ' ' + esc(toolName(ch)) + '">' + art + '</i>';
            }
        }
        grid.innerHTML = html;
    }

    function chCode(ch) { return ch === '#' ? 'wall' : ch === '.' ? 'air' : 'x' + ch.charCodeAt(0); }
    function toolName(ch) { return (TOOL_BY_CH[ch] && TOOL_BY_CH[ch].name) || (ch === '.' ? '空' : ch); }

    function cellStyle(ch, prop) {
        if (ch === '.') return '';
        // 安全：颜色会被拼进 style 属性，只接受纯十六进制值 ——
        // 存档被篡改时不能让引号 / 分号逃逸出属性去注入额外样式。
        const rawColor = prop.color || DEFAULT_COLORS[ch] || '#888888';
        const color = /^#[0-9a-f]{3,8}$/i.test(String(rawColor)) ? String(rawColor) : '#888888';
        if (ch === 'F' || ch === 'W' || ch === 'G' || ch === '3' || ch === '4') {
            return 'background:' + hexAlpha(color, .55);
        }
        return 'background:' + color;
    }

    /** 数值兜底：只接受有限数字并夹到合法区间，属性位置不可能带出引号 */
    function num(v, d, lo, hi) {
        const n = Number(v);
        return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d;
    }

    function hexAlpha(hex, a) {
        const m = /^#([0-9a-f]{6})$/i.exec(hex || '');
        if (!m) return hex;
        const n = parseInt(m[1], 16);
        return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
    }

    /* ---- 选中部件的参数面板 ---- */

    function renderProps() {
        const box = panel.querySelector('#fifw-props');
        const lv = currentLevel();
        const sel = ui.selected;
        if (!lv || !sel) { box.innerHTML = '<p class="fifw-empty">用「选中」工具点一个部件，这里就能改它的颜色、自绘外观和碰撞区。</p>'; return; }
        const ch = (lv.map[sel.y] || '')[sel.x];
        if (!ch || ch === '.') { box.innerHTML = '<p class="fifw-empty">这个格子是空的。</p>'; ui.selected = null; return; }
        const prop = (lv.props || {})[sel.x + ',' + sel.y] || {};
        const name = toolName(ch);
        // 安全：颜色只接受纯十六进制值；数值字段统一夹取，属性位置不会带出引号。
        const colorValue = /^#[0-9a-f]{3,8}$/i.test(String(prop.color || '')) ? String(prop.color) : (DEFAULT_COLORS[ch] || '#888888');
        let html = '<h4>' + esc(name) + ' · ' + sel.x + ',' + sel.y + '</h4>';
        html += '<label class="fifw-field">颜色<input type="color" id="fifw-color" value="' + colorValue + '"></label>';
        if (ch === 'h' || ch === 'v') {
            html += '<label class="fifw-field">行程（格）<input type="number" id="fifw-travel" min="1" max="8" step="1" value="' + num(prop.travel, ch === 'h' ? 3 : 2, 1, 8) + '"></label>';
            html += '<label class="fifw-field">速度<input type="number" id="fifw-speed" min="0.4" max="6" step="0.2" value="' + num(prop.speed, 1.6, 0.4, 6) + '"></label>';
        }
        if (ch === '!' || ch === '@') {
            html += '<label class="fifw-field">门柱高度（向上延伸几格）<input type="number" id="fifw-span" min="1" max="8" step="1" value="' + num(prop.span, 1, 1, 8) + '"></label>';
            html += '<p class="fifw-mini">改高度会把正上方的格子一起变成这扇门（原来的东西会被盖掉）。</p>';
        }
        if (ch === '#' || ch === '!' || ch === '@') {
            // 安全：hit 来自可被导入 / 篡改的存档，先归一化到白名单值，
            // 再拼进 option 的 value 属性，属性位置不可能被引号逃逸。
            const hit = ['full', 'half', 'none'].includes(prop.hit) ? prop.hit : 'full';
            html += '<label class="fifw-field">碰撞区<select id="fifw-hit">'
                + opt(hit, 'full', '整格挡路')
                + opt(hit, 'half', '只挡下半格（可当踏板）')
                + opt(hit, 'none', '不挡路（纯装饰）')
                + '</select></label>';
        }
        html += '<div class="fifw-art">';
        html += '<canvas id="fifw-art" width="32" height="32"></canvas>';
        html += '<div class="fifw-art-btns">';
        html += '<button type="button" data-act="art-clear">清掉自绘</button>';
        html += '<span>在左边小画布上直接画。画了之后游戏里用你的画替代默认外观，碰撞仍按上面的框。</span>';
        html += '</div></div>';
        box.innerHTML = html;
        mountArt(prop.art || '');
    }

    function opt(cur, v, label) { return '<option value="' + v + '"' + (cur === v ? ' selected' : '') + '>' + label + '</option>'; }

    /* ---- 自绘小画布 ---- */

    function mountArt(dataUrl) {
        const canvas = panel.querySelector('#fifw-art');
        if (!canvas) return;
        const g = canvas.getContext('2d');
        g.clearRect(0, 0, 32, 32);
        if (dataUrl) {
            const img = new Image();
            img.onload = () => g.drawImage(img, 0, 0, 32, 32);
            img.src = dataUrl;
        }
        let drawing = false;
        const colorOf = () => (panel.querySelector('#fifw-color')?.value) || '#ffffff';
        function dot(e) {
            const r = canvas.getBoundingClientRect();
            if (!r.width || !r.height) return;
            // 笔触是 2×2，坐标收到 30 以内，避免画出 32×32 画布、贴图被切边
            const x = Math.max(0, Math.min(30, Math.floor((e.clientX - r.left) / r.width * 32)));
            const y = Math.max(0, Math.min(30, Math.floor((e.clientY - r.top) / r.height * 32)));
            if (e.buttons === 2 || e.altKey) { g.clearRect(x, y, 2, 2); return; }
            g.fillStyle = colorOf();
            g.fillRect(x, y, 2, 2);
        }
        canvas.onpointerdown = e => { drawing = true; canvas.setPointerCapture(e.pointerId); dot(e); };
        canvas.onpointermove = e => { if (drawing) dot(e); };
        canvas.onpointerup = () => {
            if (!drawing) return;
            drawing = false;
            commitArt(canvas.toDataURL('image/png'));
        };
        canvas.oncontextmenu = e => e.preventDefault();
    }

    function commitArt(dataUrl) {
        const lv = currentLevel();
        if (!lv || !ui.selected) return;
        const key = ui.selected.x + ',' + ui.selected.y;
        const prop = lv.props[key] || (lv.props[key] = {});
        // 全透明就当没画
        if (isBlankArt(dataUrl)) delete prop.art; else prop.art = dataUrl;
        if (!Object.keys(prop).length) delete lv.props[key];
        saveCurrent(lv);
        paintCell(ui.selected.x, ui.selected.y);
    }

    function isBlankArt(dataUrl) {
        try {
            const canvas = panel.querySelector('#fifw-art');
            const g = canvas.getContext('2d');
            const data = g.getImageData(0, 0, 32, 32).data;
            for (let i = 3; i < data.length; i += 4) if (data[i] !== 0) return false;
            return true;
        } catch (e) { return !dataUrl; }
    }

    /* ---- 角色外观（火男孩 / 水女孩） ----
       可上传：一张完整人图；或头和身体分开各一张；行走帧（可多选，按顺序轮播）；
       跳跃图。图片统一缩到长边 ≤ 128px 的 PNG 存 IndexedDB，
       forest-icefire.js 会读同一个库来画，不传就是默认色块小人。 */

    const ART_DB = 'mySWIcefireChars';
    const ART_STORE = 'chars';
    const ART_MAX_EDGE = 128;
    const ART_KINDS = [{ id: 'fire', label: '火男孩' }, { id: 'water', label: '水女孩' }];
    const ART_PARTS = [
        { key: 'single', label: '完整人图' },
        { key: 'head', label: '头' },
        { key: 'body', label: '身体' }
    ];
    const ART_FRAMES = [
        { key: 'idle', label: '站立' },
        { key: 'walk', label: '行走（可多选，按顺序轮播）', multi: true },
        { key: 'jump', label: '跳跃' }
    ];
    const ART_WALK_MAX = 8;

    let charArts = { fire: null, water: null };

    function artDB() {
        return new Promise((resolve, reject) => {
            if (!window.indexedDB) { reject(new Error('浏览器不支持 IndexedDB')); return; }
            const req = indexedDB.open(ART_DB, 1);
            req.onupgradeneeded = () => {
                const db = req.result;
                if (!db.objectStoreNames.contains(ART_STORE)) db.createObjectStore(ART_STORE);
            };
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error || new Error('打不开外观库'));
        });
    }
    function artReadAll() {
        return artDB().then(db => new Promise(resolve => {
            const store = db.transaction(ART_STORE, 'readonly').objectStore(ART_STORE);
            const out = { fire: null, water: null };
            let left = 2;
            const done = () => { if (--left <= 0) resolve(out); };
            ART_KINDS.forEach(k => {
                const req = store.get(k.id);
                req.onsuccess = () => { out[k.id] = req.result || null; done(); };
                req.onerror = () => { out[k.id] = null; done(); };
            });
        })).catch(() => ({ fire: null, water: null }));
    }
    function artWrite(kind, rec) {
        return artDB().then(db => new Promise((resolve, reject) => {
            const tx = db.transaction(ART_STORE, 'readwrite');
            const store = tx.objectStore(ART_STORE);
            if (rec) store.put(rec, kind); else store.delete(kind);
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error || new Error('写入失败'));
        }));
    }

    function loadCharArtPanel() {
        return artReadAll().then(map => { charArts = map; renderCharArt(); });
    }

    /** 只保留认识的字段，顺手把异常值挡掉 */
    function normalizeArtRec(rec) {
        const out = { mode: rec && rec.mode === 'split' ? 'split' : 'single', single: null, head: null, body: null };
        if (!rec) return out;
        ['single', 'head', 'body'].forEach(p => {
            const part = rec[p];
            if (!part || typeof part !== 'object') return;
            const frames = {};
            if (typeof part.idle === 'string' && part.idle) frames.idle = part.idle;
            if (Array.isArray(part.walk)) {
                const walk = part.walk.filter(s => typeof s === 'string' && s).slice(0, ART_WALK_MAX);
                if (walk.length) frames.walk = walk;
            }
            if (typeof part.jump === 'string' && part.jump) frames.jump = part.jump;
            if (Object.keys(frames).length) out[p] = frames;
        });
        return out;
    }
    function hasAnyArt(rec) {
        return ['single', 'head', 'body'].some(p => rec[p] && Object.keys(rec[p]).length);
    }

    function renderCharArt() {
        const box = panel && panel.querySelector('#fifw-chars');
        if (!box) return;
        box.innerHTML = ART_KINDS.map(kind => artCardHtml(kind)).join('');
    }

    function artCardHtml(kind) {
        const rec = normalizeArtRec(charArts[kind.id]);
        const mode = rec.mode;
        let h = '<div class="fifw-charcard">';
        h += '<div class="fifw-charhead"><b>' + esc(kind.label) + '</b>';
        h += '<select data-art="mode" data-kind="' + kind.id + '">'
            + opt(mode, 'single', '整图') + opt(mode, 'split', '头 + 身体') + '</select></div>';
        h += '<div class="fifw-artgroup"' + (mode === 'single' ? '' : ' hidden') + '>'
            + artPartHtml(kind.id, 'single', rec.single) + '</div>';
        h += '<div class="fifw-artgroup"' + (mode === 'split' ? '' : ' hidden') + '>'
            + artPartHtml(kind.id, 'head', rec.head) + artPartHtml(kind.id, 'body', rec.body) + '</div>';
        h += '<button type="button" class="fifw-artclear" data-art="clear" data-kind="' + kind.id + '">清除这套外观</button>';
        h += '</div>';
        return h;
    }

    function artPartHtml(kindId, partKey, part) {
        const meta = ART_PARTS.find(p => p.key === partKey) || { label: partKey };
        const data = part || {};
        let h = '<div class="fifw-artpart" data-kind="' + kindId + '" data-part="' + partKey + '">';
        h += '<span class="fifw-artname">' + esc(meta.label) + '</span>';
        ART_FRAMES.forEach(fr => {
            const list = fr.multi ? (Array.isArray(data.walk) ? data.walk : []) : [];
            const has = fr.multi ? list.length > 0 : Boolean(data[fr.key]);
            h += '<div class="fifw-artframe">';
            h += '<label class="fifw-artpick">' + fr.label
                + '<input type="file" accept="image/*"' + (fr.multi ? ' multiple' : '')
                + ' data-art-up="' + fr.key + '"></label>';
            if (fr.multi) {
                list.forEach((src, i) => {
                    h += '<span class="fifw-artthumb"><img alt="" src="' + src + '">'
                        + '<button type="button" data-art-del="walk" data-idx="' + i + '" title="删除这一帧">\u00d7</button></span>';
                });
            } else if (data[fr.key]) {
                h += '<span class="fifw-artthumb"><img alt="" src="' + data[fr.key] + '">'
                    + '<button type="button" data-art-del="' + fr.key + '" title="删除">\u00d7</button></span>';
            }
            if (!has) h += '<span class="fifw-artempty">未上传</span>';
            h += '</div>';
        });
        h += '<p class="fifw-mini">' + (partKey === 'single'
            ? '整图按高度缩放、底边对齐脚底。'
            : (partKey === 'head' ? '头画在身体上方。' : '身体占满角色的碰撞盒。')) + '</p>';
        h += '</div>';
        return h;
    }

    function artTarget(el) {
        const card = el.closest('.fifw-charcard');
        const partBox = el.closest('.fifw-artpart');
        const modeSel = card && card.querySelector('[data-art="mode"]');
        return {
            kind: modeSel ? modeSel.dataset.kind : null,
            part: partBox ? partBox.dataset.part : null
        };
    }

    function handleCharArtClick(e) {
        const clearBtn = e.target.closest('[data-art="clear"]');
        if (clearBtn) {
            const kind = clearBtn.dataset.kind;
            charArts[kind] = null;
            artWrite(kind, null).then(() => {
                window.ForestIcefire?.refreshCharacterArt?.();
                renderCharArt();
                toast('已清除' + (kind === 'fire' ? '火男孩' : '水女孩') + '的自定义外观');
            }).catch(() => toast('清除失败'));
            return true;
        }
        const delBtn = e.target.closest('[data-art-del]');
        if (!delBtn) return false;
        const info = artTarget(delBtn);
        if (!info.kind || !info.part) return true;
        const rec = normalizeArtRec(charArts[info.kind]);
        const part = rec[info.part];
        if (!part) return true;
        if (delBtn.dataset.artDel === 'walk') {
            const idx = +delBtn.dataset.idx;
            if (Array.isArray(part.walk)) {
                part.walk.splice(idx, 1);
                if (!part.walk.length) delete part.walk;
            }
        } else {
            delete part[delBtn.dataset.artDel];
        }
        saveArtRec(info.kind, rec);
        return true;
    }

    function handleCharArtChange(e) {
        const t = e.target;
        if (!t || !t.dataset) return false;
        if (t.dataset.art === 'mode') {
            const kind = t.dataset.kind;
            const rec = normalizeArtRec(charArts[kind]);
            rec.mode = t.value === 'split' ? 'split' : 'single';
            saveArtRec(kind, rec);
            return true;
        }
        if (t.dataset.artUp) {
            const info = artTarget(t);
            const files = Array.from(t.files || []);
            t.value = '';
            if (info.kind && info.part && files.length) importArtFiles(info.kind, info.part, t.dataset.artUp, files);
            return true;
        }
        return false;
    }

    function readArtFile(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result || ''));
            reader.onerror = () => reject(new Error('读文件失败'));
            reader.readAsDataURL(file);
        });
    }

    /** 缩到长边 ≤ ART_MAX_EDGE 的 PNG（保留透明底）；游戏里角色才 29px 高，再大都是浪费 */
    function shrinkToDataUrl(src) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
                const w = img.naturalWidth || 1, h = img.naturalHeight || 1;
                const scale = Math.min(1, ART_MAX_EDGE / Math.max(w, h));
                const cw = Math.max(1, Math.round(w * scale));
                const chh = Math.max(1, Math.round(h * scale));
                const c = document.createElement('canvas');
                c.width = cw;
                c.height = chh;
                c.getContext('2d').drawImage(img, 0, 0, cw, chh);
                try { resolve(c.toDataURL('image/png')); } catch (err) { reject(new Error('图片导出失败')); }
            };
            img.onerror = () => reject(new Error('图片打不开'));
            img.src = src;
        });
    }

    async function importArtFiles(kind, partKey, frameKey, files) {
        try {
            const rec = normalizeArtRec(charArts[kind]);
            const part = rec[partKey] || (rec[partKey] = {});
            const urls = [];
            for (const file of files) {
                if (!/^image\//i.test(file.type || '')) continue;
                urls.push(await shrinkToDataUrl(await readArtFile(file)));
            }
            if (!urls.length) { toast('这些文件不是图片'); return; }
            if (frameKey === 'walk') {
                part.walk = ((part.walk || []).concat(urls)).slice(0, ART_WALK_MAX);
            } else {
                part[frameKey] = urls[0];
            }
            saveArtRec(kind, rec);
            toast('已保存' + (kind === 'fire' ? '火男孩' : '水女孩') + '的外观');
        } catch (err) {
            toast('图片处理失败：' + (err && err.message ? err.message : '未知错误'));
        }
    }

    function saveArtRec(kind, rec) {
        charArts[kind] = rec;
        artWrite(kind, hasAnyArt(rec) ? rec : null)
            .then(() => {
                window.ForestIcefire?.refreshCharacterArt?.();
                renderCharArt();
            })
            .catch(() => toast('保存失败：浏览器存储可能已满'));
    }

    /* ---- 事件 ---- */

    function onPanelClick(e) {
        if (handleCharArtClick(e)) return;
        const toolBtn = e.target.closest('[data-tool]');
        if (toolBtn) { ui.tool = toolBtn.dataset.tool === 'select' ? 'select' : toolBtn.dataset.tool; markTool(); return; }
        const act = e.target.closest('[data-act]');
        if (!act) return;
        const name = act.dataset.act;
        if (name === 'close') return close();
        if (name === 'new') return newLevel();
        if (name === 'dup') return dupLevel();
        if (name === 'del') return delLevel();
        if (name === 'resize') return doResize();
        if (name === 'export') return exportJs();
        if (name === 'import') return panel.querySelector('#fifw-file').click();
        if (name === 'art-clear') return clearArt();
        if (name === 'batch-fill') return batchFill(false);
        if (name === 'batch-erase') return batchFill(true);
        if (name === 'batch-clear') { ui.batch.clear(); renderAll(); return; }
    }

    function onPanelChange(e) {
        if (handleCharArtChange(e)) return;
        const lv = currentLevel();
        if (!lv) return;
        if (e.target.id === 'fifw-level-select') {
            ui.levelId = e.target.value; ui.selected = null; ui.batch.clear(); renderAll(); return;
        }
        const prop = selectedProp(lv, true);
        if (!prop) return;
        if (e.target.id === 'fifw-color') { prop.color = e.target.value; saveCurrent(lv); paintCell(ui.selected.x, ui.selected.y); }
        if (e.target.id === 'fifw-hit') { prop.hit = e.target.value; if (prop.hit === 'full') delete prop.hit; saveCurrent(lv); }
        if (e.target.id === 'fifw-travel') { prop.travel = clamp(+e.target.value || 1, 1, 8); saveCurrent(lv); }
        if (e.target.id === 'fifw-speed') { prop.speed = clamp(+e.target.value || 1.6, 0.4, 6); saveCurrent(lv); }
        if (e.target.id === 'fifw-span') { applySpan(lv, clamp(+e.target.value || 1, 1, 8)); }
    }

    function onPanelInput(e) {
        const lv = currentLevel();
        if (!lv) return;
        if (e.target.id === 'fifw-name') { lv.name = e.target.value.slice(0, 24); saveCurrent(lv); renderLevelSelect(); }
        if (e.target.id === 'fifw-tip') { lv.tip = e.target.value.slice(0, 160); saveCurrent(lv); }
        if (e.target.id === 'fifw-batch-color') { batchApplyColor(e.target.value); }
    }

    function selectedProp(lv, create) {
        if (!ui.selected) return null;
        const key = ui.selected.x + ',' + ui.selected.y;
        if (!lv.props[key] && create) lv.props[key] = {};
        return lv.props[key] || null;
    }

    /** 门柱高度：以选中格为底，向上铺同一扇门 */
    function applySpan(lv, span) {
        const { x, y } = ui.selected;
        const ch = (lv.map[y] || '')[x];
        if (ch !== '!' && ch !== '@') return;
        const prop = (lv.props || {})[x + ',' + y] || {};
        prop.span = span;
        lv.props[x + ',' + y] = prop;
        for (let i = 1; i < span; i++) {
            const yy = y - i;
            if (yy < 0) break;
            setCell(lv, x, yy, ch);
            const above = lv.props[x + ',' + yy] || {};
            if (prop.color) above.color = prop.color;
            lv.props[x + ',' + yy] = above;
        }
        saveCurrent(lv);
        renderGrid();
    }

    function clearArt() {
        const lv = currentLevel();
        const prop = lv && selectedProp(lv, false);
        if (!prop) return;
        delete prop.art;
        const key = ui.selected.x + ',' + ui.selected.y;
        if (!Object.keys(prop).length) delete lv.props[key];
        saveCurrent(lv);
        renderProps();
        paintCell(ui.selected.x, ui.selected.y);
    }

    /* ---- 网格绘制 ---- */

    function cellFromEvent(e) {
        // 手指滑出格子后事件目标不再是格子，按坐标反查手指下面那一格
        const under = document.elementFromPoint(e.clientX, e.clientY);
        const el = under && under.closest ? under.closest('#fifw-grid i') : null;
        if (!el) return null;
        return { x: +el.dataset.x, y: +el.dataset.y, el };
    }

    function onGridDown(e) {
        if (e.button !== 0 && e.button !== 2) return;
        const cell = cellFromEvent(e);
        if (!cell) return;
        ui.painting = true;
        panel.querySelector('#fifw-grid').setPointerCapture?.(e.pointerId);
        /* 批量选：按下的第一格决定这次拖动是「加入」还是「剔除」——
           点到已选的格子从它开始往回涂是取消，点空格子开始往外涂是加入；
           右键无论如何都是剔除。 */
        if (ui.tool === 'batch') {
            const key = cell.x + ',' + cell.y;
            ui.batchPaint = (e.button === 2 || ui.batch.has(key)) ? 'del' : 'add';
            batchPaint(cell);
            const upB = () => { ui.painting = false; ui.batchPaint = null; window.removeEventListener('pointerup', upB); };
            window.addEventListener('pointerup', upB);
            return;
        }
        applyTool(cell, e.button === 2);
        const up = () => { ui.painting = false; window.removeEventListener('pointerup', up); };
        window.addEventListener('pointerup', up);
    }

    function onGridMove(e) {
        if (!ui.painting) return;
        const cell = cellFromEvent(e);
        if (!cell) return;
        if (ui.tool === 'batch') { batchPaint(cell); return; }
        applyTool(cell, e.buttons === 2);
    }

    function batchPaint(cell) {
        const key = cell.x + ',' + cell.y;
        if (ui.batchPaint === 'del') ui.batch.delete(key); else ui.batch.add(key);
        paintCell(cell.x, cell.y);
        renderBatchBar();
    }

    function applyTool(cell, erase) {
        const lv = currentLevel();
        if (!lv) return;
        if (ui.tool === 'select' && !erase) {
            ui.selected = { x: cell.x, y: cell.y };
            renderGrid();
            renderProps();
            return;
        }
        const ch = erase ? '.' : ui.tool;
        if (ch === 'select') return;
        setCell(lv, cell.x, cell.y, ch);
        saveCurrent(lv);
        paintCell(cell.x, cell.y);
    }

    /* ---- 批量操作 ---- */

    function renderBatchBar() {
        const bar = panel.querySelector('#fifw-batchbar');
        if (!bar) return;
        const n = ui.batch.size;
        bar.hidden = n === 0;
        if (!n) { bar.innerHTML = ''; return; }
        const fillName = (ui.tool !== 'select' && ui.tool !== 'batch') ? toolName(ui.tool) : '墙';
        bar.innerHTML =
            '<span class="fifw-batch-n">已选 ' + n + ' 格（换到别的工具后仍可回来铺）</span>' +
            '<button type="button" data-act="batch-fill">铺「' + esc(fillName) + '」</button>' +
            '<button type="button" data-act="batch-erase">改为空气</button>' +
            '<label class="fifw-batch-color">改颜色 <input type="color" id="fifw-batch-color" value="' + esc(ui.batchColor || '#3d3325') + '"></label>' +
            '<button type="button" data-act="batch-clear">清除选择</button>';
    }

    function batchFill(erase) {
        const lv = currentLevel();
        if (!lv || !ui.batch.size) return;
        const ch = erase ? '.' : ((ui.tool !== 'select' && ui.tool !== 'batch') ? ui.tool : '#');
        let n = 0;
        ui.batch.forEach(key => {
            const i = key.indexOf(',');
            setCell(lv, +key.slice(0, i), +key.slice(i + 1), ch);
            n += 1;
        });
        saveCurrent(lv);
        renderGrid();
        renderProps();
        toast('已把 ' + n + ' 格改为「' + toolName(ch) + '」');
    }

    function batchApplyColor(value) {
        const lv = currentLevel();
        if (!lv || !ui.batch.size) return;
        ui.batchColor = value;
        let n = 0;
        ui.batch.forEach(key => {
            // 空格子没有外观，颜色无处可挂，跳过
            const ch = (lv.map[+key.slice(key.indexOf(',') + 1)] || '')[+key.slice(0, key.indexOf(','))];
            if (!ch || ch === '.') return;
            const p = lv.props[key] || {};
            p.color = value;
            lv.props[key] = p;
            n += 1;
        });
        if (n) {
            saveCurrent(lv);
            renderGrid();
            toast('已把 ' + n + ' 格染成 ' + value);
        }
    }

    /** 只重绘一个格子，拖动时不必整表刷新 */
    function paintCell(x, y) {
        const lv = currentLevel();
        const el = panel.querySelector('#fifw-grid i[data-x="' + x + '"][data-y="' + y + '"]');
        if (!lv || !el) { renderGrid(); return; }
        const ch = lv.map[y][x];
        const prop = (lv.props || {})[x + ',' + y] || {};
        el.className = 'c-' + chCode(ch) + (ui.selected && ui.selected.x === x && ui.selected.y === y ? ' sel' : '') + (ui.batch && ui.batch.size && ui.batch.has(x + ',' + y) ? ' bsel' : '');
        el.style.cssText = cellStyle(ch, prop);
        el.title = x + ',' + y + ' ' + toolName(ch);
        el.innerHTML = prop.art ? '<img alt="" src="' + esc(prop.art) + '">' : '';
    }

    /* ---- 关卡管理 ---- */

    function newLevel() {
        const store = readStore();
        if (store.levels.length >= MAX_LEVELS) { toast('最多 ' + MAX_LEVELS + ' 个自制关卡'); return; }
        const lv = blankLevel();
        lv.name = '自制关卡 ' + (store.levels.length + 1);
        store.levels.push(lv);
        writeStore(store);
        ui.levelId = lv.id;
        ui.selected = null;
        window.ForestIcefire?.refreshLevelRow?.();
        renderAll();
    }

    function dupLevel() {
        const lv = currentLevel();
        const store = readStore();
        if (!lv) return;
        if (store.levels.length >= MAX_LEVELS) { toast('最多 ' + MAX_LEVELS + ' 个自制关卡'); return; }
        const copy = JSON.parse(JSON.stringify(lv));
        copy.id = uid();
        copy.name = (lv.name || '关卡') + ' 副本';
        store.levels.push(copy);
        writeStore(store);
        ui.levelId = copy.id;
        window.ForestIcefire?.refreshLevelRow?.();
        renderAll();
    }

    function delLevel() {
        const lv = currentLevel();
        if (!lv) return;
        const go = () => {
            const store = readStore();
            store.levels = store.levels.filter(l => l.id !== lv.id);
            writeStore(store);
            ui.levelId = store.levels[0] ? store.levels[0].id : null;
            ui.selected = null;
            if (!store.levels.length) { const fresh = blankLevel(); store.levels.push(fresh); writeStore(store); ui.levelId = fresh.id; }
            window.ForestIcefire?.refreshLevelRow?.();
            renderAll();
        };
        if (window.Dlg?.confirm) window.Dlg.confirm({ title: '删除关卡', message: '删除「' + (lv.name || '未命名') + '」？此操作不可恢复。', danger: true }).then(ok => { if (ok) go(); });
        else if (confirm('删除这个关卡？')) go();
    }

    function doResize() {
        const lv = currentLevel();
        if (!lv) return;
        const cols = +panel.querySelector('#fifw-cols').value;
        const rows = +panel.querySelector('#fifw-rows').value;
        resize(lv, cols, rows);
        ui.selected = null;
        ui.batch.clear();
        saveCurrent(lv);
        renderAll();
    }

    /* ---- 导出 / 导入 JS ---- */

    function exportJs() {
        const all = levels();
        if (!all.length) { toast('还没有关卡可以导出'); return; }
        const payload = all.map(lv => ({
            name: lv.name, tip: lv.tip, map: lv.map, props: lv.props
        }));
        const body = [
            '/* 森林冰火人 · 创意工坊分享包',
            '   由 My SW 冰火人工坊导出。朋友打开 My SW → 实验室 → 冰火人工坊 → 导入分享文件，选这个文件即可。',
            '   关卡数：' + payload.length + '　导出时间：' + new Date().toISOString() + ' */',
            'window.MYSW_ICEFIRE_LEVELS = ' + JSON.stringify(payload, null, 2) + ';',
            ''
        ].join('\n');
        const blob = new Blob([body], { type: 'text/javascript' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'icefire-levels.js';
        document.body.appendChild(a);
        a.click();
        setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
        toast('已导出 ' + payload.length + ' 个关卡');
    }

    function onImportFile(e) {
        const file = e.target.files && e.target.files[0];
        e.target.value = '';
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => importText(String(reader.result || ''), file.name);
        reader.readAsText(file);
    }

    function importText(text, fileName) {
        let data = null;
        const m = text.match(/MYSW_ICEFIRE_LEVELS\s*=\s*(\[[\s\S]*\])\s*;?/);
        if (m) {
            try { data = JSON.parse(m[1]); } catch (e) { data = null; }
        }
        if (!data) {
            try { const parsed = JSON.parse(text); data = Array.isArray(parsed) ? parsed : parsed.levels; } catch (e) { data = null; }
        }
        if (!Array.isArray(data) || !data.length) { toast('这个文件里没有可用的关卡'); return; }
        const store = readStore();
        let added = 0, skipped = 0;
        data.forEach(raw => {
            if (store.levels.length >= MAX_LEVELS) { skipped++; return; }
            const lv = normalizeImported(raw);
            if (!lv) { skipped++; return; }
            store.levels.push(lv);
            added++;
        });
        if (!added) { toast('没有导入成功' + (skipped ? '（' + skipped + ' 个被跳过）' : '')); return; }
        writeStore(store);
        ui.levelId = store.levels[store.levels.length - 1].id;
        window.ForestIcefire?.refreshLevelRow?.();
        renderAll();
        toast('从「' + fileName + '」导入了 ' + added + ' 个关卡' + (skipped ? '，' + skipped + ' 个被跳过' : ''));
    }

    function normalizeImported(raw) {
        if (!raw || !Array.isArray(raw.map) || !raw.map.length) return null;
        // 先按「格数」对齐（一个非法字符只占一格，不能把整行撑长后再判废），
        // 超出上限的行、列直接裁掉；不认识的字符换成空地。
        const srcRows = raw.map.map(r => Array.from(String(r)));
        if (srcRows.length < 4) return null;
        const width = srcRows[0].length;
        if (width < 4) return null;
        if (srcRows.some(r => r.length !== width)) return null;   // 行长不齐说明文件坏了，不硬补
        const cols = Math.min(width, COLS_MAX);
        const rows = srcRows.slice(0, ROWS_MAX).map(r =>
            r.slice(0, cols).map(ch => (/^[#.FfWwGgPQDEfOw!@34hv]$/.test(ch) ? ch : '.')).join('')
        );
        const map = rows.map(r => (r + '.'.repeat(Math.max(cols, COLS_MIN))).slice(0, Math.max(cols, COLS_MIN)));
        const props = {};
        const src = raw.props && typeof raw.props === 'object' ? raw.props : {};
        Object.keys(src).forEach(k => {
            const [x, y] = k.split(',').map(Number);
            if (!Number.isInteger(x) || !Number.isInteger(y) || y >= map.length || x >= cols) return;
            const p = src[k] || {};
            const out = {};
            if (typeof p.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(p.color)) out.color = p.color.toLowerCase();
            // 只收 png/webp 的 dataURL，挡掉 javascript: 之类的伪图片；32×32 的 png 远小于 20KB
            if (typeof p.art === 'string' && /^data:image\/(png|webp);base64,[a-z0-9+/=]+$/i.test(p.art) && p.art.length < 20000) out.art = p.art;
            if (p.hit === 'half' || p.hit === 'none') out.hit = p.hit;
            if (typeof p.travel === 'number') out.travel = clamp(p.travel, 1, 8);
            if (typeof p.speed === 'number') out.speed = clamp(p.speed, 0.4, 6);
            if (typeof p.span === 'number') out.span = clamp(p.span, 1, 8);
            if (Object.keys(out).length) props[k] = out;
        });
        return { id: uid(), name: String(raw.name || '导入的关卡').slice(0, 24), tip: String(raw.tip || '').slice(0, 160), map, props, updatedAt: Date.now() };
    }

    /* ---------------- 挂进游戏 ---------------- */

    function register() {
        if (!window.ForestIcefire?.registerLevels) return false;
        window.ForestIcefire.registerLevels(() => readStore().levels.map(toPlayable));
        return true;
    }

    function bindEntry() {
        document.getElementById('open-icefire-workshop-btn')?.addEventListener('click', open);
        if (!register()) {
            // 冰火人脚本可能还在这条加载队列后面，等它就绪再挂
            let tries = 0;
            const timer = setInterval(() => { if (register() || ++tries > 20) clearInterval(timer); }, 250);
        }
    }

    window.IcefireWorkshop = { open, close, exportJs };

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bindEntry);
    else bindEntry();
})();
