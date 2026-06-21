import { createRequire } from 'node:module';

const requireEsbuild = createRequire(import.meta.url);
const actualEsbuild = requireEsbuild('esbuild') as typeof import('esbuild');

export const build: typeof actualEsbuild.build = (...args) => actualEsbuild.build(...args);

export default actualEsbuild;
