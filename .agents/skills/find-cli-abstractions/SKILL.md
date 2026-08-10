---
name: find-cli-abstraction
description: 'Find one new reusable abstraction (util or test helper) hidden in duplicated logic across packages/apps/cli, name it well, and write an implementation-ready PRD with its fully typed definition. Use when asked to find/propose an abstraction, DRY up the CLI, or extract a util/test helper. Not for domain features, cross-package refactors, or code outside packages/apps/cli.'
argument-hint: '[area/pattern to focus on] — optionally the backlogItems dir path (containing todo/ and completed/)'
---

# Find CLI Abstractions

Scan `packages/apps/cli` for a **clearly repeated** pattern, capture it as ONE new
**util** (production or mixed call sites) or **test helper** (test/e2e call sites only),
name it well, and produce a PRD plan. Do not implement source code.

## Be ambitious

Aim for **substantial** abstractions, not one-liners. Prefer a repeated *multi-step block* over a
single expression:

- Whole validation → transform → persist sequences copied across commands or utils.
- Groups of related operations that always travel together (e.g. scaffold temp git repo → write fixtures → run handler).
- A parameterizable family of near-identical functions collapsed into one (differ only by a path/key/config).
- Repeated polling/wait loops, JSON fixture writes, daemon meta setup, or git preflight blocks across unit tests and e2e harness code.

A good candidate typically spans **several lines per call site across 3+ sites**. If the best you find is a trivial one- or two-line helper, widen the scope (look at the surrounding block that always wraps it) before settling.

## Two modes (detect from the invocation)

- **Interactive mode (default)** — no paths given (e.g. a user typing `/find-cli-abstraction` in chat).
  Print the full requirements **inline in the reply**. Do NOT create or modify any file, and skip the backlog-item step.
- **File mode** — the caller provides the backlogItems dir (typically `.lumpcode/lumps/abstractionImplementer/backlogItems`).
  Create one new backlog-item directory under `todo/` (see below). Never ask for paths in interactive mode —
  only follow file mode when the path is actually supplied.

## Inputs (file mode only)

When supplied, use this path exactly — never hardcode or invent it:

- **backlogItems dir** — a directory holding two sub-directories:
  - `todo/<name>/` — one directory per not-yet-implemented abstraction, each containing `desc.yml` (metadata) and `requirements.md` (the PRD).
  - `completed/<name>/` — same shape for already-shipped abstractions (their `desc.yml` also has a `completedAt` timestamp).
  Read every `desc.yml` name (or directory name) under both `todo/` and `completed/` to avoid re-proposing.

## util vs test helper

- **util** — call sites include production code (`commands/`, `utils/`, or mixed production + tests).
  Lives in `packages/apps/cli/src/utils/<name>/` following CLI convention:
  `main.ts` (implementation), `index.ts` (re-export), `unit.test.ts` (Vitest), barrel-export from `utils/index.ts`.
  Examples: `filterLumpNames`, `readJsonFile`, `pollUntil`.
- **test helper** — **every** call site is test-only: `*.test.ts`, `**/testing/**`, or `e2e/**`.
  Lives under a **testing folder** (no dedicated `unit.test.ts` for the helper itself):
  - **Shared** across multiple commands/utils/e2e suites → `packages/apps/cli/src/testing/<name>.ts`, re-exported from `testing/index.ts`.
  - **Confined to one command or util's test suite** → colocate under that owner's `testing/` folder
    (e.g. `commands/start/testing/<name>.ts` or extend `testing/testHelpers.ts` when that is the local convention).
  Examples: fixture builders in `multiBranchFixtures.ts`, shared wait helpers in `waitForDaemonPidFile.ts`.

When call sites span both production and tests, classify as **util** (not test helper).

## Hard constraints (reject candidates that fail)

- The repetition is **real duplication** (same logic in ≥2 places), not merely similar-looking code.
- Fully **confined to `packages/apps/cli`** — no changes to `@lumpcode/core`, `@lumpcode/recipes`, or other packages, and no dependency the new file would pull from them beyond what call sites already import.
- **Well-named**: name matches `^[a-zA-Z0-9_-]+$`, describes the pattern (verb-first: `getX` / `formatX` / `isX` / `writeX` / `waitForX` / `makeX`).
- **Not already** a util or test helper: grep `utils/index.ts`, `testing/index.ts`, colocated `**/testing/testHelpers.ts`, and every `todo/` / `completed/` backlog-item directory before proposing (skip any name already present).
- **Meaningful code reduction**: refactoring every call site must remove a **non-trivial** number of net lines (excluding new tests for utils, and excluding any test file for test helpers) — enough that the DRY-up clearly pays for the new file. Reject candidates that only save a line or two, or that merely relocate code without shrinking it.
- **CLI conventions**: functions with 3+ parameters use a single destructured object argument; expected failures return `Success<T>` / `Failure<string>` from `@lumpcode/core` where sibling utils do.

