/**
 * In-process match of a concrete branch short name against a git refname glob
 * (same dialect as `git ls-remote --heads origin <pattern>`).
 *
 * Callers must only use this for pattern rules (`isGitRefGlob`); exact rules
 * compare with string equality.
 *
 * Segment semantics for `*`: align with `git ls-remote` for the cases under
 * test (e.g. `feature/*` matches `feature/a` / `feature/b`, not `feature/a/b`
 * or `dev` when that matches observed git behavior).
 *
 * Stub for dynamic-discovery-branch — implement during feature stage.
 */
export function branchMatchesGitGlob(_input: {
    pattern: string;
    branch: string;
}): boolean {
    throw new Error('not implemented');
}
