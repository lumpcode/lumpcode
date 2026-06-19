import path from "node:path";
import os from "node:os";

export const globalConfigFolderPath = path.join(os.homedir(), '.lumpcode');

export const localConfigFolderPath = path.join(process.cwd(), '.lumpcode');