// Service Worker for My SW - AI 角色聊天 PWA
// 提供离线缓存、资源预缓存和网络请求拦截功能

// 版本号必须随静态资源清单/代码变更而提升：activate 靠「名字不匹配就删」清旧缓存，
// 不升版会让用户一直吃 stale 缓存。
// STATIC 与 DYNAMIC 必须**一起**升：只升 STATIC 的话，旧的 dynamic 运行时缓存会被保留，
// 仍可能返回上一版的页面/接口副本。
// 逐版本的变更记录不再写进代码（此前堆了 126 条、占了本文件八成篇幅）。
const STATIC_CACHE = 'mysw-static-v206';
const DYNAMIC_CACHE = 'mysw-dynamic-v206';

const STATIC_EXTENSIONS = ['.html', '.js', '.css', '.json', '.png', '.jpg', '.jpeg', '.webp', '.svg', '.ico', '.woff', '.woff2'];

// 用 Service Worker 自身 URL 作为基准生成绝对地址，兼容根目录与任意子目录部署。
const SW_SCOPE_URL = new URL('./', self.location.href);
function getAssetPath(path) {
  return new URL(path, SW_SCOPE_URL).href;
}

// Service Worker 运行在独立作用域，**读不到页面的 localStorage**，
// 所以调试开关只能由页面通过 postMessage({type:'SW_DEBUG_CONFIG'}) 传进来
// （见 main.js 的 setServiceWorkerDebug）。本地开发默认开启，线上默认安静，
// 避免每次刷新都被 install/activate 日志刷屏。
// 说明：本仓库当前**没有**任何 UI 层的调试日志开关，原文件底部那个基于
// hostname 的 DEBUG 常量因为写在脚本末尾、又没人读取，实际上从未生效过。
let SW_DEBUG = /^localhost$|^127\.0\.0\.1$|\.local$/.test(self.location.hostname);

function log(...args) {
  if (!SW_DEBUG) return;
  console.log('[Service Worker]', ...args);
}

function logWarn(...args) {
  if (!SW_DEBUG) return;
  console.warn('[Service Worker]', ...args);
}

// 出错始终要可见（不受调试开关抑制），否则线上排障无从下手
function logError(...args) {
  console.error('[Service Worker]', ...args);
}

const OFFLINE_PAGE_HTML = `<!DOCTYPE html>
<html lang="zh-CN">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>离线 - My SW</title>
<style>body{background:#1a1a1a;color:#e0e0e0;font-family:system-ui,-apple-system,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:20px}
.container{text-align:center;max-width:420px}h1{font-size:1.5rem;margin-bottom:16px}p{line-height:1.6;margin-bottom:24px;color:#999}
button{background:#667eea;color:#fff;border:none;padding:12px 28px;border-radius:8px;cursor:pointer;font-size:1rem}</style></head>
<body><div class="container"><h1>😵 当前处于离线状态</h1>
<p>本页面无法从缓存中加载，请检查网络连接后重试。</p>
<button onclick="location.reload()">重试</button></div></body></html>`;

