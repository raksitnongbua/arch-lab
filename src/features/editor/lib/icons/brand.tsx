import type { IconVariants } from "thesvg";

import type { IconCategory } from "./categories";
import { hasBakedInk, packagedSvgComponent, stripInk } from "./embed";
import type { IconSource } from "./registry";

/**
 * Named-and-renamed imports, never the default, DELIBERATELY — a default
 * import was tried first and shipped ~284KB of dead strings per chunk: each
 * module's default export is an object literal referencing every export, so
 * importing it keeps `license`, `url` and every artwork alive past
 * tree-shaking. `slug`/`title` come from the package rather than being
 * retyped here (dry.md — the import path already pins which module they
 * belong to).
 *
 * WHICH ARTWORK BINDING an icon imports is not cosmetic, and the split is
 * the price of the mono/colour switch:
 *
 *   - `variants` (45 icons) — needed to reach the `mono` artwork, which the
 *     package exposes ONLY through that object; there is no per-variant
 *     subpath. It drags the light/dark/wordmark strings in with it, about
 *     150KB across the set that nothing renders. That waste buys the switch,
 *     and it is why the other nine do not pay it.
 *   - `svg` (9 icons) — upstream ships them no `mono` variant, so `variants`
 *     would cost bytes for artwork we could not use anyway. These stay
 *     coloured in mono mode; see `IconDef.byStyle`.
 *
 * A leaner route exists if the waste ever matters: generate a module holding
 * just the 45 mono strings (~52KB) and pin it to the package with a `check:*`
 * script, the way `check:skill` pins the generated skill document.
 */
import {
  slug as angularSlug,
  title as angularTitle,
  variants as angularVariants,
} from "thesvg/angular";
import {
  slug as ansibleSlug,
  title as ansibleTitle,
  variants as ansibleVariants,
} from "thesvg/ansible";
import {
  slug as anthropicSlug,
  title as anthropicTitle,
  variants as anthropicVariants,
} from "thesvg/anthropic";
import {
  slug as airflowSlug,
  title as airflowTitle,
  variants as airflowVariants,
} from "thesvg/apache-airflow";
import {
  slug as pulsarSlug,
  title as pulsarTitle,
  variants as pulsarVariants,
} from "thesvg/apache-pulsar";
import {
  slug as sparkSlug,
  title as sparkTitle,
  variants as sparkVariants,
} from "thesvg/apache-spark";
import { slug as argocdSlug, variants as argocdVariants } from "thesvg/argocd";
import {
  slug as auth0Slug,
  title as auth0Title,
  variants as auth0Variants,
} from "thesvg/auth0";
import {
  slug as bunSlug,
  title as bunTitle,
  variants as bunVariants,
} from "thesvg/bun";
import {
  slug as celerySlug,
  title as celeryTitle,
  variants as celeryVariants,
} from "thesvg/celery";
import {
  slug as circleciSlug,
  title as circleciTitle,
  variants as circleciVariants,
} from "thesvg/circleci";
import {
  slug as cockroachdbSlug,
  title as cockroachdbTitle,
  svg as cockroachdbSvg,
} from "thesvg/cockroachdb";
/* Mono artwork only — the package catalogues the company separately from the
   product, and only the company entry carries a mono variant. Our slug stays
   `cockroachdb` (monoFromAlternate explains why). */
