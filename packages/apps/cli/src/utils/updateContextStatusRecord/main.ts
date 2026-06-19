import fs from "node:fs/promises";

import { failure, success } from "@lumpcode/core";

import { buildContextStatusRecord } from "../buildContextStatusRecord";
import { contextStatusRecordPath } from "../contextStatusRecordPath";

export async function updateContextStatusRecord(input: {
    projectRoot: string;
    lumpName: string;
    baseBranch: string;
}) {
    const { projectRoot, lumpName, baseBranch } = input;
    
    const nextContextStatusRecordResult = await buildContextStatusRecord({
        projectRoot,
        lumpName,
        baseBranch,
    });

    if (!nextContextStatusRecordResult.success) return failure(nextContextStatusRecordResult.data);

    const nextContextStatusRecord = nextContextStatusRecordResult.data;

    try {
        await fs.writeFile(
            contextStatusRecordPath({ projectRoot, lumpName }),
            JSON.stringify(nextContextStatusRecord, null, 2),
            { encoding: 'utf-8' }
        );    
    } catch (error) {
        return failure({
            message: `Failed to update context status record file: ${error}`,
        });
    }

    return success(nextContextStatusRecord);
}