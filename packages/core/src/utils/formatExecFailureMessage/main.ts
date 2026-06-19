import type { ExecFailureData, Failure } from '../../types';

function firstNonEmptyLine(value: unknown): string | undefined {
    if (value == null) return undefined;
    const text = typeof value === 'string' ? value : String(value);
    const line = text
        .split(/\r?\n/)
        .map((part) => part.trim())
        .find((part) => part.length > 0);
    return line || undefined;
}

function shortExecDetail(data: ExecFailureData): string | undefined {
    return (
        firstNonEmptyLine(data.stderr)
        ?? firstNonEmptyLine(data.info?.stderr)
        ?? firstNonEmptyLine(data.stdout)
        ?? firstNonEmptyLine(data.info?.stdout)
    );
}

export function formatExecFailureMessage(input: {
    label: string;
    failure: Failure<ExecFailureData>;
}): string {
    const { label, failure } = input;
    const data = failure.data;
    const detail = shortExecDetail(data) ?? data.message;
    if (typeof data.code === 'number') {
        return `${label} failed (exit ${data.code}): ${detail}`;
    }
    return `${label} failed: ${detail}`;
}
