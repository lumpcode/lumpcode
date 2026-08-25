# Requirements: 01 `start --superviseOnly`

Global contract: [`../../requirements.md`](../../requirements.md) (CLI — `start --superviseOnly`; Goal 4).

## Standalone value

An operator can keep a dedicated (or shared) machine’s supervisor up without launching `global` or a dummy `--exclude=*` daemon.

## In scope

- `lumpcode start --superviseOnly`: `ensureProjectSupervisor` only.
- Fail if combined with `--include`, `--exclude`, `--daemonId`, `--cronSetup`, `--maxParallelRun`, `--lumpName`, `--foreground`.
- No `desired.json`, no daemon spawn, no `resolveDaemonId`.
- Idempotent if supervise is already alive.
- Success envelope `{ projectName, supervisorPid? }` (not the ticks payload).
- Docs: `DOCS/commands.md` + `start` description. Do **not** document `supervise` as an operator command.

## Out of scope

- Repo daemon files, fetch, reconcile, meta `daemonConfigFile`.
- Shared vs dedicated file recipes (this flag is valid in both modes).

## Acceptance

- [ ] `--superviseOnly` starts or adopts supervise; no daemon pid/desired for a new scheduler.
- [ ] Daemon-launch flags with `--superviseOnly` fail.
- [ ] `--exclude=*` still starts a real daemon (unchanged).
