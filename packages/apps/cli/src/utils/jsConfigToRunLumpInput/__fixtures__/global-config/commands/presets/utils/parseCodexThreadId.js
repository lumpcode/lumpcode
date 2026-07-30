function tryParseJson(text) {
    try {
        return JSON.parse(text);
    } catch {
        return null;
    }
}

/**
 * Extract the first Codex `thread.started` event's `thread_id` from JSONL stdout.
 */
export function parseCodexThreadId(stdout) {
    const text = (stdout ?? '').trim();
    if (!text) return null;

    for (const line of text.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        const parsed = tryParseJson(trimmed);
        if (parsed == null || typeof parsed !== 'object') continue;
        if (parsed.type === 'thread.started' && typeof parsed.thread_id === 'string') {
            const id = parsed.thread_id.trim();
            if (id) return id;
        }
    }

    return null;
}
