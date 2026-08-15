/**
 * The icon registry (dev-handoff §4.6, D15, AF-E4-S1/S2). Owned by T2-A.
 * Icons are referenced by slug; no SVG data or URL is ever written into the
 * model.
 *
 * Two kinds of icon now live here, told apart by the `monochrome` flag:
 *
 * 1. The 59 hand-authored inline-SVG icons (38 stylised motifs plus 21
 *    generics and infrastructure primitives). These are and stay monochrome
 *    `currentColor` — legible in both themes with zero colour literals.
 *
 * 2. Curated BRAND marks from the `thesvg` package (`./brand`). The original
 *    rule here — "stylised motifs, never traced trademarked logos" — was a
 *    deliberate trademark-avoidance stance, and it was consciously dropped
 *    (2026-08) in favour of recognisability: real logos, used NOMINATIVELY,
 *    to label what a container runs — never to imply endorsement. Each mark
 *    remains the trademark of its owner. A COLOURED brand mark renders in its
 *    own hardcoded colours and is NEVER recoloured: beyond diluting the mark,
 *    some upstream licences forbid derivatives outright (AWS's architecture
 *    icons are CC BY-ND, for one), so `currentColor`-ing one is not merely
 *    ugly but a licence breach.
 *
 *    The exception is narrow and is NOT a loophole: some brands are
 *    monochrome by design — a single flat ink, no colour to preserve — and
 *    upstream ships them as artwork with no `fill` at all. Those come out
 *    `monochrome: true` and inherit the theme's colour, because the
 *    alternative is worse: any baked ink makes the mark invisible in one of
 *    the two themes. `brand.tsx` DERIVES the flag by inspecting the artwork
 *    rather than trusting a hand-set value, which is the only version of
 *    this that has not shipped a bug — three marks were flagged coloured
 *    while carrying no ink, so nothing gave them a fill and they went black
 *    on a black canvas.
 *
 * ONE INK OR TWO is the reader's choice, not the document's (`IconStyle`).
 * `byStyle` resolves it per icon: 45 brand marks ship an upstream `mono`
 * variant, and the nine that do not stay coloured in mono mode — deriving a
 * monochrome version by stripping colour is exactly the recolouring above.
 *
 * SLUG COLLISIONS: thesvg also ships `postgresql`, `redis`, `kafka`, … — the
 * hand-authored mark keeps its slug (models in the wild reference it, and the
 * monochrome set is the house style), so the curated brand list simply never
 * includes a taken slug. `ICONS` below enforces this by throwing on any
 * duplicate rather than letting `Object.fromEntries`-style last-wins shadow
 * one definition with another; the throw fires while `pnpm build` prerenders,
 * so a collision cannot ship.
 */

import type { C4Node, C4NodeType } from "@/types";

import type { IconStyle } from "@/lib/icon-style";

