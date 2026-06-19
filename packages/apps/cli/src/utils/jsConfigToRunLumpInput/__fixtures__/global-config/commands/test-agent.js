export const command = () => ({ executable: 'global-agent', args: ['--global'] });

export const setup = () => ({ contextRunState: { source: 'global' } });

export const teardown = () => {};
