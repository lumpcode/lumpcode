import { describe, it, expect, vi, beforeEach } from 'vitest';

import type { ContextMatchFn } from '../../../types';
import {
    assertFailure,
    assertSuccess,
    resolveJsConf,
    resolveWithFixtures,
    stubGetContextListFn,
} from './testHelpers';

describe('jsConfigToRunLumpInput getContextListFn resolution', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should adapt a function getContextListFn to the core list signature', async () => {
        const data = assertSuccess(await resolveJsConf({ getContextListFn: stubGetContextListFn }));
        const contexts = await data.getContextListFn({
            codeBasePaths: [],
            lumpVariables: {},
        });
        expect(contexts).toEqual([{ name: 'ctx1', variables: { FILE: 'a.ts' } }]);
    });

    it('should resolve getContextListFn from a relative FilePath in the lump folder', async () => {
        const data = assertSuccess(await resolveWithFixtures({
            getContextListFn: './getContextList.js',
            contextMatchFn: undefined,
            contextListJson: undefined,
        }));
        const contexts = await data.getContextListFn({
            codeBasePaths: [],
            lumpVariables: {},
        });
        expect(contexts).toEqual([{ name: 'from-file', variables: { FILE: 'via-relative-path.ts' } }]);
    });

    it('should return a failure when neither getContextListFn nor contextMatchFn nor contextListJson is provided', async () => {
        assertFailure(await resolveJsConf({ getContextListFn: undefined, contextMatchFn: undefined, contextListJson: undefined }),
            'Either getContextListFn, contextMatchFn, or contextListJson must be provided');
    });

    it('should create getContextListFn from inline contextListJson template', async () => {
        const template = {
            FOLDER: 'src/components/{COMPONENT_NAME}/',
            INDEX: 'src/components/{COMPONENT_NAME}/index.ts',
        };
        const data = assertSuccess(await resolveJsConf({
            getContextListFn: undefined,
            contextMatchFn: undefined,
            contextListJson: template,
        }));
        const contexts = await data.getContextListFn({
            codeBasePaths: [
                { isDir: true, path: 'src/components/button' },
                { isDir: false, path: 'src/components/button/index.ts' },
                { isDir: true, path: 'src/components/form' },
                { isDir: false, path: 'src/components/form/index.ts' },
            ],
            lumpVariables: {},
        });
        expect(contexts).toHaveLength(2);
        expect(contexts[0]).toEqual({
            name: 'button',
            variables: { FOLDER: 'src/components/button/', INDEX: 'src/components/button/index.ts' },
        });
        expect(contexts[1]).toEqual({
            name: 'form',
            variables: { FOLDER: 'src/components/form/', INDEX: 'src/components/form/index.ts' },
        });
    });

    it('should return a static ContextList from inline contextListJson', async () => {
        const list = [{
            name: 'README',
            variables: { FILE: 'README.md' },
            options: { priority: 0, dependsOnContexts: ['other'] },
        }];
        const data = assertSuccess(await resolveJsConf({
            getContextListFn: undefined,
            contextMatchFn: undefined,
            contextListJson: list,
        }));
        const contexts = await data.getContextListFn({
            codeBasePaths: [],
            lumpVariables: {},
        });
        expect(contexts).toEqual(list);
    });

    it('should ignore contextOptionsFn when contextListJson is a ContextList', async () => {
        const list = [{ name: 'README', variables: { FILE: 'README.md' } }];
        const data = assertSuccess(await resolveJsConf({
            getContextListFn: undefined,
            contextMatchFn: undefined,
            contextListJson: list,
            contextOptionsFn: () => ({ priority: 9 }),
        }));
        const contexts = await data.getContextListFn({
            codeBasePaths: [],
            lumpVariables: {},
        });
        expect(contexts).toEqual(list);
    });

    it('should return an empty plan for an empty ContextList or empty template object', async () => {
        for (const contextListJson of [[], {}] as const) {
            const data = assertSuccess(await resolveJsConf({
                getContextListFn: undefined,
                contextMatchFn: undefined,
                contextListJson,
            }));
            const contexts = await data.getContextListFn({
                codeBasePaths: [{ isDir: false, path: 'README.md' }],
                lumpVariables: {},
            });
            expect(contexts).toEqual([]);
        }
    });

    it('should fail resolve when a template value has no placeholder', async () => {
        assertFailure(
            await resolveJsConf({
                getContextListFn: undefined,
                contextMatchFn: undefined,
                contextListJson: { FILE: 'README.md' },
            }),
            'contextListJson template value for "FILE" must contain a {PLACEHOLDER} or $modifier{…} token, or use a ContextList array',
        );
    });

    it('should fail resolve when a ContextList item has extra keys', async () => {
        assertFailure(
            await resolveJsConf({
                getContextListFn: undefined,
                contextMatchFn: undefined,
                contextListJson: [{ name: 'a', variables: { FILE: 'a.ts' }, extra: 1 }] as never,
            }),
            'contextListJson[0] has unknown keys: extra',
        );
    });

    it('should create getContextListFn from a ContextList JSON file', async () => {
        const data = assertSuccess(await resolveWithFixtures({
            getContextListFn: undefined,
            contextMatchFn: undefined,
            contextListJson: './staticContextList.json',
        }));
        const contexts = await data.getContextListFn({
            codeBasePaths: [],
            lumpVariables: {},
        });
        expect(contexts).toEqual([
            {
                name: 'README',
                variables: { FILE: 'README.md' },
                options: { priority: 1 },
            },
        ]);
    });

    it('should create getContextListFn from contextListJson file path', async () => {
        const data = assertSuccess(await resolveWithFixtures({
            getContextListFn: undefined,
            contextMatchFn: undefined,
            contextListJson: './contextList.json',
        }));
        const contexts = await data.getContextListFn({
            codeBasePaths: [
                { isDir: true, path: 'src/components/button' },
                { isDir: false, path: 'src/components/button/index.ts' },
                { isDir: true, path: 'src/components/form' },
                { isDir: false, path: 'src/components/form/index.ts' },
            ],
            lumpVariables: {},
        });
        expect(contexts).toHaveLength(2);
        expect(contexts[0]).toEqual({
            name: 'button',
            variables: { FOLDER: 'src/components/button/', INDEX: 'src/components/button/index.ts' },
        });
        expect(contexts[1]).toEqual({
            name: 'form',
            variables: { FOLDER: 'src/components/form/', INDEX: 'src/components/form/index.ts' },
        });
    });

    it('should adapt contextMatchFn to getContextListFn and map object return to Context', async () => {
        const inputCodeBasePaths = [
            { isDir: false, path: '/src/Button.ts' },
            { isDir: false, path: '/src/readme.md' },
            { isDir: false, path: '/src/Input.ts' },
        ];
        const receivedCodeBasePaths: typeof inputCodeBasePaths[] = [];
        const contextMatchFn: ContextMatchFn = ({ codeBasePath, codeBasePaths, lumpVariables }) => {
            receivedCodeBasePaths.push(codeBasePaths);
            expect(codeBasePaths).toBe(inputCodeBasePaths);
            if (!codeBasePath.path.endsWith('.ts')) return null;
            return {
                contextName: codeBasePath.path.replace(/^\/src\//, '').replace(/\.ts$/, ''),
                filePathVariableName: 'FILE',
                moreContextVariables: { EXTRA: (lumpVariables as { lang?: string }).lang ?? 'ts' },
                contextOptions: { priority: 1 },
            };
        };
        const data = assertSuccess(await resolveJsConf({
            getContextListFn: undefined,
            contextMatchFn,
            lumpVariables: { lang: 'typescript' },
        }));
        const contexts = await data.getContextListFn({
            codeBasePaths: inputCodeBasePaths,
            lumpVariables: { lang: 'typescript' },
        });
        expect(receivedCodeBasePaths).toHaveLength(3);
        expect(contexts).toHaveLength(2);
        expect(contexts).toEqual(expect.arrayContaining([
            {
                name: 'Button',
                variables: { FILE: '/src/Button.ts', EXTRA: 'typescript' },
                options: { priority: 1 },
            },
            {
                name: 'Input',
                variables: { FILE: '/src/Input.ts', EXTRA: 'typescript' },
                options: { priority: 1 },
            },
        ]));
    });

    it('should merge contextMatchFn matches that share a contextName into one context', async () => {
        const inputCodeBasePaths = [
            { isDir: false, path: '/src/Button.ts' },
            { isDir: false, path: '/src/Input.ts' },
        ];
        const contextMatchFn: ContextMatchFn = ({ codeBasePath }) => {
            if (!codeBasePath.path.endsWith('.ts')) return null;
            return {
                contextName: 'components',
                filePathVariableName: codeBasePath.path.includes('Button') ? 'BUTTON' : 'INPUT',
            };
        };
        const data = assertSuccess(await resolveJsConf({
            getContextListFn: undefined,
            contextMatchFn,
        }));
        const contexts = await data.getContextListFn({
            codeBasePaths: inputCodeBasePaths,
            lumpVariables: {},
        });
        expect(contexts).toHaveLength(1);
        expect(contexts[0]).toEqual({
            name: 'components',
            variables: {
                BUTTON: '/src/Button.ts',
                INPUT: '/src/Input.ts',
            },
        });
    });
});
