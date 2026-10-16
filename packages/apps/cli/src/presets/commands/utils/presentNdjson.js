function classifyLine(line) {
    const trimmed = line.trim();
    if (!trimmed) return { kind: 'empty' };
    try {
        return { kind: 'json', value: JSON.parse(trimmed) };
    } catch {
        return { kind: 'text', text: line };
    }
}

export function createNdjsonPresenter(presentEvent) {
    const buffers = { stdout: '', stderr: '' };
    return ({ stream, chunk }) => {
        const key = stream === 'stderr' ? 'stderr' : 'stdout';
        buffers[key] += chunk;
        const lines = buffers[key].split('\n');
        buffers[key] = lines.pop() ?? '';
        let out = '';
        for (const line of lines) {
            const classified = classifyLine(line);
            if (classified.kind === 'empty') continue;
            if (classified.kind === 'text') {
                out += `${classified.text}\n`;
                continue;
            }
            const presented = presentEvent(classified.value);
            if (presented) out += presented;
        }
        return out || undefined;
    };
}

export function toolLine(name, target) {
    const toolName = name || 'tool';
    return target ? `tool ${toolName} ${target}\n` : `tool ${toolName}\n`;
}
