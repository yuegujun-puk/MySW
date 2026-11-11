/* ============================================================
   mysw-pages.js —— 子页面共享脚本合并包
   供 forum.html（论坛）与 character.html（角色卡市场）加载，
   按两页原引用顺序合并：characters → api → endpoints →
   image-tools → english-mode。
   主站 index.html 不加载本文件（主站使用 mysw-core.js 合并包）。
 */


/* ====== characters.js ====== */
// 内置角色【索引】（懒加载版）
// ------------------------------------------------------------
// 旧版把 74 个内置角色的人设提示词与开场白（约 18 万字符）全部写在本文件里，
// 于是「打开网站」就等于把所有人的角色提示词一起读进内存 —— 用户没在用、
// 也不感兴趣的角色，其提示词同样被解析并驻留。
//
// 现在本文件只保留索引：id / 名字 / 头像（角色卡列表与市场要显示这些），
// 提示词与开场白拆到 character-packs/*.js，由 CharacterPacks 决定何时加载：
//   · 打开网站：一个分片都不加载，只加载索引；
//   · 进入某个角色的聊天、或在角色卡市场要点名某个角色：按需加载它所在的分片。
// 索引里的 systemPrompt 是空串 —— 取值一律走 CharacterPacks.getPrompt(id)。

window.__MY_SW_CHAR_PACKS = window.__MY_SW_CHAR_PACKS || {};

const DEFAULT_AVATAR_ASSISTANT = "https://bbs-static.miyoushe.com/avatar/avatar30092.png?x-oss-process=image/resize,s_200,l_16000/auto-orient,0/interlace,1/quality,q_70/format,webp";

function generateTextAvatarDataURL(text, hue) {
            const canvas = document.createElement('canvas');
            const size = 100;
            canvas.width = size;
            canvas.height = size;
            const ctx = canvas.getContext('2d');
            
            // 背景颜色（使用 HSL 转 RGB）
            const h = hue || 0;
            const s = 70;
            const l = 40;
            ctx.fillStyle = `hsl(${h}, ${s}%, ${l}%)`;
            ctx.fillRect(0, 0, size, size);
            
            // 文字
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 40px Arial, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            const displayText = (text || 'AI').substring(0, 2).toUpperCase();
            ctx.fillText(displayText, size / 2, size / 2 + 2);
            
            return canvas.toDataURL('image/png');
        }

