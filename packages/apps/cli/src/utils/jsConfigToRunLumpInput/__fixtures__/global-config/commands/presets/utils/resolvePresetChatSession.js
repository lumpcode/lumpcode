export async function resolvePresetChatSession(input) {
    const {
        prompt,
        contextRunState,
        setupStateKey,
        stepIndex,
        stepVariables = {},
        createChatId,
    } = input;

    const trimmedPrompt = (prompt ?? '').trim();
    if (!trimmedPrompt) return null;

    const { newChat = false, chatIdIndex = null } = stepVariables;
    const chatState = contextRunState[setupStateKey] ??
        (contextRunState[setupStateKey] = {});
    const chatKey = Array.isArray(stepIndex) ? stepIndex.join('.') : String(stepIndex);

    let chatId =
        chatIdIndex != null ? chatState.chatsIds?.[chatIdIndex] : chatState.setupChatId;

    if (!chatId) {
        const agentLabel = setupStateKey.replace(/Setup$/, '');
        throw new Error(
            chatIdIndex != null
                ? `Chat ID not found for index: ${chatIdIndex}`
                : `Chat ID not found in ${agentLabel} setup state`,
        );
    }

    if (newChat) {
        chatId = await createChatId();
        chatState.chatsIds ??= {};
        chatState.chatsIds[chatKey] = chatId;
    }

    return chatId;
}

export function initialPresetChatRunState(setupChatId) {
    return {
        contextRunState: {
            setupChatId,
            chatsIds: {
                '0': setupChatId,
            },
        },
    };
}
