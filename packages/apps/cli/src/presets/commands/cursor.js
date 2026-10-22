// PRESET COMMAND : DO NOT MODIFY THIS FILE

import { exec } from 'node:child_process';
import { promisify } from 'node:util';

import { resolveAgentPermissions } from './utils/resolveAgentPermissions.js';
import { resolveCursorConfigDir } from './utils/resolveCursorConfigDir.js';
import {
    initialPresetChatRunState,
    resolvePresetChatSession,
} from './utils/resolvePresetChatSession.js';
import { createNdjsonPresenter } from './utils/presentNdjson.js';
import { presentCursorEvent } from './utils/presentCursorLine.js';

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
    const model = stepVariables.model ?? lumpVariables.model ?? 'auto';

    const trimmedPrompt = (prompt ?? '').trim();
    const chatId = await resolvePresetChatSession({
        prompt: trimmedPrompt,
        contextRunState,
        setupStateKey: 'cursorSetup',
        stepIndex,
        stepVariables,
        createChatId,
    });
    if (chatId == null) return null;

    const agentPermissions = resolveAgentPermissions({ lumpVariables, stepVariables });
    const configDir = resolveCursorConfigDir({ agentPermissions, projectRoot });

    return {
        executable: 'cursor-agent',
        ...(configDir != null ? { env: { CURSOR_CONFIG_DIR: configDir } } : {}),
        args: [
            '-p',
            trimmedPrompt,
            '--output-format',
            'stream-json',
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

    return initialPresetChatRunState(setupChatIdStr);
});

export const teardown = ((() => {
    return;
}));

export const presentOutput = () => createNdjsonPresenter(presentCursorEvent);
