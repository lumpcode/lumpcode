// PRESET COMMAND : DO NOT MODIFY THIS FILE

import { randomUUID } from 'node:crypto';

import { resolveAgentPermissions } from './utils/resolveAgentPermissions.js';
import { resolveCopilotToolArgs } from './utils/resolveCopilotToolArgs.js';

export const command = (async ({ prompt, stepVariables = {}, contextRunState, stepIndex, lumpVariables = {} }) => {
    const model = lumpVariables.model ?? stepVariables.model ?? 'auto';
    const { newChat = false, chatIdIndex = null } = stepVariables || {};

    const chatState = contextRunState.copilotSetup ?? (contextRunState.copilotSetup = {});
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
                : 'Chat ID not found in copilot setup state',
        );
    }

    if (newChat) {
        chatId = randomUUID();

        chatState.chatsIds ??= {};
        chatState.chatsIds[chatKey] = chatId;
    }

    const agentPermissions = resolveAgentPermissions({ lumpVariables, stepVariables });
    const permissionArgs = resolveCopilotToolArgs({ agentPermissions });

    return {
        executable: 'copilot',
        args: [
            '-p',
            trimmedPrompt,
            '--no-ask-user',
            '--silent',
            ...permissionArgs,
            '--model',
            model,
            '--session-id',
            chatId,
        ],
    };
});

export const setup = (({}) => {
    const setupChatIdStr = randomUUID();

    return {
        contextRunState: {
            setupChatId: setupChatIdStr,
            chatsIds: {
                "0": setupChatIdStr,
            }
        }
    };
});

export const teardown = ((() => {
    return;
}));