import { BRAND_ICON_DEFS } from "./brand";
import { ICON_CATEGORY_ORDER, type IconCategory } from "./categories";
import { AiModelIcon } from "./svg/ai-model";
import { AnalyticsIcon } from "./svg/analytics";
import { ApiIcon } from "./svg/api";
import { AwsIcon } from "./svg/aws";
import { AzureIcon } from "./svg/azure";
import { BrowserIcon } from "./svg/browser";
import { CassandraIcon } from "./svg/cassandra";
import { ClickhouseIcon } from "./svg/clickhouse";
import { CloudflareIcon } from "./svg/cloudflare";
import { DatabaseIcon } from "./svg/database";
import { DockerIcon } from "./svg/docker";
import { DotnetIcon } from "./svg/dotnet";
import { DynamodbIcon } from "./svg/dynamodb";
import { ElasticsearchIcon } from "./svg/elasticsearch";
import { EmailIcon } from "./svg/email";
import { EnvoyIcon } from "./svg/envoy";
import { ExternalIcon } from "./svg/external";
import { FileIcon } from "./svg/file";
import { FirebaseIcon } from "./svg/firebase";
import { FirewallIcon } from "./svg/firewall";
import { GcpIcon } from "./svg/gcp";
import { GolangIcon } from "./svg/golang";
import { GraphqlIcon } from "./svg/graphql";
import { GrpcIcon } from "./svg/grpc";
import { HaproxyIcon } from "./svg/haproxy";
import { IdentityIcon } from "./svg/identity";
import { InternetIcon } from "./svg/internet";
import { JavaIcon } from "./svg/java";
import { KafkaIcon } from "./svg/kafka";
import { KongIcon } from "./svg/kong";
import { KubernetesIcon } from "./svg/kubernetes";
import { LambdaIcon } from "./svg/lambda";
import { LoadBalancerIcon } from "./svg/load-balancer";
import { MemcachedIcon } from "./svg/memcached";
import { MobileIcon } from "./svg/mobile";
import { MongodbIcon } from "./svg/mongodb";
import { MonitoringIcon } from "./svg/monitoring";
import { MysqlIcon } from "./svg/mysql";
import { NatsIcon } from "./svg/nats";
import { NextjsIcon } from "./svg/nextjs";
import { NginxIcon } from "./svg/nginx";
import { NodejsIcon } from "./svg/nodejs";
import { PersonIcon } from "./svg/person";
import { PhpIcon } from "./svg/php";
import { PostgresqlIcon } from "./svg/postgresql";
import { PythonIcon } from "./svg/python";
import { QueueIcon } from "./svg/queue";
import { RabbitmqIcon } from "./svg/rabbitmq";
import { ReactIcon } from "./svg/react";
import { RedisIcon } from "./svg/redis";
import { RustIcon } from "./svg/rust";
import { S3Icon } from "./svg/s3";
import { SchedulerIcon } from "./svg/scheduler";
import { SearchIcon } from "./svg/search";
import { ServiceIcon } from "./svg/service";
import { SqliteIcon } from "./svg/sqlite";
import { TerraformIcon } from "./svg/terraform";
import { TypescriptIcon } from "./svg/typescript";
import { WebhookIcon } from "./svg/webhook";

export type { IconCategory } from "./categories";

type IconSvg = React.FC<React.SVGProps<SVGSVGElement>>;

/**
 * What an icon DECLARES — the authoring shape, used by the literals below and
 * by `brand.tsx`. Consumers get `IconDef`, which adds the per-style lookup.
 */
export interface IconSource {
  /** e.g. "postgresql" — what the model stores. */
  slug: string;
  /** e.g. "PostgreSQL". */
  name: string;
  /** e.g. ["pg", "postgres"]. */
  aliases: string[];
  category: IconCategory;
  /** Inline SVG component; `currentColor` where monochrome. */
  Svg: IconSvg;
  /**
   * The monochrome artwork, for readers who prefer one ink (`IconStyle`).
   * ABSENT means "`Svg` is already the answer" — true of every hand-authored
   * icon, and of the nine brand marks that ship no `mono` variant. Read it
   * through `byStyle`, never directly, so those two cases stay one case at
   * the call site.
   */
  SvgMono?: IconSvg;
  /**
   * True when `Svg` paints with `currentColor`: the hand-authored set, plus
   * the brand marks whose artwork carries no ink of its own. False for a
   * coloured brand mark, whose colours are immutable (file header — never
   * recolour).
   */
  monochrome: boolean;
}

export interface IconDef extends IconSource {
  /**
   * The artwork for each reader style, RESOLVED — both keys always present.
   *
   * A lookup rather than a `pickIcon(def, style)` helper on purpose. The
   * helper existed first and every call site tripped
   * `react-hooks/static-components`: a component returned from a function
   * call cannot be told apart, by lint, from one DEFINED during render (which
   * remounts its subtree every frame). These components are built once at
   * module load, so the warning was false — but five suppressions teach a
   * reader to ignore a rule that is usually right, and a table is what the
   * data was anyway.
   */
  readonly byStyle: Readonly<Record<IconStyle, IconSvg>>;
}

/**
 * Falling back to `Svg` for mono is not a compromise but the correct answer
 * twice over: a hand-authored icon IS monochrome already, and a brand mark
 * with no upstream `mono` variant has no monochrome artwork we are allowed to
 * invent — deriving one by stripping colour is the recolouring the registry
 * forbids. So mono mode is best-effort by design, and a few marks stay
 * coloured in it; `IconStyleToggle` says how many rather than letting it read
 * as a rendering bug.
 */
