import { describe, expect, it, vi } from 'vitest';

import { success } from '@lumpcode/core';

import { command as resetPresetsCommand } from './main';

vi.mock('../../utils/ensurePresetCommandsInstalled', () => ({
    ensurePresetCommandsInstalled: vi.fn(),
}));

import { ensurePresetCommandsInstalled } from '../../utils/ensurePresetCommandsInstalled';

describe('reset-presets command', () => {
    it('reinstalls presets with overwrite enabled', async () => {
        const globalConfigFolderPath = '/tmp/example/.lumpcode';
        vi.mocked(ensurePresetCommandsInstalled).mockResolvedValue(success(undefined));

        const handle = resetPresetsCommand.handlerMaker({ globalConfigFolderPath });
        const result = await handle({ options: {}, arguments: {} });

        expect(ensurePresetCommandsInstalled).toHaveBeenCalledWith({
            globalConfigFolderPath,
            overwrite: true,
        });
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.messages[0]).toContain('Reinstalled shipped preset command modules');
        }
    });
});
