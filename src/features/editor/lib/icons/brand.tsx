import type { IconVariants } from "thesvg";

import { hasBakedInk, packagedSvgComponent, stripInk } from "./embed";
import type { IconCategory } from "./categories";
import type { IconSource } from "./registry";

/**
 * Every brand mark in the registry, from ONE source: the `thesvg` package.
 *
 * WHAT THIS REPLACED, and why. The registry used to draw named products with
 * hand-authored monochrome SVGs and reach for the package only to fill gaps,
 * which produced three visual families on one canvas — a hand-drawn Postgres
 * elephant beside the vendor's own Redis logo beside a lucide glyph — and
 * left half the set with no colour version at all. Colour mode could not
 * look coherent while a third of its marks had no colour to show. All 38
 * hand-drawn product marks are gone; every product now comes from here, in
 * both styles wherever the package publishes both.
 *
 * SLUGS ARE UNCHANGED by that swap, which is the entire reason the model
 * stores a slug and never artwork: `@postgresql` in a document written a year
 * ago resolves to the new drawing with no migration. Where the package's own
 * name differs from ours the module is simply imported under our slug —
 * `golang` reads `thesvg/go`, `gcp` reads `thesvg/google-cloud`.
 *
 * NAMES AND ALIASES ARE OURS, not the package's. They are search keys people
 * type ("pg", "postgres") and the package's titles are occasionally wrong or
 * over-formal; that curation survived the swap deliberately.
 *
 * The concepts with no logo — a database, a queue, a person — are NOT here.
 * They come from lucide (`./generic`), because there is nothing for a brand
 * set to say about them.
 */

import { variants as angularVariants } from "thesvg/angular";
import { variants as ansibleVariants } from "thesvg/ansible";
import { variants as argocdVariants } from "thesvg/argocd";
import { variants as anthropicVariants } from "thesvg/anthropic";
import { variants as apacheAirflowVariants } from "thesvg/apache-airflow";
import {
  license as cassandraAltLicence,
  variants as cassandraAltVariants,
} from "thesvg/apache-cassandra";
import { variants as kafkaAltVariants } from "thesvg/apache-kafka";
import { variants as apachePulsarVariants } from "thesvg/apache-pulsar";
import { variants as apacheSparkVariants } from "thesvg/apache-spark";
import { variants as auth0Variants } from "thesvg/auth0";
import { variants as awsVariants } from "thesvg/aws";
import { svg as s3Svg } from "thesvg/aws-amazon-simple-storage-service";
import { svg as azureSvg } from "thesvg/azure";
import { variants as bunVariants } from "thesvg/bun";
import { svg as cassandraSvg } from "thesvg/cassandra";
import { variants as celeryVariants } from "thesvg/celery";
import { variants as circleciVariants } from "thesvg/circleci";
import { variants as clickhouseVariants } from "thesvg/clickhouse";
import { variants as cloudflareVariants } from "thesvg/cloudflare";
import { svg as cockroachdbSvg } from "thesvg/cockroachdb";
/* Mono artwork only. The package catalogues the company separately from the
   product and only the company entry publishes a mono variant; our slug stays
   `cockroachdb` (monoFromAlternate explains why). */
