# Test plan: History files as YAML (`keepHistory`)

| Field | Value |
| --- | --- |
| **Backlog** | `history-as-yaml` |
| **PRD** | [history-as-yaml.prd.md](../prds/history-as-yaml.prd.md) |
| **Packages** | `packages/core` (primary), `packages/apps/cli` (path wiring, integration) |
| **Out of scope** | New CLI subcommands, `lumpConfig.schema.json` changes, `contextStatusRecord.json`, E2E scenarios unless SEA smoke is needed for bundle regression |

## Summary

Verify that `keepHistory: true` writes human-readable YAML history at `.lumpcode/lumps/<lumpName>/history/<contextName>.yaml`, preserves existing append semantics and entry shape, migrates legacy `.json` files once, and keeps JSON read/write for custom `.json` paths. Lump config and CLI argv stay unchanged.

## Test environment

- **Node:** 22+
- **Runner:** Vitest (`npm run test` per package)
- **Working directory:** Monorepo root or package directory
- **Conventions (from AGENTS.md):**
  - Unit tests that init temp git repos must set local `user.name` / `user.email` before `git commit`.
  - Tests that write files must use a temp `projectRoot` / `tmpDir`, not process `cwd`.
  - Prefer integration-style tests with real `echo` subprocesses over mocking `executeStepsForContextList` internals.
  - Use `mkdtemp` + `rm(..., { recursive: true })` for teardown.

### Commands

```bash
# Core unit + integration
cd packages/core && npm run test

# CLI unit + jsConfigToRunLumpInput integration
cd packages/apps/cli && npm run test

# Optional: full monorepo unit gate (CI parity)
npm run test --workspaces --if-present
```

After core Rollup / CLI bundle changes, rebuild before SEA smoke:

```bash
cd packages/core && npm run build
cd packages/apps/cli && npm run build:bundle && npm run build:sea
```

## Shared test helpers

Reuse existing patterns where possible:

| Helper | Location | Use |
| --- | --- | --- |
| `initTestGitRepo` | `packages/core/src/helpers/executeStepsForContextList/unit.test.ts` | Git identity + empty initial commit |
| `runWithHistory` | same file | Thin wrapper over `executeStepsForContextList` with stub git/workspace fns |
| `makeSteps` | same file | Map prompt strings → `{ promptFn, commandFn: echo }` steps |
| `assertSuccess` / `resolveJsConf` | `packages/apps/cli/src/utils/jsConfigToRunLumpInput/unit.test.ts` | CLI config → `runLump` input |
| `load` from `js-yaml` | Already used in lump loaders | Parse written `.yaml` / `.yml` history in assertions |

Suggested new core-only helper file (implementer choice):

- `packages/core/src/utils/historyFile/` — `historyFormatFromPath`, `readHistoryFile`, `writeHistoryFile`, `appendHistoryEntry`
- Co-located `unit.test.ts` for format/migration/parse-error cases without full step walk

Export helpers from `packages/core/src/utils/index.ts` only if other packages need them; otherwise keep private to core.

---

## Test cases

### TC-01 — CLI default path uses `.yaml`

**Maps to:** PRD acceptance #1

| | |
| --- | --- |
| **Package** | `packages/apps/cli` |
| **File** | `src/utils/lumpHistoryFilePath/unit.test.ts` |

**Test data**

```ts
{ projectRoot: '/tmp/project', lumpName: 'refactor', contextName: 'ctx' }
```

**Expectations**

- `lumpHistoryFilePath(...)` returns `…/history/ctx.yaml` (not `.json`).
- Test title/description updated from "JSON" to "YAML".

**Also update:** `jsConfigToRunLumpInput/unit.test.ts` → `keepHistory` describe block: expected path ends in `ctx.yaml`.

---

### TC-02 — `keepHistory` wiring unchanged

**Maps to:** PRD goals (lump config unchanged)

| | |
| --- | --- |
| **Package** | `packages/apps/cli` |
| **File** | `src/utils/jsConfigToRunLumpInput/unit.test.ts` |

**Test data**

- Config without `keepHistory`
- Config `keepHistory: false`
- Config `keepHistory: true`

**Expectations**

