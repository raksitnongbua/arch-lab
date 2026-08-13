/**
 * Defaults shared by the two Mermaid importers (C4 and sequence).
 *
 * One declaration each, because both importers make the same promise and a
 * reader who has seen one must not have to check whether the other agrees.
 */

/**
 * Provenance stamp for a model built from Mermaid text.
 *
 * A FIXED instant, not `now`, and that is the whole point: it keeps importing a
 * pure function, so the same Mermaid input converts to byte-identical output and
 * the round-trip checks can assert on it. Callers who want wall-clock
 * provenance pass `timestamp` explicitly.
 *
 * Distinct from the serializer's `DEFAULT_TIMESTAMP` in
 * `features/archtext/lib/defaults.ts` (the epoch, `1970-01-01T00:00:00Z`),
 * which is the value the `.alab` format documents for a missing date. Two
 * different contracts — hence two names rather than one shared by accident.
 */
export const MERMAID_IMPORT_TIMESTAMP = "2026-01-01T00:00:00.000Z";
