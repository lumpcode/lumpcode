# Requirements: `context-status` resolves the base branch like `lump-status`

| Field | Value |
| --- | --- |
| **Backlog** | `context-status-missing-base-branch` · priority **0** · type **fix** |
| **Status** | Pending implementation |
| **Depends on** | — |
| **Packages** | Primary `@lumpcode/cli` (`commands/context-status`, `commands/lump-status`, new `utils/resolveInspectBaseBranch`). `@lumpcode/core`, `@lumpcode/recipes`, and schemas unchanged. |

## Problem statement and motivation

[Terms](../../../../../../packages/apps/cli/DOCS/start/terms.md) defines the base branch as "the primary unless the lump sets `baseBranch`". `lump-status` follows that rule: it composes `resolveEffectiveDiscoveryBranch` and `resolveLumpBaseBranch` (lump `baseBranch`, else concrete discovery, else `primaryBranch`). [`packages/apps/cli/src/commands/context-status/main.ts`](../../../../../../packages/apps/cli/src/commands/context-status/main.ts) instead reads `jsConfig.baseBranch` raw and fails when it is `undefined`.

1. Every `featureBacklog` lump in this repo (`backlog`, `qol`, `bugfixes`) omits `baseBranch`. `lumpcode context-status bugfixes <item>` fails with `Lump "bugfixes" is missing baseBranch in its config.` while `lumpcode lump-status --lumpName bugfixes` works.
2. `--setToFinished` is the documented repair after a squash that dropped the `LUMP:` line ([troubleshooting](../../../../../../packages/apps/cli/DOCS/reference/troubleshooting.md)). It is unusable on exactly the lumps that rely on discovery for their base.
3. The base-branch rule for inspect commands lives inline in `lump-status`, so the second inspect command drifted.

### Repro

`local.json` `{ "mode": "dedicated", "primaryBranch": "dev", "primaryBranches": ["dev"] }`. Lump `bugfixes` is a `featureBacklog` config with no `baseBranch` (discovery defaults to `dev`).

| | Result |
| --- | --- |
| **Actual** | `lumpcode context-status bugfixes some-item` fails: `Lump "bugfixes" is missing baseBranch in its config.` |
| **Expected** | Prints the record for `some-item` against `dev`, the same base `lump-status` uses. `--setToFinished` writes the marker on `dev`. |

## Goals

1. `context-status` (inspect and `--setToFinished`) uses the same base branch `lump-status` uses for the same lump, config, and `--discoveryBranch`.
2. One util owns "base branch for an inspect command"; `lump-status` and `context-status` both call it.

## Non-goals

- Changing how `run`, `lump-plan`, or the daemon resolve the base branch (`jsConfigToRunLumpInput` bind stays as is).
- Supporting function or file-path `baseBranch` in `context-status`. It still fails with the existing "must be a concrete branch string" message, because `--setToFinished` must not guess where a per-context function would put the marker.
- Changing `resolveLumpBaseBranch` or `resolveEffectiveDiscoveryBranch` behavior.

## User stories / use cases

1. As an operator on a dedicated worker, I run `lumpcode context-status bugfixes <item> --setToFinished` after a squash merge dropped the marker, so the item stops being re-picked, without adding `baseBranch` to a recipe lump.
2. As an operator with a pattern-only discovery lump (`discoveryBranch: 'feature/*'`), I pass `--discoveryBranch feature/a` to `context-status` exactly as I do for `lump-status`.

## Proposed behavior and UX

### CLI

```text
lumpcode context-status <lumpName> <contextName> [--setToFinished] [--discoveryBranch <branch>]
```