import {
  license as cockroachLabsLicence,
  variants as cockroachLabsVariants,
} from "thesvg/cockroach-labs";
import { variants as cplusplusVariants } from "thesvg/cplusplus";
import { variants as databricksVariants } from "thesvg/databricks";
import { variants as datadogVariants } from "thesvg/datadog";
import { svg as dbtSvg } from "thesvg/dbt";
import { variants as digitaloceanVariants } from "thesvg/digitalocean";
import { variants as dockerVariants } from "thesvg/docker";
import { variants as dotnetVariants } from "thesvg/dotnet";
import { variants as dynamodbVariants } from "thesvg/dynamodb";
import { variants as elasticsearchVariants } from "thesvg/elasticsearch";
import { svg as envoySvg } from "thesvg/envoy";
import {
  license as envoyAltLicence,
  variants as envoyAltVariants,
} from "thesvg/envoy-proxy";
import { variants as firebaseVariants } from "thesvg/firebase";
import { variants as flutterVariants } from "thesvg/flutter";
import { variants as githubVariants } from "thesvg/github";
import { variants as githubActionsVariants } from "thesvg/github-actions";
import { variants as gitlabVariants } from "thesvg/gitlab";
import { variants as golangVariants } from "thesvg/go";
import { variants as gcpVariants } from "thesvg/google-cloud";
import { variants as grafanaVariants } from "thesvg/grafana";
import { variants as graphqlVariants } from "thesvg/graphql";
import { variants as grpcVariants } from "thesvg/grpc";
import { variants as helmVariants } from "thesvg/helm";
import { license as herokuLicence, svg as herokuSvg } from "thesvg/heroku";
import { variants as influxdbVariants } from "thesvg/influxdb";
import { variants as istioVariants } from "thesvg/istio";
import { license as javaLicence, svg as javaSvg } from "thesvg/java";
import { variants as jenkinsVariants } from "thesvg/jenkins";
import { variants as keycloakVariants } from "thesvg/keycloak";
import { variants as kongVariants } from "thesvg/kong";
import { variants as kotlinVariants } from "thesvg/kotlin";
import { variants as kubernetesVariants } from "thesvg/kubernetes";
import { variants as lambdaVariants } from "thesvg/lambda";
import { variants as mariadbVariants } from "thesvg/mariadb";
import { variants as memcachedVariants } from "thesvg/memcached";
import {
  license as microsoftSqlServerLicence,
  svg as microsoftSqlServerSvg,
} from "thesvg/microsoft-sql-server";
import { variants as minioVariants } from "thesvg/minio";
import { variants as mongodbVariants } from "thesvg/mongodb";
import { variants as mysqlVariants } from "thesvg/mysql";
import { svg as natsSvg } from "thesvg/nats";
import {
  license as natsAltLicence,
  variants as natsAltVariants,
} from "thesvg/natsdotio";
import { variants as neo4jVariants } from "thesvg/neo4j";
import { variants as netlifyVariants } from "thesvg/netlify";
import { variants as newRelicVariants } from "thesvg/new-relic";
import {
  license as nextjsAltLicence,
  variants as nextjsAltVariants,
} from "thesvg/nextdotjs";
import { svg as nextjsSvg } from "thesvg/nextjs";
import { variants as nginxVariants } from "thesvg/nginx";
import {
  license as nodejsAltLicence,
  variants as nodejsAltVariants,
} from "thesvg/nodedotjs";
import { svg as nodejsSvg } from "thesvg/nodejs";
import { variants as oktaVariants } from "thesvg/okta";
import { variants as openaiVariants } from "thesvg/openai";
import { variants as opentelemetryVariants } from "thesvg/opentelemetry";
import { variants as phpVariants } from "thesvg/php";
import { variants as postgresqlVariants } from "thesvg/postgresql";
import { variants as prometheusVariants } from "thesvg/prometheus";
import { variants as pythonVariants } from "thesvg/python";
import { variants as rabbitmqVariants } from "thesvg/rabbitmq";
import { variants as reactVariants } from "thesvg/react";
import { variants as redisVariants } from "thesvg/redis";
import { variants as rustVariants } from "thesvg/rust";
import { variants as sentryVariants } from "thesvg/sentry";
import { variants as snowflakeVariants } from "thesvg/snowflake";
import { variants as splunkVariants } from "thesvg/splunk";
import { variants as springBootVariants } from "thesvg/spring-boot";
import { variants as sqliteVariants } from "thesvg/sqlite";
import { variants as stripeVariants } from "thesvg/stripe";
import { variants as supabaseVariants } from "thesvg/supabase";
import { variants as svelteVariants } from "thesvg/svelte";
import { variants as swiftVariants } from "thesvg/swift";
import { variants as temporalVariants } from "thesvg/temporal";
import { variants as terraformVariants } from "thesvg/terraform";
import { license as traefikLicence, svg as traefikSvg } from "thesvg/traefik";
import { license as twilioLicence, svg as twilioSvg } from "thesvg/twilio";
import { variants as typescriptVariants } from "thesvg/typescript";
import { variants as vaultVariants } from "thesvg/vault";
import { variants as vercelVariants } from "thesvg/vercel";
import { license as vueLicence, svg as vueSvg } from "thesvg/vue";

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
 * A mark whose ONLY published colour fails one of our two themes, so the
 * monochrome rendering is used in BOTH styles.
 *
 * Heroku is the case: its brand colour is #430098, a purple dark enough to
 * vanish against a dark canvas — measured, not guessed (`check:icon-contrast`
 * renders every mark on both themes and counts the pixels that stand out).
 * The alternatives were worse: showing it anyway means an invisible icon for
 * anyone on the dark theme, and lightening the purple is the recolouring the
 * registry forbids. One legible ink beats a brand colour nobody can see.
 *
 * The same reasoning routes GitHub and Sentry through `alwaysMono` — both are
 * near-black marks that publish an ink-free variant, so they need no derived
 * one.
 */
