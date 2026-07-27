# Test plan: typed-lump-and-step-variables

| Field | Value |
| ----- | ----- |
| **Backlog** | `typed-lump-and-step-variables` |
| **Kind** | Types-only feature (generics + preset contracts + docs) |
| **Primary packages under test** | `@lumpcode/core`, `@lumpcode/cli` (authoring types), `@lumpcode/cli-utils`, soft-align `@lumpcode/cli-types` |
| **Not under test** | `@lumpcode/recipes`, shipped preset `.js` runtime behavior, E2E / daemon / engine execution paths |

This plan is the source of truth for the `testImpl` stage. Tests prove the TypeScript contracts in [requirements.md](./requirements.md). No new runtime execution paths are required.

---

## 1. Goals of the test suite

Prove that after implementation:

1. Dual generics `V` / `SV` (independent; defaults = today’s unbound bags) flow through core hooks, `Step` / `Steps` / `RunLumpInput` / `runLump` / `HistoryEntry`, and CLI authoring types.
2. Lump-only hooks take `<V>` only.
3. Variable-carrying `define*` helpers are generic and do **not** erase refined `V` / `SV` at the helper boundary.
4. Closed cursor/copilot preset variable contracts are exported from `@lumpcode/cli-utils` (`src/presets/`, root barrel), extendable via `& Extra`, with no open index signature.
5. `@lumpcode/cli-types` exposes matching `define*` / config signatures (soft align); package still exists.
6. Untyped call sites (default type params) remain assignable; existing unit tests still pass.
7. Docs surfaces list the consumer pattern (verified at implementation acceptance; not automated in `testImpl` beyond export compile coverage).

---

## 2. Testing approach

| Level | Required? | Mechanism |
| ----- | --------- | --------- |
| **Unit (type-level)** | Yes — primary | Vitest `expectTypeOf` + `@ts-expect-error` compile fixtures |
| **Unit (identity / runtime)** | Yes — light | Existing `defineConfig` identity tests stay green; optional export-name smoke for preset type modules if they ship as `.ts` type-only files |
| **Integration / E2E** | No | Types-only; no new runtime paths |

### Why type-level

Refined generics and closed preset keys are compile-time only. Runtime assertions cannot see `V` / `SV`. Negative cases (excess keys, wrong bag on wrong hook) must use `@ts-expect-error` or equivalent failed assignability checks.

### Red → green during `testImpl`

Per repo convention for not-yet-implemented surfaces:

1. Add type test files that import the target APIs.
2. Add minimal stubs so imports resolve and the suite **runs red** until implementation:
   - Core / CLI authoring types: leave current single-generic (or ungeneric) signatures; type tests fail `expectTypeOf` / fail to satisfy `@ts-expect-error` placement until `<V, SV>` lands.
   - Preset contracts: stub exports under `packages/apps/cli/cli-utils/src/presets/` (e.g. loose `Record<string, unknown>` or incomplete shapes) barrel-exported from `cli-utils` root so tests compile, then assert the **closed** shapes so stubs fail until real contracts land.
3. Do **not** implement the full feature in `testImpl` — only tests + stubs needed for red.

If a type test cannot compile against today’s signatures at all, prefer stubs that make the **test file** compile while keeping assertions failing (wrong generic arity / wrong property types), rather than commenting tests out.

---

## 3. File layout (implementation details)

Create these files (names may vary slightly if a package already uses a local convention; keep co-location):

### `@lumpcode/core`

| Path | Role |
| ---- | ---- |
| `packages/core/src/types/typedVariables.types.test.ts` | Dual-bag + lump-only hook generics; default assignability; `V` ⟂ `SV` independence |

Run via existing `npm run test -w=@lumpcode/core` (Vitest already configured).

### `@lumpcode/cli` (authoring types live in CLI `src/types`)

