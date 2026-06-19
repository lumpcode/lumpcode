import { Context } from "@lumpcode/core";
import { ChatHistory } from "./ChatHistory";

export interface ContextRunHistoryJson {
    contextName: Context['name'];
    date: string;
    branchName: string;
    chatHistory: ChatHistory;
}