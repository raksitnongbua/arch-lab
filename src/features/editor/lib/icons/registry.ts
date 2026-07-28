/**
 * The icon registry (dev-handoff §4.6, D15, AF-E4-S1/S2). Owned by T2-A.
 *
 * 38 hand-authored inline-SVG icons: 31 named marks plus 7
 * generics. Icons are referenced by slug; no SVG data or URL is ever written
 * into the model. All 16 are monochrome and follow `currentColor`, so they
 * stay legible in both themes with zero colour literals.
 */

import type { C4Node, C4NodeType } from "@/types";

import { type IconCategory } from "./categories";
import { AwsIcon } from "./svg/aws";
import { AzureIcon } from "./svg/azure";
import { BrowserIcon } from "./svg/browser";
import { CloudflareIcon } from "./svg/cloudflare";
import { DatabaseIcon } from "./svg/database";
import { DockerIcon } from "./svg/docker";
import { DotnetIcon } from "./svg/dotnet";
import { ElasticsearchIcon } from "./svg/elasticsearch";
import { ExternalIcon } from "./svg/external";
import { FirebaseIcon } from "./svg/firebase";
import { GcpIcon } from "./svg/gcp";
import { GolangIcon } from "./svg/golang";
import { GraphqlIcon } from "./svg/graphql";
import { GrpcIcon } from "./svg/grpc";
import { JavaIcon } from "./svg/java";
import { KafkaIcon } from "./svg/kafka";
import { KongIcon } from "./svg/kong";
import { KubernetesIcon } from "./svg/kubernetes";
import { LambdaIcon } from "./svg/lambda";
import { MobileIcon } from "./svg/mobile";
import { MongodbIcon } from "./svg/mongodb";
import { MysqlIcon } from "./svg/mysql";
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
import { ServiceIcon } from "./svg/service";
import { TerraformIcon } from "./svg/terraform";
import { TypescriptIcon } from "./svg/typescript";

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
    aliases: ["function", "faas", "cloud function"],
    category: "cloud",
    Svg: LambdaIcon,
    monochrome: true,
  },
  {
    slug: "s3",
    name: "Object storage",
    aliases: ["bucket", "blob", "gcs"],
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
    slug: "external",
    name: "External system",
    aliases: ["third party", "3rd party", "saas"],
    category: "generic",
    Svg: ExternalIcon,
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
    slug: "service",
    name: "Service",
    aliases: ["application", "app", "system", "component"],
    category: "generic",
    Svg: ServiceIcon,
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
