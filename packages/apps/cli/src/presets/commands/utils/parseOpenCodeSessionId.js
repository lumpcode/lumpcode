const SESSION_KEYS = new Set(['sessionID', 'sessionId', 'session_id', 'id']);

function findSessionIdInValue(value, depth = 0) {
    if (value == null || depth > 6) return null;
    if (typeof value === 'string') {
        const trimmed = value.trim();
        return trimmed || null;
    }
    if (Array.isArray(value)) {
        for (const item of value) {
            const found = findSessionIdInValue(item, depth + 1);
            if (found) return found;
        }
        return null;
    }
    if (typeof value === 'object') {
        for (const key of SESSION_KEYS) {
            if (typeof value[key] === 'string' && value[key].trim()) {
                // Prefer session-shaped keys; bare `id` only when type/session hints are present
                // or when the value looks like an OpenCode session id.
                if (key === 'id') {
                    const id = value[key].trim();
                    const type = typeof value.type === 'string' ? value.type : '';
                    if (id.startsWith('ses_') || /session/i.test(type)) return id;
                } else {
                    return value[key].trim();
                }
            }
        }
        for (const nested of Object.values(value)) {
            const found = findSessionIdInValue(nested, depth + 1);
            if (found) return found;
        }
    }
    return null;
}

function tryParseJson(text) {
    try {
        return JSON.parse(text);
    } catch {
        return null;
    }
}

/**
 * Extract a non-empty OpenCode session id from JSON or JSONL stdout.
 */
export function parseOpenCodeSessionId(stdout) {
    const text = (stdout ?? '').trim();
    if (!text) return null;

    const whole = tryParseJson(text);
    if (whole != null) {
        const fromWhole = findSessionIdInValue(whole);
        if (fromWhole) return fromWhole;
    }

    for (const line of text.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        const parsed = tryParseJson(trimmed);
        if (parsed == null) continue;
        const found = findSessionIdInValue(parsed);
        if (found) return found;
    }

    return null;
}
