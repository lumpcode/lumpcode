import type { Mode } from './Mode';
import type { WorkspaceStrategy } from './WorkspaceStrategy';

/**
 * Shape of `.lumpcode/local.json` — gitignored, per-machine configuration that
 * tells Lumpcode where and how to run lumps from this checkout.
 */
export interface LocalConfig {
    mode: Mode;
    /** Required when `primaryBranches` is omitted or empty. Primary integration branch for this install. */
    primaryBranch?: string;
    /**
     * @deprecated Use `primaryBranch` instead.
     * Legacy alias kept for existing `.lumpcode/local.json` files.
     */
    projectBaseBranch?: string;
    /** When non-empty, wins over singular `primaryBranch` for the effective primary-branch list. Dedicated daemon scans these lines. */
    primaryBranches?: string[];
    workspaceStrategy?: WorkspaceStrategy;
    /** When `true`, the background daemon skips every lump on this machine (`lumpcode start`). */
    disabled?: boolean;
}