// 需要预缓存的静态资源
const STATIC_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  // 合并包：12 个必载 JS + 7 个 CSS 并入 mysw-core.*，39 个可选 JS 并入
  // mysw-extensions.js（script-loader 按「任一成员启用」注入），
  // 部署文件数从 80+ 降到 ~25，适配 Cloudflare Pages 等平台的文件数限制。
  // 接口协议适配层（必须在 mysw-core.js / mysw-pages.js 之前加载）
  // 内置表情包清单（崩铁 480 张，只有 URL+备注）：面板初始化即读，必须预缓存
  './sticker-builtin.js',
  './api-protocol.js',
  './mysw-core.js',
  './mysw-core.css',
  // 站点标识定制（设置 → 界面外观）：首屏就要生效，必须预缓存
  './brand-customize.js',
  // AI 属性调节器（设置 → AI 配置）：要在第一次发消息前就位，必须预缓存
  './ai-attributes.js',
  './mysw-extensions.js',
  // 用户代码空间·工作台版（可被「加载 JS 文件设置」单独关闭；关闭时空间页自动回退经典版）
  './user-space-workbench.js',
  // 变量与状态栏（可单独关闭；关闭后宏不展开、状态栏不显示）
  './chat-vars.js',
  // 星铁主题（index.html 在 mysw-core.css 之后引用）+ 其素材
  './sr-theme.css',
  './sr-assets/sr-bg-main.webp',
  './sr-assets/sr-bg-dialog.webp',
  // 角色卡市场新上架角色的头像。放本地而不是外链：
  // 米游社的图带 x-oss-process 参数会 400，外站图也会随时间失效。
  './sr-assets/cast/baiheng.jpg',
  './sr-assets/cast/mei.jpg',
  './sr-assets/cast/kallen.jpg',
  './sr-assets/cast/yuuka.jpg',
  './sr-assets/cast/feione.jpg',
  './sr-assets/cast/feiying.jpg',
  './sr-assets/cast/mortenax.jpg',
  './sr-assets/cast/aventurine.jpg',
  './sr-assets/cast/yaoguang.jpg',
  './sr-assets/cast/huohuo.jpg',
  './sr-assets/cast/misha.jpg',
  './sr-assets/cast/gallagher.jpg',
  './sr-assets/cast/sushang.jpg',
  './sr-assets/cast/qingque.jpg',
  './sr-assets/cast/iroha.jpg',
  './sr-assets/cast/walter_yang.jpg',
  './sr-assets/cast/zhenzhu.jpg',
  './sr-assets/cast/xunmengzhe.jpg',
  './sr-assets/cast/shixu.jpg',
  './sr-assets/cast/xinadiya_ren.jpg',
  './sr-assets/cast/xinadiya_shen.jpg',
  './sr-assets/cast/eden.jpg',
  './sr-assets/cast/aponia.jpg',
  './sr-assets/cast/xinyan.jpg',
  './sr-assets/cast/yuexia.jpg',
  './sr-assets/cast/deng.jpg',
  './sr-assets/cast/selimu.jpg',
  './sr-assets/cast/lisushang.jpg',
  './sr-assets/cast/suoming.jpg',
  './sr-assets/cast/xin.jpg',
  './sr-assets/cast/feixue.jpg',
  './sr-assets/cast/luhesi.jpg',
  './sr-assets/cast/shouanren.jpg',
  './sr-assets/cast/fuluoluo.jpg',
  './sr-assets/cast/chun.jpg',
  './sr-assets/cast/jingran.jpg',
  './sr-assets/cast/hifumi.jpg',
  './sr-assets/cast/chinatsu_ba.jpg',
  './sr-assets/cast/midori.jpg',
  './sr-assets/cast/momoi.jpg',
  './sr-assets/cast/serika.jpg',
  './sr-assets/cast/tsubaki.jpg',
  './sr-assets/cast/kazusa.jpg',
  './sr-assets/cast/koharu.jpg',
  './sr-assets/cast/koi.jpg',
  './sr-assets/cast/aris.jpg',
  './sr-assets/cast/hoshino.jpg',
  './sr-assets/cast/shiroko.jpg',
  './sr-assets/cast/nonomi.jpg',
  './sr-assets/cast/ayane.jpg',
    './sr-assets/cast/skia.jpg',
    './sr-assets/cast/aurelia.jpg',
    './sr-assets/cast/edgar.jpg',
    './sr-assets/cast/chaos.jpg',
    './sr-assets/cast/akane.jpg',
    './sr-assets/cast/blackbird.jpg',
    './sr-assets/cast/shinku.jpg',
    './sr-assets/cast/linko.jpg',
    './sr-assets/cast/elyms.jpg',
    './sr-assets/cast/exe.jpg',
  './sr-assets/cast/anhung.jpg',
  './sr-assets/cast/baizang.jpg',
  './sr-assets/cast/fadiya.jpg',
  './sr-assets/cast/zaowu.jpg',
  './sr-assets/cast/nanali.jpg',
  './sr-assets/cast/hasuoer.jpg',
  './sr-assets/cast/xun.jpg',
  './sr-assets/cast/jiuyuan.jpg',
  './sr-assets/cast/dafudier.jpg',
  './sr-assets/cast/canhong.jpg',
  './sr-assets/cast/xiaozhi.jpg',
  './sr-assets/cast/bohe.jpg',
  './sr-assets/cast/haniya.jpg',
  './sr-assets/cast/adele.jpg',
  './sr-assets/cast/yiluoyi.jpg',
  './sr-assets/cast/ling.jpg',
  // 战双帕弥什（16 张，来自库街区 wiki 机体立绘，裁成 256 方图）
  './sr-assets/cast/pns_ayla.jpg',
  './sr-assets/cast/pns_bianca.jpg',
  './sr-assets/cast/pns_camu.jpg',
  './sr-assets/cast/pns_chrome.jpg',
  './sr-assets/cast/pns_kamui.jpg',
  './sr-assets/cast/pns_karenina.jpg',
  './sr-assets/cast/pns_lee.jpg',
  './sr-assets/cast/pns_liv.jpg',
  './sr-assets/cast/pns_lucia.jpg',
  './sr-assets/cast/pns_luna.jpg',
  './sr-assets/cast/pns_nanami.jpg',
  './sr-assets/cast/pns_rosetta.jpg',
  './sr-assets/cast/pns_selena.jpg',
  './sr-assets/cast/pns_vera.jpg',
  './sr-assets/cast/pns_watanabe.jpg',
  './sr-assets/cast/pns_xxi.jpg',
  // 绝区零主题（只有深色版，纯 CSS 无素材）：主站 / 论坛 / 角色市场共用
  './zzz-theme.css',
  // 早期加载的独立脚本
  './i18n.js',
  './docs-en.js',
  './script-loader.js',
  './app-dialogs.js',
  // boot-splash.js 不预缓存：它可由「加载 JS 文件设置」关闭，预缓存会让
  // 关掉它的用户也被动下载；启用时首访即被运行时缓存（离线可用性不变）。
  // 角色卡市场货架目录（仅 1.7KB，必须预缓存保证货架永远在线）
  './character-market-data.js',
  // 子页面共享包（forum / character 页专用，主站不加载）
  './mysw-pages.js',
  // 弹窗拉板（forum / character / plugin-marketplace 页共用）
  './modal-resize.js',
  // defaultOff 的大体积脚本保持独立文件、不进预缓存：
  // forest-icefire.js / icefire-workshop.js / learn-tutor.js 勾选启用后
  // 首次访问走 fetch 拦截动态缓存，离线同样可用。
  './forum.html',
  './forum.css',
  './forum.js',
  './character.html',
  './character-market.css',
  './market.js',
  './legal.html',
  './docs.html',
  './docs.css',
  // GAL 工作室（视觉小说编辑器）：独立页面，导出功能只在本地跑
  './gal.html',
  './gal.css',
  './gal.js',
  './gal-library.js',
  './gal-ai.js',
  './plugin-marketplace.html',
  // 官网（official-site/ 子目录）：独立站点
  './official-site/index.html',
  './official-site/site.css',
  './official-site/site.js',
  './official-site/favicon.svg',
  './official-site/manifest.json',
  'https://cdn.jsdelivr.net/npm/remixicon@3.5.0/fonts/remixicon.css',
  // marked 必须与 index.html 引用的是同一份、且锁版本（不能是裸 latest）。
  'https://cdn.jsdelivr.net/npm/marked@12.0.2/marked.min.js',
  'https://cdn.jsdelivr.net/npm/dompurify@3.0.6/dist/purify.min.js',
  // jszip / highlight.min.js 可由「加载 JS 文件设置」关闭，故不进预缓存 ——
  // 预缓存等于替关掉它们的用户也下载一份。启用时首访即被运行时缓存
  // （script 资源走 networkFirstFresh → DYNAMIC_CACHE），离线可用性不变。
  // github-dark.min.css 是代码块配色、随页面始终加载，保留预缓存。
  'https://cdn.jsdelivr.net/npm/@highlightjs/cdn-assets@11.9.0/styles/github-dark.min.css'
]

