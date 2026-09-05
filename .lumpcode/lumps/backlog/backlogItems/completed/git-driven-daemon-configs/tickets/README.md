# Tickets: git-driven daemon configs

Global contract: [`../requirements.md`](../requirements.md). Parent item is an umbrella (`tickets/`); it only runs `completion`.

Each ticket is a **directory in this folder** with `desc.yml` (`name` = folder name, `dependsOn` = other ticket `name`s) and ticket `requirements.md`.

```
01-supervise-only-start          ─┐
02-respawn-strategy-from-meta    ─┤  (no dependsOn; parallel)
03-daemon-config-file-contract   ─┤
                                 │
04-discover-daemon-config-files  ←┘  dependsOn: 03-daemon-config-file-contract
05-reconcile-start               ←   dependsOn: 04-discover-daemon-config-files
06-reconcile-stop-and-restart    ←   dependsOn: 05-reconcile-start
```

| Ticket | Stands alone as |
| --- | --- |
| [01-supervise-only-start](./01-supervise-only-start/) | Supervise with no daemon |
| [02-respawn-strategy-from-meta](./02-respawn-strategy-from-meta/) | Respawn keeps meta `workspaceStrategy` |
| [03-daemon-config-file-contract](./03-daemon-config-file-contract/) | Schema / hash / meta |
| [04-discover-daemon-config-files](./04-discover-daemon-config-files/) | Considered set from `origin/<branch>` |
| [05-reconcile-start](./05-reconcile-start/) | Git **starts** enabled files |
| [06-reconcile-stop-and-restart](./06-reconcile-stop-and-restart/) | Stop + hash-restart |

All six are `workflow: [impl]`. 01 is recommended before 05 for operators but is not a `dependsOn`.
