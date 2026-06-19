// PRESET COMMAND : DO NOT MODIFY THIS FILE

import { exec } from 'node:child_process';
import { promisify } from 'node:util';

import { resolveAgentPermissions } from './utils/resolveAgentPermissions.js';
import { resolveCursorConfigDir } from './utils/resolveCursorConfigDir.js';

const execAsync = promisify(exec);

async function createChatId() {
    try {
        const { stdout, stderr } = await execAsync('cursor-agent create-chat');
        const chatId = (stdout || stderr || '').trim();
        if (!chatId) {
            throw new Error('Failed to create chat: no chat ID returned');
        }
        return chatId;
    } catch (error) {
        throw new Error(`Failed to create chat: ${error}`);
    }
}

export const command = (async ({
    prompt,
    stepVariables = {},
    contextRunState,
    stepIndex,
    lumpVariables = {},
    projectRoot,
    workspacePath,
}) => {
    const model = lumpVariables.model ?? stepVariables.model ?? 'auto';
    const { newChat = false, chatIdIndex = null } = stepVariables || {};

    const chatState = contextRunState.cursorSetup ?? (contextRunState.cursorSetup = {});
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
                : 'Chat ID not found in cursor setup state',
        );
    }

    if (newChat) {
        chatId = await createChatId();

        chatState.chatsIds ??= {};
        chatState.chatsIds[chatKey] = chatId;
    }

    const agentPermissions = resolveAgentPermissions({ lumpVariables, stepVariables });
    const configDir = resolveCursorConfigDir({ agentPermissions, projectRoot });

    return {
        executable: 'cursor-agent',
        ...(configDir != null ? { env: { CURSOR_CONFIG_DIR: configDir } } : {}),
        args: [
            '-p',
            trimmedPrompt,
            '--force',
            '--trust',
            '--workspace',
            workspacePath,
            '--sandbox',
            'enabled',
            '--model',
            model,
            '--resume',
            chatId,
        ],
    };
});

export const setup = (async ({}) => {
    const setupChatIdStr = await createChatId();

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
