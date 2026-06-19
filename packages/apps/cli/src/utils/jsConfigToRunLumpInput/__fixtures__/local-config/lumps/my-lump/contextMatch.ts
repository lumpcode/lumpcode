export default function contextMatchFn({ codeBasePath }: { codeBasePath: { path: string } }) {
    if (codeBasePath.path.endsWith('.ts')) {
        return { contextName: 'ts-match', filePathVariableName: 'FILE' };
    }
    return null;
}
