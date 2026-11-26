// PRESET COMMAND : DO NOT MODIFY THIS FILE

import { resolveAgentPermissions } from './utils/resolveAgentPermissions.js';
import { resolvePresetExtraArgs } from './utils/resolvePresetExtraArgs.js';
import { createCodexSession } from './utils/createCodexSession.js';
import {
    initialPresetChatRunState,
    resolvePresetChatSession,
} from './utils/resolvePresetChatSession.js';
import { resolveCodexArgs } from './utils/resolveCodexArgs.js';
import { createNdjsonPresenter } from './utils/presentNdjson.js';
import { presentCodexEvent } from './utils/presentCodexLine.js';

export const createSession = async ({ model } = {}) => createCodexSession({ model });

export const command = (async ({
    prompt,
    sessionId,
    stepVariables = {},
    contextRunState,
    stepIndex,
    lumpVariables = {},
}) => {
    const model = stepVariables.model ?? lumpVariables.model;

    const trimmedPrompt = (prompt ?? '').trim();
    const chatId = sessionId ?? await resolvePresetChatSession({
        prompt: trimmedPrompt,
        contextRunState,
        setupStateKey: 'codexSetup',
        stepIndex,
        stepVariables,
        createChatId: () => createCodexSession({ model }),
    });
    if (chatId == null) return null;

    const agentPermissions = resolveAgentPermissions({ lumpVariables, stepVariables });
    const extraArgs = resolvePresetExtraArgs({ lumpVariables, stepVariables });
    const optionArgs = resolveCodexArgs({ agentPermissions, model });

    return {
        executable: 'codex',
        args: [
            'exec',
            ...optionArgs,
            ...extraArgs,
            'resume',
            chatId,
            trimmedPrompt,
        ],
    };
});

export const setup = (async ({ lumpVariables = {} }) => {
    const setupChatIdStr = await createCodexSession({
        model: lumpVariables.model,
    });

    return {
        ...initialPresetChatRunState(setupChatIdStr),
        sessionId: setupChatIdStr,
    };
});

export const teardown = ((() => {
    return;
}));

export const presentOutput = () => createNdjsonPresenter(presentCodexEvent);
