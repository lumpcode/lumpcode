import { Success } from "../../types";

export function success<RES>(data: RES): Success<RES> {
    return {
        success: true,
        data,
    } as const;
}