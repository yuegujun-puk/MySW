/**
 * app-dialogs.js — 全局应用内对话框（替代浏览器原生 alert / confirm / prompt）
 * AppDialogs.alert({ title, message, okText })                          -> Promise<void>
 * AppDialogs.confirm({ title, message, okText, cancelText, danger })     -> Promise<boolean>
 * AppDialogs.prompt({ title, message, value, placeholder, multiline,
 * inputType, min, max, maxLength, okText, cancelText })
 * -> Promise<string|null>
 * AppDialogs.choice({ title, message, icon, cancelText,
 * buttons: [{ label, value, icon, primary }] })      -> Promise<value|null>
 * 也支持直接传字符串：AppDialogs.confirm('确定删除吗？')
 */
(function () {
    'use strict';

    const STYLE_ID = 'app-dialogs-style';
    const Z_INDEX = 96000;   // 高于站内弹窗与 VN 舞台，低于 boot-splash(99999)

    /* ---------------- 样式 ---------------- */

    function injectStyle() {
        if (document.getElementById(STYLE_ID)) return;
        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = [
            '.ad-overlay{position:fixed;inset:0;z-index:' + Z_INDEX + ';display:flex;align-items:center;justify-content:center;padding:18px;background:rgba(8,9,14,.62);backdrop-filter:blur(3px);-webkit-backdrop-filter:blur(3px);opacity:0;visibility:hidden;transition:opacity .18s ease,visibility 0s linear .18s;}',
            '.ad-overlay.show{opacity:1;visibility:visible;transition:opacity .18s ease;}',
            '.ad-card{width:min(440px,92vw);max-height:min(78vh,620px);overflow:auto;background:var(--bg-secondary,#232631);color:var(--text-primary,#e8eaf0);border:1px solid rgba(255,255,255,.09);border-radius:14px;box-shadow:0 24px 70px rgba(0,0,0,.55);transform:translateY(10px) scale(.985);transition:transform .18s ease;}',
            '.ad-overlay.show .ad-card{transform:none;}',
            '.ad-head{display:flex;align-items:center;gap:9px;padding:15px 18px 0;font-size:1.02em;font-weight:600;}',
            '.ad-head i{font-size:1.2em;color:var(--accent-gold,#e6c78a);}',
            '.ad-card.danger .ad-head i{color:#ff7a7a;}',
            '.ad-msg{padding:10px 18px 4px;line-height:1.7;font-size:.92em;color:var(--text-secondary,#b9becb);white-space:pre-wrap;word-break:break-word;}',
            '.ad-body{padding:6px 18px 2px;}',
            '.ad-body input,.ad-body textarea{width:100%;box-sizing:border-box;padding:10px 12px;border-radius:10px;border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.05);color:inherit;font:inherit;outline:none;transition:border-color .16s ease;}',
            '.ad-body input:focus,.ad-body textarea:focus{border-color:var(--accent-gold,#e6c78a);}',
            '.ad-body textarea{resize:vertical;min-height:96px;line-height:1.6;}',
            '.ad-foot{display:flex;gap:10px;padding:14px 18px 16px;flex-wrap:wrap;}',
            '.ad-btn{flex:1 1 auto;display:inline-flex;align-items:center;justify-content:center;gap:6px;padding:9px 14px;border-radius:10px;border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.05);color:inherit;font:inherit;font-size:.9em;cursor:pointer;transition:background .16s ease,filter .16s ease;}',
            '.ad-btn:hover{background:rgba(255,255,255,.11);}',
            '.ad-btn.primary{background:var(--accent-gold,#e6c78a);border-color:transparent;color:#1b1c22;font-weight:600;}',
            '.ad-btn.primary:hover{filter:brightness(1.08);}',
            '.ad-card.danger .ad-btn.primary{background:#e05c5c;color:#fff;}',
            // choice 按钮过多时（>3）自动换行：每个按钮至少占一半宽度，避免挤成一排点不准
            '.ad-foot.ad-foot-many .ad-btn{flex:1 1 46%;}',
            'body.light-theme .ad-card{background:#fff;color:#232631;border-color:rgba(0,0,0,.1);}',
            'body.light-theme .ad-msg{color:#5a5f6e;}',
            'body.light-theme .ad-body input,body.light-theme .ad-body textarea{background:rgba(0,0,0,.04);border-color:rgba(0,0,0,.15);color:#232631;}',
            'body.light-theme .ad-btn{background:rgba(0,0,0,.05);border-color:rgba(0,0,0,.15);}',
            'body.light-theme .ad-btn:hover{background:rgba(0,0,0,.1);}',
            // 键盘弹出时把卡片顶到可视区中央，避免被软键盘盖住（iOS/安卓都适用）
            '@media (max-height:520px){.ad-overlay{align-items:flex-start;padding-top:10px;}.ad-card{max-height:calc(100vh - 20px);max-height:100dvh;}}'
        ].join('\n');
        document.head.appendChild(style);
    }

    /* ---------------- 排队：同一时间只显示一个 ---------------- */

    const queue = [];
    let running = false;

    function pump() {
        if (running) return;
        const job = queue.shift();
        if (!job) return;
        running = true;
        // job 负责在关闭时调用 release()
        job(release);
    }

    function release() {
        running = false;
        pump();
    }

    function el(tag, className, text) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text !== undefined && text !== null) node.textContent = String(text);
        return node;
    }

    function iconSpan(name) {
        const i = document.createElement('i');
        i.className = name;
        i.setAttribute('aria-hidden', 'true');
        return i;
    }

    /** 归一化 choice 的按钮表：{label,value,icon,primary}；value 缺省时用 label */
    function normalizeButtons(list) {
        return (Array.isArray(list) ? list : [])
            .map(btn => (typeof btn === 'string' || typeof btn === 'number')
                ? { label: String(btn), value: btn }
                : (btn || {}))
            .filter(btn => btn.label !== undefined && btn.label !== null && String(btn.label).trim() !== '')
            .map(btn => ({
                label: String(btn.label),
                value: btn.value === undefined ? String(btn.label) : btn.value,
                icon: btn.icon || '',
                primary: btn.primary === true
            }))
            .slice(0, 6);
    }

    /**
     * @param {string} kind  'alert' | 'confirm' | 'prompt' | 'choice'
     * @param {object} options
     * @param {function(*):*} onResolve 结果处理器（决定 resolve 值）
     * @returns {Promise}
     */
    function open(kind, options, onResolve) {
        options = typeof options === 'string' ? { message: options } : (options || {});
        const multiline = kind === 'prompt' && options.multiline === true;
        const isChoice = kind === 'choice';
        const buttons = isChoice ? normalizeButtons(options.buttons) : [];
        const cancelValue = () => {
            if (isChoice) return options.cancelValue === undefined ? null : options.cancelValue;
            if (kind === 'prompt') return null;
            if (kind === 'confirm') return false;
            return undefined;
        };

        return new Promise(resolve => {
            queue.push(done => {
                injectStyle();

                const overlay = el('div', 'ad-overlay');
                overlay.setAttribute('role', 'dialog');
                overlay.setAttribute('aria-modal', 'true');

                const card = el('div', 'ad-card' + (options.danger ? ' danger' : ''));

                // 标题行
                const head = el('div', 'ad-head');
                head.appendChild(iconSpan(options.icon ||
                    (options.danger ? 'ri-error-warning-line'
                        : (kind === 'prompt' ? 'ri-input-field'
                            : (isChoice ? 'ri-question-line' : 'ri-information-line')))));
                head.appendChild(el('span', null,
                    options.title
                    || (kind === 'confirm' ? '请确认'
                        : (kind === 'prompt' ? '请输入'
                            : (isChoice ? '请选择' : '提示')))));
                card.appendChild(head);

                // 正文
                const message = String(options.message === undefined || options.message === null ? '' : options.message).trim();
                if (message) card.appendChild(el('div', 'ad-msg', message));

                // 输入区（prompt）
                let field = null;
                if (kind === 'prompt') {
                    const body = el('div', 'ad-body');
                    field = el(multiline ? 'textarea' : 'input');
                    if (!multiline) field.type = options.inputType === 'number' ? 'number' : 'text';
                    field.value = options.value === undefined || options.value === null ? '' : String(options.value);
                    if (options.placeholder) field.placeholder = String(options.placeholder);
                    if (options.maxLength) field.maxLength = Number(options.maxLength) || 0;
                    if (options.inputType === 'number') {
                        if (options.min !== undefined) field.min = options.min;
                        if (options.max !== undefined) field.max = options.max;
                        field.inputMode = 'decimal';
                    }
                    if (multiline) field.rows = Number(options.rows) || 4;
                    body.appendChild(field);
                    card.appendChild(body);
                }

                // 按钮区
                const footCount = isChoice ? buttons.length + 1 : (kind === 'alert' ? 1 : 2);
                const foot = el('div', 'ad-foot' + (footCount > 2 ? ' ad-foot-many' : ''));
                let primaryBtn = null;
                let cancelBtn = null;

                if (isChoice) {
                    // 多按钮：每个按钮 resolve 自己的 value；末尾自动补「取消」
                    buttons.forEach(btn => {
                        const node = el('button', 'ad-btn' + (btn.primary ? ' primary' : ''));
                        node.type = 'button';
                        if (btn.icon) node.appendChild(iconSpan(btn.icon));
                        node.appendChild(el('span', null, btn.label));
                        node.addEventListener('click', () => finish(btn.value));
                        foot.appendChild(node);
                        if (!primaryBtn && btn.primary) primaryBtn = node;
                    });
                    if (!primaryBtn && buttons.length) primaryBtn = foot.querySelector('.ad-btn');
                    const quit = el('button', 'ad-btn');
                    quit.type = 'button';
                    quit.appendChild(iconSpan('ri-close-line'));
                    quit.appendChild(el('span', null, options.cancelText || '取消'));
                    quit.addEventListener('click', () => finish(cancelValue()));
                    foot.appendChild(quit);
                } else {
                    if (kind !== 'alert') {
                        cancelBtn = el('button', 'ad-btn');
                        cancelBtn.type = 'button';
                        cancelBtn.appendChild(iconSpan('ri-close-line'));
                        cancelBtn.appendChild(el('span', null, options.cancelText || '取消'));
                        cancelBtn.addEventListener('click', () => finish(cancelValue()));
                        foot.appendChild(cancelBtn);
                    }
                    const okBtn = el('button', 'ad-btn primary');
                    okBtn.type = 'button';
                    okBtn.appendChild(iconSpan(options.danger ? 'ri-delete-bin-6-line' : 'ri-check-line'));
                    okBtn.appendChild(el('span', null,
                        options.okText || (kind === 'confirm' ? '确定' : (kind === 'prompt' ? '确定' : '好的'))));
                    okBtn.addEventListener('click', () => finish(
                        kind === 'prompt' ? (field ? field.value : '') : (kind === 'confirm' ? true : undefined)
                    ));
                    foot.appendChild(okBtn);
                    primaryBtn = okBtn;
                }
                card.appendChild(foot);
                overlay.appendChild(card);

                let closed = false;
                const finish = (value) => {
                    if (closed) return;
                    closed = true;
                    document.removeEventListener('keydown', onKey, true);
                    overlay.classList.remove('show');
                    setTimeout(() => {
                        try { overlay.remove(); } catch (e) {}
                        done();          // 关闭动画结束后再放下一个排队中的对话框
                    }, 220);
                    resolve(onResolve ? onResolve(value) : value);
                };

                const onKey = (e) => {
                    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finish(cancelValue()); return; }
                    if (isChoice && /^[1-9]$/.test(e.key)) {
                        // 数字键直选第 N 个按钮（超出数量则忽略）
                        const target = foot.querySelectorAll('.ad-btn')[Number(e.key) - 1];
                        if (target) { e.preventDefault(); e.stopPropagation(); target.click(); }
                        return;
                    }
                    if (e.key === 'Enter') {
                        // choice：Enter 选第一个主按钮（没有主按钮则选第一个）
                        if (isChoice) {
                            e.preventDefault();
                            e.stopPropagation();
                            const target = primaryBtn || foot.querySelector('.ad-btn');
                            if (target) target.click();
                            return;
                        }
                        // 数字键 1-9 直选 choice 按钮
                        if (multiline && !(e.ctrlKey || e.metaKey)) return;
                        e.preventDefault();
                        e.stopPropagation();
                        if (primaryBtn) primaryBtn.click();
                    }
                };

                overlay.addEventListener('click', e => { if (e.target === overlay) finish(cancelValue()); });
                document.addEventListener('keydown', onKey, true);

                document.body.appendChild(overlay);
                requestAnimationFrame(() => overlay.classList.add('show'));
                setTimeout(() => {
                    if (!field) { try { if (primaryBtn) primaryBtn.focus(); } catch (e) {} return; }
                    try {
                        field.focus({ preventScroll: false });
                        if (!multiline && typeof field.select === 'function') field.select();
                    } catch (e) { try { field.focus(); } catch (e2) {} }
                }, 70);
            });
            pump();
        });
    }

    /* ---------------- 对外 API ---------------- */

    // 兜底：极端情况下（脚本被拦截 / 旧缓存缺文件）退回原生对话框，
    // 保证「调用对话框」永远不会抛错把主流程打断。
    function nativeFallback(kind, options) {
        const msg = String((options && options.message) || options || '');
        try {
            if (kind === 'alert') { window.alert(msg); return Promise.resolve(undefined); }
            if (kind === 'confirm') return Promise.resolve(window.confirm(msg) === true);
            if (kind === 'choice') {
                // 原生只有两键：把第一个按钮当作「确定」，其余情况视为取消
                const list = normalizeButtons(options && options.buttons);
                const picked = window.confirm(msg + (list[0] ? '\n\n确定 = ' + list[0].label : ''));
                return Promise.resolve(picked && list[0] ? list[0].value : ((options && options.cancelValue !== undefined) ? options.cancelValue : null));
            }
            const value = window.prompt(msg, (options && options.value) || '');
            return Promise.resolve(value === null ? null : String(value));
        } catch (e) {
            return Promise.resolve(kind === 'confirm' ? false : (kind === 'prompt' || kind === 'choice' ? null : undefined));
        }
    }

    function guard(kind, options) {
        if (!document.body) {
            // body 还不存在（脚本极早期调用）：同样退回原生，避免静默丢消息
            return nativeFallback(kind, options);
        }
        const onResolve = kind === 'alert' ? (() => undefined)
            : (kind === 'confirm' ? (v => v === true)
                : (kind === 'choice' ? (v => (v === undefined ? null : v))
                    : (v => (v === null ? null : String(v)))));
        return open(kind, options, onResolve);
    }

    window.AppDialogs = {
        alert: options => guard('alert', options),
        confirm: options => guard('confirm', options),
        prompt: options => guard('prompt', options),
        /** 多按钮选择：resolve 被点按钮的 value，取消则 resolve null */
        choice: options => guard('choice', options),
        /** 供其它模块复用的底层入口 */
        open: (kind, options) => guard(kind, options)
    };

    /**
     * 全局简写：Dlg.alert / Dlg.confirm / Dlg.prompt / Dlg.choice
     * 与 AppDialogs 完全等价，只是调用起来短一些。
     */
    window.Dlg = window.AppDialogs;
})();
