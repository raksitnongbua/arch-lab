/**
 * Public surface of the syntax-docs feature: the `/syntax` reference page
 * for the `.aft` text format. The page's snippets live in
 * `content/snippets.ts`, shared with `scripts/syntax-docs-check.mjs` so
 * every example is proven against the real parser.
 */

export { SyntaxReference } from "./components/syntax-reference";
