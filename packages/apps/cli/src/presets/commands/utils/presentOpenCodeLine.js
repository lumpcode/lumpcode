import { toolLine } from './presentNdjson.js';

function targetFrom(input) {
    if (!input || typeof input !== 'object') return '';
    return input.command || input.filePath || input.path || input.file_path || '';
}

export function presentOpenCodeEvent(event, outputDetail) {
    if (!event || typeof event !== 'object') return '';
    if (event.type === 'text' && event.part?.text) return `${event.part.text}\n`;
    if (outputDetail === 'quiet') return '';
    if (event.type === 'tool_use') {
        const name = event.part?.tool || 'tool';
        return toolLine(name, targetFrom(event.part?.state?.input));
    }
    return '';
}
