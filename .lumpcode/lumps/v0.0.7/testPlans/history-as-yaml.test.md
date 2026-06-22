# Test plan: History files as YAML (`keepHistory`)

| Field | Value |
| --- | --- |
| **Backlog** | `history-as-yaml` |
| **PRD** | [history-as-yaml.prd.md](../prds/history-as-yaml.prd.md) |
| **Packages** | `packages/core` (primary), `packages/apps/cli` (path wiring, integration) |
| **Out of scope** | New CLI subcommands, `lumpConfig.schema.json` changes, `contextStatusRecord.json`, E2E scenarios unless SEA smoke is needed for bundle regression |

## Summary

Verify that `keepHistory: true` writes human-readable YAML at `.lumpcode/lumps/<lumpName>/history/<contextName>.yaml`, preserves append semantics and entry shape, and rejects non-`.yaml`/`.yml` paths.

**Scope:** ~15 `it()` blocks across four test files, plus a short ship checklist. Cases below are grouped by file and layer — not one numbered TC per PRD bullet.

### Layering

| Layer | File | Responsibility |
| --- | --- | --- |
| CLI wiring | `lumpHistoryFilePath/unit.test.ts`, `jsConfigToRunLumpInput/unit.test.ts` | Default `.yaml` path, `keepHistory` → fn wiring, one `runLump` integration |
| Step walk | `executeStepsForContextList/unit.test.ts` | When history is written, entry shape, ordering, multiline output through the engine |
| History helpers | `historyFile/unit.test.ts` | Format detection, YAML round-trip/dump, parse and extension errors at the helper API |

Append/mkdir behavior is asserted once through the step walk; helpers get one focused append test plus format/parse coverage — not duplicate multi-step append suites at both layers.

## Test environment

- **Node:** 22+
- **Runner:** Vitest (`npm run test` per package)
- **Conventions (from AGENTS.md):** temp `projectRoot`/`tmpDir`; local git `user.name`/`user.email` before commits; real subprocesses over mocking the step walk; `mkdtemp` + `rm(..., { recursive: true })` teardown.

### Commands

```bash
cd packages/core && npm run test
cd packages/apps/cli && npm run test
npm run test --workspaces --if-present   # optional CI parity
```

After core Rollup / CLI bundle changes:

```bash
cd packages/core && npm run build
cd packages/apps/cli && npm run build:bundle && npm run build:sea
```

### Shared helpers

| Helper | Location |
| --- | --- |
| `initTestGitRepo`, `runWithHistory`, `makeSteps` | `executeStepsForContextList/unit.test.ts` |
| `assertSuccess`, `resolveJsConf` | `jsConfigToRunLumpInput/unit.test.ts` |
| `load` from `js-yaml` | Parse written history in assertions |

New module: `packages/core/src/utils/historyFile/` (`historyFormatFromPath`, `readHistoryFile`, `writeHistoryFile`, `appendHistoryEntry`) with co-located `unit.test.ts`. Export from `utils/index.ts` only if another package needs it.

---

## Automated tests

### 1. CLI — path and `keepHistory` wiring

**Files:** `lumpHistoryFilePath/unit.test.ts`, `jsConfigToRunLumpInput/unit.test.ts` (`keepHistory` describe)

**Maps to:** PRD acceptance #1

| `it()` | Expectation |
| --- | --- |
| `lumpHistoryFilePath` returns `.yaml` | `…/history/ctx.yaml` (not `.json`); update test title from "JSON" |
| `keepHistory` omitted / `false` | `getKeepHistoryFilePathFn(ctx)` is `undefined` |
| `keepHistory` true | fn returns `.yaml` path for the context name |

Three small tests; path assertion lives in `lumpHistoryFilePath` — the `keepHistory: true` case in `jsConfigToRunLumpInput` only checks wiring, not path string details again.

---

### 2. CLI — `runLump` writes YAML history

**File:** `jsConfigToRunLumpInput/unit.test.ts` — update existing `writes prompt history when keepHistory is true`

**Maps to:** PRD acceptance #1, #2

**Fixture:** temp repo, `history-lump`, context `component`, `FILE: 'Button.tsx'`, two string steps, stub git fns.

