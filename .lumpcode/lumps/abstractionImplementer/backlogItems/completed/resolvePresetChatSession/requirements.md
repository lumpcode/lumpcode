# resolvePresetChatSession

## Problem / repeated pattern

All five shipped preset command modules copy the same resumable-chat sequence:

1. Trim the prompt and skip the command when it is empty.
2. Read `newChat` / `chatIdIndex` from `stepVariables`.
3. Lazy-init `contextRunState[<commandName>Setup]` (`chatsIds` + `setupChatId`).
4. Resolve the chat id (indexed `chatsIds` vs `setupChatId`).
5. Throw a missing-id error (`Chat ID not found for index: …` vs `Chat ID not found in <agent> setup state`).
6. On `newChat`, call a per-preset `createChatId` and store it under the `stepIndex` key.

The same `setup()` return shape (`setupChatId` + `chatsIds['0']`) is copied in every preset.

This is the same logic, parameterized only by the setup-state key and the chat-id factory. `cli.dupes.json` flags it (`dup:aac0f637` setup; `dup:ad08cfc2` / cursor–copilot–claude command blocks). Sibling preset helpers already live under `presets/commands/utils/` (`resolveAgentPermissions.js`, `createCodexSession.js`, …) and are copied to `~/.lumpcode/commands/presets/utils/` by `installPresetUtilsFiles`.

Call-site blocks:

- `packages/apps/cli/src/presets/commands/claude-code.js:17-43` (command) and `:63-74` (setup)
- `packages/apps/cli/src/presets/commands/codex.js:16-42` (command) and `:59-72` (setup)
- `packages/apps/cli/src/presets/commands/copilot.js:17-43` (command) and `:65-76` (setup)
- `packages/apps/cli/src/presets/commands/cursor.js:35-61` (command) and `:88-99` (setup)
- `packages/apps/cli/src/presets/commands/opencode.js:16-42` (command) and `:61-74` (setup)

Fixture mirrors of the first three (keep in sync; they import `./utils/` from the fixture tree):

- `packages/apps/cli/src/utils/jsConfigToRunLumpInput/__fixtures__/global-config/commands/presets/claude-code.js`
- `packages/apps/cli/src/utils/jsConfigToRunLumpInput/__fixtures__/global-config/commands/presets/codex.js`
- `packages/apps/cli/src/utils/jsConfigToRunLumpInput/__fixtures__/global-config/commands/presets/opencode.js`

## Classification

util — production call sites in `presets/commands/*.js` (fixture copies are the installed-preset mirror, not test-only logic).

Target file(s):

- `packages/apps/cli/src/presets/commands/utils/resolvePresetChatSession.js`
- `packages/apps/cli/src/presets/commands/utils/resolvePresetChatSession.unit.test.ts` (Vitest; same pattern as `presets/commands/presentOutput.unit.test.ts`)
- Mirror the `.js` helper into `packages/apps/cli/src/utils/jsConfigToRunLumpInput/__fixtures__/global-config/commands/presets/utils/resolvePresetChatSession.js` so fixture presets keep resolving `./utils/` (same as `resolveAgentPermissions.js` today)

Do **not** put this in `src/utils/`. Presets are plain ESM copied to `~/.lumpcode/commands/presets/` and may import only Node builtins + relative `./utils/` (no `@lumpcode/core`). `installPresetUtilsFiles` already copies every `presets/commands/utils/*.js` file.

## Fully typed definition

Implementation is plain ESM JavaScript (sibling preset utils are `.js`). The contract below is what the JS file must satisfy; the unit test may import it as ESM.

