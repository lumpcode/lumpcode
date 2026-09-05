# Requirements: Register / resolve config `command` in dynamic steps

| Field | Value |
| --- | --- |
| **Backlog** | `register-config-command` · priority **10** · type **fix** · workflow **[req]** |
| **Status** | Pending implementation |
| **Depends on** | — |
| **Packages** | Primary: `packages/apps/cli` (`jsConfigToRunLumpInput`, schema description, DOCS). `@lumpcode/core`, recipes runtime, and cli-types APIs unchanged (docs/examples may drop mandatory `registerCommands` where it is no longer required). |

## Problem statement and motivation

Tag-form `command` strings (e.g. `"cursor"`, `"my-agent"`) load on demand for **static** steps, but the same tag inside a **dynamic** step array (returned by a `StepFn` / recursive `steps` item, or by `postCommandExecFn`) fails unless the author listed it in top-level `registerCommands`. File-path commands already load on demand in both paths. Authors and recipes hit a surprising mid-run throw for a tag that would have worked at the top level.

Concrete pain:

1. Dynamic / recursive steps with `"command": "<tag>"` throw `Command <tag> not registered in recursive call. Please register the command before in the registerCommands field.` when the tag was not pre-listed.
2. Authors must remember a separate `registerCommands` list even when the module is a normal project/global/preset command that static steps would resolve automatically.
3. Docs and schema describe `registerCommands` as **required** for dynamic name references, which overstates the need once lazy resolve works in the recursive path.
4. File-path `command` refs already bypass this trap, so tag vs path behavior is inconsistent.

## Goals

1. Resolve lump/step **tag** `command` values in dynamic/recursive step resolution the **same way** as for static steps: look up `getCommandPath`, load into the shared `commandModules` cache, attach `commandName`, return the module `command` fn.
2. Stop throwing the recursive-only “not registered / use registerCommands” error for missing tags.
3. Keep `registerCommands` as an **optional** eager pre-load so modules enter `commandModules` before composed command-module `setup` / `teardown` run (still needed when a tag appears **only** in dynamic steps and the module’s `setup` must seed `contextRunState` before the first agent call).
4. On missing or unloadable modules, fail with the same load-failure contract as today’s static path (Result `Failure`, clear message) — not a special recursive registration instruction.
5. Update CLI DOCS + `lumpConfig.schema.json` description so `registerCommands` matches the optional eager-load role (no longer framed as required for every dynamic tag).

## Non-goals

- Changing command lookup order (project `.lumpcode/commands/` → global → presets) or file-path `command` ref rules.
- New CLI flags, subcommands, or JSON result envelopes.
- Auto-invoking a newly lazy-loaded module’s `setup` mid step-walk (after per-context setup already finished). Authors who need that setup for dynamic-only tags still use `registerCommands`.
- Removing the `registerCommands` field from `LumpJsConfig` / schema.
- Changing `CommandModule` export shape or preset install paths.
- Rewriting recipe kits solely to drop `registerCommands` (optional follow-up; examples may be softened in docs).

## User stories / use cases

1. **Lump author (dynamic steps)** — Returns `[{ promptTemplate: '…', command: 'cursor' }]` from a step function without listing `registerCommands`. The run loads the preset and continues.
2. **Lump author (custom tag)** — Same for `"my-agent"` under `.lumpcode/commands/my-agent.js` when first seen only inside a recursive return.
3. **Lump author (setup-sensitive module)** — A custom module with `setup` that must run before any prompt. They still list the tag in `registerCommands` so it is cached before composed setup.
4. **Lump author (missing module)** — Dynamic step references `"missing-agent"`. Config/step resolve fails with a normal command-load failure message (path / not found), not the registerCommands hint.
5. **Recipe author** — `retryUntilGreen` / backlog-style recursive steps that set `command` tags work without mandatory `registerCommands` when setup seeding is not required (default command already loaded, or module has no setup).

## Proposed behavior and UX

No new CLI syntax. Operators keep:

```text
lumpcode run <lumpName> …
lumpcode start …
lumpcode lump-plan <lumpName> …
```

### `command` resolution (contract)

| Form | Static steps | Dynamic / recursive steps (`inRecursiveCall`) |
| --- | --- | --- |
| Inline `commandFn` / function `command` | Use as today | Same |
| File-path string (no whitespace, `.ts`/`.js`) | Lazy `loadCommandModule` | Lazy load (unchanged) |
| Tag string (`"cursor"`, `"my-agent"`, …) | If absent from `commandModules` → `getCommandPath` + `loadCommandModule` | **Same as static** (remove recursive-only refuse) |
| Already in `commandModules` | Reuse cached module | Reuse cached module |

`commandName` on the resolved `CommandFn` remains the literal config string (tag or path).

### `registerCommands` (contract)

