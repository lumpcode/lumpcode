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

function presenterModule(
    presentOutput: NonNullable<CommandModule['presentOutput']>,
): Map<string, CommandModule> {
    return new Map([[
        'cursor',
        { command: () => null, presentOutput },
    ]]);
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

    it('writes presenter text, skips empty returns, and passes resolved outputDetail', () => {
        const seen: string[] = [];
        const { lines, onCommandOutput } = sink(presenterModule((_start) => (input) => {
            seen.push(input.outputDetail);
            return input.chunk === 'drop' ? '' : `shown ${input.chunk}`;
        }));
        const base = { contextName: 'ctx', stepIndex: 0 as const, executable: 'cursor-agent', commandName: 'cursor' };
        onCommandOutput({ kind: 'start', ...base });
        onCommandOutput({ kind: 'chunk', ...base, stream: 'stdout', chunk: 'drop' });
        onCommandOutput({ kind: 'chunk', ...base, stream: 'stdout', chunk: 'hello' });
        expect(lines.join('')).toBe('--- myLump ctx 0 cursor-agent\nshown hello');
        expect(seen).toEqual(['loud', 'loud']);
    });

    it('passes quiet from the lump and loud from a step override', () => {
        const seen: string[] = [];
        const { onCommandOutput } = sink(presenterModule((_start) => (input) => {
            seen.push(input.outputDetail);
            return input.chunk;
        }));
        const base = { contextName: 'ctx', stepIndex: 0 as const, executable: 'cursor-agent', commandName: 'cursor' };
        onCommandOutput({
            kind: 'start',
            ...base,
            lumpVariables: { outputDetail: 'quiet' },
        });
        onCommandOutput({ kind: 'chunk', ...base, stream: 'stdout', chunk: 'a' });
        onCommandOutput({
            kind: 'start',
            ...base,
            lumpVariables: { outputDetail: 'quiet' },
            stepVariables: { outputDetail: 'loud' },
        });
        onCommandOutput({ kind: 'chunk', ...base, stream: 'stdout', chunk: 'b' });
        expect(seen).toEqual(['quiet', 'loud']);
    });

    it('leaves chunks raw when there is no presenter, even if outputDetail is invalid', () => {
        const { lines, onCommandOutput } = sink();
        const event = {
            contextName: 'ctx',
            stepIndex: 0 as const,
            executable: 'npm',
            lumpVariables: { outputDetail: 'verbose' },
        };
        onCommandOutput({ kind: 'start', ...event });
        onCommandOutput({ kind: 'chunk', ...event, stream: 'stdout', chunk: 'added 1 package\n' });
        expect(lines.join('')).toBe('--- myLump ctx 0 npm\nadded 1 package\n');
    });

    it('warns and uses loud for invalid outputDetail, then still starts the presenter', () => {
        const seen: string[] = [];
        const factory = vi.fn((_start) => (input) => {
            seen.push(input.outputDetail);
            return input.chunk;
        });
        const { warn, onCommandOutput } = sink(presenterModule(factory));
        const base = { contextName: 'ctx', stepIndex: 0 as const, executable: 'cursor-agent', commandName: 'cursor' };
        onCommandOutput({
            kind: 'start',
            ...base,
            lumpVariables: { outputDetail: 'verbose' },
        });
        onCommandOutput({ kind: 'chunk', ...base, stream: 'stdout', chunk: 'hello' });
        expect(factory).toHaveBeenCalledOnce();
        expect(warn).toHaveBeenCalledWith(expect.stringMatching(/outputDetail[\s\S]*verbose/));
        expect(seen).toEqual(['loud']);
    });

    it('warns and writes the raw chunk when the presenter throws', () => {
        const { lines, warn, onCommandOutput } = sink(presenterModule(
            (_start) => () => { throw new Error('bad frame'); },
        ));
        const base = { contextName: 'ctx', stepIndex: 0 as const, executable: 'cursor-agent', commandName: 'cursor' };
        onCommandOutput({ kind: 'start', ...base });
        onCommandOutput({ kind: 'chunk', ...base, stream: 'stdout', chunk: '{"type":"raw"}\n' });
        expect(lines.join('')).toBe('--- myLump ctx 0 cursor-agent\n{"type":"raw"}\n');
        expect(warn).toHaveBeenCalledWith(expect.stringContaining('bad frame'));
    });
});