## Procedure

1. **Scan.** Search `packages/apps/cli` for repeated logic — favor larger recurring blocks over single expressions: copy-pasted command handlers, git/daemon fixture setup, polling loops, JSON read/write boilerplate, lump-config scaffolding, near-duplicate functions differing only by a field/config. Focus on the user's area argument if given.
2. **Pick one.** Choose the single **highest-impact** candidate that satisfies every Hard constraint (most net lines removed across the most call sites). If two candidates tie, prefer the more ambitious one. Confirm it does not already exist.
3. **Classify.** Decide util vs test helper by call-site purity (see above) → fixes target folder.
4. **Name it.** Precise, convention-matching name. Verify no export collision in `utils/index.ts`, `testing/index.ts`, or the relevant colocated `testing/` barrel.
5. **Locate call sites.** List every file/line the abstraction would replace, and estimate the net lines removed. If the saving is trivial, discard the candidate and pick another.
6. **Deliver the requirements.**
   - *Interactive mode:* print the requirements (below) directly in the reply — no files, no backlog item.
   - *File mode:* create a new directory `todo/<name>/` inside the provided backlogItems dir with two files: `desc.yml` (`name` = the abstraction name; `task` = repeated pattern + proposed name + affected areas; `priority` = max existing `todo/`+`completed/` priority + 1, or 1 if empty; optional `dependsOn` = names from `todo/`/`completed/` that must land first) and `requirements.md` (the PRD below). Do not modify source files.

## desc.yml template (file mode)

```yaml
name: <name>
task: >-
  <repeated pattern + proposed name + affected areas, in prose>
priority: <max existing priority + 1, or 1 if empty>
# dependsOn: [<name>, ...]   # optional — backlog items that must land first
```

## requirements.md (PRD) template

```markdown
# <name>

## Problem / repeated pattern
<what is duplicated, where it appears (file:line list), why it's the same logic>

## Classification
util | test helper — <one-line justification: production/mixed vs test-only call sites>
Target file(s):
- util: packages/apps/cli/src/utils/<name>/main.ts (+ index.ts, unit.test.ts, barrel in utils/index.ts)
- test helper (shared): packages/apps/cli/src/testing/<name>.ts (+ export in testing/index.ts)
- test helper (colocated): packages/apps/cli/src/<owner>/testing/<name>.ts

## Fully typed definition
\`\`\`typescript
// exact signature + implementation the implementer should write
export function <name>(/* typed params */): <ReturnType> { /* ... */ };
// or export async function / export type as needed
\`\`\`

## Before -> after example
\`\`\`typescript
// Before (one representative duplicated site)
const deadline = Date.now() + timeoutMs;
while (Date.now() < deadline) {
    if (await predicate()) return;
    await sleep(intervalMs);
}
throw new Error('Timed out');

// After
const result = await <name>({ timeoutMs, intervalMs, until: predicate, timeoutMessage: 'Timed out' });
if (!result.success) throw new Error(result.data);
\`\`\`

## Affected call sites
- path/to/file.ts:Lx — <before → after>
- ...

## Estimated lines saved
<net lines removed across all call sites minus the new file's lines (excluding util unit.test.ts and excluding any test file for test helpers), e.g. "~35 lines removed, ~10 added → ~25 net saved">

## Non-goals
- <what this does NOT cover; no cross-package changes; behavior-preserving refactor only when applicable>

## Acceptance criteria
- [ ] New file(s) at target path(s); util re-exported from utils/index.ts, or test helper re-exported from the appropriate testing barrel
- [ ] All listed call sites refactored to use it
- [ ] Meaningful net line reduction across call sites (excluding util unit.test.ts; test helpers need no dedicated test file)
- [ ] util only: unit test in utils/<name>/unit.test.ts covering the abstraction (pure input/output or mocked I/O as sibling utils do)
- [ ] `npm run build -w=@lumpcode/cli && npm run test -w=@lumpcode/cli` pass; only packages/apps/cli touched
```

## Output

- *Interactive mode:* the requirements rendered inline, plus a one-line note of the chosen name and util/test-helper classification. No files touched.
- *File mode:* one new `todo/<name>/` directory with `desc.yml` + `requirements.md` under the provided backlogItems dir; report the chosen name, classification, and written paths.

Either way: a compilable, fully typed definition and a concrete call-site list. Do not write source code.