```ts
// LumpJsConfig — field retained
registerCommands?: string[];  // tag names only; same getCommandPath resolution
```

| Aspect | Behavior |
| --- | --- |
| When | Optional; still run via existing `preRegisterCommands` at `jsConfigToRunLumpInput` time, before `resolveSteps` / composed setup |
| Effect | Eager `loadCommandModule` into the shared `commandModules` map |
| Why keep | Modules only referenced inside dynamic returns are otherwise loaded **after** per-context `setupFn` composition has already iterated the map — so their `setup` would be skipped for that context unless pre-registered |
| Not required for | Tags that already appear on static steps / top-level `command`, file-path commands, or modules with no needed `setup` |

### Failure UX

| Case | Outcome |
| --- | --- |
| Tag resolves to a missing module file | `Failure` from command load (same family of messages as static resolve) |
| Tag in dynamic steps, module exists, not in `registerCommands` | **Success** — lazy load (this fix) |
| Invalid / unloadable module | Existing load failure |

Do not resurrect the string `Command ${command} not registered in recursive call…`.

## Technical approach

Canonical owner: **`resolveCommandFn`** inside `packages/apps/cli/src/utils/jsConfigToRunLumpInput/main.ts`. Callers (recipes, commands, other utils) must not add a parallel “ensure registered” path.

| Step | Change |
| --- | --- |
| 1. Unify tag resolve | In `resolveCommandFn`, for string tags not yet in `commandModules`, always take the static path (`getCommandPath` → `loadCommandModule`). Delete the `inRecursiveCall` branch that throws the registerCommands error. `inRecursiveCall` may remain on callers for other reasons only if still needed; it must not gate tag loading. |
| 2. Keep eager pre-load | Leave `preRegisterCommands` + `registerCommands` wiring unchanged. |
| 3. Setup/teardown semantics | Document only: lazy load mid-walk does **not** retroactively run `mod.setup` for the current context; `composeTeardownFn` still sees modules added to the map before teardown. No new mid-walk setup API in this item. |
| 4. Schema | Update `registerCommands` description in `packages/apps/cli/src/schemas/lumpConfig.schema.json` to optional eager pre-load / setup participation — not “required for dynamic prompt items”. |
| 5. Docs | Align `lump-config.md` and `advanced-config.md` § `registerCommands` with the table above. Soften recipe README examples only if they claim the field is mandatory for dynamic tags. |
| 6. Types | No signature change to `LumpJsConfig.registerCommands` unless comments/JSDoc are updated to match. |

### Affected surfaces

| Surface | Role |
| --- | --- |
| `packages/apps/cli/src/utils/jsConfigToRunLumpInput/main.ts` | **Owner** of resolve + pre-register behavior |
| `packages/apps/cli/src/schemas/lumpConfig.schema.json` | Description text for `registerCommands` |
| `packages/apps/cli/DOCS/lump-config.md` | Field table + command-names section |
| `packages/apps/cli/DOCS/advanced-config.md` | § `registerCommands` |
| `packages/apps/cli/src/types/LumpJsConfig.ts` | Optional JSDoc only |
| Existing unit coverage under `jsConfigToRunLumpInput/testing/` | Behavior expectations for recursive tag resolve (implementation updates tests; not specified here) |

## Docs updates

| Document | Change |
| --- | --- |
| `packages/apps/cli/DOCS/lump-config.md` | Tag commands load on demand for static **and** dynamic steps; `registerCommands` = optional eager pre-load for setup/teardown when a tag appears only in dynamic returns. |
| `packages/apps/cli/DOCS/advanced-config.md` | Replace “register it up front / otherwise lazy loading may throw” with the optional setup-participation wording. |
| `lumpConfig.schema.json` | Same optional/eager semantics in `registerCommands.description`. |
| Recipe READMEs (optional) | If examples say `registerCommands` is required for dynamic `command` tags, rephrase to optional / setup-only. |

## Acceptance criteria

1. A dynamic/recursive step item with `"command": "<existing-tag>"` and **no** `registerCommands` entry resolves and runs that module (preset or project/global custom), matching static-step resolve.
2. The recursive-only error `Command … not registered in recursive call…` is gone from production code paths.
3. Missing tag modules still fail with a normal load/`getCommandPath` failure, not a registerCommands instruction.
4. File-path `command` refs and inline `command`/`commandFn` behavior remain unchanged.
5. `registerCommands` still eagerly loads listed tags before composed setup; a module listed there that defines `setup` still runs that setup for contexts (existing composition).
6. DOCS + schema describe `registerCommands` as optional eager pre-load for dynamic-only tags that need `setup`, not as required for every dynamic tag reference.
7. No second registration/ensure helper outside `jsConfigToRunLumpInput`’s `resolveCommandFn` / `preRegisterCommands`.
