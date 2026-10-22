# Context sourcing

The three mutually exclusive ways a lump finds contexts.

- `contextListJson` (`FilePath | ContextList | Record<string, string>`), `getContextListFn` (dynamic), or `contextMatchFn` (file scanner). Discriminant (inline and after `readJsonFile`): string → file of the same value (no nested path); `Array.isArray` → literal `ContextList` (no disk check; extra keys on a context/`options` fail at resolve; `contextOptionsFn` ignored); otherwise path-template map (`makeGetContextListFnFromTemplate`; `{}` empty plan; any value without `{…}` / `$modifier{…}` fails at resolve). Exact-path `{ FILE: "README.md" }` is removed — write a one-item list
- `contextMatchFn`: each call gets `codeBasePath`, full `codeBasePaths`, `lumpVariables`; same `contextName` merges (variables accumulate; later match wins duplicate keys/`contextOptions`)
- CLI `GetContextListFnInput`: `codeBasePaths` + `lumpVariables` + concrete `discoveryBranch` (core omits discovery; CLI adapts at the run boundary) — no `projectRoot`/`baseBranch`; daemon/CLI discovery matching selects lumps only — per-branch context filtering belongs in the author's `getContextListFn` / recipe `resolveItem`