// 安装事件：预缓存静态资源
self.addEventListener('install', (event) => {
  log('Installing...');
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => {
        log('Pre-caching static assets');
        // 原来用 cache.addAll()：它是**原子**的，清单里任意一个资源 404/超时
        // 就会整体 reject，结果是「一条都没缓存」。改为逐个缓存 + 汇总失败项，
        // 单个资源挂了不影响其余资源离线可用。
        return cacheEach(cache, STATIC_ASSETS.map(getAssetPath));
      })
      .then(() => {
        log('Installation complete, skipping waiting');
        return self.skipWaiting();
      })
      .catch((error) => {
        logError('Installation failed:', error);
      })
  );
});

async function cacheEach(cache, urls) {
  const results = await Promise.allSettled(urls.map(url => cache.add(url)));
  const failed = results
    .map((r, i) => (r.status === 'rejected' ? urls[i] : null))
    .filter(Boolean);
  if (failed.length) {
    // 失败必须可见，否则线上永远不知道哪些资源没进缓存
    logError(`预缓存失败 ${failed.length}/${urls.length} 项:`, failed);
  }
  return results;
}

// 激活事件：清理旧缓存
self.addEventListener('activate', (event) => {
  log('Activating...');
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            if (cacheName !== STATIC_CACHE && cacheName !== DYNAMIC_CACHE) {
              log('Deleting old cache:', cacheName);
              return caches.delete(cacheName);
            }
            return null;
          })
        );
      })
      .then(() => {
        log('Activation complete, claiming clients');
        return self.clients.claim();
      })
  );
});

