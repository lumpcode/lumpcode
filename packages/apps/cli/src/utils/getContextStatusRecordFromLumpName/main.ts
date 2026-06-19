import { failure, Failure, Success } from "@lumpcode/core";

import { contextStatusRecordPath } from "../contextStatusRecordPath";
import { readJson } from "../readJson";
import { ContextStatusRecord } from "../../types";

export async function getContextStatusRecordFromLumpName(input: {
    lumpName: string;
    projectRoot: string;
}): Promise<Success<ContextStatusRecord> | Failure<string>> {
    const { lumpName, projectRoot } = input;
    const csrPath = contextStatusRecordPath({ projectRoot, lumpName });
    const contextStatusRecordRes = await readJson<ContextStatusRecord>(csrPath);
    if (!contextStatusRecordRes.success) return failure(contextStatusRecordRes.data.message);
    return contextStatusRecordRes;
}