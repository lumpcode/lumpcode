import { GitAndWorkspaceFnsInput } from "./GitAndWorkspaceFnsInput";

export type TeardownWorkspaceFn = (input: GitAndWorkspaceFnsInput) => Promise<string>;