function isHttpRequest(request) {
  return request.url.startsWith('http://') || request.url.startsWith('https://');
}

function isApiRequest(request, url) {
  if (request.method !== 'GET') return true;
  if (url.pathname.includes('/api/') || url.pathname.endsWith('/chat/completions') || url.pathname.endsWith('/embeddings')) return true;
  if (request.headers.has('authorization')) return true;
  if (request.headers.get('content-type')?.includes('application/json')) return true;
  return false;
}

function isStaticRequest(request, url) {
  if (request.mode === 'navigate') return true;
  if (request.destination) return ['document', 'script', 'style', 'image', 'font', 'manifest'].includes(request.destination);
  return STATIC_EXTENSIONS.some(ext => url.pathname.toLowerCase().endsWith(ext));
}

/**
 * 是不是「与本站无关的第三方跨域请求」。
 * cache.put() 会直接抛错 → 走到 offlineResponse → 页面拿到一个假的 503，
 * 真实的 CORS / 超时原因被完全掩盖，用户只看到「抓取失败」却无从下手。
 * 2) 就算能存，把抓来的第三方网页写进 DYNAMIC_CACHE 也是白占配额，
 */
const CDN_ALLOWED_HOSTS = ['cdn.jsdelivr.net', 'bbs-static.miyoushe.com'];

function isThirdPartyRequest(request, url) {
  if (url.origin === self.location.origin) return false;
  if (request.mode === 'navigate') return false;   // 整页跳转仍走离线兜底
  return !CDN_ALLOWED_HOSTS.includes(url.hostname);
}

