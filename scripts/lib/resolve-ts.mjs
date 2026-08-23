/**
 * Let a check script `import()` the app's own TypeScript.
 *
 * Node ≥ 23.6 strips types on its own, but it does not know this project's two
 * resolution conventions: the `@/*` alias for `src/`, and extensionless
 * relative imports that mean `./thing.ts` or `./thing/index.ts`. This registers
 * both, so a check exercises the module the app ships rather than a copy of it
 * (`codebase.md`, "Never reimplement app logic inside a check").
 *
 * WHY THIS FILE EXISTS RATHER THAN A THIRTY-FIRST COPY. The same hook is
 * inlined at the top of about thirty check scripts, which is where it was
 * invented and where it still lives; `seo-check.mjs` needed it and copying the
 * block once more would have made the count thirty-one. New callers import this.
 * The inline copies are not worth a mechanical sweep — they work, and touching
 * thirty checks to save thirty identical paragraphs is a bigger risk than the
 * duplication — but this is the home for the next one.
 *
 * Type stripping CANNOT READ `.tsx`, so only pure modules are loadable. An
 * import chain reaching a feature barrel that exports a component takes the
 * module out of its harness silently; that is why the modules the checks load
 * carry a note saying so.
 */

import { existsSync, statSync } from "node:fs";
import { registerHooks } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

/**
 * Register the resolver and return a loader for paths relative to the repo
 * root. Call once per script, at the top: the hook is process-wide.
 */
export function registerTsResolution(root) {
  registerHooks({
    resolve(specifier, context, nextResolve) {
      let resolved = specifier;
      if (resolved.startsWith("@/")) {
        resolved = pathToFileURL(
          path.join(root, "src", resolved.slice(2)),
        ).href;
      }
      if (
        (resolved.startsWith("./") || resolved.startsWith("../")) &&
        typeof context.parentURL === "string"
      ) {
        resolved = new URL(resolved, context.parentURL).href;
      }
      if (resolved.startsWith("file:")) {
        const asPath = fileURLToPath(resolved);
        const isFile = existsSync(asPath) && statSync(asPath).isFile();
        if (!isFile) {
          if (existsSync(`${asPath}.ts`)) {
            resolved = pathToFileURL(`${asPath}.ts`).href;
          } else if (existsSync(path.join(asPath, "index.ts"))) {
            resolved = pathToFileURL(path.join(asPath, "index.ts")).href;
          }
        }
      }
      return nextResolve(resolved, context);
    },
  });
  return (relative) => import(pathToFileURL(path.join(root, relative)).href);
}