function resolveStyles(source: IconSource): IconDef {
  return {
    ...source,
    byStyle: { colour: source.Svg, mono: source.SvgMono ?? source.Svg },
  };
}

/** Brand marks that stay coloured in mono mode — upstream ships no `mono`. */
export function iconsWithoutMono(): IconDef[] {
  return ICON_DEFS.filter(
    (def) => !def.monochrome && def.SvgMono === undefined,
  );
}

/**
 * The hand-authored set, in picker display order: category-major
 * (ICON_CATEGORY_ORDER), each category in its curated order.
 */
const HAND_AUTHORED_DEFS: readonly IconSource[] = [
  /* -- Languages & Runtimes ------------------------------------------------ */
  {
    slug: "golang",
    name: "Golang",
    aliases: ["go", "gopher"],
    category: "languages",
    Svg: GolangIcon,
    monochrome: true,
  },
  {
    slug: "nextjs",
    name: "Next.js",
    aliases: ["next", "next.js", "vercel"],
    category: "languages",
    Svg: NextjsIcon,
    monochrome: true,
  },
  {
    slug: "dotnet",
    name: ".NET",
    aliases: ["c#", "csharp", "asp.net", "clr"],
    category: "languages",
    Svg: DotnetIcon,
    monochrome: true,
  },
  {
    slug: "java",
    name: "Java",
    aliases: ["jvm", "kotlin", "spring", "spring boot"],
    category: "languages",
    Svg: JavaIcon,
    monochrome: true,
  },
  {
    slug: "nodejs",
    name: "Node.js",
    aliases: ["node", "express", "nest", "nestjs"],
    category: "languages",
    Svg: NodejsIcon,
    monochrome: true,
  },
  {
    slug: "php",
    name: "PHP",
    aliases: ["laravel", "symfony"],
    category: "languages",
    Svg: PhpIcon,
    monochrome: true,
  },
  {
    slug: "python",
    name: "Python",
    aliases: ["py", "django", "fastapi", "flask"],
    category: "languages",
    Svg: PythonIcon,
    monochrome: true,
  },
  {
    slug: "react",
    name: "React",
    aliases: ["reactjs", "jsx", "vite", "remix"],
    category: "languages",
    Svg: ReactIcon,
    monochrome: true,
  },
  {
    slug: "rust",
    name: "Rust",
    aliases: ["rs", "cargo", "axum", "tokio"],
    category: "languages",
    Svg: RustIcon,
    monochrome: true,
  },
  {
    slug: "typescript",
    name: "TypeScript",
    aliases: ["ts", "javascript", "js"],
    category: "languages",
    Svg: TypescriptIcon,
    monochrome: true,
  },
  /* -- Databases ----------------------------------------------------------- */
  {
    slug: "mongodb",
    name: "MongoDB",
    aliases: ["mongo", "documentdb"],
    category: "databases",
    Svg: MongodbIcon,
    monochrome: true,
  },
  {
    slug: "mysql",
    name: "MySQL",
    aliases: ["my-sql", "mariadb"],
    category: "databases",
    Svg: MysqlIcon,
    monochrome: true,
  },
  {
    slug: "postgresql",
    name: "PostgreSQL",
    aliases: ["pg", "postgres", "psql"],
    category: "databases",
    Svg: PostgresqlIcon,
    monochrome: true,
  },
  {
    slug: "elasticsearch",
    name: "Elasticsearch",
    aliases: ["elastic", "opensearch", "search", "lucene"],
    category: "databases",
    Svg: ElasticsearchIcon,
    monochrome: true,
  },
  {
    slug: "cassandra",
    name: "Cassandra",
    aliases: ["apache cassandra", "scylla", "wide column"],
    category: "databases",
    Svg: CassandraIcon,
    monochrome: true,
  },
  {
    slug: "clickhouse",
    name: "ClickHouse",
    aliases: ["olap", "column store", "analytics db"],
    category: "databases",
    Svg: ClickhouseIcon,
    monochrome: true,
  },
  {
    slug: "dynamodb",
    name: "DynamoDB",
    aliases: ["dynamo", "ddb", "key value"],
    category: "databases",
    Svg: DynamodbIcon,
    monochrome: true,
  },
  {
    slug: "sqlite",
    name: "SQLite",
    aliases: ["sqlite3", "embedded db", "local db"],
    category: "databases",
    Svg: SqliteIcon,
    monochrome: true,
  },
  /* -- Caching & Messaging -------------------------------------------------- */
  {
    slug: "redis",
    name: "Redis",
    aliases: ["cache", "valkey"],
    category: "messaging",
    Svg: RedisIcon,
    monochrome: true,
  },
  {
    slug: "kafka",
    name: "Kafka",
    aliases: ["event stream", "streaming", "msk", "pubsub"],
    category: "messaging",
    Svg: KafkaIcon,
    monochrome: true,
  },
  {
    slug: "rabbitmq",
    name: "RabbitMQ",
    aliases: ["amqp", "rabbit"],
    category: "messaging",
    Svg: RabbitmqIcon,
    monochrome: true,
  },
  {
    slug: "memcached",
    name: "Memcached",
    aliases: ["memcache", "cache", "in memory"],
    category: "messaging",
    Svg: MemcachedIcon,
    monochrome: true,
  },
  {
    slug: "nats",
    name: "NATS",
    aliases: ["jetstream", "pub sub", "messaging"],
    category: "messaging",
    Svg: NatsIcon,
    monochrome: true,
  },
  /* -- Networking & Edge ---------------------------------------------------- */
  {
    slug: "kong",
    name: "Kong",
    aliases: ["api gateway", "gateway"],
    category: "networking",
    Svg: KongIcon,
    monochrome: true,
  },
  {
    slug: "nginx",
    name: "nginx",
    aliases: ["reverse proxy", "web server"],
    category: "networking",
    Svg: NginxIcon,
    monochrome: true,
  },
  {
    slug: "graphql",
    name: "GraphQL",
    aliases: ["gql", "apollo", "federation"],
    category: "networking",
    Svg: GraphqlIcon,
    monochrome: true,
  },
  {
    slug: "grpc",
    name: "gRPC",
    aliases: ["rpc", "protobuf", "proto"],
    category: "networking",
    Svg: GrpcIcon,
    monochrome: true,
  },
  {
    slug: "envoy",
    name: "Envoy",
    aliases: ["sidecar", "service mesh", "istio", "proxy"],
    category: "networking",
    Svg: EnvoyIcon,
    monochrome: true,
  },
  {
    slug: "firewall",
    name: "Firewall",
    aliases: ["waf", "security group", "shield"],
    category: "networking",
    Svg: FirewallIcon,
    monochrome: true,
  },
  {
    slug: "haproxy",
    name: "HAProxy",
    aliases: ["ha proxy", "load balancer", "proxy"],
    category: "networking",
    Svg: HaproxyIcon,
    monochrome: true,
  },
  {
    slug: "internet",
    name: "Internet",
    aliases: ["globe", "www", "public network", "world"],
    category: "networking",
    Svg: InternetIcon,
    monochrome: true,
  },
  {
    slug: "load-balancer",
    name: "Load balancer",
    aliases: ["lb", "elb", "alb", "nlb", "fan out"],
    category: "networking",
    Svg: LoadBalancerIcon,
    monochrome: true,
  },
  /* -- Cloud ----------------------------------------------------------------- */
  {
    slug: "cloudflare",
    name: "Cloudflare",
    aliases: ["cf", "cdn", "edge"],
    category: "cloud",
    Svg: CloudflareIcon,
    monochrome: true,
  },
  {
    slug: "aws",
    name: "AWS",
    aliases: ["amazon", "amazon web services", "ec2"],
    category: "cloud",
    Svg: AwsIcon,
    monochrome: true,
  },
  {
    slug: "azure",
    name: "Azure",
    aliases: ["microsoft azure", "msft"],
    category: "cloud",
    Svg: AzureIcon,
    monochrome: true,
  },
  {
    slug: "docker",
    name: "Docker",
    aliases: ["container", "oci", "compose"],
    category: "cloud",
    Svg: DockerIcon,
    monochrome: true,
  },
  {
    slug: "firebase",
    name: "Firebase",
    aliases: ["gcp firebase", "firestore"],
    category: "cloud",
    Svg: FirebaseIcon,
    monochrome: true,
  },
  {
    slug: "gcp",
    name: "Google Cloud",
    aliases: ["google", "google cloud platform", "big query"],
    category: "cloud",
    Svg: GcpIcon,
    monochrome: true,
  },
  {
    slug: "kubernetes",
    name: "Kubernetes",
    aliases: ["k8s", "eks", "gke", "aks"],
    category: "cloud",
    Svg: KubernetesIcon,
    monochrome: true,
  },
  {
    slug: "lambda",
    name: "Serverless",
    aliases: ["function", "faas", "cloud function", "lambda", "worker"],
    category: "cloud",
    Svg: LambdaIcon,
    monochrome: true,
  },
  {
    slug: "s3",
    name: "Object storage",
    aliases: ["bucket", "blob", "gcs", "s3", "minio", "object storage"],
    category: "cloud",
    Svg: S3Icon,
    monochrome: true,
  },
  {
    slug: "terraform",
    name: "Terraform",
    aliases: ["iac", "opentofu", "hcl"],
    category: "cloud",
    Svg: TerraformIcon,
    monochrome: true,
  },
  /* -- Generic ---------------------------------------------------------------- */
  {
    slug: "ai-model",
    name: "AI model",
    aliases: ["ml", "llm", "inference", "gpu", "model"],
    category: "generic",
    Svg: AiModelIcon,
    monochrome: true,
  },
  {
    slug: "analytics",
    name: "Analytics",
    aliases: ["bi", "warehouse", "reporting", "metrics", "chart"],
    category: "generic",
    Svg: AnalyticsIcon,
    monochrome: true,
  },
  {
    slug: "api",
    name: "API",
    aliases: ["rest", "endpoint", "json", "openapi"],
    category: "generic",
    Svg: ApiIcon,
    monochrome: true,
  },
  {
    slug: "browser",
    name: "Browser",
    aliases: ["web", "web app", "spa", "frontend"],
    category: "generic",
    Svg: BrowserIcon,
    monochrome: true,
  },
  {
    slug: "database",
    name: "Database",
    aliases: ["db", "datastore", "storage"],
    category: "generic",
    Svg: DatabaseIcon,
    monochrome: true,
  },
  {
    slug: "email",
    name: "Email",
    aliases: ["mail", "smtp", "ses", "notification", "sendgrid"],
    category: "generic",
    Svg: EmailIcon,
    monochrome: true,
  },
  {
    slug: "external",
    name: "External system",
    aliases: ["third party", "3rd party", "saas"],
    category: "generic",
    Svg: ExternalIcon,
    monochrome: true,
  },
  {
    slug: "file",
    name: "File store",
    aliases: ["document", "nfs", "volume", "disk"],
    category: "generic",
    Svg: FileIcon,
    monochrome: true,
  },
  {
    slug: "identity",
    name: "Identity provider",
    aliases: ["auth", "sso", "oauth", "iam", "keycloak", "key"],
    category: "generic",
    Svg: IdentityIcon,
    monochrome: true,
  },
  {
    slug: "mobile",
    name: "Mobile",
    aliases: ["phone", "ios", "android", "app"],
    category: "generic",
    Svg: MobileIcon,
    monochrome: true,
  },
  {
    slug: "monitoring",
    name: "Monitoring",
    aliases: ["observability", "grafana", "prometheus", "apm", "logs"],
    category: "generic",
    Svg: MonitoringIcon,
    monochrome: true,
  },
  {
    slug: "person",
    name: "Person",
    aliases: ["user", "actor", "people", "customer"],
    category: "generic",
    Svg: PersonIcon,
    monochrome: true,
  },
  {
    slug: "queue",
    name: "Queue",
    aliases: ["message queue", "mq", "broker", "topic"],
    category: "generic",
    Svg: QueueIcon,
    monochrome: true,
  },
  {
    slug: "scheduler",
    name: "Scheduler",
    aliases: ["cron", "job", "timer", "batch", "worker"],
    category: "generic",
    Svg: SchedulerIcon,
    monochrome: true,
  },
  {
    slug: "search",
    name: "Search",
    aliases: ["index", "query", "find", "magnifier"],
    category: "generic",
    Svg: SearchIcon,
    monochrome: true,
  },
  {
    slug: "service",
    name: "Service",
    aliases: ["application", "app", "system", "component"],
    category: "generic",
    Svg: ServiceIcon,
    monochrome: true,
  },
  {
    slug: "webhook",
    name: "Webhook",
    aliases: ["callback", "event", "hook", "push"],
    category: "generic",
    Svg: WebhookIcon,
    monochrome: true,
  },
];