// 获取事件：API 永远走网络；静态资源使用 stale-while-revalidate 动态缓存
self.addEventListener('fetch', (event) => {
  const { request } = event;

  if (!isHttpRequest(request)) return;

  // 整个 handler 必须保证「要么同步 respondWith，要么自己抛出去」。
  // 原实现在 new URL() 抛错（非法/特殊 URL）时会直接跳过 respondWith，
  // 导致该请求不被接管；而更隐蔽的问题是下面各分支的 Promise 若在
  // try/catch 覆盖范围之外 reject，请求会永久挂起而不是失败。
  try {
    const url = new URL(request.url);

    // 第三方跨域请求（知识库抓取网页、用户自填的图床等）完全不接管：
    // 既不缓存，也不把失败伪装成 503，让页面拿到浏览器的原生错误。
    // 详见 isThirdPartyRequest 的说明。
    if (isThirdPartyRequest(request, url)) return;

    // API / 鉴权 / 非 GET 请求不读写 Cache Storage，确保对话与密钥相关请求始终实时走网络。
    if (isApiRequest(request, url) || request.cache === 'no-store') {
      event.respondWith(fetch(request).catch(() => offlineResponse(request, 'API 请求失败')));
      return;
    }

    // 整页导航单独走兜底:网络失败时回退到缓存的 index.html,绝不让导航请求直接报错(ERR_FAILED)
    if (request.mode === 'navigate') {
      event.respondWith(navigateWithFallback(request));
      return;
    }

    if (isStaticRequest(request, url)) {
      event.respondWith(
        staleWhileRevalidate(request).catch(() => caches.match(request).then(r => r || offlineResponse(request)))
      );
      return;
    }

    event.respondWith(networkFirstWithDynamicFallback(request));
  } catch (error) {
    log('fetch 事件处理异常，交回浏览器默认处理:', error);
    // 注意：这里不能再调用 respondWith（可能已被调用过），
    // 只记录错误，让未接管的请求走浏览器默认行为。
  }
});

// 统一的离线兜底响应：页面导航给出离线页，其它资源给出 503 文本
// 整页导航:优先网络;网络失败则回退缓存的入口页(忽略查询参数,兼容 ?_mysw=...),再不行给离线页
async function navigateWithFallback(request) {
  try {
    return await fetch(request);
  } catch (error) {
    logWarn('Navigation fetch failed, falling back:', request.url, error);
    // 离线打开官网链接时不能回退成主站首页（那会让人以为官网变成了聊天界面），
    // 先按路径找官网页自己的缓存。
    const isOfficial = /\/official-site(\/|$)/.test(new URL(request.url).pathname);
    if (isOfficial) {
      const officialPage = await caches.match(getAssetPath('./official-site/index.html'), { ignoreSearch: true });
      if (officialPage) return officialPage;
    }
    const fallbackPage = await caches.match(getAssetPath('./index.html'), { ignoreSearch: true });
    return fallbackPage || offlineResponse(request);
  }
}

function offlineResponse(request, reason = 'Resource not available') {
  if (request.mode === 'navigate') {
    return new Response(OFFLINE_PAGE_HTML, { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  }
  return new Response(`Offline - ${reason}`, { status: 503, statusText: 'Service Unavailable' });
}

async function networkFirstWithDynamicFallback(request) {
  try {
    return await fetchAndCacheStatic(request);
  } catch (error) {
    const cached = await caches.match(request);
    return cached || offlineResponse(request);
  }
}

// 辅助函数：获取并缓存
async function fetchAndCacheStatic(request) {
  const response = await fetch(request);
  const url = new URL(request.url);
  if (response.ok && !isApiRequest(request, url)) {
    const cache = await caches.open(DYNAMIC_CACHE);
    try { await cache.put(request, response.clone()); } catch (error) { logWarn('Cache put failed:', request.url, error); }
  }
  return response;
}

// 消息事件：处理来自页面的消息
self.addEventListener('message', (event) => {
  if (!event.data || typeof event.data !== 'object') return;

  if (event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }

  // 页面把调试开关同步给 SW（见 main.js 的 setServiceWorkerDebug）
  if (event.data.type === 'SW_DEBUG_CONFIG') {
    SW_DEBUG = event.data.enabled === true;
    log('调试日志已', SW_DEBUG ? '开启' : '关闭');
  }
  if (event.data && event.data.type === 'CLEAR_CACHE') {
    // 默认仍只清动态缓存（其它入口可能只想丢掉运行中攒下的副本）。
    // 「设置 → 更多」的第 3、4 档会带 includeStatic：不删静态缓存的话，
    // 坏掉的旧页面会继续被离线缓存交回去，用户会觉得刷新没有效果。
    const includeStatic = event.data.includeStatic === true;
    const port = event.ports && event.ports[0];
    const done = (success, message) => {
      try { port?.postMessage?.({ success, message }); } catch (e) { /* 端口已关 */ }
    };
    event.waitUntil(
      caches.keys()
        .then((cacheNames) => Promise.all(
          cacheNames.map((cacheName) => {
            if (includeStatic || cacheName !== STATIC_CACHE) {
              log('Clearing cache:', cacheName);
              return caches.delete(cacheName);
            }
            return null;
          })
        ))
        .then(() => done(true, includeStatic ? 'All caches cleared' : 'Dynamic cache cleared'))
        .catch((error) => {
          logError('CLEAR_CACHE failed:', error);
          done(false, String(error && error.message || error));
        })
    );
  }
});

// 后台同步（如果支持）
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-messages') {
    event.waitUntil(
      // 这里可以添加消息同步逻辑
      Promise.resolve()
    );
  }
});

