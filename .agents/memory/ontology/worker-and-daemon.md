# Worker, daemon, supervisor

- **Worker**: a dedicated clone (`local.json` `mode: dedicated`) that nobody edits. User-facing word for the machine.
- **Daemon**: one scheduler process on that machine, identified by `daemonId` (default `global` = unfiltered), started by `lumpcode start` or by a committed `.lumpcode/daemons/<id>.json` (`daemonConfigFile` in `packages/apps/cli/src/utils/daemonConfigFile/main.ts`). Its spawn spec is `StartDaemonRecipe` (`packages/apps/cli/src/utils/startDaemonDesired/main.ts`); its live state is `DaemonMeta` (`packages/apps/cli/src/utils/readDaemonMeta/main.ts`).
- **Tick**: one scheduler pass over every matching lump line.
- **Supervisor**: one per project, launched by `start`, keeps daemons alive. Not an operator command.
- **Transcript**: a daemon's live step feed per lump line per tick, read with `lumpcode transcript`. **Dashboard**: read-only page of the list-all `daemon-status` snapshot (`packages/apps/dashboard`).

Never call the machine a daemon or a file-launched process a worker. Rules: `domain/daemon.md`.
