// PRESET COMMAND : DO NOT MODIFY THIS FILE

import { resolveAgentPermissions } from './utils/resolveAgentPermissions.js';
import { createCodexSession } from './utils/createCodexSession.js';
import { resolveCodexArgs } from './utils/resolveCodexArgs.js';

export const command = (async ({
    prompt,
    stepVariables = {},
    contextRunState,
    stepIndex,
    lumpVariables = {},
}) => {
    const model = stepVariables.model ?? lumpVariables.model;
    const { newChat = false, chatIdIndex = null } = stepVariables || {};

    const chatState = contextRunState.codexSetup ?? (contextRunState.codexSetup = {});
    const chatKey = Array.isArray(stepIndex) ? stepIndex.join('.') : String(stepIndex);

    const trimmedPrompt = (prompt ?? '').trim();
    if (!trimmedPrompt) return null;

    let chatId = chatIdIndex != null
        ? chatState.chatsIds?.[chatIdIndex]
        : chatState.setupChatId;

    if (!chatId) {
        throw new Error(
            chatIdIndex != null
                ? `Chat ID not found for index: ${chatIdIndex}`
                : 'Chat ID not found in codex setup state',
        );
    }

    if (newChat) {
        chatId = await createCodexSession({ model });

        chatState.chatsIds ??= {};
        chatState.chatsIds[chatKey] = chatId;
    }

    const agentPermissions = resolveAgentPermissions({ lumpVariables, stepVariables });
    const optionArgs = resolveCodexArgs({ agentPermissions, model });

    return {
        executable: 'codex',
        args: [
            'exec',
            ...optionArgs,
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
        contextRunState: {
            setupChatId: setupChatIdStr,
            chatsIds: {
                '0': setupChatIdStr,
            },
        },
    };
});

export const teardown = ((() => {
    return;
}));