// 推送通知（如果支持）
self.addEventListener('push', (event) => {
  const options = {
    body: event.data ? event.data.text() : '新消息通知',
    icon: 'https://bbs-static.miyoushe.com/static/2026/08/11/8ca0cb781565d2bb8350054bc8c57191_5612658286973808923.png?x-oss-process=image/resize,s_150/quality,q_80/auto-orient,0/interlace,1/format,jpg',
    badge: 'https://bbs-static.miyoushe.com/static/2026/08/11/8ca0cb781565d2bb8350054bc8c57191_5612658286973808923.png?x-oss-process=image/resize,s_150/quality,q_80/auto-orient,0/interlace,1/format,jpg',
    vibrate: [100, 50, 100],
    data: {
      dateOfArrival: Date.now(),
      primaryKey: 1
    }
  };

  event.waitUntil(
    self.registration.showNotification('My SW - AI 角色聊天', options)
  );
});

// 通知点击事件
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.openWindow('./')
  );
});

// HTML 与脚本必须网络优先：手机浏览器的下拉刷新不会绕过 Service Worker，
// 先回缓存会把「界面错位、脚本报错打不开」的旧版本一直钉在用户设备上。
// 样式、字体、图片仍走 stale-while-revalidate，避免每次打开都重新下整套皮肤。
function mustStayFresh(request) {
  if (request.mode === 'navigate' || request.destination === 'document') return true;
  if (request.destination === 'script' || request.destination === 'style') return true;
  try {
    const path = new URL(request.url).pathname.toLowerCase();
    return path.endsWith('.html') || path.endsWith('.js') || path.endsWith('.css') || /\/$/.test(path);
  } catch (e) {
    return false;
  }
}

async function networkFirstFresh(request) {
  const cached = await caches.match(request);
  try {
    const response = await Promise.race([
      fetchAndCacheStatic(request),
      new Promise((_, reject) => setTimeout(() => reject(new Error('fresh-timeout')), 3000))
    ]);
    if (response) return response;
  } catch (error) {
    logWarn('Fresh fetch failed, falling back to cache:', request.url, error);
  }
  if (cached) return cached;
  if (request.mode === 'navigate') {
    const fallbackPage = await caches.match(getAssetPath('./index.html'));
    return fallbackPage || offlineResponse(request);
  }
  return offlineResponse(request);
}

// 静态资源：stale-while-revalidate（先给缓存，后台悄悄刷新）
async function staleWhileRevalidate(request) {
  if (mustStayFresh(request)) return networkFirstFresh(request);
  const cached = await caches.match(request);
  const networkPromise = fetchAndCacheStatic(request).catch((error) => {
    logWarn('Background static refresh failed:', request.url, error);
    return null;
  });

  if (cached) {
    networkPromise.catch(() => null);
    return cached;
  }

  const networkResponse = await networkPromise;
  if (networkResponse) return networkResponse;

  // 注意：caches.match 未命中时 resolve 为 undefined，
  // 而 respondWith(undefined) 会让请求直接失败并报晦涩错误，
  // 所以这里必须自己兜一层 offlineResponse。
  if (request.mode === 'navigate') {
    const fallbackPage = await caches.match(getAssetPath('./index.html'));
    return fallbackPage || offlineResponse(request);
  }

  return offlineResponse(request);
}

// 日志开关见文件顶部：SW 读不到页面 localStorage，由 SW_DEBUG_CONFIG 消息控制
log('Service Worker loaded');
