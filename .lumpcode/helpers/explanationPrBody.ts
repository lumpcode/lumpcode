import fs from 'node:fs';
import path from 'node:path';

/** PR body for a lump whose review note is `explanation.md` in the lump directory. */
export function explanationPrBody(relativePath: string) {
    return function explanationPrBodyFn(input: { workspacePath: string }): string {
        try {
            const text = fs.readFileSync(path.join(input.workspacePath, relativePath), 'utf8').trim();
            if (text.length > 0) {
                return text;
            }
        } catch {
            // A missing note still opens the PR; the validation step already required the file.
        }
        return `See \`${relativePath}\`.`;
    };
}
