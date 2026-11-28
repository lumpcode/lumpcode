import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// Skipped until the impl stage updates the schemas. Unskip; do not rewrite.
describe.skip('desc.yml schemas', () => {
    it('gives featureBacklog stages and a deprecated workflow alias', async () => {
        const schema = await readSchema('featureBacklogDesc.schema.json');

        expect(schema.properties.stages?.type).toBe('array');
        expect(schema.properties.stages?.items?.enum).toEqual([
            'req',
            'manualReq',
            'testPlan',
            'testImpl',
            'impl',
            'directImpl',
        ]);
        expect(schema.properties.workflow?.deprecated).toBe(true);
        expect(schema.properties.workflow?.description).toMatch(/stages/);
    });

    it('gives the generic backlog schema stages and a deprecated workflow alias', async () => {
        const schema = await readSchema('backlogDesc.schema.json');

        expect(schema.properties.stages?.type).toBe('array');
        expect(schema.properties.workflow?.deprecated).toBe(true);
        expect(schema.properties.workflow?.description).toMatch(/stages/);
    });
});

async function readSchema(name: string): Promise<{
    properties: {
        stages?: { type?: string; items?: { enum?: string[] } };
        workflow?: { deprecated?: boolean; description?: string };
    };
}> {
    const schemaPath = path.join(
        path.dirname(fileURLToPath(import.meta.url)),
        '../../schemas',
        name,
    );
    return JSON.parse(await readFile(schemaPath, 'utf-8')) as {
        properties: {
            stages?: { type?: string; items?: { enum?: string[] } };
            workflow?: { deprecated?: boolean; description?: string };
        };
    };
}
