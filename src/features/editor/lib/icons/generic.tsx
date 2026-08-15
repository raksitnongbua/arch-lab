import {
  Activity,
  AppWindow,
  Braces,
  Brain,
  CalendarClock,
  ChartColumn,
  Database,
  ExternalLink,
  FileText,
  Globe,
  KeyRound,
  ListOrdered,
  Mail,
  Network,
  Search,
  Server,
  ShieldCheck,
  Smartphone,
  User,
  Waypoints,
  Webhook,
} from "lucide-react";

import type { IconCategory } from "./categories";
import type { IconSource } from "./registry";

/**
 * The icons for things that have no logo: a database, a queue, a person, an
 * API. Drawn by `lucide-react`.
 *
 * WHY LUCIDE AND NOT BESPOKE ARTWORK. This registry used to carry 59
 * hand-drawn SVGs covering both these concepts AND named products. The named
 * half was the problem: hand-drawn logos are cruder than the vendors' own,
 * they exist only in one ink, and no amount of redrawing gives them a colour
 * version anybody wants. Deleting all of it left these ~20 concepts needing a
 * home, and lucide is the obvious one — it already draws every icon in this
 * application's chrome, so the diagram and the interface around it now speak
 * one visual language instead of two.
 *
 * THEY ARE MONOCHROME, AND THAT IS NOT A GAP. A queue has no brand colour to
 * be faithful to; the node's accent is the only colour that means anything
 * here, and `currentColor` lets the canvas supply it. So these render
 * identically in both icon styles, which is why `SvgMono` is left undefined
 * (registry.ts reads its absence as "`Svg` answers for both").
 *
 * HAPROXY sits here despite being a product: `thesvg` ships no HAProxy mark
 * at all. A load-balancer glyph labelled "HAProxy" is a fair trade against
 * dropping the slug, which would silently blank the icon in every document
 * that already names it.
 *
 * Slugs are UNCHANGED from the hand-drawn set they replace. A model in the
 * wild says `@database`, and the whole point of storing a slug rather than
 * artwork is that the drawing behind it can be replaced without touching a
 * single document.
 */
export const GENERIC_ICON_DEFS: readonly IconSource[] = [
  {
    slug: "firewall",
    name: "Firewall",
    aliases: ["waf", "security group", "shield"],
    category: "networking",
    Svg: ShieldCheck,
    monochrome: true,
  },
  {
    slug: "haproxy",
    name: "HAProxy",
    aliases: ["ha proxy", "load balancer", "proxy"],
    category: "networking",
    Svg: Network,
    monochrome: true,
  },
  {
    slug: "internet",
    name: "Internet",
    aliases: ["globe", "www", "public network", "world"],
    category: "networking",
    Svg: Globe,
    monochrome: true,
  },
  {
    slug: "load-balancer",
    name: "Load balancer",
    aliases: ["lb", "elb", "alb", "nlb", "fan out"],
    category: "networking",
    Svg: Waypoints,
    monochrome: true,
  },
  {
    slug: "ai-model",
    name: "AI model",
    aliases: ["ml", "llm", "inference", "gpu", "model"],
    category: "generic",
    Svg: Brain,
    monochrome: true,
  },
  {
    slug: "analytics",
    name: "Analytics",
    aliases: ["bi", "warehouse", "reporting", "metrics", "chart"],
    category: "generic",
    Svg: ChartColumn,
    monochrome: true,
  },
  {
    slug: "api",
    name: "API",
    aliases: ["rest", "endpoint", "json", "openapi"],
    category: "generic",
    Svg: Braces,
    monochrome: true,
  },
  {
    slug: "browser",
    name: "Browser",
    aliases: ["web", "web app", "spa", "frontend"],
    category: "generic",
    Svg: AppWindow,
    monochrome: true,
  },
  {
    slug: "database",
    name: "Database",
    aliases: ["db", "datastore", "storage"],
    category: "generic",
    Svg: Database,
    monochrome: true,
  },
  {
    slug: "email",
    name: "Email",
    aliases: ["mail", "smtp", "ses", "notification", "sendgrid"],
    category: "generic",
    Svg: Mail,
    monochrome: true,
  },
  {
    slug: "external",
    name: "External system",
    aliases: ["third party", "3rd party", "saas"],
    category: "generic",
    Svg: ExternalLink,
    monochrome: true,
  },
  {
    slug: "file",
    name: "File store",
    aliases: ["document", "nfs", "volume", "disk"],
    category: "generic",
    Svg: FileText,
    monochrome: true,
  },
  {
    slug: "identity",
    name: "Identity provider",
    aliases: ["auth", "sso", "oauth", "iam", "keycloak", "key"],
    category: "generic",
    Svg: KeyRound,
    monochrome: true,
  },
  {
    slug: "mobile",
    name: "Mobile",
    aliases: ["phone", "ios", "android", "app"],
    category: "generic",
    Svg: Smartphone,
    monochrome: true,
  },
  {
    slug: "monitoring",
    name: "Monitoring",
    aliases: ["observability", "grafana", "prometheus", "apm", "logs"],
    category: "generic",
    Svg: Activity,
    monochrome: true,
  },
  {
    slug: "person",
    name: "Person",
    aliases: ["user", "actor", "people", "customer"],
    category: "generic",
    Svg: User,
    monochrome: true,
  },
  {
    slug: "queue",
    name: "Queue",
    aliases: ["message queue", "mq", "broker", "topic"],
    category: "generic",
    Svg: ListOrdered,
    monochrome: true,
  },
  {
    slug: "scheduler",
    name: "Scheduler",
    aliases: ["cron", "job", "timer", "batch", "worker"],
    category: "generic",
    Svg: CalendarClock,
    monochrome: true,
  },
  {
    slug: "search",
    name: "Search",
    aliases: ["index", "query", "find", "magnifier"],
    category: "generic",
    Svg: Search,
    monochrome: true,
  },
  {
    slug: "service",
    name: "Service",
    aliases: ["application", "app", "system", "component"],
    category: "generic",
    Svg: Server,
    monochrome: true,
  },
  {
    slug: "webhook",
    name: "Webhook",
    aliases: ["callback", "event", "hook", "push"],
    category: "generic",
    Svg: Webhook,
    monochrome: true,
  },
];

/** The categories these occupy, for the picker's ordering. */
export const GENERIC_CATEGORIES: readonly IconCategory[] = [
  "networking",
  "generic",
];
