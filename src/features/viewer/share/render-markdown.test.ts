import { describe, expect, it } from "vitest";

import { buildRenderMarkdown } from "./render-markdown";

const BASE = {
  origin: "https://arch-lab.example",
  fragment: "m=AF1.abc123",
  shareUrl: "https://arch-lab.example/live#m=AF1.abc123",
  theme: "blueprint" as const,
  iconStyle: "colour" as const,
  title: "Notification Email Platform",
};

describe("buildRenderMarkdown", () => {
  it("wraps the render image in a link to the share URL", () => {
    expect(buildRenderMarkdown(BASE)).toBe(
      "[![Notification Email Platform]" +
        "(https://arch-lab.example/api/render?m=AF1.abc123&t=blueprint&i=colour)]" +
        "(https://arch-lab.example/live#m=AF1.abc123)\n",
    );
  });

  /**
   * The payload has to be REUSED, not re-encoded — this is what keeps the
   * image and the link showing the same diagram with the same lifetime. A
   * second `encodeShareFragment` call would mint a second expiry, and a sharer
   * who asked for an hour would hand over markdown whose picture outlived the
   * link around it.
   */
  it("carries the diagram and expiry from the fragment verbatim", () => {
    const markdown = buildRenderMarkdown({
      ...BASE,
      fragment: "m=AF1.abc123&d=cnt-notify&exp=1789000000&sig=Zm9v",
    });
    expect(markdown).toContain(
      "/api/render?m=AF1.abc123&d=cnt-notify&exp=1789000000&sig=Zm9v&t=",
    );
  });

  /**
   * `]` ends the alt text at the first unescaped one, so a title carrying a
   * bracket would truncate the alt and spill the rest as stray text beside the
   * image. Escaped rather than stripped: a title is the author's own words.
   */
  it("escapes brackets in the title rather than dropping them", () => {
    const markdown = buildRenderMarkdown({
      ...BASE,
      title: "Payments [v2] rollout",
    });
    expect(markdown.startsWith("[![Payments \\[v2\\] rollout](")).toBe(true);
  });

  /** The reader's own two choices are the only thing this adds to the URL. */
  it("names the theme and the icon style it was copied under", () => {
    const markdown = buildRenderMarkdown({
      ...BASE,
      theme: "eink",
      iconStyle: "mono",
    });
    expect(markdown).toContain("&t=eink&i=mono)");
  });

  /** Origin is passed in, never assumed — the deploy rules forbid a hardcoded
   * host, and a shipped bug already came from one. */
  it("builds against the origin it is given", () => {
    const markdown = buildRenderMarkdown({
      ...BASE,
      origin: "http://localhost:3000",
    });
    expect(markdown).toContain("(http://localhost:3000/api/render?");
  });
});