const defaultFriendsData = {
    "march7th": {
        "id": "march7th",
        "name": "三月七",
        "avatar": "https://bbs-static.miyoushe.com/static/2023/04/28/91e02988836fa671c727a1343ff1e9ac_189840114181302351.png?x-oss-process=image/resize,s_150/quality,q_80/auto-orient,0/interlace,1/format,jpg",
        "systemPrompt": "",
        "welcomeMessage": "",
        "isCustom": false,
        "pack": "a"
    },
    "hanabi": {
        "id": "hanabi",
        "name": "花火",
        "avatar": "https://bbs-static.miyoushe.com/static/2023/12/14/faccb1ba00a6ccd4fdb4be005d745347_4633794792564581085.png?x-oss-process=image/resize,s_150/quality,q_80/auto-orient,0/interlace,1/format,jpg",
        "systemPrompt": "",
        "welcomeMessage": "",
        "isCustom": false,
        "pack": "a"
    },
    "hysilens": {
        "id": "hysilens",
        "name": "海瑟音",
        "avatar": "https://bbs-static.miyoushe.com/static/2025/06/17/9a1d4ed001deb3cec54362cecd3338fa_6719314607902687291.png?x-oss-process=image/resize,s_150/quality,q_80/auto-orient,0/interlace,1/format,jpg",
        "systemPrompt": "",
        "welcomeMessage": "",
        "isCustom": false,
        "pack": "a"
    },
    "anaxa": {
        "id": "anaxa",
        "name": "那刻夏",
        "avatar": "https://bbs-static.miyoushe.com/static/2025/02/12/c71121f6143231b645682c94160fc53e_8792903200249930240.png?x-oss-process=image/resize,s_150/quality,q_80/auto-orient,0/interlace,1/format,jpg",
        "systemPrompt": "",
        "welcomeMessage": "",
        "isCustom": false,
        "pack": null
    },
    "tribbie": {
        "id": "tribbie",
        "name": "缇宝",
        "avatar": "https://bbs-static.miyoushe.com/static/2024/12/28/d8e89a986482d8ce542a351ad15244bd_1354885486831540251.jpg?x-oss-process=image/resize,s_150/quality,q_80/auto-orient,0/interlace,1/format,jpg",
        "systemPrompt": "",
        "welcomeMessage": "",
        "isCustom": false,
        "pack": null
    },
    "aglaea": {
        "id": "aglaea",
        "name": "阿格莱雅",
        "avatar": "https://bbs-static.miyoushe.com/static/2024/11/20/382ec4298c0818e71e53ceb59cb5ea5d_8304309658704588394.png?x-oss-process=image/resize,s_150/quality,q_80/auto-orient,0/interlace,1/format,jpg",
        "systemPrompt": "",
        "welcomeMessage": "",
        "isCustom": false,
        "pack": "a"
    },
    "lycurgus": {
        "id": "lycurgus",
        "name": "来古士",
        "avatar": "https://upload-bbs.miyoushe.com/upload/2023/01/17/d72fbaf9008fa1f36524f90898d9cfbc_8887382496033527228.png",
        "systemPrompt": "",
        "welcomeMessage": "",
        "isCustom": false,
        "pack": "a"
    },
    "elysia": {
        "id": "elysia",
        "name": "爱莉希雅",
        "avatar": "https://upload-bbs.mihoyo.com/upload/2022/09/20/254352b8702fbdfe4b51919568b16f23_2308445851003216507.gif",
        "systemPrompt": "",
        "welcomeMessage": "",
        "isCustom": false,
        "pack": "a"
    },
    "kevin": {
        "id": "kevin",
        "name": "凯文",
        "avatar": "https://upload-bbs.mihoyo.com/upload/2022/03/31/aa413e7ca6f5effc097c3a90df2fe7fd_2538545284877492689.png?x-oss-process=image/resize,s_150/quality,q_80/auto-orient,0/interlace,1/format,jpg",
        "systemPrompt": "",
        "welcomeMessage": "",
        "isCustom": false,
        "pack": "a"
    },
    "su": {
        "id": "su",
        "name": "苏",
        "avatar": "https://upload-bbs.mihoyo.com/upload/2022/03/31/67806b9c2cf1f82510f3a71f039bc3fd_4067481900686373280.png?x-oss-process=image/resize,s_150/quality,q_80/auto-orient,0/interlace,1/format,jpg",
        "systemPrompt": "",
        "welcomeMessage": "",
        "isCustom": false,
        "pack": "a"
    },
    "fuHua": {
        "id": "fuHua",
        "name": "符华",
        "avatar": "https://upload-bbs.mihoyo.com/upload/2019/01/17/402d44da9bd27d81259d305eca7aae81.png?x-oss-process=image/resize,s_150/quality,q_80/auto-orient,0/interlace,1/format,jpg",
        "systemPrompt": "",
        "welcomeMessage": "",
        "isCustom": false,
        "pack": "a"
    },
    "pardofelis": {
        "id": "pardofelis",
        "name": "帕朵菲莉丝",
        "avatar": "https://upload-bbs.mihoyo.com/upload/2022/02/16/4b80adec37cac1460877efd26810585f_2355063672193162139.png?x-oss-process=image/resize,s_150/quality,q_80/auto-orient,0/interlace,1/format,jpg",
        "systemPrompt": "",
        "welcomeMessage": "",
        "isCustom": false,
        "pack": "a"
    },
    "danheng": {
        "id": "danheng",
        "name": "丹恒",
        "avatar": "https://upload-bbs.mihoyo.com/upload/2021/10/08/9162761e5c0e1e03736117aa35bf4ae2_7372905151491600969.png?x-oss-process=image/resize,s_150/quality,q_80/auto-orient,0/interlace,1/format,jpg",
        "systemPrompt": "",
        "welcomeMessage": "",
        "isCustom": false,
        "pack": "a"
    },
    "silverwolf": {
        "id": "silverwolf",
        "name": "银狼",
        "avatar": "https://upload-bbs.mihoyo.com/upload/2022/04/28/742c27d4ca77bebd3a919d5d08cb2104_8516494426669902155.png?x-oss-process=image/resize,s_150/quality,q_80/auto-orient,0/interlace,1/format,jpg",
        "systemPrompt": "",
        "welcomeMessage": "",
        "isCustom": false,
        "pack": "a"
    },
    "sparkle": {
        "id": "sparkle",
        "name": "火花",
        "avatar": "https://bbs-static.miyoushe.com/static/2026/01/02/4469b864ec52f4b544865bc13d60ffae_9109776785607953478.png?x-oss-process=image/resize,s_150/quality,q_80/auto-orient,0/interlace,1/format,jpg",
        "systemPrompt": "",
        "welcomeMessage": "",
        "isCustom": false,
        "pack": "a"
    },
    "castorice": {
        "id": "castorice",
        "name": "遐蝶",
        "avatar": "https://bbs-static.miyoushe.com/static/2025/02/11/3093565a7faf06ce66ddb09e2d13bb1e_8263892789895803835.jpg?x-oss-process=image/resize,s_150/quality,q_80/auto-orient,0/interlace,1/format,jpg",
        "systemPrompt": "",
        "welcomeMessage": "",
        "isCustom": false,
        "pack": "a"
    },
    "cerydra": {
        "id": "cerydra",
        "name": "刻律德菈",
        "avatar": "https://bbs-static.miyoushe.com/static/2025/06/18/0b9f6d113161233ac0c669efeedd3620_7972590292478276107.jpg?x-oss-process=image/resize,s_150/quality,q_80/auto-orient,0/interlace,1/format,jpg",
        "systemPrompt": "",
        "welcomeMessage": "",
        "isCustom": false,
        "pack": "a"
    },
    "herta": {
        "id": "herta",
        "name": "黑塔",
        "avatar": "https://upload-bbs.mihoyo.com/upload/2022/04/28/1301194b366134656e58bd383d31e556_3501177995526034109.png?x-oss-process=image/resize,s_150/quality,q_80/auto-orient,0/interlace,1/format,jpg",
        "systemPrompt": "",
        "welcomeMessage": "",
        "isCustom": false,
        "pack": "a"
    },
    "daHerta": {
        "id": "daHerta",
        "name": "大黑塔",
        "avatar": "https://bbs-static.miyoushe.com/static/2024/11/19/4c911726432d9d1ce77eeb11d61e2a70_5723256182414309776.png?x-oss-process=image/resize,s_150/quality,q_80/auto-orient,0/interlace,1/format,jpg",
        "systemPrompt": "",
        "welcomeMessage": "",
        "isCustom": false,
        "pack": "a"
    },
    "feixiao": {
        "id": "feixiao",
        "name": "飞霄",
        "avatar": "https://bbs-static.miyoushe.com/static/2024/07/16/b1bf31ceef7f0a655f1372cb4589f1c2_4769220825946424956.jpg?x-oss-process=image/resize,s_150/quality,q_80/auto-orient,0/interlace,1/format,jpg",
        "systemPrompt": "",
        "welcomeMessage": "",
        "isCustom": false,
        "pack": "a"
    },
    "shush": {
        "id": "shush",
        "name": "闭嘴",
        "avatar": "https://upload-bbs.miyoushe.com/upload/2024/12/14/430751990/2e5db8c4c0c8451e88554a40c1ccc7b0_4680498804481500715.jpg",
        "systemPrompt": "",
        "welcomeMessage": "",
        "isCustom": false,
        "pack": "a"
    },
    "cyrene": {
        "id": "cyrene",
        "name": "昔涟",
        "avatar": "https://bbs-static.miyoushe.com/static/2025/09/09/6aa9a6802a47bc96fceb3d00fc54d184_4927661115578845227.jpg?x-oss-process=image/resize,s_150/quality,q_80/auto-orient,0/interlace,1/format,jpg",
        "systemPrompt": "",
        "welcomeMessage": "",
        "isCustom": false,
        "pack": "a"
    },
    "evernight": {
        "id": "evernight",
        "name": "长夜月",
        "avatar": "https://bbs-static.miyoushe.com/static/2025/08/03/c12c2578a63d74ff8acc90766d06b98b_640098095528690683.png?x-oss-process=image/resize,s_150/quality,q_80/auto-orient,0/interlace,1/format,jpg",
        "systemPrompt": "",
        "welcomeMessage": "",
        "isCustom": false,
        "pack": "a"
    },
    "yeshunguang": {
        "id": "yeshunguang",
        "name": "叶瞬光",
        "avatar": "https://bbs-static.miyoushe.com/static/2025/11/19/945d9c2ea7be1c8c54e301e4bd2716d3_3250884061676671298.png?x-oss-process=image/resize,s_150/quality,q_80/auto-orient,0/interlace,1/format,jpg",
        "systemPrompt": "",
        "welcomeMessage": "",
        "isCustom": false,
        "pack": "a"
    },
    "yixuan": {
        "id": "yixuan",
        "name": "仪玄",
        "avatar": "https://bbs-static.miyoushe.com/static/2025/04/26/26baf0ec259f1a1e0750f6e2f03e6112_1809042095458340582.png?x-oss-process=image/resize,s_150/quality,q_80/auto-orient,0/interlace,1/format,jpg",
        "systemPrompt": "",
        "welcomeMessage": "",
        "isCustom": false,
        "pack": "a"
    },
    "truthdoctor": {
        "id": "truthdoctor",
        "name": "真理医生",
        "avatar": "https://bbs-static.miyoushe.com/static/2023/10/31/95005b22315684be31930cb1fe6f7940_3017173726061159040.png?x-oss-process=image/resize,s_150/quality,q_80/auto-orient,0/interlace,1/format,jpg",
        "systemPrompt": "",
        "welcomeMessage": "",
        "isCustom": false,
        "pack": "a"
    },
    "caenis": {
        "id": "caenis",
        "name": "凯妮斯",
        "avatar": "https://upload-bbs.miyoushe.com/upload/2025/10/24/362007356/839ecc0dcf927ebc1e17d845c646b2e9_2133253235576645886.jpg?x-oss-process=image//resize,s_600/quality,q_80/auto-orient,0/interlace,1/format,jpg",
        "systemPrompt": "",
        "welcomeMessage": "",
        "isCustom": false,
        "pack": "a"
    },
    "baier": {
        "id": "baier",
        "name": "白厄",
        "avatar": "https://bbs-static.miyoushe.com/static/2025/05/06/80074616e6d71cb6e43f383f6c92e765_7192620441749706166.jpg?x-oss-process=image/resize,s_150/quality,q_80/auto-orient,0/interlace,1/format,jpg",
        "systemPrompt": "",
        "welcomeMessage": "",
        "isCustom": false,
        "pack": "a"
    },
    "firefly": {
        "id": "firefly",
        "name": "流萤",
        "avatar": "https://bbs-static.miyoushe.com/static/2024/04/23/e7fd4051919ae271f7eb385b5a8e69c9_1491396741986020379.jpg?x-oss-process=image/resize,s_150/quality,q_80/auto-orient,0/interlace,1/format,jpg",
        "systemPrompt": "",
        "welcomeMessage": "",
        "isCustom": false,
        "pack": "a"
    },
    "boothee": {
        "id": "boothee",
        "name": "波提欧",
        "avatar": "https://bbs-static.miyoushe.com/static/2024/03/13/1ecc8350106bd9b31b647c170e9a100f_4798286182580834637.jpg?x-oss-process=image/resize,s_150/quality,q_80/auto-orient,0/interlace,1/format,jpg",
        "systemPrompt": "",
        "welcomeMessage": "",
        "isCustom": false,
        "pack": "a"
    },
    "aria": {
        "id": "aria",
        "name": "爱芮",
        "avatar": "https://bbs-static.miyoushe.com/static/2026/01/04/6e85bccb803e90654072183fe7965e60_6930762220773147257.png?x-oss-process=image/resize,s_150/quality,q_80/auto-orient,0/interlace,1/format,jpg",
        "systemPrompt": "",
        "welcomeMessage": "",
        "isCustom": false,
        "pack": "a"
    },
    "chinatsu": {
        "id": "chinatsu",
        "name": "千夏",
        "avatar": "https://bbs-static.miyoushe.com/static/2026/01/02/3ef6746b4de8c5da3348d68177420938_3102083326867659482.png?x-oss-process=image/resize,s_150/quality,q_80/auto-orient,0/interlace,1/format,jpg",
        "systemPrompt": "",
        "welcomeMessage": "",
        "isCustom": false,
        "pack": "a"
    },
    "nangongyu": {
        "id": "nangongyu",
        "name": "南宫羽",
        "avatar": "https://bbs-static.miyoushe.com/static/2026/02/12/fb167c66a2c941e65323338279e9a90d_186904849561956487.png?x-oss-process=image/resize,s_150/quality,q_80/auto-orient,0/interlace,1/format,jpg",
        "systemPrompt": "",
        "welcomeMessage": "",
        "isCustom": false,
        "pack": "a"
    },
    "anby": {
        "id": "anby",
        "name": "安比",
        "avatar": "https://bbs-static.miyoushe.com/static/2025/01/23/ee3020733d69e7368b12b2f0338ddc79_8036245573092771055.png?x-oss-process=image/resize,s_150/quality,q_80/auto-orient,0/interlace,1/format,jpg",
        "systemPrompt": "",
        "welcomeMessage": "",
        "isCustom": false,
        "pack": "a"
    },
    "billy": {
        "id": "billy",
        "name": "比利",
        "avatar": "https://upload-bbs.mihoyo.com/upload/2022/05/27/3a2c428aaccbda4c102edf1ec411759c_8251909318058701570.png?x-oss-process=image/resize,s_150/quality,q_80/auto-orient,0/interlace,1/format,jpg",
        "systemPrompt": "",
        "welcomeMessage": "",
        "isCustom": false,
        "pack": "a"
    },
    "remielle": {
        "id": "remielle",
        "name": "蕾米埃尔",
        "avatar": "https://bbs-static.miyoushe.com/static/2026/06/20/c48d9cfa80863bd0aa7960d48c6abba3_1364241989580166633.png?x-oss-process=image/resize,s_150/quality,q_80/auto-orient,0/interlace,1/format,jpg",
        "systemPrompt": "",
        "welcomeMessage": "",
        "isCustom": false,
        "pack": "a"
    },
    "liuyin": {
        "id": "liuyin",
        "name": "琉音",
        "avatar": "https://bbs-static.miyoushe.com/static/2025/10/11/8fdbf877681827bb7ebbf80485bfe4e1_3189655766346677674.png?x-oss-process=image/resize,s_150/quality,q_80/auto-orient,0/interlace,1/format,jpg",
        "systemPrompt": "",
        "welcomeMessage": "",
        "isCustom": false,
        "pack": "a"
    },
    "yaojiayin": {
        "id": "yaojiayin",
        "name": "耀嘉音",
        "avatar": "https://bbs-static.miyoushe.com/static/2024/12/16/9240943125e9ce07683427478c30c699_3310414641678326826.png?x-oss-process=image/resize,s_150/quality,q_80/auto-orient,0/interlace,1/format,jpg",
        "systemPrompt": "",
        "welcomeMessage": "",
        "isCustom": false,
        "pack": "a"
    },
    "ruanmei": {
        "id": "ruanmei",
        "name": "阮·梅",
        "avatar": "https://bbs-static.miyoushe.com/static/2023/10/31/da99a47112a79afdcdaa14e980cc7035_5881596400623256758.png?x-oss-process=image/resize,s_150/quality,q_80/auto-orient,0/interlace,1/format,jpg",
        "systemPrompt": "",
        "welcomeMessage": "",
        "isCustom": false,
        "pack": "a"
    },
    "ai-assistant": {
        "id": "ai-assistant",
        "name": "AI助手",
        "avatar": "https://bbs-static.miyoushe.com/avatar/avatar30092.png?x-oss-process=image/resize,s_200,l_16000/auto-orient,0/interlace,1/quality,q_70/format,webp",
        "systemPrompt": "",
        "welcomeMessage": "",
        "isCustom": false,
        "pack": "a"
    },
    "seed": {
        "id": "seed",
        "name": "席德",
        "avatar": "https://bbs-static.miyoushe.com/static/2025/07/25/bb7041da091296784c76a0b17a7f308f_8092672465752081557.png?x-oss-process=image/resize,s_150/quality,q_80/auto-orient,0/interlace,1/format,jpg",
        "systemPrompt": "",
        "welcomeMessage": "",
        "isCustom": false,
        "pack": "a"
    },
    "robin": {
        "id": "robin",
        "name": "知更鸟",
        "avatar": "https://bbs-static.miyoushe.com/static/2024/03/12/c7f9084292efde6e24c31c0e25313c00_4511399684389432188.jpg?x-oss-process=image/resize,s_150/quality,q_80/auto-orient,0/interlace,1/format,jpg",
        "systemPrompt": "",
        "welcomeMessage": "",
        "isCustom": false,
        "pack": "a"
    },
    "scott": {
        "id": "scott",
        "name": "斯科特",
        "avatar": "https://upload-bbs.miyoushe.com/upload/2026/02/13/276173441/ecab6dcb2c6ae13bd9518f7d45182919_7100478056777517782.jpg?x-oss-process=image//resize,s_600/quality,q_80/auto-orient,0/interlace,1/format,jpg",
        "systemPrompt": "",
        "welcomeMessage": "",
        "isCustom": false,
        "pack": "a"
    },
    "reca": {
        "id": "reca",
        "name": "芮克",
        "avatar": "https://bbs-static.miyoushe.com/static/2024/10/23/3f7214f044f43149b293372818824a5a_7944300686459240765.png",
        "systemPrompt": "",
        "welcomeMessage": "",
        "isCustom": false,
        "pack": "a"
    },
    "sunday": {
        "id": "sunday",
        "name": "星期日",
        "avatar": "https://bbs-static.miyoushe.com/static/2024/10/08/465ed773c03d7c1f524a63e68e45f89e_3970852235598722346.png?x-oss-process=image/resize,s_150/quality,q_80/auto-orient,0/interlace,1/format,jpg",
        "systemPrompt": "",
        "welcomeMessage": "",
        "isCustom": false,
        "pack": "a"
    },
    "pompom": {
        "id": "pompom",
        "name": "帕姆",
        "avatar": "https://bbs-static.miyoushe.com/static/2023/07/12/e0e5b4f3dfb65e8a7777e30f9c37a5bb_3147752964558714736.png",
        "systemPrompt": "",
        "welcomeMessage": "",
        "isCustom": false,
        "pack": "a"
    },
    "trashcan": {
        "id": "trashcan",
        "name": "王下一桶",
        "avatar": "https://bbs-static.miyoushe.com/static/2024/01/31/8ebe812dbd3b3d0a8d41d254eb0a9f48_519576380870141726.png",
        "systemPrompt": "",
        "welcomeMessage": "",
        "isCustom": false,
        "pack": "a"
    },
    "kiana": {
        "id": "kiana",
        "name": "琪亚娜",
        "avatar": "https://upload-bbs.mihoyo.com/upload/2022/12/05/82c010c6eeee6e9d850173c3a080383b_8727255105715461691.jpg?x-oss-process=image/resize,s_150/quality,q_80/auto-orient,0/interlace,1/format,jpg",
        "systemPrompt": "",
        "welcomeMessage": "",
        "isCustom": false,
        "pack": "a"
    },
    "luocha": {
        "id": "luocha",
        "name": "罗刹",
        "avatar": "https://upload-bbs.mihoyo.com/upload/2022/04/28/2430af5d060616c9818a9d10a26dd0db_8301666617339093385.png?x-oss-process=image/resize,s_150/quality,q_80/auto-orient,0/interlace,1/format,jpg",
        "systemPrompt": "",
        "welcomeMessage": "",
        "isCustom": false,
        "pack": "a"
    },
    "bangboo": {
        "id": "bangboo",
        "name": "邦布",
        "avatar": "https://bbs-static.miyoushe.com/static/2024/07/09/1c6aca9791b01ae92e8222e49dbb305a_2368293249338494192.png?x-oss-process=image/resize,s_150/quality,q_80/auto-orient,0/interlace,1/format,jpg",
        "systemPrompt": "",
        "welcomeMessage": "",
        "isCustom": false,
        "pack": "a"
    },
    "walter_joyce": {
        "id": "walter_joyce",
        "name": "瓦尔特·乔伊斯",
        "avatar": "https://upload-bbs.miyoushe.com/upload/2021/10/18/73106388/c966fa35705e5debeecd28573ef0f4fd_8267692769435704771.jpg?x-oss-process=image//resize,s_600/quality,q_80/auto-orient,0/interlace,1/format,jpg",
        "systemPrompt": "",
        "welcomeMessage": "",
        "isCustom": false,
        "pack": "a"
    },
    "otto": {
        "id": "otto",
        "name": "奥托",
        "avatar": "https://upload-bbs.mihoyo.com/upload/2022/01/18/a288e301f445310e919294ec7421cf6a_7416070275836105086.png?x-oss-process=image/resize,s_150/quality,q_80/auto-orient,0/interlace,1/format,jpg",
        "systemPrompt": "",
        "welcomeMessage": "",
        "isCustom": false,
        "pack": "a"
    },
    "bronya": {
        "id": "bronya",
        "name": "布洛妮娅",
        "avatar": "https://uploadstatic.mihoyo.com/bh3-wiki/2021/12/11/73514954/6076f5f8d9bcd47a88fd920689af530d_6333330137072471451.png",
        "systemPrompt": "",
        "welcomeMessage": "",
        "isCustom": false,
        "pack": "a"
    },
    "seele": {
        "id": "seele",
        "name": "希儿·芙乐艾",
        "avatar": "https://upload-bbs.mihoyo.com/upload/2019/06/03/be3a2dcfc104ba1a56cc809a8a12e893.jpeg?x-oss-process=image/resize,s_150/quality,q_80/auto-orient,0/interlace,1/format,jpg",
        "systemPrompt": "",
        "welcomeMessage": "",
        "isCustom": false,
        "pack": "a"
    },
    "vita": {
        "id": "vita",
        "name": "薇塔",
        "avatar": "https://act-upload.mihoyo.com/bh3-wiki/2024/09/10/4976467/354c6c9e417b3b328ce3ebb44d411b28_2287507642636518749.png",
        "systemPrompt": "",
        "welcomeMessage": "",
        "isCustom": false,
        "pack": "a"
    },
    "himeko3": {
        "id": "himeko3",
        "name": "姬子",
        "avatar": "https://bbs-static.miyoushe.com/static/2023/05/25/e487cdac89cd55baf4742d60f21fb097_896615363973805612.jpg?x-oss-process=image/resize,s_150/quality,q_80/auto-orient,0/interlace,1/format,jpg",
        "systemPrompt": "",
        "welcomeMessage": "",
        "isCustom": false,
        "pack": "a"
    },
    "himeko_sr": {
        "id": "himeko_sr",
        "name": "姬子 (星穹铁道)",
        "avatar": "https://upload-bbs.miyoushe.com/upload/2025/11/30/379206857/6d2dd31ed8a854a2eef2dc1b36157362_2858477186823077637.png?x-oss-process=image//resize,s_600/quality,q_80/auto-orient,0/interlace,1/format,png",
        "systemPrompt": "",
        "welcomeMessage": "",
        "isCustom": false,
        "pack": "a"
    },
    "welt_catgirl": {
        "id": "welt_catgirl",
        "name": "瓦尔特（猫娘版）",
        "avatar": "https://bbs-static.miyoushe.com/static/2023/04/17/caf252ce54be062a2290f1d22fd8ea77_1103087503823581314.png?x-oss-process=image/resize,s_150/quality,q_80/auto-orient,0/interlace,1/format,jpg",
        "systemPrompt": "",
        "welcomeMessage": "",
        "isCustom": false,
        "pack": "a"
    },
    "hyacine": {
        "id": "hyacine",
        "name": "风堇",
        "avatar": "https://bbs-static.miyoushe.com/static/2025/03/25/736745c58fc887f148190963b218e318_1433425412427416776.png?x-oss-process=image/resize,s_150/quality,q_80/auto-orient,0/interlace,1/format,jpg",
        "systemPrompt": "",
        "welcomeMessage": "",
        "isCustom": false,
        "pack": "a"
    },
    "clockie": {
        "id": "clockie",
        "name": "钟表小子",
        "avatar": "https://upload-bbs.miyoushe.com/upload/2024/05/12/72220812/6736a0aa426459a7cacad9512ef4c352_7267703791242361303.png?x-oss-process=image//resize,s_600/quality,q_80/auto-orient,0/interlace,1/format,png",
        "systemPrompt": "",
        "welcomeMessage": "",
        "isCustom": false,
        "pack": "a"
    },
    "promeia": {
        "id": "promeia",
        "name": "普罗米娅",
        "avatar": "https://upload-bbs.miyoushe.com/upload/2026/05/07/7617286/81abe3e472774a400494d1620fea531f_3370370149176026035.jpg?x-oss-process=image/resize,s_600/quality,q_80/auto-orient,0/interlace,1/format,jpg",
        "systemPrompt": "",
        "welcomeMessage": "",
        "isCustom": false,
        "pack": "a"
    },
    "xiaoran": {
        "id": "xiaoran",
        "name": "肖冉",
        "avatar": "https://upload-bbs.miyoushe.com/upload/2026/05/09/451509793/ccb24ef0dbffecb267b2001a9c4c42d6_8784443951687927152.png?x-oss-process=image//resize,s_600/quality,q_80/auto-orient,0/interlace,1/format,png",
        "systemPrompt": "",
        "welcomeMessage": "",
        "isCustom": false,
        "pack": "a"
    },
    "palos": {
        "id": "palos",
        "name": "帕洛斯",
        "avatar": "https://kkimgs.yisou.com/ims?kt=url&at=ori&key=aHR0cDovL3NhZmUtaW1nLnhoc2Nkbi5jb20vYncxLzM0YTdmMDJhLTkxOGMtNGYxYS1iYzRhLWZkZDM2MDcyN2Y3Nz9pbWFnZVZpZXcyLzIvdy8xMDgwL2Zvcm1hdC9qcGc=&sign=yx:Bm05XzNP69ZvnNZ3dblTjNmD9OQ=&tv=0_0",
        "systemPrompt": "",
        "welcomeMessage": "",
        "isCustom": false,
        "pack": "a"
    },
    "king": {
        "id": "king",
        "name": "金",
        "avatar": "https://kkimgs.yisou.com/ims?kt=url&at=smstruct&key=aHR0cHM6Ly9zbnMtaW1nLXFjLnhoc2Nkbi5jb20vMTA0MGcwMDgzMHFndWFrNjIwMjVnNW9mdmllNzhjOWs2bGgwN2o5bw==&sign=yx:I8ZqOHnxsO-EAOLlEQyhxEUioZc=&tv=400_400",
        "systemPrompt": "",
        "welcomeMessage": "",
        "isCustom": false,
        "pack": "a"
    },
    "leishi": {
        "id": "leishi",
        "name": "雷狮",
        "avatar": "https://kkimgs.yisou.com/ims?kt=url&at=ori&key=aHR0cHM6Ly9jLXNzbC5kdWl0YW5nLmNvbS91cGxvYWRzL2l0ZW0vMjAyMDA1LzI3LzIwMjAwNTI3MTIzMzE3X3RtbGptLnRodW1iLjEwMDBfMC5qcGVn&sign=yx:_mbtxp5XMbdzBFzSZnOP8V56cOA=&tv=0_0",
        "systemPrompt": "",
        "welcomeMessage": "",
        "isCustom": false,
        "pack": "a"
    },
    "blade": {
        "id": "blade",
        "name": "刃",
        "avatar": "https://upload-bbs.mihoyo.com/upload/2022/05/25/bddeb0c0e85053c9fea1c08eec74374d_5368738122818734623.png?x-oss-process=image/resize,s_150/quality,q_80/auto-orient,0/interlace,1/format,jpg",
        "systemPrompt": "",
        "welcomeMessage": "",
        "isCustom": false,
        "pack": "a"
    },
    "ashveil": {
        "id": "ashveil",
        "name": "不死途",
        "avatar": "https://bbs-static.miyoushe.com/static/2026/02/07/5d0d6e2a251eaea44d7fd95debad213b_4933439602578088837.png?x-oss-process=image/resize,s_150/quality,q_80/auto-orient,0/interlace,1/format,jpg",
        "systemPrompt": "",
        "welcomeMessage": "",
        "isCustom": false,
        "pack": "a"
    },
    "kafka": {
        "id": "kafka",
        "name": "卡芙卡",
        "avatar": "https://upload-bbs.mihoyo.com/upload/2022/04/28/dc4106543564d1a372b47f5a3cf15958_994599019851288826.png?x-oss-process=image/resize,s_150/quality,q_80/auto-orient,0/interlace,1/format,jpg",
        "systemPrompt": "",
        "welcomeMessage": "",
        "isCustom": false,
        "pack": "a"
    },
    "dottore": {
        "id": "dottore",
        "name": "多托雷",
        "avatar": "https://upload-bbs.mihoyo.com/upload/2022/07/14/5e466f887b0b9a0e6d588892b67f72c4_8442828991319917960.png?x-oss-process=image/resize,s_150/quality,q_80/auto-orient,0/interlace,1/format,jpg",
        "systemPrompt": "",
        "welcomeMessage": "",
        "isCustom": false,
        "pack": "a"
    },
    "monkey_sheriff": {
        "id": "monkey_sheriff",
        "name": "猴子警长",
        "avatar": "https://kkimgs.yisou.com/ims?f=webp&kt=url&at=smstruct&key=aHR0cHM6Ly9zbnMtaW1nLXFjLnhoc2Nkbi5jb20vMTA0MGcwMDgzMTE5c2xlc242YzAwNW8yanQ2cjA5MDQ2amw1ZGlnbw==&sign=yx:1QiGnZvkHpmDkXAFPasuvl0AqtQ=&tv=400_400",
        "systemPrompt": "",
        "welcomeMessage": "",
        "isCustom": false,
        "pack": "a"
    },
    "amis": {
        "id": "amis",
        "name": "爱弥斯",
        "avatar": "https://prod-alicdn-community.kurobbs.com/forum/d077267ec793494b93860ed45d64c3ff20260205.png",
        "systemPrompt": "",
        "welcomeMessage": "",
        "isCustom": false,
        "pack": "a"
    },
    "daniya": {
        "id": "daniya",
        "name": "达妮娅",
        "avatar": "https://prod-alicdn-community.kurobbs.com/forum/3526c1898a5a43e7b7b8057c0046f2af20260429.png",
        "systemPrompt": "",
        "welcomeMessage": "",
        "isCustom": false,
        "pack": "a"
    },
    "qingxiao": {
        "id": "qingxiao",
        "name": "清宵",
        "avatar": "https://prod-alicdn-community.kurobbs.com/forum/71f399d69dfb43d4938cb9d9e022951520260817.png",
        "systemPrompt": "",
        "welcomeMessage": "",
        "isCustom": false,
        "pack": "a"
    },
    "helentine": {
        "id": "helentine",
        "name": "海伦汀·安魂",
        "avatar": "https://prod-alicdn-community.kurobbs.com/forum/d98a43ed9c2d4fe0b6a9b720b0b5842720260625.png?x-oss-process=image/format,webp",
        "systemPrompt": "",
        "welcomeMessage": "",
        "isCustom": false,
        "pack": "a"
    }
};

