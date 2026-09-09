/**
 * Describes how Lumpcode runs lumps against the user's git working copy.
 *
 * - `shared`: laptop rehearsal. `lumpcode run` commits and pushes the current
 *   branch in this checkout. `lumpcode start` is refused.
 * - `dedicated`: the current checkout is dedicated to Lumpcode (typically a
 *   worker). Lumpcode pulls, hard-resets, and cuts `lump/…` branches in place.
 */
export type Mode = 'shared' | 'dedicated';
