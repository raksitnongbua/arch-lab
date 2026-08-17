/**
 * `UseCaseLabFile` → Mermaid code in the use-case convention: the reverse of
 * `./usecase.ts`, sitting beside `./flowchart-emit.ts` as the emitting half
 * of the fourth dialect. Both directions read the SAME tables
 * (`./usecase-mapping.ts`), so what this writes is by construction what the
 * importer reads back — including through `detectMermaidUseCase`, whenever
 * the model has an actor, a use case and a boundary.
 *
 * WHAT MERMAID CANNOT HOLD, and therefore what this drops or approximates —
 * the same honesty contract as the other export caveats, stated by
 * `MERMAID_USECASE_EXPORT_CAVEAT`:
 *
 *   - The STICK FIGURE. Mermaid has no actor symbol; an actor draws as the
 *     `((circle))` the convention uses, and only the convention says it is
 *     a person.
 *   - GENERALIZATION has no notation — no hollow triangle exists — so it is
 *     written as the solid arrow labelled `|generalizes|`, the closed word
 *     the importer maps back. A reader sees a labelled arrow, not a
 *     triangle.
 *   - STEREOTYPES become edge labels: «include»/«extend» ride the dashed
 *     arrow as `|include|`/`|extend|`, with no guillemets.
 *   - An association is UNDIRECTED and stays so: it writes as `---`, the
 *     one Mermaid link with no arrowhead.
 *   - `description`, `[technology]` and `#tag`s on an element, a boundary's
 *     `tint`, and everything the `.alab` header carries beyond the title.
 *     Same reasoning as the flowchart emitter, unchanged.
 *   - An EMPTY association label (`: ""`) writes as no label at all; empty
 *     and absent are one spelling in Mermaid's pipe form.
 *
 * Nothing else is lost: every element keeps its kind and label, every
 * boundary becomes a subgraph around the same contiguous run, every edge
 * keeps its kind, ends and order, and the title survives (as frontmatter).
 *
 * Deterministic — identical models always produce identical text, iteration
 * follows the model's own order, and `parseMermaidUseCase(serialize(file))`
 * reproduces everything above the loss line (`scripts/mermaid-check.mjs`
 * pins that round trip).
 *
 * Imported by `scripts/mermaid-check.mjs` through Node's type stripping:
 * keep the syntax erasable and type-only imports as `import type`.
 */

import type { UseCaseBoundary, UseCaseElement, UseCaseLabFile } from "@/types";

import { escapeMermaidString, mermaidPipeLabel, mermaidSafeId } from "./text";
import type { MermaidFlowchartDirection } from "./flowchart-mapping";
import {
  BRACKETS_BY_ELEMENT_KIND,
  MERMAID_ASSOCIATION_LINK,
  MERMAID_DEPENDENCY_ARROW,
  MERMAID_GENERALIZATION_ARROW,
  MERMAID_GENERALIZATION_LABEL,
} from "./usecase-mapping";

/** What an EXPORT to Mermaid drops. The mirror of `MERMAID_USECASE_CAVEAT`,
 * which describes the trip the other way. */
export const MERMAID_USECASE_EXPORT_CAVEAT =
  "Mermaid has no use-case diagram, so export writes the flowchart " +
  "convention for one and loses what that convention cannot draw: an actor " +
  "has no stick figure and draws as a ((circle)), a generalization has no " +
  "notation and is written as a solid arrow labelled |generalizes|, " +
  "«include»/«extend» stereotypes become |include|/|extend| labels on a " +
  "dashed arrow, and an element's desc detail, [technology] and #tags, a " +
  "boundary's tint, and every header field except the title (description, " +
  "owner, tags, timestamps) have no Mermaid equivalent and are left " +
  "behind. Ids outside Mermaid's safe alphabet are renamed, and an empty " +
  "association label comes back as no label. Everything else survives: " +
  "every actor and use case with its label, every boundary as a subgraph, " +
  "every edge with its kind and order (an association as the undirected " +
  "---), and the title (as frontmatter).";

export interface SerializeMermaidUseCaseOptions {
  /** The layout word written after `flowchart`. An option, not model data,
   * for the flowchart emitter's reason. Default `"LR"`, not the flowchart
   * emitter's `"TD"`: a use-case diagram reads as an actor column against
   * the system box, which is a left-to-right composition — and LR is how
   * the documents this convention was learned from are written. */
  direction?: MermaidFlowchartDirection;
}

const INDENT = "    ";

/** The shared substitution rule (see `mermaidSafeId`); `u_` = use-case
 * element. */
