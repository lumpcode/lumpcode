import { describe, it, expect } from 'vitest';

import { failure } from '../failure';
import { formatExecFailureMessage } from './main';

describe('formatExecFailureMessage', () => {
    it('formats exec failures with a short stderr line', () => {
        const message = formatExecFailureMessage({
            label: 'git push',
            failure: failure({
                message: 'Command git push failed with error: Error: ...',
                info: {
                    command: 'git push',
                    stdout: '',
                    stderr: 'fatal: could not read Username\n',
                },
            }),
        });
        expect(message).toBe('git push failed: fatal: could not read Username');
    });

    it('includes exit code when present', () => {
        const message = formatExecFailureMessage({
            label: 'git push',
            failure: failure({
                message: 'Process exited with code 128',
                code: 128,
                stderr: 'fatal: remote rejected',
            }),
        });
        expect(message).toBe('git push failed (exit 128): fatal: remote rejected');
    });
});
