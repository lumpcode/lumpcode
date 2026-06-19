import * as path from 'node:path';
import * as os from 'node:os';

export const AUTH_FILE_PATH = path.join(os.homedir(), '.lumpcode', 'auth.json');

export const REFS_HEADS_PREFIX = "refs/heads/";

export const LUMP_BRANCH_PREFIX = "lump/";
export const LUMP_COMMIT_PREFIX = "LUMP: ";
