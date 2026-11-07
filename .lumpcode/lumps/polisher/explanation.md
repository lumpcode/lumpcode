# Say where to set a command when a step has none

When a step had no command to run, config load (`resolveCommandFn` in `packages/apps/cli/src/utils/jsConfigToRunLumpInput/main.ts`) failed with:

```
Step must have a command or commandFn
```

This hit an operator who had written a prompt but no `command` anywhere. The message had two problems. `commandFn` is the engine's internal step field, not something an operator writes. And the message did not say where a command can be set. A step inherits `command` from the lump config, which inherits it from `.lumpcode/local.json` and then `.lumpcode/project.json` (`applyLumpConfigDefaults`). The error fires only when all of those are empty.

The message now names those places:

```
A step has no command to run. Set command on the step or at the top of the lump config, or set a default command in .lumpcode/project.json or .lumpcode/local.json.
```

The wording follows the nearby `registerCommands` error, which also says what to add and where. Behavior is otherwise unchanged: the same configs fail at the same point. No docs, tests, or memory quoted the old string.

I added one unit test to `packages/apps/cli/src/utils/jsConfigToRunLumpInput/testing/promptCommandSteps.unit.test.ts`. It uses a prompt with no command and checks for the new message.

Tests: root `npm run build` (passes) and `npm run test -w=@lumpcode/cli` (166 files, 1264 tests pass).
