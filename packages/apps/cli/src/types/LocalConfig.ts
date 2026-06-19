import type { Mode } from './Mode';
import type { WorkspaceStrategy } from './WorkspaceStrategy';

/**
 * Shape of `.lumpcode/local.json` — gitignored, per-machine configuration that
 * tells Lumpcode where and how to run lumps from this checkout.
 */
export interface LocalConfig {
    mode: Mode;
    projectBaseBranch: string;
    workspaceStrategy?: WorkspaceStrategy;
    /** When `true`, the background daemon skips every lump on this machine (`lumpcode start`). */
    disabled?: boolean;
}