import {
  variants as cockroachLabsVariants,
  license as cockroachLabsLicence,
} from "thesvg/cockroach-labs";
import {
  slug as cplusplusSlug,
  title as cplusplusTitle,
  variants as cplusplusVariants,
} from "thesvg/cplusplus";
import {
  slug as databricksSlug,
  title as databricksTitle,
  variants as databricksVariants,
} from "thesvg/databricks";
import {
  slug as datadogSlug,
  title as datadogTitle,
  variants as datadogVariants,
} from "thesvg/datadog";
import { slug as dbtSlug, title as dbtTitle, svg as dbtSvg } from "thesvg/dbt";
import {
  slug as digitaloceanSlug,
  title as digitaloceanTitle,
  variants as digitaloceanVariants,
} from "thesvg/digitalocean";
import {
  slug as flutterSlug,
  title as flutterTitle,
  variants as flutterVariants,
} from "thesvg/flutter";
import {
  slug as githubSlug,
  title as githubTitle,
  variants as githubVariants,
} from "thesvg/github";
import {
  slug as githubActionsSlug,
  title as githubActionsTitle,
  variants as githubActionsVariants,
} from "thesvg/github-actions";
import {
  slug as gitlabSlug,
  title as gitlabTitle,
  variants as gitlabVariants,
} from "thesvg/gitlab";
import {
  slug as grafanaSlug,
  title as grafanaTitle,
  variants as grafanaVariants,
} from "thesvg/grafana";
import {
  slug as helmSlug,
  title as helmTitle,
  variants as helmVariants,
} from "thesvg/helm";
import {
  slug as herokuSlug,
  title as herokuTitle,
  svg as herokuSvg,
  license as herokuLicence,
} from "thesvg/heroku";
import {
  slug as influxdbSlug,
  title as influxdbTitle,
  variants as influxdbVariants,
} from "thesvg/influxdb";
import {
  slug as istioSlug,
  title as istioTitle,
  variants as istioVariants,
} from "thesvg/istio";
import {
  slug as jenkinsSlug,
  title as jenkinsTitle,
  variants as jenkinsVariants,
} from "thesvg/jenkins";
import {
  slug as keycloakSlug,
  title as keycloakTitle,
  variants as keycloakVariants,
} from "thesvg/keycloak";
import {
  slug as kotlinSlug,
  title as kotlinTitle,
  variants as kotlinVariants,
} from "thesvg/kotlin";
import {
  slug as mariadbSlug,
  title as mariadbTitle,
  variants as mariadbVariants,
} from "thesvg/mariadb";
import {
  slug as mssqlSlug,
  title as mssqlTitle,
  svg as mssqlSvg,
  license as mssqlLicence,
} from "thesvg/microsoft-sql-server";
import {
  slug as minioSlug,
  title as minioTitle,
  variants as minioVariants,
} from "thesvg/minio";
import {
  slug as neo4jSlug,
  title as neo4jTitle,
  variants as neo4jVariants,
} from "thesvg/neo4j";
import {
  slug as netlifySlug,
  title as netlifyTitle,
  variants as netlifyVariants,
} from "thesvg/netlify";
import {
  slug as newRelicSlug,
  title as newRelicTitle,
  variants as newRelicVariants,
} from "thesvg/new-relic";
import {
  slug as oktaSlug,
  title as oktaTitle,
  variants as oktaVariants,
} from "thesvg/okta";
import {
  slug as openaiSlug,
  title as openaiTitle,
  variants as openaiVariants,
} from "thesvg/openai";
import {
  slug as otelSlug,
  title as otelTitle,
  variants as otelVariants,
} from "thesvg/opentelemetry";
import {
  slug as oracleSlug,
  title as oracleTitle,
  svg as oracleSvg,
} from "thesvg/oracle";
import {
  slug as prometheusSlug,
  title as prometheusTitle,
  variants as prometheusVariants,
} from "thesvg/prometheus";
import {
  slug as sentrySlug,
  title as sentryTitle,
  variants as sentryVariants,
} from "thesvg/sentry";
import {
  slug as snowflakeSlug,
  title as snowflakeTitle,
  variants as snowflakeVariants,
} from "thesvg/snowflake";
import {
  slug as splunkSlug,
  title as splunkTitle,
  variants as splunkVariants,
} from "thesvg/splunk";
import {
  slug as springBootSlug,
  title as springBootTitle,
  variants as springBootVariants,
} from "thesvg/spring-boot";
import {
  slug as stripeSlug,
  title as stripeTitle,
  variants as stripeVariants,
} from "thesvg/stripe";
import {
  slug as supabaseSlug,
  title as supabaseTitle,
  variants as supabaseVariants,
} from "thesvg/supabase";
import {
  slug as svelteSlug,
  title as svelteTitle,
  variants as svelteVariants,
} from "thesvg/svelte";
import {
  slug as swiftSlug,
  title as swiftTitle,
  variants as swiftVariants,
} from "thesvg/swift";
import {
  slug as temporalSlug,
  title as temporalTitle,
  variants as temporalVariants,
} from "thesvg/temporal";
import {
  slug as traefikSlug,
  title as traefikTitle,
  svg as traefikSvg,
} from "thesvg/traefik";
import {
  slug as twilioSlug,
  title as twilioTitle,
  svg as twilioSvg,
  license as twilioLicence,
} from "thesvg/twilio";
import {
  slug as vaultSlug,
  title as vaultTitle,
  variants as vaultVariants,
} from "thesvg/vault";
import {
  slug as vercelSlug,
  title as vercelTitle,
  variants as vercelVariants,
} from "thesvg/vercel";
import {
  slug as vueSlug,
  title as vueTitle,
  svg as vueSvg,
  license as vueLicence,
} from "thesvg/vue";

