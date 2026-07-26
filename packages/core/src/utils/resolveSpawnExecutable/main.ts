import * as fs from 'node:fs';
import * as path from 'node:path';

export type ResolvedSpawnCommand = {
    executable: string;
    args: string[];
};

const DEFAULT_WINDOWS_PATHEXT = [
    '.COM',
    '.EXE',
    '.BAT',
    '.CMD',
    '.VBS',
    '.VBE',
    '.JS',
    '.JSE',
    '.WSF',
    '.WSH',
    '.MSC',
];

/** Matches a quoted script path using %dp0% / %~dp0 relative to a Windows .cmd shim. */
const WINDOWS_DP0_SCRIPT_RE =
    /"(?:%dp0%|%~dp0)\\?((?:[^"\r\n])+?\.(?:js|mjs|cjs))"/i;

/** Absolute Windows path to a Node script in quotes. */
const WINDOWS_ABS_SCRIPT_RE = /"([A-Za-z]:\\[^"\r\n]+\.(?:js|mjs|cjs))"/i;

function windowsPathext(): string[] {
    const fromEnv = process.env.PATHEXT?.split(';').map((entry) => entry.trim()).filter(Boolean);
    return fromEnv?.length ? fromEnv : DEFAULT_WINDOWS_PATHEXT;
}

function pathEntries(): string[] {
    return (process.env.PATH ?? '').split(path.delimiter).filter(Boolean);
}

function fileExists(filePath: string): boolean {
    try {
        fs.accessSync(filePath, fs.constants.F_OK);
        return true;
    } catch {
        return false;
    }
}

function resolveOnPath(baseName: string): string | undefined {
    const hasExtension = path.extname(baseName) !== '';
    if (hasExtension) {
        for (const dir of pathEntries()) {
            const candidate = path.join(dir, baseName);
            if (fileExists(candidate)) {
                return candidate;
            }
        }
        return undefined;
    }

    for (const dir of pathEntries()) {
        for (const ext of windowsPathext()) {
            const candidate = path.join(dir, baseName + ext);
            if (fileExists(candidate)) {
                return candidate;
            }
        }

        const extensionless = path.join(dir, baseName);
        if (fileExists(extensionless)) {
            return extensionless;
        }
    }

    return undefined;
}

function isNodeScript(filePath: string): boolean {
    if (/\.(mjs|cjs|js)$/i.test(filePath)) {
        return true;
    }

    try {
        const fd = fs.openSync(filePath, 'r');
        const buf = Buffer.alloc(256);
        const bytesRead = fs.readSync(fd, buf, 0, 256, 0);
        fs.closeSync(fd);
        const head = buf.subarray(0, bytesRead).toString('utf8');
        const shebang = head.split('\n')[0] ?? '';
        return shebang.startsWith('#!') && /node/i.test(shebang);
    } catch {
        return false;
    }
}

function wrapWindowsCmdShim(resolvedPath: string, args: string[]): ResolvedSpawnCommand {
    const comSpec = process.env.ComSpec ?? 'cmd.exe';
    return {
        executable: comSpec,
        args: ['/d', '/s', '/c', resolvedPath, ...args],
    };
}

function resolveWindowsJsPathFromShim(shimDir: string, relativeOrAbsolute: string): string {
    if (/^[A-Za-z]:[\\/]/.test(relativeOrAbsolute)) {
        return path.resolve(relativeOrAbsolute);
    }
    // Normalize Windows separators so stubbed-win32 tests on POSIX still resolve.
    const parts = relativeOrAbsolute.replace(/^[\\/]+/, '').split(/[/\\]+/).filter(Boolean);
    return path.resolve(shimDir, ...parts);
}

/**
 * Prefer a real Node binary — never a .cmd/.bat shim (those reintroduce cmd.exe),
 * and never the host SEA/`lumpcode` binary via process.execPath.
 * Returns bare `"node"` as last resort so spawn fails with ENOENT instead of
 * silently falling back to cmd.exe after a Node entry was identified.
 */
