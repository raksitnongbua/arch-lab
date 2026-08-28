import { describe, expect, it } from "vitest";

import {
  DEFAULT_THEME,
  THEME_FOLLOW_STORAGE_KEY,
  THEME_STORAGE_KEY,
  THEMES,
} from "@/lib/constants";

import { THEME_DEFAULT_SCRIPT, themeForScheme } from "./theme-default";

/**
 * THE SCRIPT ITSELF IS RUN, not a pure twin of it. The whole mechanism is a
 * string of JavaScript that a browser executes before first paint, so a test
 * over `themeForScheme()` alone would leave the shipped string — its quoting,
 * its guard, both keys and all three branches — unmeasured. `new Function` with
 * the two globals as PARAMETERS is what lets a node environment stand in for a
 * browser without admitting a DOM: the script names `localStorage` and
 * `matchMedia` bare, so a parameter of each name shadows the global that is not
 * there (see the note in `vitest.config.mts`).
 */
function run({
  prefersDark,
  stored = {},
  storageThrows = false,
  noMatchMedia = false,
}: {
  prefersDark?: boolean;
  stored?: Record<string, string>;
  storageThrows?: boolean;
  noMatchMedia?: boolean;
}): Record<string, string> {
  const store: Record<string, string> = { ...stored };
  const localStorage = {
    getItem: (key: string) => {
      if (storageThrows) throw new Error("storage is blocked");
      return key in store ? store[key] : null;
    },
    setItem: (key: string, next: string) => {
      if (storageThrows) throw new Error("storage is blocked");
      store[key] = next;
    },
  };
  const matchMedia = (query: string) => ({
    matches: query === "(prefers-color-scheme: dark)" && prefersDark === true,
  });
  new Function("localStorage", "matchMedia", THEME_DEFAULT_SCRIPT)(
    localStorage,
    noMatchMedia ? undefined : matchMedia,
  );
  return store;
}

const FOLLOWING = { [THEME_FOLLOW_STORAGE_KEY]: "1" };

describe("THEME_DEFAULT_SCRIPT — a first visit", () => {
  it("gives a light system the light theme", () => {
    expect(run({ prefersDark: false })[THEME_STORAGE_KEY]).toBe("light");
  });

  it("gives a dark system high contrast", () => {
    // Asserted as the literal name as well as through the constant: this is the
    // requirement in words ("if dark use high contrast"), and a purely derived
    // expectation would follow a change to the map instead of catching it.
    expect(run({ prefersDark: true })[THEME_STORAGE_KEY]).toBe("contrast");
    expect(run({ prefersDark: true })[THEME_STORAGE_KEY]).toBe(DEFAULT_THEME);
  });

  it("writes a name the picker knows, either way", () => {
    // A value outside THEMES would leave next-themes stamping a class with no
    // palette behind it — a light page with no tick anywhere in the menu.
    for (const prefersDark of [true, false]) {
      expect(THEMES).toContain(run({ prefersDark })[THEME_STORAGE_KEY]);
    }
  });

  it("also records that the reader is following", () => {
    // This is what makes an ABSENT flag mean "pinned on purpose" from then on.
    // Without it, the second visit would read as a deliberate choice nobody
    // made, and the System row would open unticked on the visit that resolved
    // from the system preference.
    expect(run({ prefersDark: true })[THEME_FOLLOW_STORAGE_KEY]).toBe("1");
  });
});

describe("THEME_DEFAULT_SCRIPT — a returning reader", () => {
  it("re-resolves while the follow flag is set", () => {
    // The machine went dark between visits. This is the load-time half of
    // following; `FollowSystemTheme` covers a change with the tab already open.
    const store = run({
      prefersDark: true,
      stored: { ...FOLLOWING, [THEME_STORAGE_KEY]: "light" },
    });
    expect(store[THEME_STORAGE_KEY]).toBe("contrast");
    expect(store[THEME_FOLLOW_STORAGE_KEY]).toBe("1");
  });

  it("leaves a pinned theme alone, however the system is set", () => {
    // The reader picked paper on a dark machine. Re-resolving over that would
    // make the OS outrank a decision somebody actually made.
    for (const prefersDark of [true, false]) {
      expect(
        run({ prefersDark, stored: { [THEME_STORAGE_KEY]: "paper" } })[
          THEME_STORAGE_KEY
        ],
      ).toBe("paper");
    }
  });

  it("treats a cleared flag as pinned, not as never-asked", () => {
    // `writeFollowSystem(false)` REMOVES the key rather than storing "0", so
    // this is the shape the picker actually leaves behind.
    const store = run({
      prefersDark: true,
      stored: { [THEME_STORAGE_KEY]: "light" },
    });
    expect(store[THEME_STORAGE_KEY]).toBe("light");
    expect(store[THEME_FOLLOW_STORAGE_KEY]).toBeUndefined();
  });
});

describe("THEME_DEFAULT_SCRIPT — what it refuses to do", () => {
  it("never throws when storage is blocked", () => {
    // A pre-paint script that raises aborts the rest of the parse. Private
    // browsing must end at next-themes' own default, not at a blank page.
    expect(() => run({ prefersDark: true, storageThrows: true })).not.toThrow();
  });

  it("writes nothing at all when the browser has no matchMedia", () => {
    // Both writes are after the resolve, so an unsupported browser leaves
    // storage exactly as it found it — never a follow flag with no theme
    // beside it, which would be a state nothing else in the app expects.
    let store: Record<string, string> = {};
    expect(() => {
      store = run({ noMatchMedia: true });
    }).not.toThrow();
    expect(store).toEqual({});
  });
});

describe("themeForScheme", () => {
  it("agrees with the script it cannot share code with", () => {
    // The script inlines its two names because a pre-paint string cannot
    // import; both sides read `DEFAULT_THEME_BY_SCHEME`, and this is the
    // assertion that keeps them from drifting apart anyway.
    for (const prefersDark of [true, false]) {
      expect(themeForScheme(prefersDark)).toBe(
        run({ prefersDark })[THEME_STORAGE_KEY],
      );
    }
  });
});
