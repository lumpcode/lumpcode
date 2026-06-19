/**
 * How Lumpcode prepares the per-lump git workspace inside the preflight repo root.
 *
 * - `checkout`: switch the main worktree to a fresh lump branch (default).
 * - `worktree`: add a linked worktree under `.lumpcode/worktrees/<branch>/`.
 */
export type WorkspaceStrategy = 'checkout' | 'worktree';