// Expose values used by the main application script.
window.defaultFriendsData = defaultFriendsData;
window.DEFAULT_AVATAR_ASSISTANT = DEFAULT_AVATAR_ASSISTANT;

/**
 * CharacterPacks —— 内置角色提示词的按需加载器
 * 本模块只做三件事：
 * 1. 把某个角色所在的分片插进页面（同一分片全局只下载一次）；
 * 2. 取某个角色最终的提示词（含用户选择的「提示词版本」）；
 * 3. 供上层判断「这个角色的提示词到位了没有」。
 * 站点打开时一个分片都不加载：用户没进谁的聊天，就不读谁的设定。
 * 只有「进入某个角色的聊天」或「在角色卡市场点名某个角色」时才取它所在的那一片。
 */
(function () {
    'use strict';

    var DIR = 'character-packs/';
    var loading = {};        // 分片名 → Promise（防止并发重复插入）
    var ALL = ['a'];  // 内置角色分片清单；新增分片时同步这里

    function packStore() {
        window.__MY_SW_CHAR_PACKS = window.__MY_SW_CHAR_PACKS || {};
        return window.__MY_SW_CHAR_PACKS;
    }

    /** 内置角色索引里的条目（自定义角色不在索引里，返回 null） */
    function metaOf(friendId) {
        var meta = window.defaultFriendsData && window.defaultFriendsData[friendId];
        return meta && !meta.isCustom ? meta : null;
    }

    function packOf(friendId) {
        var meta = metaOf(friendId);
        if (meta) {
            if (meta.pack) return String(meta.pack);
            if (meta.packs && meta.packs.length) return String(meta.packs[0]);
            return ALL.length === 1 ? ALL[0] : null;
        }
        // 角色卡市场的「预设角色」不在内置索引里，由市场页登记 id → 分片。
        var map = window.__MY_SW_PRESET_PACK_OF;
        if (map && map[friendId]) return String(map[friendId]);
        return null;
    }

    /** 用户为某个内置角色选定的提示词版本（/提示词版本 指令写入） */
    function storedVersionOf(friendId) {
        try {
            var all = JSON.parse(localStorage.getItem('builtInPromptVersions') || '{}') || {};
            return String(all[friendId] || '');
        } catch (e) { return ''; }
    }

    function loadPack(name, cacheBust) {
        if (!name) return Promise.resolve(null);
        var store = packStore();
        if (store[name]) return Promise.resolve(store[name]);
        if (loading[name]) return loading[name];
        var promise = new Promise(function (resolve) {
            var el = document.createElement('script');
            // cacheBust：调用方（角色卡市场）传目录版本号时拼 ?v=N，
            // 避免分片更新后浏览器仍用缓存的旧文件（旧文件里没有新角色）。
            el.src = DIR + name + '.js' + (cacheBust ? '?v=' + cacheBust : '');
            el.async = true;
            el.dataset.charPack = name;
            el.onload = function () { loading[name] = null; resolve(store[name] || null); };
            el.onerror = function () {
                loading[name] = null;
                console.warn('[角色分片] 载入失败：' + el.src + '（该角色的提示词暂缺，其它角色不受影响）');
                resolve(null);
            };
            (document.head || document.documentElement).appendChild(el);
        });
        loading[name] = promise;
        return promise;
    }

    /** 确保某个角色的提示词已到位；已在内存里则立即返回 */
    function ensure(friendId) {
        var store = packStore();
        var name = packOf(friendId);
        if (!name) return Promise.resolve(null);
        if (store[name]) return Promise.resolve(store[name]);
        return loadPack(name);
    }

    /** 某个角色最终的提示词；未加载 / 不是内置角色时返回 '' */
    function getPrompt(friendId) {
        var store = packStore();
        var name = packOf(friendId);
        if (!name) return '';
        var active = store[name] && store[name][friendId];
        if (!active) {
            var meta = metaOf(friendId);
            return meta ? String(meta.systemPrompt || '') : '';
        }
        var versions = active.promptVersions;
        var want = storedVersionOf(friendId) || String(active.promptVersion || '');
        if (versions && want && versions[want]) return String(versions[want]);
        return String(active.systemPrompt || '');
    }

    /** 某个角色的开场白；未加载 / 不是内置角色时返回 '' */
    function getWelcome(friendId) {
        var store = packStore();
        var name = packOf(friendId);
        if (!name) return '';
        var active = store[name] && store[name][friendId];
        if (!active) {
            var meta = metaOf(friendId);
            return meta ? String(meta.welcomeMessage || '') : '';
        }
        return String(active.welcomeMessage || '');
    }

    function isPackLoaded(friendId) {
        var name = packOf(friendId);
        return Boolean(name && packStore()[name]);
    }

    window.CharacterPacks = {
        ensure: ensure,
        getPrompt: getPrompt,
        getWelcome: getWelcome,
        isPackLoaded: isPackLoaded,
        packOf: packOf,
        packNames: function () { return ALL.slice(); },
        loadPack: loadPack
    };
})();


