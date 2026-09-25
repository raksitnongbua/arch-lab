/**
 * The site's primary navigation, as data.
 *
 * ── A SERVER-SAFE MODULE ON PURPOSE, AND THIS ONE WAS BOUGHT ──────────────
 *
 * It lived in `components/layout/header.tsx`, which is `"use client"`. That
 * worked for the header, which is in the client graph, and BROKE `/mcp` in
 * production the moment a Server Component read it: the RSC bundler replaces
 * every export of a `"use client"` module with a client-reference stub, so
 * `NAV_LINKS` arrived on the server as a THROWING FUNCTION rather than an
 * array, and `NAV_LINKS.map` was not a function.
 *
 * Nothing caught it. TypeScript sees the real array — the substitution happens
 * in the bundler, after type checking. `/mcp` calls `headers()`, so it is
 * dynamic and never prerendered, which means `pnpm build` compiled the page
 * without ever executing the component. And every `check:*` script that reads
 * `mcp-guide.tsx` reads it as TEXT and matches a regex; none renders it.
 * `check:client-boundary` exists because of this, and is the only gate that
 * can see this class of bug.
 *
 * So the rule this file embodies: a value two features share belongs in
 * `src/lib` with no directive and no React import — `dry.md`, "Where shared
 * code goes", and the same call `features/playground/lib/kind-copy.ts` makes
 * for the kind blurbs.
 *
 * Primary navigation.
 *
 * The order runs from DOING to READING to BUILDING, left to right:
 *
 *   Live — the one entry that puts a model on screen, so it leads, and it is
 *     the one entry drawn as a button (see `cta` below). It read "View" until
 *     the route was renamed `/live`: the page had not only viewed for two
 *     releases — you can drag the C4 and sequence canvases and the text is
 *     rewritten under you — and a label promising a viewer taught a reader
 *     the one thing about the page that was no longer true.
 *   Demo — finished examples, next to Live because the two answer the same
 *     question ("show me one") from opposite ends: an empty canvas to fill,
 *     or four models already built.
 *   Syntax, Validate, MCP — the reference trio, adjacent on purpose: reading
 *     the grammar, testing something against it, and pointing an agent at both
 *     are the same errand. MCP sits last of the three, being the one you reach
 *     for after the format makes sense.
 *   There is no Editor entry any more. `/editor` was retired into a forwarding
 *     alias for `/live` once the playground's C4 canvas became editable in
 *     place: two entries for one job taught a reader there were two places to
 *     go. It was last on the bar and the only entry that could disappear, so
 *     removing it resequences nothing — and it gives back the ~60px the
 *     viewport budget below was fighting for.
 *
 * Demo replaced the outbound "About C4" link (2026-08). That link sent a
 * first-time reader to another website to find out what a C4 diagram is,
 * which is a strange thing for this site to do when it can show them four.
 * With it gone, nothing in the header leaves the site, so the row no longer
 * needs its outside-the-<nav> slot at all.
 *
 * WHY THE ROW COLLAPSES BELOW `sm`. The original measurement: four entries
 * plus the wordmark and the theme toggle came to ~404px against a 393px
 * viewport (iPhone 15), and a header wider than the viewport widens the whole
 * document — every page below it then scrolls sideways. Hiding the wordmark
 * below `sm` bought back its ~80px (~322px); the fifth entry, Editor, spent
 * ~60px of that again (~382px). That left ~11px of slack at 393px and an
 * overflow again at 375px (iPhone SE, 13 mini) — one more entry, one longer
 * label, or one wider system font tips it. Shaving per-entry pixels has run
 * out of viewport, so below `sm` the entries move behind a single menu button
 * instead, which also returns the wordmark to phones (they showed only the
 * mark). The count has since changed again — Demo arrived, About C4 left —
 * but the conclusion does not depend on the exact number: the row ran out of
 * viewport, and the menu is what makes adding an entry a content decision
 * rather than a layout one.
 *
 * The mobile panel is the same non-trapping popover `ui/zoom-menu.tsx` argues
 * for: Escape-to-close, pointerdown-outside-to-close, no focus trap. It is a
 * short list of links under a bar, not a dialog.
 *
 * NO ENTRY CARRIES A STATUS PILL. MCP carried a "Beta" one, read from the mcp
 * feature's catalogue so it could not disagree with the page or the server's
 * handshake; the integration is no longer beta, and the `status` field went
 * with it rather than staying as a slot nothing fills. What the pill was
 * standing in for now lives where it can be acted on — one bullet on `/mcp`
 * and one sentence in the server's `initialize` payload, both from
 * `MCP_STABILITY_NOTICE`.
 *
 * The empty-array guard on the <nav> below still matters if every entry is
 * ever removed again: an empty <nav> would expose a navigation landmark with
 * nothing in it, which is worse for a screen reader than no landmark at all.
 */
export const NAV_LINKS: ReadonlyArray<{
  href: string;
  label: string;
  /**
   * Drawn as a button-styled call to action rather than a text link. A
   * button, not a group separator, because a separator only splits the row
   * into clusters — a reader still sees a row of equally-weighted text links
   * and no answer to "where do I start". The button silhouette is the one
   * affordance readers already rank above plain links. It uses the `outline`
   * variant, not `primary`: this header renders on every route, and a filled
   * primary button in permanent view would compete with the content's own
   * CTAs everywhere at once.
   */
  cta?: boolean;
}> = [
  // Live leads: it is the one place you can actually put a model on screen,
  // where the header otherwise offered three ways to read ABOUT the format and
  // none to use it. Demo is a different promise — finished examples to look
  // at, rather than an empty canvas to fill — which is why it sits second and
  // not as the CTA.
  { href: "/live", label: "Live", cta: true },
  // Demo was dropped from this list once, when Live (then labelled "View")
  // replaced it, on the
  // reasoning that a reader wants to USE the tool rather than browse samples.
  // It is back (2026-08) in place of the outbound "About C4" link: sending a
  // first-time reader to another website to learn what a C4 diagram is was a
  // worse answer than showing them four finished ones here.
  { href: "/demo", label: "Demo" },
  { href: "/syntax", label: "Syntax" },
  { href: "/validate", label: "Validate" },
  { href: "/mcp", label: "MCP" },
];
