### `lumpcode login`

## Description

Authenticate with the Lumpcode API. Prompts interactively for email and password. If `--email` is provided, only the password is prompted.

The authentication token is stored in `~/.lumpcode/auth.json`.

## Usage

```
lumpcode login [--email <email>] [--password <password>] [--json]
```

## Options

| Option | Description |
|---|---|
| `--email <email>` | Email address; when set, only the password is prompted interactively. |
| `--password <password>` | Password (not recommended: visible in process listings and shell history). |
| `--json` | JSON output. |

## Examples

```bash
# Interactive prompt for email and password
lumpcode login

# Skip the email prompt
lumpcode login --email me@example.com

# (Not secure) use the --password option
lumpcode login --email me@example.com --password mypassword
```
