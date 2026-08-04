/**
 * True when `value` contains git ls-remote refname glob metacharacters
 * (at least `*` and `?`). Exact branch names return false.
 *
 * Stub for dynamic-discovery-branch — implement during feature stage.
 */
export function isGitRefGlob(_value: string): boolean {
    throw new Error('not implemented');
}