/**
 * The upstream-shipped artwork that carries NO ink of its own, for the three
 * marks (Vercel, Anthropic, OpenAI) that are monochrome by design and whose
 * default variant is white — invisible on a light canvas.
 *
 * Taking the `light` variant instead was tried and is WRONG: `light` means
 * "dark ink for light backgrounds" and bakes in `fill="#000"`, which fixes
 * the light theme by making the mark black-on-near-black in the dark one.
 * There is no single baked ink that works in both themes, and per-theme
 * artwork is not available to us — the exporter memoises markup per slug
 * (icon-markup.ts), so a theme-dependent icon would break canvas/export
 * parity.
 *
 * The way out is that these brands HAVE no colour to preserve: their marks
 * are a single flat ink by design, and upstream ships them without any. An
 * artwork that specifies no `fill` inherits one, so these three join the
 * hand-authored `currentColor` set (`monochrome: true`) and follow the theme
 * in both directions. That is not recolouring a coloured mark — there is no
 * colour being overridden — and it is why this treatment is confined to
 * brands whose identity is monochrome. A brand with real colours must keep
 * them; see the registry header.
 *
 * The ink assertion is the load-bearing part: if upstream ever bakes a fill
 * into these variants, `currentColor` would silently stop reaching the paths
 * and the mark would go back to being invisible in one theme. Failing the
 * build is the only way that gets noticed.
 */
function inkFreeVariant(slug: string, variants: IconVariants): string {
  /* `mono` where it exists (Vercel, Anthropic); OpenAI ships no `mono`, but
     its `light` carries no fill either — the white default lives in `dark`. */
  const markup = variants["mono"] ?? variants["light"];
  if (markup === undefined) {
    throw new Error(`brand icon "${slug}": has no "mono" or "light" variant`);
  }
  const baked = hasBakedInk(markup);
  if (baked !== null) {
    throw new Error(
      `brand icon "${slug}": expected ink-free artwork to inherit ` +
        `currentColor, but it bakes in ${baked} — a baked ink is ` +
        `invisible in one of the two themes`,
    );
  }
  return markup;
}

/* -------------------------------------------------------------------------- */
/* Choosing the artwork for each style                                         */
/* -------------------------------------------------------------------------- */

/**
 * The two artworks one brand mark can render: its own colours, and a single
 * ink that follows the theme.
 */
interface BrandArt {
  colour: string;
  /**
   * Absent when upstream ships no `mono` variant. The mark then stays
   * coloured in mono mode — see `IconDef.byStyle`; we may not derive one.
   */
  mono?: string;
}

/**
 * A mark with both artworks. `default` is the colour artwork rather than the
 * `svg` export so that both come from ONE object — reading the colour from
 * `svg` and the mono from `variants` would import the module twice over and
 * let the two drift if upstream ever made them disagree.
 */
function withMono(slug: string, variants: IconVariants): BrandArt {
  const colour = variants["default"];
  const mono = variants["mono"];
  if (colour === undefined || mono === undefined) {
    throw new Error(
      `brand icon "${slug}": expected both "default" and "mono" variants — ` +
        `import \`svg\` and use colourOnly() if upstream dropped the mono`,
    );
  }
  return { colour, mono };
}

/**
 * A mark upstream ships no `mono` for. Imports `svg` alone DELIBERATELY: the
 * whole `variants` object would drag the light/dark/wordmark artwork into the
 * bundle (~150KB across the set) to gain nothing.
 */
function colourOnly(svg: string): BrandArt {
  return { colour: svg };
}

/**
 * A brand that is monochrome in BOTH styles — Vercel, Anthropic, OpenAI. They
 * have no colour artwork worth the name: their marks are one flat ink by
 * design and the "colour" variant is white-on-white. Colour mode therefore
 * shows the same ink-free artwork mono mode does, which is honest rather than
 * a gap: there is no colour being withheld.
 */
/**
 * Licences under which producing a monochrome rendering of a mark is
 * unambiguously permitted. Deliberately an ALLOWLIST, not a denylist: the
 * package also ships marks under `brand-use` and CC-BY-NC-SA, and the failure
 * mode of guessing wrong is a licence breach rather than an ugly icon, so an
 * unrecognised value must stop the build rather than be assumed permissive.
 */