- Omitted / `false` → `getKeepHistoryFilePathFn(ctx)` is `undefined`.
- `true` → function returns TC-01 `.yaml` path for the context name.

---

### TC-03 — First write creates parent dirs and empty YAML array

**Maps to:** PRD file layout, acceptance #2

| | |
| --- | --- |
| **Package** | `packages/core` |
| **File** | `src/helpers/executeStepsForContextList/unit.test.ts` (update existing test) |

**Test data**

- `historyPath`: `<tmp>/.lumpcode/lumps/myLump/history/nested/ctx.yaml` (nested parent dir does not exist)
- One step: prompt `'first prompt'`, `echo ok`

**Expectations**

- Run succeeds.
- File exists; raw content parses as YAML to a **sequence** of length 1.
- Parent directories created (`history/nested/`).
- On a fresh file, initial on-disk content before append may be `[]` or only appear after first append (both acceptable if final state is valid).

---

### TC-04 — Multi-step append preserves order and `stepIndex`

**Maps to:** PRD acceptance #2, write ordering

| | |
| --- | --- |
| **Package** | `packages/core` |
| **File** | `executeStepsForContextList/unit.test.ts` (update existing) |

**Test data**

- `historyPath`: `<tmp>/history/ctx.yaml`
- Steps: `['step one', 'step two']`

**Expectations**

- Sequence length 2.
- `[0].prompt === 'step one'`, `[0].stepIndex === 0`
- `[1].prompt === 'step two'`, `[1].stepIndex === 1`
- Entries appear in execution order.

---

### TC-05 — Entry shape matches `PostCommandExecFn` input

**Maps to:** PRD acceptance #2

| | |
| --- | --- |
| **Package** | `packages/core` + `packages/apps/cli` |

**Core test data**

- `lumpVariables`: `{ FOO: 'bar' }`
- Context: `{ name: 'ctx', variables: { FILE: 'a.ts' }, options: { x: 1 } }`
- Step with `stepVariables: { STEP: 'v' }` (if step walk supports via config)
- `contextRunState` seeded in `setupFn`: `{ mySetup: { id: 'abc' } }`
- `commandFn` → `echo` with distinctive output

**CLI integration test data** (update existing `writes prompt history when keepHistory is true`)

- `keepHistory: true`, two string steps, context `component`, `FILE: 'Button.tsx'`
- `runLump` with stub git fns (existing pattern)

**Expectations**

Each history entry includes (deep-equal where applicable):

| Field | Assertion |
| --- | --- |
| `commandResult` | Contains subprocess stdout (e.g. `agent-output` / `ok`) |
| `commandSucceeded` | `true` on exit 0 |
| `context` | Full context object including `name`, `variables`, optional `options` |
| `prompt` | Resolved prompt string |
| `stepIndex` | `number` or `number[]` for nested steps |
| `contextRunState` | Reflects mutations from prior steps / setup |
| `lumpVariables` | Matches run input |
| `stepVariables` | Present when step defines them |
| `projectRoot` | Absolute temp project root |

No extra keys; no removed keys vs current JSON behavior.

---

### TC-06 — Multi-line `prompt` and `commandResult` use literal block scalars

**Maps to:** PRD acceptance #3

| | |
| --- | --- |
| **Package** | `packages/core` |
| **File** | New test in `executeStepsForContextList/unit.test.ts` or `utils/historyFile/unit.test.ts` |

**Test data**

- Prompt template (via `promptFn`): `'Line one\nLine two\nLine three'`
- `commandFn`: `echo` with args that include a newline, e.g. `printf` / `node -e "console.log('out\\nline2')"` — prefer portable `node -e` in test:

```ts
commandFn: () => ({
  executable: 'node',
  args: ['-e', "console.log('result line 1\\nresult line 2')"],
}),
```

- `historyPath`: `<tmp>/history/multiline.yaml`

**Expectations**

- Parsed YAML values equal the original strings (with real newline characters).
- Raw file content uses literal block style for those fields: lines matching `^\s+prompt: \|` and `^\s+commandResult: \|` (multiline regex), **or** block content appears unescaped on subsequent indented lines.
- Raw file must **not** contain JSON-style `\\n` escapes inside those field values.

