(function () {
    'use strict';

    function tokenize(text) {
        return String(text || '')
            .toLowerCase()
            .split(/[^\p{L}\p{N}_\u4e00-\u9fa5]+/u)
            .map(word => word.trim())
            .filter(word => word.length >= 2);
    }

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

    function buildKnowledgeContext(files = []) {
        if (!files.length) return '';
        return '\n\n[知识库参考]\n' + files.map((file, index) => `${index + 1}. ${file.name}: ${(file.content || '').slice(0, 500)}`).join('\n');
    }

    window.KnowledgeModule = {
        tokenize,
        buildKeywordIndex,
        searchFilesByKeyword,
        buildKnowledgeContext
    };
})();