```typescript
export type PresetChatState = {
    setupChatId?: string;
    chatsIds?: Record<string, string>;
};

export type PresetChatStepVariables = {
    newChat?: boolean;
    chatIdIndex?: string | number | null;
};

export type ResolvePresetChatSessionInput = {
    /** Raw step prompt; whitespace-only → `null` (command skip). */
    prompt: string | null | undefined;
    contextRunState: Record<string, unknown>;
    /** e.g. `'cursorSetup'`, `'copilotSetup'`, `'claude-codeSetup'`, `'codexSetup'`, `'opencodeSetup'`. */
    setupStateKey: string;
    stepIndex: number | number[];
    stepVariables?: PresetChatStepVariables;
    createChatId: () => string | Promise<string>;
};

/**
 * Trim prompt; resolve or create the resumable chat id on `contextRunState[setupStateKey]`.
 * Mutates `contextRunState` in place (same as today's presets).
 * Missing-id errors: `Chat ID not found for index: ${chatIdIndex}` or
 * `Chat ID not found in ${setupStateKey.replace(/Setup$/, '')} setup state`.
 */
export async function resolvePresetChatSession(
    input: ResolvePresetChatSessionInput,
): Promise<string | null> {
    const {
        prompt,
        contextRunState,
        setupStateKey,
        stepIndex,
        stepVariables = {},
        createChatId,
    } = input;

    const trimmedPrompt = (prompt ?? '').trim();
    if (!trimmedPrompt) return null;

    const { newChat = false, chatIdIndex = null } = stepVariables;
    const chatState = (contextRunState[setupStateKey] ??
        (contextRunState[setupStateKey] = {})) as PresetChatState;
    const chatKey = Array.isArray(stepIndex) ? stepIndex.join('.') : String(stepIndex);

    let chatId =
        chatIdIndex != null ? chatState.chatsIds?.[chatIdIndex] : chatState.setupChatId;

    if (!chatId) {
        const agentLabel = setupStateKey.replace(/Setup$/, '');
        throw new Error(
            chatIdIndex != null
                ? `Chat ID not found for index: ${chatIdIndex}`
                : `Chat ID not found in ${agentLabel} setup state`,
        );
    }

    if (newChat) {
        chatId = await createChatId();
        chatState.chatsIds ??= {};
        chatState.chatsIds[chatKey] = chatId;
    }

    return chatId;
}

/** `setup()` return value shared by every preset. */
export function initialPresetChatRunState(setupChatId: string): {
    contextRunState: {
        setupChatId: string;
        chatsIds: { '0': string };
    };
} {
    return {
        contextRunState: {
            setupChatId,
            chatsIds: {
                '0': setupChatId,
            },
        },
    };
}
```

`resolvePresetChatSession` returns the chat id only (not the trimmed prompt). Call sites still trim locally if they need the string for argv (`(prompt ?? '').trim()` stays, **or** they may keep a local `trimmedPrompt` computed once and pass that same string as `prompt`). Prefer: keep one local `trimmedPrompt` for argv, pass it as `prompt` so the helper's empty check is a no-op after the local trim — **or** trim only inside the helper and have the command re-trim for argv (two `.trim()` calls on a tiny string is fine and matches “helper owns skip”). Implementer choice: **trim inside the helper and re-trim at the call site for argv** so the skip path does not require a second return value.

## Before -> after example

```javascript
// Before (copilot.js command + setup)
const { newChat = false, chatIdIndex = null } = stepVariables || {};
const chatState = contextRunState.copilotSetup ?? (contextRunState.copilotSetup = {});
const chatKey = Array.isArray(stepIndex) ? stepIndex.join('.') : String(stepIndex);
const trimmedPrompt = (prompt ?? '').trim();
if (!trimmedPrompt) return null;
let chatId = chatIdIndex != null
    ? chatState.chatsIds?.[chatIdIndex]
    : chatState.setupChatId;
if (!chatId) {
    throw new Error(
        chatIdIndex != null
            ? `Chat ID not found for index: ${chatIdIndex}`
            : 'Chat ID not found in copilot setup state',
    );
}
if (newChat) {
    chatId = randomUUID();
    chatState.chatsIds ??= {};
    chatState.chatsIds[chatKey] = chatId;
}
// ... build { executable, args } using chatId + trimmedPrompt ...

export const setup = (({}) => {
    const setupChatIdStr = randomUUID();
    return {
        contextRunState: {
            setupChatId: setupChatIdStr,
            chatsIds: { "0": setupChatIdStr },
        },
    };
});

// After
import { initialPresetChatRunState, resolvePresetChatSession } from './utils/resolvePresetChatSession.js';

const trimmedPrompt = (prompt ?? '').trim();
const chatId = await resolvePresetChatSession({
    prompt: trimmedPrompt,
    contextRunState,
    setupStateKey: 'copilotSetup',
    stepIndex,
    stepVariables,
    createChatId: randomUUID,
});
if (chatId == null) return null;
// ... same { executable, args } using chatId + trimmedPrompt ...

export const setup = (({}) => {
    return initialPresetChatRunState(randomUUID());
});
```

