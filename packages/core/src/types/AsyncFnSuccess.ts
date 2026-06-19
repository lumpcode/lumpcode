import { ExtractSuccess } from "./ExtractSuccess";

export type AsyncFnSuccess<T extends (...args: any[]) => Promise<any>> = ExtractSuccess<Awaited<ReturnType<T>>>;