# Project

A git repo with a `.lumpcode/` folder. The engine's `projectRoot` is the parent of `.lumpcode/`. Committed settings are `.lumpcode/project.json` (`ProjectConfig` in `packages/apps/cli/src/types/ProjectConfig.ts`); per-machine settings are the gitignored `.lumpcode/local.json` (`LocalConfig`, `Mode`, `WorkspaceStrategy` in the same folder). Schemas: `packages/apps/cli/src/schemas/projectConfig.schema.json`, `localConfig.schema.json`.

A project holds many lumps under `.lumpcode/lumps/`, optional command modules under `.lumpcode/commands/`, and optional daemon files under `.lumpcode/daemons/`. Rules: `domain/project-config.md`.