const DERIVABLE_LICENCES = new Set([
  "MIT",
  "CC0-1.0",
  "Apache-2.0",
  "BSD-3-Clause",
  "Unlicense",
]);

/**
 * A mark whose monochrome version we PRODUCE, because upstream publishes none
 * and the licence allows it.
 *
 * This is the single exception to "never modify a brand mark", and it is worth
 * saying exactly why it is not a hole in that rule. The rule guards two
 * things: the licence, and the mark's integrity. The licence is checked here
 * and the build fails on anything not on the allowlist. Integrity survives
 * because a one-ink rendering is how logos are shown in monochrome contexts
 * everywhere — it is the entire premise of Simple Icons, which is where the
 * package's own `mono` variants come from. We are producing the variant
 * upstream simply has not got round to.
 *
 * It stays narrow on purpose: it runs only for marks with NO published mono,
 * and the result is asserted ink-free, so a mark that survives stripping with
 * colour intact (a `<style>` block, an embedded raster) fails the build rather
 * than shipping half-recoloured.
 */
function derivedMono(slug: string, svg: string, licence: string): BrandArt {
  if (!DERIVABLE_LICENCES.has(licence)) {
    throw new Error(
      `brand icon "${slug}": licence "${licence}" does not clearly permit a ` +
        `derived work — leave it coloured in mono mode rather than guessing`,
    );
  }
  const mono = stripInk(svg);
  const remaining = hasBakedInk(mono);
  if (remaining !== null) {
    throw new Error(
      `brand icon "${slug}": stripping ink left ${remaining} behind, so the ` +
        `mark would render half-recoloured — use colourOnly() instead`,
    );
  }
  return { colour: svg, mono };
}

/**
 * A mark whose mono artwork lives under a DIFFERENT package slug than its
 * colour artwork — the package catalogues some brands twice (the product and
 * the company), and only one entry carries a mono variant.
 *
 * The registry slug is ours and never changes: a model in the wild says
 * `@cockroachdb`, and repointing that at the package's own naming would break
 * every document using it. Only the artwork is borrowed.
 *
 * The alternate's LICENCE is checked, not assumed. Vue is why: its mono lives
 * under `vuedotjs`, which is CC-BY-NC-SA-4.0 — non-commercial and
 * share-alike — so adopting it would have traded a cosmetic inconsistency for
 * a licence problem. Vue takes the derived route from its own MIT artwork
 * instead.
 */
function monoFromAlternate(
  slug: string,
  colour: string,
  alternate: IconVariants,
  licence: string,
): BrandArt {
  if (!DERIVABLE_LICENCES.has(licence)) {
    throw new Error(
      `brand icon "${slug}": the alternate artwork is licensed "${licence}" — ` +
        `not clearly usable here`,
    );
  }
  const mono = alternate["mono"];
  if (mono === undefined || hasBakedInk(mono) !== null) {
    throw new Error(
      `brand icon "${slug}": the alternate ships no ink-free mono variant`,
    );
  }
  return { colour, mono };
}

function alwaysMono(slug: string, variants: IconVariants): BrandArt {
  const markup = inkFreeVariant(slug, variants);
  return { colour: markup, mono: markup };
}

/* -------------------------------------------------------------------------- */
/* The component and def factories                                             */
/* -------------------------------------------------------------------------- */

interface BrandEntry {
  /** thesvg's slug, imported from the module the path already names. */
  slug: string;
  /** Display name — thesvg's title, overridden where it misspells the brand. */
  name: string;
  /** Which artwork each style renders — `withMono`/`colourOnly`/`alwaysMono`. */
  art: BrandArt;
  category: IconCategory;
  aliases: string[];
}

/**
 * `monochrome` is DERIVED from the artwork, never declared. Hand-declaring it
 * shipped a bug twice: three marks were flagged coloured while carrying no
 * ink of their own (Oracle, Traefik, and the default-variant reading of the
 * white-ink brands), so nothing gave them a `fill`, they fell back to the SVG
 * default of black, and they vanished against a dark canvas. The artwork
 * already knows the answer — asking it cannot drift the way a flag does.
 */
