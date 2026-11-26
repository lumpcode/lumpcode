# Requirements: Worker deploy (umbrella)

| Field | Value |
| --- | --- |
| **Backlog** | `worker-deploy` · priority **40** · umbrella |
| **Depends on** | `factory-templates-ts-default-scaffolding`, `dashboard-v2-dashboard-password-login` |
| **Roadmap** | `.lumpcode/lumps/backlog/last-20-percent-requirements.md` |
| **Packages** | `@lumpcode/cli` (`setup`), a worker image (Dockerfile + release workflow), cloud templates in the repo. Website page in docs `deploy-worker-page`. |

## Problem statement and motivation

A worker is how Lumpcode is meant to run, but setting one up is a manual sequence: a machine, Node, the CLI, the agent and its login, git credentials, a clone, then `lumpcode setup`. The website needs a "Deploy a worker" call to action that gets an operator from nothing to a running worker in minutes, without Lumpcode running any backend.

## Goals

1. `lumpcode setup` with no prompt.
2. One official worker image that clones, sets up and starts a worker and its dashboard.
3. Templates for AWS, Azure, Hetzner and DigitalOcean that boot that image.

## Non-goals

- A Lumpcode backend, account, or hosted worker (IDEAS `hosted-workers`, blocked).
- Using the operator's cloud credentials from a Lumpcode page or package. The operator launches the template on the provider's side.
- Kubernetes, autoscaling, or several workers per machine.

## Key decisions

- **Static only:** the website page fills template inputs in the browser and outputs a cloud-init or a provider one-click link. Secrets go to the cloud provider, never to a Lumpcode server.
- The image runs the worker in `dedicated` mode on a clone kept on a volume.
- The dashboard in the image follows the `dashboard-v2` password rule.
- Agents supported in the image: the CLI presets (Claude Code, Codex, Cursor, opencode, Copilot). Git hosts: GitHub, GitLab, Bitbucket, Azure DevOps, with a token or deploy key.
- `git-access-heartbeat` (top-level, priority 42) is the worker's own check that it can still push.

## Tickets

| Order | Ticket | Delivers |
| --- | --- | --- |
| 40 | `setup-non-interactive` | `setup` from flags and environment, no prompt |
| 41 | `worker-docker-image` | Official image, published on release |
| 43 | `worker-cloud-templates` | Cloud-init (Hetzner, DigitalOcean), ARM (Azure), CloudFormation (AWS), validated in CI |

Docs follow-ups: `docs/worker-connections-docs` (44), `docs/deploy-worker-page` (45).

## Acceptance criteria

- On each of the four clouds, launching the template with a repo URL, a git credential, an agent credential and a dashboard password gives a worker that pushes its first lump branch and serves the dashboard behind the password.
