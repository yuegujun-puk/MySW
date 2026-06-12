// Service Worker for My SW - AI 角色聊天 PWA
// 提供离线缓存、资源预缓存和网络请求拦截功能

const CACHE_NAME = 'mysw-chat-cache-v1';
const STATIC_CACHE = 'mysw-static-v1';
const DYNAMIC_CACHE = 'mysw-dynamic-v1';

// 需要预缓存的静态资源
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/characters.js',
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
        return cache.addAll(STATIC_ASSETS);
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

function shouldBypassCache(request, url) {
  if (request.method !== 'GET') return true;
  if (url.pathname.includes('/api/')) return true;
  if (request.headers.has('authorization')) return true;
  if (request.cache === 'no-store' || request.cache === 'reload') return true;
  return false;
}

// 获取事件：网络优先，失败时回退到缓存
self.addEventListener('fetch', (event) => {
  const { request } = event;

  // 只处理 http/https 请求
  if (!isHttpRequest(request)) {
    return;
  }

  const url = new URL(request.url);

  // 对于 API、鉴权或显式禁用缓存的请求，使用网络优先且不写入 Cache Storage
  if (shouldBypassCache(request, url)) {
    event.respondWith(
      fetch(request)
        .then((response) => response)
        .catch(() => {
          // 网络失败时，如果是 POST 请求则返回错误
          if (request.method === 'POST') {
            return new Response(JSON.stringify({ error: 'Network error, please try again' }), {
              status: 503,
              headers: { 'Content-Type': 'application/json' }
            });
          }
          // 对于 GET 请求，尝试从缓存获取
          return caches.match(request);
        })
    );
    return;
  }

  // 对于静态资源，使用缓存优先策略
  event.respondWith(
    caches.match(request)
      .then((cachedResponse) => {
        if (cachedResponse) {
          console.log('[Service Worker] Serving from cache:', request.url);
          // 后台更新缓存
          fetchAndCache(request);
          return cachedResponse;
        }
        // 缓存未命中，使用网络
        return fetchAndCache(request);
      })
      .catch((error) => {
        console.error('[Service Worker] Fetch failed:', error);
        // 如果是导航请求，返回离线页面
        if (request.mode === 'navigate') {
          return caches.match('/index.html');
        }
        // 返回一个简单的离线提示
        return new Response('Offline - Resource not available', {
          status: 503,
          statusText: 'Service Unavailable'
        });
      })
  );
});

// 辅助函数：获取并缓存
async function fetchAndCache(request) {
  const response = await fetch(request);
  const url = new URL(request.url);
  // 只缓存成功的、非敏感 GET 响应
  if (response.ok && !shouldBypassCache(request, url)) {
    const cache = await caches.open(DYNAMIC_CACHE);
    cache.put(request, response.clone());
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
    clients.openWindow('/')
  );
});

console.log('[Service Worker] Service Worker loaded');
