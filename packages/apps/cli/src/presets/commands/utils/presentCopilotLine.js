import { toolLine } from './presentNdjson.js';

function textFrom(data) {
    if (!data || typeof data !== 'object') return '';
    return data.content || data.delta || data.text || '';
}

function toolFrom(event) {
    const data = event.data && typeof event.data === 'object' ? event.data : {};
    const args = data.arguments && typeof data.arguments === 'object'
        ? data.arguments
        : (data.args && typeof data.args === 'object' ? data.args : {});
    const name = data.toolName || data.tool || data.name || 'tool';
    const target = args.command || args.path || args.filePath || data.command || '';
    return toolLine(name, target);
}

export function presentCopilotEvent(event) {
    if (!event || typeof event !== 'object') return '';
    if (event.type === 'assistant.message' || event.type === 'assistant.message_delta') {
        const text = textFrom(event.data);
        return text ? `${text}\n` : '';
    }
    if (event.type === 'tool.execution_start') return toolFrom(event);
    return '';
}
