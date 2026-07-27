# Test plan: claude-code-opencode-codex-presets

| Field | Value |
| --- | --- |
| **Backlog** | `claude-code-opencode-codex-presets` |
| **Kind** | Shipped presets + cli-utils type contracts + install/docs |
| **Primary packages under test** | `@lumpcode/cli-utils` (types), `@lumpcode/cli` (install / bundled preset listing) |
| **Not under test** | Preset `.js` command/setup bodies; live `claude` / `opencode` / `codex` binaries; `@lumpcode/core`; E2E |

Source of truth for behavior: [requirements.md](./requirements.md). Test surface matches existing **cursor / copilot** coverage only.

---

## 1. Goals of the test suite

Prove that after implementation:

1. Closed TypeScript contracts for the three presets are exported from `@lumpcode/cli-utils` (same strictness as cursor/copilot: exact keys, step-only session keys, `& Extra`, no open index signature).
2. Bundled preset listing / install treats `claude-code.js`, `opencode.js`, and `codex.js` as invokable preset command names (and does not list `utils/` helpers as command names).
3. Existing install / path-resolution suites stay green when the new files land (directory-driven listing already picks up new `.js` files).

Docs and schema updates are **implementation-stage acceptance**, not automated in `testImpl`.

---

## 2. Testing approach

| Level | Required? | Mechanism |
| --- | --- | --- |
| **Unit (type-level)** | Yes — primary for contracts | Extend `presetVariables.types.test.ts` with Vitest `expectTypeOf` + `@ts-expect-error` |
| **Unit (install)** | Yes — name presence | Assert `listBundledPresetCommandNames` includes the three new files once they exist under `presets/commands/` |
| **Unit (preset `.js` runtime)** | No | Cursor/copilot have no command-body unit tests |
| **Integration / E2E** | No | No live agents; no mocked agent CLIs |

### Red → green during `testImpl`

1. Extend type tests to import the new type names. Until types exist, add stub exports under `cli-utils/src/presets/` (incomplete / loose shapes) so the suite **compiles and runs red** on closed-shape assertions.
2. Add install assertions that the three names are in `listBundledPresetCommandNames(bundlePresetsDir)`. Until the `.js` files exist, those assertions fail red.
3. Do **not** implement full preset runtime behavior in `testImpl` — only tests + stubs needed for red.

---

## 3. File layout

### `@lumpcode/cli-utils`

| Path | Role |
| --- | --- |
| `packages/apps/cli/cli-utils/src/presets/claudeCode.ts` (or equivalent) | Stub then real `ClaudeCodeAgentPermissions` / lump / step types |
| `packages/apps/cli/cli-utils/src/presets/opencode.ts` | Stub then real OpenCode types |
| `packages/apps/cli/cli-utils/src/presets/codex.ts` | Stub then real Codex types |
| `packages/apps/cli/cli-utils/src/presets/index.ts` | Barrel-export new names |
| `packages/apps/cli/cli-utils/src/presets/presetVariables.types.test.ts` | **Extend** existing P1–P12-style cases for the three agents |

Run: `npm run test -w=@lumpcode/cli-utils`.

### `@lumpcode/cli` (install)

| Path | Role |
| --- | --- |
| `packages/apps/cli/src/utils/ensurePresetCommandsInstalled/unit.test.ts` | Add explicit `toContain` for `claude-code.js`, `opencode.js`, `codex.js`; keep “utils not listed as command names” |
| `packages/apps/cli/src/utils/jsConfigToRunLumpInput/__fixtures__/global-config/commands/presets/` | Mirror new preset files (and new utils if any) **only if** a test asserts fixture file sets; otherwise optional until implementation |

Run: `npm run test -w=@lumpcode/cli`.

### Not created

- No `presets/commands/*.unit.test.ts` for command/setup/teardown.
- No E2E harness entries for these agents.

---

## 4. Type-level cases (cli-utils)

Mirror cursor/copilot cases. Numbering continues in the same file (e.g. P12+ or a nested `describe` per agent).

| ID | Assertion |
| --- | --- |
| T1 | New type names resolve from `@lumpcode/cli-utils` root: `ClaudeCodeAgentPermissions`, `ClaudeCodePresetLumpVariables`, `ClaudeCodePresetStepVariables`, and the OpenCode / Codex equivalents (nine names + existing session type unchanged). |
| T2 | Each `*AgentPermissions` equals the closed field set from requirements (no extra keys). |
| T3 | Each `*PresetLumpVariables` is `{ model?: string; agentPermissions?: … }` only. |
| T4 | Each `*PresetStepVariables` equals lump `& PresetSessionStepVariables`. |
| T5 | `newChat` / `chatIdIndex` rejected on lump contracts (`@ts-expect-error`). |
| T6 | Excess keys on lump/step contracts rejected (`@ts-expect-error`). |
| T7 | Wrong value types rejected (e.g. `model: 1`, `bare: 'yes'`). |
| T8 | `& Extra` accepts `customKey` plus preset fields; `defineConfig<Preset & Extra, Step & Extra>` compiles. |
| T9 | No open index signature (exact `toEqualTypeOf` against a hand-written closed alias). |

**Claude-specific field checks (within T2):** `permissionMode` union, `allowedTools` / `disallowedTools` / `addDirs` as `readonly string[]`, `bare?: boolean`.

**OpenCode:** `auto?: boolean`, `agent?: string`.

**Codex:** `sandbox` union (`read-only` \| `workspace-write` \| `danger-full-access`), `dangerouslyBypassApprovalsAndSandbox?: boolean`, `addDirs?: readonly string[]`.

---

## 5. Install cases (cli)

| ID | Assertion |
| --- | --- |
| I1 | `listBundledPresetCommandNames(bundlePresetsDir)` includes `claude-code.js`, `opencode.js`, `codex.js` (and still includes `cursor.js`, `copilot.js`). |
| I2 | Names do **not** include any `utils/*.js` helper filenames or the `utils` directory entry. |
| I3 | Existing “install when missing / no overwrite by default / overwrite when true” cases still pass against the enlarged preset directory (count = listed names length). |

No new tests required for `reset-presets` beyond what already covers overwrite install, unless that suite hard-codes a two-name list (update if so).

---

## 6. Out of scope (explicit)

| Item | Why |
| --- | --- |
| Argv / session-parse unit tests for preset helpers | Cursor/copilot utils (`resolveCopilotToolArgs`, etc.) have no dedicated unit tests |
| Invoking `command` / `setup` exports of the new `.js` modules | Same |
| Spawning or mocking agent binaries | Requirements non-goal |
| Docs / schema content snapshots | Manual acceptance in implementation stage |
| Core or recipes package tests | Unchanged packages |

---

## 7. Acceptance mapping

| Requirements acceptance | Covered by |
| --- | --- |
| cli-utils closed types (AC7) | T1–T9 |
| Install / name list (AC8) | I1–I3 |
| Runtime argv, session, headless defaults (AC1–AC6) | Implementation + manual/docs review; **not** automated in this plan |
| Docs / schema (AC9) | Implementation acceptance |

---

## 8. Commands to run

```bash
npm run test -w=@lumpcode/cli-utils
npm run test -w=@lumpcode/cli
```

Optional focus:

```bash
npm run test -w=@lumpcode/cli-utils -- src/presets/presetVariables.types.test.ts
npm run test -w=@lumpcode/cli -- src/utils/ensurePresetCommandsInstalled/unit.test.ts
```
