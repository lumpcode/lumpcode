import type { Paths, PathsOptions, Split } from "type-fest";

export type ArrayPaths<T, Options extends PathsOptions = PathsOptions> = Split<Paths<
T,
{
    depth: Options['depth'];
    leavesOnly: Options['leavesOnly'];
    maxRecursionDepth: Options['maxRecursionDepth'];
    bracketNotation: false;
}
> extends infer A ? A extends string ? A : '' : '', '.', {
    strictLiteralChecks: false,
}>