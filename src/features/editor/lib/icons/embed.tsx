import type { SVGProps } from "react";

/**
 * Embedding artwork from the `thesvg` package as React components.
 *
 * SHARED BY TWO CALLERS, which is why it is its own module rather than living
 * in `brand.tsx` where it started: the brand set embeds packaged marks the
 * registry has no hand-authored version of, and `colour-overlay.tsx` embeds
 * packaged marks that DO have one, to stand in for it in colour mode. Both
 * need the identical sanitising — the fixes here were each bought with a
 * shipped bug, and a second copy would be a second place to forget them.
 *
 * Nothing here is specific to which of the two is calling.
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

  const viewBox = /viewBox="([^"]+)"/.exec(rootAttrs)?.[1];
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
  for (const attr of rootAttrs.matchAll(/([A-Za-z_:][\w:.-]*)="([^"]*)"/g)) {
    const name = attr[1];
    if (
      DROPPED_ROOT_ATTRS.has(name) ||
      name.startsWith("xmlns") ||
      name.startsWith("aria-") ||
      name.startsWith("data-")
    ) {
      continue;
    }
    kept.push(`${name}="${attr[2]}"`);
  }

  let inner = kept.length > 0 ? `<g ${kept.join(" ")}>${body}</g>` : body;
  const prefix = `af-brand-${slug}-`;
  inner = inner
    .replace(/\bid="([^"]+)"/g, (_m, id: string) => `id="${prefix}${id}"`)
    .replace(/url\(#([^)]+)\)/g, (_m, id: string) => `url(#${prefix}${id})`)
    .replace(
      /\b(href|xlink:href)="#([^"]+)"/g,
      (_m, name: string, id: string) => `${name}="#${prefix}${id}"`,
    );

  return { viewBox, inner: inner.trim() };
}

/**
 * Does this artwork paint itself, rather than inheriting the colour around it?
 *
 * BOTH spellings must be checked. An attribute-only test was tried and was
 * wrong: Bun declares its ink as `style="fill:#fbf0df"`, so an attribute test
 * reports it ink-free, hands it `currentColor` — which a `style` declaration
 * outranks — and the mark quietly keeps painting itself while the registry
 * believes it is monochrome. `none` and `currentColor` are not ink: the first
 * paints nothing, the second is the inheritance we are asking for.
 */
export function hasBakedInk(svg: string): string | null {
  const attr = /\b(?:fill|stroke)="(?!none\b|currentColor\b)[^"]+"/.exec(svg);
  if (attr !== null) return attr[0];
  const styled =
    /style="[^"]*\b(?:fill|stroke)\s*:\s*(?!none\b|currentColor\b)[^;"]+/.exec(
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
    .replace(/\s(?:fill|stroke)="(?!none\b|currentColor\b)[^"]*"/g, "")
    .replace(/\sstyle="([^"]*)"/g, (_match, decls: string) => {
      const kept = decls
        .split(";")
        .filter(
          (decl) =>
            !/^\s*(?:fill|stroke)\s*:\s*(?!none\b|currentColor\b)/.test(decl),
        )
        .join(";")
        .trim();
      return kept === "" ? "" : ` style="${kept}"`;
    });
}

/**
 * A registry-shaped component around one packaged mark. The inner markup goes in
 * via `dangerouslySetInnerHTML`: it is TRUSTED PACKAGE CONTENT, pinned by the
 * lockfile — never user input, never network — sanitised above for document
 * hygiene (not for injection). Re-hosting under our own `<svg>` root keeps the
 * registry contract (`React.FC<SVGProps<SVGSVGElement>>`) and keeps the
 * exporter's capture working: its `innerHTML` snapshot must start with
 * `<svg ` for `embeddedIconSvg` to inject position and size.
 */
export function packagedSvgComponent(
  slug: string,
  markup: string,
  monochrome: boolean,
): React.FC<SVGProps<SVGSVGElement>> {
  const { viewBox, inner } = splitPackagedSvg(slug, markup);
  const html = { __html: inner };
  /* `fill` is an INHERITED property, so declaring it once on our root reaches
     every path of an ink-free mark (the caller guarantees none of them
     overrides it). Coloured marks must not carry this: it would be the
     recolouring the registry forbids. */
  const fill = monochrome ? "currentColor" : undefined;
  return function PackagedIcon(props: SVGProps<SVGSVGElement>) {
    return (
      <svg
        viewBox={viewBox}
        fill={fill}
        aria-hidden="true"
        dangerouslySetInnerHTML={html}
        {...props}
      />
    );
  };
}
