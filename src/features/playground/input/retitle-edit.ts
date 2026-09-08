/**
 * The document's own heading, rewritten as an edit to the SOURCE TEXT.
 *
 * ONE MODULE FOR EVERY NOTATION THAT OFFERS `retitle`, and that is the shape
 * of the ability rather than a convenience. `title` and `description` are the
 * SHARED header: the same two lines, with the same spelling, in all nine
 * grammars. So unlike `move` and `revise` — which address an element and
 * therefore need a module per notation that knows what an element is here —
 * this gesture addresses two lines whose form does not vary. A module per
 * notation would be the copy `dry.md` asks about, and asked what they would
 * have to do differently the answer is nothing.
 *
 * WHAT VARIES IS ONLY WHERE THE SPANS COME FROM, which is one `switch` on
 * `doc.kind` at the parse and one at the re-serialise. Everything between —
 * the patch, the insert, the refusals — is the same code for every notation.
 *
 * THE THREE RULES THE OTHER GESTURE MODULES STATE HOLD HERE UNCHANGED: one
 * model (nothing mutates; a gesture derives new text and re-parses it), an
 * edit is a LINE PATCH never a re-emit, and purity is load-bearing because the
 * check scripts load this through Node's type stripping.
 *
 * WHY A LINE PATCH FOR TWO LINES THAT LOOK TRIVIAL. `serialize*Text` writes
 * canonical text, so re-emitting a file to change its title deletes every `//`
 * comment and blank line in it — and passes every round-trip assertion while
 * doing it, because canonical text re-emitted IS canonical text. The header is
 * also where an author's `!` escapes and their own line order live, and none of
 * that survives a re-emit either.
 */

import type { DocumentHeaderSpans } from "@/features/archtext";
import {
  parseDictTextWithSpans,
  parseUseCaseTextWithSpans,
  serializeDictText,
  serializeUseCaseText,
} from "@/features/archtext";
// Deep but PURE imports — neither `input/parse.ts` exports a component, so
// this module stays loadable by the check scripts' type stripping.
import { parseDictInput } from "@/features/dict/input/parse";
import { parseUseCaseInput } from "@/features/usecase/input/parse";

import { canvasEditability } from "./canvas-edit";
import { applyPatches, type CanvasEdit, type LinePatch } from "./line-patch";
import type { ViewDocument } from "./parse";

/** The notations whose canvases draw a heading a reader can type into. */
type RetitleableDocument = Extract<ViewDocument, { kind: "usecase" | "dict" }>;

/**
 * The heading a reader has typed.
 *
 * `description` DISTINGUISHES ABSENT FROM EMPTY, which is the whole reason
 * this is not two string parameters. `undefined` means "leave the description
 * line exactly as it is"; `""` means "the reader cleared the field", which
 * REMOVES the line rather than writing `description ""`. The grammar has no
 * meaning for an empty description and the serializer omits the key, so
 * writing one would produce a document the canonical form does not contain.
 */
export interface RetitleFields {
  title?: string;
  description?: string;
}

/**
 * `doc` with its heading rewritten, or `null` when the edit cannot apply.
 *
 * AN EMPTY TITLE IS REFUSED. Every grammar requires one — "the file has no
 * title" is a parse error in all nine — so accepting a cleared title field
 * would write a document this repo's own parser rejects. The description has
 * no such floor, which is why the two are handled differently one line apart.
 */