function brandDef(entry: BrandEntry): IconSource {
  const { slug, art } = entry;
  const monochrome = hasBakedInk(art.colour) === null;
  return {
    slug,
    name: entry.name,
    aliases: entry.aliases,
    category: entry.category,
    Svg: packagedSvgComponent(slug, art.colour, monochrome),
    /* Undefined where the two artworks are the same string: the registry
       reads absence as "Svg already answers for both styles", so pointing
       SvgMono at an identical component would only cost a second render
       path and a second export-cache entry for one drawing. */
    SvgMono:
      art.mono === undefined || art.mono === art.colour
        ? undefined
        : packagedSvgComponent(slug, art.mono, hasBakedInk(art.mono) === null),
    monochrome,
  };
}

/* -------------------------------------------------------------------------- */
/* The curated set                                                             */
/* -------------------------------------------------------------------------- */

/**
 * 54 brand marks, hand-picked from thesvg's ~6,500 for what a software
 * architecture diagram actually labels: languages and runtimes the hand set
 * lacks, the databases and data-pipeline tools beyond the big five, CI/CD and
 * IaC, observability, and the SaaS/identity providers that show up as
 * external systems. Each is imported BY SUBPATH (`thesvg/<slug>`, one module
 * per icon) so the bundle carries exactly these 54 — importing the barrel
 * would pull the full set past tree-shaking's guarantees and wreck the
 * bundle.
 *
 * Curation rules, in force whenever this list grows:
 *   - No slug the hand-authored registry already owns (thesvg has
 *     `postgresql`, `redis`, `kafka`, …; the hand-authored marks keep those
 *     slugs — the registry throws on a collision rather than shadowing).
 *   - Nothing containing `<style>` (see FORBIDDEN_MARKUP); `splitBrandSvg`
 *     enforces this at build time.
 *   - White-ink defaults take the upstream `light` variant (import block
 *     header).
 *
 * Sorted by category (ICON_CATEGORY_ORDER), then name — the registry's
 * stable category sort preserves this name order in the picker.
 */
