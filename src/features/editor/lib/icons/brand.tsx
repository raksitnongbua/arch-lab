import type { SVGProps } from "react";
import type { IconVariants } from "thesvg";

import type { IconCategory } from "./categories";
import type { IconDef } from "./registry";

/**
 * Named-and-renamed imports, three bindings per icon, DELIBERATELY — a
 * default import was tried first and shipped ~284KB of dead strings per
 * chunk: each module's default export is an object literal referencing every
 * export, including a `variants` record that carries the mono/light/dark/
 * wordmark artwork as full SVG strings, so importing the default keeps them
 * all alive past tree-shaking. Importing only the consts we read lets the
 * bundler drop the unused variants, `license` and `url`. `slug`/`title` come
 * from the package rather than being retyped here (dry.md — the import path
 * already pins which module they belong to).
 *
 * The three brands that are monochrome BY DESIGN (Vercel, Anthropic, OpenAI)
 * import `variants` instead: their default artwork is white ink, and they
 * take the upstream ink-free variant so they can follow the theme in both
 * directions — see `inkFreeVariant`.
 */
import {
  slug as angularSlug,
  title as angularTitle,
  svg as angularSvg,
} from "thesvg/angular";
import {
  slug as ansibleSlug,
  title as ansibleTitle,
  svg as ansibleSvg,
} from "thesvg/ansible";
import {
  slug as anthropicSlug,
  title as anthropicTitle,
  variants as anthropicVariants,
} from "thesvg/anthropic";
import {
  slug as airflowSlug,
  title as airflowTitle,
  svg as airflowSvg,
} from "thesvg/apache-airflow";
import {
  slug as pulsarSlug,
  title as pulsarTitle,
  svg as pulsarSvg,
} from "thesvg/apache-pulsar";
import {
  slug as sparkSlug,
  title as sparkTitle,
  svg as sparkSvg,
} from "thesvg/apache-spark";
import { slug as argocdSlug, svg as argocdSvg } from "thesvg/argocd";
import {
  slug as auth0Slug,
  title as auth0Title,
  svg as auth0Svg,
} from "thesvg/auth0";
import { slug as bunSlug, title as bunTitle, svg as bunSvg } from "thesvg/bun";
import {
  slug as celerySlug,
  title as celeryTitle,
  svg as celerySvg,
} from "thesvg/celery";
import {
  slug as circleciSlug,
  title as circleciTitle,
  svg as circleciSvg,
} from "thesvg/circleci";
import {
  slug as cockroachdbSlug,
  title as cockroachdbTitle,
  svg as cockroachdbSvg,
} from "thesvg/cockroachdb";
import {
  slug as cplusplusSlug,
  title as cplusplusTitle,
  svg as cplusplusSvg,
} from "thesvg/cplusplus";
import {
  slug as databricksSlug,
  title as databricksTitle,
  svg as databricksSvg,
} from "thesvg/databricks";
import {
  slug as datadogSlug,
  title as datadogTitle,
  svg as datadogSvg,
} from "thesvg/datadog";
import { slug as dbtSlug, title as dbtTitle, svg as dbtSvg } from "thesvg/dbt";
import {
  slug as digitaloceanSlug,
  title as digitaloceanTitle,
  svg as digitaloceanSvg,
} from "thesvg/digitalocean";
import {
  slug as flutterSlug,
  title as flutterTitle,
  svg as flutterSvg,
} from "thesvg/flutter";
import {
  slug as githubSlug,
  title as githubTitle,
  svg as githubSvg,
} from "thesvg/github";
import {
  slug as githubActionsSlug,
  title as githubActionsTitle,
  svg as githubActionsSvg,
} from "thesvg/github-actions";
import {
  slug as gitlabSlug,
  title as gitlabTitle,
  svg as gitlabSvg,
} from "thesvg/gitlab";
import {
  slug as grafanaSlug,
  title as grafanaTitle,
  svg as grafanaSvg,
} from "thesvg/grafana";
import {
  slug as helmSlug,
  title as helmTitle,
  svg as helmSvg,
} from "thesvg/helm";
import {
  slug as herokuSlug,
  title as herokuTitle,
  svg as herokuSvg,
} from "thesvg/heroku";
import {
  slug as influxdbSlug,
  title as influxdbTitle,
  svg as influxdbSvg,
} from "thesvg/influxdb";
import {
  slug as istioSlug,
  title as istioTitle,
  svg as istioSvg,
} from "thesvg/istio";
import {
  slug as jenkinsSlug,
  title as jenkinsTitle,
  svg as jenkinsSvg,
} from "thesvg/jenkins";
import {
  slug as keycloakSlug,
  title as keycloakTitle,
  svg as keycloakSvg,
} from "thesvg/keycloak";
import {
  slug as kotlinSlug,
  title as kotlinTitle,
  svg as kotlinSvg,
} from "thesvg/kotlin";
import {
  slug as mariadbSlug,
  title as mariadbTitle,
  svg as mariadbSvg,
} from "thesvg/mariadb";
import {
  slug as mssqlSlug,
  title as mssqlTitle,
  svg as mssqlSvg,
} from "thesvg/microsoft-sql-server";
import {
  slug as minioSlug,
  title as minioTitle,
  svg as minioSvg,
} from "thesvg/minio";
import {
  slug as neo4jSlug,
  title as neo4jTitle,
  svg as neo4jSvg,
} from "thesvg/neo4j";
import {
  slug as netlifySlug,
  title as netlifyTitle,
  svg as netlifySvg,
} from "thesvg/netlify";
import {
  slug as newRelicSlug,
  title as newRelicTitle,
  svg as newRelicSvg,
} from "thesvg/new-relic";
import {
  slug as oktaSlug,
  title as oktaTitle,
  svg as oktaSvg,
} from "thesvg/okta";
import {
  slug as openaiSlug,
  title as openaiTitle,
  variants as openaiVariants,
} from "thesvg/openai";
import {
  slug as otelSlug,
  title as otelTitle,
  svg as otelSvg,
} from "thesvg/opentelemetry";
import {
  slug as oracleSlug,
  title as oracleTitle,
  svg as oracleSvg,
} from "thesvg/oracle";
import {
  slug as prometheusSlug,
  title as prometheusTitle,
  svg as prometheusSvg,
} from "thesvg/prometheus";
import {
  slug as sentrySlug,
  title as sentryTitle,
  svg as sentrySvg,
} from "thesvg/sentry";
import {
  slug as snowflakeSlug,
  title as snowflakeTitle,
  svg as snowflakeSvg,
} from "thesvg/snowflake";
import {
  slug as splunkSlug,
  title as splunkTitle,
  svg as splunkSvg,
} from "thesvg/splunk";
import {
  slug as springBootSlug,
  title as springBootTitle,
  svg as springBootSvg,
} from "thesvg/spring-boot";
import {
  slug as stripeSlug,
  title as stripeTitle,
  svg as stripeSvg,
} from "thesvg/stripe";
import {
  slug as supabaseSlug,
  title as supabaseTitle,
  svg as supabaseSvg,
} from "thesvg/supabase";
import {
  slug as svelteSlug,
  title as svelteTitle,
  svg as svelteSvg,
} from "thesvg/svelte";
import {
  slug as swiftSlug,
  title as swiftTitle,
  svg as swiftSvg,
} from "thesvg/swift";
import {
  slug as temporalSlug,
  title as temporalTitle,
  svg as temporalSvg,
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
} from "thesvg/twilio";
import {
  slug as vaultSlug,
  title as vaultTitle,
  svg as vaultSvg,
} from "thesvg/vault";
import {
  slug as vercelSlug,
  title as vercelTitle,
  variants as vercelVariants,
} from "thesvg/vercel";
import { slug as vueSlug, title as vueTitle, svg as vueSvg } from "thesvg/vue";

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

