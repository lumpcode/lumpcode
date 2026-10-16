import { describe, expect, it, vi } from 'vitest';

import type { CommandModule } from '../../types/CommandModule';
import { createLiveStepOutput } from './liveStepOutput';

function sink(modules?: Map<string, CommandModule>) {
    const lines: string[] = [];
    const warn = vi.fn();
    const live = createLiveStepOutput({
        lumpName: 'myLump',
        write: (text) => { lines.push(text); },
        logger: { warn },
    });
    if (modules) live.setCommandModules(modules);
    return { lines, warn, onCommandOutput: live.onCommandOutput };
}

describe('createLiveStepOutput', () => {
    it('writes a header and the raw chunk when no presenter is registered', () => {
        const { lines, onCommandOutput } = sink();
        const event = { contextName: 'ctx', stepIndex: 0 as const, executable: 'npm' };
        onCommandOutput({ kind: 'start', ...event });
        onCommandOutput({ kind: 'chunk', ...event, stream: 'stdout', chunk: 'added 1 package\n' });
        onCommandOutput({ kind: 'end', ...event, succeeded: true });
        expect(lines.join('')).toBe('--- myLump ctx 0 npm\nadded 1 package\n');
    });

    it('joins a nested step index with dots', () => {
        const { lines, onCommandOutput } = sink();
        onCommandOutput({
            kind: 'start',
            contextName: 'ctx',
            stepIndex: [0, 1],
            executable: 'npm',
        });
        expect(lines.join('')).toBe('--- myLump ctx 0.1 npm\n');
    });

    it('writes presenter text, skips empty returns, and passes outputDetail loud', () => {
        const seen: string[] = [];
        const modules = new Map<string, CommandModule>([[
            'cursor',
            {
                command: () => null,
                presentOutput: (_start) => (input) => {
                    seen.push(input.outputDetail);
                    return input.chunk === 'drop' ? '' : `shown ${input.chunk}`;
                },
            },
        ]]);
        const { lines, onCommandOutput } = sink(modules);
        const base = { contextName: 'ctx', stepIndex: 0 as const, executable: 'cursor-agent', commandName: 'cursor' };
        onCommandOutput({ kind: 'start', ...base });
        onCommandOutput({ kind: 'chunk', ...base, stream: 'stdout', chunk: 'drop' });
        onCommandOutput({ kind: 'chunk', ...base, stream: 'stdout', chunk: 'hello' });
        expect(lines.join('')).toBe('--- myLump ctx 0 cursor-agent\nshown hello');
        expect(seen).toEqual(['loud', 'loud']);
    });

    it('warns and writes the raw chunk when the presenter throws', () => {
        const modules = new Map<string, CommandModule>([[
            'cursor',
            {
                command: () => null,
                presentOutput: (_start) => () => { throw new Error('bad frame'); },
            },
        ]]);
        const { lines, warn, onCommandOutput } = sink(modules);
        const base = { contextName: 'ctx', stepIndex: 0 as const, executable: 'cursor-agent', commandName: 'cursor' };
        onCommandOutput({ kind: 'start', ...base });
        onCommandOutput({ kind: 'chunk', ...base, stream: 'stdout', chunk: '{"type":"raw"}\n' });
        expect(lines.join('')).toBe('--- myLump ctx 0 cursor-agent\n{"type":"raw"}\n');
        expect(warn).toHaveBeenCalledWith(expect.stringContaining('bad frame'));
    });
});