/* ====== api.js ====== */
(function () {
    'use strict';

    function normalizeBaseUrl(apiUrl) {
        let url = (apiUrl || '').trim().replace(/\/+$/, '');
        if (url.endsWith('/v1')) url = url.slice(0, -3);
        return url;
    }

    function buildChatUrl(apiUrl, opts) {
        // 与 mysw-core.js 同款：地址按协议拼，Gemini 那种把模型写进路径的要靠 opts.model
        if (window.ApiProtocol && apiUrl) {
            return window.ApiProtocol.buildUrl(apiUrl, {
                protocol: opts && opts.protocol,
                model: opts && opts.model,
                stream: !!(opts && opts.stream)
            });
        }
        const baseUrl = normalizeBaseUrl(apiUrl);
        if (!baseUrl) return '';
        return baseUrl.endsWith('/v1/chat/completions') ? baseUrl : `${baseUrl}/v1/chat/completions`;
    }

    function buildEmbeddingsUrl(apiUrl) {
        const baseUrl = normalizeBaseUrl(apiUrl);
        if (!baseUrl) return '';
        return baseUrl.endsWith('/v1/embeddings') ? baseUrl : `${baseUrl}/v1/embeddings`;
    }

    function authHeaders(apiKey, protocol) {
        // Claude / Gemini 的认证头完全不同，交给适配层
        if (protocol && protocol !== 'openai' && window.ApiProtocol) {
            return window.ApiProtocol.buildHeaders(protocol, apiKey);
        }
        return {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        };
    }

    async function requestJson(url, options) {
        // 与 mysw-core.js 一致：用 options 里的 base/model 把地址按协议重建一次
        if (window.ApiProtocol && options && options._urlBase) {
            try {
                url = window.ApiProtocol.buildUrl(options._urlBase, {
                    protocol: options._protocol,
                    model: options._model,
                    stream: false
                });
            } catch (e) { }
        }
        const response = await fetch(url, options);
        if (!response.ok) {
            let message = `API Error: ${response.status}`;
            try {
                const errData = await response.json();
                message = errData.error?.message || message;
            } catch (e) {
                message = response.statusText || message;
            }
            throw new Error(message);
        }
        const data = await response.json();
        // 非 OpenAI 协议：翻译成 OpenAI 形状，让下面读 choices 的代码不用改
        const protocol = (options && options._protocol)
            || (window.ApiProtocol ? window.ApiProtocol.detect(url) : 'openai');
        if (window.ApiProtocol && protocol !== 'openai') {
            return window.ApiProtocol.normalizeResponse(protocol, data);
        }
        return data;
    }

    function getFiniteNumber(value, fallback) {
        const numericValue = Number(value);
        return Number.isFinite(numericValue) ? numericValue : fallback;
    }

    function getGenerationParameters(apiSettings = {}) {
        const params = {
            ...(apiSettings.temperature === undefined || apiSettings.temperature === null || apiSettings.temperature === '' ? {} : { temperature: getFiniteNumber(apiSettings.temperature, 0.85) }),
            top_p: getFiniteNumber(apiSettings.topP, 0.9),
            presence_penalty: getFiniteNumber(apiSettings.presencePenalty, 0.5),
            frequency_penalty: getFiniteNumber(apiSettings.frequencyPenalty, 0.3)
        };
        if (Array.isArray(apiSettings.stopSequences) && apiSettings.stopSequences.length > 0) {
            params.stop = apiSettings.stopSequences;
        }
        if (Number.isInteger(apiSettings.seed)) {
            params.seed = apiSettings.seed;
        }
        return params;
    }

    // 思考强度（设置 → 生成参数）：空串表示不干预，交给模型自己的默认值。
    const REASONING_EFFORTS = ['none', 'minimal', 'low', 'medium', 'high'];

    // 思考相关请求参数：设置里的「思考强度」优先于老开关 disableThinkingMode
    // （用户显式选了强度就该作数；没选时才退回旧开关，老行为不变）。
    function getThinkingOverrides(apiSettings = {}) {
        const effort = String(apiSettings.reasoningEffort || '').trim().toLowerCase();
        if (REASONING_EFFORTS.includes(effort)) {
            const out = { reasoning_effort: effort };
            if (effort === 'none') {
                out.enable_thinking = false;
                out.thinking = false;
            }
            return out;
        }
        let chatSettings = {};
        try { chatSettings = JSON.parse(localStorage.getItem('chatSettings') || '{}'); } catch (e) {}
        if (chatSettings.disableThinkingMode !== true) return {};
        return {
            enable_thinking: false,      // 通义官方 / DashScope
            thinking: false,             // 部分中转站
            reasoning_effort: 'none'     // 部分平台
        };
    }

    function createChatFetchOptions(apiSettings, messages, overrides = {}) {
        // 缓存优化（api-cache-optimizer.js）：启用时重排 messages（把动态内容挪出
        // system）并按平台注入可选缓存参数。未启用时返回 null —— 请求体与
        // 没有本模块时逐字节一致（向后兼容承诺，见 api-cache-optimizer.js 头注）。
        let cacheParams = null;
        try {
            if (window.CacheOptimizer && typeof window.CacheOptimizer.buildCacheParams === 'function') {
                cacheParams = window.CacheOptimizer.buildCacheParams(apiSettings, messages);
            }
        } catch (e) { /* 缓存优化出错绝不影响正常请求 */ }
        const finalMessages = cacheParams ? cacheParams.messages : messages;
        const cacheOverrides = cacheParams ? cacheParams.bodyOverrides : {};
        const protocol = (window.ApiProtocol && apiSettings)
            ? window.ApiProtocol.detect(apiSettings.apiUrl, apiSettings.apiProtocol)
            : 'openai';

        // 后台归档类请求带 _noReasoning 时不跟主对话的思考强度（标记本身不进请求体）
        const plainOverrides = { ...overrides };
        const skipReasoning = plainOverrides._noReasoning === true;
        delete plainOverrides._noReasoning;
        const thinkingOverrides = skipReasoning ? {} : getThinkingOverrides(apiSettings);

        // 非 OpenAI 协议：请求体交给适配层，并丢掉 OpenAI 专属的缓存参数
        if (protocol !== 'openai' && window.ApiProtocol) {
            // 思考强度一并交给适配层：Claude / Gemini 不认 reasoning_effort，
            // 由 api-protocol.js 换算成 thinking.budget_tokens / thinkingConfig。
            const reasoningBudget = Number(apiSettings.reasoningBudget);
            const compatOverrides = {
                ...thinkingOverrides,
                ...(!skipReasoning && Number.isFinite(reasoningBudget) && reasoningBudget > 0
                    ? { reasoning_budget: reasoningBudget }
                    : {}),
                ...plainOverrides
            };
            const compatBody = window.ApiProtocol.buildBody(apiSettings, finalMessages, compatOverrides, protocol);
            if (compatBody) {
                return {
                    method: 'POST',
                    headers: authHeaders(apiSettings.apiKey, protocol),
                    body: JSON.stringify(compatBody),
                    _usedStreamOptions: false,
                    _protocol: protocol,
                    _urlBase: apiSettings.apiUrl,
                    _model: apiSettings.modelName
                };
            }
        }

        const body = {
            model: apiSettings.modelName,
            messages: finalMessages,
            ...getGenerationParameters(apiSettings),
            ...thinkingOverrides,
            ...cacheOverrides,
            ...plainOverrides
        };
        // 流式时请求末尾附带 usage（OpenAI 协议标准字段）：没有它，中转站的
        // 流式回复拿不到 token/缓存数据，「缓存命中率」统计永远是空的。
        let usedStreamOptions = false;
        if (body.stream === true && body.stream_options === undefined) {
            body.stream_options = { include_usage: true };
            usedStreamOptions = true;
        }
        const bodyJson = JSON.stringify(body);
        return {
            method: 'POST',
            headers: authHeaders(apiSettings.apiKey, protocol),
            body: bodyJson,
            // 兜底标记：个别端点不认识 stream_options 返回 400 时，自动去掉重发一次
            _usedStreamOptions: usedStreamOptions,
            _protocol: protocol,
            _urlBase: apiSettings.apiUrl,
            _model: apiSettings.modelName
        };
    }

    function isRetryableError(error) {
        const message = String(error?.message || error || '').toLowerCase();
        if (error?.name === 'AbortError') return true;
        if (/\b(400|401|403|404)\b/.test(message)) return false;
        if (message.includes('api key') || message.includes('unauthorized') || message.includes('model') && message.includes('not found')) return false;
        return /\b(408|409|425|429|500|502|503|504)\b/.test(message) || message.includes('timeout') || message.includes('network') || message.includes('failed to fetch');
    }

    async function withAutoRetry(apiSettings, operation) {
        const maxRetries = Math.min(5, Math.max(0, parseInt(apiSettings?.maxAutoRetries, 10) || 0));
        let lastError;
        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            try {
                return await operation(attempt);
            } catch (error) {
                lastError = error;
                if (attempt >= maxRetries || !isRetryableError(error)) break;
                await new Promise(resolve => setTimeout(resolve, Math.min(4000, 500 * (2 ** attempt))));
            }
        }
        throw lastError;
    }

    // ==========================================================
    // 多站点 / 多模型 降级计划
    // ----------------------------------------------------------
    // 数据来自 EndpointStore（「设置 → AI 配置 → 多站点管理」）：
    //   · 默认只用「当前站点」，模型顺序 = 主模型 → 备用模型；
    //   · 开启「轮流请求」后，本站点所有模型都失败时，按列表顺序
    //     继续尝试其它站点（每个站点同样 主模型 → 备用模型）。
    // 开关来源：只有 EndpointStore.getEffectiveApiSettings() 产出的配置会带上
    //   allowFailover: true（主聊天 / 群聊 / 摘要 / 记忆提取等「用主配置」的调用）。
    // 论坛、3D 实验室这类自带地址与密钥的调用不带该标记，会退化为
    //   「只试自己这一条通道」，绝不会被误换成主配置的 Key。
    // 站点库为空（老用户 / 未配置）时，行为与旧版完全一致。
    // ==========================================================
    const MAX_TOTAL_ATTEMPTS = 12;

    function parseModelList(value) {
        if (Array.isArray(value)) return value.map(s => String(s).trim()).filter(Boolean);
        return String(value || '').split(/[\n,，;；]+/).map(s => s.trim()).filter(Boolean);
    }

    function buildAttemptPlan(apiSettings = {}) {
        const plans = [];
        const pushSite = (site, fromStore) => {
            const url = String(site.url || site.apiUrl || '').trim();
            if (!url) return;
            // Key：站点自己填了就用它自己的；只有「该站点就是当前主配置地址」时
            // 才回退到传入的 apiKey —— 避免把主站点的密钥顺手发给别的站。
            const isCurrentSite = !fromStore || buildChatUrl(url) === buildChatUrl(apiSettings.apiUrl);
            const siteKey = String(site.key ?? site.apiKey ?? '').trim();
            const key = siteKey || (isCurrentSite ? String(apiSettings.apiKey || '') : '');
            // 备用模型同理：站点自己配了用自己的；没配的只有主模型，
            // 绝不要把「另一个站点的模型名」发到本站（会 404 且浪费一次请求）。
            const ownBackups = (site.backupModels !== undefined || site.backupModel !== undefined)
                ? parseModelList(site.backupModels ?? site.backupModel)
                : (isCurrentSite ? parseModelList(apiSettings.backupModels) : []);
            const models = parseModelList([
                site.model || site.modelName || (isCurrentSite ? apiSettings.modelName : ''),
                ...ownBackups
            ].filter(Boolean).map(String));
            const uniq = [...new Set(models)];
            const targets = uniq.length ? uniq : [''];
            targets.forEach(model => {
                plans.push({
                    name: site.name || 'API 站点',
                    settings: { ...apiSettings, apiUrl: url, apiKey: key, modelName: model }
                });
            });
        };

        const store = window.EndpointStore;
        const customUrl = String(apiSettings.apiUrl || '').trim();
        let useStore = false;
        if (store && typeof store.getSitesForFailover === 'function' && customUrl && apiSettings.allowFailover === true) {
            const active = typeof store.getActive === 'function' ? store.getActive() : null;
            useStore = !!active && buildChatUrl(active.url) === buildChatUrl(customUrl);
        }

        if (useStore) {
            // singleSite：只在当前站点内换模型，绝不换站点
            // （记忆提取等自带模型名的后台调用用它，避免把别的站的模型名发到本站）
            if (apiSettings.singleSite === true) {
                const active = typeof store.getActive === 'function' ? store.getActive() : null;
                pushSite({
                    name: active?.name || '当前站点',
                    url: customUrl,
                    key: apiSettings.apiKey,
                    model: apiSettings.modelName,
                    backupModels: apiSettings.backupModels
                });
                return plans.slice(0, MAX_TOTAL_ATTEMPTS);
            }
            const sites = store.getSitesForFailover().filter(site => String(site.url || '').trim());
            if (sites.length) {
                sites.forEach(site => pushSite(site, true));
                return plans.slice(0, MAX_TOTAL_ATTEMPTS);
            }
        }
        // 单通道：只信传入的配置（论坛、3D 实验室、以及站点库为空时的主配置）
        pushSite({
            name: apiSettings.siteName || '当前配置',
            url: apiSettings.apiUrl,
            key: apiSettings.apiKey,
            model: apiSettings.modelName,
            backupModels: apiSettings.backupModels
        });
        return plans.slice(0, MAX_TOTAL_ATTEMPTS);
    }

    function notifyPlanSwitch(index, label, error) {
        try {
            if (typeof window.showToast === 'function') {
                const reason = String(error?.message || error || '未知错误').slice(0, 40);
                window.showToast(`「${label}」失败（${reason}），自动尝试第 ${index + 1} 个方案…`, 'ri-route-line');
            }
        } catch (e) { /* 提示失败不影响主流程 */ }
    }

    // sendOnce(settings, isLast)：isLast=true 时允许把非 2xx 的 Response 原样交回
    // 调用方（让它读取错误正文给出精确提示），否则抛错以触发下一个方案。
    async function runChatPlan(apiSettings, sendOnce) {
        const plan = buildAttemptPlan(apiSettings);
        if (!plan.length) {
            throw new Error('未找到可用的 API 配置，请在「设置 → AI 配置」中填写调用地址与模型');
        }
        let lastError;
        for (let i = 0; i < plan.length; i++) {
            const attempt = plan[i];
            const isLast = i === plan.length - 1;
            try {
                return await sendOnce(attempt.settings, isLast);
            } catch (error) {
                lastError = error;
                const label = `${attempt.name}${attempt.settings.modelName ? ' · ' + attempt.settings.modelName : ''}`;
                console.warn(`[API] 方案 ${i + 1}/${plan.length}（${label}）失败:`, error?.message || error);
                if (!isLast) notifyPlanSwitch(i + 1, label, error);
            }
        }
        if (lastError && plan.length > 1) {
            lastError.message = `${lastError.message}（已尝试 ${plan.length} 个站点/模型组合均失败）`;
        }
        throw lastError || new Error('API 请求失败');
    }

    async function fetchChat(apiSettings, messages, overrides = {}) {
        return runChatPlan(apiSettings, (settings, isLast) => withAutoRetry(settings, async () => {
            const controller = new AbortController();
            const timeoutSeconds = getFiniteNumber(settings.timeoutSeconds, 60);
            const timeoutId = setTimeout(() => controller.abort(), Math.max(1, timeoutSeconds) * 1000);
            try {
                let options = createChatFetchOptions(settings, messages, overrides);
                const requestUrl = buildChatUrl(settings.apiUrl, {
                    protocol: options._protocol,
                    model: settings.modelName,
                    stream: overrides.stream === true
                });
                let response = await fetch(requestUrl, {
                    ...options,
                    signal: controller.signal
                });
                // 个别端点不认识 stream_options.include_usage 会报 400：
                // 去掉该字段原样重发一次，保证聊天不受影响（只是拿不到 usage 统计）。
                if (!response.ok && response.status === 400 && options._usedStreamOptions) {
                    // 记一笔：该站点拒绝 stream_options → 本轮拿不到 usage，
                    // 「界面外观 → 缓存命中率」会一直为空。此标记只用于给空状态补一句
                    // 准确的原因说明（见 api-cache-optimizer.js 的 readNoUsage），
                    // 一旦某轮正常拿到 usage 就会自动清除。
                    try {
                        localStorage.setItem('apiCacheNoUsage', JSON.stringify({ site: settings.apiUrl || '', at: Date.now() }));
                    } catch (e) { }
                    const retryBody = JSON.parse(options.body);
                    delete retryBody.stream_options;
                    options = { method: 'POST', headers: options.headers, body: JSON.stringify(retryBody), _usedStreamOptions: false, _protocol: options._protocol };
                    response = await fetch(requestUrl, {
                        ...options,
                        signal: controller.signal
                    });
                }
                if (!response.ok && !isLast) {
                    // 还有备用方案：读掉错误体便于日志，然后抛错切换站点/模型
                    let detail = `API Error: ${response.status}`;
                    try {
                        const errData = await response.clone().json();
                        detail = errData.error?.message || detail;
                    } catch (e) { }
                    throw new Error(detail);
                }
                if (!response.ok && isLast && isRetryableError(new Error(`API Error: ${response.status}`))) {
                    // 最后一个方案的可重试错误：交给 withAutoRetry 原地重试
                    try { await response.clone().json(); } catch (e) { }
                    throw new Error(`API Error: ${response.status}`);
                }
                return response;
            } finally {
                clearTimeout(timeoutId);
            }
        }));
    }

    async function chatCompletion(apiSettings, messages, overrides = {}) {
        const data = await runChatPlan(apiSettings, settings =>
            withAutoRetry(settings, () => requestJson(buildChatUrl(settings.apiUrl), createChatFetchOptions(settings, messages, overrides)))
        );
        // 记录缓存命中统计（无缓存字段时自动跳过）
        try { window.CacheOptimizer?.recordUsage?.(apiSettings, data?.usage); } catch (e) { }
        return data.choices?.[0]?.message?.content || '';
    }

    // ==========================================================
    // 后台小任务请求（懒人模式快捷回复 / 主动关怀 / 摘要等）
    // ----------------------------------------------------------
    // 为什么单独写一个：这类调用以前只发一条 system 消息 + max_tokens:100，
    // 而主聊天请求里始终带着 user 消息 —— 这就是「主对话正常，但懒人模式和
    // 主动关怀总是失败」的直接原因：
    //   · 不少 OpenAI 兼容端点要求 messages 至少包含一条 user 角色，只给
    //     system 会返回 400（invalid_request_error / must contain at least one user message）；
    //   · 推理类模型（R1 / QwQ / o 系列 / gemini-thinking 兼容层）会把
    //     max_tokens:100 全花在思考上，content 返回空字符串，于是本地解析报错；
    //   · 部分端点不支持 presence_penalty / frequency_penalty / top_p 等采样字段，
    //     带上就直接 400。
    // 因此这里做「逐级降级重试」：一种请求结构失败就换下一种，直到拿到内容。
    // ==========================================================
    const SMALL_TASK_FALLBACK_USER = '好，请按要求直接输出结果。';

    function readCompletionText(data) {
        const choice = data?.choices?.[0];
        const msg = choice?.message || choice?.delta || {};
        let text = msg.content;
        // 少数端点把内容放在 reasoning / text 字段里
        if (typeof text !== 'string' || !text.trim()) {
            const alt = msg.reasoning_content || msg.reasoning || msg.text || (typeof choice?.text === 'string' ? choice.text : '');
            text = String(alt || '');
        }
        // 去掉思考块，只留正文
        return String(text || '')
            .replace(/<think(?:ing)?[\s\S]*?<\/think(?:ing)?>/gi, '')
            .trim();
    }

    /**
     * @param {object} apiSettings 已解析好的配置（建议由 FeatureModels.resolve 产出）
     * @param {string} systemText 系统提示（任务说明）
     * @param {string} userText 用户消息内容（缺省时自动补一句，保证角色结构合法）
     * @param {object} options { maxTokens, temperature, label }
     * @returns {Promise<string>} 模型输出文本（可能为空字符串）
     */
    async function requestSmallTask(apiSettings, systemText, userText, options = {}) {
        const label = options.label || 'AI 小任务';
        const systemContent = String(systemText || '').trim();
        const contentUser = String(userText || '').trim() || SMALL_TASK_FALLBACK_USER;
        const maxTokens = Number(options.maxTokens) > 0 ? Number(options.maxTokens) : 600;
        const temperature = Number.isFinite(options.temperature) ? options.temperature : 0.8;

        // 注意：这里不走 createChatFetchOptions，因此不会附带 presence_penalty /
        // frequency_penalty / top_p —— 这类小任务不需要它们，而它们正是部分端点 400 的来源。
        const send = (body) => runChatPlan(apiSettings, settings =>
            withAutoRetry(settings, () => requestJson(buildChatUrl(settings.apiUrl), {
                method: 'POST',
                headers: authHeaders(settings.apiKey),
                body: JSON.stringify({ model: settings.modelName, messages: body.messages, ...body.extra })
            }))
        );

        const twoMessages = [
            { role: 'system', content: systemContent },
            { role: 'user', content: contentUser }
        ];
        const mergedUser = [{ role: 'user', content: `${systemContent}\n\n${contentUser}` }];

        const attempts = [
            // ① 最标准：system + user + max_tokens + temperature
            { why: '标准结构', messages: twoMessages, extra: { max_tokens: maxTokens, temperature, stream: false } },
            // ② 推理模型常嫌额度太小：放宽到至少 1600
            { why: '放宽 max_tokens', messages: twoMessages, extra: { max_tokens: Math.max(1600, maxTokens), temperature, stream: false } },
            // ③ 干脆不给 max_tokens，由端点决定
            { why: '去掉 max_tokens', messages: twoMessages, extra: { temperature, stream: false } },
            // ④ 不接受 system 角色的端点：提示词并进 user
            { why: '合并为单条 user', messages: mergedUser, extra: { temperature, stream: false } },
            // ⑤ 最小请求体：只有 model + messages
            { why: '最小请求体', messages: mergedUser, extra: {} }
        ];

        let lastError = null;
        // 空回复容忍：有些任务（如主动关怀）用字面量表示「本轮不需要输出」，
        // 此时模型返回空字符串是**正确结果**，不能再降级重试 5 次后抛
        // 「模型返回了空内容」—— 那正是「主动关怀总是失败」的根因。
        const allowEmpty = options.allowEmpty === true;
        for (const attempt of attempts) {
            try {
                const data = await send(attempt);
                const text = readCompletionText(data);
                if (text) return text;
                if (allowEmpty) return '';
                lastError = new Error('模型返回了空内容（可能是思考型模型，或该模型不擅长执行此类指令），请换一个非推理模型再试');
            } catch (error) {
                lastError = error;
                const message = String(error?.message || error || '');
                // 鉴权 / 额度类错误：换请求结构也没用，立刻抛出，别白耗五次请求
                if (/\b(401|402|403)\b/.test(message) || /api key|unauthorized|insufficient|quota|billing/i.test(message)) throw error;
                console.warn(`[${label}] 请求结构「${attempt.why}」失败:`, message);
            }
        }
        throw lastError || new Error(`${label}失败`);
    }

    // 统一的 API 错误处理函数
    function handleApiError(error, context = 'API 请求') {
        console.error(`${context}失败:`, error);
        const errorMsg = error.message || String(error);
        // 区分常见错误类型并提供友好提示
        if (error?.name === 'AbortError') {
            return '⚠️ 请求超时，请检查网络或调大 AI 配置中的超时秒数';
        } else if (errorMsg.includes('401') || errorMsg.toLowerCase().includes('unauthorized') || errorMsg.toLowerCase().includes('api key')) {
            return '❌ API Key 无效或已过期，请检查设置';
        } else if (errorMsg.includes('429')) {
            return '⚠️ 请求过于频繁，请稍后再试';
        } else if (errorMsg.includes('503') || errorMsg.includes('502')) {
            return '⚠️ 服务暂时不可用，请稍后重试';
        } else if (errorMsg.includes('timeout') || errorMsg.includes('ETIMEDOUT') || errorMsg.includes('network')) {
            return '⚠️ 网络连接超时，请检查网络设置';
        } else if (errorMsg.includes('model') && errorMsg.toLowerCase().includes('not found')) {
            return '❌ 模型不存在或不可用，请检查模型名称设置';
        } else if (errorMsg.includes('空内容')) {
            return `⚠️ ${context}没有拿到内容：${errorMsg}`;
        } else if (/\b400\b/.test(errorMsg) || errorMsg.toLowerCase().includes('invalid_request')) {
            return `❌ ${context}失败：站点或模型拒绝该请求（参数不兼容）。可换一个模型再试，原始信息：${errorMsg}`;
        } else {
            return `❌ ${context}失败：${errorMsg}`;
        }
    }

    window.ApiModule = {
        authHeaders,
        buildChatUrl,
        buildEmbeddingsUrl,
        requestJson,
        getGenerationParameters,
        getThinkingOverrides,
        createChatFetchOptions,
        fetchChat,
        chatCompletion,
        requestSmallTask,
        readCompletionText,
        isRetryableError,
        withAutoRetry,
        handleApiError,
        // 多站点/多模型降级
        buildAttemptPlan,
        runChatPlan,
        parseModelList,
        MAX_TOTAL_ATTEMPTS
    };
})();


