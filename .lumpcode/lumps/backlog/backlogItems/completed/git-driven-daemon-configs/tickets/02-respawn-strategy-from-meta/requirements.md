# Requirements: 02 respawn `workspaceStrategy` from meta

Global contract: [`../../requirements.md`](../../requirements.md) (Desired.json respawn; Goal 5).

## Standalone value

If `local.json` flips `worktree` → `checkout` (or the reverse) while another daemon is still running, a dead desired.json daemon must not come back on the **new** strategy.

## In scope

- `spawnDesiredDaemon` in `runSuperviseLocalPass`: `recipeFromDesired(desired, meta.workspaceStrategy)`.
- Missing/invalid meta → skip spawn (fail-closed).
- Do **not** use a live `readProjectLocalConfig` for respawn strategy.
- Owner stays `spawnDesiredDaemon` only.

## Out of scope

- Gating a **new** `lumpcode start` that mixes strategies (operator action).
- File-daemon reconcile, `--superviseOnly`, hash-restart.

## Acceptance

- [ ] Respawn uses the dead daemon’s meta `workspaceStrategy`, not current `local.json`.
- [ ] Bad/missing meta: skip spawn, no checkout/worktree flip.
