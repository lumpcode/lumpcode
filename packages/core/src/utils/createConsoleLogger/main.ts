import type { Logger } from '../../types/Logger';

function formatMessage(prefix: string | undefined, message: string): string {
    if (!prefix) return message;
    return `${prefix} ${message}`;
}

export function createConsoleLogger(input: {
    verbose?: boolean;
    json?: boolean;
    prefix?: string;
}): Logger {
    const verboseEnabled = !!input.verbose;
    const suppressNonError = !!input.json;
    const prefix = input.prefix;

    function makeLogger(currentPrefix: string | undefined): Logger {
        return {
            error(message: string) {
                console.error(formatMessage(currentPrefix, message));
            },
            warn(message: string) {
                if (suppressNonError) return;
                console.warn(formatMessage(currentPrefix, message));
            },
            info(message: string) {
                if (suppressNonError) return;
                console.log(formatMessage(currentPrefix, message));
            },
            verbose(message: string) {
                if (suppressNonError || !verboseEnabled) return;
                console.log(formatMessage(currentPrefix, message));
            },
            child(childPrefix: string) {
                const nextPrefix = currentPrefix ? `${currentPrefix} ${childPrefix}` : childPrefix;
                return makeLogger(nextPrefix);
            },
        };
    }

    return makeLogger(prefix);
}
