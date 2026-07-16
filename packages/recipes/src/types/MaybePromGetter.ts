import { MaybePromise } from "@lumpcode/core";

export type MaybePromGetter<T, P = void> = T | ((input: P) => MaybePromise<T>);

export function normalizeMaybePromGetter<T, P = void>(
    maybePromGetter: MaybePromGetter<T, P>,
): (input: P) => MaybePromise<T>;

export function normalizeMaybePromGetter<T, P = void>(
    maybePromGetter: MaybePromGetter<T, P> | undefined,
    defaultValue: T,
): (input?: P) => MaybePromise<T>;

export function normalizeMaybePromGetter<T, P = void>(
    maybePromGetter: MaybePromGetter<T, P> | undefined,
    defaultValue?: T,
): (input?: P) => MaybePromise<T> {
    if (typeof maybePromGetter === 'function') {
        return maybePromGetter as (input?: P) => MaybePromise<T>;
    }
    const value = maybePromGetter ?? defaultValue!;
    return () => value;
}