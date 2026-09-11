/**
 * Describes how Lumpcode runs lumps against the user's git working copy.
 *
 * - `shared`: the current checkout is the user's day-to-day workspace.
 *   `run` rehearses in place on the current named branch (no project copy,
 *   no `lump/…` branch, no auto commit or push).
 * - `dedicated`: the current checkout is dedicated to Lumpcode (typically a
 *   distant daemon machine). Lumpcode pulls and runs in place.
 */
export type Mode = 'shared' | 'dedicated';
