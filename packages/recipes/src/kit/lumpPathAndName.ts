import { fileURLToPath } from "url";
import path from "path";

export function lumpPathAndName(configUrl: string | URL) {
    const lumpName = path.basename(path.dirname(fileURLToPath(configUrl)));
    const lumpPath = path.join('.lumpcode', 'lumps', lumpName);
    return [
        lumpPath,
        lumpName,
    ] as [lumpPath: string, lumpName: string];
}