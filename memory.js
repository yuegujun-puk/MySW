(function () {
    'use strict';

    function parseMemoryJson(content) {
        if (!content) return [];
        const cleaned = content.replace(/```json|```/g, '').trim();
        const parsed = JSON.parse(cleaned);
        return Array.isArray(parsed) ? parsed : [];
    }

    function mergeMemories(existing, incoming) {
        const memories = Array.isArray(existing) ? [...existing] : [];
        (incoming || []).forEach(newMem => {
            if (!newMem || !newMem.key) return;
            const existingIndex = memories.findIndex(m => m.key === newMem.key);
            if (existingIndex >= 0) {
                memories[existingIndex] = newMem;
            } else {
                memories.push(newMem);
            }
        });
        return memories;
    }

    function buildMemoryContext(memories) {
        if (!Array.isArray(memories) || memories.length === 0) return '';
        return '\n\n[长期记忆]\n' + memories.map(m => `- ${m.key}: ${m.value}`).join('\n');
    }

    window.MemoryModule = {
        parseMemoryJson,
        mergeMemories,
        buildMemoryContext
    };
})();
