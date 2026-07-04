/**
 * knowledge.js — 知识库降级检索工具
 *
 * 责任范围：
 *   - tokenize: 中英文混分词（带停用词过滤）
 *   - buildKeywordIndex: 给文档集合建倒排索引
 *   - searchFilesByKeyword: 纯关键字检索（fallback）
 *
 * 主路径：embedding + cosine similarity（见 main.js queryKnowledgeBase）。
 * 本文件只在以下场景被调用：
 *   - 没有配置 embedding API
 *   - API 调用失败 / 配额耗尽
 *
 * 注意：本模块不再提供 buildKnowledgeContext —— 上下文组装逻辑全部在 chat.js 里
 * 直接拼，避免二次中转导致 prompt 注入规则不清晰。
 */
(function () {
    'use strict';

    // 中英文常见停用词。检索时忽略这些，进一步减少噪音。
    const STOPWORDS = new Set([
        // 英文
        'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
        'and', 'or', 'but', 'if', 'then', 'else', 'when', 'where', 'why', 'how',
        'of', 'in', 'on', 'at', 'to', 'for', 'with', 'by', 'from', 'as', 'into',
        'this', 'that', 'these', 'those', 'it', 'its', 'i', 'you', 'he', 'she',
        'we', 'they', 'them', 'his', 'her', 'my', 'your', 'our', 'their',
        'do', 'does', 'did', 'have', 'has', 'had', 'will', 'would', 'can', 'could',
        'should', 'may', 'might', 'must', 'shall', 'not', 'no', 'so', 'such',
        // 中文常见虚词/代词
        '的', '了', '是', '在', '我', '你', '他', '她', '它', '们', '这', '那',
        '和', '与', '或', '但', '而', '也', '都', '就', '还', '又', '再', '已',
        '会', '能', '可以', '应该', '需要', '没有', '不', '没', '吗', '呢', '吧',
        '啊', '哦', '嗯', '哈', '哎', '呀', '嘛', '把', '被', '给', '从', '向',
        '到', '为', '以', '因', '所', '其', '此', '某', '每个', '所有'
    ]);

    /**
     * 把一段文本切成 token 数组。
     * - 转小写
     * - 中英文 / 数字 / 下划线保留，其余字符当分隔符
     * - 长度 ≥ 2 才保留
     * - 命中停用词的丢掉
     *
     * @param {string} text
     * @returns {string[]}
     */
    function tokenize(text) {
        return String(text || '')
            .toLowerCase()
            .split(/[^\p{L}\p{N}_\u4e00-\u9fa5]+/u)
            .map(w => w.trim())
            .filter(w => w.length >= 2 && !STOPWORDS.has(w));
    }

    /**
     * 给文档集合建倒排索引：word → Set(fileId)
     *
     * @param {Array<{id:string, name?:string, content?:string}>} files
     * @returns {Map<string, Set<string>>}
     */
    function buildKeywordIndex(files = []) {
        const index = new Map();
        files.forEach(file => {
            const words = new Set(tokenize(`${file.name || ''} ${file.content || ''}`));
            words.forEach(word => {
                if (!index.has(word)) index.set(word, new Set());
                index.get(word).add(file.id);
            });
        });
        return index;
    }

    /**
     * 纯关键词检索（fallback 用）。
     * 打分规则：query 里每个词命中 file 几次就 +1，最后取 top N。
     *
     * @param {string} query
     * @param {Array<{id:string, name?:string, content?:string}>} files
     * @param {number} maxResults
     * @returns {Array<{id:string, name?:string, content?:string, score:number}>}
     */
    function searchFilesByKeyword(query, files = [], maxResults = 3) {
        const index = buildKeywordIndex(files);
        const fileMap = new Map(files.map(file => [file.id, file]));
        const scores = new Map();
        tokenize(query).forEach(word => {
            (index.get(word) || []).forEach(fileId => {
                scores.set(fileId, (scores.get(fileId) || 0) + 1);
            });
        });
        return [...scores.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, maxResults)
            .map(([fileId, score]) => ({ ...fileMap.get(fileId), score }))
            .filter(file => file.id);
    }

    window.KnowledgeModule = {
        tokenize,
        buildKeywordIndex,
        searchFilesByKeyword
    };
})();
