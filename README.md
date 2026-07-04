# My SWv114514

一个功能丰富的 Web 聊天应用，支持角色扮演、好友管理、自定义背景等功能。

## 📖 项目简介

My SWv114514 是一个单页面聊天应用，采用纯前端技术栈（HTML/CSS/JavaScript）构建。应用提供类似即时通讯软件的界面体验，支持多角色对话、好友分组、聊天记录管理等功能。

## ✨ 主要功能

### 聊天功能
- 💬 实时消息发送与接收
- 🎭 多角色扮演对话（内置多个崩坏：星穹铁道、绝区零等游戏角色）
- 📝 Markdown 消息渲染支持
- 🖼️ 图片上传与显示
- 😊 表情选择器
- 📋 剪贴板功能

### 社交功能
- 👥 好友管理系统
- 📁 好友分组功能
- 🏷️ 自定义显示名称
- 🎨 文本生成头像

### 界面特性
- 🌙 深色主题设计
- 📱 响应式布局（支持移动端）
- 🖼️ 自定义聊天背景
- 🎯 侧边栏导航
- 🔔 Toast 浮动提示

### 角色库
内置多个精心设计的角色 Prompt，包括：
- **崩坏：星穹铁道**：银狼、遐蝶、火花、飞霄、昔涟、真理医生、凯妮斯、白厄、流萤、波提欧等
- **绝区零**：叶瞬光、仪玄、爱芮、千夏等
- **其他**：南宫羽、安比、比利、流萤、罗宾等

## 🛠️ 技术栈

- **HTML5** - 页面结构
- **CSS3** - 样式设计（使用 CSS 变量定义设计系统）
- **JavaScript (ES6+)** - 交互逻辑
- **Marked.js** - Markdown 解析渲染
- **RemixIcon** - 图标库

## 🚀 快速开始

### 方式一：直接打开
直接在浏览器中打开 `index.html` 文件即可使用。

```bash
# 使用任意静态服务器
python -m http.server 8000
# 或使用 node
npx serve
```

然后在浏览器访问 `http://localhost:8000`

### 方式二：部署到静态托管
本项目可以部署到任何静态网站托管服务：
- GitHub Pages
- Vercel
- Netlify
- Cloudflare Pages

## 📁 项目结构

```
.
├── index.html          # 主页面（HTML、CSS 与应用交互逻辑）
├── characters.js       # 内置角色提示词、头像 URL 与默认角色数据
├── sw.js               # PWA Service Worker
├── manifest.json       # PWA 应用清单
├── .gitignore          # Git 忽略配置
└── README.md           # 项目说明文档
```

## ⚙️ 配置说明

### CSS 变量
项目在 `:root` 中定义了完整的设计系统变量：
- 颜色方案（背景色、文字色、强调色）
- 间距系统
- 圆角大小
- 过渡动画
- 字体设置

### 角色配置
内置角色配置集中维护在 `characters.js`，每个角色包含：
- Prompt 提示词（定义角色性格和对话风格）
- 头像 URL
- 默认显示名称
- 可选开场白

## 🎨 自定义

### 添加新角色
在 `characters.js` 中添加新的角色提示词、头像 URL，并把角色条目加入 `defaultFriendsData`：
```javascript
const NEW_CHARACTER_PROMPT = `# 角色描述...`;
const NEW_CHARACTER_AVATAR = "avatar_url";

const defaultFriendsData = {
  // ...
  new_character: {
    name: '新角色',
    avatar: NEW_CHARACTER_AVATAR,
    systemPrompt: NEW_CHARACTER_PROMPT,
    isCustom: false
  }
};
```

### 修改主题
调整 CSS 变量即可更改主题配色：
```css
:root {
    --bg-primary: #你的背景色;
    --accent-gold: #你的强调色;
}
```

## 📝 使用说明

1. **开始对话**：点击左侧边栏的角色头像开始对话
2. **发送消息**：在底部输入框输入消息，点击发送按钮或按 Enter 键
3. **切换视图**：使用顶部按钮切换聊天/列表视图
4. **系统设置**：点击右上角齿轮图标进行设置
5. **清空聊天**：点击垃圾桶图标清空当前聊天记录

## ⚠️ 注意事项

- 本应用为纯前端应用，聊天记录存储在本地
- 部分功能可能需要网络连接（如 CDN 资源、外部图片）
- 建议使用现代浏览器（Chrome、Firefox、Edge 等）

## 📄 License

本项目仅供学习交流使用。

## 🙏 致谢

- [Marked.js](https://marked.js.org/) - Markdown 解析库
- [RemixIcon](https://remixicon.com/) - 开源图标库
- miHoYo/HoYoverse - 游戏角色版权归属

---

**Enjoy chatting with your favorite characters!** 🎮✨