/* ====== endpoints.js ====== */
// ============================================================
//  多站点 API 配置（EndpointStore）
//  · 站点库：可创建 / 修改 / 删除多个「地址 + Key + 模型 + 备用模型」
//  · 轮流请求：本站点全部模型失败后，按顺序换下一个站点
//  · 向后兼容：始终与旧的 aiChatSettings.apiUrl/apiKey/modelName 双向同步，
//    因此论坛 / 3D 实验室 / 知识库 / 长期记忆等读取旧字段的功能不受影响。
// ============================================================
(function () {
    'use strict';

    const STORE_KEY = 'apiEndpoints';
    const MAIN_KEY = 'aiChatSettings';
    const CHANGE_EVENT = 'api-endpoints-changed';

    function uid() {
        return 'site-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
    }

    function parseJson(raw, fallback) {
        if (!raw) return fallback;
        try {
            const value = JSON.parse(raw);
            return (value && typeof value === 'object') ? value : fallback;
        } catch (e) {
            return fallback;
        }
    }

    function readMain() {
        let raw = null;
        try { raw = localStorage.getItem(MAIN_KEY); } catch (e) { raw = null; }
        return parseJson(raw, {});
    }

    function normalizeList(value) {
        if (Array.isArray(value)) return [...new Set(value.map(s => String(s).trim()).filter(Boolean))];
        return [...new Set(String(value || '').split(/[\n,，;；]+/).map(s => s.trim()).filter(Boolean))];
    }

    function normalizeSite(site, index) {
        const src = site || {};
        const backups = normalizeList(src.backupModels ?? src.backupModel);
        // 旧数据可能把备用模型混在主模型字段里（换行/逗号分隔），这里拆开
        let model = String(src.model || src.modelName || '').trim();
        if (/[\n,，;；]/.test(model)) {
            const parts = normalizeList(model);
            model = parts.shift() || '';
            backups.unshift(...parts);
        }
        return {
            id: String(src.id || uid()),
            name: String(src.name || `站点 ${(index ?? 0) + 1}`).trim().slice(0, 24),
            url: String(src.url || src.apiUrl || '').trim(),
            key: String(src.key ?? src.apiKey ?? '').trim(),
            model,
            backupModels: [...new Set(backups)].slice(0, 8),
            enabled: src.enabled !== false
        };
    }

    function writeStore(data) {
        const payload = JSON.stringify(data);
        if (typeof setLocalStorageSafely === 'function') {
            setLocalStorageSafely(STORE_KEY, payload, 'API 站点配置');
        } else {
            try { localStorage.setItem(STORE_KEY, payload); } catch (e) { console.warn('站点配置写入失败', e); }
        }
        try { window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: { activeSiteId: data.activeSiteId } })); } catch (e) { }
        return data;
    }

    /**
     * 读取站点库。老用户（没有该 key）时自动从 aiChatSettings 迁移出「默认站点」，
     * 保证升级后行为与之前完全一致，不会出现「配置突然空了」。
     */
    function read() {
        let raw = null;
        try { raw = localStorage.getItem(STORE_KEY); } catch (e) { raw = null; }
        const data = parseJson(raw, null);
        const main = readMain();

        if (!data || !Array.isArray(data.sites)) {
            const site = normalizeSite({
                id: uid(),
                name: '默认站点',
                url: main.apiUrl || '',
                key: main.apiKey || '',
                model: main.modelName || '',
                backupModels: [],
                enabled: true
            }, 0);
            return writeStore({
                version: 1,
                sites: site.url ? [site] : [],
                activeSiteId: site.url ? site.id : '',
                rotation: false
            });
        }

        const sites = data.sites.map((s, i) => normalizeSite(s, i));
        let activeSiteId = String(data.activeSiteId || '');
        if (!sites.some(s => s.id === activeSiteId)) {
            const byUrl = main.apiUrl ? sites.find(s => sameEndpoint(s.url, main.apiUrl)) : null;
            activeSiteId = (byUrl || sites.find(s => s.enabled) || sites[0] || {}).id || '';
        }
        const normalized = { version: 1, sites, activeSiteId, rotation: data.rotation === true };
        // 只有规整过程真的改动了数据（补 id / 拆备用模型 / 修正当前站点 / 版本字段）才回写，
        // 否则每次读取都写一次存储，既浪费配额也会反复触发变更事件。
        const drifted = sitesNeedRewrite(data.sites, sites)
            || String(data.activeSiteId || '') !== activeSiteId
            || data.version !== 1
            || (data.rotation === true) !== normalized.rotation;
        return drifted ? writeStore(normalized) : normalized;
    }

    // 原始条目经过 normalize 后发生变化（例如补了 id、拆了备用模型）就必须落盘
    function sitesNeedRewrite(original, normalized) {
        if (original.length !== normalized.length) return true;
        return original.some((s, i) => JSON.stringify(s) !== JSON.stringify(normalized[i]));
    }

    function sameEndpoint(a, b) {
        const build = typeof window.ApiModule?.buildChatUrl === 'function'
            ? window.ApiModule.buildChatUrl
            : (url => String(url || '').trim().replace(/\/+$/, ''));
        const ua = build(a), ub = build(b);
        return !!ua && !!ub && ua === ub;
    }

    function getActive(store) {
        const data = store || read();
        return data.sites.find(s => s.id === data.activeSiteId) || data.sites[0] || null;
    }

    function getModelChain(site) {
        if (!site) return [];
        return [...new Set([String(site.model || '').trim(), ...normalizeList(site.backupModels)].filter(Boolean))];
    }

    /**
     * 供 ApiModule 做降级的站点顺序：
     *  · 关闭轮流请求 → 只有当前站点
     *  · 开启轮流请求 → 当前站点排第一，其余「已启用」站点按列表顺序跟随
     */
    function getSitesForFailover() {
        const data = read();
        // 没有地址或没有 Key 的站点不参与降级（否则一定 401，白等一次超时）
        const usable = data.sites.filter(s => s.enabled && String(s.url || '').trim() && String(s.key || '').trim());
        const active = usable.find(s => s.id === data.activeSiteId) || null;
        if (!active) return [];
        if (!data.rotation) return [active];
        return [active, ...usable.filter(s => s.id !== active.id)];
    }

    /**
     * 主聊天/群聊/摘要/记忆提取等「使用主配置」的调用统一走这里。
     * 返回的对象带 allowFailover: true，ApiModule 才会启用多站点降级。
     */
    function getEffectiveApiSettings() {
        const main = readMain();
        const data = read();
        const active = getActive(data);
        const chain = getModelChain(active);
        const settings = {
            ...main,
            allowFailover: true,
            rotationEnabled: data.rotation === true,
            siteName: active?.name || '当前配置'
        };
        if (active?.url) {
            settings.apiUrl = active.url;
            settings.apiKey = active.key || main.apiKey || '';
        }
        if (chain.length) {
            settings.modelName = chain[0];
            settings.backupModels = chain.slice(1);
        }
        return settings;
    }

    /** 把当前站点的地址/Key/模型回写进 aiChatSettings，保持旧代码可读 */
    function syncMain(site) {
        if (!site) return;
        const chain = getModelChain(site);
        const main = readMain();
        // 忠实反映站点内容：用户在表单里清空地址/Key 时，主配置也必须一起清空，
        // 否则会出现「点了保存但旧地址还赖在配置里」的情况。
        const merged = {
            ...main,
            apiUrl: site.url || '',
            apiKey: site.key || '',
            modelName: chain[0] || ''
        };
        merged.backupModels = chain.slice(1);
        const payload = JSON.stringify(merged);
        if (typeof setLocalStorageSafely === 'function') {
            setLocalStorageSafely(MAIN_KEY, payload, 'API设置');
        } else {
            try { localStorage.setItem(MAIN_KEY, payload); } catch (e) { }
        }
        if (typeof LocalStorageCache !== 'undefined') {
            LocalStorageCache.invalidate?.(MAIN_KEY);
            LocalStorageCache.invalidate?.(STORE_KEY);
        }
    }

    function save(data) {
        const sites = (data.sites || []).map((s, i) => normalizeSite(s, i));
        let activeSiteId = String(data.activeSiteId || '');
        if (!sites.some(s => s.id === activeSiteId)) activeSiteId = sites[0]?.id || '';
        const next = { version: 1, sites, activeSiteId, rotation: data.rotation === true };
        writeStore(next);
        if (next.sites.length) {
            syncMain(getActive(next));
        } else {
            const main = readMain();
            const payload = JSON.stringify({ ...main, apiUrl: '', apiKey: '', modelName: '', backupModels: [] });
            if (typeof setLocalStorageSafely === 'function') setLocalStorageSafely(MAIN_KEY, payload, 'API设置');
            else { try { localStorage.setItem(MAIN_KEY, payload); } catch (e) { } }
            if (typeof LocalStorageCache !== 'undefined') {
                LocalStorageCache.invalidate?.(MAIN_KEY);
                LocalStorageCache.invalidate?.(STORE_KEY);
            }
        }
        return next;
    }

    function addSite(partial) {
        const data = read();
        const site = normalizeSite({ ...partial, id: uid() }, data.sites.length);
        const sites = [...data.sites, site];
        const next = save({
            sites,
            activeSiteId: data.activeSiteId || site.id,
            rotation: data.rotation
        });
        return next.sites.find(s => s.id === site.id);
    }

    function updateSite(id, patch) {
        const data = read();
        let hit = false;
        const sites = data.sites.map(s => {
            if (s.id !== id) return s;
            hit = true;
            return normalizeSite({ ...s, ...patch, id: s.id }, 0);
        });
        if (!hit) return null;
        const next = save({ sites, activeSiteId: data.activeSiteId, rotation: data.rotation });
        return next.sites.find(s => s.id === id);
    }

    function removeSite(id) {
        const data = read();
        const sites = data.sites.filter(s => s.id !== id);
        return save({
            sites,
            activeSiteId: data.activeSiteId === id ? (sites[0]?.id || '') : data.activeSiteId,
            rotation: data.rotation
        });
    }

    function setActive(id) {
        const data = read();
        if (!data.sites.some(s => s.id === id)) return data;
        return save({ sites: data.sites, activeSiteId: id, rotation: data.rotation });
    }

    function setRotation(enabled) {
        const data = read();
        return save({ sites: data.sites, activeSiteId: data.activeSiteId, rotation: enabled === true });
    }

    /**
     * 「自带模型名 / 自带地址」的后台调用（长期记忆提取等）用这个：
     * 返回该地址对应站点库里的备用模型顺序（剔除调用方自己已指定的主模型）。
     *   · 地址就是主配置当前站点 → 返回站点库的备用模型链，允许同站内换模型；
     *   · 地址是别处 → 返回空数组，既不换站点，也不会把别的站点的模型名塞进来。
     */
    function getBackupModelsFor(url, primaryModel) {
        const data = read();
        const active = getActive(data);
        const primary = String(primaryModel || '').trim();
        if (!active || !sameEndpoint(active.url, url)) return [];
        return getModelChain(active).filter(m => m && m !== primary);
    }

    /** 主配置当前站点的模型顺序（第 1 个 = 主模型，其余 = 备用模型） */
    function getMainModelChain() {
        const data = read();
        const active = getActive(data);
        const chain = getModelChain(active);
        if (chain.length) return chain;
        const main = readMain();
        return [...new Set([
            String(main.modelName || '').trim(),
            ...normalizeList(main.backupModels)
        ].filter(Boolean))];
    }

    /**
     * 导入配置后调用：aiChatSettings 已被外部整体替换，
     * 若它与「当前站点」不一致，则以导入结果为准改写当前站点（其余站点保留）。
     */
    function adoptMainSettings() {
        const main = readMain();
        const data = read();
        const active = getActive(data);
        const chain = [...new Set([
            String(main.modelName || '').trim(),
            ...normalizeList(main.backupModels)
        ].filter(Boolean))];
        if (!active) {
            if (!main.apiUrl) return data;
            return save({
                sites: [normalizeSite({
                    name: '导入的站点', url: main.apiUrl, key: main.apiKey,
                    model: chain[0] || '', backupModels: chain.slice(1), enabled: true
                }, 0)],
                activeSiteId: '',
                rotation: data.rotation
            });
        }
        const changed = !sameEndpoint(active.url, main.apiUrl)
            || (main.apiKey || '') !== active.key
            || (chain[0] || '') !== active.model
            || JSON.stringify(chain.slice(1)) !== JSON.stringify(active.backupModels);
        if (!changed) return data;
        return save({
            sites: data.sites.map(s => s.id === active.id
                ? { ...s, url: main.apiUrl || s.url, key: main.apiKey || s.key, model: chain[0] || s.model, backupModels: chain.slice(1) }
                : s),
            activeSiteId: data.activeSiteId,
            rotation: data.rotation
        });
    }

    // ---------- 站点自检（测连通 / 拉模型列表）----------
    function chatUrlFor(site, settings) {
        const build = window.ApiModule?.buildChatUrl;
        const url = build ? build(site.url) : String(site.url || '').trim();
        return { url, key: site.key || settings.apiKey || '', model: getModelChain(site)[0] || settings.modelName || '' };
    }

    async function testSite(id) {
        const data = read();
        const site = data.sites.find(s => s.id === id) || getActive(data);
        if (!site) throw new Error('站点不存在');
        if (!site.url) throw new Error('该站点还没填写 API 地址');
        const main = readMain();
        const { url, key, model } = chatUrlFor(site, main);
        if (!key) throw new Error('该站点还没填写 API Key');
        if (!model) throw new Error('该站点还没填写模型名称');
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
            body: JSON.stringify({ model, messages: [{ role: 'user', content: 'Hi' }], max_tokens: 5, stream: false })
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err?.error?.message || `HTTP ${res.status}`);
        }
        const data2 = await res.json().catch(() => ({}));
        if (!data2?.choices?.length) throw new Error('返回内容异常：缺少 choices 字段');
        return { ok: true, model };
    }

    async function fetchSiteModels(id) {
        const data = read();
        const site = data.sites.find(s => s.id === id) || getActive(data);
        if (!site) throw new Error('站点不存在');
        if (!site.url) throw new Error('该站点还没填写 API 地址');
        const base = (window.ApiModule?.buildChatUrl ? window.ApiModule.buildChatUrl(site.url) : site.url)
            .replace(/\/chat\/completions\/?$/, '');
        const modelsUrl = /\/models\/?$/.test(base) ? base : `${base}/models`;
        const res = await fetch(modelsUrl, { headers: { Authorization: `Bearer ${site.key || ''}` } });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err?.error?.message || `HTTP ${res.status}`);
        }
        const payload = await res.json();
        const list = Array.isArray(payload?.data) ? payload.data : (Array.isArray(payload?.models) ? payload.models : []);
        return list.map(m => (typeof m === 'string' ? m : m?.id)).filter(Boolean).sort();
    }

    window.EndpointStore = {
        STORE_KEY,
        CHANGE_EVENT,
        read,
        getActive,
        getSites,
        getSitesForFailover,
        getModelChain,
        getEffectiveApiSettings,
        getBackupModelsFor,
        getMainModelChain,
        adoptMainSettings,
        normalizeList,
        sameEndpoint,
        save,
        addSite,
        updateSite,
        removeSite,
        setActive,
        setRotation,
        syncMain,
        testSite,
        fetchSiteModels
    };

    function getSites() {
        return read().sites.slice();
    }
})();


/* ============================================================
   多站点配置界面
   原独立脚本已合并到本文件，保持原脚本顺序与全局声明。
 */
