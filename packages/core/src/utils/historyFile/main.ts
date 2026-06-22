import type { Failure, Success } from '../../types';
import type { HistoryEntry } from '../../types/HistoryEntry';

function notImplemented(): never {
    throw new Error('not implemented');
}

export function historyFormatFromPath(
    _filePath: string,
): Success<'yaml'> | Failure<string> {
    notImplemented();
}

export async function readHistoryFile(_input: {
    filePath: string;
}): Promise<Success<HistoryEntry[]> | Failure<string>> {
    notImplemented();
}

export async function writeHistoryFile(_input: {
    filePath: string;
    entries: HistoryEntry[];
}): Promise<Success<void> | Failure<string>> {
    notImplemented();
}

export async function appendHistoryEntry(_input: {
    filePath: string;
    entry: HistoryEntry;
}): Promise<Success<void> | Failure<string>> {
    notImplemented();
}