const BRAND_ENTRIES: readonly BrandEntry[] = [
  /* -- Languages & Runtimes ------------------------------------------------ */
  {
    slug: angularSlug,
    name: angularTitle,
    art: withMono(angularSlug, angularVariants),
    category: "languages",
    aliases: ["ng"],
  },
  {
    slug: bunSlug,
    name: bunTitle,
    art: withMono(bunSlug, bunVariants),
    category: "languages",
    aliases: ["bunjs"],
  },
  {
    slug: cplusplusSlug,
    name: cplusplusTitle,
    art: withMono(cplusplusSlug, cplusplusVariants),
    category: "languages",
    aliases: ["cpp", "c plus plus"],
  },
  {
    slug: flutterSlug,
    name: flutterTitle,
    art: withMono(flutterSlug, flutterVariants),
    category: "languages",
    aliases: ["dart"],
  },
  {
    slug: kotlinSlug,
    name: kotlinTitle,
    art: withMono(kotlinSlug, kotlinVariants),
    category: "languages",
    aliases: ["kt"],
  },
  {
    slug: springBootSlug,
    name: springBootTitle,
    art: withMono(springBootSlug, springBootVariants),
    category: "languages",
    aliases: ["spring"],
  },
  {
    slug: svelteSlug,
    name: svelteTitle,
    art: withMono(svelteSlug, svelteVariants),
    category: "languages",
    aliases: ["sveltekit"],
  },
  {
    slug: swiftSlug,
    name: swiftTitle,
    art: withMono(swiftSlug, swiftVariants),
    category: "languages",
    aliases: ["ios", "swiftui"],
  },
  {
    slug: vueSlug,
    name: vueTitle,
    art: derivedMono(vueSlug, vueSvg, vueLicence),
    category: "languages",
    aliases: ["vuejs", "nuxt"],
  },
  /* -- Data & Databases ----------------------------------------------------- */
  {
    slug: airflowSlug,
    name: airflowTitle,
    art: withMono(airflowSlug, airflowVariants),
    category: "databases",
    aliases: ["airflow", "dag", "etl"],
  },
  {
    slug: sparkSlug,
    name: sparkTitle,
    art: withMono(sparkSlug, sparkVariants),
    category: "databases",
    aliases: ["spark", "batch"],
  },
  {
    slug: cockroachdbSlug,
    name: cockroachdbTitle,
    art: monoFromAlternate(
      cockroachdbSlug,
      cockroachdbSvg,
      cockroachLabsVariants,
      cockroachLabsLicence,
    ),
    category: "databases",
    aliases: ["crdb", "distributed sql"],
  },
  {
    slug: dbtSlug,
    name: dbtTitle,
    art: colourOnly(dbtSvg),
    category: "databases",
    aliases: ["data build tool"],
  },
  {
    slug: influxdbSlug,
    name: influxdbTitle,
    art: withMono(influxdbSlug, influxdbVariants),
    category: "databases",
    aliases: ["time series", "tsdb"],
  },
  {
    slug: mariadbSlug,
    name: mariadbTitle,
    art: withMono(mariadbSlug, mariadbVariants),
    category: "databases",
    aliases: ["maria"],
  },
  {
    slug: mssqlSlug,
    name: mssqlTitle,
    art: derivedMono(mssqlSlug, mssqlSvg, mssqlLicence),
    category: "databases",
    aliases: ["mssql", "sql server"],
  },
  {
    slug: neo4jSlug,
    name: neo4jTitle,
    art: withMono(neo4jSlug, neo4jVariants),
    category: "databases",
    aliases: ["graph db", "cypher"],
  },
  {
    slug: oracleSlug,
    name: oracleTitle,
    art: colourOnly(oracleSvg),
    category: "databases",
    aliases: ["oracle db", "plsql"],
  },
  {
    slug: snowflakeSlug,
    name: snowflakeTitle,
    art: withMono(snowflakeSlug, snowflakeVariants),
    category: "databases",
    aliases: ["data warehouse"],
  },
  {
    slug: supabaseSlug,
    name: supabaseTitle,
    art: withMono(supabaseSlug, supabaseVariants),
    category: "databases",
    aliases: ["baas"],
  },
  /* -- Caching & Messaging -------------------------------------------------- */
  {
    slug: pulsarSlug,
    name: pulsarTitle,
    art: withMono(pulsarSlug, pulsarVariants),
    category: "messaging",
    aliases: ["pulsar"],
  },
  {
    slug: celerySlug,
    name: celeryTitle,
    art: withMono(celerySlug, celeryVariants),
    category: "messaging",
    aliases: ["task queue", "worker"],
  },
  {
    slug: temporalSlug,
    name: temporalTitle,
    art: withMono(temporalSlug, temporalVariants),
    category: "messaging",
    aliases: ["workflow", "durable execution"],
  },
  /* -- Networking & Edge ---------------------------------------------------- */
  {
    slug: istioSlug,
    name: istioTitle,
    art: withMono(istioSlug, istioVariants),
    category: "networking",
    aliases: ["service mesh"],
  },
  {
    slug: traefikSlug,
    name: traefikTitle,
    art: colourOnly(traefikSvg),
    category: "networking",
    aliases: ["ingress", "reverse proxy"],
  },
  /* -- Cloud ----------------------------------------------------------------- */
  {
    slug: databricksSlug,
    name: databricksTitle,
    art: withMono(databricksSlug, databricksVariants),
    category: "cloud",
    aliases: ["lakehouse"],
  },
  {
    slug: digitaloceanSlug,
    name: digitaloceanTitle,
    art: withMono(digitaloceanSlug, digitaloceanVariants),
    category: "cloud",
    aliases: ["droplet"],
  },
  {
    slug: herokuSlug,
    name: herokuTitle,
    art: derivedMono(herokuSlug, herokuSvg, herokuLicence),
    category: "cloud",
    aliases: ["paas", "dyno"],
  },
  {
    slug: minioSlug,
    name: minioTitle,
    art: withMono(minioSlug, minioVariants),
    category: "cloud",
    aliases: ["object storage", "s3 compatible"],
  },
  {
    slug: netlifySlug,
    name: netlifyTitle,
    art: withMono(netlifySlug, netlifyVariants),
    category: "cloud",
    aliases: ["jamstack"],
  },
  {
    slug: vercelSlug,
    name: vercelTitle,
    art: alwaysMono(vercelSlug, vercelVariants),
    category: "cloud",
    aliases: ["hosting"],
  },
  /* -- CI/CD & DevOps --------------------------------------------------------- */
  {
    slug: ansibleSlug,
    name: ansibleTitle,
    art: withMono(ansibleSlug, ansibleVariants),
    category: "devops",
    aliases: ["playbook", "configuration management"],
  },
  {
    slug: argocdSlug,
    // thesvg titles it "Argocd"; the project spells itself "Argo CD".
    name: "Argo CD",
    art: withMono(argocdSlug, argocdVariants),
    category: "devops",
    aliases: ["argo", "gitops"],
  },
  {
    slug: circleciSlug,
    name: circleciTitle,
    art: withMono(circleciSlug, circleciVariants),
    category: "devops",
    aliases: ["ci"],
  },
  {
    slug: githubSlug,
    name: githubTitle,
    art: withMono(githubSlug, githubVariants),
    category: "devops",
    aliases: ["gh", "git"],
  },
  {
    slug: githubActionsSlug,
    name: githubActionsTitle,
    art: withMono(githubActionsSlug, githubActionsVariants),
    category: "devops",
    aliases: ["ci", "workflow"],
  },
  {
    slug: gitlabSlug,
    name: gitlabTitle,
    art: withMono(gitlabSlug, gitlabVariants),
    category: "devops",
    aliases: ["git", "ci"],
  },
  {
    slug: helmSlug,
    name: helmTitle,
    art: withMono(helmSlug, helmVariants),
    category: "devops",
    aliases: ["chart", "k8s package"],
  },
  {
    slug: jenkinsSlug,
    name: jenkinsTitle,
    art: withMono(jenkinsSlug, jenkinsVariants),
    category: "devops",
    aliases: ["ci", "build server"],
  },
  {
    slug: vaultSlug,
    name: vaultTitle,
    art: withMono(vaultSlug, vaultVariants),
    category: "devops",
    aliases: ["hashicorp", "secrets"],
  },
  /* -- Observability ----------------------------------------------------------- */
  {
    slug: datadogSlug,
    name: datadogTitle,
    art: withMono(datadogSlug, datadogVariants),
    category: "observability",
    aliases: ["apm"],
  },
  {
    slug: grafanaSlug,
    name: grafanaTitle,
    art: withMono(grafanaSlug, grafanaVariants),
    category: "observability",
    aliases: ["dashboards"],
  },
  {
    slug: newRelicSlug,
    name: newRelicTitle,
    art: withMono(newRelicSlug, newRelicVariants),
    category: "observability",
    aliases: ["apm"],
  },
  {
    slug: otelSlug,
    name: otelTitle,
    art: withMono(otelSlug, otelVariants),
    category: "observability",
    aliases: ["otel", "tracing"],
  },
  {
    slug: prometheusSlug,
    name: prometheusTitle,
    art: withMono(prometheusSlug, prometheusVariants),
    category: "observability",
    aliases: ["metrics"],
  },
  {
    slug: sentrySlug,
    name: sentryTitle,
    art: withMono(sentrySlug, sentryVariants),
    category: "observability",
    aliases: ["error tracking", "crash"],
  },
  {
    slug: splunkSlug,
    name: splunkTitle,
    art: withMono(splunkSlug, splunkVariants),
    category: "observability",
    aliases: ["siem", "logs"],
  },
  /* -- SaaS & Identity --------------------------------------------------------- */
  {
    slug: anthropicSlug,
    name: anthropicTitle,
    art: alwaysMono(anthropicSlug, anthropicVariants),
    category: "saas",
    aliases: ["claude", "llm"],
  },
  {
    slug: auth0Slug,
    name: auth0Title,
    art: withMono(auth0Slug, auth0Variants),
    category: "saas",
    aliases: ["auth", "oauth"],
  },
  {
    slug: keycloakSlug,
    name: keycloakTitle,
    art: withMono(keycloakSlug, keycloakVariants),
    category: "saas",
    aliases: ["sso", "oidc"],
  },
  {
    slug: oktaSlug,
    name: oktaTitle,
    art: withMono(oktaSlug, oktaVariants),
    category: "saas",
    aliases: ["sso", "identity"],
  },
  {
    slug: openaiSlug,
    name: openaiTitle,
    art: alwaysMono(openaiSlug, openaiVariants),
    category: "saas",
    aliases: ["gpt", "chatgpt", "llm"],
  },
  {
    slug: stripeSlug,
    name: stripeTitle,
    art: withMono(stripeSlug, stripeVariants),
    category: "saas",
    aliases: ["payments", "billing"],
  },
  {
    slug: twilioSlug,
    name: twilioTitle,
    art: derivedMono(twilioSlug, twilioSvg, twilioLicence),
    category: "saas",
    aliases: ["sms", "voice"],
  },
];

export const BRAND_ICON_DEFS: readonly IconSource[] =
  BRAND_ENTRIES.map(brandDef);
