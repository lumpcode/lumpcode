import camelCase from "lodash/camelCase";
import kebabCase from "lodash/kebabCase";
import snakeCase from "lodash/snakeCase";
import toLower from "lodash/toLower";
import upperFirst from "lodash/upperFirst";

import { Context, GetContextListFn } from "@lumpcode/core";

import type { ContextOptionsFn } from "../../types/ContextOptionsFn";
import { extractPattern, ExtractPatternModifiers } from "../extractPattern";

/** Strips a leading `./` or `.\` so templates match `path.relative`-style paths from the scanner. */
const normalizeForTemplateMatch = (p: string): string => {
    if (p.startsWith("./") || p.startsWith(".\\")) {
        return p.slice(2);
    }
    return p;
};

export type MakeGetContextListFnFromTemplateInput = Parameters<typeof makeGetContextListFnFromTemplate>;

export type MakeGetContextListFnFromTemplateOutput = GetContextListFn;

export function makeGetContextListFnFromTemplate(
    jsonTemplate: Record<string, string>,
    modifiers: ExtractPatternModifiers | undefined = {
        upperFirst,
        kebabCase,
        snakeCase,
        lowerCase: toLower,
        camelCase,
        pascalCase: x => upperFirst(camelCase(x)),
    },
    contextOptionsFn?: ContextOptionsFn,
): MakeGetContextListFnFromTemplateOutput {
    const retFn: GetContextListFn = ({ codeBasePaths }) => {
        const allContexts: Record<string, Context> = {};

        for (const codeBasePath of codeBasePaths) {
            let { path, isDir } = codeBasePath;
            path = normalizeForTemplateMatch(path);

            if (isDir && !path.endsWith("/")) {
                path = path + "/";
            }

            for (const key in jsonTemplate) {
                const pathPattern = normalizeForTemplateMatch(jsonTemplate[key]);
                const extractedRaw = extractPattern(pathPattern, path, modifiers);
                const extracted = extractedRaw;

                const extractedEntries = Object.entries(extracted);

                if (extractedEntries.length > 0) {
                    const contextName = extractedEntries.reduce((acc, [,ctxName]) => (
                        acc + (acc ? "-" : "") + ctxName
                    ), "");
                    let allContextsEntry = allContexts[contextName];
                    if (!allContextsEntry) {
                        allContextsEntry = {
                            name: contextName,
                            variables: {},
                        };
                        allContexts[contextName] = allContextsEntry;
                    }
                    allContextsEntry.variables[key] = path;
                }
            }
        }

        const list = Object.values(allContexts).sort((a, b) => (
            a.name.localeCompare(b.name) ? 1 : -1
        ));

        if (!contextOptionsFn) {
            return list;
        }

        return Promise.all(
            list.map(async (ctx) => {
                const opts = await contextOptionsFn({
                    name: ctx.name,
                    variables: ctx.variables,
                });
                if (opts == null) {
                    return ctx;
                }
                return { ...ctx, options: { ...ctx.options, ...opts } };
            }),
        );
    };

    return retFn;
}