# Requirements: Drop the SEA binaries

| Field | Value |
| --- | --- |
| **Backlog** | `factory-templates` / `drop-sea-binaries` · priority **20** · type **chore** |
| **Status** | Pending implementation |
| **Depends on** | — |
| **Packages** | `@lumpcode/cli` (primary: scripts, launcher, utils, `package.json`), `.github/workflows/build-cli.yml`. `@lumpcode/core`, `cli-utils`, `cli-types`, `recipes`, the dashboard and `packages/apps/cli-meta` stay unchanged. |

## Problem statement and motivation

The CLI is built twice: an ncc bundle run by Node, and a SEA binary per platform with an esbuild binary beside it. Users only get the first. The `postinstall` download points at a placeholder repo (`DEFAULT_INSTALL_REPO = 'YOUR_ORG/Lumpcode'` in `scripts/native-binary.mjs`), `install.sh` points at the same placeholder, and the macOS binaries are only ad-hoc signed. Yet every feature pays for the second code path.

1. `isSea()` branches live in `transpileTypeScriptToCachedMjs`, `resolveImportable`, `resolveBundledAssetPath` and `spawnDetachedLumpcodeWithPidFile`.
2. In SEA mode, esbuild runs as a separate binary, so the CLI cannot use an esbuild JS plugin. The next ticket needs one.
3. CI runs the CLI E2E suite against the SEA binary (`LUMPCODE_E2E_BINARY`), not against what npm users run.
4. Release assets ship binaries that no documented install path uses.

Decision: Lumpcode ships through npm only (`npm install -g @lumpcode/cli`, Node 22+). Stable native binaries are a later, blocked idea (`stable-native-binaries`).

## Goals

1. One runtime: `node dist/index.js`, started by `bin/lumpcode.js`.
2. No `isSea()` or `node:sea` anywhere in the CLI.
3. CI E2E runs the Node runner on Linux, macOS and Windows.
4. Releases keep their generated notes, with no binary assets.

## Non-goals

- Changing the ncc bundle, `build:bundle`, `wrapMinifiedBundle`, or how presets and schemas ship in `dist/`.
- Removing `packages/apps/cli-meta` (the unscoped `lumpcode` package already spawns `@lumpcode/cli` with Node).
- Bundling `@lumpcode/recipes` or `cli-utils` (ticket `cli-bundled-authoring-packages`).
- Any user-facing CLI behavior change.

## User stories / use cases

1. As a user, I run `npm i -g @lumpcode/cli` and get the same CLI that CI tested.
2. As a contributor, I change the TypeScript loader once, with no SEA branch to keep in sync.
3. As a maintainer, I tag a release and get release notes, with no binaries to sign.

## Proposed behavior and UX

| Surface | After |
| --- | --- |
| `bin/lumpcode.js` | Always runs `dist/index.js` with the current Node. No `vendor/` lookup. |
| `npm install` of the CLI | `postinstall` still reinstalls the agent presets. It never downloads a binary. `LUMPCODE_SKIP_BINARY` is no longer read. |
| `npm run build -w=@lumpcode/cli` | `clean` then `build:bundle`. No `build:sea` script. |
| GitHub release on a `v*` tag | Created with generated notes and no assets. |
| CLI commands | Unchanged. |

## Technical approach

| Step | Files | Change |
| --- | --- | --- |
| 1 | `src/utils/transpileTypeScriptToCachedMjs/main.ts` | Remove `configureEsbuildBinaryPath`, `ESBUILD_BINARY_PATH` and the `execFile` branch. Only `import('esbuild')` remains. |
| 2 | `src/utils/resolveImportable/main.ts` | Remove the SEA specifier branch. Keep the Vitest branch and the indirect `import()` the ncc bundle needs. |
| 3 | `src/utils/resolveBundledAssetPath/main.ts` | Remove the `process.execPath` branch: bundled path, else dev source path. |
| 4 | `src/utils/spawnDetachedLumpcodeWithPidFile/main.ts` | Remove the `runningAsSeaBinary` branch: always spawn Node with the CLI entry. |
| 5 | `bin/lumpcode.js` | Remove the `vendor/` native binary branch. |
| 6 | `scripts/postinstall.mjs` | Keep the preset reinstall and its skip rules. Remove the native binary download. |
| 7 | Delete `scripts/native-binary.mjs`, `native-binary.unit.test.mjs`, `esbuild-sidecar.mjs`, `esbuild-sidecar.unit.test.mjs`, `build-sea.sh`, `build-sea.ps1`, `install.sh`, `install-local.sh` | |
| 8 | `packages/apps/cli/package.json` | Remove `build:sea`, `build:sea:windows`, and the binary and sidecar globs in `clean`. `build` becomes `clean` + `build:bundle`. Remove the deleted scripts from `files`. |
| 9 | `scripts/npm-pack-postinstall.unit.test.mjs`, `scripts/run-e2e.mjs` | Pack test: no binary step. E2E runner: the Node runner is the default; `LUMPCODE_E2E_BINARY` is no longer read. |
| 10 | `.github/workflows/build-cli.yml` | The matrix builds the bundle and runs `npm run test:e2e:ci` with Node on each OS. No SEA build, no binary test, no artifact upload. The release job keeps `softprops/action-gh-release` with generated notes and no `files`. |
| 11 | `.gitignore` | Drop the SEA sidecar ignores under `packages/apps/cli/bin/` that no longer apply. Keep `bin/lumpcode.js` tracked. |

`resolveBundledAssetPath` stays the single owner of locating shipped assets. No caller adds its own path fallback.

## Testing strategy

| Level | Test | Covers |
| --- | --- | --- |
| Unit | `resolveBundledAssetPath/unit.test.ts` | Bundled then dev path only; SEA cases removed |
| Unit | `transpileTypeScriptToCachedMjs` tests | Unchanged results through the JS esbuild API |
| Unit | `npm-pack-postinstall.unit.test.mjs` | The packed tarball's postinstall installs presets and downloads nothing |
| E2E | `npm run test:e2e:ci` on Linux, macOS, Windows | The same scenarios, through `bin/lumpcode.js` and Node |
| Repo | grep in CI or a unit test | No `node:sea`, `isSea`, `ESBUILD_BINARY_PATH` or `LUMPCODE_SKIP_BINARY` under `packages/apps/cli` |

## Docs updates

| Document | Change |
| --- | --- |
| `packages/apps/cli/DOCS/publishing.md` | Remove the SEA and binary release steps |
| `.agents/memory/domain/distribution.md` | npm only; remove the SEA, launcher-binary and postinstall-download lines |
| `.agents/memory/code-conventions/build-and-release.md` | Remove the SEA build and release steps |
| `IDEAS.yaml` | `stable-native-binaries` stays blocked |

## Acceptance criteria

1. `grep -rn "node:sea\|isSea\|ESBUILD_BINARY_PATH\|LUMPCODE_SKIP_BINARY" packages/apps/cli` finds nothing outside tests that assert their absence.
2. `npm run build -w=@lumpcode/cli` produces `dist/` and no file under `bin/` other than `lumpcode.js`.
3. A packed and globally installed CLI runs `lumpcode --version` and a TypeScript lump's `lump-plan` with no `vendor/` folder.
4. CI E2E passes with Node on the three operating systems.
5. A `v*` tag creates a release with notes and no assets.
