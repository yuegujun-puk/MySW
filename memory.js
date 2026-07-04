/**
 * memory.js — 长期记忆工具集
 *
 * 责任范围：
 *   - parseMemoryJson: 清洗 AI 输出的 JSON 记忆块（剥 ```json 围栏 / 兜底解析失败）
 *
 * 注意：
 *   - 这里只放"通用工具函数"。
 *   - 记忆的存储 / 合并 / 去重 / 编辑等业务逻辑在 memory-ui.js（updateLongTermMemory 等）。
 *   - 检索走的是 main.js 里的 searchMemoriesByVector（embedding + 余弦相似度），
 *     这里的 parseMemoryJson 不参与检索。
 */
(function () {
    'use strict';

    /**
     * 把 AI 输出的内容清洗成 JSON 数组。
     * - 去掉 ```json ... ``` 围栏
     * - 容错 trim / 容错非数组结果
     * - 解析失败返回空数组（不抛异常，调用方决定是否降级）
     *
     * @param {string} content - AI 原始输出
     * @returns {Array<{key:string, value:string, ...}>}
     */
    function parseMemoryJson(content) {
        if (!content) return [];
        try {
            const cleaned = String(content)
                .replace(/```json|```/g, '')
                .trim();
            const parsed = JSON.parse(cleaned);
            return Array.isArray(parsed) ? parsed : [];
        } catch (err) {
            console.warn('[memory] parseMemoryJson 解析失败，返回空数组:', err);
            return [];
        }
    }

    window.MemoryModule = {
        parseMemoryJson
    };
})();
