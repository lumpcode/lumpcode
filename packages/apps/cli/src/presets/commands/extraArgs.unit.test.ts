import { describe, expect, it } from 'vitest';

import { command as claudeCode } from './claude-code.js';
import { command as codex } from './codex.js';
import { command as copilot } from './copilot.js';
import { command as cursor } from './cursor.js';
import { command as opencode } from './opencode.js';

const prompt = 'do the work';
const chatId = 'chat-1';
const workspacePath = '/workspace';

const presets = [
    {
        name: 'cursor',
        command: cursor,
        setupKey: 'cursorSetup',
        executable: 'cursor-agent',
        args: [
            '-p',
            prompt,
            '--output-format',
            'stream-json',
            '--force',
            '--trust',
            '--workspace',
            workspacePath,
            '--sandbox',
            'enabled',
            '--model',
            'auto',
            '--resume',
            chatId,
        ],
    },
    {
        name: 'copilot',
        command: copilot,
        setupKey: 'copilotSetup',
        executable: 'copilot',
        args: [
            '-p',
            prompt,
            '--output-format',
            'json',
            '--no-ask-user',
            '--allow-all-tools',
            '--deny-tool=shell(git commit)',
            '--deny-tool=shell(git push)',
            '--model',
            'auto',
            '--session-id',
            chatId,
        ],
    },
    {
        name: 'claude-code',
        command: claudeCode,
        setupKey: 'claude-codeSetup',
        executable: 'claude',
        args: [
            '-p',
            prompt,
            '--output-format',
            'stream-json',
            '--verbose',
            '--session-id',
            chatId,
            '--permission-mode',
            'acceptEdits',
            '--disallowedTools',
            'Bash(git commit *)',
            '--disallowedTools',
            'Bash(git push *)',
        ],
    },
    {
        name: 'opencode',
        command: opencode,
        setupKey: 'opencodeSetup',
        executable: 'opencode',
        args: [
            'run',
            '--format',
            'json',
            prompt,
            '-s',
            chatId,
            '--auto',
        ],
    },
    {
        name: 'codex',
        command: codex,
        setupKey: 'codexSetup',
        executable: 'codex',
        args: [
            'exec',
            '--json',
            '--sandbox',
            'workspace-write',
            'resume',
            chatId,
            prompt,
        ],
    },
] as const;

function argsWithExtra(name: string, baseline: readonly string[], extra: string[]) {
    if (name === 'codex') {
        const resumeAt = baseline.indexOf('resume');
        return [...baseline.slice(0, resumeAt), ...extra, ...baseline.slice(resumeAt)];
    }
    return [...baseline, ...extra];
}

function callCommand(
    command: (typeof presets)[number]['command'],
    setupKey: string,
    variables: { lumpVariables?: object; stepVariables?: object } = {},
) {
    return command({
        prompt,
        stepIndex: 0,
        workspacePath,
        projectRoot: '/project',
        contextRunState: { [setupKey]: { setupChatId: chatId } },
        lumpVariables: variables.lumpVariables ?? {},
        stepVariables: variables.stepVariables ?? {},
    });
}

describe('preset extraArgs', () => {
    it.each(presets)('$name keeps today\'s argv when extraArgs is unset', async (preset) => {
        const result = await callCommand(preset.command, preset.setupKey);
        expect(result).toEqual({
            executable: preset.executable,
            args: [...preset.args],
        });
    });

    it.each(presets)('$name places lump extraArgs at the documented position', async (preset) => {
        const extra = ['--flag', 'v'];
        const result = await callCommand(preset.command, preset.setupKey, {
            lumpVariables: { extraArgs: extra },
        });
        const args = argsWithExtra(preset.name, preset.args, extra);
        expect(result).toEqual({
            executable: preset.executable,
            args,
        });
        if (preset.name === 'codex') {
            expect(args.indexOf('--flag')).toBeLessThan(args.indexOf('resume'));
            expect(args.indexOf('v')).toBeLessThan(args.indexOf('resume'));
            expect(args.indexOf('resume')).toBeLessThan(args.indexOf(chatId));
        }
    });

    it.each(presets)('$name uses the step extraArgs list instead of the lump list', async (preset) => {
        const result = await callCommand(preset.command, preset.setupKey, {
            lumpVariables: { extraArgs: ['--lump', 'a'] },
            stepVariables: { extraArgs: ['--step', 'b'] },
        });
        expect(result).toEqual({
            executable: preset.executable,
            args: argsWithExtra(preset.name, preset.args, ['--step', 'b']),
        });
    });
});
