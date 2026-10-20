// PRESET COMMAND : DO NOT MODIFY THIS FILE

import { randomUUID } from 'node:crypto';

import { resolveAgentPermissions } from './utils/resolveAgentPermissions.js';
import {
    initialPresetChatRunState,
    resolvePresetChatSession,
} from './utils/resolvePresetChatSession.js';
import { resolveCopilotToolArgs } from './utils/resolveCopilotToolArgs.js';
import { createNdjsonPresenter } from './utils/presentNdjson.js';
import { presentCopilotEvent } from './utils/presentCopilotLine.js';

export const command = (async ({ 
    prompt, 
    stepVariables = {}, 
    contextRunState, 
    stepIndex, 
    lumpVariables = {}, 
}) => {
    const model = stepVariables.model ?? lumpVariables.model ?? 'auto';

    const trimmedPrompt = (prompt ?? '').trim();
    const chatId = await resolvePresetChatSession({
        prompt: trimmedPrompt,
        contextRunState,
        setupStateKey: 'copilotSetup',
        stepIndex,
        stepVariables,
        createChatId: randomUUID,
    });
    if (chatId == null) return null;

    const agentPermissions = resolveAgentPermissions({ lumpVariables, stepVariables });
    const permissionArgs = resolveCopilotToolArgs({ agentPermissions });

    return {
        executable: 'copilot',
        args: [
            '-p',
            trimmedPrompt,
            '--output-format',
            'json',
            '--no-ask-user',
            ...permissionArgs,
            '--model',
            model,
            '--session-id',
            chatId,
        ],
    };
});

export const setup = (({}) => {
    return initialPresetChatRunState(randomUUID());
});

export const teardown = ((() => {
    return;
}));

export const presentOutput = () => createNdjsonPresenter(presentCopilotEvent);
