/**
 * What a Mermaid C4 import actually cost THIS document.
 *
 * THE CAVEAT WAS GENERIC PROSE. Every successful Mermaid import said the same
 * sentence — "boundaries become tags, and SystemDb / SystemQueue lose their
 * styling" — whether or not the document had a boundary or a `SystemDb` in it,
 * and whether or not the loss actually occurred. So a reader whose file lost
 * nothing was warned about damage that did not happen, and a reader whose file
 * lost five boundaries got exactly the same sentence as one that lost none. A
 * warning that cannot distinguish those two is a warning people learn to skip,
 * which is worse than not warning at all, because the one time it matters they
 * have already stopped reading it.
 *
 * The person who asked for a diagram cannot see what is missing from it. This
 * is the list.
 *
 * WHY THE LOSS IS CONDITIONAL AND SO MUST BE COUNTED, NOT ASSUMED. A
 * `ContainerDb` at container level keeps its shape — `database` is a native type
 * there. The identical `SystemDb` at CONTEXT level cannot: `database` is not
 * valid at that level, so `toNodeType` falls back to a software system and
 * records the shape as a tag. Same Mermaid keyword, same importer, opposite
 * outcome, decided by the diagram level. Nothing short of reading the imported
 * model can tell them apart, which is exactly why the old sentence hedged and
 * covered both.
 *
 * READ FROM THE MODEL, never from the source text. The importer is the thing
 * that decides; a second reading of the Mermaid would be a second implementation
 * of `toNodeType`'s level rules, and the two would disagree on the case that
 * matters. The tags this counts are the ones the importer writes precisely
 * BECAUSE the information had nowhere else to go — they are the receipt.
 */

import type { ArchLabFile, C4Node } from "@/types";

import { readMermaidExtension } from "./toModel";

/** One thing the import changed, with how much of it there was. */
export interface LedgerEntry {
  count: number;
  /** One line, naming what happened and whether it can be got back. */
  message: string;
}

function countNodes(
  file: ArchLabFile,
  predicate: (node: C4Node) => boolean,
): number {
  return file.diagrams.reduce(
    (total, diagram) => total + diagram.nodes.filter(predicate).length,
    0,
  );
}

/**
 * Everything this import changed about this document, or an empty list.
 *
 * EMPTY IS THE ANSWER FOR MOST FILES and it is worth saying out loud rather
 * than falling silent: "nothing in this document was affected" is the sentence
 * that makes the non-empty case believable.
 */
export function mermaidImportLedger(file: ArchLabFile): LedgerEntry[] {
  const entries: LedgerEntry[] = [];

  /* The module's own tolerant reader rather than a cast: it is the one place
     that knows what a well-formed extension looks like, and a cast here would
     be a second opinion that cannot be wrong out loud. */
  const extension = readMermaidExtension(file);
  const boundaries = Object.values(extension?.boundaries ?? {}).reduce(
    (total, list) => total + list.length,
    0,
  );
  if (boundaries > 0) {
    entries.push({
      count: boundaries,
      message:
        `${boundaries} boundary/boundaries became a \`boundary:<id>\` tag on ` +
        "each member. The grouping still draws — arch-lab reads those tags as " +
        "frames — and the original tree is kept under `x-mermaid`, so saving " +
        "as .alab or arch-lab JSON does not lose it.",
    });
  }

  /* THE TAG IS THE RECEIPT. `toNodeType` adds a bare `database` or `queue` tag
     only on the path where the variant could NOT claim its native type — so
     counting the tag counts the demotions exactly, and a `ContainerDb` at
     container level, which keeps `type: "database"` and gets no tag at all, is
     correctly not counted.

     THE `type !== shape` GUARD IS REDUNDANT TODAY and is kept deliberately.
     The importer cannot produce a node that both IS a database and is TAGGED
     one, so counting the tag alone would give the same answer — a mutation
     removing the guard changes no result and no check catches it, which is
     worth saying rather than leaving as a puzzle. It stays because it makes
     the predicate say what it MEANS ("declared one, not drawn as one")
     independently of that invariant, and `check:mermaid` asserts the invariant
     separately so the redundancy can be relied on rather than assumed. */
  for (const shape of ["database", "queue"] as const) {
    const demoted = countNodes(
      file,
      (node) => node.type !== shape && (node.tags?.includes(shape) ?? false),
    );
    if (demoted === 0) continue;
    entries.push({
      count: demoted,
      message:
        `${demoted} element(s) declared as a ${shape} are not drawn as one — ` +
        `\`${shape}\` is not a valid type at this diagram's level, so the ` +
        `shape is carried as a \`${shape}\` tag instead. Moving them to a ` +
        "container-level diagram draws them properly.",
    });
  }

  return entries;
}

/**
 * The ledger as the paragraph a caller prints, given the caveat that opens it.
 *
 * The caveat stays FIRST and unchanged: it is what the import is, and the
 * ledger is what it did. Splitting them lets the general statement keep being
 * general while the specifics stop being guesses.
 */
export function renderMermaidLedger(file: ArchLabFile, caveat: string): string {
  const entries = mermaidImportLedger(file);
  if (entries.length === 0) {
    return `Note: ${caveat}\n  Nothing in this document was affected by any of that.`;
  }
  return [
    `Note: ${caveat}`,
    "  In this document:",
    ...entries.map((entry) => `  - ${entry.message}`),
  ].join("\n");
}
