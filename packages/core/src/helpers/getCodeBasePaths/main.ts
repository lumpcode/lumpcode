import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import ignore from 'ignore';

import { createConsoleLogger, failure, success } from '../../utils';
import { CodeBasePath, Logger } from '../../types';

export async function getCodeBasePaths({
    cwd,
    logger: loggerInput,
}: { 
    cwd: string,
    logger?: Logger,
}) {
    const logger = loggerInput ?? createConsoleLogger({});
    const allPaths: CodeBasePath[] = [];
    const gitignoresMap = await getGitignoresMap({ startDir: cwd, stopAtDir: cwd });
    
    try {
        await scanDirectory({
            dirPath: cwd,
            allPaths,
            gitignoresMap,
            projectRoot: cwd,
            logger,
        });
    } catch (error) {
        return failure({
            message: `Failed to scan directory: ${error}`,
        });
    }

    return success(allPaths);
}

async function getGitignoresMap({
    startDir,
    stopAtDir
}: {
    startDir: string,
    stopAtDir: string
}): Promise<GitignoresMap> {
    const gitignores: GitignoresMap = new Map();
    let currentDir = startDir;
    const stopAtDirParent = path.dirname(stopAtDir);

    while (currentDir !== stopAtDirParent) {
        const gitignorePath = path.join(currentDir, '.gitignore');
        const hasGitignore = await fs.access(gitignorePath).then(() => true).catch(() => false);

        if (hasGitignore) {
            const gitignoreContent = await fs.readFile(gitignorePath, 'utf-8');
            gitignores.set(currentDir, ignore().add(gitignoreContent));
        }

        currentDir = path.dirname(currentDir);
    }

    return gitignores;
}

async function scanDirectory(
    { dirPath, allPaths, gitignoresMap, projectRoot, logger }: 
    { 
        dirPath: string,
        allPaths: CodeBasePath[],
        gitignoresMap: GitignoresMap,
        projectRoot: string,
        logger: Logger,
    }
) {
    try {
        const items = await fs.readdir(dirPath);
        
        for (const item of items) {
            const itemPath = path.join(dirPath, item);
            
            try {
                const stat = await fs.stat(itemPath);
                
                let shouldIgnore = false;
                
                for (const [gitignoreDir, gitignoreInstance] of gitignoresMap) {
                    const relativePathFromGitignore = path.relative(gitignoreDir, itemPath);
                    const isIgnored = gitignoreInstance.ignores(relativePathFromGitignore);
                    if (isIgnored) {
                        shouldIgnore = true;
                        break;
                    }
                }
                
                if (shouldIgnore) {
                    continue;
                }
                
                allPaths.push({
                    path: path.relative(projectRoot, itemPath),
                    isDir: stat.isDirectory(),
                });
                
                if (stat.isDirectory()) {
                    await scanDirectory({
                        dirPath: itemPath,
                        allPaths,
                        gitignoresMap,
                        projectRoot,
                        logger,
                    });
                }
            } catch (error) {
                logger.warn(`Cannot access ${itemPath}: ${error}`);
            }
        }
    } catch (error) {
        throw new Error(`Cannot read directory ${dirPath}: ${error}`);
    }
}

type GitignoresMap = Map<string, ignore.Ignore>;
