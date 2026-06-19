import { Maybe } from "../../types";

export function decision<R>(
    possibilities: [() => boolean, () => R][],
    defaultValue?: R,
): R {
    for (const [condition, result] of possibilities) {
        if (condition()) {
            return result();
        }
    }
    if (defaultValue) {
        return defaultValue;
    }
    throw new Error('No value found in decision');
}