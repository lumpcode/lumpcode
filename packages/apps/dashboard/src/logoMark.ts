import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const pngPath = join(dirname(fileURLToPath(import.meta.url)), 'logo-mark.png');

export const logoMarkDataUrl = `data:image/png;base64,${readFileSync(pngPath).toString('base64')}`;
