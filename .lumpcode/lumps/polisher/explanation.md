# Say which config field fixes an unregistered command in a runtime-returned step

A step can be returned at run time, either by a function in `steps` or by a `postCommandExecFn`. If that step uses a command tag that is neither the lump `command` nor listed in `registerCommands`, `jsConfigToRunLumpInput` (`packages/apps/cli`) threw:

```
Command reviewer not registered in recursive call. Please register the command before in the registerCommands field.
```

"Recursive call" is an internal detail: operators never write a recursive call, they write a function that returns steps. The sentence "register the command before in the registerCommands field" is also hard to parse, and it does not say that the field belongs in the lump config.

It now throws:

```
Command "reviewer" is used by a step returned at run time but is not registered. Add it to registerCommands in the lump config: registerCommands: ['reviewer'].
```

This matches how `DOCS/config/advanced.md` and `DOCS/author/prompts.md` describe the case, and it gives the line to paste. Behavior is otherwise unchanged: the same condition still throws an `Error` from the same place, and file-path commands and the lump `command` are still pre-registered as before.

One unit test pinned the old text, so I updated it to expect the full new message: `jsConfigToRunLumpInput/testing/recursiveSteps.unit.test.ts`. No docs or E2E tests quoted the old string.

Tests: `npm run test -w=@lumpcode/cli` (161 files, 1211 tests pass) and root `npm run build` (passes).
