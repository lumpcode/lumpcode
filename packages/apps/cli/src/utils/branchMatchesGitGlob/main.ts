/**
 * In-process match of a concrete branch short name against a git refname glob
 * (same dialect as `git ls-remote --heads origin <pattern>` for the cases under
 * test).
 *
 * Callers must only use this for pattern rules (`isGitRefGlob`); exact rules
 * compare with string equality.
 *
 * Segment semantics for `*`: matches a single path segment (`[^/]*`), so
 * `feature/*` matches `feature/a` / `feature/b`, not `feature/a/b` or `dev`.
 * `?` matches a single character within a segment.
 */
export function branchMatchesGitGlob(input: {
    pattern: string;
    branch: string;
}): boolean {
    const { pattern, branch } = input;
    let regexSource = '';
    for (const ch of pattern) {
        if (ch === '*') {
            regexSource += '[^/]*';
        } else if (ch === '?') {
            regexSource += '[^/]';
        } else if (/[.+^${}()|[\]\\]/.test(ch)) {
            regexSource += `\\${ch}`;
        } else {
            regexSource += ch;
        }
    }
    return new RegExp(`^${regexSource}$`).test(branch);
}
