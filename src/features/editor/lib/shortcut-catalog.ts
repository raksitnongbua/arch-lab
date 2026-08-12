/**
 * Every shortcut and gesture the editor offers, grouped for display.
 *
 * Hand-authored rather than derived from the live registry, and that is a
 * deliberate trade. The registry (`hooks/use-keyboard-shortcuts.ts`) is a
 * module-level Map populated by whichever hooks are currently mounted, and some
 * bindings are conditional — `c4-node.tsx` registers nothing unless a node is
 * selected. Reading it would produce a list that changes as you click around:
 * useful as a contextual hint, useless as something to learn from.
 *
 * The cost of hand-authoring is drift, so `scripts/shortcut-catalog-check.mjs`
 * asserts that every `combo:` literal in the editor source appears here. A new
 * binding that nobody documented fails the check rather than quietly going
 * unmentioned.
 *
 * Two combo families are built dynamically and so cannot be matched literally
 * by that check; they are listed here explicitly and named in the check's
 * allow-list: the arrow-key nudges (`canvas.tsx`, plain and `shift+`) and the
 * quick-add menu's digit keys (`use-connect-shortcuts.ts`, `1`…`n`).
 */

export interface ShortcutEntry {
  /**
   * Keys as displayed. `mod` renders as ⌘ on Apple platforms and Ctrl
   * elsewhere — the registry resolves the same token the same way, so the sheet
   * cannot promise a key the binding does not listen for.
   */
  keys: string[];
  /**
   * A second combo that does the SAME thing, rendered as "F2 or Enter". Aliases
   * shared one row rather than two, because two rows reading "Rename the
   * selected element" look like a mistake, and the reader has to compare them to
   * discover they are not.
   */
  also?: string[];
  what: string;
  /** Present when the shortcut only applies in a particular state. */
  when?: string;
}

export interface ShortcutGroup {
  title: string;
  entries: ShortcutEntry[];
}

export const SHORTCUT_GROUPS: readonly ShortcutGroup[] = [
  {
    title: "Create",
    entries: [
      {
        keys: ["double-click"],
        what: "Add an element where you click",
        when: "on empty canvas",
      },
      {
        keys: ["drag ↗"],
        what: "Add a related element",
        when: "from a node's corner grip",
      },
      {
        keys: ["drag ●"],
        what: "Relate two elements",
        when: "from a node's handle onto another element",
      },
      {
        keys: ["click ●"],
        what: "Relate two elements, without dragging",
        when: "click a handle, then click the other element",
      },
      {
        keys: ["drag ●"],
        what: "Connect to a new element",
        when: "from a node's handle to empty canvas",
      },
      {
        keys: ["1", "…", "9"],
        what: "Pick a type",
        when: "while the quick-add menu is open",
      },
    ],
  },
  {
    title: "Edit",
    entries: [
      {
        keys: ["F2"],
        also: ["Enter"],
        what: "Rename the selected element",
      },
      { keys: ["mod", "C"], what: "Copy the selection" },
      { keys: ["mod", "V"], what: "Paste, offset from the original" },
      {
        keys: ["Delete"],
        also: ["Backspace"],
        what: "Delete the selection",
      },
      { keys: ["mod", "Z"], what: "Undo" },
      { keys: ["mod", "shift", "Z"], what: "Redo" },
    ],
  },
  {
    title: "Select & move",
    entries: [
      { keys: ["mod", "A"], what: "Select everything in this diagram" },
      { keys: ["Escape"], what: "Clear the selection, or close a menu" },
      { keys: ["shift", "click"], what: "Add to the selection" },
      { keys: ["↑", "↓", "←", "→"], what: "Nudge by 8px" },
      { keys: ["shift", "↑↓←→"], what: "Nudge by 1px" },
      { keys: ["alt", "drag"], what: "Move without grid snapping" },
    ],
  },
  {
    title: "Navigate",
    entries: [
      { keys: ["mod", "↓"], what: "Drill into the selected element" },
      { keys: ["mod", "↑"], what: "Go up one level" },
      { keys: ["shift", "1"], what: "Fit the diagram to the view" },
      { keys: ["shift", "0"], what: "Reset zoom to 100%" },
      { keys: ["space", "drag"], what: "Pan the canvas" },
      { keys: ["mod", "scroll"], what: "Zoom" },
    ],
  },
  {
    title: "File",
    entries: [
      { keys: ["mod", "S"], what: "Save" },
      { keys: ["mod", "O"], what: "Open a file" },
    ],
  },
];

/**
 * The handful shown on the canvas itself. Chosen as the ones you cannot guess:
 * that double-clicking empty space creates something, and that a handle can be
 * CLICKED rather than dragged, are both invisible until told.
 *
 * The grip's entry used to read "relate", which was the wrong word for it —
 * the grip adds a NEW element, and the handles are what relate two existing
 * ones. Two controls a few pixels apart claiming the same verb is most of why
 * the gesture was confusing.
 *
 * Undo is here because it is the first thing anyone reaches for after an
 * accident.
 */
export const CANVAS_HINTS: readonly ShortcutEntry[] = [
  { keys: ["double-click"], what: "add" },
  { keys: ["drag ↗"], what: "add related" },
  { keys: ["click ●"], what: "connect" },
  { keys: ["mod", "Z"], what: "undo" },
];

/** Opens the full sheet. `?` is the near-universal convention for exactly this. */
export const SHORTCUT_SHEET_COMBO = "shift+/";