| Path | Role |
| ---- | ---- |
| `packages/apps/cli/src/types/typedVariables.types.test.ts` | `LumpJsConfig` / `LumpJsConfigStep` / `LumpJsConfigSteps` / `LumpJsConfigStepsItem` / `LumpJsConfigStepsFn`/`StepFn` / `LumpJsonConfig` / `LumpJsonConfigStep` / `CommandModule` / `ContextMatchFn` generics |
| `packages/apps/cli/src/utils/defineConfig/unit.test.ts` | Keep existing identity tests; add type-level `it` blocks **or** move type cases to a sibling `typedVariables.types.test.ts` under `defineConfig/` if preferred |

Run via `npm run test -w=@lumpcode/cli`.

### `@lumpcode/cli-utils` (consumer home + preset contracts)

`cli-utils` currently has **no** Vitest script. For `testImpl`:

1. Add Vitest (devDependency + `"test": "vitest run"` + minimal `vitest.config.ts`) mirroring `packages/core`, **or**
2. Colocate type tests under CLI that import from the **source** preset path / built package — prefer option **1** so preset contracts are tested in their owning package.

| Path | Role |
| ---- | ---- |
| `packages/apps/cli/cli-utils/src/presets/*.ts` | Stub then real type-only contracts (implementation owns real shapes; `testImpl` may add throwing/empty stubs) |
| `packages/apps/cli/cli-utils/src/presets/index.ts` | Barrel |
| `packages/apps/cli/cli-utils/src/presets/presetVariables.types.test.ts` | Closed shapes, session keys step-only, `& Extra`, excess-key errors, root re-export |
| `packages/apps/cli/cli-utils/src/defineHelpers.types.test.ts` (or next to owned `define*` sources) | `defineConfig` / `defineStep` / `definePromptFn` / `defineCommand` / `definePostCommandExecFn` / `defineCommandModule` / lump-only `define*` preserve `V`/`SV` |

Also ensure root `packages/apps/cli/cli-utils/src/index.ts` re-exports preset types (stub export is enough for red).

### Soft-align `@lumpcode/cli-types`

| Path | Role |
| ---- | ---- |
| `packages/apps/cli/cli-types/src/helpers/defineHelpers.types.test.ts` **or** a CLI-side file that imports helpers from `@lumpcode/cli-types` | Same call patterns as cli-utils: refined `defineConfig<V, SV>`, `defineCommandModule<V, SV>`, lump-only `<V>` helpers |

`cli-types` also lacks Vitest today. Prefer adding a thin Vitest setup **or** place soft-align type tests in `packages/apps/cli/src/` importing `@lumpcode/cli-types` after workspace resolution. Either is fine; pick one place and keep soft-align coverage there.

### Docs (not automated unit tests)

Docs updates in requirements (`cli-utils/README.md`, `DOCS/types.md`, `DOCS/advanced-config.md`, `cli-types/README.md`) are **acceptance checks for the implementation stage**, not `testImpl` deliverables. No snapshot tests of markdown required.

---

## 4. Shared test data / fixture types

Use the same local aliases in every type test file (copy or share a tiny `fixtures.ts` if useful):

```ts
import type { LumpVariables, StepVariables } from '@lumpcode/core';

/** Refined lump bag */
type V = { model?: string; myHookFlag: boolean };

/** Refined step bag — intentionally different from V (proves independence) */
type SV = { model?: string; newChat?: boolean; stepOnly: number };

/** Extra intersect payload */
type Extra = { customKey: string };

/** Invalid / excess key probes */
type ExcessLump = { notAPresetKey: true };
type WrongModel = { model: number }; // should fail where model?: string
```

### Preset assignability fixtures (objects, not runtime I/O)

```ts
const validCursorLump = {
  model: 'auto',
  agentPermissions: { cursorConfigDir: '.cursor' },
} as const;

const validCopilotLump = {
  model: 'auto',
  agentPermissions: {
    writablePaths: ['src/**'],
    denyShell: ['git commit'],
  },
} as const;

const validSessionStep = {
  newChat: true,
  chatIdIndex: '0',
} as const;

const excessKeyBag = {
  model: 'auto',
  unknownPresetOption: 1,
} as const;
```