**Expectations**

- History at `…/history/component.yaml`
- Parse with `js-yaml` `load` (not `JSON.parse`)
- Two entries: `context.name`, `prompt`, `stepIndex`, `projectRoot`, `commandResult` (same assertions as today)

This is the only CLI integration test for history; no separate duplicate case.

---

### 3. Core — `executeStepsForContextList keepHistory` describe

**File:** `executeStepsForContextList/unit.test.ts`

**Maps to:** PRD acceptance #2–#4; write ordering; entry shape edge cases

#### Update existing (`.json` → `.yaml`, `JSON.parse` → `yaml.load`)

| Existing `it()` | Assert |
| --- | --- |
| `creates nested parent directories and appends history entries` | YAML sequence length 1; nested dirs; `prompt`, `commandResult`, `commandSucceeded` |
| `appends a second entry for a second step` | Sequence length 2; prompts and `stepIndex` 0/1 in order |
| `does not create a history file when getKeepHistoryFilePathFn returns undefined` | No file (unchanged behavior) |
| `does not append keepHistory when commandFn returns null` | No file; run succeeds |

#### Add new

| New `it()` | Assert |
| --- | --- |
| **Rich entry shape** | One step with `lumpVariables`, context `options`, `stepVariables`, `setupFn`-seeded `contextRunState`; all fields on entry match `PostCommandExecFn` input; no extra/missing keys |
| **Multi-line block scalars** | Prompt and `commandResult` contain real newlines; parsed values round-trip; raw file uses `\|` block style, not `\\n` escapes |
| **History before `postCommandExecFn`** | Entry `contextRunState` reflects pre-hook snapshot (key set in hook absent from entry) |
| **`commandSucceeded: false` + `continueOnError`** | Walk continues; entry has `commandSucceeded: false` and captured output |
| **Nested `stepIndex`** | Dynamic/recursive steps; at least one entry with `stepIndex` e.g. `[1, 0]` (array, not string) |
| **Invalid YAML on append** | Pre-seed broken `.yaml`; step walk fails with message including file path |

Single-line scalar format (plain vs quoted) is **not** a separate test — covered implicitly by updated existing tests.

---

### 4. Core — `historyFile` unit tests

**File:** `packages/core/src/utils/historyFile/unit.test.ts` (new)

**Maps to:** PRD supported extensions, readability dump options, helper extraction; PRD acceptance #6 (helpers in `dist/`)

| Case | Expectation |
| --- | --- |
| `historyFormatFromPath('a.yaml')` / `'a.yml'` / `'a.YML'` | `'yaml'` |
| `historyFormatFromPath('a.json')` / `'a.txt'` | structured failure |
| `readHistoryFile` on `[]` | `[]` |
| `writeHistoryFile` + `readHistoryFile` round trip | Deep-equal entries; multiline `prompt`/`commandResult` use block scalars in raw file |
| `appendHistoryEntry` on missing path | Creates parent dirs; one entry |
| `readHistoryFile` / `appendHistoryEntry` on invalid YAML | Failure includes file path; no uncaught throw |

No second multi-step append test here — step-walk describe covers append ordering.

Unsupported extension at the **step walk** is optional if helper tests already cover `appendHistoryEntry` failure for `.json`/`.txt`; prefer helper-level only to avoid duplicate paths.

---

## Ship checklist (not Vitest)

Complete before marking the backlog done.

### Docs — PRD acceptance #5

Verify path and format in (no `.json` as default CLI history path):

| File | Check |
| --- | --- |
| `packages/apps/cli/DOCS/lump-config.md` | Tree, `keepHistory` table, § Prompt run history |
| `packages/apps/cli/DOCS/get-started.md` | Paths table row |
| `packages/apps/cli/DOCS/concepts.md` | Mermaid node + prose |
| `packages/core/README.md` | `getKeepHistoryFilePathFn` section |
| `AGENTS.md` | Workspace fact for `keepHistory` |
| `packages/apps/cli/DOCS/types.md` | Only if still says default history is JSON |

Optional grep:

