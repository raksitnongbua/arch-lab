/**
 * Duration tokens for the share-expiry menu: `10s`, `30m`, `1d`, `7d`, `1M`,
 * `1Y`.
 *
 * The menu is configured by env rather than hard-coded, because the right set
 * depends on the deployment: a team sharing review links wants hours, a public
 * demo wants days, and a developer testing the refusal path wants seconds. One
 * hard-coded list cannot serve all three, and shipping a "10 seconds" option to
 * production to keep developers happy is the wrong trade.
 *
 * Unit letters are CASE-SENSITIVE, and deliberately so:
 *
 *   s  seconds     m  minutes     h  hours
 *   d  days        w  weeks
 *   M  months (30d)               Y  years (365d)
 *
 * `m` vs `M` carries a 43,200× difference, which is a genuine footgun — so a
 * lowercase `y` or an uppercase `S` is rejected outright rather than guessed at.
 * Months and years are fixed at 30 and 365 days: an expiry is a deadline, not a
 * calendar appointment, and "one month" landing on a different day-of-month
 * would be a surprise nobody asked for.
 */

/** Seconds per unit letter. */
const UNIT_SECONDS: Readonly<Record<string, number>> = {
  s: 1,
  m: 60,
  h: 60 * 60,
  d: 24 * 60 * 60,
  w: 7 * 24 * 60 * 60,
  M: 30 * 24 * 60 * 60,
  Y: 365 * 24 * 60 * 60,
};

/** Singular noun per unit, for building a human label. */
const UNIT_NOUN: Readonly<Record<string, string>> = {
  s: "second",
  m: "minute",
  h: "hour",
  d: "day",
  w: "week",
  M: "month",
  Y: "year",
};

const TOKEN_PATTERN = /^(\d+)([smhdwMY])$/;

export interface DurationChoice {
  /** The token as written, e.g. `7d` — kept for diagnostics and `<option>` ids. */
  token: string;
  seconds: number;
  /** e.g. "7 days". */
  label: string;
}

/**
 * Parses one token. Returns null rather than throwing: a malformed env value
 * must not take the whole Share panel down, so the caller drops bad entries and
 * carries on with the good ones.
 */
export function parseDurationToken(token: string): DurationChoice | null {
  const match = TOKEN_PATTERN.exec(token.trim());
  if (match === null) return null;
  const amount = Number(match[1]);
  const unit = match[2];
  // `0s` would mint a link already expired on arrival.
  if (!Number.isInteger(amount) || amount < 1) return null;
  const perUnit = UNIT_SECONDS[unit];
  const noun = UNIT_NOUN[unit];
  if (perUnit === undefined || noun === undefined) return null;
  return {
    token: token.trim(),
    seconds: amount * perUnit,
    label: `${amount.toString()} ${noun}${amount === 1 ? "" : "s"}`,
  };
}

/**
 * Parses a comma-separated list, dropping anything malformed and de-duplicating
 * by resulting length (so `60s` and `1m` cannot both appear). Sorted ascending,
 * because a menu of durations that is not in order reads as a bug.
 */
export function parseDurationList(raw: string): DurationChoice[] {
  const seen = new Set<number>();
  const parsed: DurationChoice[] = [];
  for (const part of raw.split(",")) {
    if (part.trim() === "") continue;
    const choice = parseDurationToken(part);
    if (choice === null) continue;
    if (seen.has(choice.seconds)) continue;
    seen.add(choice.seconds);
    parsed.push(choice);
  }
  return parsed.sort((a, b) => a.seconds - b.seconds);
}
