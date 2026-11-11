/* ========================================================================
   GAL 工作室 · 素材库
   —— 跨作品共用的图片 / 音频仓库，存在 IndexedDB 里。
   —— 为什么不放 localStorage：工程本身已经快把 5M 字符吃满了，
      一张 1080p 背景转 base64 就是 1MB 上下。素材库要能放几十张图，
      只有 IndexedDB 撑得住（浏览器给的是 GB 级配额）。
   —— 本文件只负责「存 / 取 / 转 URL」，不碰界面。
   ======================================================================== */
(function () {
    'use strict';

    var DB_NAME = 'MySW_GalLib';
    var STORE = 'assets';
    var DB_VER = 1;

    var dbPromise = null;
    var metaCache = null;          // id -> 元数据（不含 Blob）
    var urlCache = {};             // id -> { full, thumb }
    var allLoaded = false;

    // ---------------------------------------------------------------- 工具
    function uid() {
        return 'lg' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    }

    /* indexedDB.open 在某些情况下既不 success 也不 error：
       另一个标签页正开着旧版本库要升级（onblocked）、隐私模式、库文件损坏……
       原来这里没有超时，Promise 就永远挂着，调用方（比如「剧本转 GAL」）
       只能一直等 —— 表现就是「点了没反应」。 */
    var OPEN_TIMEOUT = 5000;
    var TX_TIMEOUT = 20000;

    function openDB() {
        if (dbPromise) return dbPromise;
        dbPromise = new Promise(function (resolve, reject) {
            if (!window.indexedDB) { reject(new Error('这个浏览器不支持 IndexedDB')); return; }
            var settled = false;
            var timer = setTimeout(function () {
                if (settled) return;
                settled = true;
                reject(new Error('素材库打开超时'));
            }, OPEN_TIMEOUT);

            function finish(fn, val) {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                fn(val);
            }

            var req;
            try { req = indexedDB.open(DB_NAME, DB_VER); } catch (e) { finish(reject, e); return; }
            req.onupgradeneeded = function () {
                var db = req.result;
                if (!db.objectStoreNames.contains(STORE)) {
                    var os = db.createObjectStore(STORE, { keyPath: 'id' });
                    os.createIndex('createdAt', 'createdAt');
                    os.createIndex('kind', 'kind');
                }
            };
            req.onsuccess = function () {
                var db = req.result;
                /* 别的标签页要升级库时把连接让出去，否则两边互锁，谁都读不出来。 */
                db.onversionchange = function () {
                    try { db.close(); } catch (e) { /* 忽略 */ }
                    dbPromise = null;
                };
                finish(resolve, db);
            };
            req.onerror = function () { finish(reject, req.error || new Error('素材库打不开')); };
            req.onblocked = function () { finish(reject, new Error('素材库被另一个标签页占用')); };
        });
        /* 失败不要缓存：可能是临时的（另一个标签页正在升级），下次点击要能重试。
           原来 dbPromise 一旦 reject 就被永久缓存，素材库这辈子都打不开了。 */
        dbPromise.catch(function () { dbPromise = null; });
        return dbPromise;
    }

    function tx(mode, fn) {
        return openDB().then(function (db) {
            return new Promise(function (resolve, reject) {
                var done = false;
                var timer = setTimeout(function () {
                    if (done) return;
                    done = true;
                    reject(new Error('素材库响应超时'));
                }, TX_TIMEOUT);
                function finish(fn, val) {
                    if (done) return;
                    done = true;
                    clearTimeout(timer);
                    fn(val);
                }
                var t;
                try { t = db.transaction(STORE, mode); } catch (e) {
                    /* 连接已被别的标签页升级关掉：清掉缓存，下次重新打开 */
                    dbPromise = null;
                    finish(reject, e);
                    return;
                }
                var os = t.objectStore(STORE);
                var out;
                try { out = fn(os); } catch (e) { finish(reject, e); return; }
                t.oncomplete = function () { finish(resolve, out && out.__req ? out.__req.result : out); };
                t.onerror = function () { finish(reject, t.error || new Error('素材库操作失败')); };
                t.onabort = function () { finish(reject, t.error || new Error('素材库操作被中断')); };
            });
        });
    }

    function req(r) { return { __req: r }; }

    // ---------------------------------------------------------------- 图片处理
    function loadImage(file) {
        return new Promise(function (resolve, reject) {
            var url = URL.createObjectURL(file);
            var img = new Image();
            img.onload = function () {
                URL.revokeObjectURL(url);
                resolve({ w: img.naturalWidth, h: img.naturalHeight, img: img });
            };
            img.onerror = function () {
                URL.revokeObjectURL(url);
                reject(new Error('这张图读不出来，可能已损坏'));
            };
            img.src = url;
        });
    }

    /* 缩略图：面板里一格一格显示用。原图动辄 3000px，几十张同时解码会把内存撑爆，
       所以另存一张 360px 的 jpg 小图，格子只认它。 */
    function makeThumb(img) {
        var maxEdge = 360;
        var scale = Math.min(1, maxEdge / Math.max(img.naturalWidth, img.naturalHeight));
        var w = Math.max(1, Math.round(img.naturalWidth * scale));
        var h = Math.max(1, Math.round(img.naturalHeight * scale));
        var cv = document.createElement('canvas');
        cv.width = w; cv.height = h;
        var ctx = cv.getContext('2d');
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, w, h);
        return new Promise(function (resolve) {
            cv.toBlob(function (b) { resolve(b); }, 'image/jpeg', 0.82);
        });
    }

    // ---------------------------------------------------------------- 缓存
    /* 同一时刻只读一次盘。素材库大起来（几十张背景图 = 上百 MB Blob）时，
       页面启动的 preload 和用户点「剧本转 GAL」触发的 list 会各读一遍全库，
       两次读取叠在一起会把主线程堵死 —— 用户看到的就是界面卡住、点了没反应。 */
    var metaPromise = null;

    function ensureMeta() {
        if (allLoaded && metaCache) return Promise.resolve(metaCache);
        if (metaCache && !allLoaded) return Promise.resolve(metaCache);
        if (metaPromise) return metaPromise;

        metaPromise = tx('readonly', function (os) { return req(os.getAll()); }).then(function (rows) {
            metaCache = {};
            (rows || []).forEach(function (r) {
                var c = urlCache[r.id] || (urlCache[r.id] = {});
                c.full = c.full || URL.createObjectURL(r.blob);
                if (r.thumb) c.thumb = c.thumb || URL.createObjectURL(r.thumb);
                metaCache[r.id] = stripBlob(r);
            });
            allLoaded = true;
            return metaCache;
        }).then(function (m) {
            metaPromise = null;
            return m;
        }, function (e) {
            metaPromise = null;
            throw e;
        });
        return metaPromise;
    }

    function stripBlob(r) {
        return {
            id: r.id,
            name: r.name,
            kind: r.kind,
            mime: r.mime,
            size: r.size,
            w: r.w || 0,
            h: r.h || 0,
            tags: r.tags || [],
            note: r.note || '',
            createdAt: r.createdAt || 0,
            updatedAt: r.updatedAt || 0
        };
    }

    function dropCache(id) {
        var c = urlCache[id];
        if (!c) return;
        try { if (c.full) URL.revokeObjectURL(c.full); } catch (e) { }
        try { if (c.thumb) URL.revokeObjectURL(c.thumb); } catch (e) { }
        delete urlCache[id];
    }

    // ---------------------------------------------------------------- 对外接口
    function list(kind) {
        return ensureMeta().then(function (m) {
            var arr = Object.keys(m).map(function (k) { return m[k]; });
            if (kind) arr = arr.filter(function (x) { return x.kind === kind; });
            arr.sort(function (a, b) { return (b.createdAt || 0) - (a.createdAt || 0); });
            return arr;
        });
    }

    function meta(id) {
        return ensureMeta().then(function (m) { return m[id] || null; });
    }

    /* 同步取 URL：只对已经预载过的素材有效（界面在 ready 之后渲染，所以够用） */
    function url(id) {
        var c = urlCache[id];
        return c && c.full ? c.full : '';
    }
    function thumb(id) {
        var c = urlCache[id];
        return c && (c.thumb || c.full) ? (c.thumb || c.full) : '';
    }

    function add(file, opts) {
        opts = opts || {};
        if (!file) return Promise.reject(new Error('没有选中文件'));
        var isImg = /^image\//.test(file.type);
        var isAudio = /^audio\//.test(file.type);
        if (!isImg && !isAudio) return Promise.reject(new Error('只支持图片和音频'));

        var prep = isImg
            ? loadImage(file).then(function (info) {
                return makeThumb(info.img).then(function (t) {
                    return { w: info.w, h: info.h, thumb: t };
                });
            })
            : Promise.resolve({ w: 0, h: 0, thumb: null });

        return prep.then(function (info) {
            var rec = {
                id: uid(),
                name: opts.name || file.name.replace(/\.[^.]+$/, '') || '未命名',
                kind: isImg ? 'image' : 'audio',
                mime: file.type || (isImg ? 'image/*' : 'audio/*'),
                size: file.size || 0,
                w: info.w,
                h: info.h,
                tags: Array.isArray(opts.tags) ? opts.tags : [],
                note: opts.note || '',
                createdAt: Date.now(),
                updatedAt: Date.now(),
                blob: file,
                thumb: info.thumb
            };
            return tx('readwrite', function (os) { return req(os.put(rec)); }).then(function () {
                if (metaCache) metaCache[rec.id] = stripBlob(rec);
                var c = urlCache[rec.id] || (urlCache[rec.id] = {});
                c.full = URL.createObjectURL(rec.blob);
                if (rec.thumb) c.thumb = URL.createObjectURL(rec.thumb);
                return stripBlob(rec);
            });
        });
    }

    function update(id, patch) {
        return tx('readwrite', function (os) {
            var g = os.get(id);
            g.onsuccess = function () {
                var rec = g.result;
                if (!rec) return;
                ['name', 'tags', 'note'].forEach(function (k) {
                    if (patch[k] !== undefined) rec[k] = patch[k];
                });
                rec.updatedAt = Date.now();
                os.put(rec);
            };
            return {};
        }).then(function () {
            if (metaCache && metaCache[id]) {
                ['name', 'tags', 'note'].forEach(function (k) {
                    if (patch[k] !== undefined) metaCache[id][k] = patch[k];
                });
                metaCache[id].updatedAt = Date.now();
            }
            return metaCache ? metaCache[id] : null;
        });
    }

    function remove(id) {
        return tx('readwrite', function (os) { return req(os.delete(id)); }).then(function () {
            if (metaCache) delete metaCache[id];
            dropCache(id);
            return true;
        });
    }

    function clearAll() {
        return tx('readwrite', function (os) { return req(os.clear()); }).then(function () {
            Object.keys(urlCache).forEach(dropCache);
            metaCache = {};
            allLoaded = true;
            return true;
        });
    }

    /* 导出用：Blob → dataURL。单文件 HTML 里没法带 objectURL。 */
    function dataUrl(id) {
        return tx('readonly', function (os) { return req(os.get(id)); }).then(function (rec) {
            if (!rec) return '';
            return new Promise(function (resolve) {
                var fr = new FileReader();
                fr.onload = function () { resolve(String(fr.result || '')); };
                fr.onerror = function () { resolve(''); };
                fr.readAsDataURL(rec.blob);
            });
        });
    }

    function preload() {
        return ensureMeta().then(function () { return true; });
    }

    function stats() {
        return ensureMeta().then(function (m) {
            var n = 0, bytes = 0, imgs = 0, auds = 0;
            Object.keys(m).forEach(function (k) {
                var x = m[k];
                n++; bytes += x.size || 0;
                if (x.kind === 'image') imgs++; else auds++;
            });
            return { count: n, bytes: bytes, images: imgs, audios: auds };
        });
    }

    /* 浏览器给这个源多少配额、已经用掉多少。用不了就返回 null，界面不显示。 */
    function quota() {
        if (!navigator.storage || !navigator.storage.estimate) return Promise.resolve(null);
        return navigator.storage.estimate().then(function (e) {
            if (!e || !e.quota) return null;
            return { usage: e.usage || 0, quota: e.quota };
        }).catch(function () { return null; });
    }

    window.GalLib = {
        ready: openDB,
        preload: preload,
        list: list,
        meta: meta,
        add: add,
        update: update,
        remove: remove,
        clear: clearAll,
        url: url,
        thumb: thumb,
        dataUrl: dataUrl,
        stats: stats,
        quota: quota
    };
})();
