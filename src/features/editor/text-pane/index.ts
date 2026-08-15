/**
 * The editor's live model text pane — the `.alab` text of whatever is on the
 * canvas, editable, with parse errors as you type.
 *
 * The only export is the mount point: a props-free client component that
 * reads the editor store itself, so the shell decides
 * where it lives and nothing else. `./sync.ts` (model ⇄ text, through the
 * real parser, serializer and file reader) and `./draft.ts` (which side owns
 * the text right now) are pure and stay private to this directory.
 */

export { ModelTextPane } from "./model-text-pane";
