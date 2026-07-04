export function command() {
    return { executable: 'file-agent', args: ['--from-file'] };
}

export function setup() {
    return { contextRunState: { source: 'file-agent' } };
}