These objects are only used in type positions (`satisfies`, assignability to exported contracts, `defineConfig<…>({ lumpVariables: …, steps: [{ stepVariables: … }] })`).

### Untyped baseline (default params)

```ts
const untypedConfig = {
  baseBranch: 'main',
  lumpVariables: { anything: 1 },
  steps: [{ stepVariables: { alsoAnything: true } }],
};
```

Must remain assignable to `defineConfig(untypedConfig)` / `LumpJsConfig` / `RunLumpInput` without explicit type args.

---

## 5. Test cases

Each case: **ID**, **asserts**, **data**, **expectation**, **where**.

### 5.1 Core — dual bag `<V, SV>`

| ID | Case | Data / setup | Expectation |
| -- | ---- | ------------ | ----------- |
| C1 | `PromptFn<V, SV>` input bags | `define`-style callback reading `params.lumpVariables.myHookFlag` and `params.stepVariables?.stepOnly` with `V`/`SV` above | `expectTypeOf(params.lumpVariables).toEqualTypeOf<V>()`; step bag `SV \| undefined` (or required if input types step bag as optional — match final signature; refined fields present) |
| C2 | `CommandFn<V, SV>` | Same | Refined bags on command callback params |
| C3 | `PostCommandExecFn<V, SV>` | Same | Refined bags on post-exec params |
| C4 | `Step<V, SV>` / `Steps<V, SV>` | `stepVariables: SV`; nested `promptFn`/`commandFn` | `stepVariables` typed as `SV`; callbacks see `V`/`SV` |
| C5 | `RunLumpInput<V, SV>` / `runLump` | `lumpVariables: V`, `steps: Steps<V, SV>` | Input accepts both; `runLump` type params match (default args still work) |
| C6 | `HistoryEntry<V, SV>` | Entry with both bags | Both bags refined |
| C7 | Default type params | Assign untyped `lumpVariables: Record<string, unknown>` configs / steps without type args | Compiles (today’s assignability preserved) |
| C8 | `V` ⟂ `SV` independence | `RunLumpInput<V, SV>` where `SV` has keys not in `V` and vice versa | Compiles; no constraint `SV extends V` |

### 5.2 Core — lump-only `<V>`

| ID | Case | Expectation |
| -- | ---- | ----------- |
| C9 | `BranchFn<V>`, `SetupFn<V>`, `TeardownFn<V>` | Params expose `lumpVariables: V` (or equivalent field names as today); no `SV` type param on the fn type |
| C10 | `GetContextListFn` / `GetContextListFnInput`<V> | `lumpVariables: V` |
| C11 | `GitCommitMessageFn` / input `<V>` | `lumpVariables: V` |
| C12 | Git add/commit/push command fn types | **No** new type params (still unparameterized) — `expectTypeOf` arity / assignability unchanged |

### 5.3 CLI authoring types

| ID | Case | Data | Expectation |
| -- | ---- | ---- | ----------- |
| A1 | `LumpJsConfig<V, SV>` | `lumpVariables: V`, step with `stepVariables: SV` | Compiles; excess step key fails with `@ts-expect-error` |
| A2 | `LumpJsConfigStep` / `LumpJsConfigSteps` / `LumpJsConfigStepsItem`<V, SV>; `LumpJsConfigStepsFn`/`StepFn` | Solo step + array forms; dynamic expander | Steps/item carry `SV` on `stepVariables`; hooks on leaf steps see `V`/`SV`; expander **input** is lump-bag only (`Omit<…, 'stepVariables'>` — no `SV` on input) |
| A3 | `LumpJsonConfig` / `LumpJsonConfigStep`<V, SV> | JSON-shaped object with `stepVariables?: SV` | Compiles; function fields still excluded from JSON config type |
| A4 | `CommandModule<V, SV>` | `{ command: CommandFn<V, SV>; setup?: SetupFn<V>; teardown?: TeardownFn<V> }` | `command` dual-generic; setup/teardown lump-only |
| A5 | `ContextMatchFn<V>` | Params `lumpVariables: V` | Replaces hardcoded `Record<string, unknown>`; refined access works |
| A6 | Defaults | Untyped `LumpJsConfig` / `CommandModule` without params | Still assignable |

