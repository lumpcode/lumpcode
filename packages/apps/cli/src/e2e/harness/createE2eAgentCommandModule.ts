export const E2E_MOCK_AGENT_SCRIPT_BASENAME = 'e2e-mock-agent.cjs';

/** CJS script invoked as `node e2e-mock-agent.cjs <contextName>` (avoids fragile `node -e` on Windows). */
export function createE2eMockAgentScript(input: {
    lumpName: string;
    writeWorkspaceCwd?: boolean;
}): string {
    const markerDir = `.lumpcode/e2e-markers/${input.lumpName}`;
    const writeCwd = input.writeWorkspaceCwd
        ? `fs.writeFileSync('${markerDir}/workspace-cwd.txt', process.cwd());\n`
        : '';
    return `'use strict';
const fs = require('node:fs');
const contextName = process.argv[2];
const markerDir = '${markerDir}';
fs.mkdirSync(markerDir, { recursive: true });
${writeCwd}fs.writeFileSync(\`\${markerDir}/\${contextName}.done\`, '');
`;
}

function e2eMockAgentScriptPathExpr(input: { lumpName: string; relativeTo: 'lump' | 'commands' }): string {
    const script = `./${E2E_MOCK_AGENT_SCRIPT_BASENAME}`;
    if (input.relativeTo === 'lump') {
        return `fileURLToPath(new URL('${script}', import.meta.url))`;
    }
    return `fileURLToPath(new URL('../lumps/${input.lumpName}/${E2E_MOCK_AGENT_SCRIPT_BASENAME}', import.meta.url))`;
}

function e2eMockAgentCommandFnBody(input: { scriptPathExpr: string }): string {
    return `({ context }) => ({
  executable: process.env.LUMPCODE_E2E_NODE || 'node',
  args: [${input.scriptPathExpr}, context.name],
})`;
}

/** Inline `command` fn for lump `config.js` (Node mock agent, no shell). */
export function inlineE2eMockAgentCommandFn(input: {
    lumpName: string;
    writeWorkspaceCwd?: boolean;
}): string {
    return e2eMockAgentCommandFnBody({
        scriptPathExpr: e2eMockAgentScriptPathExpr({ lumpName: input.lumpName, relativeTo: 'lump' }),
    });
}

/** Source of a command module that writes an e2e completion marker instead of calling a real agent. */
export function createE2eAgentCommandModule(input: { lumpName: string }): string {
    return `import { fileURLToPath } from 'node:url';

export const command = ${e2eMockAgentCommandFnBody({
        scriptPathExpr: e2eMockAgentScriptPathExpr({ lumpName: input.lumpName, relativeTo: 'commands' }),
    })};

export const setup = () => ({ contextRunState: { e2eRan: true } });

export const teardown = () => {};
`;
}

/** Default inline `config.ts` body for E2E lumps using the preset e2e agent command. */
export function defaultE2eTsLumpConfig(input: {
    command?: string;
    extraFields?: string;
} = {}): string {
    const command = input.command ?? 'e2e-agent';
    const extra = input.extraFields ? `\n  ${input.extraFields}` : '';
    return `export default {
  contextListJson: { NAME: '{NAME}.md' },
  prompt: { promptTemplate: 'E2E @{NAME}', command: '${command}' },
  numberOfContextsPerBranch: 1,${extra}
};`;
}

/** Default lump `config.json` body: README contexts, one per branch, wired to the e2e agent command. */
export function defaultE2eLumpConfigJson(input: { command?: string } = {}): Record<string, unknown> {
    return {
        baseBranch: 'main',
        contextListJson: { NAME: '{NAME}.md' },
        prompt: { promptTemplate: 'E2E @{NAME}', command: input.command ?? 'e2e-agent' },
        numberOfContextsPerBranch: 1,
    };
}
