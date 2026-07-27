/**
 * Seed examples for the paste box — one per input format, both small and
 * guaranteed working so the feature is discoverable from the empty state.
 *
 * The Mermaid example is the canonical Internet Banking `C4Context` sample
 * (nested boundaries, `_Ext` externals, Db/Queue variants, `BiRel`, a
 * technology-carrying `Rel`) — the exact grammar the converter's check
 * script proves.
 *
 * The JSON example is COMPUTED, not hand-written: a small `C4Container`
 * source is run through the real converter and the editor's real
 * deterministic serializer at module load, so the seeded JSON can never
 * drift from what the validator accepts. It parses to two diagrams
 * (synthetic Context root + the Container level), so it also demonstrates
 * drill-down.
 */

import { parseMermaidC4 } from "@/features/mermaid";

import { canonicalJsonText } from "./parse-input";

export const MERMAID_EXAMPLE = `C4Context
    title System Context diagram for Internet Banking System
    Enterprise_Boundary(b0, "BankBoundary0") {
        Person(customerA, "Banking Customer A", "A customer of the bank, with personal bank accounts.")
        Person_Ext(customerC, "Banking Customer C", "A customer of the bank, without a personal account.")
        System(SystemAA, "Internet Banking System", "Allows customers to view information about their bank accounts, and make payments.")
        Enterprise_Boundary(b1, "BankBoundary") {
            SystemDb_Ext(SystemE, "Mainframe Banking System", "Stores all of the core banking information.")
            System_Ext(SystemC, "E-mail system", "The internal Microsoft Exchange e-mail system.")
            SystemQueue(SystemF, "Banking System F Queue", "A system of the bank.")
        }
    }

    BiRel(customerA, SystemAA, "Uses")
    BiRel(SystemAA, SystemE, "Uses")
    Rel(SystemAA, SystemC, "Sends e-mails", "SMTP")
    Rel(SystemC, customerA, "Sends e-mails to")
`;

const JSON_EXAMPLE_SOURCE = `C4Container
    title Container diagram for a URL shortener
    Person(user, "User", "Shortens links and follows them.")
    Container(web, "Web application", "Next.js", "Serves the UI and the redirect endpoint.")
    ContainerDb(db, "Link store", "PostgreSQL", "Stores slug-to-URL mappings.")
    ContainerQueue(events, "Click events", "Kafka", "Buffers click analytics.")

    Rel(user, web, "Uses", "HTTPS")
    Rel(web, db, "Reads and writes", "SQL")
    Rel(web, events, "Publishes clicks to", "Avro")
`;

/**
 * Canonical `.archlab.json` example text. Fixed timestamp (the converter's
 * deterministic default) so the seed is byte-stable across reloads.
 */
export const JSON_EXAMPLE: string = canonicalJsonText(
  parseMermaidC4(JSON_EXAMPLE_SOURCE),
);
