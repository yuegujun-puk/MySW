事先声明：
禁止将本项目的内置角色的提示词和内置角色的角色卡拿来买卖交易
若需使用还望标明出处
如果拿来做什么项目里内置个AI角色，那若你的项目有赞助之类的要钱的链接
你全家飞升去吧你
并且，如果让我看到两次您的项目里的一些功能用了我们的提示词还不标出处
我就让仓库所有者改可见性或删库直接跑路
(*^▽^*)

如果你拿去做有赞助链接（或者你的项目有交流群，群里有赞助链接），然后提示词出处也不标
你祖宗十八代都给我一起起飞吧！

My SW - AI 角色聊天

应仓库所有者要求，提前声明，本README由AI生成。

一个沉浸式的 AI 角色扮演聊天应用，专为《崩坏：星穹铁道》等游戏的玩家和二次创作爱好者打造。

https://img.shields.io/badge/PWA-Enabled-5A0FC8?style=flat&logo=pwa
https://img.shields.io/badge/License-MIT-yellow.svg

项目简介

My SW 是一个纯前端的 AI 聊天应用，让你可以与各种动漫/游戏角色进行沉浸式的对话。内置了数十个《崩坏：星穹铁道》《绝区零》《崩坏 3》《凹凸世界》《十日终焉》等作品的预设角色，并支持无限自定义角色。

无论你是想和银狼切磋骇客技术，和白厄探讨救世之路，还是和流萤分享星空下的秘密——My SW 都能带你进入一个生动的角色扮演世界。

核心功能

智能对话

· AI 驱动：基于 OpenAI 兼容 API 实现，支持流式输出（逐字显示）
· 上下文感知：可配置上下文轮数，支持长期记忆和知识库检索
· 多模态支持：可上传图片让 AI 识别并回应（需视觉模型支持）
· 快捷回复：AI 回复后自动生成建议回复选项（懒人模式）

角色管理

· 内置角色库：包含 30+ 预设角色（银狼、流萤、白厄、昔涟、姬子、波提欧、爱莉希雅、凯文等）
· 自定义角色：自由创建角色，设定头像、提示词、开场白
· 角色导入/导出：支持 JSON / ZIP 批量导入（兼容酒馆角色卡 V2/V3 格式）
· 头像自定义：为任意角色上传自定义头像

长期记忆

· 自动记忆提取：AI 自动从对话中提取关键信息（喜好、习惯、重要事件）
· 记忆管理：查看、编辑、删除、手动添加记忆条目
· 向量检索：基于嵌入模型（Embedding）实现语义级记忆召回
· CSV 导入/导出：便于备份和迁移记忆档案

知识库

· 文档上传：支持 TXT / PDF / DOCX / MD 等格式，自动分块、向量化
· 网页抓取：输入 URL 自动提取正文并加入知识库
· RAG 问答：单独向知识库提问，获取基于文档的精准回答

扩展能力

· 插件系统：支持第三方 JS 插件（例如悬浮小窗口、增强功能）
· 快捷键自定义：自由配置发送、聚焦、帮助等快捷键
· 多角色群聊：创建包含多个 AI 角色的群聊，模拟多角色互动（智能分配发言顺序）

界面与体验

· 深色/浅色主题，可自定义强调色
· 聊天气泡样式：多种风格（圆角、直角、椭圆），支持背景图片
· 文字样式定制：字体颜色、大小、描边
· 移动端适配：响应式设计，支持 PWA 安装（安卓/iOS）
· 聊天记录搜索：在当前对话内搜索关键词，高亮定位
· 对话导出：导出为 JSON、TXT、Markdown、HTML，支持打印为 PDF

数据与安全

· 无服务器：全部数据（聊天记录、记忆、知识库）存储在本地 IndexedDB
· 自动备份：页面关闭前自动导出完整数据（防丢失）
· 配置导入/导出：一键备份所有设置和角色数据
· 离线模式：网络中断时自动缓存消息，恢复后自动重试

快速开始

在线体验

访问 https://mysw-yg.pages.dev 立即开始聊天。

本地部署

```bash
# 克隆仓库
git clone https://github.com/yourusername/my-sw.git
cd my-sw

# 直接用浏览器打开 index.html 或使用任意静态服务器
# 例如用 Python：
python -m http.server 8080
# 或使用 Node.js 的 serve：
npx serve
```

访问 http://localhost:8080 即可使用。

配置 AI 接口

1. 点击侧边栏的「系统设置」齿轮图标
2. 在「AI 配置」标签页填写：
   · API 调用地址：例如 https://api.openai.com 或你的代理地址
   · API Key：你的 API 密钥
   · 模型名称：例如 gpt-4o、gpt-3.5-turbo、deepseek-chat 等
3. 可选调整：温度、TopP、惩罚系数、超时秒数等
4. 点击「保存设置」即可开始对话

提示：支持任何 OpenAI 兼容接口（包括本地 Ollama 的 /v1 端点）。

使用指南

基本操作

