export function resolveGlobalConfigFolderPath(homeDir?: string): string;

export function resolveNpmBundlePresetsDir(pkgRoot: string): string;

export function listBundledPresetCommandNames(bundlePresetsDir: string): Promise<string[]>;

export function installPresetCommands(input: {
    bundlePresetsDir: string;
    globalConfigFolderPath: string;
    overwrite?: boolean;
}): Promise<{ installed: boolean; reason?: string; count?: number }>;