`--discoveryBranch` is new on `context-status`, with the same description and validation as on `lump-status` (concrete only; must match the lump's discovery rules; honored in shared mode for inspect).

### Base branch resolution

| Lump `baseBranch` | Result |
| --- | --- |
| Non-empty string | That string (unchanged). |
| `undefined` | `resolveInspectBaseBranch`: concrete discovery (flag or first exact rule), else `primaryBranch`. Shared mode without the flag yields `primaryBranch`. |
| Function, file path, or empty string | Existing failure: `Lump "<name>" baseBranch must be a concrete branch string for context-status.` |

Failures from discovery resolution (pattern-only rules without the flag, flag not matching rules, allowlist miss, missing `primaryBranch` in `local.json`) surface unchanged as the command failure message. The `missing baseBranch` message is removed.

### Shared util

```ts
resolveInspectBaseBranch({
    lumpName: string;
    lumpConfig: Pick<LumpJsConfig, 'baseBranch' | 'discoveryBranch' | 'discoveryBranches'>;
    localConfig: LocalConfig;
    localConfigFolderPath: string;
    discoveryBranchOpt?: string;
}) → Promise<Success<string> | Failure<string>>
```

Calls `resolveEffectiveDiscoveryBranch` with `honorDiscoveryBranchOptInShared: true`, then `resolveLumpBaseBranch` with `primaryBranch: resolvePrimaryBranch(localConfig)`, `mode: localConfig.mode`, and the resolved discovery as `effectiveDiscoveryBranch`.

## Technical approach

| Step | File | Change |
| --- | --- | --- |
| 1 | `packages/apps/cli/src/utils/resolveInspectBaseBranch/main.ts` (+ `index.ts`) | New util with the contract above. It is the only place that composes discovery resolution and base resolution for inspect commands. |
| 2 | `packages/apps/cli/src/commands/lump-status/main.ts` | Replace the inline `resolveEffectiveDiscoveryBranch` + `resolveLumpBaseBranch` pair with one `resolveInspectBaseBranch` call. Output and failure messages unchanged. |
| 3 | `packages/apps/cli/src/commands/context-status/main.ts` | Add `--discoveryBranch`. Read local config with `readProjectLocalConfig`. Keep the non-string `baseBranch` rejection; when `baseBranch` is `undefined`, call `resolveInspectBaseBranch`. Pass the result to `setContextToFinishedStatus` and `updateContextStatusRecord`. |

Owner: `resolveInspectBaseBranch`. Command modules must not compose `resolveEffectiveDiscoveryBranch` and `resolveLumpBaseBranch` themselves.

## Testing strategy

### Unit

| Test | Covers |
| --- | --- |
| `utils/resolveInspectBaseBranch/unit.test.ts` (new) | Explicit `baseBranch` wins; omitted with exact `discoveryBranch` returns it; omitted with no discovery returns `primaryBranch`; shared mode returns `primaryBranch`; pattern-only without flag fails with the `--discoveryBranch` hint; concrete flag matching a pattern rule returns the flag. |
| `commands/context-status/unit.test.ts` | New: lump `config.json` without `baseBranch` plus `local.json` with `primaryBranch: 'main'` prints a `toDo` record. New: same lump with `--setToFinished` returns `finished` with the marker on `main`. New: pattern-only lump without the flag fails and mentions `--discoveryBranch`. New: `baseBranch: ""` fails with the "must be a concrete branch string" message. Existing cases stay green (they set `baseBranch: 'main'`). |
| `commands/lump-status/unit.test.ts` | Unchanged and green; proves the refactor kept behavior. |

## Docs updates

| Document | Change |
| --- | --- |
| `packages/apps/cli/DOCS/reference/commands.md` (`context-status`) | Add "`--discoveryBranch` as on `lump-plan`.", matching the `lump-status` entry, and say `--setToFinished` writes the marker on the lump's base branch (link to the base branch term). |

## Acceptance criteria

1. `lumpcode context-status <lump> <ctx>` succeeds for a lump without `baseBranch` and reports the same status `lump-status` reports for that context.
2. `--setToFinished` on such a lump writes the marker on the same branch `lump-status` reads as base, and the refreshed record is `finished`.
3. `context-status --discoveryBranch` accepts and rejects the same values as `lump-status --discoveryBranch`.
4. A lump with a non-string or empty `baseBranch` still fails with the "must be a concrete branch string" message.
5. The string `is missing baseBranch in its config` no longer appears in `packages/apps/cli/src`.
6. `lump-status` and `context-status` import neither `resolveEffectiveDiscoveryBranch` nor `resolveLumpBaseBranch`; both call `resolveInspectBaseBranch`.
7. `npm run build -w=@lumpcode/cli` and `npm run test -w=@lumpcode/cli` pass.
