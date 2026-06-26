import type { Mode } from './Mode';
import type { WorkspaceStrategy } from './WorkspaceStrategy';

/**
 * Shape of `.lumpcode/local.json` — gitignored, per-machine configuration that
 * tells Lumpcode where and how to run lumps from this checkout.
 */
export interface LocalConfig {
    mode: Mode;
    /** Required when `discoveryBranches` is omitted or empty. */
    discoveryBranch?: string;
    /** When non-empty, wins over singular `discoveryBranch` for the effective discovery-branch list. */
    discoveryBranches?: string[];
    workspaceStrategy?: WorkspaceStrategy;
    /** When `true`, the background daemon skips every lump on this machine (`lumpcode start`). */
    disabled?: boolean;
}
