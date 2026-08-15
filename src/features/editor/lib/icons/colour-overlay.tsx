import type { SVGProps } from "react";

/**
 * Coloured artwork for the hand-authored icons that name a real product.
 *
 * WHY THIS EXISTS. The house set is monochrome by design, so colour mode used
 * to render a MIXTURE — full-colour brand logos beside flat house glyphs for
 * PostgreSQL, Redis, Docker and the rest — which reads as a rendering fault
 * rather than a choice. These 35 slugs are the ones the package publishes a
 * real coloured logo for, so in colour mode the packaged logo stands in for
 * the house mark. Mono mode is untouched: it still draws the hand-authored
 * icon, which is the house style and the reason those were drawn.
 *
 * IT REPLACES, IT DOES NOT RECOLOUR. The hand-authored artwork is not tinted
 * — that would be inventing colours for a mark — it is swapped for the
 * vendor's own logo. Both drawings stay in the registry; `byStyle` picks.
 *
 * THE 22 THAT ARE NOT HERE are not an oversight, and are worth naming so
 * nobody "completes" the list:
 *   - Abstract concepts with no logo in existence: `api`, `database`,
 *     `queue`, `person`, `browser`, `file`, `email`, `search`, `service`,
 *     `webhook`, `monitoring`, `analytics`, `ai-model`, `external`,
 *     `identity`, `mobile`, `scheduler`, `internet`, `load-balancer`,
 *     `firewall`. These keep the house glyph in both styles and take the
 *     node's accent colour, which is what makes a mixed board read as
 *     deliberate: logos are logos, concepts are glyphs.
 *   - `s3` and `haproxy`: the package ships no icon at all.
 *   - `terraform`: its only coloured artwork is a WORDMARK (a logotype, not
 *     an icon) — its default variant carries `<style>`, which the sanitiser
 *     refuses because document-global class selectors bleed between icons in
 *     one exported file.
 *   - `lambda`: the package ships no coloured variant, only monochrome.
 *
 * One slug differs from ours and is mapped at the import: `gcp` is
 * `thesvg/google-cloud`.
 *
 * SIX MORE ARE DELIBERATELY ABSENT — php, rust, golang, mysql, grpc and
 * kafka —
 * and this is the second list nobody should "complete". Their packaged
 * artwork is WHITE INK, drawn for a dark background, so adding them rendered
 * five invisible icons on a light canvas. They were caught by rasterising the
 * set and looking at it, not by reading the markup: white ink is not a
 * malformed file, it is a correct file for a context we do not have. PHP,
 * Rust, Go and gRPC have no coloured mark at all — they are monochrome
 * brands — and MySQL's only coloured artwork is a wordmark. For all five the
 * hand-authored icon is strictly better: it already follows the theme, so it
 * is legible in both. Kafka is the mirror image of the same problem: its mark
 * is near-black (#1a1919), so it disappeared against a DARK canvas and, being
 * a single flat ink, offered nothing the hand-authored icon did not.
 *
 * `svg` alone is imported, never `variants` — mono comes from the
 * hand-authored icon, so the packaged monochrome variants would be dead
 * weight (brand.tsx's import header explains what `variants` costs).
 */

import { svg as nextjsColour } from "thesvg/nextjs";
import { svg as dotnetColour } from "thesvg/dotnet";
import { svg as javaColour } from "thesvg/java";
import { svg as nodejsColour } from "thesvg/nodejs";
import { svg as pythonColour } from "thesvg/python";
import { svg as reactColour } from "thesvg/react";
import { svg as typescriptColour } from "thesvg/typescript";
import { svg as mongodbColour } from "thesvg/mongodb";
import { svg as postgresqlColour } from "thesvg/postgresql";
import { svg as elasticsearchColour } from "thesvg/elasticsearch";
import { svg as cassandraColour } from "thesvg/cassandra";
import { svg as clickhouseColour } from "thesvg/clickhouse";
import { svg as dynamodbColour } from "thesvg/dynamodb";
import { svg as sqliteColour } from "thesvg/sqlite";
import { svg as redisColour } from "thesvg/redis";
import { svg as rabbitmqColour } from "thesvg/rabbitmq";
import { svg as memcachedColour } from "thesvg/memcached";
import { svg as natsColour } from "thesvg/nats";
import { svg as kongColour } from "thesvg/kong";
import { svg as nginxColour } from "thesvg/nginx";
import { svg as graphqlColour } from "thesvg/graphql";
import { svg as envoyColour } from "thesvg/envoy";
import { svg as cloudflareColour } from "thesvg/cloudflare";
import { svg as awsColour } from "thesvg/aws";
import { svg as azureColour } from "thesvg/azure";
import { svg as gcpColour } from "thesvg/google-cloud";
import { svg as dockerColour } from "thesvg/docker";
import { svg as firebaseColour } from "thesvg/firebase";
import { svg as kubernetesColour } from "thesvg/kubernetes";

import { packagedSvgComponent } from "./embed";

/** Slug → the vendor's own coloured artwork, for colour mode only. */
const COLOUR_ARTWORK: Readonly<Record<string, string>> = {
  nextjs: nextjsColour,
  dotnet: dotnetColour,
  java: javaColour,
  nodejs: nodejsColour,
  python: pythonColour,
  react: reactColour,
  typescript: typescriptColour,
  mongodb: mongodbColour,
  postgresql: postgresqlColour,
  elasticsearch: elasticsearchColour,
  cassandra: cassandraColour,
  clickhouse: clickhouseColour,
  dynamodb: dynamodbColour,
  sqlite: sqliteColour,
  redis: redisColour,
  rabbitmq: rabbitmqColour,
  memcached: memcachedColour,
  nats: natsColour,
  kong: kongColour,
  nginx: nginxColour,
  graphql: graphqlColour,
  envoy: envoyColour,
  cloudflare: cloudflareColour,
  aws: awsColour,
  azure: azureColour,
  gcp: gcpColour,
  docker: dockerColour,
  firebase: firebaseColour,
  kubernetes: kubernetesColour,
};

/**
 * Built once at module load, like the rest of the registry. Every component
 * carries `fill="currentColor"` (embed.tsx): a path with its own colour keeps
 * it, and a path without one inherits the theme's ink rather than the black
 * the browser would otherwise supply.
 */
export const COLOUR_OVERLAY: Readonly<
  Record<string, React.FC<SVGProps<SVGSVGElement>>>
> = Object.fromEntries(
  Object.entries(COLOUR_ARTWORK).map(([slug, svg]) => [
    slug,
    packagedSvgComponent(slug, svg),
  ]),
);