function derivedMonoOnly(slug: string, svg: string, licence: string): BrandArt {
  const { mono } = derivedMono(slug, svg, licence);
  return { colour: mono as string, mono };
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

/**
 * The upstream artwork that carries NO ink of its own, for marks that are
 * monochrome by design and whose default variant is white — invisible on a
 * light canvas.
 *
 * Taking the `light` variant instead was tried and is WRONG: `light` means
 * "dark ink for light backgrounds" and bakes in `fill="#000"`, which fixes the
 * light theme by making the mark black-on-near-black in the dark one. There is
 * no single baked ink that works in both, and per-theme artwork would break
 * canvas/export parity (icon-markup.ts memoises per slug).
 *
 * These brands have no colour to preserve — one flat ink by design — so the
 * ink-free artwork inherits `currentColor` and follows the theme in both
 * directions. The assertion is load-bearing: if upstream ever bakes a fill in,
 * `currentColor` would silently stop reaching the paths.
 */
function inkFreeVariant(slug: string, variants: IconVariants): string {
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

function alwaysMono(slug: string, variants: IconVariants): BrandArt {
  const markup = inkFreeVariant(slug, variants);
  return { colour: markup, mono: markup };
}

/* -------------------------------------------------------------------------- */
/* The component and def factories                                             */
/* -------------------------------------------------------------------------- */

interface BrandEntry {
  /** OUR slug — what documents store, and never the package's own naming. */
  slug: string;
  /** OUR display name; the package's titles are sometimes wrong or over-formal. */
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
    Svg: packagedSvgComponent(slug, art.colour),
    /* Undefined where the two artworks are the same string: the registry
       reads absence as "Svg already answers for both styles", so pointing
       SvgMono at an identical component would only cost a second render
       path and a second export-cache entry for one drawing. */
    SvgMono:
      art.mono === undefined || art.mono === art.colour
        ? undefined
        : packagedSvgComponent(slug, art.mono),
    monochrome,
  };
}

/* -------------------------------------------------------------------------- */
/* The set                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * 90 product marks. Which artwork each renders is decided by what the
 * package actually publishes, and the helper named on each entry says which
 * case it is — `withMono` for the great majority that ship both, and the
 * others for the awkward cases each helper documents.
 *
 * Sorted by category (ICON_CATEGORY_ORDER), then name; the registry's stable
 * category sort preserves this order in the picker.
 */
const BRAND_ENTRIES: readonly BrandEntry[] = [
  /* -- languages ----------------------------------------------------------- */
  {
    slug: "golang",
    name: "Golang",
    aliases: ["go", "gopher"],
    category: "languages",
    art: alwaysMono("golang", golangVariants),
  },
  {
    slug: "nextjs",
    name: "Next.js",
    aliases: ["next", "next.js", "vercel"],
    category: "languages",
    art: monoFromAlternate(
      "nextjs",
      nextjsSvg,
      nextjsAltVariants,
      nextjsAltLicence,
    ),
  },
  {
    slug: "dotnet",
    name: ".NET",
    aliases: ["c#", "csharp", "asp.net", "clr"],
    category: "languages",
    art: withMono("dotnet", dotnetVariants),
  },
  {
    slug: "java",
    name: "Java",
    aliases: ["jvm", "kotlin", "spring", "spring boot"],
    category: "languages",
    art: derivedMono("java", javaSvg, javaLicence),
  },
  {
    slug: "nodejs",
    name: "Node.js",
    aliases: ["node", "express", "nest", "nestjs"],
    category: "languages",
    art: monoFromAlternate(
      "nodejs",
      nodejsSvg,
      nodejsAltVariants,
      nodejsAltLicence,
    ),
  },
  {
    slug: "php",
    name: "PHP",
    aliases: ["laravel", "symfony"],
    category: "languages",
    art: alwaysMono("php", phpVariants),
  },
  {
    slug: "python",
    name: "Python",
    aliases: ["py", "django", "fastapi", "flask"],
    category: "languages",
    art: withMono("python", pythonVariants),
  },
  {
    slug: "react",
    name: "React",
    aliases: ["reactjs", "jsx", "vite", "remix"],
    category: "languages",
    art: withMono("react", reactVariants),
  },
  {
    slug: "rust",
    name: "Rust",
    aliases: ["rs", "cargo", "axum", "tokio"],
    category: "languages",
    art: alwaysMono("rust", rustVariants),
  },
  {
    slug: "typescript",
    name: "TypeScript",
    aliases: ["ts", "javascript", "js"],
    category: "languages",
    art: withMono("typescript", typescriptVariants),
  },
  {
    slug: "angular",
    name: "Angular",
    aliases: ["ng"],
    category: "languages",
    art: withMono("angular", angularVariants),
  },
  {
    slug: "bun",
    name: "Bun",
    aliases: ["bunjs"],
    category: "languages",
    art: withMono("bun", bunVariants),
  },
  {
    slug: "cplusplus",
    name: "C++",
    aliases: ["cpp", "c plus plus"],
    category: "languages",
    art: withMono("cplusplus", cplusplusVariants),
  },
  {
    slug: "flutter",
    name: "Flutter",
    aliases: ["dart"],
    category: "languages",
    art: withMono("flutter", flutterVariants),
  },
  {
    slug: "kotlin",
    name: "Kotlin",
    aliases: ["kt"],
    category: "languages",
    art: withMono("kotlin", kotlinVariants),
  },
  {
    slug: "spring-boot",
    name: "Spring Boot",
    aliases: ["spring"],
    category: "languages",
    art: withMono("spring-boot", springBootVariants),
  },
  {
    slug: "svelte",
    name: "Svelte",
    aliases: ["sveltekit"],
    category: "languages",
    art: withMono("svelte", svelteVariants),
  },
  {
    slug: "swift",
    name: "Swift",
    aliases: ["ios", "swiftui"],
    category: "languages",
    art: withMono("swift", swiftVariants),
  },
  {
    slug: "vue",
    name: "Vue",
    aliases: ["vuejs", "nuxt"],
    category: "languages",
    art: derivedMono("vue", vueSvg, vueLicence),
  },
  /* -- databases ----------------------------------------------------------- */
  {
    slug: "mongodb",
    name: "MongoDB",
    aliases: ["mongo", "documentdb"],
    category: "databases",
    art: withMono("mongodb", mongodbVariants),
  },
  {
    slug: "mysql",
    name: "MySQL",
    aliases: ["my-sql", "mariadb"],
    category: "databases",
    art: alwaysMono("mysql", mysqlVariants),
  },
  {
    slug: "postgresql",
    name: "PostgreSQL",
    aliases: ["pg", "postgres", "psql"],
    category: "databases",
    art: withMono("postgresql", postgresqlVariants),
  },
  {
    slug: "elasticsearch",
    name: "Elasticsearch",
    aliases: ["elastic", "opensearch", "search", "lucene"],
    category: "databases",
    art: withMono("elasticsearch", elasticsearchVariants),
  },
  {
    slug: "cassandra",
    name: "Cassandra",
    aliases: ["apache cassandra", "scylla", "wide column"],
    category: "databases",
    art: monoFromAlternate(
      "cassandra",
      cassandraSvg,
      cassandraAltVariants,
      cassandraAltLicence,
    ),
  },
  {
    slug: "clickhouse",
    name: "ClickHouse",
    aliases: ["olap", "column store", "analytics db"],
    category: "databases",
    art: withMono("clickhouse", clickhouseVariants),
  },
  {
    slug: "dynamodb",
    name: "DynamoDB",
    aliases: ["dynamo", "ddb", "key value"],
    category: "databases",
    art: withMono("dynamodb", dynamodbVariants),
  },
  {
    slug: "sqlite",
    name: "SQLite",
    aliases: ["sqlite3", "embedded db", "local db"],
    category: "databases",
    art: withMono("sqlite", sqliteVariants),
  },
  {
    slug: "apache-airflow",
    name: "Apache Airflow",
    aliases: ["airflow", "dag", "etl"],
    category: "databases",
    art: withMono("apache-airflow", apacheAirflowVariants),
  },
  {
    slug: "apache-spark",
    name: "Apache Spark",
    aliases: ["spark", "batch"],
    category: "databases",
    art: withMono("apache-spark", apacheSparkVariants),
  },
  {
    slug: "cockroachdb",
    name: "CockroachDB",
    aliases: ["crdb", "distributed sql"],
    category: "databases",
    art: monoFromAlternate(
      "cockroachdb",
      cockroachdbSvg,
      cockroachLabsVariants,
      cockroachLabsLicence,
    ),
  },
  {
    slug: "dbt",
    name: "dbt",
    aliases: ["data build tool"],
    category: "databases",
    art: colourOnly(dbtSvg),
  },
  {
    slug: "influxdb",
    name: "InfluxDB",
    aliases: ["time series", "tsdb"],
    category: "databases",
    art: withMono("influxdb", influxdbVariants),
  },
  {
    slug: "mariadb",
    name: "MariaDB",
    aliases: ["maria"],
    category: "databases",
    art: withMono("mariadb", mariadbVariants),
  },
  {
    slug: "microsoft-sql-server",
    name: "Microsoft SQL Server ",
    aliases: ["mssql", "sql server"],
    category: "databases",
    art: derivedMono(
      "microsoft-sql-server",
      microsoftSqlServerSvg,
      microsoftSqlServerLicence,
    ),
  },
  {
    slug: "neo4j",
    name: "Neo4j",
    aliases: ["graph db", "cypher"],
    category: "databases",
    art: withMono("neo4j", neo4jVariants),
  },
  {
    slug: "snowflake",
    name: "Snowflake",
    aliases: ["data warehouse"],
    category: "databases",
    art: withMono("snowflake", snowflakeVariants),
  },
  {
    slug: "supabase",
    name: "Supabase",
    aliases: ["baas"],
    category: "databases",
    art: withMono("supabase", supabaseVariants),
  },
  /* -- messaging ----------------------------------------------------------- */
  {
    slug: "redis",
    name: "Redis",
    aliases: ["cache", "valkey"],
    category: "messaging",
    art: withMono("redis", redisVariants),
  },
  {
    slug: "kafka",
    name: "Kafka",
    aliases: ["event stream", "streaming", "msk", "pubsub"],
    category: "messaging",
    /* Kafka's own mark is #1a1919 — near-black, and invisible on a dark
       canvas — so the ink-free Apache artwork is used in BOTH styles rather
       than only for mono. Nothing is lost: a flat black logo has no colour to
       withhold. */
    art: alwaysMono("kafka", kafkaAltVariants),
  },
  {
    slug: "rabbitmq",
    name: "RabbitMQ",
    aliases: ["amqp", "rabbit"],
    category: "messaging",
    art: alwaysMono("kafka", rabbitmqVariants),
  },
  {
    slug: "memcached",
    name: "Memcached",
    aliases: ["memcache", "cache", "in memory"],
    category: "messaging",
    art: withMono("memcached", memcachedVariants),
  },
  {
    slug: "nats",
    name: "NATS",
    aliases: ["jetstream", "pub sub", "messaging"],
    category: "messaging",
    art: monoFromAlternate("nats", natsSvg, natsAltVariants, natsAltLicence),
  },
  {
    slug: "apache-pulsar",
    name: "Apache Pulsar",
    aliases: ["pulsar"],
    category: "messaging",
    art: withMono("apache-pulsar", apachePulsarVariants),
  },
  {
    slug: "celery",
    name: "Celery",
    aliases: ["task queue", "worker"],
    category: "messaging",
    art: withMono("celery", celeryVariants),
  },
  {
    slug: "temporal",
    name: "Temporal",
    aliases: ["workflow", "durable execution"],
    category: "messaging",
    art: withMono("temporal", temporalVariants),
  },
  /* -- networking ---------------------------------------------------------- */
  {
    slug: "kong",
    name: "Kong",
    aliases: ["api gateway", "gateway"],
    category: "networking",
    art: alwaysMono("kong", kongVariants),
  },
  {
    slug: "nginx",
    name: "nginx",
    aliases: ["reverse proxy", "web server"],
    category: "networking",
    art: withMono("nginx", nginxVariants),
  },
  {
    slug: "graphql",
    name: "GraphQL",
    aliases: ["gql", "apollo", "federation"],
    category: "networking",
    art: withMono("graphql", graphqlVariants),
  },
  {
    slug: "grpc",
    name: "gRPC",
    aliases: ["rpc", "protobuf", "proto"],
    category: "networking",
    art: alwaysMono("grpc", grpcVariants),
  },
  {
    slug: "envoy",
    name: "Envoy",
    aliases: ["sidecar", "service mesh", "istio", "proxy"],
    category: "networking",
    art: monoFromAlternate(
      "envoy",
      envoySvg,
      envoyAltVariants,
      envoyAltLicence,
    ),
  },
  {
    slug: "istio",
    name: "Istio",
    aliases: ["service mesh"],
    category: "networking",
    art: withMono("istio", istioVariants),
  },
  {
    slug: "traefik",
    name: "Traefik",
    aliases: ["ingress", "reverse proxy"],
    category: "networking",
    art: derivedMono("traefik", traefikSvg, traefikLicence),
  },
  /* -- cloud --------------------------------------------------------------- */
  {
    slug: "cloudflare",
    name: "Cloudflare",
    aliases: ["cf", "cdn", "edge"],
    category: "cloud",
    art: withMono("cloudflare", cloudflareVariants),
  },
  {
    slug: "aws",
    name: "AWS",
    aliases: ["amazon", "amazon web services", "ec2"],
    category: "cloud",
    art: withMono("aws", awsVariants),
  },
  {
    slug: "azure",
    name: "Azure",
    aliases: ["microsoft azure", "msft"],
    category: "cloud",
    art: colourOnly(azureSvg),
  },
  {
    slug: "docker",
    name: "Docker",
    aliases: ["container", "oci", "compose"],
    category: "cloud",
    art: withMono("docker", dockerVariants),
  },
  {
    slug: "firebase",
    name: "Firebase",
    aliases: ["gcp firebase", "firestore"],
    category: "cloud",
    art: withMono("firebase", firebaseVariants),
  },
  {
    slug: "gcp",
    name: "Google Cloud",
    aliases: ["google", "google cloud platform", "big query"],
    category: "cloud",
    art: withMono("gcp", gcpVariants),
  },
  {
    slug: "kubernetes",
    name: "Kubernetes",
    aliases: ["k8s", "eks", "gke", "aks"],
    category: "cloud",
    art: withMono("kubernetes", kubernetesVariants),
  },
  {
    slug: "lambda",
    name: "Serverless",
    aliases: ["function", "faas", "cloud function", "lambda", "worker"],
    category: "cloud",
    art: alwaysMono("lambda", lambdaVariants),
  },
  {
    slug: "s3",
    name: "Object storage",
    aliases: ["bucket", "blob", "gcs", "s3", "minio", "object storage"],
    category: "cloud",
    art: colourOnly(s3Svg),
  },
  {
    slug: "terraform",
    name: "Terraform",
    aliases: ["iac", "opentofu", "hcl"],
    category: "cloud",
    art: alwaysMono("terraform", terraformVariants),
  },
  {
    slug: "databricks",
    name: "Databricks",
    aliases: ["lakehouse"],
    category: "cloud",
    art: withMono("databricks", databricksVariants),
  },
  {
    slug: "digitalocean",
    name: "DigitalOcean",
    aliases: ["droplet"],
    category: "cloud",
    art: withMono("digitalocean", digitaloceanVariants),
  },
  {
    slug: "heroku",
    name: "Heroku",
    aliases: ["paas", "dyno"],
    category: "cloud",
    art: derivedMonoOnly("heroku", herokuSvg, herokuLicence),
  },
  {
    slug: "minio",
    name: "MinIO",
    aliases: ["object storage", "s3 compatible"],
    category: "cloud",
    art: withMono("minio", minioVariants),
  },
  {
    slug: "netlify",
    name: "Netlify",
    aliases: ["jamstack"],
    category: "cloud",
    art: withMono("netlify", netlifyVariants),
  },
  {
    slug: "vercel",
    name: "Vercel",
    aliases: ["hosting"],
    category: "cloud",
    art: alwaysMono("vercel", vercelVariants),
  },
  /* -- devops -------------------------------------------------------------- */
  {
    slug: "argocd",
    // thesvg titles it "Argocd"; the project spells itself "Argo CD".
    name: "Argo CD",
    aliases: ["argo", "gitops"],
    category: "devops",
    art: withMono("argocd", argocdVariants),
  },
  {
    slug: "ansible",
    name: "Ansible",
    aliases: ["playbook", "configuration management"],
    category: "devops",
    art: alwaysMono("ansible", ansibleVariants),
  },
  {
    slug: "circleci",
    name: "CircleCI",
    aliases: ["ci"],
    category: "devops",
    art: alwaysMono("circleci", circleciVariants),
  },
  {
    slug: "github",
    name: "GitHub",
    aliases: ["gh", "git"],
    category: "devops",
    art: alwaysMono("github", githubVariants),
  },
  {
    slug: "github-actions",
    name: "GitHub Actions",
    aliases: ["ci", "workflow"],
    category: "devops",
    art: withMono("github-actions", githubActionsVariants),
  },
  {
    slug: "gitlab",
    name: "GitLab",
    aliases: ["git", "ci"],
    category: "devops",
    art: withMono("gitlab", gitlabVariants),
  },
  {
    slug: "helm",
    name: "Helm",
    aliases: ["chart", "k8s package"],
    category: "devops",
    art: alwaysMono("helm", helmVariants),
  },
  {
    slug: "jenkins",
    name: "Jenkins",
    aliases: ["ci", "build server"],
    category: "devops",
    art: withMono("jenkins", jenkinsVariants),
  },
  {
    slug: "vault",
    name: "Vault",
    aliases: ["hashicorp", "secrets"],
    category: "devops",
    art: alwaysMono("vault", vaultVariants),
  },
  /* -- observability ------------------------------------------------------- */
  {
    slug: "datadog",
    name: "Datadog",
    aliases: ["apm"],
    category: "observability",
    art: withMono("datadog", datadogVariants),
  },
  {
    slug: "grafana",
    name: "Grafana",
    aliases: ["dashboards"],
    category: "observability",
    art: withMono("grafana", grafanaVariants),
  },
  {
    slug: "new-relic",
    name: "New Relic",
    aliases: ["apm"],
    category: "observability",
    art: withMono("new-relic", newRelicVariants),
  },
  {
    slug: "opentelemetry",
    name: "OpenTelemetry",
    aliases: ["otel", "tracing"],
    category: "observability",
    art: withMono("opentelemetry", opentelemetryVariants),
  },
  {
    slug: "prometheus",
    name: "Prometheus",
    aliases: ["metrics"],
    category: "observability",
    art: withMono("prometheus", prometheusVariants),
  },
  {
    slug: "sentry",
    name: "Sentry",
    aliases: ["error tracking", "crash"],
    category: "observability",
    art: alwaysMono("sentry", sentryVariants),
  },
  {
    slug: "splunk",
    name: "Splunk",
    aliases: ["siem", "logs"],
    category: "observability",
    art: withMono("splunk", splunkVariants),
  },
  /* -- saas ---------------------------------------------------------------- */
  {
    slug: "anthropic",
    name: "Anthropic",
    aliases: ["claude", "llm"],
    category: "saas",
    art: withMono("anthropic", anthropicVariants),
  },
  {
    slug: "auth0",
    name: "Auth0",
    aliases: ["auth", "oauth"],
    category: "saas",
    art: withMono("auth0", auth0Variants),
  },
  {
    slug: "keycloak",
    name: "Keycloak",
    aliases: ["sso", "oidc"],
    category: "saas",
    art: withMono("keycloak", keycloakVariants),
  },
  {
    slug: "okta",
    name: "Okta",
    aliases: ["sso", "identity"],
    category: "saas",
    art: withMono("okta", oktaVariants),
  },
  {
    slug: "openai",
    name: "OpenAI",
    aliases: ["gpt", "chatgpt", "llm"],
    category: "saas",
    art: alwaysMono("openai", openaiVariants),
  },
  {
    slug: "stripe",
    name: "Stripe",
    aliases: ["payments", "billing"],
    category: "saas",
    art: withMono("stripe", stripeVariants),
  },
  {
    slug: "twilio",
    name: "Twilio",
    aliases: ["sms", "voice"],
    category: "saas",
    art: derivedMono("twilio", twilioSvg, twilioLicence),
  },
];

export const BRAND_ICON_DEFS: readonly IconSource[] =
  BRAND_ENTRIES.map(brandDef);
