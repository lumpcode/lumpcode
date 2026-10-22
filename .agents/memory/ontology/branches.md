# Branches

- **Primary branch**: the integration branch from merged `project.json` / `local.json` (`primaryBranch` or the first exact entry of `primaryBranches`).
- **Discovery branch**: where a dedicated worker finds and schedules a lump (`discoveryBranch` / `discoveryBranches` on the lump, globs allowed).
- **Base branch**: where the lump's work branches off and where `finished` is read (`baseBranch`, string or `BaseBranchFn` in `packages/apps/cli/src/types/BaseBranchFn.ts`).
- **Work branch**: `lump/<lumpName>/<context…>` on a worker; the current branch in shared mode.
- **Lump line**: one lump bound to one concrete discovery branch, the unit a daemon tick schedules (`LumpLine` in `packages/apps/cli/src/utils/lumpLine/main.ts`).

Resolution rules: `domain/branch-resolution.md`.
