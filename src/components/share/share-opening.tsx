/**
 * The holding state a playground shows while it opens a shared document.
 *
 * THE PROBLEM. Both playgrounds seed themselves with an example so the page is
 * never an empty canvas. A share link carries its document in the URL FRAGMENT,
 * which the server never sees — so the prerendered HTML is the example, and the
 * shared document cannot replace it until the client has hydrated and finished
 * an async decode. A reader who opened someone else's link therefore watched the
 * Checkout example for a beat and reasonably concluded that WAS the flow they
 * were sent. The same misreading is already on record for links that fail to
 * open, which is why those take over the whole page.
 *
 * THE FIX is the one `/view` already uses for the chooser: an inline script in
 * the root layout stamps `data-share-forward` on <html> BEFORE first paint when
 * the URL carries a payload, and CSS in `globals.css` swaps the seeded content
 * for this component while it is set. React cannot do this job — the fragment is
 * not readable until the client, by which point the paint has happened.
 *
 * A pre-paint hide needs a post-hydration OWNER, because the script runs once
 * per document load and a client-side navigation never reloads. Each playground
 * clears the attribute once its decode resolves — every outcome, including "no
 * payload after all". Without that the flag outlives the URL that set it and
 * blanks the page for the rest of the session; that exact bug is documented on
 * the chooser.
 *
 * Deliberately says almost nothing. It is on screen for a few hundred
 * milliseconds, so a heading and a description would be read for longer than
 * they exist; naming the ACT ("opening") is the one thing worth saying, because
 * it tells a reader the example they half-saw is not their document.
 */

/** Put this on the content a share link should replace, never on the page. */
export const SHARE_PENDING_CLASS = "af-share-pending";

export function ShareOpening({
  /** What is being opened, for the message: "diagram", "model". */
  subject,
}: {
  subject: string;
}): React.JSX.Element {
  return (
    // `af-share-opening` is display:none by default and only shown while the
    // pre-paint flag is set, so it costs a normal visit nothing and never
    // reaches a screen reader on one.
    <div
      className="af-share-opening min-h-[50svh] w-full flex-col items-center justify-center gap-3 px-5 py-16 text-center"
      role="status"
    >
      <span
        aria-hidden="true"
        className="size-6 animate-spin rounded-full border-2 border-border border-t-primary"
      />
      <p className="text-sm text-muted-foreground">
        Opening the shared {subject}…
      </p>
    </div>
  );
}
