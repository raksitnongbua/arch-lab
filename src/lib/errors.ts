/**
 * Turning an unknown thrown value into something worth showing a person.
 *
 * `catch` binds `unknown`, so every reporting path has to narrow before it can
 * read `.message`. Six places were doing that inline, and they had not stayed
 * identical: most fell back to `String(error)`, one to the literal
 * `"unknown error"`, and only one guarded the empty message — so the same
 * failure could surface as a useful sentence on one screen and as a bare
 * `"Error"` on another.
 */

/**
 * The most useful message available for a thrown value.
 *
 * An `Error` with something to say gives up its `message`; anything else is
 * stringified, which is what surfaces a thrown string or number rather than
 * hiding it behind a generic sentence. The empty-message guard matters more
 * than it looks: `String(new Error(""))` is `"Error"`, which tells a reader
 * nothing, so an empty message is treated as no message.
 */
export function describeError(error: unknown): string {
  if (error instanceof Error && error.message !== "") return error.message;
  return String(error);
}
