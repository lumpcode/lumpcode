import { describe, expect, it } from 'vitest';

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

function presented(factory: PresentOutputFnFactory, chunk: string) {
    const present = factory(factoryStart);
    return present({ stream: 'stdout', chunk: `${chunk}\n`, outputDetail: 'loud' }) ?? '';
}

describe('preset presentOutput', () => {
    it('cursor presents assistant text and a tool line, not the raw frame', () => {
        const present = presentCursor(factoryStart);
        const assistant = '{"type":"assistant","message":{"content":[{"type":"text","text":"Updating the button."}]}}\n';
        const tool = '{"type":"tool_call","subtype":"started","tool_call":{"readToolCall":{"args":{"path":"src/Button.tsx"}}}}\n';
        const text = `${present({ stream: 'stdout', chunk: assistant, outputDetail: 'loud' }) ?? ''}${present({ stream: 'stdout', chunk: tool, outputDetail: 'loud' }) ?? ''}`;
        expect(text).toBe('Updating the button.\ntool read src/Button.tsx\n');
        expect(text).not.toContain('{"type"');
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

    it('claude-code presents assistant text and a tool line', () => {
        const text = presented(
            presentClaude,
            '{"type":"assistant","message":{"content":[{"type":"text","text":"I\'ll read it."},{"type":"tool_use","name":"Read","input":{"file_path":"src/Button.tsx"}}]}}',
        );
        expect(text).toBe("I'll read it.\ntool Read src/Button.tsx\n");
        expect(text).not.toContain('{"type"');
    });

    it('copilot presents assistant text and a tool line', () => {
        const present = presentCopilot(factoryStart);
        const text = [
            '{"type":"assistant.message","data":{"content":"Hello"}}\n',
            '{"type":"tool.execution_start","data":{"toolName":"bash","arguments":{"command":"npm test"}}}\n',
        ].map((chunk) => present({ stream: 'stdout', chunk, outputDetail: 'loud' }) ?? '').join('');
        expect(text).toBe('Hello\ntool bash npm test\n');
        expect(text).not.toContain('{"type"');
    });

    it('codex presents assistant text and a tool line', () => {
        const present = presentCodex(factoryStart);
        const text = [
            '{"type":"item.completed","item":{"type":"agent_message","text":"Done."}}\n',
            '{"type":"item.started","item":{"type":"command_execution","command":"npm test"}}\n',
        ].map((chunk) => present({ stream: 'stdout', chunk, outputDetail: 'loud' }) ?? '').join('');
        expect(text).toBe('Done.\ntool command_execution npm test\n');
        expect(text).not.toContain('{"type"');
    });

    it('opencode presents assistant text and a tool line', () => {
        const present = presentOpenCode(factoryStart);
        const text = [
            '{"type":"text","part":{"text":"Updating the button."}}\n',
            '{"type":"tool_use","part":{"tool":"bash","state":{"input":{"command":"npm test"}}}}\n',
        ].map((chunk) => present({ stream: 'stdout', chunk, outputDetail: 'loud' }) ?? '').join('');
        expect(text).toBe('Updating the button.\ntool bash npm test\n');
        expect(text).not.toContain('{"type"');
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
