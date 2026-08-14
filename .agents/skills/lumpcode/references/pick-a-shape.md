# Pick a lump shape

Copy one folder from this skill’s `assets/lumps/` into `.lumpcode/lumps/<lumpName>/`, then change `command`, paths, and the prompt. Run `lumpcode lump-plan <lumpName>` before `run`.

JSON cannot express inline functions, retries, or dynamic steps. Prefer `config.ts` for real campaigns.

| If you need… | Copy | Why |
|--------------|------|-----|
| Path-pattern contexts in JSON (`{NAME}` captures, optional `$upperFirst` / `$kebab` / …) | `assets/lumps/context-list-json/` | The only JSON example: `contextListJson` matching, no functions |
| Agent work that must pass a command (`npm test`, build, …) | `assets/lumps/retry-until-green/` | `retryUntilGreen` from `@lumpcode/recipes` |
| Named steps that branch (implement → verify → retry or done) | `assets/lumps/step-graph/` | `StepFn` graph: `postCommandExecFn` returns the next named step |
| A scan with skip logic **and** retries (e.g. untested modules) | `assets/lumps/coverage-sweep/` | Inline `contextMatchFn` + `retryUntilGreen` |

Install authoring packages in the **user’s** repo (not only this skill):

```bash
npm install --save-dev @lumpcode/cli-utils @lumpcode/recipes
```

`retry-until-green`, `coverage-sweep`, and `step-graph` need both. `context-list-json` needs neither.

Staged folder backlogs (`todo/` → `completed/`, requirements, TDD stages) are **`@lumpcode/recipes`** (`backlog`, `featureBacklog`), not these templates. Fetch the [recipes README](https://github.com/lumpcode/lumpcode/blob/main/packages/recipes/README.md).

More JSON-only shapes (migration, codemod, docs gen, cross-lump `dependsOnContexts`): [examples.md](https://github.com/lumpcode/lumpcode/blob/main/packages/apps/cli/DOCS/examples.md).
