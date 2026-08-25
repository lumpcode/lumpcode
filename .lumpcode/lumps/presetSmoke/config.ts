import {
    defineConfig,
    type CursorPresetLumpVariables,
    type CursorPresetStepVariables,
} from '@lumpcode/cli-utils';
import { openPrPostTeardown } from '@lumpcode/recipes';

/** Swap to another preset tag (`opencode`, `copilot`, …). `auto` is cursor/copilot only. */
const command = 'cursor';

export default defineConfig<CursorPresetLumpVariables, CursorPresetStepVariables>({
    command,
    registerCommands: [command],
    lumpVariables: { model: 'auto' },
    getContextListFn: () => [
        {
            name: `overview-${Date.now()}`,
            variables: {
                README: 'README.md',
            },
        },
    ],
    prompt:
        'What is this project about? Read @{README} (and any other obvious project docs if helpful). Write a quick overview in a new file at the project root called OVERVIEW.md.',
    postTeardownWorkspaceFn: openPrPostTeardown({ provider: 'github' }),
    verbose: true,
    keepHistory: true,
    /** Flip to `false` for one `lumpcode run presetSmoke`. */
    disabled: true,
});
