import { describe, expect, it, vi } from 'vitest';

import * as claudeCode from './claude-code.js';
import * as codex from './codex.js';
import * as copilot from './copilot.js';
import * as cursor from './cursor.js';
import * as opencode from './opencode.js';

vi.mock('node:child_process', async () => {
    const actual = await vi.importActual<typeof import('node:child_process')>('node:child_process');
    return {
        ...actual,
        exec: (
            command: string,
            callback: (error: null, result: { stdout: string; stderr: string }) => void,
        ) => {
            const stdout = command === 'cursor-agent create-chat' ? 'cursor-chat\n' : '';
            callback(null, { stdout, stderr: '' });
            return { stdin: { end() { /* cursor create-chat mock */ } } };
        },
    };
});

vi.mock('./utils/createCodexSession.js', () => ({
    createCodexSession: async () => 'codex-chat',
}));

vi.mock('./utils/createOpenCodeSession.js', () => ({
    createOpenCodeSession: async () => 'opencode-chat',
}));

const prompt = 'do the work';
const chatId = 'chat-1';
const givenSession = 'given-session';
const workspacePath = '/workspace';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const presets = [
    {
        name: 'cursor',
        mod: cursor,
        setupKey: 'cursorSetup',
        executable: 'cursor-agent',
        createdId: 'cursor-chat',
        args(id: string) {
            return [
                '-p', prompt, '--output-format', 'stream-json', '--force', '--trust',
                '--workspace', workspacePath, '--sandbox', 'enabled', '--model', 'auto',
                '--resume', id,
            ];
        },
    },
    {
        name: 'copilot',
        mod: copilot,
        setupKey: 'copilotSetup',
        executable: 'copilot',
        createdId: UUID,
        args(id: string) {
            return [
                '-p', prompt, '--output-format', 'json', '--no-ask-user', '--allow-all-tools',
                '--deny-tool=shell(git commit)', '--deny-tool=shell(git push)',
                '--model', 'auto', '--session-id', id,
            ];
        },
    },
    {
        name: 'claude-code',
        mod: claudeCode,
        setupKey: 'claude-codeSetup',
        executable: 'claude',
        createdId: UUID,
        args(id: string) {
            return [
                '-p', prompt, '--output-format', 'stream-json', '--verbose',
                '--session-id', id, '--permission-mode', 'acceptEdits',
                '--disallowedTools', 'Bash(git commit *)', '--disallowedTools', 'Bash(git push *)',
            ];
        },
    },
    {
        name: 'opencode',
        mod: opencode,
        setupKey: 'opencodeSetup',
        executable: 'opencode',
        createdId: 'opencode-chat',
        args(id: string) {
            return ['run', '--format', 'json', prompt, '-s', id, '--auto'];
        },
    },
    {
        name: 'codex',
        mod: codex,
        setupKey: 'codexSetup',
        executable: 'codex',
        createdId: 'codex-chat',
        args(id: string) {
            return ['exec', '--json', '--sandbox', 'workspace-write', 'resume', id, prompt];
        },
    },
] as const;

type Preset = (typeof presets)[number];

function callCommand(preset: Preset, input: { sessionId?: string; stepVariables?: object; setupChatId?: string } = {}) {
    return preset.mod.command({
        prompt,
        stepIndex: 0,
        workspacePath,
        projectRoot: '/project',
        contextRunState: {
            [preset.setupKey]: { setupChatId: input.setupChatId ?? chatId },
        },
        lumpVariables: {},
        stepVariables: input.stepVariables ?? {},
        ...(input.sessionId !== undefined ? { sessionId: input.sessionId } : {}),
    });
}

describe('preset command sessions', () => {
    it.each(presets)('$name keeps the steps chat when sessionId is absent', async (preset) => {
        const result = await callCommand(preset);
        expect(result).toEqual({
            executable: preset.executable,
            args: preset.args(chatId),
        });
    });

    it('claude-code newChat still replaces the setup chat when sessionId is absent', async () => {
        const result = await claudeCode.command({
            prompt,
            stepIndex: 1,
            workspacePath,
            projectRoot: '/project',
            contextRunState: { 'claude-codeSetup': { setupChatId: chatId } },
            lumpVariables: {},
            stepVariables: { newChat: true },
        });
        const args = (result as { args: string[] }).args;
        const used = args[args.indexOf('--session-id') + 1];
        expect(used).toMatch(UUID);
        expect(used).not.toBe(chatId);
    });

    // Skipped until the preset sessionId exports land. Unskip this block; do not rewrite it.
    describe.skip('workflow sessionId', () => {
        it.each(presets)('$name uses the given sessionId as the chat id', async (preset) => {
            const result = await callCommand(preset, {
                sessionId: givenSession,
                setupChatId: 'setup-chat',
                stepVariables: { newChat: true },
            });
            expect(result).toEqual({
                executable: preset.executable,
                args: preset.args(givenSession),
            });
        });

        it.each(presets)('$name setup returns the chat it created as sessionId', async (preset) => {
            const result = await preset.mod.setup({
                contextList: [],
                lumpVariables: {},
                currentContextIndex: 0,
            }) as {
                sessionId?: string;
                contextRunState?: { setupChatId?: string; chatsIds?: Record<string, string> };
            };

            expect(result.sessionId).toBeTruthy();
            expect(result.sessionId).toBe(result.contextRunState?.setupChatId);
            expect(result.contextRunState?.chatsIds?.['0']).toBe(result.sessionId);
            if (preset.createdId instanceof RegExp) {
                expect(result.sessionId).toMatch(preset.createdId);
            } else {
                expect(result.sessionId).toBe(preset.createdId);
            }
        });

        it.each(presets)('$name createSession returns a new chat id', async (preset) => {
            const createSession = (preset.mod as { createSession?: (input: {
                lumpVariables: object;
                model?: string;
                workspacePath: string;
            }) => Promise<string> }).createSession;
            expect(createSession).toEqual(expect.any(Function));
            const id = await createSession!({
                lumpVariables: {},
                model: 'auto',
                workspacePath,
            });
            if (preset.createdId instanceof RegExp) {
                expect(id).toMatch(preset.createdId);
            } else {
                expect(id).toBe(preset.createdId);
            }
        });
    });
});
