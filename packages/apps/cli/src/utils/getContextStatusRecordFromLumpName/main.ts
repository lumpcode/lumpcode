import { Failure, readJsonFile, Success } from "@lumpcode/core";

import { contextStatusRecordPath } from "../contextStatusRecordPath";
import { ContextStatusRecord } from "../../types";

export async function getContextStatusRecordFromLumpName(input: {
    lumpName: string;
    projectRoot: string;
}): Promise<Success<ContextStatusRecord> | Failure<string>> {
    const { lumpName, projectRoot } = input;
    const csrPath = contextStatusRecordPath({ projectRoot, lumpName });
    const contextStatusRecordRes = await readJsonFile<ContextStatusRecord>({ filePath: csrPath });
    if (!contextStatusRecordRes.success) return contextStatusRecordRes;
    return contextStatusRecordRes;
}