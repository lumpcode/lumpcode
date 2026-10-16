import { toolLine } from './presentNdjson.js';

function targetFrom(input) {
    if (!input || typeof input !== 'object') return '';
    return input.file_path || input.path || input.filePath || input.command || '';
}

export function presentClaudeCodeEvent(event) {
    if (!event || event.type !== 'assistant') return '';
    const content = event.message?.content;
    if (typeof content === 'string') return content ? `${content}\n` : '';
    if (!Array.isArray(content)) return '';
    let out = '';
    for (const block of content) {
        if (!block || typeof block !== 'object') continue;
        if (block.type === 'text' && block.text) out += `${block.text}\n`;
        if (block.type === 'tool_use' && block.name) {
            out += toolLine(block.name, targetFrom(block.input));
        }
    }
    return out;
}
