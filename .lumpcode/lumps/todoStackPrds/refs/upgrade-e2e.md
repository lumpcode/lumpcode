# upgrade-e2e — follow-up E2E coverage and Windows recap

## Done (complete-e2e-binary-test + adding-windows-compat-e2e-tests)

- **16 SEA subprocess scenarios** on `linux` / `macOS` / `windows-latest` matrix legs
- Isolated **`HOME` / `USERPROFILE`** for daemon and global config
- Mock agent via **`e2e-mock-agent.cjs`** + **`LUMPCODE_E2E_NODE`** (no fragile `node -e` on Windows)
- Cross-platform shell in **`makeLumpWorkspaceFns`**: `shellBestEffort`, `shellSingleQuote`, `atDirectory` (`cd /d` on Windows), `rmdir` / `mkdir`
- **RUN-S3**: worktree strategy + `config.js` command module
- **Daemon**: foreground tick, detached meta, multi-lump global, per-lump, lump disabled
- **Run**: checkout, shared mode, resumable skip, maximum open branches
- **Status / clean**: lump-status after run, clean after run, scoped clean

### Windows / shell notes

- Internal git commands run via **`cmd.exe`** (`%ComSpec%`), regardless of whether the user launched the binary from **PowerShell**, **cmd**, or **Git Bash**
- CI E2E on Windows runs under **pwsh** — sufficient; a duplicate job under `shell: cmd` is optional smoke only

## Covered commands (binary E2E today)

| Command | Coverage |
| --- | --- |
| `run` | RUN-S1–S5 |
| `start` | DAEMON-S1–S5 |
| `stop` | daemon teardown in E2E harness |
| `lump-status` | STATUS-CLEAN-S1 |
| `clean` | STATUS-CLEAN-S2, S3 |
| `daemon-status` | DAEMON-S2 only |

## Not covered — add scenarios or document out-of-scope

### CLI commands (no binary E2E today)

- **`project-setup`**, **`lump-create`**, **`lump-plan`** — scaffold flows; unit/integration tests only
- **`restart`**, **`daemon-log`**, **`context-status`** — unit tests only
- **`login`**, **`logout`** — paid cloud; no free tier — keep out of OSS E2E or mock API

### Behavior gaps

- **`run --contextName` / `--force`** — when implemented (`run-context-name-force` backlog)
- **Worktree + daemon** — daemon E2E defaults to `workspaceStrategy: checkout`; worktree exercised mainly by RUN-S3 `run`
- **Dedicated mode dirty tree** — preflight guardrail (`dedicated-dirty-env-guardrail` backlog)
- **Real third-party agents** — Claude, Codex, Copilot CLI, etc.

### Environment / platform gaps

- Paths with **spaces**, very **long paths**, **non-ASCII** user profile dirs
- **Windows ARM64** matrix leg
- **Interactive prompts** — `project-setup-interactive`, `lump-create-interactive` backlogs
- **`ComSpec` set to PowerShell** — misconfiguration; internal shell strings are cmd.exe syntax

## Optional follow-ups (nice-to-have, not blocking)

- One **daemon scenario** with `workspaceStrategy: worktree`
- **Manual smoke** on Windows with a project path containing spaces
- **Document** in DOCS that the parent terminal shell does not affect internal git exec
