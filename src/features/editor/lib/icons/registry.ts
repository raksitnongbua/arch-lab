/**
 * The icon registry (dev-handoff §4.6, D15, AF-E4-S1/S2). Owned by T2-A.
 *
 * 55 hand-authored inline-SVG icons: the named technology marks plus the
 * generics. Icons are referenced by slug; no SVG data or URL is ever written
 * into the model. All of them are monochrome and follow `currentColor`, so
 * they stay legible in both themes with zero colour literals.
 *
 * The named marks are stylised motifs, never traced trademarked logos.
 */

import type { C4Node, C4NodeType } from "@/types";

import { type IconCategory } from "./categories";
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
import { DynamodbIcon } from "./svg/dynamodb";
import { ElasticsearchIcon } from "./svg/elasticsearch";
import { EmailIcon } from "./svg/email";
import { EnvoyIcon } from "./svg/envoy";
import { ExternalIcon } from "./svg/external";
import { FileIcon } from "./svg/file";
import { FirewallIcon } from "./svg/firewall";
import { GcpIcon } from "./svg/gcp";
import { GolangIcon } from "./svg/golang";
import { GrpcIcon } from "./svg/grpc";
import { HaproxyIcon } from "./svg/haproxy";
import { IdentityIcon } from "./svg/identity";
import { InternetIcon } from "./svg/internet";
import { JavaIcon } from "./svg/java";
import { KafkaIcon } from "./svg/kafka";
import { KongIcon } from "./svg/kong";
import { KubernetesIcon } from "./svg/kubernetes";
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
import { ObjectStorageIcon } from "./svg/object-storage";
import { PersonIcon } from "./svg/person";
import { PostgresqlIcon } from "./svg/postgresql";
import { PythonIcon } from "./svg/python";
import { QueueIcon } from "./svg/queue";
import { RabbitmqIcon } from "./svg/rabbitmq";
import { ReactIcon } from "./svg/react";
import { RedisIcon } from "./svg/redis";
import { RustIcon } from "./svg/rust";
import { SchedulerIcon } from "./svg/scheduler";
import { SearchIcon } from "./svg/search";
import { ServerlessIcon } from "./svg/serverless";
import { ServiceIcon } from "./svg/service";
import { SqliteIcon } from "./svg/sqlite";
import { TerraformIcon } from "./svg/terraform";
import { TypescriptIcon } from "./svg/typescript";
import { WebhookIcon } from "./svg/webhook";

export type { IconCategory } from "./categories";

export interface IconDef {
  /** e.g. "postgresql" — what the model stores. */
  slug: string;
  /** e.g. "PostgreSQL". */
  name: string;
  /** e.g. ["pg", "postgres"]. */
  aliases: string[];
  category: IconCategory;
  /** Inline SVG component; `currentColor` where monochrome. */
  Svg: React.FC<React.SVGProps<SVGSVGElement>>;
  monochrome: boolean;
}

/**
 * Registry order = picker display order: category-major (ICON_CATEGORY_ORDER),
 * then name. `searchIcons("")` returns exactly this order.
 */
const ICON_DEFS: readonly IconDef[] = [
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
    slug: "java",
    name: "Java",
    aliases: ["jvm", "kotlin", "spring", "scala"],
    category: "languages",
    Svg: JavaIcon,
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
    slug: "nodejs",
    name: "Node.js",
    aliases: ["node", "node.js", "express", "nest", "npm"],
    category: "languages",
    Svg: NodejsIcon,
    monochrome: true,
  },
  {
    slug: "python",
    name: "Python",
    aliases: ["py", "django", "flask", "fastapi"],
    category: "languages",
    Svg: PythonIcon,
    monochrome: true,
  },
  {
    slug: "react",
    name: "React",
    aliases: ["reactjs", "spa", "frontend", "jsx"],
    category: "languages",
    Svg: ReactIcon,
    monochrome: true,
  },
  {
    slug: "rust",
    name: "Rust",
    aliases: ["rs", "cargo", "tokio"],
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
    slug: "elasticsearch",
    name: "Elasticsearch",
    aliases: ["elastic", "es", "opensearch", "lucene"],
    category: "databases",
    Svg: ElasticsearchIcon,
    monochrome: true,
  },
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
    slug: "sqlite",
    name: "SQLite",
    aliases: ["sqlite3", "embedded db", "local db"],
    category: "databases",
    Svg: SqliteIcon,
    monochrome: true,
  },
  /* -- Caching & Messaging -------------------------------------------------- */
  {
    slug: "kafka",
    name: "Kafka",
    aliases: ["apache kafka", "event stream", "log", "redpanda"],
    category: "messaging",
    Svg: KafkaIcon,
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
  {
    slug: "rabbitmq",
    name: "RabbitMQ",
    aliases: ["rabbit", "amqp", "broker"],
    category: "messaging",
    Svg: RabbitmqIcon,
    monochrome: true,
  },
  {
    slug: "redis",
    name: "Redis",
    aliases: ["cache", "valkey"],
    category: "messaging",
    Svg: RedisIcon,
    monochrome: true,
  },
  /* -- Networking & Edge ---------------------------------------------------- */
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
    slug: "grpc",
    name: "gRPC",
    aliases: ["rpc", "protobuf", "protocol buffers"],
    category: "networking",
    Svg: GrpcIcon,
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
    slug: "kong",
    name: "Kong",
    aliases: ["api gateway", "gateway"],
    category: "networking",
    Svg: KongIcon,
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
  {
    slug: "nginx",
    name: "nginx",
    aliases: ["reverse proxy", "web server"],
    category: "networking",
    Svg: NginxIcon,
    monochrome: true,
  },
  /* -- Cloud ----------------------------------------------------------------- */
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
    aliases: ["microsoft", "msft", "az"],
    category: "cloud",
    Svg: AzureIcon,
    monochrome: true,
  },
  {
    slug: "cloudflare",
    name: "Cloudflare",
    aliases: ["cf", "cdn", "edge"],
    category: "cloud",
    Svg: CloudflareIcon,
    monochrome: true,
  },
  {
    slug: "docker",
    name: "Docker",
    aliases: ["container", "oci", "compose", "image"],
    category: "cloud",
    Svg: DockerIcon,
    monochrome: true,
  },
  {
    slug: "gcp",
    name: "Google Cloud",
    aliases: ["gcp", "google", "gke", "bigquery"],
    category: "cloud",
    Svg: GcpIcon,
    monochrome: true,
  },
  {
    slug: "kubernetes",
    name: "Kubernetes",
    aliases: ["k8s", "cluster", "eks", "gke", "helm"],
    category: "cloud",
    Svg: KubernetesIcon,
    monochrome: true,
  },
  {
    slug: "object-storage",
    name: "Object storage",
    aliases: ["s3", "bucket", "blob", "gcs", "minio"],
    category: "cloud",
    Svg: ObjectStorageIcon,
    monochrome: true,
  },
  {
    slug: "serverless",
    name: "Serverless function",
    aliases: ["lambda", "faas", "cloud function", "worker"],
    category: "cloud",
    Svg: ServerlessIcon,
    monochrome: true,
  },
  {
    slug: "terraform",
    name: "Terraform",
    aliases: ["iac", "opentofu", "infrastructure as code"],
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
    aliases: ["rest", "graphql", "endpoint", "json"],
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

export const ICONS: Record<string, IconDef> = Object.fromEntries(
  ICON_DEFS.map((def) => [def.slug, def]),
);

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
