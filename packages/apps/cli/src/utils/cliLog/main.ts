import { logMessagesList } from "../logMessagesList";

export function cliLog(
    jsonToOutput: ({
        messages: string[];
        data?: Record<string, unknown> | unknown[];
    }),
    outputFullJson?: boolean,
    error?: boolean
) {
    const logFn = error ? console.error : console.log;
    
    if (outputFullJson) {
        logFn(JSON.stringify(jsonToOutput));
    } else {
        logMessagesList(jsonToOutput.messages, error);
    }
}