/**
 * script-loader.js —— 网站打开时加载哪些 JS
 * · 列出 index.html 会加载的全部脚本；
 * · 标出「必须加载」：这些脚本关掉后聊天、角色或设置会直接不可用，开关锁死；
 * · 其余脚本可以单独关闭。选择记在 localStorage（键 scriptLoadSettings），
 * 下次打开页面时由本文件决定要不要真正插入 <script>。
 * 本文件自身必须始终加载（它在 boot-splash 之前），否则这套开关无法生效。
 */
(function () {
    'use strict';

    var STORAGE_KEY = 'scriptLoadSettings';

    /* required: true 的脚本始终加载，面板里不能关掉。
       group 只用于界面分组，不影响加载顺序（顺序以 index.html 调用为准）。 */
    var SCRIPTS = [
        { file: 'marked.min.js', name: 'Markdown 渲染', group: '基础库', required: true, remote: true,
          impact: '消息里的标题、列表、代码块都靠它排版。不加载则回复变成纯文本。' },
        { file: 'purify.min.js', name: 'HTML 安全过滤', group: '基础库', required: true, remote: true,
          impact: '清洗 AI 回复里的 HTML，防止脚本注入。不加载则富文本渲染会被跳过。' },
        { file: 'highlight.min.js', name: '代码高亮', group: '基础库', required: false, remote: true,
          impact: '只影响代码块的颜色高亮。关掉后代码仍能显示，只是没有语法着色。' },
        { file: 'jszip.min.js', name: 'ZIP 打包', group: '基础库', required: false, remote: true,
          impact: '批量导出角色卡（zip）、聊天上传 ZIP 解压会不可用。单份 JSON 的导入导出不受影响。' },

        { file: 'script-loader.js', name: '功能开关 / 脚本加载设置', group: '核心', required: true, pinned: true,
          impact: '就是本面板（功能开关 + 按文件管理都在这里）。它自己必须一直在，否则你关掉之后就再也调不回来了，所以锁死。' },
        { file: 'boot-splash.js', name: '自定义开屏', group: '外观', required: false,
          impact: '实验室里设置的开屏图片 / 视频不再播放，直接进入主界面。' },
        { file: 'app-dialogs.js', name: '应用内对话框', group: '核心', required: true,
          impact: '确认、输入等弹窗都会退回浏览器原生对话框，部分流程会很难看或点不到。' },
        { file: 'characters.js', name: '内置角色数据', group: '核心', required: true,
          impact: '内置角色列表为空，角色卡与开场白都读不到。' },
        { file: 'api.js', name: 'AI 接口', group: '核心', required: true,
          impact: '无法向模型发请求，发送消息会直接失败。' },
        { file: 'endpoints.js', name: 'API 站点管理', group: '核心', required: true,
          impact: '多站点切换、备用模型与站点配置界面失效。' },
        { file: 'memory.js', name: '长期记忆', group: '核心', required: true,
          impact: '长期记忆的提取、注入与设置全部不可用（已存的记忆不会被删除）。' },
        { file: 'knowledge.js', name: '知识库核心', group: '核心', required: true,
          impact: '知识库检索失效，对话不再带上你上传的资料。' },
        { file: 'settings.js', name: '设置读写', group: '核心', required: true,
          impact: '设置页的保存与读取中断，界面设置可能无法生效。' },
        { file: 'knowledge-ui.js', name: '知识库界面', group: '核心', required: true,
          impact: '知识库的上传、预览与管理界面打不开。' },
        { file: 'worldbook.js', name: '世界书', group: '核心', required: true,
          impact: '世界书条目不再注入提示词，世界书编辑界面也不可用。' },
        { file: 'image-tools.js', name: '图片裁切与压缩', group: '核心', required: true,
          impact: '头像、背景、聊天图片的裁切与压缩入口失效。' },
        { file: 'storage-inspector.js', name: '存储使用情况', group: '核心', required: true,
          impact: '「查看存储使用情况」打不开，定向清理也无法使用。' },
        { file: 'main.js', name: '主程序', group: '核心', required: true,
          impact: '整个聊天界面不会启动：角色列表、输入框、设置都不会初始化。' },
        { file: 'chat.js', name: '聊天逻辑', group: '核心', required: true,
          impact: '发送、接收与渲染消息的主流程缺失，无法正常聊天。' },

        { file: 'chat-hooks.js', name: '聊天挂钩中心', group: '扩展', required: false,
          impact: '正则脚本、提示词预设等扩展不再自动接入聊天流程（对应功能静默失效，数据不丢）。' },
        { file: 'regex-scripts.js', name: '正则脚本', group: '扩展', required: false,
          impact: '正则自动替换全部失效；「设置 → 插件」里的正则管理入口也消失。脚本数据保留。' },
        { file: 'chat-translate.js', name: '聊天翻译', group: '扩展', required: false,
          impact: '消息气泡上的「译」按钮与聊天翻译设置不可用。译文缓存保留在本机。' },
        { file: 'chat-checkpoints.js', name: '聊天检查点', group: '扩展', required: false,
          impact: '检查点 / 消息分叉入口失效。已创建的检查点不会被删除，重新开启后恢复。' },
        { file: 'prompt-presets.js', name: '提示词预设', group: '扩展', required: false,
          impact: '预设文本不再注入请求；「设置 → 插件」里的预设面板也消失。预设数据保留。' },
        { file: 'vn-live2d.js', name: 'VN Live2D 立绘', group: '扩展', required: false,
          impact: '视觉小说模式只能用静态立绘，不再支持 Live2D 模型。已配置的模型地址保留在本机。' },
        { file: 'image-gen.js', name: 'AI 图像生成', group: '扩展', required: false,
          impact: '/img 命令与「设置 → 插件」里的图像生成面板失效；聊天与 ComfyUI 实验室不受影响。已存的设置保留在本机。' },
        { file: 'chat-vector-memory.js', name: '聊天向量记忆', group: '扩展', required: false,
          impact: '聊天记录不再自动向量化与语义检索；已建的索引留在本机不会被删除，重新开启后继续可用。' },
        { file: 'script-runner.js', name: '消息脚本', group: '扩展', required: false,
          impact: '「设置 → 插件 → 消息脚本」入口消失，已保存的脚本不再运行（代码保留在本机）。' },
        { file: 'data-bank.js', name: '数据银行', group: '扩展', required: false,
          impact: '数据银行资料不再注入提示词；「设置 → 插件」里的数据银行面板也消失。资料保留在本机。' },
        { file: 'persona-ai.js', name: '人设 AI 生成', group: '扩展', required: false,
          impact: '人设编辑区的「AI 生成人设」按钮消失；手动编写人设不受影响。' },
        { file: 'english-mode.js', name: 'AI 英文模式', group: '扩展', required: false,
          impact: '「设置 → 更多 → AI 英文模式」的开关面板消失，AI 回到按角色卡语言回复；其它功能不受影响。' },
        { file: 'prompt-optimizer.js', name: '提示词优化', group: '增强', required: false,
          impact: '发送前的提示词优化（压缩、去重）不再运行，对话本身仍可用。' },
        { file: 'feature-models.js', name: '功能专用模型', group: '增强', required: false,
          impact: '记忆、总结等功能不能再单独指定模型，会回退到当前聊天模型。' },
        { file: 'api-cache-optimizer.js', name: '缓存优化', group: '增强', required: false,
          impact: '「AI 配置 → 缓存优化」面板与「界面外观 → 缓存命中率」消失，请求不会做前缀缓存优化（不影响正常聊天）。' },
        { file: 'tts-engine.js', name: '语音合成', group: '增强', required: false,
          impact: '消息朗读与 TTS 设置不可用。文字聊天不受影响。' },
        { file: 'stt-engine.js', name: '语音转文字', group: '增强', required: false,
          impact: '语音输入按钮的「录音上传转文字」模式不可用，回退浏览器原生识别或录音发送。' },
        { file: 'voice-lab.js', name: '语音通话', group: '增强', required: false,
          impact: '实验室里的语音通话 / 视频通话与声音工坊不可用（依赖 TTS / STT 两个模块）。' },
        { file: 'code-mode.js', name: 'Code 模式', group: '实验室', required: false,
          impact: '实验室里的 Code 模式开关消失；写代码时会重新受「单条回复上限」的默认值限制（长代码容易被截断）。' },
        { file: 'prompt-rewriter.js', name: '提示词改写', group: '增强', required: false,
          impact: '「用 AI 改写提示词」入口失效。已写好的提示词仍会照常使用。' },
        { file: 'context-compressor.js', name: '上下文压缩', group: '增强', required: false,
          impact: '超长对话不再自动压缩上下文，长聊可能更快触达上下文上限。' },
        { file: 'plugins.js', name: '插件系统', group: '增强', required: false,
          impact: '已安装的插件全部不运行，插件页与「用 AI 编写插件」也打不开。' },
        { file: 'optimizations.js', name: '输入与渲染增强', group: '增强', required: false,
          impact: '语音输入、公式与流程图渲染等增强失效，基础聊天不受影响。' },
        { file: 'advanced-features.js', name: '高级功能', group: '增强', required: false,
          impact: '分支树、对话统计等高级入口不可用。' },
        { file: 'performance-fix.js', name: '长对话性能优化', group: '增强', required: false,
          impact: '超长对话不再做渲染节流，消息很多时滚动可能变卡。聊天内容不受影响。' },
        { file: 'search-history.js', name: '搜索历史', group: '增强', required: false,
          impact: '各搜索框不再弹出历史记录下拉；搜索本身不受影响。' },

        { file: 'laboratory-3d.js', name: '3D 实验室', group: '实验室', required: false,
          impact: '实验室里的 3D 模型查看器打不开。已导入的模型文件不会被删除。' },
        { file: 'board-games.js', name: '五子棋与围棋', group: '实验室', required: false,
          impact: '实验室的五子棋、围棋入口失效。进行中的棋局不会被删除。' },
        /* 森林冰火人体积大（物理引擎 + BFS 规划器 + 三关数据），且不是人人会玩，
           所以 defaultOff：没在面板里手动勾过就**不加载**，省首屏流量。
           勾选并刷新后，实验室里的「进入森林」按钮才生效。 */
        { file: 'forest-icefire.js', name: '森林冰火人', group: '实验室', required: false, defaultOff: true,
          impact: '实验室的森林冰火人入口失效（本脚本默认就不加载，勾选后刷新才下载）。不占用任何存储。' },
        /* 创意工坊只在有人想做关卡时才需要，体积和冰火人分开，单独 defaultOff。
           它依赖森林冰火人：只勾工坊、不勾冰火人，打开时会提示先把两个都勾上。 */
        { file: 'icefire-workshop.js', name: '冰火人工坊', group: '实验室', required: false, defaultOff: true,
          impact: '实验室的「创意工坊」入口失效（本脚本默认就不加载，勾选后刷新才下载）。已做好的关卡存在本机，不会被删除。' },
        /* 学习辅导含错题本（IndexedDB）、分步讲解、流式渲染等，体积也不小，
           同样 defaultOff：没在面板里手动勾过就**不加载**。
           勾选并刷新后，设置 → 实验室里才会出现「学习辅导」面板。 */
        { file: 'learn-tutor.js', name: '学习辅导', group: '实验室', required: false, defaultOff: true,
          impact: '实验室的「学习辅导」入口失效（本脚本默认就不加载，勾选后刷新才下载）。错题本数据存在本机，不会被删除。' },
        { file: 'comfyui-lab.js', name: 'ComfyUI 实验室', group: '实验室', required: false,
          impact: 'ComfyUI 出图入口失效。已保存的 workflow 不会被删除。' },
        { file: 'mystery-motion.js', name: '？？？模式动效', group: '外观', required: false,
          impact: '？？？模式退回普通动效，弹窗抽出、消息入场动画不再播放。' },
        { file: 'vn-mode.js', name: '视觉小说模式', group: '外观', required: false,
          impact: '视觉小说舞台、立绘与打字机全部不可用，只能用普通聊天气泡。' },
        { file: 'vn-export.js', name: '视觉小说导出', group: '外观', required: false,
          impact: '「导出为视觉小说」两个按钮失效。普通的 JSON / TXT 导出不受影响。' },
        { file: 'affinity.js', name: '好感度系统', group: '实验室', required: false,
          impact: '好感度数值不再变化，也不再注入提示词。已有数值不会被删除。' },
        { file: 'live-room.js', name: 'AI 直播间', group: '实验室', required: false,
          impact: '实验室的「AI 直播间」入口失效。直播存档（连麦 / 弹幕 / 礼物记录）存在本机，不会被删除。' },
        { file: 'werewolf.js', name: '狼人杀', group: '实验室', required: false,
          impact: '实验室的「狼人杀」入口失效。存档在本机，重新开启后可继续上一局。' },
        { file: 'undercover.js', name: '谁是卧底', group: '实验室', required: false,
          impact: '实验室的「谁是卧底」入口失效。存档在本机，重新开启后可继续上一局。' },
        { file: 'ad-lab.js', name: '广告跳跳乐', group: '实验室', required: false,
          impact: '实验室的模拟广告（开屏/弹窗/banner/浮标/内容广告）全部不再出现。关掉后论坛、文档、市场页也不会再有模拟广告。' },
        { file: 'fold-panels.js', name: '设置折叠板', group: '外观', required: false,
          impact: '把「实验室各功能配置 / 插件权限总开关 / 更多→刷新网站」收进折叠板，减少设置页翻动距离。关掉后这些配置会一直全部展开。' },
        { file: 'avatar-frame.js', name: '自定义头像框', group: '外观', required: false,
          impact: '设置里的头像框面板不再出现，聊天与角色列表的头像也不再套框。已上传的框仍保存在本机，重新开启后会恢复。' },
        { file: 'first-run-guide.js', name: '首次使用引导', group: '外观', required: false,
          impact: '新设备第一次打开时不再弹出引导。已经用过的不受影响。' },
        { file: 'user-space.js', name: '用户代码空间', group: '实验室', required: false,
          impact: '「设置 → 实验室」里的用户代码空间面板与 /空间ID 访问入口不再可用。已创建的空间代码仍保存在本机，重新开启后恢复。' },
        { file: 'user-space-workbench.js', name: '空间工作台（用户代码空间 · 工作台版）', group: '实验室', required: false,
          impact: '用户代码空间只能用经典版界面；已经切成工作台版的空间打开时会自动回退到经典版。空间里的文件、会话以外的代码都不受影响，重新开启后恢复。' },
        { file: 'chat-vars.js', name: '变量与状态栏', group: '聊天', required: false,
          impact: '聊天区顶部的状态栏不再显示，{{getvar}} / {{setvar}} / {{roll}} 等宏不再展开，AI 回复里的变量指令也不会被执行（会原样显示成文字）。已记录的变量仍保存在本机，重新开启后恢复。' }
    ];
    var byFile = {};
    SCRIPTS.forEach(function (s) { byFile[s.file] = s; });

    function readSettings() {
        try {
            var raw = localStorage.getItem(STORAGE_KEY);
            var parsed = raw ? JSON.parse(raw) : {};
            return parsed && typeof parsed === 'object' ? parsed : {};
        } catch (e) {
            return {};
        }
    }

    var _isEnabledDepth = 0;

    function isEnabled(file) {
        var meta = byFile[file];
        if (!meta) return true;          // 不认识的文件保持加载，避免误伤
        if (meta.required) return true;
        var settings = readSettings();
        var on;
        // defaultOff 的脚本（如森林冰火人）反过来：没显式勾过就不加载
        if (meta.defaultOff) on = settings[file] === true;
        else on = settings[file] !== false; // 没保存过 = 默认加载

        /* 依赖级联：自己开着，但依赖的模块被关了 —— 那它实际上也跑不起来
           （例如开着「语音通话」却关了「语音合成」）。直接按关闭处理，
           免得它半启动后到处报错；面板上会显示成「已锁定」并说明原因。 */
        if (on) {
            var deps = (typeof REQUIRES === 'object' && REQUIRES && REQUIRES[file]) || [];
            if (deps.length && _isEnabledDepth < 6) {
                _isEnabledDepth++;
                var blocked = deps.some(function (d) {
                    return byFile[d] && !isEnabled(d);
                });
                _isEnabledDepth--;
                if (blocked) return false;
            }
        }
        return on;
    }

    function enabledOptional() {
        return SCRIPTS.filter(function (s) { return !s.required && isEnabled(s.file); });
    }

    function disabledOptional() {
        return SCRIPTS.filter(function (s) { return !s.required && !isEnabled(s.file); });
    }

        /**
     * 并行下载、按序执行：一次性把全部 <script> 插入 DOM 并设 async=false。
     * 按规范，动态插入的脚本设 async=false 后**仍按插入顺序执行**（与原来
     * 逐个串行等待完全等价），但下载是并行的。
     * 【为什么改】原实现是「等前一个 onload 再插入下一个」，几十个文件就要串行
     */
    var BUNDLES = {
        'mysw-extensions.js': [
            'chat-hooks.js', 'english-mode.js', 'regex-scripts.js', 'chat-translate.js',
            'chat-checkpoints.js', 'prompt-presets.js', 'vn-live2d.js', 'image-gen.js',
            'chat-vector-memory.js', 'script-runner.js', 'data-bank.js', 'persona-ai.js',
            'prompt-optimizer.js', 'feature-models.js', 'api-cache-optimizer.js',
            'tts-engine.js', 'stt-engine.js', 'voice-lab.js', 'code-mode.js',
            'prompt-rewriter.js', 'context-compressor.js', 'plugins.js', 'optimizations.js',
            'advanced-features.js', 'performance-fix.js', 'search-history.js', 'laboratory-3d.js',
            'board-games.js', 'comfyui-lab.js', 'mystery-motion.js', 'vn-mode.js',
            'live-room.js', 'vn-export.js', 'affinity.js', 'first-run-guide.js',
            'user-space.js', 'fold-panels.js', 'avatar-frame.js'
            /* 注：jev.js（Jev 模型接入）的代码已并入本包，但它没有独立开关条目、
               无法单独启用或关闭，因此不列入成员表。此前这里误留过一个同名
               幽灵名：isEnabled() 对未登记文件恒返回 true，会让「任一成员启用」
               判定恒为真 ——「只留必须加载」后合并包仍被整包下载，省流量开关
               形同虚设。删除后语义才正确：无成员启用 = 不下载整包。 */
        ]
    };

    function loadOptional(files) {
        (files || []).forEach(function (src) {
            var members = BUNDLES[src];
            if (members) {
                var any = members.some(isEnabled);
                if (!any) return;                 // 全部成员都被关闭：不下载合并包
                appendScript(src);
            } else if (isEnabled(src)) {
                appendScript(src);
            }
        });
    }

    function appendScript(src) {
        var el = document.createElement('script');
        el.src = src;
        el.async = false;
        document.body.appendChild(el);
    }

    function summaryText() {
        var off = disabledOptional();
        var optional = SCRIPTS.filter(function (s) { return !s.required; }).length;
        var required = SCRIPTS.length - optional;
        if (!off.length) {
            return '当前全部加载：' + required + ' 个必须加载，' + optional + ' 个可选功能都开着。';
        }
        var names = off.slice(0, 4).map(function (s) { return s.name; });
        var more = off.length > 4 ? ' 等 ' + off.length + ' 项' : '';
        return '已关闭 ' + off.length + ' / ' + optional + ' 个可选脚本（' + names.join('、') + more + '）。必须加载的 ' + required + ' 个始终开启。刷新后生效。';
    }

    function refreshSummary() {
        var el = document.getElementById('script-loader-summary');
        if (el) el.textContent = summaryText();
    }

    /* ---------------- 面板（样式沿用存储使用情况的 si-* 类） ---------------- */

    var overlayEl = null;

    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function toast(msg, icon) {
        try {
            if (typeof window.showToast === 'function') window.showToast(msg, icon || 'ri-information-line');
        } catch (e) {}
    }

    function close() {
        if (!overlayEl) return;
        overlayEl.classList.remove('show');
        var el = overlayEl;
        overlayEl = null;
        setTimeout(function () { try { el.remove(); } catch (e) {} }, 200);
        document.removeEventListener('keydown', onEsc, true);
    }
    function onEsc(e) {
        if (e.key === 'Escape') { e.stopPropagation(); close(); }
    }

    function saveFromPanel() {
        var settings = readSettings();
        var changed = false;
        overlayEl.querySelectorAll('[data-sl-file]').forEach(function (cb) {
            var file = cb.getAttribute('data-sl-file');
            var meta = byFile[file];
            if (!meta || meta.required) return;
            var next = cb.checked ? true : false;
            // 【BUG 修复】旧逻辑无条件「勾选就删记录」，因为它假设
            // 「没有记录 = 默认开启」。但 defaultOff 的脚本（森林冰火人）
            // 语义相反：没有记录 = 默认**不**加载，必须显式存 true 才生效。
            // 旧写法下用户勾选保存后记录被删掉，刷新后 isEnabled 仍返回 false，
            // 脚本不加载、入口按钮一直提示「去设置里启用」—— 勾了等于没勾。
            // 现在按各自默认值决定「存」还是「删」：
            //   defaultOn ：勾选=删记录（默认开），取消=存 false
            //   defaultOff：勾选=存 true，取消=删记录（默认关）
            if (isEnabled(file) !== next) changed = true;
            if (meta.defaultOff) {
                if (next) settings[file] = true;
                else delete settings[file];
            } else {
                if (next) delete settings[file];
                else settings[file] = false;
            }
        });
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)); } catch (e) {}
        refreshSummary();
        return changed;
    }

    function render() {
        var groups = [];
        var seen = {};
        SCRIPTS.forEach(function (s) {
            if (!seen[s.group]) { seen[s.group] = []; groups.push(s.group); }
            seen[s.group].push(s);
        });
        var off = disabledOptional().length;
        var optional = SCRIPTS.filter(function (s) { return !s.required; }).length;

        var html = '' +
            '<div class="si-sum">' +
            '  <div class="si-card"><b>' + SCRIPTS.length + '</b><span>页面会用到的脚本</span></div>' +
            '  <div class="si-card"><b>' + (SCRIPTS.length - optional) + '</b><span>必须加载（已锁定）</span></div>' +
            '  <div class="si-card"><b>' + (optional - off) + ' / ' + optional + '</b><span>可选功能当前开启</span></div>' +
            '  <div class="si-card"><b>' + off + '</b><span>已关闭，刷新后不下载</span></div>' +
            '</div>' +
            '<p class="si-foot" style="margin-top:-6px">勾选 = 下次打开网站时加载。' +
            '带红标的脚本<strong>必须加载</strong>，关掉会导致聊天、角色或设置不可用，所以开关已锁死。' +
            '其余脚本关掉后，只是对应功能入口消失或点了没有反应，<strong>不会删除任何数据</strong>。</p>';

        groups.forEach(function (group) {
            var list = seen[group];
            var requiredHere = list.filter(function (s) { return s.required; }).length;
            html += '<div class="si-sec"><i class="ri-folder-3-line"></i> ' + esc(group) +
                ' <small>' + list.length + ' 个' +
                (requiredHere ? '，其中 ' + requiredHere + ' 个必须加载' : '，都可以关闭') +
                '</small></div>';
            html += '<div class="si-list">';
            list.forEach(function (s) {
                var on = isEnabled(s.file);
                var st = featureState(s.file);
                var tag = s.required
                    ? '<span class="si-tag d2">必须加载</span>'
                    : '<span class="si-tag d0">可关闭</span>';
                // 勾着却没生效：多半是依赖的模块被关了，这里给个明确标记
                if (st.locked && !st.locked.core) {
                    tag += '<span class="si-tag d2">依赖未开</span>';
                }
                var where = s.remote
                    ? '<span class="si-tag">CDN</span>'
                    : '<span class="si-tag">本站</span>';
                html += '<div class="si-row">' +
                    '<input type="checkbox" id="sl-' + esc(s.file) + '" data-sl-file="' + esc(s.file) + '"' +
                    (on ? ' checked' : '') + (s.required ? ' disabled' : '') + '>' +
                    '<label class="si-main" for="sl-' + esc(s.file) + '">' +
                    '  <span class="si-name"><b>' + esc(s.name) + '</b>' + tag + where + '</span>' +
                    '  <span class="si-key">' + esc(s.file) + '</span>' +
                    '  <span class="si-note">' + (s.required ? '不加载的影响：' : '关闭后：') + esc(s.impact) + '</span>' +
                    '</label>' +
                    '</div>';
            });
            html += '</div>';
        });

        html += '<div class="si-selbar"><span>当前关闭 <b id="sl-off-count">' + off + '</b> 个可选脚本</span></div>' +
            '<div class="si-ops">' +
            '  <button type="button" class="btn btn-primary" id="sl-save"><i class="ri-save-line"></i> 保存</button>' +
            '  <button type="button" class="btn btn-outline" id="sl-all"><i class="ri-checkbox-multiple-line"></i> 全部加载</button>' +
            '  <button type="button" class="btn btn-outline" id="sl-min"><i class="ri-subtract-line"></i> 只留必须加载</button>' +
            '  <button type="button" class="btn btn-outline" id="sl-reload" hidden><i class="ri-restart-line"></i> 立即刷新页面</button>' +
            '</div>' +
            '<p class="si-foot">' +
            '· 保存后需要<strong>刷新页面</strong>才真正生效：已经下载过的脚本，这一次刷新之前仍会继续运行。<br>' +
            '· 「只留必须加载」会关掉视觉小说、实验室、插件、语音、好感度等全部可选功能，基础聊天仍可用。<br>' +
            '· 选择只存在这台浏览器里；清除网站数据后，每个脚本回到自己的默认状态' +
            '（绝大多数默认加载，森林冰火人这类大体积功能默认不加载）。</p>';
        return html;
    }


    function updateOffCount() {
        if (!overlayEl) return;
        var n = 0;
        overlayEl.querySelectorAll('[data-sl-file]').forEach(function (cb) {
            if (!cb.disabled && !cb.checked) n++;
        });
        var el = document.getElementById('sl-off-count');
        if (el) el.textContent = String(n);
    }

    function markDirty() {
        var btn = document.getElementById('sl-reload');
        if (btn) btn.hidden = false;
    }

    function open() {
        if (overlayEl && document.body.contains(overlayEl)) return;
        // 复用 storage-inspector.js 注入的 si-* 样式；它还没跑过时自己补一份最小样式。
        if (!document.getElementById('storage-inspector-style') && !document.getElementById('script-loader-style')) {
            var st = document.createElement('style');
            st.id = 'script-loader-style';
            st.textContent = '.si-sum{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin-bottom:14px}' +
                '.si-card{padding:11px 12px;border:1px solid rgba(255,255,255,.1);border-radius:10px;background:rgba(255,255,255,.04)}' +
                '.si-card b{display:block;font-size:1.15em;color:#e6c78a;margin-bottom:3px}' +
                '.si-card span{font-size:.76em;color:#9aa0ad}' +
                '.si-sec{margin:18px 0 8px;font-size:.95em;color:#e6c78a;display:flex;align-items:center;gap:7px}' +
                '.si-sec small{color:#8d93a1;font-weight:400;font-size:.82em}' +
                '.si-list{max-height:min(46vh,420px);overflow:auto;border:1px solid rgba(255,255,255,.08);border-radius:10px;padding:6px;background:rgba(0,0,0,.14)}' +
                '.si-row{display:flex;align-items:center;gap:9px;padding:7px 8px;border-radius:8px}' +
                '.si-row input{width:17px;height:17px;margin:0;flex:0 0 auto}' +
                '.si-main{flex:1 1 auto;min-width:0}' +
                '.si-name{font-size:.88em;display:flex;align-items:center;gap:6px;flex-wrap:wrap}' +
                '.si-key{font-size:.72em;color:#7f8593;font-family:ui-monospace,Menlo,Consolas,monospace}' +
                '.si-note{font-size:.72em;color:#8d93a1;line-height:1.5;margin-top:2px}' +
                '.si-tag{font-size:.66em;padding:1px 6px;border-radius:999px;border:1px solid rgba(255,255,255,.16);color:#b6bbc8}' +
                '.si-tag.d2{border-color:rgba(255,110,110,.45);color:#ff9a9a;background:rgba(255,80,80,.09)}' +
                '.si-tag.d0{border-color:rgba(120,220,150,.35);color:#8fe0a8}' +
                '.si-ops{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px;padding-top:12px;border-top:1px dashed rgba(255,255,255,.14)}' +
                '.si-foot{margin-top:12px;font-size:.76em;color:#8d93a1;line-height:1.65}' +
                '.si-selbar{margin-top:8px;font-size:.82em;color:#b6bbc8}.si-selbar b{color:#e6c78a}';
            document.head.appendChild(st);
        }

        overlayEl = document.createElement('div');
        overlayEl.className = 'modal-overlay show';
        overlayEl.id = 'script-loader-modal';
        overlayEl.style.zIndex = '3000';
        overlayEl.innerHTML =
            '<div class="modal-content vn-modal" style="max-width:820px">' +
            '  <div class="modal-header">' +
            '    <h2><i class="ri-code-s-slash-line"></i> 加载 JS 文件设置</h2>' +
            '    <button type="button" class="close-modal" id="sl-close" aria-label="关闭"><i class="ri-close-line"></i></button>' +
            '  </div>' +
            '  <div class="modal-body si-wrap" id="sl-body">' + render() + '</div>' +
            '</div>';
        document.body.appendChild(overlayEl);
        overlayEl.addEventListener('click', function (e) { if (e.target === overlayEl) close(); });
        document.getElementById('sl-close').addEventListener('click', close);
        document.addEventListener('keydown', onEsc, true);

        bindBody();
    }

    /* 绑定面板正文（#sl-body）里的交互。
       必须在两处调用：① 首次打开面板；② 「恢复全部加载」重建正文之后 ——
       旧实现重建正文时只替换 innerHTML、不重绑事件，导致保存 / 全部加载 /
       只留必须加载 / 复选框计数全部失灵，用户必须关掉面板再打开才能继续操作。 */
    function bindBody() {
        if (!overlayEl) return;
        var body = document.getElementById('sl-body');
        if (!body) return;
        body.querySelectorAll('[data-sl-file]').forEach(function (cb) {
            cb.addEventListener('change', updateOffCount);
        });
        document.getElementById('sl-save').addEventListener('click', function () {
            var changed = saveFromPanel();
            markDirty();
            toast(changed ? '已保存，刷新页面后生效' : '没有改动，已保持当前设置', 'ri-check-line');
        });
        document.getElementById('sl-all').addEventListener('click', function () {
            body.querySelectorAll('[data-sl-file]').forEach(function (cb) { if (!cb.disabled) cb.checked = true; });
            updateOffCount();
        });
        document.getElementById('sl-min').addEventListener('click', function () {
            body.querySelectorAll('[data-sl-file]').forEach(function (cb) { if (!cb.disabled) cb.checked = false; });
            updateOffCount();
        });
        document.getElementById('sl-reload').addEventListener('click', function () { location.reload(); });
    }

    function resetAll() {
        // 「恢复为全部加载」：defaultOn 的脚本删记录即可（默认开），
        // 但 defaultOff 的脚本（森林冰火人）默认是关的，
        // 光删 key 会让它回到「不加载」，与按钮文案「全部加载」矛盾。
        // 所以给 defaultOff 显式写 true。
        var settings = {};
        SCRIPTS.forEach(function (s) {
            if (!s.required && s.defaultOff) settings[s.file] = true;
        });
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)); } catch (e) {}
        refreshSummary();
        toast('已恢复为全部加载，刷新页面后生效', 'ri-restart-line');
    }

    /* ==================== 功能开关（按功能看，按模块关） ====================
       用户认的是「功能」，不是 js 文件名。这里把每个模块翻译成一句人话，
       并明确三件事：
         ① 关掉后刷新，独立文件真的不再下载；合并包里的功能不再运行；
         ② 想关的功能**不可能**关：核心模块 + 这个面板自己都钉死；
         ③ 依赖的模块被关掉时，依赖它的功能显示「已锁定」，并告诉你去开哪个。
       ------------------------------------------------------------------ */

    /* 功能之间的依赖：被依赖的模块关掉 → 依赖方锁上，而不是静默坏掉 */
    var REQUIRES = {
        'regex-scripts.js': ['chat-hooks.js'],
        'prompt-presets.js': ['chat-hooks.js'],
        'english-mode.js': ['chat-hooks.js'],
        'prompt-optimizer.js': ['chat-hooks.js'],
        'prompt-rewriter.js': ['chat-hooks.js'],
        'data-bank.js': ['chat-hooks.js'],
        'script-runner.js': ['chat-hooks.js'],
        'chat-translate.js': ['chat-hooks.js'],
        'voice-lab.js': ['tts-engine.js', 'stt-engine.js'],
        'vn-live2d.js': ['vn-mode.js'],
        'icefire-workshop.js': ['forest-icefire.js']
    };

    function byFileOf(file) { return byFile[file] || null; }

    /** 这个功能现在能不能开关：返回 { enabled, locked: null | {by:[{file,name}]}, pinned } */
    function featureState(file) {
        var meta = byFileOf(file);
        if (!meta) return { enabled: true, locked: null, pinned: false };
        if (meta.required) {
            return { enabled: true, locked: { core: true, by: [] }, pinned: !!meta.pinned };
        }
        var deps = REQUIRES[file] || [];
        var blocked = deps.filter(function (d) { return byFileOf(d) && !isEnabled(d); })
            .map(function (d) { return { file: d, name: byFileOf(d).name }; });
        return {
            enabled: isEnabled(file),
            locked: blocked.length ? { core: false, by: blocked } : null,
            pinned: false
        };
    }

    function setOne(file, on) {
        var meta = byFileOf(file);
        if (!meta || meta.required) return false;
        var settings = readSettings();
        if (meta.defaultOff) {
            if (on) settings[file] = true; else delete settings[file];
        } else {
            if (on) delete settings[file]; else settings[file] = false;
        }
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)); } catch (e) { }
        return true;
    }

    /* ---------- 面板样式：跟随主题变量，不写死颜色 ---------- */
    function injectFeatureStyle() {
        if (document.getElementById('sl-feature-style')) return;
        var css = [
            '.feat-note{font-size:.82em;line-height:1.7;color:var(--text-secondary,#a9afbd);margin:0 0 12px;}',
            '.feat-dirty{display:none;align-items:center;gap:10px;margin:0 0 14px;padding:9px 12px;border-radius:10px;',
            '  background:rgba(var(--accent-gold-rgb,230,199,138),.10);border:1px solid rgba(var(--accent-gold-rgb,230,199,138),.35);',
            '  font-size:.82em;}',
            '.feat-dirty.on{display:flex;}',
            '.feat-dirty span{flex:1;}',
            '.feat-group{margin:0 0 18px;}',
            '.feat-group > h4{margin:0 0 6px;font-size:.86em;letter-spacing:.04em;',
            '  color:var(--text-muted,#8f96a3);text-transform:none;font-weight:700;}',
            '.feat-row{display:flex;gap:12px;align-items:flex-start;padding:11px 2px;',
            '  border-bottom:1px solid var(--border-color,#3a3d47);}',
            '.feat-row:last-child{border-bottom:0;}',
            '.feat-main{flex:1;min-width:0;}',
            '.feat-name{display:flex;align-items:center;gap:6px;flex-wrap:wrap;font-size:.92em;font-weight:600;}',
            '.feat-impact{margin:3px 0 0;font-size:.78em;line-height:1.6;color:var(--text-muted,#8f96a3);}',
            '.feat-tag{font-size:.68em;font-weight:700;padding:1px 6px;border-radius:999px;',
            '  color:var(--text-muted,#8f96a3);box-shadow:inset 0 0 0 1px var(--border-color,#4a4f5d);}',
            '.feat-tag.is-lock{color:#e0a24a;box-shadow:inset 0 0 0 1px rgba(224,162,74,.45);}',
            '.feat-tag.is-bundle{color:#8fd8ff;box-shadow:inset 0 0 0 1px rgba(143,216,255,.35);}',
            '.feat-lockmsg{margin:6px 0 0;font-size:.78em;line-height:1.6;color:#e0a24a;}',
            '.feat-sw{flex:0 0 auto;display:flex;align-items:center;justify-content:center;',
            '  width:40px;height:22px;margin-top:3px;position:relative;cursor:pointer;}',
            '.feat-sw input{position:absolute;inset:0;width:100%;height:100%;margin:0;opacity:0 !important;',
            '  -webkit-appearance:none !important;appearance:none !important;cursor:pointer;z-index:1;}',
            '.feat-sw i{display:block;width:40px;height:22px;border-radius:999px;background:rgba(140,146,160,.30);',
            '  transition:background .18s ease;position:relative;pointer-events:none;}',
            '.feat-sw i::after{content:"";position:absolute;top:3px;left:3px;width:16px;height:16px;border-radius:50%;',
            '  background:#fff;transition:transform .18s ease;box-shadow:0 1px 3px rgba(0,0,0,.35);}',
            '.feat-sw input:checked + i{background:var(--accent-gold,#e6c78a);}',
            '.feat-sw input:checked + i::after{transform:translateX(18px);}',
            '.feat-sw input:disabled + i{opacity:.42;}',
            '.feat-lock{flex:0 0 auto;display:flex;align-items:center;justify-content:center;width:40px;height:22px;',
            '  color:#e0a24a;opacity:.85;font-size:1em;}',
            '.feat-core{border:1px solid var(--border-color,#3a3d47);border-radius:10px;padding:0 12px;margin:0 0 18px;}',
            '.feat-core > summary{cursor:pointer;list-style:none;padding:11px 0;font-size:.86em;font-weight:700;',
            '  color:#e0a24a;display:flex;align-items:center;gap:7px;}',
            '.feat-core > summary::-webkit-details-marker{display:none;}',
            '.feat-core > summary::before{content:"";width:5px;height:5px;border-right:1.5px solid currentColor;',
            '  border-bottom:1.5px solid currentColor;transform:rotate(-45deg);opacity:.7;transition:transform .18s ease;}',
            '.feat-core[open] > summary::before{transform:rotate(45deg);}',
            '.feat-core .feat-row:last-child{border-bottom:0;}',
            '.feat-core-note{margin:0 0 10px;font-size:.78em;line-height:1.6;color:var(--text-muted,#8f96a3);}',
            '.feat-foot{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-top:6px;}'
        ].join('');
        var style = document.createElement('style');
        style.id = 'sl-feature-style';
        style.textContent = css;
        document.head.appendChild(style);
    }

    function featureRowHtml(s) {
        var st = featureState(s.file);
        var tags = [];
        if (s.required) tags.push('<span class="feat-tag is-lock">核心</span>');
        if (s.pinned) tags.push('<span class="feat-tag is-lock">面板自身</span>');
        if (BUNDLES['mysw-extensions.js'].indexOf(s.file) >= 0) tags.push('<span class="feat-tag is-bundle">同包</span>');
        if (s.defaultOff) tags.push('<span class="feat-tag">默认不加载</span>');

        /* 锁定原因只在真正需要解释时写出来：核心模块在区块头上统一说一遍就够了，
           逐条重复 17 遍黄字只会把可选功能淹掉。 */
        var lockMsg = '';
        if (st.locked && st.locked.core) {
            lockMsg = st.pinned ? '这个开关就是面板自己 —— 关掉之后你就再也调不回来了，所以锁死。' : '';
        } else if (st.locked) {
            lockMsg = '已锁定：依赖的「' + st.locked.by.map(function (b) { return b.name; }).join('、')
                + '」是关闭状态。先去把那一项打开、刷新页面，再回来调这个。';
        }

        var checked = st.enabled ? ' checked' : '';
        var right = (st.locked || s.required)
            ? '<span class="feat-lock" title="' + (st.locked && st.locked.core ? '基础功能，不能关' : '已锁定') + '"><i class="ri-lock-line"></i></span>'
            : '<label class="feat-sw" title="开 / 关">'
                + '<input type="checkbox" data-feat-file="' + esc(s.file) + '"' + checked + '>'
                + '<i></i></label>';
        return ''
            + '<div class="feat-row" data-feat-row="' + esc(s.file) + '">'
            + '  <div class="feat-main">'
            + '    <div class="feat-name">' + esc(s.name) + tags.join('') + '</div>'
            + '    <p class="feat-impact">' + esc(s.impact) + '</p>'
            + (lockMsg ? '<p class="feat-lockmsg"><i class="ri-lock-line"></i> ' + esc(lockMsg) + '</p>' : '')
            + '  </div>' + right
            + '</div>';
    }

    function renderFeaturePanel() {
        var host = document.getElementById('feature-panel-body');
        if (!host) return;
        injectFeatureStyle();

        var core = SCRIPTS.filter(function (s) { return s.required; });
        var optional = SCRIPTS.filter(function (s) { return !s.required; });
        var groups = [];
        var seen = {};
        optional.forEach(function (s) {
            if (!seen[s.group]) { seen[s.group] = []; groups.push(s.group); }
            seen[s.group].push(s);
        });

        var html = ''
            + '<p class="feat-note">这里是按<b>功能</b>关，不用去认 js 文件名。'
            + '关掉之后<b>刷新页面</b>才生效：独立文件的功能不会再下载，合并包里的功能不会再运行（但包本身还会下载，因为别的功能还在用）。'
            + '被关掉的功能在页面上的入口会提示「已锁定」，点它只会告诉你先去哪打开。</p>'
            + '<div class="feat-dirty" id="feat-dirty"><span>改动已保存，刷新后生效。</span>'
            + '  <button type="button" class="btn btn-primary btn-sm" id="feat-refresh">立即刷新</button></div>'
            + '<details class="feat-core">'
            + '  <summary>核心功能 · ' + core.length + ' 项锁死</summary>'
            + '  <p class="feat-core-note">这些是页面跑起来的地基（渲染、对话、设置读写、本面板）。'
            + '关掉任何一项，站要么打不开要么没法再调回设置页，所以全部锁死 —— 列出来只是让你知道谁在干活。</p>'
            + core.map(featureRowHtml).join('')
            + '</details>';

        groups.forEach(function (g) {
            html += '<div class="feat-group"><h4>' + esc(g) + '</h4>'
                + seen[g].map(featureRowHtml).join('')
                + '</div>';
        });

        html += '<div class="feat-foot">'
            + '  <button type="button" class="btn btn-outline btn-sm" id="feat-open-filepanel">按文件管理（高级）</button>'
            + '  <span style="font-size:.78em;color:var(--text-muted,#8f96a3);" id="feat-sum">' + esc(summaryText()) + '</span>'
            + '</div>';

        host.innerHTML = html;

        host.querySelectorAll('[data-feat-file]').forEach(function (cb) {
            cb.addEventListener('change', function () {
                var file = cb.getAttribute('data-feat-file');
                if (file === 'script-loader.js') { cb.checked = true; return; }   // 双保险
                var ok = setOne(file, cb.checked);
                if (!ok) { cb.checked = true; return; }
                var dirty = document.getElementById('feat-dirty');
                if (dirty) dirty.classList.add('on');
                refreshSummary();
                var sum = document.getElementById('feat-sum');
                if (sum) sum.textContent = summaryText();
                // 依赖方可能要跟着解锁 / 上锁，整块重画最省心
                renderFeaturePanel();
                var d2 = document.getElementById('feat-dirty');
                if (d2) d2.classList.add('on');
                toast(cb.checked ? '已开启「' + (byFile[file] || {}).name + '」，刷新后生效'
                    : '已关闭「' + (byFile[file] || {}).name + '」，刷新后生效', 'ri-restart-line');
            });
        });
        var refreshBtn = host.querySelector('#feat-refresh');
        if (refreshBtn) refreshBtn.addEventListener('click', function () { location.reload(); });
        var openFile = host.querySelector('#feat-open-filepanel');
        if (openFile) openFile.addEventListener('click', function () { open(); });
    }

    /** 设置页里的「功能开关」标签页挂载（标签由 index.html 提供，内容在这里生成） */
    function mountFeaturePanel() {
        var host = document.getElementById('feature-panel-body');
        if (!host) return;
        renderFeaturePanel();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', mountFeaturePanel);
    } else {
        mountFeaturePanel();
    }

    /* ---------- 「功能被关掉」时的统一拦截 ----------
       给入口元素挂 data-requires-module="xxx.js"，模块没加载时点击一律拦下来，
       弹一句人话告诉用户去哪打开 —— 而不是让按钮看着像坏的。 */
    function lockMessage(file) {
        var meta = byFile[file];
        var name = meta ? meta.name : file;
        return '「' + name + '」现在是关闭状态，所以这个入口用不了。\n\n'
            + '要恢复：设置 → 功能开关 → 找到「' + name + '」打开 → 刷新页面。'
            + '（也可以到「导入导出 → 加载 JS 文件设置」里勾回来，两个地方是同一份开关。）';
    }

    function showLocked(file) {
        var msg = lockMessage(file);
        if (window.Dlg && typeof window.Dlg.alert === 'function') {
            window.Dlg.alert({ title: '这个功能被关掉了', message: msg });
            return;
        }
        try { window.alert(msg); } catch (e) { }
    }

    document.addEventListener('click', function (e) {
        var el = e.target && e.target.closest ? e.target.closest('[data-requires-module]') : null;
        if (!el) return;
        var file = el.getAttribute('data-requires-module');
        if (!file || isEnabled(file)) return;
        e.preventDefault();
        e.stopPropagation();
        showLocked(file);
    }, true);

    function bindEntry() {
        var openBtn = document.getElementById('script-loader-btn');
        var resetBtn = document.getElementById('script-loader-reset-btn');
        if (openBtn && !openBtn.dataset.slBound) {
            openBtn.dataset.slBound = '1';
            openBtn.addEventListener('click', open);
        }
        if (resetBtn && !resetBtn.dataset.slBound) {
            resetBtn.dataset.slBound = '1';
            resetBtn.addEventListener('click', function () {
                var ask = (window.Dlg && window.Dlg.confirm) || null;
                var go = function () {
                    resetAll();
                    if (overlayEl) {
                        document.getElementById('sl-body').innerHTML = render();
                        bindBody();   // 重建正文后必须重绑事件，否则本面板的按钮全部失灵
                        markDirty();  // 设置已改：亮出「立即刷新页面」，引导用户下一步
                    }
                };
                if (!ask) { if (window.confirm('恢复为全部加载？已关闭的脚本会在下次刷新时重新下载。')) go(); return; }
                ask({
                    title: '恢复全部加载',
                    message: '所有可选脚本都会重新打开，下次刷新页面时重新下载。不会改动任何聊天记录或设置。',
                    okText: '恢复',
                    cancelText: '取消'
                }).then(function (yes) { if (yes) go(); });
            });
        }
        refreshSummary();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bindEntry);
    } else {
        bindEntry();
    }

    window.ScriptLoader = {
        loadOptional: loadOptional,
        isEnabled: isEnabled,
        featureState: featureState,
        setEnabled: setOne,
        mountFeaturePanel: mountFeaturePanel,
        open: open,
        scripts: SCRIPTS
    };
})();