// ============================================================
//  多站点配置面板（设置 → AI 配置）
//  依赖：window.EndpointStore（endpoints.js）、window.ApiModule（api.js）
//  职责：站点下拉 / 站点列表（创建·重命名·改地址·改Key·改模型·备用模型·
//        启用停用·排序·设为主站点·复制·删除·连通检测）/ 轮流请求开关
// ============================================================
(function () {
    'use strict';

    const MAIN_KEY = 'aiChatSettings';
    let bound = false;
    let editingId = '';        // 当前展开编辑面板的站点 id
    let testStates = {};       // id -> { text, tone } 连通检测结果（仅本次会话）

    const $ = id => document.getElementById(id);
    const store = () => window.EndpointStore;
    const esc = s => String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

    function toast(msg, icon) {
        try { if (typeof window.showToast === 'function') window.showToast(msg, icon || 'ri-information-line'); } catch (e) { }
    }

    function readMain() {
        try { return JSON.parse(localStorage.getItem(MAIN_KEY) || '{}') || {}; } catch (e) { return {}; }
    }

    // ---------- 表单 ↔ 站点 ----------
    function readForm() {
        const st = store();
        const normalize = typeof normalizeApiUrl === 'function' ? normalizeApiUrl : (u => u);
        return {
            url: normalize(($('api-url')?.value || '').trim()),
            key: ($('api-key')?.value || '').trim(),
            model: ($('model-name')?.value || '').trim(),
            backupModels: st ? st.normalizeList($('api-backup-models')?.value) : []
        };
    }

    function writeForm(site, chain) {
        const models = chain && chain.length ? chain : (site ? store().getModelChain(site) : []);
        if ($('api-url')) $('api-url').value = (site && site.url) || '';
        if ($('api-key')) $('api-key').value = (site && site.key) || '';
        if ($('model-name')) $('model-name').value = models[0] || '';
        if ($('api-backup-models')) $('api-backup-models').value = models.slice(1).join('\n');
    }

    function activeSite() {
        return store() ? store().getActive() : null;
    }

    /** 把主表单当前内容写回「当前站点」（点保存设置 / 切换站点前调用） */
    function commitFormToActiveSite(options) {
        const st = store();
        if (!st) return null;
        const opts = options || {};
        const data = st.read();
        const form = readForm();
        const active = st.getActive(data);
        if (!active) {
            // 站点库被清空过：只有表单里确实填了地址才重建一个站点，避免留下空壳
            if (!form.url) { if (opts.render !== false) renderAll(); return null; }
            const created = st.addSite({ name: '默认站点', ...form, enabled: true });
            if (opts.silent !== true) toast('已把当前配置保存为「默认站点」', 'ri-server-line');
            renderAll();
            return created;
        }
        const updated = st.updateSite(active.id, {
            url: form.url,
            key: form.key,
            model: form.model,
            backupModels: form.backupModels
        });
        if (opts.render !== false) renderAll();
        return updated;
    }

    /** 切换 / 载入某个站点到主表单 */
    function applySiteToForm(id) {
        const st = store();
        const data = st.read();
        const site = data.sites.find(s => s.id === id);
        if (!site) return;
        writeForm(site);
        st.setActive(id);
        renderAll();
    }

    // ---------- 渲染 ----------
    function renderSiteSelect() {
        const st = store();
        const sel = $('api-site-select');
        if (!st || !sel) return;
        const data = st.read();
        const prev = sel.value;
        sel.innerHTML = data.sites.length
            ? data.sites.map(site => {
                const chain = st.getModelChain(site);
                const extra = chain.length > 1 ? ` · 主+${chain.length - 1} 备用` : '';
                const off = site.enabled ? '' : '（已停用）';
                return `<option value="${esc(site.id)}">${esc(site.name)}｜${esc(shortHost(site.url))}${esc(extra)}${esc(off)}</option>`;
            }).join('')
            : '<option value="">（暂无站点，点右侧「新建站点」）</option>';
        const wanted = data.activeSiteId || prev;
        if ([...sel.options].some(o => o.value === wanted)) sel.value = wanted;
        sel.disabled = !data.sites.length;

        const rotation = $('api-rotation-check');
        if (rotation) rotation.checked = data.rotation === true;
        const state = $('api-rotation-state');
        if (state) {
            const usable = data.sites.filter(s => s.enabled && s.url).length;
            state.innerHTML = data.rotation
                ? `<i class="ri-route-line"></i> 轮流请求已开启：将按顺序尝试 ${usable} 个站点`
                : `<i class="ri-information-line"></i> 未开启轮流请求：只用当前站点（含其备用模型）`;
        }
    }

    function shortHost(url) {
        if (!url) return '未填地址';
        try { return new URL(url).host; } catch (e) { return String(url).replace(/^https?:\/\//, '').slice(0, 28); }
    }

    function renderList() {
        const st = store();
        const box = $('endpoint-list');
        const empty = $('endpoint-list-empty');
        if (!st || !box) return;
        const data = st.read();
        if (empty) empty.hidden = data.sites.length > 0;

        box.innerHTML = data.sites.map((site, i) => {
            const chain = st.getModelChain(site);
            const isActive = site.id === data.activeSiteId;
            const orderLabel = (!data.rotation || !isActive)
                ? ''
                : `<span class="ep-order">${i + 1}</span>`;
            const test = testStates[site.id];
            const badges = [
                isActive ? '<span class="ep-badge ep-badge--active">当前使用</span>' : '',
                site.enabled ? '' : '<span class="ep-badge ep-badge--off">已停用</span>',
                data.rotation && !isActive && site.enabled ? '<span class="ep-badge ep-badge--backup">备用站点</span>' : '',
                chain.length > 1 ? `<span class="ep-badge ep-badge--models">${chain.length - 1} 个备用模型</span>` : ''
            ].join('');
            const keyHint = site.key
                ? `<span class="ep-meta-item" title="已配置 Key"><i class="ri-key-2-line"></i> ${esc(maskKey(site.key))}</span>`
                : '<span class="ep-meta-item ep-warn"><i class="ri-key-off-line"></i> 未填 Key</span>';
            const editPanel = editingId === site.id ? renderEditor(site, chain) : '';

            return `
            <div class="ep-site${isActive ? ' is-active' : ''}${site.enabled ? '' : ' is-off'}" data-id="${esc(site.id)}">
                <div class="ep-site-head">
                    ${orderLabel}
                    <div class="ep-site-main">
                        <div class="ep-site-name">${esc(site.name)} ${badges}</div>
                        <div class="ep-site-meta">
                            <span class="ep-meta-item"><i class="ri-link"></i> ${esc(shortHost(site.url))}</span>
                            ${keyHint}
                            <span class="ep-meta-item"><i class="ri-brain-line"></i> ${esc(chain[0] || '未填模型')}</span>
                        </div>
                        ${test ? `<div class="ep-site-test ep-tone-${test.tone}">${test.html}</div>` : ''}
                    </div>
                    <div class="ep-site-actions">
                        <button class="btn btn-outline btn-sm" data-act="activate" ${isActive ? 'disabled' : ''} title="切换为当前使用的站点"><i class="ri-toggle-line"></i> 使用</button>
                        <button class="btn btn-outline btn-sm" data-act="edit" title="展开/收起编辑"><i class="ri-edit-line"></i> 编辑</button>
                        <button class="btn btn-outline btn-sm" data-act="test" title="测试该站点连通性"><i class="ri-plug-line"></i> 测试</button>
                        <button class="btn btn-outline btn-sm" data-act="up" ${i === 0 ? 'disabled' : ''} title="上移（提高降级优先级）"><i class="ri-arrow-up-s-line"></i></button>
                        <button class="btn btn-outline btn-sm" data-act="down" ${i === data.sites.length - 1 ? 'disabled' : ''} title="下移"><i class="ri-arrow-down-s-line"></i></button>
                        <button class="btn btn-outline btn-sm" data-act="rename" title="重命名"><i class="ri-text"></i></button>
                        <button class="btn btn-outline btn-sm" data-act="duplicate" title="复制此站点"><i class="ri-file-copy-line"></i></button>
                        <button class="btn btn-outline btn-sm" data-act="toggle" title="${site.enabled ? '停用（轮流请求时跳过）' : '启用'}"><i class="${site.enabled ? 'ri-pause-circle-line' : 'ri-play-circle-line'}"></i></button>
                        <button class="btn btn-danger btn-sm" data-act="delete" title="删除此站点"><i class="ri-delete-bin-line"></i></button>
                    </div>
                </div>
                ${editPanel}
            </div>`;
        }).join('');
    }

    function maskKey(key) {
        const s = String(key);
        if (s.length <= 8) return '****';
        return s.slice(0, 4) + '…' + s.slice(-4);
    }

    function renderEditor(site, chain) {
        return `
        <div class="ep-editor">
            <div class="ep-editor-grid">
                <label>名称<input data-f="name" value="${esc(site.name)}" maxlength="24"></label>
                <label>API 地址<input data-f="url" value="${esc(site.url)}" placeholder="https://api.xxx.com"></label>
                <label>API Key<input data-f="key" type="password" value="${esc(site.key)}" placeholder="sk-..."></label>
                <label>主模型<input data-f="model" value="${esc(chain[0] || '')}" placeholder="gpt-4o-mini"></label>
                <label class="ep-editor-wide">备用模型（每行一个，按顺序尝试）
                    <textarea data-f="backupModels" rows="3" placeholder="deepseek-chat&#10;claude-3-5-haiku">${esc(chain.slice(1).join('\n'))}</textarea>
                </label>
            </div>
            <div class="ep-editor-actions">
                <label class="ep-check-row ep-check-inline"><input type="checkbox" data-f="enabled" ${site.enabled ? 'checked' : ''}><span>启用该站点</span></label>
                <span class="ep-editor-current">
                    <button class="btn btn-outline btn-sm" data-act="pull" title="把上方主表单的内容填进这里"><i class="ri-download-to-line"></i> 用上方表单填充</button>
                    <button class="btn btn-outline btn-sm" data-act="push" title="把这个站点的值写回上方主表单"><i class="ri-upload-to-line"></i> 写回上方表单</button>
                    <button class="btn btn-secondary btn-sm" data-act="use-model" title="把第一个备用模型设为主模型"><i class="ri-exchange-line"></i> 主↔备用首位</button>
                </span>
                <button class="btn btn-primary btn-sm" data-act="save-edit"><i class="ri-check-line"></i> 保存此站点</button>
                <button class="btn btn-outline btn-sm" data-act="cancel-edit">收起</button>
            </div>
        </div>`;
    }

    function renderAll() {
        renderSiteSelect();
        renderList();
    }

    // ---------- 站点操作 ----------
    function createSiteFromForm() {
        const st = store();
        const data = st.read();
        const form = readForm();
        // 先保住用户正在编辑的内容，别被新站点「抢走」而未保存
        if (form.url) commitFormToActiveSite({ silent: true, render: false });
        const name = nextSiteName(data.sites);
        const created = st.addSite({
            name,
            // 新站点默认继承当前表单：换站最常见的需求就是「只改域名」
            url: form.url,
            key: form.key,
            model: form.model,
            backupModels: form.backupModels,
            enabled: true
        });
        if (!created) return;
        editingId = created.id;
        st.setActive(created.id);
        writeForm(created);
        renderAll();
        toast(`已创建站点「${created.name}」并设为当前使用`, 'ri-add-circle-line');
    }

    function nextSiteName(sites) {
        const used = new Set(sites.map(s => s.name));
        for (let i = 1; i < 99; i++) {
            const candidate = `站点 ${i}`;
            if (!used.has(candidate)) return candidate;
        }
        return '站点 ' + Date.now().toString(36);
    }

    function duplicateSite(id) {
        const st = store();
        const data = st.read();
        const src = data.sites.find(s => s.id === id);
        if (!src) return;
        const created = st.addSite({
            ...src,
            id: undefined,
            name: `${src.name} 副本`.slice(0, 24)
        });
        renderAll();
        if (created) toast(`已复制为「${created.name}」`, 'ri-file-copy-line');
    }

    async function deleteSite(id) {
        const st = store();
        const data = st.read();
        const site = data.sites.find(s => s.id === id);
        if (!site) return;
        if (!await Dlg.confirm({
            title: '删除站点',
            message: `确定删除站点「${site.name}」？\n该站点的地址、Key 与模型配置会一并移除（不影响其它站点）。`,
            okText: '删除站点',
            danger: true
        })) return;
        // 确认期间列表可能已变，重新确认该站点还在
        if (!st.read().sites.some(s => s.id === id)) { renderAll(); return; }
        if (editingId === id) editingId = '';
        st.removeSite(id);
        const next = st.getActive();
        if (next) writeForm(next);
        renderAll();
        toast(`已删除站点「${site.name}」`, 'ri-delete-bin-line');
    }

    function moveSite(id, delta) {
        const st = store();
        const data = st.read();
        const from = data.sites.findIndex(s => s.id === id);
        const to = from + delta;
        if (from < 0 || to < 0 || to >= data.sites.length) return;
        const sites = data.sites.slice();
        const [moved] = sites.splice(from, 1);
        sites.splice(to, 0, moved);
        st.save({ sites, activeSiteId: data.activeSiteId, rotation: data.rotation });
        renderAll();
        toast(`「${moved.name}」现在的降级顺序是第 ${to + 1} 位`, 'ri-order-play');
    }

    function saveEditor(siteId, root) {
        const st = store();
        const get = f => root.querySelector(`[data-f="${f}"]`);
        const normalize = typeof normalizeApiUrl === 'function' ? normalizeApiUrl : (u => u);
        const patch = {
            name: (get('name')?.value || '').trim() || '未命名站点',
            url: normalize((get('url')?.value || '').trim()),
            key: (get('key')?.value || '').trim(),
            model: (get('model')?.value || '').trim(),
            backupModels: st.normalizeList(get('backupModels')?.value),
            enabled: get('enabled')?.checked !== false
        };
        const updated = st.updateSite(siteId, patch);
        if (!updated) return;
        if (siteId === st.read().activeSiteId) writeForm(updated);
        renderAll();
        toast(`站点「${updated.name}」已保存`, 'ri-check-double-line');
    }

    // ---------- 连通检测 ----------
    function setTest(id, html, tone) {
        testStates[id] = { html, tone: tone || 'info' };
        renderList();
    }

    async function testOne(id) {
        const st = store();
        const data = st.read();
        const site = data.sites.find(s => s.id === id);
        if (!site) return;
        setTest(id, '<i class="ri-loader-4-line ri-spin"></i> 正在通过 /models 探测站点…', 'info');
        const started = Date.now();
        try {
            const models = await st.fetchSiteModels(id);
            const chain = st.getModelChain(site);
            const ms = Date.now() - started;
            if (!chain.length) {
                setTest(id, `✅ 站点可用（${models.length} 个模型，${ms}ms）· 尚未填写主模型`, 'ok');
                return;
            }
            const missing = chain.filter(m => models.length && !models.some(x => x === m));
            setTest(id, missing.length
                ? `⚠️ 站点可用（${models.length} 个模型，${ms}ms），但列表中找不到：${esc(missing.join('、'))}`
                : `✅ 站点可用（${models.length} 个模型，${ms}ms），模型配置全部有效`, 'ok');
        } catch (e) {
            setTest(id, `❌ 不可用：${esc(String(e?.message || e).slice(0, 120))}`, 'err');
        }
    }

    async function testAll() {
        const st = store();
        const data = st.read();
        if (!data.sites.length) { toast('还没有站点可检测', 'ri-information-line'); return; }
        toast('开始逐个站点检测（串行，避免触发限流）', 'ri-route-line');
        for (const site of data.sites) {
            // eslint-disable-next-line no-await-in-loop
            await testOne(site.id);
        }
        toast('站点检测完成', 'ri-checkbox-circle-line');
    }

    // ---------- 事件绑定 ----------
    function bind() {
        if (bound) { renderAll(); return; }
        const siteSelect = $('api-site-select');
        const newBtn = $('api-site-new-btn');
        if (!siteSelect || !newBtn) return;      // 设置面板结构缺失（如旧版 HTML）
        bound = true;

        siteSelect.addEventListener('change', () => {
            if (!siteSelect.value) return;
            // 切换前先把当前表单存回原站点，避免「改了没保存就切走」
            commitFormToActiveSite({ silent: true, render: false });
            applySiteToForm(siteSelect.value);
            const site = activeSite();
            toast(`已切换到站点「${site?.name || ''}」，点「保存设置」生效`, 'ri-exchange-line');
        });

        newBtn.addEventListener('click', createSiteFromForm);

        $('api-site-duplicate-btn')?.addEventListener('click', () => {
            const data = store().read();
            if (!data.activeSiteId) { toast('还没有站点可复制', 'ri-information-line'); return; }
            commitFormToActiveSite({ silent: true, render: false });
            duplicateSite(store().read().activeSiteId);
        });

        $('api-rotation-check')?.addEventListener('change', e => {
            store().setRotation(e.target.checked);
            renderAll();
            toast(e.target.checked ? '已开启轮流请求：站点故障时会自动换站重试' : '已关闭轮流请求：只用当前站点',
                e.target.checked ? 'ri-route-line' : 'ri-shut-down-line');
        });

        $('api-rotation-test-btn')?.addEventListener('click', () => testAll());

        // 列表：一次委托，覆盖所有按钮与编辑面板
        // （async：重命名要用站内输入对话框等待用户输入）
        $('endpoint-list')?.addEventListener('click', async e => {
            const btn = e.target.closest('[data-act]');
            if (!btn) return;
            const row = btn.closest('.ep-site');
            const siteBox = btn.closest('.ep-editor') || row;
            const id = row?.dataset.id;
            if (!id) return;
            const act = btn.dataset.act;
            const data = store().read();
            const site = data.sites.find(s => s.id === id);
            if (!site) return;

            switch (act) {
                case 'activate':
                    commitFormToActiveSite({ silent: true, render: false });
                    applySiteToForm(id);
                    toast(`已设为当前站点：${site.name}`, 'ri-toggle-line');
                    break;
                case 'edit':
                    editingId = editingId === id ? '' : id;
                    renderList();
                    break;
                case 'test':
                    testOne(id);
                    break;
                case 'up': moveSite(id, -1); break;
                case 'down': moveSite(id, 1); break;
                case 'toggle':
                    store().updateSite(id, { enabled: !site.enabled });
                    renderAll();
                    toast(`站点「${site.name}」已${site.enabled ? '停用' : '启用'}`, site.enabled ? 'ri-pause-circle-line' : 'ri-play-circle-line');
                    break;
                case 'duplicate':
                    commitFormToActiveSite({ silent: true, render: false });
                    duplicateSite(id);
                    break;
                case 'delete':
                    deleteSite(id);
                    break;
                case 'rename': {
                    const name = await Dlg.prompt({
                        title: '重命名站点',
                        message: '给这个站点起个名字（用于快速识别中转站）：',
                        value: site.name,
                        placeholder: '例如：主力站 / 备用 A',
                        maxLength: 24,
                        okText: '保存'
                    });
                    if (name && name.trim()) {
                        store().updateSite(id, { name: name.trim().slice(0, 24) });
                        renderAll();
                    }
                    break;
                }
                case 'save-edit':
                    saveEditor(id, siteBox);
                    break;
                case 'cancel-edit':
                    editingId = '';
                    renderList();
                    break;
                case 'pull': {
                    const form = readForm();
                    const q = f => siteBox.querySelector(`[data-f="${f}"]`);
                    if (q('url')) q('url').value = form.url;
                    if (q('key')) q('key').value = form.key;
                    if (q('model')) q('model').value = form.model;
                    if (q('backupModels')) q('backupModels').value = form.backupModels.join('\n');
                    toast('已用上方表单内容填充（还需点「保存此站点」）', 'ri-download-to-line');
                    break;
                }
                case 'push': {
                    const read = f => siteBox.querySelector(`[data-f="${f}"]`)?.value ?? '';
                    const st = store();
                    writeForm({
                        ...site,
                        url: read('url').trim(),
                        key: read('key').trim(),
                        model: read('model').trim(),
                        backupModels: st.normalizeList(read('backupModels'))
                    });
                    toast('已写回上方表单（点「保存设置」才会落盘到站点）', 'ri-upload-to-line');
                    break;
                }
                case 'use-model': {
                    const q = f => siteBox.querySelector(`[data-f="${f}"]`);
                    const list = store().normalizeList(q('backupModels')?.value);
                    const first = list.shift() || '';
                    if (!first) { toast('这个站点还没有备用模型', 'ri-information-line'); break; }
                    if (q('model')) q('model').value = first;
                    if (q('backupModels')) q('backupModels').value = list.join('\n');
                    toast(`已把「${first}」提为主模型，记得点「保存此站点」`, 'ri-exchange-line');
                    break;
                }
                default: break;
            }
        });
    }

    /** 供 loadApiSettings 调用：确保面板已绑定并渲染 */
    function refresh() {
        try {
            bind();
            renderAll();
        } catch (e) {
            console.warn('站点面板渲染失败:', e);
        }
    }

    /** 主表单被外部改动（如获取模型后回填）时，同步备用模型提示 */
    function syncBackupHint() {
        const st = store();
        const box = $('api-backup-models');
        if (!st || !box) return;
        const data = st.read();
        const active = st.getActive(data);
        if (!active || !active.url) return;
        const chain = st.getModelChain(active);
        if (($('model-name')?.value || '').trim() === chain[0]) {
            const backups = st.normalizeList(box.value);
            const diff = chain.slice(1).filter(m => !backups.includes(m));
            if (diff.length) box.value = [...backups, ...diff].join('\n');
        }
    }

    window.EndpointUI = {
        refresh,
        render: renderAll,
        commitFormToActiveSite,
        applySiteToForm,
        readForm,
        writeForm,
        syncBackupHint,
        testAll,
        createSiteFromForm,
        version: 'v1.0'
    };
})();


/* ====== image-tools.js ====== */
// ============================================
// 图片工具模块：截图（裁切）对话框 + 统一压缩策略
// --------------------------------------------
// 1) 截图对话框 ImageTools.cropImage(src, opts)
//    - 支持 1:1 / 3:4 / 4:3 / 16:9 / 原图比例
//    - 拖动平移、滚轮 / 双指缩放、滑块缩放
//    - 用户「没有做任何操作」时直接返回原图（不重编码、不掉画质）
//    - 远程图片不允许跨域处理时自动回退为原图
// 2) 统一压缩策略 ImageTools.compress(file, maxEdge, quality)
//    - 读取「界面外观 → 不压缩图片」开关；开启时一律保留原图
// ============================================

(function () {
    'use strict';

    const CROP_STYLE_ID = 'imagetools-crop-style';

    function readChatSettings() {
        try { return JSON.parse(localStorage.getItem('chatSettings') || '{}') || {}; } catch (e) { return {}; }
    }

    /** 用户是否在「界面外观」里勾选了「不压缩图片」 */
    function isCompressionDisabled() {
        // 优先看设置面板里的实时勾选状态：
        // main.js 的聊天图片 / 背景路径读的是勾选框本身，如果这里只认 localStorage 里
        // 「保存过」的值，就会出现同一个开关两套行为 —— 用户勾上还没点保存时，
        // 聊天图片保持原图，立绘与裁切结果却仍被重编码成 JPEG。
        try {
            const el = document.getElementById('disable-image-compression');
            if (el) return el.checked === true;
        } catch (e) {}
        return readChatSettings().disableImageCompression === true;
    }

    function readFileAsDataUrl(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onerror = () => reject(new Error('图片读取失败'));
            reader.onload = () => resolve(reader.result);
            reader.readAsDataURL(file);
        });
    }

    function loadImage(src, allowCors) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            const remote = /^https?:/i.test(String(src || ''));
            if (remote && allowCors !== false) img.crossOrigin = 'anonymous';
            img.onload = () => resolve(img);
            img.onerror = () => reject(new Error('图片加载失败或地址不可用'));
            img.src = src;
        });
    }

    function canvasToDataUrl(canvas, preferPng) {
        try {
            return preferPng ? canvas.toDataURL('image/png') : canvas.toDataURL('image/jpeg', 0.92);
        } catch (e) {
            return null;
        }
    }

    /**
     * 压缩图片：返回 dataURL。
     * 勾选了「不压缩图片」时直接返回原始 dataURL（不做任何缩放与重编码）。
     */
    async function compress(file, maxEdge = 1280, quality = 0.82) {
        const raw = await readFileAsDataUrl(file);
        if (isCompressionDisabled()) return raw;
        try {
            const img = await loadImage(raw, false);
            const scale = Math.min(1, maxEdge / Math.max(img.naturalWidth || 1, img.naturalHeight || 1));
            if (scale >= 1) return raw;   // 已经小于目标尺寸：不必重编码
            const canvas = document.createElement('canvas');
            canvas.width = Math.max(1, Math.round((img.naturalWidth || 1) * scale));
            canvas.height = Math.max(1, Math.round((img.naturalHeight || 1) * scale));
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            return canvasToDataUrl(canvas, false) || raw;
        } catch (e) {
            return raw;
        }
    }

    function injectCropStyle() {
        if (document.getElementById(CROP_STYLE_ID)) return;
        const style = document.createElement('style');
        style.id = CROP_STYLE_ID;
        style.textContent = `
.it-overlay{position:fixed;inset:0;z-index:12050;background:rgba(0,0,0,.72);display:flex;align-items:center;justify-content:center;padding:16px;opacity:0;transition:opacity .18s ease;backdrop-filter:blur(3px)}
.it-overlay.show{opacity:1}
.it-card{width:min(560px,100%);max-height:92vh;display:flex;flex-direction:column;background:#20222b;color:#e8e8ee;border:1px solid #3c3f4b;border-radius:14px;box-shadow:0 18px 50px rgba(0,0,0,.55);overflow:hidden}
.it-head{display:flex;align-items:center;gap:8px;padding:12px 14px;border-bottom:1px solid #3a3d47;font-weight:600;color:#e6c78a}
.it-head .it-close{margin-left:auto;background:none;border:0;color:#aaa;font-size:1.2em;cursor:pointer;line-height:1;padding:4px 8px;border-radius:6px}
.it-head .it-close:hover{background:rgba(255,255,255,.08);color:#fff}
.it-stage{flex:1 1 auto;min-height:0;display:flex;align-items:center;justify-content:center;padding:14px;background:#171922}
.it-vp{position:relative;overflow:hidden;touch-action:none;cursor:grab;border-radius:10px;background:#0e1016;box-shadow:0 0 0 1px rgba(255,255,255,.12),0 0 0 9999px rgba(0,0,0,.28);max-width:100%;max-height:52vh}
.it-vp:active{cursor:grabbing}
.it-vp img{position:absolute;left:0;top:0;user-select:none;-webkit-user-drag:none;pointer-events:none;max-width:none;max-height:none}
.it-grid{position:absolute;inset:0;pointer-events:none;background-image:linear-gradient(to right,rgba(255,255,255,.28) 1px,transparent 1px),linear-gradient(to bottom,rgba(255,255,255,.28) 1px,transparent 1px);background-size:33.333% 33.333%;opacity:.55}
.it-body{padding:12px 14px;display:flex;flex-direction:column;gap:10px}
.it-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.it-row .it-label{font-size:.85em;color:#9aa0ad;min-width:44px}
.it-ratio{padding:6px 12px;border-radius:999px;border:1px solid #4a4e5c;background:transparent;color:#ccc;font-size:.86em;cursor:pointer;transition:all .15s}
.it-ratio:hover{border-color:#e6c78a;color:#e6c78a}
.it-ratio.active{border-color:#e6c78a;background:rgba(230,199,138,.16);color:#f3dcae}
.it-zoom{flex:1 1 120px;min-width:110px;accent-color:#e6c78a}
.it-hint{font-size:.76em;color:#7d8390;line-height:1.5}
.it-foot{display:flex;gap:8px;flex-wrap:wrap;padding:12px 14px;border-top:1px solid #3a3d47}
.it-foot button{flex:1 1 auto;min-width:96px;display:flex;align-items:center;justify-content:center;gap:6px;padding:10px 14px;border-radius:9px;border:1px solid #4a4e5c;background:#2a2d38;color:#e2e2ea;cursor:pointer;font-size:.92em}
.it-foot button:hover{border-color:#e6c78a;color:#e6c78a}
.it-foot button.primary{background:#3c7d4a;border-color:#3c7d4a;color:#fff}
.it-foot button.primary:hover{background:#458c54;border-color:#458c54;color:#fff}
@media (max-width:520px){.it-vp{max-height:44vh}.it-foot button{min-width:0;font-size:.85em;padding:9px 10px}}
`;
        document.head.appendChild(style);
    }

    /**
     * 打开截图（裁切）对话框。
     * @param {string} src 原始图片（dataURL 或 http(s) 地址）
     * @param {object} opts { title, aspect, aspects:[{label,value|natural}] }
     * @returns {Promise<string|null>} 裁切后的 dataURL / 原图 / null（用户取消）
     */
    async function cropImage(src, opts) {
        opts = opts || {};
        if (!src) return null;
        injectCropStyle();

        let img;
        try {
            img = await loadImage(src, true);
            // crossOrigin 模式下部分图站会直接失败：退回不带 CORS 的普通加载（此时无法 canvas 导出，只能回退原图）
            if (img.naturalWidth === 0 && /^https?:/i.test(src)) img = await loadImage(src, false);
        } catch (e) {
            throw new Error('图片加载失败或地址不可用');
        }

        const naturalRatio = (img.naturalHeight > 0) ? (img.naturalWidth / img.naturalHeight) : 1;
        const aspectList = Array.isArray(opts.aspects) && opts.aspects.length ? opts.aspects : [
            { label: '1:1', value: 1 },
            { label: '3:4', value: 3 / 4 },
            { label: '4:3', value: 4 / 3 },
            { label: '16:9', value: 16 / 9 },
            { label: '原图比例', natural: true }
        ];
        let ratio = opts.aspect === undefined ? naturalRatio : (opts.aspect || naturalRatio);
        let usingNatural = opts.aspect === undefined || !opts.aspect;

        return new Promise(resolve => {
            const overlay = document.createElement('div');
            overlay.className = 'it-overlay';
            overlay.setAttribute('role', 'dialog');
            overlay.setAttribute('aria-modal', 'true');

            const card = document.createElement('div');
            card.className = 'it-card';

            const head = document.createElement('div');
            head.className = 'it-head';
            head.innerHTML = '<i class="ri-crop-2-line"></i><span></span>';
            head.querySelector('span').textContent = opts.title || '裁切图片';
            const closeBtn = document.createElement('button');
            closeBtn.type = 'button';
            closeBtn.className = 'it-close';
            closeBtn.innerHTML = '<i class="ri-close-line"></i>';
            closeBtn.setAttribute('aria-label', '关闭');
            head.appendChild(closeBtn);

            const stage = document.createElement('div');
            stage.className = 'it-stage';
            const vp = document.createElement('div');
            vp.className = 'it-vp';
            const imgEl = document.createElement('img');
            imgEl.src = src;
            imgEl.alt = '待裁切图片';
            const grid = document.createElement('div');
            grid.className = 'it-grid';
            vp.appendChild(imgEl);
            vp.appendChild(grid);
            stage.appendChild(vp);

            const body = document.createElement('div');
            body.className = 'it-body';
            const ratioRow = document.createElement('div');
            ratioRow.className = 'it-row';
            ratioRow.setAttribute('role', 'group');
            ratioRow.setAttribute('aria-label', '裁切比例');
            const ratioBtns = [];
            aspectList.forEach(item => {
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'it-ratio';
                btn.textContent = item.label;
                btn.dataset.natural = item.natural ? '1' : '0';
                btn.dataset.value = item.natural ? '' : String(item.value);
                btn.addEventListener('click', () => selectRatio(item));
                ratioBtns.push(btn);
                ratioRow.appendChild(btn);
            });
            const zoomRow = document.createElement('div');
            zoomRow.className = 'it-row';
            const zoomLabel = document.createElement('span');
            zoomLabel.className = 'it-label';
            zoomLabel.textContent = '缩放';
            const zoom = document.createElement('input');
            zoom.type = 'range';
            zoom.className = 'it-zoom';
            zoom.min = '1';
            zoom.max = '4';
            zoom.step = '0.01';
            zoom.value = '1';
            zoom.setAttribute('aria-label', '缩放');
            zoomRow.appendChild(zoomLabel);
            zoomRow.appendChild(zoom);
            const hint = document.createElement('div');
            hint.className = 'it-hint';
            hint.textContent = '拖动图片调整取景范围；若无任何操作，将直接使用完整的原图。';
            body.appendChild(ratioRow);
            body.appendChild(zoomRow);
            body.appendChild(hint);

            const foot = document.createElement('div');
            foot.className = 'it-foot';
            const makeBtn = (label, icon, cls) => {
                const b = document.createElement('button');
                b.type = 'button';
                if (cls) b.className = cls;
                b.innerHTML = `<i class="${icon}"></i><span></span>`;
                b.querySelector('span').textContent = label;
                return b;
            };
            const originalBtn = makeBtn('使用原图', 'ri-image-line');
            const resetBtn = makeBtn('重置', 'ri-refresh-line');
            const cancelBtn = makeBtn('取消', 'ri-close-line');
            const okBtn = makeBtn('确定', 'ri-check-line', 'primary');
            foot.appendChild(originalBtn);
            foot.appendChild(resetBtn);
            foot.appendChild(cancelBtn);
            foot.appendChild(okBtn);

            card.appendChild(head);
            card.appendChild(stage);
            card.appendChild(body);
            card.appendChild(foot);
            overlay.appendChild(card);
            document.body.appendChild(overlay);
            requestAnimationFrame(() => overlay.classList.add('show'));

            let zoomLevel = 1;
            const offset = { x: 0, y: 0 };
            let touched = false;
            let closed = false;

            function applyRatio() {
                const maxH = Math.min(window.innerHeight * 0.52, 420);
                const maxW = Math.min(window.innerWidth - 60, 512);
                let w = maxW;
                let h = w / ratio;
                if (h > maxH) { h = maxH; w = h * ratio; }
                vp.style.width = Math.max(60, Math.round(w)) + 'px';
                vp.style.height = Math.max(60, Math.round(h)) + 'px';
            }

            function fitScale() {
                const Iw = img.naturalWidth || 1;
                const Ih = img.naturalHeight || 1;
                const Vw = vp.clientWidth || 1;
                const Vh = vp.clientHeight || 1;
                return Math.max(Vw / Iw, Vh / Ih);   // cover：保证画面始终填满取景框
            }

            function clampAndApply() {
                const s = fitScale() * zoomLevel;
                const W = (img.naturalWidth || 1) * s;
                const H = (img.naturalHeight || 1) * s;
                const Vw = vp.clientWidth;
                const Vh = vp.clientHeight;
                offset.x = Math.min(0, Math.max(Vw - W, offset.x));
                offset.y = Math.min(0, Math.max(Vh - H, offset.y));
                imgEl.style.width = W + 'px';
                imgEl.style.height = H + 'px';
                imgEl.style.transform = `translate(${offset.x}px, ${offset.y}px)`;
            }

            function centerImage() {
                const s = fitScale() * zoomLevel;
                const W = (img.naturalWidth || 1) * s;
                const H = (img.naturalHeight || 1) * s;
                offset.x = (vp.clientWidth - W) / 2;
                offset.y = (vp.clientHeight - H) / 2;
                clampAndApply();
            }

            function syncRatioButtons() {
                ratioBtns.forEach(btn => {
                    const isNatural = btn.dataset.natural === '1';
                    const val = Number(btn.dataset.value || 0);
                    const active = isNatural
                        ? (usingNatural && zoomLevel === 1 && !touched)
                        : (!usingNatural && Math.abs(val - ratio) < 0.0001);
                    btn.classList.toggle('active', active);
                });
            }

            function relayout(keepView) {
                applyRatio();
                if (keepView) clampAndApply(); else centerImage();
                syncRatioButtons();
            }

            function selectRatio(item) {
                usingNatural = !!item.natural;
                ratio = item.natural ? naturalRatio : Number(item.value) || naturalRatio;
                zoomLevel = 1;
                zoom.value = '1';
                // 选择了与原图不同的比例即视为用户主动裁切
                touched = !(item.natural);
                relayout(false);
                if (item.natural) touched = false;
                syncRatioButtons();
            }

            // ---- 拖动 / 缩放 ----
            const pointers = new Map();
            let dragStart = null;
            let pinchStart = null;

            vp.addEventListener('pointerdown', e => {
                if (e.button !== undefined && e.button !== 0) return;
                vp.setPointerCapture?.(e.pointerId);
                pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
                if (pointers.size === 1) {
                    dragStart = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
                } else if (pointers.size === 2) {
                    const [a, b] = [...pointers.values()];
                    pinchStart = { dist: Math.hypot(a.x - b.x, a.y - b.y), zoom: zoomLevel };
                    dragStart = null;
                }
            });

            vp.addEventListener('pointermove', e => {
                if (!pointers.has(e.pointerId)) return;
                pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
                if (pointers.size === 2 && pinchStart) {
                    const [a, b] = [...pointers.values()];
                    const dist = Math.hypot(a.x - b.x, a.y - b.y);
                    if (pinchStart.dist > 4) {
                        zoomLevel = Math.min(4, Math.max(1, pinchStart.zoom * (dist / pinchStart.dist)));
                        zoom.value = String(zoomLevel);
                        touched = true;
                        clampAndApply();
                        syncRatioButtons();
                    }
                    return;
                }
                if (!dragStart) return;
                const dx = e.clientX - dragStart.x;
                const dy = e.clientY - dragStart.y;
                if (Math.abs(dx) + Math.abs(dy) > 3) touched = true;
                offset.x = dragStart.ox + dx;
                offset.y = dragStart.oy + dy;
                clampAndApply();
                syncRatioButtons();
            });

            const endPointer = e => {
                pointers.delete(e.pointerId);
                if (pointers.size < 2) pinchStart = null;
                if (pointers.size === 0) dragStart = null;
                else if (pointers.size === 1) {
                    const [p] = [...pointers.values()];
                    dragStart = { x: p.x, y: p.y, ox: offset.x, oy: offset.y };
                }
            };
            vp.addEventListener('pointerup', endPointer);
            vp.addEventListener('pointercancel', endPointer);
            vp.addEventListener('pointerleave', e => { if (pointers.has(e.pointerId)) endPointer(e); });

            vp.addEventListener('wheel', e => {
                e.preventDefault();
                zoomLevel = Math.min(4, Math.max(1, zoomLevel + (e.deltaY < 0 ? 0.08 : -0.08)));
                zoom.value = String(zoomLevel);
                touched = true;
                clampAndApply();
                syncRatioButtons();
            }, { passive: false });

            zoom.addEventListener('input', () => {
                zoomLevel = Math.min(4, Math.max(1, Number(zoom.value) || 1));
                touched = true;
                clampAndApply();
                syncRatioButtons();
            });

            function finish(value) {
                if (closed) return;
                closed = true;
                document.removeEventListener('keydown', onKey, true);
                overlay.classList.remove('show');
                setTimeout(() => { try { overlay.remove(); } catch (e) {} }, 200);
                resolve(value);
            }

            function exportCrop() {
                if (!touched) return src;      // 用户没做任何操作 → 直接用完整原图
                const s = fitScale() * zoomLevel;
                const Vw = vp.clientWidth;
                const Vh = vp.clientHeight;
                const sx = Math.max(0, -offset.x / s);
                const sy = Math.max(0, -offset.y / s);
                const sw = Math.min(img.naturalWidth - sx, Vw / s);
                const sh = Math.min(img.naturalHeight - sy, Vh / s);
                if (sw < 2 || sh < 2) return src;
                try {
                    const canvas = document.createElement('canvas');
                    canvas.width = Math.max(1, Math.round(sw));
                    canvas.height = Math.max(1, Math.round(sh));
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
                    const out = canvasToDataUrl(canvas, isCompressionDisabled());
                    return out || src;
                } catch (err) {
                    // 跨域受限（canvas 被污染）：退回原图，绝不丢用户的操作结果
                    if (typeof window.showToast === 'function') window.showToast('该图片不允许跨域裁切，已直接使用原图', 'ri-error-warning-line');
                    return src;
                }
            }

            resetBtn.addEventListener('click', () => {
                zoomLevel = 1;
                zoom.value = '1';
                touched = false;
                usingNatural = true;
                ratio = naturalRatio;
                relayout(false);
                syncRatioButtons();
            });

            const onKey = e => {
                if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finish(null); }
            };
            document.addEventListener('keydown', onKey, true);

            const onResize = () => relayout(true);
            window.addEventListener('resize', onResize);

            // 关闭时一并摘掉 resize 监听，避免弹窗关掉后还在改已经不在 DOM 里的元素尺寸
            const finalFinish = value => {
                window.removeEventListener('resize', onResize);
                finish(value);
            };
            okBtn.addEventListener('click', () => finalFinish(exportCrop()));
            cancelBtn.addEventListener('click', () => finalFinish(null));
            originalBtn.addEventListener('click', () => finalFinish(src));
            closeBtn.addEventListener('click', () => finalFinish(null));
            overlay.addEventListener('click', e => { if (e.target === overlay) finalFinish(null); });

            relayout(false);
            syncRatioButtons();
        });
    }

    window.ImageTools = {
        isCompressionDisabled,
        readFileAsDataUrl,
        loadImage,
        canvasToDataUrl,
        compress,
        cropImage,
        /** 便捷方法：从 file 读取并允许用户裁切；取消返回 null */
        async cropFile(file, opts) {
            const raw = await readFileAsDataUrl(file);
            return cropImage(raw, opts);
        },
        /** 便捷方法：远程 URL 先尝试裁切，失败则原样返回 URL */
        async cropUrl(url, opts) {
            if (!url) return url;
            try {
                const out = await cropImage(url, opts);
                return out === null ? null : out;
            } catch (e) {
                if (typeof window.showToast === 'function') window.showToast('图片地址无法加载，已直接使用原链接', 'ri-error-warning-line');
                return url;
            }
        }
    };
})();

