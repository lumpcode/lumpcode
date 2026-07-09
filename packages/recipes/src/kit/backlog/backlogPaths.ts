import path from 'path';

export function backlogPaths(lumpName: string) {
    const lumpDir = path.join('.lumpcode', 'lumps', lumpName);
    return {
        lumpDir,
        backlogPath: path.join(lumpDir, 'BACKLOG.yml'),
        donePath: path.join(lumpDir, 'DONE.yml'),
        prdDir: path.join(lumpDir, 'prds'),
        testPlanDir: path.join(lumpDir, 'testPlans'),
    };
}
