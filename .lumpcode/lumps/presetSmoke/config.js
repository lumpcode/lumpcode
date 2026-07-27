/** @type {import('@lumpcode/cli-types').LumpJsConfig} */
export default {
  command: 'opencode',
  lumpVariables: {
    model: 'opencode/big-pickle',
  },
  getContextListFn: () => [
    {
      name: 'overview',
      variables: {
        README: 'README.md',
      },
    },
  ],
  verbose: true,
  history: true,
  prompt:
    'What is this project about? Read @{README} (and any other obvious project docs if helpful). Write a quick overview in a new file at the project root called OVERVIEW.md.',
};