/* ====== english-mode.js ====== */
/**
 * english-mode.js —— AI 英文模式
 * · 存储 localStorage['englishModeSettings']
 * { enabled, scopes: { chat, live, forum, tutor, call, games } }
 * · 各场景调用 EnglishMode.applyToSystem(text, scope) 幂等追加英文规则
 * （带 [English Mode] 标记防重复）；
 * · 聊天场景额外接入 chat-hooks.js 的 promptAssembly：请求发出前给最后
 * 一条 system 追加规则，单聊 / 群聊 / 重新生成全覆盖；
 * · 设置面板挂在「设置 → 更多 → 界面语言」区块下方。
 * 安全边界：
 * · 内部辅助请求（表情包备注 / 情绪判断 / 知识库问答 / 翻译）不注入；
 * · 总开关关闭时 applyToSystem 原样返回，行为与旧版一致；
 * · ChatHooks 未加载时静默等待重试，不影响其它功能。
 */
(function () {
    'use strict';

    var KEY = 'englishModeSettings';
    var MARK = '[English Mode]';
    var SCOPE_KEYS = ['chat', 'live', 'forum', 'tutor', 'call', 'games'];
    var DEFAULT_SCOPES = { chat: true, live: true, forum: true, tutor: true, call: true, games: true };

    /* ---------------- 设置读写 ---------------- */

    function readSettings() {
        var out = { enabled: false, scopes: {} };
        SCOPE_KEYS.forEach(function (k) { out.scopes[k] = DEFAULT_SCOPES[k]; });
        try {
            var raw = JSON.parse(localStorage.getItem(KEY) || 'null');
            if (raw && typeof raw === 'object') {
                out.enabled = raw.enabled === true;
                if (raw.scopes && typeof raw.scopes === 'object') {
                    SCOPE_KEYS.forEach(function (k) {
                        if (raw.scopes[k] === false) out.scopes[k] = false;
                        else if (raw.scopes[k] === true) out.scopes[k] = true;
                    });
                }
            }
        } catch (e) { /* 坏数据按默认处理 */ }
        return out;
    }

    function writeSettings(next) {
        try { localStorage.setItem(KEY, JSON.stringify(next)); } catch (e) { /* 配额不足忽略 */ }
    }

    function isEnabled() { return readSettings().enabled === true; }

    /** 总开关开启 且 该场景未被单独关掉 */
    function isScope(scope) {
        var s = readSettings();
        if (!s.enabled) return false;
        if (!scope || SCOPE_KEYS.indexOf(scope) === -1) return true;
        return s.scopes[scope] !== false;
    }

    function setEnabled(v) {
        var s = readSettings();
        s.enabled = v === true;
        writeSettings(s);
        return s;
    }

    function setScope(scope, v) {
        var s = readSettings();
        if (SCOPE_KEYS.indexOf(scope) !== -1) s.scopes[scope] = v === true;
        writeSettings(s);
        return s;
    }

    /* ---------------- 语言规则（各场景的英文指令块） ----------------
       统一带 [English Mode] 前缀，供幂等检测；
       声明最高优先级，覆盖角色卡 / 预设里要求中文的旧指令；
       标记类内容（[sticker:N]、[AFF:n]、【第N步】等）要求原样保留。 */

    var BLOCKS = {
        chat: [
            MARK + ' Language policy (highest priority; it overrides any earlier instruction that asks you to reply in Chinese):',
            '- Always reply in natural, idiomatic English, regardless of the language of the character card, the chat history or the user message.',
            '- Keep the persona, tone and world-view of the character; express everything in English.',
            '- Keep required markers and placeholders byte-for-byte unchanged ([sticker:N], [AFF:n], [emo:xxx]); only natural-language text switches to English.',
            '- Do not mention this rule; simply comply.'
        ].join('\n'),

        live: [
            MARK + ' Language policy (highest priority; overrides any earlier request for Chinese):',
            '- Output the requested line in English only: one short, natural English sentence.',
            '- Keep the persona and tone of the character; do not mention this rule.'
        ].join('\n'),

        forum: [
            MARK + ' Language policy (highest priority; overrides any earlier instruction that asks for Chinese only):',
            '- Write it in natural, colloquial English, in the voice of the character, like a real forum user.',
            '- Keep it casual; do not mention this rule.'
        ].join('\n'),

        tutor: [
            MARK + ' Language policy (highest priority; overrides any instruction that asks for Chinese output):',
            '- Explain and answer in English only, regardless of the language of the question or earlier instructions.',
            '- Keep fixed format markers byte-for-byte unchanged (【第N步】, 【答案】, 【知识点】, 【题型套路】, 【易错点】, 「练习1」); write the text after them in English; never rename or remove the markers.',
            '- Keep KaTeX formulas working; write Mermaid node labels in English.',
            '- In a voice call, speak natural spoken English, one point per turn. Do not mention this rule.'
        ].join('\n'),

        call: [
            MARK + ' Language policy (highest priority; overrides any earlier request for Chinese):',
            '- Speak English only during this call: short, casual, spoken sentences, like a real phone call.',
            '- Use no Chinese words or sentences. Do not mention this rule.'
        ].join('\n'),

        games: [
            MARK + ' Language policy (highest priority; overrides any earlier request for Chinese):',
            '- Say it in English only: one short, natural English line in the voice of the character.',
            '- Keep any required JSON structure and coordinates unchanged; only human-readable text becomes English. Do not mention this rule.'
        ].join('\n')
    };

    /** 该场景当前生效的规则块；未开启返回空串 */
    function promptBlock(scope) {
        if (!isScope(scope)) return '';
        return BLOCKS[scope] || BLOCKS.chat;
    }

    /** 幂等追加：已含标记或未开启时原样返回 */
    function applyToSystem(text, scope) {
        var block = promptBlock(scope);
        var s = String(text == null ? '' : text);
        if (!block) return s;
        if (s.indexOf(MARK) !== -1) return s;
        return s ? (s + '\n\n' + block) : block;
    }
    /* ---------------- 聊天场景：接入 chat-hooks.js ----------------
       与数据银行 / 提示词预设同机制：promptAssembly 阶段在请求发出前直接改
       messages 数组。单聊、群聊、重新生成都走 ApiModule.fetchChat，一次接入
       即可全覆盖；带 __skipHooks 的辅助请求由 chat-hooks.js 统一跳过。 */

    var hookConnected = false;

    /** 内部辅助请求：不该被语言规则污染（走 fetchChat 的小任务） */
    function isInternalRequest(messages) {
        for (var i = 0; i < messages.length; i++) {
            var m = messages[i];
            if (!m || m.role !== 'system' || typeof m.content !== 'string') continue;
            var c = m.content;
            if (c.indexOf('图像描述助手') !== -1) return true;            // 表情包自动备注
            if (c.indexOf('判断 AI 回复应表现的情绪') !== -1) return true; // 3D 实验室情绪判断
            if (c.indexOf('知识库问答助手') !== -1) return true;           // 知识库问答
            if (/^\s*你是一名专业翻译/.test(c)) return true;              // 翻译类兜底
        }
        return false;
    }

    function applyToMessages(messages) {
        if (!isScope('chat')) return;
        if (!Array.isArray(messages) || !messages.length) return;
        if (isInternalRequest(messages)) return;
        // 追加到最后一条 system 上（不新增 system 消息：部分端点要求 system 只在首位出现）
        for (var i = messages.length - 1; i >= 0; i--) {
            var m = messages[i];
            if (!m || m.role !== 'system' || typeof m.content !== 'string') continue;
            if (m.content.indexOf(MARK) !== -1) return;
            m.content = m.content + '\n\n' + BLOCKS.chat;
            return;
        }
    }

    function connect() {
        if (hookConnected) return true;
        if (!window.ChatHooks || typeof window.ChatHooks.register !== 'function') return false;
        window.ChatHooks.register('promptAssembly', 'english-mode', function (messages) {
            try { applyToMessages(messages); } catch (e) { /* 单次注入失败不影响请求 */ }
        }, 70);
        hookConnected = true;
        return true;
    }

    if (!connect()) {
        var connTries = 0;
        var connTimer = setInterval(function () {
            if (connect() || ++connTries > 40) clearInterval(connTimer);
        }, 300);
    }

    /* ---------------- 设置面板（设置 → 更多 → 界面语言 下方） ---------------- */

    var panelEl = null;

    var UI_PHRASES = {
        'AI 英文模式': 'AI English mode',
        '开启后，让 AI 在勾选的场景里只说英文（界面文字不变）。与「角色卡翻译」配合：在 English 界面下把角色卡翻成英文后，可一键用它替换角色提示词。': 'When on, the AI speaks English only in the ticked scopes (interface text stays as-is). Pairs with card translation: under the English interface, translate a character card and replace its prompt with one click.',
        '让 AI 讲英文（总开关）': 'Make the AI speak English (master switch)',
        '正常聊天（含群聊、问候、主动关怀）': 'Chat (incl. group chat, greetings, proactive care)',
        'AI 直播间（台词 / 弹幕 / 礼物反应）': 'AI live room (lines / danmaku / gift reactions)',
        '论坛（发帖 / 评论 / 私信）': 'Forum (posts / comments / DMs)',
        '学习辅导（讲解 / 追问 / 辅导通话）': 'Study tutor (explanations / follow-ups / tutor call)',
        '语音 / 视频通话（实验室）': 'Voice / video call (Laboratory)',
        '小游戏（棋局闲聊、森林冰火人）': 'Mini-games (board chat, Forest Icefire)',
        '当前：已关闭': 'Now: off',
        '当前：已开启（勾选场景生效）': 'Now: on (for the ticked scopes)'
    };

    function registerI18n() {
        try {
            if (window.SiteI18n && typeof window.SiteI18n.addPhrases === 'function') {
                window.SiteI18n.addPhrases(UI_PHRASES);
            }
        } catch (e) { /* 无 i18n 时保持中文 */ }
    }

    /* 状态文案始终写中文：英文界面由 SiteI18n 短语表（见 UI_PHRASES）自动替换，
       中英来回切换时也能正确还原，不在这里直接写英文。 */
    function statusText(s) {
        return s.enabled ? '当前：已开启（勾选场景生效）' : '当前：已关闭';
    }

    function scopeRow(key, label) {
        return '<label style="display:flex;align-items:center;gap:8px;"><input type="checkbox" data-em-scope="' + key + '"> <span>' + label + '</span></label>';
    }

    function mountPanel() {
        if (panelEl) return true;
        var anchor = document.getElementById('more-language');
        if (!anchor || !anchor.parentNode) return false;
        panelEl = document.createElement('div');
        panelEl.className = 'form-group';
        panelEl.id = 'english-mode-box';
        panelEl.style.cssText = 'border-bottom: 1px dashed #444; padding-bottom: 15px; margin-bottom: 15px;';
        panelEl.innerHTML = [
            '<h4><i class="ri-global-line"></i> AI 英文模式</h4>',
            '<p style="font-size: 0.85em; color: #aaa; margin-bottom: 10px;">开启后，让 AI 在勾选的场景里只说英文（界面文字不变）。与「角色卡翻译」配合：在 English 界面下把角色卡翻成英文后，可一键用它替换角色提示词。</p>',
            '<label style="display:flex;align-items:center;gap:8px;margin-bottom:10px;font-weight:600;"><input type="checkbox" id="em-enabled"> <span>让 AI 讲英文（总开关）</span></label>',
            '<div id="em-scopes" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:8px;font-size:0.88em;color:#cfd3dd;">',
            scopeRow('chat', '正常聊天（含群聊、问候、主动关怀）'),
            scopeRow('live', 'AI 直播间（台词 / 弹幕 / 礼物反应）'),
            scopeRow('forum', '论坛（发帖 / 评论 / 私信）'),
            scopeRow('tutor', '学习辅导（讲解 / 追问 / 辅导通话）'),
            scopeRow('call', '语音 / 视频通话（实验室）'),
            scopeRow('games', '小游戏（棋局闲聊、森林冰火人）'),
            '</div>',
            '<p id="em-status" style="font-size: 0.8em; color: #8d93a2; margin-top: 10px;"></p>'
        ].join('');
        anchor.parentNode.insertBefore(panelEl, anchor.nextSibling);

        var enabledBox = panelEl.querySelector('#em-enabled');
        var statusEl = panelEl.querySelector('#em-status');
        var scopeBoxes = Array.prototype.slice.call(panelEl.querySelectorAll('[data-em-scope]'));

        function paint() {
            var s = readSettings();
            enabledBox.checked = s.enabled;
            scopeBoxes.forEach(function (box) {
                box.checked = s.scopes[box.getAttribute('data-em-scope')] !== false;
                box.disabled = !s.enabled;
            });
            panelEl.querySelector('#em-scopes').style.opacity = s.enabled ? '1' : '0.55';
            statusEl.textContent = statusText(s);
        }

        enabledBox.addEventListener('change', function () {
            setEnabled(enabledBox.checked);
            paint();
        });
        scopeBoxes.forEach(function (box) {
            box.addEventListener('change', function () {
                setScope(box.getAttribute('data-em-scope'), box.checked);
                paint();
            });
        });
        paint();
        return true;
    }

    function boot() {
        registerI18n();
        var tries = 0;
        (function attempt() {
            tries += 1;
            try { if (mountPanel()) return; } catch (e) { /* 挂载失败不阻断其它功能 */ }
            if (tries < 40) setTimeout(attempt, 400);
        })();
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();

    window.EnglishMode = {
        KEY: KEY,
        MARK: MARK,
        SCOPE_KEYS: SCOPE_KEYS,
        isEnabled: isEnabled,
        isScope: isScope,
        promptBlock: promptBlock,
        applyToSystem: applyToSystem,
        applyToMessages: applyToMessages,
        settings: readSettings,
        setEnabled: setEnabled,
        setScope: setScope,
        mountPanel: mountPanel
    };
})();
