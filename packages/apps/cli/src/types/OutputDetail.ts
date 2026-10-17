/** Live-feed loudness for agent session presenters. Not a core type. */
export type OutputDetail = 'loud' | 'quiet';

/** Optional `outputDetail` on lump or step variable bags. */
export type OutputDetailVariables = {
    outputDetail?: OutputDetail;
};
