"use client";

/**
 * The mounted dictionary canvas.
 *
 * NO FOCUS MODE, and that is a decision rather than an omission. Focus exists
 * on the other canvases to answer "what is this connected to" — a question a
 * dictionary cannot ask, because it has no connections. Every fact a
 * dictionary holds is already ON the row: the name, the type, the flags, the
 * meaning, the provenance, the legal values, an example. There is nothing left
 * for a panel to reveal, so a panel would be a second copy of the row.
 *
 * A client component only for the live region; `DictDiagram` is pure and
 * server-renderable, which is what lets the crawlable pages ship the whole
 * table in their HTML. That matters more for this kind than any other — a
 * reference document a search engine cannot read is a reference nobody finds.
 */

import { useEffect, useMemo } from "react";

import type { DictLabFile } from "@/types";

import { DictDiagram } from "./dict-diagram";

export interface DictViewerProps {
  file: DictLabFile;
  onAnnounce?: (message: string) => void;
}

export function DictViewer({
  file,
  onAnnounce,
}: DictViewerProps): React.JSX.Element {
  const sections = useMemo(() => file.sections ?? [], [file]);
  const fields = useMemo(
    () => sections.reduce((sum, section) => sum + section.fields.length, 0),
    [sections],
  );

  useEffect(() => {
    onAnnounce?.(
      `Data dictionary rendered: ${sections.length} ${sections.length === 1 ? "section" : "sections"}, ${fields} ${fields === 1 ? "field" : "fields"}.`,
    );
  }, [sections.length, fields, onAnnounce]);

  return (
    <div className="h-full w-full overflow-auto p-4">
      <DictDiagram file={file} className="mx-auto max-w-full" />
    </div>
  );
}
