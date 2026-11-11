/* 通用弹窗拉板（独立版）—— 论坛 / 角色卡市场 / 插件市场等不加载 mysw-core.js 的页面使用。
   用法：enableModalResize(弹窗根元素, { key: '唯一名', minW, minH, barStyle: {…} })
   行为与主站一致：底部拉杆调高度、右下角手柄调宽+高（跟手）、双击拉杆恢复默认，大小按 key 分别记住。 */
(function () {
    'use strict';
    if (window.enableModalResize) return;

    const STYLE = `
        .modal-pull-bar {
            flex-shrink: 0;
            height: 18px;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: ns-resize;
            touch-action: none;
            background: transparent;
            border-top: 1px solid rgba(128, 128, 128, 0.25);
            user-select: none;
        }
        .modal-pull-bar::before {
            content: "";
            width: 56px;
            height: 4px;
            border-radius: 2px;
            background: #5a5e6b;
            transition: background 0.2s;
        }
        .modal-pull-bar:hover::before,
        .modal-pull-bar.dragging::before { background: var(--accent-gold, #e6c78a); }
        .modal-resize-corner {
            position: absolute;
            right: 1px;
            bottom: 1px;
            width: 18px;
            height: 18px;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: nwse-resize;
            touch-action: none;
            color: #6a6e7b;
            z-index: 5;
        }
        .modal-resize-corner svg { display: block; pointer-events: none; }
        .modal-resize-corner:hover { color: var(--accent-gold, #e6c78a); }
    `;

    function injectStyle() {
        if (document.getElementById('modal-resize-style')) return;
        const s = document.createElement('style');
        s.id = 'modal-resize-style';
        s.textContent = STYLE;
        document.head.appendChild(s);
    }

    window.enableModalResize = function (modal, opts = {}) {
        if (!modal) return;
        injectStyle();
        // 兼容两种结构：.modal-content（主站式）或弹窗根元素本身就是面板
        const box = modal.querySelector('.modal-content') || modal.querySelector('.modal, .forum-dialog, .market-dialog') || modal;
        if (!box || box.querySelector('.modal-pull-bar')) return;
        const STORE_KEY = `mysw_modal_size_${opts.key || modal.id || 'modal'}_v1`;
        const MIN_W = opts.minW || 320;
        const MIN_H = opts.minH || 220;

        if (getComputedStyle(box).position === 'static') box.style.position = 'relative';
        const clamp = (v, min, max) => Math.max(min, Math.min(v, max));
        const applySize = (w, h) => {
            if (w) {
                box.style.maxWidth = '95vw';
                box.style.width = clamp(Math.round(w), MIN_W, Math.round(window.innerWidth * 0.95)) + 'px';
            }
            if (h) {
                box.style.maxHeight = '95vh';
                box.style.height = clamp(Math.round(h), MIN_H, Math.round(window.innerHeight * 0.95)) + 'px';
            }
        };
        const saveSize = () => {
            const w = parseFloat(box.style.width), h = parseFloat(box.style.height);
            if (!w && !h) return; // 宽高任一调整过就保存
            try { localStorage.setItem(STORE_KEY, JSON.stringify({ w: Math.round(w) || 0, h: Math.round(h) || 0 })); } catch (e) {}
        };
        const resetSize = () => {
            box.style.width = '';
            box.style.height = '';
            box.style.maxWidth = '';
            box.style.maxHeight = '';
            try { localStorage.removeItem(STORE_KEY); } catch (e) {}
        };

        const bar = document.createElement('div');
        bar.className = 'modal-pull-bar';
        bar.title = '按住拖动调整大小，双击恢复默认';
        if (opts.barStyle) Object.assign(bar.style, opts.barStyle);
        const corner = document.createElement('span');
        corner.className = 'modal-resize-corner';
        corner.title = '拖动同时调整宽和高';
        corner.innerHTML = '<svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M11 1L1 11M11 6L6 11" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" fill="none"/></svg>';
        bar.appendChild(corner);
        box.appendChild(bar);

        let drag = null; // { mode: 'h' | 'wh', startX, startY, startW, startH }
        const startDrag = (mode) => (e) => {
            if (e.button !== undefined && e.button !== 0) return;
            if (mode === 'h' && e.target.closest('.modal-resize-corner')) return; // 角落手柄单独处理
            drag = { mode, startX: e.clientX, startY: e.clientY, startW: box.offsetWidth, startH: box.offsetHeight };
            bar.classList.add('dragging');
            document.body.style.userSelect = 'none';
            e.preventDefault();
        };
        const onMove = (e) => {
            if (!drag) return;
            const dx = e.clientX - drag.startX;
            const dy = e.clientY - drag.startY;
            // 弹窗居中显示：想让边缘跟手，位移乘 2
            applySize(
                drag.mode === 'wh' ? drag.startW + dx * 2 : null,
                drag.startH + dy * 2
            );
            e.preventDefault();
        };
        const onUp = () => {
            if (!drag) return;
            drag = null;
            bar.classList.remove('dragging');
            document.body.style.userSelect = '';
            saveSize();
        };
        bar.addEventListener('pointerdown', startDrag('h'));
        corner.addEventListener('pointerdown', startDrag('wh'));
        window.addEventListener('pointermove', onMove, { passive: false });
        window.addEventListener('pointerup', onUp);
        window.addEventListener('pointercancel', onUp);
        bar.addEventListener('dblclick', resetSize);

        // 恢复上次调整过的大小（宽高各自独立恢复）
        try {
            const s = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
            if (s?.w || s?.h) applySize(s?.w || 0, s?.h || 0);
        } catch (e) {}
    };
})();
