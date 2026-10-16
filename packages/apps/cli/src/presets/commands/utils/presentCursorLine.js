import { toolLine } from './presentNdjson.js';

function assistantText(event) {
    const content = event.message?.content;
    if (typeof content === 'string') return content;
    if (!Array.isArray(content)) return '';
    return content
        .filter((block) => block && block.type !== 'thinking' && typeof block.text === 'string')
        .map((block) => block.text)
        .join('');
}

function cursorTool(toolCall) {
    if (!toolCall || typeof toolCall !== 'object') return null;
    const key = Object.keys(toolCall).find((name) => toolCall[name] && typeof toolCall[name] === 'object');
    if (!key) return null;
    const body = toolCall[key];
    const args = body.args ?? body.input ?? {};
    const target = args.path || args.file_path || args.filePath || args.command || args.cmd || '';
    return { name: key.replace(/ToolCall$/, ''), target };
}

export function presentCursorEvent(event) {
    if (!event || typeof event !== 'object') return '';
    if (event.type === 'assistant') {
        const text = assistantText(event);
        return text ? `${text}\n` : '';
    }
    if (event.type === 'tool_call' && event.subtype === 'started') {
        const tool = cursorTool(event.tool_call);
        return tool ? toolLine(tool.name, tool.target) : '';
    }
    return '';
}
