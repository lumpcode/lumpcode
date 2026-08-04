export function daemonFileBaseName(input: { projectName: string; daemonId: string }): string {
    return `${input.projectName}.${input.daemonId}`;
}
