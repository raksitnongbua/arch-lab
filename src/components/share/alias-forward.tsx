/**
 * A route that only knows the way somewhere else, carrying the URL FRAGMENT
 * with it — and leaving BEFORE the reader can read the holding line.
 *
 * It exists because a share link's whole document travels in the fragment, and
 * the fragment never reaches the server, so a `redirects()` rule in
 * `next.config.ts` would strand the payload. Only a client can carry it across.
 *
 * WHY AN INLINE SCRIPT AND NOT JUST THE EFFECT. This was one client component,
 * and it forwarded from `useEffect` — which cannot run until React has
 * hydrated. So the server sent "Opening the playground…", the browser painted
 * it, and the reader sat looking at that sentence for the whole hydration
 * window: bundle fetched, parsed, executed, only then the address changed. On a
 * dev server that is a second or more, and it was reported as "why do I see
 * this page first?" — a fair question, because for someone opening a shared
 * diagram it was the first thing this product ever showed them.
 *
 * A script in the body runs while the HTML is still being parsed, before the
 * paragraph below it exists, so nothing is painted to be read. It is FIRST in
 * the returned fragment for exactly that reason; moving it after the text
 * reintroduces the flash it was written to remove.
 *
 * THE SCRIPT FORWARDS THE RAW FRAGMENT, and does not reimplement
 * `normalizeShareFragment` — that would be the same logic in two languages,
 * one of them a string, drifting the day either changed. It is safe because
 * `decodeShareFragment` normalizes what it READS ("so a fragment a forward
 * appended twice still opens", in its own comment), so the destination already
 * copes with a doubled `#m=…#m=…`. The fallback keeps normalizing because it
 * costs nothing there and keeps the address bar tidy when it is the path taken.
 *
 * `replace`, not assign: nobody ever meant to visit an alias, so Back must
 * return to wherever the link was opened from rather than to the trampoline.
 *
 * ONE COMPONENT, taking its destination as a prop, because the direction has
 * already flipped once. `/live/seq` used to be the alias and `/live/sequence`
 * the page; the pair now runs the other way. That prop is carrying sixteen
 * routes, since the whole family was renamed from `/view` and each old path
 * stayed behind as a trampoline.
 */

import { AliasForwardFallback } from "./alias-forward-fallback";

/**
 * The forward, as source a browser runs during parse.
 *
 * The query is MERGED rather than appended, for the reason
 * `alias-forward-fallback.tsx` sets out: five of the six destinations carry a
 * `?d=` of their own, and `?d=seq?e=x` makes `d` read as `seq?e=x`, matching no
 * kind. The destination wins a collision, because its `d` comes from the path
 * the reader actually asked for.
 *
 * Wrapped in try/catch and ending in nothing: if any of it throws, the script
 * is silent and the fallback effect below does the same job a moment later. A
 * trampoline that threw an uncaught error would strand the reader on the one
 * page that has nothing for them.
 */
function forwardScript(to: string): string {
  return `try{var t=new URL(${JSON.stringify(to)},location.origin),h=new URL(location.href);h.searchParams.forEach(function(v,k){if(!t.searchParams.has(k))t.searchParams.set(k,v)});location.replace(t.pathname+t.search+location.hash)}catch(e){}`;
}

export function AliasForward({
  to,
  label,
}: {
  /** Destination path, without a fragment (`/live/seq`). May carry a query. */
  to: string;
  /** What the holding line says, e.g. "the sequence playground". */
  label: string;
}): React.JSX.Element {
  return (
    <>
      {/* FIRST, so it runs before the holding line is parsed. `to` is a
          literal from our own route files, never user input, and is
          JSON-stringified regardless — a template hole in a <script> is the
          one place that habit is not optional. */}
      <script dangerouslySetInnerHTML={{ __html: forwardScript(to) }} />
      <AliasForwardFallback to={to} label={label} />
    </>
  );
}
