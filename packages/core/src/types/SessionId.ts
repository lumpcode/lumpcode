/**
 * An agent's real session id (Claude Code / Copilot UUID, Codex thread id, Cursor chat id, OpenCode session id).
 *
 * TODO(qol `tagged-string-types`): a plain alias for now; becomes a tagged type
 * so a context name or command name cannot be passed where a session id is expected.
 */
export type SessionId = string;
