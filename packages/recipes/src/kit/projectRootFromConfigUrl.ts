import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Resolves git project root from a lump `config.ts` module URL. */
export function projectRootFromConfigUrl(configUrl: string | URL): string {
    const configDir = path.dirname(fileURLToPath(configUrl));
    return path.resolve(configDir, '../../..');
}