· 发送消息：输入框输入文字，按 Enter（或自定义快捷键）发送
· 换行：Shift+Enter 换行
· 快速指令：输入 /help 查看所有命令（如 /new 新对话，/reset 清空等）
· 重新生成：鼠标悬停在 AI 回复上，点击「重新生成」按钮
· 引用回复：点击消息旁的「引用」按钮，自动插入引用格式

管理角色

· 添加角色：侧边栏「添加好友」-> 从列表选择或创建自定义角色
· 编辑角色：在「添加好友」中点击自定义角色的「导出」按钮，或直接点击角色进入编辑
· 删除角色：右键点击角色头像 -> 「删除好友」
· 批量操作：点击「批量编辑」后勾选多个自定义角色，可一键导出/删除

群聊功能

· 点击侧边栏「创建群聊」，选择至少 2 个 AI 角色
· 群聊中，AI 会根据用户消息和活跃度自动轮流发言
· 双击聊天头部可进入群管理面板，设置群名、管理员、禁言/移出成员等

记忆与知识库

· 长期记忆：在「系统设置 -> 长期记忆」中查看所有记忆条目，可手动增删改
· 知识库：上传文档或抓取网页后，AI 会在对话中自动调用相关知识（需开启知识库开关）

技术栈

· 前端：原生 HTML + CSS + JavaScript（ES6+）
· 存储：IndexedDB（主数据）、localStorage（配置）
· 库/工具：
  · marked - Markdown 渲染
  · DOMPurify - XSS 过滤
  · highlight.js - 代码高亮
  · RemixIcon - 图标库
  · KaTeX - LaTeX 渲染（可选）
  · Mermaid - 图表渲染（可选）
· PWA：Service Worker + manifest.json，支持离线缓存和安装

项目结构

```
my-sw/
├── index.html          # 主页面
├── manifest.json       # PWA 配置
├── sw.js               # Service Worker
├── style.css           # 全局样式
├── characters.js       # 内置角色数据（提示词、头像）
├── api.js              # API 调用封装
├── memory.js           # 记忆模块（工具函数）
├── memory-ui.js        # 记忆 UI 管理
├── knowledge.js        # 知识库（IndexedDB + 检索）
├── knowledge-ui.js     # 知识库 UI
├── chat.js             # 聊天核心逻辑
├── settings.js         # 设置管理
├── main.js             # 主入口
├── plugins.js          # 插件系统
├── optimizations.js    # 性能优化与功能补丁
├── performance-fix.js  # 性能修复（Token 限制、渲染优化）
├── advanced-features.js# 高级功能（分支管理、分析仪表盘等）
└── README.md           # 项目说明
```

开发与自定义

添加新预设角色

编辑 characters.js，参照已有角色格式添加新条目：

```javascript
const YOUR_CHAR_PROMPT = `# 角色名 · 简介...`;
// 然后在 defaultFriendsData 中添加
friendsData: {
  'your-char-id': {
    id: 'your-char-id',
    name: '角色名',
    avatar: '头像URL',
    systemPrompt: YOUR_CHAR_PROMPT,
    welcomeMessage: '开场白',
    isCustom: false
  }
}
```

插件开发

插件需暴露 MySWPlugins.register() 接口，示例：

```javascript
MySWPlugins.register({
  id: 'my-plugin',
  name: '我的插件',
  description: '功能描述',
  enabled: false,
  params: [ { key: 'param1', label: '参数名', type: 'text', value: '默认值' } ],
  activate(params) { /* 启动逻辑 */ },
  deactivate() { /* 清理逻辑 */ }
});
```

用户可通过设置界面的「插件」标签页导入 JS 文件。

构建与打包

本项目无需构建，直接部署静态文件即可。推荐使用 Cloudflare Pages、Vercel 或 Netlify 进行托管。

测试与调试

· 所有调试信息输出到浏览器控制台
· 使用 localStorage 和 IndexedDB 存储，可用 DevTools 的「Application」面板查看数据
· 若遇到 API 问题，检查「系统设置 -> AI 配置」中的连接测试按钮

贡献指南

欢迎任何形式的贡献！请遵循以下流程：

1. Fork 本仓库
2. 创建你的特性分支 (git checkout -b feature/AmazingFeature)
3. 提交更改 (git commit -m 'Add some AmazingFeature')
4. 推送到分支 (git push origin feature/AmazingFeature)
5. 开启一个 Pull Request

编码规范

· 使用 ESLint 或 Prettier（可选）
· 保持代码注释清晰
· 确保功能不破坏原有兼容性

免责声明

· 本网站为《崩坏：星穹铁道》《绝区零》《崩坏 3》《凹凸世界》《十日终焉》等游戏/动漫作品的非官方二次创作，与米哈游等版权方无任何关联。
· 所有角色设定、名称、形象等知识产权归其原版权方所有。
· AI 生成内容均为模拟互动，不代表官方剧情或立场，仅供娱乐。
· 如内容涉及侵权，请联系咱进行处理。

联系方式

· QQ 群：1085987962
· Bilibili：月蛊菌 （私信）

---

愿你的每一次对话，都是一场属于token的燃烧盛宴
