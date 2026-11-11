/**
 * My SW · 论坛（forum.js）
 * · 分区（板块）：发帖时可选分区，左侧栏/工具栏可按分区筛选；
 * · 搜索 + 多维度排序（最新回复 / 最新发布 / 热度 / 浏览 / 点赞）；
 * · 收藏（我的收藏）：收藏的帖子单独一个视图；
 * · 浏览数统计 + 楼主标识 + 楼层号（贴吧式阅读体验）；
 * · 楼中楼：评论可以回复某条评论，形成二级回复；
 * · 评论点赞；
 * · 「今日活跃榜」侧栏（按当天发帖/评论数统计）；
 * · 回到顶部悬浮按钮；
 * · 论坛数据导出 / 导入（换设备或备份）。
 * 数据仍保存在本机 localStorage 的 myswForumData 里，不涉及任何服务器。
 * 存储结构向后兼容：老数据缺少的新字段会在 load() 里自动补齐。
 */
(() => {
  'use strict';

  const KEY = 'myswForumData';
  const DM_ORDER_KEY = 'myswForumDmOrder_v1';
  const $ = s => document.querySelector(s);
  const $$ = s => Array.from(document.querySelectorAll(s));
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[c]));
  const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const num = (v, fallback = 0) => (Number.isFinite(Number(v)) ? Number(v) : fallback);

  /* 默认分区：发帖时可在这些板块里选，也用于侧栏/工具栏筛选 */
  const BOARDS = ['综合', '剧情讨论', '角色日常', '同人创作', '求助'];

  /* ------------------------------------------------------------
     个人信息 / 角色
 */
  function me() {
    let p = {};
    try { p = JSON.parse(localStorage.getItem('forumUserProfile') || '{}'); } catch (e) {}
    const birthday = p.birthday || '';
    /* 【BUG 修复】寿星酱头衔从未显示：生日存的是 <input type=date> 的完整日期
       （YYYY-MM-DD，带年份），而头衔应当「每年生日都亮」，所以只能比「月-日」。
       旧写法拿 "1990-05-20" 与 "05-20" 全等比较，永远为 false。
       today 同时从 UTC（toISOString）改为本地时区 —— 原来在东八区凌晨 0~8 点
       会被算成「昨天」，生日当大白天头衔也可能不亮 / 多亮一天。 */
    const now = new Date();
    const today = String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
    return {
      id: 'user',
      // 主项目把用户名写进 myUserName、头像写进 userAvatar（见 main.js）。
      // 旧代码读的 myDisplayName / myAvatar 从来没有任何地方写入，
      // 导致论坛里「我」的昵称恒为默认「我」、头像恒为空。
      name: p.name || localStorage.getItem('myUserName') || localStorage.getItem('myDisplayName') || '我',
      avatar: p.avatar || localStorage.getItem('userAvatar') || localStorage.getItem('myAvatar') || '',
      bio: p.bio || '',
      birthday,
      // 只取「月-日」参与比较：完整日期 slice(-5) 即 MM-DD；本来就只存了 MM-DD 时原样返回
      title: birthday.slice(-5) === today ? '寿星酱' : ''
    };
  }

  /* 「角色卡市场」加进来的预置角色：主站只把它们放进内存的 friendsData，
     论坛是独立页面读不到，于是名单里永远看不到它们（加完卡来论坛发现没人，很懵）。
     这里按 installedPresetCards 复原一份，读一次缓存住 —— 这份记录带完整人设，
     每次渲染都 parse 一遍会明显拖慢列表。 */
  let installedRolesCache = null;
  function installedRoles() {
    if (installedRolesCache) return installedRolesCache;
    const out = {};
    try {
      const cards = JSON.parse(localStorage.getItem('installedPresetCards') || '{}') || {};
      Object.entries(cards).forEach(([id, c]) => {
        if (!c || c.removed || !String(c.systemPrompt || '').trim()) return;
        out[id] = {
          id, name: c.name || id, avatar: c.avatar || '',
          systemPrompt: String(c.systemPrompt),
          welcomeMessage: String(c.welcomeMessage || ''),
          group: c.group || '游戏角色', isCustom: false, fromMarket: true,
          pack: c.pack || 'market'
        };
      });
    } catch (e) { /* 读不到就当没有，不影响内置角色 */ }
    installedRolesCache = out;
    return out;
  }

  function allRoles() {
    let custom = {};
    try { custom = JSON.parse(localStorage.getItem('customFriendsData') || '{}'); } catch (e) {}
    // 顺序即优先级：自定义 > 市场添加 > 内置
    return { ...(window.defaultFriendsData || {}), ...installedRoles(), ...custom };
  }

  function author(id) {
    if (id === 'user') return me();
    const r = allRoles()[id] || {};
    return { id, name: r.name || '未知角色', avatar: r.avatar || '', systemPrompt: r.systemPrompt || '' };
  }

  function activeRoles() {
    return Object.entries(db.roles)
      .filter(([, v]) => v.enabled)
      .map(([id, v]) => ({ id, ...v, ...author(id) }));
  }

  function canImage() {
    try { return JSON.parse(localStorage.getItem('visionSettings') || '{}').enabled === true; } catch (e) { return false; }
  }

  /* ------------------------------------------------------------
     存储
 */
  function load() {
    try {
      return JSON.parse(localStorage.getItem(KEY)) || {};
    } catch (e) {
      return {};
    }
  }

  const db = Object.assign({
    posts: [], roles: {}, follows: [], aiFollows: [], dms: [],
    silence: false, freeForum: false, bookmarks: [], boards: BOARDS
  }, load());

  db.posts = Array.isArray(db.posts) ? db.posts : [];
  db.roles = db.roles || {};
  db.follows = Array.isArray(db.follows) ? db.follows : [];
  db.aiFollows = Array.isArray(db.aiFollows) ? db.aiFollows : [];
  db.dms = Array.isArray(db.dms) ? db.dms : [];
  db.bookmarks = Array.isArray(db.bookmarks) ? db.bookmarks : [];
  db.boards = Array.isArray(db.boards) && db.boards.length ? db.boards : BOARDS;

  // 兼容旧数据：补齐帖子与评论的新字段
  let migrated = false;
  db.posts.forEach(p => {
    if (p.likes === undefined) { p.likes = 0; migrated = true; }
    if (!Array.isArray(p.comments)) { p.comments = []; migrated = true; }
    if (p.shares === undefined) { p.shares = 0; migrated = true; }
    if (p.views === undefined) { p.views = 0; migrated = true; }
    if (!Array.isArray(p.likedBy)) { p.likedBy = []; migrated = true; }
    if (!Array.isArray(p.sharedBy)) { p.sharedBy = []; migrated = true; }
    if (!Array.isArray(p.aiLikes)) { p.aiLikes = []; migrated = true; }
    if (!Array.isArray(p.floors)) { p.floors = []; migrated = true; }
    if (!p.board) { p.board = '综合'; migrated = true; }
    if (p.pinned === undefined) { p.pinned = false; migrated = true; }
    if (p.locked === undefined) { p.locked = false; migrated = true; }
    // 评论统一扁平存储（replyTo 指向父评论），渲染时再组织成楼中楼。
    p.comments = p.comments.map(c => ({
      likes: 0, likedBy: [], replyTo: null, floor: 0, ...c,
      likedBy: Array.isArray(c?.likedBy) ? c.likedBy : []
    }));
  });

  // 旧数据：此前已关注的论坛角色默认视为互关，并立即写回，避免刷新后互关状态丢失。
  db.follows = [...new Set(db.follows.filter(Boolean))];
  db.aiFollows = [...new Set(db.aiFollows.filter(Boolean))];
  db.follows.forEach(id => {
    if (!db.aiFollows.includes(id)) { db.aiFollows.push(id); migrated = true; }
  });
  db.bookmarks = [...new Set(db.bookmarks.filter(Boolean))];

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(db)); }
    catch (e) { toast('保存失败：浏览器存储空间可能已满'); }
  }
  if (migrated) save();

  function toast(t) {
    const el = $('#forum-toast');
    if (!el) return;
    el.textContent = t;
    el.classList.add('show-toast');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.remove('show-toast'), 2200);
  }

  function modal(title, html) {
    $('#modal-title').textContent = title;
    $('#modal-body').innerHTML = html;
    const box = $('#forum-modal');
    box.hidden = false;
    // 弹窗内容可能很长（如全部评论），打开后滚回顶部更符合预期
    box.querySelector('.forum-dialog').scrollTop = 0;
  }
  function close() { $('#forum-modal').hidden = true; }

  // 点击遮罩空白处关闭弹窗；弹窗内部的点击不会误关。
  let modalPointerOnBackdrop = false;
  $('#forum-modal')?.addEventListener('pointerdown', event => {
    modalPointerOnBackdrop = event.target === event.currentTarget;
    if (modalPointerOnBackdrop) { event.preventDefault(); close(); }
  });
  // 触屏拖动从弹窗内滑到遮罩上松开时用 click 兜底，只有按下与松开都在遮罩上才关闭，
  // 避免拖动选择文字时被误关。
  $('#forum-modal')?.addEventListener('click', event => {
    if (event.target === event.currentTarget && modalPointerOnBackdrop) close();
    modalPointerOnBackdrop = false;
  });

  /* ------------------------------------------------------------
     自定义界面字体（论坛与主界面共用）
 */
  const UI_FONT_KEY = 'myswUiFontData';
  const UI_FONT_NAME_KEY = 'myswUiFontName';
  function applyUiFont() {
    document.getElementById('mysw-custom-ui-font-style')?.remove();
    const fontData = localStorage.getItem(UI_FONT_KEY);
    // 安全：字体数据会被拼进 <style> 的 url("...") 中，只接受本页写入的 base64
    // data URL；否则 localStorage 被篡改后可逃逸引号、注入额外 CSS 规则。
    if (!fontData || !/^data:[a-z0-9.+-]+\/[a-z0-9.+-]+;base64,[a-z0-9+/=]+$/i.test(fontData)) return;
    const style = document.createElement('style');
    style.id = 'mysw-custom-ui-font-style';
    style.textContent = `@font-face{font-family:"MySWCustomUIFont";src:url("${fontData}") format("truetype");font-display:swap;} :root{--forum-font-family:"MySWCustomUIFont", Arial, "Microsoft Yahei", sans-serif;--font-family:"MySWCustomUIFont", Arial, "Microsoft Yahei", sans-serif;}`;
    document.head.appendChild(style);
  }

  function initForumFontSettings() {
    applyUiFont();
    const btn = $('#forum-font-btn');
    const input = $('#forum-font-upload');
    btn?.addEventListener('click', () => {
      const current = localStorage.getItem(UI_FONT_NAME_KEY) || '默认字体';
      modal('更改字体', `<p class="forum-tip">导入 .ttf 字体后，论坛和 My SW 主界面都会同步使用。字体只保存在本机浏览器。</p><p class="forum-tip">当前：${esc(current)}</p><div class="modal-actions"><button class="forum-secondary" id="forum-font-reset">恢复默认字体</button><button class="forum-primary" id="forum-font-select"><i class="ri-font-size"></i> 导入 TTF 字体</button></div>`);
      $('#forum-font-select').onclick = () => input?.click();
      $('#forum-font-reset').onclick = () => {
        localStorage.removeItem(UI_FONT_KEY);
        localStorage.removeItem(UI_FONT_NAME_KEY);
        document.getElementById('mysw-custom-ui-font-style')?.remove();
        close();
        toast('已恢复默认字体');
      };
    });
    input?.addEventListener('change', () => {
      const file = input.files?.[0];
      if (!file) return;
      if (!/\.ttf$/i.test(file.name)) { toast('请导入 .ttf 字体文件'); input.value = ''; return; }
      const reader = new FileReader();
      reader.onload = () => {
        try {
          localStorage.setItem(UI_FONT_KEY, reader.result);
          localStorage.setItem(UI_FONT_NAME_KEY, file.name);
          applyUiFont();
          close();
          toast('字体已更换，My SW 主界面也会同步使用');
        } catch (e) {
          console.error('保存字体失败', e);
          toast('字体文件过大，本地存储放不下');
        }
        input.value = '';
      };
      reader.onerror = () => toast('字体读取失败');
      reader.readAsDataURL(file);
    });
  }

  /* ------------------------------------------------------------
     工具：时间 / 排序 / 统计
 */
  function timeAgo(ts) {
    const diff = Date.now() - num(ts);
    if (diff < 60000) return '刚刚';
    if (diff < 3600000) return Math.floor(diff / 60000) + ' 分钟前';
    if (diff < 86400000) return Math.floor(diff / 3600000) + ' 小时前';
    if (diff < 2592000000) return Math.floor(diff / 86400000) + ' 天前';
    return new Date(num(ts)).toLocaleDateString();
  }

  const isToday = ts => {
    const d = new Date(num(ts));
    const now = new Date();
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
  };

  function commentCount(p) { return (p.comments || []).length; }
  function shareCount(p) { return num(p.shares); }
  function viewCount(p) { return num(p.views); }
  /** 最新回复时间：没有评论时退回发布时间 */
  function lastReplyAt(p) {
    let latest = num(p.time);
    (p.comments || []).forEach(c => { latest = Math.max(latest, num(c.time)); });
    return latest;
  }
  function hotScore(p) {
    // 热度 = 点赞 + 评论 × 2 + 浏览 × 0.06 + 转发 × 0.1，再叠加轻微的「新鲜度」加成。
    // 浏览与转发权重刻意压得很低，避免刷一下浏览就盖过真实的互动量。
    const base = num(p.likes) + commentCount(p) * 2 + viewCount(p) * 0.06 + shareCount(p) * 0.1;
    const hours = (Date.now() - num(p.time)) / 3600000;
    const freshness = hours < 24 ? (24 - hours) * 0.5 : 0;
    return base + freshness;
  }
  // 用户自己置顶的帖子永远在最前，其余按传入的比较方式排。
  function withPinned(list, compare) {
    const pinned = list.filter(p => p.pinned).sort(compare);
    const rest = list.filter(p => !p.pinned).sort(compare);
    return [...pinned, ...rest];
  }
  const sortHot = list => withPinned(list, (a, b) => hotScore(b) - hotScore(a) || num(b.time) - num(a.time));
  const sortNew = list => withPinned(list, (a, b) => lastReplyAt(b) - lastReplyAt(a));
  const sortPost = list => withPinned(list, (a, b) => num(b.time) - num(a.time));
  const sortViews = list => withPinned(list, (a, b) => viewCount(b) - viewCount(a) || num(b.time) - num(a.time));
  const sortLikes = list => withPinned(list, (a, b) => num(b.likes) - num(a.likes) || num(b.time) - num(a.time));

  /**
   * 推荐排序（feed 视图专用）：与热门榜、最新回复都区分开。
   * 热度打底，但新鲜度窗口更大权重更高（72h）、关注的作者有固定加成，
   * 再混入一点基于帖子 id 的稳定伪随机「探索」——同一批帖子每次进入
   * 页面顺序会略有不同（像刷推荐），但同一次渲染内顺序稳定不跳动。
   */
  function idJitter(id) {
    let h = 0;
    const str = String(id || '');
    for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
    return (h % 100) / 100 * 4;   // 0 ~ 4 分的稳定扰动
  }
  function recommendScore(p) {
    const base = num(p.likes) + commentCount(p) * 2 + viewCount(p) * 0.06 + shareCount(p) * 0.1;
    const hours = (Date.now() - num(p.time)) / 3600000;
    const freshness = hours < 72 ? (72 - hours) * 0.8 : 0;
    const followBonus = db.follows.includes(p.authorId) ? 6 : 0;
    return base + freshness + followBonus + idJitter(p.id);
  }
  const sortRecommend = list => withPinned(list, (a, b) => recommendScore(b) - recommendScore(a) || num(b.time) - num(a.time));

  const SORTS = { new: sortNew, post: sortPost, hot: sortHot, views: sortViews, likes: sortLikes };

  function recordShare(p, by) {
    if (!p) return;
    p.shares = num(p.shares) + 1;
    if (by) {
      p.sharedBy = Array.isArray(p.sharedBy) ? p.sharedBy : [];
      p.sharedBy.push({ by, time: Date.now() });
    }
  }
  function addView(p) {
    if (!p) return;
    p.views = num(p.views) + 1;
    save();
  }

  function uniqueIds(ids) { return [...new Set((ids || []).filter(Boolean))]; }
  function roleList(ids) { return uniqueIds(ids).map(id => author(id)).filter(a => a && a.id); }

  function followingIdsOf(id) {
    if (id === 'user') return uniqueIds(db.follows);
    // aiFollows 表示「该 AI 已关注用户」，所以查看 AI 主页时它的关注列表应含用户。
    return db.aiFollows.includes(id) ? ['user'] : [];
  }
  function followerIdsOf(id) {
    if (id === 'user') return uniqueIds(db.aiFollows);
    return db.follows.includes(id) ? ['user'] : [];
  }
  function followButtonHtml(id) {
    if (id === 'user') return '';
    const followed = db.follows.includes(id);
    return `<button class="forum-secondary profile-follow" data-follow="${esc(id)}"><i class="ri-user-${followed ? 'follow' : 'add'}-line"></i> ${followed ? '已关注' : '关注'}</button>`;
  }
  function showUserList(title, ids, emptyText = '暂无数据') {
    const users = roleList(ids);
    modal(title, users.length
      ? `<div class="profile-user-list">${users.map(u => `<button class="profile-user-row" data-profile="${esc(u.id)}"><img src="${esc(u.avatar)}" alt=""><span><b>${esc(u.name)}</b><small>${u.id === 'user' ? '用户' : (db.follows.includes(u.id) && db.aiFollows.includes(u.id) ? '已互关' : '论坛角色')}</small></span></button>`).join('')}</div>`
      : `<div class="empty">${esc(emptyText)}</div>`);
  }

  /* ------------------------------------------------------------
     过滤：搜索 + 分区
 */
  const filterState = { keyword: '', board: 'all', sort: 'new', sortTouched: false };

  /** 工具栏的筛选/排序只在「列表类」视图里有效；私信与主页没有工具栏，
      改动筛选时应退回 feed，否则会出现「改了筛选却没反应」的错觉。 */
  function listViewOr(fallback = 'feed') {
    const view = window.currentView;
    return (view === 'messages' || view === 'profile') ? fallback : (view || fallback);
  }

  function currentBoardOf(p) { return p.board || '综合'; }

  function applyFilter(list) {
    const kw = filterState.keyword.trim().toLowerCase();
    return list.filter(p => {
      if (filterState.board !== 'all' && currentBoardOf(p) !== filterState.board) return false;
      if (!kw) return true;
      const a = author(p.authorId);
      return String(p.title || '').toLowerCase().includes(kw)
        || String(p.content || '').toLowerCase().includes(kw)
        || String(a.name || '').toLowerCase().includes(kw)
        || currentBoardOf(p).toLowerCase().includes(kw);
    });
  }

  /* ------------------------------------------------------------
     帖子卡片
 */
  function renderPostCard(p, options = {}) {
    const a = author(p.authorId);
    const liked = (p.likedBy || []).includes('user');
    const bookmarked = db.bookmarks.includes(p.id);
    const preview = options.preview !== false;
    return `<article class="post-card post-preview" data-open-post="${p.id}">
      <div class="post-author">
        <img class="profile-link" data-profile="${esc(p.authorId)}" src="${esc(a.avatar)}" alt="">
        <div class="pa-main">
          <b><span class="profile-link link-text" data-profile="${esc(p.authorId)}">${esc(a.name)}</span>${a.title ? ' <span class="birthday-title">' + esc(a.title) + '</span>' : ''}${p.pinned ? ' <span class="forum-tag pin-tag"><i class="ri-pushpin-2-fill"></i>置顶</span>' : ''}${p.locked ? ' <span class="forum-tag lock-tag"><i class="ri-lock-line"></i>已锁</span>' : ''}</b>
          <small>${a.id === 'user' ? '用户' : '论坛角色'} · ${timeAgo(p.time)} · <span class="forum-tag board-tag">${esc(currentBoardOf(p))}</span>${p.authorId === 'user' ? ' <span class="forum-tag owner-tag">楼主</span>' : ''}</small>
        </div>
      </div>
      <h2>${esc(p.title)}</h2>
      <div class="post-text${preview ? ' post-clamp' : ''}">${esc(p.content)}</div>
      ${p.image ? `<img class="post-image" src="${esc(p.image)}" alt="帖子图片">` : ''}
      <div class="post-meta-line">
        <span><i class="ri-eye-line"></i> ${viewCount(p)}</span>
        <span><i class="ri-chat-3-line"></i> ${commentCount(p)}</span>
        <span><i class="ri-time-line"></i> 最后回复 ${timeAgo(lastReplyAt(p))}</span>
      </div>
      <div class="post-actions">
        <button class="${liked ? 'liked' : ''}" data-like="${p.id}" title="点赞"><i class="ri-heart-${liked ? '3-fill' : '3-line'}"></i> ${num(p.likes)}</button>
        <button data-comment="${p.id}" title="评论"><i class="ri-chat-3-line"></i> ${commentCount(p)}</button>
        <button class="${bookmarked ? 'bookmarked' : ''}" data-bookmark="${p.id}" title="收藏"><i class="ri-bookmark-${bookmarked ? 'fill' : 'line'}"></i> ${bookmarked ? '已收藏' : '收藏'}</button>
        ${p.authorId !== 'user' ? `<button data-follow="${p.authorId}"><i class="ri-user-${db.follows.includes(p.authorId) ? 'follow' : 'add'}-line"></i> ${db.follows.includes(p.authorId) ? '已关注' : '关注'}</button>` : ''}
        <button data-share="${p.id}"><i class="ri-share-forward-line"></i> 分享 ${shareCount(p)}</button>
        ${p.authorId === 'user' ? `
          <button data-pin-post="${p.id}"><i class="ri-pushpin-${p.pinned ? 'fill' : 'line'}"></i> ${p.pinned ? '取消置顶' : '置顶'}</button>
          <button class="post-delete" data-delete-post="${p.id}" title="删除帖子"><i class="ri-delete-bin-line"></i> 删除</button>` : ''}
      </div>
    </article>`;
  }

  /** 单体评论渲染（含楼中楼子树） */
  function renderComment(c, postAuthorId, floor, childrenOf, depth = 0) {
    const u = author(c.authorId);
    const liked = (c.likedBy || []).includes('user');
    const kids = childrenOf(c.id) || [];
    const isOwner = c.authorId === postAuthorId;
    return `<div class="comment${depth ? ' comment-nested' : ''}" data-comment-id="${esc(c.id)}">
      <img class="profile-link" data-profile="${esc(c.authorId)}" src="${esc(u.avatar)}" alt="">
      <div class="comment-body">
        <div class="comment-head">
          <b class="profile-link link-text" data-profile="${esc(c.authorId)}">${esc(u.name)}</b>
          ${u.title ? `<span class="birthday-title">${esc(u.title)}</span>` : ''}
          ${isOwner ? '<span class="forum-tag owner-tag">楼主</span>' : ''}
          ${floor ? `<span class="floor-tag">${floor} 楼</span>` : '<span class="floor-tag">楼中楼</span>'}
          <small>${timeAgo(c.time)}${c.editedAt ? ' · 已编辑' : ''}</small>
        </div>
        <div class="comment-text">${esc(c.content)}${c.image ? `<br><img class="post-image" src="${esc(c.image)}" alt="评论图片">` : ''}</div>
        <div class="comment-actions">
          <button class="${liked ? 'liked' : ''}" data-like-comment="${esc(c.id)}"><i class="ri-thumb-up-${liked ? 'fill' : 'line'}"></i> ${num(c.likes)}</button>
          <button data-reply-comment="${esc(c.id)}" data-reply-post="${esc(c.postId || '')}"><i class="ri-reply-line"></i> 回复</button>
          ${c.authorId === 'user' ? `<button class="comment-delete" data-delete-comment="${esc(c.id)}"><i class="ri-delete-bin-line"></i> 删除</button>` : ''}
        </div>
        ${kids.length ? `<div class="comment-children">${kids.map(k => renderComment(k, postAuthorId, 0, childrenOf, depth + 1)).join('')}</div>` : ''}
      </div>
    </div>`;
  }

  function renderCommentsHtml(p) {
    const comments = p.comments || [];
    if (!comments.length) return '<p class="forum-tip">暂时还没有评论，来抢沙发吧。</p>';
    // 顶层评论按时间正序（贴吧习惯：1 楼、2 楼…），楼中楼挂在父评论下面。
    const tops = comments.filter(c => !c.replyTo).sort((a, b) => num(a.time) - num(b.time));
    const childrenOf = id => comments.filter(c => c.replyTo === id).sort((a, b) => num(a.time) - num(b.time));
    // 楼层号按「顶层评论的先后顺序」分配；有旧数据没存 floor 时也能正确显示。
    return tops.map((c, i) => renderComment(c, p.authorId, i + 1, childrenOf)).join('');
  }

  /**
   * @param {string} id 帖子 id
   * @param {object} [options] countView=false 时不计浏览数。
   *        点赞、收藏、发评论、关注之后都会重绘详情页，如果每次都 +1，
   *        浏览数会虚高得离谱，所以那些「原地刷新」的场景要显式关掉计数。
   */
  function postDetail(id, options = {}) {
    const p = db.posts.find(x => x.id === id);
    if (!p) { toast('帖子不存在或已被删除'); render(window.currentView || 'feed'); return; }
    if (options.countView !== false) addView(p);
    window.currentPostId = p.id;
    const a = author(p.authorId);
    const liked = (p.likedBy || []).includes('user');
    const bookmarked = db.bookmarks.includes(p.id);
    $('#forum-title').textContent = '帖子详情';
    $('#forum-subtitle').textContent = `${currentBoardOf(p)} · ${commentCount(p)} 条回复 · ${viewCount(p)} 次浏览`;
    $('#forum-content').innerHTML = `
      <div class="post-detail-toolbar">
        <button class="forum-ghost-btn" data-view="feed"><i class="ri-arrow-left-line"></i> 返回列表</button>
        <button class="forum-ghost-btn ${bookmarked ? 'on' : ''}" data-bookmark="${p.id}"><i class="ri-bookmark-${bookmarked ? 'fill' : 'line'}"></i> ${bookmarked ? '已收藏' : '收藏'}</button>
        ${p.authorId === 'user' ? `<button class="forum-ghost-btn" data-edit-post="${p.id}"><i class="ri-pencil-line"></i> 编辑</button>` : ''}
      </div>
      <article class="post-card post-detail">
        <div class="post-author">
          <img class="profile-link" data-profile="${esc(p.authorId)}" src="${esc(a.avatar)}" alt="">
          <div class="pa-main">
            <b><span class="profile-link link-text" data-profile="${esc(p.authorId)}">${esc(a.name)}</span>${a.title ? ' <span class="birthday-title">' + esc(a.title) + '</span>' : ''}${p.pinned ? ' <span class="forum-tag pin-tag"><i class="ri-pushpin-2-fill"></i>置顶</span>' : ''}${p.locked ? ' <span class="forum-tag lock-tag"><i class="ri-lock-line"></i>已锁</span>' : ''}</b>
            <small>${new Date(num(p.time)).toLocaleString()} · <span class="forum-tag board-tag">${esc(currentBoardOf(p))}</span> · 1 楼（楼主）</small>
          </div>
        </div>
        <h2>${esc(p.title)}</h2>
        <div class="post-text">${esc(p.content)}</div>
        ${p.image ? `<img class="post-image" src="${esc(p.image)}" alt="帖子图片">` : ''}
        <div class="post-actions">
          <button class="${liked ? 'liked' : ''}" data-like="${p.id}"><i class="ri-heart-${liked ? '3-fill' : '3-line'}"></i> ${num(p.likes)}</button>
          <button data-comment="${p.id}"><i class="ri-chat-3-line"></i> 回复</button>
          <button data-bookmark="${p.id}"><i class="ri-bookmark-${bookmarked ? 'fill' : 'line'}"></i> ${bookmarked ? '已收藏' : '收藏'}</button>
          <button data-share="${p.id}"><i class="ri-share-forward-line"></i> 分享 ${shareCount(p)}</button>
          <button data-refresh-post="${p.id}"><i class="ri-refresh-line"></i> 刷新</button>
          ${p.authorId === 'user' ? `<button class="post-delete" data-delete-post="${p.id}" title="删除帖子"><i class="ri-delete-bin-line"></i> 删除</button>` : ''}
        </div>
        <section class="comments">
          <h3><i class="ri-chat-3-line"></i> 全部回复 ${commentCount(p)}</h3>
          <div class="comment-composer">
            <textarea id="quick-comment" placeholder="写下你的回复，也可以 @ 角色…" rows="2"></textarea>
            <div class="comment-composer-actions">
              ${canImage() ? '<label class="dm-image" title="附带图片"><i class="ri-image-line"></i><input id="quick-comment-image" type="file" accept="image/*"></label>' : ''}
              <button class="forum-primary" data-send-comment="${p.id}"><i class="ri-send-plane-fill"></i> 回复</button>
            </div>
          </div>
          <div class="comment-list">${renderCommentsHtml(p)}</div>
        </section>
      </article>`;
    // 列表容器 .forum-feed 自己滚动（overflow-y:auto），所以要滚它而不是窗口。
    // 只有「新打开帖子」才回顶部；点赞 / 收藏 / 发评论 / 关注这类原地刷新
    // （countView === false）要保持用户当前的阅读位置，否则每点一下就跳回开头。
    if (options.countView !== false) scrollFeedToTop();
    updateFab();
  }

  /** 把主滚动容器（.forum-feed / #forum-content）滚回顶部；窄屏下退回滚窗口 */
  function scrollFeedToTop() {
    const feed = $('#forum-content');
    if (feed && feed.scrollHeight > feed.clientHeight) {
      feed.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  /* ------------------------------------------------------------
     列表渲染
 */
  function boardOptionsHtml(selected = 'all') {
    return [`<option value="all"${selected === 'all' ? ' selected' : ''}>全部分区</option>`]
      .concat(db.boards.map(b => `<option value="${esc(b)}"${selected === b ? ' selected' : ''}>${esc(b)}</option>`))
      .join('');
  }

  function renderToolbar() {
    const boardSel = $('#forum-board-select');
    if (boardSel) boardSel.innerHTML = boardOptionsHtml(filterState.board);
    const sortSel = $('#forum-sort-select');
    // renderToolbar 没有 view 参数（view 是 render() 的局部变量），
    // 直接读全局当前视图，否则这里会抛 ReferenceError: view is not defined
    if (sortSel) sortSel.value = (window.currentView === 'feed' && !filterState.sortTouched) ? 'recommend' : filterState.sort;
    const kw = $('#forum-search-input');
    if (kw && kw.value !== filterState.keyword) kw.value = filterState.keyword;
  }

  function renderActiveMini() {
    const host = $('#active-mini');
    if (!host) return;
    const score = new Map();
    const bump = (id, w) => {
      if (!id || id === 'user') return;
      score.set(id, (score.get(id) || 0) + w);
    };
    db.posts.forEach(p => {
      if (isToday(p.time)) bump(p.authorId, 3);
      (p.comments || []).forEach(c => bump(c.authorId, isToday(c.time) ? 2 : 0));
    });
    const top = [...score.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
    host.innerHTML = top.length
      ? top.map(([id, s], i) => {
        const a = author(id);
        return `<button class="active-item" data-profile="${esc(id)}"><em>${i + 1}</em><img src="${esc(a.avatar)}" alt=""><span>${esc(a.name)}</span><small>${s}</small></button>`;
      }).join('')
      : '<p class="forum-tip">今天还没有角色发帖或评论</p>';
  }

  function render(view = 'feed') {
    window.currentView = view;
    if (view === 'profile') { renderProfile('user'); return; }
    if (view === 'messages') { renderDM(); return; }

    const toolbar = $('#forum-toolbar');
    if (toolbar) toolbar.hidden = false;

    let list;
    if (view === 'bookmarks') list = db.posts.filter(p => db.bookmarks.includes(p.id));
    else if (view === 'following') list = db.posts.filter(p => db.follows.includes(p.authorId));
    else list = [...db.posts];

    const totalBefore = list.length;
    list = applyFilter(list);
    // 视图与排序的关系（此前热门榜主列表错用 filterState.sort，副标题说按热度、
    // 实际按最新回复排，导致「热门榜」和「推荐」看起来一模一样）：
    // · 热门帖子榜：强制热度排序，与右侧 hot-mini 同源；
    // · 推荐帖子：用户没有手动选过排序时走「推荐排序」（热度打底 + 关注加成 +
    //   更强的新鲜度 + 稳定随机探索），手动选了排序则尊重用户的选择；
    // · 其余视图：按工具栏排序。
    let sorter;
    if (view === 'hot') sorter = sortHot;
    else if (view === 'feed' && !filterState.sortTouched) sorter = sortRecommend;
    else sorter = SORTS[filterState.sort] || sortNew;
    list = sorter(list);

    const titles = { feed: '推荐帖子', hot: '热门帖子榜', following: '关注动态', bookmarks: '我的收藏', profile: '我的主页' };
    $('#forum-title').textContent = titles[view] || '推荐帖子';
    $('#forum-subtitle').textContent = view === 'hot'
      ? '按点赞、评论、浏览与少量转发的综合热度排序（转发权重很低）'
      : view === 'feed' && !filterState.sortTouched
        ? '推荐排序：热度打底、关注的作者优先、新鲜度加权，并混入少量随机探索（想按时间或热度看，用上方排序切换）'
        : view === 'following'
        ? '只看你关注的角色'
        : view === 'bookmarks'
          ? '你收藏的帖子都会出现在这里'
          : '本地保存，AI 内容由当前 API 配置生成';

    const tips = [];
    if (filterState.keyword) tips.push(`搜索「${esc(filterState.keyword)}」`);
    if (filterState.board !== 'all') tips.push(`分区「${esc(filterState.board)}」`);
    const tipHtml = tips.length ? `<div class="forum-filter-tip">筛选：${tips.join(' · ')}（共 ${list.length} / ${totalBefore} 条）<button class="forum-ghost-btn inline" data-clear-filter>清除</button></div>` : '';

    $('#forum-content').innerHTML = tipHtml + (list.length
      ? list.map(p => renderPostCard(p)).join('')
      : `<div class="empty">${view === 'bookmarks' ? '还没有收藏任何帖子。点帖子下方的「收藏」即可加入这里。' : '这里还没有内容。可以自己发帖，或让 AI 逛逛论坛。'}</div>`);

    $('#hot-mini').innerHTML = sortHot([...db.posts]).slice(0, 5)
      .map((p, i) => `<button class="hot-item" data-open-post="${esc(p.id)}"><em>${i + 1}</em> ${esc(p.title)} <small>🔥${hotScore(p).toFixed(1)}</small></button>`)
      .join('') || '<p class="forum-tip">暂无热门帖子</p>';

    renderActiveMini();
    renderToolbar();
    updateFab();
  }

  function updateFab() {
    const fab = $('#forum-fab-top');
    if (!fab) return;
    const feed = $('#forum-content');
    fab.hidden = !feed || feed.scrollTop < 320;
  }

  /* ------------------------------------------------------------
     发帖 / 编辑
 */
  /** 发帖/编辑共用的分区下拉；id 由调用方给，避免两个弹窗的字段串味 */
  function boardSelectHtml(id, value) {
    return `<select id="${id}">${db.boards.map(b => `<option value="${esc(b)}"${b === value ? ' selected' : ''}>${esc(b)}</option>`).join('')}</select>`;
  }

  function newPost() {
    const imageAllowed = canImage();
    modal('发布帖子', `
      <label>标题</label><input id="p-title" maxlength="70" placeholder="写一个标题">
      <label>分区</label>${boardSelectHtml('p-board', filterState.board !== 'all' ? filterState.board : db.boards[0])}
      <label>内容（可 @ 论坛角色）</label><textarea id="p-content" maxlength="4000" placeholder="分享此刻的想法…"></textarea>
      ${imageAllowed ? '<label>图片</label><input id="p-image" type="file" accept="image/*">' : '<p class="forum-tip">多模态视觉未开启，暂不能发布图片。</p>'}
      <div class="modal-actions"><button class="forum-secondary" data-close>取消</button><button class="forum-primary" id="publish">发布</button></div>`);
    $('#publish').onclick = async () => {
      const title = $('#p-title').value.trim();
      const content = $('#p-content').value.trim();
      if (!title || !content) { toast('标题和内容都不能为空'); return; }
      const board = $('#p-board')?.value || '综合';
      let image = '';
      const f = $('#p-image')?.files[0];
      if (f) image = await fileData(f);
      const post = {
        id: uid(), authorId: 'user', title, content, image, board,
        time: Date.now(), likes: 0, likedBy: [], comments: [], shares: 0,
        views: 0, pinned: false, locked: false
      };
      db.posts.unshift(post);
      save(); close(); render(window.currentView); maybeAiReply(content, post);
    };
  }

  function editPost(id) {
    const p = db.posts.find(x => x.id === id);
    if (!p) return;
    if (p.authorId !== 'user') { toast('只能编辑自己发布的帖子'); return; }
    modal('编辑帖子', `
      <label>标题</label><input id="e-title" maxlength="70" value="${esc(p.title)}">
      <label>分区</label>${boardSelectHtml('e-board', currentBoardOf(p))}
      <label>内容</label><textarea id="e-content" maxlength="4000">${esc(p.content)}</textarea>
      <div class="modal-actions"><button class="forum-secondary" data-close>取消</button><button class="forum-primary" id="save-post">保存修改</button></div>`);
    $('#save-post').onclick = () => {
      const title = $('#e-title').value.trim();
      const content = $('#e-content').value.trim();
      if (!title || !content) { toast('标题和内容都不能为空'); return; }
      p.title = title;
      p.content = content;
      // 只认本弹窗的 e-board，不去读发帖弹窗的 p-board（那个此刻可能不存在或带着旧值）
      p.board = $('#e-board')?.value || currentBoardOf(p);
      p.editedAt = Date.now();
      save(); close(); toast('帖子已更新'); postDetail(p.id, { countView: false });
    };
  }

  function fileData(f) {
    // 论坛图片（发帖、评论、私信、头像）与主界面共用同一套策略：
    // 「界面外观 → 不压缩图片」开启时原样保留；否则缩到 1280px 内并重编码。
    if (window.ImageTools?.compress) {
      return ImageTools.compress(f, 1280, 0.82).catch(() => new Promise((ok, no) => {
        const r = new FileReader();
        r.onload = () => ok(r.result);
        r.onerror = no;
        r.readAsDataURL(f);
      }));
    }
    return new Promise((ok, no) => {
      const r = new FileReader();
      r.onload = () => ok(r.result);
      r.onerror = no;
      r.readAsDataURL(f);
    });
  }

  /* ------------------------------------------------------------
     评论 / 楼中楼
 */
  function topLevelCount(p) { return (p.comments || []).filter(c => !c.replyTo).length; }

  function addComment(post, content, image, replyTo = null) {
    const comment = {
      id: uid(), authorId: 'user', content, image: image || '',
      time: Date.now(), likes: 0, likedBy: [], replyTo,
      floor: replyTo ? 0 : topLevelCount(post) + 1,
      postId: post.id
    };
    post.comments.push(comment);
    save();
    return comment;
  }

  function comment(id) {
    const p = db.posts.find(x => x.id === id);
    if (!p) return;
    if (p.locked) { toast('该帖已被锁定，无法继续回复'); return; }
    modal('回复帖子', `
      <p class="forum-tip">回复《${esc(p.title)}》</p>
      <textarea id="c-content" placeholder="写下你的回复，也可以 @ 角色" rows="4"></textarea>
      ${canImage() ? '<label>图片</label><input id="c-image" type="file" accept="image/*">' : ''}
      <div class="modal-actions"><button class="forum-secondary" data-close>取消</button><button class="forum-primary" id="send-comment">发送</button></div>`);
    $('#send-comment').onclick = async () => {
      const content = $('#c-content').value.trim();
      if (!content) { toast('回复不能为空'); return; }
      const f = $('#c-image')?.files[0];
      addComment(p, content, f ? await fileData(f) : '');
      close();
      postDetail(p.id, { countView: false });
      maybeAiReply(content, p);
      replyFromOtherAi(p, content);
    };
  }

  async function replyComment(commentId) {
    const posting = db.posts.find(p => (p.comments || []).some(c => c.id === commentId));
    if (!posting) return;
    const target = posting.comments.find(c => c.id === commentId);
    if (!target) return;
    if (posting.locked) { toast('该帖已被锁定，无法继续回复'); return; }
    const u = author(target.authorId);
    const content = await Dlg.prompt({
      title: `回复 ${u.name}`,
      message: '回复内容：',
      value: '',
      multiline: true,
      rows: 3,
      okText: '发送回复'
    });
    if (content === null) return;
    if (!content.trim()) { toast('回复不能为空'); return; }
    addComment(posting, content.trim(), '', commentId);
    toast('回复已发布');
    postDetail(posting.id, { countView: false });
    // 被回复的若是 AI 角色，让它补一句回应
    if (target.authorId !== 'user') maybeAiReply(content.trim(), posting, target.authorId);
  }

  function deleteComment(commentId) {
    const posting = db.posts.find(p => (p.comments || []).some(c => c.id === commentId));
    if (!posting) return;
    const target = posting.comments.find(c => c.id === commentId);
    if (!target || target.authorId !== 'user') { toast('只能删除自己的回复'); return; }
    // 删顶层评论时连同它下面的楼中楼一起删，避免出现悬空的孤立回复
    posting.comments = posting.comments.filter(c => c.id !== commentId && c.replyTo !== commentId);
    save();
    toast('回复已删除');
    postDetail(posting.id, { countView: false });
  }

  /* ------------------------------------------------------------
     AI 行为
 */
    /**
   * 论坛文本卫生（免费模型最容易在这里跑偏）
   * 三类常见问题：
   * 1. 把自己当成「AI 助手」或复述系统指令；
   * 2. 自我攻击 / 自我否定（把自己的角色设定当成别人吐槽）；
   * 3. 整段输出英文（论坛是中文社区）。
   * 这里统一做一次清洗 + 语言判定：明显跑偏的内容直接不发，
   * 发帖场景再给模型一次「只用中文重写」的机会。
   */
  function cleanForumText(raw) {
    let text = String(raw || '').trim();
    if (!text) return '';
    // 去掉 markdown 代码围栏 / 标题符号（论坛正文是纯文本）
    text = text.replace(/```[a-zA-Z]*\n?/g, '').replace(/```/g, '');
    text = text.replace(/^\s{0,3}#{1,6}\s*/gm, '');
    // 去掉包裹整体的大引号
    text = text.replace(/^["「『]+/, '').replace(/["」』]+$/, '').trim();
    // 模型自曝身份 / 复述指令的痕迹：整条丢弃
    if (/(作为|我是)(一个)?\s*(AI|人工智能|语言模型|大模型)|language model|as an ai/i.test(text)) return '';
    return text;
  }

  /** 中文占比过低 = 明显在说英文（允许少量专有名词与表情） */
  function isMostlyForeign(text) {
    const s = String(text || '');
    const cjk = (s.match(/[\u4e00-\u9fff\u3400-\u4dbf]/g) || []).length;
    const latin = (s.match(/[A-Za-z]/g) || []).length;
    if (latin < 25) return false;
    return cjk < latin * 0.35;
  }

  /** 明显的「自己骂自己」：出现自我否定的句式 */
  function looksSelfDeprecating(text) {
    const t = String(text || '');
    return /(我是(个)?(废物|菜鸡|垃圾|傻子|蠢货|笑话)|我不配|我很失败|我很差|我这种人)/.test(t)
      || /我(真是|就是)(个)?(废物|菜鸡|垃圾|傻子)/.test(t);
  }

  async function aiCall(role, prompt, options) {
    const opts = options || {};
    // 角色提示词是懒加载的：让某个角色发言前，先确保它所在的分片已到位，
    // 否则会把「空设定」喂给模型，角色的语气会完全不认得。
    try { await window.CharacterPacks?.ensure?.(role.id); } catch (e) { /* 取不到就用已有内容 */ }
    if (!role.systemPrompt && window.CharacterPacks?.getPrompt) {
      try { role.systemPrompt = CharacterPacks.getPrompt(role.id) || ''; } catch (e) { /* 同上 */ }
    }
    let api = db.api || {};
    if (!api.apiUrl) {
      try { api = JSON.parse(localStorage.getItem('aiChatSettings') || '{}'); } catch (e) {}
    }
    if (!api.apiUrl || !api.apiKey || !api.modelName) { toast('请先在短信设置中配置 API'); return null; }

    // 私信与公共帖子的语境差别很大：私信里没有「当前帖子」，若沿用论坛那套
    // 「只聊当前帖子」的约束，模型会硬往某一篇帖子上靠，或者干脆答非所问。
    const dmMode = opts.mode === 'dm';
    const persona = role.systemPrompt
      ? `你的角色设定（必须严格遵守，不要跳出）：\n${String(role.systemPrompt).slice(0, 1600)}`
      : '';
    const system = dmMode ? [
      `你是「${role.name}」，正在和你关注的一位用户私信聊天。这不是发帖，也不是公开评论区。`,
      '你说的话必须符合这个角色的身份、语气与世界观，只以第一人称说话。',
      persona,
      '硬性要求：',
      '1. 只用简体中文输出（允许少量专有名词与角色原名），严禁整段英文；',
      '2. 像真人私聊：1~3 句，口语自然；不要解释、不要复述这些要求，不要出现「AI / 模型 / 提示词 / 系统 / 上下文」这类词；',
      '3. 不要用 Markdown 标题、代码块或编号列表；最多用 1 个表情或颜文字；',
      '4. 直接回应用户最后一条消息，对方问什么就答什么；',
      '5. 如果用户说的是刚分享给你的那篇帖子（问好不好看、有什么看法），就针对那篇帖子的标题、作者或正文内容谈你自己的看法，不要扯到别的帖子，也不要答非所问。'
    ].filter(Boolean).join('\n') : [
      `你是中文社区论坛里的普通用户「${role.name}」，正在一个类似贴吧的中文论坛里活动。`,
      '你说的每一句话都必须符合这个角色的身份、语气与世界观，只以第一人称发表你自己的看法。',
      persona,
      '硬性要求：',
      '1. 只用简体中文输出（允许少量专有名词），严禁整段英文；',
      '2. 像真人网友一样说话：不要解释、不要复述这些要求、不要出现「AI / 模型 / 提示词 / 系统」这类词；',
      '3. 不要用 Markdown 标题、代码块或编号列表；最多用 1~2 个表情或颜文字；',
      '4. 不要自称或描述自己（例如「我是xxx，我很差」），不要自我贬低，也不要否定自己的角色设定；',
      '5. 只聊与当前帖子/评论相关的内容，不要跑题、不要输出与主题无关的模板话。'
    ].filter(Boolean).join('\n');

    // AI 英文模式：论坛里也讲英文（english-mode.js 的规则声明最高优先级，覆盖上方「只用简体中文」）
    const enMode = !!(window.EnglishMode && window.EnglishMode.isScope('forum'));
    const systemFinal = (enMode && window.EnglishMode) ? window.EnglishMode.applyToSystem(system, 'forum') : system;

    const requestOnce = async (userContent) => {
      const url = window.ApiModule?.buildChatUrl(api.apiUrl);
      const data = await window.ApiModule.requestJson(url, window.ApiModule.createChatFetchOptions(api, [
        { role: 'system', content: systemFinal },
        { role: 'user', content: userContent }
      ], { max_tokens: 300 }));
      return data.choices?.[0]?.message?.content?.trim() || null;
    };

    try {
      let text = cleanForumText(await requestOnce(prompt));
      if (!text) return null;
      if (looksSelfDeprecating(text)) return null;
      if (!enMode && isMostlyForeign(text)) {
        // 免费模型偶尔整篇飙英文：发帖场景再给一次「只用中文重写」的机会；
        // （AI 英文模式开启时，英文输出正是目标结果，上面已跳过该判定）
        // 评论/回复场景直接不发，宁可不发也不发一段英文。
        if (!opts.retryChinese) return null;
        text = cleanForumText(await requestOnce(`${prompt}\n\n（注意：刚才的输出不是中文。请只用简体中文重新写一遍，不要解释。）`));
        if (!text || isMostlyForeign(text) || looksSelfDeprecating(text)) return null;
      }
      return text;
    } catch (e) {
      console.warn('论坛 AI 失败', e);
      toast('AI 请求失败，未发布任何错误内容');
      return null;
    }
  }

  function pickRole(predicate) {
    const roles = activeRoles().filter(r => r.activity > 0).filter(predicate || (() => true));
    if (!roles.length) return null;
    // 按活跃度加权随机：活跃度越高越容易出场，但不至于永远是同一个角色。
    const total = roles.reduce((s, r) => s + r.activity, 0);
    let roll = Math.random() * total;
    for (const r of roles) { roll -= r.activity; if (roll <= 0) return r; }
    return roles[roles.length - 1];
  }

  async function aiNow() {
    if (db.silence) return toast('肃静模式已开启');
    const role = pickRole();
    if (!role) return toast('请先在「论坛角色」选择角色');
    toast(`${role.name} 正在浏览论坛…`);
    const board = db.boards[Math.floor(Math.random() * db.boards.length)] || '综合';
    const content = await aiCall(role, `请为「${board}」分区发一条简短、有个人风格的论坛帖子，50~160字。可以带一点语气词，但不要标题党。`, { retryChinese: true });
    // aiCall 可能因为「输出不像中文 / 自我贬低」而主动丢弃结果。
    // 这时必须给一句反馈，否则用户看到的是「正在浏览论坛…」之后什么都没有。
    if (!content) return toast(`${role.name} 这次没想到要说什么，稍后再试试`);
    const post = {
      id: uid(), authorId: role.id, title: content.slice(0, 22) + (content.length > 22 ? '…' : ''),
      content, board, time: Date.now(), likes: 0, likedBy: [], comments: [], shares: 0,
      views: 0, pinned: false, locked: false
    };
    db.posts.unshift(post);
    save(); render(window.currentView); toast(`${role.name} 在「${board}」发布了帖子`);
    aiEngagePost(post, role.id);
  }

  async function aiShareNow() {
    if (db.silence) return toast('肃静模式已开启');
    const role = pickRole();
    if (!role) return toast('请先在「论坛角色」选择角色');
    if (!db.posts.length) return toast('暂无可分享的帖子');
    const candidates = sortHot([...db.posts]).filter(p => p.authorId !== role.id);
    const post = candidates[0] || db.posts[0];
    await aiSharePost(post, role, true);
  }

  async function aiSharePost(post, role, manual = false) {
    if (!post || !role || db.silence) return;
    const postAuthor = author(post.authorId);
    const reason = await aiCall(role, `你正在论坛里把一篇帖子分享给用户。帖子作者：${postAuthor.name}。标题：${post.title}。内容：${String(post.content || '').slice(0, 600)}。请用一到两句自然口吻说明为什么想分享给用户，不要复述太长。`);
    if (!reason) return;
    recordShare(post, role.id);
    db.dms.push({
      id: uid(), to: 'user', from: role.id, postId: post.id,
      content: `分享了一篇帖子：《${post.title}》\n${reason}\n\n${post.content}`,
      time: Date.now()
    });
    save();
    render(window.currentView);
    toast(`${role.name} 向你分享了一篇帖子`);
    if (manual) {
      $$('.forum-nav').forEach(x => x.classList.toggle('active', x.dataset.view === 'messages'));
      renderDM(role.id);
    }
  }

  async function maybeAiReply(text, post, preferRoleId) {
    if (db.silence) return;
    const mention = activeRoles().find(r => text.includes('@' + r.name));
    const role = preferRoleId
      ? activeRoles().find(r => r.id === preferRoleId)
      : mention;
    if (!role) return;
    if (!preferRoleId && role.activity < 5) return;
    const reply = await aiCall(role, preferRoleId
      ? `有用户在论坛里回复了你的发言：「${text.slice(0, 500)}」。请用一到两句自然回复，像论坛里接话那样。`
      : `有人在帖子中提到了你：${text.slice(0, 600)}。用一句到两句自然回复。`);
    if (!reply) return;
    post.comments.push({
      id: uid(), authorId: role.id, content: reply, time: Date.now(),
      likes: 0, likedBy: [], replyTo: null,
      floor: topLevelCount(post) + 1, postId: post.id
    });
    save();
    if (window.currentView === 'feed' || $('#forum-content')?.querySelector('.post-detail')) {
      // 用户正停在帖子详情页时直接刷新评论列表，否则只更新列表
      if ($('#forum-content')?.querySelector('.post-detail')) postDetail(post.id, { countView: false });
      else render(window.currentView);
    }
  }

  /** 用户评论后，随机让另一个角色也来凑热闹（贴吧的「群众回复」氛围） */
  async function replyFromOtherAi(post, userText) {
    if (db.silence || Math.random() > 0.35) return;
    const role = pickRole(r => r.id !== post.authorId && r.activity > 15);
    if (!role) return;
    const reply = await aiCall(role, `用户在论坛帖子《${post.title}》里说：${userText.slice(0, 400)}。请用一句自然的口吻跟帖回应，像普通论坛用户那样。`);
    if (!reply) return;
    post.comments.push({
      id: uid(), authorId: role.id, content: reply, time: Date.now(),
      likes: 0, likedBy: [], replyTo: null,
      floor: topLevelCount(post) + 1, postId: post.id
    });
    save();
    if ($('#forum-content')?.querySelector('.post-detail')) postDetail(post.id, { countView: false });
    else render(window.currentView);
  }

  function deletePost(id) {
    const post = db.posts.find(p => p.id === id);
    // 只允许删除用户本人发布的帖子，AI 角色内容不可由用户直接删除。
    if (!post || post.authorId !== 'user') { toast('只能删除自己发布的帖子'); return; }
    modal('删除帖子', `<p>确定要删除帖子《${esc(post.title)}》吗？</p><p class="forum-tip">删除后不可恢复，与该帖关联的分享私信也会一并移除。</p><div class="modal-actions"><button class="forum-secondary" data-close>取消</button><button class="forum-primary post-delete-confirm" id="confirm-delete-post"><i class="ri-delete-bin-line"></i> 确认删除</button></div>`);
    $('#confirm-delete-post').onclick = () => {
      db.posts = db.posts.filter(p => p.id !== id);
      // 清理指向已删除帖子的分享私信，避免出现无法打开的失效入口
      db.dms = db.dms.filter(m => m.postId !== id);
      db.bookmarks = db.bookmarks.filter(b => b !== id);
      save();
      close();
      render(window.currentView || 'feed');
      toast('帖子已删除');
    };
  }

  async function aiEngagePost(post, authorId) {
    if (db.silence || Math.random() > 0.3) return;
    const role = pickRole(r => r.id !== authorId && r.activity > 15);
    if (!role) return;
    post.likes = num(post.likes) + 1;
    post.aiLikes = post.aiLikes || [];
    post.aiLikes.push(role.id);
    if (Math.random() < 0.35) {
      const reply = await aiCall(role, `请对 ${author(post.authorId).name} 的论坛帖子作一句自然简短的评论：${String(post.content).slice(0, 500)}`);
      if (reply) {
        post.comments.push({
          id: uid(), authorId: role.id, content: reply, time: Date.now(),
          likes: 0, likedBy: [], replyTo: null,
          floor: topLevelCount(post) + 1, postId: post.id
        });
      }
    }
    if (Math.random() < 0.08) await aiSharePost(post, role);
    save();
    if (window.currentView !== 'messages') render(window.currentView);
  }

  async function freeForumTick() {
    if (db.silence || !db.freeForum) return;
    const role = pickRole();
    if (!role) return;
    if (Math.random() * 100 > role.activity) return;
    const latest = db.posts[0];
    if (latest && Math.random() < 0.6) {
      const dice = Math.random();
      if (dice < 0.14) {
        await aiSharePost(latest, role);
      } else if (dice < 0.5) {
        latest.likes = num(latest.likes) + 1;
        latest.aiLikes = latest.aiLikes || [];
        latest.aiLikes.push(role.id);
        save(); render(window.currentView);
      } else {
        const reply = await aiCall(role, `请对下面这条论坛帖子作一句自然简短的评论（像普通论坛用户那样）：${String(latest.content).slice(0, 400)}`);
        if (reply) {
          latest.comments.push({
            id: uid(), authorId: role.id, content: reply, time: Date.now(),
            likes: 0, likedBy: [], replyTo: null,
            floor: topLevelCount(latest) + 1, postId: latest.id
          });
          save(); render(window.currentView);
        }
      }
      return;
    }
    const board = db.boards[Math.floor(Math.random() * db.boards.length)] || '综合';
    const content = await aiCall(role, `请为「${board}」分区发布一条简短的、有角色个人风格的论坛帖子，50到160字。`, { retryChinese: true });
    if (content) {
      const post = {
        id: uid(), authorId: role.id, title: content.slice(0, 22) + (content.length > 22 ? '…' : ''),
        content, board, time: Date.now(), likes: 0, likedBy: [], comments: [], shares: 0,
        views: 0, pinned: false, locked: false
      };
      db.posts.unshift(post);
      save();
      if (window.currentView !== 'messages') render(window.currentView);
      aiEngagePost(post, role.id);
    }
  }

  function syncFreeForum() {
    clearInterval(window.forumFreeTimer);
    if (db.freeForum && !db.silence) window.forumFreeTimer = setInterval(freeForumTick, 90000);
  }

  /* ------------------------------------------------------------
     分享
 */
  /* 把帖子作为「分享卡片」写进主站当前聊天线程(threadManager_v2)。
     主站读同一份 localStorage 数据,渲染时识别 forumShare 字段并显示为可点击卡片。 */
  /* 主站把聊天记录存在 IndexedDB（完整）+ localStorage（镜像）。
     记录一大，镜像就被主站主动瘦身了 —— 只读 localStorage 会拿到「最近十几条」，
     卡片写进去也进不了权威数据，下次启动就没了。
     所以这里先读 IndexedDB 里的完整记录，读不到再退回 localStorage。 */
  // 本次会话确认过「主站还没建过库」：之后一律走 localStorage，
  // 免得每次 open 都造一个空壳再删（删除是异步的，下一次 open 又建一个）。
  let mainDbMissing = false;

  function idbOpenMain() {
    return new Promise(resolve => {
      if (mainDbMissing) { resolve(null); return; }
      let req;
      try { req = indexedDB.open('MySW_Storage'); } catch (e) { resolve(null); return; }
      req.onerror = () => resolve(null);
      req.onsuccess = () => {
        const db = req.result;
        try {
          if (!db.objectStoreNames.contains('keyvalue')) {
            /* 主站还没建过库：这次 open 只建出一个空壳（version 1、没有仓库）。
               千万别留着它 —— 主站之后用同一版本号打开不会触发 onupgradeneeded，
               「keyvalue」永远建不出来，整个 IndexedDB 存储就废了。
               删掉空壳，本次退回 localStorage。 */
            mainDbMissing = true;
            db.close();
            try { indexedDB.deleteDatabase('MySW_Storage'); } catch (e) {}
            resolve(null);
            return;
          }
          resolve(db);
        } catch (e) { try { db.close(); } catch (e2) {} resolve(null); }
      };
    });
  }

  function readFullThreads() {
    return idbOpenMain().then(db => new Promise(resolve => {
      if (!db) { resolve(null); return; }
      try {
        const req = db.transaction('keyvalue', 'readonly').objectStore('keyvalue').get('threadManager_v2');
        req.onsuccess = () => { const rec = req.result; try { db.close(); } catch (e) {} resolve(rec && rec.value ? rec.value : null); };
        req.onerror = () => { try { db.close(); } catch (e) {} resolve(null); };
      } catch (e) { try { db.close(); } catch (e2) {} resolve(null); }
    }));
  }

  function writeFullThreads(payload) {
    return idbOpenMain().then(db => new Promise(resolve => {
      if (!db) { resolve(false); return; }
      try {
        const tx = db.transaction('keyvalue', 'readwrite');
        tx.objectStore('keyvalue').put({ key: 'threadManager_v2', value: payload, timestamp: Date.now() });
        tx.oncomplete = () => { try { db.close(); } catch (e) {} resolve(true); };
        tx.onerror = () => { try { db.close(); } catch (e) {} resolve(false); };
      } catch (e) { try { db.close(); } catch (e2) {} resolve(false); }
    }));
  }

  async function shareToMainChat(p) {
    const KEY_T = 'threadManager_v2';
    let tm = {};
    const fullRaw = await readFullThreads();
    if (fullRaw) { try { tm = JSON.parse(fullRaw) || {}; } catch (e) { tm = {}; } }
    if (!tm || !Object.keys(tm).length) {
      try { tm = JSON.parse(localStorage.getItem(KEY_T) || '{}') || {}; } catch (e) { tm = {}; }
    }
    const fid = localStorage.getItem('lastChatId') || '';
    const fd = tm[fid];
    if (!fid || !fd || !Array.isArray(fd.threads) || !fd.threads.length) {
      toast('请先在主站打开一个聊天角色，再分享到聊天');
      return false;
    }
    const thread = fd.threads.find(t => t.id === fd.currentThreadId) || fd.threads[0];
    thread.messages = Array.isArray(thread.messages) ? thread.messages : [];
    const now = Date.now();
    thread.messages.push({
      id: now, role: 'mine', type: 'text', timestamp: now, isProactive: false,
      content: `分享了一篇论坛帖子:《${p.title}》`,
      forumShare: {
        postId: p.id, title: p.title, author: author(p.authorId).name,
        board: currentBoardOf(p), excerpt: String(p.content || '').replace(/\s+/g, ' ').slice(0, 80)
      }
    });
    thread.lastActive = now;
    const payload = JSON.stringify(tm);
    let localOk = true;
    try { localStorage.setItem(KEY_T, payload); } catch (e) { localOk = false; }
    // 完整版一定要落 IndexedDB：主站启动时以它为准
    const idbOk = await writeFullThreads(payload);
    if (!localOk && !idbOk) { toast('保存失败：本地存储空间不足'); return false; }
    // 只有 localStorage 写成功，主站那一侧才会收到 storage 事件、实时冒出卡片
    toast(localOk ? '已分享到主站聊天' : '已写入主站，切回去刷新一下就能看到');
    return true;
  }

  function share(id) {
    const p = db.posts.find(x => x.id === id);
    if (!p) return;
    const a = author(p.authorId);
    const roles = activeRoles().filter(r => db.follows.includes(r.id) && db.aiFollows.includes(r.id));
    const shareText = `分享了一篇帖子：《${p.title}》\n作者：${a.name}\n分区：${currentBoardOf(p)}\n${p.content}`;
    modal('分享帖子', `<p>分享 <b>${esc(a.name)}</b> 的帖子：</p>
      <label>私信分享给互关角色</label>
      <select id="share-target">${roles.length
        ? '<option value="">选择角色</option>' + roles.map(r => `<option value="${esc(r.id)}">${esc(r.name)}</option>`).join('')
        : '<option value="">暂无互关角色，先去关注一个</option>'}</select>
      <label>或复制链接文本</label>
      <textarea id="share-text" rows="4" readonly>${esc(shareText)}</textarea>
      <p class="forum-tip">热度榜会统计分享次数，但转发权重很低，不会盖过点赞和评论。</p>
      <div class="modal-actions"><button class="forum-secondary" id="copy-share">复制文案</button><button class="forum-secondary" id="share-main">分享到主站聊天</button><button class="forum-primary" id="share-dm">私信分享</button></div>`);
    $('#share-dm').onclick = () => {
      const to = $('#share-target').value;
      if (!to) { toast(roles.length ? '请选择要分享给谁' : '还没有互关角色，去角色主页点个关注'); return; }
      db.dms.push({ id: uid(), to, from: 'user', postId: p.id, content: shareText, time: Date.now() });
      recordShare(p, 'user');
      save(); close();
      // 分享完直接进这段私信：既看得到自己分享的卡片，也看得到对方接的那句话。
      $$('.forum-nav').forEach(x => x.classList.toggle('active', x.dataset.view === 'messages'));
      window.currentView = 'messages';
      renderDM(to);
      // 分享出去要有人接话：原来只 push 一条消息就结束，对方一声不吭，看起来像分享失灵。
      dmReplyToShare(to, p);
    };
    $('#share-main').onclick = async () => {
      if (await shareToMainChat(p)) { recordShare(p, 'user'); save(); close(); render(window.currentView); }
    };
    $('#copy-share').onclick = async () => {
      try { await navigator.clipboard?.writeText(shareText); } catch (e) {}
      recordShare(p, 'user');
      save(); close(); render(window.currentView); toast('已复制分享文案');
    };
  }

  /* ------------------------------------------------------------
     收藏 / 点赞 / 置顶
 */
  function toggleBookmark(id) {
    const p = db.posts.find(x => x.id === id);
    if (!p) return;
    const index = db.bookmarks.indexOf(id);
    if (index >= 0) { db.bookmarks.splice(index, 1); toast('已取消收藏'); }
    else { db.bookmarks.push(id); toast('已加入「我的收藏」（在左侧栏可以找到）'); }
    save();
    if ($('#forum-content')?.querySelector('.post-detail')) postDetail(id, { countView: false });
    else render(window.currentView);
  }

  function toggleLike(id) {
    const p = db.posts.find(x => x.id === id);
    if (!p) return;
    p.likedBy = Array.isArray(p.likedBy) ? p.likedBy : [];
    if (p.likedBy.includes('user')) {
      p.likedBy = p.likedBy.filter(x => x !== 'user');
      p.likes = Math.max(0, num(p.likes) - 1);
    } else {
      p.likedBy.push('user');
      p.likes = num(p.likes) + 1;
    }
    save();
    if ($('#forum-content')?.querySelector('.post-detail')) postDetail(id, { countView: false });
    else render(window.currentView);
  }

  function toggleLikeComment(commentId) {
    const posting = db.posts.find(p => (p.comments || []).some(c => c.id === commentId));
    if (!posting) return;
    const c = posting.comments.find(x => x.id === commentId);
    if (!c) return;
    c.likedBy = Array.isArray(c.likedBy) ? c.likedBy : [];
    if (c.likedBy.includes('user')) {
      c.likedBy = c.likedBy.filter(x => x !== 'user');
      c.likes = Math.max(0, num(c.likes) - 1);
    } else {
      c.likedBy.push('user');
      c.likes = num(c.likes) + 1;
    }
    save();
    // 只更新这一条评论的计数，不整页重绘（避免评论区滚动位置丢失）
    const node = document.querySelector(`[data-comment-id="${CSS.escape(commentId)}"] [data-like-comment]`);
    if (node) {
      const on = c.likedBy.includes('user');
      node.classList.toggle('liked', on);
      node.innerHTML = `<i class="ri-thumb-up-${on ? 'fill' : 'line'}"></i> ${num(c.likes)}`;
    }
  }

  function togglePostPin(id) {
    const p = db.posts.find(x => x.id === id);
    if (!p || p.authorId !== 'user') return;
    p.pinned = !p.pinned;
    save();
    toast(p.pinned ? '已置顶，它会排在列表最前' : '已取消置顶');
    if ($('#forum-content')?.querySelector('.post-detail')) postDetail(id, { countView: false });
    else render(window.currentView);
  }

  /* ------------------------------------------------------------
     个人主页
 */
  function renderProfile(id) {
    const a = author(id);
    const mine = id === 'user';
    const posts = db.posts.filter(p => p.authorId === id);
    const liked = mine ? db.posts.filter(p => (p.likedBy || []).includes('user')) : [];
    const bookmarked = mine ? db.posts.filter(p => db.bookmarks.includes(p.id)) : [];
    const replyCount = db.posts.reduce((s, p) => s + (p.comments || []).filter(c => c.authorId === id).length, 0);
    const followerIds = followerIdsOf(id);
    const followingIds = followingIdsOf(id);
    $('#forum-title').textContent = mine ? '我的主页' : `${a.name} 的主页`;
    $('#forum-subtitle').textContent = mine ? '管理你的内容与互动' : '论坛角色主页';
    // 主页有自己的一套分栏（发布 / 点赞 / 收藏），工具栏的搜索与排序在这里用不上
    const profileToolbar = $('#forum-toolbar');
    if (profileToolbar) profileToolbar.hidden = true;
    $('#forum-content').innerHTML = `<section class="post-card">
      <div class="profile-head">
        <img src="${esc(a.avatar)}" alt="">
        <div>
          <h2>${esc(a.name)} ${a.title ? `<span class="birthday-title">${esc(a.title)}</span>` : ''}</h2>
          ${a.bio ? `<p class="profile-bio">${esc(a.bio)}</p>` : ''}
          <div class="profile-stats">
            <button data-show-list="posts" data-profile-list-id="${esc(id)}">${posts.length} 发布</button>
            <button data-show-list="followers" data-profile-list-id="${esc(id)}">${followerIds.length} 粉丝</button>
            <button data-show-list="following" data-profile-list-id="${esc(id)}">${followingIds.length} 关注</button>
            <span class="profile-stat-plain">${replyCount} 条回复</span>
          </div>
        </div>
        ${mine ? '<button class="forum-secondary profile-edit" id="edit-profile"><i class="ri-user-settings-line"></i> 编辑资料</button>' : followButtonHtml(id)}
      </div>
      <div class="profile-tabs">
        <button class="active" data-profile-tab="posts">发布的帖子</button>
        ${mine ? '<button data-profile-tab="liked">点赞过的帖子</button><button data-profile-tab="bookmarked">收藏的帖子</button>' : ''}
      </div>
      <div id="profile-posts">${posts.length ? sortPost([...posts]).map(p => renderPostCard(p)).join('') : '<div class="empty">还没有发布帖子</div>'}</div>
    </section>`;
    $$('[data-profile-tab]').forEach(b => b.onclick = () => {
      $$('[data-profile-tab]').forEach(x => x.classList.toggle('active', x === b));
      const tab = b.dataset.profileTab;
      const data = tab === 'liked' ? liked : tab === 'bookmarked' ? bookmarked : posts;
      $('#profile-posts').innerHTML = sortPost([...data]).map(p => renderPostCard(p)).join('') || '<div class="empty">这里还没有帖子</div>';
    });
  }

  function editProfile() {
    const p = me();
    modal('编辑我的资料', `
      <label>昵称</label><input id="u-name" value="${esc(p.name)}" maxlength="30">
      <label>生日</label><input id="u-birthday" type="date" value="${esc(p.birthday)}">
      <label>简介</label><textarea id="u-bio" maxlength="160" rows="3">${esc(p.bio)}</textarea>
      <label>头像图片链接</label><input id="u-avatar-url" value="${esc(p.avatar)}" placeholder="https://...">
      <label>或从本地上传头像</label><input id="u-avatar-file" type="file" accept="image/*">
      <div class="modal-actions"><button class="forum-primary" id="save-profile">保存资料</button></div>`);
    $('#save-profile').onclick = async () => {
      const f = $('#u-avatar-file').files[0];
      const profile = {
        name: $('#u-name').value.trim() || '我',
        birthday: $('#u-birthday').value,
        bio: $('#u-bio').value.trim(),
        avatar: f ? await fileData(f) : $('#u-avatar-url').value.trim()
      };
      // 裸 localStorage.setItem 在配额写满时会抛异常，导致 close()/renderProfile()
      // 都不执行：弹窗卡在屏幕上、界面不刷新、也没有任何提示。
      // 论坛页不加载 main.js，拿不到 setLocalStorageSafely，所以这里自带 try/catch。
      try {
        localStorage.setItem('forumUserProfile', JSON.stringify(profile));
      } catch (e) {
        const quota = e && (e.name === 'QuotaExceededError' || e.code === 22);
        toast(quota ? '保存失败：浏览器存储空间不足（头像太大），请改用图片直链' : '保存失败：' + (e && e.message || e));
        return;
      }
      close(); renderProfile('user'); toast('个人资料已保存');
    };
  }

  /* ------------------------------------------------------------
     论坛角色设置
 */
  function rolesDialog() {
    const roles = allRoles();
    modal('论坛角色', `<p class="forum-tip">选择可参与论坛的角色，并调整活跃度。活跃度越高越容易发帖、评论与私信；最低活跃度不会主动发帖，只会极少回复。</p>
      <div id="role-list">${Object.entries(roles).filter(([, r]) => !r.isGroup).map(([id, r]) => {
        const x = db.roles[id] || {};
        return `<div class="role-row"><input type="checkbox" data-role="${esc(id)}" ${x.enabled ? 'checked' : ''}><img src="${esc(r.avatar || '')}" alt=""><span>${esc(r.name || id)}</span><input type="range" min="0" max="100" value="${x.activity ?? 50}" data-activity="${esc(id)}"><small>${x.activity ?? 50}</small></div>`;
      }).join('')}</div>
      <div class="modal-actions"><button class="forum-primary" id="save-roles">保存</button></div>`);
    $$('[data-activity]').forEach(x => x.oninput = () => x.nextElementSibling.textContent = x.value);
    $('#save-roles').onclick = () => {
      $$('[data-role]').forEach(x => {
        const id = x.dataset.role;
        db.roles[id] = { enabled: x.checked, activity: +document.querySelector(`[data-activity="${CSS.escape(id)}"]`).value };
      });
      save(); close(); toast('论坛角色已保存');
    };
  }

  /* ------------------------------------------------------------
     私信（含排序拖拽）
 */
  function getDmOrder() { try { return JSON.parse(localStorage.getItem(DM_ORDER_KEY) || '[]'); } catch (e) { return []; } }
  // 排序写入失败不该把整个私信界面搞崩（拖拽回调里抛异常会留下半更新状态）
  function saveDmOrder(order) {
    try { localStorage.setItem(DM_ORDER_KEY, JSON.stringify([...new Set(order)])); }
    catch (e) { toast('保存排序失败：浏览器存储空间可能已满'); }
  }
  function orderedDmRoles(roles) {
    const positions = new Map(getDmOrder().map((id, index) => [id, index]));
    return [...roles].sort((a, b) => (positions.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (positions.get(b.id) ?? Number.MAX_SAFE_INTEGER));
  }

  function bindDmReorder() {
    const contacts = $('.dm-contacts');
    if (!contacts) return;
    let dragging = null, timer = null, arming = null, suppressClickUntil = 0;
    // 与主角色列表同一套判定：按住更久 + 必须先真正移动过（避免普通点击被当成拖动）。
    const HOLD = { touch: 720, mouse: 340 };
    const MOVE_THRESHOLD = 12;
    const persist = () => saveDmOrder([...contacts.querySelectorAll('[data-dm-open]')].map(el => el.dataset.dmOpen));
    const finish = (shouldSave = true) => {
      clearTimeout(timer);
      arming = null;
      if (!dragging) return;
      dragging.classList.remove('reordering');
      dragging = null;
      if (shouldSave) persist();
    };
    contacts.querySelectorAll('[data-dm-open]').forEach(item => {
      item.draggable = false;
      item.addEventListener('dragstart', e => e.preventDefault());
      item.addEventListener('pointerdown', e => {
        if (e.button > 0) return;
        item.setPointerCapture?.(e.pointerId);
        arming = { startX: e.clientX, startY: e.clientY, moved: false };
        timer = setTimeout(() => {
          if (!arming || arming.moved) return;
          dragging = item;
          item.classList.add('reordering');
          if (e.pointerType === 'touch') navigator.vibrate?.(20);
        }, e.pointerType === 'touch' ? HOLD.touch : HOLD.mouse);
      });
      item.addEventListener('pointermove', e => {
        if (!dragging) {
          if (arming) {
            if (Math.hypot(e.clientX - arming.startX, e.clientY - arming.startY) > MOVE_THRESHOLD) {
              arming.moved = true;
              clearTimeout(timer);
            }
          }
          return;
        }
        e.preventDefault();
        dragging.style.pointerEvents = 'none';
        const target = document.elementFromPoint(e.clientX, e.clientY)?.closest('.dm-contacts [data-dm-open]');
        dragging.style.pointerEvents = '';
        if (target && target !== dragging) {
          const r = target.getBoundingClientRect();
          contacts.insertBefore(dragging, e.clientY > r.top + r.height / 2 ? target.nextSibling : target);
        }
      }, { passive: false });
      item.addEventListener('pointerup', e => {
        clearTimeout(timer);
        arming = null;
        item.releasePointerCapture?.(e.pointerId);
        const changed = Boolean(dragging);
        finish(changed);
        if (changed) { suppressClickUntil = Date.now() + 350; renderDM(); }
      });
      item.addEventListener('pointercancel', () => { clearTimeout(timer); arming = null; finish(false); });
      item.addEventListener('click', e => { if (Date.now() < suppressClickUntil) e.stopImmediatePropagation(); }, true);
    });
  }

  function renderDM(selectedId) {
    const relatedIds = new Set(db.dms.flatMap(m => [m.to, m.from]).filter(id => id && id !== 'user'));
    const roles = orderedDmRoles(activeRoles().filter(r => (db.follows.includes(r.id) && db.aiFollows.includes(r.id)) || relatedIds.has(r.id)));
    $('#forum-title').textContent = '私信';
    $('#forum-subtitle').textContent = '互关角色与 AI 分享会话';
    const toolbar = $('#forum-toolbar');
    if (toolbar) toolbar.hidden = true;
    if (!roles.length) {
      $('#forum-content').innerHTML = '<div class="empty">暂无私信。请先关注一个允许参与论坛的角色，或让 AI 分享一篇帖子。</div>';
      return;
    }
    const selected = roles.find(r => r.id === selectedId) || roles[0];
    const messages = db.dms.filter(m => m.to === selected.id || m.from === selected.id);
    $('#forum-content').innerHTML = `<div class="dm-layout"><aside class="dm-contacts">${roles.map(r => {
      const last = db.dms.filter(m => m.to === r.id || m.from === r.id).slice(-1)[0];
      return `<button class="dm-contact ${r.id === selected.id ? 'active' : ''}" data-dm-open="${esc(r.id)}"><img src="${esc(r.avatar)}" alt=""><span><b>${esc(r.name)}</b><small>${esc(last?.content || '开始聊天')}</small></span></button>`;
    }).join('')}</aside><section class="dm-chat"><header class="dm-head"><img src="${esc(selected.avatar)}" alt=""><div><b>${esc(selected.name)}</b><small>${db.follows.includes(selected.id) && db.aiFollows.includes(selected.id) ? '已互关' : 'AI 分享'} · 论坛私信</small></div></header><div class="dm-messages">${messages.length ? messages.map(m => `<div class="dm-bubble ${m.from === 'user' ? 'mine' : 'other'}">${esc(m.content)}${m.postId ? `<br><button class="forum-secondary" data-open-post="${esc(m.postId)}">查看帖子</button>` : ''}${m.image ? `<br><img src="${esc(m.image)}" alt="">` : ''}</div>`).join('') : '<div class="empty">发送第一条私信吧</div>'}</div><div class="dm-composer"><textarea id="dm-inline-content" placeholder="发送私信…（Enter 发送，Shift+Enter 换行）"></textarea>${canImage() ? '<label class="dm-image" title="发送图片"><i class="ri-image-line"></i><input id="dm-inline-image" type="file" accept="image/*"></label>' : ''}<button class="forum-primary" data-dm-send="${esc(selected.id)}"><i class="ri-send-plane-fill"></i> 发送</button></div></section></div>`;
    const box = $('.dm-messages');
    if (box) box.scrollTop = box.scrollHeight;
    bindDmReorder();
    const input = $('#dm-inline-content');
    if (input) {
      input.addEventListener('keydown', e => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendInlineDM(selected.id); }
      });
      input.addEventListener('input', () => {
        input.style.height = 'auto';
        input.style.height = Math.min(100, input.scrollHeight) + 'px';
      });
    }
  }

  /* 私信上下文：分享消息必须还原成「标题 + 作者 + 正文」。
     原来所有消息一律 slice(0,120)，分享消息的内容是「分享了一篇帖子：《标题》\n作者…\n分区…\n正文」，
     砍到 120 字时正文基本被截光，模型只看到一行标题 —— 用户接着问「这帖子好看吗」，
     它当然只能答不相干的东西。 */
  function dmContext(id, role) {
    const msgs = db.dms.filter(m => m.to === id || m.from === id).slice(-8);
    return msgs.map(m => {
      const who = m.from === 'user' ? '用户' : role.name;
      if (m.postId) {
        const p = db.posts.find(x => x.id === m.postId);
        const title = p ? p.title : ((/《([^》]+)》/.exec(m.content || '') || [])[1] || '无标题');
        const by = p ? author(p.authorId).name : '';
        const board = p ? currentBoardOf(p) : '';
        const body = p ? String(p.content || '').replace(/\s+/g, ' ').slice(0, 400) : '';
        return `${who}：分享了一篇帖子《${title}》${by ? `（作者：${by}${board ? '，分区：' + board : ''}）` : ''}${body ? `\n帖子正文：${body}` : ''}`;
      }
      if (m.image && !String(m.content || '').trim()) return `${who}：发了一张图片`;
      return `${who}：${String(m.content || '').replace(/\s+/g, ' ').slice(0, 220)}`;
    }).join('\n');
  }

  async function sendInlineDM(id) {
    const content = $('#dm-inline-content')?.value.trim();
    const f = $('#dm-inline-image')?.files[0];
    if (!content && !f) { toast('私信不能为空'); return; }
    db.dms.push({
      id: uid(), to: id, from: 'user',
      content: content || '[图片]',
      image: f ? await fileData(f) : '',
      time: Date.now()
    });
    save(); renderDM(id);
    if (db.silence) return;
    const role = activeRoles().find(r => r.id === id);
    if (!role) { toast('这个角色已不在论坛里，无法回复'); return; }
    // 带上最近几轮私信作为上下文，回复才接得上话
    const history = dmContext(id, role);
    const reply = await aiCall(role,
      `你们在私信里聊到这里：\n${history}\n\n用户最后一条消息是「${(content || '（一张图片）').slice(0, 80)}」。请直接回应用户这条消息。`,
      { mode: 'dm' });
    if (reply) {
      db.dms.push({ id: uid(), to: 'user', from: id, content: reply, time: Date.now() });
      save(); renderDM(id);
    } else if (!db.silence) {
      // 模型这次没吐出可用内容（跑题/整段英文/自我贬低都会被过滤），
      // 静默失败最像「被无视」，明确说一声。
      toast(`${role.name} 这次没回上来，再发一条试试`);
    }
  }

  /** 用户把帖子私信分享给角色后，让 TA 接一句话。
      原来「私信分享」只往 db.dms 里塞一条消息就结束了，AI 不会收到任何请求，
      表现就是「分享过去，对方一声不吭」。 */
  async function dmReplyToShare(id, post) {
    if (db.silence) return;
    const role = activeRoles().find(r => r.id === id);
    if (!role) return;
    toast(`已分享给 ${role.name}，等 TA 说点什么…`);
    const reply = await aiCall(role,
      `用户刚私信分享给你一篇论坛帖子：\n标题：《${post.title}》\n作者：${author(post.authorId).name}\n分区：${currentBoardOf(post)}\n正文：${String(post.content || '').slice(0, 600)}\n\n请用一到两句自然的口吻回应这次分享，可以顺带说说你对这篇帖子本身的看法，像朋友之间转发帖子那样。`,
      { mode: 'dm' });
    if (!reply) return;
    db.dms.push({ id: uid(), to: 'user', from: id, content: reply, time: Date.now() });
    save();
    if (window.currentView === 'messages') renderDM(id);
    else toast(`${role.name} 回了你一句`);
  }

  /* ------------------------------------------------------------
     私信编辑（设置里）
 */
  function editDMsDialog() {
    const roles = allRoles();
    const dms = [...db.dms].sort((a, b) => num(a.time) - num(b.time));
    modal('编辑私信', `<p class="forum-tip">可修改或删除论坛私信历史。修改后的内容会用于后续 AI 私信回复的上下文。</p><div id="dm-edit-list" class="dm-edit-list">${dms.length ? dms.map(m => {
      const sender = m.from === 'user' ? me().name : (roles[m.from]?.name || '角色');
      const receiver = m.to === 'user' ? me().name : (roles[m.to]?.name || '角色');
      const preview = m.image && m.content === '[图片]' ? '[图片消息]' : String(m.content || '').slice(0, 80);
      return `<div class="context-item"><span class="context-role ${m.from === 'user' ? 'role-mine' : 'role-other'}">${esc(sender)} → ${esc(receiver)}</span><span class="context-text" title="${esc(m.content || '')}">${esc(preview)}${String(m.content || '').length > 80 ? '…' : ''}</span><div class="dm-context-actions"><button class="dm-context-edit" data-dm-context-edit="${esc(m.id)}" title="编辑"><i class="ri-pencil-line"></i></button><button class="dm-context-delete" data-dm-context-delete="${esc(m.id)}" title="删除"><i class="ri-delete-bin-line"></i></button></div></div>`;
    }).join('') : '<div class="empty">暂无私信记录</div>'}</div><div class="modal-actions"><button class="forum-secondary" data-close>关闭</button></div>`);
  }

  async function editDMFromSettings(id) {
    const message = db.dms.find(m => m.id === id);
    if (!message) { toast('私信不存在'); return; }
    if (message.image && message.content === '[图片]') { toast('暂不支持编辑纯图片私信，请删除后重新发送'); return; }
    const content = await Dlg.prompt({
      title: '编辑私信',
      message: '私信内容：',
      value: message.content || '',
      multiline: true,
      rows: 4,
      okText: '保存'
    });
    if (content === null) return;
    if (!content.trim()) { toast('私信不能为空'); return; }
    message.content = content.trim();
    message.editedAt = Date.now();
    save();
    editDMsDialog();
    toast('私信已修改');
  }

  async function deleteDMFromSettings(id) {
    const message = db.dms.find(m => m.id === id);
    if (!message) { toast('私信不存在'); return; }
    const ok = await Dlg.confirm({
      title: '删除私信',
      message: '确定删除这条私信吗？这会影响后续的私信上下文。',
      okText: '删除',
      danger: true
    });
    if (!ok) return;
    db.dms = db.dms.filter(m => m.id !== id);
    save();
    editDMsDialog();
    toast('私信已删除');
  }

  /* ------------------------------------------------------------
     论坛设置
 */
  function settings() {
    let base = {};
    try { base = JSON.parse(localStorage.getItem('aiChatSettings') || '{}'); } catch (e) {}
    const api = db.api || base;
    modal('论坛设置', `
      <label class="role-row"><input type="checkbox" id="silence" ${db.silence ? 'checked' : ''}> <span>肃静：停止全部 AI 主动发帖、回复、分享和主动私信</span></label>
      <label class="role-row"><input type="checkbox" id="free-forum" ${db.freeForum ? 'checked' : ''}> <span>自由论坛：AI 自动浏览、发帖、评论、点赞与分享</span></label>
      <div class="forum-settings-section">
        <b>分区（板块）</b>
        <p class="forum-tip">每行一个分区名，发帖时可选，也会出现在工具栏的分区筛选里。</p>
        <textarea id="f-boards" rows="5">${esc(db.boards.join('\n'))}</textarea>
      </div>
      <div class="forum-settings-section">
        <b>私信上下文</b>
        <p class="forum-tip">统一管理论坛私信记录；修改或删除会影响后续 AI 私信回复。</p>
        <button class="forum-secondary" id="edit-dms-from-settings"><i class="ri-edit-2-line"></i> 编辑私信</button>
      </div>
      <label>论坛 API 地址（留空则复用短信配置）</label><input id="f-api-url" value="${esc(api.apiUrl || '')}" placeholder="https://...">
      <label>API Key</label><input id="f-api-key" value="${esc(api.apiKey || '')}" type="password">
      <label>模型名称</label><input id="f-model" value="${esc(api.modelName || '')}">
      <label class="role-row"><input type="checkbox" id="vision" ${canImage() ? 'checked' : ''} disabled> <span>多模态视觉：跟随短信 API 设置（${canImage() ? '已开启' : '未开启'}）</span></label>
      <div class="modal-actions"><button class="forum-primary" id="save-set">保存</button></div>`);
    $('#edit-dms-from-settings').onclick = editDMsDialog;
    $('#save-set').onclick = () => {
      db.silence = $('#silence').checked;
      db.freeForum = $('#free-forum').checked;
      const boards = $('#f-boards').value.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
      db.boards = boards.length ? [...new Set(boards)] : BOARDS;
      db.api = { ...base, apiUrl: $('#f-api-url').value.trim(), apiKey: $('#f-api-key').value.trim(), modelName: $('#f-model').value.trim() };
      save(); close(); syncFreeForum();
      renderToolbar();
      toast(db.silence ? '论坛已肃静' : '论坛设置已保存');
    };
  }

  /* ------------------------------------------------------------
     数据导出 / 导入
 */
  function exportData() {
    try {
      const payload = JSON.stringify({ __app: 'myswForum', version: 2, exportedAt: new Date().toISOString(), data: db }, null, 2);
      const blob = new Blob([payload], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `MySW论坛数据_${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      toast('论坛数据已导出');
    } catch (e) {
      console.error(e);
      toast('导出失败：' + (e.message || e));
    }
  }

  function importData(file) {
    const reader = new FileReader();
    reader.onload = async () => {
      let parsed;
      try { parsed = JSON.parse(String(reader.result)); }
      catch (e) { toast('导入失败：不是合法的 JSON 文件'); return; }
      const incoming = parsed?.data || parsed;
      if (!incoming || !Array.isArray(incoming.posts)) { toast('导入失败：文件里没有论坛帖子数据'); return; }
      const ok = await Dlg.confirm({
        title: '导入论坛数据',
        message: `即将导入 ${incoming.posts.length} 条帖子、${Array.isArray(incoming.dms) ? incoming.dms.length : 0} 条私信。\n\n点「合并」会把导入内容追加到现有数据之后；点「覆盖」会清空现有论坛数据。`,
        okText: '合并导入',
        cancelText: '覆盖导入'
      });
      // confirm 返回 true = 合并；false / null = 用户取消或选了覆盖，这里用提示再确认一次，
      // 避免把「取消」误当成「覆盖」而清空用户数据。
      if (ok) {
        mergeForumData(incoming);
        toast('已合并导入论坛数据');
      } else {
        const cover = await Dlg.confirm({
          title: '确认覆盖？',
          message: '这会清空当前论坛里的全部帖子、评论、私信与收藏，然后写入导入文件的内容。',
          okText: '覆盖',
          danger: true,
          cancelText: '取消'
        });
        if (!cover) return;
        mergeForumData(incoming, true);
        toast('已覆盖导入论坛数据');
      }
      render(window.currentView || 'feed');
    };
    reader.onerror = () => toast('文件读取失败');
    reader.readAsText(file);
  }

  function mergeForumData(incoming, replace = false) {
    if (replace) {
      db.posts = [];
      db.dms = [];
      db.bookmarks = [];
    }
    const existingIds = new Set(db.posts.map(p => p.id));
    (incoming.posts || []).forEach(p => {
      if (!p || !p.id) return;
      if (existingIds.has(p.id)) {
        // 同一 id 视为同一条：保留互动数更多的那个版本，避免导入把点赞清零
        const index = db.posts.findIndex(x => x.id === p.id);
        if (index >= 0 && num(p.likes) > num(db.posts[index].likes)) db.posts[index] = p;
        return;
      }
      db.posts.push(p);
      existingIds.add(p.id);
    });
    db.posts.sort((a, b) => num(b.time) - num(a.time));

    const dmIds = new Set(db.dms.map(m => m.id));
    (incoming.dms || []).forEach(m => {
      if (!m || !m.id || dmIds.has(m.id)) return;
      db.dms.push(m);
      dmIds.add(m.id);
    });
    db.dms.sort((a, b) => num(a.time) - num(b.time));

    db.roles = { ...(incoming.roles || {}), ...db.roles };
    db.follows = [...new Set([...(db.follows || []), ...((incoming.follows) || [])])];
    db.aiFollows = [...new Set([...(db.aiFollows || []), ...((incoming.aiFollows) || [])])];
    db.bookmarks = [...new Set([...(db.bookmarks || []), ...((incoming.bookmarks) || [])])];
    if (Array.isArray(incoming.boards) && incoming.boards.length) {
      db.boards = [...new Set([...db.boards, ...incoming.boards])];
    }
    save();
  }

  /* ------------------------------------------------------------
     事件绑定
 */
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-view]');
    if (b) {
      $$('.forum-nav').forEach(x => x.classList.remove('active'));
      // 详情页/主页里的「返回列表」按钮不在左侧导航里，这里容错处理
      const navItem = document.querySelector(`.forum-nav[data-view="${b.dataset.view}"]`);
      if (navItem) navItem.classList.add('active');
      render(b.dataset.view);
      return;
    }
    if (e.target.closest('[data-close]')) close();

    if (e.target.closest('[data-clear-filter]')) {
      filterState.keyword = '';
      filterState.board = 'all';
      filterState.sort = 'new';
      renderToolbar();
      render(window.currentView || 'feed');
      return;
    }

    const dmEdit = e.target.closest('[data-dm-context-edit]');
    if (dmEdit) { editDMFromSettings(dmEdit.dataset.dmContextEdit); return; }
    const dmDelete = e.target.closest('[data-dm-context-delete]');
    if (dmDelete) { deleteDMFromSettings(dmDelete.dataset.dmContextDelete); return; }

    // 帖子卡片上的按钮优先级必须高于「打开帖子」，否则点按钮会跳进详情页
    const likeBtn = e.target.closest('[data-like]');
    if (likeBtn) { toggleLike(likeBtn.dataset.like); return; }
    const likeCommentBtn = e.target.closest('[data-like-comment]');
    if (likeCommentBtn) { toggleLikeComment(likeCommentBtn.dataset.likeComment); return; }
    const bookmarkBtn = e.target.closest('[data-bookmark]');
    if (bookmarkBtn) { toggleBookmark(bookmarkBtn.dataset.bookmark); return; }
    const pinBtn = e.target.closest('[data-pin-post]');
    if (pinBtn) { togglePostPin(pinBtn.dataset.pinPost); return; }
    const deleteCommentBtn = e.target.closest('[data-delete-comment]');
    if (deleteCommentBtn) { deleteComment(deleteCommentBtn.dataset.deleteComment); return; }
    const replyCommentBtn = e.target.closest('[data-reply-comment]');
    if (replyCommentBtn) { replyComment(replyCommentBtn.dataset.replyComment); return; }
    const sendCommentBtn = e.target.closest('[data-send-comment]');
    if (sendCommentBtn) {
      const posting = db.posts.find(p => p.id === sendCommentBtn.dataset.sendComment);
      if (!posting) return;
      const content = $('#quick-comment')?.value.trim();
      if (!content) { toast('回复不能为空'); return; }
      const f = $('#quick-comment-image')?.files[0];
      (async () => {
        addComment(posting, content, f ? await fileData(f) : '');
        toast('回复已发布');
        postDetail(posting.id, { countView: false });
        maybeAiReply(content, posting);
        replyFromOtherAi(posting, content);
      })();
      return;
    }
    const refreshBtn = e.target.closest('[data-refresh-post]');
    if (refreshBtn) { postDetail(refreshBtn.dataset.refreshPost, { countView: false }); return; }
    const editPostBtn = e.target.closest('[data-edit-post]');
    if (editPostBtn) { editPost(editPostBtn.dataset.editPost); return; }
    const commentBtn = e.target.closest('[data-comment]');
    if (commentBtn) { comment(commentBtn.dataset.comment); return; }
    const deleteButton = e.target.closest('[data-delete-post]');
    if (deleteButton) { deletePost(deleteButton.dataset.deletePost); return; }
    const profile = e.target.closest('[data-profile]');
    if (profile) { close(); renderProfile(profile.dataset.profile); return; }
    const listBtn = e.target.closest('[data-show-list]');
    if (listBtn) {
      const id = listBtn.dataset.profileListId;
      const type = listBtn.dataset.showList;
      if (type === 'followers') showUserList('粉丝列表', followerIdsOf(id), '还没有粉丝');
      if (type === 'following') showUserList('关注列表', followingIdsOf(id), '还没有关注任何人');
      return;
    }
    if (e.target.closest('#edit-profile')) { editProfile(); return; }

    const f = e.target.closest('[data-follow]');
    if (f) {
      const id = f.dataset.follow;
      if (db.follows.includes(id)) {
        db.follows = db.follows.filter(x => x !== id);
        db.aiFollows = db.aiFollows.filter(x => x !== id);
      } else {
        db.follows.push(id);
        // 论坛角色默认回关，形成可私信的互关关系。
        db.aiFollows.push(id);
      }
      save();
      // 详情页里的「关注」按钮点了以后只刷新按钮状态，不跳页；
      // 列表里的「关注」则重绘列表，让按钮文字跟着变。
      const detail = $('#forum-content')?.querySelector('.post-detail');
      if (detail) {
        document.querySelectorAll(`[data-follow="${CSS.escape(id)}"]`).forEach(btn => {
          const followed = db.follows.includes(id);
          btn.innerHTML = `<i class="ri-user-${followed ? 'follow' : 'add'}-line"></i> ${followed ? '已关注' : '关注'}`;
        });
      } else {
        render(window.currentView);
      }
      toast(db.follows.includes(id) ? '已关注（默认回关，可直接私信）' : '已取消关注');
      return;
    }
    const s = e.target.closest('[data-share]');
    if (s) { share(s.dataset.share); return; }
    const d = e.target.closest('[data-dm]');
    if (d) { renderDM(d.dataset.dm); return; }
    const open = e.target.closest('[data-dm-open]');
    if (open) { renderDM(open.dataset.dmOpen); return; }
    const send = e.target.closest('[data-dm-send]');
    if (send) { sendInlineDM(send.dataset.dmSend); return; }
    const post = e.target.closest('[data-open-post]');
    if (post) { postDetail(post.dataset.openPost); return; }
  });

  // 搜索（输入防抖）。在私信/主页里搜索没有意义，自动切回「推荐」列表并同步左侧高亮。
  let searchTimer = null;
  $('#forum-search-input')?.addEventListener('input', e => {
    clearTimeout(searchTimer);
    const value = e.target.value;
    searchTimer = setTimeout(() => {
      filterState.keyword = value;
      const target = listViewOr('feed');
      if (target !== window.currentView) {
        $$('.forum-nav').forEach(x => x.classList.toggle('active', x.dataset.view === target));
      }
      render(target);
    }, 220);
  });
  $('#forum-search-input')?.addEventListener('keydown', e => {
    if (e.key === 'Escape') { e.target.value = ''; filterState.keyword = ''; render(listViewOr('feed')); }
  });

  // 分区筛选
  $('#forum-board-select')?.addEventListener('change', e => {
    filterState.board = e.target.value || 'all';
    render(listViewOr('feed'));
  });

  // 排序
  $('#forum-sort-select')?.addEventListener('change', e => {
    const value = e.target.value;
    // 「推荐」不是一种静态排序，而是恢复 feed 的默认推荐算法
    filterState.sort = value === 'recommend' ? 'new' : value;
    filterState.sortTouched = value !== 'recommend';
    render(listViewOr('feed'));
  });

  // 清空搜索与排序
  $('#forum-toolbar-clear')?.addEventListener('click', () => {
    filterState.keyword = '';
    filterState.board = 'all';
    filterState.sort = 'new';
    filterState.sortTouched = false;
    renderToolbar();
    render(window.currentView || 'feed');
  });

  // 回到顶部
  $('#forum-content')?.addEventListener('scroll', updateFab, { passive: true });
  $('#forum-fab-top')?.addEventListener('click', () => {
    $('#forum-content')?.scrollTo({ top: 0, behavior: 'smooth' });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
  // 帖子详情页里滚动的其实是窗口，这里同时监听窗口滚动
  window.addEventListener('scroll', updateFab, { passive: true });

  /* ------------------------------------------------------------
     启动
 */
  initForumFontSettings();
  $('#new-post').onclick = newPost;
  $('#forum-roles').onclick = rolesDialog;
  $('#forum-settings').onclick = settings;
  $('#ai-now').onclick = aiNow;
  $('#ai-share-now')?.addEventListener('click', aiShareNow);
  $('#forum-export')?.addEventListener('click', exportData);
  $('#forum-import')?.addEventListener('click', () => $('#forum-import-file')?.click());
  $('#forum-import-file')?.addEventListener('change', e => {
    const file = e.target.files?.[0];
    if (file) importData(file);
    e.target.value = '';
  });
  syncFreeForum();
  renderToolbar();
  // 从主站分享卡片跳转过来:forum.html?post=<id> 直接打开该帖详情
  const jumpPostId = new URLSearchParams(location.search).get('post');
  if (jumpPostId && db.posts.some(p => p.id === jumpPostId)) {
    postDetail(jumpPostId);
  } else {
    render();
  }
})();
/* —— 论坛弹窗拉板：底部拉杆调高、右下角调宽+高，双击恢复，大小记住 —— */
/* 弹窗内容整体滚动，拉杆用 sticky 钉在滚动区底部，始终可见可拖 */
enableModalResize(document.getElementById('forum-modal'), {
    key: 'forum-dialog',
    barStyle: {
        position: 'sticky',
        bottom: '-22px',
        margin: '0 -22px -22px',
        padding: '0 22px',
        background: '#292d38',
        borderRadius: '0 0 13px 13px',
        borderTop: '1px solid #454955'
    }
});
