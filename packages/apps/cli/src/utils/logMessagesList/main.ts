export function logMessagesList(messages: string[], error?: boolean) {
    const logFn = error ? console.error : console.log;
    messages.forEach(message => {
        logFn(message);
    });
}