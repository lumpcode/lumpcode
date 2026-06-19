### `lumpcode project-setup`

## Description

Initialize a new Lumpcode project in the given directory.

If `projectPath` is not a git repository, the command fails.
If `projectName` is ommited, the git repository name is used.

## Usage

```
lumpcode project-setup [--projectPath] <path> [--projectName] <project-name> [--json]
```

## Options

| Option | Description |
|---|---|
| `--projectPath <path='.'>` | Path to the project root directory. |
| `--projectName <project-name=''>` | A human-readable name for the project. |
| `--json` | JSON output. |

## Examples

```bash
# Setup in the current directory (--projectPath default is '.')
lumpcode project-setup --projectName my-app

# Setup in a specific directory
lumpcode project-setup --projectPath /home/user/projects/api --projectName backend-api
```
