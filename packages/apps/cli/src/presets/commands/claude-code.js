// PRESET COMMAND : DO NOT MODIFY THIS FILE

import { randomUUID } from 'node:crypto';

import { resolveAgentPermissions } from './utils/resolveAgentPermissions.js';
import { resolveClaudeCodeArgs } from './utils/resolveClaudeCodeArgs.js';
import {
    initialPresetChatRunState,
    resolvePresetChatSession,
} from './utils/resolvePresetChatSession.js';
import { createNdjsonPresenter } from './utils/presentNdjson.js';
import { presentClaudeCodeEvent } from './utils/presentClaudeCodeLine.js';

export const command = (async ({
    prompt,
    stepVariables = {},
    contextRunState,
    stepIndex,
    lumpVariables = {},
}) => {
    const model = stepVariables.model ?? lumpVariables.model;

    const trimmedPrompt = (prompt ?? '').trim();
    const chatId = await resolvePresetChatSession({
        prompt: trimmedPrompt,
        contextRunState,
        setupStateKey: 'claude-codeSetup',
        stepIndex,
        stepVariables,
        createChatId: randomUUID,
    });
    if (chatId == null) return null;

    const agentPermissions = resolveAgentPermissions({ lumpVariables, stepVariables });
    const permissionArgs = resolveClaudeCodeArgs({ agentPermissions, model });

    return {
        executable: 'claude',
        args: [
            '-p',
            trimmedPrompt,
            '--output-format',
            'stream-json',
            '--verbose',
            '--session-id',
            chatId,
            ...permissionArgs,
        ],
    };
});

export const setup = (({}) => {
    return initialPresetChatRunState(randomUUID());
});

export const teardown = ((() => {
    return;
}));

export const presentOutput = () => createNdjsonPresenter(presentClaudeCodeEvent);
