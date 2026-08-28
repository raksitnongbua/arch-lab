import { describe, expect, it } from "vitest";

import { DEFAULT_THEME, THEME_STORAGE_KEY, THEMES } from "@/lib/constants";

import { THEME_DEFAULT_SCRIPT } from "./theme-default";

/**
 * THE SCRIPT ITSELF IS RUN, not a pure twin of it. The whole feature is a
 * string of JavaScript that a browser executes before first paint, so a test
 * over a parallel `themeForScheme()` helper would prove a function nothing
 * ships and leave the shipped string — quoting, guard, key, both branches —
 * unmeasured. `new Function` with the two globals as PARAMETERS is what lets a
 * node environment stand in for a browser without admitting a DOM: the script
 * names `localStorage` and `matchMedia` bare, so a parameter of each name
 * shadows the global that is not there (see the note in `vitest.config.mts`).
 */
function run(
  {
    prefersDark,
    stored = null,
    storageThrows = false,
  }: { prefersDark: boolean; stored?: string | null; storageThrows?: boolean },
  script = THEME_DEFAULT_SCRIPT,
): string | null {
  let value = stored;
  const localStorage = {
    getItem: (key: string) => {
      if (storageThrows) throw new Error("storage is blocked");
      return key === THEME_STORAGE_KEY ? value : null;
    },
    setItem: (key: string, next: string) => {
      if (storageThrows) throw new Error("storage is blocked");
      if (key === THEME_STORAGE_KEY) value = next;
    },
  };
  const matchMedia = (query: string) => ({
    matches: query === "(prefers-color-scheme: dark)" ? prefersDark : false,
  });
  new Function("localStorage", "matchMedia", script)(localStorage, matchMedia);
  return value;
}

describe("THEME_DEFAULT_SCRIPT", () => {
  it("gives a light system the light theme", () => {
    expect(run({ prefersDark: false })).toBe("light");
  });

  it("gives a dark system high contrast", () => {
    // Asserted as the literal name as well as through the constant: this is the
    // requirement in words ("if dark use high contrast"), and a purely derived
    // expectation would follow a change to the map instead of catching it.
    expect(run({ prefersDark: true })).toBe("contrast");
    expect(run({ prefersDark: true })).toBe(DEFAULT_THEME);
  });

  it("writes a name the picker knows, either way", () => {
    // A value outside THEMES would leave next-themes stamping a class with no
    // palette behind it — the light page with no tick anywhere in the menu.
    for (const prefersDark of [true, false]) {
      expect(THEMES).toContain(run({ prefersDark }));
    }
  });

  it("leaves a stored choice alone", () => {
    // The reader picked paper on a dark machine. Seeding over that would make
    // the OS outrank a decision someone actually made.
    expect(run({ prefersDark: true, stored: "paper" })).toBe("paper");
    expect(run({ prefersDark: false, stored: "midnight" })).toBe("midnight");
  });

  it("never throws when storage is blocked", () => {
    // A pre-paint script that raises aborts the rest of the parse. Private
    // browsing must end at next-themes' own default, not at a blank page.
    expect(() => run({ prefersDark: true, storageThrows: true })).not.toThrow();
  });

  it("never throws when the browser has no matchMedia", () => {
    expect(() =>
      new Function("localStorage", THEME_DEFAULT_SCRIPT)({
        getItem: () => null,
        setItem: () => {},
      }),
    ).not.toThrow();
  });
});
