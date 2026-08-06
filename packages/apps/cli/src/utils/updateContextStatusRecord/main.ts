import { failure, success } from "@lumpcode/core";

import { buildContextStatusRecord } from "../buildContextStatusRecord";
import { contextStatusRecordPath } from "../contextStatusRecordPath";
import { writeJsonFile } from "../writeJsonFile";

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
    const filePath = contextStatusRecordPath({ projectRoot, lumpName });
    const writeResult = await writeJsonFile({ filePath, data: nextContextStatusRecord, pretty: 2 });
    if (!writeResult.success) {
        return failure({
            message: `Failed to update context status record file: ${writeResult.data}`,
        });
    }

    return success(nextContextStatusRecord);
}