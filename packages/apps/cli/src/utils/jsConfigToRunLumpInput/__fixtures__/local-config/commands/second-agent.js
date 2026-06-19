export const command = () => ({ executable: 'second-agent', args: ['--v2'] });

export const setup = () => ({ contextRunState: { source: 'second' } });

export const teardown = () => {};
