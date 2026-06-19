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

/**
 * Resolves bare executable names on Windows so npm-style `.cmd` shims and
 * extensionless Node entrypoints work with `child_process.spawn` (no shell).
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
        return wrapWindowsCmdShim(resolved, args);
    }

    if (isNodeScript(resolved)) {
        return {
            executable: process.execPath,
            args: [resolved, ...args],
        };
    }

    return { executable: resolved, args };
}
