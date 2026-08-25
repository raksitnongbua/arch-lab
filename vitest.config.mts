/**
 * Unit tests, as the layer BELOW the `check:*` scripts — not a replacement for
 * them. The check suite proves the product works end to end and is the gate
 * described in `.claude/rules/deploy.md`; it is deliberately coarse, so when it
 * fails it says "something moved", not "this function returns the wrong value".
 * These tests cover the pure layers — grammar, geometry, codecs, helpers —
 * where a failure can name the exact function, so the large components can be
 * broken up with something holding the floor underneath them.
 *
 * NODE ENVIRONMENT, NOT JSDOM, and deliberately so: everything tested here is
 * a pure function over data. Nothing in this config admits a DOM, because a
 * component test that needs one belongs behind a `check:*` script that renders
 * the real page instead of a simulated one.
 *
 * `.mts`, not `.ts`: the manifest has no `"type": "module"`, so a `.ts` config
 * is loaded as CommonJS and Vite warns about the ESM syntax below.
 */

import { defineConfig } from "vitest/config";

export default defineConfig({
  /* Resolves the `@/*` alias from `tsconfig.json` natively, so tests import
     modules by the same specifier the application does. Vite does this without
     a plugin as of v7 — `vite-tsconfig-paths` would be a second source of
     truth for the same mapping. */
  resolve: { tsconfigPaths: true },
  test: {
    environment: "node",
    /* Co-located with the code under test: `foo.ts` is proved by `foo.test.ts`
       beside it, so a reader opening a module can see whether it is covered
       without searching a parallel tree. */
    include: ["src/**/*.test.ts"],
  },
});
