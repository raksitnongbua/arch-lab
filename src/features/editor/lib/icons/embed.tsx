import type { SVGProps } from "react";

/**
 * Embedding artwork from the `thesvg` package as React components.
 *
 * Separate from `brand.tsx` because it is about EMBEDDING, not about which
 * marks we carry: every fix in here was bought with a shipped bug (root
 * width/height, forbidden `<style>`, slug-prefixed ids, both ink spellings in
 * both quote styles), and that knowledge should not be tangled up with a list
 * of logos. Nothing here knows which mark it is handling.
 */

/* -------------------------------------------------------------------------- */
/* Sanitising the package markup                                               */
/* -------------------------------------------------------------------------- */

/**
 * Root attributes that must NOT ride along into our document. `width`/`height`
 * because the consumer sizes the icon (the picker via className, the exporter
 * by injecting concrete attributes — a leftover pair would produce a duplicate
 * attribute, which is invalid XML and kills PNG rasterisation). `viewBox` is
 * re-emitted on our own root. The rest is document plumbing that carries no
 * paint: React owns `xmlns`/`aria-*`, and a root `id`/`class` could collide
 * across icons once several are embedded in one exported file.
 */
const DROPPED_ROOT_ATTRS = new Set([
  "viewBox",
  "width",
  "height",
  "id",
  "class",
  "role",
  "xml:space",
  "preserveAspectRatio",
]);

/**
 * Markup that must never appear in an icon we embed. `<style>` because its
 * class selectors are document-global: two icons both declaring `.cls-1` in
 * one exported SVG restyle each other. The other two for hygiene — the
 * package is trusted, but an export must stay a pure image.
 */
const FORBIDDEN_MARKUP = ["<style", "<script", "<foreignObject"];

/**
 * The `<svg>` root, with whatever XML prologue precedes it.
 *
 * The prologue is a REPEATING group of declarations and comments, not just an
 * optional `<?xml …?>`, because that narrower version shipped a crash: nginx
 * arrives as `<?xml …?><!-- Uploaded to: SVG Repo … -->\n<svg …>`, the comment
 * did not match, and the whole registry threw at module load — taking every
 * page that imports it down, not merely the one icon. Editors and exporters
 * routinely stamp a comment in beside the declaration, so treating that as
 * malformed was the bug.
 *
 * The prologue is DISCARDED rather than re-emitted: a comment carries no paint
 * and an XML declaration is invalid anywhere but the very start of a document,
 * which is not where an embedded icon sits.
 */
const ROOT_RE =
  /^(?:\s*(?:<\?xml[^?]*\?>|<!--[\s\S]*?-->))*\s*<svg\b([^>]*)>([\s\S]*)<\/svg>\s*$/;

/**
 * Splits one packaged SVG into the pieces our own `<svg>` root re-hosts: the
 * `viewBox`, and the inner markup with the original root's PAINT attributes
 * (fill, stroke, style, …) preserved on a wrapping `<g>` — several marks
 * (Prometheus, the OpenAI/Anthropic light variants) colour their paths only
 * through root-level inheritance, so dropping those attributes would render
 * them invisible.
 *
 * Internal `id`s are prefixed with the icon's slug. This is the one edit ever
 * made to packaged markup, and it is serialisation plumbing, not a design change
 * (visually byte-identical, like minification): gradient ids in the package
 * are generic (`a`, `b`, `SVGID_1_`), and two icons embedded in one exported
 * document would otherwise capture each other's `url(#…)` references.
 *
 * Throws on anything it cannot make safe. The registry module loads while
 * `pnpm build` prerenders, so a bad curation fails the build loudly instead
 * of shipping a broken or bleeding icon.
 */
