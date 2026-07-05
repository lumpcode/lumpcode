import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, extname } from 'node:path';
import { dump, load, Style, YAML11_SCHEMA } from 'js-yaml';
import type { Node } from 'js-yaml';

import type { Failure, Success } from '../../types';
import type { HistoryEntry } from '../../types/HistoryEntry';
import { failure } from '../failure';
import { pathExists } from '../pathExists';
import { success } from '../success';

/** Strip terminal ANSI escapes and other C0 controls js-yaml rejects in literal blocks. */
function sanitizeHistoryText(value: string): string {
    return value
        .replace(/\x1b\[[0-9;]*[A-Za-z]/g, '')
        .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '');
}

function parseHistoryYamlContent(content: string): HistoryEntry[] {
    const parsed = load(content, { schema: YAML11_SCHEMA });
    if (!Array.isArray(parsed)) {
        throw new Error('History file must contain a YAML sequence');
    }
    return parsed as HistoryEntry[];
}

function tryParseHistoryContent(content: string): HistoryEntry[] {
    try {
        return parseHistoryYamlContent(content);
    } catch (firstError) {
        const sanitized = sanitizeHistoryText(content);
        if (sanitized === content) {
            throw firstError;
        }
        return parseHistoryYamlContent(sanitized);
    }
}

function sanitizeHistoryEntry(entry: HistoryEntry): HistoryEntry {
    return {
        ...entry,
        prompt: sanitizeHistoryText(entry.prompt),
        commandResult: sanitizeHistoryText(entry.commandResult),
    };
}

export function historyFormatFromPath(
    filePath: string,
): Success<'yaml'> | Failure<string> {
    const ext = extname(filePath).toLowerCase();
    if (ext === '.yaml' || ext === '.yml') {
        return success('yaml' as const);
    }
    return failure(
        `Unsupported history file extension for ${filePath}; expected .yaml or .yml`,
    );
}

function setLiteralBlockScalars(node: Node | null | undefined, parentKey?: string): void {
    if (!node) {
        return;
    }

    if (node.kind === 'scalar') {
        const useLiteralBlock =
            node.value.includes('\n')
            && (parentKey === 'prompt' || parentKey === 'commandResult');
        if (useLiteralBlock) {
            node.style = new Style();
            node.style.literal = true;
        }
        return;
    }

    if (node.kind === 'sequence') {
        for (const item of node.items) {
            setLiteralBlockScalars(item);
        }
        return;
    }

    if (node.kind === 'mapping') {
        for (const { key, value } of node.items) {
            const keyName = key.kind === 'scalar' ? key.value : undefined;
            setLiteralBlockScalars(value, keyName);
        }
    }
}

function dumpHistoryEntries(entries: HistoryEntry[]): string {
    if (entries.length === 0) {
        return '[]\n';
    }

    const sanitizedEntries = entries.map(sanitizeHistoryEntry);

    return dump(sanitizedEntries, {
        schema: YAML11_SCHEMA,
        lineWidth: 0,
        noRefs: true,
        transform(documents) {
            for (const doc of documents) {
                setLiteralBlockScalars(doc.contents);
            }
        },
    });
}

export async function readHistoryFile({
    filePath,
}: {
    filePath: string;
}): Promise<Success<HistoryEntry[]> | Failure<string>> {
    const formatResult = historyFormatFromPath(filePath);
    if (!formatResult.success) {
        return formatResult;
    }

    try {
        const content = await readFile(filePath, 'utf-8');
        return success(tryParseHistoryContent(content));
    } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        return failure(`Failed to parse history file ${filePath}: ${detail}`);
    }
}

export async function writeHistoryFile({
    filePath,
    entries,
}: {
    filePath: string;
    entries: HistoryEntry[];
}): Promise<Success<void> | Failure<string>> {
    const formatResult = historyFormatFromPath(filePath);
    if (!formatResult.success) {
        return formatResult;
    }

    try {
        await mkdir(dirname(filePath), { recursive: true });
        await writeFile(filePath, dumpHistoryEntries(entries), 'utf-8');
        return success(undefined);
    } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        return failure(`Failed to write history file ${filePath}: ${detail}`);
    }
}

export async function appendHistoryEntry({
    filePath,
    entry,
}: {
    filePath: string;
    entry: HistoryEntry;
}): Promise<Success<void> | Failure<string>> {
    const formatResult = historyFormatFromPath(filePath);
    if (!formatResult.success) {
        return formatResult;
    }

    const exists = await pathExists(filePath);
    let entries: HistoryEntry[];

    if (exists) {
        const readResult = await readHistoryFile({ filePath });
        if (!readResult.success) {
            return readResult;
        }
        entries = readResult.data;
    } else {
        await mkdir(dirname(filePath), { recursive: true });
        entries = [];
    }

    entries.push(sanitizeHistoryEntry(entry));
    return writeHistoryFile({ filePath, entries });
}
