export const command = () => ({ executable: 'local-agent', args: ['--local'] });

export const setup = () => ({ contextRunState: { source: 'local' } });

export const teardown = () => {};
