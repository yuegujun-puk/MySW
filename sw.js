// Service Worker for My SW - AI 角色聊天 PWA
// 提供离线缓存、资源预缓存和网络请求拦截功能

const STATIC_CACHE = 'mysw-static-v2';
const DYNAMIC_CACHE = 'mysw-dynamic-v2';
const STATIC_EXTENSIONS = ['.html', '.js', '.css', '.json', '.png', '.jpg', '.jpeg', '.webp', '.svg', '.ico', '.woff', '.woff2'];

// 自动检测部署路径，支持子目录部署
const BASE_URL = self.location.pathname.replace(/\/sw\.js$/, '') || './';
function getAssetPath(path) {
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  return BASE_URL + (path.startsWith('./') ? path.slice(1) : path);
}

// 需要预缓存的静态资源
const STATIC_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './characters.js',
  './api.js',
  './memory.js',
  './knowledge.js',
  './chat.js',
  './settings.js',
  './memory-ui.js',
  './knowledge-ui.js',
  './main.js',
  './style.css',
  './advanced-features.js',
  './optimizations.js',
  './performance-fix.js',
  'https://cdn.jsdelivr.net/npm/remixicon@3.5.0/fonts/remixicon.css',
  'https://cdn.jsdelivr.net/npm/marked/marked.min.js',
  'https://cdn.jsdelivr.net/npm/dompurify@3.0.6/dist/purify.min.js',
  'https://cdn.jsdelivr.net/npm/highlight.js@11.9.0/styles/github-dark.min.css',
  'https://cdn.jsdelivr.net/npm/highlight.js@11.9.0/lib/core.min.js'
];

// 安装事件：预缓存静态资源
self.addEventListener('install', (event) => {
  console.log('[Service Worker] Installing...');
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => {
        console.log('[Service Worker] Pre-caching static assets');
        return cache.addAll(STATIC_ASSETS.map(getAssetPath));
      })
      .then(() => {
        console.log('[Service Worker] Installation complete, skipping waiting');
        return self.skipWaiting();
      })
      .catch((error) => {
        console.error('[Service Worker] Installation failed:', error);
      })
  );
});

// 激活事件：清理旧缓存
self.addEventListener('activate', (event) => {
  console.log('[Service Worker] Activating...');
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            if (cacheName !== STATIC_CACHE && cacheName !== DYNAMIC_CACHE) {
              console.log('[Service Worker] Deleting old cache:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      })
      .then(() => {
        console.log('[Service Worker] Activation complete, claiming clients');
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

// 获取事件：API 永远走网络；静态资源使用 stale-while-revalidate 动态缓存
self.addEventListener('fetch', (event) => {
  const { request } = event;

  if (!isHttpRequest(request)) return;

  const url = new URL(request.url);

  // API / 鉴权 / 非 GET 请求不读写 Cache Storage，确保对话与密钥相关请求始终实时走网络。
  if (isApiRequest(request, url) || request.cache === 'no-store') {
    event.respondWith(fetch(request));
    return;
  }

  if (isStaticRequest(request, url)) {
    event.respondWith(staleWhileRevalidate(request));
    return;
  }

  event.respondWith(networkFirstWithDynamicFallback(request));
});

async function networkFirstWithDynamicFallback(request) {
  try {
    return await fetchAndCacheStatic(request);
  } catch (error) {
    return (await caches.match(request)) || new Response('Offline - Resource not available', { status: 503, statusText: 'Service Unavailable' });
  }
}

// 辅助函数：获取并缓存
async function fetchAndCacheStatic(request) {
  const response = await fetch(request);
  const url = new URL(request.url);
  if (response.ok && !isApiRequest(request, url)) {
    const cache = await caches.open(DYNAMIC_CACHE);
    await cache.put(request, response.clone());
  }
  return response;
}

// 消息事件：处理来自页面的消息
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  
  if (event.data && event.data.type === 'CLEAR_CACHE') {
    event.waitUntil(
      caches.keys()
        .then((cacheNames) => Promise.all(
          cacheNames.map((cacheName) => {
            if (cacheName !== STATIC_CACHE) {
              return caches.delete(cacheName);
            }
          })
        ))
        .then(() => {
          if (event.ports && event.ports[0]) {
            event.ports[0].postMessage({ success: true, message: 'Cache cleared' });
          }
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
    icon: 'https://bbs-static.miyoushe.com/static/2026/03/10/5d88c416c7e2588575a518c3eb5899b9_5125423398751524747.jpg?x-oss-process=image/resize,s_150/quality,q_80/auto-orient,0/interlace,1/format,jpg',
    badge: 'https://bbs-static.miyoushe.com/static/2026/03/10/5d88c416c7e2588575a518c3eb5899b9_5125423398751524747.jpg?x-oss-process=image/resize,s_150/quality,q_80/auto-orient,0/interlace,1/format,jpg',
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
    clients.openWindow(BASE_URL || './')
  );
});

// 离线回退页面也使用相对路径
async function staleWhileRevalidate(request) {
  const cached = await caches.match(request);
  const networkPromise = fetchAndCacheStatic(request).catch((error) => {
    console.warn('[Service Worker] Background static refresh failed:', request.url, error);
    return null;
  });

  if (cached) {
    networkPromise.catch(() => null);
    return cached;
  }

  const networkResponse = await networkPromise;
  if (networkResponse) return networkResponse;

  if (request.mode === 'navigate') {
    return caches.match(getAssetPath('./index.html'));
  }

  return new Response('Offline - Resource not available', { status: 503, statusText: 'Service Unavailable' });
}

// 生产环境日志控制
const DEBUG = self.location.hostname === 'localhost' || self.location.hostname === '127.0.0.1';
const log = DEBUG ? console.log : () => {};
const warn = DEBUG ? console.warn : () => {};
const error = DEBUG ? console.error : () => {};

log('[Service Worker] Service Worker loaded');