---

### TC-07 — Short single-line strings may use plain or quoted scalars

**Maps to:** PRD example (non-blocking readability)

| | |
| --- | --- |
| **Package** | `packages/core` |

**Test data**

- Prompt: `'Run tests and fix failures.'`
- `commandResult` from `echo 'All tests passed.'`

**Expectations**

- Parsed values correct.
- No requirement for `|` when string has no `\n` (plain or quoted YAML acceptable).

---

### TC-08 — No history file when `commandFn` returns `null`

**Maps to:** PRD acceptance #4

| | |
| --- | --- |
| **Package** | `packages/core` |
| **File** | `executeStepsForContextList/unit.test.ts` (update existing) |

**Test data**

- `historyPath`: `<tmp>/history/ctx.yaml`
- Single step: `commandFn: () => null`
- Optional: `postCommandExecFn` that mutates `contextRunState` (existing test proves hook still runs)

**Expectations**

- Run succeeds.
- `access(historyPath)` rejects (file not created).
- `postCommandExecFn` still invoked (regression guard).

---

### TC-09 — No history when `getKeepHistoryFilePathFn` returns `undefined`

**Maps to:** PRD "When history is written" table

| | |
| --- | --- |
| **Package** | `packages/core` |

**Test data**

- `getKeepHistoryFilePathFn: () => undefined`
- Steps that would otherwise write history

**Expectations**

- No file under expected path.

---

### TC-10 — History appended before `postCommandExecFn`

**Maps to:** PRD goal #4 (write ordering)

| | |
| --- | --- |
| **Package** | `packages/core` |

**Test data**

- `historyPath`: `<tmp>/history/order.yaml`
- Step with `postCommandExecFn` that sets `contextRunState.marker = 'after'`
- After run, read history entry `[0].contextRunState`

**Expectations**

- History entry's `contextRunState` reflects state **before** `postCommandExecFn` mutations (e.g. `marker` absent or prior value), matching current JSON behavior.
- Implement via ordering assertion: if `postCommandExecFn` sets a key, that key must not appear in the appended entry (or equals pre-hook snapshot).

---

### TC-11 — `commandSucceeded: false` with `continueOnError`

**Maps to:** PRD entry shape / `commandSucceeded` semantics

| | |
| --- | --- |
| **Package** | `packages/core` |

**Test data**

- Step: `commandFn` → failing command (`echo` wrong exit: `node -e "process.exit(1)"`), `continueOnError: true`
- `historyPath`: `<tmp>/history/fail.yaml`

**Expectations**

- Run succeeds (walk continues).
- History entry exists with `commandSucceeded: false`.
- `commandResult` captured (stderr/stdout per existing engine behavior).

---

### TC-12 — Nested `stepIndex` as `number[]`

**Maps to:** PRD entry shape

| | |
| --- | --- |
| **Package** | `packages/core` |

**Test data**

- Dynamic/recursive `steps` that produce a nested leaf (reuse pattern from existing dynamic-step tests).
- `historyPath` on `.yaml`

**Expectations**

- At least one entry has `stepIndex` deep-equal to e.g. `[1, 0]` (array, not string).

---

### TC-13 — Legacy `.json` migration to sibling `.yaml`

**Maps to:** PRD acceptance #5

| | |
| --- | --- |
| **Package** | `packages/core` |
| **File** | `utils/historyFile/unit.test.ts` (recommended) + optional integration in `executeStepsForContextList` |

**Test data**

**Pre-seed** `<tmp>/history/feature-x.json`:

```json
[
  {
    "commandSucceeded": true,
    "prompt": "legacy prompt",
    "commandResult": "legacy output",
    "context": { "name": "feature-x", "variables": {} },
    "stepIndex": 0,
    "contextRunState": {},
    "lumpVariables": {},
    "projectRoot": "/old/root"
  }
]
```

- Target path for append: `<tmp>/history/feature-x.yaml`
- **No** `feature-x.yaml` file initially.
- Run one new step appending a second entry (integration) or call `appendHistoryEntry` directly (unit).

**Expectations**

