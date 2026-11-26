# Requirements: Dashboard v2 (umbrella)

| Field | Value |
| --- | --- |
| **Backlog** | `dashboard-v2` · priority **30** · umbrella |
| **Depends on** | `worker-dashboard-readonly` (done) |
| **Roadmap** | `.lumpcode/lumps/backlog/last-20-percent-requirements.md` |
| **Packages** | `@lumpcode/dashboard` (primary), `@lumpcode/cli` (`dashboard`, `start`, `stop`, `daemon-status`) |

## Problem statement and motivation

The dashboard shows the live daemon snapshot, read-only, on loopback. To see what the agent does, what is done per lump, or to act on a worker, the operator still needs an SSH shell. Exposing the page is unsafe today: a public bind has no authentication.

## Goals

1. Control daemons and edit `local.json` from the page.
2. Expose the page beyond loopback behind one shared password.
3. Read transcripts and the per-lump board (from git) on the page.
4. See how long the current context has been running.
5. Have the supervisor keep the dashboard running.

## Non-goals

- User accounts, per-person login, roles, or SSO.
- TLS inside Lumpcode. Docs recommend a reverse proxy or a tunnel.
- A history of past run durations.
- Any status store beside git and the daemon's own files.

## Key decisions

- **Auth rule (amends `worker-dashboard-controls`):** loopback without a password works as today. A non-loopback bind without a password refuses to start. With a password, both the view and the controls sit behind the login, on any bind. `--readOnly` still removes controls.
- **Owner of the auth check:** the dashboard server in `packages/apps/dashboard`; the CLI only passes the password and bind.
- The lump board reads the same status as `lump-status`, on a slower interval than the 5-second snapshot.
- The visual look follows the website tokens (`qol` `dashboard-match-website-look`, priority 35).

## Tickets

| Order | Ticket | Delivers |
| --- | --- | --- |
| 30 | `worker-dashboard-controls` | Stop, start, restart, edit `local.json` (existing requirements) |
| 31 | `dashboard-password-login` | Shared password, login page, session, public bind rule |
| 32 | `dashboard-transcripts` | Transcript list and live follow |
| 33 | `dashboard-lump-board` | Per-lump toDo / branchPushed / finished from git |
| 34 | `see-lump-context-run-time` | Current run time on the page and in `daemon-status` |
| 36 | `dashboard-under-supervisor` | `start --dashboard`, kept alive by the supervisor |

## Acceptance criteria

- `lumpcode start --dashboard --bind 0.0.0.0` refuses without a password and, with one, serves a login page; after login, the operator stops a daemon and reads its transcript from a browser.
