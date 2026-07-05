import { defineConfig } from '@lumpcode/cli-types';

export default defineConfig({
    getContextListFn: async () => {
        const name = Date.now().toString();
        return [
            {
                name,
                variables: {
                    NAME: name,
                },
            }
        ]
    },
    command: 'cursor',
    steps: [
        {
            promptFn() {
                return `
                    Scan @packages/apps/cli for duplicated logic that appears in multiple places (same pattern, not merely similar file structure).

                    Pick exactly one abstraction that:
                    - Has a clear name that describes the pattern it captures.
                    - Materializes the abstraction as a new util under packages/core/src/utils/<utilName>/ following existing conventions: main.ts (implementation), index.ts (re-export), unit.test.ts (unit tests), and a barrel export from packages/core/src/utils/index.ts.
                    - Actually shrinks the codebase: after adding the util and refactoring all call sites in packages/apps/cli to import it from @lumpcode/core, net line count must go down (removed duplication minus new util code). Do not extract one-off logic or move code without deleting repetition.

                    Apply the refactor. The new util must include unit tests in unit.test.ts (match sibling utils in packages/core/src/utils/).

                    Write .lumpcode/lumps/findAbstraction/<utilName>.abstraction.md explaining: the repeated pattern you found, why this name fits, files changed, and approximate lines removed vs added (net reduction).
                `;
            },
        },
    ],
    keepHistory: true,
    verbose: true,
    disabled: true,
})