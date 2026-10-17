import { describe, expect, it } from 'vitest';

import type { OutputDetail } from '../../types/OutputDetail';
import type { PresentOutputFnFactory } from '../../types/PresentOutputFn';

import { presentOutput as presentClaude } from './claude-code.js';
import { presentOutput as presentCodex } from './codex.js';
import { presentOutput as presentCopilot } from './copilot.js';
import { presentOutput as presentCursor } from './cursor.js';
import { presentOutput as presentOpenCode } from './opencode.js';

const factoryStart = {
    lumpVariables: {},
    contextName: 'ctx',
    stepIndex: 0 as const,
    executable: 'agent',
};

function feed(factory: PresentOutputFnFactory, chunks: string[], outputDetail: OutputDetail) {
    const present = factory(factoryStart);
    return chunks.map((chunk) => present({ stream: 'stdout', chunk, outputDetail }) ?? '').join('');
}

describe('preset presentOutput', () => {
    it('cursor: loud includes a tool line, quiet does not, neither includes the raw frame', () => {
        const chunks = [
            '{"type":"assistant","message":{"content":[{"type":"text","text":"Updating the button."}]}}\n',
            '{"type":"tool_call","subtype":"started","tool_call":{"readToolCall":{"args":{"path":"src/Button.tsx"}}}}\n',
        ];
        const loud = feed(presentCursor, chunks, 'loud');
        const quiet = feed(presentCursor, chunks, 'quiet');
        expect(loud).toBe('Updating the button.\ntool read src/Button.tsx\n');
        expect(quiet).toBe('Updating the button.\n');
        expect(loud).not.toContain('{"type"');
        expect(quiet).not.toContain('{"type"');
    });

    it('cursor presents a line split across chunks once', () => {
        const present = presentCursor(factoryStart);
        const first = present({
            stream: 'stdout',
            chunk: '{"type":"assistant","message":{"content":[{"type":"text","text":"Up',
            outputDetail: 'loud',
        });
        const second = present({
            stream: 'stdout',
            chunk: 'dating the button."}]}}\n',
            outputDetail: 'loud',
        });
        expect(first).toBeUndefined();
        expect(second).toBe('Updating the button.\n');
    });

    it('claude-code: loud includes a tool line, quiet keeps mixed assistant text', () => {
        const chunks = [
            '{"type":"assistant","message":{"content":[{"type":"text","text":"I\'ll read it."},{"type":"tool_use","name":"Read","input":{"file_path":"src/Button.tsx"}}]}}\n',
        ];
        const loud = feed(presentClaude, chunks, 'loud');
        const quiet = feed(presentClaude, chunks, 'quiet');
        expect(loud).toBe("I'll read it.\ntool Read src/Button.tsx\n");
        expect(quiet).toBe("I'll read it.\n");
        expect(loud).not.toContain('{"type"');
        expect(quiet).not.toContain('{"type"');
    });

    it('copilot: loud includes a tool line, quiet does not', () => {
        const chunks = [
            '{"type":"assistant.message","data":{"content":"Hello"}}\n',
            '{"type":"tool.execution_start","data":{"toolName":"bash","arguments":{"command":"npm test"}}}\n',
        ];
        const loud = feed(presentCopilot, chunks, 'loud');
        const quiet = feed(presentCopilot, chunks, 'quiet');
        expect(loud).toBe('Hello\ntool bash npm test\n');
        expect(quiet).toBe('Hello\n');
        expect(loud).not.toContain('{"type"');
        expect(quiet).not.toContain('{"type"');
    });

    it('codex: loud includes a tool line, quiet does not', () => {
        const chunks = [
            '{"type":"item.completed","item":{"type":"agent_message","text":"Done."}}\n',
            '{"type":"item.started","item":{"type":"command_execution","command":"npm test"}}\n',
            '{"type":"item.completed","item":{"type":"file_change","path":"src/Button.tsx"}}\n',
            '{"type":"item.started","item":{"type":"mcp_tool_call","tool":"search","server":"docs"}}\n',
        ];
        const loud = feed(presentCodex, chunks, 'loud');
        const quiet = feed(presentCodex, chunks, 'quiet');
        expect(loud).toBe('Done.\ntool command_execution npm test\ntool file_change src/Button.tsx\ntool search docs\n');
        expect(quiet).toBe('Done.\n');
        expect(loud).not.toContain('{"type"');
        expect(quiet).not.toContain('{"type"');
    });

    it('opencode: loud includes a tool line, quiet does not', () => {
        const chunks = [
            '{"type":"text","part":{"text":"Updating the button."}}\n',
            '{"type":"tool_use","part":{"tool":"bash","state":{"input":{"command":"npm test"}}}}\n',
        ];
        const loud = feed(presentOpenCode, chunks, 'loud');
        const quiet = feed(presentOpenCode, chunks, 'quiet');
        expect(loud).toBe('Updating the button.\ntool bash npm test\n');
        expect(quiet).toBe('Updating the button.\n');
        expect(loud).not.toContain('{"type"');
        expect(quiet).not.toContain('{"type"');
    });

    it('drops a result frame and writes a non-json line', () => {
        const present = presentCursor(factoryStart);
        expect(present({
            stream: 'stdout',
            chunk: '{"type":"result","result":"done"}\n',
            outputDetail: 'loud',
        })).toBeUndefined();
        expect(present({
            stream: 'stderr',
            chunk: 'warning: slow\n',
            outputDetail: 'loud',
        })).toBe('warning: slow\n');
    });
});
