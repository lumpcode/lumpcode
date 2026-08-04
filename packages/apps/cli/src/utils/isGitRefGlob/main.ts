/**
 * True when `value` contains git ls-remote refname glob metacharacters
 * (at least `*` and `?`). Exact branch names return false.
 */
export function isGitRefGlob(value: string): boolean {
    return value.includes('*') || value.includes('?');
}
