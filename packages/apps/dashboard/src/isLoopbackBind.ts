const LOOPBACK_BINDS = new Set(['127.0.0.1', '::1', '[::1]']);

export function isLoopbackBind(bind: string): boolean {
    if (bind.toLowerCase() === 'localhost') {
        return true;
    }
    return LOOPBACK_BINDS.has(bind);
}