### 5.4 `define*` helpers (cli-utils consumer home + soft-align cli-types)

Test the **same matrix** against imports from `@lumpcode/cli-utils` (canonical) and `@lumpcode/cli-types` (soft align).

| ID | Helper | Generics | Assert |
| -- | ------ | -------- | ------ |
| D1 | `defineConfig` | `<V, SV>` | Return type `LumpJsConfig<V, SV>`; refined `lumpVariables` / step `stepVariables` checked inside config literal; excess keys on typed bags error |
| D2 | `defineStep` | `<V, SV>` | Does not widen `stepVariables` back to `StepVariables` |
| D3 | `definePromptFn` | `<V, SV>` | Callback params refined; return still `PromptFn<V, SV>` |
| D4 | `defineCommand` | `<V, SV>` | Same for `CommandFn` |
| D5 | `definePostCommandExecFn` | `<V, SV>` | Same |
| D6 | `defineCommandModule` | `<V, SV>` | Module `command` + setup/teardown typing; **must not** erase to unparameterized `CommandModule` |
| D7 | `defineCommandSetup`, `defineCommandTeardown`, `defineSetupFn`, `defineTeardownFn`, `defineBranchFn`, `defineGetContextListFn`, `defineGitCommitMessageFn`, `defineContextMatchFn` | `<V>` | Lump bag refined; no forced `SV` |
| D8 | `defineGitAddCommandFn`, `defineGitCommitCommandFn`, `defineGitPushCommandFn`, `defineContextOptionsFn` | none | Signatures unchanged (no new type params) |
| D9 | Default params | `defineConfig({ …untyped… })` | Compiles without type args |
| D10 | Erasure guard | Capture `const cfg = defineConfig<V, SV>({…})` then `expectTypeOf(cfg).toEqualTypeOf<LumpJsConfig<V, SV>>()` | Fails if helper returns bare `LumpJsConfig` / `LumpJsConfig<LumpVariables>` |

### 5.5 Preset contracts (`@lumpcode/cli-utils`)

| ID | Case | Data | Expectation |
| -- | ---- | ---- | ----------- |
| P1 | Export surface | `import type { PresetSessionStepVariables, CursorAgentPermissions, CopilotAgentPermissions, CursorPresetLumpVariables, CopilotPresetLumpVariables, CursorPresetStepVariables, CopilotPresetStepVariables } from '@lumpcode/cli-utils'` | All seven names resolve from package root |
| P2 | `PresetSessionStepVariables` shape | `{ newChat?: boolean; chatIdIndex?: string \| null }` | `expectTypeOf<PresetSessionStepVariables>().toEqualTypeOf<{…}>()` (exact optional keys) |
| P3 | `CursorAgentPermissions` / `CopilotAgentPermissions` | As in requirements table | Exact optional fields; no index signature |
| P4 | Lump contracts | `CursorPresetLumpVariables` / `CopilotPresetLumpVariables` | `{ model?: string; agentPermissions?: … }` only |
| P5 | Step contracts | `CursorPresetStepVariables` / `CopilotPresetStepVariables` | Equal to lump contract `& PresetSessionStepVariables` |
| P6 | Session keys lump-excluded | Assign `{ newChat: true }` to `CursorPresetLumpVariables` | `@ts-expect-error` (or not assignable) |
| P7 | Closed keys | Assign `excessKeyBag` to each preset lump/step contract | `@ts-expect-error` |
| P8 | Wrong value types | `{ model: 1 }` as preset lump | `@ts-expect-error` |
| P9 | `& Extra` | `CursorPresetLumpVariables & Extra` / step analog | Accepts `customKey`; still accepts `model` / `agentPermissions`; still rejects unknown preset keys on the preset side of the intersection when checked via `satisfies` on the preset fields (document pattern: consumer uses intersection on `defineConfig` type args) |
| P10 | Consumer pattern compile fixture | `defineConfig<CursorPresetLumpVariables & Extra, CursorPresetStepVariables & Extra>({ lumpVariables: { model: 'auto', customKey: 'x' }, steps: [{ stepVariables: { newChat: true, customKey: 'x' } }] })` | Compiles |
| P11 | No open index signature | `expectTypeOf<CursorPresetLumpVariables>().not.toHaveProperty` is insufficient — use: a value with only an index-signature-friendly excess key must error (P7). Optionally `Equal` to a mapped closed type without `[key: string]: unknown` |
| P12 | Source location (lightweight) | Import from package root only in tests; implementation places files under `cli-utils/src/presets/` | If useful, a comment in the test file points at that directory; no filesystem assertion required |

