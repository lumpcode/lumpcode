export const contextStatus = ['toDo', 'branchPushed', 'finished'] as const;

export type ContextStatus = (typeof contextStatus)[number];