- After successful write:
  - `feature-x.yaml` exists and parses to sequence length **2**.
  - `[0]` deep-equals legacy entry (fields preserved).
  - `[1]` is the new entry.
  - `feature-x.json` **deleted**.
- If YAML write fails, `.json` must remain (migration is atomic).

---

### TC-14 — Existing `.yaml` takes precedence over legacy `.json`

**Maps to:** PRD migration step 1

**Test data**

- Both `ctx.yaml` (1 entry) and `ctx.json` (different legacy entry) exist.
- Append to `ctx.yaml`.

**Expectations**

- Load from `.yaml` only; append to YAML content.
- `.json` **not** used for merge (may remain on disk as orphan — PRD non-goal for non-sibling custom paths; for same basename, implementer should not delete `.json` if YAML already existed, or document behavior: **YAML wins, JSON ignored**).

---

### TC-15 — Custom `.json` path still uses JSON

**Maps to:** PRD acceptance #6, format-by-extension table

| | |
| --- | --- |
| **Package** | `packages/core` |

**Test data**

- `getKeepHistoryFilePathFn: () => '<tmp>/custom/run.log.json'`
- Two steps with distinct prompts

**Expectations**

- File content is valid JSON ( `JSON.parse` succeeds).
- Pretty-printed with 2-space indent (match current `JSON.stringify(..., null, 2)` behavior).
- **No** `.yaml` sibling created.
- **No** migration from unrelated paths.

---

### TC-16 — `.yml` extension supported

**Maps to:** PRD open question #1

| | |
| --- | --- |
| **Package** | `packages/core` |
| **File** | `utils/historyFile/unit.test.ts` |

**Test data**

- `historyFormatFromPath('/tmp/h.ctx.yml')` → `'yaml'`
- Round-trip read/write on `.yml` path

**Expectations**

- Format detection accepts `.yml`.
- CLI default remains `.yaml` (TC-01).

---

### TC-17 — Unsupported extension returns structured failure

**Maps to:** PRD format-by-extension table

**Test data**

- Path: `<tmp>/history/ctx.txt` or `.log`

**Expectations**

- Append/read returns failure (or step walk fails) with message mentioning the file path and unsupported extension.
- No uncaught throw (SEA-safe).

---

### TC-18 — Invalid YAML on read fails run with clear path

**Maps to:** PRD risks #5, #8

**Test data**

- Pre-seed `<tmp>/history/broken.yaml` with content: `not: [valid: yaml: sequence`

- Run step that triggers append.

**Expectations**

- `executeStepsForContextList` returns `success: false` (or equivalent failure).
- Error message includes `broken.yaml` path.

---

### TC-19 — Invalid legacy JSON on migration fails clearly

**Test data**

- `ctx.json` content: `{ not an array }`
- Target `ctx.yaml` missing

**Expectations**

- Failure with path to `.json` or `.yaml` in message.
- `.json` not deleted on failure.

---

### TC-20 — CLI end-to-end `runLump` writes YAML history

**Maps to:** PRD acceptance #1–#2 (integration)

| | |
| --- | --- |
| **Package** | `packages/apps/cli` |
| **File** | `jsConfigToRunLumpInput/unit.test.ts` — update `writes prompt history when keepHistory is true` |

**Test data**

- Existing test fixture (temp repo, `history-lump`, context `component`, two steps).

**Expectations**

- History path: `…/history/component.yaml`
- Parse with `js-yaml` `load`, not `JSON.parse`.
- Two entries; field assertions unchanged from current test.

---

### TC-21 — `@lumpcode/core` publishes `js-yaml` dependency

**Maps to:** PRD acceptance #8

| | |
| --- | --- |
| **Type** | Static / build verification |

**Expectations**

- `packages/core/package.json` `dependencies` includes `"js-yaml": "^5.0.0"` (aligned with monorepo root).
- `npm run build` in `packages/core` succeeds.
- Built `dist/` resolves history helpers without requiring separate `js-yaml` install for consumers of the bundled artifact (Rollup: **do not** list `js-yaml` in `external` if PRD requires bundling; mirror `ignore` dependency listing).

**Optional smoke**

```bash
node -e "import('@lumpcode/core').then(m => console.log('ok'))"
```

