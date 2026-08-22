/**
 * A remembered boolean, stored in a cookie so the SERVER can read it.
 *
 * This is the mechanism `source-fold.ts` arrived at, extracted when the
 * editable canvas needed a second preference of exactly the same shape. The
 * argument for the mechanism is in that file's header and is not repeated
 * here; what belongs here is why it is one function and not two copies.
 *
 * A COOKIE, NOT localStorage, is the load-bearing part: the playground is
 * server-rendered, localStorage is invisible to the server, and reading a
 * preference only on the client means rendering the wrong layout and
 * correcting it a moment later — a visible flash on every load, seen most by
 * the reader who set the preference. A cookie travels with the request, so the
 * first rendered byte is already right. `source-fold.ts` records the two
 * attempts to paper over that flash without a cookie, both of which failed;
 * read them before proposing a third.
 *
 * WHY EXTRACTED RATHER THAN COPIED. The second preference would have been a
 * second `read`/`write`/`subscribe` trio with the same bodies and a different
 * cookie name — the copy-paste fingerprint `dry.md` names, and the class of
 * bug where one copy learns something (a `SameSite` fix, a try/catch) and the
 * other does not. Each preference keeps its OWN listener set: a canvas-lock
 * write must not wake the source-fold subscribers, which sharing a
 * module-level set would have done.
 *
 * THE COST, stated plainly: reading a cookie opts a route out of static
 * rendering. That is the honest price of server-rendering a per-reader
 * preference, and it is confined to the playground routes.
 */

/**
 * A year, in seconds. Long enough that the preference outlives the reason
 * someone set it; a session cookie would forget on every browser restart,
 * which is the same annoyance in slower motion.
 */
const MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

export interface BooleanPreference {
  /** The cookie name — the server needs it to look the value up. */
  readonly cookie: string;
  /**
   * The server's read, from a cookie value it already has. Takes the VALUE
   * rather than reaching for `next/headers` itself, so this module stays a
   * pure function the check scripts can exercise and the caller keeps the
   * choice of how it obtained the request.
   */
  fromCookie(value: string | undefined): boolean;
  /** The client's read, from `document.cookie`. */
  read(): boolean;
  write(on: boolean): void;
  subscribe(onChange: () => void): () => void;
}

/**
 * Build one remembered boolean.
 *
 * `onValue`/`offValue` are written out rather than `"true"`/`"false"` so the
 * stored value says what it means in a devtools cookie list, and so the
 * THREE-VALUED state survives: on, off, and never set. "Never set" is what
 * lets a default change later without overriding readers who chose the old
 * default deliberately.
 */
export function booleanPreference({
  cookie,
  onValue,
  offValue,
}: {
  cookie: string;
  onValue: string;
  offValue: string;
}): BooleanPreference {
  const listeners = new Set<() => void>();

  return {
    cookie,
    fromCookie: (value) => value === onValue,
    read: () => {
      try {
        return document.cookie
          .split(";")
          .some((part) => part.trim() === `${cookie}=${onValue}`);
      } catch {
        return false;
      }
    },
    /**
     * `SameSite=Lax` and no `Secure`: these are layout preferences, not
     * credentials, and forcing `Secure` would silently drop them on
     * `http://localhost` during development — a preference that works
     * everywhere except the machine it is developed on is worse than none.
     * `path=/` because every playground route shares them.
     */
    write: (on) => {
      try {
        document.cookie =
          `${cookie}=${on ? onValue : offValue};` +
          `path=/;max-age=${MAX_AGE_SECONDS};samesite=lax`;
      } catch {
        /* A browser refusing cookies still gets a working toggle for this
           session — it just forgets on reload. */
      }
      for (const listener of listeners) listener();
    },
    /**
     * No `storage` event exists for cookies, so this notifies only the tab
     * that wrote. Two tabs disagreeing about a preference until one reloads is
     * a non-event; inventing a polling loop for it would not be.
     */
    subscribe: (onChange) => {
      listeners.add(onChange);
      return () => {
        listeners.delete(onChange);
      };
    },
  };
}