const ROOT_RE = /^\s*(?:<\?xml[^?]*\?>\s*)?<svg\b([^>]*)>([\s\S]*)<\/svg>\s*$/;

/**
 * Splits one brand SVG into the pieces our own `<svg>` root re-hosts: the
 * `viewBox`, and the inner markup with the original root's PAINT attributes
 * (fill, stroke, style, …) preserved on a wrapping `<g>` — several marks
 * (Prometheus, the OpenAI/Anthropic light variants) colour their paths only
 * through root-level inheritance, so dropping those attributes would render
 * them invisible.
 *
 * Internal `id`s are prefixed with the icon's slug. This is the one edit ever
 * made to brand markup, and it is serialisation plumbing, not a design change
 * (visually byte-identical, like minification): gradient ids in the package
 * are generic (`a`, `b`, `SVGID_1_`), and two icons embedded in one exported
 * document would otherwise capture each other's `url(#…)` references.
 *
 * Throws on anything it cannot make safe. The registry module loads while
 * `pnpm build` prerenders, so a bad curation fails the build loudly instead
 * of shipping a broken or bleeding icon.
 */
function splitBrandSvg(
  slug: string,
  svg: string,
): { viewBox: string; inner: string } {
  const match = ROOT_RE.exec(svg);
  if (match === null) {
    throw new Error(`brand icon "${slug}": markup is not a single <svg> root`);
  }
  const [, rootAttrs, body] = match;

  const viewBox = /viewBox="([^"]+)"/.exec(rootAttrs)?.[1];
  if (viewBox === undefined) {
    throw new Error(`brand icon "${slug}": root has no viewBox`);
  }
  for (const tag of FORBIDDEN_MARKUP) {
    if (body.includes(tag)) {
      throw new Error(
        `brand icon "${slug}": contains ${tag} — pick a variant without it`,
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
  const baked = /\b(?:fill|stroke)="(?!none\b|currentColor\b)[^"]+"/.exec(
    markup,
  );
  if (baked !== null) {
    throw new Error(
      `brand icon "${slug}": expected ink-free artwork to inherit ` +
        `currentColor, but it bakes in ${baked[0]} — a baked ink is ` +
        `invisible in one of the two themes`,
    );
  }
  return markup;
}