From a temp dir with only built core installed.

---

### TC-22 — Core history helpers unit coverage

**Maps to:** PRD technical approach (extract helpers)

| | |
| --- | --- |
| **Package** | `packages/core` |
| **File** | `src/utils/historyFile/unit.test.ts` (new) |

**Cases**

| Case | Expectation |
| --- | --- |
| `historyFormatFromPath('a.yaml')` | `'yaml'` |
| `historyFormatFromPath('a.YML')` | `'yaml'` (case-insensitive if implementer chooses) |
| `historyFormatFromPath('a.json')` | `'json'` |
| `readHistoryFile` empty `[]` | `[]` |
| `writeHistoryFile` + `readHistoryFile` round trip | Deep equal entries |
| `appendHistoryEntry` on missing file | Creates dirs + one entry |
| `appendHistoryEntry` twice | Two entries |

---

### TC-23 — Documentation reflects YAML default

**Maps to:** PRD acceptance #7

| | |
| --- | --- |
| **Type** | Manual or grep-based checklist |

**Files to verify** (no `.json` as **default** CLI path):

| File | Check |
| --- | --- |
| `packages/apps/cli/DOCS/lump-config.md` | Tree, `keepHistory` table, § Prompt run history: `.yaml`, YAML sequence example with `\|` block scalars |
| `packages/apps/cli/DOCS/get-started.md` | Paths table row |
| `packages/apps/cli/DOCS/concepts.md` | Mermaid node + prose |
| `packages/core/README.md` | `getKeepHistoryFilePathFn` section |
| `AGENTS.md` | Workspace fact for `keepHistory` |
| `packages/apps/cli/DOCS/types.md` | Only if still says default history is JSON |

**Expectations**

- Default path pattern: `.lumpcode/lumps/<lumpName>/history/<contextName>.yaml`
- Entry field table unchanged (same field names).
- User-facing docs do **not** mention internal helper names (`readHistoryFile`, `js-yaml`).

**Automatable check (optional script for implementer)**

```bash
rg '\.json' packages/apps/cli/DOCS/lump-config.md packages/apps/cli/DOCS/get-started.md packages/apps/cli/DOCS/concepts.md packages/core/README.md \
  | rg 'history/<contextName>' && exit 1 || exit 0
```

---

### TC-24 — `project-setup` gitignore still covers YAML history

**Maps to:** PRD non-goals (gitignore unchanged)

**Expectations**

- `.lumpcode/**/history/` pattern in project-setup templates still gitignores `.yaml` files (pattern is extension-agnostic). No test change required unless regression found; spot-check `project-setup` unit test or scaffold output.

---

### TC-25 — Concurrent append (documented limitation)

**Maps to:** PRD risk #3

**Expectations**

- **No new test required** — same read-modify-write race as JSON. Optional comment in helper module only.

---

## Test data fixtures

### Fixture A — Minimal legacy JSON (migration)

Path: `<tmp>/history/migrate-me.json`

```json
[
  {
    "commandSucceeded": true,
    "prompt": "legacy",
    "commandResult": "out",
    "context": { "name": "migrate-me", "variables": {} },
    "stepIndex": 0,
    "contextRunState": {},
    "lumpVariables": {},
    "projectRoot": "/tmp/placeholder"
  }
]
```

### Fixture B — Multi-line content

| Key | Value |
| --- | --- |
| `prompt` | `Refactor src/Button.tsx for accessibility.\nFocus on keyboard navigation.` |
| `commandResult` | `Updated Button.tsx\nAdded tabIndex.` |

### Fixture C — Rich entry (shape regression)

```yaml
# Expected after one step (illustrative; tests assert parsed object, not exact formatting)
- commandSucceeded: true
  prompt: single
  commandResult: ok
  context:
    name: ctx
    variables:
      FILE: x.ts
    options:
      flag: true
  stepIndex: 0
  contextRunState:
    copilotSetup:
      setupChatId: test-id
  lumpVariables:
    LUMP: v
  stepVariables:
    S: step
  projectRoot: /absolute/tmp/project
```

### Fixture D — Invalid files

