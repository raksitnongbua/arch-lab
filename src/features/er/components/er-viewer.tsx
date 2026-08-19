"use client";

/**
 * The mounted ER canvas — what `/view` renders once the pane's text has
 * parsed as an ER document.
 *
 * THIN ON PURPOSE, where `UseCaseViewer` is not. That viewer carries a focus
 * panel because a use case has a description a reader wants revealed on
 * click. An ER diagram already draws its detail: every column, its type and
 * its key roles are on the box. The one thing the canvas cannot show is a
 * `desc`, and it is shown as a native tooltip via `<title>` inside the
 * diagram rather than as a panel that would cover the schema the reader is
 * trying to read.
 *
 * A CLIENT COMPONENT only because it announces to the live region; the
 * DIAGRAM below it is pure and server-renderable, which is what lets the
 * crawlable example pages at `/view/er/[exampleId]` ship the whole SVG in
 * their HTML. `check:seo` cares about that — an AI crawler does not run
 * JavaScript, so a client-painted diagram is invisible to one.
 */

import { useEffect } from "react";

import type { ErLabFile } from "@/types";

import { ErDiagram } from "./er-diagram";

export interface ErViewerProps {
  file: ErLabFile;
  onAnnounce?: (message: string) => void;
}

export function ErViewer({
  file,
  onAnnounce,
}: ErViewerProps): React.JSX.Element {
  const entities = file.entities?.length ?? 0;
  const relationships = file.relationships?.length ?? 0;

  useEffect(() => {
    onAnnounce?.(
      `ER diagram rendered: ${entities} ${entities === 1 ? "entity" : "entities"}, ${relationships} ${relationships === 1 ? "relationship" : "relationships"}.`,
    );
  }, [entities, relationships, onAnnounce]);

  return (
    <div className="h-full w-full overflow-auto p-4">
      <ErDiagram file={file} className="mx-auto max-w-full" />
    </div>
  );
}
