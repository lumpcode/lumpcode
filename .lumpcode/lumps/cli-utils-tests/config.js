import { defineConfig } from '@lumpcode/cli-types';

export default defineConfig({
    contextMatchFn({
        codeBasePath,
        codeBasePaths
    }) {
        let path = codeBasePath.path;
        if (codeBasePath.isDir) {
            path += '/';
        }
        const splitted = path.split('/');
        const utilsIsPreLastFolder = splitted.at(-3) === 'utils';
        const isInUtils = path.includes('cli/src/utils/') && !path.endsWith('utils/') && utilsIsPreLastFolder;
        if (!isInUtils) return null;

        const contextName = path.split('/').at(-2);

        const allTestsFiles = codeBasePaths.filter(({ path }) => {
            const isTest = path.includes('.test.ts') || path.includes('.spec.ts');
            const isInUtils = path.includes(`cli/src/utils/${contextName}/`);
            return isTest && isInUtils;
        });
        const hasUnitTestFile = allTestsFiles.some(({ path }) => path.includes('unit.test.ts'));
        const hasExactlyOneTestFile = allTestsFiles.length === 1;
        const hasExactlyOneTestFileAndIsUnit = hasExactlyOneTestFile && hasUnitTestFile;

        if (hasExactlyOneTestFileAndIsUnit) {
            return null;
        }

        const tooManyTests = allTestsFiles.length > 1;

        const moreContextVariables = {
            tooManyTests,
        };

        if (codeBasePath.isDir) {
            return {
                contextName,
                filePathVariableName: 'UTIL_FOLDER',
                moreContextVariables
            }
        }

        const isMain = codeBasePath.path.includes('main.ts');
        const isIndex = codeBasePath.path.includes('index.ts');
        const isUnit = codeBasePath.path.includes('unit.test.ts');

        let filePathVariableName = '';
        if (isMain) filePathVariableName = 'MAIN';
        if (isIndex) filePathVariableName = 'INDEX';
        if (isUnit) filePathVariableName = 'UNIT';

        if (filePathVariableName) {
            return {
                contextName,
                filePathVariableName,
                moreContextVariables
            }
        }

        return null;
    },
    command: 'cursor',
    steps: [
        {
            promptFn({
                context,
            }) {
                const { variables } = context;
                const tooManyTests = variables.tooManyTests;

                if (tooManyTests) {
                    return `
                        We want to merge all the test files present in @${variables.UTIL_FOLDER} into a single file at @${variables.UTIL_FOLDER}/unit.test.ts. Write the content of the new file.
                        If multiple tests overlap, do the merge intelligently, removing duplicates and keeping everything clean.
                    `
                } else {
                    return `
                        We want to add a unit test for the util in @${variables.UTIL_FOLDER}. Write the unit test cleanly, not too long and with easy to understand descriptions and code.
                        Write the unit test at @${variables.UTIL_FOLDER}/unit.test.ts.
                    `
                }
            },
        },
    ],
    keepHistory: true,
    verbose: true,
    numberOfContextsPerBranch: 3,
    maximumNumberOfConcurrentBranches: 2,
});