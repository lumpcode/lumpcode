import { afterEach } from 'vitest';

import type { E2eProject } from './createE2eProject';
import { createE2eProject, destroyE2eProject } from './createE2eProject';
import { assertHomeIsolated, stopDaemonSafely } from './daemonHelpers';
import { runE2eCli } from './e2eCli';

/**
 * Vitest hook that registers e2e projects for teardown after each test.
 * Optionally stops a running daemon before deleting temp directories.
 */
export function useE2eProjects(input: { stopDaemonOnTeardown?: boolean } = {}) {
    const projects: E2eProject[] = [];

    afterEach(async () => {
        for (const project of projects) {
            if (input.stopDaemonOnTeardown) {
                await stopDaemonSafely({
                    project,
                    runCli: (args) => runE2eCli({ project, args }),
                });
            }
            await destroyE2eProject(project);
        }
        projects.length = 0;
    });

    /** Registers an existing project for automatic teardown after each test. */
    function track(project: E2eProject): E2eProject {
        assertHomeIsolated(project);
        projects.push(project);
        return project;
    }

    /** Creates a temporary Lumpcode project and registers it for teardown after each test. */
    async function createProject(input: Parameters<typeof createE2eProject>[0]): Promise<E2eProject> {
        return track(await createE2eProject(input));
    }

    return { createProject, track };
}
