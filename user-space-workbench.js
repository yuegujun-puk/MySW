/**
 * user-space-workbench.js —— 用户代码空间 · 工作台版
 * · 不替换、不修改 v1 的任何行为。进入空间时按 sp.ui 决定用哪一版,
 * 默认仍是经典版,老用户升级后看到的界面与之前完全一致。
 * · 两版读写的是同一份 IndexedDB 数据(myswUserSpace/code/userSpace_code_{id}),
 * 在工作台里改的文件,切回经典版刷新就能看到。
 * · 版本可以随时切换:空间顶栏「界面」按钮 + 设置 → 实验室里每个空间一行。
 * 数据存放:
 * · 文件:复用 v1 的 IndexedDB(经 window.MySWUserSpace.saveFiles 写入)
 * · 会话:localStorage 'usb:sess:{空间ID}' —— 键名带空间前缀,与主站、
 * 与其它空间都互不干扰
 * · 配置:localStorage 'usb:cfg:{空间ID}'
 * AI 工具调用:
 */
(function () {
    'use strict';

    var HOST = null;            // 由 user-space.js 注入的能力集合
    var SP = { id: '', name: '' };
    var FILES = {};             // { 文件名: 内容 }
    var SESS = { list: [], activeId: '' };
    var CFG = {
        mode: 'auto',           // auto = 先试工具调用,失败降级;tools = 只走工具;text = 只走文本协议
        maxRounds: 12,          // 单次对话最多几轮工具调用
        maxTurns: 12,           // 带给模型的历史轮数
        stream: true,
        vision: true,           // 粘贴的图片是否随消息一起发给模型
        showPreview: true
    };
    var BUSY = false;
    var ABORT = null;           // { stop: true }
    var UNDO = [];              // 本次页面生命周期内的文件改动栈(用于撤销工具调用)
    var mounted = false;
    var els = {};

    var LS_SESS = 'usb:sess:';
    var LS_CFG = 'usb:cfg:';
    var MAX_SESSIONS = 24;
    var MAX_MSGS = 400;
    var MAX_MSG_CHARS = 80000;
    var MAX_FILE_BYTES = 900 * 1024;
    var READ_LIMIT = 60000;     // 单次 read_file 回给模型的字符上限

    /* ---------------- 基础小工具 ---------------- */
    function $(id) { return document.getElementById(id); }
    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }
    function el(tag, cls, text) {
        var n = document.createElement(tag);
        if (cls) n.className = cls;
        if (text != null) n.textContent = text;
        return n;
    }
    function uid(prefix) {
        return (prefix || 'id') + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    }
    function fmtBytes(b) {
        b = Number(b) || 0;
        if (b < 1024) return b + ' B';
        if (b < 1048576) return (b / 1024).toFixed(1) + ' KB';
        return (b / 1048576).toFixed(2) + ' MB';
    }
    function byteLen(str) {
        try { return new Blob([String(str)]).size; } catch (e) { return String(str).length; }
    }
    function timeStr(t) {
        var d = new Date(t || Date.now());
        var p = function (n) { return n < 10 ? '0' + n : '' + n; };
        return (d.getMonth() + 1) + '/' + d.getDate() + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
    }
    function tip(msg, icon) {
        try { HOST && HOST.toast ? HOST.toast(msg, icon) : window.showToast && window.showToast(msg); } catch (e) { }
    }
    function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

    /* ---------------- 本地存档 ---------------- */
    function readJSON(key, fallback) {
        try {
            var raw = localStorage.getItem(key);
            if (!raw) return fallback;
            var v = JSON.parse(raw);
            return v == null ? fallback : v;
        } catch (e) { return fallback; }
    }
    function writeJSON(key, val) {
        try { localStorage.setItem(key, JSON.stringify(val)); return true; } catch (e) { return false; }
    }

    function loadSessions() {
        var raw = readJSON(LS_SESS + SP.id, null);
        SESS = { list: [], activeId: '' };
        if (raw && Array.isArray(raw.list)) {
            SESS.list = raw.list.filter(function (s) { return s && s.id; }).map(function (s) {
                return {
                    id: s.id,
                    title: String(s.title || '新会话'),
                    createdAt: s.createdAt || Date.now(),
                    updatedAt: s.updatedAt || Date.now(),
                    msgs: Array.isArray(s.msgs) ? s.msgs : []
                };
            }).slice(0, MAX_SESSIONS);
            SESS.activeId = raw.activeId || (SESS.list[0] && SESS.list[0].id) || '';
        }
        if (!SESS.list.length) createSession(true);
        if (!SESS.list.some(function (s) { return s.id === SESS.activeId; })) SESS.activeId = SESS.list[0].id;
    }
    var saveT = null;
    function saveSessions(now) {
        if (now) { doSave(); return; }
        clearTimeout(saveT);
        saveT = setTimeout(doSave, 400);
    }
    /* 落盘前的瘦身:
       工具卡里 undo.prev 是整份旧文件、write_file 的 args.content 是整份新文件,
       直接存进 localStorage 会几轮就把配额吃满(而且撤销只在本页有效,存了也用不上)。
       所以存档时把它们换成摘要,result 也只留前 4000 字 —— 会话记录是给人看过程的,
       不需要逐字节可回放。 */
    function slimMsg(m) {
        var out = { role: m.role, at: m.at };
        if (m.role === 'user') {
            out.text = m.text;
            if (m.imgs && m.imgs.length) out.imgs = m.imgs;
            return out;
        }
        out.text = m.text || '';
        if (m.reasoning) out.reasoning = String(m.reasoning).slice(0, 4000);
        if (m.calls && m.calls.length) {
            out.calls = m.calls.map(function (c) {
                var args = {};
                if (c.args && typeof c.args === 'object') {
                    Object.keys(c.args).forEach(function (k) {
                        var v = c.args[k];
                        args[k] = (typeof v === 'string' && v.length > 240) ? ('[已省略 ' + v.length + ' 字符]') : v;
                    });
                }
                return {
                    id: c.id, name: c.name, args: args, ok: c.ok, p: 1,
                    result: c.result == null ? null : String(c.result).slice(0, 4000)
                };
            });
        }
        return out;
    }
    function doSave() {
        clearTimeout(saveT);
        var payload = {
            activeId: SESS.activeId,
            list: SESS.list.slice(0, MAX_SESSIONS).map(function (s) {
                return {
                    id: s.id, title: s.title, createdAt: s.createdAt, updatedAt: s.updatedAt,
                    msgs: s.msgs.slice(-MAX_MSGS).map(slimMsg)
                };
            })
        };
        if (!writeJSON(LS_SESS + SP.id, payload)) {
            // 配额满:砍掉最老的一半会话再试一次,别让用户以为「发了消息没保存」
            SESS.list = SESS.list.slice(0, Math.max(1, Math.ceil(SESS.list.length / 2)));
            writeJSON(LS_SESS + SP.id, { activeId: SESS.activeId, list: SESS.list });
        }
    }
    function loadCfg() {
        var raw = readJSON(LS_CFG + SP.id, null);
        if (raw && typeof raw === 'object') {
            Object.keys(CFG).forEach(function (k) {
                if (raw[k] !== undefined && typeof raw[k] === typeof CFG[k]) CFG[k] = raw[k];
            });
        }
    }
    function saveCfg() { writeJSON(LS_CFG + SP.id, CFG); }

    function activeSession() {
        var s = SESS.list.filter(function (x) { return x.id === SESS.activeId; })[0];
        if (!s) {
            s = SESS.list[0];
            if (s) SESS.activeId = s.id;
        }
        return s || null;
    }
    function createSession(silent) {
        var s = {
            id: uid('s'), title: '新会话', createdAt: Date.now(), updatedAt: Date.now(), msgs: []
        };
        SESS.list.unshift(s);
        if (SESS.list.length > MAX_SESSIONS) SESS.list.length = MAX_SESSIONS;
        SESS.activeId = s.id;
        if (!silent) { saveSessions(true); renderSessions(); renderChat(); }
        return s;
    }

    /* ---------------- 文件工具 ---------------- */
    function normPath(p) {
        var name = String(p == null ? '' : p).trim().replace(/\\/g, '/').replace(/^\.?\//, '');
        if (!name) return '';
        if (name.indexOf('..') >= 0) return '';
        if (name.length > 120) return '';
        return name.replace(/\/{2,}/g, '/');
    }
    var IMG_EXT = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'ico', 'avif'];
    var BIN_EXT = IMG_EXT.concat(['woff', 'woff2', 'ttf', 'otf', 'eot', 'mp3', 'wav', 'ogg', 'mp4', 'webm', 'pdf', 'zip']);
    function extOf(p) {
        var i = String(p).lastIndexOf('.');
        return i < 0 ? '' : String(p).slice(i + 1).toLowerCase();
    }
    function kindOf(p) {
        var e = extOf(p);
        if (IMG_EXT.indexOf(e) >= 0) return 'img';
        if (BIN_EXT.indexOf(e) >= 0) return 'bin';
        if (['html', 'htm'].indexOf(e) >= 0) return 'html';
        if (['js', 'mjs', 'ts', 'jsx', 'tsx'].indexOf(e) >= 0) return 'js';
        if (['css', 'scss', 'less'].indexOf(e) >= 0) return 'css';
        if (['json', 'yml', 'yaml', 'toml', 'ini'].indexOf(e) >= 0) return 'data';
        if (['md', 'txt', 'rst'].indexOf(e) >= 0) return 'doc';
        return 'file';
    }
    function isDataUrl(s) { return typeof s === 'string' && /^data:[^,]*,/.test(s); }
    function isImageDataUrl(s) { return typeof s === 'string' && /^data:image\//i.test(s); }
    function fileIcon(name) {
        var k = kindOf(name);
        var map = {
            img: 'ri-image-line', bin: 'ri-file-zip-line', html: 'ri-html5-line',
            js: 'ri-javascript-line', css: 'ri-css3-line', data: 'ri-braces-line',
            doc: 'ri-file-text-line', file: 'ri-file-line'
        };
        return map[k] || 'ri-file-line';
    }
    function visibleNames() {
        return Object.keys(FILES || {}).filter(function (n) { return n.slice(0, 2) !== '__'; }).sort();
    }
    function fileSize(name) {
        var v = FILES[name];
        if (isDataUrl(v)) {
            var i = String(v).indexOf(',');
            return Math.floor((String(v).length - i - 1) * 3 / 4);
        }
        return byteLen(v || '');
    }
    function readText(name) {
        var v = FILES[name];
        if (v == null) return '';
        return isDataUrl(v) ? '' : String(v);
    }

    /* ---------------- 文件落盘(统一出口) ---------------- */
    var persistT = null;
    function persist(immediate) {
        clearTimeout(persistT);
        var run = function () {
            var snapshot = {};
            Object.keys(FILES).forEach(function (k) { snapshot[k] = FILES[k]; });
            HOST.saveFiles(SP.id, snapshot).then(function () {
                renderFiles();
                refreshPreview();
            }).catch(function (e) {
                tip('文件保存失败:' + (e && e.message || e), 'ri-error-warning-line');
            });
        };
        if (immediate) run();
        else persistT = setTimeout(run, 500);
    }

        /**
     * ZIP 读写
     * · 写:只用 store(不压缩) —— 代码文件本身压缩收益有限,实现简单可靠;
     * · 读:支持 store 与 deflate(deflate 走浏览器原生 DecompressionStream,
     * 缺这个 API 的老浏览器会明确提示「请开启 jszip 或换浏览器」)。
     * 这样即使 jszip 被关掉,导出/导入 zip 也不会变成一个坏按钮。
     */
    var CRC_TABLE = (function () {
        var t = new Uint32Array(256);
        for (var n = 0; n < 256; n++) {
            var c = n;
            for (var k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
            t[n] = c >>> 0;
        }
        return t;
    })();
    function crc32(bytes) {
        var c = 0xFFFFFFFF;
        for (var i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
        return (c ^ 0xFFFFFFFF) >>> 0;
    }
    function strToBytes(s) { return new TextEncoder().encode(s); }
    function bytesToStr(b) { return new TextDecoder('utf-8').decode(b); }
    function b64ToBytes(b64) {
        var bin = atob(b64), out = new Uint8Array(bin.length);
        for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
        return out;
    }
    function bytesToB64(bytes) {
        var s = '', step = 0x8000;
        for (var i = 0; i < bytes.length; i += step) {
            s += String.fromCharCode.apply(null, bytes.subarray(i, i + step));
        }
        return btoa(s);
    }
    function mimeOfExt(name) {
        var e = extOf(name);
        var map = {
            png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
            webp: 'image/webp', bmp: 'image/bmp', ico: 'image/x-icon', avif: 'image/avif',
            svg: 'image/svg+xml', woff: 'font/woff', woff2: 'font/woff2', ttf: 'font/ttf',
            mp3: 'audio/mpeg', wav: 'audio/wav', mp4: 'video/mp4'
        };
        return map[e] || 'application/octet-stream';
    }

    function zipBuild(files) {
        var entries = [], offset = 0, parts = [];
        var now = new Date();
        var dosTime = ((now.getHours() << 11) | (now.getMinutes() << 5) | (Math.floor(now.getSeconds() / 2))) & 0xFFFF;
        var dosDate = (((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate()) & 0xFFFF;
        Object.keys(files).sort().forEach(function (name) {
            var val = files[name], bytes;
            if (isDataUrl(val)) {
                var i = String(val).indexOf(',');
                bytes = /;base64/i.test(String(val).slice(0, i)) ? b64ToBytes(String(val).slice(i + 1)) : strToBytes(decodeURIComponent(String(val).slice(i + 1)));
            } else {
                bytes = strToBytes(String(val == null ? '' : val));
            }
            var nameBytes = strToBytes(name);
            var crc = crc32(bytes);
            var head = new Uint8Array(30 + nameBytes.length);
            var dv = new DataView(head.buffer);
            dv.setUint32(0, 0x04034b50, true);
            dv.setUint16(4, 20, true);
            dv.setUint16(6, 0x0800, true);   // UTF-8 文件名
            dv.setUint16(8, 0, true);        // 0 = store
            dv.setUint16(10, dosTime, true);
            dv.setUint16(12, dosDate, true);
            dv.setUint32(14, crc, true);
            dv.setUint32(18, bytes.length, true);
            dv.setUint32(22, bytes.length, true);
            dv.setUint16(26, nameBytes.length, true);
            dv.setUint16(28, 0, true);
            head.set(nameBytes, 30);
            parts.push(head, bytes);
            entries.push({ name: nameBytes, crc: crc, size: bytes.length, offset: offset });
            offset += head.length + bytes.length;
        });
        var cdParts = [], cdSize = 0;
        entries.forEach(function (e) {
            var rec = new Uint8Array(46 + e.name.length);
            var dv = new DataView(rec.buffer);
            dv.setUint32(0, 0x02014b50, true);
            dv.setUint16(4, 20, true);
            dv.setUint16(6, 20, true);
            dv.setUint16(8, 0x0800, true);
            dv.setUint16(10, 0, true);
            dv.setUint16(12, dosTime, true);
            dv.setUint16(14, dosDate, true);
            dv.setUint32(16, e.crc, true);
            dv.setUint32(20, e.size, true);
            dv.setUint32(24, e.size, true);
            dv.setUint16(28, e.name.length, true);
            dv.setUint16(30, 0, true);
            dv.setUint16(32, 0, true);
            dv.setUint16(34, 0, true);
            dv.setUint16(36, 0, true);
            dv.setUint32(38, 0, true);
            dv.setUint32(42, e.offset, true);
            rec.set(e.name, 46);
            cdParts.push(rec);
            cdSize += rec.length;
        });
        var eocd = new Uint8Array(22);
        var edv = new DataView(eocd.buffer);
        edv.setUint32(0, 0x06054b50, true);
        edv.setUint16(8, entries.length, true);
        edv.setUint16(10, entries.length, true);
        edv.setUint32(12, cdSize, true);
        edv.setUint32(16, offset, true);
        return new Blob(parts.concat(cdParts, [eocd]), { type: 'application/zip' });
    }

    async function inflateRaw(bytes) {
        if (typeof DecompressionStream === 'undefined') {
            throw new Error('当前浏览器不支持解压 deflate(请到「加载 JS 文件设置」开启 jszip,或换用新版浏览器)');
        }
        var ds = new DecompressionStream('deflate-raw');
        var stream = new Blob([bytes]).stream().pipeThrough(ds);
        return new Uint8Array(await new Response(stream).arrayBuffer());
    }

    async function zipParse(buf) {
        var bytes = new Uint8Array(buf), dv = new DataView(bytes.buffer);
        var eocd = -1;
        for (var i = bytes.length - 22; i >= Math.max(0, bytes.length - 66000); i--) {
            if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
        }
        if (eocd < 0) throw new Error('不是有效的 zip 文件');
        var count = dv.getUint16(eocd + 10, true);
        var cdOffset = dv.getUint32(eocd + 16, true);
        var out = {}, p = cdOffset;
        for (var n = 0; n < count; n++) {
            if (dv.getUint32(p, true) !== 0x02014b50) break;
            var method = dv.getUint16(p + 10, true);
            var compSize = dv.getUint32(p + 20, true);
            var nameLen = dv.getUint16(p + 28, true);
            var extraLen = dv.getUint16(p + 30, true);
            var commentLen = dv.getUint16(p + 32, true);
            var localOff = dv.getUint32(p + 42, true);
            var name = bytesToStr(bytes.subarray(p + 46, p + 46 + nameLen));
            p += 46 + nameLen + extraLen + commentLen;
            if (!name || name.slice(-1) === '/') continue;
            if (/^__MACOSX\//.test(name) || /(^|\/)\.DS_Store$/.test(name)) continue;
            // 本地头里的 extra 长度可能与中央目录不同,必须按本地头重新计算数据起点
            var lNameLen = dv.getUint16(localOff + 26, true);
            var lExtraLen = dv.getUint16(localOff + 28, true);
            var dataStart = localOff + 30 + lNameLen + lExtraLen;
            var raw = bytes.subarray(dataStart, dataStart + compSize);
            var content;
            if (method === 0) content = raw;
            else if (method === 8) content = await inflateRaw(raw);
            else continue; // 不支持的压缩方式:跳过而不是整包失败
            var isBin = BIN_EXT.indexOf(extOf(name)) >= 0 && !/^svg$/i.test(extOf(name));
            out[name] = isBin
                ? 'data:' + mimeOfExt(name) + ';base64,' + bytesToB64(content)
                : bytesToStr(content);
        }
        // 单层目录包(常见于「下载的文件夹」):把 a/b/c.html 提升为 b/c.html
        var names = Object.keys(out);
        if (names.length) {
            var tops = {};
            names.forEach(function (nm) { tops[nm.split('/')[0]] = true; });
            var topKeys = Object.keys(tops);
            if (topKeys.length === 1 && names.every(function (nm) { return nm.indexOf('/') > 0; })) {
                var strip = {}, prefix = topKeys[0] + '/';
                names.forEach(function (nm) { strip[nm.slice(prefix.length)] = out[nm]; });
                out = strip;
            }
        }
        return out;
    }

    function downloadBlob(blob, name) {
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = name;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000);
    }
    function downloadFile(name) {
        var val = FILES[name];
        if (val == null) return;
        var base = name.split('/').pop();
        if (isDataUrl(val)) {
            var a = document.createElement('a');
            a.href = val; a.download = base; document.body.appendChild(a); a.click(); a.remove();
            return;
        }
        downloadBlob(new Blob([String(val)], { type: 'text/plain;charset=utf-8' }), base);
    }

    /* ============================================================
       预览
       直接复用经典版的沙箱文档拼装(MySWUserSpace.buildDoc):它会把本地
       <script src> / <link href> 内联成文件内容,并注入命名空间垫片,
       所以预览里读写 localStorage 落在 us:{空间ID}: 前缀下,
       不会污染主站的设置与聊天数据。
 */
    var previewUrl = null;
    var previewT = null;
    function refreshPreview(immediate) {
        clearTimeout(previewT);
        var run = function () {
            if (!els.frame || !CFG.showPreview) return;
            if (!FILES['index.html']) {
                els.frame.removeAttribute('src');
                if (els.previewEmpty) els.previewEmpty.style.display = 'flex';
                return;
            }
            if (els.previewEmpty) els.previewEmpty.style.display = 'none';
            var html = HOST.buildDoc(FILES, SP.id);
            if (previewUrl) { try { URL.revokeObjectURL(previewUrl); } catch (e) { } }
            previewUrl = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
            els.frame.src = previewUrl;
        };
        if (immediate) run();
        else previewT = setTimeout(run, 450);
    }

    /* ============================================================
       样式
       配色优先吃主站的 CSS 变量(--bg-primary / --accent-gold ...),
       取不到时退回工作台自己的深色值;body.light-theme 下另给一套浅色值,
       这样换主题/浅色模式时工作台不会变成一块突兀的黑板。
 */
    function ensureStyle() {
        if ($('usb-style')) return;
        var css = [
            '#usb-root{',
            '  --usb-bg:var(--bg-primary,#15171d); --usb-panel:var(--bg-secondary,#1c1f27);',
            '  --usb-panel2:var(--bg-tertiary,#242833); --usb-line:rgba(255,255,255,.09);',
            '  --usb-line2:rgba(255,255,255,.16); --usb-tx:#e7e9ef; --usb-tx2:#a9aeba;',
            '  --usb-tx3:#767c8b; --usb-gold:var(--accent-gold,#e6c78a); --usb-gold2:#c9a86b;',
            '  --usb-ok:#6fcf97; --usb-err:#e5737f; --usb-info:#7fb3e8; --usb-radius:10px;',
            '  position:fixed; inset:0; z-index:2147483000; display:grid;',
            '  grid-template-columns:250px minmax(0,1fr) 344px; background:var(--usb-bg);',
            '  color:var(--usb-tx); font-family:system-ui,-apple-system,"Segoe UI","Noto Sans SC",sans-serif;',
            '  font-size:13.5px; line-height:1.55; box-sizing:border-box;',
            '}',
            'body.light-theme #usb-root{',
            '  --usb-bg:#f5f2ec; --usb-panel:#fffdf8; --usb-panel2:#f0ebe1;',
            '  --usb-line:rgba(60,45,20,.13); --usb-line2:rgba(60,45,20,.22);',
            '  --usb-tx:#2b2f3a; --usb-tx2:#5a6070; --usb-tx3:#8b90a0; --usb-gold:#a9822f;',
            '}',
            '#usb-root *{box-sizing:border-box}',
            '#usb-root ::-webkit-scrollbar{width:9px;height:9px}',
            '#usb-root ::-webkit-scrollbar-thumb{background:var(--usb-line2);border-radius:5px;border:2px solid transparent;background-clip:content-box}',
            '#usb-root button{font-family:inherit;font-size:inherit;color:inherit;cursor:pointer}',
            '#usb-root .usb-sp{flex:1}',

            /* 侧栏 */
            '#usb-side{display:flex;flex-direction:column;min-height:0;background:var(--usb-panel);border-right:1px solid var(--usb-line)}',
            '.usb-brand{display:flex;align-items:center;gap:9px;padding:14px 14px 12px;border-bottom:1px solid var(--usb-line)}',
            '.usb-brand .mark{width:32px;height:32px;border-radius:9px;display:grid;place-items:center;font-size:16px;',
            '  background:linear-gradient(135deg,var(--usb-gold),var(--usb-gold2));color:#241b06;box-shadow:0 4px 14px rgba(201,168,107,.28)}',
            '.usb-brand b{display:block;font-size:14px;line-height:1.15}',
            '.usb-brand small{display:block;font-size:9px;letter-spacing:1.6px;color:var(--usb-tx3)}',
            '.usb-spacebox{padding:10px 14px;border-bottom:1px solid var(--usb-line);display:flex;align-items:center;gap:8px}',
            '.usb-spacebox .nm{font-weight:600;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
            '.usb-spacebox .pt{font-size:11px;color:var(--usb-tx3);font-family:ui-monospace,monospace}',
            '.usb-spacebox button{width:26px;height:26px;border-radius:7px;border:1px solid var(--usb-line);background:transparent;color:var(--usb-tx2);display:grid;place-items:center}',
            '.usb-spacebox button:hover{border-color:var(--usb-gold);color:var(--usb-gold)}',
            '.usb-new{margin:10px 12px 6px;padding:9px 10px;border-radius:9px;border:1px dashed var(--usb-line2);',
            '  background:transparent;color:var(--usb-tx2);font-size:12.5px;text-align:center;transition:.16s}',
            '.usb-new:hover{border-color:var(--usb-gold);color:var(--usb-gold);background:rgba(230,199,138,.06)}',
            '#usb-sesslist{flex:1;overflow-y:auto;padding:4px 10px 10px;min-height:0}',
            '.usb-sess{position:relative;display:flex;align-items:center;gap:7px;padding:8px 9px;border-radius:8px;',
            '  border:1px solid transparent;cursor:pointer;margin-bottom:3px;transition:.14s}',
            '.usb-sess:hover{background:var(--usb-panel2)}',
            '.usb-sess.on{background:var(--usb-panel2);border-color:var(--usb-line);box-shadow:inset 2px 0 0 var(--usb-gold)}',
            '.usb-sess .t{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12.5px}',
            '.usb-sess .n{font-size:10px;color:var(--usb-tx3);font-family:ui-monospace,monospace}',
            '.usb-sess .acts{display:none;gap:2px}',
            '.usb-sess:hover .acts{display:flex}',
            '.usb-sess .acts button{width:20px;height:20px;border:0;background:transparent;color:var(--usb-tx3);border-radius:5px;font-size:11px}',
            '.usb-sess .acts button:hover{color:var(--usb-gold);background:rgba(230,199,138,.12)}',
            '.usb-sess .acts button.del:hover{color:var(--usb-err);background:rgba(229,115,127,.14)}',
            '.usb-sidefoot{border-top:1px solid var(--usb-line);padding:8px 10px;display:flex;flex-direction:column;gap:6px}',
            '.usb-sidefoot button{display:flex;align-items:center;gap:7px;padding:7px 9px;border-radius:8px;border:1px solid var(--usb-line);',
            '  background:transparent;color:var(--usb-tx2);font-size:12px;text-align:left}',
            '.usb-sidefoot button:hover{border-color:var(--usb-gold);color:var(--usb-gold)}',
            '.usb-sidefoot button .badge{margin-left:auto;font-size:10px;color:var(--usb-tx3);font-family:ui-monospace,monospace}',

            /* 主列 */
            '#usb-main{display:flex;flex-direction:column;min-width:0;min-height:0;background:var(--usb-bg)}',
            '#usb-top{display:flex;align-items:center;gap:8px;padding:9px 12px;border-bottom:1px solid var(--usb-line);flex:0 0 auto;min-height:48px}',
            '#usb-top .ttl{font-weight:600;font-size:13.5px;max-width:38%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
            '.usb-chip{display:inline-flex;align-items:center;gap:5px;padding:3px 9px;border-radius:20px;border:1px solid var(--usb-line);',
            '  font-size:11px;color:var(--usb-tx2);font-family:ui-monospace,monospace;max-width:230px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
            '.usb-chip .dot{width:6px;height:6px;border-radius:50%;background:var(--usb-ok);flex:0 0 auto}',
            '.usb-chip.bad .dot{background:var(--usb-err)}',
            '.usb-mini{padding:5px 10px;border-radius:8px;border:1px solid var(--usb-line);background:transparent;color:var(--usb-tx2);font-size:12px}',
            '.usb-mini:hover{border-color:var(--usb-gold);color:var(--usb-gold)}',
            '#usb-scroll{flex:1;overflow-y:auto;min-height:0;padding:14px 0 4px}',
            '#usb-msgs{max-width:840px;margin:0 auto;padding:0 16px}',
            '#usb-empty{max-width:640px;margin:6vh auto 0;padding:0 24px;text-align:center;color:var(--usb-tx2)}',
            '#usb-empty .glyph{width:56px;height:56px;margin:0 auto 14px;border-radius:16px;display:grid;place-items:center;font-size:26px;',
            '  background:linear-gradient(135deg,var(--usb-gold),var(--usb-gold2));color:#241b06;box-shadow:0 8px 26px rgba(201,168,107,.26)}',
            '#usb-empty h2{font-size:18px;margin:0 0 6px;color:var(--usb-tx);font-weight:600}',
            '#usb-empty h2 small{display:block;font-size:9.5px;letter-spacing:2.4px;color:var(--usb-tx3);font-weight:400;margin-top:4px}',
            '#usb-empty p{font-size:12.5px;line-height:1.75;margin:0 0 16px}',
            '.usb-chips{display:flex;flex-wrap:wrap;gap:8px;justify-content:center}',
            '.usb-chips button{padding:7px 12px;border-radius:20px;border:1px solid var(--usb-line);background:var(--usb-panel);',
            '  color:var(--usb-tx2);font-size:12px}',
            '.usb-chips button:hover{border-color:var(--usb-gold);color:var(--usb-gold)}',

            /* 消息 */
            '.usb-msg{margin-bottom:16px;display:flex;flex-direction:column}',
            '.usb-msg .who{display:flex;align-items:center;gap:6px;font-size:11px;color:var(--usb-tx3);margin-bottom:5px}',
            '.usb-msg.user .who{justify-content:flex-end}',
            '.usb-bubble{max-width:100%;font-size:13.5px;line-height:1.72;word-break:break-word;overflow-wrap:anywhere}',
            '.usb-msg.user .usb-bubble{align-self:flex-end;max-width:82%;background:var(--usb-panel2);border:1px solid var(--usb-line);',
            '  border-radius:12px 12px 3px 12px;padding:9px 13px;white-space:pre-wrap}',
            '.usb-msg.user .usb-imgs{display:flex;gap:6px;justify-content:flex-end;flex-wrap:wrap;margin-top:6px}',
            '.usb-msg.user .usb-imgs img{max-width:110px;max-height:110px;border-radius:8px;border:1px solid var(--usb-line)}',
            '.usb-bubble p{margin:0 0 8px}',
            '.usb-bubble p:last-child{margin-bottom:0}',
            '.usb-bubble h1,.usb-bubble h2,.usb-bubble h3,.usb-bubble h4{margin:14px 0 7px;font-size:14.5px;font-weight:600;color:var(--usb-gold)}',
            '.usb-bubble ul,.usb-bubble ol{margin:6px 0 10px;padding-left:22px}',
            '.usb-bubble li{margin:2px 0}',
            '.usb-bubble code{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12px;background:rgba(127,127,127,.16);',
            '  padding:1px 5px;border-radius:4px}',
            '.usb-bubble pre{position:relative;background:rgba(0,0,0,.28);border:1px solid var(--usb-line);border-radius:9px;',
            '  padding:10px 12px;overflow:auto;margin:8px 0;max-height:420px}',
            '.usb-bubble pre code{background:transparent;padding:0;font-size:12px;line-height:1.6;white-space:pre}',
            '.usb-bubble pre .cp{position:absolute;top:6px;right:6px;padding:2px 7px;border-radius:6px;border:1px solid var(--usb-line);',
            '  background:var(--usb-panel);color:var(--usb-tx3);font-size:10px;opacity:0;transition:.15s}',
            '.usb-bubble pre:hover .cp{opacity:1}',
            '.usb-bubble a{color:var(--usb-info)}',
            '.usb-bubble table{border-collapse:collapse;font-size:12px;margin:8px 0}',
            '.usb-bubble th,.usb-bubble td{border:1px solid var(--usb-line);padding:4px 9px}',
            '.usb-bubble blockquote{margin:8px 0;padding:4px 12px;border-left:3px solid var(--usb-gold);color:var(--usb-tx2)}',
            '.usb-think{border:1px dashed var(--usb-line2);border-radius:8px;padding:6px 10px;margin-bottom:8px;font-size:11.5px;color:var(--usb-tx3)}',
            '.usb-think summary{cursor:pointer;outline:none}',
            '.usb-think div{white-space:pre-wrap;margin-top:6px;max-height:180px;overflow:auto}',

            /* 工具卡 */
            '.usb-tool{border:1px solid var(--usb-line);border-radius:9px;background:var(--usb-panel);margin:6px 0;overflow:hidden}',
            '.usb-tool.bad{border-color:rgba(229,115,127,.45)}',
            '.usb-tool > summary{display:flex;align-items:center;gap:8px;padding:7px 10px;cursor:pointer;font-size:12px;list-style:none}',
            '.usb-tool > summary::-webkit-details-marker{display:none}',
            '.usb-tool .tname{font-family:ui-monospace,monospace;color:var(--usb-gold);font-size:11.5px}',
            '.usb-tool .tdesc{color:var(--usb-tx3);font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1}',
            '.usb-tool .tstate{font-size:10px;padding:1px 6px;border-radius:20px;border:1px solid var(--usb-line);color:var(--usb-tx3)}',
            '.usb-tool.done .tstate{color:var(--usb-ok);border-color:rgba(111,207,151,.4)}',
            '.usb-tool.bad .tstate{color:var(--usb-err);border-color:rgba(229,115,127,.4)}',
            '.usb-tool .tbody{padding:0 10px 9px;font-size:11.5px;color:var(--usb-tx2)}',
            '.usb-tool .tbody pre{background:rgba(0,0,0,.25);border-radius:7px;padding:8px;max-height:240px;overflow:auto;margin:6px 0 0;',
            '  font-family:ui-monospace,monospace;font-size:11px;color:var(--usb-tx2);white-space:pre-wrap;word-break:break-word}',
            '.usb-tool .tundo{margin-top:7px;padding:3px 9px;border-radius:6px;border:1px solid var(--usb-line2);background:transparent;',
            '  color:var(--usb-tx2);font-size:11px}',
            '.usb-tool .tundo:hover{border-color:var(--usb-err);color:var(--usb-err)}',

            /* 输入区 */
            '#usb-composer{flex:0 0 auto;border-top:1px solid var(--usb-line);padding:10px 16px 8px;background:var(--usb-panel)}',
            '#usb-attach{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:6px}',
            '#usb-attach:empty{display:none}',
            '.usb-attach{display:flex;align-items:center;gap:6px;padding:3px 8px;border-radius:7px;border:1px solid var(--usb-line);',
            '  background:var(--usb-panel2);font-size:11px;color:var(--usb-tx2)}',
            '.usb-attach img{width:22px;height:22px;border-radius:4px;object-fit:cover}',
            '.usb-attach button{border:0;background:transparent;color:var(--usb-tx3);font-size:11px;padding:0 2px}',
            '.usb-attach button:hover{color:var(--usb-err)}',
            '.usb-inputrow{display:flex;align-items:flex-end;gap:8px;max-width:840px;margin:0 auto}',
            '.usb-inputrow textarea{flex:1;min-height:44px;max-height:190px;resize:none;padding:11px 13px;border-radius:11px;',
            '  border:1px solid var(--usb-line2);background:var(--usb-bg);color:var(--usb-tx);font-family:inherit;font-size:13.5px;',
            '  line-height:1.55;outline:none}',
            '.usb-inputrow textarea:focus{border-color:var(--usb-gold);box-shadow:0 0 0 3px rgba(230,199,138,.14)}',
            '.usb-send{height:44px;padding:0 18px;border-radius:11px;border:0;font-weight:600;',
            '  background:linear-gradient(180deg,var(--usb-gold),var(--usb-gold2));color:#241b06}',
            '.usb-send:disabled{opacity:.5;cursor:not-allowed}',
            '.usb-stop{height:44px;padding:0 16px;border-radius:11px;border:1px solid rgba(229,115,127,.5);background:transparent;color:var(--usb-err)}',
            '#usb-tip{max-width:840px;margin:6px auto 0;font-size:10.5px;color:var(--usb-tx3);display:flex;gap:10px;flex-wrap:wrap}',
            '#usb-tip b{color:var(--usb-gold);font-weight:500}',

            /* 右列 */
            '#usb-right{display:flex;flex-direction:column;min-height:0;background:var(--usb-panel);border-left:1px solid var(--usb-line)}',
            '.usb-panel{display:flex;flex-direction:column;min-height:0}',
            '.usb-panel.files{max-height:52%;border-bottom:1px solid var(--usb-line)}',
            '.usb-phead{display:flex;align-items:center;gap:6px;padding:8px 10px;border-bottom:1px solid var(--usb-line);flex:0 0 auto}',
            '.usb-phead h3{margin:0;font-size:12px;font-weight:600;color:var(--usb-tx2);letter-spacing:.3px}',
            '.usb-phead .cnt{font-size:10px;padding:0 6px;border-radius:20px;background:var(--usb-panel2);color:var(--usb-tx3);font-family:ui-monospace,monospace}',
            '.usb-phead button{width:24px;height:24px;border-radius:6px;border:1px solid transparent;background:transparent;color:var(--usb-tx3);font-size:12px;display:grid;place-items:center}',
            '.usb-phead button:hover{border-color:var(--usb-line2);color:var(--usb-gold)}',
            '#usb-files{flex:1;overflow-y:auto;list-style:none;margin:0;padding:5px 6px;min-height:0}',
            '.usb-file{display:flex;align-items:center;gap:7px;padding:6px 8px;border-radius:7px;cursor:pointer;font-size:12px}',
            '.usb-file:hover{background:var(--usb-panel2)}',
            '.usb-file i{color:var(--usb-tx3);font-size:13px}',
            '.usb-file .nm{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-family:ui-monospace,monospace;font-size:11.5px}',
            '.usb-file .sz{font-size:10px;color:var(--usb-tx3);font-family:ui-monospace,monospace}',
            '.usb-file .acts{display:none;gap:1px}',
            '.usb-file:hover .acts{display:flex}',
            '.usb-file .acts button{width:20px;height:20px;border:0;background:transparent;color:var(--usb-tx3);border-radius:5px;font-size:11px}',
            '.usb-file .acts button:hover{color:var(--usb-gold);background:rgba(230,199,138,.12)}',
            '.usb-file .acts button.del:hover{color:var(--usb-err);background:rgba(229,115,127,.14)}',
            '.usb-drop{margin:6px;padding:10px;border:1px dashed var(--usb-line2);border-radius:8px;text-align:center;',
            '  font-size:11px;color:var(--usb-tx3);line-height:1.6}',
            '#usb-dragging{position:fixed;inset:0;z-index:2147483600;display:none;place-items:center;background:rgba(10,9,6,.62);',
            '  -webkit-backdrop-filter:blur(2px);backdrop-filter:blur(2px)}',
            '#usb-dragging.on{display:grid}',
            '#usb-dragging .box{border:2px dashed var(--usb-gold);border-radius:16px;padding:26px 34px;text-align:center;color:var(--usb-tx);background:rgba(20,18,14,.85)}',
            '.usb-prevwrap{position:relative;flex:1;min-height:0;background:#0d0f13}',
            '#usb-frame{position:absolute;inset:0;width:100%;height:100%;border:0;background:#fff}',
            '#usb-prevempty{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;text-align:center;',
            '  color:var(--usb-tx3);font-size:11.5px;padding:18px;line-height:1.7}',

            /* 遮罩与弹窗 */
            '.usb-ovl{position:fixed;inset:0;z-index:2147483400;display:none;align-items:center;justify-content:center;',
            '  background:rgba(8,7,5,.62);-webkit-backdrop-filter:blur(3px);backdrop-filter:blur(3px);padding:20px}',
            '.usb-ovl.on{display:flex}',
            '.usb-modal{width:min(720px,100%);max-height:88vh;display:flex;flex-direction:column;border-radius:14px;',
            '  background:var(--usb-panel);border:1px solid var(--usb-line2);box-shadow:0 24px 70px rgba(0,0,0,.55);overflow:hidden}',
            '.usb-modal.wide{width:min(940px,100%);height:86vh}',
            '.usb-mhead{display:flex;align-items:center;gap:8px;padding:11px 14px;border-bottom:1px solid var(--usb-line);flex:0 0 auto}',
            '.usb-mhead h3{margin:0;font-size:13px;font-weight:600}',
            '.usb-mhead .x{width:26px;height:26px;border:0;background:transparent;color:var(--usb-tx3);border-radius:7px;font-size:14px}',
            '.usb-mhead .x:hover{color:var(--usb-tx);background:var(--usb-panel2)}',
            '.usb-mbody{padding:14px;overflow-y:auto;min-height:0;flex:1}',
            '.usb-mfoot{display:flex;align-items:center;gap:8px;padding:10px 14px;border-top:1px solid var(--usb-line);flex:0 0 auto}',
            '.usb-mfoot .grow{flex:1}',
            '.usb-btn{padding:7px 14px;border-radius:8px;border:1px solid var(--usb-line2);background:transparent;color:var(--usb-tx2);font-size:12.5px}',
            '.usb-btn:hover{border-color:var(--usb-gold);color:var(--usb-gold)}',
            '.usb-btn.primary{border:0;background:linear-gradient(180deg,var(--usb-gold),var(--usb-gold2));color:#241b06;font-weight:600}',
            '.usb-btn.danger{color:var(--usb-err);border-color:rgba(229,115,127,.5)}',
            '.usb-btn.danger:hover{background:rgba(229,115,127,.12);color:var(--usb-err)}',
            '.usb-field{margin-bottom:13px}',
            '.usb-field label{display:block;font-size:11.5px;color:var(--usb-tx2);margin-bottom:5px}',
            '.usb-field .hint{font-size:10.5px;color:var(--usb-tx3);line-height:1.6;margin-top:4px}',
            '.usb-field input[type=text],.usb-field input[type=number],.usb-field select{width:100%;padding:8px 10px;border-radius:8px;',
            '  border:1px solid var(--usb-line2);background:var(--usb-bg);color:var(--usb-tx);font-family:inherit;font-size:12.5px;outline:none}',
            '.usb-field input:focus,.usb-field select:focus{border-color:var(--usb-gold)}',
            '.usb-field .row{display:flex;gap:10px;align-items:center;flex-wrap:wrap}',
            '.usb-chk{display:flex;align-items:center;gap:7px;font-size:12px;color:var(--usb-tx2);cursor:pointer}',
            '#usb-editor-area{width:100%;flex:1;min-height:0;resize:none;border:0;outline:none;background:var(--usb-bg);color:var(--usb-tx);',
            '  font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12.5px;line-height:1.65;padding:12px;border-radius:9px;',
            '  border:1px solid var(--usb-line)}',
            '#usb-editor-img{flex:1;display:none;align-items:center;justify-content:center;padding:10px;background:var(--usb-bg);border-radius:9px;border:1px solid var(--usb-line)}',
            '#usb-editor-img img{max-width:100%;max-height:100%;object-fit:contain}',

            /* 窄屏:右列与侧栏改为抽屉 */
            '@media (max-width:1180px){#usb-root{grid-template-columns:250px minmax(0,1fr)}}',
            '@media (max-width:1180px){#usb-right{position:fixed;top:0;right:0;bottom:0;width:340px;z-index:2147483300;',
            '  transform:translateX(100%);transition:transform .2s;box-shadow:-12px 0 40px rgba(0,0,0,.4)}',
            '  #usb-right.on{transform:none}}',
            '@media (max-width:900px){#usb-root{grid-template-columns:minmax(0,1fr)}',
            '  #usb-side{position:fixed;top:0;left:0;bottom:0;width:250px;z-index:2147483300;transform:translateX(-100%);',
            '    transition:transform .2s;box-shadow:12px 0 40px rgba(0,0,0,.4)}',
            '  #usb-side.on{transform:none}}',
            '@media (min-width:901px){#usb-menu{display:none}}',
            '@media (min-width:1181px){#usb-files-toggle{display:none}}'
        ].join('\n');
        var st = document.createElement('style');
        st.id = 'usb-style';
        st.textContent = css;
        document.head.appendChild(st);
    }

    /* ============================================================
       骨架
 */
    function buildShell() {
        var root = document.createElement('div');
        root.id = 'usb-root';
        root.innerHTML = [
            '<aside id="usb-side">',
            '  <div class="usb-brand"><div class="mark">⚒</div><div><b>空间工作台</b><small>MY SW · WORKBENCH</small></div></div>',
            '  <div class="usb-spacebox">',
            '    <div style="min-width:0;flex:1"><div class="nm" id="usb-sp-name"></div><div class="pt" id="usb-sp-path"></div></div>',
            '    <button type="button" id="usb-open-site" title="在新标签页打开真正的空间页面"><i class="ri-external-link-line"></i></button>',
            '  </div>',
            '  <button type="button" class="usb-new" id="usb-new-sess">＋ 新建会话</button>',
            '  <div id="usb-sesslist"></div>',
            '  <div class="usb-sidefoot">',
            '    <button type="button" id="usb-switch-classic"><i class="ri-layout-left-line"></i> 切换到经典版<span class="badge">界面</span></button>',
            '    <button type="button" id="usb-home"><i class="ri-home-4-line"></i> 返回主站</button>',
            '  </div>',
            '</aside>',
            '<main id="usb-main">',
            '  <header id="usb-top">',
            '    <button type="button" class="usb-mini" id="usb-menu" title="会话列表"><i class="ri-menu-line"></i></button>',
            '    <span class="ttl" id="usb-title">新会话</span>',
            '    <span class="usb-chip" id="usb-model"><span class="dot"></span><span id="usb-model-text">未配置模型</span></span>',
            '    <span class="usb-sp"></span>',
            '    <button type="button" class="usb-mini" id="usb-undo" title="撤销最近一次由 AI 完成的文件改动"><i class="ri-arrow-go-back-line"></i> 撤销</button>',
            '    <button type="button" class="usb-mini" id="usb-cfg"><i class="ri-settings-3-line"></i> 设置</button>',
            '    <button type="button" class="usb-mini" id="usb-files-toggle" title="文件与预览"><i class="ri-folder-3-line"></i> 文件</button>',
            '  </header>',
            '  <div id="usb-scroll">',
            '    <div id="usb-msgs"></div>',
            '    <div id="usb-empty">',
            '      <div class="glyph">⚒</div>',
            '      <h2>开始动手<small>AI · FILES · PREVIEW</small></h2>',
            '      <p>这里是你的代码空间工作台。AI 能<b>真正读写</b>右边文件区里的文件,改完立刻热更新预览。<br>右侧管理文件,输入框描述你想改成什么样。</p>',
            '      <div class="usb-chips">',
            '        <button type="button" data-chip="先看看现在有哪些文件，逐个说明每个文件是干什么的">说明现有文件</button>',
            '        <button type="button" data-chip="做一个单文件的番茄钟小页面，风格简洁，用金色点缀">写个番茄钟</button>',
            '        <button type="button" data-chip="把首页改成深色玻璃卡片风格，圆角大一点">换个外观</button>',
            '      </div>',
            '    </div>',
            '  </div>',
            '  <footer id="usb-composer">',
            '    <div id="usb-attach"></div>',
            '    <div class="usb-inputrow">',
            '      <textarea id="usb-input" rows="1" placeholder="描述你想要的改动,例如:按钮改成金色圆角…(Enter 发送 / Shift+Enter 换行)"></textarea>',
            '      <button type="button" class="usb-send" id="usb-send">发送</button>',
            '      <button type="button" class="usb-stop" id="usb-stop" style="display:none">停止</button>',
            '    </div>',
            '    <div id="usb-tip"><span>Enter 发送 · Shift+Enter 换行</span><span><b>可拖入文件</b>或 <b>Ctrl+V 粘贴图片</b></span><span id="usb-tip-tools"></span></div>',
            '  </footer>',
            '</main>',
            '<aside id="usb-right">',
            '  <section class="usb-panel files">',
            '    <div class="usb-phead">',
            '      <h3>文件</h3><span class="cnt" id="usb-fcount">0</span><span class="usb-sp"></span>',
            '      <button type="button" id="usb-upload" title="上传文件 / zip"><i class="ri-upload-2-line"></i></button>',
            '      <button type="button" id="usb-newfile" title="新建文件"><i class="ri-file-add-line"></i></button>',
            '      <button type="button" id="usb-export" title="导出全部为 zip"><i class="ri-download-2-line"></i></button>',
            '      <button type="button" id="usb-close-right" title="收起"><i class="ri-close-line"></i></button>',
            '    </div>',
            '    <ul id="usb-files"></ul>',
            '    <div class="usb-drop">把文件拖到页面任意位置即可加入<br><b>.zip 自动解压</b></div>',
            '  </section>',
            '  <section class="usb-panel" style="flex:1;min-height:0">',
            '    <div class="usb-phead">',
            '      <h3>预览</h3><span class="usb-sp"></span>',
            '      <button type="button" id="usb-prev-refresh" title="刷新预览"><i class="ri-refresh-line"></i></button>',
            '      <button type="button" id="usb-prev-window" title="在新标签页打开"><i class="ri-external-link-line"></i></button>',
            '    </div>',
            '    <div class="usb-prevwrap">',
            '      <iframe id="usb-frame" title="空间预览" sandbox="allow-scripts allow-same-origin allow-forms allow-modals allow-downloads allow-popups"></iframe>',
            '      <div id="usb-prevempty">还没有 index.html<br>让 AI 写一个,或上传一个项目</div>',
            '    </div>',
            '  </section>',
            '</aside>',
            '</div>',
            '<div id="usb-dragging"><div class="box"><div style="font-size:22px">⬇</div><b>松开鼠标,文件加入工作区</b><div style="font-size:11px;color:#b9b3a6;margin-top:6px">支持多文件 · .zip 自动解压</div></div></div>',
            '<div class="usb-ovl" id="usb-editor-ovl"><div class="usb-modal wide">',
            '  <div class="usb-mhead"><h3 id="usb-editor-title">编辑文件</h3><span class="usb-sp"></span><button type="button" class="x" data-usb-close="usb-editor-ovl">✕</button></div>',
            '  <div class="usb-mbody" style="display:flex;flex-direction:column;gap:8px;padding:12px">',
            '    <textarea id="usb-editor-area" spellcheck="false"></textarea>',
            '    <div id="usb-editor-img"></div>',
            '  </div>',
            '  <div class="usb-mfoot"><span id="usb-editor-stats" style="font-size:11px;color:var(--usb-tx3);font-family:ui-monospace,monospace"></span>',
            '    <span class="grow"></span>',
            '    <button type="button" class="usb-btn" id="usb-editor-dl">下载</button>',
            '    <button type="button" class="usb-btn danger" id="usb-editor-del">删除</button>',
            '    <button type="button" class="usb-btn primary" id="usb-editor-save">保存</button>',
            '  </div>',
            '</div></div>',
            '<div class="usb-ovl" id="usb-cfg-ovl"><div class="usb-modal">',
            '  <div class="usb-mhead"><h3>工作台设置</h3><span class="usb-sp"></span><button type="button" class="x" data-usb-close="usb-cfg-ovl">✕</button></div>',
            '  <div class="usb-mbody">',
            '    <div class="usb-field"><label>模型(只读,改这里不会影响主站配置)</label>',
            '      <input type="text" id="usb-cfg-model" readonly>',
            '      <div class="hint">模型与 Key 由主站「设置 → AI 配置」统一管理,工作台直接复用,不额外存一份。</div></div>',
            '    <div class="usb-field"><label>AI 改动文件的方式</label>',
            '      <select id="usb-cfg-mode">',
            '        <option value="auto">自动:先试工具调用,模型不支持时自动降级</option>',
            '        <option value="tools">只用工具调用(需要模型支持 tools)</option>',
            '        <option value="text">只走文本协议(===FILE:=== 分段,兼容性最好)</option>',
            '      </select></div>',
            '    <div class="usb-field"><label>单次对话最多几轮工具调用</label><input type="number" id="usb-cfg-rounds" min="1" max="60" step="1"></div>',
            '    <div class="usb-field"><label>带给模型的历史轮数</label><input type="number" id="usb-cfg-turns" min="1" max="60" step="1">',
            '      <div class="hint">轮数越多越连贯,但更费 token。改小可以省上下文。</div></div>',
            '    <div class="usb-field"><div class="row">',
            '      <label class="usb-chk"><input type="checkbox" id="usb-cfg-stream"> 流式输出</label>',
            '      <label class="usb-chk"><input type="checkbox" id="usb-cfg-vision"> 粘贴的图片随消息发送(需多模态模型)</label>',
            '    </div></div>',
            '    <div class="usb-field"><label>文件</label><div class="row">',
            '      <button type="button" class="usb-btn" id="usb-cfg-starter">重置为起步项目</button>',
            '      <button type="button" class="usb-btn danger" id="usb-cfg-wipe">清空工作区文件</button>',
            '    </div>',
            '      <div class="hint">「重置」会用 index.html / style.css / app.js 三个文件覆盖当前工作区(想推倒重来时用)。</div></div>',
            '    <div class="usb-field"><label>会话</label><div class="row">',
            '      <button type="button" class="usb-btn danger" id="usb-cfg-clear-msgs">清空当前会话消息</button>',
            '      <button type="button" class="usb-btn danger" id="usb-cfg-clear-all">删除本空间全部会话</button>',
            '    </div></div>',
            '  </div>',
            '  <div class="usb-mfoot"><span class="grow"></span><button type="button" class="usb-btn primary" id="usb-cfg-save">保存</button></div>',
            '</div></div>',
            '<input type="file" id="usb-file-input" multiple hidden accept="*/*">'
        ].join('\n');
        document.body.appendChild(root);

        els = {
            root: root,
            side: $('usb-side'),
            right: $('usb-right'),
            sessList: $('usb-sesslist'),
            msgs: $('usb-msgs'),
            scroll: $('usb-scroll'),
            empty: $('usb-empty'),
            title: $('usb-title'),
            input: $('usb-input'),
            attach: $('usb-attach'),
            sendBtn: $('usb-send'),
            stopBtn: $('usb-stop'),
            files: $('usb-files'),
            fcount: $('usb-fcount'),
            frame: $('usb-frame'),
            previewEmpty: $('usb-prevempty'),
            editorOvl: $('usb-editor-ovl'),
            editorArea: $('usb-editor-area'),
            editorImg: $('usb-editor-img'),
            editorTitle: $('usb-editor-title'),
            editorStats: $('usb-editor-stats'),
            fileInput: $('usb-file-input'),
            dragging: $('usb-dragging')
        };
        bindShell();
    }

    function bindShell() {
        $('usb-sp-name').textContent = SP.name || SP.id;
        $('usb-sp-path').textContent = '/' + SP.id;
        $('usb-new-sess').addEventListener('click', function () {
            if (BUSY) { tip('先等这一轮结束,或点「停止」。', 'ri-loader-4-line'); return; }
            createSession(false);
            els.input.focus();
        });
        $('usb-open-site').addEventListener('click', function () {
            window.open('/' + encodeURIComponent(SP.id), '_blank');
        });
        $('usb-home').addEventListener('click', function () { location.href = '/'; });
        $('usb-switch-classic').addEventListener('click', function () {
            if (BUSY && !window.confirm('AI 还在回复,现在切换会中断这一轮。继续?')) return;
            HOST.setVersion(SP.id, 'classic');
            location.reload();
        });
        $('usb-menu').addEventListener('click', function () { els.side.classList.toggle('on'); });
        $('usb-files-toggle').addEventListener('click', function () { els.right.classList.toggle('on'); });
        $('usb-close-right').addEventListener('click', function () { els.right.classList.remove('on'); });
        $('usb-cfg').addEventListener('click', openCfg);
        $('usb-undo').addEventListener('click', undoLast);
        $('usb-send').addEventListener('click', onSend);
        $('usb-stop').addEventListener('click', function () {
            if (ABORT) ABORT.stop = true;
            // 只置标记的话,模型那边还在继续吐字、连接也不会断;直接把响应体掐掉
            if (CURRENT_READER) { try { CURRENT_READER.cancel(); } catch (e) { } }
            $('usb-stop').disabled = true;
            $('usb-stop').textContent = '正在停止…';
        });
        els.input.addEventListener('keydown', function (e) {
            if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); onSend(); }
        });
        els.input.addEventListener('input', autoGrow);
        els.input.addEventListener('paste', onPaste);
        Array.prototype.forEach.call(document.querySelectorAll('#usb-empty [data-chip]'), function (b) {
            b.addEventListener('click', function () {
                els.input.value = b.getAttribute('data-chip');
                autoGrow();
                els.input.focus();
            });
        });
        $('usb-upload').addEventListener('click', function () { els.fileInput.click(); });
        els.fileInput.addEventListener('change', function () {
            if (els.fileInput.files && els.fileInput.files.length) addFromFiles(els.fileInput.files);
            els.fileInput.value = '';
        });
        $('usb-newfile').addEventListener('click', newFilePrompt);
        $('usb-export').addEventListener('click', exportZip);
        $('usb-prev-refresh').addEventListener('click', function () { refreshPreview(true); });
        $('usb-prev-window').addEventListener('click', function () {
            if (!previewUrl) { tip('还没有可预览的 index.html', 'ri-information-line'); return; }
            window.open(previewUrl, '_blank');
        });
        $('usb-editor-save').addEventListener('click', saveEditor);
        $('usb-editor-dl').addEventListener('click', function () { if (editing) downloadFile(editing); });
        $('usb-editor-del').addEventListener('click', function () { if (editing) deleteFile(editing); });
        $('usb-editor-area').addEventListener('keydown', function (e) {
            if (e.key !== 'Tab') return;
            e.preventDefault();
            var ta = e.target, s = ta.selectionStart, en = ta.selectionEnd;
            ta.value = ta.value.slice(0, s) + '  ' + ta.value.slice(en);
            ta.selectionStart = ta.selectionEnd = s + 2;
            updateEditorStats();
        });
        $('usb-editor-area').addEventListener('input', updateEditorStats);
        Array.prototype.forEach.call(document.querySelectorAll('[data-usb-close]'), function (b) {
            b.addEventListener('click', function () {
                var ovl = $(b.getAttribute('data-usb-close'));
                if (ovl) ovl.classList.remove('on');
            });
        });
        $('usb-cfg-save').addEventListener('click', saveCfgFromModal);
        $('usb-cfg-starter').addEventListener('click', function () {
            if (!window.confirm('用起步项目覆盖当前工作区?(现有文件会被替换)')) return;
            FILES = starterFiles();
            persist(true); renderFiles();
            $('usb-cfg-ovl').classList.remove('on');
            tip('已重置为起步项目', 'ri-refresh-line');
        });
        $('usb-cfg-wipe').addEventListener('click', function () {
            if (!window.confirm('清空工作区的全部文件?这一步不可撤销(会话记录保留)。')) return;
            FILES = {};
            persist(true); renderFiles();
            $('usb-cfg-ovl').classList.remove('on');
            tip('工作区已清空', 'ri-delete-bin-line');
        });
        $('usb-cfg-clear-msgs').addEventListener('click', function () {
            var s = activeSession();
            if (!s) return;
            if (!window.confirm('清空当前会话的全部消息?(文件不受影响)')) return;
            s.msgs = [];
            saveSessions(true); renderChat();
            tip('已清空', 'ri-check-line');
        });
        $('usb-cfg-clear-all').addEventListener('click', function () {
            if (!window.confirm('删除本空间的全部会话记录?文件与预览不受影响。')) return;
            SESS.list = [];
            createSession(true);
            saveSessions(true); renderSessions(); renderChat();
            tip('已删除全部会话', 'ri-check-line');
        });
        bindDragDrop();
        document.addEventListener('keydown', function (e) {
            if (e.key !== 'Escape') return;
            Array.prototype.forEach.call(document.querySelectorAll('.usb-ovl.on'), function (o) { o.classList.remove('on'); });
            els.side.classList.remove('on');
            els.right.classList.remove('on');
        });
        window.addEventListener('beforeunload', function () { saveSessions(true); });
    }

    function autoGrow() {
        var ta = els.input;
        ta.style.height = 'auto';
        ta.style.height = Math.min(190, Math.max(44, ta.scrollHeight)) + 'px';
    }

    /* ============================================================
       会话列表
 */
    function renderSessions() {
        if (!els.sessList) return;
        els.sessList.innerHTML = '';
        SESS.list.forEach(function (s) {
            var row = el('div', 'usb-sess' + (s.id === SESS.activeId ? ' on' : ''));
            var t = el('div', 't', s.title || '新会话');
            var n = el('div', 'n', String(s.msgs.filter(function (m) { return m.role === 'user'; }).length));
            var acts = el('div', 'acts');
            var ren = el('button', '', '✎');
            ren.title = '重命名';
            ren.addEventListener('click', function (e) {
                e.stopPropagation();
                var v = window.prompt('会话名称:', s.title || '');
                if (v == null) return;
                s.title = String(v).trim().slice(0, 40) || '新会话';
                saveSessions(true); renderSessions();
                if (s.id === SESS.activeId) els.title.textContent = s.title;
            });
            var del = el('button', 'del', '🗑');
            del.title = '删除会话';
            del.addEventListener('click', function (e) {
                e.stopPropagation();
                if (!window.confirm('删除会话「' + (s.title || '新会话') + '」?')) return;
                SESS.list = SESS.list.filter(function (x) { return x.id !== s.id; });
                if (!SESS.list.length) createSession(true);
                if (!SESS.list.some(function (x) { return x.id === SESS.activeId; })) SESS.activeId = SESS.list[0].id;
                saveSessions(true); renderSessions(); renderChat();
            });
            acts.appendChild(ren); acts.appendChild(del);
            row.appendChild(t); row.appendChild(n); row.appendChild(acts);
            row.addEventListener('click', function () {
                if (BUSY) { tip('先等这一轮结束,或点「停止」。', 'ri-loader-4-line'); return; }
                SESS.activeId = s.id;
                saveSessions(true); renderSessions(); renderChat();
                els.side.classList.remove('on');
            });
            els.sessList.appendChild(row);
        });
        var s = activeSession();
        if (s) els.title.textContent = s.title || '新会话';
    }

    function updateTitleFromMsg(sess, text) {
        if (!sess || sess.title !== '新会话') return;
        sess.title = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 22) || '新会话';
    }

    /* ============================================================
       文件区
 */
    function renderFiles() {
        if (!els.files) return;
        var names = visibleNames();
        els.fcount.textContent = String(names.length);
        els.files.innerHTML = '';
        if (!names.length) {
            var li = el('li', '', '');
            li.style.cssText = 'padding:14px 10px;font-size:11.5px;color:var(--usb-tx3);line-height:1.7';
            li.innerHTML = '工作区是空的。<br>让 AI 写一个 index.html,或点右上角上传。';
            els.files.appendChild(li);
            return;
        }
        names.forEach(function (name) {
            var li = el('li', 'usb-file');
            li.title = name;
            var icon = el('i', fileIcon(name));
            var nm = el('div', 'nm', name);
            var sz = el('div', 'sz', fmtBytes(fileSize(name)));
            var acts = el('div', 'acts');
            var dl = el('button', '', '⬇');
            dl.title = '下载这个文件';
            dl.addEventListener('click', function (e) { e.stopPropagation(); downloadFile(name); });
            var del = el('button', 'del', '🗑');
            del.title = '删除这个文件';
            del.addEventListener('click', function (e) {
                e.stopPropagation();
                deleteFile(name);
            });
            acts.appendChild(dl); acts.appendChild(del);
            li.appendChild(icon); li.appendChild(nm); li.appendChild(sz); li.appendChild(acts);
            li.addEventListener('click', function () { openEditorFor(name); });
            els.files.appendChild(li);
        });
    }

    function newFilePrompt() {
        var name = window.prompt('新建文件名(可带目录,如 pages/about.html):', 'page.html');
        if (name == null) return;
        var p = normPath(name);
        if (!p) { tip('文件名不合法(不能为空,不能包含 ..)', 'ri-error-warning-line'); return; }
        if (FILES[p] != null) { tip('同名文件已存在', 'ri-error-warning-line'); return; }
        FILES[p] = '';
        persist(true);
        renderFiles();
        openEditorFor(p);
    }

    function deleteFile(name) {
        if (FILES[name] == null) return;
        if (!window.confirm('删除文件 ' + name + '?')) return;
        var prev = FILES[name];
        delete FILES[name];
        persist(true);
        renderFiles();
        if (editing === name) { editing = ''; els.editorOvl.classList.remove('on'); }
        pushUndo({ type: 'delete', name: name, prev: prev });
        tip('已删除 ' + name, 'ri-delete-bin-line');
    }

    /* ---------------- 上传 / 拖拽 / 粘贴 ---------------- */
    function readAsDataURL(file) {
        return new Promise(function (res, rej) {
            var fr = new FileReader();
            fr.onload = function () { res(String(fr.result || '')); };
            fr.onerror = function () { rej(fr.error); };
            fr.readAsDataURL(file);
        });
    }
    function readAsText(file) {
        return new Promise(function (res, rej) {
            var fr = new FileReader();
            fr.onload = function () { res(String(fr.result || '')); };
            fr.onerror = function () { rej(fr.error); };
            fr.readAsText(file);
        });
    }

    async function addFromFiles(fileList) {
        var arr = Array.prototype.slice.call(fileList || []);
        if (!arr.length) return;
        var added = 0;
        for (var i = 0; i < arr.length; i++) {
            var f = arr[i];
            var name = normPath(f.name || '');
            if (!name) continue;
            try {
                if (/\.zip$/i.test(name)) {
                    var buf = await f.arrayBuffer();
                    var entries;
                    if (window.JSZip) {
                        var zip = await window.JSZip.loadAsync(buf);
                        entries = {};
                        var jobs = [];
                        zip.forEach(function (path, ent) {
                            if (ent.dir) return;
                            if (/^__MACOSX\//.test(path) || /\.DS_Store$/.test(path)) return;
                            jobs.push(ent.async('base64').then(function (b64) {
                                var isBin = BIN_EXT.indexOf(extOf(path)) >= 0 && !/^svg$/i.test(extOf(path));
                                entries[path] = isBin
                                    ? 'data:' + mimeOfExt(path) + ';base64,' + b64
                                    : bytesToStr(b64ToBytes(b64));
                            }));
                        });
                        await Promise.all(jobs);
                    } else {
                        entries = await zipParse(buf);
                    }
                    var names = Object.keys(entries);
                    names.forEach(function (n) {
                        var p = normPath(n);
                        if (!p) return;
                        FILES[p] = entries[n];
                        added++;
                    });
                    tip('已从 ' + name + ' 解压 ' + names.length + ' 个文件', 'ri-file-zip-line');
                } else {
                    if (BIN_EXT.indexOf(extOf(name)) >= 0 && !/^svg$/i.test(extOf(name))) {
                        FILES[name] = await readAsDataURL(f);
                    } else {
                        FILES[name] = await readAsText(f);
                    }
                    added++;
                }
            } catch (e) {
                tip('读取 ' + name + ' 失败:' + (e && e.message || e), 'ri-error-warning-line');
            }
        }
        if (added) {
            persist(true);
            renderFiles();
            tip('已加入 ' + added + ' 个文件', 'ri-check-line');
        }
    }

    function bindDragDrop() {
        var depth = 0;
        var hasFiles = function (e) {
            return !!(e.dataTransfer && e.dataTransfer.types && Array.prototype.indexOf.call(e.dataTransfer.types, 'Files') >= 0);
        };
        window.addEventListener('dragenter', function (e) {
            if (!hasFiles(e)) return;
            depth++;
            els.dragging.classList.add('on');
        });
        window.addEventListener('dragover', function (e) {
            if (!hasFiles(e)) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = 'copy';
        });
        window.addEventListener('dragleave', function (e) {
            if (!hasFiles(e)) return;
            depth = Math.max(0, depth - 1);
            if (!depth) els.dragging.classList.remove('on');
        });
        window.addEventListener('drop', function (e) {
            if (!hasFiles(e)) return;
            e.preventDefault();
            depth = 0;
            els.dragging.classList.remove('on');
            if (e.dataTransfer.files && e.dataTransfer.files.length) addFromFiles(e.dataTransfer.files);
        });
    }

    var pendingImgs = [];
    function onPaste(e) {
        var items = (e.clipboardData && e.clipboardData.items) || [];
        var got = false;
        for (var i = 0; i < items.length; i++) {
            if (items[i].type && items[i].type.indexOf('image/') === 0) {
                var f = items[i].getAsFile();
                if (!f) continue;
                got = true;
                (function (file) {
                    readAsDataURL(file).then(function (url) {
                        pendingImgs.push(url);
                        renderAttach();
                    });
                })(f);
            }
        }
        if (got) e.preventDefault();
    }
    function renderAttach() {
        if (!els.attach) return;
        els.attach.innerHTML = '';
        pendingImgs.forEach(function (url, idx) {
            var chip = el('div', 'usb-attach');
            var img = document.createElement('img');
            img.src = url;
            var label = el('span', '', '图片 ' + (idx + 1));
            var x = el('button', '', '✕');
            x.addEventListener('click', function () {
                pendingImgs.splice(idx, 1);
                renderAttach();
            });
            chip.appendChild(img); chip.appendChild(label); chip.appendChild(x);
            els.attach.appendChild(chip);
        });
    }

    /* ============================================================
       单文件编辑器
 */
    var editing = '';
    function openEditorFor(name) {
        editing = name;
        var val = FILES[name];
        els.editorTitle.textContent = name;
        var isImg = isImageDataUrl(val);
        els.editorArea.style.display = isImg ? 'none' : 'block';
        els.editorImg.style.display = isImg ? 'flex' : 'none';
        if (isImg) {
            els.editorImg.innerHTML = '<img src="' + esc(val) + '" alt="">';
        } else {
            els.editorArea.value = isDataUrl(val) ? '' : String(val == null ? '' : val);
        }
        updateEditorStats();
        els.editorOvl.classList.add('on');
    }
    function updateEditorStats() {
        var v = els.editorArea.value || '';
        els.editorStats.textContent = v ? (v.split('\n').length + ' 行 · ' + fmtBytes(byteLen(v))) : '';
    }
    function saveEditor() {
        if (!editing) return;
        var isImg = isImageDataUrl(FILES[editing]);
        if (!isImg) FILES[editing] = els.editorArea.value;
        persist(true);
        renderFiles();
        els.editorOvl.classList.remove('on');
        tip('已保存 ' + editing, 'ri-check-line');
    }

    /* ---------------- 导出 ---------------- */
    async function exportZip() {
        var names = visibleNames();
        if (!names.length) { tip('工作区还是空的,没东西可导出。', 'ri-information-line'); return; }
        try {
            var blob;
            if (window.JSZip) {
                var zip = new window.JSZip();
                Object.keys(FILES).forEach(function (n) {
                    if (n.slice(0, 2) === '__') return;
                    var v = FILES[n];
                    if (isDataUrl(v)) {
                        var i = String(v).indexOf(',');
                        zip.file(n, String(v).slice(i + 1), { base64: true });
                    } else {
                        zip.file(n, String(v == null ? '' : v));
                    }
                });
                blob = await zip.generateAsync({ type: 'blob' });
            } else {
                blob = zipBuild(FILES);
            }
            downloadBlob(blob, (SP.name || SP.id) + '-工作区.zip');
            tip('已导出 ' + names.length + ' 个文件', 'ri-download-2-line');
        } catch (e) {
            tip('导出失败:' + (e && e.message || e), 'ri-error-warning-line');
        }
    }

    /* ============================================================
       Markdown 渲染
       站内本来就有 marked + DOMPurify(必加载),直接复用;万一被关掉,
       退回「只转义 + 代码块」的保守渲染 —— 宁可少点样式,也不要吐出
       一段没消毒的 HTML。
 */
    function renderMd(text) {
        var src = String(text || '');
        if (!src.trim()) return '';
        if (window.marked && window.DOMPurify) {
            try {
                var html = window.marked.parse(src, { breaks: true, gfm: true });
                return window.DOMPurify.sanitize(html, { ADD_ATTR: ['target'] });
            } catch (e) { /* 走兜底 */ }
        }
        var parts = src.split(/```/);
        return parts.map(function (seg, i) {
            if (i % 2 === 1) {
                var body = seg.replace(/^[a-zA-Z0-9+#-]*\n/, '');
                return '<pre><code>' + esc(body) + '</code></pre>';
            }
            return '<p>' + esc(seg).replace(/\n/g, '<br>') + '</p>';
        }).join('');
    }
    function decorateCode(scope) {
        Array.prototype.forEach.call(scope.querySelectorAll('pre'), function (pre) {
            if (pre.querySelector('.cp')) return;
            var btn = el('button', 'cp', '复制');
            btn.addEventListener('click', function () {
                var code = pre.querySelector('code');
                copyText(code ? code.textContent : pre.textContent, btn);
            });
            pre.appendChild(btn);
        });
    }
    function copyText(txt, btn) {
        var done = function () {
            if (btn) { btn.textContent = '已复制'; setTimeout(function () { btn.textContent = '复制'; }, 1400); }
        };
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(txt).then(done).catch(function () { fallbackCopy(txt); done(); });
        } else { fallbackCopy(txt); done(); }
    }
    function fallbackCopy(txt) {
        var ta = document.createElement('textarea');
        ta.value = txt;
        ta.style.cssText = 'position:fixed;opacity:0';
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand('copy'); } catch (e) { }
        ta.remove();
    }

    /* ============================================================
       消息区渲染
 */
    function callBrief(name, args) {
        if (!args) return '';
        if (name === 'write_file') return (args.path || '') + ' · ' + fmtBytes(byteLen(args.content || ''));
        if (name === 'edit_file') return (args.path || '');
        if (name === 'read_file') return (args.path || '') + (args.start ? ' 行 ' + args.start + '-' + (args.end || '') : '');
        if (name === 'delete_file') return args.path || '';
        return '';
    }

    function buildToolCard(call) {
        var box = el('details', 'usb-tool ' + (call.ok === false ? 'bad' : (call.result != null ? 'done' : '')));
        var sum = el('summary');
        var name = el('span', 'tname', call.name);
        var brief = callBrief(call.name, call.args);
        if (!brief && call.result != null) brief = String(call.result).split('\n')[0].slice(0, 60);
        var desc = el('span', 'tdesc', brief);
        var state = el('span', 'tstate', call.result == null ? '执行中…' : (call.ok === false ? '失败' : '完成'));
        sum.appendChild(name); sum.appendChild(desc); sum.appendChild(state);
        box.appendChild(sum);
        var body = el('div', 'tbody');
        if (call.args && Object.keys(call.args).length > 1 || (call.args && call.args.find)) {
            var argPre = el('pre', '', '参数:' + JSON.stringify(call.args, null, 1).slice(0, 1200));
            body.appendChild(argPre);
        }
        if (call.result != null) {
            var resPre = el('pre', '', String(call.result).slice(0, 4000));
            body.appendChild(resPre);
        }
        if (call.undo) {
            var undo = el('button', 'tundo', '↺ 撤销这次改动');
            undo.addEventListener('click', function (e) {
                e.stopPropagation();
                applyUndo(call);
            });
            body.appendChild(undo);
        }
        box.appendChild(body);
        if (call.ok === false || call.result == null) box.open = true;
        return box;
    }

    function renderChat() {
        if (!els.msgs) return;
        var sess = activeSession();
        els.msgs.innerHTML = '';
        var msgs = sess ? sess.msgs : [];
        if (!msgs.length) {
            els.empty.style.display = 'block';
            return;
        }
        els.empty.style.display = 'none';
        msgs.forEach(function (m) {
            if (m.role === 'user') {
                var wrap = el('div', 'usb-msg user');
                var who = el('div', 'who', timeStr(m.at));
                var bubble = el('div', 'usb-bubble');
                bubble.textContent = m.text || '';
                wrap.appendChild(who); wrap.appendChild(bubble);
                if (m.imgs && m.imgs.length) {
                    var imgs = el('div', 'usb-imgs');
                    m.imgs.forEach(function (u) {
                        var im = document.createElement('img');
                        im.src = u;
                        im.addEventListener('click', function () { window.open(u, '_blank'); });
                        imgs.appendChild(im);
                    });
                    wrap.appendChild(imgs);
                }
                els.msgs.appendChild(wrap);
                return;
            }
            if (m.role === 'assistant') {
                var w = el('div', 'usb-msg ai');
                var hd = el('div', 'who');
                hd.innerHTML = '<i class="ri-sparkling-2-line"></i><span>AI 工程师</span><span>· ' + esc(timeStr(m.at)) + '</span>';
                w.appendChild(hd);
                if (m.reasoning) {
                    var th = el('details', 'usb-think');
                    var sm = el('summary', '', '思考过程(' + m.reasoning.length + ' 字)');
                    var dv = el('div', '', m.reasoning.slice(0, 6000));
                    th.appendChild(sm); th.appendChild(dv);
                    w.appendChild(th);
                }
                if (m.text || m.streaming) {
                    var b = el('div', 'usb-bubble');
                    if (m.streaming) {
                        b.style.whiteSpace = 'pre-wrap';
                        b.textContent = m.text || '▍';
                    } else {
                        b.innerHTML = renderMd(m.text);
                        decorateCode(b);
                    }
                    w.appendChild(b);
                }
                (m.calls || []).forEach(function (c) { w.appendChild(buildToolCard(c)); });
                els.msgs.appendChild(w);
                return;
            }
            // 兼容:早期版本可能把 tool 结果单独存成一条
            if (m.role === 'tool') {
                var tw = el('div', 'usb-msg');
                tw.appendChild(buildToolCard({ name: m.name, args: m.args, result: m.text, ok: m.ok }));
                els.msgs.appendChild(tw);
            }
        });
        scrollBottom();
    }
    function scrollBottom(force) {
        if (!els.scroll) return;
        var near = els.scroll.scrollHeight - els.scroll.scrollTop - els.scroll.clientHeight < 160;
        if (force || near) els.scroll.scrollTop = els.scroll.scrollHeight;
    }

    /* ============================================================
       撤销
 */
    function pushUndo(entry) {
        UNDO.push(entry);
        if (UNDO.length > 40) UNDO.shift();
    }
    function applyUndo(call) {
        var u = call.undo;
        if (!u) return;
        if (u.type === 'write') {
            if (u.prev == null) delete FILES[u.name];
            else FILES[u.name] = u.prev;
        } else if (u.type === 'delete') {
            FILES[u.name] = u.prev;
        }
        call.undo = null;
        persist(true);
        renderFiles();
        renderChat();
        tip('已撤销 ' + u.name, 'ri-arrow-go-back-line');
    }
    function undoLast() {
        if (!UNDO.length) { tip('没有可撤销的改动', 'ri-information-line'); return; }
        var u = UNDO.pop();
        if (u.type === 'write' || u.type === 'delete') {
            if (u.type === 'write') {
                if (u.prev == null) delete FILES[u.name]; else FILES[u.name] = u.prev;
            } else {
                FILES[u.name] = u.prev;
            }
            persist(true); renderFiles();
            tip('已撤销最近一次改动:' + u.name, 'ri-arrow-go-back-line');
        }
    }

    /* ============================================================
       工具定义与执行
       给的四个半工具都是「文件级」的:没有联网、没有执行任意代码,
       AI 只能读写这个空间自己的文件,这是刻意的 —— 工作台跑在主站
       同源页面里,开放 shell 或 eval 等于把主站交出去。
 */
    function toolDefs() {
        return [
            {
                type: 'function',
                function: {
                    name: 'list_files',
                    description: '列出工作区里的全部文件及其大小、行数。改动前先看一眼有哪些文件。',
                    parameters: { type: 'object', properties: {}, required: [] }
                }
            },
            {
                type: 'function',
                function: {
                    name: 'read_file',
                    description: '读取一个文本文件的完整内容,或用 start/end 读取指定行范围。修改前必须先读,不要凭猜测覆盖。',
                    parameters: {
                        type: 'object',
                        properties: {
                            path: { type: 'string', description: '文件名,如 index.html' },
                            start: { type: 'integer', description: '起始行号,从 1 开始(可省略)' },
                            end: { type: 'integer', description: '结束行号,包含该行(可省略)' }
                        },
                        required: ['path']
                    }
                }
            },
            {
                type: 'function',
                function: {
                    name: 'write_file',
                    description: '新建或整体覆盖一个文件。content 必须是该文件的完整内容,不要写省略号。',
                    parameters: {
                        type: 'object',
                        properties: {
                            path: { type: 'string', description: '文件名,如 style.css' },
                            content: { type: 'string', description: '文件完整内容' }
                        },
                        required: ['path', 'content']
                    }
                }
            },
            {
                type: 'function',
                function: {
                    name: 'edit_file',
                    description: '局部替换:把文件里唯一出现的一段原文替换成新内容。适合改几行,比整体重写省 token。find 必须与文件中原文完全一致(含缩进),且在文件中只出现一次。',
                    parameters: {
                        type: 'object',
                        properties: {
                            path: { type: 'string' },
                            find: { type: 'string', description: '要被替换的原文,必须唯一' },
                            replace: { type: 'string', description: '替换后的内容,留空表示删除这段' }
                        },
                        required: ['path', 'find', 'replace']
                    }
                }
            },
            {
                type: 'function',
                function: {
                    name: 'delete_file',
                    description: '删除一个文件。',
                    parameters: {
                        type: 'object',
                        properties: { path: { type: 'string' } },
                        required: ['path']
                    }
                }
            }
        ];
    }

    function toolOk(text, undo) { return { ok: true, text: text, undo: undo }; }
    function toolErr(text) { return { ok: false, text: text }; }

    function execTool(name, args) {
        args = args || {};
        var p = normPath(args.path);
        if (name === 'list_files') {
            var names = visibleNames();
            if (!names.length) return toolOk('工作区当前没有任何文件。');
            var lines = names.map(function (n) {
                var t = FILES[n];
                if (isDataUrl(t)) return '- ' + n + ' · ' + fmtBytes(fileSize(n)) + ' · 二进制文件';
                var lc = String(t || '').split('\n').length;
                return '- ' + n + ' · ' + fmtBytes(fileSize(n)) + ' · ' + lc + ' 行';
            });
            return toolOk('共 ' + names.length + ' 个文件:\n' + lines.join('\n'));
        }
        if (!p) return toolErr('文件名不合法。请给出不带 .. 的相对路径,如 index.html。');

        if (name === 'read_file') {
            if (FILES[p] == null) return toolErr('文件不存在:' + p + '。现有文件:' + visibleNames().join(', '));
            if (isDataUrl(FILES[p])) return toolOk('[' + p + ' 是二进制文件(' + extOf(p) + ',' + fmtBytes(fileSize(p)) + '),无法以文本读取]');
            var text = String(FILES[p] || '');
            var allLines = text.split('\n');
            var start = parseInt(args.start, 10), end = parseInt(args.end, 10);
            var body = text, note = '';
            if ((start > 0) || (end > 0)) {
                var s = Math.max(1, start || 1);
                var e = Math.min(allLines.length, end || allLines.length);
                body = allLines.slice(s - 1, e).join('\n');
                note = '第 ' + s + '-' + e + ' 行(共 ' + allLines.length + ' 行)\n';
            }
            if (body.length > READ_LIMIT) {
                body = body.slice(0, READ_LIMIT);
                note += '内容较长,已截断到 ' + READ_LIMIT + ' 字符,请用 start/end 分段读取。\n';
            }
            return toolOk(note + '```' + extOf(p) + '\n' + body + '\n```');
        }

        if (name === 'write_file') {
            var content = args.content == null ? '' : String(args.content);
            if (byteLen(content) > MAX_FILE_BYTES) {
                return toolErr('内容太大(' + fmtBytes(byteLen(content)) + '),单文件上限 ' + fmtBytes(MAX_FILE_BYTES) + '。请拆成多个文件。');
            }
            var prev = FILES[p];
            FILES[p] = content;
            var undo = { type: 'write', name: p, prev: prev == null ? null : prev };
            pushUndo(undo);
            persist();
            renderFiles();
            return toolOk('已写入 ' + p + '(' + content.split('\n').length + ' 行, ' + fmtBytes(byteLen(content)) + ')', undo);
        }

        if (name === 'edit_file') {
            if (FILES[p] == null) return toolErr('文件不存在:' + p + '。');
            if (isDataUrl(FILES[p])) return toolErr(p + ' 是二进制文件,不能用 edit_file 改。');
            var src = String(FILES[p] || '');
            var find = args.find == null ? '' : String(args.find);
            var rep = args.replace == null ? '' : String(args.replace);
            if (!find) return toolErr('find 不能为空。要整体重写请用 write_file。');
            var idx = src.indexOf(find);
            if (idx < 0) {
                // 常见翻车点:模型把缩进/空行弄丢了。给一个「空白归一化」后的定位尝试。
                var normSrc = src.replace(/\s+/g, ' '), normFind = find.replace(/\s+/g, ' ').trim();
                var near = normSrc.indexOf(normFind) >= 0
                    ? '文件里存在内容相同但空白/缩进不同的片段,请连缩进一起原样复制(find 必须与原文逐字符一致)。'
                    : '文件里找不到这段原文。请先 read_file 确认当前内容。';
                return toolErr('替换失败:' + near);
            }
            if (src.indexOf(find, idx + 1) >= 0) {
                return toolErr('这段原文在文件中出现了多次,无法确定改哪一处。请把它扩展到唯一(比如多带几行上下文)。');
            }
            var prevText = src;
            FILES[p] = src.slice(0, idx) + rep + src.slice(idx + find.length);
            var u2 = { type: 'write', name: p, prev: prevText };
            pushUndo(u2);
            persist();
            renderFiles();
            return toolOk('已修改 ' + p + '(替换 ' + find.length + ' 字符 → ' + rep.length + ' 字符)', u2);
        }

        if (name === 'delete_file') {
            if (FILES[p] == null) return toolErr('文件不存在:' + p);
            var old = FILES[p];
            delete FILES[p];
            var u3 = { type: 'delete', name: p, prev: old };
            pushUndo(u3);
            persist();
            renderFiles();
            return toolOk('已删除 ' + p, u3);
        }
        return toolErr('未知工具:' + name);
    }

    /* ============================================================
       提示词
 */
    function fileDigest() {
        var names = visibleNames();
        if (!names.length) return '(工作区当前为空)';
        return names.map(function (n) {
            return '- ' + n + (isDataUrl(FILES[n]) ? ' · 二进制 ' + fmtBytes(fileSize(n)) : ' · ' + String(FILES[n] || '').split('\n').length + ' 行');
        }).join('\n');
    }
    var SYS_TOOLS = [
        '你是「用户代码空间」工作台里的 AI 工程师。用户在 /{空间ID} 打开的就是这个工作区里的 index.html。',
        '你能用工具真正读写工作区的文件:list_files / read_file / write_file / edit_file / delete_file。',
        '',
        '工作方式:',
        '1. 先看再改:不确定文件内容时先 read_file,不要凭猜测覆盖别人写的东西。',
        '2. 小改动用 edit_file(只替换要改的那段,find 必须与原文逐字符一致且唯一);整页重写才用 write_file。',
        '3. 改完用一两句话说明改了什么、怎么验证,不要把整份文件再贴一遍(内容已经通过工具写进工作区了)。',
        '4. 结构尽量简单:单页能用 index.html + style.css + app.js 解决就不要拆更多文件;不要引用不存在的本地路径。',
        '5. 不要引入需要构建的框架,浏览器直接能跑的 HTML/CSS/JS 最好;需要第三方库时用 CDN 完整 URL。',
        '6. 中文回答,直给结论,不写客套话。',
        '',
        '当前工作区文件:',
        fileDigest()
    ].join('\n');

    function sysText() {
        return [
            '你是「用户代码空间」工作台里的 AI 工程师,负责修改用户工作区里的网页项目文件。',
            '你无法直接操作文件,只能通过下面的输出格式把「要写的文件」交给工作台,由工作台落盘。',
            '',
            '输出规则(必须严格遵守):',
            '1. 先用一两句话说明你要做什么;',
            '2. 然后对每个需要新建或整体重写的文件,输出一段:',
            '===FILE: 文件名===',
            '该文件的完整内容(不要省略,不要写「...」)',
            '3. 只输出确实要改的文件;不需要改的文件不要输出。',
            '4. 想只改几行时,也可以整体重写该文件,但必须完整。',
            '5. 浏览器能直接跑的 HTML/CSS/JS,不要构建步骤,第三方库用 CDN 完整 URL。',
            '',
            '当前工作区文件:',
            fileDigest()
        ].join('\n');
    }

    function parseBlocks(text) {
        var src = String(text || '');
        var re = /===FILE:\s*(.+?)\s*===\s*\n?/g;
        var out = [], m, last = null;
        while ((m = re.exec(src))) {
            if (last) out.push({ name: last.name, body: src.slice(last.end, m.index) });
            last = { name: m[1].trim(), end: re.lastIndex };
        }
        if (last) out.push({ name: last.name, body: src.slice(last.end) });
        return out.map(function (b) {
            var body = b.body.replace(/^```[a-zA-Z0-9+#-]*\n?/, '').replace(/\n?```\s*$/, '');
            return { name: normPath(b.name) || b.name, body: body.replace(/\s+$/, '') + '\n' };
        }).filter(function (b) { return b.name; });
    }

    /* ============================================================
       拼 API 消息
 */
    function truncate(s, n) {
        s = String(s == null ? '' : s);
        return s.length > n ? s.slice(0, n) + '\n…(已截断 ' + (s.length - n) + ' 字符)' : s;
    }
    function buildMessages(sess, useTools) {
        var list = [{ role: 'system', content: useTools ? SYS_TOOLS : sysText() }];
        var msgs = sess.msgs || [];
        var userIdx = [];
        msgs.forEach(function (m, i) { if (m.role === 'user') userIdx.push(i); });
        var from = 0;
        if (userIdx.length > CFG.maxTurns) from = userIdx[userIdx.length - CFG.maxTurns];
        for (var i = from; i < msgs.length; i++) {
            var m = msgs[i];
            if (m.role === 'user') {
                var content = String(m.text || '');
                if (m.imgs && m.imgs.length && CFG.vision) {
                    var parts = [{ type: 'text', text: content || '请看这张图片。' }];
                    m.imgs.forEach(function (u) { parts.push({ type: 'image_url', image_url: { url: u } }); });
                    list.push({ role: 'user', content: parts });
                } else {
                    list.push({ role: 'user', content: truncate(content, MAX_MSG_CHARS) });
                }
                continue;
            }
            if (m.role !== 'assistant') continue;
            /* p:1 的调用来自「上次打开页面时的存档」,其中的 arguments 已被瘦身成摘要。
               这类历史不再按 tool_calls 协议回放(否则等于把摘要当参数发给模型),
               只保留文字结论 —— 保证请求体任何时候都是合法结构。 */
            var calls = (m.calls || []).filter(function (c) { return !c.p; });
            if (useTools && calls.length) {
                var msg = { role: 'assistant' };
                if (m.text) msg.content = m.text;
                msg.tool_calls = calls.map(function (c) {
                    return {
                        id: c.id, type: 'function',
                        function: { name: c.name, arguments: JSON.stringify(c.args || {}) }
                    };
                });
                list.push(msg);
                calls.forEach(function (c) {
                    list.push({
                        role: 'tool', tool_call_id: c.id,
                        content: truncate(c.result == null ? '(该工具未执行)' : c.result, 20000)
                    });
                });
            } else if (m.text) {
                list.push({ role: 'assistant', content: truncate(m.text, MAX_MSG_CHARS) });
            }
        }
        return list;
    }

    /* ============================================================
       调 API
       走 ApiModule.fetchChat:自动带主站的站点/模型回退链与重试,
       Key 只在这一层(主站页面)出现,不进任何沙箱。
       流式与非流式都要兼容 —— 不少中转站会忽略 stream:true 直接回 JSON。
 */
    function normalizeMsg(msg) {
        var out = { text: '', reasoning: '', calls: [] };
        if (!msg) return out;
        out.text = typeof msg.content === 'string' ? msg.content : '';
        if (!out.text && typeof msg.reasoning_content === 'string') out.text = '';
        out.reasoning = String(msg.reasoning_content || msg.reasoning || '');
        var tcs = msg.tool_calls || [];
        for (var i = 0; i < tcs.length; i++) {
            var tc = tcs[i] || {};
            var fn = tc.function || {};
            out.calls.push({
                id: tc.id || uid('call'),
                name: fn.name || '',
                args: safeParseArgs(fn.arguments)
            });
        }
        return out;
    }
    function safeParseArgs(raw) {
        if (raw == null) return {};
        if (typeof raw === 'object') return raw;
        var s = String(raw).trim();
        if (!s) return {};
        try { return JSON.parse(s); } catch (e) { }
        // 模型常见的额外包装:```json ... ``` 或尾逗号
        var cleaned = s.replace(/^```(?:json)?/i, '').replace(/```$/, '').replace(/,\s*([}\]])/g, '$1').trim();
        try { return JSON.parse(cleaned); } catch (e) { }
        return { __raw: s.slice(0, 400) };
    }

    var CURRENT_READER = null;   // 「停止」按钮要能真正掐断正在下载的响应体
    async function readSSE(res, onDelta) {
        var reader = res.body.getReader();
        CURRENT_READER = reader;
        var decoder = new TextDecoder('utf-8');
        var buf = '', acc = { text: '', reasoning: '', calls: [] };
        var callsByIndex = {};
        while (true) {
            var chunk;
            try {
                chunk = await reader.read();
            } catch (e) {
                break;   // 被 cancel() / 网络中断:把已经收到的部分当成结果
            }
            if (chunk.done) break;
            buf += decoder.decode(chunk.value, { stream: true });
            var lines = buf.split('\n');
            buf = lines.pop();
            for (var i = 0; i < lines.length; i++) {
                var line = lines[i].trim();
                if (!line || line.indexOf('data:') !== 0) continue;
                var payload = line.slice(5).trim();
                if (!payload || payload === '[DONE]') continue;
                var json;
                try { json = JSON.parse(payload); } catch (e) { continue; }
                var choice = json.choices && json.choices[0];
                if (!choice) continue;
                var d = choice.delta || (choice.message ? choice.message : null);
                if (!d) continue;
                if (typeof d.content === 'string' && d.content) {
                    acc.text += d.content;
                    onDelta && onDelta({ text: d.content });
                }
                if (typeof d.reasoning_content === 'string' && d.reasoning_content) {
                    acc.reasoning += d.reasoning_content;
                    onDelta && onDelta({ reasoning: d.reasoning_content });
                }
                if (Array.isArray(d.tool_calls)) {
                    d.tool_calls.forEach(function (tc) {
                        var idx = typeof tc.index === 'number' ? tc.index : 0;
                        var cur = callsByIndex[idx];
                        if (!cur) {
                            cur = callsByIndex[idx] = { id: tc.id || uid('call'), name: '', arguments: '' };
                        }
                        if (tc.id) cur.id = tc.id;
                        var fn = tc.function || {};
                        if (fn.name) cur.name += fn.name;
                        if (fn.arguments) cur.arguments += fn.arguments;
                    });
                }
            }
        }
        Object.keys(callsByIndex).forEach(function (k) {
            var c = callsByIndex[k];
            acc.calls.push({ id: c.id, name: c.name, args: safeParseArgs(c.arguments) });
        });
        CURRENT_READER = null;
        return acc;
    }

    async function callApi(messages, useTools, onDelta) {
        if (!window.ApiModule || typeof ApiModule.fetchChat !== 'function') {
            throw new Error('AI 接口模块还没就绪,请刷新页面后再试。');
        }
        var api = HOST.getApi();  // 主站没配 API 时会在这里抛错,提示语沿用主站的
        var variants = [
            { temperature: 0.4, max_tokens: 8192 },
            { temperature: 0.4 },                                   // 部分网关不认 max_tokens
            { temperature: 0.4, max_tokens: 4096, top_p: 1 }        // 再缩一次额度
        ];
        var lastErr = null;
        for (var vi = 0; vi < variants.length; vi++) {
            var overrides = {};
            Object.keys(variants[vi]).forEach(function (k) { overrides[k] = variants[vi][k]; });
            if (CFG.stream) overrides.stream = true;
            if (useTools) { overrides.tools = toolDefs(); overrides.tool_choice = 'auto'; }
            var emitted = false;
            var wrappedDelta = function (d) { emitted = true; onDelta && onDelta(d); };
            try {
                var res = await ApiModule.fetchChat(api, messages, overrides);
                if (!res) throw new Error('没有拿到响应。');
                if (!res.ok) {
                    var detail = '';
                    try {
                        var j = await res.json();
                        detail = (j.error && (j.error.message || j.error)) || JSON.stringify(j).slice(0, 300);
                    } catch (e) {
                        try { detail = String(await res.text()).slice(0, 300); } catch (e2) { }
                    }
                    var err = new Error('HTTP ' + res.status + (detail ? '\n' + detail : ''));
                    err.status = res.status;
                    throw err;
                }
                var ct = String(res.headers.get('content-type') || '');
                if (ct.indexOf('application/json') >= 0) {
                    var data = await res.json();
                    var m = data.choices && data.choices[0] && (data.choices[0].message || data.choices[0].delta);
                    var norm = normalizeMsg(m);
                    if (norm.text && onDelta) onDelta({ text: norm.text });
                    return norm;
                }
                return await readSSE(res, wrappedDelta);
            } catch (e) {
                lastErr = e;
                var msgText = String(e && e.message || e);
                var isParamIssue = e && (e.status === 400 || e.status === 422) &&
                    /max_tokens|max_completion_tokens|context|too large|invalid_request|parameter|top_p|temperature|不兼容|参数/i.test(msgText);
                // 已经吐过内容就不能重试,否则前端会把重复文字叠在一起
                if (emitted || !isParamIssue || vi === variants.length - 1) throw e;
            }
        }
        throw lastErr || new Error('请求失败');
    }
    function looksLikeToolProblem(err) {
        var s = String(err && err.message || err);
        if (/tool|function.?call|工具/i.test(s)) return true;
        return false;
    }

    /* ============================================================
       一轮完整对话
 */
    function toggleBusy(on) {
        BUSY = on;
        if (els.sendBtn) els.sendBtn.style.display = on ? 'none' : '';
        if (els.stopBtn) {
            els.stopBtn.style.display = on ? '' : 'none';
            els.stopBtn.disabled = false;
            els.stopBtn.textContent = '停止';
        }
        if (els.input) els.input.disabled = on;
    }
    function toolCountTip(n) {
        var box = $('usb-tip-tools');
        if (box) box.textContent = n ? ('本轮已执行 ' + n + ' 次工具') : '';
    }

    async function runAgent(sess) {
        toggleBusy(true);
        ABORT = { stop: false };
        var rounds = 0, used = 0;
        try {
            // 限速按「用户发一轮」计数(与经典版一次调用一次的口径一致),
            // 不按工具轮次计 —— 否则一次 12 轮的任务会在中途被限速打断。
            var gate = HOST.rateCheck(SP.id);
            if (!gate.ok) throw new Error(gate.error);
            while (rounds < CFG.maxRounds) {
                if (ABORT.stop) break;
                rounds++;
                var useTools = CFG.mode !== 'text';
                var msg = { role: 'assistant', text: '', reasoning: '', calls: [], at: Date.now(), streaming: true };
                sess.msgs.push(msg);
                renderChat();
                var live = els.msgs.querySelector('.usb-msg.ai:last-child .usb-bubble');
                var res = null;
                try {
                    res = await callApi(buildMessages(sess, useTools), useTools, function (d) {
                        if (d.text) msg.text += d.text;
                        if (d.reasoning) msg.reasoning += d.reasoning;
                        if (live) { live.textContent = msg.text; scrollBottom(); }
                    });
                } catch (e) {
                    // 「模型不支持 tools」是最常见的翻车方式:auto 模式下静默换文本协议重来
                    if (useTools && CFG.mode === 'auto' && looksLikeToolProblem(e)) {
                        CFG.mode = 'text';
                        saveCfg();
                        sess.msgs.pop();
                        renderChat();
                        rounds--;
                        tip('当前模型不支持工具调用,已自动改用文本协议', 'ri-swap-line');
                        continue;
                    }
                    throw e;
                }
                if (res.text) msg.text = res.text;
                if (res.reasoning) msg.reasoning = res.reasoning;
                msg.streaming = false;
                scrollBottom();
                if (ABORT.stop) {
                    // 用户点了停止:保留已经收到的半截回复,但不再执行任何工具
                    if (!msg.text) msg.text = '(已停止)';
                    break;
                }

                if (useTools && res.calls && res.calls.length) {
                    msg.calls = res.calls.map(function (c) {
                        return { id: c.id, name: c.name, args: c.args, result: null };
                    });
                    renderChat();
                    for (var i = 0; i < msg.calls.length; i++) {
                        if (ABORT.stop) break;
                        var c = msg.calls[i];
                        var out;
                        try { out = execTool(c.name, c.args); }
                        catch (err) { out = { ok: false, text: '工具执行出错:' + (err && err.message || err) }; }
                        c.result = out.text;
                        c.ok = out.ok;
                        if (out.undo) c.undo = out.undo;
                        used++; toolCountTip(used);
                        renderChat();
                        await sleep(50);
                    }
                    if (ABORT.stop) {
                        msg.calls.forEach(function (c) {
                            if (c.result == null) { c.result = '(已取消)'; c.ok = false; }
                        });
                    }
                    saveSessions();
                    if (ABORT.stop) break;
                    continue;
                }

                // 文本协议:模型把文件放在 ===FILE:=== 段里,由工作台落盘
                if (!useTools) {
                    var blocks = parseBlocks(res.text || msg.text);
                    if (blocks.length) {
                        // 展示文本只留「说明」部分:===FILE: 段已经变成下面的工具卡了,
                        // 留在正文里既重复、又会被 markdown 解析成奇怪的标题
                        var prose = String(res.text || msg.text || '').split(/===FILE:/)[0]
                            .replace(/```[a-zA-Z0-9+#-]*\s*$/i, '').trim();
                        msg.text = prose || ('已按你的要求写入 ' + blocks.length + ' 个文件。');
                        msg.calls = blocks.map(function (b) {
                            return { id: uid('call'), name: 'write_file', args: { path: b.name, content: b.body }, result: null };
                        });
                        renderChat();
                        for (var j = 0; j < msg.calls.length; j++) {
                            var c2 = msg.calls[j];
                            var o2;
                            try { o2 = execTool('write_file', c2.args); }
                            catch (err2) { o2 = { ok: false, text: '写入失败:' + (err2 && err2.message || err2) }; }
                            c2.result = o2.text; c2.ok = o2.ok; if (o2.undo) c2.undo = o2.undo;
                            used++; toolCountTip(used);
                            renderChat();
                            await sleep(50);
                        }
                    }
                }
                if (!msg.text && !(msg.calls || []).length) msg.text = '（模型没有返回内容,可以换个模型或再说一次）';
                break;
            }
            if (rounds >= CFG.maxRounds) {
                var lastA = null;
                sess.msgs.forEach(function (m) { if (m.role === 'assistant') lastA = m; });
                if (lastA && lastA.calls && lastA.calls.length) {
                    tip('已达到工具轮数上限(' + CFG.maxRounds + '),需要的话继续发消息即可。', 'ri-information-line');
                }
            }
        } catch (e) {
            // 出错时把这一轮留下的空壳助手消息收掉,否则聊天里会挂一个永远转圈的空气泡
            var tail = sess.msgs[sess.msgs.length - 1];
            if (tail && tail.role === 'assistant' && !tail.text && !(tail.calls || []).length) sess.msgs.pop();
            var text = String(e && e.message || e);
            var hint = '';
            if (/未找到可用的 API 配置|还没有配置/.test(text)) hint = '请先到主站「设置 → AI 配置」里填好调用地址与模型。';
            else if (/\b401\b|unauthorized|api key/i.test(text)) hint = 'Key 似乎无效,去主站「设置 → AI 配置」检查一下。';
            else if (/\b429\b/.test(text)) hint = '请求太频繁,等一下再发。';
            else if (/调用太频繁/.test(text)) hint = '这是工作台自己的限速(可在设置 → 实验室调整)。';
            sess.msgs.push({ role: 'assistant', text: '⚠️ ' + text + (hint ? '\n\n' + hint : ''), at: Date.now() });
        } finally {
            ABORT = null;
            toggleBusy(false);
            sess.msgs.forEach(function (m) { if (m.streaming) m.streaming = false; });
            saveSessions(true);
            renderSessions();
            renderChat();
            scrollBottom();
            var inChars = 0, outChars = 0;
            sess.msgs.slice(-6).forEach(function (m) {
                if (m.role === 'user') inChars += String(m.text || '').length;
                if (m.role === 'assistant') outChars += String(m.text || '').length;
            });
            try { HOST.recordUsage(SP.id, inChars, outChars); } catch (e) { }
            toolCountTip(0);
        }
    }

    function onSend() {
        if (BUSY) return;
        var text = (els.input.value || '').trim();
        if (!text && !pendingImgs.length) return;
        var sess = activeSession();
        if (!sess) sess = createSession(true);
        var imgs = pendingImgs.slice();
        pendingImgs = [];
        renderAttach();
        sess.msgs.push({ role: 'user', text: text || '(见图片)', imgs: imgs, at: Date.now() });
        sess.updatedAt = Date.now();
        updateTitleFromMsg(sess, text);
        els.input.value = '';
        autoGrow();
        saveSessions(true);
        renderSessions();
        renderChat();
        scrollBottom(true);
        runAgent(sess);
    }

    /* ============================================================
       新建空间的起步项目
       工作台版新建空间时用这份三文件起步页(而不是整站副本):
       AI 改一个 20KB 的 app.js 很轻松,改 2 万行的 mysw-core.js 不现实。
       经典版仍可继续用「MySW 完整副本」模板,两版各有各的用途。
 */
    function starterFiles() {
        var index = [
            '<!DOCTYPE html>',
            '<html lang="zh-CN">',
            '<head>',
            '  <meta charset="UTF-8">',
            '  <meta name="viewport" content="width=device-width, initial-scale=1.0">',
            '  <title>我的空间</title>',
            '  <link rel="stylesheet" href="style.css">',
            '</head>',
            '<body>',
            '  <main class="card">',
            '    <h1>👋 这里是我的空间</h1>',
            '    <p>这是工作台生成的起步页。告诉 AI 你想改成什么样,它会直接改这些文件。</p>',
            '    <button id="ping" class="btn">点我一下</button>',
            '    <p id="out" class="out"></p>',
            '  </main>',
            '  <script src="app.js"><\/script>',
            '</body>',
            '</html>'
        ].join('\n');
        var css = [
            ':root{ --gold:#d8b978; --ink:#15171d; }',
            '*{box-sizing:border-box}',
            'body{margin:0;min-height:100vh;display:grid;place-items:center;background:radial-gradient(900px 600px at 20% 0%,#23262f,var(--ink));',
            '  color:#e8eaf0;font-family:system-ui,-apple-system,"Noto Sans SC",sans-serif}',
            '.card{max-width:520px;padding:32px;border-radius:16px;background:rgba(255,255,255,.04);',
            '  border:1px solid rgba(255,255,255,.09);line-height:1.75}',
            'h1{font-size:20px;margin:0 0 10px;color:var(--gold)}',
            '.btn{margin-top:8px;padding:9px 18px;border:0;border-radius:10px;cursor:pointer;font-weight:600;',
            '  background:linear-gradient(180deg,#f0d79b,#d8b978);color:#241b06}',
            '.out{min-height:1.5em;color:#a9aeba;font-size:14px}'
        ].join('\n');
        var js = [
            "// 这个文件运行在空间页面里,可以直接操作 DOM。",
            "var n = 0;",
            "document.getElementById('ping').addEventListener('click', function () {",
            "  n++;",
            "  document.getElementById('out').textContent = '你点了 ' + n + ' 次。让 AI 把它做得更有意思吧。';",
            "});"
        ].join('\n');
        return { 'index.html': index, 'style.css': css, 'app.js': js };
    }

    /* ============================================================
       设置弹窗
 */
    function updateModelChip() {
        var chip = $('usb-model');
        var text = $('usb-model-text');
        if (!chip || !text) return;
        var name = '未配置模型';
        try {
            var api = HOST.getApi();
            name = api.model || api.modelName || '未命名模型';
        } catch (e) {
            chip.classList.add('bad');
            name = '未配置 API';
        }
        text.textContent = name;
        chip.title = '模型由主站「设置 → AI 配置」统一管理';
    }

    function openCfg() {
        var ovl = $('usb-cfg-ovl');
        if (!ovl) return;
        var modelBox = $('usb-cfg-model');
        try { var api = HOST.getApi(); modelBox.value = (api.model || api.modelName || '') + ' @ ' + (api.apiUrl || ''); }
        catch (e) { modelBox.value = '未配置(请先到主站「设置 → AI 配置」填写)'; }
        $('usb-cfg-mode').value = CFG.mode;
        $('usb-cfg-rounds').value = CFG.maxRounds;
        $('usb-cfg-turns').value = CFG.maxTurns;
        $('usb-cfg-stream').checked = !!CFG.stream;
        $('usb-cfg-vision').checked = !!CFG.vision;
        ovl.classList.add('on');
    }
    function saveCfgFromModal() {
        var mode = $('usb-cfg-mode').value;
        CFG.mode = (mode === 'tools' || mode === 'text') ? mode : 'auto';
        CFG.maxRounds = Math.max(1, Math.min(60, parseInt($('usb-cfg-rounds').value, 10) || 12));
        CFG.maxTurns = Math.max(1, Math.min(60, parseInt($('usb-cfg-turns').value, 10) || 12));
        CFG.stream = !!$('usb-cfg-stream').checked;
        CFG.vision = !!$('usb-cfg-vision').checked;
        saveCfg();
        $('usb-cfg-ovl').classList.remove('on');
        tip('已保存', 'ri-check-line');
    }

    /* ============================================================
       挂载
 */
    async function mount(opts) {
        if (mounted) return;
        mounted = true;
        HOST = opts.host;
        SP = { id: opts.id, name: (opts.space && opts.space.name) || opts.id };
        ensureStyle();

        // 主站的那些「首访引导 / 语言选择」在空间页里不该出现
        try {
            document.body.classList.remove('mysw-us-pending');
            document.body.classList.add('mysw-us-mode');
            var picker = document.getElementById('si18n-picker');
            if (picker) picker.remove();
            var oldRoot = document.getElementById('mysw-us-root');
            if (oldRoot) oldRoot.remove();
        } catch (e) { }

        buildShell();
        loadCfg();
        loadSessions();

        var files = null;
        try { files = await HOST.loadFiles(SP.id); } catch (e) { }
        if (!files || typeof files !== 'object' || !Object.keys(files).length) {
            files = starterFiles();
            try { await HOST.saveFiles(SP.id, files); } catch (e) { }
        }
        FILES = files;
        renderFiles();
        renderSessions();
        renderChat();
        refreshPreview(true);
        updateModelChip();
        try { els.input.focus(); } catch (e) { }
    }

    window.MySWUserSpaceWB = {
        version: '1.0.0',
        mount: mount,
        starterFiles: starterFiles
    };

    // 通知 user-space.js:工作台版脚本已就位(空间页可能比本文件更早启动)
    try {
        document.dispatchEvent(new CustomEvent('mysw-us-wb-ready'));
        window.dispatchEvent(new CustomEvent('mysw-us-wb-ready'));
    } catch (e) { }

})();
