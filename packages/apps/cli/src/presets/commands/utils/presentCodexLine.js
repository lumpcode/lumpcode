import { toolLine } from './presentNdjson.js';

function fileChangeTarget(item) {
    const change = Array.isArray(item.changes) ? item.changes[0] : undefined;
    return change?.path || item.path || '';
}

export function presentCodexEvent(event) {
    if (!event || typeof event !== 'object') return '';
    const item = event.item;
    if (!item || typeof item !== 'object') return '';
    if (event.type === 'item.completed' && item.type === 'agent_message' && item.text) {
        return `${item.text}\n`;
    }
    if (event.type === 'item.started' && item.type === 'command_execution') {
        return toolLine('command_execution', item.command || '');
    }
    if (event.type === 'item.completed' && item.type === 'file_change') {
        return toolLine('file_change', fileChangeTarget(item));
    }
    if (event.type === 'item.started' && item.type === 'mcp_tool_call') {
        return toolLine(item.tool || 'mcp_tool_call', item.server || '');
    }
    return '';
}
