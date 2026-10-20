// PRESET COMMAND : DO NOT MODIFY THIS FILE

import { resolveAgentPermissions } from './utils/resolveAgentPermissions.js';
import { createOpenCodeSession } from './utils/createOpenCodeSession.js';
import {
    initialPresetChatRunState,
    resolvePresetChatSession,
} from './utils/resolvePresetChatSession.js';
import { resolveOpenCodeArgs } from './utils/resolveOpenCodeArgs.js';
import { createNdjsonPresenter } from './utils/presentNdjson.js';
import { presentOpenCodeEvent } from './utils/presentOpenCodeLine.js';

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
        setupStateKey: 'opencodeSetup',
        stepIndex,
        stepVariables,
        createChatId: () => createOpenCodeSession({ model }),
    });
    if (chatId == null) return null;

    const agentPermissions = resolveAgentPermissions({ lumpVariables, stepVariables });
    const optionArgs = resolveOpenCodeArgs({ agentPermissions, model });

    return {
        executable: 'opencode',
        args: [
            'run',
            '--format',
            'json',
            trimmedPrompt,
            '-s',
            chatId,
            ...optionArgs,
        ],
    };
});

export const setup = (async ({ lumpVariables = {} }) => {
    const setupChatIdStr = await createOpenCodeSession({
        model: lumpVariables.model,
    });

    return initialPresetChatRunState(setupChatIdStr);
});

export const teardown = ((() => {
    return;
}));

export const presentOutput = () => createNdjsonPresenter(presentOpenCodeEvent);