const CATEGORY_RANK: ReadonlyMap<IconCategory, number> = new Map(
  ICON_CATEGORY_ORDER.map((category, index) => [category, index]),
);

const rankOf = (category: IconCategory): number =>
  CATEGORY_RANK.get(category) ?? ICON_CATEGORY_ORDER.length;

/**
 * Registry order = picker display order: category-major, hand-authored icons
 * first within each category (the house monochrome set leads), brand marks
 * after them, name-sorted (brand.tsx keeps its list in that order). The sort
 * key is the category ALONE — JS sort is stable, so each source list's
 * internal order survives the merge. `searchIcons("")` returns exactly this
 * order.
 */
const ICON_DEFS: readonly IconDef[] = [
  ...HAND_AUTHORED_DEFS,
  ...BRAND_ICON_DEFS,
]
  .sort((a, b) => rankOf(a.category) - rankOf(b.category))
  .map(resolveStyles);

/**
 * Slug → def. Built with an explicit duplicate check (file header, "slug
 * collisions"): a map literal or `fromEntries` would let the LAST definition
 * silently win, and a brand icon shadowing a hand-authored slug (or vice
 * versa) is exactly the bug this registry must make impossible.
 */
export const ICONS: Record<string, IconDef> = {};
for (const def of ICON_DEFS) {
  if (ICONS[def.slug] !== undefined) {
    throw new Error(
      `icon slug "${def.slug}" is defined twice — the hand-authored mark ` +
        `owns its slug; drop or rename the brand entry in brand.tsx`,
    );
  }
  ICONS[def.slug] = def;
}

