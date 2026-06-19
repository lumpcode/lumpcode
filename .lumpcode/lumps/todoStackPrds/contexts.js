import path from 'path';
import { fileURLToPath } from 'url';
import { loadPendingTodoStackContexts } from './parseTodoStack.js';

const lumpDir = path.dirname(fileURLToPath(import.meta.url));
const lumpName = path.basename(lumpDir);

export default async function getContextListFn() {
    return loadPendingTodoStackContexts({ lumpDir, lumpName });
}
