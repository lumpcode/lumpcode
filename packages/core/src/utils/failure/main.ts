import { Failure } from "../../types";

export function failure<ERR>(data: ERR): Failure<ERR> {
    return {
        success: false,
        data,
    } as const;
}