/**
 * Type → default icon slug (AF-E4-S3 baseline). MUST stay in agreement with
 * `FALLBACK_ICON_BY_TYPE` in `hooks/use-canvas-nodes.ts` (Batch-1-final),
 * which mirrors these values.
 */
export const DEFAULT_ICON_BY_TYPE: Record<C4NodeType, string> = {
  person: "person",
  softwareSystem: "service",
  externalSystem: "external",
  container: "service",
  database: "database",
  queue: "queue",
  component: "service",
  codeElement: "service",
};

/**
 * Never throws; an unknown slug resolves to the type's generic fallback with
 * `isFallback: true` so the node can render a warning marker (AF-E4-S1 —
 * never blank, never broken). An absent icon is the type default and is NOT
 * flagged.
 */
export function resolveIcon(node: Pick<C4Node, "icon" | "type">): {
  def: IconDef;
  isFallback: boolean;
} {
  if (node.icon !== undefined && node.icon !== "") {
    const def = ICONS[node.icon];
    if (def !== undefined) return { def, isFallback: false };
    return { def: ICONS[DEFAULT_ICON_BY_TYPE[node.type]], isFallback: true };
  }
  return { def: ICONS[DEFAULT_ICON_BY_TYPE[node.type]], isFallback: false };
}

/**
 * Case-insensitive substring match on name, slug and aliases — "pg" and
 * "postgres" both find PostgreSQL (AF-E4-S2). An empty query returns the full
 * registry. Results keep registry order: category-major, then name.
 */
export function searchIcons(query: string): IconDef[] {
  const needle = query.trim().toLowerCase();
  if (needle === "") return [...ICON_DEFS];
  return ICON_DEFS.filter(
    (def) =>
      def.name.toLowerCase().includes(needle) ||
      def.slug.toLowerCase().includes(needle) ||
      def.aliases.some((alias) => alias.toLowerCase().includes(needle)),
  );
}
