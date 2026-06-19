import type { Get } from "type-fest";
import type { ArrayPaths } from "../../types";

export function set<T, P extends ArrayPaths<T>>(object: T, path: P, value: Get<T, P>): T {
    const keys = Array.isArray(path) ? path : [path];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let current: any = object;
    
    for (let i = 0; i < keys.length - 1; i++) {
      const key = keys[i];
      if (!(key in current)) {
        current[key] = typeof keys[i + 1] === "number" ? [] : {};
      }
      current = current[key];
    }
    
    const lastKey = keys[keys.length - 1];
    current[lastKey] = value;
    
    return object;
}