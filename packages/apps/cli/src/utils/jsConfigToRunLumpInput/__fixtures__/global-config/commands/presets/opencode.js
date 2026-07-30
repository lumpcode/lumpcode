// PRESET COMMAND : DO NOT MODIFY THIS FILE

import { resolveAgentPermissions } from './utils/resolveAgentPermissions.js';
import { createOpenCodeSession } from './utils/createOpenCodeSession.js';
import { resolveOpenCodeArgs } from './utils/resolveOpenCodeArgs.js';

export const command = (async ({
    prompt,
    stepVariables = {},
    contextRunState,
    stepIndex,
    lumpVariables = {},
}) => {
    const model = stepVariables.model ?? lumpVariables.model;
    const { newChat = false, chatIdIndex = null } = stepVariables || {};

    const chatState = contextRunState.opencodeSetup ?? (contextRunState.opencodeSetup = {});
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
                : 'Chat ID not found in opencode setup state',
        );
    }

    if (newChat) {
        chatId = await createOpenCodeSession({ model });

        chatState.chatsIds ??= {};
        chatState.chatsIds[chatKey] = chatId;
    }

    const agentPermissions = resolveAgentPermissions({ lumpVariables, stepVariables });
    const optionArgs = resolveOpenCodeArgs({ agentPermissions, model });

    return {
        executable: 'opencode',
        args: [
            'run',
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
