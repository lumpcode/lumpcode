export function daemonFileBaseName(input: { projectName: string; lumpName?: string }): string {
    const { projectName, lumpName } = input;
    return lumpName ? `${projectName}.${lumpName}` : projectName;
}