export function splitPackagedSvg(
  slug: string,
  svg: string,
): { viewBox: string; inner: string } {
  const match = ROOT_RE.exec(svg);
  if (match === null) {
    throw new Error(`icon "${slug}": markup is not a single <svg> root`);
  }
  const [, rootAttrs, body] = match;

  const viewBox = /viewBox=(["'])([^"']+)\1/.exec(rootAttrs)?.[2];
  if (viewBox === undefined) {
    throw new Error(`icon "${slug}": root has no viewBox`);
  }
  for (const tag of FORBIDDEN_MARKUP) {
    if (body.includes(tag)) {
      throw new Error(
        `icon "${slug}": contains ${tag} — pick a variant without it`,
      );
    }
  }

  const kept: string[] = [];
  for (const attr of rootAttrs.matchAll(
    /([A-Za-z_:][\w:.-]*)=(["'])([^"']*)\2/g,
  )) {
    const name = attr[1];
    if (
      DROPPED_ROOT_ATTRS.has(name) ||
      name.startsWith("xmlns") ||
      name.startsWith("aria-") ||
      name.startsWith("data-")
    ) {
      continue;
    }
    kept.push(`${name}="${attr[3]}"`);
  }

  let inner = kept.length > 0 ? `<g ${kept.join(" ")}>${body}</g>` : body;
  const prefix = `af-brand-${slug}-`;
  inner = inner
    .replace(
      /\bid=(["'])([^"']+)\1/g,
      (_m, _q: string, id: string) => `id="${prefix}${id}"`,
    )
    .replace(/url\(#([^)]+)\)/g, (_m, id: string) => `url(#${prefix}${id})`)
    .replace(
      /\b(href|xlink:href)=(["'])#([^"']+)\2/g,
      (_m, name: string, _q: string, id: string) => `${name}="#${prefix}${id}"`,
    );

  return { viewBox, inner: inner.trim() };
}

/**
 * Does this artwork paint itself, rather than inheriting the colour around it?
 *
 * BOTH spellings AND BOTH QUOTE STYLES must be checked; each was learned from
 * a shipped bug. Bun declares its ink as `style="fill:#fbf0df"`, so an
 * attribute-only test called it ink-free, handed it `currentColor` — which a
 * `style` declaration outranks — and the mark kept painting itself while the
 * registry believed it was monochrome. Oracle then did the same thing one
 * level down, with `style='fill:#C74634'` in SINGLE quotes, which a
 * double-quote-only pattern misses just as completely.
 *
 * Every attribute pattern in this file matches both quote styles for that
 * reason: SVG allows either, the package mixes them, and a pattern that reads
 * only one of them fails SILENTLY — the icon renders, wrongly, rather than
 * throwing. `none` and `currentColor` are not ink: the first paints nothing,
 * the second is the inheritance we are asking for.
 */
export function hasBakedInk(svg: string): string | null {
  const attr = /\b(?:fill|stroke)=(["'])(?!none\b|currentColor\b)[^"']+\1/.exec(
    svg,
  );
  if (attr !== null) return attr[0];
  const styled =
    /style=(["'])[^"']*\b(?:fill|stroke)\s*:\s*(?!none\b|currentColor\b)[^;"']+/.exec(
      svg,
    );
  return styled === null ? null : styled[0];
}

/**
 * The same artwork with its colour removed, so it inherits `currentColor`.
 *
 * THIS IS THE ONE PLACE A MARK IS MODIFIED, and it is deliberately narrow.
 * The registry's rule is that a coloured mark is never recoloured — beyond
 * diluting it, several upstream licences forbid derivatives outright — so
 * this runs ONLY where the caller has checked the licence permits it
 * (`derivedMono` in brand.tsx does that check and throws otherwise) and only
 * to reach a monochrome rendering, which is the ordinary, sanctioned way to
 * show a logo in one ink.
 *
 * `none` survives: it is not ink but the absence of it, and dropping it turns
 * a stroke-only outline into a filled blob. `currentColor` survives for the
 * same reason it exists — it is already the inheritance being asked for.
 */
export function stripInk(svg: string): string {
  return svg
    .replace(/\s(?:fill|stroke)=(["'])(?!none\b|currentColor\b)[^"']*\1/g, "")
    .replace(
      /\sstyle=(["'])([^"']*)\1/g,
      (_match, _quote: string, decls: string) => {
        const kept = decls
          .split(";")
          .filter(
            (decl) =>
              !/^\s*(?:fill|stroke)\s*:\s*(?!none\b|currentColor\b)/.test(decl),
          )
          .join(";")
          .trim();
        return kept === "" ? "" : ` style="${kept}"`;
      },
    );
}

/**
 * A registry-shaped component around one packaged mark. The inner markup goes in
 * via `dangerouslySetInnerHTML`: it is TRUSTED PACKAGE CONTENT, pinned by the
 * lockfile — never user input, never network — sanitised above for document
 * hygiene (not for injection). Re-hosting under our own `<svg>` root keeps the
 * registry contract (`React.FC<SVGProps<SVGSVGElement>>`) and keeps the
 * exporter's capture working: its `innerHTML` snapshot must start with
 * `<svg ` for `embeddedIconSvg` to inject position and size.
 *
 * `fill="currentColor"` IS SET ON EVERY MARK, coloured ones included, and that
 * is not the recolouring the registry forbids — it is the opposite. `fill` is
 * inherited, so a path that declares its own colour keeps it and the root
 * value never reaches it. The root value is consumed ONLY by paths that
 * declare no fill, which the SVG spec then resolves to the initial value:
 * BLACK. Plenty of packaged marks are drawn that way — Spring Boot, Spark,
 * Celery and Istio leave most of their paths unfilled — so they rendered
 * black-on-black on a dark canvas, invisible to anyone using the dark theme.
 *
 * An earlier version set this only for marks classed monochrome, on the
 * reasoning that a coloured mark must not be touched. That reasoning was
 * wrong twice over: it withheld a colour from artwork that had asked for one
 * by omission, and the "is it monochrome" classification it depended on could
 * be flipped by a single stray hex anywhere in the file. Artwork that leaves a
 * fill unspecified is deferring to its context by design; supplying the
 * theme's ink is answering that, and it is strictly better than the black the
 * browser would otherwise pick.
 */
export function packagedSvgComponent(
  slug: string,
  markup: string,
): React.FC<SVGProps<SVGSVGElement>> {
  const { viewBox, inner } = splitPackagedSvg(slug, markup);
  const html = { __html: inner };
  return function PackagedIcon(props: SVGProps<SVGSVGElement>) {
    return (
      <svg
        viewBox={viewBox}
        fill="currentColor"
        aria-hidden="true"
        dangerouslySetInnerHTML={html}
        {...props}
      />
    );
  };
}