### 5.6 Soft-align + non-deletion

| ID | Case | Expectation |
| -- | ---- | ----------- |
| S1 | `cli-types` `defineConfig` / `defineCommandModule` / dual-bag helpers accept `<V, SV>` like cli-utils | Same fixtures as D1–D6 compile against `@lumpcode/cli-types` |
| S2 | Package still importable | `import '@lumpcode/cli-types'` / helper imports succeed (package not removed) |

### 5.7 Regression / suite health

| ID | Case | Expectation |
| -- | ---- | ----------- |
| R1 | Existing `defineConfig` identity unit tests | Still pass |
| R2 | `npm run build` + `npm run test` for `core`, `cli-types` (build), `cli-utils` (build + new tests), `cli` | Green after implementation; during `testImpl`, type tests intentionally red |
| R3 | No runtime preset behavior tests required | Do **not** add E2E asserting cursor/copilot argv; out of scope |

### 5.8 Docs (implementation acceptance checklist — not `testImpl`)

Verify manually when implementing (map to requirements Docs updates table):

- [ ] `packages/apps/cli/cli-utils/README.md` — import `defineConfig` + preset types from `@lumpcode/cli-utils`; `<V, SV>` + `& Extra` example
- [ ] `packages/apps/cli/DOCS/types.md` — dual generics on consumers; list preset type names
- [ ] `packages/apps/cli/DOCS/advanced-config.md` — links/names for preset options
- [ ] `packages/apps/cli/cli-types/README.md` — soft-align note; prefer cli-utils for new work

---

## 6. Test expectations (summary matrix)

| Requirement acceptance criterion | Covered by |
| -------------------------------- | ---------- |
| 1. `runLump` / `RunLumpInput` / `Step` / `Steps` + both-bag hooks `<V, SV>` + defaults | C1–C8 |
| 2. Lump-only hooks `<V>` + defaults | C9–C12, D7 |
| 3. `LumpJsConfig`, `LumpJsConfigSteps` / `LumpJsConfigStepsItem`, `LumpJsConfigStepsFn`/`StepFn` (V-only input), `LumpJsonConfig`, `CommandModule`, `ContextMatchFn` generics | A1–A6 |
| 4. Variable-carrying `define*` generic, no erasure | D1–D10 |
| 5. Preset contracts exported from cli-utils / `src/presets/` | P1–P12 |
| 6. cli-types soft align; not deleted | S1–S2 |
| 7. Docs | §5.8 checklist (implementation) |
| 8. Build/tests pass; no intentional preset `.js` runtime change | R1–R3 |
| 9. Non-goals absent | No tests that require Zod, new presets, `SV extends V`, open index signatures, or in-repo lump migrations |

---

## 7. Implementation details for writing the tests

### 7.1 Vitest type assertions