export function retitledEdit(
  doc: ViewDocument,
  sourceText: string,
  fields: RetitleFields,
): CanvasEdit | null {
  if (!canvasEditability(doc, "retitle").editable) return null;
  if (doc.kind !== "usecase" && doc.kind !== "dict") return null;

  const title = fields.title;
  if (title !== undefined && title.trim() === "") return null;
  const description = fields.description;
  if (title === undefined && description === undefined) return null;

  const patchable = patchablePane(doc, sourceText);
  if (patchable === null) return null;
  const { header } = patchable;

  const patches: LinePatch[] = [];
  if (title !== undefined) {
    patches.push({
      span: { start: header.title, end: header.title },
      lines: [`title ${JSON.stringify(title)}`],
    });
  }

  if (description !== undefined) {
    const cleared = description.trim() === "";
    if (header.description !== undefined) {
      patches.push({
        span: { start: header.description, end: header.description },
        /* CLEARED MEANS THE LINE GOES, not `description ""`. An empty
           description is not a document the canonical form can contain — the
           serializer omits the key — so writing one would make the next save
           delete it anyway and the round trip disagree with the pane in
           between. `canvas-editing.md`'s hazard is the neighbour of this: a
           removal is not the inverse of an insert, and the verdict this
           gesture states is that clearing the field removes the line and
           leaves the header's other lines exactly where they were. */
        lines: cleared ? [] : [`description ${JSON.stringify(description)}`],
      });
    } else if (!cleared) {
      /* AN INSERT, AT THE CANONICAL SLOT — immediately after the title line,
         which is where `serialize*Text` writes a description and therefore
         where the next save would move it anyway. Appending after the LAST
         header line was tried and was worse on both counts: it put the
         description below the author's `owner` and `tags`, and the first
         format afterwards would hoist it back up, so the line moved twice for
         one edit.

         THE TITLE LINE IS ALWAYS A HEADER LINE, so inserting after it can
         never land inside the body — the parser's own rule is that header
         lines come before the first `@`, and the title is one of them. That
         is what makes this safe without consulting the header's extent. */
      patches.push({
        span: { start: header.title, end: header.title },
        lines: [
          sourceText.split("\n")[header.title - 1],
          `description ${JSON.stringify(description)}`,
        ],
      });
    }
  }
  if (patches.length === 0) return null;

  const patched = applyPatches(sourceText, patches);
  // A form submitted with nothing changed in it: no text change, no undo
  // entry, no re-render.
  if (patched === sourceText) return null;
  return adopt(doc, patched);
}

/**
 * Whether `sourceText` can be patched by line number for the document on
 * screen, and — when it can — the header spans that parse produced.
 *
 * Mermaid has no `.alab` line numbers to splice into, and THE PANE AND THE
 * CANVAS CAN DISAGREE: an edit is reachable while the pane holds text that
 * does not parse, and the keystroke debounce can leave a change un-parsed for
 * a moment. Agreement is MEASURED, by re-serialising both sides to the same
 * canonical bytes, rather than read off a flag that could lie.
 */
function patchablePane(
  doc: RetitleableDocument,
  sourceText: string,
): { header: DocumentHeaderSpans } | null {
  if (doc.format !== "alab") return null;
  try {
    if (doc.kind === "usecase") {
      const parsed = parseUseCaseTextWithSpans(sourceText);
      if (
        serializeUseCaseText(parsed.file) !== serializeUseCaseText(doc.file)
      ) {
        return null;
      }
      return { header: parsed.spans.header };
    }
    const parsed = parseDictTextWithSpans(sourceText);
    if (serializeDictText(parsed.file) !== serializeDictText(doc.file)) {
      return null;
    }
    return { header: parsed.spans.header };
  } catch {
    return null;
  }
}

/**
 * The patched text, re-parsed, as the new authority — a rendering of the text
 * rather than a model assembled beside it. `null` when the result will not
 * parse: that is a bug in this module rather than input to explain, and
 * dropping the edit beats replacing the reader's document with an error they
 * cannot act on.
 */
function adopt(doc: RetitleableDocument, patched: string): CanvasEdit | null {
  if (doc.kind === "usecase") {
    const parsed = parseUseCaseInput(patched);
    if (parsed.status !== "ok" || parsed.value.format !== "alab") return null;
    return {
      doc: { kind: "usecase", format: doc.format, file: parsed.value.file },
      text: patched,
      path: "patch",
    };
  }
  const parsed = parseDictInput(patched);
  if (parsed.status !== "ok" || parsed.value.format !== "alab") return null;
  return {
    doc: { kind: "dict", format: doc.format, file: parsed.value.file },
    text: patched,
    path: "patch",
  };
}