```bash
rg '\.json' packages/apps/cli/DOCS/lump-config.md packages/apps/cli/DOCS/get-started.md \
  packages/apps/cli/DOCS/concepts.md packages/core/README.md \
  | rg 'history/<contextName>' && exit 1 || exit 0
```

### Build — PRD acceptance #6

- `packages/core/package.json` `dependencies` includes `"js-yaml": "^5.0.0"`
- `npm run build` in `packages/core` succeeds; `js-yaml` bundled in `dist/` (not `external` in Rollup)
- Optional: import built `@lumpcode/core` from a temp dir with only built core installed

### Spot-checks (no new tests)

- **`project-setup` gitignore** — `.lumpcode/**/history/` still covers `.yaml` (extension-agnostic pattern)
- **Concurrent append** — known read-modify-write race; optional comment in helper module only

### SEA smoke (only if bundling breaks)

Build CLI bundle + SEA; manual `lumpcode run` with `keepHistory: true` if unit/integration coverage misses a bundle issue. No new E2E scenario required today.

---

## Fixtures

**Multi-line** (TC block-scalar tests):

| Key | Value |
| --- | --- |
| `prompt` | `Refactor src/Button.tsx…\nFocus on keyboard navigation.` |
| `commandResult` | `Updated Button.tsx\nAdded tabIndex.` |

**Rich entry** (shape regression — assert parsed object, not exact formatting):

```yaml
- commandSucceeded: true
  prompt: single
  commandResult: ok
  context:
    name: ctx
    variables: { FILE: x.ts }
    options: { flag: true }
  stepIndex: 0
  contextRunState:
    copilotSetup: { setupChatId: test-id }
  lumpVariables: { LUMP: v }
  stepVariables: { S: step }
  projectRoot: /absolute/tmp/project
```

**Invalid:** `broken.yaml` → `{{invalid`

---

## Files to touch

| File | Action |
| --- | --- |
| `packages/core/src/utils/historyFile/main.ts` | Create helpers |
| `packages/core/src/utils/historyFile/index.ts` | Barrel |
| `packages/core/src/utils/historyFile/unit.test.ts` | Section 4 |
| `packages/core/src/helpers/executeStepsForContextList/main.ts` | Use `appendHistoryEntry` |
| `packages/core/src/helpers/executeStepsForContextList/unit.test.ts` | Section 3 |
| `packages/core/package.json`, `rollup.config.js` | `js-yaml` dep + bundle |
| `packages/apps/cli/src/utils/lumpHistoryFilePath/main.ts` | `.yaml` extension |
| `packages/apps/cli/src/utils/lumpHistoryFilePath/unit.test.ts` | Section 1 |
| `packages/apps/cli/src/utils/jsConfigToRunLumpInput/unit.test.ts` | Sections 1–2 |
| Docs + `AGENTS.md` | Ship checklist |

### Assertion snippets

```ts
import { load as loadYaml } from 'js-yaml';
import { readFile } from 'node:fs/promises';

const entries = loadYaml(await readFile(historyPath, 'utf-8')) as HistoryEntry[];
```

```ts
const raw = await readFile(historyPath, 'utf-8');
expect(raw).toMatch(/prompt: \|/);
expect(raw).not.toMatch(/Line one\\nLine two/);
```

`HistoryEntry` fields align with `PostCommandExecFn` input (`packages/core/src/types/PostCommandExecFn.ts`).

---

## PRD traceability

| PRD # | Criterion | Covered by |
| --- | --- | --- |
| 1 | Default `.yaml` path | §1 CLI wiring, §2 CLI integration |
| 2 | Append semantics / entry shape | §3 update + rich entry + nested `stepIndex`; §2 integration |
| 3 | Block scalars for newlines | §3 multi-line test; §4 round-trip |
| 4 | Skip when `commandFn` null | §3 update existing null test |
| 5 | Docs updated | Ship checklist — Docs |
| 6 | `js-yaml` in published core | §4 helpers; Ship checklist — Build |

---

## Pass criteria

All Vitest tests in `packages/core` and `packages/apps/cli` pass. Ship checklist complete. No user-facing doc describes `.json` as the default CLI history path.
