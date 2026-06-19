export interface ChatHistoryItem {
    commandName?: string;
    history: {
        role: 'user' | 'assistant';
        content: string;
    }[];
    contextRunState: Record<string, unknown>;
}