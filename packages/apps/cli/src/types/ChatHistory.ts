import { ChatHistoryItem } from "./ChatHistoryItem";

export type ChatHistory = (ChatHistoryItem | ChatHistory)[];