/**
 * The playground card, re-exported rather than re-drawn, for the retired
 * `/view` family.
 *
 * A `/view#m=…` link is a URL people SHARE — pasted into a review, a Slack
 * thread, a ticket — and a preview is fetched for the URL as shared, not for
 * the one the client forwards to. Without this file Next serves the ROOT card
 * and every already-circulating share link previews as the product's landing
 * page, saying nothing about the diagram inside the link. That precise bug
 * shipped once on `/editor`, which is why it has a card too.
 *
 * A re-export, never a copy: two drawings of one card are two cards that can
 * disagree, and this one has no reason to differ from the card the destination
 * carries. The nested trampolines (`/view/seq`, `/view/sequence/[exampleId]`,
 * …) inherit it, since a route without its own `opengraph-image` takes the
 * nearest one above it.
 */

export { default, alt, size, contentType } from "../live/opengraph-image";
