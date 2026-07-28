// PRESET COMMAND : DO NOT MODIFY THIS FILE

import { randomUUID } from 'node:crypto';

import { resolveAgentPermissions } from './utils/resolveAgentPermissions.js';
import { resolveClaudeCodeArgs } from './utils/resolveClaudeCodeArgs.js';

export const command = (async ({
    prompt,
    stepVariables = {},
    contextRunState,
    stepIndex,
    lumpVariables = {},
}) => {
    const model = stepVariables.model ?? lumpVariables.model;
    const { newChat = false, chatIdIndex = null } = stepVariables || {};

    const chatState = contextRunState['claude-codeSetup'] ?? (contextRunState['claude-codeSetup'] = {});
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
                : 'Chat ID not found in claude-code setup state',
        );
    }

    if (newChat) {
        chatId = randomUUID();

        chatState.chatsIds ??= {};
        chatState.chatsIds[chatKey] = chatId;
    }

    const agentPermissions = resolveAgentPermissions({ lumpVariables, stepVariables });
    const permissionArgs = resolveClaudeCodeArgs({ agentPermissions, model });

    return {
        executable: 'claude',
        args: [
            '-p',
            trimmedPrompt,
            '--session-id',
            chatId,
            ...permissionArgs,
        ],
    };
});

export const setup = (({}) => {
    const setupChatIdStr = randomUUID();

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
