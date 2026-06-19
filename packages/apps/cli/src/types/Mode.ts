/**
 * Describes how Lumpcode runs lumps against the user's git working copy.
 *
 * - `shared`: the current checkout is the user's day-to-day workspace.
 *   Lumpcode never touches it; runs happen in a separate copy under
 *   `<globalConfigFolderPath>/project-copies/<projectName>/`.
 * - `dedicated`: the current checkout is dedicated to Lumpcode (typically a
 *   distant daemon machine). Lumpcode pulls and runs in place.
 */
export type Mode = 'shared' | 'dedicated';