function mermaidId(id: string): string {
  return mermaidSafeId(id, "u_");
}

/** An element's kind and label as one token: the bracket pair from the
 * shared table around an always-quoted label — quoting every label costs
 * nothing and closes the bracket-in-label ambiguity for good. */
function elementToken(element: UseCaseElement): string {
  const [open, close] = BRACKETS_BY_ELEMENT_KIND[element.kind];
  return `${mermaidId(element.id)}${open}"${escapeMermaidString(element.label)}"${close}`;
}

/**
 * Serializes a `UseCaseLabFile` to Mermaid code in the use-case convention.
 * Pure and deterministic. Throws a plain `Error` only for a model no
 * use-case validator would pass anyway (a boundary whose members are not a
 * contiguous run of `elements`, or an actor claimed by a boundary) — the
 * same contract as the `.alab` serializer, which refuses the same models
 * for the same reasons.
 */
export function serializeMermaidUseCase(
  file: UseCaseLabFile,
  options?: SerializeMermaidUseCaseOptions,
): string {
  const lines: string[] = [];

  /* Mermaid's flowchart grammar has no title keyword; YAML frontmatter is
     where a title lives. JSON-quoted, which is valid YAML and exactly what
     the importer reads back. */
  const title = file.metadata.title;
  if (typeof title === "string" && title !== "") {
    lines.push("---", `title: ${JSON.stringify(title)}`, "---");
  }
  lines.push(`flowchart ${options?.direction ?? "LR"}`);

  /* ------------------------------ elements ------------------------------ */
  /* Walked in model order with boundaries opened as their first member is
     reached — the same drive-from-the-array rule every emitter in this
     repo follows, because `elements` IS the declaration order. */
  const boundaries = file.boundaries ?? [];
  const boundaryByMember = new Map<string, UseCaseBoundary>();
  for (const boundary of boundaries) {
    for (const id of boundary.usecases) boundaryByMember.set(id, boundary);
  }
  const opened = new Set<UseCaseBoundary>();
  let open: UseCaseBoundary | null = null;
  for (const element of file.elements) {
    const boundary = boundaryByMember.get(element.id) ?? null;
    if (boundary !== null && element.kind !== "usecase") {
      /* The importer refuses an actor inside a subgraph (the boundary IS
         the system's edge), so the unspellable model is refused here rather
         than written as text this dialect then rejects — the `.alab`
         serializer's rule, at the Mermaid gate. */
      throw new Error(
        `serializeMermaidUseCase: element "${element.id}" is an actor claimed by the boundary ${JSON.stringify(boundary.label)} — an actor stands outside the system's edge, and the subgraph this would write is one the importer refuses`,
      );
    }
    if (boundary !== open) {
      if (open !== null) lines.push(`${INDENT}end`);
      open = boundary;
      if (boundary !== null) {
        if (opened.has(boundary)) {
          throw new Error(
            `serializeMermaidUseCase: the boundary ${JSON.stringify(boundary.label)} is not a contiguous run of elements ("${element.id}" is outside it) — a Mermaid subgraph cannot spell that, and neither can .alab`,
          );
        }
        opened.add(boundary);
        lines.push(
          `${INDENT}subgraph sg${boundaries.indexOf(boundary) + 1} ["${escapeMermaidString(boundary.label)}"]`,
        );
      }
    }
    lines.push(
      `${INDENT}${boundary === null ? "" : INDENT}${elementToken(element)}`,
    );
  }
  if (open !== null) lines.push(`${INDENT}end`);

  /* ------------------------------- edges -------------------------------- */
  /* One spelling per kind, straight off the shared tables; the stereotype
     rides bare (a closed vocabulary needs no quoting). */
  for (const edge of file.edges) {
    const from = mermaidId(edge.from);
    const to = mermaidId(edge.to);
    switch (edge.kind) {
      case "association":
        lines.push(
          `${INDENT}${from} ${MERMAID_ASSOCIATION_LINK}${mermaidPipeLabel(edge.label)} ${to}`,
        );
        break;
      case "dependency":
        lines.push(
          `${INDENT}${from} ${MERMAID_DEPENDENCY_ARROW}|${edge.stereotype}| ${to}`,
        );
        break;
      case "generalization":
        lines.push(
          `${INDENT}${from} ${MERMAID_GENERALIZATION_ARROW}|${MERMAID_GENERALIZATION_LABEL}| ${to}`,
        );
        break;
    }
  }

  return `${lines.join("\n")}\n`;
}
