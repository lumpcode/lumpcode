# CLI conventions

Command shape, flags, and what the CLI may touch on disk.

- `setup` is the interactive first-run drive (website/docs newcomer path; do not teach `project-setup` as how you create a project); no-op when `.lumpcode/local.json` is valid and a lump already exists (resume only fills `local.json` / first-lump holes); `project-setup` remains flag-only. TypeScript first-lump stub defaults to `*.ts` (not `*.js`) so installing `@lumpcode/cli-utils`/`@lumpcode/recipes` does not scan `node_modules` as contexts. Skill install (`npx skills add lumpcode/skills`) must be non-interactive (no TTY hangs); tests mock it
- Unregistered `login`/`logout` command modules are **implementation-only** — do not document in user-facing README/DOCS (`npm login` in `DOCS/publishing.md` is npm registry auth only). `supervise` is the same: `start` launches it; do not tell operators to run it; project-wide stop is `stop --all`
- Arguments before options in usage; long option names in camelCase (e.g. `--lumpName`, `--contextName`, `--lines`) to match Commander/schema — avoid single-char keys needing special `addCommand` handling
- Lump-config `command` field: registered tag (`"copilot"`, `"cursor"`, …) **or** lump-relative `.ts`/`.js` path (no whitespace; same `CommandModule` exports as `commands/<name>`); never shell flags — agent flags belong in the module's `CommandFn` (`executable` + `args`)
- Lump configs: omit CLI-default fields (`numberOfContextsPerBranch: 1`, `verbose`/`keepHistory` off); keep only intentional overrides
- Omit boolean flags for defaults; pass once for the non-default — no `--<name> true|false` or legacy two-token boolean argv
- `~/.lumpcode` is reserved for Lumpcode CLI globals (daemons, presets, supervisor, locks, `auth.json`); do not store unrelated deploy-script secrets, VM config, or SSH keys there
