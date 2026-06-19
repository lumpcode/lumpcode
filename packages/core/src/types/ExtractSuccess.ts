import { Success } from './Success';

export type ExtractSuccess<T> = T extends Success<infer U> ? U : never;