/* -------------------------------------------------------------------------- */
/* The component and def factories                                             */
/* -------------------------------------------------------------------------- */

/**
 * A registry-shaped component around one brand mark. The inner markup goes in
 * via `dangerouslySetInnerHTML`: it is TRUSTED PACKAGE CONTENT, pinned by the
 * lockfile — never user input, never network — sanitised above for document
 * hygiene (not for injection). Re-hosting under our own `<svg>` root keeps the
 * registry contract (`React.FC<SVGProps<SVGSVGElement>>`) and keeps the
 * exporter's capture working: its `innerHTML` snapshot must start with
 * `<svg ` for `embeddedIconSvg` to inject position and size.
 */
function brandSvgComponent(
  slug: string,
  markup: string,
  monochrome: boolean,
): React.FC<SVGProps<SVGSVGElement>> {
  const { viewBox, inner } = splitBrandSvg(slug, markup);
  const html = { __html: inner };
  /* `fill` is an INHERITED property, so declaring it once on our root reaches
     every path of an ink-free mark (`inkFreeVariant` guarantees none of them
     overrides it). Coloured marks must not carry this: it would be the
     recolouring the registry forbids. */
  const fill = monochrome ? "currentColor" : undefined;
  return function BrandIcon(props: SVGProps<SVGSVGElement>) {
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

interface BrandEntry {
  /** thesvg's slug, imported from the module the path already names. */
  slug: string;
  /** Display name — thesvg's title, overridden where it misspells the brand. */
  name: string;
  /** The artwork actually rendered: the default, or an ink-free variant. */
  svg: string;
  category: IconCategory;
  aliases: string[];
  /**
   * True ONLY for the brands that are monochrome by design and ship ink-free
   * artwork (`inkFreeVariant`): they follow `currentColor` like the
   * hand-authored set. Defaults to false — a brand with real colours keeps
   * them, and nothing may set this to force one into the theme.
   */
  monochrome?: boolean;
}

function brandDef(entry: BrandEntry): IconDef {
  const monochrome = entry.monochrome ?? false;
  return {
    slug: entry.slug,
    name: entry.name,
    aliases: entry.aliases,
    category: entry.category,
    Svg: brandSvgComponent(entry.slug, entry.svg, monochrome),
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
    svg: angularSvg,
    category: "languages",
    aliases: ["ng"],
  },
  {
    slug: bunSlug,
    name: bunTitle,
    svg: bunSvg,
    category: "languages",
    aliases: ["bunjs"],
  },
  {
    slug: cplusplusSlug,
    name: cplusplusTitle,
    svg: cplusplusSvg,
    category: "languages",
    aliases: ["cpp", "c plus plus"],
  },
  {
    slug: flutterSlug,
    name: flutterTitle,
    svg: flutterSvg,
    category: "languages",
    aliases: ["dart"],
  },
  {
    slug: kotlinSlug,
    name: kotlinTitle,
    svg: kotlinSvg,
    category: "languages",
    aliases: ["kt"],
  },
  {
    slug: springBootSlug,
    name: springBootTitle,
    svg: springBootSvg,
    category: "languages",
    aliases: ["spring"],
  },
  {
    slug: svelteSlug,
    name: svelteTitle,
    svg: svelteSvg,
    category: "languages",
    aliases: ["sveltekit"],
  },
  {
    slug: swiftSlug,
    name: swiftTitle,
    svg: swiftSvg,
    category: "languages",
    aliases: ["ios", "swiftui"],
  },
  {
    slug: vueSlug,
    name: vueTitle,
    svg: vueSvg,
    category: "languages",
    aliases: ["vuejs", "nuxt"],
  },
  /* -- Data & Databases ----------------------------------------------------- */
  {
    slug: airflowSlug,
    name: airflowTitle,
    svg: airflowSvg,
    category: "databases",
    aliases: ["airflow", "dag", "etl"],
  },
  {
    slug: sparkSlug,
    name: sparkTitle,
    svg: sparkSvg,
    category: "databases",
    aliases: ["spark", "batch"],
  },
  {
    slug: cockroachdbSlug,
    name: cockroachdbTitle,
    svg: cockroachdbSvg,
    category: "databases",
    aliases: ["crdb", "distributed sql"],
  },
  {
    slug: dbtSlug,
    name: dbtTitle,
    svg: dbtSvg,
    category: "databases",
    aliases: ["data build tool"],
  },
  {
    slug: influxdbSlug,
    name: influxdbTitle,
    svg: influxdbSvg,
    category: "databases",
    aliases: ["time series", "tsdb"],
  },
  {
    slug: mariadbSlug,
    name: mariadbTitle,
    svg: mariadbSvg,
    category: "databases",
    aliases: ["maria"],
  },
  {
    slug: mssqlSlug,
    name: mssqlTitle,
    svg: mssqlSvg,
    category: "databases",
    aliases: ["mssql", "sql server"],
  },
  {
    slug: neo4jSlug,
    name: neo4jTitle,
    svg: neo4jSvg,
    category: "databases",
    aliases: ["graph db", "cypher"],
  },
  {
    slug: oracleSlug,
    name: oracleTitle,
    svg: oracleSvg,
    category: "databases",
    aliases: ["oracle db", "plsql"],
  },
  {
    slug: snowflakeSlug,
    name: snowflakeTitle,
    svg: snowflakeSvg,
    category: "databases",
    aliases: ["data warehouse"],
  },
  {
    slug: supabaseSlug,
    name: supabaseTitle,
    svg: supabaseSvg,
    category: "databases",
    aliases: ["baas"],
  },
  /* -- Caching & Messaging -------------------------------------------------- */
  {
    slug: pulsarSlug,
    name: pulsarTitle,
    svg: pulsarSvg,
    category: "messaging",
    aliases: ["pulsar"],
  },
  {
    slug: celerySlug,
    name: celeryTitle,
    svg: celerySvg,
    category: "messaging",
    aliases: ["task queue", "worker"],
  },
  {
    slug: temporalSlug,
    name: temporalTitle,
    svg: temporalSvg,
    category: "messaging",
    aliases: ["workflow", "durable execution"],
  },
  /* -- Networking & Edge ---------------------------------------------------- */
  {
    slug: istioSlug,
    name: istioTitle,
    svg: istioSvg,
    category: "networking",
    aliases: ["service mesh"],
  },
  {
    slug: traefikSlug,
    name: traefikTitle,
    svg: traefikSvg,
    category: "networking",
    aliases: ["ingress", "reverse proxy"],
  },
  /* -- Cloud ----------------------------------------------------------------- */
  {
    slug: databricksSlug,
    name: databricksTitle,
    svg: databricksSvg,
    category: "cloud",
    aliases: ["lakehouse"],
  },
  {
    slug: digitaloceanSlug,
    name: digitaloceanTitle,
    svg: digitaloceanSvg,
    category: "cloud",
    aliases: ["droplet"],
  },
  {
    slug: herokuSlug,
    name: herokuTitle,
    svg: herokuSvg,
    category: "cloud",
    aliases: ["paas", "dyno"],
  },
  {
    slug: minioSlug,
    name: minioTitle,
    svg: minioSvg,
    category: "cloud",
    aliases: ["object storage", "s3 compatible"],
  },
  {
    slug: netlifySlug,
    name: netlifyTitle,
    svg: netlifySvg,
    category: "cloud",
    aliases: ["jamstack"],
  },
  {
    slug: vercelSlug,
    name: vercelTitle,
    svg: inkFreeVariant(vercelSlug, vercelVariants),
    monochrome: true,
    category: "cloud",
    aliases: ["hosting"],
  },
  /* -- CI/CD & DevOps --------------------------------------------------------- */
  {
    slug: ansibleSlug,
    name: ansibleTitle,
    svg: ansibleSvg,
    category: "devops",
    aliases: ["playbook", "configuration management"],
  },
  {
    slug: argocdSlug,
    // thesvg titles it "Argocd"; the project spells itself "Argo CD".
    name: "Argo CD",
    svg: argocdSvg,
    category: "devops",
    aliases: ["argo", "gitops"],
  },
  {
    slug: circleciSlug,
    name: circleciTitle,
    svg: circleciSvg,
    category: "devops",
    aliases: ["ci"],
  },
  {
    slug: githubSlug,
    name: githubTitle,
    svg: githubSvg,
    category: "devops",
    aliases: ["gh", "git"],
  },
  {
    slug: githubActionsSlug,
    name: githubActionsTitle,
    svg: githubActionsSvg,
    category: "devops",
    aliases: ["ci", "workflow"],
  },
  {
    slug: gitlabSlug,
    name: gitlabTitle,
    svg: gitlabSvg,
    category: "devops",
    aliases: ["git", "ci"],
  },
  {
    slug: helmSlug,
    name: helmTitle,
    svg: helmSvg,
    category: "devops",
    aliases: ["chart", "k8s package"],
  },
  {
    slug: jenkinsSlug,
    name: jenkinsTitle,
    svg: jenkinsSvg,
    category: "devops",
    aliases: ["ci", "build server"],
  },
  {
    slug: vaultSlug,
    name: vaultTitle,
    svg: vaultSvg,
    category: "devops",
    aliases: ["hashicorp", "secrets"],
  },
  /* -- Observability ----------------------------------------------------------- */
  {
    slug: datadogSlug,
    name: datadogTitle,
    svg: datadogSvg,
    category: "observability",
    aliases: ["apm"],
  },
  {
    slug: grafanaSlug,
    name: grafanaTitle,
    svg: grafanaSvg,
    category: "observability",
    aliases: ["dashboards"],
  },
  {
    slug: newRelicSlug,
    name: newRelicTitle,
    svg: newRelicSvg,
    category: "observability",
    aliases: ["apm"],
  },
  {
    slug: otelSlug,
    name: otelTitle,
    svg: otelSvg,
    category: "observability",
    aliases: ["otel", "tracing"],
  },
  {
    slug: prometheusSlug,
    name: prometheusTitle,
    svg: prometheusSvg,
    category: "observability",
    aliases: ["metrics"],
  },
  {
    slug: sentrySlug,
    name: sentryTitle,
    svg: sentrySvg,
    category: "observability",
    aliases: ["error tracking", "crash"],
  },
  {
    slug: splunkSlug,
    name: splunkTitle,
    svg: splunkSvg,
    category: "observability",
    aliases: ["siem", "logs"],
  },
  /* -- SaaS & Identity --------------------------------------------------------- */
  {
    slug: anthropicSlug,
    name: anthropicTitle,
    svg: inkFreeVariant(anthropicSlug, anthropicVariants),
    monochrome: true,
    category: "saas",
    aliases: ["claude", "llm"],
  },
  {
    slug: auth0Slug,
    name: auth0Title,
    svg: auth0Svg,
    category: "saas",
    aliases: ["auth", "oauth"],
  },
  {
    slug: keycloakSlug,
    name: keycloakTitle,
    svg: keycloakSvg,
    category: "saas",
    aliases: ["sso", "oidc"],
  },
  {
    slug: oktaSlug,
    name: oktaTitle,
    svg: oktaSvg,
    category: "saas",
    aliases: ["sso", "identity"],
  },
  {
    slug: openaiSlug,
    name: openaiTitle,
    svg: inkFreeVariant(openaiSlug, openaiVariants),
    monochrome: true,
    category: "saas",
    aliases: ["gpt", "chatgpt", "llm"],
  },
  {
    slug: stripeSlug,
    name: stripeTitle,
    svg: stripeSvg,
    category: "saas",
    aliases: ["payments", "billing"],
  },
  {
    slug: twilioSlug,
    name: twilioTitle,
    svg: twilioSvg,
    category: "saas",
    aliases: ["sms", "voice"],
  },
];

export const BRAND_ICON_DEFS: readonly IconDef[] = BRAND_ENTRIES.map(brandDef);