Codex / OpenCode / Cursor pass an async `createChatId` that closes over `model` (or cursor's local `createChatId()`). Setup for those stays async and does `return initialPresetChatRunState(await createCodexSession({ model: lumpVariables.model }))` (etc.).

Keep the `// PRESET COMMAND : DO NOT MODIFY THIS FILE` header on the five command modules. Relative `./utils/` imports are already the supported extension point.

## Affected call sites

- `packages/apps/cli/src/presets/commands/claude-code.js:17-43,63-74` — command chat block → `resolvePresetChatSession({ setupStateKey: 'claude-codeSetup', createChatId: randomUUID, ... })`; setup → `initialPresetChatRunState(randomUUID())`
- `packages/apps/cli/src/presets/commands/codex.js:16-42,59-72` — `setupStateKey: 'codexSetup'`, `createChatId: () => createCodexSession({ model })`; setup still awaits `createCodexSession` then `initialPresetChatRunState`
- `packages/apps/cli/src/presets/commands/copilot.js:17-43,65-76` — `setupStateKey: 'copilotSetup'`, `createChatId: randomUUID`
- `packages/apps/cli/src/presets/commands/cursor.js:35-61,88-99` — `setupStateKey: 'cursorSetup'`, `createChatId` = existing local `createChatId` (keep that function in `cursor.js`)
- `packages/apps/cli/src/presets/commands/opencode.js:16-42,61-74` — `setupStateKey: 'opencodeSetup'`, `createChatId: () => createOpenCodeSession({ model })`
- Fixture mirrors of claude-code / codex / opencode (same replacements) plus copy of `resolvePresetChatSession.js` into the fixture `utils/` directory

Per-preset argv construction, `resolveAgentPermissions`, model defaulting (`?? 'auto'` vs omit), presenters, and Cursor's `createChatId` / Codex / OpenCode session helpers stay in the command files.

## Estimated lines saved

~26 lines of command chat logic × 5 presets ≈ 130, plus ~12 lines of setup × 5 ≈ 60 → ~190 removed from command modules.

After: ~8-line command call + ~2-line setup return × 5 ≈ 50, plus ~50-line helper (and ~50-line fixture copy of the helper). Fixture command files lose the same blocks (~3 × 38 ≈ 114) and gain the helper copy.

Net: ~190 − 50 − 50 ≈ **90 lines** in production presets; fixture mirror update is roughly a wash on the helper copy vs shrunk command files (~114 − 50 ≈ 64 extra if counted). Do not count the unit test.

## Non-goals

- No move into `packages/apps/cli/src/utils/` (presets cannot import it after install).
- No `@lumpcode/core` / Success-Failure wrapping (preset utils throw, same as today).
- No merging of per-agent argv / permission / presenter logic.
- No changing chat-id factories (still `randomUUID`, `createChatId()`, `createCodexSession`, `createOpenCodeSession`).
- Do not try to collapse the presets-vs-fixtures directory mirror; keep the fixture `utils/` copy in lockstep.
- Behavior-preserving refactor only: same errors, same `contextRunState` mutation, empty prompt still returns `null`.

## Acceptance criteria

- [ ] New file at `packages/apps/cli/src/presets/commands/utils/resolvePresetChatSession.js` exporting `resolvePresetChatSession` and `initialPresetChatRunState`; `installPresetUtilsFiles` copies it with other `utils/*.js`
- [ ] All five preset command modules and the three fixture mirrors refactored to use it
- [ ] Fixture `utils/resolvePresetChatSession.js` matches the bundled helper
- [ ] Meaningful net line reduction across the command modules (excluding the unit test)
- [ ] Unit test `packages/apps/cli/src/presets/commands/utils/resolvePresetChatSession.unit.test.ts`: empty prompt → `null`; missing setup id throws the agent-label message; missing `chatIdIndex` throws the index message; `newChat` awaits `createChatId` and stores under dotted `stepIndex`; `initialPresetChatRunState` shape
- [ ] `npm run build -w=@lumpcode/cli && npm run test -w=@lumpcode/cli` pass; only `packages/apps/cli` touched
