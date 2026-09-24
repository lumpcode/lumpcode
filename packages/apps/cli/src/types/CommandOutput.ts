export interface CommandOutput {
    messages: string[];
    data?: any;
    /** When true, addCommand skips reprinting messages that were already written to stdout. */
    printed?: boolean;
}