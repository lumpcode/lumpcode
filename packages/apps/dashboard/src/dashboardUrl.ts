export function formatDashboardUrl(bind: string, port: number): string {
    const host = bind.startsWith('[') || !bind.includes(':') ? bind : `[${bind}]`;
    return `http://${host}:${port}`;
}

export function listenHost(bind: string): string {
    if (bind.startsWith('[') && bind.endsWith(']')) {
        return bind.slice(1, -1);
    }
    return bind;
}