| File | Content |
| --- | --- |
| `broken.yaml` | `{{invalid` |
| `bad.json` | `"not-an-array"` |

---

## Test implementation details

### Files to create

| File | Purpose |
| --- | --- |
| `packages/core/src/utils/historyFile/main.ts` | `historyFormatFromPath`, `readHistoryFile`, `writeHistoryFile`, `appendHistoryEntry` |
| `packages/core/src/utils/historyFile/index.ts` | Barrel export |
| `packages/core/src/utils/historyFile/unit.test.ts` | TC-13–TC-17, TC-22 |

### Files to modify

| File | Changes |
| --- | --- |
| `packages/core/src/helpers/executeStepsForContextList/main.ts` | Replace inline `JSON.parse` / `stringify` with `appendHistoryEntry` |
| `packages/core/src/helpers/executeStepsForContextList/unit.test.ts` | `.json` → `.yaml` paths; `JSON.parse` → `yaml.load`; add TC-06, TC-10–TC-12 |
| `packages/core/package.json` | Add `js-yaml` dependency |
| `packages/core/rollup.config.js` | Bundle `js-yaml` (remove from `external` if added) |
| `packages/apps/cli/src/utils/lumpHistoryFilePath/main.ts` | `.json` → `.yaml` |
| `packages/apps/cli/src/utils/lumpHistoryFilePath/unit.test.ts` | Expected extension |
| `packages/apps/cli/src/utils/jsConfigToRunLumpInput/unit.test.ts` | Path + YAML parse in integration test |
| Docs + `AGENTS.md` | Per PRD docs table |

### Assertion patterns

**Parse YAML history**

```ts
import { load as loadYaml } from 'js-yaml';
import { readFile } from 'node:fs/promises';

const entries = loadYaml(await readFile(historyPath, 'utf-8')) as HistoryEntry[];
```

**Assert block scalar in raw file**

```ts
const raw = await readFile(historyPath, 'utf-8');
expect(raw).toMatch(/prompt: \|/);
expect(raw).not.toMatch(/Line one\\nLine two/);
```

**Migration**

```ts
import { access } from 'node:fs/promises';

await expect(access(jsonPath)).rejects.toThrow();
const entries = loadYaml(await readFile(yamlPath, 'utf-8'));
expect(entries).toHaveLength(2);
```

### Type alias (tests)

```ts
type HistoryEntry = {
  commandResult: string;
  commandSucceeded: boolean;
  context: { name: string; variables: Record<string, string>; options?: Record<string, unknown> };
  prompt: string;
  stepIndex: number | number[];
  contextRunState: Record<string, unknown>;
  lumpVariables: Record<string, unknown>;
  stepVariables?: Record<string, unknown>;
  projectRoot: string;
};
```

Align with `PostCommandExecFn` input from `packages/core/src/types/PostCommandExecFn.ts`.

### SEA / CLI bundle (optional regression)

If `js-yaml` bundling breaks SEA:

1. Build CLI bundle + SEA locally.
2. Run existing CLI E2E subset that uses `keepHistory` — **none today**.
3. Minimal manual smoke: temp project + `lumpcode run` with `keepHistory: true` lump and mock agent — only if unit/integration coverage is insufficient.

Prefer TC-20 over new E2E unless bundle issues appear in CI.

---

## Acceptance criteria traceability

| PRD # | Criterion | Test cases |
| --- | --- | --- |
| 1 | Default `.yaml` path | TC-01, TC-02, TC-20 |
| 2 | Append semantics / entry shape | TC-03–TC-05, TC-12, TC-20 |
| 3 | Block scalars for newlines | TC-06, TC-07 |
| 4 | Skip when `commandFn` null | TC-08 |
| 5 | JSON → YAML migration | TC-13, TC-14, TC-19 |
| 6 | Custom `.json` paths | TC-15 |
| 7 | Docs updated | TC-23 |
| 8 | `js-yaml` in published core | TC-21, TC-22 |

---

## Pass criteria

All Vitest tests in `packages/core` and `packages/apps/cli` pass. TC-23 docs checklist complete. No default user-facing doc still describes `.json` as the CLI history path. Migration and format-by-extension behavior match the PRD tables exactly.