```ts
import { describe, it, expectTypeOf } from 'vitest';
import type { PromptFn } from '@lumpcode/core';

type V = { myHookFlag: boolean };
type SV = { stepOnly: number };

describe('PromptFn generics', () => {
  it('refines both bags', () => {
    const fn: PromptFn<V, SV> = (params) => {
      expectTypeOf(params.lumpVariables).toEqualTypeOf<V>();
      expectTypeOf(params.stepVariables).toEqualTypeOf<SV | undefined>();
      return '';
    };
    void fn;
  });
});
```

### 7.2 Negative cases

```ts
it('rejects excess preset keys', () => {
  // @ts-expect-error — closed CursorPresetLumpVariables
  const bad: CursorPresetLumpVariables = { unknownPresetOption: 1 };
  void bad;
});
```

If `@ts-expect-error` is unused (code accidentally valid), TypeScript fails the test file — that is desired.

### 7.3 Helper non-erasure

Prefer `expectTypeOf(defineConfig<V, SV>(…)).toEqualTypeOf<LumpJsConfig<V, SV>>()` over only checking callback inference. Identity helpers that are typed as `identity<Unparameterized>` will fail D6/D10 until signatures become generic functions (see requirements signature shape).

### 7.4 cli-utils Vitest bootstrap (if missing)

Minimal addition during `testImpl`:

- `vitest` + `typescript` already present as needed
- `vitest.config.ts` with `environment: 'node'`
- `"test": "vitest run"` on `cli-utils` `package.json`
- Ensure CI / local `npm run test -w=@lumpcode/cli-utils` is how these run (implementation may also wire workspace scripts if CI currently skips packages without a test script — match how `cli-types` is handled: today CI builds cli-types; if cli-utils gains tests, they should run in the same unit-test job once a `test` script exists)

### 7.5 Stub strategy for red tests

| Surface | Stub until implementation |
| ------- | ------------------------- |
| Preset type exports | Export type aliases that are **wrong** (e.g. `export type CursorPresetLumpVariables = Record<string, unknown>`) so P7/P11 fail closedness, or omit session keys from step types so P5 fails |
| Generic helpers | Keep current single-`V` / non-generic `identity<T>` until implementation; D1/D6/D10 stay red |
| Core hooks | Keep current non-`SV` signatures; C1–C6 red |

Do not change shipped `presets/commands/*.js` in `testImpl`.

### 7.6 Commands to run

```bash
npm run build -w=@lumpcode/core
npm run test -w=@lumpcode/core

npm run build -w=@lumpcode/cli-types
# soft-align type tests: wherever placed

npm run build -w=@lumpcode/cli-utils
npm run test -w=@lumpcode/cli-utils   # after Vitest is added

npm run test -w=@lumpcode/cli
```

After full implementation, all of the above are green. After `testImpl` only, type-level cases for new contracts are red by design.

---

## 8. Out of scope (do not add tests for)

- Zod / runtime validation of variable shapes inside presets
- New agent presets (`claude-code`, `opencode`, `codex`)
- Migrating `.lumpcode/lumps/**` configs to use generics
- Nesting preset options under a new namespace
- Constraining `SV extends V`
- Prompt template substitution using `lumpVariables` (still `context.variables`)
- Hard deletion of `@lumpcode/cli-types`
- Engine E2E proving spawn/argv for cursor/copilot

---

## 9. Done criteria for `testImpl`

- [ ] Type test files exist for core, CLI authoring types, cli-utils presets + `define*`, and cli-types soft-align (or CLI-hosted soft-align imports)
- [ ] Preset type names are importable from `@lumpcode/cli-utils` root (stubs OK)
- [ ] Cases C*, A*, D*, P*, S*, R1 are represented
- [ ] Suite runs (Vitest) and type assertions fail where implementation is incomplete
- [ ] No edits to `desc.yml` / `requirements.md`; no docs required in `testImpl`
- [ ] No intentional changes to shipped preset `.js` runtime modules
