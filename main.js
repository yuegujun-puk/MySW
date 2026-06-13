// 内置角色提示词、头像 URL 和默认角色数据已拆分到 characters.js


        let friendsData = {};

        function loadAllFriendsData() {
            friendsData = { ...defaultFriendsData };
            const storedCustom = localStorage.getItem('customFriendsData');
            if (storedCustom) {
                try {
                    const customData = JSON.parse(storedCustom);
                    Object.assign(friendsData, customData);
                } catch (e) {
                    console.error('加载自定义角色失败:', e);
                }
            }
            loadGroupManager();
        }

        function isGroupChat(friendId = currentFriendId) {
            return Boolean(groupManager?.[friendId]?.isGroup);
        }

        function saveGroupManager() {
            setLocalStorageSafely('groupManager_v1', JSON.stringify(groupManager), '群聊数据');
        }

        function loadGroupManager() {
            try {
                groupManager = JSON.parse(localStorage.getItem('groupManager_v1') || '{}');
            } catch (e) {
                console.warn('群聊数据读取失败，已重置:', e);
                groupManager = {};
            }
            Object.values(groupManager).forEach(group => registerGroupFriend(group));
        }

        function registerGroupFriend(group) {
            if (!group?.id) return;
            const memberAvatars = (group.memberIds || []).map(id => defaultFriendsData[id]?.avatar || friendsData[id]?.avatar).filter(Boolean);
            friendsData[group.id] = {
                id: group.id,
                name: group.name || '群聊',
                avatar: memberAvatars[0] || 'https://api.dicebear.com/7.x/bottts/svg?seed=group',
                group: '群聊',
                isGroup: true,
                welcomeMessage: `群聊「${group.name || '群聊'}」已创建，成员会按顺序轮流回复。`,
                systemPrompt: '这是一个多角色群聊容器。'
            };
        }

        function setLocalStorageSafely(key, value, label = '数据') {
            try {
                localStorage.setItem(key, value);
                return true;
            } catch (error) {
                console.error(`${label} 保存失败:`, error);
                const quotaExceeded = error?.name === 'QuotaExceededError' || error?.code === 22;
                const message = quotaExceeded
                    ? `${label} 保存失败：浏览器存储空间不足，请先导出备份并清理图片/知识库。`
                    : `${label} 保存失败：${error.message || error}`;
                if (typeof showToast === 'function') showToast(message, 'ri-database-2-line');
                return false;
            }
        }


        const customStickers = {
            love: "https://image.astrdark.cyou/file/1776440919272_c068ce6a3006a24adc0204ce20e65ed0_2631726729947107376.png",
            like: "https://image.astrdark.cyou/file/1776440906323_a55206e4ab5337c9dbdbe9f48e91222b_4801169524521296524.png",
            bey: "https://image.astrdark.cyou/file/1776440977632_814a6e8744d5867d5cb9aadde1702a9d_6655236739132159661.png",
            cry: "https://image.astrdark.cyou/file/1776441000906_d9f485efbb4f157d2d34932e585d1eda_2801003451686625876.png"
        };


        const appContainer = document.getElementById('app-container');
        const sidebar = document.getElementById('sidebar');
        const sidebarOverlay = document.getElementById('sidebar-overlay');
        const mobileMenuBtn = document.getElementById('mobile-menu-btn');
        const viewToggleBtn = document.getElementById('view-toggle-btn');
        const viewToggleIcon = viewToggleBtn.querySelector('i');

        const chatMessages = document.getElementById('chat-messages');
        const messageInput = document.getElementById('message-input');
        const offlineBanner = document.getElementById('offline-banner');
        const chatSearchInput = document.getElementById('chat-search-input');
        const chatSearchCount = document.getElementById('chat-search-count');
        const chatSearchPrev = document.getElementById('chat-search-prev');
        const chatSearchNext = document.getElementById('chat-search-next');
        const sendBtn = document.getElementById('send-btn');
        const voiceInputBtn = document.getElementById('voice-input-btn');
        const themeToggleBtn = document.getElementById('theme-toggle-btn');
        const commandPanelBtn = document.getElementById('command-panel-btn');
        const commandPanel = document.getElementById('command-panel');
        const uploadBtn = document.getElementById('upload-btn');
        const imageUpload = document.getElementById('image-upload');
        const avatarUpload = document.getElementById('avatar-upload');
        const charAvatarUpload = document.getElementById('char-avatar-upload');
        const bubbleBgUpload = document.getElementById('bubble-bg-upload');
        const inputAvatar = document.getElementById('input-avatar');
        const emojiBtn = document.getElementById('emoji-btn');
        const emojiPicker = document.getElementById('emoji-picker');
        const friendList = document.getElementById('friend-list');
        const friendSearchInput = document.getElementById('friend-search');
        const globalSearchResults = document.getElementById('global-search-results');
        const clearChatBtn = document.getElementById('clear-chat-btn');
        const summaryChatBtn = document.getElementById('summary-chat-btn');
        const chatStatsBtn = document.getElementById('chat-stats-btn');
        const myDisplayNameElement = document.getElementById('my-display-name');
        const chatArea = document.getElementById('chat-area');
        const currentFriendNameElement = document.getElementById('current-friend-name');
        const importUpload = document.getElementById('import-upload');
        const charImportUpload = document.getElementById('char-import-upload');

        const openSettingsBtn = document.getElementById('open-settings-btn');
        const closeSettingsBtn = document.getElementById('close-settings-btn');
        const aiSettingsModal = document.getElementById('ai-settings-modal');

        // 声明弹窗相关元素
        const openDisclaimerLink = document.getElementById('open-disclaimer-link');
        const disclaimerModal = document.getElementById('disclaimer-modal');
        const closeDisclaimerBtn = document.getElementById('close-disclaimer-btn');
        const backFromDisclaimerBtn = document.getElementById('back-from-disclaimer-btn');

        const tabButtons = document.querySelectorAll('.tab-button');
        const tabContents = document.querySelectorAll('.tab-content');
        const saveSettingsBtn = document.getElementById('save-settings-btn');
        const resetSettingsBtn = document.getElementById('reset-settings-btn');
        const testConnectionBtn = document.getElementById('test-connection-btn');
        const testResultDiv = document.getElementById('test-result');
        const testMemoryBtn = document.getElementById('test-memory-btn');
        const testMemoryResultDiv = document.getElementById('test-memory-result');
        const exportConfigBtn = document.getElementById('export-config-btn');
        const configImportInput = document.getElementById('config-import-input');
        const exportFullDataBtn = document.getElementById('export-full-data-btn');
        const fullDataImportInput = document.getElementById('full-data-import-input');
        const autoBackupEnabledCheckbox = document.getElementById('auto-backup-enabled');
        const apiUrlInput = document.getElementById('api-url');
        const apiKeyInput = document.getElementById('api-key');
        const modelNameInput = document.getElementById('model-name');
        const fetchModelsBtn = document.getElementById('fetch-models-btn');
        const modelSelect = document.getElementById('model-select');

        const maxContextRoundsInput = document.getElementById('max-context-rounds');
        const maxTokensInput = document.getElementById('max-tokens');
        const enableLongTermMemoryCheckbox = document.getElementById('enable-long-term-memory');
        const enableProactiveCareCheckbox = document.getElementById('enable-proactive-care');
        const messageDebounceInput = document.getElementById('message-debounce');
        const enableLazyModeCheckbox = document.getElementById('enable-lazy-mode');
        const showRegenerateBtnCheckbox = document.getElementById('show-regenerate-btn');
        const enableRealTimeCheckbox = document.getElementById('enable-real-time');
        const enableStreamingInputCheckbox = document.getElementById('enable-streaming-input');
        const bubbleWidthSlider = document.getElementById('bubble-width-slider');
        const bubbleWidthPercentInput = document.getElementById('bubble-width-percent');
        const enableMessageSegmentationCheckbox = document.getElementById('enable-message-segmentation');
        const charsPerLineInput = document.getElementById('chars-per-line');
        const enableDisplayLimitCheckbox = document.getElementById('enable-display-limit');
        const displayLimitRoundsInput = document.getElementById('display-limit-rounds');
        const featureToggleInputs = {
            showThemeToggle: document.getElementById('show-theme-toggle'),
            showGlobalSearch: document.getElementById('show-global-search'),
            showBatchActions: document.getElementById('show-batch-actions'),
            showVoiceInput: document.getElementById('show-voice-input'),
            showCommandPanel: document.getElementById('show-command-panel'),
            showReadableExport: document.getElementById('show-readable-export'),
            showBranchButtons: document.getElementById('show-branch-buttons'),
            showCodeCopy: document.getElementById('show-code-copy'),
            showCustomStickers: document.getElementById('show-custom-stickers'),
            showMessageTts: document.getElementById('show-message-tts'),
            showMessageQuote: document.getElementById('show-message-quote'),
            showChatSummary: document.getElementById('show-chat-summary'),
            showChatStats: document.getElementById('show-chat-stats'),
            showMarkdownPreview: document.getElementById('show-markdown-preview'),
            showGroupChat: document.getElementById('show-group-chat')
        };


        const kbApiUrlInput = document.getElementById('kb-api-url');
        const kbApiKeyInput = document.getElementById('kb-api-key');
        const kbEmbeddingModelInput = document.getElementById('kb-embedding-model');
        const kbRerankModelInput = document.getElementById('kb-rerank-model');
        const kbEnabledCheckbox = document.getElementById('kb-enabled');
        const accentColorPicker = document.getElementById('accent-color-picker');
        const shortcutHelpModal = document.getElementById('shortcut-help-modal');
        const closeShortcutHelpBtn = document.getElementById('close-shortcut-help-btn');
        const exportMemoryCsvBtn = document.getElementById('export-memory-csv-btn');
        const importMemoryCsvInput = document.getElementById('import-memory-csv-input');
        const kbUploadBtn = document.getElementById('kb-upload-btn');
        const kbFileUploadInput = document.getElementById('kb-file-upload');
        const kbFileListDiv = document.getElementById('kb-file-list');

        const contextEditListContainer = document.getElementById('context-edit-list-container');
        const refreshContextBtn = document.getElementById('refresh-context-btn');

        const changeBgBtn = document.getElementById('change-bg-btn');
        const resetBgBtn = document.getElementById('reset-bg-btn');
        const bgUpload = document.getElementById('bg-upload');

        const batchEditBtn = document.getElementById('batch-edit-btn');
        const batchExportBtn = document.getElementById('batch-export-btn');
        const batchDeleteBtn = document.getElementById('batch-delete-btn');
        const createGroupBtn = document.getElementById('create-group-btn');
        const addFriendBtn = document.getElementById('add-friend-btn');
        const closeAddFriendBtn = document.getElementById('close-add-friend-btn');
        const addFriendModal = document.getElementById('add-friend-modal');
        const friendOptionsList = document.getElementById('friend-options-list');

        const toggleCreateBtn = document.getElementById('toggle-create-btn');
        const createCharacterSection = document.getElementById('create-character-section');
        const createEditTitle = document.getElementById('create-edit-title');
        const editCharacterIdInput = document.getElementById('edit-character-id');
        const newCharNameInput = document.getElementById('new-char-name');
        const newCharPromptInput = document.getElementById('new-char-prompt');
        const newCharAvatarInput = document.getElementById('new-char-avatar');
        const newCharWelcomeInput = document.getElementById('new-char-welcome');
        const generateWelcomeBtn = document.getElementById('generate-welcome-btn');
        const saveCharacterBtn = document.getElementById('save-character-btn');
        const saveBtnText = document.getElementById('save-btn-text');
        const cancelCreateBtn = document.getElementById('cancel-create-btn');
        const deleteCharacterBtn = document.getElementById('delete-character-btn');
        const importCharFileBtn = document.getElementById('import-char-file-btn');
        const selectCharAvatarBtn = document.getElementById('select-char-avatar-btn');

        // 创建/编辑角色弹窗相关元素
        const characterEditModal = document.getElementById('character-edit-modal');
        const closeCharacterEditBtn = document.getElementById('close-character-edit-btn');
        const characterEditModalTitle = document.getElementById('character-edit-modal-title');
        const editCharacterIdInputModal = document.getElementById('edit-character-id-modal');
        const newCharNameInputModal = document.getElementById('new-char-name-modal');
        const newCharPromptInputModal = document.getElementById('new-char-prompt-modal');
        const newCharAvatarInputModal = document.getElementById('new-char-avatar-modal');
        const newCharWelcomeInputModal = document.getElementById('new-char-welcome-modal');
        const generateWelcomeBtnModal = document.getElementById('generate-welcome-btn-modal');
        const saveCharacterBtnModal = document.getElementById('save-character-btn-modal');
        const saveBtnTextModal = document.getElementById('save-btn-text-modal');
        const cancelCreateBtnModal = document.getElementById('cancel-create-btn-modal');
        const deleteCharacterBtnModal = document.getElementById('delete-character-btn-modal');
        const selectCharAvatarBtnModal = document.getElementById('select-char-avatar-btn-modal');
        const cloneCharacterBtnModal = document.getElementById('clone-character-btn-modal');

        const importDialogBtn = document.getElementById('import-dialog-btn');
        const exportDialogBtn = document.getElementById('export-dialog-btn');
        const exportChatTxtBtn = document.getElementById('export-chat-txt-btn');
        const exportChatMdBtn = document.getElementById('export-chat-md-btn');
        const exportChatHtmlBtn = document.getElementById('export-chat-html-btn');
        const printChatBtn = document.getElementById('print-chat-btn');

        // 单个角色聊天记录导出导入按钮
        const exportCharacterChatBtn = document.getElementById('export-character-chat-btn');
        const importCharacterChatInput = document.getElementById('import-character-chat-input');


        const avatarContextMenu = document.getElementById('avatar-context-menu');
        const aiAvatarContextMenu = document.getElementById('ai-avatar-context-menu');
        const menuUploadFile = document.getElementById('menu-upload-file');
        const menuSetUrl = document.getElementById('menu-set-url');
        const aiMenuUploadFile = document.getElementById('ai-menu-upload-file');
        const aiMenuSetUrl = document.getElementById('ai-menu-set-url');


        const friendContextMenu = document.getElementById('friend-context-menu');


        const friendGroupModal = document.getElementById('friend-group-modal');
        const friendGroupModalTitle = document.getElementById('friend-group-modal-title');
        const friendGroupModalBody = document.getElementById('friend-group-modal-body');
        const friendGroupConfirmBtn = document.getElementById('friend-group-confirm-btn');
        const friendGroupCancelBtn = document.getElementById('friend-group-cancel-btn');
        const closeFriendGroupModal = document.getElementById('close-friend-group-modal');
        const menuTogglePin = document.getElementById('menu-toggle-pin');
        const pinText = document.getElementById('pin-text');
        const menuSetRemark = document.getElementById('menu-set-remark');
        const menuChangeGroup = document.getElementById('menu-change-group');
        const menuDeleteFriend = document.getElementById('menu-delete-friend');


        const selectBubbleBgBtn = document.getElementById('select-bubble-bg-btn');
        const resetBubbleBgBtn = document.getElementById('reset-bubble-bg-btn');
        const bubbleBgPreview = document.getElementById('bubble-bg-preview');


        const bubbleTextColorInput = document.getElementById('bubble-text-color');
        const bubbleFontSizeInput = document.getElementById('bubble-font-size');
        const bubbleStrokeColorInput = document.getElementById('bubble-stroke-color');
        const bubbleStrokeWidthInput = document.getElementById('bubble-stroke-width');
        const enableBubbleStrokeCheckbox = document.getElementById('enable-bubble-stroke');
        const applyBubbleTextStyleBtn = document.getElementById('apply-bubble-text-style');

        let currentFriendId = 'silverwolf';
        let myUserName = '小银狼';
        let threadManager = {};
        let groupManager = {};
        let isMobileView = false;
        let currentAiAvatarTarget = null;
        let currentFriendMenuTarget = null;
        let isBatchEditMode = false;
        const selectedCustomFriends = new Set();


        let lastSendTime = 0;
        let aiResponseQueue = Promise.resolve();
        let isWaitingAI = false;
        let aiPendingCount = 0;
        let draftSaveTimer = null;
        let messageSeq = Number(localStorage.getItem('messageSeq') || '0');
        let proactiveCareTimer = null;
        let pendingReplyTo = null;
        let markdownPreviewEl = null;
        let proactiveCareSequence = 0;
        const memoryUpdateQueues = new Map();
        const offlineMessageQueueKey = 'offlineMessageQueue';
        let chatSearchMatches = [];
        let chatSearchIndex = -1;
        let mediaRecorder = null;
        let voiceChunks = [];


        let currentBubbleStyle = 'default';
        let currentBubbleImage = null;
        let currentBubbleTextStyle = {
            color: '#ffffff',
            fontSize: 14,
            strokeColor: '#000000',
            strokeWidth: 1,
            enableStroke: true
        };



        // 配置 marked.js 使用 highlight.js 进行代码高亮
        if (typeof marked !== 'undefined' && typeof hljs !== 'undefined') {
            marked.setOptions({
                highlight: function(code, lang) {
                    if (lang && hljs.getLanguage(lang)) {
                        try {
                            return hljs.highlight(code, { language: lang }).value;
                        } catch (e) {}
                    }
                    return hljs.highlightAuto(code).value;
                },
                breaks: true,
                gfm: true
            });
        }

        function init() {
            loadAllFriendsData();
            loadUserName();
            loadUserAvatar();
            loadThreadManager();
            loadBackground();
            loadChatSettings();
            initEmojiPicker();
            loadApiSettings();
            loadKnowledgeSettings();
            loadAutoBackupSettings();
            initThemeMode();
            initVoiceInput();
            initCommandPanel();
            renderFriendList();


            const lastChatId = localStorage.getItem('lastChatId');
            if (lastChatId && friendsData[lastChatId]) {
                switchFriend(lastChatId);
            } else {
                switchFriend('silverwolf');
            }


            restoreMessageDraft();

            renderFriendOptions();
            checkViewport();
            initBubbleStyleSelector();

            // 注册 Service Worker 用于 PWA
            if ('serviceWorker' in navigator) {
                window.addEventListener('load', () => {
                    navigator.serviceWorker.register('sw.js').then(registration => {
                        console.log('Service Worker 注册成功:', registration.scope);
                    }).catch(error => {
                        console.log('Service Worker 注册失败:', error);
                    });
                });
            }
        }

        function checkViewport() {
            const width = window.innerWidth;
            const height = window.innerHeight;
            const isPortraitTablet = (width >= 769 && width <= 1024 && height > width);

            if ((width <= 768 || isPortraitTablet) && !isMobileView) {
                setMobileView(true);
            } else if (width > 768 && !isPortraitTablet && isMobileView) {
                setMobileView(false);
            }
        }

        function setMobileView(mobile) {
            isMobileView = mobile;
            if (mobile) {
                appContainer.classList.add('mobile-view');
                sidebar.classList.add('hidden');
                sidebarOverlay.classList.remove('show');
                viewToggleIcon.className = 'ri-computer-line';
            } else {
                appContainer.classList.remove('mobile-view');
                sidebar.classList.remove('hidden');
                sidebarOverlay.classList.remove('show');
                viewToggleIcon.className = 'ri-smartphone-line';
            }
            localStorage.setItem('isMobileView', mobile.toString());
        }

        viewToggleBtn.addEventListener('click', () => {
            setMobileView(!isMobileView);
        });

        mobileMenuBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            sidebar.classList.remove('hidden');
            sidebarOverlay.classList.add('show');
        });

        sidebarOverlay.addEventListener('click', () => {
            sidebar.classList.add('hidden');
            sidebarOverlay.classList.remove('show');
        });

        chatArea.addEventListener('click', () => {
            if (isMobileView && !sidebar.classList.contains('hidden')) {
                sidebar.classList.add('hidden');
                sidebarOverlay.classList.remove('show');
            }
            toggleAvatarMenu(false);
            toggleAiAvatarMenu(false);
            toggleFriendContextMenu(false);
        });

        window.addEventListener('resize', checkViewport);

        const savedMobileView = localStorage.getItem('isMobileView');
        if (savedMobileView === 'true') {
            setMobileView(true);
        }

        function initEmojiPicker() {
            emojiPicker.innerHTML = '';
            const emojis = ['😀', '', '', '', '', '', '', '', '🙂', '', '😉', '😊', '', '', '', '', '', '', '️', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '😶', '😏', '😒', '', '', '', '😌', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '☹️', '😮', '', '😲', '', '', '', '', '', '😰', '', '😢', '', '😱', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '️', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''];
            emojis.forEach(emoji => {
                const item = document.createElement('div');
                item.classList.add('emoji-item');
                item.textContent = emoji;
                item.addEventListener('click', () => {
                    messageInput.value += emoji;
                    messageInput.focus();
                    toggleEmojiPicker(false);
                });
                emojiPicker.appendChild(item);
            });
            if (!getFeatureToggles().showCustomStickers) return;
            const myStickerTitle = document.createElement('div');
            myStickerTitle.className = 'emoji-category-title';
            myStickerTitle.textContent = '我的表情';
            emojiPicker.appendChild(myStickerTitle);
            const addSticker = document.createElement('div');
            addSticker.classList.add('emoji-item');
            addSticker.innerHTML = '<i class="ri-add-line"></i>';
            addSticker.title = '添加图片链接表情';
            addSticker.addEventListener('click', () => {
                const url = prompt('请输入表情图片链接：');
                if (!url) return;
                const stickers = JSON.parse(localStorage.getItem('myStickers') || '[]');
                stickers.push(url.trim());
                localStorage.setItem('myStickers', JSON.stringify(stickers));
                initEmojiPicker();
            });
            emojiPicker.appendChild(addSticker);
            JSON.parse(localStorage.getItem('myStickers') || '[]').forEach(url => {
                const item = document.createElement('div');
                item.classList.add('emoji-item');
                item.innerHTML = `<img src="${escapeHtml(url)}" alt="我的表情" style="width:28px;height:28px;object-fit:cover;border-radius:4px;">`;
                item.addEventListener('click', () => {
                    sendMessage(url, 'image');
                    toggleEmojiPicker(false);
                });
                emojiPicker.appendChild(item);
            });
        }

        function toggleEmojiPicker(show) {
            if (show === undefined) emojiPicker.classList.toggle('show');
            else show ? emojiPicker.classList.add('show') : emojiPicker.classList.remove('show');
        }

        function toggleAvatarMenu(show) {
            if (show === undefined) {
                avatarContextMenu.classList.toggle('show');
            } else {
                show ? avatarContextMenu.classList.add('show') : avatarContextMenu.classList.remove('show');
            }
        }

        function toggleAiAvatarMenu(show) {
            if (show === undefined) {
                aiAvatarContextMenu.classList.toggle('show');
            } else {
                show ? aiAvatarContextMenu.classList.add('show') : aiAvatarContextMenu.classList.remove('show');
            }
        }

        function toggleFriendContextMenu(show) {
            if (show === undefined) {
                friendContextMenu.classList.toggle('show');
            } else {
                show ? friendContextMenu.classList.add('show') : friendContextMenu.classList.remove('show');
            }
        }


        function toggleFriendGroupModal(show) {
            if (show === undefined) {
                friendGroupModal.classList.toggle('show');
            } else {
                show ? friendGroupModal.classList.add('show') : friendGroupModal.classList.remove('show');
            }
        }

        inputAvatar.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleAvatarMenu(true);
        });

        menuUploadFile.addEventListener('click', () => {
            toggleAvatarMenu(false);
            avatarUpload.click();
        });

        menuSetUrl.addEventListener('click', () => {
            toggleAvatarMenu(false);
            const url = prompt("请输入头像图片的 URL 地址：", inputAvatar.src);
            if (url && url.trim() !== '') {
                updateMyAvatar(url.trim());
            }
        });

        aiMenuUploadFile.addEventListener('click', () => {
            toggleAiAvatarMenu(false);
            if (currentAiAvatarTarget) {
                const targetFriendId = currentAiAvatarTarget;
                avatarUpload.onchange = function(e) {
                    const file = e.target.files[0];
                    if (file) {
                        const reader = new FileReader();
                        reader.onload = (evt) => {
                            updateFriendAvatar(targetFriendId, evt.target.result);
                        };
                        reader.readAsDataURL(file);
                    }
                    avatarUpload.value = '';
                    avatarUpload.onchange = null;
                };
                avatarUpload.click();
            }
        });

        aiMenuSetUrl.addEventListener('click', () => {
            toggleAiAvatarMenu(false);
            if (currentAiAvatarTarget) {
                const url = prompt("请输入头像图片的 URL 地址：", friendsData[currentAiAvatarTarget]?.avatar);
                if (url && url.trim() !== '') {
                    updateFriendAvatar(currentAiAvatarTarget, url.trim());
                }
            }
        });

        function updateMyAvatar(src) {
            inputAvatar.src = src;
            document.querySelectorAll('.message.mine .avatar').forEach(img => {
                img.src = src;
            });
            setLocalStorageSafely('userAvatar', src, '用户头像');
            showToast("头像已更新", "ri-check-line");
        }

        function updateFriendAvatar(friendId, src) {
            if (!friendsData[friendId]) return;
            friendsData[friendId].avatar = src;
            if (friendsData[friendId].isCustom) {
                saveCustomFriendsData();
            }
            Object.values(groupManager).forEach(group => {
                if (group.memberIds?.[0] === friendId && friendsData[group.id]) friendsData[group.id].avatar = src;
            });
            if (currentFriendId === friendId || getMessages().some(msg => msg.friendId === friendId)) {
                currentFriendNameElement.textContent = getFriendDisplayName(currentFriendId);
                renderMessages(currentFriendId);
            }
            renderFriendList();
            showToast(`${getFriendDisplayName(friendId)} 的头像已更新`, "ri-check-line");
        }

        function getFriendDisplayName(friendId) {
            const friend = friendsData[friendId];
            if (!friend) return '';
            const remark = getFriendRemark(friendId);
            return remark || friend.name;
        }

        function getFriendRemark(friendId) {
            const settings = JSON.parse(localStorage.getItem('friendSettings') || '{}');
            return settings[friendId]?.remark || '';
        }

        function setFriendRemark(friendId, remark) {
            const settings = JSON.parse(localStorage.getItem('friendSettings') || '{}');
            if (!settings[friendId]) settings[friendId] = {};
            settings[friendId].remark = remark;
            localStorage.setItem('friendSettings', JSON.stringify(settings));
        }

        function isFriendPinned(friendId) {
            const settings = JSON.parse(localStorage.getItem('friendSettings') || '{}');
            return settings[friendId]?.pinned || false;
        }

        function setFriendPinned(friendId, pinned) {
            const settings = JSON.parse(localStorage.getItem('friendSettings') || '{}');
            if (!settings[friendId]) settings[friendId] = {};
            settings[friendId].pinned = pinned;
            localStorage.setItem('friendSettings', JSON.stringify(settings));
        }

        function getFriendGroup(friendId) {
            const settings = JSON.parse(localStorage.getItem('friendSettings') || '{}');
            return settings[friendId]?.group || friendsData[friendId]?.group || '默认';
        }

        function setFriendGroup(friendId, groupName) {
            if (!friendsData[friendId]) return;
            friendsData[friendId].group = groupName;
            const settings = JSON.parse(localStorage.getItem('friendSettings') || '{}');
            if (!settings[friendId]) settings[friendId] = {};
            settings[friendId].group = groupName;
            localStorage.setItem('friendSettings', JSON.stringify(settings));
            if (friendsData[friendId].isCustom) saveCustomFriendsData();
        }

        function renameFriendGroup(oldName, newName) {
            const targetName = (newName || '').trim();
            if (!targetName || targetName === oldName) return;
            Object.keys(friendsData).forEach(friendId => {
                if (getFriendGroup(friendId) === oldName) setFriendGroup(friendId, targetName);
            });
            renderFriendList();
            showToast(`分组已重命名为「${targetName}」`, 'ri-folder-settings-line');
        }

        function deleteFriendGroup(groupName) {
            if (groupName === '默认') {
                showToast('默认分组不能删除', 'ri-error-warning-line');
                return;
            }
            if (!confirm(`确定删除分组「${groupName}」吗？该分组内角色会移动到默认分组。`)) return;
            Object.keys(friendsData).forEach(friendId => {
                if (getFriendGroup(friendId) === groupName) setFriendGroup(friendId, '默认');
            });
            renderFriendList();
            showToast(`已删除分组「${groupName}」`, 'ri-folder-reduce-line');
        }


        function loadUserName() {
            const storedName = localStorage.getItem('myUserName');
            if (storedName) myUserName = storedName;
            updateUserNameDisplay();
        }
        function loadUserAvatar() {
            const storedAvatar = localStorage.getItem('userAvatar');
            if (storedAvatar) {
                inputAvatar.src = storedAvatar;
            }
        }
        function saveUserName(newName) {
            if (!newName || newName.trim() === '') return;
            myUserName = newName.trim();
            localStorage.setItem('myUserName', myUserName);
            updateUserNameDisplay();
            renderMessages(currentFriendId);
        }
        function updateUserNameDisplay() {
            myDisplayNameElement.textContent = myUserName;
        }
        function enableEditUserName() {
            const currentText = myDisplayNameElement.textContent;
            const input = document.createElement('input');
            input.type = 'text';
            input.value = currentText;
            input.className = 'name-input';
            myDisplayNameElement.replaceWith(input);
            input.focus();
            input.select();
            const finishEdit = () => { saveUserName(input.value); };
            input.addEventListener('blur', finishEdit);
            input.addEventListener('keypress', (e) => { if (e.key === 'Enter') input.blur(); });
        }


        function loadThreadManager() {
            const stored = localStorage.getItem('threadManager_v2');
            if (stored) {
                try { threadManager = JSON.parse(stored); } catch (e) { threadManager = {}; }
            }
            Object.keys(friendsData).forEach(fid => {
                if (!threadManager[fid]) {
                    threadManager[fid] = {
                        threads: [{ id: 1, name: '初始对话', messages: [] }],
                        currentThreadId: 1,
                        longTermMemory: []
                    };
                }
                if (!threadManager[fid].longTermMemory) {
                    threadManager[fid].longTermMemory = [];
                }
            });
            ensureMessageIds();
        }
        function saveThreadManager() {
            setLocalStorageSafely('threadManager_v2', JSON.stringify(threadManager), '聊天记录');
        }

        const saveThreadsToLocalStorage = saveThreadManager;
        function getCurrentThread() {
            const friendData = threadManager[currentFriendId];
            return friendData.threads.find(t => t.id === friendData.currentThreadId);
        }
        function getMessages() {
            const thread = getCurrentThread();
            return thread ? thread.messages : [];
        }
        function getNextMessageId() {
            messageSeq += 1;
            localStorage.setItem('messageSeq', String(messageSeq));
            return messageSeq;
        }

        function ensureMessageIds() {
            let changed = false;
            Object.values(threadManager).forEach(friendData => {
                (friendData.threads || []).forEach(thread => {
                    (thread.messages || []).forEach(msg => {
                        if (!msg.id) {
                            msg.id = getNextMessageId();
                            changed = true;
                        }
                    });
                });
            });
            if (changed) saveThreadManager();
        }

        function addMessageToThread(role, content, type, isProactive = false, extra = {}) {
            return addMessageToFriendThread(currentFriendId, role, content, type, isProactive, extra);
        }

        function addMessageToFriendThread(friendId, role, content, type, isProactive = false, extra = {}) {
            const friendData = threadManager[friendId];
            const thread = friendData?.threads?.find(t => t.id === friendData.currentThreadId);
            if (thread) {
                const message = { id: getNextMessageId(), role, content, type, timestamp: Date.now(), isProactive, ...extra };
                thread.messages.push(message);
                saveThreadManager();
                return message;
            }
            return null;
        }


        function saveMessageDraft() {
            clearTimeout(draftSaveTimer);
            draftSaveTimer = setTimeout(() => {
                if (currentFriendId) {
                    const draftKey = `messageDraft_${currentFriendId}`;
                    localStorage.setItem(draftKey, messageInput.value);
                }
            }, 300);
        }

        function restoreMessageDraft() {
            if (currentFriendId) {
                const draftKey = `messageDraft_${currentFriendId}`;
                const draft = localStorage.getItem(draftKey);
                if (draft) {
                    messageInput.value = draft;
                    autoResizeMessageInput();
                }
            }
        }

        function clearMessageDraft() {
            if (currentFriendId) {
                const draftKey = `messageDraft_${currentFriendId}`;
                localStorage.removeItem(draftKey);
            }
        }

        function getLongTermMemory() {
            return threadManager[currentFriendId]?.longTermMemory || [];
        }

        function updateLongTermMemory(newMemories, friendId = currentFriendId) {
            if (!enableLongTermMemoryCheckbox.checked) return;

            const friendData = threadManager[friendId];
            if (!friendData) return;
            if (!Array.isArray(friendData.longTermMemory)) friendData.longTermMemory = [];

            let memoryChanged = false;
            newMemories.forEach(newMem => {
                const existingIndex = friendData.longTermMemory.findIndex(m => m.key === newMem.key);
                if (existingIndex >= 0) {
                    if (friendData.longTermMemory[existingIndex].value !== newMem.value) {
                        friendData.longTermMemory[existingIndex] = newMem;
                        memoryChanged = true;
                    }
                } else {
                    friendData.longTermMemory.push(newMem);
                    memoryChanged = true;
                }
            });

            if (memoryChanged) {
                saveThreadManager();
            }
        }

        // 渲染记忆档案列表
        function renderMemoryProfileList() {
            const container = document.getElementById('memory-profile-list');
            if (!container) return;

            const memories = getLongTermMemory();

            if (!memories || memories.length === 0) {
                container.innerHTML = '<p style="color: #888; font-style: italic; text-align: center; padding: 20px;">暂无记忆档案</p>';
                return;
            }

            container.innerHTML = memories.map((mem, index) => `
                <div class="memory-item" style="display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; background-color: #383b45; border-radius: 8px; border: 1px solid transparent; transition: all 0.2s;" onmouseenter="this.style.borderColor='#e6c78a'" onmouseleave="this.style.borderColor='transparent'">
                    <div style="flex: 1; min-width: 0;">
                        <div style="font-weight: 600; color: #e6c78a; margin-bottom: 4px; font-size: 0.95em;">${escapeHtml(mem.key)}</div>
                        <div style="color: #ccc; font-size: 0.9em; word-break: break-word;">${escapeHtml(mem.value)}</div>
                    </div>
                    <div style="display: flex; gap: 8px; margin-left: 12px; flex-shrink: 0;">
                        <button class="btn btn-sm btn-outline" onclick="editMemoryItem(${index})" title="编辑" style="padding: 6px 10px; font-size: 0.85em;">
                            <i class="ri-edit-line"></i>
                        </button>
                        <button class="btn btn-sm btn-danger" onclick="deleteMemoryItem(${index})" title="删除" style="padding: 6px 10px; font-size: 0.85em; background-color: #f44336; color: white; border: none;">
                            <i class="ri-delete-bin-line"></i>
                        </button>
                    </div>
                </div>
            `).join('');
        }

        // 编辑记忆项
        function editMemoryItem(index) {
            const memories = getLongTermMemory();
            if (!memories || index < 0 || index >= memories.length) return;

            const memory = memories[index];
            const newKey = prompt('编辑记忆键名:', memory.key);
            if (newKey === null) return;
            if (!newKey.trim()) {
                showToast('记忆键名不能为空', 'ri-error-warning-line');
                return;
            }

            const newValue = prompt('编辑记忆内容:', memory.value);
            if (newValue === null) return;
            if (!newValue.trim()) {
                showToast('记忆内容不能为空', 'ri-error-warning-line');
                return;
            }

            const friendData = threadManager[currentFriendId];
            if (!friendData) return;

            // 检查键名是否重复（排除当前项）
            const duplicateIndex = friendData.longTermMemory.findIndex((m, i) => i !== index && m.key === newKey.trim());
            if (duplicateIndex >= 0) {
                showToast('记忆键名已存在', 'ri-error-warning-line');
                return;
            }

            friendData.longTermMemory[index] = { key: newKey.trim(), value: newValue.trim() };
            saveThreadManager();
            renderMemoryProfileList();
            showToast('记忆已更新', 'ri-check-line');
        }

        // 删除记忆项
        function deleteMemoryItem(index) {
            const memories = getLongTermMemory();
            if (!memories || index < 0 || index >= memories.length) return;

            const memory = memories[index];
            if (!confirm(`确定要删除这条记忆吗？\n\n"${memory.key}: ${memory.value}"`)) return;

            const friendData = threadManager[currentFriendId];
            if (!friendData) return;

            friendData.longTermMemory.splice(index, 1);
            saveThreadManager();
            renderMemoryProfileList();
            showToast('记忆已删除', 'ri-check-line');
        }

        function clearCurrentThread() {
            const friendData = threadManager[currentFriendId];
            const thread = friendData.threads.find(t => t.id === friendData.currentThreadId);
            if (thread) {
                thread.messages = [];
                saveThreadManager();
                renderMessages(currentFriendId);
                showToast("对话上下文已重置", "ri-refresh-line");
            }
        }

        function deleteCurrentThread() {
            const friendData = threadManager[currentFriendId];
            if (!friendData || friendData.threads.length === 0) return;

            const currentThreadId = friendData.currentThreadId;
            const threadIndex = friendData.threads.findIndex(t => t.id === currentThreadId);

            if (threadIndex === -1) return;

            if (friendData.threads.length === 1) {
                clearCurrentThread();
                showToast("已清空对话内容", "ri-delete-bin-line");
                return;
            }

            friendData.threads.splice(threadIndex, 1);

            let newThreadId;
            if (threadIndex > 0) {
                newThreadId = friendData.threads[threadIndex - 1].id;
            } else {
                newThreadId = friendData.threads[0].id;
            }

            friendData.currentThreadId = newThreadId;
            saveThreadManager();

            renderMessages(currentFriendId);
            renderFriendList();
            showToast(`对话线程已删除`, "ri-delete-bin-line");
        }

        function createNewThread() {
            const friendData = threadManager[currentFriendId];
            const newId = Math.max(...friendData.threads.map(t => t.id)) + 1;
            friendData.threads.push({ id: newId, name: `对话 #${newId}`, messages: [] });
            friendData.currentThreadId = newId;
            saveThreadManager();
            renderMessages(currentFriendId);
            renderFriendList();
            showToast(`新对话线程已创建`, "ri-add-circle-line");
        }
        function switchThread(threadId) {
            const friendData = threadManager[currentFriendId];
            const targetThread = friendData.threads.find(t => t.id === parseInt(threadId));
            if (targetThread) {
                friendData.currentThreadId = parseInt(threadId);
                saveThreadManager();
                renderMessages(currentFriendId);
                showToast(`已切换对话线程`, "ri-exchange-line");
            } else {
                showToast(`未找到对话线程`, "ri-error-warning-line");
            }
        }

        function renameCurrentThread(newName) {
            if (!newName || newName.trim() === '') {
                showToast("请输入有效的对话名称", "ri-error-warning-line");
                return;
            }
            const friendData = threadManager[currentFriendId];
            const thread = friendData.threads.find(t => t.id === friendData.currentThreadId);
            if (thread) {
                thread.name = newName.trim();
                saveThreadManager();
                showToast(`对话已重命名`, "ri-edit-line");
                renderFriendList();
            }
        }


        function renderFriendList() {
            friendList.innerHTML = '';


            const searchTerm = (friendSearchInput?.value || '').trim().toLowerCase();

            const allFriends = Object.values(friendsData).sort((a, b) => {
                const aPinned = isFriendPinned(a.id);
                const bPinned = isFriendPinned(b.id);
                if (aPinned && !bPinned) return -1;
                if (!aPinned && bPinned) return 1;


                const aGroup = getFriendGroup(a.id);
                const bGroup = getFriendGroup(b.id);
                if (aGroup !== bGroup) return aGroup.localeCompare(bGroup, 'zh-CN');

                return 0;
            });


            let filteredFriends = allFriends;
            if (searchTerm) {
                filteredFriends = allFriends.filter(friend => {

                    if (friend.name.toLowerCase().includes(searchTerm)) {
                        return true;
                    }


                    const friendData = threadManager[friend.id];
                    if (friendData && friendData.threads) {
                        for (const thread of friendData.threads) {
                            if (thread.messages) {
                                for (const msg of thread.messages) {
                                    if (msg.content && msg.content.toLowerCase().includes(searchTerm)) {
                                        return true;
                                    }
                                }
                            }
                        }
                    }

                    return false;
                });
            }


            let currentGroup = null;
            let groupContent = null;
            let groupCount = 0;

            filteredFriends.forEach(friend => {
                const friendGroup = getFriendGroup(friend.id);


                if (friendGroup !== currentGroup) {
                    currentGroup = friendGroup;
                    groupCount = 0;

                    const groupHeader = document.createElement('div');
                    groupHeader.classList.add('friend-group-header');
                    groupHeader.setAttribute('data-group', currentGroup);
                    groupHeader.innerHTML = `<span><i class="ri-folder-line"></i> ${currentGroup}</span><span class="group-count">0</span>`;


                    groupHeader.addEventListener('contextmenu', (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        const action = prompt(`管理分组「${currentGroup}」：输入 r 重命名，输入 d 删除`, 'r');
                        if (action === null) return;
                        if (action.trim().toLowerCase() === 'd') {
                            deleteFriendGroup(currentGroup);
                            return;
                        }
                        const newName = prompt('新的分组名称：', currentGroup);
                        if (newName !== null) renameFriendGroup(currentGroup, newName);
                    });


                    groupHeader.addEventListener('click', (e) => {
                        if (e.target.closest('.friend-group-header')) {
                            const header = e.currentTarget;
                            const content = header.nextElementSibling;
                            if (content && content.classList.contains('friend-group-content')) {
                                const isCollapsed = content.classList.toggle('collapsed');
                                header.classList.toggle('collapsed', isCollapsed);


                                const collapsedGroups = JSON.parse(localStorage.getItem('collapsedGroups') || '{}');
                                collapsedGroups[currentGroup] = isCollapsed;
                                localStorage.setItem('collapsedGroups', JSON.stringify(collapsedGroups));
                            }
                        }
                    });

                    friendList.appendChild(groupHeader);


                    groupContent = document.createElement('div');
                    groupContent.classList.add('friend-group-content');
                    friendList.appendChild(groupContent);
                }

                groupCount++;

                const item = document.createElement('div');
                item.classList.add('friend-item');
                if (friend.id === currentFriendId) item.classList.add('active');
                if (isFriendPinned(friend.id)) item.classList.add('pinned');

                const displayName = getFriendDisplayName(friend.id);

                item.innerHTML = `
                    ${isBatchEditMode && friend.isCustom ? `<input type="checkbox" class="friend-batch-checkbox" data-friend-id="${friend.id}" ${selectedCustomFriends.has(friend.id) ? 'checked' : ''}>` : ''}
                    <img src="${friend.avatar}" alt="${friend.name}" class="friend-avatar" data-friend-id="${friend.id}">
                    <span class="friend-pin"><i class="ri-pushpin-2-fill"></i></span>
                    <div style="flex:1;">
                        <div class="friend-name">${displayName}${displayName !== friend.name ? `<span style="font-size:0.8em;color:#888">(${friend.name})</span>` : ''}</div>
                    </div>
                    ${friend.isGroup ? '<span class="friend-status">群聊</span>' : (threadManager[friend.id]?.threads.length > 1 ? '<span class="friend-status">多线程</span>' : '')}
                `;

                const batchCheckbox = item.querySelector('.friend-batch-checkbox');
                if (batchCheckbox) {
                    batchCheckbox.addEventListener('click', (e) => e.stopPropagation());
                    batchCheckbox.addEventListener('change', (e) => {
                        e.stopPropagation();
                        e.target.checked ? selectedCustomFriends.add(friend.id) : selectedCustomFriends.delete(friend.id);
                        updateBatchActionButtons();
                    });
                }

                const avatar = item.querySelector('.friend-avatar');
                avatar.addEventListener('contextmenu', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    showFriendContextMenu(e, friend.id);
                });

                let pressTimer;
                avatar.addEventListener('touchstart', (e) => {
                    pressTimer = setTimeout(() => {
                        showFriendContextMenu(e, friend.id);
                    }, 500);
                });
                avatar.addEventListener('touchend', () => clearTimeout(pressTimer));
                avatar.addEventListener('touchmove', () => clearTimeout(pressTimer));

                item.addEventListener('click', (e) => {
                    if (isBatchEditMode) {
                        const checkbox = item.querySelector('.friend-batch-checkbox');
                        if (checkbox) {
                            if (e.target !== checkbox) checkbox.checked = !checkbox.checked;
                            checkbox.checked ? selectedCustomFriends.add(friend.id) : selectedCustomFriends.delete(friend.id);
                        }
                        updateBatchActionButtons();
                        return;
                    }
                    switchFriend(friend.id);
                    if (isMobileView) {
                        sidebar.classList.add('hidden');
                        sidebarOverlay.classList.remove('show');
                    }
                });

                if (groupContent) {
                    groupContent.appendChild(item);
                }
            });


            const headers = friendList.querySelectorAll('.friend-group-header');
            headers.forEach(header => {
                const groupName = header.getAttribute('data-group');
                const count = allFriends.filter(f => getFriendGroup(f.id) === groupName).length;
                const countSpan = header.querySelector('.group-count');
                if (countSpan) {
                    countSpan.textContent = count;
                }
            });


            const collapsedGroups = JSON.parse(localStorage.getItem('collapsedGroups') || '{}');
            headers.forEach(header => {
                const groupName = header.getAttribute('data-group');
                if (collapsedGroups[groupName]) {
                    header.classList.add('collapsed');
                    const content = header.nextElementSibling;
                    if (content && content.classList.contains('friend-group-content')) {
                        content.classList.add('collapsed');
                    }
                }
            });
        }

        function showFriendContextMenu(e, friendId) {
            e.preventDefault();
            e.stopPropagation();
            currentFriendMenuTarget = friendId;

            const pinned = isFriendPinned(friendId);
            pinText.textContent = pinned ? '取消置顶' : '置顶';


            const friend = friendsData[friendId];
            menuChangeGroup.style.display = "flex";
            menuDeleteFriend.style.display = friend && friend.isCustom ? "flex" : "none";
            const rect = e.target.getBoundingClientRect();
            friendContextMenu.style.left = (rect.left) + 'px';
            friendContextMenu.style.top = (rect.bottom + 5) + 'px';

            toggleFriendContextMenu(true);
        }

        menuTogglePin.addEventListener('click', () => {
            if (currentFriendMenuTarget) {
                const pinned = !isFriendPinned(currentFriendMenuTarget);
                setFriendPinned(currentFriendMenuTarget, pinned);
                renderFriendList();
                showToast(`${getFriendDisplayName(currentFriendMenuTarget)} ${pinned ? '已置顶' : '已取消置顶'}`, pinned ? 'ri-pushpin-line' : 'ri-pushpin-2-line');
            }
            toggleFriendContextMenu(false);
        });

        menuSetRemark.addEventListener('click', () => {
            if (currentFriendMenuTarget) {
                const currentRemark = getFriendRemark(currentFriendMenuTarget);
                const newRemark = prompt(`设置 "${friendsData[currentFriendMenuTarget].name}" 的备注：`, currentRemark);
                if (newRemark !== null) {
                    setFriendRemark(currentFriendMenuTarget, newRemark.trim());
                    renderFriendList();
                    if (currentFriendId === currentFriendMenuTarget) {
                        currentFriendNameElement.textContent = getFriendDisplayName(currentFriendId);
                    }
                    showToast(`备注已${newRemark.trim() ? '更新' : '清除'}`, 'ri-edit-line');
                }
            }
            toggleFriendContextMenu(false);
        });


        menuChangeGroup.addEventListener('click', () => {
            if (!currentFriendMenuTarget) return;


            const allGroups = new Set(['默认', 'AI 助手', '游戏角色', '学习伙伴', '娱乐', '自定义']);
            Object.values(friendsData).forEach(f => {
                allGroups.add(getFriendGroup(f.id));
            });

            const groups = Array.from(allGroups).sort((a, b) => a.localeCompare(b, 'zh-CN'));
            const currentGroup = getFriendGroup(currentFriendMenuTarget);


            let groupHtml = '';
            groups.forEach(g => {
                const activeClass = g === currentGroup ? 'active' : '';
                const count = Object.values(friendsData).filter(f => getFriendGroup(f.id) === g).length;
                groupHtml += `
                    <div class="friend-group-option ${activeClass}" data-group="${g}">
                        <span>${g} (${count})</span>
                        ${g === currentGroup ? '<i class="ri-check-line"></i>' : ''}
                    </div>
                `;
            });


            friendGroupModalTitle.textContent = '选择分组';
            friendGroupModalBody.innerHTML = `
                <div class="friend-group-list">
                    ${groupHtml}
                </div>
            `;


            const options = friendGroupModalBody.querySelectorAll('.friend-group-option');
            let selectedGroup = currentGroup;

            options.forEach(opt => {
                opt.addEventListener('click', () => {
                    options.forEach(o => {
                        o.classList.remove('active');
                        o.querySelector('i')?.remove();
                    });
                    opt.classList.add('active');
                    const checkIcon = document.createElement('i');
                    checkIcon.className = 'ri-check-line';
                    opt.appendChild(checkIcon);
                    selectedGroup = opt.getAttribute('data-group');
                });
            });


            toggleFriendGroupModal(true);


            friendGroupConfirmBtn.onclick = () => {
                if (currentFriendMenuTarget && selectedGroup) {
                    setFriendGroup(currentFriendMenuTarget, selectedGroup);
                    renderFriendList();
                    showToast(`已移动分组至「${selectedGroup}」`, 'ri-folder-move-line');
                }
                toggleFriendGroupModal(false);
            };

            toggleFriendContextMenu(false);
        });


        menuDeleteFriend.addEventListener('click', () => {
            if (!currentFriendMenuTarget) return;

            const friend = friendsData[currentFriendMenuTarget];
            if (!friend || !friend.isCustom) {
                showToast('默认角色无法删除', 'ri-error-warning-line');
                toggleFriendContextMenu(false);
                return;
            }

            const confirmDelete = confirm(`确定要删除好友「${getFriendDisplayName(currentFriendMenuTarget)}」吗？\n\n此操作不可恢复，聊天记录也将被清空！`);
            if (!confirmDelete) {
                toggleFriendContextMenu(false);
                return;
            }


            delete friendsData[currentFriendMenuTarget];


            if (threadManager[currentFriendMenuTarget]) {
                delete threadManager[currentFriendMenuTarget];
            }


            saveCustomFriendsData();
            saveThreadManager();


            if (currentFriendId === currentFriendMenuTarget) {
                const remainingFriends = Object.keys(friendsData);
                if (remainingFriends.length > 0) {
                    switchFriend(remainingFriends[0]);
                } else {
                    currentFriendId = null;
                    chatMessages.innerHTML = '<div style="text-align:center;color:#888;margin-top:50px;">暂无好友，请添加新角色</div>';
                    currentFriendNameElement.textContent = '无';
                }
            } else {
                renderFriendList();
            }

            showToast(`已删除好友「${friend.name}」`, "ri-delete-bin-line");
            toggleFriendContextMenu(false);
        });

        function switchFriend(friendId) {
            clearTimeout(proactiveCareTimer);
            proactiveCareTimer = null;
            proactiveCareSequence += 1;
            if (isBatchEditMode) {
                isBatchEditMode = false;
                selectedCustomFriends.clear();
                updateBatchActionButtons();
            }
            document.querySelector('.quick-replies')?.remove();
            currentFriendId = friendId;
            if (!threadManager[friendId]) {
                threadManager[friendId] = { threads: [{ id: 1, name: '初始对话', messages: [] }], currentThreadId: 1, longTermMemory: [] };
                saveThreadManager();
            }

            const friend = friendsData[friendId];
            if (friend) {
                currentFriendNameElement.textContent = getFriendDisplayName(friendId);
            }


            localStorage.setItem('lastChatId', friendId);

            renderFriendList();
            renderMessages(friendId);

            // 清空快捷回复区域，避免上一个角色的回复残留
            document.querySelector('.quick-replies')?.remove();

            // 如果设置弹窗打开且处于长期记忆标签页，刷新记忆档案列表
            const activeTab = document.querySelector('.tab-button.active');
            if (activeTab && activeTab.dataset.tab === 'longterm-memory') {
                renderMemoryProfileList();
            }
        }

        function renderMessages(friendId) {
            chatMessages.innerHTML = '';
            let messages = getMessages();
            const friend = friendsData[friendId];

            // 应用显示限制设置 - 按对话轮数截取
            const chatSettings = getChatSettings();
            if (chatSettings.enableDisplayLimit && chatSettings.displayLimitRounds > 0) {
                const limitRounds = Math.max(1, chatSettings.displayLimitRounds);
                // 一轮对话 = 2 条消息（用户 + AI），所以需要的消息数量是轮数 * 2
                const maxMessages = limitRounds * 2;
                if (messages.length > maxMessages) {
                    messages = messages.slice(-maxMessages);
                }
            }

            if (messages.length === 0) {
                // 首次对话时，发送一条系统提示消息帮助 AI 进入角色
                appendMessageToDOM('other', friend.welcomeMessage, 'text', friend.avatar, getFriendDisplayName(friendId));

                // 添加一个隐藏的初始系统消息，强化角色设定（不显示在 UI 中）
                const initialSystemMessage = `现在正式开始与${getFriendDisplayName(friendId)}的对话。请完全进入角色，以角色的身份、性格和说话风格回应用户。记住：你就是${friend.name}，不是 AI 助手。`;
            } else {
                messages.forEach(msg => {
                    const speakerId = msg.friendId || friendId;
                    const speaker = friendsData[speakerId] || friend;
                    const avatarSrc = msg.role === 'mine' ? inputAvatar.src : speaker.avatar;
                    const nickName = msg.role === 'mine' ? myUserName : getFriendDisplayName(speakerId);
                    appendMessageToDOM(msg.role, msg.content, msg.type, avatarSrc, nickName, msg.isProactive, msg.id || msg.timestamp, msg);
                });
            }
            scrollToBottom();
            if (chatSearchInput?.value) updateChatSearch();
        }

        function applyBubbleTextStyle(bubble) {

            bubble.style.color = currentBubbleTextStyle.color;

            bubble.style.fontSize = currentBubbleTextStyle.fontSize + 'px';


            if (currentBubbleTextStyle.enableStroke && currentBubbleTextStyle.strokeWidth > 0) {
                const sw = currentBubbleTextStyle.strokeWidth;
                const sc = currentBubbleTextStyle.strokeColor;
                bubble.style.textShadow = `
                    -${sw}px -${sw}px 0 ${sc},
                    ${sw}px -${sw}px 0 ${sc},
                    -${sw}px ${sw}px 0 ${sc},
                    ${sw}px ${sw}px 0 ${sc},
                    0 -${sw}px 0 ${sc},
                    0 ${sw}px 0 ${sc},
                    -${sw}px 0 0 ${sc},
                    ${sw}px 0 0 ${sc}
                `;
            } else {
                bubble.style.textShadow = 'none';
            }
        }


        function splitMessageByPunctuation(text) {
            const chatSettings = getChatSettings();
            const charsPerLine = chatSettings.charsPerLine || 32;

            if (!text || text.trim().length === 0) return [];

            const result = [];

            // 如果文本长度小于等于设定值，不分段直接返回
            if (text.length <= charsPerLine) {
                result.push(text);
                return result;
            }

            const paragraphs = text.split(/\n+/);

            for (const paragraph of paragraphs) {
                const trimmedPara = paragraph.trim();
                if (!trimmedPara) continue;


                smartSplit(trimmedPara, charsPerLine, result);
            }

            return result;
        }


        function extractBracketsContent(text) {
            const brackets = [];

            const bracketRegex = /([[](?:[^]]*)(?:]|$)|[(](?:[^)]*)(?:\)|$)|[\[](?:[^\]]*)(?:\]|$)|[{](?:[^}]*)(?:}|$))/g;

            let match;
            let lastIndex = 0;
            let processedText = '';

            while ((match = bracketRegex.exec(text)) !== null) {

                processedText += text.slice(lastIndex, match.index);

                const placeholder = `\u0000BRACKET${brackets.length}\u0000`;
                processedText += placeholder;
                brackets.push(match[0]);
                lastIndex = match.index + match[0].length;
            }


            processedText += text.slice(lastIndex);

            return { processedText, brackets };
        }


        function restoreBracketsContent(text, brackets) {
            let result = text;
            for (let i = 0; i < brackets.length; i++) {
                const placeholder = `\u0000BRACKET${i}\u0000`;
                result = result.split(placeholder).join(brackets[i]);
            }
            return result;
        }


        function smartSplit(text, maxLen, result) {
            if (!text || text.length === 0) return;


            if (text.length <= maxLen) {
                result.push(text);
                return;
            }


            const { processedText, brackets } = extractBracketsContent(text);



            const punctuationRegex = /([。！？；，、.!?;,\s]+)/g;
            const segments = processedText.split(punctuationRegex);

            let current = '';
            for (let i = 0; i < segments.length; i++) {
                const segment = segments[i];
                if (!segment) continue;


                const hasBracketInSegment = /\u0000BRACKET\d+\u0000/.test(segment);


                const testStr = current + segment;

                if (testStr.length <= maxLen) {
                    current = testStr;
                } else {

                    if (current.trim()) {
                        result.push(restoreBracketsContent(current.trim(), brackets));
                    }


                    if (hasBracketInSegment) {

                        const bracketParts = segment.split(/(\u0000BRACKET\d+\u0000)/);
                        let tempCurrent = '';
                        for (const part of bracketParts) {
                            if (!part) continue;
                            const testTemp = tempCurrent + part;
                            if (testTemp.length <= maxLen) {
                                tempCurrent = testTemp;
                            } else {
                                if (tempCurrent.trim()) {
                                    result.push(restoreBracketsContent(tempCurrent.trim(), brackets));
                                }

                                if (/^\u0000BRACKET\d+\u0000$/.test(part) && part.length > maxLen) {

                                    result.push(restoreBracketsContent(part, brackets));
                                    tempCurrent = '';
                                } else {
                                    tempCurrent = part;
                                }
                            }
                        }
                        current = tempCurrent;
                    } else if (segment.length > maxLen) {

                        forceSplit(segment, maxLen, result, brackets);
                        current = '';
                    } else {
                        current = segment;
                    }
                }
            }


            if (current && current.trim()) {
                result.push(restoreBracketsContent(current.trim(), brackets));
            }
        }


        function forceSplit(text, maxLen, result, brackets = []) {
            if (!text || text.length === 0) return;


            const hasPlaceholders = /\u0000BRACKET\d+\u0000/.test(text);


            const naturalBreaks = /([\s\-—–]+)/g;
            const parts = text.split(naturalBreaks);

            if (parts.length > 1) {

                let current = '';
                for (const part of parts) {
                    if (!part) continue;
                    const testStr = current + part;
                    if (testStr.length <= maxLen) {
                        current = testStr;
                    } else {
                        if (current.trim()) {
                            const restored = hasPlaceholders ? restoreBracketsContent(current.trim(), brackets) : current.trim();
                            result.push(restored);
                        }
                        if (part.length > maxLen) {
                            forceSplit(part, maxLen, result, brackets);
                        } else {
                            current = part;
                        }
                    }
                }
                if (current && current.trim()) {
                    const restored = hasPlaceholders ? restoreBracketsContent(current.trim(), brackets) : current.trim();
                    result.push(restored);
                }
                return;
            }


            for (let i = 0; i < text.length; i += maxLen) {
                const chunk = text.substring(i, i + maxLen);
                if (chunk.trim()) {
                    const restored = hasPlaceholders ? restoreBracketsContent(chunk.trim(), brackets) : chunk.trim();
                    result.push(restored);
                }
            }
        }



        function appendMessageToDOM(role, text, type, avatarSrc, nickName, isProactive = false, messageId = null, meta = {}) {
            const chatSettings = getChatSettings();
            const enableSegmentation = chatSettings.enableMessageSegmentation;

            // 如果没有传入 messageId，使用当前时间戳作为默认值
            if (messageId === null) {
                messageId = Date.now();
            }

            // 只对 AI 消息（role === 'other'）进行分段，用户消息不分段
            const messagesToSend = (type === 'text' && enableSegmentation && role === 'other')
                ? splitMessageByPunctuation(text)
                : [text];

            messagesToSend.forEach((segment, index) => {
                const msgDiv = document.createElement('div');
                msgDiv.classList.add('message', role);
                if (messageId) msgDiv.dataset.messageId = messageId + (index > 0 ? `-${index}` : '');

                const avatarImg = document.createElement('img');
                avatarImg.src = avatarSrc;
                avatarImg.classList.add('avatar');

                if (role === 'other' && index === 0) {
                    avatarImg.addEventListener('click', (e) => {
                        e.stopPropagation();
                        currentAiAvatarTarget = currentFriendId;
                        const rect = avatarImg.getBoundingClientRect();
                        aiAvatarContextMenu.style.left = rect.left + 'px';
                        aiAvatarContextMenu.style.top = (rect.bottom + 5) + 'px';
                        toggleAiAvatarMenu(true);
                    });
                }

                if(role === 'mine' && index === 0) avatarImg.addEventListener('click', () => avatarUpload.click());

                const contentDiv = document.createElement('div');
                contentDiv.classList.add('message-content');

                const nickSpan = document.createElement('span');
                nickSpan.classList.add('nickname');
                nickSpan.textContent = nickName;

                let bubble;
                if (type === 'text') {
                    bubble = document.createElement('div');
                    bubble.classList.add('bubble');


                    if (currentBubbleStyle === 'sharp') {
                        bubble.style.borderRadius = '4px';
                    } else if (currentBubbleStyle === 'rounded') {
                        bubble.style.borderRadius = '20px';
                    }


                    if (currentBubbleImage) {
                        bubble.classList.add('has-custom-bg');
                        bubble.style.backgroundImage = `url('${currentBubbleImage}')`;
                    }


                    applyBubbleTextStyle(bubble);

                    if (isProactive && index === 0) {
                        bubble.classList.add('proactive');
                        const tag = document.createElement('span');
                        tag.classList.add('proactive-tag');
                        tag.textContent = '💬 主动关怀';
                        bubble.appendChild(tag);
                    }
                    // 使用 DOMPurify 清理 marked 解析后的 HTML，防止 XSS
                    const parsedHtml = marked.parse(segment);
                    appendSanitizedHtml(bubble, parsedHtml);
                } else if (type === 'image') {
                    bubble = document.createElement('img');
                    bubble.classList.add('bubble', 'message-image');
                    bubble.src = segment;
                    bubble.addEventListener('click', () => {
                        const win = window.open('', '_blank', 'noopener,noreferrer');
                        if (!win) return;
                        win.opener = null;
                        // 使用安全的 DOM 操作替代 document.write
                        const img = win.document.createElement('img');
                        img.src = segment;
                        img.style.maxWidth = '100%';
                        win.document.body.appendChild(img);
                    });
                } else if (type === 'audio') {
                    bubble = document.createElement('div');
                    bubble.classList.add('bubble', 'audio-bubble');
                    const audio = document.createElement('audio');
                    audio.controls = true;
                    audio.src = segment;
                    bubble.appendChild(audio);
                }

                contentDiv.appendChild(nickSpan);
                if (meta?.replyTo) {
                    const quote = document.createElement('div');
                    quote.className = 'reply-preview';
                    quote.textContent = `↪ ${meta.replyTo.name || '引用'}：${String(meta.replyTo.content || '').slice(0, 80)}`;
                    contentDiv.appendChild(quote);
                }
                contentDiv.appendChild(bubble);
                if (meta?.elapsedMs && role === 'other' && index === 0) {
                    const metaDiv = document.createElement('div');
                    metaDiv.className = 'message-meta';
                    metaDiv.textContent = `回复耗时 ${(meta.elapsedMs / 1000).toFixed(1)}s`;
                    contentDiv.appendChild(metaDiv);
                }
                if (role === 'mine' && index === 0) {
                    attachOwnMessageActions(msgDiv, messageId);
                }
                msgDiv.appendChild(avatarImg);
                msgDiv.appendChild(contentDiv);

                chatMessages.appendChild(msgDiv);


                if (index === 0) {
                    const actionsDiv = document.createElement('div');
                    actionsDiv.className = 'message-actions';
                    if (role === 'other' && type === 'text' && showRegenerateBtnCheckbox.checked) {
                        const regenerateBtn = document.createElement('div');
                        regenerateBtn.className = 'regenerate-btn';
                        regenerateBtn.innerHTML = '<i class="ri-refresh-line"></i>';
                        regenerateBtn.title = '重新回答';
                        regenerateBtn.addEventListener('click', () => {
                            console.log('重新回答按钮点击，messageId:', msgDiv.dataset.messageId);
                            regenerateAIResponse(msgDiv.dataset.messageId);
                        });
                        actionsDiv.appendChild(regenerateBtn);
                    }
                    if (getFeatureToggles().showMessageTts && type === 'text') {
                        const ttsBtn = document.createElement('div');
                        ttsBtn.className = 'regenerate-btn';
                        ttsBtn.innerHTML = '<i class="ri-volume-up-line"></i>';
                        ttsBtn.title = '朗读消息';
                        ttsBtn.addEventListener('click', () => speakMessageText(segment));
                        actionsDiv.appendChild(ttsBtn);
                    }
                    if (getFeatureToggles().showMessageQuote && type === 'text') {
                        const quoteBtn = document.createElement('div');
                        quoteBtn.className = 'regenerate-btn';
                        quoteBtn.innerHTML = '<i class="ri-double-quotes-l"></i>';
                        quoteBtn.title = '引用回复';
                        quoteBtn.addEventListener('click', () => quoteMessageForReply({ id: msgDiv.dataset.messageId, role, content: segment, name: nickName }));
                        actionsDiv.appendChild(quoteBtn);
                    }
                    if (getFeatureToggles().showBranchButtons) {
                        const branchBtn = document.createElement('div');
                        branchBtn.className = 'regenerate-btn';
                        branchBtn.innerHTML = '<i class="ri-git-branch-line"></i>';
                        branchBtn.title = '从此处开新对话';
                        branchBtn.addEventListener('click', () => createBranchFromMessage(msgDiv.dataset.messageId));
                        actionsDiv.appendChild(branchBtn);
                    }
                    if (actionsDiv.children.length > 0) chatMessages.appendChild(actionsDiv);
                }
            });
        }


        function getMessageIdBase(messageId) {
            return String(messageId || '').split('-')[0];
        }

        function findMessageById(messageId) {
            const id = getMessageIdBase(messageId);
            const thread = getCurrentThread();
            if (!thread) return null;
            const index = thread.messages.findIndex(msg => String(msg.id || msg.timestamp) === id);
            return index >= 0 ? { thread, index, message: thread.messages[index] } : null;
        }

        function attachOwnMessageActions(msgDiv, messageId) {
            let longPressTimer = null;
            const openActions = (event) => {
                event.preventDefault();
                const found = findMessageById(messageId);
                if (!found || found.message.role !== 'mine') return;
                const action = prompt('输入 e 编辑消息，输入 r 撤回消息：', 'e');
                if (action === null) return;
                if (action.trim().toLowerCase() === 'r') {
                    revokeOwnMessage(messageId);
                } else {
                    editOwnMessage(messageId);
                }
            };
            msgDiv.addEventListener('contextmenu', openActions);
            msgDiv.addEventListener('touchstart', () => {
                longPressTimer = setTimeout(() => openActions(new Event('contextmenu')), 650);
            }, { passive: true });
            ['touchend', 'touchmove', 'touchcancel'].forEach(type => {
                msgDiv.addEventListener(type, () => clearTimeout(longPressTimer), { passive: true });
            });
        }

        function editOwnMessage(messageId) {
            const found = findMessageById(messageId);
            if (!found || found.message.role !== 'mine' || found.message.type !== 'text' || found.message.revoked) {
                showToast('这条消息不能编辑', 'ri-error-warning-line');
                return;
            }
            const nextContent = prompt('编辑消息内容：', found.message.content);
            if (nextContent === null) return;
            if (!nextContent.trim()) {
                showToast('消息内容不能为空', 'ri-error-warning-line');
                return;
            }
            found.message.content = nextContent.trim();
            found.message.edited = true;
            found.message.editedAt = Date.now();
            saveThreadManager();
            renderMessages(currentFriendId);
            showToast('消息已编辑', 'ri-edit-line');
        }

        function revokeOwnMessage(messageId) {
            const found = findMessageById(messageId);
            if (!found || found.message.role !== 'mine') return;
            if (!confirm('确定撤回这条消息吗？')) return;
            found.message.content = '你撤回了一条消息';
            found.message.type = 'text';
            found.message.revoked = true;
            found.message.revokedAt = Date.now();
            saveThreadManager();
            renderMessages(currentFriendId);
            showToast('消息已撤回', 'ri-arrow-go-back-line');
        }

        function scrollToBottom() {
            chatMessages.scrollTop = chatMessages.scrollHeight;
        }

        function appendSystemMessage(htmlContent) {
            const msgDiv = document.createElement('div');
            msgDiv.classList.add('message');
            msgDiv.style.justifyContent = 'center';

            const bubble = document.createElement('div');
            bubble.classList.add('bubble', 'system-bubble');
            appendSanitizedHtml(bubble, htmlContent);

            msgDiv.appendChild(bubble);
            chatMessages.appendChild(msgDiv);
            scrollToBottom();
        }



        function showToast(message, iconClass = 'ri-information-line') {
            const toastContainer = document.getElementById('toast-container');
            const toastMessage = document.getElementById('toast-message');
            const toastIcon = toastContainer.querySelector('i');


            toastIcon.className = iconClass;
            toastMessage.textContent = message;


            toastContainer.classList.add('show');


            setTimeout(() => {
                toastContainer.classList.remove('show');
            }, 2000);
        }


        function createBranchFromMessage(messageId) {
            const thread = getCurrentThread();
            if (!thread) return;
            const baseId = String(messageId).split('-')[0];
            const msgIndex = thread.messages.findIndex(m => String(m.id || m.timestamp) === baseId);
            if (msgIndex < 0) {
                showToast('找不到分支起点', 'ri-error-warning-line');
                return;
            }
            const friendData = threadManager[currentFriendId];
            const newId = Math.max(0, ...friendData.threads.map(t => t.id)) + 1;
            friendData.threads.push({
                id: newId,
                name: `分支 ${newId}`,
                messages: thread.messages.slice(0, msgIndex + 1).map(msg => ({ ...msg }))
            });
            friendData.currentThreadId = newId;
            saveThreadManager();
            renderFriendList();
            renderMessages(currentFriendId);
            showToast('已从此处创建新对话分支', 'ri-git-branch-line');
        }

        function removeRenderedMessagesFrom(messageId) {
            const target = chatMessages.querySelector(`[data-message-id="${messageId}"]`) || chatMessages.querySelector(`[data-message-id="${getMessageIdBase(messageId)}"]`);
            if (!target) return false;
            let node = target;
            while (node) {
                const next = node.nextSibling;
                node.remove();
                node = next;
            }
            return true;
        }

        function regenerateAIResponse(messageId) {
            const messages = getMessages();

            const baseId = messageId.split('-')[0];
            const msgIndex = messages.findIndex(m => String(m.id || m.timestamp) === baseId);

            console.log('重新回答调试:', { messageId, baseId, msgIndex, messagesCount: messages.length });

            if (msgIndex === -1 || msgIndex === 0) {
                showToast("无法重新生成回复", "ri-error-warning-line");
                return;
            }

            let lastUserMsg = null;
            for (let i = msgIndex - 1; i >= 0; i--) {
                if (messages[i].role === 'mine') {
                    lastUserMsg = messages[i].content;
                    break;
                }
            }

            if (!lastUserMsg) {
                showToast("找不到对应的用户消息", "ri-error-warning-line");
                return;
            }

            const friendData = threadManager[currentFriendId];
            const thread = friendData.threads.find(t => t.id === friendData.currentThreadId);
            if (thread) {
                console.log('删除消息前的线程消息数:', thread.messages.length);
                // 删除从 msgIndex 开始的所有消息（包括 AI 回复）
                thread.messages.splice(msgIndex);
                console.log('删除消息后的线程消息数:', thread.messages.length);
                saveThreadManager();
                removeRenderedMessagesFrom(baseId);
                console.log('开始调用 AI，用户消息:', lastUserMsg);
                enqueueAIResponse(lastUserMsg);
            } else {
                console.error('找不到当前线程');
                showToast("找不到当前对话线程", "ri-error-warning-line");
            }
        }

        async function generateQuickReplies(userMessage, aiResponse) {
            if (!enableLazyModeCheckbox.checked) return;

            const apiSettings = JSON.parse(localStorage.getItem('aiChatSettings'));
            if (!apiSettings || !apiSettings.apiKey) return;

            const friend = friendsData[currentFriendId];

            const prompt = `
基于以下对话上下文，请站在**用户（绳匠/开拓者）**的角度，生成2个简短的回复选项（每个不超过20字）。
回复内容应该是用户想对 AI 说的话，符合用户的说话风格。
直接返回JSON格式数组，不要其他文字。
格式：["回复选项1", "回复选项2"]

对话：
用户：${userMessage}
AI：${aiResponse}
角色人设（供参考语气）：${friend.systemPrompt.substring(0, 500)}
            `;

            try {
                const response = await fetch(apiSettings.apiUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${apiSettings.apiKey}`
                    },
                    body: JSON.stringify({
                        model: apiSettings.modelName,
                        messages: [{ role: "system", content: prompt }],
                        temperature: 0.8,
                        max_tokens: 100
                    })
                });

                if (response.ok) {
                    const data = await response.json();
                    const content = data.choices[0].message.content;
                    try {
                        const jsonStr = content.replace(/```json/g, '').replace(/```/g, '').trim();
                        const replies = JSON.parse(jsonStr);
                        if (Array.isArray(replies) && replies.length > 0) {
                            displayQuickReplies(replies.slice(0, 2));
                        }
                    } catch (e) {
                        console.warn('快捷回复解析失败:', e);
                    }
                }
            } catch (e) {
                console.error('生成快捷回复失败:', e);
            }
        }

        function displayQuickReplies(replies) {
            const oldReplies = document.querySelector('.quick-replies');
            if (oldReplies) oldReplies.remove();

            const repliesDiv = document.createElement('div');
            repliesDiv.className = 'quick-replies';

            replies.forEach(reply => {
                const btn = document.createElement('button');
                btn.className = 'quick-reply-btn';
                btn.textContent = reply;
                btn.addEventListener('click', () => {
                    messageInput.value = reply;
                    messageInput.focus();
                    repliesDiv.remove();
                });
                repliesDiv.appendChild(btn);
            });

            chatMessages.appendChild(repliesDiv);
            scrollToBottom();
        }


        function getDefaultFeatureToggles() {
            return {
                showThemeToggle: true,
                showGlobalSearch: true,
                showBatchActions: true,
                showVoiceInput: true,
                showCommandPanel: true,
                showReadableExport: true,
                showBranchButtons: true,
                showCodeCopy: true,
                showCustomStickers: true,
                showMessageTts: true,
                showMessageQuote: true,
                showChatSummary: true,
                showChatStats: true,
                showMarkdownPreview: true,
                showGroupChat: true
            };
        }

        function getFeatureToggles() {
            return { ...getDefaultFeatureToggles(), ...(getChatSettings().featureToggles || {}) };
        }

        function setElementVisible(element, visible) {
            if (!element) return;
            if (element.dataset.defaultDisplay === undefined) {
                element.dataset.defaultDisplay = element.style.display || '';
            }
            element.hidden = !visible;
            element.style.display = visible ? element.dataset.defaultDisplay : 'none';
        }

        function applyFeatureToggles() {
            const toggles = getFeatureToggles();
            setElementVisible(themeToggleBtn, toggles.showThemeToggle);
            setElementVisible(voiceInputBtn, toggles.showVoiceInput);
            setElementVisible(commandPanelBtn, toggles.showCommandPanel);
            setElementVisible(summaryChatBtn, toggles.showChatSummary);
            setElementVisible(chatStatsBtn, toggles.showChatStats);
            setElementVisible(document.getElementById('export-readable-actions'), toggles.showReadableExport);
            setElementVisible(batchEditBtn, toggles.showBatchActions);
            setElementVisible(createGroupBtn, toggles.showGroupChat);
            if (!toggles.showBatchActions) {
                isBatchEditMode = false;
                selectedCustomFriends.clear();
            }
            updateBatchActionButtons();
            if (!toggles.showCommandPanel && commandPanel) {
                commandPanel.hidden = true;
                commandPanel.classList.remove('show');
            }
            if (!toggles.showGlobalSearch && globalSearchResults) {
                globalSearchResults.hidden = true;
                globalSearchResults.innerHTML = '';
            }
            renderFriendList();
            renderMessages(currentFriendId);
            if (emojiPicker) initEmojiPicker();
        }

        function loadChatSettings() {
            const settings = JSON.parse(localStorage.getItem('chatSettings'));
            if (settings) {
                maxContextRoundsInput.value = settings.maxContextRounds !== undefined ? settings.maxContextRounds : 0;
                maxTokensInput.value = settings.maxTokens !== undefined ? settings.maxTokens : 1024;
                enableLongTermMemoryCheckbox.checked = settings.enableLongTermMemory !== undefined ? settings.enableLongTermMemory : true;
                enableProactiveCareCheckbox.checked = settings.enableProactiveCare !== undefined ? settings.enableProactiveCare : false;
                messageDebounceInput.value = settings.messageDebounce !== undefined ? settings.messageDebounce : 30;
                enableLazyModeCheckbox.checked = settings.enableLazyMode !== undefined ? settings.enableLazyMode : false;
                showRegenerateBtnCheckbox.checked = settings.showRegenerateBtn !== undefined ? settings.showRegenerateBtn : true;
                enableRealTimeCheckbox.checked = settings.enableRealTime !== undefined ? settings.enableRealTime : false;
                enableStreamingInputCheckbox.checked = settings.enableStreamingInput !== undefined ? settings.enableStreamingInput : true;
                bubbleWidthPercentInput.value = settings.bubbleWidthPercent !== undefined ? settings.bubbleWidthPercent : 85;
                bubbleWidthSlider.value = settings.bubbleWidthPercent !== undefined ? settings.bubbleWidthPercent : 85;
                enableMessageSegmentationCheckbox.checked = settings.enableMessageSegmentation !== undefined ? settings.enableMessageSegmentation : false;
                charsPerLineInput.value = settings.charsPerLine !== undefined ? settings.charsPerLine : 32;
                enableDisplayLimitCheckbox.checked = settings.enableDisplayLimit !== undefined ? settings.enableDisplayLimit : false;
                displayLimitRoundsInput.value = settings.displayLimitRounds !== undefined ? settings.displayLimitRounds : 20;
                const toggles = { ...getDefaultFeatureToggles(), ...(settings.featureToggles || {}) };
                Object.entries(featureToggleInputs).forEach(([key, input]) => { if (input) input.checked = toggles[key]; });
                currentBubbleStyle = settings.bubbleStyle || 'default';
                currentBubbleImage = settings.bubbleImage || null;
                currentBubbleTextStyle = settings.bubbleTextStyle || {
                    color: '#ffffff',
                    fontSize: 14,
                    strokeColor: '#000000',
                    strokeWidth: 1,
                    enableStroke: true
                };
                updateBubbleStyleUI();
                applyBubbleBackground();
                updateBubbleTextInputs();


                const root = document.documentElement;
                root.style.setProperty('--bubble-max-width', (settings.bubbleWidthPercent || 85) + '%');
            } else {
                const toggles = getDefaultFeatureToggles();
                Object.entries(featureToggleInputs).forEach(([key, input]) => { if (input) input.checked = toggles[key]; });
            }
            applyFeatureToggles();
            renderContextEditList();
        }

        function saveChatSettings() {
            const settings = {
                maxContextRounds: parseInt(maxContextRoundsInput.value) || 0,
                maxTokens: parseInt(maxTokensInput.value) || 1024,
                enableLongTermMemory: enableLongTermMemoryCheckbox.checked,
                enableProactiveCare: enableProactiveCareCheckbox.checked,
                messageDebounce: Number.isNaN(parseInt(messageDebounceInput.value, 10)) ? 30 : Math.max(0, parseInt(messageDebounceInput.value, 10)),
                enableLazyMode: enableLazyModeCheckbox.checked,
                showRegenerateBtn: showRegenerateBtnCheckbox.checked,
                enableRealTime: enableRealTimeCheckbox.checked,
                enableStreamingInput: enableStreamingInputCheckbox.checked,
                bubbleWidthPercent: parseInt(bubbleWidthPercentInput.value) || 85,
                enableMessageSegmentation: enableMessageSegmentationCheckbox.checked,
                bubbleStyle: currentBubbleStyle,
                charsPerLine: parseInt(charsPerLineInput.value) || 32,
                bubbleImage: currentBubbleImage,
                bubbleTextStyle: currentBubbleTextStyle,
                enableDisplayLimit: enableDisplayLimitCheckbox.checked,
                displayLimitRounds: parseInt(displayLimitRoundsInput.value) || 20,
                featureToggles: Object.fromEntries(
                    Object.entries(featureToggleInputs).map(([key, input]) => [key, input ? input.checked : true])
                )
            };
            localStorage.setItem('chatSettings', JSON.stringify(settings));


            const root = document.documentElement;
            root.style.setProperty('--bubble-max-width', settings.bubbleWidthPercent + '%');

            return settings;
        }

        function getChatSettings() {
            const settings = JSON.parse(localStorage.getItem('chatSettings'));
            return settings || {
                maxContextRounds: 0,
                maxTokens: 1024,
                enableLongTermMemory: true,
                enableProactiveCare: false,
                messageDebounce: 30,
                enableLazyMode: false,
                showRegenerateBtn: true,
                enableRealTime: false,
                bubbleWidthPercent: 85,
                enableMessageSegmentation: false,
                bubbleStyle: 'default',
                charsPerLine: 32,
                bubbleImage: null,
                enableDisplayLimit: false,
                displayLimitRounds: 20,
                featureToggles: getDefaultFeatureToggles(),
                bubbleTextStyle: {
                    color: '#ffffff',
                    fontSize: 14,
                    strokeColor: '#000000',
                    strokeWidth: 1,
                    enableStroke: true
                }
            };
        }

        function renderContextEditList() {
            const messages = getMessages();
            contextEditListContainer.innerHTML = '';

            if (messages.length === 0) {
                contextEditListContainer.innerHTML = '<div style="text-align: center; color: #666; padding: 10px;">暂无消息</div>';
                return;
            }

            messages.forEach((msg, index) => {
                const item = document.createElement('div');
                item.classList.add('context-item');

                const roleClass = msg.role === 'mine' ? 'role-mine' : 'role-other';
                const roleName = msg.role === 'mine' ? '我' : (getFriendDisplayName(currentFriendId) || 'AI');

                let displayText = msg.content;
                if (displayText.length > 30) {
                    displayText = displayText.substring(0, 30) + '...';
                }
                if (msg.type === 'image') {
                    displayText = '[图片消息]';
                }

                item.innerHTML = `
                    <span class="context-role ${roleClass}">${roleName}</span>
                    <span class="context-text" title="${msg.content}">${displayText}</span>
                    <div style="display:flex; gap:5px;">
                        <i class="ri-pencil-line edit-context" title="编辑"></i>
                        <i class="ri-delete-bin-line del-context" title="删除"></i>
                    </div>
                `;

                item.querySelector('.edit-context').addEventListener('click', () => editMessage(index));
                item.querySelector('.del-context').addEventListener('click', () => deleteMessage(index));

                contextEditListContainer.appendChild(item);
            });
        }

        function editMessage(index) {
            const messages = getMessages();
            if (index < 0 || index >= messages.length) return;

            const msg = messages[index];
            if (msg.type === 'image') {
                alert('暂时不支持编辑图片消息，请删除后重新发送。');
                return;
            }

            const newText = prompt(`编辑消息 (${msg.role === 'mine' ? '我' : 'AI'}):\n\n${msg.content}`, msg.content);

            if (newText !== null && newText.trim() !== '') {
                msg.content = newText.trim();
                saveThreadManager();
                renderContextEditList();
                renderMessages(currentFriendId);
                showToast(`已修改第 ${index + 1} 条消息`, 'ri-edit-line');
            }
        }

        function deleteMessage(index) {
            if (!confirm('确定要删除这条消息吗？这会影响后续的对话上下文。')) return;

            const friendData = threadManager[currentFriendId];
            const thread = friendData.threads.find(t => t.id === friendData.currentThreadId);
            if (thread) {
                thread.messages.splice(index, 1);
                saveThreadManager();
                renderContextEditList();
                renderMessages(currentFriendId);
                showToast(`已删除第 ${index + 1} 条消息`, 'ri-delete-bin-line');
            }
        }




        async function fetchEmbedding(text, embeddingModel, apiUrl, apiKey, attempt = 1) {
            const embedUrl = normalizeEmbeddingUrl(apiUrl);
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 12000);
            try {
                const response = await fetch(embedUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${apiKey}`
                    },
                    body: JSON.stringify({
                        model: embeddingModel,
                        input: text
                    }),
                    signal: controller.signal
                });
                clearTimeout(timeoutId);

                if (!response.ok) {
                    const errData = await response.json();
                    throw new Error(errData.error?.message || `Embedding API Error: ${response.status}`);
                }

                const data = await response.json();
                return data.data[0]?.embedding || null;
            } catch (error) {
                clearTimeout(timeoutId);
                if (attempt < 3) {
                    const delay = 500 * attempt;
                    console.warn(`获取嵌入向量失败，${delay}ms 后重试第 ${attempt + 1} 次:`, error);
                    await new Promise(resolve => setTimeout(resolve, delay));
                    return fetchEmbedding(text, embeddingModel, apiUrl, apiKey, attempt + 1);
                }
                console.error('获取嵌入向量失败:', error);
                return null;
            }
        }


        function calculateCosineSimilarity(vecA, vecB) {
            if (!vecA || !vecB || vecA.length !== vecB.length) return 0;

            let dotProduct = 0;
            let normA = 0;
            let normB = 0;

            for (let i = 0; i < vecA.length; i++) {
                dotProduct += vecA[i] * vecB[i];
                normA += vecA[i] * vecA[i];
                normB += vecB[i] * vecB[i];
            }

            if (normA === 0 || normB === 0) return 0;
            return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
        }


        function getHolidayName(year, month, day) {
            const date = new Date(year, parseInt(month) - 1, parseInt(day));
            const monthDay = month + day;
            const dayOfWeek = date.getDay();


            const fixedHolidays = {
                '0101': '元旦',
                '0214': '情人节',
                '0308': '妇女节',
                '0312': '植树节',
                '0401': '愚人节',
                '0405': '清明节',
                '0501': '劳动节',
                '0504': '青年节',
                '0601': '儿童节',
                '0701': '建党节',
                '0801': '建军节',
                '0910': '教师节',
                '1001': '国庆节',
                '1031': '万圣节',
                '1111': '光棍节',
                '1224': '平安夜',
                '1225': '圣诞节'
            };

            if (fixedHolidays[monthDay]) {
                return fixedHolidays[monthDay];
            }


            if (dayOfWeek === 0 || dayOfWeek === 6) {
                return '周末';
            }


            const lunarHolidays = {

                '2024-02-10': '春节',
                '2025-01-29': '春节',
                '2026-02-17': '春节',

                '2024-02-24': '元宵节',
                '2025-02-12': '元宵节',
                '2026-03-02': '元宵节',

                '2024-06-10': '端午节',
                '2025-05-31': '端午节',
                '2026-06-19': '端午节',

                '2024-08-10': '七夕节',
                '2025-08-29': '七夕节',
                '2026-08-19': '七夕节',

                '2024-09-17': '中秋节',
                '2025-10-06': '中秋节',
                '2026-09-25': '中秋节',

                '2024-10-11': '重阳节',
                '2025-10-29': '重阳节',
                '2026-10-19': '重阳节',

                '2024-01-18': '腊八节',
                '2025-01-07': '腊八节',
                '2026-01-26': '腊八节'
            };

            const dateKey = `${year}-${month}-${day}`;
            if (lunarHolidays[dateKey]) {
                return lunarHolidays[dateKey];
            }

            return null;
        }


        async function searchMemoriesByVector(query, maxResults = 5) {
            const chatSettings = getChatSettings();
            if (!chatSettings.enableLongTermMemory) return [];

            const memories = getLongTermMemory();
            if (memories.length === 0) return [];

            // 获取长期记忆配置
            const ltmSettings = JSON.parse(localStorage.getItem('longTermMemorySettings')) || {};
            const mainApiSettings = JSON.parse(localStorage.getItem('aiChatSettings')) || {};

            // 使用长期记忆专用配置，如果未设置则复用主 API 配置
            const apiUrl = ltmSettings.apiUrl || mainApiSettings.apiUrl;
            const apiKey = ltmSettings.apiKey || mainApiSettings.apiKey;
            const embeddingModel = ltmSettings.embeddingModel || 'text-embedding-3-small';
            const rerankModel = ltmSettings.enableRerank === true ? ltmSettings.rerankModel : '';

            if (!apiUrl || !apiKey) {
                console.warn('长期记忆检索：缺少 API 配置，降级为关键词匹配');
                return fallbackKeywordSearch(query, memories, maxResults);
            }

            try {
                // 1. 获取查询的嵌入向量
                const queryEmbedding = await fetchEmbedding(query, embeddingModel, apiUrl, apiKey);
                if (!queryEmbedding) {
                    console.warn('长期记忆检索：嵌入向量获取失败，降级为关键词匹配');
                    return fallbackKeywordSearch(query, memories, maxResults);
                }

                // 2. 计算每条记忆与查询的余弦相似度（并行处理所有记忆）
                const scoredMemoriesPromises = memories.map(async (mem) => {
                    const memoryText = `${mem.key}: ${mem.value}`;
                    const score = await calculateCosineSimilarityFromText(memoryText, queryEmbedding, embeddingModel, apiUrl, apiKey);
                    return {
                        ...mem,
                        score: score
                    };
                });

                let scoredMemories = await Promise.all(scoredMemoriesPromises);

                // 3. 重排序端点不是通用 OpenAI API，默认仅使用向量相似度；只有显式 enableRerank 才尝试。
                let finalMemories = scoredMemories;
                if (rerankModel && scoredMemories.length > 0) {
                    try {
                        finalMemories = await rerankMemories(query, memories, rerankModel, apiUrl, apiKey, maxResults);
                    } catch (rerankError) {
                        console.warn('长期记忆检索：重排序失败，使用相似度排序', rerankError);
                        finalMemories = scoredMemories;
                    }
                }

                // 4. 按分数降序排序并取前 N 条
                if (!rerankModel) {
                    finalMemories = scoredMemories.sort((a, b) => b.score - a.score).slice(0, maxResults);
                }

                const matchedMemories = finalMemories.filter(m => m.score > 0).map(mem => ({
                    ...mem,
                    type: 'memory'
                }));

                if (matchedMemories.length === 0) {
                    console.log('长期记忆检索：未找到高相关度记忆，降级为关键词匹配');
                    return fallbackKeywordSearch(query, memories, maxResults);
                }

                console.log(`长期记忆检索：找到 ${matchedMemories.length} 条相关记忆（向量检索）`);
                return matchedMemories;

            } catch (error) {
                console.warn('长期记忆向量检索失败，降级为关键词匹配:', error);
                return fallbackKeywordSearch(query, memories, maxResults);
            }
        }

        // 降级方案：关键词匹配
        function fallbackKeywordSearch(query, memories, maxResults) {
            const queryLower = query.toLowerCase();
            return memories
                .filter(mem => {
                    const memoryText = `${mem.key}: ${mem.value}`.toLowerCase();
                    return memoryText.includes(queryLower);
                })
                .slice(0, maxResults)
                .map(mem => ({
                    ...mem,
                    score: 0.5,
                    type: 'memory'
                }));
        }

        // 从文本计算相似度（简化版本：先获取文本的嵌入向量再计算）
        async function calculateCosineSimilarityFromText(text, queryEmbedding, embeddingModel, apiUrl, apiKey) {
            const textEmbedding = await fetchEmbedding(text, embeddingModel, apiUrl, apiKey);
            if (!textEmbedding) return 0;
            return calculateCosineSimilarity(queryEmbedding, textEmbedding);
        }

        // 使用重排序模型对记忆进行重排序
        async function rerankMemories(query, memories, rerankModel, apiUrl, apiKey, maxResults) {
            const rerankUrl = apiUrl.replace('/chat/completions', '/rerank').replace(/\/v\d+$/, '/v1/rerank');
            const pairs = memories.map(m => `${m.key}: ${m.value}`);

            const response = await fetch(rerankUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                body: JSON.stringify({
                    model: rerankModel,
                    query: query,
                    documents: pairs,
                    top_n: maxResults
                })
            });

            if (!response.ok) {
                throw new Error(`Rerank API Error: ${response.status}`);
            }

            const data = await response.json();
            const results = data.results || [];

            // 根据重排序结果重新排列记忆
            const rerankedMemories = results.map(r => {
                const index = r.index;
                const score = r.relevance_score || r.score;
                return {
                    ...memories[index],
                    score: score,
                    type: 'memory'
                };
            });

            return rerankedMemories;
        }


        async function queryKnowledgeBase(query, maxResults = 3) {
            const kbSettings = JSON.parse(localStorage.getItem('knowledgeSettings')) || {};
            if (!kbSettings.enabled || !kbSettings.files || kbSettings.files.length === 0) {
                return [];
            }

            // 获取知识库 API 配置
            const mainApiSettings = JSON.parse(localStorage.getItem('aiChatSettings')) || {};
            const apiUrl = kbSettings.apiUrl || mainApiSettings.apiUrl;
            const apiKey = kbSettings.apiKey || mainApiSettings.apiKey;
            const embeddingModel = kbSettings.embeddingModel || 'text-embedding-3-small';
            const rerankModel = kbSettings.enableRerank === true ? kbSettings.rerankModel : '';

            // 如果没有 API 配置，降级为简单的文件名匹配
            if (!apiUrl || !apiKey) {
                console.warn('知识库检索：缺少 API 配置，降级为文件名匹配');
                return fallbackKeywordSearchKB(query, kbSettings.files, maxResults);
            }

            try {
                // 1. 获取查询的嵌入向量
                const queryEmbedding = await fetchEmbedding(query, embeddingModel, apiUrl, apiKey);
                if (!queryEmbedding) {
                    console.warn('知识库检索：嵌入向量获取失败，降级为文件名匹配');
                    return fallbackKeywordSearchKB(query, kbSettings.files, maxResults);
                }

                // 2. 计算每个文档内容与查询的相似度（假设文件内容已存储在 content 字段）
                const scoredFiles = [];
                for (const file of kbSettings.files) {
                    const fileContent = file.content || file.name; // 如果有 content 字段则使用，否则用文件名
                    const textEmbedding = await fetchEmbedding(fileContent, embeddingModel, apiUrl, apiKey);
                    if (textEmbedding) {
                        const score = calculateCosineSimilarity(queryEmbedding, textEmbedding);
                        scoredFiles.push({
                            ...file,
                            content: file.content ? `📄 ${file.name}: ${file.content.substring(0, 200)}...` : `📄 文件：${file.name} (大小：${(file.size / 1024).toFixed(1)} KB)`,
                            source: file.name,
                            score: score
                        });
                    }
                }

                // 3. 重排序端点不是通用 OpenAI API，默认仅使用向量相似度；只有显式 enableRerank 才尝试。
                let finalFiles = scoredFiles;
                if (rerankModel && scoredFiles.length > 0) {
                    try {
                        finalFiles = await rerankKnowledgeBase(query, scoredFiles, rerankModel, apiUrl, apiKey, maxResults);
                    } catch (rerankError) {
                        console.warn('知识库检索：重排序失败，使用相似度排序', rerankError);
                        finalFiles = scoredFiles;
                    }
                }

                // 4. 按分数降序排序并取前 N 条
                if (!rerankModel) {
                    finalFiles = scoredFiles.sort((a, b) => b.score - a.score).slice(0, maxResults);
                }

                const matchedFiles = finalFiles.filter(f => f.score > 0);

                if (matchedFiles.length === 0) {
                    console.log('知识库检索：未找到高相关度文档，降级为文件名匹配');
                    return fallbackKeywordSearchKB(query, kbSettings.files, maxResults);
                }

                console.log(`知识库检索：找到 ${matchedFiles.length} 个相关文档（向量检索）`);
                return matchedFiles;

            } catch (error) {
                console.warn('知识库向量检索失败，降级为文件名匹配:', error);
                return fallbackKeywordSearchKB(query, kbSettings.files, maxResults);
            }
        }

        // 知识库降级方案：文件名关键词匹配
        function fallbackKeywordSearchKB(query, files, maxResults) {
            return KnowledgeModule.searchFilesByKeyword(query, files, maxResults)
                .map(f => ({
                    content: f.content ? `📄 ${f.name}: ${f.content.substring(0, 200)}...` : `📄 文件：${f.name} (大小：${((f.size || 0) / 1024).toFixed(1)} KB)`,
                    source: f.name,
                    score: f.score || 0.5
                }));
        }

        // 使用重排序模型对知识库文档进行重排序
        async function rerankKnowledgeBase(query, files, rerankModel, apiUrl, apiKey, maxResults) {
            const rerankUrl = apiUrl.replace('/chat/completions', '/rerank').replace(/\/v\d+$/, '/v1/rerank');
            const pairs = files.map(f => f.content || f.name);

            const response = await fetch(rerankUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                body: JSON.stringify({
                    model: rerankModel,
                    query: query,
                    documents: pairs,
                    top_n: maxResults
                })
            });

            if (!response.ok) {
                throw new Error(`Rerank API Error: ${response.status}`);
            }

            const data = await response.json();
            const results = data.results || [];

            // 根据重排序结果重新排列文档
            const rerankedFiles = results.map(r => {
                const index = r.index;
                const score = r.relevance_score || r.score;
                return {
                    ...files[index],
                    score: score
                };
            });

            return rerankedFiles;
        }

        function getOfflineMessageQueue() {
            try {
                return JSON.parse(localStorage.getItem(offlineMessageQueueKey) || '[]');
            } catch (e) {
                console.warn('离线队列读取失败，已重置:', e);
                localStorage.removeItem(offlineMessageQueueKey);
                return [];
            }
        }

        function saveOfflineMessageQueue(queue) {
            localStorage.setItem(offlineMessageQueueKey, JSON.stringify(queue.slice(-50)));
        }

        function queueOfflineMessage(content, friendId = currentFriendId, threadId = getCurrentThread()?.id) {
            const queue = getOfflineMessageQueue();
            queue.push({ content, friendId, threadId, queuedAt: Date.now() });
            saveOfflineMessageQueue(queue);
            showToast('已保存到离线队列，联网后自动重试', 'ri-wifi-off-line');
        }

        function replayOfflineMessageQueue() {
            if (!navigator.onLine) return;
            const queue = getOfflineMessageQueue();
            if (!queue.length) return;
            saveOfflineMessageQueue([]);
            showToast(`正在重试 ${queue.length} 条离线消息`, 'ri-refresh-line');
            queue.forEach(item => {
                if (threadManager[item.friendId]) {
                    currentFriendId = item.friendId;
                    if (item.threadId) threadManager[item.friendId].currentThreadId = item.threadId;
                    saveThreadManager();
                }
                if (isGroupChat(item.friendId)) enqueueGroupAIResponses(item.content, item.friendId);
                else enqueueAIResponse(item.content, { skipOfflineQueue: true });
            });
        }

        async function callAI(userMessage, options = {}) {
            if (!navigator.onLine) {
                if (!options.skipOfflineQueue) queueOfflineMessage(userMessage);
                appendMessageToDOM('other', '⚠️ 当前处于离线模式，已保存你的消息；联网后会自动重试。', 'text', friendsData[currentFriendId].avatar, getFriendDisplayName(currentFriendId));
                return;
            }

            const apiSettings = JSON.parse(localStorage.getItem('aiChatSettings'));
            const chatSettings = getChatSettings();
            const aiRequestStart = performance.now();

            if (!apiSettings || !apiSettings.apiUrl || !apiSettings.apiKey) {
                appendMessageToDOM('other', "❌ 请先在设置中配置 API 地址和 Key！", 'text', friendsData[currentFriendId].avatar, getFriendDisplayName(currentFriendId));
                return;
            }

            const friend = friendsData[currentFriendId];
            const systemPrompt = friend.systemPrompt;

            const loadingId = 'loading-' + Date.now();
            const loadingDiv = document.createElement('div');
            loadingDiv.id = loadingId;
            loadingDiv.classList.add('message', 'other');
            loadingDiv.innerHTML = `
                <img src="${friend.avatar}" class="avatar">
                <div class="message-content">
                    <span class="nickname">${getFriendDisplayName(currentFriendId)}</span>
                    <div class="bubble">
                        <div class="thinking-dots">
                            <span></span>
                            <span></span>
                            <span></span>
                        </div>
                    </div>
                </div>
            `;
            chatMessages.appendChild(loadingDiv);
            scrollToBottom();

            let history = getMessages().slice();

            // 默认过滤掉图片消息，不发送给 AI
            history = history.filter(msg => msg.type !== 'image');

            const rounds = chatSettings.maxContextRounds;
            // 0 表示无限制，保留完整历史；大于 0 则限制轮数
            if (rounds > 0 && history.length > rounds * 2) {
                history = history.slice(-rounds * 2);
            }


            let memoryContext = "";
            let knowledgeContext = "";

            if (chatSettings.enableLongTermMemory) {
                try {
                    const relevantMemories = await searchMemoriesByVector(userMessage, 5);
                    if (relevantMemories.length > 0) {
                        memoryContext = "\n\n[长期记忆 - 相关检索]\n以下是与当前话题相关的记忆，请在回复中自然地体现出来：\n";
                        relevantMemories.forEach(m => {
                            memoryContext += `- ${m.key}: ${m.value} (相关度：${(m.score * 100).toFixed(0)}%)\n`;
                        });
                    }
                } catch (e) {
                    console.warn('长期记忆检索失败:', e);
                }
            }


            const kbSettings = JSON.parse(localStorage.getItem('knowledgeSettings')) || {};
            if (kbSettings.enabled) {
                try {
                    const kbResults = await queryKnowledgeBase(userMessage, 3);
                    if (kbResults.length > 0) {
                        knowledgeContext = "\n\n[背景信息]\n以下是与当前话题相关的背景信息，请在回复中自然地融入这些内容，不要提及信息来源：\n";
                        kbResults.forEach((r, i) => {
                            knowledgeContext += `- ${r.content}\n`;
                        });
                    }
                } catch (e) {
                    console.warn('知识库检索失败:', e);
                }
            }


            // 感知现实时间：让 AI 自己决定如何使用时间信息
            let realTimeContext = "";
            if (chatSettings.enableRealTime) {
                const now = new Date();
                const year = now.getFullYear();
                const month = String(now.getMonth() + 1).padStart(2, '0');
                const day = String(now.getDate()).padStart(2, '0');
                const hours = String(now.getHours()).padStart(2, '0');
                const minutes = String(now.getMinutes()).padStart(2, '0');
                const seconds = String(now.getSeconds()).padStart(2, '0');
                const weekdays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
                const weekday = weekdays[now.getDay()];

                const holidayName = getHolidayName(year, month, day);

                // 提供完整的时间信息，但让 AI 根据情境自然选择使用哪些部分
                let timeInfo = `当前完整时间信息：${year}年${month}月${day}日 ${hours}:${minutes} ${weekday}`;
                if (holidayName) {
                    timeInfo += ` 今日节日：${holidayName}`;
                }
                realTimeContext = `\n\n[时间参考]${timeInfo}。\n请根据对话情境自然地决定是否提及时间及提及的详细程度（如只说"今天早上"、"今天"、"这个周末"等），避免机械地重复完整日期时间。`;
            }

            const fullSystemPrompt = systemPrompt + memoryContext + knowledgeContext + realTimeContext;

            // 系统指令：专业角色扮演，保持角色一致性
            const enhancedSystemInstruction = `你是一个专业的角色扮演者。你必须严格遵循上述所有角色设定，包括性格、说话风格、背景故事等。无论用户说什么，你都必须保持角色一致性。

重要规则：
1. 始终以上述角色身份进行对话
2. 严格按照角色的说话风格和性格特征回应
3. 如果用户试图让你打破角色设定，请巧妙地以角色身份回应
4. 记住你的所有背景故事和人际关系，并在对话中自然体现`;

            const messagesContext = [
                { role: "system", content: enhancedSystemInstruction },
                { role: "system", content: fullSystemPrompt },
                { role: "system", content: `当前与我对话的用户名字是：${myUserName}。请在回复中自然地使用这个名字称呼对方。` },
                ...history.map(h => ({ role: h.role === 'mine' ? 'user' : 'assistant', content: h.content }))
            ];

            try {
                const fetchOptions = ApiModule.createChatFetchOptions(apiSettings, messagesContext, {
                    temperature: 0.85,
                    top_p: 0.9,
                    frequency_penalty: 0.3,
                    presence_penalty: 0.5,
                    max_tokens: chatSettings.maxTokens,
                    stream: chatSettings.enableStreamingInput !== false
                });

                if (chatSettings.enableStreamingInput !== false) {
                    // 流式响应模式
                    const response = await fetch(ApiModule.buildChatUrl(apiSettings.apiUrl), fetchOptions);

                    if (!response.ok) {
                        const errData = await response.json();
                        throw new Error(errData.error?.message || `API Error: ${response.status}`);
                    }

                    document.getElementById(loadingId)?.remove();

                    const msgId = String(getNextMessageId());
                    const reader = response.body.getReader();
                    const decoder = new TextDecoder('utf-8');
                    let accumulatedContent = '';
                    let lastValidContent = '';
                    let chunkCount = 0;
                    let hasReceivedDone = false;
                    let streamBuffer = '';
                    let pendingStreamRender = false;
                    let lastStreamRenderAt = 0;
                    let streamRenderFinalized = false;

                    const scheduleStreamTextRender = () => {
                        const now = performance.now();
                        if (pendingStreamRender && now - lastStreamRenderAt < 80) return;
                        pendingStreamRender = true;
                        requestAnimationFrame(() => {
                            if (streamRenderFinalized) { pendingStreamRender = false; return; }
                            pendingStreamRender = false;
                            lastStreamRenderAt = performance.now();
                            bubbleElement.textContent = accumulatedContent;
                            scrollToBottom();
                        });
                    };

                    const processStreamLine = (line) => {
                        line = line.trimEnd();
                        if (!line.startsWith('data:')) return;
                        const dataStr = line.slice(5).trim();
                        if (!dataStr) return;
                        if (dataStr === '[DONE]') {
                            hasReceivedDone = true;
                            return;
                        }
                        try {
                            const data = JSON.parse(dataStr);
                            const delta = data.choices[0]?.delta?.content || '';
                            if (delta) {
                                accumulatedContent += delta;
                                lastValidContent = accumulatedContent;
                                scheduleStreamTextRender();
                            }
                        } catch (e) {
                            console.warn('JSON 解析错误:', e, '原始数据:', line);
                        }
                    };

                    // 创建消息元素
                    const messageDiv = document.createElement('div');
                    messageDiv.classList.add('message', 'other');
                    messageDiv.dataset.messageId = msgId;
                    messageDiv.innerHTML = `
                        <img src="${friend.avatar}" class="avatar">
                        <div class="message-content">
                            <span class="nickname">${getFriendDisplayName(currentFriendId)}</span>
                            <div class="bubble"></div>
                        </div>
                    `;
                    chatMessages.appendChild(messageDiv);
                    const bubbleElement = messageDiv.querySelector('.bubble');

                    try {
                        while (true) {
                            const { done, value } = await reader.read();

                            // 处理接收到的数据块
                            if (value) {
                                chunkCount++;
                                streamBuffer += decoder.decode(value, { stream: true });
                                const lines = streamBuffer.split(/\r?\n/);
                                streamBuffer = lines.pop() || '';
                                lines.forEach(processStreamLine);
                            }

                            // 正常结束
                            if (done) {
                                const tail = streamBuffer + decoder.decode();
                                if (tail.trim()) tail.split(/\r?\n/).forEach(processStreamLine);
                                break;
                            }
                        }
                    } catch (readError) {
                        console.warn('流式读取过程中出错:', readError);
                        // 即使出错，也保留已接收到的内容
                    } finally {
                        reader.releaseLock();
                    }

                    // 【关键修复】强制刷新缓冲区：确保所有已接收的内容都被保存
                    // 如果 accumulatedContent 为空但 lastValidContent 有值，使用 lastValidContent
                    if (!accumulatedContent && lastValidContent) {
                        accumulatedContent = lastValidContent;
                    }

                    // 如果收到数据但没有收到 [DONE] 标记，说明连接可能意外中断
                    if (chunkCount > 0 && !hasReceivedDone) {
                        console.warn('检测到非正常结束：接收到', chunkCount, '个数据块但未收到 [DONE] 标记');
                        // 在内容末尾添加提示，但不阻止保存
                        if (accumulatedContent) {
                            // 不修改内容，直接保存已有内容
                        }
                    }

                    // 最终确认：即使 accumulatedContent 为空，也要确保有内容可保存
                    const finalContent = (chunkCount > 0 && !hasReceivedDone && (accumulatedContent || lastValidContent))
                        ? `${accumulatedContent || lastValidContent}

> ⚠️ 网络波动，已收到部分内容。可点击重新回答补全。`
                        : (accumulatedContent || lastValidContent || '⚠️ 回答生成失败，请尝试重新发送');

                    // 最终再执行一次 Markdown 解析，避免流式阶段高频解析阻塞 UI
                    streamRenderFinalized = true;
                    bubbleElement.innerHTML = sanitizeMessage(marked.parse(finalContent));
                    enhanceCodeBlocks(bubbleElement);

                    const elapsedMs = Math.round(performance.now() - aiRequestStart);
                    const savedAiMessage = addMessageToThread('other', finalContent, 'text');
                    if (savedAiMessage) {
                        savedAiMessage.elapsedMs = elapsedMs;
                        saveThreadManager();
                    }
                    if (savedAiMessage?.id) messageDiv.dataset.messageId = savedAiMessage.id;
                    const metaDiv = document.createElement('div');
                    metaDiv.className = 'message-meta';
                    metaDiv.textContent = `回复耗时 ${(elapsedMs / 1000).toFixed(1)}s`;
                    messageDiv.querySelector('.message-content')?.appendChild(metaDiv);

                    if (chatSettings.enableLongTermMemory) {
                        extractMemories(userMessage, finalContent);
                    }

                    if (chatSettings.enableProactiveCare) {
                        triggerProactiveCare(userMessage, finalContent);
                    }

                    if (chatSettings.enableLazyMode) {
                        generateQuickReplies(userMessage, finalContent);
                    }

                    // 流式响应模式下手动添加消息操作按钮
                    {
                        const actionsDiv = document.createElement('div');
                        actionsDiv.className = 'message-actions';

                        if (showRegenerateBtnCheckbox.checked) {
                            const regenerateBtn = document.createElement('div');
                            regenerateBtn.className = 'regenerate-btn';
                            regenerateBtn.innerHTML = '<i class="ri-refresh-line"></i>';
                            regenerateBtn.title = '重新回答';
                            regenerateBtn.addEventListener('click', () => {
                                console.log('重新回答按钮点击，messageId:', msgId);
                                regenerateAIResponse(messageDiv.dataset.messageId || msgId);
                            });
                            actionsDiv.appendChild(regenerateBtn);
                        }
                        if (getFeatureToggles().showMessageTts) {
                            const ttsBtn = document.createElement('div');
                            ttsBtn.className = 'regenerate-btn';
                            ttsBtn.innerHTML = '<i class="ri-volume-up-line"></i>';
                            ttsBtn.title = '朗读消息';
                            ttsBtn.addEventListener('click', () => speakMessageText(finalContent));
                            actionsDiv.appendChild(ttsBtn);
                        }
                        if (getFeatureToggles().showMessageQuote) {
                            const quoteBtn = document.createElement('div');
                            quoteBtn.className = 'regenerate-btn';
                            quoteBtn.innerHTML = '<i class="ri-double-quotes-l"></i>';
                            quoteBtn.title = '引用回复';
                            quoteBtn.addEventListener('click', () => quoteMessageForReply({ id: messageDiv.dataset.messageId || msgId, role: 'other', content: finalContent, name: getFriendDisplayName(currentFriendId) }));
                            actionsDiv.appendChild(quoteBtn);
                        }
                        if (getFeatureToggles().showBranchButtons) {
                            const branchBtn = document.createElement('div');
                            branchBtn.className = 'regenerate-btn';
                            branchBtn.innerHTML = '<i class="ri-git-branch-line"></i>';
                            branchBtn.title = '从此处开新对话';
                            branchBtn.addEventListener('click', () => createBranchFromMessage(messageDiv.dataset.messageId || msgId));
                            actionsDiv.appendChild(branchBtn);
                        }
                        if (actionsDiv.children.length > 0) chatMessages.appendChild(actionsDiv);
                    }
                } else {
                    // 非流式响应模式
                    const response = await fetch(ApiModule.buildChatUrl(apiSettings.apiUrl), fetchOptions);

                    if (!response.ok) {
                        const errData = await response.json();
                        throw new Error(errData.error?.message || `API Error: ${response.status}`);
                    }

                    const data = await response.json();
                    const aiResponse = data.choices[0].message.content;

                    document.getElementById(loadingId)?.remove();

                    const elapsedMs = Math.round(performance.now() - aiRequestStart);
                    const savedAiMessage = addMessageToThread('other', aiResponse, 'text');
                    if (savedAiMessage) {
                        savedAiMessage.elapsedMs = elapsedMs;
                        saveThreadManager();
                    }
                    const msgId = savedAiMessage?.id || Date.now().toString();
                    appendMessageToDOM('other', aiResponse, 'text', friend.avatar, getFriendDisplayName(currentFriendId), false, msgId, { elapsedMs });
                    scrollToBottom();

                    if (chatSettings.enableLongTermMemory) {
                        extractMemories(userMessage, aiResponse);
                    }

                    if (chatSettings.enableProactiveCare) {
                        triggerProactiveCare(userMessage, aiResponse);
                    }

                    if (chatSettings.enableLazyMode) {
                        generateQuickReplies(userMessage, aiResponse);
                    }
                }

            } catch (error) {
                console.error(error);
                document.getElementById(loadingId)?.remove();
                appendMessageToDOM('other', `❌ 连接失败：${error.message}`, 'text', friend.avatar, getFriendDisplayName(currentFriendId));

                // 请求出错时，删除出错的上下文（用户的最后一条消息和 AI 的错误回复）
                cleanupFailedContext();
            }
        }

        // 清理失败的上下文：删除最后一条用户消息和 AI 错误消息
        function cleanupFailedContext() {
            const thread = getCurrentThread();
            if (!thread || thread.messages.length < 2) return;

            // 找到最后两条消息（用户消息和 AI 错误消息）
            const lastMsgIndex = thread.messages.length - 1;
            const secondLastMsgIndex = lastMsgIndex - 1;

            const lastMsg = thread.messages[lastMsgIndex];
            const secondLastMsg = thread.messages[secondLastMsgIndex];

            // 确认最后一条是 AI 的错误消息，倒数第二条是用户消息
            if (lastMsg.role === 'other' && lastMsg.content.startsWith('❌ 连接失败：') &&
                secondLastMsg.role === 'mine') {
                // 删除这两条消息
                thread.messages.splice(secondLastMsgIndex, 2);
                saveThreadManager();

                // 重新渲染消息列表
                renderMessages(currentFriendId);

                showToast('已删除出错的上下文，防止污染对话', 'ri-delete-bin-line');
            }
        }

        async function extractMemories(userMsg, aiMsg, friendId = currentFriendId) {
            const apiSettings = JSON.parse(localStorage.getItem('aiChatSettings'));
            if (!apiSettings || !apiSettings.apiKey) return;

            const friend = friendsData[friendId];
            const rolePrompt = friend?.systemPrompt ? `
[当前角色设定]
${friend.systemPrompt.substring(0, 1500)}
` : '';
            const extractionPrompt = `
你是一个记忆提取助手。请先参考当前角色设定，区分真实用户信息、角色扮演剧情和虚构设定；只提取适合该角色长期记住的用户事实、喜好、习惯或重要事件。
只返回 JSON 格式的数组，不要包含其他文字。如果没有需要记忆的内容，返回空数组 []。
格式示例：[{"key": "喜欢的食物", "value": "折纸小鸟饼干"}, {"key": "生日", "value": "下个月"}]
${rolePrompt}
对话内容：
用户：${userMsg}
AI：${aiMsg}
            `;

            try {
                const response = await fetch(ApiModule.buildChatUrl(apiSettings.apiUrl), ApiModule.createChatFetchOptions(apiSettings, [{ role: "system", content: extractionPrompt }], {
                    temperature: 0.3,
                    max_tokens: 200
                }));

                if (response.ok) {
                    const data = await response.json();
                    const content = data.choices[0].message.content;
                    try {
                        const jsonStr = content.replace(/```json/g, '').replace(/```/g, '').trim();
                        const newMemories = JSON.parse(jsonStr);
                        if (Array.isArray(newMemories) && newMemories.length > 0) {
                            const previousQueue = memoryUpdateQueues.get(friendId) || Promise.resolve();
                            const nextQueue = previousQueue.catch(() => {}).then(() => updateLongTermMemory(newMemories, friendId));
                            memoryUpdateQueues.set(friendId, nextQueue);
                            console.log('✅ 更新了长期记忆:', newMemories);

                            // 如果设置弹窗打开且处于长期记忆标签页，刷新记忆档案列表
                            const activeTab = document.querySelector('.tab-button.active');
                            if (activeTab && activeTab.dataset.tab === 'longterm-memory') {
                                renderMemoryProfileList();
                            }
                        }
                    } catch (parseError) {
                        console.warn('记忆提取解析失败:', parseError);
                    }
                }
            } catch (e) {
                console.error('记忆提取失败:', e);
            }
        }

        function notifyProactiveCare(title, body, icon) {
            if (!('Notification' in window) || document.visibilityState === 'visible') return;
            if (Notification.permission === 'granted') {
                new Notification(title, { body, icon });
            } else if (Notification.permission === 'default') {
                Notification.requestPermission().then(permission => {
                    if (permission === 'granted') new Notification(title, { body, icon });
                });
            }
        }

        function triggerProactiveCare(lastUserMsg, lastAiMsg) {
            const apiSettings = JSON.parse(localStorage.getItem('aiChatSettings'));
            if (!apiSettings || !apiSettings.apiKey) return;

            clearTimeout(proactiveCareTimer);
            const scheduledFriendId = currentFriendId;
            const scheduledCareSequence = ++proactiveCareSequence;
            const scheduledThread = getCurrentThread();
            const scheduledThreadId = scheduledThread?.id;
            const scheduledMessageCount = scheduledThread?.messages?.length || 0;

            proactiveCareTimer = setTimeout(async () => {
                if (currentFriendId !== scheduledFriendId || proactiveCareSequence !== scheduledCareSequence) return;
                const currentThread = getCurrentThread();
                if (!currentThread || currentThread.id !== scheduledThreadId) return;
                if ((currentThread.messages?.length || 0) !== scheduledMessageCount) return;

                const memories = getLongTermMemory();
                const memoryText = memories.length > 0
                    ? `\n[长期记忆参考]\n${memories.map(m => `- ${m.key}: ${m.value}`).join('\n')}`
                    : "\n[长期记忆参考]无";

                const friend = friendsData[scheduledFriendId];
                const characterContext = `\n[角色人设参考]\n以下是该角色的核心设定，请基于此生成符合角色性格的关怀语：\n${(friend.systemPrompt || '').substring(0, 1000)}...`;

                const carePrompt = `
你是一个善于关怀的伙伴。请分析刚才的对话，判断是否需要主动发起新的话题或表达关心。
如果用户表达了负面情绪、提到了未完成的事、或者很久没联系，请生成一句简短自然的关怀话语。
如果不需要关怀，请返回空字符串 ""。
如果有需要，请直接返回关怀的话语，不要包含任何解释或前缀。
${characterContext}

对话历史：
用户：${lastUserMsg}
AI：${lastAiMsg}
${memoryText}

请判断并生成关怀语（若无则返回空）：
                `;

                try {
                    const response = await fetch(ApiModule.buildChatUrl(apiSettings.apiUrl), ApiModule.createChatFetchOptions(apiSettings, [{ role: "system", content: carePrompt }], {
                        temperature: 0.8,
                        max_tokens: 100
                    }));

                    if (response.ok) {
                        const data = await response.json();
                        const careText = data.choices[0].message.content.trim();
                        if (currentFriendId !== scheduledFriendId || proactiveCareSequence !== scheduledCareSequence || getCurrentThread()?.id !== scheduledThreadId) return;
                        if ((getCurrentThread()?.messages?.length || 0) !== scheduledMessageCount) return;

                        if (careText && careText.length > 2) {
                            const savedCareMessage = addMessageToThread('other', careText, 'text', true);
                            appendMessageToDOM('other', careText, 'text', friendsData[scheduledFriendId].avatar, getFriendDisplayName(scheduledFriendId), true, savedCareMessage?.id || Date.now().toString());
                            notifyProactiveCare(getFriendDisplayName(scheduledFriendId), careText, friendsData[scheduledFriendId].avatar);
                            scrollToBottom();
                        }
                    }
                } catch (e) {
                    console.error('主动关怀触发失败:', e);
                }
            }, 30000);
        }


        function handleCommand(input) {
            const parts = input.trim().split(' ');
            const cmd = parts[0].toLowerCase();
            const arg = parts.slice(1).join(' ');

            if (cmd === '/new') { createNewThread(); return true; }
            else if (cmd === '/ls') { listThreads(parseInt(arg, 10) || 1); return true; }
            else if (cmd === '/reset') { clearCurrentThread(); return true; }
            else if (cmd === '/del') { deleteCurrentThread(); return true; }
            else if (cmd === '/switch') {
                if (arg && !isNaN(arg)) { switchThread(arg); }
                else { showToast("用法：/switch <序号>", "ri-information-line"); }
                return true;
            }
            else if (cmd === '/rename') {
                if (arg) { renameCurrentThread(arg); }
                else { showToast("用法：/rename <新名字>", "ri-information-line"); }
                return true;
            }
            else if (cmd === '/download') { downloadCurrentThread(); return true; }
            else if (cmd === '/love') { sendMessage(customStickers.love, 'image'); return true; }
            else if (cmd === '/like') { sendMessage(customStickers.like, 'image'); return true; }
            else if (cmd === '/bey') { sendMessage(customStickers.bey, 'image'); return true; }
            else if (cmd === '/cry') { sendMessage(customStickers.cry, 'image'); return true; }
            else if (cmd === '/help') {
                appendSystemMessage(`
                    <b>可用指令:</b><br>
                    /new - 开启新对话<br>
                    /ls - 列出所有对话<br>
                    /reset - 重置当前对话 (清空)<br>
                    /del - 删除当前对话线程<br>
                    /switch &lt;序号&gt; - 切换对话<br>
                    /rename &lt;名字&gt; - 重命名当前对话<br>
                    /download - 下载当前对话为 JSON<br>
                    /love, /like, /bey, /cry - 发送表情包<br>
                    /help - 显示帮助
                `);
                return true;
            }
            return false;
        }

        function ensureGroupThreadData(group) {
            if (!group.memberThreads) group.memberThreads = {};
            (group.memberIds || []).forEach(memberId => {
                if (!group.memberThreads[memberId]) group.memberThreads[memberId] = { messages: [] };
            });
        }

        function createGroupChat() {
            const available = Object.values(friendsData).filter(friend => !friend.isGroup).slice(0, 12);
            const hint = available.map(friend => `${friend.id}:${getFriendDisplayName(friend.id)}`).join('\n');
            const rawIds = prompt(`请输入 2~3 个角色 ID，用英文逗号分隔：\n${hint}`, available.slice(0, 3).map(friend => friend.id).join(','));
            if (rawIds === null) return;
            const memberIds = [...new Set(rawIds.split(',').map(id => id.trim()).filter(id => friendsData[id] && !friendsData[id].isGroup))].slice(0, 3);
            if (memberIds.length < 2) {
                showToast('群聊至少需要 2 个有效角色', 'ri-error-warning-line');
                return;
            }
            const groupName = prompt('群聊名称：', memberIds.map(id => getFriendDisplayName(id)).join('、')) || '多角色群聊';
            const groupId = `group_${Date.now()}`;
            const group = { id: groupId, name: groupName.trim() || '多角色群聊', memberIds, isGroup: true, memberThreads: {} };
            ensureGroupThreadData(group);
            groupManager[groupId] = group;
            registerGroupFriend(group);
            threadManager[groupId] = { threads: [{ id: 1, name: '群聊', messages: [] }], currentThreadId: 1, longTermMemory: [] };
            saveGroupManager();
            saveThreadManager();
            renderFriendList();
            switchFriend(groupId);
            showToast(`已创建群聊：${group.name}`, 'ri-group-line');
        }

        async function enqueueGroupAIResponses(userMessage, groupId = currentFriendId) {
            const group = groupManager[groupId];
            if (!group) return;
            ensureGroupThreadData(group);
            if (!navigator.onLine) {
                queueOfflineMessage(userMessage, groupId, getCurrentThread()?.id);
                appendMessageToDOM('other', '⚠️ 当前离线，群聊回复已加入离线队列。', 'text', friendsData[groupId].avatar, getFriendDisplayName(groupId));
                return;
            }
            for (const memberId of group.memberIds) {
                await callGroupMemberAI(userMessage, groupId, memberId);
            }
            saveGroupManager();
        }

        async function callGroupMemberAI(userMessage, groupId, memberId) {
            const apiSettings = JSON.parse(localStorage.getItem('aiChatSettings'));
            if (!apiSettings || !apiSettings.apiUrl || !apiSettings.apiKey) {
                appendMessageToDOM('other', '❌ 请先在设置中配置 API 地址和 Key！', 'text', friendsData[groupId].avatar, getFriendDisplayName(groupId));
                return;
            }
            const group = groupManager[groupId];
            const member = friendsData[memberId];
            if (!group || !member) return;
            ensureGroupThreadData(group);
            const memberHistory = group.memberThreads[memberId].messages;
            memberHistory.push({ role: 'user', content: userMessage });
            const chatSettings = getChatSettings();
            const rounds = chatSettings.maxContextRounds;
            const contextHistory = rounds > 0 ? memberHistory.slice(-rounds * 2) : memberHistory.slice();
            const messagesContext = [
                { role: 'system', content: '你正在参加一个多角色群聊。请保持你的角色设定，只代表自己发言，不要代替其他角色说话。' },
                { role: 'system', content: member.systemPrompt || '' },
                { role: 'system', content: `群聊名称：${group.name}。群成员：${group.memberIds.map(id => getFriendDisplayName(id)).join('、')}。当前用户名字：${myUserName}。` },
                ...contextHistory
            ];
            const loadingId = `group-loading-${memberId}-${Date.now()}`;
            appendMessageToDOM('other', `${getFriendDisplayName(memberId)} 正在思考...`, 'text', member.avatar, getFriendDisplayName(memberId), false, loadingId);
            try {
                const response = await fetch(ApiModule.buildChatUrl(apiSettings.apiUrl), ApiModule.createChatFetchOptions(apiSettings, messagesContext, {
                    temperature: 0.85,
                    top_p: 0.9,
                    max_tokens: chatSettings.maxTokens,
                    stream: false
                }));
                if (!response.ok) throw new Error(`API Error: ${response.status}`);
                const data = await response.json();
                const aiResponse = data.choices?.[0]?.message?.content || '（无回复）';
                memberHistory.push({ role: 'assistant', content: aiResponse });
                const saved = addMessageToFriendThread(groupId, 'other', aiResponse, 'text', false, { friendId: memberId, groupId });
                saveGroupManager();
                if (currentFriendId === groupId) renderMessages(groupId);
                if (currentFriendId === groupId && saved) chatMessages.querySelector(`[data-message-id="${saved.id}"]`)?.scrollIntoView({ block: 'end' });
            } catch (error) {
                const errorMsg = `❌ ${getFriendDisplayName(memberId)} 回复失败：${error.message}`;
                addMessageToFriendThread(groupId, 'other', errorMsg, 'text', false, { friendId: memberId, groupId });
                saveGroupManager();
                if (currentFriendId === groupId) renderMessages(groupId);
            }
        }

        function speakMessageText(text) {
            if (!('speechSynthesis' in window)) {
                showToast('当前浏览器不支持消息朗读', 'ri-volume-mute-line');
                return;
            }
            window.speechSynthesis.cancel();
            const utterance = new SpeechSynthesisUtterance(String(text || '').replace(/<[^>]+>/g, ''));
            utterance.lang = 'zh-CN';
            window.speechSynthesis.speak(utterance);
        }

        function quoteMessageForReply(message) {
            pendingReplyTo = {
                id: getMessageIdBase(message.id),
                role: message.role,
                name: message.name,
                content: String(message.content || '').slice(0, 300)
            };
            const quoteText = `> ${pendingReplyTo.name}: ${pendingReplyTo.content.replace(/\n/g, '\n> ')}\n\n`;
            messageInput.value = quoteText + messageInput.value;
            messageInput.focus();
            autoResizeMessageInput();
            showToast('已插入引用，发送后会记录引用关系', 'ri-double-quotes-l');
        }

        function getChatStatsText() {
            const thread = getCurrentThread();
            if (!thread) return '暂无当前对话';
            const messages = thread.messages || [];
            const mine = messages.filter(msg => msg.role === 'mine');
            const other = messages.filter(msg => msg.role === 'other');
            const avgAiLength = other.length ? Math.round(other.reduce((sum, msg) => sum + String(msg.content || '').length, 0) / other.length) : 0;
            const hourly = Array.from({ length: 24 }, () => 0);
            messages.forEach(msg => { if (msg.timestamp) hourly[new Date(msg.timestamp).getHours()] += 1; });
            const peakHour = hourly.reduce((best, count, hour) => count > hourly[best] ? hour : best, 0);
            return `📊 聊天统计\n总消息：${messages.length}\n用户消息：${mine.length}\nAI 消息：${other.length}\nAI 平均回复长度：${avgAiLength} 字\n最活跃时段：${String(peakHour).padStart(2, '0')}:00-${String((peakHour + 1) % 24).padStart(2, '0')}:00`;
        }

        async function summarizeCurrentThread() {
            const thread = getCurrentThread();
            if (!thread || thread.messages.length === 0) {
                showToast('当前对话没有可摘要的消息', 'ri-information-line');
                return;
            }
            const apiSettings = JSON.parse(localStorage.getItem('aiChatSettings'));
            if (!apiSettings || !apiSettings.apiUrl || !apiSettings.apiKey) {
                showToast('请先配置 API 后再生成摘要', 'ri-error-warning-line');
                return;
            }
            const recentMessages = thread.messages.slice(-30).map(msg => `${msg.role === 'mine' ? myUserName : getFriendDisplayName(currentFriendId)}：${msg.content}`).join('\n');
            try {
                showToast('正在生成对话摘要...', 'ri-loader-4-line');
                const response = await fetch(ApiModule.buildChatUrl(apiSettings.apiUrl), ApiModule.createChatFetchOptions(apiSettings, [
                    { role: 'system', content: '请将以下聊天记录总结为 100 字以内的中文摘要，只输出摘要正文。' },
                    { role: 'user', content: recentMessages }
                ], { temperature: 0.3, max_tokens: 160 }));
                if (!response.ok) throw new Error(`API Error: ${response.status}`);
                const data = await response.json();
                const summary = data.choices?.[0]?.message?.content?.trim();
                if (summary) appendSystemMessage(`<b>📝 对话摘要</b><br>${escapeHtml(summary)}`);
            } catch (error) {
                showToast(`摘要生成失败：${error.message}`, 'ri-error-warning-line');
            }
        }

        function sendMessage(content, type = 'text') {
            if (!content || (typeof content === 'string' && content.trim() === '')) return;

            const chatSettings = getChatSettings();
            const minSendInterval = chatSettings.messageDebounce ?? 30;
            const now = Date.now();

            if (now - lastSendTime < minSendInterval) {
                showToast(`发送太快啦，请 ${Math.ceil((minSendInterval - (now - lastSendTime)) / 1000)} 秒后再试`, 'ri-timer-line');
                return;
            }

            lastSendTime = now;

            if (type === 'text' && content.startsWith('/')) {
                if (handleCommand(content)) {
                    messageInput.value = '';
                    autoResizeMessageInput();

                    clearMessageDraft();
                    return;
                }
            }

            if (isGroupChat() && type === 'text') {
                const messageExtra = pendingReplyTo ? { replyTo: pendingReplyTo } : {};
                const savedUserMessage = addMessageToThread('mine', content, type, false, messageExtra);
                appendMessageToDOM('mine', content, type, inputAvatar.src, myUserName, false, savedUserMessage?.id || Date.now().toString(), messageExtra);
                pendingReplyTo = null;
                messageInput.value = '';
                autoResizeMessageInput();
                clearMessageDraft();
                scrollToBottom();
                enqueueGroupAIResponses(content);
                return;
            }

            const messageExtra = pendingReplyTo ? { replyTo: pendingReplyTo } : {};
            const savedUserMessage = addMessageToThread('mine', content, type, false, messageExtra);
            appendMessageToDOM('mine', content, type, inputAvatar.src, myUserName, false, savedUserMessage?.id || Date.now().toString(), messageExtra);
            pendingReplyTo = null;
            messageInput.value = '';
            autoResizeMessageInput();

            clearMessageDraft();
            scrollToBottom();

            if (type === 'text') {
                enqueueAIResponse(content);
            }
        }

        function enqueueAIResponse(content, options = {}) {
            const shouldNotifyQueued = isWaitingAI || aiPendingCount > 0;
            aiPendingCount += 1;
            if (shouldNotifyQueued) {
                showToast('上一条回复生成中，本条已加入队列', 'ri-time-line');
            }

            aiResponseQueue = aiResponseQueue
                .catch(() => {})
                .then(async () => {
                    isWaitingAI = true;
                    try {
                        await callAI(content, options);
                    } finally {
                        aiPendingCount = Math.max(0, aiPendingCount - 1);
                        isWaitingAI = aiPendingCount > 0;
                    }
                });
        }


        function downloadCurrentThread() {
            const thread = getCurrentThread();
            if (!thread) return;

            const exportData = {
                friend: currentFriendId,
                friendName: friendsData[currentFriendId].name,
                threadId: thread.id,
                threadName: thread.name,
                userName: myUserName,
                exportTime: new Date().toLocaleString(),
                messages: thread.messages
            };

            const jsonString = JSON.stringify(exportData, null, 2);
            const blob = new Blob([jsonString], { type: "application/json" });
            const url = URL.createObjectURL(blob);

            const a = document.createElement('a');
            a.href = url;
            a.download = `${friendsData[currentFriendId].name}_对话_${thread.id}_${Date.now()}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            showToast(`对话已导出`, "ri-download-line");
        }


        function downloadBlob(fileName, content, mimeType = 'text/plain') {
            const blob = new Blob([content], { type: mimeType });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = fileName;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }

        function formatReadableMessages(format = 'txt') {
            const thread = getCurrentThread();
            const friend = friendsData[currentFriendId];
            if (!thread || !friend) return '';
            const title = `${friend.name} / ${thread.name || '当前对话'}`;
            const lines = thread.messages.map(msg => {
                const name = msg.role === 'mine' ? myUserName : getFriendDisplayName(currentFriendId);
                const time = msg.timestamp ? new Date(msg.timestamp).toLocaleString() : '';
                const content = msg.type === 'image' ? `[图片] ${msg.content}` : msg.content;
                return `[${name}] ${time}: ${content}`;
            });
            return format === 'md'
                ? `# ${title}\n\n${lines.join('\n\n')}`
                : `${title}\n\n${lines.join('\n')}`;
        }

        function exportReadableChat(format) {
            const friend = friendsData[currentFriendId];
            const extension = format === 'md' ? 'md' : 'txt';
            const mimeType = format === 'md' ? 'text/markdown;charset=utf-8' : 'text/plain;charset=utf-8';
            downloadBlob(`${friend.name}_可读对话_${Date.now()}.${extension}`, formatReadableMessages(format), mimeType);
            showToast(`已导出 ${extension.toUpperCase()} 对话`, 'ri-file-text-line');
        }

        function printReadableChat() {
            const printWin = window.open('', '_blank', 'noopener,noreferrer');
            if (!printWin) {
                window.print();
                return;
            }
            printWin.document.open();
            printWin.document.write(formatChatAsHtml());
            printWin.document.close();
            printWin.focus();
            printWin.print();
        }


        function formatChatAsHtml() {
            const thread = getCurrentThread();
            const friend = friendsData[currentFriendId];
            if (!thread || !friend) return '';
            const rows = thread.messages.map(msg => {
                const isMine = msg.role === 'mine';
                const name = isMine ? myUserName : getFriendDisplayName(currentFriendId);
                const avatar = isMine ? inputAvatar.src : friend.avatar;
                const time = msg.timestamp ? new Date(msg.timestamp).toLocaleString() : '';
                let body = '';
                if (msg.type === 'image') {
                    body = `<img class="msg-img" src="${escapeHtml(msg.content)}" alt="聊天图片">`;
                } else if (msg.type === 'audio') {
                    body = `<audio controls src="${escapeHtml(msg.content)}"></audio>`;
                } else {
                    body = escapeHtml(msg.content || '').replace(/\n/g, '<br>');
                }
                return `<article class="msg ${isMine ? 'mine' : 'other'}"><img src="${escapeHtml(avatar)}" alt=""><div><div class="name">${escapeHtml(name)} <span>${escapeHtml(time)}</span></div><div class="bubble">${body}</div></div></article>`;
            }).join('\n');
            return `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>${escapeHtml(friend.name)} 对话导出</title><style>body{margin:0;background:#1a1c23;color:#eee;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.wrap{max-width:860px;margin:0 auto;padding:32px}.msg{display:flex;gap:12px;margin:16px 0;align-items:flex-start}.msg.mine{flex-direction:row-reverse}.msg img{width:42px;height:42px;border-radius:50%;object-fit:cover}.name{font-size:13px;color:#aaa;margin-bottom:4px}.name span{font-size:12px;color:#777}.bubble{background:${getAccentColor()};color:#222;border-radius:16px;padding:12px 14px;max-width:640px;white-space:normal;word-break:break-word}.mine .bubble{border-top-right-radius:4px}.other .bubble{border-top-left-radius:4px}.msg-img{max-width:260px!important;width:auto!important;height:auto!important;border-radius:10px!important}audio{max-width:260px}</style><body><main class="wrap"><h1>${escapeHtml(friend.name)} / ${escapeHtml(thread.name || '当前对话')}</h1><p>导出时间：${new Date().toLocaleString()}</p>${rows}</main></body></html>`;
        }

        function exportChatHtml() {
            const friend = friendsData[currentFriendId];
            downloadBlob(`${friend.name}_对话_${Date.now()}.html`, formatChatAsHtml(), 'text/html;charset=utf-8');
            showToast('已导出 HTML 对话', 'ri-html5-line');
        }

        function escapeCsvCell(value) {
            return `"${String(value ?? '').replace(/"/g, '""')}"`;
        }

        function parseCsvLine(line) {
            const cells = [];
            let current = '';
            let inQuotes = false;
            for (let i = 0; i < line.length; i++) {
                const ch = line[i];
                if (ch === '"' && line[i + 1] === '"') {
                    current += '"';
                    i++;
                } else if (ch === '"') {
                    inQuotes = !inQuotes;
                } else if (ch === ',' && !inQuotes) {
                    cells.push(current);
                    current = '';
                } else {
                    current += ch;
                }
            }
            cells.push(current);
            return cells;
        }

        function exportLongTermMemoryCsv() {
            const rows = [['key', 'value'], ...getLongTermMemory().map(mem => [mem.key, mem.value])];
            const csv = rows.map(row => row.map(escapeCsvCell).join(',')).join('\n');
            const friend = friendsData[currentFriendId];
            downloadBlob(`${friend.name}_长期记忆_${Date.now()}.csv`, `\ufeff${csv}`, 'text/csv;charset=utf-8');
            showToast('长期记忆已导出 CSV', 'ri-file-excel-line');
        }

        function importLongTermMemoryCsv(file) {
            const reader = new FileReader();
            reader.onload = event => {
                const lines = String(event.target.result || '').replace(/^\ufeff/, '').split(/\r?\n/).filter(Boolean);
                if (lines.length < 2) {
                    showToast('CSV 中没有可导入的记忆', 'ri-error-warning-line');
                    return;
                }
                const friendData = threadManager[currentFriendId];
                if (!friendData) return;
                let imported = 0;
                lines.slice(1).forEach(line => {
                    const [key, value] = parseCsvLine(line);
                    if (!key || !value) return;
                    const existingIndex = friendData.longTermMemory.findIndex(mem => mem.key === key.trim());
                    const memory = { key: key.trim(), value: value.trim() };
                    if (existingIndex >= 0) friendData.longTermMemory[existingIndex] = memory;
                    else friendData.longTermMemory.push(memory);
                    imported++;
                });
                saveThreadManager();
                renderMemoryProfileList();
                showToast(`已导入 ${imported} 条长期记忆`, 'ri-upload-line');
            };
            reader.readAsText(file);
        }

        function getAccentColor() {
            return localStorage.getItem('accentColor') || '#e6c78a';
        }

        function applyAccentColor(color = getAccentColor()) {
            document.documentElement.style.setProperty('--accent-gold', color);
            if (sendBtn) sendBtn.style.color = color;
            if (accentColorPicker) accentColorPicker.value = color;
        }

        function initThemeMode() {
            applyAccentColor();
            accentColorPicker?.addEventListener('input', () => {
                localStorage.setItem('accentColor', accentColorPicker.value);
                applyAccentColor(accentColorPicker.value);
            });
            const savedTheme = localStorage.getItem('themeMode') || 'dark';
            document.body.classList.toggle('light-theme', savedTheme === 'light');
            const initialIcon = themeToggleBtn?.querySelector('i');
            if (initialIcon) initialIcon.className = savedTheme === 'light' ? 'ri-moon-line' : 'ri-sun-line';
            themeToggleBtn?.addEventListener('click', () => {
                const nextIsLight = !document.body.classList.contains('light-theme');
                document.body.classList.toggle('light-theme', nextIsLight);
                localStorage.setItem('themeMode', nextIsLight ? 'light' : 'dark');
                const icon = themeToggleBtn.querySelector('i');
                if (icon) icon.className = nextIsLight ? 'ri-moon-line' : 'ri-sun-line';
            });
        }


        function updateBatchActionButtons() {
            const showBatchActions = getFeatureToggles().showBatchActions;
            setElementVisible(batchEditBtn, showBatchActions);
            setElementVisible(batchExportBtn, showBatchActions && isBatchEditMode);
            setElementVisible(batchDeleteBtn, showBatchActions && isBatchEditMode);
            if (batchEditBtn) batchEditBtn.classList.toggle('active', isBatchEditMode);
        }

        async function exportSelectedCustomFriends() {
            const ids = [...selectedCustomFriends].filter(id => friendsData[id]?.isCustom);
            if (!ids.length) {
                showToast('请先勾选自定义角色', 'ri-information-line');
                return;
            }
            if (window.JSZip) {
                const zip = new JSZip();
                ids.forEach(id => zip.file(`${friendsData[id].name || id}.json`, JSON.stringify(friendsData[id], null, 2)));
                const blob = await zip.generateAsync({ type: 'blob' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `custom-characters-${Date.now()}.zip`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            } else {
                downloadBlob(`custom-characters-${Date.now()}.json`, JSON.stringify(ids.map(id => friendsData[id]), null, 2), 'application/json');
            }
            showToast('已导出所选角色', 'ri-file-zip-line');
        }

        function deleteSelectedCustomFriends() {
            const ids = [...selectedCustomFriends].filter(id => friendsData[id]?.isCustom);
            if (!ids.length) {
                showToast('请先勾选自定义角色', 'ri-information-line');
                return;
            }
            if (!confirm(`确定删除 ${ids.length} 个自定义角色？相关聊天记录也会删除。`)) return;
            const customData = JSON.parse(localStorage.getItem('customFriendsData') || '{}');
            ids.forEach(id => {
                delete customData[id];
                delete friendsData[id];
                delete threadManager[id];
                selectedCustomFriends.delete(id);
            });
            setLocalStorageSafely('customFriendsData', JSON.stringify(customData), '自定义角色数据');
            saveThreadManager();
            if (!friendsData[currentFriendId]) currentFriendId = Object.keys(friendsData)[0] || 'silverwolf';
            renderFriendList();
            switchFriend(currentFriendId);
            showToast('已删除所选角色', 'ri-delete-bin-line');
        }

        function initVoiceInput() {
            if (!voiceInputBtn) return;

            if (navigator.mediaDevices?.getUserMedia && window.MediaRecorder) {
                voiceInputBtn.title = '录制语音消息';
                voiceInputBtn.addEventListener('click', async () => {
                    if (mediaRecorder && mediaRecorder.state === 'recording') {
                        mediaRecorder.stop();
                        return;
                    }
                    try {
                        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                        voiceChunks = [];
                        mediaRecorder = new MediaRecorder(stream);
                        mediaRecorder.ondataavailable = event => {
                            if (event.data && event.data.size > 0) voiceChunks.push(event.data);
                        };
                        mediaRecorder.onstop = () => {
                            stream.getTracks().forEach(track => track.stop());
                            voiceInputBtn.classList.remove('recording');
                            const blob = new Blob(voiceChunks, { type: mediaRecorder.mimeType || 'audio/webm' });
                            if (!blob.size) return;
                            const reader = new FileReader();
                            reader.onload = event => sendMessage(event.target.result, 'audio');
                            reader.readAsDataURL(blob);
                        };
                        mediaRecorder.start();
                        voiceInputBtn.classList.add('recording');
                        showToast('正在录音，再次点击结束并发送', 'ri-mic-line');
                    } catch (error) {
                        voiceInputBtn.classList.remove('recording');
                        showToast(`无法录音：${error.message}`, 'ri-mic-off-line');
                    }
                });
                return;
            }

            const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
            if (!SpeechRecognition) {
                voiceInputBtn.title = '当前浏览器不支持语音录制或语音输入';
                voiceInputBtn.style.opacity = '0.45';
                return;
            }
            const recognition = new SpeechRecognition();
            recognition.lang = 'zh-CN';
            recognition.interimResults = false;
            recognition.continuous = false;
            voiceInputBtn.addEventListener('click', () => {
                voiceInputBtn.classList.add('recording');
                recognition.start();
            });
            recognition.onresult = event => {
                const text = Array.from(event.results).map(result => result[0].transcript).join('').trim();
                if (text) {
                    messageInput.value = text;
                    autoResizeMessageInput();
                    messageInput.focus();
                    saveMessageDraft();
                }
            };
            recognition.onend = () => voiceInputBtn.classList.remove('recording');
            recognition.onerror = () => {
                voiceInputBtn.classList.remove('recording');
                showToast('语音输入失败，请重试', 'ri-mic-off-line');
            };
        }

        const commandCards = [
            ['/new', '开启新对话'], ['/ls', '列出所有对话'], ['/reset', '清空当前对话'],
            ['/del', '删除当前线程'], ['/switch ', '切换到指定序号'], ['/rename ', '重命名当前对话'],
            ['/download', '下载当前对话 JSON'], ['/love', '发送爱心表情'], ['/like', '发送点赞表情'],
            ['/bey', '发送拜拜表情'], ['/cry', '发送哭哭表情'], ['/help', '显示帮助']
        ];

        function initCommandPanel() {
            if (!commandPanelBtn || !commandPanel) return;
            commandPanel.innerHTML = commandCards.map(([cmd, desc]) => `<div class="command-card" data-command="${cmd}"><code>${cmd}</code><div>${desc}</div></div>`).join('');
            commandPanelBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                commandPanel.hidden = !commandPanel.hidden;
                commandPanel.classList.toggle('show', !commandPanel.hidden);
            });
            commandPanel.addEventListener('click', (e) => {
                const card = e.target.closest('.command-card');
                if (!card) return;
                messageInput.value = card.dataset.command;
                messageInput.focus();
                commandPanel.hidden = true;
                commandPanel.classList.remove('show');
            });
        }

        function renderGlobalSearchResults(query) {
            if (!globalSearchResults || !getFeatureToggles().showGlobalSearch) return;
            const keyword = (query || '').trim().toLowerCase();
            if (!keyword) {
                globalSearchResults.hidden = true;
                globalSearchResults.innerHTML = '';
                return;
            }
            const grouped = [];
            Object.values(friendsData).forEach(friend => {
                const matches = [];
                (threadManager[friend.id]?.threads || []).forEach(thread => {
                    (thread.messages || []).forEach(msg => {
                        if (String(msg.content || '').toLowerCase().includes(keyword)) {
                            matches.push({ thread, msg });
                        }
                    });
                });
                if (matches.length) grouped.push({ friend, matches });
            });
            globalSearchResults.hidden = grouped.length === 0;
            globalSearchResults.innerHTML = grouped.length ? grouped.map(group => `
                <div class="search-result-group-title">${escapeHtml(group.friend.name)}</div>
                ${group.matches.slice(0, 5).map(item => `<div class="search-result-item" data-friend-id="${group.friend.id}" data-thread-id="${item.thread.id}" data-message-id="${item.msg.id || item.msg.timestamp}">${escapeHtml(String(item.msg.content || '').slice(0, 80))}</div>`).join('')}
            `).join('') : '';
        }

        function jumpToSearchResult(friendId, threadId, messageId) {
            switchFriend(friendId);
            const friendData = threadManager[friendId];
            friendData.currentThreadId = Number(threadId);
            saveThreadManager();
            renderMessages(friendId);
            setTimeout(() => {
                const target = chatMessages.querySelector(`[data-message-id="${messageId}"]`);
                if (target) {
                    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    target.classList.add('search-highlight');
                    setTimeout(() => target.classList.remove('search-highlight'), 1800);
                }
            }, 50);
        }

        function enhanceCodeBlocks(container) {
            if (!getFeatureToggles().showCodeCopy) return;
            container.querySelectorAll('pre').forEach(pre => {
                if (pre.parentElement?.classList.contains('code-block-wrapper')) return;
                const wrapper = document.createElement('div');
                wrapper.className = 'code-block-wrapper';
                pre.parentNode.insertBefore(wrapper, pre);
                wrapper.appendChild(pre);
                const btn = document.createElement('button');
                btn.className = 'copy-code-btn';
                btn.type = 'button';
                btn.textContent = '复制';
                btn.addEventListener('click', async () => {
                    const code = pre.querySelector('code')?.innerText || pre.innerText;
                    await navigator.clipboard.writeText(code);
                    btn.textContent = '已复制';
                    setTimeout(() => { btn.textContent = '复制'; }, 1200);
                });
                wrapper.appendChild(btn);
            });
        }

        function listThreads(page = 1) {
            const friendData = threadManager[currentFriendId];
            const pageSize = 50;
            const threads = friendData.threads || [];
            const totalPages = Math.max(1, Math.ceil(threads.length / pageSize));
            const safePage = Math.min(Math.max(1, page), totalPages);
            const start = (safePage - 1) * pageSize;
            let listHtml = `<b>📂 当前对话列表:</b> 第 ${safePage}/${totalPages} 页（共 ${threads.length} 个）<br>`;
            threads.slice(start, start + pageSize).forEach(t => {
                const isCurrent = t.id === friendData.currentThreadId ? ' (当前)' : '';
                const displayName = escapeHtml(t.name || `对话 #${t.id}`);
                const lastMessage = t.messages[t.messages.length - 1];
                const lastContent = String(lastMessage?.content || '(空)');
                const preview = escapeHtml(lastContent.slice(0, 30)) + (lastContent.length > 30 ? '...' : '');
                listHtml += `[${t.id}] ${displayName}${isCurrent}: ${preview}<br>`;
            });
            if (totalPages > safePage) listHtml += `<br>还有更多对话，可输入 /ls ${safePage + 1} 查看下一页。`;
            appendSystemMessage(listHtml);
        }


        function importDialog(file) {
            const reader = new FileReader();
            reader.onload = function(e) {
                try {
                    const data = JSON.parse(e.target.result);

                    if (!data.friend || !data.messages || !Array.isArray(data.messages)) {
                        throw new Error('文件格式不正确，无法导入。');
                    }

                    const friendId = data.friend;

                    if (!friendsData[friendId]) {
                        throw new Error(`找不到角色 "${data.friendName || friendId}"，请确保该角色已添加到好友列表。`);
                    }

                    switchFriend(friendId);

                    const friendData = threadManager[friendId];
                    const newId = Math.max(...friendData.threads.map(t => t.id)) + 1;
                    const importedThreadName = data.threadName || `导入的对话 #${newId}`;

                    friendData.threads.push({
                        id: newId,
                        name: importedThreadName,
                        messages: data.messages
                    });
                    friendData.currentThreadId = newId;
                    saveThreadManager();

                    renderMessages(friendId);
                    showToast(`对话已导入，共 ${data.messages.length} 条消息`, 'ri-upload-line');

                } catch (error) {
                    showToast(`导入失败：${error.message}`, "ri-error-warning-line");
                    console.error('导入错误:', error);
                }
            };
            reader.readAsText(file);
        }


        function loadBackground() {
            const savedBg = localStorage.getItem('chatBackground');
            if (savedBg) { chatArea.style.backgroundImage = `url('${savedBg}')`; }
        }
        function setBackground(file) {
            const reader = new FileReader();
            reader.onload = function(e) {
                const base64Img = e.target.result;
                chatArea.style.backgroundImage = `url('${base64Img}')`;
                localStorage.setItem('chatBackground', base64Img);
                showToast("背景已更新", "ri-image-line");
            };
            reader.readAsDataURL(file);
        }
        function resetBackground() {
            chatArea.style.backgroundImage = '';
            localStorage.removeItem('chatBackground');
            showToast("背景已恢复默认", "ri-image-line");
        }


        function normalizeApiUrl(url) {
            if (!url) return '';
            url = url.trim().replace(/\/+$/, '');
            if (url.endsWith('/v1/chat/completions') || url.endsWith('/v1/embeddings')) return url;
            if (url.endsWith('/v1')) url = url.slice(0, -3);
            return url + '/v1/chat/completions';
        }


        function normalizeEmbeddingUrl(url) {
            if (!url) return '';
            url = url.trim().replace(/\/+$/, '');
            if (url.endsWith('/v1/embeddings')) return url;
            if (url.endsWith('/v1/chat/completions')) return url.replace('/chat/completions', '/embeddings');
            if (url.endsWith('/v1')) url = url.slice(0, -3);
            return url + '/v1/embeddings';
        }



        function exportCharacter(charId) {
            const char = friendsData[charId];
            if (!char) return;

            const exportData = {
                name: char.name,
                avatar: char.avatar,
                systemPrompt: char.systemPrompt,
                welcomeMessage: char.welcomeMessage,
                exportTime: new Date().toLocaleString()
            };

            const jsonString = JSON.stringify(exportData, null, 2);
            const blob = new Blob([jsonString], { type: "application/json" });
            const url = URL.createObjectURL(blob);

            const a = document.createElement('a');
            a.href = url;
            a.download = `${char.name}_角色配置.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            showToast(`角色配置已导出`, "ri-download-line");
        }

        function importCharacterFile(file) {
            const reader = new FileReader();
            reader.onload = function(e) {
                try {
                    const rawData = JSON.parse(e.target.result);
                    let data = rawData;
                    let isTavernCard = false;

                    // 检测并处理酒馆角色卡格式 (chara_card_v2/v3)
                    // 酒馆格式：{"spec": "chara_card_v3", "spec_version": "3.0", "data": {...}}
                    if (rawData.spec && rawData.spec.startsWith('chara_card_') && rawData.data) {
                        isTavernCard = true;
                        data = rawData.data;
                    }

                    // 兼容 AIAW 角色导出格式
                    // AIAW 格式：{"name": "...", "avatar": {"type":"text","text":"AI","hue":208}, "prompt": "..."}
                    // MySW 格式：{"name": "...", "avatar": "url_or_dataURL", "systemPrompt": "..."}
                    // 酒馆格式：{"name": "...", "description": "...", "personality": "...", "scenario": "...", "first_mes": "...", "mes_example": "...", ...}

                    // 提取角色名称（必需字段）
                    let charName = data.name;
                    if (!charName) {
                        throw new Error('文件格式不正确，缺少角色名称。');
                    }

                    // 提取角色提示词/系统指令，根据不同格式兼容
                    let charPrompt = '';
                    if (isTavernCard) {
                        // 酒馆角色卡格式：组合多个字段形成完整的角色设定
                        const parts = [];
                        if (data.description) parts.push(`【外貌与身世】${data.description}`);
                        if (data.personality) parts.push(`【性格特征】${data.personality}`);
                        if (data.scenario) parts.push(`【场景设定】${data.scenario}`);
                        if (data.mes_example) parts.push(`【对话示例】${data.mes_example}`);
                        if (data.post_history_instructions) parts.push(`【追加指令】${data.post_history_instructions}`);
                        if (data.system_prompt) parts.push(`【系统指令】${data.system_prompt}`);
                        charPrompt = parts.join('\n\n') || data.first_mes || `扮演${charName}这个角色`;
                    } else {
                        // AIAW/MySW 格式
                        charPrompt = data.systemPrompt || data.prompt;
                    }

                    if (!charPrompt && !isTavernCard) {
                        throw new Error('文件格式不正确，缺少角色提示词（systemPrompt 或 prompt）。');
                    }

                    // 处理头像，兼容 AIAW 的 avatar 对象格式、酒馆卡的 avatar 字段和 avatar_url 字段
                    let charAvatar = DEFAULT_AVATAR_ASSISTANT;
                    if (data.avatar) {
                        if (typeof data.avatar === 'string') {
                            // MySW 格式或酒馆卡 base64 字符串：直接是 URL 或 DataURL
                            charAvatar = data.avatar;
                        } else if (typeof data.avatar === 'object' && data.avatar.type === 'text') {
                            // AIAW 格式：{"type":"text","text":"AI","hue":208}
                            // 生成一个带颜色的文本头像 DataURL
                            charAvatar = generateTextAvatarDataURL(data.avatar.text || 'AI', data.avatar.hue || 0);
                        } else if (data.avatar.url) {
                            // 其他可能的格式：包含 url 属性
                            charAvatar = data.avatar.url;
                        }
                    } else if (data.avatar_url) {
                        // 酒馆 V3 格式：使用 avatar_url 字段（可能是 HTTP URL 或 base64）
                        charAvatar = data.avatar_url.trim();
                    }

                    // 提取欢迎消息
                    let charWelcome = '';
                    if (isTavernCard) {
                        // 酒馆角色卡使用 first_mes 作为开场白
                        charWelcome = data.first_mes || data.alternate_greetings?.[0] || `你好，我是${charName}。很高兴认识你！`;
                    } else {
                        charWelcome = data.welcomeMessage || data.welcome || `你好，我是${charName}。很高兴认识你！`;
                    }

                    const newId = 'custom_' + Date.now();
                    const newChar = {
                        id: newId,
                        name: charName,
                        avatar: charAvatar,
                        systemPrompt: charPrompt,
                        welcomeMessage: charWelcome,
                        isCustom: true,
                        // 保存酒馆角色卡的额外元数据（可选）
                        originalFormat: isTavernCard ? 'tavern' : (data.prompt ? 'aiaw' : 'mysw')
                    };

                    friendsData[newId] = newChar;
                    saveCustomFriendsData();

                    threadManager[newId] = {
                        threads: [{ id: 1, name: '初始对话', messages: [] }],
                        currentThreadId: 1,
                        longTermMemory: []
                    };
                    saveThreadManager();

                    alert(`✅ 角色 "${charName}" 导入成功！`);
                    renderFriendOptions();
                    renderFriendList();

                    switchFriend(newId);
                    addFriendModal.classList.remove('show');

                } catch (error) {
                    alert(`❌ 导入失败：${error.message}`);
                    console.error('导入错误:', error);
                }
            };
            reader.readAsText(file);
        }

        // 导出单个角色聊天记录功能
        function exportCharacterChat(charId) {
            const char = friendsData[charId];
            if (!char) return;

            const friendData = threadManager[charId];
            if (!friendData || !friendData.threads || friendData.threads.length === 0) {
                showToast(`该角色暂无对话记录`, "ri-information-line");
                return;
            }

            const exportData = {
                character: {
                    id: char.id,
                    name: char.name,
                    avatar: char.avatar,
                    systemPrompt: char.systemPrompt,
                    welcomeMessage: char.welcomeMessage
                },
                threads: friendData.threads,
                longTermMemory: friendData.longTermMemory || [],
                exportTime: new Date().toLocaleString()
            };

            const jsonString = JSON.stringify(exportData, null, 2);
            const blob = new Blob([jsonString], { type: "application/json" });
            const url = URL.createObjectURL(blob);

            const a = document.createElement('a');
            a.href = url;
            a.download = `${char.name}_聊天记录_${Date.now()}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            showToast(`角色聊天记录已导出`, "ri-download-line");
        }

        // 导入单个角色聊天记录功能
        function importCharacterChat(file, targetCharId = null) {
            const reader = new FileReader();
            reader.onload = function(e) {
                try {
                    const data = JSON.parse(e.target.result);

                    if (!data.character || !data.character.name || !data.character.systemPrompt) {
                        throw new Error('文件格式不正确，缺少角色信息。');
                    }

                    const charData = data.character;

                    // 如果指定了目标角色 ID，则强制使用该 ID
                    let existingCharId = targetCharId;
                    const charId = charData.id || ('custom_' + Date.now());

                    // 如果没有指定目标角色 ID，则尝试自动查找
                    if (!existingCharId) {
                        if (friendsData[charId]) {
                            existingCharId = charId;
                        } else {
                            // 尝试通过名字查找
                            for (const fid in friendsData) {
                                if (friendsData[fid].name === charData.name) {
                                    existingCharId = fid;
                                    break;
                                }
                            }
                        }
                    } else if (!friendsData[existingCharId]) {
                        // 如果指定的 ID 不存在，重置为 null，将创建新角色或使用文件名匹配的角色
                        existingCharId = null;
                    }

                    if (existingCharId) {
                        // 更新现有角色
                        friendsData[existingCharId].systemPrompt = charData.systemPrompt;
                        if (charData.avatar) friendsData[existingCharId].avatar = charData.avatar;
                        if (charData.welcomeMessage) friendsData[existingCharId].welcomeMessage = charData.welcomeMessage;

                        // 合并线程数据
                        if (data.threads && data.threads.length > 0) {
                            if (!threadManager[existingCharId]) {
                                threadManager[existingCharId] = {
                                    threads: [],
                                    currentThreadId: 1,
                                    longTermMemory: []
                                };
                            }

                            // 智能合并线程：根据线程ID匹配，消息根据时间戳+发送者判断是否相同
                            const existingThreadsMap = new Map(threadManager[existingCharId].threads.map(t => [t.id, t]));

                            data.threads.forEach(importThread => {
                                const existingThread = existingThreadsMap.get(importThread.id);

                                if (existingThread) {
                                    // 线程已存在，智能合并消息
                                    // 策略：
                                    // 1. 生成消息指纹：发送者 + 时间戳 (秒级) + 内容前 30 字
                                    // 2. 如果指纹完全匹配 -> 视为同一条消息，更新内容
                                    // 3. 如果指纹不匹配但发送者相同、时间相近且内容相似 -> 视为修改版替换
                                    // 4. 其他情况 -> 视为新消息追加

                                    const generateMsgFingerprint = (msg) => {
                                        const timeSec = Math.floor((msg.timestamp || 0) / 1000); // 精确到秒
                                        const contentPreview = (msg.content || '').substring(0, 30);
                                        return `${msg.role}|${timeSec}|${contentPreview}`;
                                    };

                                    // 构建现有消息的指纹映射
                                    const existingFingerprintMap = new Map();
                                    existingThread.messages.forEach((m, idx) => {
                                        const fp = generateMsgFingerprint(m);
                                        existingFingerprintMap.set(fp, idx);
                                    });

                                    // 标记哪些现有消息被匹配过
                                    const matchedIndices = new Set();

                                    importThread.messages.forEach((importMsg, importIdx) => {
                                        const importFp = generateMsgFingerprint(importMsg);

                                        if (existingFingerprintMap.has(importFp)) {
                                            // 指纹完全匹配：视为同一条消息，执行替换
                                            const existingIdx = existingFingerprintMap.get(importFp);
                                            matchedIndices.add(existingIdx);

                                            // 更新内容，保留原有元数据
                                            existingThread.messages[existingIdx] = {
                                                ...existingThread.messages[existingIdx],
                                                content: importMsg.content,
                                                type: importMsg.type || existingThread.messages[existingIdx].type
                                            };
                                        } else {
                                            // 指纹不匹配：检查是否是"内容修改版"
                                            let isModifiedVersion = false;
                                            const importTimeSec = Math.floor((importMsg.timestamp || 0) / 1000);

                                            for (let i = 0; i < existingThread.messages.length; i++) {
                                                if (matchedIndices.has(i)) continue;

                                                const existMsg = existingThread.messages[i];
                                                const existTimeSec = Math.floor((existMsg.timestamp || 0) / 1000);

                                                // 条件：发送者相同 + 时间差在 5 秒内 + 未被匹配
                                                if (existMsg.role === importMsg.role &&
                                                    Math.abs(existTimeSec - importTimeSec) <= 5) {

                                                    // 检查内容相似度：长度差异小 或 包含前缀
                                                    const lenDiff = Math.abs((existMsg.content||'').length - (importMsg.content||'').length);
                                                    const contentExist = existMsg.content || '';
                                                    const contentImport = importMsg.content || '';

                                                    if (lenDiff < 20 || contentExist.includes(contentImport.substring(0, 10))) {
                                                        // 判定为修改版本，执行替换
                                                        matchedIndices.add(i);
                                                        existingThread.messages[i] = {
                                                            ...existMsg,
                                                            content: importMsg.content,
                                                            type: importMsg.type || existMsg.type
                                                        };
                                                        isModifiedVersion = true;
                                                        break;
                                                    }
                                                }
                                            }

                                            if (!isModifiedVersion) {
                                                // 确实是新消息，追加
                                                existingThread.messages.push(importMsg);
                                            }
                                        }
                                    });

                                    // 按时间戳排序消息，保证顺序正确
                                    existingThread.messages.sort((a, b) =>
                                        (a.timestamp || 0) - (b.timestamp || 0)
                                    );

                                } else {
                                    // 线程不存在，直接添加
                                    threadManager[existingCharId].threads.push(importThread);
                                }
                            });

                            // 合并长期记忆（去重）
                            if (data.longTermMemory && data.longTermMemory.length > 0) {
                                const existingMemoriesSet = new Set(
                                    threadManager[existingCharId].longTermMemory.map(m => JSON.stringify(m))
                                );
                                data.longTermMemory.forEach(mem => {
                                    const memStr = JSON.stringify(mem);
                                    if (!existingMemoriesSet.has(memStr)) {
                                        threadManager[existingCharId].longTermMemory.push(mem);
                                    }
                                });
                            }

                            saveThreadManager();
                        }

                        saveCustomFriendsData();
                        alert(`✅ 角色 "${charData.name}" 的聊天记录已合并导入！`);
                        renderFriendOptions();
                        renderFriendList();
                        switchFriend(existingCharId);
                    } else {
                        // 创建新角色
                        const newChar = {
                            id: charId,
                            name: charData.name,
                            avatar: charData.avatar || DEFAULT_AVATAR_ASSISTANT,
                            systemPrompt: charData.systemPrompt,
                            welcomeMessage: charData.welcomeMessage || `你好，我是${charData.name}。很高兴认识你！`,
                            isCustom: true
                        };

                        friendsData[charId] = newChar;
                        saveCustomFriendsData();

                        threadManager[charId] = {
                            threads: data.threads || [{ id: 1, name: '初始对话', messages: [] }],
                            currentThreadId: data.threads && data.threads.length > 0 ? data.threads[0].id : 1,
                            longTermMemory: data.longTermMemory || []
                        };
                        saveThreadManager();

                        alert(`✅ 角色 "${charData.name}" 及其聊天记录导入成功！`);
                        renderFriendOptions();
                        renderFriendList();
                        switchFriend(charId);
                    }

                } catch (error) {
                    alert(`❌ 导入失败：${error.message}`);
                    console.error('导入错误:', error);
                }
            };
            reader.readAsText(file);
        }

        // 显示角色选择弹窗
        function showCharacterSelectModal(action) {
            const characterList = Object.values(friendsData).sort((a, b) => {
                if (a.isCustom && !b.isCustom) return 1;
                if (!a.isCustom && b.isCustom) return -1;
                return a.name.localeCompare(b.name);
            });

            let html = `<div style="max-height: 400px; overflow-y: auto;">`;
            characterList.forEach(char => {
                const threadCount = threadManager[char.id]?.threads?.length || 0;
                const messageCount = threadManager[char.id]?.threads?.reduce((sum, t) => sum + (t.messages?.length || 0), 0) || 0;

                html += `
                    <div class="friend-item" onclick="handleCharacterSelect('${char.id}', '${action}')" style="padding: 12px; margin-bottom: 8px; border-radius: 8px; cursor: pointer; transition: background-color 0.2s;" onmouseover="this.style.backgroundColor='#3a3d47'" onmouseout="this.style.backgroundColor=''">
                        <img src="${char.avatar}" alt="${char.name}" style="width: 40px; height: 40px; border-radius: 50%; object-fit: cover; margin-right: 12px; vertical-align: middle;">
                        <span style="display: inline-block; vertical-align: middle; font-weight: 500;">${char.name}</span>
                        <span style="float: right; color: #888; font-size: 0.85em;">${threadCount}个对话 · ${messageCount}条消息</span>
                    </div>
                `;
            });
            html += `</div>`;

            const title = action === 'export' ? '导出角色聊天记录' : '导入角色聊天记录';

            // 使用现有的确认对话框结构
            const confirmTitle = document.getElementById('confirm-title');
            const confirmMessage = document.getElementById('confirm-message');
            const confirmCancelBtn = document.getElementById('confirm-cancel-btn');
            const confirmOkBtn = document.getElementById('confirm-ok-btn');

            if (confirmTitle && confirmMessage) {
                confirmTitle.textContent = title;
                confirmMessage.innerHTML = html;
                confirmCancelBtn.style.display = 'block';
                confirmOkBtn.style.display = 'none';

                document.getElementById('confirm-modal').classList.add('show');
            } else {
                alert('请选择要' + (action === 'export' ? '导出' : '导入') + '的角色');
            }
        }

        // 处理角色选择
        window.handleCharacterSelect = function(charId, action) {
            document.getElementById('confirm-modal').classList.remove('show');

            if (action === 'export') {
                exportCharacterChat(charId);
            } else if (action === 'import') {
                // 触发隐藏的文件输入框
                const importInput = document.getElementById('import-character-chat-input');
                if (importInput) {
                    // 存储当前选择的角色 ID
                    importInput.dataset.targetCharId = charId;
                    importInput.click();
                }
            }
        };

        function renderFriendOptions() {
            friendOptionsList.innerHTML = '';
            Object.values(friendsData).forEach(friend => {
                const option = document.createElement('div');
                option.classList.add('friend-option');
                option.setAttribute('data-friend', friend.id);

                let badgeHtml = '';
                if (friend.isCustom) {
                    badgeHtml = '<span class="custom-badge">自定义</span>';
                }

                option.innerHTML = `
                    ${badgeHtml}
                    <img src="${friend.avatar}" alt="${friend.name}">
                    <div class="friend-option-info">
                        <h3>${friend.name}</h3>
                        <p>${friend.systemPrompt.substring(0, 30)}...</p>
                    </div>
                    <button class="export-char-btn" title="导出角色配置">
                        <i class="ri-download-cloud-2-line"></i>
                    </button>
                `;

                option.querySelector('.export-char-btn').addEventListener('click', (e) => {
                    e.stopPropagation();
                    exportCharacter(friend.id);
                });

                option.addEventListener('click', () => {
                    if (friend.isCustom) {
                        startEditCharacter(friend.id);
                    } else {
                        switchFriend(friend.id);
                        addFriendModal.classList.remove('show');
                    }
                });

                friendOptionsList.appendChild(option);
            });
        }

        toggleCreateBtn.addEventListener('click', () => {
            openCharacterEditModal();
        });

        // 关闭角色编辑弹窗
        closeCharacterEditBtn.addEventListener('click', () => {
            characterEditModal.classList.remove('show');
        });

        // 点击遮罩层关闭
        characterEditModal.addEventListener('click', (e) => {
            if (e.target === characterEditModal) {
                characterEditModal.classList.remove('show');
            }
        });

        // 取消创建按钮（弹窗内）
        cancelCreateBtnModal.addEventListener('click', () => {
            characterEditModal.classList.remove('show');
            resetCreateFormModal();
        });

        // 打开角色编辑弹窗函数
        function openCharacterEditModal(editCharId = null) {
            characterEditModal.classList.add('show');
            if (editCharId) {
                startEditCharacterModal(editCharId);
            } else {
                resetCreateFormModal();
            }
        }

        // 重置表单（弹窗版本）
        function resetCreateFormModal() {
            editCharacterIdInputModal.value = '';
            newCharNameInputModal.value = '';
            newCharPromptInputModal.value = '';
            newCharAvatarInputModal.value = '';
            newCharWelcomeInputModal.value = '';
            characterEditModalTitle.textContent = '创建新角色';
            saveBtnTextModal.textContent = '创建角色';
            deleteCharacterBtnModal.style.display = 'none';
            cloneCharacterBtnModal.style.display = 'none';
        }

        // 开始编辑角色（弹窗版本）
        function startEditCharacterModal(charId) {
            const char = friendsData[charId];
            if (!char) return;

            editCharacterIdInputModal.value = charId;
            newCharNameInputModal.value = char.name;
            newCharPromptInputModal.value = char.systemPrompt;
            newCharAvatarInputModal.value = char.avatar;
            newCharWelcomeInputModal.value = char.welcomeMessage || '';

            characterEditModalTitle.textContent = `编辑角色：${char.name}`;
            saveBtnTextModal.textContent = '保存修改';
            deleteCharacterBtnModal.style.display = 'flex';
            cloneCharacterBtnModal.style.display = 'flex';
        }

        cancelCreateBtn.addEventListener('click', () => {
            createCharacterSection.style.display = 'none';
            toggleCreateBtn.style.display = 'flex';
            resetCreateForm();
        });

        function resetCreateForm() {
            editCharacterIdInput.value = '';
            newCharNameInput.value = '';
            newCharPromptInput.value = '';
            newCharAvatarInput.value = '';
            newCharWelcomeInput.value = '';
            createEditTitle.textContent = '创建新角色';
            saveBtnText.textContent = '创建角色';
            deleteCharacterBtn.style.display = 'none';
        }

        function startEditCharacter(charId) {
            const char = friendsData[charId];
            if (!char) return;

            createCharacterSection.style.display = 'block';
            toggleCreateBtn.style.display = 'none';

            editCharacterIdInput.value = charId;
            newCharNameInput.value = char.name;
            newCharPromptInput.value = char.systemPrompt;
            newCharAvatarInput.value = char.avatar;
            newCharWelcomeInput.value = char.welcomeMessage || '';

            createEditTitle.textContent = `编辑角色：${char.name}`;
            saveBtnText.textContent = '保存修改';
            deleteCharacterBtn.style.display = 'flex';
        }


        generateWelcomeBtn.addEventListener('click', async () => {
            const prompt = newCharPromptInput.value.trim();
            const name = newCharNameInput.value.trim() || '角色';

            if (!prompt) {
                alert('请先填写角色提示词！');
                return;
            }

            const apiSettings = JSON.parse(localStorage.getItem('aiChatSettings'));
            if (!apiSettings || !apiSettings.apiKey) {
                alert('请先在设置中配置 API Key！');
                return;
            }

            generateWelcomeBtn.disabled = true;
            generateWelcomeBtn.innerHTML = '<i class="ri-loader-4-line ri-spin"></i> 生成中...';

            try {
                const response = await fetch(apiSettings.apiUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${apiSettings.apiKey}`
                    },
                    body: JSON.stringify({
                        model: apiSettings.modelName,
                        messages: [
                            { role: "system", content: "你是一个创意文案助手，擅长为虚拟角色撰写生动、有深度的开场白。" },
                            { role: "user", content: `请为角色"${name}"生成一段精彩的开场白（100-200 字左右），基于以下人设：\n${prompt.substring(0, 800)}\n\n要求：\n1. 符合角色性格和背景设定\n2. 有场景感和代入感，可以适当描写动作、神态或环境\n3. 语气自然生动，能吸引用户继续对话\n4. 不要过于简短，要有一定的内容深度\n\n直接返回开场白内容，不要其他解释文字。` }
                        ],
                        temperature: 0.8,
                        max_tokens: 300
                    })
                });

                if (response.ok) {
                    const data = await response.json();
                    const welcome = data.choices[0].message.content.trim();
                    newCharWelcomeInput.value = welcome;
                } else {
                    alert('生成失败，请检查 API 配置');
                }
            } catch (e) {
                alert('生成出错：' + e.message);
            } finally {
                generateWelcomeBtn.disabled = false;
                generateWelcomeBtn.innerHTML = '<i class="ri-magic-line"></i> AI 生成开场白';
            }
        });

        saveCharacterBtn.addEventListener('click', () => {
            const name = newCharNameInput.value.trim();
            const prompt = newCharPromptInput.value.trim();
            const avatar = newCharAvatarInput.value.trim() || DEFAULT_AVATAR_ASSISTANT;
            const welcome = newCharWelcomeInput.value.trim() || `你好，我是${name}，很高兴认识你！`;

            if (!name || !prompt) {
                alert('请填写角色名字和提示词！');
                return;
            }

            const editId = editCharacterIdInput.value;

            if (editId) {
                friendsData[editId].name = name;
                friendsData[editId].systemPrompt = prompt;
                friendsData[editId].avatar = avatar;
                friendsData[editId].welcomeMessage = welcome;

                saveCustomFriendsData();

                if (currentFriendId === editId) {
                    currentFriendNameElement.textContent = getFriendDisplayName(editId);
                    renderMessages(editId);
                }

                alert('✅ 角色已更新！');
                renderFriendOptions();
                renderFriendList();
            } else {
                const newId = 'custom_' + Date.now();
                friendsData[newId] = {
                    id: newId,
                    name: name,
                    avatar: avatar,
                    systemPrompt: prompt,
                    welcomeMessage: welcome,
                    isCustom: true
                };

                saveCustomFriendsData();

                threadManager[newId] = {
                    threads: [{ id: 1, name: '初始对话', messages: [] }],
                    currentThreadId: 1,
                    longTermMemory: []
                };
                saveThreadManager();

                alert('✅ 角色创建成功！');
                renderFriendOptions();
                renderFriendList();

                switchFriend(newId);
                addFriendModal.classList.remove('show');
            }

            resetCreateForm();
            createCharacterSection.style.display = 'none';
            toggleCreateBtn.style.display = 'flex';
        });


        function cloneCharacterFromModal() {
            const sourceId = editCharacterIdInputModal.value;
            const source = friendsData[sourceId];
            if (!source) return;
            const newId = `custom_${Date.now()}`;
            const cloned = {
                ...source,
                id: newId,
                name: `${source.name} 副本`,
                isCustom: true
            };
            friendsData[newId] = cloned;
            threadManager[newId] = {
                threads: [{ id: 1, name: '初始对话', messages: [] }],
                currentThreadId: 1,
                longTermMemory: JSON.parse(JSON.stringify(threadManager[sourceId]?.longTermMemory || []))
            };
            saveCustomFriendsData();
            saveThreadManager();
            renderFriendOptions();
            renderFriendList();
            characterEditModal.classList.remove('show');
            switchFriend(newId);
            showToast(`已克隆角色「${source.name}」`, 'ri-file-copy-line');
        }

        // 弹窗版本的保存按钮
        cloneCharacterBtnModal?.addEventListener('click', cloneCharacterFromModal);

        saveCharacterBtnModal.addEventListener('click', () => {
            const name = newCharNameInputModal.value.trim();
            const prompt = newCharPromptInputModal.value.trim();
            const avatar = newCharAvatarInputModal.value.trim() || DEFAULT_AVATAR_ASSISTANT;
            const welcome = newCharWelcomeInputModal.value.trim() || `你好，我是${name}，很高兴认识你！`;

            if (!name || !prompt) {
                alert('请填写角色名字和提示词！');
                return;
            }

            const editId = editCharacterIdInputModal.value;

            if (editId) {
                friendsData[editId].name = name;
                friendsData[editId].systemPrompt = prompt;
                friendsData[editId].avatar = avatar;
                friendsData[editId].welcomeMessage = welcome;

                saveCustomFriendsData();

                if (currentFriendId === editId) {
                    currentFriendNameElement.textContent = getFriendDisplayName(editId);
                    renderMessages(editId);
                }

                alert('✅ 角色已更新！');
                renderFriendOptions();
                renderFriendList();
            } else {
                const newId = 'custom_' + Date.now();
                friendsData[newId] = {
                    id: newId,
                    name: name,
                    avatar: avatar,
                    systemPrompt: prompt,
                    welcomeMessage: welcome,
                    isCustom: true
                };

                saveCustomFriendsData();

                threadManager[newId] = {
                    threads: [{ id: 1, name: '初始对话', messages: [] }],
                    currentThreadId: 1,
                    longTermMemory: []
                };
                saveThreadManager();

                alert('✅ 角色创建成功！');
                renderFriendOptions();
                renderFriendList();

                switchFriend(newId);
            }

            characterEditModal.classList.remove('show');
            resetCreateFormModal();
        });

        deleteCharacterBtn.addEventListener('click', () => {
            const charId = editCharacterIdInput.value;
            if (!charId) return;

            if (confirm(`确定要删除角色 "${friendsData[charId].name}" 吗？此操作不可撤销，且会删除所有相关聊天记录！`)) {
                delete friendsData[charId];
                delete threadManager[charId];

                saveCustomFriendsData();
                saveThreadManager();

                if (currentFriendId === charId) {
                    switchFriend('silverwolf');
                }

                alert('️ 角色已删除。');
                resetCreateForm();
                createCharacterSection.style.display = 'none';
                toggleCreateBtn.style.display = 'flex';
                renderFriendOptions();
                renderFriendList();
            }
        });

        // 弹窗版本的删除按钮
        deleteCharacterBtnModal.addEventListener('click', () => {
            const charId = editCharacterIdInputModal.value;
            if (!charId) return;

            if (confirm(`确定要删除角色 "${friendsData[charId].name}" 吗？此操作不可撤销，且会删除所有相关聊天记录！`)) {
                delete friendsData[charId];
                delete threadManager[charId];

                saveCustomFriendsData();
                saveThreadManager();

                if (currentFriendId === charId) {
                    switchFriend('silverwolf');
                }

                alert('️ 角色已删除。');
                characterEditModal.classList.remove('show');
                resetCreateFormModal();
                renderFriendOptions();
                renderFriendList();
            }
        });

        importCharFileBtn.addEventListener('click', () => {
            charImportUpload.click();
        });

        charImportUpload.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                importCharacterFile(file);
                e.target.value = '';
            }
        });


        kbUploadBtn.addEventListener('click', () => {
            kbFileUploadInput.click();
        });

        function chunkKnowledgeContent(content, maxChars = 12000) {
            const chunks = [];
            for (let i = 0; i < content.length; i += maxChars) chunks.push(content.slice(i, i + maxChars));
            return chunks.length ? chunks : [''];
        }

        function readFileAsText(file) {
            return new Promise((resolve) => {
                const reader = new FileReader();
                reader.onload = evt => resolve(evt.target.result || '');
                reader.onerror = () => resolve('');
                reader.readAsText(file, 'utf-8');
            });
        }

        kbFileUploadInput.addEventListener('change', async (e) => {
            const files = Array.from(e.target.files);
            if (files.length > 0) {
                const s = JSON.parse(localStorage.getItem('knowledgeSettings')) || {};
                s.files = s.files || [];

                for (const file of files) {
                    const baseFileId = 'kb_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
                    const content = await readFileAsText(file);
                    const chunks = chunkKnowledgeContent(content);
                    chunks.forEach((chunk, index) => {
                        s.files.push({
                            id: chunks.length > 1 ? `${baseFileId}_${index + 1}` : baseFileId,
                            sourceId: baseFileId,
                            name: chunks.length > 1 ? `${file.name}（分块 ${index + 1}/${chunks.length}）` : file.name,
                            size: new Blob([chunk]).size,
                            originalSize: file.size,
                            chunkIndex: index + 1,
                            chunkTotal: chunks.length,
                            uploadDate: new Date().toISOString(),
                            content: chunk
                        });
                    });
                }

                try {
                    localStorage.setItem('knowledgeSettings', JSON.stringify(s));
                    renderKnowledgeFileList(s.files);
                    alert(`✅ 已读取并添加 ${files.length} 个文档到知识库列表`);
                } catch (err) {
                    console.error('知识库文档保存失败:', err);
                    alert('❌ 文档内容过大，保存到 localStorage 失败。请减少文件大小或数量后重试。');
                }
            }
            kbFileUploadInput.value = '';
        });

        // 头像文件上传处理（已在顶部定义过 const charAvatarUpload，这里只需要添加事件监听）
        // 当前正在操作的头像输入框（用于区分是哪个界面触发的上传）
        let currentAvatarInput = null;

        selectCharAvatarBtn.addEventListener('click', () => {
            currentAvatarInput = newCharAvatarInput;
            charAvatarUpload.click();
        });

        // 弹窗版本的头像选择按钮
        selectCharAvatarBtnModal.addEventListener('click', () => {
            currentAvatarInput = newCharAvatarInputModal;
            charAvatarUpload.click();
        });

        // 统一处理头像文件上传（根据当前操作的目标输入框来设置值）
        charAvatarUpload.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file && currentAvatarInput) {
                const reader = new FileReader();
                reader.onload = (evt) => {
                    currentAvatarInput.value = evt.target.result;
                };
                reader.readAsDataURL(file);
            }
            charAvatarUpload.value = '';
            currentAvatarInput = null;
        });

        // 弹窗版本的 AI 生成开场白按钮
        generateWelcomeBtnModal.addEventListener('click', async () => {
            const prompt = newCharPromptInputModal.value.trim();
            const name = newCharNameInputModal.value.trim() || '角色';

            if (!prompt) {
                alert('请先填写角色提示词！');
                return;
            }

            const apiSettings = JSON.parse(localStorage.getItem('aiChatSettings'));
            if (!apiSettings || !apiSettings.apiKey) {
                alert('请先在设置中配置 API Key！');
                return;
            }

            generateWelcomeBtnModal.disabled = true;
            generateWelcomeBtnModal.innerHTML = '<i class="ri-loader-4-line ri-spin"></i> 生成中...';

            try {
                const response = await fetch(apiSettings.apiUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${apiSettings.apiKey}`
                    },
                    body: JSON.stringify({
                        model: apiSettings.modelName,
                        messages: [
                            { role: "system", content: "你是一个创意文案助手，擅长为虚拟角色撰写生动、有深度的开场白。" },
                            { role: "user", content: `请为角色"${name}"生成一段精彩的开场白（100-200 字左右），基于以下人设：\n${prompt.substring(0, 800)}\n\n要求：\n1. 符合角色性格和背景设定\n2. 有场景感和代入感，可以适当描写动作、神态或环境\n3. 语气自然生动，能吸引用户继续对话\n4. 不要过于简短，要有一定的内容深度\n\n直接返回开场白内容，不要其他解释文字。` }
                        ],
                        temperature: 0.8,
                        max_tokens: 300
                    })
                });

                if (response.ok) {
                    const data = await response.json();
                    const welcome = data.choices[0].message.content.trim();
                    newCharWelcomeInputModal.value = welcome;
                } else {
                    alert('生成失败，请检查 API 配置');
                }
            } catch (e) {
                alert('生成出错：' + e.message);
            } finally {
                generateWelcomeBtnModal.disabled = false;
                generateWelcomeBtnModal.innerHTML = '<i class="ri-magic-line"></i> AI 生成开场白';
            }
        });

        function saveCustomFriendsData() {
            const customData = {};
            Object.keys(friendsData).forEach(key => {
                if (friendsData[key].isCustom) {
                    customData[key] = friendsData[key];
                }
            });
            setLocalStorageSafely('customFriendsData', JSON.stringify(customData), '自定义角色数据');
        }


        function initBubbleStyleSelector() {
            const options = document.querySelectorAll('.bubble-style-option');
            options.forEach(option => {
                option.addEventListener('click', () => {
                    options.forEach(o => {
                        o.style.borderColor = '#555';
                        o.style.background = 'rgba(85, 85, 85, 0.1)';
                    });
                    option.style.borderColor = '#e6c78a';
                    option.style.background = 'rgba(230, 199, 138, 0.1)';
                    currentBubbleStyle = option.dataset.style;
                    updateBubbleStyleUI();
                });
            });
        }

        function updateBubbleStyleUI() {
            const options = document.querySelectorAll('.bubble-style-option');
            options.forEach(option => {
                if (option.dataset.style === currentBubbleStyle) {
                    option.style.borderColor = '#e6c78a';
                    option.style.background = 'rgba(230, 199, 138, 0.1)';
                } else {
                    option.style.borderColor = '#555';
                    option.style.background = 'rgba(85, 85, 85, 0.1)';
                }
            });
        }


        selectBubbleBgBtn.addEventListener('click', () => {
            bubbleBgUpload.click();
        });

        bubbleBgUpload.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (evt) => {
                    currentBubbleImage = evt.target.result;
                    applyBubbleBackground();
                    saveChatSettings();
                };
                reader.readAsDataURL(file);
            }
            bubbleBgUpload.value = '';
        });

        resetBubbleBgBtn.addEventListener('click', () => {
            currentBubbleImage = null;
            applyBubbleBackground();
            saveChatSettings();
        });

        function applyBubbleBackground() {
            const bubbles = document.querySelectorAll('.bubble');
            bubbles.forEach(bubble => {
                if (currentBubbleImage) {
                    bubble.classList.add('has-custom-bg');
                    bubble.style.backgroundImage = `url('${currentBubbleImage}')`;
                    bubbleBgPreview.style.display = 'block';
                    bubbleBgPreview.style.backgroundImage = `url('${currentBubbleImage}')`;
                } else {
                    bubble.classList.remove('has-custom-bg');
                    bubble.style.backgroundImage = '';
                    bubbleBgPreview.style.display = 'none';
                    bubbleBgPreview.style.backgroundImage = '';
                }
            });
        }


        function updateBubbleTextInputs() {
            bubbleTextColorInput.value = currentBubbleTextStyle.color;
            bubbleFontSizeInput.value = currentBubbleTextStyle.fontSize;
            bubbleStrokeColorInput.value = currentBubbleTextStyle.strokeColor;
            bubbleStrokeWidthInput.value = currentBubbleTextStyle.strokeWidth;
            enableBubbleStrokeCheckbox.checked = currentBubbleTextStyle.enableStroke;
        }

        applyBubbleTextStyleBtn.addEventListener('click', () => {
            currentBubbleTextStyle = {
                color: bubbleTextColorInput.value,
                fontSize: parseInt(bubbleFontSizeInput.value) || 14,
                strokeColor: bubbleStrokeColorInput.value,
                strokeWidth: parseInt(bubbleStrokeWidthInput.value) || 1,
                enableStroke: enableBubbleStrokeCheckbox.checked
            };
            applyBubbleTextStyleToAll();
            saveChatSettings();
            showToast("气泡样式已应用", "ri-font-size");
        });

        function applyBubbleTextStyleToAll() {
            const bubbles = document.querySelectorAll('.bubble');
            bubbles.forEach(bubble => {
                applyBubbleTextStyle(bubble);
            });
        }



        batchEditBtn?.addEventListener('click', () => {
            isBatchEditMode = !isBatchEditMode;
            selectedCustomFriends.clear();
            updateBatchActionButtons();
            renderFriendList();
        });
        batchExportBtn?.addEventListener('click', exportSelectedCustomFriends);
        batchDeleteBtn?.addEventListener('click', deleteSelectedCustomFriends);
        createGroupBtn?.addEventListener('click', createGroupChat);

        function ensureMarkdownPreview() {
            if (markdownPreviewEl) return markdownPreviewEl;
            markdownPreviewEl = document.createElement('div');
            markdownPreviewEl.className = 'markdown-preview-popover';
            markdownPreviewEl.hidden = true;
            messageInput.parentElement?.appendChild(markdownPreviewEl);
            return markdownPreviewEl;
        }

        function updateMarkdownPreview() {
            const preview = ensureMarkdownPreview();
            if (!getFeatureToggles().showMarkdownPreview || !messageInput.matches(':hover, :focus') || !messageInput.value.trim()) {
                preview.hidden = true;
                return;
            }
            preview.innerHTML = sanitizeMessage(marked.parse(messageInput.value));
            preview.hidden = false;
        }

        summaryChatBtn?.addEventListener('click', summarizeCurrentThread);
        chatStatsBtn?.addEventListener('click', () => appendSystemMessage(`<pre>${escapeHtml(getChatStatsText())}</pre>`));
        myDisplayNameElement.addEventListener('click', enableEditUserName);
        sendBtn.addEventListener('click', () => sendMessage(messageInput.value));
        messageInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                sendMessage(messageInput.value);
            }
        });


        messageInput.addEventListener('paste', (e) => {
            const file = [...(e.clipboardData?.files || [])].find(item => item.type?.startsWith('image/'));
            if (file) {
                e.preventDefault();
                sendImageFile(file);
                return;
            }
            const text = e.clipboardData?.getData('text/plain');
            if (text && e.clipboardData?.types?.includes('text/html')) {
                e.preventDefault();
                document.execCommand('insertText', false, text.replace(/\u00a0/g, ' '));
            }
        });

        messageInput.addEventListener('dragover', (e) => {
            if ([...(e.dataTransfer?.items || [])].some(item => item.type?.startsWith('image/'))) e.preventDefault();
        });

        messageInput.addEventListener('drop', (e) => {
            const file = [...(e.dataTransfer?.files || [])].find(item => item.type?.startsWith('image/'));
            if (file) {
                e.preventDefault();
                sendImageFile(file);
            }
        });

        window.addEventListener('online', replayOfflineMessageQueue);
        if (window.visualViewport) {
            window.visualViewport.addEventListener('resize', () => {
                if (document.activeElement === messageInput) requestAnimationFrame(scrollToBottom);
            });
        }

        messageInput.addEventListener('mouseenter', updateMarkdownPreview);
        messageInput.addEventListener('mouseleave', () => { if (markdownPreviewEl) markdownPreviewEl.hidden = true; });
        messageInput.addEventListener('focus', updateMarkdownPreview);
        messageInput.addEventListener('blur', () => { if (markdownPreviewEl) markdownPreviewEl.hidden = true; });

        messageInput.addEventListener('input', () => {
            autoResizeMessageInput();
            saveMessageDraft();
            updateMarkdownPreview();
        });

        function autoResizeMessageInput() {
            messageInput.style.height = 'auto';
            const maxHeight = 140;
            messageInput.style.height = Math.min(messageInput.scrollHeight, maxHeight) + 'px';
            messageInput.style.overflowY = messageInput.scrollHeight > maxHeight ? 'auto' : 'hidden';
        }

        function updateOnlineStatus() {
            const isOffline = !navigator.onLine;
            if (offlineBanner) offlineBanner.hidden = !isOffline;
            sendBtn.classList.toggle('disabled', isOffline);
            sendBtn.title = isOffline ? '离线模式下只能保存消息，AI 调用会暂停' : '发送';
        }

        window.addEventListener('online', updateOnlineStatus);
        window.addEventListener('offline', updateOnlineStatus);
        updateOnlineStatus();
        autoResizeMessageInput();



        function updateChatSearch() {
            const keyword = (chatSearchInput?.value || '').trim().toLowerCase();
            document.querySelectorAll('.message.search-match, .message.search-active').forEach(el => {
                el.classList.remove('search-match', 'search-active');
            });
            chatSearchMatches = [];
            chatSearchIndex = -1;
            if (!keyword) {
                if (chatSearchCount) chatSearchCount.textContent = '0/0';
                return;
            }
            const thread = getCurrentThread();
            (thread?.messages || []).forEach(msg => {
                if (String(msg.content || '').toLowerCase().includes(keyword)) {
                    const el = chatMessages.querySelector(`.message[data-message-id="${(window.CSS?.escape ? CSS.escape(String(msg.id || msg.timestamp)) : String(msg.id || msg.timestamp).replace(/\"/g, '\\\"'))}"]`);
                    if (el) {
                        el.classList.add('search-match');
                        chatSearchMatches.push(el);
                    }
                }
            });
            if (chatSearchMatches.length > 0) {
                chatSearchIndex = 0;
                jumpToChatSearchMatch(0);
            } else if (chatSearchCount) {
                chatSearchCount.textContent = '0/0';
            }
        }

        function jumpToChatSearchMatch(index) {
            if (!chatSearchMatches.length) {
                if (chatSearchCount) chatSearchCount.textContent = '0/0';
                return;
            }
            chatSearchMatches.forEach(el => el.classList.remove('search-active'));
            chatSearchIndex = (index + chatSearchMatches.length) % chatSearchMatches.length;
            const active = chatSearchMatches[chatSearchIndex];
            active.classList.add('search-active');
            active.scrollIntoView({ behavior: 'smooth', block: 'center' });
            if (chatSearchCount) chatSearchCount.textContent = `${chatSearchIndex + 1}/${chatSearchMatches.length}`;
        }

        function toggleShortcutHelp(force) {
            if (!shortcutHelpModal) return;
            const shouldShow = force ?? !shortcutHelpModal.classList.contains('show');
            shortcutHelpModal.classList.toggle('show', shouldShow);
        }

        chatSearchInput?.addEventListener('input', updateChatSearch);
        chatSearchPrev?.addEventListener('click', () => jumpToChatSearchMatch(chatSearchIndex - 1));
        chatSearchNext?.addEventListener('click', () => jumpToChatSearchMatch(chatSearchIndex + 1));
        closeShortcutHelpBtn?.addEventListener('click', () => toggleShortcutHelp(false));
        document.addEventListener('keydown', (e) => {
            const target = e.target;
            const isTyping = target && ['INPUT', 'TEXTAREA'].includes(target.tagName);
            if (e.key === '?' && !isTyping) {
                e.preventDefault();
                toggleShortcutHelp();
            }
            if (e.key === '/' && !isTyping) {
                e.preventDefault();
                messageInput.focus();
                if (!messageInput.value) {
                    messageInput.value = '/';
                    autoResizeMessageInput();
                }
            }
        });
        exportChatHtmlBtn?.addEventListener('click', exportChatHtml);
        exportMemoryCsvBtn?.addEventListener('click', exportLongTermMemoryCsv);
        importMemoryCsvInput?.addEventListener('change', (e) => {
            const file = e.target.files?.[0];
            if (file) importLongTermMemoryCsv(file);
            importMemoryCsvInput.value = '';
        });

        if (friendSearchInput) {
            friendSearchInput.addEventListener('input', () => {
                renderFriendList();
                renderGlobalSearchResults(friendSearchInput.value);
            });
        }
        globalSearchResults?.addEventListener('click', (e) => {
            const item = e.target.closest('.search-result-item');
            if (!item) return;
            jumpToSearchResult(item.dataset.friendId, item.dataset.threadId, item.dataset.messageId);
        });
        exportChatTxtBtn?.addEventListener('click', () => exportReadableChat('txt'));
        exportChatMdBtn?.addEventListener('click', () => exportReadableChat('md'));
        printChatBtn?.addEventListener('click', printReadableChat);

        emojiBtn.addEventListener('click', (e) => { e.stopPropagation(); toggleEmojiPicker(); });


        function escapeHtml(text) {
            if (typeof text !== 'string') return text;
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }

        function appendSanitizedHtml(target, html) {
            const template = document.createElement('template');
            template.innerHTML = sanitizeMessage(html);
            target.appendChild(template.content);
            enhanceCodeBlocks(target);
        }

        // 使用 DOMPurify 过滤可能破坏网页安全的代码，防止 XSS 攻击
        function sanitizeMessage(text) {
            if (typeof text !== 'string') return text;

            // 使用 DOMPurify 进行专业的 XSS 防护
            if (typeof DOMPurify !== 'undefined') {
                return DOMPurify.sanitize(text, {
                    ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'a', 'p', 'br', 'code', 'pre', 'ul', 'ol', 'li', 'blockquote', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'img'],
                    ALLOWED_ATTR: ['href', 'src', 'alt', 'title'],
                    ALLOW_DATA_ATTR: false,
                    ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto):|[^a-z]|[a-z+.-]+(?:[^a-z+.-:]|$))/i
                });
            }

            // 降级方案：如果 DOMPurify 不可用，使用基础过滤
            let sanitized = text;

            // 移除 <script> 标签及其内容（不区分大小写）
            sanitized = sanitized.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
            sanitized = sanitized.replace(/<script[^>]*>/gi, '');
            sanitized = sanitized.replace(/<\/script>/gi, '');

            // 移除 javascript: 协议（不区分大小写，包括编码形式）
            sanitized = sanitized.replace(/javascript\s*:/gi, 'blocked:');
            sanitized = sanitized.replace(/j\s*a\s*v\s*a\s*s\s*c\s*r\s*i\s*p\s*t\s*:/gi, 'blocked:');

            // 移除其他危险协议
            sanitized = sanitized.replace(/vbscript\s*:/gi, 'blocked:');
            sanitized = sanitized.replace(/data\s*:\s*text\/html/gi, 'blocked:text/plain');
            sanitized = sanitized.replace(/on\w+\s*=/gi, 'data-blocked=');

            // 移除 iframe、object、embed 等危险标签
            sanitized = sanitized.replace(/<(iframe|object|embed|form|input|button|textarea|select|style|link|meta)\b[^>]*>/gi, '');
            sanitized = sanitized.replace(/<\/(iframe|object|embed|form|input|button|textarea|select|style|link|meta)>/gi, '');

            return sanitized;
        }


        function encryptApiKey(key) {
            if (!key) return '';
            return 'enc_' + btoa(key.split('').reverse().join(''));
        }

        function decryptApiKey(encrypted) {
            if (!encrypted || !encrypted.startsWith('enc_')) return encrypted;
            try {
                return atob(encrypted.slice(4)).split('').reverse().join('');
            } catch(e) {
                return encrypted;
            }
        }
        document.addEventListener('click', (e) => {
            if (!emojiPicker.contains(e.target) && e.target !== emojiBtn) toggleEmojiPicker(false);
            if (!avatarContextMenu.contains(e.target) && e.target !== inputAvatar) toggleAvatarMenu(false);
            if (!aiAvatarContextMenu.contains(e.target)) toggleAiAvatarMenu(false);
            if (!friendContextMenu.contains(e.target)) toggleFriendContextMenu(false);
        });

        function sendImageFile(file) {
            if (!file || !file.type?.startsWith('image/')) {
                showToast('仅支持发送图片文件', 'ri-error-warning-line');
                return;
            }
            const reader = new FileReader();
            reader.onload = (evt) => sendMessage(evt.target.result, 'image');
            reader.readAsDataURL(file);
        }

        uploadBtn.addEventListener('click', () => imageUpload.click());
        imageUpload.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) sendImageFile(file);
            imageUpload.value = '';
        });

        avatarUpload.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (evt) => {
                    updateMyAvatar(evt.target.result);
                };
                reader.readAsDataURL(file);
            }
            avatarUpload.value = '';
        });

        clearChatBtn.addEventListener('click', () => clearCurrentThread());

        changeBgBtn.addEventListener('click', () => bgUpload.click());
        bgUpload.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) { setBackground(file); }
            bgUpload.value = '';
        });
        resetBgBtn.addEventListener('click', resetBackground);

        importDialogBtn.addEventListener('click', () => importUpload.click());
        importUpload.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                importDialog(file);
                aiSettingsModal.classList.remove('show');
            }
            importUpload.value = '';
        });

        exportDialogBtn.addEventListener('click', () => {
            downloadCurrentThread();
        });

        // 导出单个角色聊天记录按钮事件
        exportCharacterChatBtn.addEventListener('click', () => {
            showCharacterSelectModal('export');
        });

        // 导入单个角色聊天记录文件选择事件
        importCharacterChatInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                // 获取目标角色 ID（如果有）
                const targetCharId = importCharacterChatInput.dataset.targetCharId || null;
                importCharacterChat(file, targetCharId);
                importCharacterChatInput.value = '';
                // 清除存储的目标角色 ID
                delete importCharacterChatInput.dataset.targetCharId;
            }
        });

        refreshContextBtn.addEventListener('click', renderContextEditList);

        openSettingsBtn.addEventListener('click', () => {
            aiSettingsModal.classList.add('show');
            testResultDiv.textContent = '';
            loadChatSettings();
            renderContextEditList();
        });
        closeSettingsBtn.addEventListener('click', () => aiSettingsModal.classList.remove('show'));
        aiSettingsModal.addEventListener('click', (e) => { if (e.target === aiSettingsModal) aiSettingsModal.classList.remove('show'); });

        // 声明弹窗事件监听
        openDisclaimerLink.addEventListener('click', (e) => {
            e.preventDefault();
            disclaimerModal.classList.add('show');
        });

        closeDisclaimerBtn.addEventListener('click', () => disclaimerModal.classList.remove('show'));
        backFromDisclaimerBtn.addEventListener('click', () => disclaimerModal.classList.remove('show'));
        disclaimerModal.addEventListener('click', (e) => {
            if (e.target === disclaimerModal) {
                disclaimerModal.classList.remove('show');
            }
        });

        // 关闭声明栏按钮事件
        const closeDisclaimerBarBtn = document.getElementById('close-disclaimer-bar-btn');
        const disclaimerBar = document.getElementById('disclaimer-bar');

        // 检查是否已经隐藏过声明栏
        const disclaimerHidden = localStorage.getItem('disclaimerHidden');
        if (disclaimerHidden === 'true') {
            disclaimerBar.style.display = 'none';
        }

        closeDisclaimerBarBtn.addEventListener('click', () => {
            disclaimerBar.style.display = 'none';
            localStorage.setItem('disclaimerHidden', 'true');
        });

        tabButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                tabButtons.forEach(b => b.classList.remove('active'));
                tabContents.forEach(c => c.classList.remove('active'));
                btn.classList.add('active');
                document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');

                testConnectionBtn.style.display = (btn.dataset.tab === 'api') ? 'flex' : 'none';

                if (btn.dataset.tab === 'chat') {
                    loadChatSettings();
                    renderContextEditList();
                } else if (btn.dataset.tab === 'knowledge') {
                    loadKnowledgeSettings();
                } else if (btn.dataset.tab === 'longterm-memory') {
                    renderMemoryProfileList();
                }
            });
        });

        function loadApiSettings() {
            const s = JSON.parse(localStorage.getItem('aiChatSettings'));
            if (s) {
                apiUrlInput.value = s.apiUrl||'';
                apiKeyInput.value = s.apiKey||'';
                modelNameInput.value = s.modelName||'';
            }

            const ltm = JSON.parse(localStorage.getItem('longTermMemorySettings')) || {};
            document.getElementById('ltm-api-url').value = ltm.apiUrl || '';
            document.getElementById('ltm-api-key').value = ltm.apiKey || '';
            document.getElementById('ltm-embedding-model').value = ltm.embeddingModel || 'text-embedding-3-small';
            document.getElementById('ltm-rerank-model').value = ltm.rerankModel || '';
            document.getElementById('enable-long-term-memory').checked = ltm.enabled !== undefined ? ltm.enabled : true;
        }

        function saveApiSettings() {
            const rawUrl = apiUrlInput.value.trim();
            const normalizedUrl = normalizeApiUrl(rawUrl);
            apiUrlInput.value = normalizedUrl;
            const s = {
                apiUrl: normalizedUrl,
                apiKey: apiKeyInput.value.trim(),
                modelName: modelNameInput.value.trim()
            };
            localStorage.setItem('aiChatSettings', JSON.stringify(s));


            const ltmRawUrl = document.getElementById('ltm-api-url').value.trim();
            const ltmSettings = {
                apiUrl: normalizeApiUrl(ltmRawUrl) || '',
                apiKey: document.getElementById('ltm-api-key').value.trim(),
                embeddingModel: document.getElementById('ltm-embedding-model').value.trim(),
                rerankModel: document.getElementById('ltm-rerank-model').value.trim(),
                enabled: document.getElementById('enable-long-term-memory').checked
            };
            localStorage.setItem('longTermMemorySettings', JSON.stringify(ltmSettings));

            return s;
        }


        function loadKnowledgeSettings() {
            const s = JSON.parse(localStorage.getItem('knowledgeSettings')) || {};
            kbApiUrlInput.value = s.apiUrl || '';
            kbApiKeyInput.value = s.apiKey || '';
            kbEmbeddingModelInput.value = s.embeddingModel || '';
            kbRerankModelInput.value = s.rerankModel || '';
            kbEnabledCheckbox.checked = s.enabled || false;
            renderKnowledgeFileList(s.files || []);
        }

        function loadAutoBackupSettings() {
            const enabled = localStorage.getItem('autoBackupEnabled') === 'true';
            autoBackupEnabledCheckbox.checked = enabled;
        }

        function saveAutoBackupSettings() {
            localStorage.setItem('autoBackupEnabled', autoBackupEnabledCheckbox.checked.toString());
        }

        // 自动备份：在页面关闭或刷新前自动导出（半小时内只备份一次）
        window.addEventListener('beforeunload', (e) => {
            const enabled = localStorage.getItem('autoBackupEnabled') === 'true';
            if (enabled) {
                const lastBackupTime = localStorage.getItem('lastAutoBackupTime');
                const now = Date.now();
                const halfHourMs = 30 * 60 * 1000; // 30分钟毫秒数

                // 如果半小时内已备份过，则跳过
                if (lastBackupTime && (now - parseInt(lastBackupTime)) < halfHourMs) {
                    return;
                }

                // 执行备份并记录时间
                performFullDataExport(true);
                localStorage.setItem('lastAutoBackupTime', now.toString());
                // 注意：现代浏览器可能会阻止 beforeunload 中的异步操作
                // 但我们会尝试触发导出
            }
        });

        autoBackupEnabledCheckbox.addEventListener('change', saveAutoBackupSettings);

        function saveKnowledgeSettings() {
            const currentFiles = JSON.parse(localStorage.getItem('knowledgeSettings'))?.files || [];
            const s = {
                apiUrl: kbApiUrlInput.value.trim(),
                apiKey: kbApiKeyInput.value.trim(),
                embeddingModel: kbEmbeddingModelInput.value.trim(),
                rerankModel: kbRerankModelInput.value.trim(),
                enabled: kbEnabledCheckbox.checked,
                files: currentFiles
            };
            localStorage.setItem('knowledgeSettings', JSON.stringify(s));
            return s;
        }


        function saveMemorySettings() {
            const ltmRawUrl = document.getElementById('ltm-api-url').value.trim();
            const ltmSettings = {
                apiUrl: normalizeApiUrl(ltmRawUrl) || '',
                apiKey: document.getElementById('ltm-api-key').value.trim(),
                embeddingModel: document.getElementById('ltm-embedding-model').value.trim(),
                rerankModel: document.getElementById('ltm-rerank-model').value.trim(),
                enabled: document.getElementById('enable-long-term-memory').checked
            };
            localStorage.setItem('longTermMemorySettings', JSON.stringify(ltmSettings));
            return ltmSettings;
        }

        function renderKnowledgeFileList(files) {
            if (!files || files.length === 0) {
                kbFileListDiv.innerHTML = '<p style="color: #666; font-size: 0.9em; text-align: center;">暂无上传的文档</p>';
                return;
            }
            kbFileListDiv.innerHTML = files.map(f => `
                <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px; background: rgba(255,255,255,0.05); border-radius: 6px; margin-bottom: 6px;">
                    <div style="display: flex; align-items: center; gap: 8px; overflow: hidden;">
                        <i class="ri-file-text-line" style="color: #e6c78a;"></i>
                        <span style="font-size: 0.9em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(f.name)}</span>
                    </div>
                    <button class="btn btn-danger btn-sm" onclick="removeKnowledgeFile('${f.id}')" style="padding: 4px 8px; font-size: 0.8em;">
                        <i class="ri-delete-bin-line"></i>
                    </button>
                </div>
            `).join('');
        }

        window.removeKnowledgeFile = function(fileId) {
            const s = JSON.parse(localStorage.getItem('knowledgeSettings')) || {};
            s.files = (s.files || []).filter(f => f.id !== fileId);
            localStorage.setItem('knowledgeSettings', JSON.stringify(s));
            renderKnowledgeFileList(s.files);
        };

        apiUrlInput.addEventListener('blur', () => {
            const rawUrl = apiUrlInput.value.trim();
            if (rawUrl) { apiUrlInput.value = normalizeApiUrl(rawUrl); }
        });

        saveSettingsBtn.addEventListener('click', () => {

            saveApiSettings();
            const savedChatSettings = saveChatSettings();
            if (savedChatSettings.enableProactiveCare && 'Notification' in window) {
                if (Notification.permission === 'default') {
                    Notification.requestPermission().then(permission => {
                        if (permission === 'denied') showToast('通知权限已被拒绝，请在浏览器站点设置中手动开启。', 'ri-notification-off-line');
                    });
                } else if (Notification.permission === 'denied') {
                    showToast('通知权限已被浏览器拒绝，请在站点设置中手动开启后再使用主动关怀通知。', 'ri-notification-off-line');
                }
            }
            applyFeatureToggles();
            saveKnowledgeSettings();
            saveMemorySettings();

            aiSettingsModal.classList.remove('show');
        });

        resetSettingsBtn.addEventListener('click', () => {
            const activeTab = document.querySelector('.tab-button.active').dataset.tab;
            if (activeTab === 'api') {
                apiUrlInput.value = ''; apiKeyInput.value = ''; modelNameInput.value = '';
                localStorage.removeItem('aiChatSettings');
                testResultDiv.textContent = '';
            } else if (activeTab === 'appearance') {
                if(confirm("确定要恢复默认背景吗？")) { resetBackground(); }
                currentBubbleStyle = 'default';
                currentBubbleImage = null;
                currentBubbleTextStyle = {
                    color: '#ffffff',
                    fontSize: 14,
                    strokeColor: '#000000',
                    strokeWidth: 1,
                    enableStroke: true
                };
                updateBubbleStyleUI();
                applyBubbleBackground();
                updateBubbleTextInputs();
                applyBubbleTextStyleToAll();
            } else if (activeTab === 'chat') {
                maxContextRoundsInput.value = 0;
                maxTokensInput.value = 1024;
                enableLongTermMemoryCheckbox.checked = true;
                enableProactiveCareCheckbox.checked = false;
                messageDebounceInput.value = 30;
                enableLazyModeCheckbox.checked = false;
                showRegenerateBtnCheckbox.checked = true;
                enableRealTimeCheckbox.checked = false;
                enableStreamingInputCheckbox.checked = true;
                enableMessageSegmentationCheckbox.checked = false;
                bubbleWidthSlider.value = 85;
                bubbleWidthPercentInput.value = 85;
                charsPerLineInput.value = 32;
            }
        });

        testConnectionBtn.addEventListener('click', async () => {
            const rawUrl = apiUrlInput.value.trim();
            const url = normalizeApiUrl(rawUrl);
            const key = apiKeyInput.value.trim();
            const model = modelNameInput.value.trim();

            if (!url || !key || !model) {
                testResultDiv.textContent = '❌ 请填写对话模型配置';
                testResultDiv.className = 'test-result error';
                return;
            }

            testResultDiv.innerHTML = '<span class="loading-spinner"></span>🔄 测试对话模型中...';
            testResultDiv.className = 'test-result info';
            testConnectionBtn.disabled = true;

            try {
                const res = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
                    body: JSON.stringify({ model: model, messages: [{role:"user", content:"Hi"}], max_tokens: 5 })
                });

                if (res.ok) {
                    testResultDiv.textContent = '✅ 对话模型连接成功！';
                    testResultDiv.className = 'test-result success';
                } else {
                    const err = await res.json();
                    throw new Error(err.error?.message || `HTTP ${res.status}`);
                }
            } catch (err) {
                testResultDiv.textContent = `❌ 对话模型失败：${err.message}`;
                testResultDiv.className = 'test-result error';
            }

            testConnectionBtn.disabled = false;
        });

        // 获取模型列表功能
        fetchModelsBtn.addEventListener('click', async () => {
            const rawUrl = apiUrlInput.value.trim();
            const url = normalizeApiUrl(rawUrl);
            const key = apiKeyInput.value.trim();

            if (!url || !key) {
                testResultDiv.textContent = '❌ 请先填写 API 地址和 API Key';
                testResultDiv.className = 'test-result error';
                return;
            }

            fetchModelsBtn.disabled = true;
            fetchModelsBtn.innerHTML = '<span class="loading-spinner"></span> 获取中...';

            try {
                // 构建模型列表 API 地址（去掉 /chat/completions 后缀）
                let modelsUrl = url.replace(/\/chat\/completions\/?$/, '');
                if (!modelsUrl.endsWith('/models')) {
                    modelsUrl = modelsUrl + '/models';
                }

                const res = await fetch(modelsUrl, {
                    method: 'GET',
                    headers: { 'Authorization': `Bearer ${key}` }
                });

                if (res.ok) {
                    const data = await res.json();
                    const models = data.data || [];

                    if (models.length === 0) {
                        testResultDiv.textContent = '⚠️ 未找到可用模型';
                        testResultDiv.className = 'test-result warning';
                    } else {
                        // 填充下拉选择框
                        modelSelect.innerHTML = '<option value="">-- 请选择模型 --</option>';
                        models.forEach(model => {
                            const option = document.createElement('option');
                            option.value = model.id;
                            option.textContent = model.id;
                            modelSelect.appendChild(option);
                        });

                        // 显示下拉框
                        modelSelect.style.display = 'block';

                        testResultDiv.textContent = `✅ 成功获取 ${models.length} 个模型`;
                        testResultDiv.className = 'test-result success';
                    }
                } else {
                    const err = await res.json().catch(() => ({}));
                    throw new Error(err.error?.message || `HTTP ${res.status}`);
                }
            } catch (err) {
                testResultDiv.textContent = `❌ 获取模型失败：${err.message}`;
                testResultDiv.className = 'test-result error';
            }

            fetchModelsBtn.disabled = false;
            fetchModelsBtn.innerHTML = '<i class="ri-apps-line"></i> 获取模型';
        });

        // 模型选择框变化时，同步到输入框
        modelSelect.addEventListener('change', () => {
            if (modelSelect.value) {
                modelNameInput.value = modelSelect.value;
            }
        });


        testMemoryBtn.addEventListener('click', async () => {
            const ltmRawUrl = document.getElementById('ltm-api-url').value.trim();
            const ltmKey = document.getElementById('ltm-api-key').value.trim();
            const ltmEmbeddingModel = document.getElementById('ltm-embedding-model').value.trim();


            const mainSettings = JSON.parse(localStorage.getItem('aiChatSettings')) || {};
            const mainUrl = normalizeApiUrl(mainSettings.apiUrl || '');
            const mainKey = mainSettings.apiKey || '';

            if (!ltmEmbeddingModel) {
                testMemoryResultDiv.textContent = '❌ 请填写嵌入模型名称';
                testMemoryResultDiv.className = 'test-result error';
                return;
            }

            testMemoryResultDiv.innerHTML = '<span class="loading-spinner"></span>🔄 测试长期记忆模型中...';
            testMemoryResultDiv.className = 'test-result info';
            testMemoryBtn.disabled = true;

            try {
                const ltmUrl = ltmRawUrl ? normalizeApiUrl(ltmRawUrl) : mainUrl;
                const ltmApiKey = ltmKey || mainKey;

                if (!ltmUrl || !ltmApiKey) {
                    throw new Error('缺少 API 地址或 API Key，请在 AI 配置或长期记忆配置中填写');
                }

                const embedUrl = ltmUrl.replace('/chat/completions', '/embeddings').replace(/\/v\d+$/, '/v1/embeddings');
                const embedRes = await fetch(embedUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${ltmApiKey}` },
                    body: JSON.stringify({ model: ltmEmbeddingModel, input: "测试长期记忆连接" })
                });

                if (embedRes.ok) {
                    testMemoryResultDiv.textContent = '✅ 长期记忆模型连接成功！';
                    testMemoryResultDiv.className = 'test-result success';
                } else {
                    const err = await embedRes.json();
                    throw new Error(err.error?.message || `HTTP ${embedRes.status}`);
                }
            } catch (err) {
                testMemoryResultDiv.textContent = `❌ 长期记忆模型失败：${err.message}`;
                testMemoryResultDiv.className = 'test-result error';
            } finally {
                testMemoryBtn.disabled = false;
            }
        });


        const SENSITIVE_EXPORT_KEYS = ['apiKey', 'key', 'token', 'password', 'secret'];

        function isSensitiveSettingsKey(key) {
            return SENSITIVE_EXPORT_KEYS.some(sensitiveKey => key.toLowerCase().includes(sensitiveKey));
        }

        function redactSensitiveValue(key, value) {
            if (isSensitiveSettingsKey(key)) {
                return undefined;
            }
            return value;
        }

        function redactSensitiveDataForExport(value) {
            if (Array.isArray(value)) {
                return value.map(item => redactSensitiveDataForExport(item));
            }
            if (value && typeof value === 'object') {
                return Object.fromEntries(
                    Object.entries(value).map(([key, item]) => [key, redactSensitiveValue(key, redactSensitiveDataForExport(item))])
                );
            }
            return value;
        }

        function readExportableSettings(storageKey, fallback = {}) {
            try {
                return redactSensitiveDataForExport(JSON.parse(localStorage.getItem(storageKey)) || fallback);
            } catch (error) {
                console.warn(`读取 ${storageKey} 失败，已使用空配置导出`, error);
                return fallback;
            }
        }

        function mergeImportedSettings(storageKey, importedSettings) {
            const currentSettings = JSON.parse(localStorage.getItem(storageKey)) || {};
            const mergedSettings = { ...currentSettings, ...(importedSettings || {}) };

            Object.keys(currentSettings).forEach((key) => {
                if (isSensitiveSettingsKey(key) && (!importedSettings || importedSettings[key] === undefined || importedSettings[key] === '')) {
                    mergedSettings[key] = currentSettings[key];
                }
            });

            localStorage.setItem(storageKey, JSON.stringify(mergedSettings));
        }

        exportConfigBtn.addEventListener('click', () => {
            const config = {
                version: '1.0',
                exportDate: new Date().toISOString(),
                securityNote: 'API 密钥及其他敏感凭据已从导出文件中省略。',
                aiChatSettings: readExportableSettings('aiChatSettings'),
                longTermMemorySettings: readExportableSettings('longTermMemorySettings'),
                knowledgeSettings: readExportableSettings('knowledgeSettings'),
                chatSettings: readExportableSettings('chatSettings'),
                friendSettings: readExportableSettings('friendSettings'),
                customFriendsData: JSON.parse(localStorage.getItem('customFriendsData')) || '{}',
                myUserName: localStorage.getItem('myUserName') || '',
                isMobileView: localStorage.getItem('isMobileView') || 'false'
            };

            const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `MySW_配置备份_${new Date().toLocaleDateString().replace(/\//g, '-')}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            showToast('配置已导出', 'ri-download-line');
        });


        exportFullDataBtn.addEventListener('click', () => {
            performFullDataExport();
        });


        function isDataUrl(value) {
            return typeof value === 'string' && value.startsWith('data:');
        }

        function getApproxDataUrlBytes(value) {
            if (!isDataUrl(value)) return 0;
            const payload = value.split(',')[1] || '';
            return Math.floor(payload.length * 0.75);
        }

        function getFullExportDataUrlStats() {
            let count = 0;
            let bytes = 0;
            const scan = (value) => {
                if (!value) return;
                if (isDataUrl(value)) {
                    count += 1;
                    bytes += getApproxDataUrlBytes(value);
                    return;
                }
                if (Array.isArray(value)) {
                    value.forEach(scan);
                    return;
                }
                if (typeof value === 'object') {
                    Object.values(value).forEach(scan);
                }
            };
            scan(inputAvatar?.src || '');
            scan(threadManager);
            scan(JSON.parse(localStorage.getItem('customFriendsData')) || {});
            return { count, bytes };
        }

        function sanitizeDataUrlsForFullExport(value, excludeEmbeddedMedia) {
            if (!excludeEmbeddedMedia) return value;
            if (isDataUrl(value)) return '[已在导出时排除 DataURL 媒体]';
            if (Array.isArray(value)) return value.map(item => sanitizeDataUrlsForFullExport(item, excludeEmbeddedMedia));
            if (value && typeof value === 'object') {
                return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, sanitizeDataUrlsForFullExport(item, excludeEmbeddedMedia)]));
            }
            return value;
        }

        function sanitizeMessageForFullExport(msg, excludeEmbeddedMedia) {
            if (!excludeEmbeddedMedia) return msg;
            if (msg.type === 'image' && isDataUrl(msg.content)) {
                return {
                    ...msg,
                    content: '[图片 DataURL 已在导出时排除]',
                    excludedFromExport: true
                };
            }
            return sanitizeDataUrlsForFullExport(msg, excludeEmbeddedMedia);
        }

        function performFullDataExport(silent = false) {

            const dataUrlStats = getFullExportDataUrlStats();
            let excludeEmbeddedMedia = !silent && dataUrlStats.count > 0 &&
                !confirm(`检测到 ${dataUrlStats.count} 个内嵌图片/头像，约 ${(dataUrlStats.bytes / 1024 / 1024).toFixed(1)} MB。\n\n选择“确定”继续导出完整数据；选择“取消”将排除 DataURL 图片以减小文件体积。`);

            if (!excludeEmbeddedMedia && dataUrlStats.bytes > 25 * 1024 * 1024) {
                const proceed = confirm(`完整导出包含约 ${(dataUrlStats.bytes / 1024 / 1024).toFixed(1)} MB 的内嵌媒体，可能导致浏览器卡顿或下载失败。\n\n选择“确定”继续；选择“取消”改为排除内嵌媒体导出。`);
                if (!proceed) {
                    excludeEmbeddedMedia = true;
                    showToast('已改为排除内嵌媒体导出，避免文件过大', 'ri-information-line');
                }
            }

            let userAvatarData = null;
            const userAvatarImg = inputAvatar;
            if (userAvatarImg && userAvatarImg.src && userAvatarImg.src.startsWith('http')) {
                userAvatarData = userAvatarImg.src;
            } else if (!excludeEmbeddedMedia && userAvatarImg && userAvatarImg.src && userAvatarImg.src.startsWith('data:image')) {
                userAvatarData = userAvatarImg.src;
            }


            const allChatRecords = {};
            Object.keys(threadManager).forEach(friendId => {
                const friendData = threadManager[friendId];
                allChatRecords[friendId] = {
                    threads: friendData.threads.map(thread => ({
                        id: thread.id,
                        name: thread.name,
                        messages: thread.messages.map(msg => sanitizeMessageForFullExport(msg, excludeEmbeddedMedia))
                    })),
                    currentThreadId: friendData.currentThreadId,
                    longTermMemory: friendData.longTermMemory || []
                };
            });

            const fullData = {
                version: '2.0',
                exportType: 'full',
                exportDate: new Date().toISOString(),
                securityNote: excludeEmbeddedMedia ? 'API 密钥及其他敏感凭据已从导出文件中省略；本次导出已排除 DataURL 图片/头像以减小文件体积。' : 'API 密钥及其他敏感凭据已从导出文件中省略。',

                aiChatSettings: readExportableSettings('aiChatSettings'),
                longTermMemorySettings: readExportableSettings('longTermMemorySettings'),
                knowledgeSettings: readExportableSettings('knowledgeSettings'),
                chatSettings: readExportableSettings('chatSettings'),
                friendSettings: readExportableSettings('friendSettings'),
                customFriendsData: sanitizeDataUrlsForFullExport(JSON.parse(localStorage.getItem('customFriendsData')) || '{}', excludeEmbeddedMedia),
                groupManager: groupManager,
                myUserName: localStorage.getItem('myUserName') || '',
                isMobileView: localStorage.getItem('isMobileView') || 'false',

                userAvatar: userAvatarData,

                allChatRecords: allChatRecords,

                currentFriendId: currentFriendId,
                currentThreadId: threadManager[currentFriendId]?.currentThreadId || null
            };

            const blob = new Blob([JSON.stringify(fullData, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `MySW_自动备份_${new Date().toLocaleString().replace(/[/:]/g, '-').replace(/ /g, '_')}.json`;

            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            if (!silent) {
                showToast('完整数据已导出', 'ri-download-line');
            }
        }


        fullDataImportInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = (event) => {
                try {
                    const fullData = JSON.parse(event.target.result);

                    if (!fullData.version || fullData.exportType !== 'full') {
                        throw new Error('文件格式不正确，这不是一个完整数据备份文件。');
                    }


                    if (fullData.aiChatSettings) mergeImportedSettings('aiChatSettings', fullData.aiChatSettings);
                    if (fullData.longTermMemorySettings) mergeImportedSettings('longTermMemorySettings', fullData.longTermMemorySettings);
                    if (fullData.knowledgeSettings) mergeImportedSettings('knowledgeSettings', fullData.knowledgeSettings);
                    if (fullData.chatSettings) mergeImportedSettings('chatSettings', fullData.chatSettings);
                    if (fullData.groupManager) {
                        groupManager = fullData.groupManager;
                        saveGroupManager();
                        Object.values(groupManager).forEach(group => registerGroupFriend(group));
                    }
                    if (fullData.friendSettings) mergeImportedSettings('friendSettings', fullData.friendSettings);
                    if (fullData.customFriendsData) localStorage.setItem('customFriendsData', JSON.stringify(fullData.customFriendsData));
                    if (fullData.myUserName) localStorage.setItem('myUserName', fullData.myUserName);
                    if (fullData.isMobileView) localStorage.setItem('isMobileView', fullData.isMobileView);


                    if (fullData.userAvatar) {
                        const userAvatarImg = inputAvatar;
                        if (userAvatarImg) {
                            userAvatarImg.src = fullData.userAvatar;
                            localStorage.setItem('userAvatar', fullData.userAvatar);
                        }
                    }


                    if (fullData.allChatRecords) {
                        Object.keys(fullData.allChatRecords).forEach(friendId => {
                            if (!threadManager[friendId]) {

                                console.log(`跳过不存在的好友：${friendId}`);
                                return;
                            }
                            const friendRecord = fullData.allChatRecords[friendId];

                            threadManager[friendId].threads = friendRecord.threads.map(t => ({
                                id: t.id,
                                name: t.name,
                                messages: t.messages || []
                            }));

                            if (friendRecord.currentThreadId) {
                                threadManager[friendId].currentThreadId = friendRecord.currentThreadId;
                            }

                            if (friendRecord.longTermMemory) {
                                threadManager[friendId].longTermMemory = friendRecord.longTermMemory;
                            }
                        });
                        saveThreadsToLocalStorage();
                    }



                    if (fullData.currentFriendId && friendsData[fullData.currentFriendId]) {
                        switchFriend(fullData.currentFriendId);
                    }

                    const itemCount = Object.keys(fullData).length - 2;
                    showToast(`完整数据已导入，共 ${itemCount} 项`, 'ri-upload-line');


                    if (confirm('完整数据已导入成功！是否立即刷新页面以应用所有更改？')) {
                        location.reload();
                    }
                } catch (error) {
                    showToast(`导入失败：${error.message}`, "ri-error-warning-line");
                    console.error('导入错误:', error);
                }
            };
            reader.readAsText(file);
            e.target.value = '';
        });


        configImportInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = (event) => {
                try {
                    const config = JSON.parse(event.target.result);

                    if (!config.version) {
                        throw new Error('文件格式不正确，无法导入。');
                    }

                    if (config.aiChatSettings) mergeImportedSettings('aiChatSettings', config.aiChatSettings);
                    if (config.longTermMemorySettings) mergeImportedSettings('longTermMemorySettings', config.longTermMemorySettings);
                    if (config.knowledgeSettings) mergeImportedSettings('knowledgeSettings', config.knowledgeSettings);
                    if (config.chatSettings) mergeImportedSettings('chatSettings', config.chatSettings);
                    if (config.friendSettings) mergeImportedSettings('friendSettings', config.friendSettings);
                    if (config.customFriendsData) localStorage.setItem('customFriendsData', JSON.stringify(config.customFriendsData));
                    if (config.myUserName) localStorage.setItem('myUserName', config.myUserName);
                    if (config.isMobileView) localStorage.setItem('isMobileView', config.isMobileView);

                    showToast(`配置已导入，共 ${Object.keys(config).length - 2} 项`, 'ri-upload-line');


                    if (confirm('配置已导入成功！是否立即刷新页面以应用新配置？')) {
                        location.reload();
                    }
                } catch (error) {
                    showToast(`导入失败：${error.message}`, "ri-error-warning-line");
                    console.error('导入错误:', error);
                }
            };
            reader.readAsText(file);
            e.target.value = '';
        });


        document.addEventListener('keydown', (e) => {

            if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
                e.preventDefault();
                aiSettingsModal.classList.add('show');
            }

            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && messageInput === document.activeElement) {
                e.preventDefault();
                sendBtn.click();
            }

            if (e.key === 'Escape') {
                document.querySelectorAll('.modal-overlay.show').forEach(modal => {
                    modal.classList.remove('show');
                });
            }
        });

        addFriendBtn.addEventListener('click', () => {
            addFriendModal.classList.add('show');
            renderFriendOptions();
        });
        closeAddFriendBtn.addEventListener('click', () => addFriendModal.classList.remove('show'));


        closeFriendGroupModal.addEventListener('click', () => toggleFriendGroupModal(false));
        friendGroupCancelBtn.addEventListener('click', () => toggleFriendGroupModal(false));
        addFriendModal.addEventListener('click', (e) => { if (e.target === addFriendModal) addFriendModal.classList.remove('show'); });


        init();
