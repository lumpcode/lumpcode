import { describe, expect, it, vi } from 'vitest';

import {
    initialPresetChatRunState,
    resolvePresetChatSession,
} from './resolvePresetChatSession.js';

describe('resolvePresetChatSession', () => {
    it('returns null for empty or whitespace-only prompt', async () => {
        const contextRunState = { copilotSetup: { setupChatId: 'id' } };
        expect(
            await resolvePresetChatSession({
                prompt: '',
                contextRunState,
                setupStateKey: 'copilotSetup',
                stepIndex: 0,
                createChatId: () => 'new',
            }),
        ).toBeNull();
        expect(
            await resolvePresetChatSession({
                prompt: '   \n',
                contextRunState,
                setupStateKey: 'copilotSetup',
                stepIndex: 0,
                createChatId: () => 'new',
            }),
        ).toBeNull();
    });

    it('throws agent-label message when setup chat id is missing', async () => {
        await expect(
            resolvePresetChatSession({
                prompt: 'hi',
                contextRunState: {},
                setupStateKey: 'copilotSetup',
                stepIndex: 0,
                createChatId: () => 'new',
            }),
        ).rejects.toThrow('Chat ID not found in copilot setup state');
    });

    it('throws index message when chatIdIndex lookup misses', async () => {
        await expect(
            resolvePresetChatSession({
                prompt: 'hi',
                contextRunState: { codexSetup: { setupChatId: 'main' } },
                setupStateKey: 'codexSetup',
                stepIndex: 0,
                stepVariables: { chatIdIndex: '2' },
                createChatId: () => 'new',
            }),
        ).rejects.toThrow('Chat ID not found for index: 2');
    });

    it('resolves setupChatId and stores new chat under dotted stepIndex', async () => {
        const createChatId = vi.fn(async () => 'fresh-id');
        const contextRunState = {
            cursorSetup: { setupChatId: 'seed', chatsIds: { '0': 'seed' } },
        };

        const chatId = await resolvePresetChatSession({
            prompt: 'go',
            contextRunState,
            setupStateKey: 'cursorSetup',
            stepIndex: [1, 2],
            stepVariables: { newChat: true },
            createChatId,
        });

        expect(chatId).toBe('fresh-id');
        expect(createChatId).toHaveBeenCalledOnce();
        expect(contextRunState.cursorSetup.chatsIds).toEqual({
            '0': 'seed',
            '1.2': 'fresh-id',
        });
    });

    it('uses indexed chat id when chatIdIndex is set', async () => {
        const contextRunState = {
            opencodeSetup: {
                setupChatId: 'main',
                chatsIds: { '0': 'main', '1': 'branch-chat' },
            },
        };

        const chatId = await resolvePresetChatSession({
            prompt: 'x',
            contextRunState,
            setupStateKey: 'opencodeSetup',
            stepIndex: 0,
            stepVariables: { chatIdIndex: '1' },
            createChatId: () => 'unused',
        });

        expect(chatId).toBe('branch-chat');
    });
});

describe('initialPresetChatRunState', () => {
    it('returns setupChatId and chatsIds with key 0', () => {
        expect(initialPresetChatRunState('abc-123')).toEqual({
            contextRunState: {
                setupChatId: 'abc-123',
                chatsIds: { '0': 'abc-123' },
            },
        });
    });
});