function resolveNodeExecutable(preferredDir?: string): string {
    if (preferredDir != null) {
        const bundledNode = path.join(preferredDir, 'node.exe');
        if (fileExists(bundledNode)) {
            return bundledNode;
        }
    }

    for (const name of ['node.exe', 'node']) {
        const found = resolveOnPath(name);
        if (!found) continue;
        const ext = path.extname(found).toLowerCase();
        if (ext === '.cmd' || ext === '.bat') continue;
        return found;
    }

    const base = path.basename(process.execPath).toLowerCase();
    if (base === 'node' || base === 'node.exe') {
        return process.execPath;
    }
    return 'node';
}

/**
 * Parse an npm/yarn-style Windows `.cmd` shim to `node <script.js>`.
 * Returns null only when the file is not a recognizable Node cmd-shim
 * (caller may wrap with cmd.exe). Once a script path is found, never falls
 * back to cmd.exe — missing Node uses bare `"node"` for a clear spawn failure.
 */
function tryUnwrapWindowsNpmCmdShim(cmdPath: string): { scriptPath: string } | null {
    let body: string;
    try {
        body = fs.readFileSync(cmdPath, 'utf8');
    } catch {
        return null;
    }

    const shimDir = path.dirname(cmdPath);
    const lines = body.split(/\r?\n/);
    // Windows npm-cmd-shim ends with `%*` pass-through; prefer that line for the script path.
    const passThroughLine = [...lines].reverse().find((line) => /%\*\s*$/.test(line));
    const searchOrder = passThroughLine != null ? [passThroughLine, body] : [body];

    for (const searchIn of searchOrder) {
        const dp0Match = searchIn.match(WINDOWS_DP0_SCRIPT_RE);
        if (dp0Match?.[1]) {
            const candidate = resolveWindowsJsPathFromShim(shimDir, dp0Match[1]);
            if (fileExists(candidate)) {
                return { scriptPath: candidate };
            }
        }
        const absMatch = searchIn.match(WINDOWS_ABS_SCRIPT_RE);
        if (absMatch?.[1] && fileExists(absMatch[1])) {
            return { scriptPath: absMatch[1] };
        }
    }

    return null;
}

/**
 * Resolves bare executable names on Windows so npm-style `.cmd` shims and
 * extensionless Node entrypoints work with `child_process.spawn` (no shell).
 *
 * For Node agent CLIs installed via npm (copilot.cmd, cursor-agent.cmd, …),
 * unwraps the shim to `node <entry.js> …args` so prompt argv is not mangled by
 * cmd.exe / `%*`. Unrecognized `.cmd`/`.bat` files still wrap through cmd.exe.
 */
export function resolveSpawnExecutable(
    executable: string,
    args: string[],
): ResolvedSpawnCommand {
    if (process.platform !== 'win32') {
        return { executable, args };
    }

    let resolved = executable;

    if (path.isAbsolute(executable) || executable.includes('/') || executable.includes('\\')) {
        if (!fileExists(executable)) {
            return { executable, args };
        }
        resolved = path.resolve(executable);
    } else {
        const onPath = resolveOnPath(executable);
        if (onPath) {
            resolved = onPath;
        }
    }

    const ext = path.extname(resolved).toLowerCase();

    if (ext === '.cmd' || ext === '.bat') {
        const unwrapped = tryUnwrapWindowsNpmCmdShim(resolved);
        if (unwrapped != null) {
            return {
                executable: resolveNodeExecutable(path.dirname(resolved)),
                args: [unwrapped.scriptPath, ...args],
            };
        }
        return wrapWindowsCmdShim(resolved, args);
    }

    if (isNodeScript(resolved)) {
        return {
            executable: resolveNodeExecutable(path.dirname(resolved)),
            args: [resolved, ...args],
        };
    }

    return { executable: resolved, args };
}
